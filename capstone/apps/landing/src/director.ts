// Scroll director: assembles the world (sky, home, car, cable, flows, city, depot, factory,
// ignition swarm) and maps scroll position to scene state. Every chapter is a pure function
// of its own progress p ∈ [0, 1]; consecutive chapters start where the previous one ended,
// so the camera never jumps, and damping smooths everything on top of Lenis. The clock only
// ever runs forward around the dial, so the sky never spins backwards between chapters.
import * as THREE from 'three'
import type { World } from './core/world.ts'
import { create as createSky, type Sky } from './scene/sky.ts'
import { create as createHouse, type House } from './scene/house.ts'
import { create as createCar, type Car, type CarMode } from './scene/car.ts'
import { create as createCable, type Cable } from './scene/cable.ts'
import { create as createFlows, type FlowId, type Flows } from './scene/flows.ts'
import { create as createCity, type City } from './scene/city.ts'
import { create as createFactory, type Factory } from './scene/factory.ts'
import { create as createDepot, type Depot } from './scene/depot.ts'
import { create as createSwarm, type Swarm } from './scene/swarm.ts'
import { TitleAssembly } from './scene/titleAssembly.ts'
import type { SceneContext } from './scene/types.ts'
import { planDay, type HourFlow, type PlanResult } from './sim/v2h.ts'
import { sampleFleet, simulateFleet, type FleetResult } from './sim/fleet.ts'

export const STORY_DAY = {
  batteryKwh: 75,
  pvKwp: 8,
  season: 'summer' as const,
  departHour: 8,
  returnHour: 14,
  tripKwh: 7,
  targetSoc: 0.8,
  reserveSoc: 0.3,
}

export const FACTORY_ORIGIN = new THREE.Vector3(250, 0, 30)
const FACTORY_YAW = -0.35
/** The depot sits beside the factory car park, turned to match it. */
export const DEPOT_ORIGIN = new THREE.Vector3(200, 0, 138)
const DEPOT_YAW = -0.35

/** Depot-local point → world, as an array for the camera stations. */
function depotPoint(x: number, y: number, z: number): [number, number, number] {
  const c = Math.cos(DEPOT_YAW)
  const s = Math.sin(DEPOT_YAW)
  return [DEPOT_ORIGIN.x + x * c + z * s, y, DEPOT_ORIGIN.z - x * s + z * c]
}

type V3 = [number, number, number]

export interface State {
  cam: THREE.Vector3
  target: THREE.Vector3
  fov: number
  hour: number
  /** 0 parked … 1 gone (along the exit path). */
  drive: number
  xray: number
  plugged: number
  carMode: CarMode
  soc: number
  flows: Record<FlowId, number>
  flowsOpacity: number
  cityReveal: number
  cityY: number
  wave: number
  peak: number
  participation: number
  factoryOn: number
  fleet: 'idle' | 'charging' | 'discharging'
  flex: number[]
  /** Small automatic orbit (radians) layered on top of the camera keyframe. */
  orbit: number
  /** Horizontal lens shift as a fraction of the viewport (negative moves the scene right). */
  shift: number
  /** Vertical lens shift on narrow portrait screens (positive moves the scene up). */
  shiftY: number
  /** Logical hour of the story day (6 … 30), unwrapped, for the day HUD and captions. */
  dayHour: number
  /** Window hour at the depot (18 … 34). */
  fleetHour: number
  depotOn: number
  /** Hero swarm: 0 = headline, 1 = absorbed into the charge port; and its opacity. */
  swarmMorph: number
  swarmOpacity: number
}

/** Which plan the day chapter plays: the optimised one, or unmanaged charging for comparison. */
export type DayView = 'smart' | 'baseline'

export interface Chapter {
  id: string
  apply(p: number, s: State, ctx: { plan: PlanResult; view: DayView }): void
}

const ZERO_FLOWS = (): Record<FlowId, number> => ({ 'pv-home': 0, 'pv-car': 0, 'pv-grid': 0, 'car-home': 0, 'grid-home': 0, 'grid-car': 0 })

function freshState(): State {
  return {
    cam: new THREE.Vector3(19, 6.5, 23),
    target: new THREE.Vector3(3, 2.2, 2),
    fov: 35,
    hour: 21.5,
    drive: 0,
    xray: 0,
    plugged: 1,
    carMode: 'idle',
    soc: 0.86,
    flows: ZERO_FLOWS(),
    flowsOpacity: 1,
    cityReveal: 0,
    cityY: -8,
    wave: 0,
    peak: 0,
    participation: 0.6,
    factoryOn: 0,
    fleet: 'idle',
    flex: [0.6, 0.6, 0.6, 0.6, 0.6],
    orbit: 0,
    shift: 0,
    shiftY: 0,
    dayHour: 6,
    fleetHour: 18,
    depotOn: 0,
    swarmMorph: 0,
    swarmOpacity: 0,
  }
}

/** Shortest signed distance between two clock hours, in (-12, 12]. */
function hourDelta(from: number, to: number): number {
  return ((((to - from) % 24) + 36) % 24) - 12
}

const v = (a: V3) => new THREE.Vector3(...a)
const ease = (t: number) => t * t * (3 - 2 * t)
const seg = (p: number, a: number, b: number) => THREE.MathUtils.clamp((p - a) / (b - a), 0, 1)
/**
 * Position along the exit path for a 0..1 time. The car pulls away from rest and is still rolling when it
 * fades out at the road's end (no stall there); the return runs the time backwards, so it arrives slowing down.
 */
const driveCurve = (t: number) => t * t * (1.5 - 0.5 * t)
const mix = (a: number, b: number, t: number) => a + (b - a) * t
function camLerp(s: State, a: { cam: V3; target: V3 }, b: { cam: V3; target: V3 }, t: number) {
  const k = ease(t)
  s.cam.copy(v(a.cam)).lerp(v(b.cam), k)
  s.target.copy(v(a.target)).lerp(v(b.target), k)
}

// Camera stations (world space; home at the origin, car parked at (6.6, 0, 4.3)).
export const SHOTS = {
  hero: { cam: [19, 6.5, 23] as V3, target: [3, 2.4, 2] as V3 },
  heroOut: { cam: [16, 4.8, 17] as V3, target: [5, 1.4, 3.5] as V3 },
  car: { cam: [12.5, 2.55, 10.3] as V3, target: [6.6, 0.85, 4.3] as V3 },
  carTop: { cam: [10.3, 7.2, 9.2] as V3, target: [6.6, 0.6, 4.3] as V3 },
  dayA: { cam: [25, 13, 27] as V3, target: [1.5, 2.6, 3] as V3 },
  dayB: { cam: [27, 15, 17] as V3, target: [1, 2.6, 2] as V3 },
  ready: { cam: [12.8, 3.6, 12.5] as V3, target: [5.6, 1.4, 3.2] as V3 },
  sim: { cam: [-20, 11, 26] as V3, target: [1.5, 2.6, 2] as V3 },
  gridA: { cam: [-8, 28, 62] as V3, target: [0, 0, 0] as V3 },
  gridB: { cam: [110, 170, 250] as V3, target: [-20, 0, -15] as V3 },
  depotA: { cam: depotPoint(44, 26, 58), target: depotPoint(2, 0, -2) },
  depotB: { cam: depotPoint(30, 15, 40), target: depotPoint(0, 0.5, -3) },
  factoryA: { cam: [330, 80, 170] as V3, target: [250, 6, 50] as V3 },
  factoryB: { cam: [300, 42, 140] as V3, target: [252, 6, 52] as V3 },
  brain: { cam: [140, 420, 360] as V3, target: [110, 0, 0] as V3 },
  end: { cam: [-25, 10.5, 33] as V3, target: [2.5, 2.4, 2.5] as V3 },
}

/** Interpolated hour of the story day (flows in kW, SoC 0–1) at clock time h (any real). */
export function sampleDay(plan: PlanResult, h: number, view: DayView = 'smart'): { step: HourFlow; next: HourFlow; frac: number; soc: number } {
  const hh = ((h % 24) + 24) % 24
  const i = Math.floor(hh)
  const hours = view === 'smart' ? plan.smart.hours : plan.baseline.hours
  const step = hours[i]
  const next = hours[(i + 1) % 24]
  const frac = hh - i
  return { step, next, frac, soc: mix(step.socStart, step.socEnd, frac) }
}

/** Net cost (€) of the story day from 06:00 up to clock time h (h may run past 24). */
export function costSoFar(plan: PlanResult, h: number, view: DayView): number {
  const hours = view === 'smart' ? plan.smart.hours : plan.baseline.hours
  let total = 0
  for (let t = 6; t < h; t++) {
    const step = hours[t % 24]
    total += step.cost * Math.min(1, h - t)
  }
  return total
}

function dayFlows(s: State, plan: PlanResult, h: number, view: DayView) {
  const { step, next, frac } = sampleDay(plan, h, view)
  const blend = (k: keyof HourFlow) => mix(step[k] as number, next[k] as number, ease(frac))
  s.flows['pv-home'] = blend('pvToHome')
  s.flows['pv-car'] = blend('pvToCar')
  s.flows['pv-grid'] = blend('pvToGrid')
  s.flows['car-home'] = blend('carToHome')
  s.flows['grid-home'] = blend('gridToHome')
  s.flows['grid-car'] = blend('gridToCar')
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'hero',
    apply(p, s) {
      camLerp(s, SHOTS.hero, SHOTS.heroOut, seg(p, 0.45, 1))
      s.hour = 21.5
      s.soc = 0.86
      s.carMode = 'discharging'
      s.flows = ZERO_FLOWS()
      s.flows['car-home'] = 1.4
      s.flows['pv-home'] = 0
      s.orbit = (1 - seg(p, 0.3, 1)) * 0.06
      s.shift = -0.2
      // The headline dissolves into energy that flows into the car's charge port.
      s.swarmMorph = ease(seg(p, 0.1, 0.75))
      s.swarmOpacity = seg(p, 0.04, 0.12) * (1 - seg(p, 0.8, 0.95))
    },
  },
  {
    id: 'parked',
    apply(p, s) {
      camLerp(s, SHOTS.heroOut, SHOTS.car, seg(p, 0, 0.35))
      if (p > 0.35) camLerp(s, SHOTS.car, SHOTS.carTop, seg(p, 0.45, 0.95))
      s.hour = 21.5
      s.xray = ease(seg(p, 0.25, 0.55))
      s.soc = 0.86
      s.carMode = 'idle'
      s.flows = ZERO_FLOWS()
      s.flowsOpacity = 1 - seg(p, 0.1, 0.3)
      s.shift = mix(-0.2, -0.3, ease(seg(p, 0, 0.35)))
    },
  },
  {
    id: 'day',
    apply(p, s, { plan, view }) {
      // 06:00 → 06:00 next morning, with a short settle at both ends.
      const t = seg(p, 0.04, 0.96)
      const h = 6 + t * 24
      s.hour = h
      s.dayHour = h
      camLerp(s, SHOTS.carTop, SHOTS.dayA, seg(p, 0, 0.06))
      if (p > 0.06) camLerp(s, SHOTS.dayA, SHOTS.dayB, seg(p, 0.06, 1))
      s.xray = 1 - seg(p, 0, 0.04)
      s.flowsOpacity = seg(p, 0.03, 0.08)
      dayFlows(s, plan, h, view)
      const hh = h % 24
      // Leave at 08:00, return at 14:00: unplug, drive out, come back, plug in.
      s.plugged = 1 - seg(hh, 7.55, 7.8) + seg(hh, 14.2, 14.45)
      s.drive = hh < 12 ? driveCurve(seg(hh, 7.8, 8.45)) : driveCurve(1 - seg(hh, 13.55, 14.2))
      s.soc = sampleDay(plan, h, view).soc
      const { step } = sampleDay(plan, h, view)
      s.carMode = step.action === 'v2h' ? 'discharging' : step.action === 'solar-charge' || step.action === 'grid-charge' ? 'charging' : 'idle'
      s.shift = mix(-0.3, 0, ease(seg(p, 0, 0.06)))
      s.shiftY = 0.14
    },
  },
  {
    id: 'ready',
    apply(p, s, { plan, view }) {
      camLerp(s, SHOTS.dayB, SHOTS.ready, seg(p, 0, 0.5))
      s.hour = 6.5 // the next morning: charged and ready to leave
      s.dayHour = 30
      s.drive = 0
      s.plugged = 1
      s.flows = ZERO_FLOWS()
      s.flowsOpacity = 1 - seg(p, 0, 0.3)
      s.carMode = 'idle'
      s.soc = sampleDay(plan, 6, view).soc // where the day ended: 06:00 SoC of the cyclic plan
      s.shift = -0.2 * ease(seg(p, 0, 0.5))
    },
  },
  {
    id: 'simulator',
    apply(p, s) {
      camLerp(s, SHOTS.ready, SHOTS.sim, seg(p, 0, 0.35))
      s.shift = -0.2 * (1 - ease(seg(p, 0, 0.35))) - 0.18 * ease(seg(p, 0.75, 1))
      s.hour = mix(6.5, 17.5, seg(p, 0, 0.4))
      s.carMode = 'idle'
      s.flows = ZERO_FLOWS()
      s.flowsOpacity = 0
    },
  },
  {
    id: 'grid',
    apply(p, s) {
      camLerp(s, SHOTS.sim, SHOTS.gridA, seg(p, 0, 0.18))
      if (p > 0.18) camLerp(s, SHOTS.gridA, SHOTS.gridB, seg(p, 0.18, 0.55))
      s.hour = mix(17.5, 18.6, seg(p, 0, 0.45))
      s.shift = mix(-0.18, -0.26, ease(seg(p, 0, 0.1)))
      s.cityY = mix(-8, 0, ease(seg(p, 0.08, 0.3)))
      s.cityReveal = ease(seg(p, 0.12, 0.5))
      s.peak = seg(p, 0.45, 0.6) * (1 - seg(p, 0.75, 0.92))
      s.wave = ease(seg(p, 0.62, 0.95))
      s.carMode = p > 0.62 ? 'discharging' : 'idle'
      s.flows = ZERO_FLOWS()
      s.flowsOpacity = 0
    },
  },
  {
    id: 'fleet',
    apply(p, s) {
      camLerp(s, SHOTS.gridB, SHOTS.depotA, seg(p, 0, 0.08))
      if (p > 0.08) camLerp(s, SHOTS.depotA, SHOTS.depotB, seg(p, 0.08, 1))
      // 18:00 → 10:00 next morning at the depot, once the camera has arrived.
      const fh = 18 + 16 * seg(p, 0.1, 0.95)
      s.fleetHour = fh
      s.hour = fh
      s.cityReveal = 1
      s.cityY = 0
      s.depotOn = 1
      s.factoryOn = 1
      s.flowsOpacity = 0
      s.shift = mix(-0.26, -0.22, ease(seg(p, 0, 0.1)))
    },
  },
  {
    id: 'factory',
    apply(p, s) {
      camLerp(s, SHOTS.depotB, SHOTS.factoryA, seg(p, 0, 0.3))
      if (p > 0.3) camLerp(s, SHOTS.factoryA, SHOTS.factoryB, seg(p, 0.3, 1))
      s.hour = mix(10, 13, seg(p, 0, 0.3))
      s.depotOn = 1 - seg(p, 0.2, 0.5)
      s.fleetHour = 34
      s.shift = mix(-0.22, -0.1, ease(seg(p, 0.8, 1)))
      s.cityReveal = 1
      s.cityY = 0
      s.wave = 1 - seg(p, 0, 0.3)
      s.factoryOn = 1
      // Morning arrivals charge; at the price peak the company fleet lends power back.
      s.fleet = p < 0.55 ? 'charging' : 'discharging'
      const shift = seg(p, 0.4, 0.8)
      s.flex = [mix(0.6, 0.2, shift), mix(0.5, 0.9, shift), mix(0.6, 0.4, shift), mix(0.7, 0.15, shift), mix(0.4, 0.8, shift)]
    },
  },
  {
    id: 'brain',
    apply(p, s) {
      camLerp(s, SHOTS.factoryB, SHOTS.brain, seg(p, 0, 0.6))
      s.hour = mix(13, 20.4, seg(p, 0, 0.7))
      s.shift = mix(-0.1, 0, ease(seg(p, 0, 0.5)))
      s.orbit = 0.05
      s.cityReveal = 1
      s.cityY = 0
      s.factoryOn = 1
      s.wave = seg(p, 0.5, 1) * 0.7
    },
  },
  {
    id: 'faq',
    apply(p, s) {
      camLerp(s, SHOTS.brain, SHOTS.end, seg(p, 0, 0.7))
      s.hour = mix(20.4, 22, seg(p, 0, 0.6))
      s.cityReveal = 1 - seg(p, 0.3, 0.7)
      s.cityY = mix(0, -8, seg(p, 0.5, 0.9))
      s.factoryOn = 1 - seg(p, 0, 0.3)
      s.wave = 0
      s.shift = -0.2 * ease(seg(p, 0.5, 1))
      s.carMode = 'discharging'
      s.flows = ZERO_FLOWS()
      s.flows['car-home'] = 1.2
      s.flowsOpacity = seg(p, 0.7, 1)
    },
  },
  {
    id: 'join',
    apply(_p, s) {
      camLerp(s, SHOTS.end, SHOTS.end, 1)
      s.hour = 22
      s.cityReveal = 0
      s.cityY = -8
      s.factoryOn = 0
      s.carMode = 'discharging'
      s.flows = ZERO_FLOWS()
      s.flows['car-home'] = 1.2
      s.flowsOpacity = 1
      s.orbit = 0.05
      s.shift = -0.2
    },
  },
]

export interface Director {
  /** Recompute section metrics (after layout changes / resize). */
  measure(): void
  /** Called every frame by the world ticker. */
  frame(time: number, dt: number): void
  readonly state: State
  readonly plan: PlanResult
  readonly modules: { sky: Sky; house: House; car: Car; cable: Cable; flows: Flows; city: City; factory: Factory; depot: Depot; swarm: Swarm | null; joinSwarm: Swarm | null }
  readonly fleet: FleetResult
  /** The section id currently driving the scene and its progress. */
  readonly active: { id: string; p: number }
  /** Pointer offset in [-1, 1] for parallax. */
  setPointer(x: number, y: number): void
  readonly camera: THREE.PerspectiveCamera
  /** Plan played by the day chapter. */
  view: DayView
  /**
   * Hero ignition: particles stream out of the charge port and assemble into the headline
   * over `seconds`; resolves when they have. The DOM headline should be revealed then.
   */
  ignite(headline: HTMLElement, seconds: number): Promise<void>
  /** Fade the particle headline out once its DOM twin is showing. */
  handOver(): void
  /** Re-read the hero headline's position (after it is revealed or re-laid out). */
  rereadHeadline(): void
  /**
   * The closing title (Join chapter) gets the same particle assembly as the hero: `prepare` once at boot,
   * `assemble` when the chapter approaches, `handOver` when the real title is showing. Null without the swarm
   * (reduced motion, lowest tier, no WebGL): the DOM title is then simply revealed.
   */
  readonly closing: {
    /** Rasterises the title (white words, teal <em>); false if that failed. */
    prepare(title: HTMLElement): Promise<boolean>
    /** Particles converge into the title; resolves when they form it. */
    assemble(seconds: number): Promise<void>
    handOver(): void
  } | null
  /**
   * Draws everything once with the x-ray car and culling off, so the shader programs that are
   * otherwise built lazily (x-ray materials, shadow-pass depth programs) exist before the
   * first scroll instead of stalling a frame mid-scroll. Call once at boot, after prewarm.
   */
  warmup(): void
  /**
   * Freeze ambient animation (orbit, pulses, particles drifting); scrolling still drives the scene.
   * A director built for reduced motion starts paused; the visitor can still un-pause it (the rest of its
   * reduced layout, such as no swarm and no damping, stays).
   */
  setPaused(paused: boolean): void
}

export function createDirector(world: World, reducedMotion: boolean): Director {
  const ctx: SceneContext = {
    quality: world.quality,
    renderer: world.renderer,
    scene: world.scene,
    camera: world.camera,
    envMap: world.envMap,
  }
  const sky = createSky(ctx)
  const house = createHouse(ctx)
  const car = createCar(ctx)
  const cable = createCable(ctx)
  const flows = createFlows(ctx)
  const city = createCity(ctx)
  const factory = createFactory(ctx)
  factory.object.position.copy(FACTORY_ORIGIN)
  factory.object.rotation.y = FACTORY_YAW
  const depot = createDepot(ctx)
  depot.object.position.copy(DEPOT_ORIGIN)
  depot.object.rotation.y = DEPOT_YAW
  depot.object.visible = false
  const fleetPlan = simulateFleet()
  // The ignition swarm is decoration: skipped for reduced motion and on the lowest tier.
  const swarm = !reducedMotion && world.quality.tier !== 'low' ? createSwarm(ctx) : null
  if (swarm) swarm.object.visible = false
  // A second swarm (same shader program, no extra compile) for the closing title.
  const joinSwarm = swarm ? createSwarm(ctx) : null
  if (joinSwarm) joinSwarm.object.visible = false
  world.scene.add(sky.object, house.object, car.object, cable.object, flows.object, city.object, factory.object, depot.object)
  if (swarm) world.scene.add(swarm.object)
  if (joinSwarm) world.scene.add(joinSwarm.object)
  world.scene.background = null
  sky.setShadowFocus(new THREE.Vector3(1, 0, 3), 17)
  world.scene.fog = new THREE.FogExp2('#080c16', 0.0016)

  const plan = planDay(STORY_DAY)

  // Exit path: forward down the driveway, left onto the street and along the lane. The street ends at
  // x = -11 and the car's nose reaches 2.4 m ahead of its centre, so the path ends at x = -8.6: the car is
  // fully faded by the time its nose gets to the road's edge and is never seen off the asphalt.
  const parkPos = house.parking.getWorldPosition(new THREE.Vector3())
  const path = new THREE.CatmullRomCurve3([
    parkPos.clone(),
    new THREE.Vector3(6.6, 0.05, 8.4),
    new THREE.Vector3(5.4, 0.05, 10.5),
    new THREE.Vector3(2.4, 0.05, 11.0),
    new THREE.Vector3(-3, 0.05, 11.0),
    new THREE.Vector3(-8.6, 0.05, 11.0),
  ])
  const pathLen = path.getLength()
  const FADE_FROM = 0.8 // the car dissolves over the last fifth of the path (and appears over the same stretch on its return)
  const nearHome = 0.6 / pathLen // still at the wallbox (0.6 m from the parking spot): the cable may be plugged in

  const target = freshState()
  const state = freshState()
  const sections = CHAPTERS.map((c) => ({ chapter: c, el: document.getElementById(c.id) as HTMLElement | null, top: 0, height: 1, pinned: false }))
  const active = { id: 'hero', p: 0 }
  const pointer = new THREE.Vector2()
  const pointerSmooth = new THREE.Vector2()

  const measure = () => {
    for (const s of sections) {
      if (!s.el) continue
      const r = s.el.getBoundingClientRect()
      s.top = r.top + scrollY
      s.height = r.height
      s.pinned = s.el.hasAttribute('data-pin') && !s.el.classList.contains('flow-static')
    }
  }
  measure()
  addEventListener('resize', measure)
  new ResizeObserver(measure).observe(document.body)

  let lastDrive = 0
  let carOpacity = 1
  let paused = reducedMotion
  let frozenTime = 0
  // Ignition: each particle title (hero headline, closing title) is a TitleAssembly that tracks its DOM twin.
  const hero = swarm ? new TitleAssembly(swarm, world.camera) : null
  const closing = joinSwarm ? new TitleAssembly(joinSwarm, world.camera) : null
  let portTargetSet = false
  // Layout can shift a little after resizes (re-wrapped lines); re-read once it settles.
  let rereadTimer = 0
  addEventListener('resize', () => {
    clearTimeout(rereadTimer)
    rereadTimer = window.setTimeout(() => {
      void hero?.reread()
      void closing?.reread(true)
    }, 350)
  })
  const tmp = new THREE.Vector3()
  const port = new THREE.Vector3()
  const wb = new THREE.Vector3()
  const carNode = new THREE.Vector3()

  const director: Director = {
    fleet: fleetPlan,
    async ignite(headline, seconds) {
      if (!swarm || !hero) return
      await hero.prepare(headline)
      swarm.object.visible = true
      world.wake((seconds + 2.5) * 1000) // the assembly is scripted, not input-driven: keep full frame rate
      await hero.play(seconds)
    },
    handOver() {
      hero?.handOver()
    },
    rereadHeadline() {
      void hero?.reread()
    },
    closing:
      closing && joinSwarm
        ? {
            async prepare(title) {
              try {
                await closing.prepare(title, { split: true })
                return true
              } catch (err) {
                console.warn('Closing title particles skipped.', err)
                return false
              }
            },
            async assemble(seconds) {
              // The layout has moved since boot (pinned chapters add spacers above the title): read it where it is now.
              await closing.reread(true)
              closing.track() // and place the plane for the camera of the moment, not the one at boot
              const { center, right, width } = closing.plane
              // Start as a loose ball beside the title (below it on narrow screens), so the particles stream in.
              const side = innerWidth >= 760
              tmp.copy(center)
                .addScaledVector(right, side ? width * 0.62 : 0)
                .addScaledVector(closing.plane.up, side ? 0 : -width * 0.55)
              joinSwarm.setCloudTarget(tmp, width * (side ? 0.3 : 0.42))
              joinSwarm.object.visible = true
              world.wake((seconds + 2.5) * 1000)
              await closing.play(seconds)
            },
            handOver() {
              closing.handOver()
            },
          }
        : null,
    warmup() {
      const saved: Array<[THREE.Object3D, boolean, boolean]> = []
      world.scene.traverse((o) => {
        if ((o as THREE.Light).isLight) return // never touch the light set: its size is part of every lit program's key
        saved.push([o, o.visible, o.frustumCulled])
        o.visible = true
        o.frustumCulled = false
      })
      try {
        // Two looks cover every car variant: X-ray (battery pack, ghost layers), then a half-faded car with the
        // hairline trim still showing (blended wheels, lights, gauge, the depth pre-pass copies).
        for (const [x, o] of [[1, 1], [0.3, 0.5]] as const) {
          car.setXray(x)
          car.setOpacity(o)
          world.drawOnce()
        }
      } finally {
        car.setXray(state.xray)
        car.setOpacity(carOpacity)
        for (const [o, visible, culled] of saved) {
          o.visible = visible
          o.frustumCulled = culled
        }
      }
    },
    setPaused(v) {
      paused = v
    },
    view: 'smart',
    camera: world.camera,
    state,
    plan,
    modules: { sky, house, car, cable, flows, city, factory, depot, swarm, joinSwarm },
    active,
    measure,
    setPointer(x, y) {
      pointer.set(x, y)
    },
    frame(time, dt) {
      // 1. Which chapter drives the scene, and how far into it are we?
      const mid = scrollY + innerHeight * 0.5
      let idx = 0
      for (let i = 0; i < sections.length; i++) if (sections[i].el && mid >= sections[i].top) idx = i
      const sec = sections[idx]
      let p = 0
      if (sec.el) {
        p = sec.pinned
          ? (scrollY - sec.top) / Math.max(1, sec.height - innerHeight)
          : idx === 0
            ? // The opening chapter starts at the top of the page: 0 at rest, 1 when the next one takes over.
              (scrollY - sec.top) / Math.max(1, sec.height * 0.5)
            : (mid - sec.top) / Math.max(1, sec.height)
      }
      p = THREE.MathUtils.clamp(p, 0, 1)
      active.id = sec.chapter.id
      active.p = p
      // Reset per-chapter defaults, then let the chapter write its state.
      Object.assign(target, {
        xray: 0,
        drive: 0,
        plugged: 1,
        flowsOpacity: 1,
        cityReveal: 0,
        cityY: -8,
        wave: 0,
        peak: 0,
        factoryOn: 0,
        orbit: 0,
        shift: 0,
        depotOn: 0,
        swarmMorph: 1,
        swarmOpacity: 0,
        shiftY: 0,
        soc: 0.86,
        carMode: 'idle',
        fleet: 'idle',
      })
      target.flex = [0.6, 0.6, 0.6, 0.6, 0.6]
      target.flows = ZERO_FLOWS()
      sec.chapter.apply(p, target, { plan, view: director.view })

      // 2. Damp towards the target (snappy enough to follow scrubbing).
      const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 6)
      const kSlow = reducedMotion ? 1 : 1 - Math.exp(-dt * 3.5)
      state.cam.lerp(target.cam, k)
      state.target.lerp(target.target, k)
      // The clock only moves forward around the dial (shortest way), never back through the night.
      state.hour = (((state.hour + hourDelta(state.hour, target.hour) * k) % 24) + 24) % 24
      state.dayHour += (target.dayHour - state.dayHour) * k
      state.fleetHour += (target.fleetHour - state.fleetHour) * k
      for (const key of ['drive', 'xray', 'plugged', 'soc', 'flowsOpacity', 'cityReveal', 'cityY', 'wave', 'peak', 'factoryOn', 'orbit', 'shift', 'shiftY', 'depotOn', 'swarmMorph', 'swarmOpacity'] as const) {
        state[key] += (target[key] - state[key]) * (key === 'cityReveal' || key === 'wave' ? kSlow : k)
        // Snap once close, so downstream geometry (cable, flows) stops rebuilding.
        if (Math.abs(target[key] - state[key]) < 1e-4) state[key] = target[key]
      }
      for (const id of Object.keys(state.flows) as FlowId[]) state.flows[id] += (target.flows[id] - state.flows[id]) * k
      for (let i = 0; i < 5; i++) state.flex[i] += (target.flex[i] - state.flex[i]) * kSlow
      state.carMode = target.carMode
      state.fleet = target.fleet

      // 3. Apply to the world.
      pointerSmooth.lerp(pointer, reducedMotion ? 0 : 1 - Math.exp(-dt * 3))
      if (!paused) frozenTime = time
      const orbit = paused ? 0 : state.orbit * Math.sin(time * 0.25)
      tmp.copy(state.cam).sub(state.target)
      tmp.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit + pointerSmooth.x * 0.03)
      world.camera.position.copy(state.target).add(tmp)
      world.camera.position.y += pointerSmooth.y * 0.4
      world.camera.lookAt(state.target)
      // Depth precision follows the shot distance. A fixed 0.1 m near plane leaves ~17 cm depth steps
      // at the 550 m brain shot, which z-fights the PV sheets (7 cm above the saw-tooth roofs) and every
      // other thin coplanar layer in the district.
      world.camera.near = THREE.MathUtils.clamp(tmp.length() * 0.02, 0.1, 8)
      // Lens shift keeps the subject clear of the copy; narrow screens stay centred.
      const w = innerWidth
      const h = innerHeight
      const shift = w < 960 ? 0 : state.shift
      const shiftY = w < 960 && h > w ? state.shiftY : 0
      world.camera.setViewOffset(w, h, shift * w, shiftY * h, w, h)

      sky.setHour(state.hour)
      const night = 1 - sky.daylight
      house.setNight(night)
      house.setSolar(sky.daylight * Math.min(1, (state.flows['pv-home'] + state.flows['pv-car'] + state.flows['pv-grid']) / 3 + 0.25))

      // Car along its exit path.
      const u = THREE.MathUtils.clamp(state.drive, 0, 1)
      const pt = path.getPointAt(u)
      const tan = path.getTangentAt(u)
      car.object.position.copy(pt)
      car.object.rotation.set(0, Math.atan2(-tan.z, tan.x), 0)
      // Fades out towards the road's end (and in again on the way back); gone entirely at the end.
      // The headlight stays in the light set at zero intensity, so no program is ever relinked.
      carOpacity = 1 - ease(seg(u, FADE_FROM, 1))
      car.setOpacity(carOpacity)
      const speed = ((u - lastDrive) * pathLen) / Math.max(dt, 1e-3)
      lastDrive = u
      car.setWheelSpin(speed / 0.37)
      car.setLights(carOpacity > 0.003 ? Math.max(night, Math.min(1, Math.abs(speed) * 4)) : 0)
      car.setXray(state.xray)
      car.setSoc(state.soc)
      car.setMode(state.carMode, state.flows['grid-car'] > state.flows['pv-car'] ? 'grid' : 'solar')

      // Cable between wallbox and port, flowing in the direction energy moves.
      car.object.updateMatrixWorld()
      car.chargePort.getWorldPosition(port)
      house.wallbox.getWorldPosition(wb)
      cable.setEnds(wb, port)
      cable.setPlugged(THREE.MathUtils.clamp(state.plugged, 0, 1) * (u < nearHome ? 1 : 0))
      const toCar = state.flows['pv-car'] + state.flows['grid-car']
      const toHome = state.flows['car-home']
      if (state.carMode === 'discharging' || toHome > 0.05) cable.setFlow('to-home', 'energy')
      else if (state.carMode === 'charging' || toCar > 0.05) cable.setFlow('to-car', state.flows['grid-car'] > state.flows['pv-car'] ? 'grid' : 'solar')
      else cable.setFlow('none', 'energy')

      // Energy arcs follow the car.
      flows.setNode('car', carNode.set(pt.x, 2.1, pt.z))
      // Energy only reaches the car once it is parked and plugged in.
      const plugged = u < nearHome ? THREE.MathUtils.clamp(state.plugged, 0, 1) : 0
      for (const id of Object.keys(state.flows) as FlowId[]) flows.setFlow(id, state.flows[id] * (id.includes('car') ? plugged : 1))
      flows.setOpacity(state.flowsOpacity)

      // City and factory.
      city.object.visible = state.cityReveal > 0.002 || state.cityY > -7.9
      city.object.position.y = state.cityY
      city.setReveal(state.cityReveal)
      city.setNight(night)
      city.setWave(state.wave)
      city.setPeak(state.peak)
      city.setParticipation(state.participation)
      factory.object.visible = state.factoryOn > 0.01
      factory.setNight(night)
      factory.setFleetMode(state.fleet)
      factory.setFlexLoads(state.flex)
      depot.object.visible = state.depotOn > 0.01
      if (depot.object.visible) {
        depot.setNight(night)
        depot.setSolar(sky.daylight)
        depot.setState(sampleFleet(fleetPlan, state.fleetHour).vehicles)
      }

      // Hero ignition swarm: assemble (intro), then dissolve into the charge port on scroll.
      if (swarm && hero && swarm.object.visible) {
        hero.step(dt)
        if (!portTargetSet && u < nearHome) {
          swarm.setPointTarget([port.clone()], { radius: 0.12, keep: 0.25 })
          portTargetSet = true
        }
        if (hero.intro < 1) {
          swarm.setMorph('point', 'text', ease(hero.intro))
          swarm.setOpacity(Math.min(1, hero.intro * 4))
        } else {
          // The particle headline holds until the DOM headline has faded in on top, then
          // dissolves; it returns as the hero scrolls away and flows into the charge port.
          swarm.setMorph('text', 'point', state.swarmMorph)
          swarm.setOpacity(Math.max(hero.hold, state.swarmOpacity))
        }
        swarm.setPointer(pointerSmooth.x, -pointerSmooth.y)
        if (active.id !== 'hero' && state.swarmOpacity < 0.01 && hero.intro >= 1 && hero.handOff > 1) swarm.object.visible = false
      } else if (swarm && hero && hero.intro >= 1 && active.id === 'hero' && state.swarmOpacity > 0.01) {
        swarm.object.visible = true
      }

      // Closing title: the particles converge into the Join headline, hold until the real title is in, then dissolve.
      if (joinSwarm && closing && joinSwarm.object.visible) {
        closing.step(dt)
        if (closing.intro < 1) {
          joinSwarm.setMorph('cloud', 'text', ease(closing.intro))
          joinSwarm.setOpacity(Math.min(1, closing.intro * 4))
        } else {
          joinSwarm.setMorph('text', 'text', 1)
          joinSwarm.setOpacity(closing.hold) // 0 hides the points
        }
        joinSwarm.setPointer(pointerSmooth.x, -pointerSmooth.y)
      }

      const frame = { time: paused ? frozenTime : time, dt }
      sky.update?.(frame)
      house.update?.(frame)
      car.update?.(frame)
      cable.update?.(frame)
      flows.update?.(frame)
      if (city.object.visible) city.update?.(frame)
      if (factory.object.visible) factory.update?.(frame)
      if (depot.object.visible) depot.update?.(frame)
      if (swarm?.object.visible) swarm.update?.(frame)
      if (joinSwarm?.object.visible) joinSwarm.update?.(frame)
    },
  }
  return director
}
