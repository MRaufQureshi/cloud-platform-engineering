// Run with: npm test   (Node's built-in test runner, no extra packages)
import test from "node:test";
import assert from "node:assert/strict";
import { addSocSample, clock, currentAction, euro, planChartData } from "./lib.js";

test("clock cuts the time out of an ISO string", () => {
  assert.equal(clock("2026-10-26T10:25:48Z"), "10:25");
  assert.equal(clock(undefined), "");
});

test("currentAction describes charging, discharging, idle and unplugged", () => {
  const car = { online: true, plugged_in: true };
  assert.equal(currentAction({ ...car, power_kw: 7.4 }), "CHARGING @ 7.4 kW");
  assert.equal(currentAction({ ...car, power_kw: -1.25 }), "DISCHARGING @ 1.3 kW");
  assert.equal(currentAction({ ...car, power_kw: 0 }), "IDLE");
  assert.equal(currentAction({ online: true, plugged_in: false }), "Not plugged in");
  assert.equal(currentAction({ online: false }), "No signal");
  assert.equal(currentAction(undefined), "No signal");
});

test("planChartData drops past slots and signs discharging as negative", () => {
  const slots = [
    { slot_start: "2026-10-26T08:00:00Z", action: "charge", power_kw: 3, price_ct_kwh: 20 }, // past
    { slot_start: "2026-10-26T10:15:00Z", action: "charge", power_kw: 7.4, price_ct_kwh: 18 },
    { slot_start: "2026-10-26T10:30:00Z", action: "discharge", power_kw: 2, price_ct_kwh: 40 },
    { slot_start: "2026-10-26T10:45:00Z", action: "idle", power_kw: 0, price_ct_kwh: 41 },
  ];
  const data = planChartData(slots, "2026-10-26T10:25:48Z");
  assert.deepEqual(data.map((d) => d.time), ["10:15", "10:30", "10:45"]);
  assert.deepEqual(data.map((d) => d.power), [7.4, -2, 0]);
});

test("planChartData copes with no slots", () => {
  assert.deepEqual(planChartData(undefined, "2026-10-26T10:25:48Z"), []);
});

test("addSocSample appends once per simulated time and converts to percent", () => {
  const first = addSocSample([], { soc: 0.5129, updated_at: "2026-10-26T10:00:00Z" });
  assert.equal(first[0].soc, 51.3);
  const same = addSocSample(first, { soc: 0.52, updated_at: "2026-10-26T10:00:00Z" });
  assert.equal(same.length, 1);
  const next = addSocSample(first, { soc: 0.52, updated_at: "2026-10-26T10:10:00Z" });
  assert.equal(next.length, 2);
});

test("addSocSample keeps only the newest readings", () => {
  let samples = [];
  for (let i = 0; i < 5; i++) samples = addSocSample(samples, { soc: 0.5, updated_at: `2026-10-26T10:0${i}:00Z` }, 3);
  assert.equal(samples.length, 3);
  assert.equal(samples[0].time, "10:02");
});

test("euro formats money and tolerates missing values", () => {
  assert.equal(euro(43.2), "€43.20");
  assert.equal(euro(undefined), "€0.00");
});
