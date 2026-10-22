// Dashboard.jsx - what THEO is doing and why: today's savings, the plan over the prices,
// the battery, the plan in words, every car, and the prices ahead. Savings are added up
// by the API, never here. Refreshes every 10 s (the car statuses come from App every 5 s).
import React, { useEffect, useState } from "react";
import { ago, carState, clock, emph, greeting, isPeak, planSummary, planWindows, priceStats, socProjection, upcomingSlots } from "../lib.js";
import { useLang } from "../LangContext.jsx";
import { usePolling } from "../usePolling.js";
import BatteryGauge from "../components/BatteryGauge.jsx";
import { HouseAvatar } from "../components/House.jsx";
import PlanChart from "../components/PlanChart.jsx";
import { ArrowUpRight, Bolt, Car, CheckCircle, Clock, Home, Info, Moon, Pylon, Sun, TrendUp } from "../components/Icons.jsx";

const VIEWS = [
  ["price", "dash.view.price"],
  ["power", "dash.view.power"],
  ["battery", "dash.view.battery"],
];

function chipText(state, t, num) {
  if (state.kind === "charging") return `${t("state.charging")} · ${num(state.kw, 1)} kW`;
  if (state.kind === "home") return `${t("state.home")} · ${num(state.kw, 1)} kW`;
  return t(`state.${state.kind}`);
}

function deviceText(state, status, t) {
  if (state.kind === "offline") return `${t("state.offline")} · ${ago(status && status.seconds_since_update, t)}`;
  return t(`state.${state.kind}`);
}

// A small price line for the price row (96 x 36), with helpers to place dots on it.
function sparkline(upcoming) {
  const prices = upcoming.map((s) => s.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const x = (i) => 2 + (prices.length > 1 ? (i / (prices.length - 1)) * 92 : 46);
  const y = (price) => 32 - (high > low ? ((price - low) / (high - low)) * 28 : 14);
  return { points: prices.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" "), x, y };
}

export default function Dashboard({ api, deviceId, devices, statuses }) {
  const { t, num, eur } = useLang();
  const [savings, setSavings] = useState(null);
  const [slots, setSlots] = useState([]);
  const [settings, setSettings] = useState(null);
  const [view, setView] = useState("price");
  const [error, setError] = useState("");

  useEffect(() => {
    // a different car: start clean instead of showing the last car's numbers
    setSavings(null);
    setSlots([]);
    setSettings(null);
  }, [deviceId]);

  usePolling(
    async () => {
      try {
        const [sv, sc, st] = await Promise.all([api.savings(deviceId), api.schedule(deviceId), api.settings(deviceId)]);
        setSavings(sv);
        setSlots(sc.slots);
        setSettings(st);
        setError("");
      } catch (e) {
        setError(e.message);
      }
    },
    10000,
    [deviceId]
  );

  const status = statuses[deviceId];
  const state = carState(status);
  const upcoming = upcomingSlots(slots, status && status.updated_at);
  const windows = planWindows(upcoming);
  const stats = priceStats(upcoming);
  const levels = socProjection(status && status.soc, upcoming);
  const soc = status && status.soc != null ? Math.round(status.soc * 100) : null;
  const [before, word, after] = status ? greeting(state, t) : emph(t("g.loading"));
  const spark = stats && sparkline(upcoming);

  let ready = null;
  if (settings) {
    const [lead, strong, tail] = emph(
      upcoming.length
        ? t("dash.ready", { n: Math.round(levels[upcoming.length] * 100), time: settings.departure_time })
        : t("dash.readyTarget", { n: settings.target_soc, time: settings.departure_time })
    );
    ready = <>{lead}<strong>{strong}</strong>{tail}</>;
  }

  return (
    <main className="page">
      <div className="greeting">
        <HouseAvatar
          size={56}
          zoom
          look={{ x: 6, y: 0 }}
          mood={state.kind === "home" ? "wide" : state.kind === "offline" ? "o" : "smile"}
          lights={state.kind === "home"}
          blinds={state.kind === "offline" ? [1, 1] : [0, 0]}
        />
        <div>
          <span className="eyebrow">{deviceId}{status && status.updated_at ? ` · ${t("dash.eyebrow.sim", { time: clock(status.updated_at) })}` : ""}</span>
          <h1>{before}<em>{word}</em>{after}</h1>
        </div>
      </div>

      {error && (
        <p className="note" role="alert">
          <Info size={18} />
          {error}
        </p>
      )}

      <div className="row">
        <section className="card grow stack" aria-labelledby="saved-title">
          <div className="card-head">
            <div className="saved-block">
              <h2 className="card-title" id="saved-title">{t("dash.saved")}</h2>
              <div className="money">
                <span className="big-number">{eur(savings && savings.today_eur)}</span>
                <span className="badge">
                  <ArrowUpRight size={14} />
                  {t("dash.month", { amount: eur(savings && savings.month_eur) })}
                </span>
              </div>
              <span className="label">{t("dash.beforeHardware")}</span>
            </div>
            <div className="tabs" role="tablist" aria-label={t("dash.chartView")}>
              {VIEWS.map(([id, key]) => (
                <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}>
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
          <PlanChart view={view} upcoming={upcoming} windows={windows} stats={stats} levels={levels} settings={settings} simNow={status && status.updated_at} />
        </section>

        <section className="card side stack battery-card" aria-labelledby="battery-title">
          <div className="card-head">
            <h2 className="card-title" id="battery-title">{t("dash.battery")}</h2>
            <a className="round" href="#control" aria-label={t("dash.batteryAria")}>
              <ArrowUpRight />
            </a>
          </div>
          <div className="soc">
            <span className="big-number">{soc ?? "–"}</span>
            <span className="soc-unit">%</span>
          </div>
          <span className={`chip ${state.kind}`}>
            <i />
            {chipText(state, t, num)}
          </span>
          {soc != null && settings && <BatteryGauge soc={soc} reserve={settings.reserve_soc} target={settings.target_soc} />}
          {settings && (
            <div className="gauge-legend label">
              <span><i className="key-reserve" />{t("dash.reserve", { n: settings.reserve_soc })}</span>
              <span><i className="key-usable" />{t("dash.usable", { n: Math.max(0, (soc ?? 0) - settings.reserve_soc) })}</span>
              <span><i className="key-target" />{t("dash.target", { n: settings.target_soc })}</span>
            </div>
          )}
          {ready && (
            <div className="ready">
              <CheckCircle size={20} />
              <span>{ready}</span>
            </div>
          )}
        </section>
      </div>

      <div className="row">
        <section className="card raised half stack" aria-labelledby="plan-title">
          <div className="card-head">
            <h2 className="card-title strong" id="plan-title">
              <span className="accent"><Bolt size={20} /></span>
              {t("dash.plan")}
            </h2>
            <a className="round" href="#control" aria-label={t("dash.openControl")}>
              <ArrowUpRight />
            </a>
          </div>
          <p className="plan-text">
            {planSummary(state, upcoming, windows, settings, t, num).map((part, i) => (part.strong ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>))}
          </p>
          <div className="icon-row" aria-hidden="true">
            <span className="i-sun"><Sun size={24} /></span>
            <span className="i-grid"><Pylon size={24} /></span>
            <span className="i-car"><Car size={24} /></span>
            <span className="i-home"><Home size={24} /></span>
          </div>
        </section>

        <section className="card half stack" aria-labelledby="devices-title">
          <div className="card-head">
            <h2 className="card-title strong" id="devices-title">{t("dash.devices")}</h2>
            <span className="tag">{t("dash.batteryLevel")}</span>
          </div>
          <div className="devices">
            {devices.map((id) => {
              const s = statuses[id];
              const st = carState(s);
              const level = s && s.soc != null && st.kind !== "offline" ? Math.round(s.soc * 100) : null;
              const inside = level != null && level >= 18;
              return (
                <div className="device" key={id}>
                  <div className="tank" role="img" aria-label={t("dash.tank", { id, level: level != null ? t("dash.pct", { n: level }) : t("dash.noData"), state: deviceText(st, s, t) })}>
                    {level != null && <div className={`tank-fill${st.kind === "charging" ? " charging" : ""}${st.kind === "unplugged" ? " dim" : ""}`} style={{ height: `${level}%` }} />}
                    <span className={inside ? "tank-pct inside" : "tank-pct"} style={inside ? { top: `calc(${100 - level}% + 16px)` } : { bottom: `calc(${level ?? 0}% + 10px)` }}>
                      {level != null ? t("dash.pct", { n: level }) : "–"}
                    </span>
                  </div>
                  <span className="device-name">{id}</span>
                  <span className={`label device-state ${st.kind}`}>{deviceText(st, s, t)}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {stats && (
        <section className="card ticker" aria-label={t("dash.prices")}>
          <div className="tick">
            <span className="tick-icon t-now" aria-hidden="true"><Clock size={22} /></span>
            <div>
              <span className="label">{t("dash.priceNow")}</span>
              <b className="tick-value">{num(stats.now, 1)} ct</b>
              <span className="tick-note">{nowNote(stats, t, num)}</span>
            </div>
            <Spark spark={spark} dot={0} price={stats.now} />
          </div>
          <div className="tick">
            <span className="tick-icon t-low" aria-hidden="true"><Moon size={22} /></span>
            <div>
              <span className="label">{t("dash.cheapest")}</span>
              <b className="tick-value">{num(stats.low.price, 1)} ct</b>
              <span className="tick-note">{t("dash.at", { time: stats.low.time })}</span>
            </div>
            <Spark spark={spark} dot={upcoming.findIndex((s) => s.time === stats.low.time)} price={stats.low.price} />
          </div>
          <div className="tick">
            <span className="tick-icon t-peak" aria-hidden="true"><TrendUp size={22} /></span>
            <div>
              <span className="label">{t("dash.peak")}</span>
              <b className={isPeak(stats.high.price, stats) ? "tick-value peak" : "tick-value"}>{num(stats.high.price, 1)} ct</b>
              <span className="tick-note">{t("dash.at", { time: stats.high.time })}</span>
            </div>
            <Spark spark={spark} dot={upcoming.findIndex((s) => s.time === stats.high.time)} price={stats.high.price} color="#FB7185" />
          </div>
          <div className="tick">
            <span className="tick-icon t-theo" aria-hidden="true"><Bolt size={22} /></span>
            <div>
              <span className="label">{t("dash.theoPays")}</span>
              <b className="tick-value">{stats.paid != null ? `${num(stats.paid, 1)} ct` : "–"}</b>
              <span className="tick-note">{t("dash.average", { value: num(stats.average, 1) })}</span>
            </div>
            <Spark spark={spark} line={stats.paid} />
          </div>
        </section>
      )}

      <p className="label page-foot">{t("dash.foot")}</p>
    </main>
  );
}

function nowNote(stats, t, num) {
  const diff = stats.now - stats.average;
  if (Math.abs(diff) < 0.05) return t("dash.aboutAverage");
  return t("dash.vsAverage", { sign: diff < 0 ? "−" : "+", value: num(Math.abs(diff), 1) });
}

function Spark({ spark, dot, price, color = "#F8FAFC", line }) {
  return (
    <svg className="spark" viewBox="0 0 96 36" width="96" height="36" aria-hidden="true">
      <polyline points={spark.points} fill="none" stroke="#A1A1AA" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {dot != null && dot >= 0 && (
        <>
          <circle cx={spark.x(dot)} cy={spark.y(price)} r="6" fill={color} opacity=".22" />
          <circle cx={spark.x(dot)} cy={spark.y(price)} r="3" fill={color} />
        </>
      )}
      {line != null && <line x1="2" x2="94" y1={spark.y(line)} y2={spark.y(line)} stroke="#2DD4BF" strokeWidth="1.5" strokeDasharray="3 3" />}
    </svg>
  );
}
