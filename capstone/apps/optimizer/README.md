# optimizer

The brain: a service that answers "when should each car charge and when should
it lend power to the house?" Runs on ECS Fargate (built by
`infra/theo/modules/optimizer`) and listens to an SQS queue.

## What you'll learn
- Modelling a real problem as a **linear program** and solving it with **HiGHS**
- Why a queue sits between "something changed" and "re-plan"
- Retries and dead-letter queues

## The loop (`main.py`)
1. Long-poll the SQS replan queue: `{"device_id": "device-1", "reason": "plug_in"}`
2. Read the device's state and settings, and the prices, from DynamoDB
3. Solve (`solve.py`)
4. Write the schedule and the day's savings to DynamoDB
5. Publish the schedule to `theo/<id>/schedule` over IoT Core
6. Delete the queue message, **last**. If anything fails it is not deleted, SQS
   retries it, and after 3 failures it lands in the dead-letter queue.

## The maths (`solve.py`)
Per 15-minute slot the car is plugged in: `charge_kw` (0-11), `discharge_kw`
(0-10), and a helper `grid_kw`. Minimise the grid bill plus a small battery-wear
cost, subject to: the battery never exceeds full or drops below the reserve, it
reaches the target by departure, and `grid >= load - solar + charge - discharge`.
The target is a *soft* rule (a shortfall variable with a huge penalty), so a late
plug-in still returns a plan instead of failing.

| File | Role |
|---|---|
| `solve.py` | the LP, takes plain functions so it needs no database |
| `forecast.py` | the assumptions about the future: load, solar, fallback prices |
| `main.py` | the SQS / DynamoDB / IoT plumbing |
| `tests/test_solve.py` | proves the plan is sensible |

**Prices:** `forecast.build_price_function` picks, in order: the exact date's real
prices if all 24 hours exist; else the newest complete real day (`latest`, written by
the price fetcher, because the simulated calendar runs ahead of the real one); else a
typical German day. A partial day is never mixed in, so the price spread stays real.

**Time:** the optimizer reads "now" from the device's last telemetry
(`theo-device-state.updated_at`), the simulated clock.

## Run the tests
```bash
cd capstone/apps/optimizer
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest
```
`solver`: HiGHS through PuLP. PuLP is pinned to 3.x (4.0 changed its API).

## Deploy
First time: `make -C capstone seed-optimizer` (builds and pushes `:bootstrap`).
After that the **T.H.E.O. App Deploy** workflow builds, pushes (tagged with the commit
SHA) and rolls out on every merge to `main` that touches this folder.
Logs: `make -C capstone optimizer-logs`.
