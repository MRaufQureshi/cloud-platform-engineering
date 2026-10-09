"""
forecast.py - the assumptions the optimizer makes about the future.

A real product would forecast solar output, household consumption and electricity
prices from weather data, learned habits and the market. THEO's demo uses fixed
curves instead. Everything the optimizer needs to "know" about the future comes
through these three functions, so replacing them with real forecasts later does
not touch the optimizer itself (the extension point the README mentions).

The load and solar curves are the SAME ones the virtual devices use in
apps/simulator/device.py, so the plan and the simulated world agree.
"""

import math

# Household load in kW for each hour of the day (index = hour).
HOUSE_LOAD_KW = [
    0.3, 0.3, 0.3, 0.3, 0.3, 0.4, 0.8, 1.2, 1.0, 0.7, 0.6, 0.6,
    0.7, 0.6, 0.6, 0.7, 0.9, 1.4, 1.9, 2.0, 1.8, 1.4, 0.9, 0.5,
]

# A typical German day-ahead price curve in ct/kWh: cheap 01-05h, a dip around
# midday (solar), expensive 17-21h. Used whenever real prices are missing, so the
# demo never breaks.
FALLBACK_PRICE_CT = [
    24, 20, 18, 18, 19, 23, 30, 36, 34, 30, 27, 25,
    24, 24, 26, 30, 35, 40, 43, 42, 38, 33, 29, 26,
]


def house_load_kw(dt):
    return HOUSE_LOAD_KW[dt.hour]


def solar_kw(dt):
    """A bell curve peaking at 13:00 with a 6 kW peak, and zero at night."""
    hour = dt.hour + dt.minute / 60
    value = 6.0 * math.exp(-((hour - 13) ** 2) / (2 * 2.5**2))
    return value if value > 0.05 else 0.0


def fallback_price_ct(dt):
    return FALLBACK_PRICE_CT[dt.hour]


def build_price_function(rows_by_date, latest):
    """
    A function dt -> ct/kWh, built from what the price fetcher stored.

      rows_by_date  {"2026-10-09": {"17": 8.5, ...}}  real prices per date and hour
      latest        {"17": 8.5, ...}                  the newest complete real day, or {}

    Order of preference for a moment dt:
      1. real prices for dt's own date, if that date has all 24 hours
      2. the "latest" complete day (the simulation runs ahead of the calendar,
         so its dates often have no real prices of their own)
      3. the built-in typical curve

    A date counts only if COMPLETE. Mixing a few real hours (0-12 ct) with the
    built-in curve (18-43 ct) would invent a price spread that does not exist.
    """

    def price_ct(dt):
        hour = dt.strftime("%H")
        day = rows_by_date.get(dt.strftime("%Y-%m-%d"), {})
        if len(day) == 24:
            return day[hour]
        if len(latest) == 24:
            return latest[hour]
        return fallback_price_ct(dt)

    return price_ct
