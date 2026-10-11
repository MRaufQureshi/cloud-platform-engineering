// Colour tokens. UI roles follow the root DESIGN.md (dark #080C16 base, teal primary,
// Manrope + JetBrains Mono); the energy roles extend it for the V2H/V2G story.
export const palette = {
  // DESIGN.md roles
  bg: '#080C16',
  surface: '#1E293B',
  border: '#27272A',
  text: '#FFFFFF',
  textDim: '#A1A1AA',
  primary: '#2DD4BF',
  accent: '#5EEAD4',
  // Energy story roles
  energy: '#2DD4BF', // electricity flowing through the car / grid
  solar: '#FBBF24', // sun, PV output
  peak: '#FB7185', // expensive peak hours, grid stress
  grid: '#818CF8', // the wider grid / V2G
  // Materials
  paint: '#EDF0F3',
  glass: '#0A0F1A',
  tire: '#15171B',
  rim: '#8E96A0',
  trim: '#1B1F26',
} as const

export type PaletteKey = keyof typeof palette
