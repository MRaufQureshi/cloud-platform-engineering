// Icons.jsx - the few line icons the app uses (24 x 24, drawn with the text colour).
import React from "react";

function Icon({ size = 18, children, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const ArrowRight = (p) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const ArrowUpRight = (p) => <Icon {...p}><path d="M7 17L17 7M9 7h8v8" /></Icon>;
export const Chevron = (p) => <Icon {...p}><path d="M6 9l6 6 6-6" /></Icon>;
export const Check = (p) => <Icon {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const CheckCircle = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></Icon>;
export const Info = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Icon>;
export const LogOut = (p) => <Icon {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></Icon>;
export const Eye = (p) => <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>;
export const EyeOff = (p) => (
  <Icon {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1.1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Icon>
);
export const Clock = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
export const Moon = (p) => <Icon {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Icon>;
export const TrendUp = (p) => <Icon {...p}><path d="M4 17l5-5 4 4 7-8M15 8h5v5" /></Icon>;
export const Sun = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);
export const Pylon = (p) => <Icon {...p}><path d="M12 2L7 22M12 2l5 20M5 7h14M9.6 11h4.8M8.5 15h7M7.5 19h9" /></Icon>;
export const Car = (p) => <Icon {...p}><path d="M3 13l2-5a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 8l2 5v5h-3v-2H6v2H3z" /><path d="M7 13h.01M17 13h.01" /></Icon>;
export const Home = (p) => <Icon {...p}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></Icon>;
export const Bolt = ({ size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6.2z" />
  </svg>
);
