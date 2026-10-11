// Illustrative inputs for the household (V2H) model. Load and solar shapes come from the
// founder's EnergyOrchestrator prototype (V2H-app-handoff), rescaled to sourced German
// values (see site/DESIGN.md → Sources): household price ≈ 37 ct/kWh on average (BDEW 2026),
// a three-person house ≈ 3,500 kWh/yr (Stromspiegel), feed-in 7.70 ct/kWh (EEG, Aug 2026).
// Every number shown to visitors from this model must be labelled as an illustrative simulation.

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter']

/**
 * Illustrative dynamic household tariff for a typical day (gross €/kWh, hours 00–23): fixed
 * grid fees and levies plus an hourly wholesale component — cheap at night and in the early
 * afternoon, dearest in the morning and evening peaks. The shape is that of a high-spread day
 * (23–44 ct) with each hour's distance from the ≈ 31.5 ct mean scaled to 45 % and rounded to
 * 0.5 ct, giving 27.5–37 ct. At that spread a commuter without solar (75 kWh car,
 * 40 km a day, home 17:00–08:00, 3,500 kWh/yr) saves ≈ €160 a year from smart charging,
 * inside the independent €50–200 estimate (Agora Verkehrswende / RLI 2025). The simulator
 * repeats this one day all year; real spreads vary from day to day.
 */
export const PRICE_EUR_KWH: readonly number[] = [
  0.295, 0.29, 0.285, 0.285, 0.29, 0.3,
  0.32, 0.345, 0.355, 0.335, 0.31, 0.295,
  0.28, 0.275, 0.285, 0.3, 0.32, 0.35,
  0.365, 0.37, 0.355, 0.33, 0.315, 0.305,
]

/** Peak hours of the sample day: 18:00–20:00 and 08:00, its four priciest (≥ 35.5 ct), €/kWh. */
export const PEAK_EUR_KWH = 0.355

/** Feed-in remuneration for exported surplus from new rooftop PV ≤ 10 kWp (EEG, Aug 2026), €/kWh. */
export const FEED_IN_EUR_KWH = 0.077

/** Hourly household consumption shape (prototype profile), scaled by householdLoad(). */
const LOAD_SHAPE: readonly number[] = [
  0.3, 0.2, 0.2, 0.2, 0.3, 0.5,
  0.8, 1.0, 0.9, 0.7, 0.6, 0.7,
  0.8, 0.7, 0.6, 0.7, 0.9, 1.2,
  1.4, 1.3, 1.0, 0.8, 0.6, 0.4,
]

/** Hourly consumption (kWh) for a household using `annualKwh` per year. */
export function householdLoad(annualKwh: number): number[] {
  const daily = annualKwh / 365
  const sum = LOAD_SHAPE.reduce((a, b) => a + b, 0)
  return LOAD_SHAPE.map((v) => (v / sum) * daily)
}

/** Household sizes offered by the simulator (annual kWh). */
export const HOUSEHOLDS = [
  { id: 'small', label: '1–2 people', annualKwh: 2700 },
  { id: 'family', label: '3–4 people', annualKwh: 3500 },
  { id: 'heatpump', label: 'Family + heat pump', annualKwh: 6000 },
] as const

/** Default household consumption per hour (3,500 kWh/yr). */
export const HOME_LOAD_KWH: readonly number[] = householdLoad(3500)

/** Relative hourly PV output shape per season (normalised to the daily yield in pvProfile). */
const PV_SHAPE: Record<Season, readonly number[]> = {
  spring: [0, 0, 0, 0, 0, 0.1, 0.3, 0.5, 0.7, 0.85, 0.9, 0.95, 1.0, 0.95, 0.85, 0.7, 0.5, 0.3, 0.1, 0, 0, 0, 0, 0],
  summer: [0, 0, 0, 0, 0, 0.2, 0.4, 0.6, 0.8, 0.95, 1.0, 1.0, 1.0, 1.0, 0.95, 0.8, 0.6, 0.4, 0.2, 0.05, 0, 0, 0, 0],
  autumn: [0, 0, 0, 0, 0, 0, 0.1, 0.3, 0.5, 0.65, 0.75, 0.8, 0.8, 0.75, 0.65, 0.5, 0.3, 0.1, 0, 0, 0, 0, 0, 0],
  winter: [0, 0, 0, 0, 0, 0, 0, 0.1, 0.25, 0.4, 0.5, 0.55, 0.55, 0.5, 0.4, 0.25, 0.1, 0, 0, 0, 0, 0, 0, 0],
}

/** Daily PV yield on a fair-weather day, kWh per kWp. */
export const DAILY_YIELD_KWH_PER_KWP: Record<Season, number> = {
  spring: 4.5,
  summer: 5.5,
  autumn: 3.0,
  winter: 1.2,
}

/** Typical monthly PV yield in Germany, kWh per kWp (≈985 kWh/kWp per year). */
export const MONTHLY_YIELD_KWH_PER_KWP: readonly number[] = [25, 45, 80, 110, 130, 135, 140, 120, 90, 60, 30, 20]
export const MONTH_DAYS: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
export const MONTH_SEASON: readonly Season[] = [
  'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
  'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter',
]
export const MONTH_NAMES: readonly string[] = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Hourly PV output (kWh per hour) for a plant of `kwp` on a day yielding `dailyYieldPerKwp`. */
export function pvProfile(season: Season, kwp: number, dailyYieldPerKwp = DAILY_YIELD_KWH_PER_KWP[season]): number[] {
  const shape = PV_SHAPE[season]
  const sum = shape.reduce((a, b) => a + b, 0)
  return shape.map((v) => (v / sum) * dailyYieldPerKwp * kwp)
}

/** Generic vehicle classes: the site never implies that a specific model supports V2H. */
export interface VehicleClass {
  id: string
  label: string
  batteryKwh: number
  kmPerKwh: number
}

export const VEHICLES: readonly VehicleClass[] = [
  { id: 'city', label: 'City car', batteryKwh: 52, kmPerKwh: 6.8 },
  { id: 'compact', label: 'Compact', batteryKwh: 58, kmPerKwh: 6.5 },
  { id: 'sedan', label: 'Sedan', batteryKwh: 75, kmPerKwh: 6.4 },
  { id: 'suv', label: 'SUV', batteryKwh: 82, kmPerKwh: 5.9 },
  { id: 'van', label: 'Family van', batteryKwh: 77, kmPerKwh: 5.6 },
]

/** Wallbox power (kW) for both directions, and one-way battery efficiency. */
export const CHARGER_KW = 7.4
export const ONE_WAY_EFFICIENCY = 0.9
