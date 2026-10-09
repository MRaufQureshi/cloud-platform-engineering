"""
handler.py - the API Lambda: one function behind API Gateway.

API Gateway checks the user's login token (a Cognito JWT) BEFORE calling this
function, so every request that arrives here is already authenticated. This code
only decides what each route does.

  POST /device/{id}/plug-in    publish {"cmd": "plug_in"}  to theo/{id}/control (IoT Core)
  POST /device/{id}/plug-out   publish {"cmd": "plug_out"} to theo/{id}/control
  GET  /device/{id}/status     the device's latest state             (theo-device-state)
  GET  /device/{id}/savings    EUR saved today + this month          (theo-savings)
  GET  /device/{id}/schedule   the current plan, slot by slot        (theo-schedules)
  GET  /device/{id}/settings   reserve %, target %, departure time   (theo-settings)
  PUT  /device/{id}/settings   save them, then ask for a re-plan     (theo-settings + SQS)

SAVINGS ARE ADDED UP HERE, never in the browser. "Today" and "this month" use the
SIMULATED date (the simulation runs ahead of the calendar), taken from the device's
last telemetry.

THE DEVICE ID IS CHECKED AGAINST A FIXED LIST. It ends up in an MQTT topic name and
a database key, so a caller must never be able to invent one.

boto3 only (built into Lambda). The AWS clients are created on first use, which
keeps the logic importable and testable without AWS.
"""

import json
import os
import re
import time
import traceback
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

DEFAULT_SETTINGS = {"reserve_soc": 30, "target_soc": 80, "departure_time": "07:30"}
_cache = {}


# ----------------------------------------------------------- AWS clients (lazy)
def dynamo(name):
    """The DynamoDB table for a short name: state, settings, schedules, savings."""
    key = ("table", name)
    if key not in _cache:
        _cache[key] = boto3.resource("dynamodb").Table(os.environ[f"TABLE_{name.upper()}"])
    return _cache[key]


def iot():
    if "iot" not in _cache:
        _cache["iot"] = boto3.client("iot-data", endpoint_url=f"https://{os.environ['IOT_ENDPOINT']}")
    return _cache["iot"]


def sqs():
    if "sqs" not in _cache:
        _cache["sqs"] = boto3.client("sqs")
    return _cache["sqs"]


# ------------------------------------------------------------------- plumbing
class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def to_json(value):
    """DynamoDB returns numbers as Decimal, which json cannot write."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError(f"cannot serialise {type(value)}")


def respond(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=to_json),
    }


def check_device(device_id):
    allowed = [d for d in os.environ.get("DEVICE_IDS", "").split(",") if d]
    if device_id not in allowed:
        raise ApiError(404, f"unknown device {device_id!r}")


# --------------------------------------------------- pure logic (unit-tested)
def validate_settings(body):
    """Check what the browser sent and return clean values, or raise a 400."""
    try:
        reserve = int(body["reserve_soc"])
        target = int(body["target_soc"])
        departure = str(body["departure_time"])
    except (KeyError, TypeError, ValueError):
        raise ApiError(400, "send reserve_soc, target_soc (whole numbers) and departure_time (HH:MM)")
    if not (0 <= reserve <= 100 and 0 <= target <= 100):
        raise ApiError(400, "reserve_soc and target_soc must be between 0 and 100")
    if target < reserve:
        raise ApiError(400, "target_soc cannot be lower than reserve_soc")
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", departure):
        raise ApiError(400, "departure_time must look like 07:30")
    return {"reserve_soc": reserve, "target_soc": target, "departure_time": departure}


def savings_summary(rows, today):
    """
    rows   items from theo-savings: {"date": "2026-10-16", "saved_eur": 1.87, ...}
    today  the simulated date, "YYYY-MM-DD"
    """
    month = today[:7]
    saved_today = sum(float(r["saved_eur"]) for r in rows if r["date"] == today)
    saved_month = sum(float(r["saved_eur"]) for r in rows if r["date"].startswith(month))
    return {"date": today, "today_eur": round(saved_today, 2), "month_eur": round(saved_month, 2)}


# ------------------------------------------------------------------- routes
def plug(device_id, cmd):
    iot().publish(topic=f"theo/{device_id}/control", qos=1, payload=json.dumps({"cmd": cmd}))
    return 202, {"sent": cmd, "device_id": device_id}


def get_status(device_id, body):
    state = dynamo("state").get_item(Key={"device_id": device_id}).get("Item")
    if state is None:
        return 200, {"device_id": device_id, "online": False}
    received = state.get("received_ms")  # real clock: when IoT Core last heard from the device
    seconds = round(time.time() - float(received) / 1000) if received is not None else None
    state["seconds_since_update"] = seconds
    state["online"] = seconds is not None and seconds < 60
    return 200, state


def get_savings(device_id, body):
    state = dynamo("state").get_item(Key={"device_id": device_id}).get("Item")
    today = state["updated_at"][:10] if state else time.strftime("%Y-%m-%d", time.gmtime())
    rows = dynamo("savings").query(KeyConditionExpression=Key("device_id").eq(device_id))["Items"]
    return 200, {"device_id": device_id, **savings_summary(rows, today)}


def get_schedule(device_id, body):
    rows = dynamo("schedules").query(KeyConditionExpression=Key("device_id").eq(device_id))["Items"]
    slots = sorted(rows, key=lambda r: r["slot_start"])
    return 200, {"device_id": device_id, "slots": slots}


def get_settings(device_id, body):
    item = dynamo("settings").get_item(Key={"device_id": device_id}).get("Item", {})
    return 200, {"device_id": device_id, **DEFAULT_SETTINGS, **{k: v for k, v in item.items() if k != "device_id"}}


def put_settings(device_id, body):
    settings = validate_settings(body)
    dynamo("settings").put_item(Item={"device_id": device_id, **settings})
    # A settings change means the old plan may be wrong: ask the optimizer for a new one.
    sqs().send_message(
        QueueUrl=os.environ["REPLAN_QUEUE_URL"],
        MessageBody=json.dumps({"device_id": device_id, "reason": "settings"}),
    )
    return 200, {"device_id": device_id, **settings, "replan": "requested"}


ROUTES = {
    "POST /device/{id}/plug-in": lambda d, b: plug(d, "plug_in"),
    "POST /device/{id}/plug-out": lambda d, b: plug(d, "plug_out"),
    "GET /device/{id}/status": get_status,
    "GET /device/{id}/savings": get_savings,
    "GET /device/{id}/schedule": get_schedule,
    "GET /device/{id}/settings": get_settings,
    "PUT /device/{id}/settings": put_settings,
}


def handler(event, context):
    try:
        route = ROUTES.get(event.get("routeKey"))
        if route is None:
            raise ApiError(404, "no such route")
        device_id = (event.get("pathParameters") or {}).get("id", "")
        check_device(device_id)
        try:
            body = json.loads(event["body"]) if event.get("body") else {}
        except ValueError:
            raise ApiError(400, "the request body is not valid JSON")
        status, payload = route(device_id, body)
        return respond(status, payload)
    except ApiError as error:
        return respond(error.status, {"error": error.message})
    except Exception:  # noqa: BLE001 - never leak internals to the caller; log them instead
        print(traceback.format_exc())
        return respond(500, {"error": "internal error"})
