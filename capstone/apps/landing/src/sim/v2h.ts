// Household V2H planner: picks, hour by hour, how much to charge the car (from sun or grid)
// or how much to discharge it into the home, minimising the household's electricity bill
// while guaranteeing the target charge at departure. Solved exactly over a discretised
// battery state with dynamic programming on a 48-hour horizon; the second day is reported,
// so the overnight charging that prepares the morning departure is part of the plan.
//
// Savings are measured against an unmanaged baseline: the car charges at full power as soon
// as it is plugged in, up to the same target, and never powers the home.

import {
  CHARGER_KW,
  FEED_IN_EUR_KWH,
  HOME_LOAD_KWH,
  MONTH_DAYS,
  MONTH_SEASON,
  MONTHLY_YIELD_KWH_PER_KWP,
  ONE_WAY_EFFICIENCY,
  PEAK_EUR_KWH,
  PRICE_EUR_KWH,
  pvProfile,
  type Season,
} from './model.ts'

export interface PlanInput {
  batteryKwh: number
  pvKwp: number
  season: Season
  /** Hour the car leaves (0–23). Equal to returnHour means the car stays home all day. */
  departHour: number
  returnHour: number
  /** Energy the day's driving takes out of the battery, kWh. */
  tripKwh: number
  /** Required state of charge at departure, 0–1. */
  targetSoc: number
  /** The car is never discharged below this state of charge, 0–1. */
  reserveSoc: number
  chargerKw?: number
  efficiency?: number
  allowV2H?: boolean
  price?: readonly number[]
  feedIn?: number
  load?: readonly number[]
  /** Hourly PV output override, kWh per hour. */
  pv?: readonly number[]
}

export type Action = 'away' | 'solar-charge' | 'grid-charge' | 'v2h' | 'idle'

export interface HourFlow {
  hour: number
  price: number
  pv: number
  load: number
  home: boolean
  pvToHome: number
  pvToCar: number
  pvToGrid: number
  gridToHome: number
  gridToCar: number
  carToHome: number
  /** Battery state of charge at the start and end of the hour, 0–1. */
  socStart: number
  socEnd: number
  action: Action
  /** Net cost of the hour: imports minus feed-in revenue, €. */
  cost: number
}

export interface DayResult {
  hours: HourFlow[]
  cost: number
  gridImport: number
  gridExport: number
  /** Grid imports during the tariff's peak hours (price ≥ PEAK_EUR_KWH), kWh. */
  peakImport: number
  /** Share of the day's PV used on site (home + car), 0–1. */
  selfConsumption: number
  /** kWh missing from the target at departure (0 when the target is reachable). */
  shortfallKwh: number
  /** Battery-wear allowance for the energy discharged into the home, €. */
  wearCost: number
}

export interface PlanResult {
  smart: DayResult
  baseline: DayResult
  /** Baseline bill minus the smart bill and its battery-wear allowance, €. */
  savings: number
}

const STEP = 0.2 // battery state resolution, kWh
const HORIZON = 48
const TARGET_PENALTY = 5 // €/kWh missing at departure: soft constraint keeps every input feasible
const RESERVE_PENALTY = 0.5 // €/kWh per hour spent below the reserve while plugged in
const WEAR_EUR_PER_KWH = 0.03 // battery-wear allowance per kWh discharged into the home

/** True when the car is away during clock hour h. Handles trips that span midnight. */
export function isAway(h: number, departHour: number, returnHour: number): boolean {
  if (departHour === returnHour) return false
  return departHour < returnHour ? h >= departHour && h < returnHour : h >= departHour || h < returnHour
}

interface Resolved {
  n: number
  targetSteps: number
  reserveSteps: number
  tripSteps: number
  maxCharge: number
  maxDischarge: number
  eff: number
  allowV2H: boolean
  price: readonly number[]
  feedIn: number
  load: readonly number[]
  pv: readonly number[]
  departHour: number
  returnHour: number
}

function resolve(inp: PlanInput): Resolved {
  const eff = inp.efficiency ?? ONE_WAY_EFFICIENCY
  const chargerKw = inp.chargerKw ?? CHARGER_KW
  const n = Math.max(1, Math.round(inp.batteryKwh / STEP))
  return {
    n,
    targetSteps: Math.round(clamp01(inp.targetSoc) * n),
    reserveSteps: Math.round(clamp01(inp.reserveSoc) * n),
    tripSteps: Math.round(Math.max(0, inp.tripKwh) / STEP),
    maxCharge: Math.floor((chargerKw * eff) / STEP + 1e-9),
    maxDischarge: Math.floor(chargerKw / eff / STEP + 1e-9),
    eff,
    allowV2H: inp.allowV2H ?? true,
    price: inp.price ?? PRICE_EUR_KWH,
    feedIn: inp.feedIn ?? FEED_IN_EUR_KWH,
    load: inp.load ?? HOME_LOAD_KWH,
    pv: inp.pv ?? pvProfile(inp.season, inp.pvKwp),
    departHour: inp.departHour,
    returnHour: inp.returnHour,
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

interface Flows {
  pvToHome: number
  pvToCar: number
  pvToGrid: number
  gridToHome: number
  gridToCar: number
  carToHome: number
  cost: number
}

/** Energy flows for one hour where the battery changes by k steps (k > 0 charge, k < 0 discharge). */
function hourFlows(r: Resolved, h: number, k: number, home: boolean): Flows | null {
  const pv = r.pv[h]
  const load = r.load[h]
  const surplus = Math.max(0, pv - load)
  const deficit = Math.max(0, load - pv)
  let pvToCar = 0
  let gridToCar = 0
  let carToHome = 0
  if (k !== 0 && !home) return null
  if (k > 0) {
    const wall = (k * STEP) / r.eff
    pvToCar = Math.min(surplus, wall)
    gridToCar = wall - pvToCar
  } else if (k < 0) {
    const delivered = -k * STEP * r.eff
    if (delivered > deficit + 1e-9) return null // V2H only covers the home's own demand
    carToHome = delivered
  }
  const pvToGrid = surplus - pvToCar
  const gridToHome = deficit - carToHome
  const cost = (gridToHome + gridToCar) * r.price[h] - pvToGrid * r.feedIn
  return { pvToHome: Math.min(pv, load), pvToCar, pvToGrid, gridToHome, gridToCar, carToHome, cost }
}

/**
 * Cost-minimising battery states at every hour boundary 0..hours, starting from `start`
 * (in steps) at clock hour 0. `terminal` prices the final state.
 */
function solve(r: Resolved, hours: number, start: number, terminal: (s: number) => number): Int32Array {
  const { n } = r
  const INF = Number.POSITIVE_INFINITY
  let value = new Float64Array(n + 1).fill(INF)
  value[start] = 0
  const back: Int32Array[] = []

  for (let t = 0; t < hours; t++) {
    const h = t % 24
    const away = isAway(h, r.departHour, r.returnHour)
    const departing = away && !isAway((h + 23) % 24, r.departHour, r.returnHour)
    const next = new Float64Array(n + 1).fill(INF)
    const from = new Int32Array(n + 1).fill(-1)

    if (away) {
      const base = (hourFlows(r, h, 0, false) as Flows).cost
      for (let s = 0; s <= n; s++) {
        if (value[s] === INF) continue
        let sN = s
        let c = base
        if (departing) {
          c += Math.max(0, r.targetSteps - s) * STEP * TARGET_PENALTY
          sN = Math.max(0, s - r.tripSteps)
        }
        const v = value[s] + c
        if (v < next[sN]) {
          next[sN] = v
          from[sN] = s
        }
      }
    } else {
      const lo = r.allowV2H ? -r.maxDischarge : 0
      const costs: (number | null)[] = []
      for (let k = lo; k <= r.maxCharge; k++) {
        const f = hourFlows(r, h, k, true)
        costs.push(f ? f.cost + Math.max(0, -k) * STEP * WEAR_EUR_PER_KWH : null)
      }
      for (let s = 0; s <= n; s++) {
        if (value[s] === INF) continue
        for (let k = lo; k <= r.maxCharge; k++) {
          const c = costs[k - lo]
          if (c === null) continue
          const sN = s + k
          if (sN < 0 || sN > n) continue
          if (k < 0 && sN < r.reserveSteps) continue
          const v = value[s] + c + Math.max(0, r.reserveSteps - sN) * STEP * RESERVE_PENALTY
          if (v < next[sN]) {
            next[sN] = v
            from[sN] = s
          }
        }
      }
    }
    back.push(from)
    value = next
  }

  let best = -1
  let bestV = INF
  for (let s = 0; s <= n; s++) {
    if (value[s] === INF) continue
    const v = value[s] + terminal(s)
    if (v < bestV) {
      bestV = v
      best = s
    }
  }

  const states = new Int32Array(hours + 1)
  states[hours] = best
  for (let t = hours - 1; t >= 0; t--) states[t] = back[t][states[t + 1]]
  return states
}

/**
 * A repeatable (steady-state) day: a 48-hour solve picks a realistic state of charge at
 * midnight, then the day is re-solved so it must end at least where it started. This keeps
 * the day's bill honest - no savings come from silently draining or hoarding the battery.
 */
function optimiseStates(r: Resolved): Int32Array {
  const refill = Math.min(...r.price) / r.eff
  const warm = solve(r, HORIZON, r.targetSteps, (s) => (r.targetSteps - s) * STEP * refill)
  const midnight = warm[24]
  return solve(r, 24, midnight, (s) => Math.max(0, midnight - s) * STEP * TARGET_PENALTY)
}

/** Unmanaged charging: full power from plug-in until the target, never discharges. */
function baselineStates(r: Resolved): Int32Array {
  const states = new Int32Array(HORIZON + 1)
  let s = r.targetSteps
  states[0] = s
  for (let t = 0; t < HORIZON; t++) {
    const h = t % 24
    const away = isAway(h, r.departHour, r.returnHour)
    if (away) {
      if (!isAway((h + 23) % 24, r.departHour, r.returnHour)) s = Math.max(0, s - r.tripSteps)
    } else {
      s += Math.min(r.maxCharge, Math.max(0, r.targetSteps - s))
    }
    states[t + 1] = s
  }
  return states
}

/** Hourly flows for the 24 hours of `states` starting at index `offset` (clock hour 0). */
function dayFromStates(r: Resolved, states: Int32Array, offset: number): DayResult {
  const hours: HourFlow[] = []
  let cost = 0
  let gridImport = 0
  let gridExport = 0
  let peakImport = 0
  let pvUsed = 0
  let pvTotal = 0
  let shortfallKwh = 0
  let wearCost = 0

  for (let t = offset; t < offset + 24; t++) {
    const h = t % 24
    const away = isAway(h, r.departHour, r.returnHour)
    const departing = away && !isAway((h + 23) % 24, r.departHour, r.returnHour)
    const s0 = states[t]
    const s1 = states[t + 1]
    if (departing) shortfallKwh = Math.max(0, r.targetSteps - s0) * STEP
    const k = away ? 0 : s1 - s0
    const f = hourFlows(r, h, k, !away) as Flows
    let action: Action = 'idle'
    if (away) action = 'away'
    else if (k > 0) action = f.pvToCar >= f.gridToCar ? 'solar-charge' : 'grid-charge'
    else if (k < 0) action = 'v2h'

    const imp = f.gridToHome + f.gridToCar
    cost += f.cost
    wearCost += (f.carToHome / r.eff) * WEAR_EUR_PER_KWH
    gridImport += imp
    gridExport += f.pvToGrid
    if (r.price[h] >= PEAK_EUR_KWH) peakImport += imp
    pvUsed += f.pvToHome + f.pvToCar
    pvTotal += r.pv[h]

    hours.push({
      hour: h,
      price: r.price[h],
      pv: r.pv[h],
      load: r.load[h],
      home: !away,
      ...f,
      socStart: s0 / r.n,
      socEnd: s1 / r.n,
      action,
    })
  }

  return {
    hours,
    cost,
    gridImport,
    gridExport,
    peakImport,
    selfConsumption: pvTotal > 0 ? pvUsed / pvTotal : 0,
    shortfallKwh,
    wearCost,
  }
}

export function planDay(inp: PlanInput): PlanResult {
  const r = resolve(inp)
  const smart = dayFromStates(r, optimiseStates(r), 0)
  const baseline = dayFromStates(r, baselineStates(r), 24)
  return { smart, baseline, savings: baseline.cost - smart.cost - smart.wearCost }
}

export interface MonthResult {
  month: number
  savings: number
  smartCost: number
  baselineCost: number
  peakImportAvoided: number
}

export interface YearResult {
  months: MonthResult[]
  savings: number
  peakImportAvoided: number
}

/** Twelve representative days (one per month, real monthly PV yield) scaled by days per month. */
export function planYear(inp: Omit<PlanInput, 'season' | 'pv'>): YearResult {
  const months: MonthResult[] = []
  for (let m = 0; m < 12; m++) {
    const season = MONTH_SEASON[m]
    const pv = pvProfile(season, inp.pvKwp, MONTHLY_YIELD_KWH_PER_KWP[m] / MONTH_DAYS[m])
    const r = planDay({ ...inp, season, pv })
    const d = MONTH_DAYS[m]
    months.push({
      month: m,
      savings: r.savings * d,
      smartCost: r.smart.cost * d,
      baselineCost: r.baseline.cost * d,
      peakImportAvoided: (r.baseline.peakImport - r.smart.peakImport) * d,
    })
  }
  return {
    months,
    savings: months.reduce((a, m) => a + m.savings, 0),
    peakImportAvoided: months.reduce((a, m) => a + m.peakImportAvoided, 0),
  }
}
