import assert from 'node:assert/strict'
import { test } from 'node:test'
import { householdLoad, PEAK_EUR_KWH } from './model.ts'
import { isAway, planDay, planYear, type PlanInput } from './v2h.ts'

const base: PlanInput = {
  batteryKwh: 75,
  pvKwp: 8,
  season: 'summer',
  departHour: 8,
  returnHour: 15,
  tripKwh: 7,
  targetSoc: 0.8,
  reserveSoc: 0.3,
}

const EPS = 1e-6

test('isAway handles same-day trips, overnight trips and staying home', () => {
  assert.equal(isAway(9, 8, 17), true)
  assert.equal(isAway(17, 8, 17), false)
  assert.equal(isAway(7, 8, 17), false)
  assert.equal(isAway(23, 22, 6), true)
  assert.equal(isAway(3, 22, 6), true)
  assert.equal(isAway(12, 22, 6), false)
  assert.equal(isAway(12, 9, 9), false)
})

test('every hour balances: PV, home and car flows add up', () => {
  for (const r of [planDay(base).smart, planDay(base).baseline]) {
    for (const h of r.hours) {
      assert.ok(Math.abs(h.pvToHome + h.pvToCar + h.pvToGrid - h.pv) < EPS, `pv balance at ${h.hour}`)
      assert.ok(Math.abs(h.pvToHome + h.carToHome + h.gridToHome - h.load) < EPS, `load balance at ${h.hour}`)
      for (const v of [h.pvToCar, h.pvToGrid, h.gridToHome, h.gridToCar, h.carToHome]) assert.ok(v >= -EPS)
      assert.ok(h.socEnd >= -EPS && h.socEnd <= 1 + EPS)
    }
  }
})

test('the car is never charged or discharged while away', () => {
  const r = planDay({ ...base, departHour: 22, returnHour: 6 }).smart
  for (const h of r.hours) {
    if (!h.home) {
      assert.equal(h.pvToCar + h.gridToCar + h.carToHome, 0, `hour ${h.hour}`)
      assert.equal(h.action, 'away')
    }
  }
  assert.equal(r.hours[23].home, false)
  assert.equal(r.hours[3].home, false)
})

test('the target charge is met at departure', () => {
  const r = planDay(base).smart
  assert.equal(r.shortfallKwh, 0)
  const departing = r.hours[base.departHour]
  assert.ok(departing.socStart >= base.targetSoc - 0.01)
})

test('V2H never drops below the reserve and never exceeds the home demand', () => {
  const r = planDay(base).smart
  for (const h of r.hours) {
    if (h.carToHome > 0) {
      assert.ok(h.socEnd >= base.reserveSoc - 0.01, `reserve at ${h.hour}`)
      assert.ok(h.carToHome <= h.load - Math.min(h.pv, h.load) + EPS)
    }
  }
})

test('smart plan beats unmanaged charging and uses V2H in the priciest hours', () => {
  const r = planDay(base)
  assert.ok(r.savings > 0, `savings ${r.savings}`)
  const atPeak = r.smart.hours.filter((h) => h.price >= PEAK_EUR_KWH).reduce((a, h) => a + h.carToHome, 0)
  assert.ok(atPeak > 0.5, `peak-hour V2H ${atPeak}`)
  assert.ok(r.smart.peakImport < r.baseline.peakImport)
})

test('disabling V2H can only cost more', () => {
  const on = planDay(base)
  const off = planDay({ ...base, allowV2H: false })
  assert.ok(off.smart.cost >= on.smart.cost - EPS)
  assert.equal(off.smart.hours.reduce((a, h) => a + h.carToHome, 0), 0)
})

test('a car that stays home soaks up midday sun', () => {
  const r = planDay({ ...base, departHour: 12, returnHour: 12 }).smart
  const solarToCar = r.hours.reduce((a, h) => a + h.pvToCar, 0)
  const carToHome = r.hours.reduce((a, h) => a + h.carToHome, 0)
  assert.ok(solarToCar > 1, `solar to car ${solarToCar}`)
  assert.ok(carToHome > 1, `car to home ${carToHome}`)
})

test('an unreachable target is reported instead of failing', () => {
  const r = planDay({ ...base, departHour: 1, returnHour: 23, tripKwh: 60, targetSoc: 1 }).smart
  assert.ok(Number.isFinite(r.cost))
  assert.ok(r.shortfallKwh > 0)
})

test('a short midday trip still costs energy that has to be put back', () => {
  const r = planDay({ ...base, departHour: 10, returnHour: 12, tripKwh: 6 }).smart
  assert.equal(r.hours[11].home, false)
  const intoCar = r.hours.reduce((a, h) => a + h.pvToCar + h.gridToCar, 0) * 0.9
  const outOfCar = r.hours.reduce((a, h) => a + h.carToHome, 0) / 0.9
  const drift = (r.hours[23].socEnd - r.hours[0].socStart) * base.batteryKwh
  assert.ok(Math.abs(intoCar - outOfCar - 6 - drift) < EPS, `energy balance ${intoCar} − ${outOfCar} − 6 − ${drift}`)
})

test('the sample tariff is calibrated: a commuter without solar saves €100–200 a year from smart charging', () => {
  // The same profile as the independent €50–200 estimate (Agora Verkehrswende / RLI 2025).
  const commuter = {
    batteryKwh: 75,
    pvKwp: 0,
    departHour: 8,
    returnHour: 17,
    tripKwh: 40 / 6.4,
    targetSoc: 0.8,
    reserveSoc: 0.3,
    load: householdLoad(3500),
  }
  const smart = planYear({ ...commuter, allowV2H: false }).savings
  assert.ok(smart >= 100 && smart <= 200, `smart charging ${smart.toFixed(0)} €/yr`)
  // Without solar, buying power at night to run the house at the peak barely pays at this spread.
  assert.ok(planYear(commuter).savings - smart < 25)
})

test('the year adds up its months', () => {
  const y = planYear(base)
  assert.equal(y.months.length, 12)
  assert.ok(Math.abs(y.months.reduce((a, m) => a + m.savings, 0) - y.savings) < EPS)
  assert.ok(y.savings > 0)
})
