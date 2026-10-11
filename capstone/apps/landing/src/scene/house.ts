// Procedural modern German "barn house": a pure gable with no overhangs, dark standing-seam
// roof carrying up to 20 PV modules, a full-height glass gable facing the driveway, timber
// cladding, garden, street and an optional floating diorama base.
// Layout (metres): house x ∈ [-7, 5], z ∈ [-3.5, 3.5]; driveway along x ≈ 6.6 out to the
// street at z ≈ 10; the car parks nose-out in front of the glass gable (centre z ≈ 4.3),
// its charge port facing the wallbox on the gable wall.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { palette } from '../core/palette.ts'
import type { Frame, Preview, SceneContext, SceneModule } from './types.ts'

export const preview: Preview = { camera: [-17, 10, 24], target: [0.5, 2.6, 1.5], hour: 15 }

export interface HouseOptions {
  /** Floating diorama slab under the plot (default true). */
  island?: boolean
}

export interface House extends SceneModule {
  /** 0 = day, 1 = night: window glow, garden and street lights. */
  setNight(t: number): void
  /** Number of visible PV modules (0–20, 400 Wp each). */
  setPanelCount(n: number): void
  /** 0–1 current PV output: modules shimmer while producing. */
  setSolar(t: number): void
  /** Socket of the wallbox, where the charging cable leaves. */
  wallbox: THREE.Object3D
  /** Pose of the parked car (position + rotation, car faces the street). */
  parking: THREE.Object3D
  /** Point on the street the car drives to when it leaves. */
  streetExit: THREE.Object3D
  /** Glass gable and window materials (scene may tint them). */
  windows: THREE.MeshPhysicalMaterial[]
}

const L = 12
const X0 = -7
const D = 7
const WALL_H = 5.6
const RIDGE_H = 8.9
const ROOF_T = 0.24
const SLOPE = Math.atan2(RIDGE_H - WALL_H, D / 2)
const SLOPE_LEN = Math.hypot(D / 2, RIDGE_H - WALL_H)
export const PANEL_MAX = 20

// Cell grid, faded out with screen-space derivatives so distant arrays don't alias.
const PANEL_GRID = /* glsl */ `
  vec2 g = vUv * vec2(6.0, 10.0);
  vec2 f = abs(fract(g) - 0.5);
  float density = max(max(fwidth(g.x), fwidth(g.y)), 1e-4);
  float line = (1.0 - smoothstep(0.47 - density, 0.49, max(f.x, f.y))) * clamp(1.6 - density * 3.0, 0.0, 1.0);
`
const PANEL_FRAG_COLOR = /* glsl */ `
  #include <color_fragment>
  {
    ${PANEL_GRID}
    float frame = step(0.97, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.42, 0.52), max(line * 0.35, frame * 0.8));
  }
`
const PANEL_FRAG_EMISSIVE = /* glsl */ `
  #include <emissivemap_fragment>
  {
    // While producing, the cell grid glows faintly amber, pulsing slowly.
    ${PANEL_GRID}
    float pulse = 0.75 + 0.25 * sin(uTime * 1.6 + vUv.y * 6.0);
    totalEmissiveRadiance += vec3(1.0, 0.68, 0.22) * uSolar * line * pulse * 0.18;
  }
`

function gableShape(): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(-D / 2, 0)
  s.lineTo(D / 2, 0)
  s.lineTo(D / 2, WALL_H)
  s.lineTo(0, RIDGE_H)
  s.lineTo(-D / 2, WALL_H)
  s.lineTo(-D / 2, 0)
  return s
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

/** A flush window: dark frame, glass pane, optional mullions. Faces +Z in its local frame. */
function windowPane(w: number, h: number, glass: THREE.Material, frame: THREE.Material, mullions: { v?: number[]; h?: number[] } = {}): THREE.Group {
  const g = new THREE.Group()
  const f = 0.07
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass)
  pane.position.z = 0.012
  g.add(pane)
  const bars: [number, number, number, number][] = [
    [0, h / 2 - f / 2, w, f],
    [0, -h / 2 + f / 2, w, f],
    [-w / 2 + f / 2, 0, f, h],
    [w / 2 - f / 2, 0, f, h],
  ]
  for (const x of mullions.v ?? []) bars.push([x, 0, 0.05, h])
  for (const y of mullions.h ?? []) bars.push([0, y, w, 0.05])
  for (const [x, y, bw, bh] of bars) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), frame)
    b.position.set(x, y, 0.03)
    g.add(b)
  }
  return g
}

export function create(_ctx: SceneContext, opts: HouseOptions = {}): House {
  const root = new THREE.Group()
  root.name = 'house'
  const island = opts.island ?? true

  // Materials
  const plaster = new THREE.MeshStandardMaterial({ color: '#d9d3c8', roughness: 0.92 })
  const roofMat = new THREE.MeshStandardMaterial({ color: '#272c33', roughness: 0.5, metalness: 0.55 })
  const seamMat = new THREE.MeshStandardMaterial({ color: '#343a43', roughness: 0.4, metalness: 0.6 })
  const timber = new THREE.MeshStandardMaterial({ color: '#6a4e3b', roughness: 0.78 })
  const frameMat = new THREE.MeshStandardMaterial({ color: '#1c2026', roughness: 0.5, metalness: 0.4 })
  const paver = new THREE.MeshStandardMaterial({ color: '#a9a49b', roughness: 0.85 })
  const joint = new THREE.MeshStandardMaterial({ color: '#8d887f', roughness: 0.9 })
  const lawn = new THREE.MeshStandardMaterial({ color: '#3b5f3a', roughness: 0.95 })
  const hedgeMat = new THREE.MeshStandardMaterial({ color: '#2e4d31', roughness: 0.9 })
  const asphalt = new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.92 })
  const kerb = new THREE.MeshStandardMaterial({ color: '#bdb8b0', roughness: 0.8 })
  const glassBase = { color: '#121a26', roughness: 0.07, metalness: 0.3, envMapIntensity: 1.2, emissive: '#ffb066', emissiveIntensity: 0 }
  const glassWarm = new THREE.MeshPhysicalMaterial(glassBase)
  const glassDim = new THREE.MeshPhysicalMaterial(glassBase)
  const glassDark = new THREE.MeshPhysicalMaterial({ ...glassBase, emissive: '#7aa7ff' })
  const lampMat = new THREE.MeshBasicMaterial({ color: '#ffcf8a' })

  // Body: gable profile extruded along x
  const bodyGeo = new THREE.ExtrudeGeometry(gableShape(), { depth: L, bevelEnabled: false })
  bodyGeo.rotateY(Math.PI / 2)
  bodyGeo.translate(X0, 0, 0)
  const body = new THREE.Mesh(bodyGeo, plaster)
  body.castShadow = true
  body.receiveShadow = true
  root.add(body)

  // Roof: two slabs meeting at the ridge, standing seams, ridge cap
  const slab = (side: 1 | -1) => {
    const g = new THREE.Group()
    const mesh = box(L + 0.14, ROOF_T, SLOPE_LEN + 0.16, roofMat, 0.03)
    g.add(mesh)
    g.rotation.x = side * SLOPE
    const n = new THREE.Vector3(0, Math.cos(SLOPE), side * Math.sin(SLOPE))
    g.position.set(X0 + L / 2, (WALL_H + RIDGE_H) / 2, (side * D) / 4).addScaledVector(n, ROOF_T / 2)
    // seams every 0.5 m
    const seams = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.05, SLOPE_LEN + 0.1), seamMat, 24)
    const m = new THREE.Matrix4()
    for (let i = 0; i < 24; i++) {
      m.makeTranslation(-L / 2 + 0.25 + i * 0.5, ROOF_T / 2 + 0.02, 0)
      seams.setMatrixAt(i, m)
    }
    seams.castShadow = true
    g.add(seams)
    root.add(g)
    return g
  }
  const front = slab(1)
  slab(-1)
  const ridge = box(L + 0.2, 0.14, 0.42, roofMat, 0.04)
  ridge.position.set(X0 + L / 2, RIDGE_H + 0.2, 0)
  root.add(ridge)

  // PV array on the south-facing (+z) slope, 2 rows x 10 modules, slab-local frame
  const panelUniforms = { uTime: { value: 0 }, uSolar: { value: 0 } }
  const panelMat = new THREE.MeshPhysicalMaterial({
    color: '#0b1630',
    roughness: 0.25,
    metalness: 0.5,
    clearcoat: 0.7,
    clearcoatRoughness: 0.1,
    envMapIntensity: 0.9,
  })
  panelMat.defines = { USE_UV: '' }
  panelMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, panelUniforms)
    shader.fragmentShader = 'uniform float uTime;\nuniform float uSolar;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', PANEL_FRAG_COLOR)
      .replace('#include <emissivemap_fragment>', PANEL_FRAG_EMISSIVE)
  }
  const panels = new THREE.InstancedMesh(new RoundedBoxGeometry(1.1, 0.045, 1.72, 2, 0.012), panelMat, PANEL_MAX)
  {
    const m = new THREE.Matrix4()
    let i = 0
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 10; col++) {
        m.makeTranslation(-L / 2 + 0.43 + col * 1.14 + 0.55, ROOF_T / 2 + 0.07, -0.88 + row * 1.76 - 0.15)
        panels.setMatrixAt(i++, m)
      }
    }
  }
  panels.castShadow = true
  panels.receiveShadow = true
  front.add(panels)

  // Glass gable on the driveway side (+x end)
  const gable = windowPane(2.5, 7.1, glassWarm, frameMat, { h: [-0.75], v: [0] })
  gable.position.set(X0 + L + 0.001, 0.2 + 7.1 / 2, 0.15)
  gable.rotation.y = Math.PI / 2
  root.add(gable)

  // Front facade (+z): door, sliding doors, upper windows
  const facade = (w: number, h: number, x: number, y: number, mat: THREE.Material, m?: { v?: number[]; h?: number[] }) => {
    const win = windowPane(w, h, mat, frameMat, m)
    win.position.set(x, y, D / 2 + 0.001)
    root.add(win)
  }
  facade(4.4, 2.5, -0.6, 1.35, glassWarm, { v: [-1.1, 0, 1.1] })
  facade(1.5, 1.4, -4.8, 4.0, glassDim)
  facade(1.5, 1.4, -1.6, 4.0, glassDark)
  facade(1.5, 1.4, 1.8, 4.0, glassDim)
  const door = box(1.15, 2.35, 0.08, timber, 0.02)
  door.position.set(-4.8, 1.18, D / 2 + 0.04)
  root.add(door)
  const canopy = box(1.9, 0.12, 1.1, frameMat, 0.03)
  canopy.position.set(-4.8, 2.75, D / 2 + 0.55)
  root.add(canopy)
  const doorLight = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.06), lampMat)
  doorLight.position.set(-4.8, 2.68, D / 2 + 0.95)
  root.add(doorLight)

  // Back windows (rarely seen) and the -x gable with timber cladding + window. The upper back
  // window sits on the back wall: mounted on the front facade it overlapped the glassDark window
  // at x = -1.6 coplanar, and the two panes z-fought (warm tan vs blue, shimmering with the camera).
  const backUpper = windowPane(1.5, 1.4, glassDim, frameMat)
  backUpper.position.set(-2.0, 4.0, -D / 2 - 0.001)
  backUpper.rotation.y = Math.PI
  root.add(backUpper)
  const backWin = windowPane(3.2, 2.3, glassDim, frameMat, { v: [0] })
  backWin.position.set(-1.0, 1.3, -D / 2 - 0.001)
  backWin.rotation.y = Math.PI
  root.add(backWin)
  {
    const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 1, 0.12), timber.clone(), 34)
    const m = new THREE.Matrix4()
    for (let i = 0; i < 34; i++) {
      const z = -D / 2 + 0.1 + i * ((D - 0.2) / 33)
      const h = WALL_H + (RIDGE_H - WALL_H) * (1 - Math.abs(z) / (D / 2)) - 0.08
      m.compose(new THREE.Vector3(X0 - 0.06, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1))
      slats.setMatrixAt(i, m)
    }
    slats.castShadow = true
    slats.receiveShadow = true
    root.add(slats)
    const sideWin = windowPane(1.6, 1.6, glassDark, frameMat)
    sideWin.position.set(X0 - 0.13, 4.6, 0)
    sideWin.rotation.y = -Math.PI / 2
    root.add(sideWin)
  }

  // Wallbox on the +x gable wall, behind the glass, at the car's charge port
  const wallbox = new THREE.Group()
  {
    const unit = box(0.3, 0.42, 0.12, new THREE.MeshStandardMaterial({ color: '#1d2129', roughness: 0.4, metalness: 0.3 }), 0.04)
    unit.rotation.y = Math.PI / 2
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 10, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.energy).multiplyScalar(2.6) }))
    ring.rotation.y = Math.PI / 2
    ring.position.set(0.065, 0.06, 0)
    const holder = new THREE.Group()
    holder.position.set(X0 + L + 0.07, 1.25, 2.6)
    holder.add(unit, ring)
    root.add(holder)
    wallbox.position.set(X0 + L + 0.13, 1.06, 2.6)
    root.add(wallbox)
  }

  // Driveway, path, garden, street
  const top = 0.0
  const drive = box(3.6, 0.05, 13.2, paver, 0)
  drive.position.set(6.6, top + 0.025, 3.1)
  root.add(drive)
  {
    const joints = new THREE.InstancedMesh(new THREE.BoxGeometry(3.6, 0.052, 0.025), joint, 22)
    const m = new THREE.Matrix4()
    for (let i = 0; i < 22; i++) {
      m.makeTranslation(6.6, top + 0.026, -3.2 + i * 0.6)
      joints.setMatrixAt(i, m)
    }
    root.add(joints)
  }
  const path = box(1.3, 0.04, 6.0, paver, 0)
  path.position.set(-4.8, top + 0.02, 6.6)
  root.add(path)
  const terrace = box(6.2, 0.08, 2.2, timber, 0.01)
  terrace.position.set(-0.6, top + 0.04, D / 2 + 1.2)
  root.add(terrace)

  const street = box(23, 0.04, 3.6, asphalt, 0)
  street.position.set(0.5, top + 0.02, 11.6)
  root.add(street)
  const walk = box(23, 0.1, 1.1, kerb, 0)
  walk.position.set(0.5, top + 0.05, 9.25)
  root.add(walk)
  {
    const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.045, 0.1), new THREE.MeshBasicMaterial({ color: '#d8d4cc' }), 8)
    const m = new THREE.Matrix4()
    for (let i = 0; i < 8; i++) {
      m.makeTranslation(-9.5 + i * 2.8, top + 0.025, 11.6)
      dash.setMatrixAt(i, m)
    }
    root.add(dash)
  }

  // Hedge along the west edge and the back, trees, shrubs
  for (const [x, z, w, d] of [
    [-10, 1.5, 0.9, 13],
    [-2.5, -6.6, 15, 0.9],
  ] as const) {
    const h = box(w, 1.1, d, hedgeMat, 0.3)
    h.position.set(x, top + 0.55, z)
    root.add(h)
  }
  const treeMat = new THREE.MeshStandardMaterial({ color: '#335f3c', roughness: 0.9 })
  const treeMat2 = new THREE.MeshStandardMaterial({ color: '#2a4f37', roughness: 0.9 })
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#4e3b2e', roughness: 0.9 })
  const tree = (x: number, z: number, s: number, mat: THREE.Material) => {
    const g = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.17 * s, 2.2 * s, 10), trunkMat)
    trunk.position.y = 1.1 * s
    trunk.castShadow = true
    g.add(trunk)
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * s, 3), mat)
    crown.position.y = 3.0 * s
    crown.scale.set(1, 1.18, 1)
    crown.castShadow = true
    crown.receiveShadow = true
    g.add(crown)
    const crown2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 * s, 3), mat)
    crown2.position.set(0.7 * s, 2.4 * s, 0.4 * s)
    crown2.castShadow = true
    g.add(crown2)
    g.position.set(x, top, z)
    root.add(g)
  }
  tree(-8.6, -4.8, 1.25, treeMat)
  tree(-8.4, 4.8, 0.95, treeMat2)
  tree(9.8, -5.6, 1.1, treeMat2)
  tree(10.4, -1.2, 0.85, treeMat)
  for (const [x, z, s] of [
    [-2.8, 5.6, 0.55],
    [2.6, 5.4, 0.45],
    [4.1, -4.6, 0.6],
  ] as const) {
    const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 2), hedgeMat)
    shrub.position.set(x, top + s * 0.7, z)
    shrub.scale.y = 0.75
    shrub.castShadow = true
    root.add(shrub)
  }

  // Garden bollards and a street lamp
  const lightPoints: THREE.PointLight[] = []
  for (const z of [5.0, 7.0]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 12), frameMat)
    b.position.set(-4.0, top + 0.275, z)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.06, 12), lampMat)
    cap.position.set(-4.0, top + 0.5, z)
    root.add(b, cap)
  }
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.2, 12), frameMat)
    pole.position.set(-6.5, top + 2.6, 9.4)
    const arm = box(1.1, 0.08, 0.1, frameMat, 0.02)
    arm.position.set(-6.0, top + 5.15, 9.4)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.24), lampMat)
    head.position.set(-5.55, top + 5.08, 9.4)
    root.add(pole, arm, head)
    const lamp = new THREE.PointLight('#ffc27a', 0, 14, 1.6)
    lamp.position.set(-5.55, top + 4.9, 9.6)
    root.add(lamp)
    lightPoints.push(lamp)
  }
  // Warm interior spill through the glass gable onto the driveway
  const spill = new THREE.PointLight('#ffb36b', 0, 10, 1.5)
  spill.position.set(X0 + L - 0.6, 2.4, 0.2)
  root.add(spill)
  lightPoints.push(spill)

  // Diorama base: grass, soil and rock strata
  if (island) {
    const layer = (inset: number, thick: number, y: number, mat: THREE.Material) => {
      const geo = new THREE.ExtrudeGeometry(roundedRect(24 - inset * 2, 22 - inset * 2, 1.6), {
        depth: thick,
        bevelEnabled: true,
        bevelThickness: 0.08,
        bevelSize: 0.08,
        bevelSegments: 3,
        curveSegments: 12,
      })
      geo.rotateX(Math.PI / 2)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(0.5, y, 2.6)
      mesh.receiveShadow = true
      root.add(mesh)
    }
    layer(0, 0.18, top - 0.085, lawn)
    layer(0.05, 0.95, top - 0.3, new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 1 }))
    layer(0.35, 0.7, top - 1.25, new THREE.MeshStandardMaterial({ color: '#1d1f24', roughness: 1 }))
  } else {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), lawn)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    root.add(ground)
  }

  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && !(mesh.material as THREE.Material).transparent) mesh.receiveShadow = true
  })

  // Anchors
  const parking = new THREE.Object3D()
  parking.position.set(6.6, top + 0.05, 4.3)
  parking.rotation.y = -Math.PI / 2 // car +x (nose) → world +z (street)
  root.add(parking)
  const streetExit = new THREE.Object3D()
  streetExit.position.set(6.6, top + 0.04, 11.2)
  root.add(streetExit)

  let night = 0
  const setNight = (t: number) => {
    night = THREE.MathUtils.clamp(t, 0, 1)
    glassWarm.emissiveIntensity = night * 2.6
    glassDim.emissiveIntensity = night * 1.1
    glassDark.emissiveIntensity = night * 0.12
    lampMat.color.set('#ffcf8a').multiplyScalar(0.35 + night * 3.2)
    lightPoints[0].intensity = night * 26
    lightPoints[1].intensity = night * 16
  }
  setNight(0)

  return {
    object: root,
    wallbox,
    parking,
    streetExit,
    windows: [glassWarm, glassDim, glassDark],
    setNight,
    setPanelCount(n) {
      panels.count = THREE.MathUtils.clamp(Math.round(n), 0, PANEL_MAX)
    },
    setSolar(t) {
      panelUniforms.uSolar.value = THREE.MathUtils.clamp(t, 0, 1)
    },
    update({ time }: Frame) {
      panelUniforms.uTime.value = time
      void night
    },
  }
}

/** Playground: &night=0..1 &panels=0..20 &solar=0..1 &island=0 */
export function configure(house: House, p: URLSearchParams): void {
  if (p.has('night')) house.setNight(Number(p.get('night')))
  if (p.has('panels')) house.setPanelCount(Number(p.get('panels')))
  if (p.has('solar')) house.setSolar(Number(p.get('solar')))
}
