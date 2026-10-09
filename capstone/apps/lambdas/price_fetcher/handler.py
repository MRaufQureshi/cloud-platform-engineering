"""
handler.py - the price fetcher Lambda.

WHEN IT RUNS: once a day at 13:05 UTC (EventBridge), shortly after the day-ahead
electricity market publishes tomorrow's prices around 13:00. You can also run it
by hand: aws lambda invoke --function-name theo-price-fetcher out.json

WHAT IT DOES
  1. GET https://api.awattar.de/v1/marketdata  (free, no API key). Returns hourly
     wholesale prices in EUR per MWh for the rest of today and, after 13:00, tomorrow.
  2. Convert to ct/kWh and write one row per hour into the theo-prices table
     (key: date + hour).
  3. Keep the raw JSON in the data S3 bucket (prices/<date>.json).
  4. Tell the optimizer "new prices": one message per device on the replan queue.

THE RULE: NEVER CRASH THE DEMO. If the API is down, slow or returns something
unexpected, write a typical German price curve instead, log a warning, and finish
successfully. A demo with made-up prices beats a demo with an error.

THE "latest" ROWS: the simulation clock runs ahead of the calendar (a simulated
day takes 24 real minutes), so the optimizer often asks for a simulated date that
has no real prices. The newest COMPLETE 24 hours are therefore ALSO stored under
the date "latest", and the optimizer falls back to them. Only a complete day
counts: a half-day mixed with the built-in curve would invent a price spread
that does not exist (real wholesale prices run 0-12 ct, the built-in curve 18-43 ct).

NEVER DEGRADE REAL DATA: if the API fails and prices for today already exist
(from an earlier successful run), they are left untouched.

Only boto3 (built into Lambda) and the standard library are used.
"""

import json
import os
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

AWATTAR_URL = "https://api.awattar.de/v1/marketdata"

# A typical German day in ct/kWh, same curve the optimizer uses as its fallback:
# cheap 01-05h, a midday dip, expensive 17-21h.
FALLBACK_CURVE_CT = [
    24, 20, 18, 18, 19, 23, 30, 36, 34, 30, 27, 25,
    24, 24, 26, 30, 35, 40, 43, 42, 38, 33, 29, 26,
]


def parse_awattar(payload):
    """
    aWATTar JSON -> list of {"date": "2026-10-09", "hour": "17", "price_ct_kwh": 8.52}.

    Each item looks like {"start_timestamp": 1760000000000, "marketprice": 85.2, ...}.
    The timestamp is milliseconds since 1970. The price is EUR per MWh, and
    1 EUR/MWh = 100 ct / 1000 kWh = 0.1 ct/kWh, so we divide by 10.
    Date and hour are in UTC, the same clock the simulation uses.
    """
    rows = []
    for item in payload["data"]:
        start = datetime.fromtimestamp(item["start_timestamp"] / 1000, tz=timezone.utc)
        rows.append(
            {
                "date": start.strftime("%Y-%m-%d"),
                "hour": start.strftime("%H"),
                "price_ct_kwh": round(float(item["marketprice"]) / 10, 3),
            }
        )
    if not rows:
        raise ValueError("aWATTar returned no prices")
    return rows


def fallback_rows(now):
    """The typical curve for today and tomorrow (UTC)."""
    rows = []
    for offset in (0, 1):
        day = (now + timedelta(days=offset)).strftime("%Y-%m-%d")
        for hour, price in enumerate(FALLBACK_CURVE_CT):
            rows.append({"date": day, "hour": f"{hour:02d}", "price_ct_kwh": float(price)})
    return rows


def latest_rows(rows):
    """
    The newest date that has all 24 hours, as rows keyed "latest" (same hour keys,
    plus which date they came from). Returns [] when no date is complete, so the
    previous "latest" stays in the table.
    """
    by_date = defaultdict(list)
    for row in rows:
        by_date[row["date"]].append(row)
    complete = [d for d, items in by_date.items() if len(items) == 24]
    if not complete:
        return []
    chosen = max(complete)
    return [{**row, "date": "latest", "source_date": chosen} for row in by_date[chosen]]


def fetch_prices():
    request = urllib.request.Request(AWATTAR_URL, headers={"User-Agent": "theo-price-fetcher"})
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read())


def handler(event, context):
    now = datetime.now(timezone.utc)
    raw = None
    try:
        raw = fetch_prices()
        rows, source = parse_awattar(raw), "awattar"
    except Exception as error:  # noqa: BLE001 - any failure at all means "use the fallback"
        print(f"WARNING: could not get aWATTar prices ({error!r}); using the typical curve instead")
        rows, source = fallback_rows(now), "fallback"

    table = boto3.resource("dynamodb").Table(os.environ["TABLE_PRICES"])

    if source == "fallback":
        today = now.strftime("%Y-%m-%d")
        if table.query(KeyConditionExpression=Key("date").eq(today), Limit=1)["Count"]:
            print(f"prices for {today} already exist; keeping them instead of overwriting with the fallback")
            return {"source": "kept-existing", "rows": 0, "devices": []}

    rows = rows + latest_rows(rows)

    with table.batch_writer() as batch:
        for row in rows:
            item = {**row, "price_ct_kwh": Decimal(str(row["price_ct_kwh"])), "source": source}
            batch.put_item(Item=item)

    if raw is not None:  # keep the raw answer for debugging and later analysis
        boto3.client("s3").put_object(
            Bucket=os.environ["DATA_BUCKET"],
            Key=f"prices/{now.strftime('%Y-%m-%d')}.json",
            Body=json.dumps(raw).encode(),
            ContentType="application/json",
        )

    # Prices changed, so every device's plan may be out of date.
    device_ids = [d for d in os.environ["DEVICE_IDS"].split(",") if d]
    boto3.client("sqs").send_message_batch(
        QueueUrl=os.environ["REPLAN_QUEUE_URL"],
        Entries=[
            {"Id": str(i), "MessageBody": json.dumps({"device_id": d, "reason": "new_prices"})}
            for i, d in enumerate(device_ids)
        ],
    )

    print(f"wrote {len(rows)} price rows from {source}; asked {len(device_ids)} device(s) to re-plan")
    return {"source": source, "rows": len(rows), "devices": device_ids}
