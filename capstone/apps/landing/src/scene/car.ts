// Procedural electric car: extruded side profiles with deep bevels give a soft, premium
// silhouette; a black glass canopy, aero wheels, light bars, a charge port, a side
// battery gauge, and an X-ray mode that reveals the battery pack filling with energy.
// Units are metres; +X is forward, the car sits on y = 0.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { palette } from '../core/palette.ts'
import { WIDTH, WHEEL_X, WHEEL_R, TIRE_W, ARCH_R, SILL, bodyShape, canopyShape } from './vehicleShape.ts'
import type { Frame, Preview, SceneContext, SceneModule } from './types.ts'

export const preview: Preview = { camera: [5.6, 2.2, 5.8], target: [0, 0.65, 0], hour: 15 }

export type CarMode = 'idle' | 'charging' | 'discharging'
/** Where charging energy comes from: colours follow the site rule (amber = sun, indigo = grid, teal = stored). */
export type ChargeSource = 'solar' | 'grid'

export interface Car extends SceneModule {
  /** Battery state of charge 0–1: drives the side gauge and the X-ray cells. */
  setSoc(soc: number): void
  setMode(mode: CarMode, source?: ChargeSource): void
  /** Head/tail light intensity 0–1. */
  setLights(on: number): void
  /** 0 = solid paint, 1 = ghosted body revealing the battery pack. */
  setXray(t: number): void
  /** Wheel angular speed in rad/s (positive = driving forward). */
  setWheelSpin(speed: number): void
  /**
   * Shows or hides every mesh. The headlight stays in the scene (dark while hidden), so the
   * light count, and with it every lit material's shader program, never changes.
   */
  setVisible(visible: boolean): void
  /**
   * Fades the whole car (paint, glass, trim, wheels, gauge, lights, headlight beam and shadow):
   * 1 = solid, 0 = gone (meshes hidden, the headlight stays in the light set at zero intensity).
   * Below 1 the materials are blended over a depth pre-pass, so the car dissolves as one solid
   * instead of showing its far wheels and panels through the near ones.
   */
  setOpacity(opacity: number): void
  /** World position of the charge port, for attaching a cable. */
  chargePort: THREE.Object3D
}

function extrude(shape: THREE.Shape, width: number, round: number, roundIn: number, segments: number): THREE.ExtrudeGeometry {
  const depth = width - 2 * round
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: round,
    bevelSize: roundIn,
    bevelOffset: -roundIn,
    bevelSegments: segments,
    curveSegments: 64,
  })
  geo.translate(0, 0, -depth / 2)
  geo.computeVertexNormals()
  return geo
}

/** Copy with smooth per-vertex normals: the fresnel ghost would otherwise show every extrusion facet as a thin line. */
function smoothCopy(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone()
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  const merged = mergeVertices(g, 1e-4)
  merged.computeVertexNormals()
  return merged
}

/** Outermost x of a profile at height y (front if dir = 1, rear if dir = -1). */
function profileX(shape: THREE.Shape, y: number, dir: 1 | -1): number {
  let best = dir === 1 ? -Infinity : Infinity
  for (const p of shape.getSpacedPoints(800)) {
    if (Math.abs(p.y - y) > 0.012) continue
    best = dir === 1 ? Math.max(best, p.x) : Math.min(best, p.x)
  }
  return best
}

function tireGeometry(): THREE.LatheGeometry {
  const r0 = 0.25
  const h = TIRE_W / 2
  const pts = [
    [r0, -h * 0.92],
    [0.325, -h],
    [0.358, -h * 0.82],
    [WHEEL_R, -h * 0.45],
    [WHEEL_R + 0.004, 0],
    [WHEEL_R, h * 0.45],
    [0.358, h * 0.82],
    [0.325, h],
    [r0, h * 0.92],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const geo = new THREE.LatheGeometry(pts, 56)
  geo.rotateX(Math.PI / 2) // lathe axis Y → axle Z
  return geo
}

function rimFaceGeometry(): THREE.LatheGeometry {
  // Slightly dished aero disc, axle along Z, face towards +Z.
  const pts = [
    [0.0, 0.074],
    [0.05, 0.073],
    [0.13, 0.064],
    [0.21, 0.054],
    [0.252, 0.066],
    [0.252, -0.1],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const geo = new THREE.LatheGeometry(pts, 56)
  geo.rotateX(Math.PI / 2)
  return geo
}

const GAUGE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const GAUGE_FRAG = /* glsl */ `
  uniform float uFill;
  uniform float uTime;
  uniform float uPulse;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
    float filled = step(vUv.x, uFill);
    float head = smoothstep(0.035, 0.0, abs(vUv.x - uFill)) * 1.5;
    float flow = 0.55 + 0.45 * sin((vUv.x * 18.0 - uTime * 3.0)) * uPulse;
    vec3 col = uColor * (filled * (1.6 + flow) + head * 3.0) + vec3(0.05) * (1.0 - filled);
    gl_FragColor = vec4(col * edge, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const GHOST_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
const GHOST_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAmount;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
    gl_FragColor = vec4(uColor * (0.08 + f * 2.2), (0.06 + f) * uAmount);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function create(_ctx: SceneContext): Car {
  const car = new THREE.Group()
  car.name = 'car'
  // Every mesh lives in `shell` (identity transform); the headlight sits on `car` so hiding
  // the car never removes a light from the scene.
  const shell = new THREE.Group()
  car.add(shell)

  // Paint, glass and trim
  const paint = new THREE.MeshPhysicalMaterial({
    color: palette.paint,
    roughness: 0.34,
    metalness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    envMapIntensity: 1.0,
  })
  const glass = new THREE.MeshPhysicalMaterial({
    color: palette.glass,
    roughness: 0.14,
    metalness: 0.2,
    clearcoat: 0.6,
    clearcoatRoughness: 0.12,
    specularIntensity: 0.5,
    envMapIntensity: 1.3,
  })
  const trim = new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.55, metalness: 0.2 })

  // Shadow caster for the sun: an ordered-dither cut-out follows the fade, so the shadow on the street
  // thins out with the car (the shadow map has no partial coverage; PCF averages the pattern).
  const shadowFade = { value: 1 }
  const shadowMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  shadowMat.onBeforeCompile = (shader) => {
    shader.uniforms.uShadowFade = shadowFade
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uShadowFade;
        float bayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (uShadowFade < 0.999 && bayer2(gl_FragCoord.xy * 0.5) * 0.25 + bayer2(gl_FragCoord.xy) >= uShadowFade) discard;`,
      )
  }
  shadowMat.customProgramCacheKey = () => 'car-shadow-fade'

  const shape = bodyShape()
  // extrude() insets the side lids by its fourth argument. Over the front wheel the metal is only 0.129 m thick, so an inset of
  // 0.07 made the inset outline cross itself and the lids triangulated into overlapping coplanar triangles: a double layer of paint
  // that z-fights while the paint still writes depth (X-ray < 0.5) and shows as a dark wedge once it does not. Keep it under half
  // the thinnest section.
  const body = new THREE.Mesh(extrude(shape, WIDTH, 0.12, 0.06, 8), paint)
  body.castShadow = true
  body.receiveShadow = true
  body.customDepthMaterial = shadowMat
  shell.add(body)

  const canopy = new THREE.Mesh(extrude(canopyShape(), 1.56, 0.17, 0.09, 8), glass)
  canopy.castShadow = true
  canopy.customDepthMaterial = shadowMat
  shell.add(canopy)

  // Satin trim along the base of the glasshouse defines the windows.
  const trimMetal = new THREE.MeshStandardMaterial({ color: '#c3c9d1', roughness: 0.3, metalness: 1 })
  for (const side of [-1, 1]) {
    const z = side * (1.56 / 2 + 0.005)
    const pts = [
      new THREE.Vector3(1.18, 0.93, z * 0.985),
      new THREE.Vector3(0.2, 0.975, z),
      new THREE.Vector3(-1.2, 1.015, z),
      new THREE.Vector3(-2.02, 1.035, z * 0.97),
    ]
    shell.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.011, 6, false), trimMetal))
  }

  // Dark sill band between the arches gives the body visual lift.
  const sill = new THREE.Mesh(new RoundedBoxGeometry(2 * (WHEEL_X - ARCH_R) - 0.06, 0.13, WIDTH + 0.02, 4, 0.05), trim)
  sill.position.set(0, SILL + 0.075, 0)
  shell.add(sill)

  // Camera-style mirrors
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.09, 0.07, 3, 0.03), glass)
    mirror.position.set(1.06, 1.03, side * (WIDTH / 2 + 0.02))
    shell.add(mirror)
  }

  // Door cuts and flush handles give the slab sides scale.
  const seamMat = new THREE.MeshBasicMaterial({ color: '#2a2f37' })
  const handleMat = new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.25, metalness: 0.9 })
  for (const side of [-1, 1]) {
    const z = side * (WIDTH / 2 + 0.0015)
    for (const [x, top] of [[1.0, 0.96], [-0.12, 1.0], [-1.18, 1.03]] as const) {
      const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.008, top - SILL - 0.14), seamMat)
      seam.position.set(x, (top + SILL + 0.14) / 2, z)
      if (side < 0) seam.rotation.y = Math.PI
      shell.add(seam)
    }
    for (const x of [0.22, -0.9]) {
      const handle = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.026, 0.012, 2, 0.006), handleMat)
      handle.position.set(x, 0.86, side * (WIDTH / 2 + 0.004))
      shell.add(handle)
    }
  }

  // Wheels: tyre, aero disc, accent calliper.
  const tireMat = new THREE.MeshStandardMaterial({ color: palette.tire, roughness: 0.85 })
  const rimMat = new THREE.MeshPhysicalMaterial({
    color: palette.rim,
    roughness: 0.34,
    metalness: 0.85,
    clearcoat: 0.4,
    side: THREE.DoubleSide,
  })
  const calliperMat = new THREE.MeshStandardMaterial({ color: palette.primary, roughness: 0.4, metalness: 0.3 })
  const tireGeo = tireGeometry()
  const rimGeo = rimFaceGeometry()
  const slotGeo = new RoundedBoxGeometry(0.15, 0.022, 0.02, 2, 0.008)
  const slotMat = new THREE.MeshStandardMaterial({ color: '#0b0d10', roughness: 0.7 })
  const spinners: THREE.Object3D[] = []
  for (const x of [-WHEEL_X, WHEEL_X]) {
    for (const side of [-1, 1]) {
      const hub = new THREE.Group()
      hub.position.set(x, WHEEL_R, side * (WIDTH / 2 - TIRE_W / 2 - 0.005))
      const spin = new THREE.Group()
      const tire = new THREE.Mesh(tireGeo, tireMat)
      tire.castShadow = true
      tire.customDepthMaterial = shadowMat
      spin.add(tire)
      const rim = new THREE.Mesh(rimGeo, rimMat)
      rim.scale.z = side
      spin.add(rim)
      for (let i = 0; i < 5; i++) {
        const slot = new THREE.Mesh(slotGeo, slotMat)
        const a = (i / 5) * Math.PI * 2
        slot.position.set(Math.cos(a) * 0.15, Math.sin(a) * 0.15, side * 0.07)
        slot.rotation.z = a
        spin.add(slot)
      }
      hub.add(spin)
      const calliper = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.13, 0.04, 2, 0.015), calliperMat)
      calliper.position.set(0.12, 0.1, side * 0.01)
      calliper.rotation.z = -0.5
      hub.add(calliper)
      shell.add(hub)
      spinners.push(spin)
    }
  }

  // Light bars follow the nose and tail.
  const headY = 0.6
  const tailY = 0.8
  const headX = profileX(shape, headY, 1)
  const tailX = profileX(shape, tailY, -1)
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#e9fbff') })
  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2d55') })
  const bar = (x: number, y: number, dir: 1 | -1, mat: THREE.Material) => {
    const pts = [-0.74, -0.4, 0, 0.4, 0.74].map(
      (z) => new THREE.Vector3(x + dir * (0.012 - Math.pow(Math.abs(z) / 0.74, 2) * 0.05), y, z),
    )
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.017, 8, false), mat)
    shell.add(mesh)
    return mesh
  }
  bar(headX, headY, 1, headMat)
  bar(tailX, tailY, -1, tailMat)
  const beam = new THREE.SpotLight('#dff6ff', 0, 14, 0.5, 0.6, 1.4)
  beam.position.set(headX, headY, 0)
  beam.target.position.set(headX + 6, 0, 0)
  car.add(beam, beam.target)

  // Charge port on the right rear quarter (+Z side): the car parks nose-out with this side to the wallbox.
  const portMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.energy) })
  const chargePort = new THREE.Group()
  chargePort.position.set(-1.72, 0.8, WIDTH / 2 + 0.004)
  const portRing = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.012, 12, 40), portMat)
  const portCapMat = new THREE.MeshStandardMaterial({ color: '#0d1117', roughness: 0.5 })
  const portCap = new THREE.Mesh(new THREE.CircleGeometry(0.056, 32), portCapMat)
  chargePort.add(portCap, portRing)
  shell.add(chargePort)

  // Side battery gauge along the sill (both sides).
  const gaugeUniforms = {
    uFill: { value: 0.6 },
    uTime: { value: 0 },
    uPulse: { value: 0 },
    uOpacity: { value: 1 },
    uColor: { value: new THREE.Color(palette.energy) },
  }
  const gaugeMat = new THREE.ShaderMaterial({ uniforms: gaugeUniforms, vertexShader: GAUGE_VERT, fragmentShader: GAUGE_FRAG })
  for (const side of [-1, 1]) {
    const gauge = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.035), gaugeMat)
    gauge.position.set(0, SILL + 0.075, side * (WIDTH / 2 + 0.012))
    if (side < 0) gauge.rotation.y = Math.PI
    shell.add(gauge)
  }

  // Battery pack: 14 x 5 modules in the floor, revealed by X-ray.
  const cols = 14
  const rows = 5
  // 0.125 m cells on a 0.154 m pitch: gaps of ~3 cm stay several pixels wide, never sub-pixel lines that shimmer.
  const cellGeo = new RoundedBoxGeometry(0.125, 0.075, 0.24, 2, 0.02)
  const cellMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const cells = new THREE.InstancedMesh(cellGeo, cellMat, cols * rows)
  const m = new THREE.Matrix4()
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      m.makeTranslation(-1.0 + (c / (cols - 1)) * 2.0, 0.4, -0.62 + (r / (rows - 1)) * 1.24)
      cells.setMatrixAt(c * rows + r, m)
    }
  }
  cells.visible = false
  shell.add(cells)
  const packBase = new THREE.Mesh(new RoundedBoxGeometry(2.3, 0.05, 1.5, 2, 0.02), new THREE.MeshBasicMaterial({ color: '#0a1218' }))
  packBase.position.set(0, 0.355, 0)
  packBase.visible = false
  shell.add(packBase)
  const cellOn = new THREE.Color(palette.energy).multiplyScalar(3.2)
  const cellOff = new THREE.Color('#122129')

  const ghostMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(palette.accent) }, uAmount: { value: 0 } },
    vertexShader: GHOST_VERT,
    fragmentShader: GHOST_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true, // in front of the shell it copies, so the two never z-fight while the paint still writes depth
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const ghost = new THREE.Group()
  const ghostBody = new THREE.Mesh(smoothCopy(body.geometry), ghostMat)
  const ghostCanopy = new THREE.Mesh(smoothCopy(canopy.geometry), ghostMat)
  // Fixed draw order for the overlapping see-through layers: sorting by distance would flip them as the camera moves.
  body.renderOrder = 1
  canopy.renderOrder = 2
  ghostBody.renderOrder = 3
  ghostCanopy.renderOrder = 4
  ghost.add(ghostBody, ghostCanopy)
  ghost.visible = false
  shell.add(ghost)

  let soc = 0.6
  let mode: CarMode = 'idle'
  let modeColor: string = palette.energy
  let xray = 0
  let wheelSpeed = 0
  let lights = 0
  let shown = true
  let fade = 1

  const paintCells = (time: number) => {
    const lit = soc * cols
    for (let c = 0; c < cols; c++) {
      const level = THREE.MathUtils.clamp(lit - c, 0, 1)
      for (let r = 0; r < rows; r++) {
        const shimmer = mode === 'idle' ? 1 : 0.75 + 0.25 * Math.sin(time * 6 - c * 0.7 + r)
        const col = cellOff.clone().lerp(cellOn, level * shimmer)
        cells.setColorAt(c * rows + r, col)
      }
    }
    if (cells.instanceColor) cells.instanceColor.needsUpdate = true
  }
  paintCells(0)

  // Fade: a depth-only copy of every solid mesh is drawn first (opaque queue). The blended pass
  // then keeps only the nearest surface, and the order the transparent meshes sort in no longer matters.
  const prepassFront = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  const prepassBoth = prepassFront.clone()
  prepassBoth.side = THREE.DoubleSide
  const xrayMats: THREE.Material[] = [paint, glass, trim, trimMetal, seamMat, handleMat]
  // Hairline details (trim tube, door seams, handles) vanish early: faint 1-3 px lines inside the ghost just swim.
  const hairlines: THREE.Material[] = [trimMetal, seamMat, handleMat]
  const plainMats: THREE.Material[] = [tireMat, rimMat, calliperMat, slotMat, headMat, tailMat, portMat, portCapMat, gaugeMat]
  const prepass: THREE.Mesh[] = []
  {
    const solid = new Set<THREE.Material>([...xrayMats, ...plainMats])
    const meshes: THREE.Mesh[] = []
    shell.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh && solid.has(mesh.material as THREE.Material)) meshes.push(mesh)
    })
    for (const mesh of meshes) {
      const copy = new THREE.Mesh(mesh.geometry, (mesh.material as THREE.Material).side === THREE.DoubleSide ? prepassBoth : prepassFront)
      copy.position.copy(mesh.position)
      copy.quaternion.copy(mesh.quaternion)
      copy.scale.copy(mesh.scale)
      copy.visible = false
      mesh.parent?.add(copy) // same parent: wheel copies spin with their wheel
      prepass.push(copy)
    }
  }
  let prepassOn = false

  const blend = (mat: THREE.Material, transparent: boolean, opacity: number, depthWrite: boolean) => {
    if (mat.transparent !== transparent) {
      mat.transparent = transparent
      mat.needsUpdate = true // both program variants are built at boot (director.warmup), so this is a cache hit
    }
    mat.opacity = opacity
    mat.depthWrite = depthWrite
  }
  const syncShown = () => {
    shell.visible = shown && fade > 0.003
    beam.intensity = shell.visible ? lights * 18 * fade : 0
  }
  let appliedXray = -1
  let appliedFade = -1
  /** Derives every material's blend state from the X-ray amount and the fade. Cheap no-op when neither changed. */
  const applyLook = () => {
    if (appliedXray === xray && appliedFade === fade) return
    appliedXray = xray
    appliedFade = fade
    const dissolving = fade < 0.999
    const on = xray > 0.001
    for (const mat of xrayMats) {
      const hair = hairlines.includes(mat)
      const base = hair ? Math.max(0, 1 - xray * 1.8) : 1 - xray * (mat === paint ? 0.9 : 0.96)
      blend(mat, on || dissolving, base * fade, !dissolving && xray < 0.5)
      if (hair) mat.visible = mat.opacity > 0.004
    }
    for (const mat of plainMats) blend(mat, dissolving, fade, !dissolving)
    gaugeUniforms.uOpacity.value = fade
    shadowFade.value = fade
    ghostMat.uniforms.uAmount.value = xray
    // The battery pack and ghost layers are X-ray only; a car that is dissolving drops them.
    const internals = on && !dissolving
    ghost.visible = internals
    cells.visible = internals
    packBase.visible = internals
    if (prepassOn !== dissolving) {
      prepassOn = dissolving
      for (const copy of prepass) copy.visible = dissolving
    }
    syncShown()
  }
  const setXray = (t: number) => {
    xray = THREE.MathUtils.clamp(t, 0, 1)
    applyLook()
  }

  return {
    object: car,
    chargePort,
    setSoc(v) {
      soc = THREE.MathUtils.clamp(v, 0, 1)
      gaugeUniforms.uFill.value = soc
    },
    setMode(v, source = 'solar') {
      mode = v
      modeColor = v === 'charging' ? (source === 'grid' ? palette.grid : palette.solar) : palette.energy
      gaugeUniforms.uPulse.value = v === 'idle' ? 0 : 1
      gaugeUniforms.uColor.value.set(palette.energy)
      portMat.color.set(modeColor)
    },
    setLights(v) {
      lights = THREE.MathUtils.clamp(v, 0, 1)
      headMat.color.set('#e9fbff').multiplyScalar(0.6 + lights * 3.4)
      tailMat.color.set('#ff2d55').multiplyScalar(0.5 + lights * 2.5)
      syncShown()
    },
    setXray,
    setWheelSpin(v) {
      wheelSpeed = v
    },
    setVisible(v) {
      shown = v
      syncShown()
    },
    setOpacity(v) {
      fade = THREE.MathUtils.clamp(v, 0, 1)
      applyLook()
      syncShown()
    },
    update({ time, dt }: Frame) {
      gaugeUniforms.uTime.value = time
      for (const s of spinners) s.rotation.z -= wheelSpeed * dt
      const pulse = mode === 'idle' ? 1 : 1.6 + Math.sin(time * 5) * 1.2
      portMat.color.set(modeColor).multiplyScalar(pulse)
      if (xray > 0.001) paintCells(time)
      void lights
    },
    dispose() {
      car.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
      })
      prepassFront.dispose()
      prepassBoth.dispose()
      shadowMat.dispose()
    },
  }
}

/** Playground controls: &xray=0..1 &opacity=0..1 &mode=charging|discharging &soc=0..1 &lights=0..1 &spin=rad/s */
export function configure(car: Car, p: URLSearchParams): void {
  if (p.has('soc')) car.setSoc(Number(p.get('soc')))
  const mode = p.get('mode')
  if (mode === 'charging' || mode === 'discharging' || mode === 'idle') car.setMode(mode)
  if (p.has('lights')) car.setLights(Number(p.get('lights')))
  if (p.has('xray')) car.setXray(Number(p.get('xray')))
  if (p.has('opacity')) car.setOpacity(Number(p.get('opacity')))
  if (p.has('wheels')) car.setWheelSpin(Number(p.get('wheels')))
}
