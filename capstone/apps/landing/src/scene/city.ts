// The V2G neighbourhood: an 11 x 11 grid of plots around the hero home (centre plot left
// empty for the diorama), instanced houses with GPU window lights, instanced parked cars
// with discharge halos, a shader street grid whose "energy veins" pulse towards a
// substation, pylons, and wind turbines on the horizon. Everything animates from uniforms,
// so the per-frame cost is constant.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { palette } from '../core/palette.ts'
import type { Frame, Preview, SceneContext, SceneModule } from './types.ts'

export const preview: Preview = { camera: [120, 150, 210], target: [0, 0, 10], hour: 20 }
export const ownsLighting = false

export interface City extends SceneModule {
  /** 0 = flat/hidden, 1 = fully built; houses rise outward from the centre. */
  setReveal(t: number): void
  /** 0 = day, 1 = night (window lights, street glow). */
  setNight(t: number): void
  /** 0–1: radius of the coordinated V2G discharge wave around the substation. */
  setWave(t: number): void
  /** 0–1: grid stress at the evening peak (substation and veins turn coral). */
  setPeak(t: number): void
  /** Share of cars that take part in V2G (0–1). */
  setParticipation(t: number): void
  /** World position of the substation (for labels). */
  readonly substation: THREE.Vector3
  /** Number of cars in the scene and how many take part at the current participation. */
  readonly carCount: number
}

const N = 11
const PLOT_X = 30
const PLOT_Z = 28
const HALF_X = (N * PLOT_X) / 2
const HALF_Z = (N * PLOT_Z) / 2
const SUB = new THREE.Vector3(-PLOT_X * 3, 0, -PLOT_Z * 3)

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Small barn house: gable profile extruded, walls and roof coloured per vertex. */
function houseGeometry(): THREE.BufferGeometry {
  const w = 6
  const wall = 4.6
  const ridge = 7.2
  const len = 9
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(w / 2, wall)
  s.lineTo(0, ridge)
  s.lineTo(-w / 2, wall)
  s.lineTo(-w / 2, 0)
  const body = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false })
  body.rotateY(Math.PI / 2)
  body.translate(-len / 2, 0, 0)
  const slope = Math.atan2(ridge - wall, w / 2)
  const slopeLen = Math.hypot(w / 2, ridge - wall)
  const roof = (side: 1 | -1) => {
    const g = new THREE.BoxGeometry(len + 0.2, 0.2, slopeLen + 0.12)
    g.rotateX(side * slope)
    g.translate(0, (wall + ridge) / 2 + Math.cos(slope) * 0.1, (side * w) / 4 + side * Math.sin(slope) * 0.1)
    return g
  }
  const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g)
  const parts = [flat(body), flat(roof(1)), flat(roof(-1))]
  const colours = [new THREE.Color('#d6d0c4'), new THREE.Color('#262b33'), new THREE.Color('#262b33')]
  parts.forEach((g, i) => {
    const c = new Float32Array(g.attributes.position.count * 3)
    for (let k = 0; k < c.length; k += 3) colours[i].toArray(c, k)
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    g.deleteAttribute('uv')
  })
  return mergeGeometries(parts) as THREE.BufferGeometry
}

/** Low-detail car: rounded body + glass canopy, coloured per vertex. */
function carGeometry(): THREE.BufferGeometry {
  const body = new RoundedBoxGeometry(4.5, 0.7, 1.9, 3, 0.28)
  body.translate(0, 0.62, 0)
  const cabin = new RoundedBoxGeometry(2.5, 0.6, 1.55, 3, 0.26)
  cabin.translate(-0.35, 1.18, 0)
  const paint = new THREE.Color('#e7eaee')
  const glass = new THREE.Color('#0d121b')
  for (const [g, c] of [
    [body, paint],
    [cabin, glass],
  ] as const) {
    const col = new Float32Array(g.attributes.position.count * 3)
    for (let k = 0; k < col.length; k += 3) c.toArray(col, k)
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.deleteAttribute('uv')
  }
  return mergeGeometries([body, cabin]) as THREE.BufferGeometry
}

const WINDOW_PARS = /* glsl */ `
  uniform float uNight;
  uniform float uReveal;
  uniform float uTime;
  varying vec3 vLocal;
  varying vec3 vLocalNormal;
  varying float vSeed;
`

const GROUND_VERT = /* glsl */ `
  varying vec2 vXZ;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vXZ = w.xz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const GROUND_FRAG = /* glsl */ `
  uniform vec2 uPlot;
  uniform vec2 uHalf;
  uniform vec3 uSub;
  uniform float uTime;
  uniform float uNight;
  uniform float uWave;
  uniform float uPeak;
  uniform float uReveal;
  uniform vec3 uEnergy;
  uniform vec3 uPeakColor;
  varying vec2 vXZ;

  void main() {
    // plots and streets
    vec2 cell = (vXZ + uHalf) / uPlot;
    vec2 f = fract(cell);
    vec2 edge = min(f, 1.0 - f) * uPlot;
    float street = 1.0 - step(2.6, min(edge.x, edge.y));
    vec3 lawnDay = vec3(0.075, 0.12, 0.08);
    vec3 lawnNight = vec3(0.022, 0.034, 0.03);
    vec3 roadDay = vec3(0.085, 0.09, 0.105);
    vec3 roadNight = vec3(0.018, 0.022, 0.032);
    vec3 col = mix(mix(lawnDay, lawnNight, uNight), mix(roadDay, roadNight, uNight), street);

    // energy veins along street centrelines, pulsing towards the substation
    float centre = 1.0 - smoothstep(0.0, 0.35, min(edge.x, edge.y));
    float d = length(vXZ - uSub.xz);
    float pulse = 0.5 + 0.5 * sin(d * 0.22 + uTime * 3.5);
    float waveR = uWave * 260.0;
    float inWave = smoothstep(waveR, waveR - 30.0, d);
    float front = smoothstep(14.0, 0.0, abs(d - waveR)) * step(0.01, uWave);
    vec3 vein = mix(uEnergy, uPeakColor, uPeak * (1.0 - inWave));
    float veinAmt = centre * (0.05 + 0.6 * inWave * pulse + 0.25 * uPeak * pulse) * uNight;
    col += vein * veinAmt * 2.2 + uEnergy * front * 0.35 * uNight;

    // fade into the night towards the edges
    float r = length(vXZ) / length(uHalf);
    col *= smoothstep(1.05, 0.55, r);
    // unbuilt areas stay dark until revealed
    col *= mix(0.25, 1.0, smoothstep(r - 0.1, r, uReveal * 1.2));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const HALO_VERT = /* glsl */ `
  uniform vec3 uSub;
  uniform float uWave;
  uniform float uParticipation;
  uniform float uReveal;
  uniform float uTime;
  varying vec2 vUv;
  varying float vOn;
  void main() {
    vUv = uv;
    vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float d = length(c.xz - uSub.xz);
    float seed = fract(sin(dot(c.xz, vec2(12.9898, 78.233))) * 43758.5453);
    float participates = step(seed, uParticipation);
    float reached = smoothstep(uWave * 260.0, uWave * 260.0 - 20.0, d);
    float revealed = smoothstep(length(c.xz) / 220.0, length(c.xz) / 220.0 + 0.05, uReveal);
    vOn = participates * reached * revealed * (0.75 + 0.25 * sin(uTime * 4.0 + seed * 20.0));
    vec4 w = modelMatrix * instanceMatrix * vec4(position * (0.6 + vOn * 0.6), 1.0);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const HALO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vOn;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float ring = smoothstep(1.0, 0.85, d) * smoothstep(0.55, 0.8, d);
    float core = smoothstep(1.0, 0.0, d) * 0.35;
    gl_FragColor = vec4(uColor * 3.0, (ring + core) * vOn);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function create(_ctx: SceneContext): City {
  const root = new THREE.Group()
  root.name = 'city'

  const shared = {
    uNight: { value: 1 },
    uReveal: { value: 1 },
    uTime: { value: 0 },
    uWave: { value: 0 },
    uPeak: { value: 0 },
    uParticipation: { value: 0.6 },
    uSub: { value: SUB.clone() },
  }

  // Ground with streets and veins
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_X * 2.6, HALF_Z * 2.6),
    new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uPlot: { value: new THREE.Vector2(PLOT_X, PLOT_Z) },
        uHalf: { value: new THREE.Vector2(HALF_X, HALF_Z) },
        uEnergy: { value: new THREE.Color(palette.energy) },
        uPeakColor: { value: new THREE.Color(palette.peak) },
      },
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
    }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.05
  root.add(ground)

  // Plot layout (centre plot left for the hero diorama)
  const plots: { x: number; z: number; seed: number }[] = []
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const ci = i - (N - 1) / 2
      const cj = j - (N - 1) / 2
      if (ci === 0 && cj === 0) continue
      const x = ci * PLOT_X
      const z = cj * PLOT_Z
      // keep the substation block free
      if (Math.abs(x - SUB.x) < PLOT_X * 0.6 && Math.abs(z - SUB.z) < PLOT_Z * 0.6) continue
      plots.push({ x, z, seed: hash(i * 31 + j) })
    }
  }

  // Houses with procedural window lights
  const houseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 })
  houseMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uReveal;
        varying vec3 vLocal;
        varying vec3 vLocalNormal;
        varying float vSeed;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLocal = position;
        vLocalNormal = normal;
        vec3 hc = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vSeed = fract(sin(dot(hc.xz, vec2(12.9898, 78.233))) * 43758.5453);
        float grow = smoothstep(length(hc.xz) / 230.0, length(hc.xz) / 230.0 + 0.12, uReveal);
        transformed.y -= (1.0 - grow) * 9.0;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WINDOW_PARS}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float vertical = 1.0 - step(0.5, abs(vLocalNormal.y));
          vec2 p = abs(vLocalNormal.x) > 0.5 ? vLocal.zy : vLocal.xy;
          float floorA = step(1.0, p.y) * step(p.y, 2.3);
          float floorB = step(3.0, p.y) * step(p.y, 4.1);
          float col = step(0.3, fract(p.x / 1.7 + 0.15)) * step(fract(p.x / 1.7 + 0.15), 0.72);
          float cellId = floor(p.x / 1.7) + floor(p.y / 2.0) * 7.0 + vSeed * 91.0;
          float lit = step(0.42, fract(sin(cellId * 78.233) * 43758.5453));
          float win = vertical * col * (floorA + floorB);
          vec3 warm = mix(vec3(1.0, 0.62, 0.3), vec3(0.75, 0.82, 1.0), step(0.85, fract(vSeed * 7.0)));
          totalEmissiveRadiance += warm * win * lit * uNight * 1.7;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.07, 0.1), win * (1.0 - lit * uNight));
        }`,
      )
  }
  const houses = new THREE.InstancedMesh(houseGeometry(), houseMat, plots.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const tint = new THREE.Color()
  plots.forEach((p, i) => {
    const flip = p.seed > 0.5 ? Math.PI : 0
    q.setFromAxisAngle(up, flip + (p.seed - 0.5) * 0.08)
    const s = 0.9 + p.seed * 0.35
    m.compose(new THREE.Vector3(p.x - 3 + p.seed * 2, 0, p.z - 2), q, new THREE.Vector3(s, s, s))
    houses.setMatrixAt(i, m)
    tint.setHSL(0.08, 0.08, 0.72 + p.seed * 0.18)
    houses.setColorAt(i, tint)
  })
  houses.castShadow = true
  houses.receiveShadow = true
  root.add(houses)

  // Cars in driveways + discharge halos
  const carPlots = plots.filter((p) => p.seed > 0.12)
  const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2 })
  // Cars arrive with their houses: the same outward reveal, sunk below the ground until then.
  carMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uReveal;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 cc = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float arrive = smoothstep(length(cc.xz) / 230.0 + 0.04, length(cc.xz) / 230.0 + 0.14, uReveal);
        transformed.y -= (1.0 - arrive) * 4.0;`,
      )
  }
  const cars = new THREE.InstancedMesh(carGeometry(), carMat, carPlots.length)
  const halos = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(7, 7),
    new THREE.ShaderMaterial({
      uniforms: { ...shared, uColor: { value: new THREE.Color(palette.energy) } },
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    carPlots.length,
  )
  const paintChoices = ['#eef1f4', '#9aa3ad', '#20252c', '#2c3e57', '#e7eaee', '#c8ccd2']
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
  carPlots.forEach((p, i) => {
    const pos = new THREE.Vector3(p.x + 9, 0, p.z + 5 - (p.seed > 0.5 ? 9 : 0))
    q.setFromAxisAngle(up, Math.PI / 2 + (p.seed > 0.3 ? 0 : Math.PI))
    m.compose(pos, q, new THREE.Vector3(1, 1, 1))
    cars.setMatrixAt(i, m)
    cars.setColorAt(i, tint.set(paintChoices[Math.floor(p.seed * 997) % paintChoices.length]))
    m.compose(pos.clone().setY(0.05), flat, new THREE.Vector3(1, 1, 1))
    halos.setMatrixAt(i, m)
  })
  cars.castShadow = true
  halos.frustumCulled = false
  root.add(cars, halos)

  // Substation: transformer yard + glowing ring
  const sub = new THREE.Group()
  sub.position.copy(SUB)
  const metal = new THREE.MeshStandardMaterial({ color: '#59616d', roughness: 0.5, metalness: 0.7 })
  const pad = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 18), new THREE.MeshStandardMaterial({ color: '#2a2f37', roughness: 0.9 }))
  sub.add(pad)
  for (let k = 0; k < 3; k++) {
    const t = new THREE.Mesh(new RoundedBoxGeometry(3.4, 3.2, 2.6, 2, 0.2), metal)
    t.position.set(-6 + k * 6, 1.75, -2)
    sub.add(t)
    for (let b = 0; b < 3; b++) {
      const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 8), new THREE.MeshStandardMaterial({ color: '#9fb2c4', roughness: 0.3 }))
      ins.position.set(-6 + k * 6 - 1 + b, 4.1, -2)
      sub.add(ins)
    }
  }
  const subRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.energy).multiplyScalar(2.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  const subRing = new THREE.Mesh(new THREE.RingGeometry(13, 13.6, 96), subRingMat)
  subRing.rotation.x = -Math.PI / 2
  subRing.position.y = 0.2
  sub.add(subRing)
  root.add(sub)

  // Transmission pylons running from the substation to the horizon, with sagging wires
  const pylonMat = new THREE.MeshStandardMaterial({ color: '#3b424c', roughness: 0.6, metalness: 0.6 })
  const pylonPts: THREE.Vector3[] = []
  for (let k = 0; k < 7; k++) {
    const p = SUB.clone().add(new THREE.Vector3(-30 - k * 42, 0, -20 - k * 30))
    pylonPts.push(p)
    const g = new THREE.Group()
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.9, 26, 4), pylonMat)
    mast.position.y = 13
    const arm = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 0.4), pylonMat)
    arm.position.y = 24
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 0.35), pylonMat)
    arm2.position.y = 20
    g.add(mast, arm, arm2)
    g.position.copy(p)
    g.lookAt(p.clone().add(new THREE.Vector3(42, 0, 30)))
    root.add(g)
  }
  const wireMat = new THREE.LineBasicMaterial({ color: '#4a5563', transparent: true, opacity: 0.8 })
  for (const off of [-4.5, 4.5, -3, 3]) {
    const pts: THREE.Vector3[] = []
    for (let k = 0; k < pylonPts.length - 1; k++) {
      const a = pylonPts[k]
      const b = pylonPts[k + 1]
      const side = new THREE.Vector3(30, 0, -42).normalize().multiplyScalar(off)
      const h = Math.abs(off) > 4 ? 24 : 20
      for (let s = 0; s <= 12; s++) {
        const t = s / 12
        const p = a.clone().lerp(b, t).add(side)
        p.y = h - Math.sin(Math.PI * t) * 3.2
        pts.push(p)
      }
    }
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat))
  }

  // Wind turbines on the horizon
  const turbineMat = new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.5 })
  const rotors: THREE.Object3D[] = []
  for (let k = 0; k < 7; k++) {
    const g = new THREE.Group()
    const a = -0.5 + k * 0.22
    g.position.set(Math.sin(a) * 300 + 60, 0, -Math.cos(a) * 300 - 40)
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.6, 60, 12), turbineMat)
    tower.position.y = 30
    const nacelle = new THREE.Mesh(new RoundedBoxGeometry(5, 2.4, 2.4, 2, 0.6), turbineMat)
    nacelle.position.set(0, 61, 0)
    const rotor = new THREE.Group()
    rotor.position.set(0, 61, 2)
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.4, 26, 0.3), turbineMat)
      blade.position.y = 13
      const holder = new THREE.Group()
      holder.rotation.z = (b / 3) * Math.PI * 2
      holder.add(blade)
      rotor.add(holder)
    }
    rotor.rotation.z = k
    g.add(tower, nacelle, rotor)
    g.lookAt(0, 0, 0)
    g.rotation.x = 0
    root.add(g)
    rotors.push(rotor)
  }

  return {
    object: root,
    substation: SUB.clone().setY(6),
    carCount: carPlots.length,
    setReveal(t) {
      shared.uReveal.value = THREE.MathUtils.clamp(t, 0, 1)
    },
    setNight(t) {
      shared.uNight.value = THREE.MathUtils.clamp(t, 0, 1)
    },
    setWave(t) {
      shared.uWave.value = THREE.MathUtils.clamp(t, 0, 1)
    },
    setPeak(t) {
      shared.uPeak.value = THREE.MathUtils.clamp(t, 0, 1)
      subRingMat.color.set(t > 0.5 ? palette.peak : palette.energy).multiplyScalar(2.5)
    },
    setParticipation(t) {
      shared.uParticipation.value = THREE.MathUtils.clamp(t, 0, 1)
    },
    update({ time, dt }: Frame) {
      shared.uTime.value = time
      for (const r of rotors) r.rotation.z += dt * 0.6
      subRing.scale.setScalar(1 + 0.04 * Math.sin(time * 2.5))
    },
  }
}

/** Playground: &reveal=1 &night=1 &wave=0.6 &peak=0.5 &part=0.6 */
export function configure(c: City, p: URLSearchParams): void {
  c.setReveal(Number(p.get('reveal') ?? 1))
  c.setNight(Number(p.get('night') ?? 1))
  c.setWave(Number(p.get('wave') ?? 0.55))
  c.setPeak(Number(p.get('peak') ?? 0.4))
  c.setParticipation(Number(p.get('part') ?? 0.6))
}
