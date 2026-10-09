"""
handler.py - the forecast Lambda: a STUB.

It returns fixed curves for household load and solar output, hour by hour. It is
deliberately boring. It exists to mark WHERE real forecasting plugs in:

  - solar output from a weather forecast (PVGIS / a weather API) for the home's location
  - household load learned from each home's own history instead of a standard profile
  - price forecasts beyond the 24-36 hours the day-ahead market publishes

Today the optimizer carries its own copy of these curves (apps/optimizer/forecast.py),
the same numbers the virtual devices use, so plan and simulation agree. When real
forecasting arrives, the optimizer calls this function instead and nothing else changes.

Invoke it by hand:  aws lambda invoke --function-name theo-forecast out.json && cat out.json
"""

import math

HOUSE_LOAD_KW = [
    0.3, 0.3, 0.3, 0.3, 0.3, 0.4, 0.8, 1.2, 1.0, 0.7, 0.6, 0.6,
    0.7, 0.6, 0.6, 0.7, 0.9, 1.4, 1.9, 2.0, 1.8, 1.4, 0.9, 0.5,
]


def solar_curve():
    """A bell curve peaking at 13:00 with a 6 kW peak, zero at night."""
    curve = []
    for hour in range(24):
        value = 6.0 * math.exp(-((hour - 13) ** 2) / (2 * 2.5**2))
        curve.append(round(value, 3) if value > 0.05 else 0.0)
    return curve


def handler(event, context):
    return {
        "note": "STUB: fixed curves, one value per hour of the day (index = hour, UTC)",
        "load_kw": HOUSE_LOAD_KW,
        "solar_kw": solar_curve(),
    }
