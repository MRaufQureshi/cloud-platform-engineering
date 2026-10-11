import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PRICE_EUR_KWH } from './model.ts'
import {
  DEPART_SOC,
  FLEET,
  departureAt,
  sampleFleet,
  simulateFleet,
  tierOf,
  type FleetOptions,
  type FleetResult,
  type FleetVehicle,
} from './fleet.ts'

const EPS = 1e-6

/** Deterministic pseudo-random numbers (LCG) for property checks. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function randomCase(seed: number): FleetOptions {
  const r = rng(seed)
  const kinds = ['van', 'truck', 'car'] as const
  const vehicles: FleetVehicle[] = Array.from({ length: 6 }, (_, i) => ({
    id: `v${i}`,
    name: `Vehicle ${i}`,
    kind: kinds[i % 3],
    capacityKwh: [60, 75, 120][Math.floor(r() * 3)],
    soc: 0.1 + r() * 0.9,
    minSoc: 0.1 + r() * 0.5,
    departHour: [19, 21, 23, 0, 2, 4, 5, 6, 7, 8, 9, 10][Math.floor(r() * 12)],
  }))
  const price = Array.from({ length: 24 }, () => 0.2 + r() * 0.3)
  return { vehicles, price, chargerKw: [3.7, 7.4, 11, 22][Math.floor(r() * 4)] }
}

const CASES: FleetOptions[] = [
  {},
  { chargerKw: 7.4 },
  { chargerKw: 11 },
  { price: Array(24).fill(0.45) },
  ...Array.from({ length: 60 }, (_, i) => randomCase(i + 1)),
]

function eachVehicleHour(r: FleetResult, fn: (v: FleetVehicle, i: number, h: number, dep: number) => void) {
  r.vehicles.forEach((v, i) => {
    const dep = departureAt(v.departHour, r.start)
    for (const hour of r.hours) fn(v, i, hour.hour, dep)
  })
}

test('price tiers follow the site tariff: the evening peak is critical, the night off-peak', () => {
  const hoursIn = (tier: string) => PRICE_EUR_KWH.flatMap((p, h) => (tierOf(p) === tier ? [h] : []))
  assert.deepEqual(hoursIn('critical'), [8, 18, 19, 20])
  assert.deepEqual(hoursIn('off-peak'), [0, 1, 2, 3, 4, 11, 12, 13, 14])
  assert.equal(tierOf(0.295), 'off-peak')
  assert.equal(tierOf(0.3), 'mid-peak')
  assert.equal(tierOf(0.35), 'mid-peak')
  assert.equal(tierOf(0.355), 'critical')
})

test('the prototype fleet runs hour by hour from 18:00 to 10:00', () => {
  const r = simulateFleet()
  assert.equal(r.vehicles.length, 6)
  assert.deepEqual(
    FLEET.map((v) => [v.name, v.capacityKwh, Math.round(v.soc * 100), Math.round(v.minSoc * 100), v.departHour]),
    [
      ['Fleet Van #1', 75, 82, 30, 8],
      ['Fleet Van #2', 75, 61, 40, 7],
      ['Cargo Truck #1', 120, 45, 50, 6],
      ['Cargo Truck #2', 120, 90, 50, 9],
      ['Manager EV #1', 60, 55, 25, 8],
      ['Manager EV #2', 60, 73, 25, 10],
    ],
  )
  assert.deepEqual(
    r.hours.map((h) => h.hour),
    Array.from({ length: 17 }, (_, i) => 18 + i),
  )
  for (const h of r.hours) assert.equal(h.vehicles.length, 6)
})

test('never lends within 3 h of departure or in the departure hour', () => {
  for (const opts of CASES) {
    const r = simulateFleet(opts)
    eachVehicleHour(r, (_v, i, h, dep) => {
      const x = r.hours[h - r.start].vehicles[i]
      if (x.action === 'discharge') assert.ok(dep - h > 3, `lent ${dep - h} h before leaving`)
      if (h === dep) assert.equal(x.action, 'away')
    })
  }
})

test('never lends below the minimum, and a vehicle under it charges first', () => {
  for (const opts of CASES) {
    const r = simulateFleet(opts)
    eachVehicleHour(r, (v, i, h) => {
      const x = r.hours[h - r.start].vehicles[i]
      if (x.action === 'discharge') {
        assert.ok(x.socStart - v.minSoc >= 0.2 - EPS, 'needs 20 points of headroom to lend')
        assert.ok(x.socEnd >= v.minSoc - EPS, `${v.name} lent below its minimum`)
      }
      if (x.socStart >= v.minSoc - EPS) assert.ok(x.socEnd >= v.minSoc - EPS, `${v.name} dropped below its minimum`)
      if (x.action !== 'away' && x.socStart < v.minSoc - EPS) assert.equal(x.action, 'charge')
    })
  }
})

test('every vehicle leaves with at least 80 % (or its minimum, if higher)', () => {
  const r = simulateFleet()
  r.departures.forEach((d, i) => {
    assert.ok(d.at !== null)
    assert.equal(d.target, Math.max(FLEET[i].minSoc, DEPART_SOC))
    assert.ok(d.soc >= d.target - EPS, `${FLEET[i].name} left at ${d.soc}`)
    assert.equal(d.shortfallKwh, 0)
  })
  // Whenever charging every hour could reach the target, the plan reaches it.
  for (const opts of CASES) {
    const res = simulateFleet(opts)
    res.vehicles.forEach((v, i) => {
      const d = res.departures[i]
      if (d.at === null) return
      const perHour = ((opts.chargerKw ?? 22) * 0.9) / v.capacityKwh
      const best = Math.min(1, v.soc + (d.at - res.start) * perHour)
      if (best >= d.target + EPS) assert.ok(d.soc >= d.target - EPS, `${v.name}: ${d.soc} < ${d.target}`)
      else assert.ok(d.shortfallKwh > 0)
    })
  }
})

test('away vehicles do nothing', () => {
  for (const opts of CASES) {
    const r = simulateFleet(opts)
    eachVehicleHour(r, (_v, i, h, dep) => {
      const x = r.hours[h - r.start].vehicles[i]
      assert.equal(x.action === 'away', h >= dep)
      if (x.action === 'away') {
        assert.equal(x.batteryKwh, 0)
        assert.equal(x.gridKwh, 0)
        assert.equal(x.socEnd, x.socStart)
        assert.equal(x.reason, 'On the road')
      }
    })
  }
})

test('energy moves through a 22 kW charger at 90 % one-way efficiency', () => {
  const r = simulateFleet()
  for (const h of r.hours) {
    h.vehicles.forEach((x, i) => {
      const cap = FLEET[i].capacityKwh
      assert.ok(Math.abs((x.socEnd - x.socStart) * cap - x.batteryKwh) < EPS, 'SoC follows the battery energy')
      if (x.action === 'charge') {
        assert.ok(x.batteryKwh <= 19.8 + EPS)
        assert.ok(Math.abs(x.gridKwh * 0.9 - x.batteryKwh) < EPS)
      }
      if (x.action === 'discharge') {
        assert.ok(-x.batteryKwh <= 22 + EPS)
        assert.ok(Math.abs(x.batteryKwh * 0.9 - x.gridKwh) < EPS)
      }
      if (x.action === 'hold') assert.equal(x.batteryKwh, 0)
    })
  }
  // A full hour of cheap charging adds the same energy, so fewer points to a bigger battery.
  const midnight = r.hours[24 - r.start].vehicles
  assert.ok(Math.abs(midnight[0].socEnd - midnight[0].socStart - 19.8 / 75) < EPS)
  assert.ok(Math.abs(midnight[2].socEnd - midnight[2].socStart - 19.8 / 120) < EPS)
  // The peak-hour reason reports what reaches the grid.
  assert.equal(r.hours[0].vehicles[0].reason, 'Grid at peak — lending 20 kWh')
  assert.equal(r.hours[0].vehicles[2].reason, 'Below minimum — charging')
})

test('the default night lends at the evening peak and recharges off-peak', () => {
  const r = simulateFleet()
  const lent = r.hours.filter((h) => h.tier === 'critical').flatMap((h) => h.vehicles.filter((x) => x.action === 'discharge'))
  assert.ok(lent.length >= 5)
  for (const h of r.hours) {
    for (const x of h.vehicles) {
      if (x.action === 'discharge') assert.equal(h.tier, 'critical')
      if (x.action === 'charge' && !x.forced && x.reason !== 'Below minimum — charging') assert.equal(h.tier, 'off-peak')
    }
  }
  assert.ok(r.lentKwh > 100 && r.chargedKwh > r.lentKwh)
})

test('the backward pass forces charge into the cheapest hour before departure', () => {
  const r = simulateFleet({ chargerKw: 7.4 })
  const truck = r.hours.map((h) => h.vehicles[2])
  const forced = r.hours.filter((_, k) => truck[k].forced).map((h) => h.hour)
  assert.ok(forced.length > 0, 'a 7.4 kW charger cannot fill the truck from cheap hours alone')
  for (const h of forced) assert.ok(h < departureAt(6), 'forced charge happens before it leaves')
  assert.match(truck[forced[0] - r.start].reason, /^Needs 80% by 06:00/)
  assert.ok(r.departures[2].soc >= 0.8 - EPS)
})

test('when only peak hours are left, it stops lending before charging at the peak', () => {
  const peak = Array(24).fill(0.45)
  const keep = simulateFleet({
    price: peak,
    vehicles: [{ id: 'a', name: 'A', kind: 'car', capacityKwh: 60, soc: 0.85, minSoc: 0.25, departHour: 0 }],
  })
  const a = keep.hours.map((h) => h.vehicles[0])
  assert.ok(a.every((x) => x.action !== 'discharge'))
  assert.equal(a[0].reason, 'Grid at peak — keeping charge for the trip')
  assert.ok(keep.departures[0].soc >= 0.8 - EPS)

  const charge = simulateFleet({
    price: peak,
    vehicles: [{ id: 'b', name: 'B', kind: 'car', capacityKwh: 60, soc: 0.5, minSoc: 0.25, departHour: 22 }],
  })
  const b = charge.hours.map((h) => h.vehicles[0])
  assert.ok(b.every((x) => x.action !== 'discharge'))
  assert.equal(b[21 - charge.start].forced, true, 'the latest hour is used first')
  assert.ok(charge.departures[0].soc >= 0.8 - EPS)
})

test('an unreachable target is reported instead of looping', () => {
  const r = simulateFleet({
    chargerKw: 3.7,
    vehicles: [{ id: 't', name: 'T', kind: 'truck', capacityKwh: 120, soc: 0.3, minSoc: 0.2, departHour: 21 }],
  })
  assert.ok(r.departures[0].shortfallKwh > 0)
  assert.ok(r.hours.slice(0, 3).every((h) => h.vehicles[0].action === 'charge'))
})

test('reports energy only, never money', () => {
  const r = simulateFleet()
  const keys = new Set<string>()
  JSON.stringify(r, (k, v) => (keys.add(k), v))
  assert.doesNotMatch([...keys].join(), /sav|cost|eur|revenue/i)
  assert.doesNotMatch(r.hours.flatMap((h) => h.vehicles.map((x) => x.reason)).join(), /[€$]|ct\b|sav/i)
})

test('sampling interpolates within the hour and closes with everyone gone', () => {
  const r = simulateFleet()
  const a = sampleFleet(r, 18)
  const b = sampleFleet(r, 18.5)
  const van = r.hours[0].vehicles[0]
  assert.equal(a.clock, '18:00')
  assert.equal(b.clock, '18:30')
  assert.ok(Math.abs(b.vehicles[0].soc - (van.socStart + van.socEnd) / 2) < EPS)
  assert.equal(sampleFleet(r, 10).hour, 18, 'clamps to the window')
  const end = sampleFleet(r, 34)
  assert.equal(end.clock, '10:00')
  // The damped chapter clock creeps up to the end and must never read 09:60.
  assert.equal(sampleFleet(r, 34 - 1e-9).clock, '10:00')
  assert.equal(sampleFleet(r, 33 + 59.4 / 60).clock, '09:59')
  for (let k = 0; k <= 1600; k++) assert.match(sampleFleet(r, 18 + k / 100).clock, /^([01]\d|2[0-3]):[0-5]\d$/)
  assert.ok(end.vehicles.every((v) => v.action === 'away' && v.leave === 1))
  assert.ok(Math.abs(end.chargedKwh - r.chargedKwh) < EPS && Math.abs(end.lentKwh - r.lentKwh) < EPS)
  // Fleet Van #2 leaves at 07:00: it unplugs in the last minutes before, then it is gone.
  assert.equal(sampleFleet(r, 30.5).vehicles[1].leave, 0)
  const going = sampleFleet(r, 30.8).vehicles[1]
  assert.ok(going.leave > 0 && going.leave < 1)
  assert.equal(going.action, 'away')
  assert.equal(sampleFleet(r, 31).vehicles[1].leave, 1)
})
