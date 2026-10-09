# lambdas

Small AWS Lambda functions, built and deployed by `infra/theo/modules/ingestion`.
Python 3.11, `boto3` only. Terraform zips each folder, so editing a handler and
running `apply` is the whole deploy.

## What you'll learn
- Scheduling with EventBridge (cron) and the permission that lets it call a Lambda
- Calling a public API, converting units, and designing "never crash" fallbacks
- Why the data layer must not mix real and made-up numbers

## `price_fetcher/`: the daily price job

Runs every day at **13:05 UTC**, just after the day-ahead electricity market
publishes tomorrow's prices.

1. `GET https://api.awattar.de/v1/marketdata` (free, no key)
2. EUR/MWh to ct/kWh (divide by 10), one row per hour into `theo-prices` (`date` + `hour`)
3. Raw JSON saved to `s3://theo-data-<account>/prices/<date>.json`
4. One `{"device_id": ..., "reason": "new_prices"}` message per device on the replan queue

**Never crash the demo.** If the API fails, a typical German day (cheap 01-05h,
expensive 17-21h) is written instead. If prices for today already exist, they are
kept: a failed run must not overwrite real data with made-up data.

**The `latest` rows.** The simulation clock runs ahead of the calendar (a day takes
24 real minutes), so the optimizer often asks for a date with no real prices. The
newest **complete** 24-hour day is also stored under the date `latest`. Only a full
day qualifies: real wholesale prices run 0-12 ct and the built-in curve 18-43 ct,
so a half-real day would invent a price spread that does not exist.

### Running it by hand (no need to wait for 13:05)
A scheduled EventBridge rule has no "Run now" button, so you call the **function** itself.

**CLI:** `make -C capstone prices`
(same as `aws lambda invoke --function-name theo-price-fetcher /dev/stdout`).
It answers with `{"source": "awattar", "rows": ..., "devices": [...]}`.

**Console:**
1. Lambda → Functions → **theo-price-fetcher**
2. **Test** tab → Event name `manual`, Event JSON `{}` → **Save** → **Test**
3. Read **Execution results**: the returned JSON and the log lines below it
4. Check the result:
   - DynamoDB → Tables → **theo-prices** → *Explore table items* (rows per date/hour, plus `latest`)
   - S3 → **theo-data-<account>** → `prices/` (the raw JSON)
   - SQS → **theo-replan-queue** → *Send and receive messages* → *Poll* (a `new_prices` message per device, if the optimizer has not already taken them)
   - Monitor → *View CloudWatch logs* → `wrote N price rows from awattar; asked 3 device(s) to re-plan`

**What you get depends on the time.** The day-ahead market publishes tomorrow's prices
around 13:00 UTC. Before that the API returns only the rest of today, so the rows are
stored but no `latest` is written, and the optimizer (which uses only complete days)
keeps using its typical curve. That is expected, and the demo works either way. After
13:00 UTC a manual run gets a complete day and everything uses real prices.

## `api_handler/`: the API behind the web app

One function behind seven API Gateway routes. By the time a request reaches it, API
Gateway has already checked the user's login token (a Cognito JWT), so this code only
decides what each route does.

| Route | Does |
|---|---|
| `POST /device/{id}/plug-in`, `/plug-out` | publish a command to `theo/{id}/control` over IoT Core |
| `GET /device/{id}/status` | the device's latest state, plus whether it is online (real clock) |
| `GET /device/{id}/savings` | EUR saved today and this month, **added up here, never in the browser** |
| `GET /device/{id}/schedule` | the current plan, slot by slot |
| `GET` / `PUT /device/{id}/settings` | reserve %, target %, departure time; a save asks the optimizer for a new plan |

Two safety points: the device ID is checked against a fixed list (it ends up in an MQTT
topic and a database key, so a caller must never invent one), and the settings are
validated before anything is stored. "Today" and "this month" use the **simulated**
date, because the simulation runs ahead of the calendar. 27 unit tests, no AWS needed.

## `forecast/`: a stub

Returns fixed load and solar curves. It marks where real forecasting (weather-based
solar, learned household load) plugs in. Nothing calls it yet; the optimizer keeps
the same curves in `apps/optimizer/forecast.py` so plan and simulation agree.

## Tests
```bash
cd capstone/apps/lambdas/price_fetcher
python3 -m venv .venv && .venv/bin/pip install pytest boto3
.venv/bin/python -m pytest
```
No AWS or network needed: the logic is plain functions.
