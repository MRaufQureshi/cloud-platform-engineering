"""
Tests for the API Lambda. No AWS: the three client functions are replaced by tiny fakes.
Run from apps/lambdas/api_handler:   python -m pytest
"""

import json
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import handler  # noqa: E402


# ------------------------------------------------------------------ fakes
class FakeTable:
    def __init__(self, items=None):
        self.items = items or []  # list of dicts

    def get_item(self, Key):
        for item in self.items:
            if all(item.get(k) == v for k, v in Key.items()):
                return {"Item": dict(item)}
        return {}

    def put_item(self, Item):
        self.items = [i for i in self.items if i["device_id"] != Item["device_id"]] + [Item]

    def query(self, KeyConditionExpression):
        # The real condition is Key("device_id").eq(x); the fake returns everything stored.
        return {"Items": [dict(i) for i in self.items]}


class FakeIot:
    def __init__(self):
        self.published = []

    def publish(self, topic, qos, payload):
        self.published.append((topic, json.loads(payload)))


class FakeSqs:
    def __init__(self):
        self.sent = []

    def send_message(self, QueueUrl, MessageBody):
        self.sent.append(json.loads(MessageBody))


@pytest.fixture
def aws(monkeypatch):
    monkeypatch.setenv("DEVICE_IDS", "device-1,device-2")
    monkeypatch.setenv("REPLAN_QUEUE_URL", "https://queue")
    tables = {"state": FakeTable(), "settings": FakeTable(), "schedules": FakeTable(), "savings": FakeTable()}
    fake_iot, fake_sqs = FakeIot(), FakeSqs()
    monkeypatch.setattr(handler, "dynamo", lambda name: tables[name])
    monkeypatch.setattr(handler, "iot", lambda: fake_iot)
    monkeypatch.setattr(handler, "sqs", lambda: fake_sqs)
    return type("Aws", (), {"tables": tables, "iot": fake_iot, "sqs": fake_sqs})


def call(route, device="device-1", body=None):
    event = {"routeKey": route, "pathParameters": {"id": device}}
    if body is not None:
        event["body"] = json.dumps(body)
    response = handler.handler(event, None)
    return response["statusCode"], json.loads(response["body"])


GOOD_SETTINGS = {"reserve_soc": 30, "target_soc": 80, "departure_time": "07:30"}

# ------------------------------------------------------- validate_settings
def test_valid_settings_are_accepted():
    assert handler.validate_settings(GOOD_SETTINGS) == GOOD_SETTINGS


def test_numbers_sent_as_text_are_accepted():
    assert handler.validate_settings({"reserve_soc": "25", "target_soc": "90", "departure_time": "06:15"})["reserve_soc"] == 25


@pytest.mark.parametrize(
    "bad",
    [
        {"reserve_soc": 30, "target_soc": 80},  # departure missing
        {"reserve_soc": "abc", "target_soc": 80, "departure_time": "07:30"},
        {"reserve_soc": -1, "target_soc": 80, "departure_time": "07:30"},
        {"reserve_soc": 30, "target_soc": 101, "departure_time": "07:30"},
        {"reserve_soc": 60, "target_soc": 40, "departure_time": "07:30"},  # target below reserve
        {"reserve_soc": 30, "target_soc": 80, "departure_time": "25:00"},
        {"reserve_soc": 30, "target_soc": 80, "departure_time": "7:30"},
        {"reserve_soc": 30, "target_soc": 80, "departure_time": "07:30; drop table"},
    ],
)
def test_bad_settings_are_rejected(bad):
    with pytest.raises(handler.ApiError) as error:
        handler.validate_settings(bad)
    assert error.value.status == 400


# --------------------------------------------------------- savings_summary
def test_savings_adds_today_and_the_month():
    rows = [
        {"date": "2026-10-15", "saved_eur": 2.0},
        {"date": "2026-10-16", "saved_eur": 1.5},
        {"date": "2026-09-30", "saved_eur": 9.0},  # last month: must not count
    ]
    assert handler.savings_summary(rows, "2026-10-16") == {"date": "2026-10-16", "today_eur": 1.5, "month_eur": 3.5}


def test_savings_with_no_rows_is_zero():
    assert handler.savings_summary([], "2026-10-16")["month_eur"] == 0


# ------------------------------------------------------------------ routes
def test_plug_in_publishes_to_the_devices_control_topic(aws):
    status, body = call("POST /device/{id}/plug-in")
    assert status == 202
    assert aws.iot.published == [("theo/device-1/control", {"cmd": "plug_in"})]


def test_plug_out_publishes_plug_out(aws):
    call("POST /device/{id}/plug-out", device="device-2")
    assert aws.iot.published == [("theo/device-2/control", {"cmd": "plug_out"})]


def test_an_unknown_device_is_refused_and_nothing_is_published(aws):
    status, body = call("POST /device/{id}/plug-in", device="device-9")
    assert status == 404
    assert aws.iot.published == []


def test_a_device_id_cannot_smuggle_in_an_mqtt_topic(aws):
    status, _ = call("POST /device/{id}/plug-in", device="device-1/../../other")
    assert status == 404
    assert aws.iot.published == []


def test_unknown_route_is_404(aws):
    assert call("DELETE /device/{id}/everything")[0] == 404


def test_status_of_a_silent_device_is_offline(aws):
    assert call("GET /device/{id}/status")[1] == {"device_id": "device-1", "online": False}


def test_status_reports_online_when_telemetry_is_recent(aws):
    aws.tables["state"].items = [
        {"device_id": "device-1", "soc": 0.62, "plugged_in": True, "received_ms": int((time.time() - 4) * 1000)}
    ]
    status, body = call("GET /device/{id}/status")
    assert status == 200 and body["online"] is True and body["seconds_since_update"] in (4, 5)


def test_status_reports_offline_when_telemetry_is_old(aws):
    aws.tables["state"].items = [{"device_id": "device-1", "received_ms": int((time.time() - 300) * 1000)}]
    assert call("GET /device/{id}/status")[1]["online"] is False


def test_savings_uses_the_simulated_date_from_the_state(aws):
    aws.tables["state"].items = [{"device_id": "device-1", "updated_at": "2026-10-16T02:00:03Z"}]
    aws.tables["savings"].items = [{"device_id": "device-1", "date": "2026-10-16", "saved_eur": 1.25}]
    status, body = call("GET /device/{id}/savings")
    assert status == 200 and body["today_eur"] == 1.25 and body["date"] == "2026-10-16"


def test_schedule_is_sorted_by_time(aws):
    aws.tables["schedules"].items = [
        {"device_id": "device-1", "slot_start": "2026-10-16T03:00:00Z", "action": "charge"},
        {"device_id": "device-1", "slot_start": "2026-10-16T02:00:00Z", "action": "idle"},
    ]
    slots = call("GET /device/{id}/schedule")[1]["slots"]
    assert [s["slot_start"] for s in slots] == ["2026-10-16T02:00:00Z", "2026-10-16T03:00:00Z"]


def test_settings_default_when_none_are_saved(aws):
    status, body = call("GET /device/{id}/settings")
    assert status == 200 and body["reserve_soc"] == 30 and body["departure_time"] == "07:30"


def test_saving_settings_stores_them_and_asks_for_a_replan(aws):
    status, body = call("PUT /device/{id}/settings", body=GOOD_SETTINGS)
    assert status == 200
    assert aws.tables["settings"].items == [{"device_id": "device-1", **GOOD_SETTINGS}]
    assert aws.sqs.sent == [{"device_id": "device-1", "reason": "settings"}]


def test_bad_settings_store_nothing_and_ask_for_nothing(aws):
    status, _ = call("PUT /device/{id}/settings", body={"reserve_soc": 90, "target_soc": 10, "departure_time": "07:30"})
    assert status == 400
    assert aws.tables["settings"].items == [] and aws.sqs.sent == []


def test_a_body_that_is_not_json_is_a_400(aws):
    response = handler.handler({"routeKey": "PUT /device/{id}/settings", "pathParameters": {"id": "device-1"}, "body": "{oops"}, None)
    assert response["statusCode"] == 400


def test_an_unexpected_failure_returns_500_without_details(aws, monkeypatch):
    monkeypatch.setattr(handler, "iot", lambda: (_ for _ in ()).throw(RuntimeError("secret internals")))
    status, body = call("POST /device/{id}/plug-in")
    assert status == 500 and body == {"error": "internal error"}
