// lib.js - the app's small pure functions. No React, no network, so they can be tested.
// The functions that write sentences take t() (and num()) as the last arguments, so the
// same code serves both languages. Without them they default to English.
import { makeFormat, makeT } from "./i18n.js";

const tEn = makeT("en");
const { num: numEn, eur: eurEn } = makeFormat("en");

const SLOT_MS = 15 * 60 * 1000;
// Same numbers as apps/optimizer/solve.py, used to draw the battery projection.
const BATTERY_KWH = 60;
const EFFICIENCY = 0.9;

// "2026-10-26T10:25:48Z" -> "10:25"
export function clock(iso) {
  return iso ? iso.slice(11, 16) : "";
}

// Milliseconds -> "10:25" (simulated time is UTC, like the ISO strings)
function hhmm(ms) {
  return new Date(ms).toISOString().slice(11, 16);
}

export function euro(value) {
  return eurEn(value);
}

// What the car is doing right now, from the status the API returns.
// power_kw > 0 charging, < 0 powering the home, 0 idle.
export function carState(status) {
  if (!status || !status.online) return { kind: "offline", kw: 0 };
  if (!status.plugged_in) return { kind: "unplugged", kw: 0 };
  const kw = Number(status.power_kw || 0);
  if (kw > 0.05) return { kind: "charging", kw };
  if (kw < -0.05) return { kind: "home", kw: -kw };
  return { kind: "idle", kw: 0 };
}

// The plan from the simulated "now" onwards (the API also returns slots already in
// the past). kw is signed: + charging, - the car powering the home.
export function upcomingSlots(slots, simNowIso) {
  const from = simNowIso ? new Date(simNowIso).getTime() - SLOT_MS : 0;
  return (slots || [])
    .map((s) => ({
      start: new Date(s.slot_start).getTime(),
      time: clock(s.slot_start),
      action: s.action,
      price: Number(s.price_ct_kwh),
      kw: s.action === "charge" ? Number(s.power_kw) : s.action === "discharge" ? -Number(s.power_kw) : 0,
    }))
    .filter((s) => s.start > from)
    .sort((a, b) => a.start - b.start);
}

// Back-to-back slots with the same action, joined into windows:
// [{ action: "charge", start: 0, end: 4, from: "14:00", to: "15:00", kwh: 11 }]
export function planWindows(upcoming) {
  const windows = [];
  upcoming.forEach((s, i) => {
    if (s.action !== "charge" && s.action !== "discharge") return;
    const last = windows[windows.length - 1];
    if (last && last.action === s.action && last.end === i) {
      last.end = i + 1;
      last.kwh += Math.abs(s.kw) / 4;
    } else {
      windows.push({ action: s.action, start: i, end: i + 1, kwh: Math.abs(s.kw) / 4 });
    }
  });
  return windows.map((w) => ({ ...w, from: upcoming[w.start].time, to: hhmm(upcoming[w.end - 1].start + SLOT_MS) }));
}

// Prices for the price row. `paid` is the average price of the energy THEO buys for the car.
export function priceStats(upcoming) {
  if (upcoming.length === 0) return null;
  let low = upcoming[0];
  let high = upcoming[0];
  let sum = 0;
  let boughtKwh = 0;
  let boughtCost = 0;
  for (const s of upcoming) {
    if (s.price < low.price) low = s;
    if (s.price > high.price) high = s;
    sum += s.price;
    if (s.kw > 0) {
      boughtKwh += s.kw / 4;
      boughtCost += (s.kw / 4) * s.price;
    }
  }
  return {
    now: upcoming[0].price,
    low: { price: low.price, time: low.time },
    high: { price: high.price, time: high.time },
    average: sum / upcoming.length,
    paid: boughtKwh > 0 ? boughtCost / boughtKwh : null,
  };
}

// Prices turn rose only in the expensive part of the day (top quarter of the range).
export function isPeak(price, stats) {
  const range = stats.high.price - stats.low.price;
  return range >= 1 && price >= stats.low.price + 0.75 * range;
}

// Battery level (0..1) at the start and after every slot, if the car follows the plan.
export function socProjection(soc, upcoming) {
  let kwh = Number(soc || 0) * BATTERY_KWH;
  const levels = [kwh / BATTERY_KWH];
  for (const s of upcoming) {
    kwh += s.kw > 0 ? (s.kw / 4) * EFFICIENCY : s.kw / 4 / EFFICIENCY;
    levels.push(Math.min(1, Math.max(0, kwh / BATTERY_KWH)));
  }
  return levels;
}

// "4 s ago", "3 min ago"
export function ago(seconds, t = tEn) {
  if (seconds == null) return t("ago.none");
  return seconds < 90 ? t("ago.s", { n: seconds }) : t("ago.min", { n: Math.round(seconds / 60) });
}

// "Charging now, while power is *cheap*." -> ["Charging now, while power is ", "cheap", "."]
export function emph(text) {
  const [before, word = "", after = ""] = text.split("*");
  return [before, word, after];
}

// "Next *charging 14:00–15:00*." -> [{ text: "Next " }, { text: "charging 14:00–15:00", strong: true }, { text: "." }]
export function parts(text) {
  return text
    .split("*")
    .map((piece, i) => ({ text: piece, strong: i % 2 === 1 }))
    .filter((p) => p.text !== "")
    .map((p) => (p.strong ? p : { text: p.text }));
}

// The headline on the dashboard: [plain text, highlighted word, end]
export function greeting(state, t = tEn) {
  const keys = { charging: "g.charging", home: "g.home", idle: "g.idle", unplugged: "g.unplugged" };
  return emph(t(keys[state.kind] || "g.offline"));
}

// The plan in words, as [{ text, strong }] parts for the "THEO's plan" card.
export function planSummary(state, upcoming, windows, settings, t = tEn, num = numEn) {
  if (state.kind === "offline") return [{ text: t("plan.offline") }];
  if (state.kind === "unplugged" || upcoming.length === 0) return parts(t("plan.none"));

  const price = `${num(upcoming[0].price, 1)} ct`;
  const key = { charging: "plan.charging", home: "plan.home" }[state.kind] || "plan.wait";
  const result = parts(t(key, { price }));

  const next = windows.filter((w) => w.start > 0).slice(0, 2);
  next.forEach((w, i) => {
    result.push({ text: i === 0 ? t("plan.next") : t("plan.then") });
    result.push(...parts(t(w.action === "charge" ? "plan.win.charge" : "plan.win.discharge", { from: w.from, to: w.to })));
    result.push({ text: i === next.length - 1 ? ". " : ", " });
  });
  if (settings) result.push(...parts(t("plan.target", { n: settings.target_soc, time: settings.departure_time })));
  return result;
}
