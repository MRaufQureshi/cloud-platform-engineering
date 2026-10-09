"""
main.py - the optimizer service. Runs forever on ECS Fargate.

THE LOOP
  1. long-poll the SQS replan queue ("is there a reason to re-plan?")
  2. read the device's state, settings and the prices from DynamoDB
  3. solve (solve.py)
  4. write the schedule and the savings to DynamoDB
  5. publish the schedule to the device over IoT Core
  6. delete the queue message - ONLY now, after everything worked

Step 6 last is the safety net: if anything fails, the message is not deleted,
SQS hands it out again after the visibility timeout, and after 3 failed tries it
moves to the dead-letter queue (which raises an alarm in Phase 7).

A queue message looks like {"device_id": "device-1", "reason": "plug_in"}.
Every reason triggers the same full re-plan. Plug events also carry the NEW state
({"plugged_in": true, "soc": 0.5, "ts": "..."}): the optimizer trusts that over
the stored state, which may not have caught up yet (it refreshes with telemetry,
every 10 s). Other reasons (settings changed, new prices) read the stored state.

TIME: the simulation runs on its own clock (see apps/simulator). The optimizer
learns "what time is it" from the device's last telemetry, stored as
`updated_at` in theo-device-state, so plan and simulation always agree.
"""

import json
import os
import time
import traceback
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from prometheus_client import Counter, Histogram, start_http_server

import forecast
import solve

# ---------------------------------------------------------------- settings
REGION = os.environ.get("AWS_REGION", "us-east-1")
QUEUE_URL = os.environ["REPLAN_QUEUE_URL"]
IOT_ENDPOINT = os.environ["IOT_ENDPOINT"]
TABLES = {
    "state": os.environ["TABLE_DEVICE_STATE"],
    "settings": os.environ["TABLE_SETTINGS"],
    "schedules": os.environ["TABLE_SCHEDULES"],
    "prices": os.environ["TABLE_PRICES"],
    "savings": os.environ["TABLE_SAVINGS"],
}
METRICS_PORT = int(os.environ.get("METRICS_PORT", "8000"))

# Used when a device has no settings row yet (the API creates one on first save).
DEFAULT_SETTINGS = {"reserve_soc": 30, "target_soc": 80, "departure_time": "07:30"}

# ----------------------------------------------------------------- clients
sqs = boto3.client("sqs", region_name=REGION)
dynamodb = boto3.resource("dynamodb", region_name=REGION)
iot_data = boto3.client("iot-data", region_name=REGION, endpoint_url=f"https://{IOT_ENDPOINT}")
table = {name: dynamodb.Table(table_name) for name, table_name in TABLES.items()}

# ----------------------------------------------------------------- metrics
JOBS = Counter("theo_optimizer_jobs_total", "Re-plan jobs finished", ["result"])
SOLVE_SECONDS = Histogram("theo_optimizer_solve_seconds", "Time spent in the LP solver")
# Create both series now so they start at 0, instead of not existing until the first job
JOBS.labels("ok")
JOBS.labels("error")


# ----------------------------------------------------------------- helpers
def dec(value):
    """DynamoDB wants Decimal, not float."""
    return Decimal(str(round(value, 4)))


def parse_time(text):
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def load_settings(device_id):
    item = table["settings"].get_item(Key={"device_id": device_id}).get("Item", {})
    merged = {**DEFAULT_SETTINGS, **{k: v for k, v in item.items() if k != "device_id"}}
    return float(merged["reserve_soc"]) / 100, float(merged["target_soc"]) / 100, merged["departure_time"]


def price_lookup(now):
    """
    A function dt -> ct/kWh. Real prices come from theo-prices (one row per date
    and hour, written by the price fetcher). forecast.build_price_function decides
    which to use: the exact date if complete, else the newest complete day stored
    as "latest", else the typical-day curve, so the optimizer never fails just
    because prices have not arrived yet.
    """

    def hours_of(day):
        rows = table["prices"].query(KeyConditionExpression=Key("date").eq(day))["Items"]
        return {row["hour"]: float(row["price_ct_kwh"]) for row in rows}

    days = {now.strftime("%Y-%m-%d"), (now.replace(hour=0) + timedelta(days=1)).strftime("%Y-%m-%d")}
    return forecast.build_price_function({day: hours_of(day) for day in days}, hours_of("latest"))


def clear_schedule(device_id):
    old = table["schedules"].query(KeyConditionExpression=Key("device_id").eq(device_id))["Items"]
    with table["schedules"].batch_writer() as batch:
        for row in old:
            batch.delete_item(Key={"device_id": device_id, "slot_start": row["slot_start"]})


def save_schedule(device_id, slots):
    clear_schedule(device_id)  # the new plan replaces the old one completely
    with table["schedules"].batch_writer() as batch:
        for slot in slots:
            batch.put_item(
                Item={
                    "device_id": device_id,
                    "slot_start": slot["slot_start"],
                    "action": slot["action"],
                    "power_kw": dec(slot["power_kw"]),
                    "price_ct_kwh": dec(slot["price_ct_kwh"]),
                }
            )


def publish_schedule(device_id, now, slots):
    iot_data.publish(
        topic=f"theo/{device_id}/schedule",
        qos=1,
        payload=json.dumps({"device_id": device_id, "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "slots": slots}),
    )


# ------------------------------------------------------------ one re-plan
def replan(device_id, reason, event=None):
    if event and "plugged_in" in event:
        # A plug event: the message already holds the freshest state.
        state = {"plugged_in": event["plugged_in"], "soc": event["soc"], "updated_at": event["ts"]}
    else:
        state = table["state"].get_item(Key={"device_id": device_id}).get("Item")
    if state is None:
        raise RuntimeError(f"no state for {device_id} yet (no telemetry has arrived)")
    now = parse_time(state["updated_at"])  # simulated "now"

    if not state["plugged_in"]:
        # Car is away: no schedule is needed, and an old one must not linger.
        clear_schedule(device_id)
        publish_schedule(device_id, now, [])
        print(f"[{device_id}] {reason}: not plugged in, schedule cleared", flush=True)
        return

    reserve, target, departure = load_settings(device_id)
    started = time.time()
    result = solve.plan(
        now, float(state["soc"]), reserve, target, departure,
        price_lookup(now), forecast.house_load_kw, forecast.solar_kw,
    )
    SOLVE_SECONDS.observe(time.time() - started)

    save_schedule(device_id, result["slots"])
    table["savings"].put_item(
        Item={
            # One row per simulated day; a re-plan overwrites it with the newest plan's numbers.
            "device_id": device_id,
            "date": now.strftime("%Y-%m-%d"),
            "naive_cost_eur": dec(result["naive_cost_eur"]),
            "theo_cost_eur": dec(result["theo_cost_eur"]),
            "saved_eur": dec(result["saved_eur"]),
            "shortfall_kwh": dec(result["shortfall_kwh"]),
        }
    )
    publish_schedule(device_id, now, result["slots"])
    print(
        f"[{device_id}] {reason}: {len(result['slots'])} slots, saved EUR {result['saved_eur']:.2f}, "
        f"shortfall {result['shortfall_kwh']} kWh",
        flush=True,
    )


# --------------------------------------------------------------- the loop
def main():
    start_http_server(METRICS_PORT)
    print("optimizer started, waiting for re-plan messages", flush=True)
    while True:
        response = sqs.receive_message(QueueUrl=QUEUE_URL, MaxNumberOfMessages=1, WaitTimeSeconds=20)  # long poll
        for message in response.get("Messages", []):
            try:
                body = json.loads(message["Body"])
                replan(body["device_id"], body.get("reason", "unknown"), body)
                sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=message["ReceiptHandle"])
                JOBS.labels("ok").inc()
            except Exception:  # noqa: BLE001 - keep the loop alive; SQS will retry the message
                JOBS.labels("error").inc()
                print(f"re-plan failed, leaving the message for retry:\n{traceback.format_exc()}", flush=True)


if __name__ == "__main__":
    main()
