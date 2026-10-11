// Fleet depot for the fleet chapter: a fenced 40 × 30 m yard with a PV carport over six
// charging bays, a transformer kiosk and a sliding gate. Two vans and two light box trucks
// are built like car.ts (extruded side profiles with deep bevels, satin clearcoat paint, a
// blacked-out glasshouse drawn in the paint shader); the two company cars are car.ts itself.
// A ring on the ground around each bay shows what that vehicle is doing — indigo = charging
// from the grid, amber = from the sun, teal = lending, grey = holding — with ripples that
// travel in the direction energy moves; a channel from the kiosk carries the net flow. When a
// vehicle leaves it unplugs and drives out through the gate. Local origin = yard centre,
// +z = the gate side; vehicles park nose-out (towards +z).
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { palette } from '../core/palette.ts'
import { FLEET, simulateFleet, sampleFleet, type FleetAction, type VehicleKind } from '../sim/fleet.ts'
import { create as createCar, type CarMode, type ChargeSource } from './car.ts'
import { create as createCable, type Cable } from './cable.ts'
import type { Frame, Preview, SceneContext, SceneModule } from './types.ts'

export const preview: Preview = { camera: [27, 9.5, 30], target: [0, 2.2, -6], hour: 22 }

export interface DepotVehicleState {
  action: FleetAction
  /** State of charge, 0–1. */
  soc: number
  /** Where charging energy comes from (default: the grid). */
  source?: ChargeSource
  /** Scroll-synced drive-out, 0 parked … 1 gone. Omit it to animate on 'away' instead. */
  leave?: number
}

export interface DepotOptions {
  /** Floating diorama base under the yard (default true). */
  island?: boolean
}

export interface Depot extends SceneModule {
  /** One state per vehicle, in FLEET order (src/sim/fleet.ts). */
  setState(states: readonly DepotVehicleState[]): void
  /** 0 = day, 1 = night: canopy lights, light pools, mast lights, office glow. */
  setNight(t: number): void
  /** 0–1 PV output: the canopy modules shimmer while producing. */
  setSolar(t: number): void
  /** Depot-local anchors for labels and camera targets. */
  readonly anchors: { bays: THREE.Vector3[]; canopy: THREE.Vector3; kiosk: THREE.Vector3; gate: THREE.Vector3 }
}

const YARD_X = 20
const YARD_Z = 15
const BAY_W = 4.4
const REAR_Z = -12.6
const CANOPY = { x: 13.7, z0: -14.4, z1: -4.6, yFront: 4.85, yBack: 5.5, t: 0.24 }
const GATE = { x0: 9, x1: 17, z: YARD_Z }
const ROAD = { z0: 18, z1: 24, lane: 22.4 }
const EDGE = 26
const UNPLUG = 0.12
const LEAVE_SECONDS = 4.5
const slotX = (s: number) => (s - 2.5) * BAY_W

const RING_COLORS = {
  grid: new THREE.Color(palette.grid),
  solar: new THREE.Color(palette.solar),
  energy: new THREE.Color(palette.energy),
  hold: new THREE.Color('#94a3b8'),
}

// ---------------------------------------------------------------- geometry helpers

/** Bevelled extrusion of a side profile across the width: smooth bevels, flat sides. */
function extrude(shape: THREE.Shape, width: number, round: number, roundIn: number, segments = 6): THREE.BufferGeometry {
  const depth = width - 2 * round
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: round,
    bevelSize: roundIn,
    bevelOffset: -roundIn,
    bevelSegments: segments,
    curveSegments: 40,
  })
  geo.translate(0, 0, -depth / 2)
  // ExtrudeGeometry is flat-shaded: weld the bevelled walls, keep the big side caps flat.
  const pos = geo.attributes.position.array as Float32Array
  const pick = (index: number) => {
    const groups = geo.groups.filter((g) => g.materialIndex === index)
    const out = new Float32Array(groups.reduce((n, g) => n + g.count * 3, 0))
    let o = 0
    for (const g of groups) {
      out.set(pos.subarray(g.start * 3, (g.start + g.count) * 3), o)
      o += g.count * 3
    }
    const part = new THREE.BufferGeometry()
    part.setAttribute('position', new THREE.BufferAttribute(out, 3))
    return part
  }
  const caps = pick(0)
  caps.computeVertexNormals()
  const walls = toCreasedNormals(pick(1), THREE.MathUtils.degToRad(35))
  geo.dispose()
  return mergeGeometries([caps, walls]) as THREE.BufferGeometry
}

function tireGeometry(r: number, w: number): THREE.LatheGeometry {
  const k = r / 0.37
  const h = w / 2
  const pts = [
    [0.25 * k, -h * 0.92],
    [0.325 * k, -h],
    [0.358 * k, -h * 0.82],
    [r, -h * 0.45],
    [r + 0.004, 0],
    [r, h * 0.45],
    [0.358 * k, h * 0.82],
    [0.325 * k, h],
    [0.25 * k, h * 0.92],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const geo = new THREE.LatheGeometry(pts, 48)
  geo.rotateX(Math.PI / 2)
  return geo
}

function rimGeometry(r: number): THREE.LatheGeometry {
  const k = r / 0.37
  const pts = [
    [0.0, 0.074],
    [0.05 * k, 0.073],
    [0.13 * k, 0.064],
    [0.21 * k, 0.054],
    [0.252 * k, 0.066],
    [0.252 * k, -0.1],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const geo = new THREE.LatheGeometry(pts, 48)
  geo.rotateX(Math.PI / 2)
  return geo
}

function roundedRect(w: number, d: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -d / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + d - r)
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d)
  s.lineTo(x + r, y + d)
  s.quadraticCurveTo(x, y + d, x, y + d - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

function box(w: number, h: number, d: number, mat: THREE.Material, r = 0.02): THREE.Mesh {
  const mesh = new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

// Instanced meshes get their own copy of a material: when one material alternates between
// instanced and plain meshes, three rebuilds its program parameters on every draw.
const instancedCopies = new WeakMap<THREE.Material, THREE.Material>()

/** Instanced boxes from [x, y, z, sx, sy, sz] rows (unit box scaled per instance), drawn with a shared copy of `mat`. */
function boxes(rows: number[][], mat: THREE.Material, shadow = true): THREE.InstancedMesh {
  let own = instancedCopies.get(mat)
  if (!own) instancedCopies.set(mat, (own = mat.clone()))
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), own, rows.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  rows.forEach(([x, y, z, sx, sy, sz], i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz))))
  mesh.castShadow = shadow
  mesh.receiveShadow = true
  return mesh
}

// ---------------------------------------------------------------- shaders

const MASK_HELPERS = /* glsl */ `
  varying vec3 vObj;
  varying vec3 vObjN;
  float aaStep(float edge, float x) { float w = fwidth(x); return smoothstep(edge - w, edge + w, x); }
  float rrect(vec2 p, vec2 lo, vec2 hi, float r) {
    vec2 q = abs(p - (lo + hi) * 0.5) - (hi - lo) * 0.5 + r;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    float w = fwidth(d);
    return 1.0 - smoothstep(-w, w, d);
  }
  float seam(float x, float c, float hw) { float d = abs(x - c) - hw; float w = fwidth(d); return 1.0 - smoothstep(-w, w, d); }
`

/**
 * Satin clearcoat paint whose shader blacks out glass, cladding and panel seams from the
 * object-space position, so the windows need no extra geometry. `mask` sets glassM, darkM
 * and seamM from p (position) and n (normal).
 */
function paintMaterial(key: string, color: string, mask: string): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.08 })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;\nvObjN = normal;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${MASK_HELPERS}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 p = vObj;
        vec3 n = normalize(vObjN);
        float glassM = 0.0;
        float darkM = 0.0;
        float seamM = 0.0;
        ${mask}
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.033, 0.04), darkM);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.008, 0.011, 0.018), glassM);
        diffuseColor.rgb *= 1.0 - seamM * 0.75;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(roughnessFactor, 0.6, darkM), 0.05, glassM);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = mix(mix(metalnessFactor, 0.0, darkM), 0.35, glassM);`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        material.clearcoat *= 1.0 - darkM * 0.85;`,
      )
  }
  mat.customProgramCacheKey = () => `depot-paint-${key}`
  return mat
}

// Van (5.45 m): windscreen + cab windows as one dark band, rear door windows, black lower
// cladding, gloss-black front panel, door seams.
const VAN_MASK = /* glsl */ `
  float side = step(0.6, abs(n.z));
  float frontF = step(0.3, n.x) * (1.0 - side);
  glassM = rrect(p.xy, vec2(0.36, 1.4), vec2(3.2, 2.33), 0.1) * (1.0 - step(0.92, n.y));
  glassM = max(glassM, step(0.6, -n.x) * rrect(vec2(abs(p.z), p.y), vec2(0.07, 1.62), vec2(0.82, 2.28), 0.06));
  glassM = max(glassM, frontF * rrect(vec2(abs(p.z), p.y), vec2(-0.8, 0.66), vec2(0.74, 0.98), 0.08));
  darkM = 1.0 - aaStep(0.62, p.y);
  seamM = side * seam(p.x, 0.34, 0.006) * step(0.62, p.y) * step(p.y, 1.4);
  seamM = max(seamM, side * seam(p.x, 1.3, 0.006) * step(0.8, p.y) * step(p.y, 1.4));
  seamM = max(seamM, side * seam(p.x, -0.98, 0.006) * step(0.62, p.y) * step(p.y, 2.26));
  seamM = max(seamM, side * seam(p.y, 2.24, 0.006) * step(-2.55, p.x) * step(p.x, -0.98));
  seamM = max(seamM, step(0.6, -n.x) * seam(p.z, 0.0, 0.006) * step(0.62, p.y) * step(p.y, 2.36));
`

// Light truck cab (cab-over): windscreen + side windows, gloss front panel, bumper, door seam.
const CAB_MASK = /* glsl */ `
  float side = step(0.6, abs(n.z));
  float frontF = step(0.3, n.x) * (1.0 - side);
  glassM = rrect(p.xy, vec2(2.36, 1.74), vec2(4.2, 2.7), 0.1) * (1.0 - step(0.92, n.y));
  glassM = max(glassM, frontF * rrect(vec2(abs(p.z), p.y), vec2(-0.95, 0.98), vec2(0.9, 1.5), 0.08));
  darkM = 1.0 - aaStep(0.86, p.y);
  seamM = side * seam(p.x, 2.26, 0.006) * step(0.86, p.y) * step(p.y, 2.82);
`

// Box body: vertical panel joints on the sides, roller-shutter slats at the back.
const BOX_MASK = /* glsl */ `
  float side = step(0.6, abs(n.z));
  float back = step(0.6, -n.x);
  float joint = abs(fract((p.x + 0.12) / 1.27) - 0.5);
  seamM = side * (1.0 - aaStep(0.004, joint * 1.27)) * 0.6;
  float slat = abs(fract(p.y / 0.11) - 0.5) * 0.11;
  seamM = max(seamM, back * (1.0 - aaStep(0.003, slat)) * step(abs(p.z), 1.08) * step(1.06, p.y) * 0.45);
  darkM = back * step(p.y, 1.06);
`

const GAUGE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const GAUGE_FRAG = /* glsl */ `
  uniform float uFill;
  uniform float uTime;
  uniform float uPulse;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
    float filled = step(vUv.x, uFill);
    float head = smoothstep(0.035, 0.0, abs(vUv.x - uFill)) * 1.5;
    float flow = 0.55 + 0.45 * sin(vUv.x * 18.0 - uTime * 3.0) * uPulse;
    vec3 col = uColor * (filled * (1.6 + flow) + head * 3.0) + vec3(0.05) * (1.0 - filled);
    gl_FragColor = vec4(col * edge, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const LOCAL_VERT = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Bay ring: a rounded-rectangle outline with a soft halo; while energy flows, ripples travel
// outwards (lending) or inwards (charging) through a band around it.
const RING_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec2 uHalf;
  uniform float uRadius;
  uniform float uOn;
  uniform float uFlow;
  uniform float uDir;
  uniform float uTime;
  varying vec2 vPos;
  void main() {
    vec2 q = abs(vPos) - uHalf + uRadius;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
    float aa = fwidth(d);
    float line = 1.0 - smoothstep(0.04 - aa, 0.04 + aa, abs(d));
    float halo = exp(-abs(d) * 5.0) * 0.32;
    float inside = (1.0 - smoothstep(-aa, aa, d)) * exp(d * 1.2) * 0.07;
    float band = clamp(d / 1.1, 0.0, 1.0);
    float ph = fract(band * 1.7 - uTime * 0.5 * uDir);
    float ripple = smoothstep(0.0, 0.1, ph) * smoothstep(0.3, 0.1, ph) * (1.0 - band) * step(0.0, d) * uFlow;
    float a = (line * (0.9 + uFlow * 0.7) + halo * (0.5 + uFlow * 0.8) + inside * (0.4 + uFlow) + ripple * 0.75) * uOn;
    gl_FragColor = vec4(uColor * 2.9, clamp(a, 0.0, 2.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

// Soft cool light pools under the canopy LEDs, plus the two mast lights.
const POOL_FRAG = /* glsl */ `
  uniform float uNight;
  uniform float uBays[6];
  uniform float uZ;
  varying vec2 vPos;
  void main() {
    float pool = 0.0;
    for (int i = 0; i < 6; i++) {
      vec2 d = (vPos - vec2(uBays[i], uZ)) / vec2(2.3, 4.6);
      pool += exp(-dot(d, d) * 1.4);
    }
    gl_FragColor = vec4(vec3(0.78, 0.86, 1.0) * pool * 0.16 * uNight, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
const SPOT_FRAG = /* glsl */ `
  uniform float uNight;
  uniform vec3 uColor;
  varying vec2 vPos;
  void main() {
    float r = length(vPos) / 9.0;
    gl_FragColor = vec4(uColor * exp(-r * r * 3.0) * 0.22 * uNight, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

// Net energy between the kiosk and the chargers: dashes run along the channel towards the
// vehicles (grid import, indigo) or towards the kiosk (lending, teal).
const CHANNEL_VERT = /* glsl */ `
  attribute float aS;
  varying float vS;
  varying vec2 vUv;
  void main() {
    vS = aS;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const CHANNEL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOn;
  uniform float uDir;
  uniform float uTime;
  varying float vS;
  varying vec2 vUv;
  void main() {
    float across = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
    float ph = fract(vS * 0.32 - uTime * 0.9 * uDir);
    float dash = smoothstep(0.0, 0.08, ph) * smoothstep(0.42, 0.12, ph);
    gl_FragColor = vec4(uColor * 3.0, (0.18 + dash * 1.1) * across * uOn);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

// ---------------------------------------------------------------- vehicles

interface Rig {
  object: THREE.Group
  /** Charge inlet; its position is in `object`'s frame (a child, or inside an identity group). */
  port: THREE.Object3D
  /** Local x of the rear bumper (negative). */
  rear: number
  length: number
  width: number
  wheelR: number
  setSoc(v: number): void
  setMode(mode: CarMode, source: ChargeSource): void
  setLights(v: number): void
  setWheelSpin(v: number): void
  update(frame: Frame): void
}

interface Shared {
  tire: THREE.Material
  rim: THREE.Material
  truckRim: THREE.Material
  trim: THREE.Material
  darkGloss: THREE.Material
  vanPaint: THREE.Material
  cabPaint: THREE.Material
  boxPaint: THREE.Material
  steel: THREE.Material
}

function vanProfile(): THREE.Shape {
  const sill = 0.36
  const s = new THREE.Shape()
  s.moveTo(2.58, sill)
  s.bezierCurveTo(2.7, sill + 0.02, 2.75, 0.6, 2.74, 0.86) // bumper
  s.bezierCurveTo(2.73, 1.02, 2.62, 1.14, 2.38, 1.22) // short bonnet
  s.lineTo(2.04, 1.3)
  s.lineTo(1.3, 2.3) // raked windscreen
  s.bezierCurveTo(1.16, 2.48, 1.0, 2.55, 0.7, 2.55)
  s.lineTo(-2.5, 2.55)
  s.bezierCurveTo(-2.66, 2.55, -2.72, 2.49, -2.72, 2.36)
  s.lineTo(-2.72, 0.56)
  s.bezierCurveTo(-2.72, 0.42, -2.69, sill, -2.6, sill)
  s.lineTo(-1.62 - 0.44, sill)
  s.absarc(-1.62, sill, 0.44, Math.PI, 0, true)
  s.lineTo(1.72 - 0.44, sill)
  s.absarc(1.72, sill, 0.44, Math.PI, 0, true)
  s.lineTo(2.58, sill)
  return s
}

function cabProfile(): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(3.48, 0.5)
  s.bezierCurveTo(3.58, 0.52, 3.62, 0.62, 3.62, 0.78)
  s.lineTo(3.6, 1.62)
  s.lineTo(3.5, 2.64)
  s.bezierCurveTo(3.47, 2.86, 3.36, 2.95, 3.14, 2.95)
  s.lineTo(1.78, 2.95)
  s.bezierCurveTo(1.68, 2.95, 1.62, 2.9, 1.62, 2.8)
  s.lineTo(1.62, 0.5)
  s.lineTo(2.3 - 0.56, 0.5)
  s.absarc(2.3, 0.5, 0.56, Math.PI, 0, true)
  s.lineTo(3.48, 0.5)
  return s
}

function lightBar(points: THREE.Vector3[], radius: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, radius, 8, false), mat)
}

/** Wheel at (x, axle side), spinning group inside; dual = twin rear tyres. */
function addWheel(parent: THREE.Object3D, sh: Shared, x: number, z: number, side: number, r: number, w: number, dual: boolean, rim: THREE.Material, spinners: THREE.Object3D[], tireGeo: THREE.BufferGeometry, rimGeo: THREE.BufferGeometry) {
  const hub = new THREE.Group()
  hub.position.set(x, r, z)
  const spin = new THREE.Group()
  const offsets = dual ? [-(w / 2 + 0.012), w / 2 + 0.012] : [0]
  for (const o of offsets) {
    const tire = new THREE.Mesh(tireGeo, sh.tire)
    tire.position.z = o
    tire.castShadow = true
    spin.add(tire)
  }
  const face = new THREE.Mesh(rimGeo, rim)
  face.scale.z = side
  face.position.z = dual ? side * (w / 2 + 0.012) : 0
  spin.add(face)
  hub.add(spin)
  parent.add(hub)
  spinners.push(spin)
}

function chargePort(): { group: THREE.Group; mat: THREE.MeshBasicMaterial } {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.energy) })
  const group = new THREE.Group()
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.011, 10, 32), mat)
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.052, 24), new THREE.MeshStandardMaterial({ color: '#0d1117', roughness: 0.5 }))
  group.add(cap, ring)
  return { group, mat }
}

function gauge(length: number): { mat: THREE.ShaderMaterial; geo: THREE.PlaneGeometry } {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uFill: { value: 0.6 }, uTime: { value: 0 }, uPulse: { value: 0 }, uColor: { value: new THREE.Color(palette.energy) } },
    vertexShader: GAUGE_VERT,
    fragmentShader: GAUGE_FRAG,
  })
  return { mat, geo: new THREE.PlaneGeometry(length, 0.035) }
}

/** Shared behaviour of the procedural van and truck rigs. */
function rigControls(
  group: THREE.Group,
  port: { group: THREE.Group; mat: THREE.MeshBasicMaterial },
  gaugeMat: THREE.ShaderMaterial,
  head: THREE.MeshBasicMaterial,
  tail: THREE.MeshBasicMaterial,
  spinners: THREE.Object3D[],
  dims: { rear: number; length: number; width: number; wheelR: number },
): Rig {
  let mode: CarMode = 'idle'
  let modeColor: string = palette.energy
  let speed = 0
  return {
    object: group,
    port: port.group,
    ...dims,
    setSoc(v) {
      gaugeMat.uniforms.uFill.value = THREE.MathUtils.clamp(v, 0, 1)
    },
    setMode(m, source) {
      mode = m
      modeColor = m === 'charging' ? (source === 'grid' ? palette.grid : palette.solar) : palette.energy
      gaugeMat.uniforms.uPulse.value = m === 'idle' ? 0 : 1
    },
    setLights(v) {
      const on = THREE.MathUtils.clamp(v, 0, 1)
      head.color.set('#e9fbff').multiplyScalar(0.5 + on * 3.4)
      tail.color.set('#ff2d55').multiplyScalar(0.45 + on * 2.6)
    },
    setWheelSpin(v) {
      speed = v
    },
    update({ time, dt }) {
      gaugeMat.uniforms.uTime.value = time
      for (const s of spinners) s.rotation.z -= speed * dt
      const pulse = mode === 'idle' ? 1 : 1.6 + Math.sin(time * 5) * 1.2
      port.mat.color.set(modeColor).multiplyScalar(pulse)
    },
  }
}

function buildVan(sh: Shared): Rig {
  const W = 2.0
  const R = 0.36
  const group = new THREE.Group()
  group.name = 'van'
  const shape = vanProfile()
  const body = new THREE.Mesh(extrude(shape, W, 0.15, 0.1, 7), sh.vanPaint)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const spinners: THREE.Object3D[] = []
  const tireGeo = tireGeometry(R, 0.24)
  const rimGeo = rimGeometry(R)
  for (const x of [-1.62, 1.72]) {
    for (const side of [-1, 1]) addWheel(group, sh, x, side * (W / 2 - 0.15), side, R, 0.24, false, sh.rim, spinners, tireGeo, rimGeo)
  }

  // Mirrors on short stalks at the A-pillars.
  for (const side of [-1, 1]) {
    const mirror = box(0.12, 0.3, 0.09, sh.darkGloss, 0.035)
    mirror.position.set(1.86, 1.62, side * (W / 2 + 0.13))
    const stalk = box(0.05, 0.04, 0.16, sh.trim, 0)
    stalk.position.set(1.9, 1.5, side * (W / 2 + 0.05))
    group.add(mirror, stalk)
  }

  const head = new THREE.MeshBasicMaterial({ color: '#e9fbff' })
  const tail = new THREE.MeshBasicMaterial({ color: '#ff2d55' })
  group.add(lightBar([-0.86, -0.5, 0, 0.5, 0.86].map((z) => new THREE.Vector3(2.71 - Math.pow(Math.abs(z) / 0.86, 2) * 0.06, 1.05, z)), 0.018, head))
  for (const side of [-1, 1]) {
    group.add(lightBar([new THREE.Vector3(-2.727, 0.74, side * 0.84), new THREE.Vector3(-2.727, 1.52, side * 0.84)], 0.022, tail))
  }

  const g = gauge(2.3)
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(g.geo, g.mat)
    strip.position.set(0.05, 0.69, side * (W / 2 + 0.006))
    if (side < 0) strip.rotation.y = Math.PI
    group.add(strip)
  }

  const port = chargePort()
  port.group.position.set(-2.08, 0.98, W / 2 + 0.005)
  group.add(port.group)
  const rig = rigControls(group, port, g.mat, head, tail, spinners, { rear: -2.72, length: 5.46, width: W, wheelR: R })
  rig.setLights(0)
  return rig
}

function buildTruck(sh: Shared): Rig {
  const R = 0.42
  const group = new THREE.Group()
  group.name = 'truck'

  const cab = new THREE.Mesh(extrude(cabProfile(), 2.3, 0.13, 0.09, 7), sh.cabPaint)
  cab.castShadow = true
  cab.receiveShadow = true
  group.add(cab)

  const body = new THREE.Mesh(new RoundedBoxGeometry(5.06, 2.42, 2.45, 3, 0.07), sh.boxPaint)
  body.position.set(-1.07, 2.2, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // Chassis rails, battery packs between the axles, rear underrun bar, step, inlet housing.
  const rails = box(5.3, 0.26, 0.92, sh.trim, 0.03)
  rails.position.set(-0.95, 0.74, 0)
  const packMat = new THREE.MeshStandardMaterial({ color: '#2a3038', roughness: 0.45, metalness: 0.55 })
  group.add(rails)
  for (const side of [-1, 1]) {
    const pack = box(2.5, 0.6, 0.44, packMat, 0.05)
    pack.position.set(0.25, 0.66, side * 0.74)
    group.add(pack)
  }
  const bar = box(0.12, 0.16, 2.2, sh.trim, 0.03)
  bar.position.set(-3.52, 0.62, 0)
  const inlet = box(0.4, 0.3, 0.16, sh.trim, 0.03)
  inlet.position.set(-2.92, 0.86, 1.0)
  group.add(bar, inlet)

  const spinners: THREE.Object3D[] = []
  const tireGeo = tireGeometry(R, 0.28)
  const rimGeo = rimGeometry(R)
  for (const side of [-1, 1]) {
    addWheel(group, sh, 2.3, side * (2.3 / 2 - 0.17), side, R, 0.28, false, sh.truckRim, spinners, tireGeo, rimGeo)
    addWheel(group, sh, -1.7, side * (2.3 / 2 - 0.3), side, R, 0.28, true, sh.truckRim, spinners, tireGeo, rimGeo)
  }

  for (const side of [-1, 1]) {
    const arm = box(0.05, 0.05, 0.3, sh.trim, 0)
    arm.position.set(3.38, 2.3, side * 1.27)
    const mirror = box(0.1, 0.46, 0.18, sh.darkGloss, 0.04)
    mirror.position.set(3.36, 2.18, side * 1.42)
    group.add(arm, mirror)
  }

  const head = new THREE.MeshBasicMaterial({ color: '#e9fbff' })
  const tail = new THREE.MeshBasicMaterial({ color: '#ff2d55' })
  group.add(lightBar([-1.0, -0.5, 0, 0.5, 1.0].map((z) => new THREE.Vector3(3.6 - Math.pow(Math.abs(z), 2) * 0.03, 1.62, z)), 0.02, head))
  for (const side of [-1, 1]) {
    group.add(lightBar([new THREE.Vector3(-3.59, 0.66, side * 0.72), new THREE.Vector3(-3.59, 0.66, side * 1.02)], 0.026, tail))
  }

  const g = gauge(2.2)
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(g.geo, g.mat)
    strip.position.set(0.25, 0.66, side * (0.74 + 0.22 + 0.004))
    if (side < 0) strip.rotation.y = Math.PI
    group.add(strip)
  }

  const port = chargePort()
  port.group.position.set(-2.92, 0.86, 1.085)
  group.add(port.group)
  const rig = rigControls(group, port, g.mat, head, tail, spinners, { rear: -3.6, length: 7.22, width: 2.45, wheelR: R })
  rig.setLights(0)
  return rig
}

function buildCar(ctx: SceneContext): Rig {
  const car = createCar(ctx)
  // Parked depot cars need no headlight beams; dropping them also keeps the scene's light
  // count (and so every material's shader program) unchanged when the depot appears.
  const beams: THREE.SpotLight[] = []
  car.object.traverse((o) => {
    if ((o as THREE.SpotLight).isSpotLight) beams.push(o as THREE.SpotLight)
  })
  for (const b of beams) {
    b.removeFromParent()
    b.target.removeFromParent()
  }
  return {
    object: car.object as THREE.Group,
    port: car.chargePort,
    rear: -2.34,
    length: 4.7,
    width: 1.92,
    wheelR: 0.37,
    setSoc: (v) => car.setSoc(v),
    setMode: (m, source) => car.setMode(m, source),
    setLights: (v) => car.setLights(v),
    setWheelSpin: (v) => car.setWheelSpin(v),
    update: (f) => car.update?.(f),
  }
}

// ---------------------------------------------------------------- the depot

export function create(ctx: SceneContext, opts: DepotOptions = {}): Depot {
  const root = new THREE.Group()
  root.name = 'depot'
  const island = opts.island ?? true

  const asphalt = new THREE.MeshStandardMaterial({ color: '#2a2d32', roughness: 0.92 })
  const concrete = new THREE.MeshStandardMaterial({ color: '#4d5157', roughness: 0.88 })
  const kerb = new THREE.MeshStandardMaterial({ color: '#a9a49b', roughness: 0.85 })
  const lawn = new THREE.MeshStandardMaterial({ color: '#33503a', roughness: 0.95 })
  const paintLine = new THREE.MeshStandardMaterial({ color: '#d4d7db', roughness: 0.75 })
  const steel = new THREE.MeshStandardMaterial({ color: '#30363f', roughness: 0.45, metalness: 0.6 })
  const charger = new THREE.MeshPhysicalMaterial({ color: '#e8ebee', roughness: 0.32, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.2 })
  const darkGloss = new THREE.MeshPhysicalMaterial({ color: '#0b0f16', roughness: 0.12, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 })
  const sh: Shared = {
    tire: new THREE.MeshStandardMaterial({ color: palette.tire, roughness: 0.85 }),
    rim: new THREE.MeshPhysicalMaterial({ color: palette.rim, roughness: 0.34, metalness: 0.85, clearcoat: 0.4, side: THREE.DoubleSide }),
    truckRim: new THREE.MeshPhysicalMaterial({ color: '#5b626c', roughness: 0.4, metalness: 0.8, clearcoat: 0.3, side: THREE.DoubleSide }),
    trim: new THREE.MeshStandardMaterial({ color: '#16191e', roughness: 0.6, metalness: 0.2 }),
    darkGloss,
    vanPaint: paintMaterial('van', '#eef1f4', VAN_MASK),
    cabPaint: paintMaterial('cab', '#eef1f4', CAB_MASK),
    boxPaint: paintMaterial('box', '#e6e9ec', BOX_MASK),
    steel,
  }

  // ---------- ground: yard, canopy slab, road, island
  const yard = box(YARD_X * 2, 0.1, YARD_Z * 2, asphalt, 0)
  yard.position.set(0, -0.03, 0)
  yard.castShadow = false
  root.add(yard)
  const slab = box(CANOPY.x * 2 + 0.4, 0.04, CANOPY.z1 - CANOPY.z0 + 0.4, concrete, 0)
  slab.position.set(0, 0.03, (CANOPY.z0 + CANOPY.z1) / 2)
  slab.castShadow = false
  root.add(slab)
  {
    const lines: number[][] = []
    for (let s = 0; s <= 6; s++) lines.push([slotX(s) - BAY_W / 2, 0.055, -8.95, 0.1, 0.01, 8.3])
    for (let i = 0; i < 9; i++) lines.push([-12 + i * 2.6, 0.03, 1.6, 1.3, 0.01, 0.12]) // aisle centre dashes
    lines.push([13, 0.03, 11.6, 0.14, 0.01, 4.2], [13, 0.03, 8.2, 0.14, 0.01, 1.4]) // gate lane
    root.add(boxes(lines, paintLine, false))
    // exit arrow in the gate lane
    const a = new THREE.Shape()
    a.moveTo(-0.32, -1.1)
    a.lineTo(0.32, -1.1)
    a.lineTo(0.32, 0.2)
    a.lineTo(0.75, 0.2)
    a.lineTo(0, 1.1)
    a.lineTo(-0.75, 0.2)
    a.lineTo(-0.32, 0.2)
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(a), paintLine)
    arrow.rotation.x = -Math.PI / 2
    arrow.position.set(14.9, 0.03, 10.5)
    root.add(arrow)
  }
  const drive = box(GATE.x1 - GATE.x0, 0.1, ROAD.z0 - YARD_Z + 0.1, asphalt, 0)
  drive.position.set((GATE.x0 + GATE.x1) / 2, -0.03, (YARD_Z + ROAD.z0) / 2)
  drive.castShadow = false
  const road = box(EDGE * 2, 0.1, ROAD.z1 - ROAD.z0, asphalt, 0)
  road.position.set(0, -0.03, (ROAD.z0 + ROAD.z1) / 2)
  road.castShadow = false
  root.add(drive, road)
  {
    const walk: number[][] = [
      [(-EDGE + GATE.x0) / 2, 0.03, (YARD_Z + ROAD.z0) / 2 + 0.2, EDGE + GATE.x0, 0.12, ROAD.z0 - YARD_Z - 0.4],
      [(EDGE + GATE.x1) / 2, 0.03, (YARD_Z + ROAD.z0) / 2 + 0.2, EDGE - GATE.x1, 0.12, ROAD.z0 - YARD_Z - 0.4],
    ]
    root.add(boxes(walk, kerb, false))
    const dash: number[][] = []
    for (let i = 0; i < 10; i++) dash.push([-23 + i * 5.2, 0.025, (ROAD.z0 + ROAD.z1) / 2, 2.2, 0.01, 0.12])
    root.add(boxes(dash, paintLine, false))
  }
  if (island) {
    const W = EDGE * 2
    const D = 46.5
    const cz = 3.25
    const layer = (inset: number, thick: number, y: number, mat: THREE.Material) => {
      const geo = new THREE.ExtrudeGeometry(roundedRect(W - inset * 2, D - inset * 2, 2.2), {
        depth: thick,
        bevelEnabled: true,
        bevelThickness: 0.08,
        bevelSize: 0.08,
        bevelSegments: 3,
        curveSegments: 12,
      })
      geo.rotateX(Math.PI / 2)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(0, y, cz)
      mesh.receiveShadow = true
      root.add(mesh)
    }
    layer(0, 0.18, -0.09, lawn)
    layer(0.05, 1.1, -0.3, new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 1 }))
    layer(0.4, 0.8, -1.4, new THREE.MeshStandardMaterial({ color: '#1d1f24', roughness: 1 }))
  } else {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), lawn)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.09
    ground.receiveShadow = true
    root.add(ground)
  }

  // ---------- fence (double-bar mesh drawn in the shader) and sliding gate
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#3a4049', roughness: 0.5, metalness: 0.6, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  fenceMat.defines = { USE_UV: '' }
  fenceMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        vec2 g = vUv / vec2(0.2, 0.2);
        vec2 f = abs(fract(g) - 0.5);
        vec2 w = fwidth(g);
        float vx = 1.0 - smoothstep(0.03 - w.x, 0.03 + w.x, 0.5 - f.x);
        float hy = 1.0 - smoothstep(0.07 - w.y, 0.07 + w.y, 0.5 - f.y);
        vx = mix(vx, 0.06, smoothstep(0.2, 0.6, w.x));
        hy = mix(hy, 0.14, smoothstep(0.2, 0.6, w.y));
        float frame = step(vUv.y, 0.04) + step(1.9, vUv.y);
        diffuseColor.a = clamp(max(max(vx, hy), frame), 0.0, 1.0) * 0.95;
      }`,
    )
  }
  fenceMat.customProgramCacheKey = () => 'depot-fence'
  const fenceH = 1.95
  const panel = (len: number) => {
    const geo = new THREE.PlaneGeometry(len, fenceH)
    const uv = geo.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * fenceH)
    return new THREE.Mesh(geo, fenceMat)
  }
  const fence: [number, number, number, number][] = [
    // [x0, z0, x1, z1] runs; the south side leaves the gate open
    [-YARD_X, -YARD_Z, YARD_X, -YARD_Z],
    [YARD_X, -YARD_Z, YARD_X, YARD_Z],
    [YARD_X, YARD_Z, GATE.x1, YARD_Z],
    [GATE.x0, YARD_Z, -YARD_X, YARD_Z],
    [-YARD_X, YARD_Z, -YARD_X, -YARD_Z],
  ]
  const posts: number[][] = []
  for (const [x0, z0, x1, z1] of fence) {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const mesh = panel(len)
    mesh.position.set((x0 + x1) / 2, fenceH / 2 + 0.03, (z0 + z1) / 2)
    mesh.rotation.y = Math.atan2(-(z1 - z0), x1 - x0)
    root.add(mesh)
    const n = Math.round(len / 2.5)
    for (let i = 0; i <= n; i++) posts.push([x0 + ((x1 - x0) * i) / n, fenceH / 2 + 0.05, z0 + ((z1 - z0) * i) / n, 0.07, fenceH + 0.1, 0.07])
  }
  posts.push([GATE.x0, 1.1, GATE.z, 0.16, 2.2, 0.16], [GATE.x1, 1.1, GATE.z, 0.16, 2.2, 0.16])
  root.add(boxes(posts, steel))
  const gate = new THREE.Group()
  {
    const len = GATE.x1 - GATE.x0
    const mesh = panel(len)
    mesh.position.set(len / 2, fenceH / 2 + 0.12, 0)
    const frame = boxes(
      [
        [len / 2, 0.12, 0, len + 0.6, 0.12, 0.1],
        [len / 2, fenceH + 0.12, 0, len, 0.06, 0.06],
        [0, fenceH / 2 + 0.12, 0, 0.06, fenceH, 0.06],
        [len, fenceH / 2 + 0.12, 0, 0.06, fenceH, 0.06],
      ],
      steel,
    )
    gate.add(mesh, frame)
    gate.position.set(GATE.x0, 0, GATE.z - 0.18)
    root.add(gate)
  }

  // ---------- PV carport: columns, beams, tilted deck with a module grid, LED strips
  const canopy = new THREE.Group()
  const depth = CANOPY.z1 - CANOPY.z0
  const tilt = Math.atan2(CANOPY.yBack - CANOPY.yFront, depth)
  const colX = [-3, -1, 1, 3].map((k) => (k * BAY_W) / 1)
  {
    const cols: number[][] = []
    for (const x of colX) {
      for (const [z, top] of [
        [CANOPY.z0 + 0.5, CANOPY.yBack - 0.42],
        [CANOPY.z1 - 0.5, CANOPY.yFront - 0.42],
      ]) {
        cols.push([x, top / 2, z, 0.26, top, 0.26])
      }
    }
    root.add(boxes(cols, steel))
  }
  const deck = new THREE.Group()
  deck.position.set(0, (CANOPY.yFront + CANOPY.yBack) / 2, (CANOPY.z0 + CANOPY.z1) / 2)
  deck.rotation.x = -tilt // back (−z) higher, modules face south (+z)
  canopy.add(deck)
  const roofMat = new THREE.MeshStandardMaterial({ color: '#8a9099', roughness: 0.5, metalness: 0.5 })
  const plate = box(CANOPY.x * 2, CANOPY.t, depth, roofMat, 0.05)
  deck.add(plate)
  const beams: number[][] = []
  for (const x of colX) beams.push([x, -CANOPY.t / 2 - 0.16, 0, 0.22, 0.32, depth - 0.2])
  for (const z of [-depth / 2 + 0.5, depth / 2 - 0.5]) beams.push([0, -CANOPY.t / 2 - 0.36, z, CANOPY.x * 2 - 0.4, 0.22, 0.24])
  deck.add(boxes(beams, steel))

  const pvUniforms = { uTime: { value: 0 }, uSolar: { value: 0 } }
  const pvMat = new THREE.MeshPhysicalMaterial({ color: '#0b1630', roughness: 0.26, metalness: 0.5, clearcoat: 0.7, clearcoatRoughness: 0.1 })
  pvMat.defines = { USE_UV: '' }
  const cols = 22
  const rows = 5
  pvMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, pvUniforms)
    shader.fragmentShader =
      'uniform float uTime;\nuniform float uSolar;\n' +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 g = vUv * vec2(${cols}.0, ${rows}.0);
          vec2 f = abs(fract(g) - 0.5);
          float density = max(max(fwidth(g.x), fwidth(g.y)), 1e-4);
          float gap = (1.0 - smoothstep(0.455 - density, 0.48, max(f.x, f.y))) * clamp(1.4 - density * 2.0, 0.0, 1.0);
          vec2 c = fract(g * vec2(6.0, 10.0));
          vec2 cf = abs(c - 0.5);
          float cd = max(max(fwidth(g.x * 6.0), fwidth(g.y * 10.0)), 1e-4);
          float cell = (1.0 - smoothstep(0.46 - cd, 0.49, max(cf.x, cf.y))) * clamp(1.2 - cd * 2.5, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.37, 0.45), max(gap * 0.75, cell * 0.18));`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1.0, 0.68, 0.22) * uSolar * cell * (0.75 + 0.25 * sin(uTime * 1.6 + vUv.y * 6.0)) * 0.12;`,
        )
  }
  pvMat.customProgramCacheKey = () => 'depot-pv'
  const pv = new THREE.Mesh(new THREE.PlaneGeometry(CANOPY.x * 2 - 0.3, depth - 0.3), pvMat)
  pv.rotation.x = -Math.PI / 2
  pv.position.y = CANOPY.t / 2 + 0.012
  pv.receiveShadow = true
  deck.add(pv)

  const leds: number[][] = []
  for (let s = 0; s < 6; s++) leds.push([slotX(s), -CANOPY.t / 2 - 0.02, 0.2, 0.16, 0.03, depth - 2.4])
  leds.push([0, -CANOPY.t / 2 + 0.02, depth / 2 + 0.005, CANOPY.x * 2 - 0.3, 0.035, 0.01]) // fascia line
  const ledBoxes = boxes(leds, new THREE.MeshBasicMaterial({ color: '#e8f1ff' }), false)
  const ledMat = ledBoxes.material as THREE.MeshBasicMaterial // the copy actually drawn; setNight tints it
  deck.add(ledBoxes)
  root.add(canopy)

  // Light pools on the slab under the LEDs, and two mast lights.
  const nightUniform = { value: 0 }
  const pools = new THREE.Mesh(
    new THREE.PlaneGeometry(CANOPY.x * 2 + 4, depth + 6),
    new THREE.ShaderMaterial({
      uniforms: { uNight: nightUniform, uBays: { value: [0, 1, 2, 3, 4, 5].map(slotX) }, uZ: { value: -(CANOPY.z0 + CANOPY.z1) / 2 } },
      vertexShader: LOCAL_VERT,
      fragmentShader: POOL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  pools.rotation.x = -Math.PI / 2
  pools.position.set(0, 0.06, (CANOPY.z0 + CANOPY.z1) / 2)
  root.add(pools)
  const lampMat = new THREE.MeshBasicMaterial({ color: '#f4f8ff' })
  for (const [x, z, dir] of [
    [-19.3, 1.5, 1],
    [19.3, -3, -1],
  ] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 8, 12), steel)
    pole.position.set(x, 4, z)
    pole.castShadow = true
    const arm = box(1.6, 0.08, 0.1, steel, 0)
    arm.position.set(x + dir * 0.7, 7.95, z)
    const lamp = box(0.7, 0.07, 0.26, lampMat, 0)
    lamp.position.set(x + dir * 1.25, 7.88, z)
    const spot = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShaderMaterial({
        uniforms: { uNight: nightUniform, uColor: { value: new THREE.Color('#dfe9ff') } },
        vertexShader: LOCAL_VERT,
        fragmentShader: SPOT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    spot.rotation.x = -Math.PI / 2
    spot.position.set(x + dir * 2.5, 0.07, z)
    root.add(pole, arm, lamp, spot)
  }

  // ---------- transformer kiosk and the channel to the chargers
  const kioskPos = new THREE.Vector3(-17.1, 0, -11.6)
  const kioskBody = box(3.2, 2.5, 2.4, new THREE.MeshStandardMaterial({ color: '#b7b2a8', roughness: 0.85 }), 0.05)
  kioskBody.position.set(kioskPos.x, 1.25, kioskPos.z)
  const kioskRoof = box(3.45, 0.14, 2.65, steel, 0.03)
  kioskRoof.position.set(kioskPos.x, 2.55, kioskPos.z)
  root.add(kioskBody, kioskRoof)
  const louvre = new THREE.MeshStandardMaterial({ color: '#4a5059', roughness: 0.6, metalness: 0.4 })
  for (const dx of [-0.75, 0.75]) {
    const door = box(1.0, 1.95, 0.05, louvre, 0.01)
    door.position.set(kioskPos.x + dx, 1.08, kioskPos.z + 1.21)
    root.add(door)
  }
  const kioskLedMat = new THREE.MeshBasicMaterial({ color: palette.grid })
  const kioskLed = box(2.9, 0.05, 0.04, kioskLedMat, 0)
  kioskLed.position.set(kioskPos.x, 2.34, kioskPos.z + 1.23)
  kioskLed.castShadow = false
  root.add(kioskLed)

  const channelZ = -13.25
  const pedestalX = (s: number) => slotX(s) - BAY_W / 2 + 0.24
  const pedestalZ = -12.05
  const channelGeo = (() => {
    // Quads along the main run (kiosk → last charger) and short spurs to each pedestal; aS is
    // the distance from the kiosk so the dashes continue into the spurs.
    const x0 = kioskPos.x + 1.6
    const segs: [number, number, number, number, number][] = [[x0, channelZ, pedestalX(5), channelZ, 0]]
    for (let s = 0; s < 6; s++) segs.push([pedestalX(s), channelZ, pedestalX(s), pedestalZ - 0.2, pedestalX(s) - x0])
    const pos: number[] = []
    const uv: number[] = []
    const sAttr: number[] = []
    const idx: number[] = []
    const hw = 0.11
    for (const [ax, az, bx, bz, s0] of segs) {
      const len = Math.hypot(bx - ax, bz - az)
      const dx = (bx - ax) / len
      const dz = (bz - az) / len
      const n = Math.max(1, Math.ceil(len / 0.5))
      const base = pos.length / 3
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * len
        for (const side of [-1, 1]) {
          pos.push(ax + dx * t - dz * hw * side, 0.065, az + dz * t + dx * hw * side)
          uv.push(t, side < 0 ? 0 : 1)
          sAttr.push(s0 + t)
        }
        if (i < n) {
          const k = base + i * 2
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
        }
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setAttribute('aS', new THREE.Float32BufferAttribute(sAttr, 1))
    geo.setIndex(idx)
    return geo
  })()
  const channelBase = new THREE.Mesh(channelGeo, new THREE.MeshStandardMaterial({ color: '#15181d', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 }))
  channelBase.position.y = -0.008
  channelBase.receiveShadow = true
  const channelUniforms = { uColor: { value: new THREE.Color(palette.grid) }, uOn: { value: 0 }, uDir: { value: 1 }, uTime: { value: 0 } }
  const channel = new THREE.Mesh(
    channelGeo,
    new THREE.ShaderMaterial({ uniforms: channelUniforms, vertexShader: CHANNEL_VERT, fragmentShader: CHANNEL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  )
  channel.frustumCulled = false
  root.add(channelBase, channel)

  // ---------- small office for drivers (warm windows at night)
  const officeGlass = new THREE.MeshPhysicalMaterial({ color: '#121a26', roughness: 0.07, metalness: 0.3, emissive: '#ffb066', emissiveIntensity: 0 })
  {
    const body = box(9, 3.1, 5, new THREE.MeshStandardMaterial({ color: '#d9d4cc', roughness: 0.85 }), 0.05)
    body.position.set(-14.6, 1.55, 11.4)
    const roof = box(9.3, 0.18, 5.3, steel, 0.03)
    roof.position.set(-14.6, 3.17, 11.4)
    const band = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 1.3), officeGlass)
    band.position.set(-14.2, 1.85, 8.895)
    band.rotation.y = Math.PI
    const side = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.3), officeGlass)
    side.position.set(-10.095, 1.85, 11.4)
    side.rotation.y = Math.PI / 2
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), officeGlass)
    door.position.set(-10.09, 1.1, 9.5)
    door.rotation.y = Math.PI / 2
    root.add(body, roof, band, side, door)
  }

  // ---------- trees outside the fence
  {
    const spots: [number, number, number][] = [
      [-23.4, -17.6, 1.15],
      [-16, -18.2, 0.95],
      [-6.5, -17.9, 1.2],
      [4.5, -18.1, 1.0],
      [15, -17.8, 1.25],
      [23.2, -16.5, 0.95],
      [-23.6, -4, 1.1],
      [-23.2, 8.5, 0.9],
      [23.5, 6.5, 1.05],
    ]
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.19, 2.4, 8), new THREE.MeshStandardMaterial({ color: '#4e3b2e', roughness: 0.9 }), spots.length)
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 3), new THREE.MeshStandardMaterial({ color: '#2f5638', roughness: 0.9 }), spots.length * 2)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    spots.forEach(([x, z, s], i) => {
      trunks.setMatrixAt(i, m.compose(new THREE.Vector3(x, 1.2 * s, z), q, new THREE.Vector3(s, s, s)))
      crowns.setMatrixAt(i * 2, m.compose(new THREE.Vector3(x, 3.3 * s, z), q, new THREE.Vector3(s, s * 1.15, s)))
      crowns.setMatrixAt(i * 2 + 1, m.compose(new THREE.Vector3(x + 0.8 * s, 2.6 * s, z + 0.5 * s), q, new THREE.Vector3(s * 0.66, s * 0.66, s * 0.66)))
    })
    for (const t of [trunks, crowns]) {
      t.castShadow = true
      t.receiveShadow = true
      root.add(t)
    }
  }

  // ---------- bays: vehicles, chargers, rings, cables
  // West → east: trucks, vans, cars (tallest furthest from the gate and the camera).
  const order: VehicleKind[] = ['truck', 'van', 'car']
  const sorted = FLEET.map((v, i) => ({ v, i })).sort((a, b) => order.indexOf(a.v.kind) - order.indexOf(b.v.kind) || a.i - b.i)
  const slotOf = new Array<number>(FLEET.length)
  sorted.forEach((e, s) => (slotOf[e.i] = s))

  const statusMats: THREE.MeshBasicMaterial[] = []
  for (let s = 0; s < 6; s++) {
    const x = pedestalX(s)
    const body = box(0.34, 1.62, 0.3, charger, 0.06)
    body.position.set(x, 0.81, pedestalZ)
    const face = box(0.025, 0.42, 0.22, darkGloss, 0.008)
    face.position.set(x + 0.17, 1.22, pedestalZ)
    const holster = box(0.08, 0.16, 0.12, sh.trim, 0.02)
    holster.position.set(x + 0.19, 0.95, pedestalZ)
    const base = box(0.5, 0.08, 0.46, concrete, 0.02)
    base.position.set(x, 0.07, pedestalZ)
    const mat = new THREE.MeshBasicMaterial({ color: '#94a3b8' })
    const cap = box(0.3, 0.03, 0.26, mat, 0.01)
    cap.position.set(x, 1.63, pedestalZ)
    cap.castShadow = false
    statusMats.push(mat)
    root.add(body, face, holster, base, cap)
    // bollard protecting the charger
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 14), steel)
    bollard.position.set(x, 0.45, pedestalZ + 0.85)
    bollard.castShadow = true
    root.add(bollard)
  }

  interface Bay {
    rig: Rig
    slot: number
    holder: THREE.Group
    path: THREE.CatmullRomCurve3
    pathLen: number
    parked: THREE.Vector3
    socket: THREE.Vector3
    cable: Cable
    ring: THREE.ShaderMaterial
    status: THREE.MeshBasicMaterial
    state: DepotVehicleState
    leave: number
    lastS: number
    color: THREE.Color
    flow: number
    on: number
  }

  const bays: Bay[] = FLEET.map((v, i) => {
    const slot = slotOf[i]
    const rig = v.kind === 'van' ? buildVan(sh) : v.kind === 'truck' ? buildTruck(sh) : buildCar(ctx)
    const holder = new THREE.Group()
    holder.add(rig.object)
    root.add(holder)
    const sx = slotX(slot)
    const cz = REAR_Z - rig.rear
    const parked = new THREE.Vector3(sx, 0, cz)
    const pts = [parked.clone(), new THREE.Vector3(sx, 0, -3)]
    if (sx < 8) pts.push(new THREE.Vector3(sx + 2.2, 0, 0.8), new THREE.Vector3(Math.max(sx + 4.5, 9.4), 0, 1.6))
    pts.push(
      new THREE.Vector3(12.4, 0, 4.6),
      new THREE.Vector3(13, 0, 9.5),
      new THREE.Vector3(13, 0, GATE.z),
      new THREE.Vector3(14.4, 0, 19.4),
      new THREE.Vector3(18.5, 0, ROAD.lane),
      new THREE.Vector3(EDGE - 2.2, 0, ROAD.lane),
    )
    const path = new THREE.CatmullRomCurve3(pts, false, 'centripetal')

    const ringMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: RING_COLORS.hold.clone() },
        uHalf: { value: new THREE.Vector2(rig.width / 2 + 0.42, rig.length / 2 + 0.42) },
        uRadius: { value: 0.75 },
        uOn: { value: 0.5 },
        uFlow: { value: 0 },
        uDir: { value: 1 },
        uTime: { value: 0 },
      },
      vertexShader: LOCAL_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(rig.width + 3.2, rig.length + 3.2), ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.rotation.z = Math.PI / 2 // plane x → vehicle width (world x), plane y → vehicle length (world z)
    ring.position.set(sx, 0.075, cz)
    root.add(ring)

    const cable = createCable(ctx)
    root.add(cable.object)
    const socket = new THREE.Vector3(pedestalX(slot) + 0.23, 0.95, pedestalZ)
    rig.setSoc(v.soc)
    return {
      rig,
      slot,
      holder,
      path,
      pathLen: path.getLength(),
      parked,
      socket,
      cable,
      ring: ringMat,
      status: statusMats[slot],
      state: { action: 'hold', soc: v.soc },
      leave: 0,
      lastS: 0,
      color: RING_COLORS.hold.clone(),
      flow: 0,
      on: 0.5,
    }
  })

  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && !(mesh.material as THREE.Material).transparent && !(mesh.material instanceof THREE.ShaderMaterial)) mesh.receiveShadow = true
  })

  // ---------- state
  let night = 0
  let gateOpen = 0
  let netTarget = 0
  const tmpColor = new THREE.Color()
  const port = new THREE.Vector3()
  const tan = new THREE.Vector3()

  const ringColor = (st: DepotVehicleState) =>
    st.action === 'charge' ? (st.source === 'solar' ? RING_COLORS.solar : RING_COLORS.grid) : st.action === 'discharge' ? RING_COLORS.energy : RING_COLORS.hold

  const setNight = (t: number) => {
    night = THREE.MathUtils.clamp(t, 0, 1)
    nightUniform.value = night
    ledMat.color.set('#e8f1ff').multiplyScalar(0.55 + night * 2.9)
    lampMat.color.set('#f4f8ff').multiplyScalar(0.5 + night * 3.2)
    officeGlass.emissiveIntensity = night * 2.2
  }
  setNight(0)

  const depot: Depot = {
    object: root,
    anchors: {
      bays: bays.map((b) => b.parked.clone().setY(2)),
      canopy: new THREE.Vector3(0, CANOPY.yBack + 1, (CANOPY.z0 + CANOPY.z1) / 2),
      kiosk: kioskPos.clone().setY(3),
      gate: new THREE.Vector3((GATE.x0 + GATE.x1) / 2, 1, GATE.z),
    },
    setState(states) {
      states.forEach((st, i) => {
        const b = bays[i]
        if (!b) return
        b.state = { ...st }
        b.rig.setSoc(st.soc)
        const mode: CarMode = st.action === 'charge' ? 'charging' : st.action === 'discharge' ? 'discharging' : 'idle'
        b.rig.setMode(mode, st.source ?? 'grid')
        const flow = st.action === 'charge' ? 'to-car' : st.action === 'discharge' ? 'to-home' : 'none'
        b.cable.setFlow(flow, st.action === 'charge' ? (st.source === 'solar' ? 'solar' : 'grid') : 'energy')
      })
      let net = 0
      for (const b of bays) net += b.state.action === 'charge' ? 1 : b.state.action === 'discharge' ? -1 : 0
      netTarget = net
    },
    setNight,
    setSolar(t) {
      pvUniforms.uSolar.value = THREE.MathUtils.clamp(t, 0, 1)
    },
    update(frame: Frame) {
      const { time, dt } = frame
      const k = 1 - Math.exp(-dt * 6)
      pvUniforms.uTime.value = time
      channelUniforms.uTime.value = time
      let moving = 0
      for (const b of bays) {
        const st = b.state
        // Drive-out progress: the sampler's scroll-synced value, else a timed animation.
        if (st.leave !== undefined) b.leave = THREE.MathUtils.clamp(st.leave, 0, 1)
        else {
          const goal = st.action === 'away' ? 1 : 0
          const step = dt / LEAVE_SECONDS
          b.leave = goal > b.leave ? Math.min(goal, b.leave + step) : Math.max(goal, b.leave - step)
        }
        // Unplug first; then each bay waits its turn for the gate (nearest goes first).
        const delay = (5 - b.slot) * 0.06
        const plug = 1 - THREE.MathUtils.smoothstep(b.leave, 0, UNPLUG)
        const u = THREE.MathUtils.clamp((b.leave - UNPLUG - delay) / (1 - UNPLUG - delay), 0, 1)
        const eased = u * u * (3 - 2 * u)
        const pt = b.path.getPointAt(eased)
        b.path.getTangentAt(eased, tan)
        b.holder.position.copy(pt)
        b.holder.rotation.set(0, Math.atan2(-tan.z, tan.x), 0)
        b.holder.visible = u < 0.999
        const s = eased * b.pathLen
        const speed = dt > 0 ? (s - b.lastS) / dt : 0
        b.lastS = s
        b.rig.setWheelSpin(speed / b.rig.wheelR)
        b.rig.setLights(u > 0 && u < 0.999 ? 1 : b.leave > 0 ? 0.35 : 0)
        if (u > 0 && u < 0.999) moving++
        b.rig.update(frame)

        // Cable: follows the port while parked, retracts into the charger when leaving.
        if (plug > 0.001) {
          port.copy(b.rig.port.position).applyAxisAngle(THREE.Object3D.DEFAULT_UP, b.holder.rotation.y).add(b.holder.position)
          b.cable.setEnds(b.socket, port)
        }
        b.cable.setPlugged(plug)
        b.cable.update?.(frame)

        // Ring: colour by action, ripples while energy flows, faint outline when the bay is empty.
        const present = 1 - THREE.MathUtils.smoothstep(b.leave, 0, UNPLUG + 0.05)
        const active = (st.action === 'charge' || st.action === 'discharge') && present > 0.5 ? 1 : 0
        b.color.lerp(ringColor(st), k)
        b.flow += (active - b.flow) * k
        const onTarget = present > 0.5 ? (active ? 1 : 0.55) : 0.16
        b.on += (onTarget - b.on) * k
        b.ring.uniforms.uColor.value.copy(b.color)
        b.ring.uniforms.uFlow.value = b.flow
        b.ring.uniforms.uOn.value = b.on * (0.75 + 0.25 * night)
        b.ring.uniforms.uDir.value = st.action === 'charge' ? -1 : 1
        b.ring.uniforms.uTime.value = time
        b.status.color.copy(present > 0.5 ? b.color : RING_COLORS.hold).multiplyScalar(present > 0.5 && active ? 2.8 : 1.1)
      }

      // Net flow along the kiosk channel and the kiosk's indicator.
      const net = netTarget
      channelUniforms.uOn.value += ((net === 0 ? 0 : Math.min(1, 0.45 + Math.abs(net) * 0.11)) - channelUniforms.uOn.value) * k
      if (net !== 0) {
        channelUniforms.uDir.value = net > 0 ? 1 : -1
        channelUniforms.uColor.value.lerp(net > 0 ? RING_COLORS.grid : RING_COLORS.energy, k)
      }
      tmpColor.copy(net > 0 ? RING_COLORS.grid : net < 0 ? RING_COLORS.energy : RING_COLORS.hold)
      kioskLedMat.color.copy(tmpColor).multiplyScalar(net === 0 ? 0.9 : 2.6)

      // The gate slides open while anyone is driving out.
      gateOpen += ((moving > 0 ? 1 : 0) - gateOpen) * (1 - Math.exp(-dt * 2.5))
      gate.position.x = GATE.x0 - gateOpen * (GATE.x1 - GATE.x0 - 0.3)
    },
  }
  return depot
}

/**
 * Playground: &h=18..34 (fleet hour from src/sim/fleet.ts, default 19 = evening peak)
 * &night=0..1 (default from &hour) &solar=0..1 &island=0.
 * The playground has no ticker for the drive-out, so &h snaps the leave values.
 */
export function configure(depot: Depot, p: URLSearchParams): void {
  const hour = Number(p.get('hour') ?? preview.hour)
  const dusk = THREE.MathUtils.smoothstep(hour, 18.5, 21) + 1 - THREE.MathUtils.smoothstep(hour, 5.5, 7.5)
  depot.setNight(Number(p.get('night') ?? THREE.MathUtils.clamp(dusk, 0, 1)))
  if (p.has('solar')) depot.setSolar(Number(p.get('solar')))
  const h = Number(p.get('h') ?? 19)
  depot.setState(sampleFleet(simulateFleet(), h).vehicles)
}
