"""
Tests for the optimizer maths. No AWS, no database: solve.plan() takes plain
functions for prices, load and solar, so a test can describe any situation.

Run from apps/optimizer:   python -m pytest
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import forecast  # noqa: E402
import solve  # noqa: E402

EVENING = datetime(2026, 10, 8, 18, 0, tzinfo=timezone.utc)


def run(now=EVENING, soc=0.5, reserve=0.3, target=0.8, departure="07:30"):
    return solve.plan(
        now, soc, reserve, target, departure,
        forecast.fallback_price_ct, forecast.house_load_kw, forecast.solar_kw,
    )


def battery_levels(result, soc):
    """Replay the schedule and return the battery level (kWh) after each slot."""
    level = soc * solve.BATTERY_KWH
    levels = []
    for slot in result["slots"]:
        if slot["action"] == "charge":
            level += slot["power_kw"] * solve.EFFICIENCY * solve.SLOT_HOURS
        elif slot["action"] == "discharge":
            level -= slot["power_kw"] / solve.EFFICIENCY * solve.SLOT_HOURS
        levels.append(level)
    return levels


def hour_of(slot):
    return int(slot["slot_start"][11:13])


def test_plans_every_slot_until_departure():
    result = run()
    assert len(result["slots"]) == 54  # 18:00 -> 07:30 = 13.5 h = 54 slots
    assert result["slots"][0]["slot_start"] == "2026-10-08T18:00:00Z"


def test_reaches_the_target_by_departure():
    result = run()
    assert result["shortfall_kwh"] == 0
    assert battery_levels(result, 0.5)[-1] >= 0.8 * solve.BATTERY_KWH - 0.1


def test_never_goes_below_the_reserve_or_above_full():
    levels = battery_levels(run(), 0.5)
    assert min(levels) >= 0.3 * solve.BATTERY_KWH - 0.1
    assert max(levels) <= solve.BATTERY_KWH + 0.1


def test_discharges_at_the_price_peak_and_charges_when_cheap():
    result = run()
    discharge_hours = {hour_of(s) for s in result["slots"] if s["action"] == "discharge"}
    charge_hours = {hour_of(s) for s in result["slots"] if s["action"] == "charge"}
    assert 18 in discharge_hours, "the 18h slot costs 43 ct, the day's peak: the car should lend power then"
    assert not discharge_hours & {1, 2, 3, 4}, "never lend power in the cheapest hours"
    assert charge_hours, "expected some charging overnight"
    assert charge_hours <= {0, 1, 2, 3, 4, 5, 6}, "charging belongs in the cheap night hours"


def test_never_charges_and_discharges_in_the_same_slot():
    for slot in run()["slots"]:
        assert slot["action"] in ("charge", "discharge", "idle")


def test_is_cheaper_than_charging_immediately():
    result = run()
    assert result["theo_cost_eur"] < result["naive_cost_eur"]
    assert result["saved_eur"] > 0


def test_flat_prices_mean_no_discharging():
    # With no price difference, lending power only loses energy and adds wear.
    result = solve.plan(
        EVENING, 0.5, 0.3, 0.8, "07:30",
        lambda dt: 30.0, forecast.house_load_kw, forecast.solar_kw,
    )
    assert all(s["action"] != "discharge" for s in result["slots"])


def test_late_plug_in_reports_a_shortfall_instead_of_failing():
    late = datetime(2026, 10, 8, 6, 30, tzinfo=timezone.utc)  # one hour before leaving
    result = run(now=late, soc=0.2)
    assert result["shortfall_kwh"] > 0
    assert all(s["action"] != "discharge" for s in result["slots"])


def test_departure_inside_the_current_slot_plans_nothing():
    # 07:35 now, leaving at 07:40: the 07:30-07:45 slot would end after departure.
    almost = datetime(2026, 10, 8, 7, 35, tzinfo=timezone.utc)
    assert run(now=almost, departure="07:40")["slots"] == []


def test_departure_rolls_to_the_next_day():
    morning = datetime(2026, 10, 8, 9, 0, tzinfo=timezone.utc)  # 07:30 already passed today
    assert solve.departure_datetime(morning, "07:30").day == 9
