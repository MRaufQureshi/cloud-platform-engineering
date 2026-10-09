"""
Tests for which price the optimizer uses. No AWS: the function takes plain dicts.
Run from apps/optimizer:   python -m pytest
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import forecast  # noqa: E402

AT = datetime(2026, 10, 9, 17, 30, tzinfo=timezone.utc)


def full_day(price):
    return {f"{h:02d}": price for h in range(24)}


def test_uses_the_exact_date_when_it_is_complete():
    price = forecast.build_price_function({"2026-10-09": full_day(5.0)}, full_day(9.0))
    assert price(AT) == 5.0


def test_uses_latest_when_the_date_has_no_prices():
    # The simulation runs ahead of the calendar, so its dates often have no real data.
    price = forecast.build_price_function({}, full_day(9.0))
    assert price(AT) == 9.0


def test_a_partial_date_is_ignored_not_mixed_in():
    partial = {f"{h:02d}": 1.0 for h in range(12)}  # only 12 hours
    price = forecast.build_price_function({"2026-10-09": partial}, full_day(9.0))
    assert price(AT) == 9.0  # not the 1.0 from the partial day


def test_falls_back_to_the_typical_curve_when_nothing_real_exists():
    price = forecast.build_price_function({}, {})
    assert price(AT) == forecast.fallback_price_ct(AT)


def test_a_partial_latest_is_ignored_too():
    price = forecast.build_price_function({}, {"17": 2.0})
    assert price(AT) == forecast.fallback_price_ct(AT)
