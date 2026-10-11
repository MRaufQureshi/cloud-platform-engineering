// PlanChart.jsx - the plan drawn over the prices, in three views:
//   price    price per 15-minute slot (rose in the expensive hours) + the charge and car -> home windows
//   power    planned kW per slot: up = charging, down = the car powering the home
//   battery  the battery level if the car follows the plan, with the reserve and the target
// Lines are SVG stretched to the card width; labels and markers are HTML on top, placed in %.
import React from "react";
import { clock, isPeak } from "../lib.js";

const W = 1000;
const H = 240;
const yOf = (fraction) => 220 - fraction * 190; // 0..1 -> drawing units, 0 at the bottom
const pct = (value, total) => `${((value / total) * 100).toFixed(2)}%`;

// Hour labels every 1-4 hours, depending on how long the plan is.
function hourTicks(upcoming) {
  const hours = upcoming.length / 4;
  const step = hours <= 6 ? 1 : hours <= 12 ? 2 : hours <= 18 ? 3 : 4;
  return upcoming
    .map((s, i) => ({ i, time: s.time }))
    .filter((t) => t.time.endsWith(":00") && Number(t.time.slice(0, 2)) % step === 0 && t.i / upcoming.length < 0.95);
}

export default function PlanChart({ view, upcoming, windows, stats, levels, settings, simNow }) {
  const n = upcoming.length;
  if (n === 0) return <div className="empty">No plan right now. THEO makes one as soon as the car is plugged in.</div>;

  const x = (i) => (i / n) * W;
  const left = (i) => pct(i, n);
  const ticks = hourTicks(upcoming);
  const departure = settings ? settings.departure_time : "";

  let yLabels;
  let body;
  let label;

  if (view === "power") {
    const maxKw = Math.round(Math.max(11, ...upcoming.map((s) => Math.abs(s.kw))));
    yLabels = [{ t: `+${maxKw} kW`, top: "6%" }, { t: "0", top: "50%" }, { t: `−${maxKw} kW`, top: "94%" }];
    label = "Planned power per 15 minutes. Up is charging, down is the car powering the home.";
    body = (
      <div className="bars">
        {upcoming.map((s) => (
          <div key={s.start}>
            <div className="bar-up" style={{ height: s.kw > 0 ? pct(s.kw * 0.44, maxKw) : 0 }} />
            <div className="bar-down" style={{ height: s.kw < 0 ? pct(-s.kw * 0.44, maxKw) : 0 }} />
          </div>
        ))}
      </div>
    );
  } else if (view === "battery") {
    const line = levels.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)} ${yOf(v).toFixed(1)}`).join(" ");
    const area = levels.map((v, k) => `${left(k)} ${pct(yOf(v), H)}`);
    yLabels = [{ t: "100%", top: pct(yOf(1), H) }, { t: "50%", top: pct(yOf(0.5), H) }, { t: "0", top: pct(yOf(0), H) }];
    label = `Battery from ${Math.round(levels[0] * 100)}% now to ${Math.round(levels[n] * 100)}% at ${departure}.`;
    body = (
      <>
        <div className="hatch soc" style={{ clipPath: `polygon(${area.join(", ")}, 100% 100%, 0% 100%)` }} />
        <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={line} fill="none" stroke="#2DD4BF" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {settings && (
          <>
            <div className="level-line" style={{ top: pct(yOf(settings.reserve_soc / 100), H) }} />
            <span className="level-label" style={{ top: pct(yOf(settings.reserve_soc / 100), H) }}>RESERVE {settings.reserve_soc}%</span>
            <div className="level-line target" style={{ top: pct(yOf(settings.target_soc / 100), H) }} />
            <span className="level-label target" style={{ top: pct(yOf(settings.target_soc / 100), H) }}>TARGET {settings.target_soc}%</span>
          </>
        )}
      </>
    );
  } else {
    const yMax = Math.max(4, Math.ceil(stats.high.price / 2) * 2);
    const yP = (price) => yOf(Math.max(0, price) / yMax);
    let path = `M0 ${yP(upcoming[0].price).toFixed(1)}`;
    let peak = "";
    const area = [];
    upcoming.forEach((s, i) => {
      path += ` H${x(i + 1).toFixed(1)}`;
      if (i < n - 1) path += ` V${yP(upcoming[i + 1].price).toFixed(1)}`;
      const top = pct(yP(s.price), H);
      area.push(`${left(i)} ${top}`, `${left(i + 1)} ${top}`);
      if (isPeak(s.price, stats)) {
        const y = yP(s.price).toFixed(1);
        const fresh = i === 0 || !isPeak(upcoming[i - 1].price, stats);
        peak += (fresh ? ` M${x(i).toFixed(1)} ${y}` : ` V${y}`) + ` H${x(i + 1).toFixed(1)}`;
      }
    });
    yLabels = [{ t: `${yMax} ct`, top: pct(yP(yMax), H) }, { t: `${yMax / 2} ct`, top: pct(yP(yMax / 2), H) }, { t: "0", top: pct(yP(0), H) }];
    label = `Price per 15 minutes from ${upcoming[0].time} until ${departure}, with ${windows.length} planned windows.`;

    // One window gets the highlight and the label card: the first car -> home window, else the first charge.
    const featured = windows.find((w) => w.action === "discharge") || windows[0];
    let highlight = null;
    if (featured) {
      const first = upcoming[featured.start];
      const last = upcoming[featured.end - 1];
      const tipLeft = featured.end / n <= 0.62 ? `calc(${left(featured.end)} + 18px)` : `max(0px, calc(${left(featured.start)} - 228px))`;
      highlight = (
        <>
          <div className={`edge ${featured.action}`} style={{ left: left(featured.start) }} />
          <div className={`edge ${featured.action}`} style={{ left: left(featured.end) }} />
          <div className="knot" style={{ left: left(featured.start), top: pct(yP(first.price), H) }} />
          <div className="knot" style={{ left: left(featured.end), top: pct(yP(last.price), H) }} />
          <div className="tip" style={{ left: tipLeft }}>
            <div className="tip-row"><span>{featured.from}</span><b>{first.price.toFixed(1)} ct</b></div>
            <div className={`tip-pill ${featured.action}`}>
              {featured.action === "charge" ? "Charging" : "Car → home"} · {featured.kwh.toFixed(1)} kWh
            </div>
            <div className="tip-row"><span>{featured.to}</span><b>{last.price.toFixed(1)} ct</b></div>
          </div>
        </>
      );
    }

    body = (
      <>
        {windows.map((w) => (
          <div key={w.start} className={`band ${w.action}`} style={{ left: left(w.start), width: pct(w.end - w.start, n) }} />
        ))}
        <div className="hatch" style={{ clipPath: `polygon(${area.join(", ")}, 100% 100%, 0% 100%)` }} />
        <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={path} fill="none" stroke="#F8FAFC" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {peak && <path d={peak} fill="none" stroke="#FB7185" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        </svg>
        {windows
          .filter((w) => (w.end - w.start) / n >= 0.04)
          .map((w) => (
            <span key={`label-${w.start}`} className={`band-label ${w.action}`} style={{ left: pct(w.start + (w.end - w.start) / 2, n) }}>
              {w.action === "charge" ? "CHARGE" : "CAR → HOME"}
            </span>
          ))}
        {highlight}
      </>
    );
  }

  return (
    <div className="chart">
      <div className="chart-body">
        <div className="chart-y" aria-hidden="true">
          {yLabels.map((l) => (
            <span key={l.t} style={{ top: l.top }}>{l.t}</span>
          ))}
        </div>
        <div className="chart-area" role="img" aria-label={label}>
          {ticks.map((t) => (
            <div key={t.i} className="vline" style={{ left: left(t.i) }} />
          ))}
          {yLabels.map((l) => (
            <div key={l.t} className="gridline" style={{ top: l.top }} />
          ))}
          {body}
          <div className="marker" style={{ left: 0 }} />
          <span className="mark-label" style={{ left: 8 }}>NOW {clock(simNow)}</span>
          <div className="marker end" style={{ right: 0 }} />
          {departure && <span className="mark-label" style={{ right: 8 }}>LEAVES {departure}</span>}
        </div>
      </div>
      <div className="chart-x" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t.i} style={{ left: left(t.i) }}>{t.time}</span>
        ))}
      </div>
      <Legend view={view} />
    </div>
  );
}

function Legend({ view }) {
  let items = [
    ["swatch", "#818CF8", "Charge from grid"],
    ["swatch", "#2DD4BF", "Car → home"],
    ["line-swatch", "#F8FAFC", "Price, ct/kWh"],
    ["line-swatch", "#FB7185", "Expensive hours"],
  ];
  if (view === "power") items = [["swatch", "#818CF8", "Charging"], ["swatch", "#2DD4BF", "Car → home"]];
  if (view === "battery") items = [["line-swatch", "#2DD4BF", "Battery if the plan runs"], ["line-swatch", "#64748B", "Reserve and target"]];
  return (
    <div className="legend label">
      {items.map(([kind, color, text]) => (
        <span key={text}>
          <i className={kind} style={{ background: color }} />
          {text}
        </span>
      ))}
    </div>
  );
}
