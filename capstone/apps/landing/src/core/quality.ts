// Device capability tiers: decides pixel ratio, shadows, bloom and instance counts.
// `?q=low|medium|high` overrides detection for testing.

import { hasMotionOptIn } from './motionPref.ts'

export type Tier = 'low' | 'medium' | 'high'

export interface Quality {
  tier: Tier
  /** Maximum device pixel ratio used by the renderer. */
  dpr: number
  /** Ceiling on rendered pixels (width × height × ratio²); keeps fill-rate bounded on big screens. */
  maxPixels: number
  shadows: boolean
  shadowMapSize: number
  bloom: boolean
  msaa: number
  /** Multiplier for particle and instance counts (0–1). */
  density: number
  mobile: boolean
  /** The page runs in its still layout: the device asks for less motion and the visitor has not opted in, or `?reduced`. */
  reducedMotion: boolean
  /** The device itself asks for reduced motion (the media query), whatever the visitor chose. */
  osReducedMotion: boolean
  /** `?reduced`: a hard reduced mode for QA that ignores the visitor's opt-in. */
  motionForced: boolean
  webgl: boolean
}

function hasWebGL2(): { ok: boolean; software: boolean } {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) return { ok: false, software: false }
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return { ok: true, software: /swiftshader|llvmpipe|software/i.test(renderer) }
  } catch {
    return { ok: false, software: false }
  }
}

export function detectQuality(): Quality {
  const params = new URLSearchParams(location.search)
  const coarse = matchMedia('(pointer: coarse)').matches
  const mobile = coarse || Math.min(innerWidth, innerHeight) < 600
  // The device setting is honoured unless the visitor opted in to full motion (core/motionPref.ts).
  const osReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const motionForced = params.has('reduced')
  const reducedMotion = motionForced || (osReducedMotion && !hasMotionOptIn())
  const gl = hasWebGL2()
  const cores = navigator.hardwareConcurrency || 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8

  let tier: Tier = 'high'
  if (mobile || cores <= 4 || memory <= 4) tier = 'medium'
  if (gl.software || (mobile && (cores <= 4 || memory <= 3))) tier = 'low'
  const forced = params.get('q')
  if (forced === 'low' || forced === 'medium' || forced === 'high') tier = forced

  const presets: Record<Tier, Omit<Quality, 'tier' | 'mobile' | 'reducedMotion' | 'osReducedMotion' | 'motionForced' | 'webgl'>> = {
    high: { dpr: 1.5, maxPixels: 2_900_000, shadows: true, shadowMapSize: 2048, bloom: true, msaa: 2, density: 1 },
    medium: { dpr: 1.25, maxPixels: 1_700_000, shadows: true, shadowMapSize: 1024, bloom: true, msaa: 2, density: 0.6 },
    low: { dpr: 1, maxPixels: 1_000_000, shadows: false, shadowMapSize: 512, bloom: false, msaa: 0, density: 0.35 },
  }
  // Touch devices get a lighter medium: no MSAA on the HDR target, bloom stays.
  const preset = tier === 'medium' && coarse ? { ...presets.medium, msaa: 0, shadowMapSize: 1024 } : presets[tier]
  // `?nogl` previews the static fallback.
  return { tier, ...preset, mobile, reducedMotion, osReducedMotion, motionForced, webgl: gl.ok && !params.has('nogl') }
}
