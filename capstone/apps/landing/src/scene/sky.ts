// Day/night rig for a dark stage: sun and moon on seasonal arcs (east +x → south +z → west
// −x), a background dome whose tint follows the hour but stays dark (DESIGN.md is dark-mode
// only), a sun glow on the horizon, stars, and matching key/fill/ambient light levels.
import * as THREE from 'three'
import type { Frame, Preview, SceneContext, SceneModule } from './types.ts'

export const preview: Preview = { camera: [0, 3, 18], target: [0, 4, 0], hour: 19 }

export type SkySeason = 'summer' | 'spring' | 'autumn' | 'winter'

interface SunPath {
  rise: number
  set: number
  maxElevation: number // degrees
}

const PATHS: Record<SkySeason, SunPath> = {
  summer: { rise: 5.2, set: 21.4, maxElevation: 62 },
  spring: { rise: 6.4, set: 19.8, maxElevation: 45 },
  autumn: { rise: 7.2, set: 18.6, maxElevation: 34 },
  winter: { rise: 8.2, set: 16.4, maxElevation: 16 },
}

export interface Sky extends SceneModule {
  setHour(hour: number): void
  setSeason(season: SkySeason): void
  /** 0 at night … 1 in full daylight (updated by setHour). */
  readonly daylight: number
  readonly sun: THREE.DirectionalLight
  readonly moon: THREE.DirectionalLight
  /** Centre and radius the sun's shadow camera should cover. */
  setShadowFocus(center: THREE.Vector3, radius: number): void
}

const DOME_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`
const DOME_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGlowColor;
  uniform vec3 uSunDir;
  uniform float uGlow;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -0.2, 1.0);
    vec3 col = mix(uHorizon, uZenith, smoothstep(-0.05, 0.6, h));
    // broad glow around the sun, strongest near the horizon
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uGlowColor * (pow(s, 6.0) * 0.55 + pow(s, 48.0) * 1.4) * uGlow;
    // stars
    vec3 g = d * 320.0;
    vec3 cell = floor(g);
    float star = step(0.9965, hash(cell));
    float r = length(fract(g) - 0.5);
    float disc = smoothstep(0.32, 0.0, r);
    float tw = 0.55 + 0.45 * sin(uTime * 2.0 + hash(cell + 3.1) * 40.0);
    col += vec3(0.85, 0.9, 1.0) * star * disc * tw * uStars * smoothstep(0.02, 0.25, h) * 2.2;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

// Hour-keyed palettes (kept dark: the page is dark-mode only).
const KEYS: { h: number; zenith: string; horizon: string; glow: string; sun: string; hemi: string; ground: string }[] = [
  { h: 0, zenith: '#03050b', horizon: '#0a1222', glow: '#8aa2ff', sun: '#8fa6ff', hemi: '#1d2a4a', ground: '#05070c' },
  { h: 5.0, zenith: '#060a18', horizon: '#1a1a2e', glow: '#ff9a62', sun: '#ffb27a', hemi: '#2a3150', ground: '#0b0c10' },
  { h: 6.5, zenith: '#0d1630', horizon: '#3a2a2a', glow: '#ffb070', sun: '#ffc48e', hemi: '#5a6a8a', ground: '#2a2620' },
  { h: 9, zenith: '#0e1b33', horizon: '#22324a', glow: '#fff1d6', sun: '#fff1de', hemi: '#a9bedb', ground: '#4a4336' },
  { h: 13, zenith: '#0f1d36', horizon: '#26384f', glow: '#fff6e6', sun: '#fff6ea', hemi: '#b8cbe6', ground: '#4e4738' },
  { h: 17.5, zenith: '#0e1830', horizon: '#2e2a33', glow: '#ffc27e', sun: '#ffd2a0', hemi: '#94a6c8', ground: '#3f3830' },
  { h: 20.0, zenith: '#0a1024', horizon: '#2c1b2a', glow: '#ff8a5c', sun: '#ff9a62', hemi: '#4a4a6a', ground: '#1a1614' },
  { h: 21.5, zenith: '#05070f', horizon: '#111a33', glow: '#7d8cff', sun: '#8fa6ff', hemi: '#202b4a', ground: '#06070b' },
  { h: 24, zenith: '#03050b', horizon: '#0a1222', glow: '#8aa2ff', sun: '#8fa6ff', hemi: '#1d2a4a', ground: '#05070c' },
]

const tmpA = new THREE.Color()
const tmpB = new THREE.Color()

function sampleColor(hour: number, key: 'zenith' | 'horizon' | 'glow' | 'sun' | 'hemi' | 'ground', out: THREE.Color): THREE.Color {
  let i = 0
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= hour) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const t = THREE.MathUtils.clamp((hour - a.h) / (b.h - a.h), 0, 1)
  tmpA.set(a[key])
  tmpB.set(b[key])
  return out.copy(tmpA).lerp(tmpB, t)
}

export function create(ctx: SceneContext): Sky {
  const root = new THREE.Group()
  root.name = 'sky'

  const uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGlowColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uGlow: { value: 1 },
    uStars: { value: 0 },
    uTime: { value: 0 },
  }
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 48, 24),
    new THREE.ShaderMaterial({ uniforms, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false }),
  )
  dome.renderOrder = -1
  dome.frustumCulled = false
  root.add(dome)

  const sun = new THREE.DirectionalLight('#fff4e2', 2.4)
  sun.castShadow = ctx.quality.shadows
  sun.shadow.mapSize.setScalar(ctx.quality.shadowMapSize)
  sun.shadow.bias = -0.00035
  sun.shadow.normalBias = 0.02
  const moon = new THREE.DirectionalLight('#8fa6ff', 0)
  const hemi = new THREE.HemisphereLight('#a9bedb', '#4a4336', 0.6)
  root.add(sun, sun.target, moon, moon.target, hemi)

  const focus = new THREE.Vector3()
  let focusRadius = 18
  let season: SkySeason = 'summer'
  let daylight = 1

  const applyShadowCamera = () => {
    const cam = sun.shadow.camera
    cam.left = -focusRadius
    cam.right = focusRadius
    cam.top = focusRadius
    cam.bottom = -focusRadius
    cam.near = 1
    cam.far = focusRadius * 6
    cam.updateProjectionMatrix()
  }
  applyShadowCamera()

  const dir = new THREE.Vector3()
  const setHour = (hourIn: number) => {
    const hour = ((hourIn % 24) + 24) % 24
    const p = PATHS[season]
    const t = (hour - p.rise) / (p.set - p.rise)
    const above = t > 0 && t < 1
    const peak = THREE.MathUtils.degToRad(p.maxElevation)
    // Below the horizon the sun keeps sinking at its setting rate (rad/h), so dusk and dawn
    // stay continuous and the glow can fade out instead of sitting under the horizon all night.
    const sink = (peak * Math.PI) / (p.set - p.rise)
    const hoursDown = Math.min((hour - p.set + 24) % 24, (p.rise - hour + 24) % 24)
    const elev = above ? peak * Math.sin(Math.PI * t) : -sink * hoursDown
    const az = Math.PI * THREE.MathUtils.clamp(t, -0.1, 1.1)
    dir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)).normalize()
    uniforms.uSunDir.value.copy(dir)

    // Daylight factor eases through dawn and dusk.
    daylight = THREE.MathUtils.smoothstep(Math.sin(Math.max(elev, -0.2)), -0.05, 0.25)
    sun.position.copy(focus).addScaledVector(dir, focusRadius * 3)
    sun.target.position.copy(focus)
    sun.intensity = 2.2 * daylight
    sampleColor(hour, 'sun', sun.color)

    // Moon on the opposite arc at night.
    const mt = ((hour + 12) % 24 - p.rise) / (p.set - p.rise)
    const mel = THREE.MathUtils.degToRad(40) * Math.sin(Math.PI * THREE.MathUtils.clamp(mt, 0, 1))
    const maz = Math.PI * THREE.MathUtils.clamp(mt, 0, 1)
    moon.position.copy(focus).add(new THREE.Vector3(Math.cos(maz), Math.max(Math.sin(mel), 0.25), Math.sin(maz) + 0.4).multiplyScalar(focusRadius * 3))
    moon.target.position.copy(focus)
    moon.intensity = 0.55 * (1 - daylight)

    sampleColor(hour, 'zenith', uniforms.uZenith.value)
    sampleColor(hour, 'horizon', uniforms.uHorizon.value)
    sampleColor(hour, 'glow', uniforms.uGlowColor.value)
    // Full on the horizon, gone once the sun is ~7° down (about half an hour in summer).
    uniforms.uGlow.value = above ? 0.5 + 0.5 * (1 - Math.sin(elev)) : THREE.MathUtils.smoothstep(elev, -0.12, 0)
    uniforms.uStars.value = 1 - THREE.MathUtils.smoothstep(daylight, 0, 0.35)
    sampleColor(hour, 'hemi', hemi.color)
    sampleColor(hour, 'ground', hemi.groundColor)
    hemi.intensity = 0.16 + 0.34 * daylight
    ctx.scene.environmentIntensity = 0.35 + 0.45 * daylight
    ctx.renderer.toneMappingExposure = 1.12 - 0.12 * daylight
  }
  setHour(13)

  return {
    object: root,
    sun,
    moon,
    get daylight() {
      return daylight
    },
    setHour,
    setSeason(s) {
      season = s
    },
    setShadowFocus(center, radius) {
      focus.copy(center)
      focusRadius = radius
      applyShadowCamera()
    },
    update({ time }: Frame) {
      uniforms.uTime.value = time
    },
  }
}

/** Playground: &hour=0..24 (default from preview) &season=winter */
export function configure(sky: Sky, p: URLSearchParams): void {
  const s = p.get('season')
  if (s === 'summer' || s === 'spring' || s === 'autumn' || s === 'winter') sky.setSeason(s)
  sky.setHour(Number(p.get('hour') ?? preview.hour))
}
