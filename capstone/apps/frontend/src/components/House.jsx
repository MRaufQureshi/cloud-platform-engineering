// House.jsx - Hearth, the house mascot, and the Control page's scene (the house, a car
// and the cable between them). Plain SVG in a 200 x 200 grid; styles.css animates
// every change (eyes, blinds, energy, lights).
import React from "react";

const show = (on) => ({ opacity: on ? 1 : 0 });

// The house itself. The walls run down to `ground`.
//   look    where the pupils point, in grid units ({ x: -8..8, y: -5..5 })
//   blinds  [left, right], 0 = open, 1 = closed
//   energy  0 = no energy inside the walls, 1 = full (leave it out: no energy drawn at all)
//   mood    smile | open | wide | o | wavy
export function HouseDrawing({ look = { x: -2, y: 3 }, blinds = [0, 0], energy = null, mood = "smile", lights = false, happy = false, ground = 230 }) {
  return (
    <g>
      <rect x="128" y="46" width="16" height="34" rx="2" className="h-wall" />
      <rect x="46" y="94" width="108" height={ground - 94} rx="6" className="h-wall" />
      {energy != null && (
        <g className="h-fill" style={{ transform: `translateY(${206 - 114 * energy}px)` }}>
          <path d="M48 6 Q56.67 0 65.33 6 T82.67 6 T100 6 T117.33 6 T134.67 6 T152 6 V140 H48 Z" fill="#2DD4BF" opacity=".9" />
          <path d="M48 6 Q56.67 0 65.33 6 T82.67 6 T100 6 T117.33 6 T134.67 6 T152 6" fill="none" stroke="#99F6E4" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}
      <rect x="87" y="164" width="26" height={ground - 164} rx="5" className="h-door" />
      <circle cx="108" cy="184" r="2" fill="#2DD4BF" />

      <rect x="58" y="102" width="34" height="28" rx="5" fill="#F8FAFC" />
      <rect x="108" y="102" width="34" height="28" rx="5" fill="#F8FAFC" />
      <g className="h-fade" style={show(lights)}>
        <rect x="50" y="94" width="50" height="44" rx="12" fill="#2DD4BF" opacity=".2" />
        <rect x="100" y="94" width="50" height="44" rx="12" fill="#2DD4BF" opacity=".2" />
        <rect x="58" y="102" width="34" height="28" rx="5" fill="#99F6E4" />
        <rect x="108" y="102" width="34" height="28" rx="5" fill="#99F6E4" />
      </g>
      <g className="h-fade" style={show(!happy)}>
        <g className="h-pupils" style={{ transform: `translate(${look.x}px, ${look.y}px)` }}>
          <circle cx="75" cy="116" r="6.5" fill="#080C16" />
          <circle cx="125" cy="116" r="6.5" fill="#080C16" />
          <circle cx="77.5" cy="113.5" r="2" fill="#FFFFFF" />
          <circle cx="127.5" cy="113.5" r="2" fill="#FFFFFF" />
        </g>
      </g>
      <g className="h-fade" style={show(happy)} fill="none" stroke="#080C16" strokeWidth="4" strokeLinecap="round">
        <path d="M65 120 Q75 109 85 120" />
        <path d="M115 120 Q125 109 135 120" />
      </g>
      <Blind x={58} closed={blinds[0]} />
      <Blind x={108} closed={blinds[1]} />
      <rect x="58" y="102" width="34" height="28" rx="5" className="h-frame" />
      <rect x="108" y="102" width="34" height="28" rx="5" className="h-frame" />
      <rect x="54" y="131" width="42" height="4" rx="2" fill="#475569" />
      <rect x="104" y="131" width="42" height="4" rx="2" fill="#475569" />

      <ellipse cx="62" cy="146" rx="7" ry="4" fill="#5EEAD4" opacity=".3" />
      <ellipse cx="138" cy="146" rx="7" ry="4" fill="#5EEAD4" opacity=".3" />
      <Mouth mood={mood} />

      <path d="M30 98 L100 36 L170 98" className="h-roof" />
      <g transform="rotate(-41.5 76 67)">
        <rect x="59" y="61.5" width="34" height="11" rx="1.5" fill="#0B1220" stroke="#64748B" strokeWidth="1.5" />
        <path d="M59 67 H93 M70.3 61.5 V72.5 M81.7 61.5 V72.5" stroke="#334155" strokeWidth="1.2" />
        <path d="M61 63.8 H76" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" />
      </g>
      <rect x="134" y="154" width="16" height="19" rx="4" className="h-wallbox" />
      <circle cx="142" cy="161" r="2.2" fill="#2DD4BF" />
    </g>
  );
}

// A roller blind that unrolls from the top of the window.
function Blind({ x, closed }) {
  return (
    <g className="h-blind" style={{ transform: `scaleY(${closed})`, transformOrigin: `${x + 17}px 102px` }}>
      <rect x={x} y="102" width="34" height="28" rx="5" fill="#475569" />
      <path d={`M${x} 108 H${x + 34} M${x} 114 H${x + 34} M${x} 120 H${x + 34}`} stroke="#334155" strokeWidth="1.5" />
      <rect x={x} y="125" width="34" height="5" rx="2" fill="#64748B" />
    </g>
  );
}

function Mouth({ mood }) {
  return (
    <>
      <g className="h-fade" style={show(mood === "smile")} fill="none" strokeLinecap="round">
        <path d="M88 144 Q100 152 112 144" stroke="#080C16" strokeWidth="7" />
        <path d="M88 144 Q100 152 112 144" stroke="#F8FAFC" strokeWidth="3.5" />
      </g>
      <g className="h-fade" style={show(mood === "open")}>
        <path d="M89 141 H111 Q111 155 100 155 Q89 155 89 141 Z" fill="#080C16" stroke="#F8FAFC" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M94 151 Q100 146 106 151 Q100 154 94 151 Z" fill="#5EEAD4" />
      </g>
      <g className="h-fade" style={show(mood === "wide")}>
        <path d="M85 140 H115 Q114 159 100 159 Q86 159 85 140 Z" fill="#080C16" stroke="#F8FAFC" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M92 154 Q100 148 108 154 Q100 158 92 154 Z" fill="#5EEAD4" />
      </g>
      <ellipse className="h-fade" style={show(mood === "o")} cx="100" cy="147" rx="5" ry="6" fill="#080C16" stroke="#F8FAFC" strokeWidth="2.5" />
      <g className="h-fade" style={show(mood === "wavy")} fill="none" strokeLinecap="round">
        <path d="M88 147 Q94 142 100 147 Q106 152 112 147" stroke="#080C16" strokeWidth="7" />
        <path d="M88 147 Q94 142 100 147 Q106 152 112 147" stroke="#F8FAFC" strokeWidth="3.5" />
      </g>
    </>
  );
}

// The round avatar (login card, dashboard greeting). With `cable`, the wallbox
// cable leaves the picture and energy dots flow in along it while `flow` is on.
export function HouseAvatar({ size = 176, zoom = false, cable = false, flow = "off", glow = false, avatarRef, ...house }) {
  return (
    <div className="avatar" ref={avatarRef} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox={zoom ? "22 30 156 156" : "0 0 200 200"} width={size} height={size}>
        <ellipse cx="100" cy="130" rx="86" ry="70" fill="#2DD4BF" className="h-fade" style={{ opacity: glow ? 0.22 : 0.06 }} />
        <HouseDrawing {...house} />
        {cable && (
          <>
            <path d="M142 173 C142 193 162 197 184 209" fill="none" stroke="#334155" strokeWidth="6" strokeLinecap="round" />
            <path
              d="M142 173 C142 193 162 197 184 209"
              className={`h-fade flow-in${flow === "fast" ? " fast" : ""}`}
              style={show(flow !== "off")}
              fill="none"
              stroke="#5EEAD4"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="2 9"
            />
          </>
        )}
      </svg>
    </div>
  );
}

// Control page: the house on the left, the car on the right, the cable between.
//   flow  off | home (teal dots, car -> house) | car (indigo dots, grid -> car)
export function Scene({ plugged, flow, kwLabel, lights, mood, look }) {
  const cable = "M81.4 126.3 C84 150 180 152 196 120";
  const color = flow === "home" ? "#5EEAD4" : "#A5B4FC";
  return (
    <div className="scene" aria-hidden="true">
      <svg viewBox="0 0 320 160">
        <ellipse cx="56" cy="100" rx="72" ry="56" fill="#2DD4BF" className="h-fade" style={{ opacity: lights ? 0.2 : 0.05 }} />
        <rect x="0" y="143.5" width="320" height="17" fill="#0B1220" opacity=".7" />
        <path d="M0 143.5 H320" stroke="#94A3B8" strokeOpacity=".25" strokeWidth="1.2" />

        <g transform="translate(-6.6 19) scale(.62)">
          <HouseDrawing look={look} mood={mood} lights={lights} ground={200} />
        </g>

        <ellipse cx="236" cy="144" rx="62" ry="3" fill="#000000" opacity=".35" />
        <path
          d="M180 134 Q177 134 177 130 V124 Q177 119 183 117 L213 112 L231 97 Q234 94 238 94 H268 Q274 94 278 98 L291 110 Q295 113 295 119 V130 Q295 134 291 134 Z"
          fill="#1E293B"
          stroke="#5EEAD4"
          strokeOpacity=".55"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M219 111 L233 99 H251 V111 Z" fill="#0B1220" />
        <path d="M255 99 H267 Q271 99 274 102 L283 111 H255 Z" fill="#0B1220" />
        <path d="M226 108 L234 101" stroke="#5EEAD4" strokeOpacity=".25" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M253 99 V132" stroke="#334155" strokeWidth="1.2" />
        <rect x="178" y="119.5" width="7" height="4" rx="2" fill="#F8FAFC" opacity=".85" />
        <rect x="290" y="115" width="4" height="6" rx="1.5" fill="#475569" />
        <rect x="196" y="115.5" width="7" height="5" rx="1.5" fill="#0B1220" stroke="#5EEAD4" strokeOpacity=".6" strokeWidth="1" />
        <circle cx="199.5" cy="118" r="1.3" fill="#2DD4BF" className="h-fade" style={{ opacity: plugged ? 1 : 0.25 }} />
        <circle cx="199" cy="134" r="10" fill="#0B1220" stroke="#475569" strokeWidth="2" />
        <circle cx="199" cy="134" r="4" fill="#334155" />
        <circle cx="274" cy="134" r="10" fill="#0B1220" stroke="#475569" strokeWidth="2" />
        <circle cx="274" cy="134" r="4" fill="#334155" />

        <path d={cable} className="h-fade" style={show(plugged)} fill="none" stroke="#334155" strokeWidth="3.2" strokeLinecap="round" />
        <path
          d={cable}
          className={`h-fade ${flow === "home" ? "flow-in" : "flow-out"}`}
          style={show(plugged && flow !== "off")}
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="2 9"
        />
        <rect x="191" y="115.5" width="6" height="5.5" rx="1.5" fill="#CBD5E1" className="h-fade" style={show(plugged)} />
        <g className="h-fade" style={show(!plugged)}>
          <path d="M81.4 126.3 C82 140 90 143 104 142.6" fill="none" stroke="#334155" strokeWidth="3.2" strokeLinecap="round" />
          <rect x="104" y="139.6" width="9" height="4.4" rx="1.5" fill="#CBD5E1" />
          <path d="M113 140.8 H116 M113 142.8 H116" stroke="#94A3B8" strokeWidth="1" />
        </g>
        <text x="138" y="136" textAnchor="middle" fill={color} className="h-fade scene-kw" style={show(plugged && flow !== "off")}>
          {kwLabel}
        </text>
      </svg>
    </div>
  );
}
