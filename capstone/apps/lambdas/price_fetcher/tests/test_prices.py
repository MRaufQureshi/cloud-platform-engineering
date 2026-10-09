"""
Tests for the price fetcher's pure logic. No AWS, no network.
Run from apps/lambdas/price_fetcher:   python -m pytest
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import handler  # noqa: E402


def ms(year, month, day, hour):
    return int(datetime(year, month, day, hour, tzinfo=timezone.utc).timestamp() * 1000)


def payload(*items):
    return {"object": "list", "data": [{"start_timestamp": s, "marketprice": p, "unit": "Eur/MWh"} for s, p in items]}


def test_converts_eur_per_mwh_to_ct_per_kwh():
    rows = handler.parse_awattar(payload((ms(2026, 10, 9, 17), 85.2)))
    assert rows == [{"date": "2026-10-09", "hour": "17", "price_ct_kwh": 8.52}]


def test_negative_prices_are_kept():
    rows = handler.parse_awattar(payload((ms(2026, 10, 9, 13), -4.0)))
    assert rows[0]["price_ct_kwh"] == -0.4


def test_hour_is_zero_padded_and_in_utc():
    rows = handler.parse_awattar(payload((ms(2026, 10, 9, 3), 50.0)))
    assert rows[0]["hour"] == "03"


def test_empty_answer_is_rejected_so_the_fallback_runs():
    with pytest.raises(ValueError):
        handler.parse_awattar({"data": []})


def test_malformed_answer_is_rejected_so_the_fallback_runs():
    with pytest.raises(KeyError):
        handler.parse_awattar({"unexpected": True})


def test_fallback_covers_today_and_tomorrow_with_24_hours_each():
    rows = handler.fallback_rows(datetime(2026, 10, 9, 10, tzinfo=timezone.utc))
    assert len(rows) == 48
    assert {r["date"] for r in rows} == {"2026-10-09", "2026-10-10"}
    evening = next(r for r in rows if r["date"] == "2026-10-09" and r["hour"] == "18")
    night = next(r for r in rows if r["date"] == "2026-10-09" and r["hour"] == "03")
    assert evening["price_ct_kwh"] > night["price_ct_kwh"]


def day(date, hours, price=1.0):
    return [{"date": date, "hour": f"{h:02d}", "price_ct_kwh": price} for h in range(hours)]


def test_latest_prefers_the_newest_COMPLETE_day():
    latest = handler.latest_rows(day("2026-10-09", 24) + day("2026-10-10", 6))
    assert len(latest) == 24
    assert {r["date"] for r in latest} == {"latest"}
    assert {r["source_date"] for r in latest} == {"2026-10-09"}


def test_latest_uses_tomorrow_when_it_is_complete():
    latest = handler.latest_rows(day("2026-10-09", 24) + day("2026-10-10", 24))
    assert {r["source_date"] for r in latest} == {"2026-10-10"}


def test_a_partial_day_is_never_stored_as_latest():
    # Before 13:00 UTC the API returns only ~12 hours. Mixing those with the
    # built-in curve would invent a fake price spread, so nothing is written.
    assert handler.latest_rows(day("2026-10-09", 12)) == []
