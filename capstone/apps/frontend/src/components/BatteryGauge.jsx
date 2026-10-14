// BatteryGauge.jsx - the battery as a half circle: grey up to the reserve (THEO never
// powers the home below it), teal from the reserve to the current level, ticks for the
// empty part, and a white mark at the target.
import React from "react";

const CX = 150;
const CY = 160;
const R = 110;

// A point on the half circle: 0 = left end, 1 = right end.
function point(fraction, radius = R) {
  const angle = Math.PI - Math.min(1, Math.max(0, fraction)) * Math.PI;
  return [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)];
}

function arc(from, to) {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export default function BatteryGauge({ soc, reserve, target }) {
  const level = soc / 100;
  const floor = reserve / 100;
  const [kx, ky] = point(level);
  const [rx, ry] = point(floor);
  const [ix, iy] = point(target / 100, 95);
  const [ox, oy] = point(target / 100, 125);
  return (
    <svg className="gauge" viewBox="0 0 300 180" role="img" aria-label={`Battery ${soc}%. Reserve ${reserve}%, target ${target}%.`}>
      <path d={arc(0, 1)} fill="none" stroke="#111A2B" strokeWidth="26" strokeLinecap="round" />
      <path d={arc(0, 1)} fill="none" stroke="#94A3B8" strokeOpacity=".3" strokeWidth="26" strokeDasharray="1.5 6" />
      <path d={arc(0, Math.min(level, floor))} fill="none" stroke="#334155" strokeWidth="26" strokeLinecap="round" />
      {level > floor && (
        <>
          <path d={arc(floor, level)} fill="none" stroke="#2DD4BF" strokeOpacity=".28" strokeWidth="40" strokeLinecap="round" />
          <path d={arc(floor, level)} fill="none" stroke="#2DD4BF" strokeWidth="26" strokeLinecap="round" />
        </>
      )}
      <path d={`M${ix.toFixed(2)} ${iy.toFixed(2)} L${ox.toFixed(2)} ${oy.toFixed(2)}`} stroke="#F8FAFC" strokeWidth="3" strokeLinecap="round" />
      <circle cx={rx} cy={ry} r="12" fill="#0B1220" stroke="#475569" strokeWidth="3" />
      <circle cx={kx} cy={ky} r="19" fill="#2DD4BF" opacity=".25" />
      <circle cx={kx} cy={ky} r="11" fill="#F8FAFC" />
    </svg>
  );
}
