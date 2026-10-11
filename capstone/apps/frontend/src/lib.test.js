// Run with: npm test   (Node's built-in test runner, no extra packages)
import test from "node:test";
import assert from "node:assert/strict";
import { carState, clock, euro, planWindows, priceStats, socProjection, upcomingSlots } from "./lib.js";

const SLOTS = [
  { slot_start: "2026-10-26T08:00:00Z", action: "charge", power_kw: 3, price_ct_kwh: 20 }, // past
  { slot_start: "2026-10-26T10:15:00Z", action: "charge", power_kw: 11, price_ct_kwh: 4 },
  { slot_start: "2026-10-26T10:30:00Z", action: "charge", power_kw: 11, price_ct_kwh: 6 },
  { slot_start: "2026-10-26T10:45:00Z", action: "idle", power_kw: 0, price_ct_kwh: 8 },
  { slot_start: "2026-10-26T11:00:00Z", action: "discharge", power_kw: 2, price_ct_kwh: 12 },
];
const NOW = "2026-10-26T10:25:48Z";

test("clock cuts the time out of an ISO string", () => {
  assert.equal(clock("2026-10-26T10:25:48Z"), "10:25");
  assert.equal(clock(undefined), "");
});

test("carState tells charging, powering the home, idle, unplugged and offline apart", () => {
  const car = { online: true, plugged_in: true };
  assert.deepEqual(carState({ ...car, power_kw: 7.4 }), { kind: "charging", kw: 7.4 });
  assert.deepEqual(carState({ ...car, power_kw: -1.5 }), { kind: "home", kw: 1.5 });
  assert.equal(carState({ ...car, power_kw: 0 }).kind, "idle");
  assert.equal(carState({ online: true, plugged_in: false }).kind, "unplugged");
  assert.equal(carState(undefined).kind, "offline");
});

test("upcomingSlots drops past slots and signs the car powering the home as negative", () => {
  const upcoming = upcomingSlots(SLOTS, NOW);
  assert.deepEqual(upcoming.map((s) => s.time), ["10:15", "10:30", "10:45", "11:00"]);
  assert.deepEqual(upcoming.map((s) => s.kw), [11, 11, 0, -2]);
  assert.deepEqual(upcomingSlots(undefined, NOW), []);
});

test("planWindows joins back-to-back slots and adds up the energy", () => {
  const windows = planWindows(upcomingSlots(SLOTS, NOW));
  assert.equal(windows.length, 2);
  assert.deepEqual([windows[0].action, windows[0].from, windows[0].to, windows[0].kwh], ["charge", "10:15", "10:45", 5.5]);
  assert.deepEqual([windows[1].action, windows[1].from, windows[1].to, windows[1].kwh], ["discharge", "11:00", "11:15", 0.5]);
});

test("priceStats finds the cheapest and the dearest slot and what THEO pays", () => {
  const stats = priceStats(upcomingSlots(SLOTS, NOW));
  assert.deepEqual(stats.low, { price: 4, time: "10:15" });
  assert.deepEqual(stats.high, { price: 12, time: "11:00" });
  assert.equal(stats.paid, 5);
  assert.equal(priceStats([]), null);
});

test("socProjection loses 10% each way, like the optimizer", () => {
  const charge = [{ kw: 12 }]; // 3 kWh in, 2.7 kWh stored
  assert.ok(Math.abs(socProjection(0.5, charge)[1] - (30 + 2.7) / 60) < 1e-9);
  const home = [{ kw: -1.8 }]; // 0.45 kWh to the home, 0.5 kWh out of the battery
  assert.ok(Math.abs(socProjection(0.5, home)[1] - 29.5 / 60) < 1e-9);
});

test("euro formats money and tolerates missing values", () => {
  assert.equal(euro(43.2), "€43.20");
  assert.equal(euro(undefined), "€0.00");
});
