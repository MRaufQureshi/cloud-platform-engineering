"""
solve.py - the optimizer: a plain linear program (LP), solved with HiGHS.

THE QUESTION IT ANSWERS
  "Given the car's battery level now, the prices for the next 24 hours, and when
   the owner leaves: in every 15-minute slot, should the car charge, discharge
   into the house, or do nothing - so the electricity bill is as low as possible
   and the car is still charged when the owner leaves?"

THE MODEL (one set of unknowns per 15-minute slot the car is plugged in)
  charge_kw[i]     0 .. 11   power going INTO the battery
  discharge_kw[i]  0 .. 10   power coming OUT of the battery into the house
  grid_kw[i]       >= 0      power bought from the grid (the helper that makes it an LP)

  Battery level after slot i (kWh):
      start + sum over slots up to i of ( 0.9 * charge - discharge / 0.9 ) * 0.25 h
  The 0.9s are the 90% efficiency in each direction.

  RULES (constraints)
    1. the level never exceeds the battery's capacity
    2. the level never drops below the reserve (the owner's "never below 30%")
    3. at departure the level is at least the target (80%)  - a soft rule, see below
    4. grid >= house load - solar + charge - discharge, and grid >= 0
       (no selling back: surplus solar is simply not paid for)

  GOAL (objective): minimise  sum( grid * 0.25 h * price )  + a small battery-wear cost.

WHY IT STAYS A LINEAR PROGRAM: no yes/no decisions are needed. Charging then
discharging in the same slot loses 19% of the energy and costs wear, so the
solver never chooses it at normal prices. (Negative prices could break that; a
known limitation.)

THE TARGET IS "SOFT": if the car plugs in too late to reach the target, a plain
LP would be infeasible and return nothing. Instead a `shortfall` variable is
allowed, at a huge penalty, so the solver charges as much as it can and reports
how short it fell.
"""

from datetime import timedelta

import pulp

SLOT_MINUTES = 15
SLOT_HOURS = SLOT_MINUTES / 60
BATTERY_KWH = 60.0
EFFICIENCY = 0.90
MAX_CHARGE_KW = 11.0
MAX_DISCHARGE_KW = 10.0
# Every kWh pulled out of the battery ages it a little. 2 ct/kWh is the low end
# of the 2-5 ct range quoted in the project notes. It also stops the solver
# making pointless tiny charge/discharge swings.
WEAR_CT_PER_KWH = 2.0
SHORTFALL_PENALTY_CT_PER_KWH = 1000.0


def first_slot(now):
    """The 15-minute slot containing `now`."""
    return now.replace(minute=now.minute - now.minute % SLOT_MINUTES, second=0, microsecond=0)


def departure_datetime(now, departure_time):
    """The next time the clock reads departure_time ("07:30") after now."""
    hour, minute = (int(part) for part in departure_time.split(":"))
    departure = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if departure <= now:
        departure += timedelta(days=1)
    return departure


def plugged_slot_starts(now, departure_time):
    """Start times of every full 15-minute slot between now and departure."""
    departure = departure_datetime(now, departure_time)
    slot = first_slot(now)
    starts = []
    while slot + timedelta(minutes=SLOT_MINUTES) <= departure:
        starts.append(slot)
        slot += timedelta(minutes=SLOT_MINUTES)
    return starts


def naive_cost_eur(starts, soc, target_soc, price_ct, load_kw, solar_kw):
    """What the bill would be WITHOUT THEO: charge at full power immediately, stop at target."""
    level = soc * BATTERY_KWH
    target = target_soc * BATTERY_KWH
    cost = 0.0
    for start in starts:
        power = 0.0
        if level < target:
            power = min(MAX_CHARGE_KW, (target - level) / (EFFICIENCY * SLOT_HOURS))
            level += power * EFFICIENCY * SLOT_HOURS
        grid = max(0.0, load_kw(start) - solar_kw(start) + power)
        cost += grid * SLOT_HOURS * price_ct(start) / 100
    return cost


def plan(now, soc, reserve_soc, target_soc, departure_time, price_ct, load_kw, solar_kw):
    """
    Build and solve the LP. Returns a dict:
      slots           list of {slot_start, action, power_kw, price_ct_kwh}
      theo_cost_eur   the bill under the optimised schedule
      naive_cost_eur  the bill if the car just charged immediately
      saved_eur       naive - theo
      shortfall_kwh   how far below the target the car will be at departure (0 = target met)

    price_ct, load_kw and solar_kw are functions taking a slot start time (a
    datetime) and returning ct/kWh or kW, so this function needs no database.
    """
    starts = plugged_slot_starts(now, departure_time)
    if not starts:  # departure is inside the current slot: nothing to plan
        return {"slots": [], "theo_cost_eur": 0.0, "naive_cost_eur": 0.0, "saved_eur": 0.0, "shortfall_kwh": 0.0}

    n = len(starts)
    start_kwh = soc * BATTERY_KWH
    # If the car already sits below the reserve, do not make that an impossible rule.
    floor_kwh = min(reserve_soc * BATTERY_KWH, start_kwh)
    prices = [price_ct(s) for s in starts]

    model = pulp.LpProblem("theo_schedule", pulp.LpMinimize)
    charge = [model.add_variable(f"charge_{i}", lowBound=0, upBound=MAX_CHARGE_KW) for i in range(n)]
    discharge = [model.add_variable(f"discharge_{i}", lowBound=0, upBound=MAX_DISCHARGE_KW) for i in range(n)]
    grid = [model.add_variable(f"grid_{i}", lowBound=0) for i in range(n)]
    shortfall = model.add_variable("shortfall_kwh", lowBound=0)

    # --- objective, in euros
    model += pulp.lpSum(
        grid[i] * SLOT_HOURS * prices[i] / 100 + discharge[i] * SLOT_HOURS * WEAR_CT_PER_KWH / 100
        for i in range(n)
    ) + shortfall * SHORTFALL_PENALTY_CT_PER_KWH / 100

    # --- rules
    level = start_kwh
    for i in range(n):
        # battery level after slot i, built up slot by slot
        level = level + (EFFICIENCY * charge[i] - discharge[i] / EFFICIENCY) * SLOT_HOURS
        model += level <= BATTERY_KWH
        model += level >= floor_kwh
        model += grid[i] >= load_kw(starts[i]) - solar_kw(starts[i]) + charge[i] - discharge[i]
    model += level + shortfall >= target_soc * BATTERY_KWH  # `level` is now the level at departure

    model.solve(pulp.HiGHS(msg=False))
    if pulp.LpStatus[model.status] != "Optimal":
        raise RuntimeError(f"solver returned {pulp.LpStatus[model.status]}")

    slots = []
    for i, start in enumerate(starts):
        c, d = charge[i].value() or 0.0, discharge[i].value() or 0.0
        if c > 0.05 and c >= d:
            action, power = "charge", c
        elif d > 0.05:
            action, power = "discharge", d
        else:
            action, power = "idle", 0.0
        slots.append(
            {
                "slot_start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "action": action,
                "power_kw": round(power, 2),
                "price_ct_kwh": round(prices[i], 2),
            }
        )

    theo = sum(
        (grid[i].value() or 0.0) * SLOT_HOURS * prices[i] / 100 for i in range(n)
    )
    naive = naive_cost_eur(starts, soc, target_soc, price_ct, load_kw, solar_kw)
    return {
        "slots": slots,
        "theo_cost_eur": round(theo, 4),
        "naive_cost_eur": round(naive, 4),
        "saved_eur": round(naive - theo, 4),
        "shortfall_kwh": round(shortfall.value() or 0.0, 3),
    }
