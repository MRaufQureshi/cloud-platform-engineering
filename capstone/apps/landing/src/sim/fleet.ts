// Depot fleet plan for the fleet chapter: a corrected, energy-based port of the rule engine in
// the founder's V2G Fleet Orchestrator prototype (V2G-app-handoff). Six vehicles spend the
// night at a depot with 22 kW bidirectional chargers; every hour from 18:00 to 10:00 the
// first matching rule decides what each one does:
//   1. it has left for the day                                        → away
//   2. it is below its minimum charge                                 → charge
//   3. critical price, ≥ 20 points above its minimum, > 3 h to leave  → lend (discharge)
//   4. off-peak price and below 95 %                                  → charge
//   5. anything else                                                  → hold
// Fixes over the prototype: energy moves in kWh through the charger, so a 120 kWh truck gains
// fewer points per hour than a 60 kWh car; vehicles really leave; the departure hour counts as
// 0 h away (the prototype said 24 h); and a backward pass guarantees every vehicle leaves with
// at least max(minimum, 80 %) by forcing charge into the cheapest earlier hours. Energy only:
// the prototype's money figures over-counted, so nothing here is priced.
import { PEAK_EUR_KWH, PRICE_EUR_KWH } from './model.ts'

export type VehicleKind = 'van' | 'truck' | 'car'
export type FleetAction = 'charge' | 'discharge' | 'hold' | 'away'
export type PriceTier = 'off-peak' | 'mid-peak' | 'critical'

export interface FleetVehicle {
  id: string
  name: string
  kind: VehicleKind
  /** Usable battery, kWh. */
  capacityKwh: number
  /** State of charge when the window opens, 0–1. */
  soc: number
  /** Never lent below this; a vehicle under it charges first, 0–1. */
  minSoc: number
  /** Clock hour it leaves (0–23); hours before the window start mean the next morning. */
  departHour: number
}

/** The prototype's six vehicles and their state at 18:00. */
export const FLEET: readonly FleetVehicle[] = [
  { id: 'van-1', name: 'Fleet Van #1', kind: 'van', capacityKwh: 75, soc: 0.82, minSoc: 0.3, departHour: 8 },
  { id: 'van-2', name: 'Fleet Van #2', kind: 'van', capacityKwh: 75, soc: 0.61, minSoc: 0.4, departHour: 7 },
  { id: 'truck-1', name: 'Cargo Truck #1', kind: 'truck', capacityKwh: 120, soc: 0.45, minSoc: 0.5, departHour: 6 },
  { id: 'truck-2', name: 'Cargo Truck #2', kind: 'truck', capacityKwh: 120, soc: 0.9, minSoc: 0.5, departHour: 9 },
  { id: 'ev-1', name: 'Manager EV #1', kind: 'car', capacityKwh: 60, soc: 0.55, minSoc: 0.25, departHour: 8 },
  { id: 'ev-2', name: 'Manager EV #2', kind: 'car', capacityKwh: 60, soc: 0.73, minSoc: 0.25, departHour: 10 },
]

export const DEPOT_CHARGER_KW = 22
/** One-way conversion efficiency: 22 kWh through the charger moves 19.8 kWh either way. */
export const DEPOT_EFFICIENCY = 0.9
/** Every vehicle leaves with at least this charge (or its minimum, if higher). */
export const DEPART_SOC = 0.8
/** The window in hours from midnight of the first day: 18:00 → 10:00 the next morning. */
export const WINDOW_START = 18
export const WINDOW_END = 34

const LEND_HEADROOM = 0.2
const LEND_MIN_HOURS = 3
const TOP_UP_BELOW = 0.95
const EPS = 1e-9
/** From 30 ct up to the peak: the shoulders around both peaks (05:00–10:00, 15:00–23:00). */
const MID_PEAK_EUR_KWH = 0.3

/** Critical = the tariff's peak hours (18:00–20:00, plus 08:00); off-peak = 00:00–04:00 and 11:00–14:00. */
export function tierOf(price: number): PriceTier {
  if (price >= PEAK_EUR_KWH) return 'critical'
  if (price >= MID_PEAK_EUR_KWH) return 'mid-peak'
  return 'off-peak'
}

export interface FleetOptions {
  vehicles?: readonly FleetVehicle[]
  /** €/kWh for clock hours 00–23 (default: the site's illustrative tariff). */
  price?: readonly number[]
  chargerKw?: number
  efficiency?: number
  departSoc?: number
  start?: number
  end?: number
}

export interface VehicleHour {
  action: FleetAction
  reason: string
  /** State of charge at the start and end of the hour, 0–1. */
  socStart: number
  socEnd: number
  /** Energy into (+) or out of (−) the battery, kWh. */
  batteryKwh: number
  /** Energy drawn from (+) or delivered to (−) the grid at the charger, kWh. */
  gridKwh: number
  /** Charge added by the departure guarantee rather than by the rules. */
  forced: boolean
}

export interface FleetHour {
  /** Window hour: 18 = 18:00, 24 = midnight, 33 = 09:00 the next morning. */
  hour: number
  price: number
  tier: PriceTier
  /** One entry per vehicle, in input order. */
  vehicles: VehicleHour[]
}

export interface Departure {
  /** Window hour it leaves, or null when it stays past the window. */
  at: number | null
  target: number
  /** State of charge as it leaves (or at the end of the window), 0–1. */
  soc: number
  shortfallKwh: number
}

export interface FleetResult {
  vehicles: readonly FleetVehicle[]
  start: number
  end: number
  /** Hours start … end inclusive; the last entry is the state at the end of the window. */
  hours: FleetHour[]
  departures: Departure[]
  /** Energy over the window at the grid connection, kWh. */
  chargedKwh: number
  lentKwh: number
}

interface Setup {
  price: readonly number[]
  chargeKwh: number
  lendKwh: number
  eff: number
  departSoc: number
  start: number
  end: number
}

/** Window hour at which a vehicle leaves (the next morning when before the start hour). */
export function departureAt(departHour: number, start = WINDOW_START): number {
  return departHour < start ? departHour + 24 : departHour
}

const pct = (v: number) => `${Math.round(v * 100)}%`
export const clockLabel = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:00`

function holdReason(soc: number, tier: PriceTier, hoursLeft: number, keep: boolean): string {
  if (hoursLeft <= LEND_MIN_HOURS) return `Leaves in ${hoursLeft} h — holding`
  if (keep) return 'Grid at peak — keeping charge for the trip'
  if (soc >= TOP_UP_BELOW - EPS) return 'Charged — holding'
  if (tier === 'critical') return 'Grid at peak — near its minimum'
  return 'Waiting for cheaper power'
}

/** One forward pass of the rules for a vehicle; `forced` hours charge, `keep` hours never lend. */
function runVehicle(v: FleetVehicle, s: Setup, forced: Set<number>, keep: Set<number>): VehicleHour[] {
  const dep = departureAt(v.departHour, s.start)
  const target = Math.max(v.minSoc, s.departSoc)
  const out: VehicleHour[] = []
  let soc = v.soc
  for (let h = s.start; h <= s.end; h++) {
    const tier = tierOf(s.price[h % 24])
    const hoursLeft = dep - h
    const lendable = tier === 'critical' && soc - v.minSoc >= LEND_HEADROOM - EPS && hoursLeft > LEND_MIN_HOURS
    let action: FleetAction = 'hold'
    let reason = ''
    let cap = 1
    let isForced = false
    if (hoursLeft <= 0) {
      action = 'away'
      reason = 'On the road'
    } else if (soc < v.minSoc - EPS) {
      action = 'charge'
      reason = 'Below minimum — charging'
    } else if (forced.has(h) && soc < target - EPS) {
      action = 'charge'
      reason = `Needs ${pct(target)} by ${clockLabel(dep)} — charging`
      cap = target
      isForced = true
    } else if (lendable && !keep.has(h)) {
      action = 'discharge'
    } else if (tier === 'off-peak' && soc < TOP_UP_BELOW - EPS) {
      action = 'charge'
      reason = 'Cheap power — topping up'
    } else {
      reason = holdReason(soc, tier, hoursLeft, lendable)
    }

    let battery = 0
    let grid = 0
    if (action === 'charge') {
      battery = Math.max(0, Math.min(s.chargeKwh, (cap - soc) * v.capacityKwh))
      grid = battery / s.eff
    } else if (action === 'discharge') {
      battery = -Math.min(s.lendKwh, (soc - v.minSoc) * v.capacityKwh)
      grid = battery * s.eff
      reason = `Grid at peak — lending ${Math.round(-grid)} kWh`
    }
    const socStart = soc
    soc = Math.min(1, Math.max(0, soc + battery / v.capacityKwh))
    out.push({ action, reason, socStart, socEnd: soc, batteryKwh: battery, gridKwh: grid, forced: isForced })
  }
  return out
}

/**
 * Rules first, then the departure guarantee, planned backwards from the departure: while a
 * vehicle would leave short, force a charge into its cheapest idle hour before it leaves
 * (latest first on ties); once only peak hours are left, stop lending (latest lend first);
 * then accept peak-hour charging. Each step adds one hour to a finite set, so it terminates,
 * and it only gives up when charging every hour cannot reach the target.
 */
function planVehicle(v: FleetVehicle, s: Setup): VehicleHour[] {
  const dep = departureAt(v.departHour, s.start)
  const target = Math.max(v.minSoc, s.departSoc)
  const forced = new Set<number>()
  const keep = new Set<number>()
  const last = Math.min(dep, s.end + 1)
  for (;;) {
    const steps = runVehicle(v, s, forced, keep)
    if (dep > s.end || steps[dep - s.start].socStart >= target - EPS) return steps
    const idle: number[] = []
    for (let h = s.start; h < last; h++) {
      if (steps[h - s.start].action !== 'charge' && !forced.has(h)) idle.push(h)
    }
    const byPrice = (a: number, b: number) => s.price[a % 24] - s.price[b % 24] || b - a
    const cheap = idle.filter((h) => tierOf(s.price[h % 24]) !== 'critical').sort(byPrice)
    if (cheap.length) {
      forced.add(cheap[0])
      continue
    }
    const lends = steps.map((x, i) => (x.action === 'discharge' ? s.start + i : -1)).filter((h) => h >= 0)
    if (lends.length) {
      keep.add(lends[lends.length - 1])
      continue
    }
    const peak = idle.sort(byPrice)
    if (!peak.length) return steps
    forced.add(peak[0])
  }
}

export function simulateFleet(opts: FleetOptions = {}): FleetResult {
  const vehicles = opts.vehicles ?? FLEET
  const kw = opts.chargerKw ?? DEPOT_CHARGER_KW
  const eff = opts.efficiency ?? DEPOT_EFFICIENCY
  const s: Setup = {
    price: opts.price ?? PRICE_EUR_KWH,
    chargeKwh: kw * eff,
    lendKwh: kw,
    eff,
    departSoc: opts.departSoc ?? DEPART_SOC,
    start: opts.start ?? WINDOW_START,
    end: opts.end ?? WINDOW_END,
  }
  const plans = vehicles.map((v) => planVehicle(v, s))
  const hours: FleetHour[] = []
  let chargedKwh = 0
  let lentKwh = 0
  for (let h = s.start; h <= s.end; h++) {
    const price = s.price[h % 24]
    const row = plans.map((p) => p[h - s.start])
    hours.push({ hour: h, price, tier: tierOf(price), vehicles: row })
    if (h === s.end) continue // the closing entry is a state, not an hour of the window
    for (const x of row) {
      if (x.gridKwh > 0) chargedKwh += x.gridKwh
      else lentKwh -= x.gridKwh
    }
  }
  const departures = vehicles.map((v, i): Departure => {
    const dep = departureAt(v.departHour, s.start)
    const target = Math.max(v.minSoc, s.departSoc)
    const at = dep <= s.end ? dep : null
    const soc = at === null ? plans[i][s.end - s.start].socStart : plans[i][dep - s.start].socStart
    return { at, target, soc, shortfallKwh: at === null ? 0 : Math.max(0, target - soc) * v.capacityKwh }
  })
  return { vehicles, start: s.start, end: s.end, hours, departures, chargedKwh, lentKwh }
}

export interface VehicleSnapshot {
  action: FleetAction
  reason: string
  /** Interpolated state of charge, 0–1. */
  soc: number
  /** Charging energy comes from the grid: the depot model has no solar. */
  source: 'grid'
  /** Drive-out progress in the minutes before departure: 0 parked … 1 gone. */
  leave: number
}

export interface FleetSnapshot {
  /** Window hour, clamped to the window. */
  hour: number
  /** Clock time, HH:MM. */
  clock: string
  price: number
  tier: PriceTier
  vehicles: VehicleSnapshot[]
  /** Energy so far in the window at the grid connection, kWh. */
  chargedKwh: number
  lentKwh: number
}

/** Vehicles unplug and drive out over this long before their departure hour (hours). */
export const LEAVE_HOURS = 0.4

/** The fleet at window hour h (18 … 34): SoC interpolated within the hour, energy so far. */
export function sampleFleet(r: FleetResult, h: number): FleetSnapshot {
  const t = Math.min(r.end, Math.max(r.start, Number.isFinite(h) ? h : r.start))
  const i = Math.min(r.hours.length - 1, Math.floor(t - r.start))
  const frac = t - r.start - i
  const step = r.hours[i]
  let chargedKwh = 0
  let lentKwh = 0
  for (let k = 0; k <= i && k < r.hours.length - 1; k++) {
    const w = k < i ? 1 : frac
    for (const x of r.hours[k].vehicles) {
      if (x.gridKwh > 0) chargedKwh += x.gridKwh * w
      else lentKwh -= x.gridKwh * w
    }
  }
  const vehicles = step.vehicles.map((x, k): VehicleSnapshot => {
    // Only a holding vehicle unplugs early; one still charging leaves on the hour.
    const dep = r.departures[k].at
    const leave = dep === null || x.action !== 'hold' ? 0 : Math.min(1, Math.max(0, (t - (dep - LEAVE_HOURS)) / LEAVE_HOURS))
    const out = x.action === 'away' || leave > 0
    return {
      action: out ? 'away' : x.action,
      reason: x.action !== 'away' && leave > 0 ? 'Unplugged — heading out' : x.reason,
      soc: x.socStart + (x.socEnd - x.socStart) * frac,
      source: 'grid',
      leave: x.action === 'away' ? 1 : leave,
    }
  })
  // Minutes from the window time itself, rounded with carry: 09:59.7 reads 10:00, never 09:60.
  const mins = Math.round(t * 60)
  const pad = (v: number) => String(v).padStart(2, '0')
  return {
    hour: t,
    clock: `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`,
    price: step.price,
    tier: step.tier,
    vehicles,
    chargedKwh,
    lentKwh,
  }
}
