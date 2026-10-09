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
