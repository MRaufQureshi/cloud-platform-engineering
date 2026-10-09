// lib.js - the app's small pure functions. No React, no network, so they can be tested.

const SLOT_MS = 15 * 60 * 1000;

// "2026-10-26T10:25:48Z" -> "10:25"
export function clock(iso) {
  return iso ? iso.slice(11, 16) : "";
}

// What the car is doing right now, from the status the API returns.
// power_kw > 0 charging, < 0 discharging, 0 idle. Unplugged = nothing to do.
export function currentAction(status) {
  if (!status || !status.online) return "No signal";
  if (!status.plugged_in) return "Not plugged in";
  const kw = Number(status.power_kw || 0);
  if (kw > 0.05) return `CHARGING @ ${kw.toFixed(1)} kW`;
  if (kw < -0.05) return `DISCHARGING @ ${Math.abs(kw).toFixed(1)} kW`;
  return "IDLE";
}

// The plan the chart shows: only slots from the simulated "now" onwards (the API
// also returns slots already in the past). Charging is drawn upwards, discharging
// downwards, so one bar series shows both.
export function planChartData(slots, simNowIso) {
  const nowSlot = simNowIso ? new Date(simNowIso).getTime() - SLOT_MS : 0;
  return (slots || [])
    .filter((s) => new Date(s.slot_start).getTime() >= nowSlot)
    .map((s) => ({
      time: clock(s.slot_start),
      price: Number(s.price_ct_kwh),
      power: s.action === "charge" ? Number(s.power_kw) : s.action === "discharge" ? -Number(s.power_kw) : 0,
    }));
}

// Keeps the last `max` battery readings (simulated time + SoC %) for the SoC line.
// Readings with the same simulated time are not repeated.
export function addSocSample(samples, status, max = 120) {
  if (!status || status.soc == null || !status.updated_at) return samples;
  const last = samples[samples.length - 1];
  if (last && last.at === status.updated_at) return samples;
  return [...samples, { at: status.updated_at, time: clock(status.updated_at), soc: Math.round(Number(status.soc) * 1000) / 10 }].slice(-max);
}

export function euro(value) {
  return `€${Number(value || 0).toFixed(2)}`;
}
