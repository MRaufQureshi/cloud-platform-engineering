// Energy flows drawn as particle streams on arcs between four nodes: rooftop PV, the home,
// the car and the grid. Particles are positioned on the GPU (cubic Bézier per arc), their
// density follows the power on that arc, and colour encodes the source:
// amber = solar, teal = car battery, indigo = grid.
import * as THREE from 'three'
import { palette } from '../core/palette.ts'
import type { Frame, Preview, SceneContext, SceneModule } from './types.ts'

export const preview: Preview = { camera: [16, 9, 20], target: [2, 3, 2], hour: 22 }

export type NodeId = 'pv' | 'home' | 'car' | 'grid'
export type FlowId = 'pv-home' | 'pv-car' | 'pv-grid' | 'car-home' | 'grid-home' | 'grid-car'

const FLOW_DEFS: Record<FlowId, { from: NodeId; to: NodeId; color: string; lift: number }> = {
  'pv-home': { from: 'pv', to: 'home', color: palette.solar, lift: 0.9 },
  'pv-car': { from: 'pv', to: 'car', color: palette.solar, lift: 1.4 },
  'pv-grid': { from: 'pv', to: 'grid', color: palette.solar, lift: 2.2 },
  'car-home': { from: 'car', to: 'home', color: palette.energy, lift: 1.6 },
  'grid-home': { from: 'grid', to: 'home', color: palette.grid, lift: 1.8 },
  'grid-car': { from: 'grid', to: 'car', color: palette.grid, lift: 1.4 },
}

export interface Flows extends SceneModule {
  /** Power on an arc in kW; 0 hides it. Visuals saturate around `fullScale` kW. */
  setFlow(id: FlowId, kw: number): void
  setNodes(nodes: Record<NodeId, THREE.Vector3>): void
  /** Moves one node; only the arcs touching it are rebuilt, and only if it actually moved. */
  setNode(id: NodeId, pos: THREE.Vector3): void
  /** Overall opacity (e.g. to fade flows out between chapters). */
  setOpacity(t: number): void
  /** Node world positions (for DOM labels). */
  readonly nodes: Record<NodeId, THREE.Vector3>
}

const STREAM_VERT = /* glsl */ `
  uniform vec3 uP0;
  uniform vec3 uP1;
  uniform vec3 uP2;
  uniform vec3 uP3;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uDensity;
  uniform float uSize;
  uniform float uPixelRatio;
  attribute float aT;
  attribute float aSeed;
  varying float vAlpha;

  vec3 bezier(float t) {
    float u = 1.0 - t;
    return u * u * u * uP0 + 3.0 * u * u * t * uP1 + 3.0 * u * t * t * uP2 + t * t * t * uP3;
  }

  void main() {
    float t = fract(aT + uTime * uSpeed);
    vec3 p = bezier(t);
    // a little swirl around the arc so streams read as volume, not a line
    float a = aSeed * 6.2831 + uTime * (1.5 + aSeed);
    vec3 tangent = normalize(bezier(min(t + 0.01, 1.0)) - bezier(max(t - 0.01, 0.0)));
    vec3 side = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)) + 1e-4);
    vec3 up = cross(side, tangent);
    p += (side * cos(a) + up * sin(a)) * 0.13 * (0.3 + aSeed);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float visible = step(aSeed, uDensity);
    vAlpha = visible * smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.9, t);
    gl_PointSize = uSize * uPixelRatio * (0.6 + aSeed * 0.8) * (60.0 / -mv.z) * visible;
  }
`
const STREAM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float core = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor * (0.6 + core * 3.4), core * vAlpha * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const PER_ARC = 160

export function create(ctx: SceneContext): Flows {
  const root = new THREE.Group()
  root.name = 'flows'
  const nodes: Record<NodeId, THREE.Vector3> = {
    pv: new THREE.Vector3(-1, 8.3, 1.9),
    home: new THREE.Vector3(-0.6, 2.3, 4.0),
    car: new THREE.Vector3(6.6, 2.1, 4.3),
    grid: new THREE.Vector3(-3.5, 0.5, 10.4),
  }

  interface Arc {
    def: (typeof FLOW_DEFS)[FlowId]
    uniforms: Record<string, THREE.IUniform>
    line: THREE.Line
    lineMat: THREE.LineBasicMaterial
    kw: number
    shown: number
  }
  const arcs = new Map<FlowId, Arc>()

  const geo = new THREE.BufferGeometry()
  const ts = new Float32Array(PER_ARC)
  const seeds = new Float32Array(PER_ARC)
  for (let i = 0; i < PER_ARC; i++) {
    ts[i] = i / PER_ARC
    seeds[i] = (i * 0.61803398875) % 1
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PER_ARC * 3), 3))
  geo.setAttribute('aT', new THREE.BufferAttribute(ts, 1))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))

  let opacity = 1
  // Each control point rises relative to its own end, so high→low arcs leave the roof
  // gently and land softly instead of looping far above the scene.
  const control = (from: THREE.Vector3, to: THREE.Vector3, lift: number) => {
    const dist = from.distanceTo(to)
    const p1 = from.clone().lerp(to, 0.3)
    const p2 = from.clone().lerp(to, 0.7)
    p1.y = from.y + lift * 0.6 + dist * 0.06
    p2.y = to.y + lift + dist * 0.12
    return [from.clone(), p1, p2, to.clone()]
  }

  for (const [id, def] of Object.entries(FLOW_DEFS) as [FlowId, (typeof FLOW_DEFS)[FlowId]][]) {
    const [p0, p1, p2, p3] = control(nodes[def.from], nodes[def.to], def.lift)
    const uniforms = {
      uP0: { value: p0 },
      uP1: { value: p1 },
      uP2: { value: p2 },
      uP3: { value: p3 },
      uTime: { value: 0 },
      uSpeed: { value: 0.18 },
      uDensity: { value: 0 },
      uSize: { value: 3.6 },
      uPixelRatio: { value: ctx.renderer.getPixelRatio() },
      uColor: { value: new THREE.Color(def.color) },
      uOpacity: { value: 1 },
    }
    const points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: STREAM_VERT,
        fragmentShader: STREAM_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    points.frustumCulled = false
    root.add(points)

    const lineMat = new THREE.LineBasicMaterial({ color: def.color, transparent: true, opacity: 0, depthWrite: false })
    const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3)
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(64)), lineMat)
    root.add(line)
    arcs.set(id, { def, uniforms, line, lineMat, kw: 0, shown: 0 })
  }

  // Node rings
  const rings: Record<NodeId, THREE.Mesh> = {} as Record<NodeId, THREE.Mesh>
  const ringColor: Record<NodeId, string> = { pv: palette.solar, home: palette.text, car: palette.energy, grid: palette.grid }
  for (const id of Object.keys(nodes) as NodeId[]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.025, 10, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(ringColor[id]).multiplyScalar(2.5), transparent: true, opacity: 0.9, depthWrite: false }),
    )
    ring.position.copy(nodes[id])
    root.add(ring)
    rings[id] = ring
  }

  const rebuild = (only?: NodeId) => {
    for (const arc of arcs.values()) {
      if (only && arc.def.from !== only && arc.def.to !== only) continue
      const [p0, p1, p2, p3] = control(nodes[arc.def.from], nodes[arc.def.to], arc.def.lift)
      arc.uniforms.uP0.value.copy(p0)
      arc.uniforms.uP1.value.copy(p1)
      arc.uniforms.uP2.value.copy(p2)
      arc.uniforms.uP3.value.copy(p3)
      arc.line.geometry.setFromPoints(new THREE.CubicBezierCurve3(p0, p1, p2, p3).getPoints(64))
    }
    for (const id of Object.keys(nodes) as NodeId[]) if (!only || id === only) rings[id].position.copy(nodes[id])
  }

  return {
    object: root,
    nodes,
    setFlow(id, kw) {
      const arc = arcs.get(id)
      if (arc) arc.kw = Math.max(0, kw)
    },
    setNodes(next) {
      for (const id of Object.keys(next) as NodeId[]) nodes[id].copy(next[id])
      rebuild()
    },
    setNode(id, pos) {
      if (nodes[id].distanceToSquared(pos) < 1e-6) return
      nodes[id].copy(pos)
      rebuild(id)
    },
    setOpacity(t) {
      opacity = THREE.MathUtils.clamp(t, 0, 1)
    },
    update({ time, dt }: Frame) {
      const k = 1 - Math.exp(-dt * 4)
      // Read every frame: dynamic resolution changes the ratio, and point sizes are in device pixels.
      const pixelRatio = ctx.renderer.getPixelRatio()
      for (const arc of arcs.values()) {
        arc.uniforms.uPixelRatio.value = pixelRatio
        const target = arc.kw > 0.02 ? 0.25 + 0.75 * Math.min(arc.kw / 4, 1) : 0
        arc.shown += (target - arc.shown) * k
        arc.uniforms.uDensity.value = arc.shown
        arc.uniforms.uTime.value = time
        arc.uniforms.uSpeed.value = 0.12 + 0.1 * Math.min(arc.kw / 4, 1)
        arc.uniforms.uOpacity.value = opacity
        arc.lineMat.opacity = Math.min(arc.shown * 2, 1) * 0.22 * opacity
      }
      for (const id of Object.keys(rings) as NodeId[]) {
        const ring = rings[id]
        const active = [...arcs.values()].some((a) => a.shown > 0.05 && (a.def.from === id || a.def.to === id))
        const mat = ring.material as THREE.MeshBasicMaterial
        mat.opacity += ((active ? 0.95 : 0.0) * opacity - mat.opacity) * k
        ring.visible = mat.opacity > 0.01
        ring.lookAt(ctx.camera.position)
        ring.scale.setScalar(1 + 0.12 * Math.sin(time * 3 + ring.position.x))
      }
    },
  }
}

/** Playground: &flows=pv-car:3,car-home:1.2 */
export function configure(f: Flows, p: URLSearchParams): void {
  for (const part of (p.get('flows') ?? 'pv-car:3,car-home:1.5,grid-home:0.6').split(',')) {
    const [id, kw] = part.split(':')
    f.setFlow(id as FlowId, Number(kw))
  }
}
