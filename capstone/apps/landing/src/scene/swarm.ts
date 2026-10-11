// Ignition swarm: one GPU point cloud that morphs between three shapes: a headline
// (rasterised with the site font), a cluster around given points (e.g. the charge port)
// and a loose drifting cloud. A morph is a pure function of t: each particle has a delay
// that sweeps left → right along the text, and mid-flight it winds around its path and
// along a divergence-free swirl field, so scroll scrubbing is cheap, reversible and
// deterministic. Coherence comes from the layout: particles are ranked by their glyph's x
// and the cloud is the glyph layout carried along the swirl field, so neighbours stay
// neighbours and a morph unrolls as ribbons rather than noise.
// Colour: teal (stored energy); a few white sparkles are the only bloom sources.
import * as THREE from 'three'
import { palette } from '../core/palette.ts'
import { sampleText, type TextPlane, type TextStyle } from './textPoints.ts'
import type { Frame, Preview, SceneContext, SceneModule } from './types.ts'

export type { TextPlane } from './textPoints.ts'
export { planeFromRect, readHeadline } from './textPoints.ts'

export const preview: Preview = { camera: [0, 1.6, 12], target: [0, 1.6, 0], hour: 15 }

export type SwarmShape = 'text' | 'point' | 'cloud'

export interface TextTargetOptions extends TextStyle {
  plane: TextPlane
}

export interface PointTargetOptions {
  /** Cluster radius around each point, world units (default 0.12). */
  radius?: number
  /** Share of particles still visible once they arrive; the rest are absorbed (default 0.3). */
  keep?: number
}

export interface Swarm extends SceneModule {
  readonly count: number
  /** Rasterises `text` ('\n' for line breaks) and lays it out on `plane`. Resolves when uploaded. */
  setTextTarget(text: string, opts: TextTargetOptions): Promise<void>
  /** Moves the sampled text block without re-sampling; cheap enough for every frame. */
  setTextPlane(plane: TextPlane): void
  setPointTarget(points: THREE.Vector3[] | Float32Array, opts?: PointTargetOptions): void
  setCloudTarget(center: THREE.Vector3, radius: number): void
  /** t ∈ [0, 1]; from === to simply shows that shape. */
  setMorph(from: SwarmShape, to: SwarmShape, t: number): void
  setOpacity(t: number): void
  /** Pointer in NDC (x right, y up). Pass values far outside ±1 when it leaves the window. */
  setPointer(ndcX: number, ndcY: number): void
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uMotion;
  uniform float uMorph;
  uniform float uSpread;
  uniform vec3 uFrom;
  uniform vec3 uTo;
  uniform vec3 uTextCenter;
  uniform vec3 uTextRight;
  uniform vec3 uTextUp;
  uniform vec3 uTextNormal;
  uniform vec3 uCloudCenter;
  uniform float uCloudRadius;
  uniform float uPointRadius;
  uniform float uKeep;
  uniform vec3 uSizes;
  uniform vec3 uGlows;
  uniform float uHelix;
  uniform float uSpin;
  uniform float uSwirl;
  uniform float uEddy;
  uniform float uScale;
  uniform float uMaxSize;
  uniform vec2 uPointer;
  uniform float uPush;
  uniform float uPushRadius;
  uniform float uAspect;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform vec3 uSpark;
  uniform vec3 uWhite;
  uniform float uEdgeGlow;
  attribute float aTone;
  attribute vec3 aText;
  attribute vec3 aPoint;
  attribute vec4 aSeed;
  varying vec3 vColor;
  varying float vAlpha;

  // ABC flow: divergence-free, so displaced particles swirl instead of bunching up.
  vec3 flow(vec3 p) {
    return vec3(sin(p.z) + cos(p.y), sin(p.x) + cos(p.z), sin(p.y) + cos(p.x));
  }

  void main() {
    vec3 text = uTextCenter + uTextRight * aText.x + uTextUp * aText.y;
    vec3 point = aPoint;
    vec3 cloud = position;
    if (uFrom.z + uTo.z > 0.0) {
      cloud += flow((position - uCloudCenter) / uCloudRadius * 2.0 + uTime * 0.08 * uMotion) * uCloudRadius * 0.05;
    }
    if (uFrom.y + uTo.y > 0.0) {
      point += flow(aPoint / uPointRadius * 1.3 + aSeed.z * 6.0 + uTime * 0.8 * uMotion) * uPointRadius * 0.3;
    }
    vec3 a = text * uFrom.x + point * uFrom.y + cloud * uFrom.z;
    vec3 b = text * uTo.x + point * uTo.y + cloud * uTo.z;

    float t = clamp((uMorph - aSeed.x * uSpread) / (1.0 - uSpread), 0.0, 1.0);
    float e = t * t * (3.0 - 2.0 * t);
    float bump = 4.0 * e * (1.0 - e);
    vec3 p = mix(a, b, e);
    // Wind around the path; the phase follows the glyph layout, so letters peel off as ribbons.
    vec3 dir = b - a;
    float len = length(dir);
    if (len > 1e-4) {
      vec3 n = dir / len;
      vec3 s = cross(n, uTextNormal);
      s = dot(s, s) < 1e-3 ? cross(n, normalize(uTextUp)) : s;
      s = normalize(s);
      float th = (aText.x * 2.0 + aText.y * 5.0) * 6.2832 + e * uSpin;
      p += (s * cos(th) + cross(n, s) * sin(th)) * bump * len * uHelix;
    }
    p += flow(p / uEddy + aSeed.z * 0.4) * bump * uSwirl * uEddy * 0.1;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 clip = projectionMatrix * mv;
    if (abs(uPush) > 0.001 && clip.w > 0.0) {
      vec2 d = (clip.xy / clip.w - uPointer) * vec2(uAspect, 1.0);
      float r = length(d);
      float k = uPush * uPushRadius * exp(-r * r / (uPushRadius * uPushRadius));
      clip.xy += d / max(r, 1e-4) * k * vec2(1.0 / uAspect, 1.0) * clip.w;
    }
    gl_Position = clip;

    float spark = step(0.988, aSeed.w);
    float size = mix(dot(uFrom, uSizes), dot(uTo, uSizes), e) * aSeed.y * (1.0 + 0.4 * bump) * (1.0 + 0.3 * spark);
    float px = size * projectionMatrix[1][1] * uScale / max(-mv.z, 1e-3);
    gl_PointSize = clamp(px, 1.5, uMaxSize);

    // Glyph rims burn a little brighter so the letterforms stay crisp.
    float rim = max(aText.z - 1.0, 0.0) * mix(uFrom.x, uTo.x, e);
    float glow = mix(dot(uFrom, uGlows), dot(uTo, uGlows), e) * (1.0 - 0.3 * bump) * (1.0 + uEdgeGlow * rim);
    float twinkle = 1.0 + 0.14 * sin(uTime * (1.0 + 2.0 * aSeed.y) + aSeed.z * 6.2832) * uMotion;
    float flash = pow(0.5 + 0.5 * sin(uTime * (0.6 + 1.4 * aSeed.w) * uMotion + aSeed.z * 37.0), 14.0);
    vec3 hue = mix(uColor, uAccent, fract(aSeed.w * 7.31) * 0.7);
    hue = mix(hue, uWhite, aTone); // aTone = 1: a white word (closing title); the hero stays all teal
    vColor = mix(hue * glow * twinkle, uSpark * (1.1 + 4.0 * flash), spark);

    // Per-shape visibility: surplus text particles and absorbed point particles hide.
    vec3 vis = vec3(step(0.5, aText.z), step(fract(aSeed.w * 13.7), uKeep), 1.0);
    float va = dot(uFrom, vis);
    float vb = dot(uTo, vis);
    float k = vb < va ? smoothstep(0.55, 1.0, e) : smoothstep(0.0, 0.45, e);
    // Sub-pixel points are drawn at 1.5px with the same total light, so they don't shimmer.
    vAlpha = mix(va, vb, k) * uOpacity * min(1.0, px * px / 2.25);
  }
`

const FRAG = /* glsl */ `
  uniform float uSharp;
  uniform float uHalo;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r2 = dot(c, c) * 4.0;
    if (r2 > 1.0 || vAlpha < 0.002) discard;
    // Sharp core for the dust texture plus a faint wide halo; halos overlap into a soft fill.
    float a = exp(-r2 * uSharp) + uHalo * (exp(-r2 * 2.5) - 0.082);
    gl_FragColor = vec4(vColor, a * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const SHAPES: Record<SwarmShape, [number, number, number]> = { text: [1, 0, 0], point: [0, 1, 0], cloud: [0, 0, 1] }
// Diagonal sweep: top-left glyphs move first, like reading.
const SLANT = 0.3

/** Deterministic PRNG (mulberry32) so layouts are identical on every load. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Writes src items into dst sorted by key, so particle i receives the i-th item in x order. */
function assignByRank(dst: Float32Array, src: Float32Array, stride: number, keys: Float32Array): void {
  const order = Uint32Array.from({ length: keys.length }, (_, i) => i).sort((a, b) => keys[a] - keys[b])
  for (let r = 0; r < order.length; r++) for (let k = 0; k < stride; k++) dst[r * stride + k] = src[order[r] * stride + k]
}

/** Cloud = the glyph layout (u, v) carried along an ABC swirl field and folded into a ball. */
function cloudFromLayout(dst: Float32Array, layout: Float32Array, center: THREE.Vector3, radius: number, right: THREE.Vector3, up: THREE.Vector3): void {
  const count = layout.length / 3
  const normal = new THREE.Vector3().crossVectors(right, up).normalize()
  const f = 4.2 / radius
  const h = radius * 0.03
  const local = new Float32Array(count * 3)
  const mean = [0, 0, 0]
  // Stretch the (flat) text block into a slab so the folded result has volume.
  let vMax = 0.02
  for (let i = 0; i < count; i++) vMax = Math.max(vMax, Math.abs(layout[i * 3 + 1]))
  for (let i = 0; i < count; i++) {
    const u = layout[i * 3]
    const v = layout[i * 3 + 1]
    // Smooth start (no random depth) so neighbouring glyph particles share streamlines.
    let x = u * radius * 1.8
    let y = (v / vMax) * radius * 0.55
    let z = Math.sin(u * 9 + v * 21) * radius * 0.25
    for (let k = 0; k < 44; k++) {
      const vx = Math.sin(z * f + 1.3) + Math.cos(y * f)
      const vy = Math.sin(x * f) + Math.cos(z * f + 1.3)
      const vz = Math.sin(y * f) + Math.cos(x * f)
      x += vx * h
      y += vy * h
      z += vz * h
    }
    local[i * 3] = x
    local[i * 3 + 1] = y
    local[i * 3 + 2] = z
    mean[0] += x / count
    mean[1] += y / count
    mean[2] += z / count
  }
  for (let i = 0; i < count; i++) {
    const x = local[i * 3] - mean[0]
    const y = local[i * 3 + 1] - mean[1]
    const z = local[i * 3 + 2] - mean[2]
    const d = Math.hypot(x, y, z)
    const s = d > 1e-6 ? (radius * Math.tanh(d / radius)) / d : 1
    for (let c = 0; c < 3; c++) {
      const axis = c === 0 ? 'x' : c === 1 ? 'y' : 'z'
      dst[i * 3 + c] = center[axis] + (right[axis] * x + up[axis] * y + normal[axis] * z) * s
    }
  }
}

const contexts = new WeakMap<Swarm, SceneContext>()
const tune = { textSize: 2.6 }

export function create(ctx: SceneContext, opts: { count?: number } = {}): Swarm {
  // 16k on high, ~9.6k on medium, ~5.6k on low.
  const count = Math.max(256, Math.round(opts.count ?? 16000 * ctx.quality.density))
  const rand = rng(0x5eed)
  const motion = ctx.quality.reducedMotion ? 0 : 1

  const cloud = new Float32Array(count * 3)
  const point = new Float32Array(count * 3)
  // Glyph layout in plane units (u, v, visible); doubles as every particle's identity.
  const text = new Float32Array(count * 3)
  const seed = new Float32Array(count * 4)
  const tone = new Float32Array(count) // 0 = teal, 1 = white (per glyph, set by setTextTarget)
  for (let i = 0; i < count; i++) {
    seed[i * 4] = THREE.MathUtils.clamp(i / (count - 1) + (rand() - 0.5) * 0.04, 0, 1) // delay = x rank
    seed[i * 4 + 1] = 0.75 + 0.5 * rand() * rand() // size: mostly fine, a few larger
    seed[i * 4 + 2] = rand() // phase
    seed[i * 4 + 3] = rand() // sparkle / keep lottery
    text[i * 3] = i / (count - 1) - 0.5
    text[i * 3 + 1] = (rand() - 0.5) * 0.4
  }
  const geo = new THREE.BufferGeometry()
  const cloudAttr = new THREE.BufferAttribute(cloud, 3)
  const pointAttr = new THREE.BufferAttribute(point, 3)
  const textAttr = new THREE.BufferAttribute(text, 3)
  geo.setAttribute('position', cloudAttr)
  geo.setAttribute('aPoint', pointAttr)
  geo.setAttribute('aText', textAttr)
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
  const toneAttr = new THREE.BufferAttribute(tone, 1)
  geo.setAttribute('aTone', toneAttr)

  const uniforms = {
    uTime: { value: 0 },
    uMotion: { value: motion },
    uMorph: { value: 0 },
    uSpread: { value: 0.5 },
    uFrom: { value: new THREE.Vector3(0, 0, 1) },
    uTo: { value: new THREE.Vector3(0, 0, 1) },
    uTextCenter: { value: new THREE.Vector3() },
    uTextRight: { value: new THREE.Vector3(1, 0, 0) },
    uTextUp: { value: new THREE.Vector3(0, 1, 0) },
    uTextNormal: { value: new THREE.Vector3(0, 0, 1) },
    uCloudCenter: { value: new THREE.Vector3() },
    uCloudRadius: { value: 3 },
    uPointRadius: { value: 0.12 },
    uKeep: { value: 0.3 },
    uSizes: { value: new THREE.Vector3(0.03, 0.02, 0.04) },
    uGlows: { value: new THREE.Vector3(1.7, 0.5, 0.75) },
    uHelix: { value: 0.12 },
    uSpin: { value: 4 },
    uSwirl: { value: 1 },
    uSharp: { value: 18 },
    uHalo: { value: 0.09 },
    uEddy: { value: 2 },
    uScale: { value: 450 },
    uMaxSize: { value: 48 * ctx.renderer.getPixelRatio() },
    uPointer: { value: new THREE.Vector2(9, 9) },
    uPush: { value: 0 },
    uPushRadius: { value: 0.12 },
    uAspect: { value: 1 },
    uOpacity: { value: 1 },
    uColor: { value: new THREE.Color(palette.energy) },
    uAccent: { value: new THREE.Color(palette.accent) },
    uEdgeGlow: { value: 1 },
    uSpark: { value: new THREE.Color('#e6fffb') },
    // White words: kept under the bloom threshold so the letters stay crisp (dense additive overlap adds up).
    uWhite: { value: new THREE.Color(0.82, 0.86, 0.9) },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, material)
  points.name = 'swarm'
  points.frustumCulled = false
  points.renderOrder = 10

  const plane: TextPlane = { center: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), width: 8 }
  const cloudShape = { center: new THREE.Vector3(), radius: 3 }
  let pointRaw: Float32Array = new Float32Array(0)
  let textSpacing = 0.004
  let textToken = 0
  const buffer = new THREE.Vector2()
  const pointerTarget = new THREE.Vector2(9, 9)
  const pointerNow = new THREE.Vector2(9, 9)
  let push = 0
  let pushVel = 0

  const buildCloud = () => {
    cloudFromLayout(cloud, text, cloudShape.center, cloudShape.radius, plane.right, plane.up)
    cloudAttr.needsUpdate = true
  }
  const sortPoint = () => {
    if (!pointRaw.length) return
    const keys = new Float32Array(count)
    const v = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      v.fromArray(pointRaw, i * 3)
      keys[i] = v.dot(plane.right) - SLANT * v.dot(plane.up)
    }
    assignByRank(point, pointRaw, 3, keys)
    pointAttr.needsUpdate = true
  }
  const applyPlane = () => {
    uniforms.uTextCenter.value.copy(plane.center)
    uniforms.uTextRight.value.copy(plane.right).multiplyScalar(plane.width)
    uniforms.uTextUp.value.copy(plane.up).multiplyScalar(plane.width)
    uniforms.uTextNormal.value.crossVectors(plane.right, plane.up).normalize()
    uniforms.uSizes.value.x = textSpacing * plane.width * tune.textSize
    uniforms.uEddy.value = Math.max(plane.width * 0.12, 1e-3)
  }

  const swarm: Swarm = {
    object: points,
    count,
    async setTextTarget(str, o) {
      const token = ++textToken
      const samples = await sampleText(str, o, count, rng(str.length * 977 + 1))
      if (token !== textToken) return
      const n = samples.points.length / 2
      const r = rng(23)
      const src = new Float32Array(count * 3)
      const keys = new Float32Array(count)
      const toneSrc = new Float32Array(count)
      const split = Boolean(o.marks) // marked (<em>) words stay teal, the rest turns white
      for (let i = 0; i < count; i++) {
        // Surplus particles shadow a glyph sample (hidden while the text shows).
        const j = i < n ? i : Math.floor(r() * n)
        if (split && n) toneSrc[i] = samples.accent[j] ? 0 : 1
        const u = n ? samples.points[j * 2] + (i < n ? 0 : (r() - 0.5) * samples.spacing) : 0
        const v = n ? samples.points[j * 2 + 1] + (i < n ? 0 : (r() - 0.5) * samples.spacing) : 0
        src[i * 3] = u
        src[i * 3 + 1] = v
        src[i * 3 + 2] = i < n ? 1 + samples.edge[i] : 0
        keys[i] = u - SLANT * v + (r() - 0.5) * 0.015
      }
      assignByRank(text, src, 3, keys)
      assignByRank(tone, toneSrc, 1, keys)
      textAttr.needsUpdate = true
      toneAttr.needsUpdate = true
      textSpacing = samples.spacing
      const turned = plane.right.dot(o.plane.right) < 0.985 || plane.up.dot(o.plane.up) < 0.985
      swarm.setTextPlane(o.plane)
      buildCloud()
      if (turned) sortPoint()
    },
    setTextPlane(next) {
      plane.center.copy(next.center)
      plane.right.copy(next.right).normalize()
      plane.up.copy(next.up).normalize()
      plane.width = next.width
      applyPlane()
    },
    setPointTarget(pts, o = {}) {
      const flat = pts instanceof Float32Array ? pts : Float32Array.from(pts.flatMap((p) => [p.x, p.y, p.z]))
      const m = Math.floor(flat.length / 3)
      if (!m) return
      const radius = o.radius ?? 0.12
      const r = rng(31)
      pointRaw = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        const j = i % m
        // Gaussian ball around its point.
        const g = radius * Math.min(2.2, Math.sqrt(-2 * Math.log(1 - r() * 0.999))) * 0.6
        const th = r() * Math.PI * 2
        const ph = Math.acos(2 * r() - 1)
        pointRaw[i * 3] = flat[j * 3] + g * Math.sin(ph) * Math.cos(th)
        pointRaw[i * 3 + 1] = flat[j * 3 + 1] + g * Math.cos(ph)
        pointRaw[i * 3 + 2] = flat[j * 3 + 2] + g * Math.sin(ph) * Math.sin(th)
      }
      uniforms.uPointRadius.value = Math.max(radius, 1e-3)
      uniforms.uKeep.value = THREE.MathUtils.clamp(o.keep ?? 0.3, 0, 1)
      uniforms.uSizes.value.y = radius * 0.16
      sortPoint()
    },
    setCloudTarget(center, radius) {
      cloudShape.center.copy(center)
      cloudShape.radius = Math.max(radius, 1e-3)
      uniforms.uCloudCenter.value.copy(center)
      uniforms.uCloudRadius.value = cloudShape.radius
      uniforms.uSizes.value.z = cloudShape.radius * 0.012
      buildCloud()
    },
    setMorph(from, to, t) {
      uniforms.uFrom.value.fromArray(SHAPES[from])
      uniforms.uTo.value.fromArray(SHAPES[to])
      uniforms.uMorph.value = THREE.MathUtils.clamp(t, 0, 1)
    },
    setOpacity(t) {
      uniforms.uOpacity.value = THREE.MathUtils.clamp(t, 0, 1)
      points.visible = uniforms.uOpacity.value > 0.001
    },
    setPointer(x, y) {
      pointerTarget.set(x, y)
    },
    update({ time, dt }: Frame) {
      uniforms.uTime.value = time
      ctx.renderer.getDrawingBufferSize(buffer)
      uniforms.uScale.value = buffer.y * 0.5
      uniforms.uMaxSize.value = 48 * ctx.renderer.getPixelRatio() // dynamic resolution changes it
      uniforms.uAspect.value = buffer.x / Math.max(1, buffer.y)
      // Pointer: the dent follows with a little lag; its depth rises with speed and springs
      // back past rest when the pointer stops, so displaced particles settle with a bounce.
      const step = Math.min(dt, 1 / 30)
      const prevX = pointerNow.x
      const prevY = pointerNow.y
      pointerNow.lerp(pointerTarget, 1 - Math.exp(-step * 14))
      const speed = Math.hypot(pointerNow.x - prevX, pointerNow.y - prevY) / Math.max(step, 1e-3)
      const inside = Math.abs(pointerNow.x) < 1.5 && Math.abs(pointerNow.y) < 1.5
      const goal = inside ? motion * (0.12 + Math.min(speed * 0.08, 0.3)) : 0
      pushVel += ((goal - push) * 120 - pushVel * 11) * step
      push += pushVel * step
      uniforms.uPointer.value.copy(pointerNow)
      uniforms.uPush.value = push
    },
    dispose() {
      geo.dispose()
      material.dispose()
    },
  }

  applyPlane()
  swarm.setCloudTarget(cloudShape.center, cloudShape.radius)
  point.set(cloud)
  contexts.set(swarm, ctx)
  return swarm
}

/** Playground: &morph=0..1 &text=POWER (| breaks a line) &from=cloud &to=text, plus tuning:
 *  &spread &helix &spin &swirl &pointer=x,y */
export function configure(swarm: Swarm, p: URLSearchParams): void {
  const ctx = contexts.get(swarm)
  if (!ctx) return
  const vec = (s: string | null, fallback: [number, number, number]) => {
    const v = (s ?? '').split(',').map(Number)
    return new THREE.Vector3(...(v.length === 3 && v.every(Number.isFinite) ? v : fallback))
  }
  const cam = vec(p.get('cam'), preview.camera)
  const target = vec(p.get('target'), preview.target)
  const forward = target.clone().sub(cam).normalize()
  const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize()
  const up = right.clone().cross(forward)
  const viewH = 2 * cam.distanceTo(target) * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov / 2))
  const width = viewH * ctx.camera.aspect * 0.76
  swarm.setCloudTarget(target, width * 0.36)
  swarm.setPointTarget([target.clone().addScaledVector(right, width * 0.36).addScaledVector(up, -viewH * 0.32)])
  const shape = (s: string | null, fallback: SwarmShape): SwarmShape => (s === 'text' || s === 'point' || s === 'cloud' ? s : fallback)
  swarm.setMorph(shape(p.get('from'), 'cloud'), shape(p.get('to'), 'text'), Number(p.get('morph') ?? 1))
  const u = (swarm.object as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>).material.uniforms
  for (const [key, name] of [['spread', 'uSpread'], ['helix', 'uHelix'], ['spin', 'uSpin'], ['swirl', 'uSwirl'], ['sharp', 'uSharp'], ['edge', 'uEdgeGlow'], ['halo', 'uHalo']] as const) {
    if (p.has(key)) u[name].value = Number(p.get(key))
  }
  if (p.has('tsize')) tune.textSize = Number(p.get('tsize'))
  if (p.has('glow')) u.uGlows.value.fromArray(p.get('glow')!.split(',').map(Number))
  void swarm.setTextTarget((p.get('text') ?? 'POWER, BOTH WAYS.').replaceAll('|', '\n'), { plane: { center: target, right, up, width } })
  if (p.has('pointer')) {
    const [x, y] = (p.get('pointer') as string).split(',').map(Number)
    swarm.setPointer(x, y)
  }
  addEventListener('pointermove', (e) => swarm.setPointer((e.clientX / innerWidth) * 2 - 1, 1 - (e.clientY / innerHeight) * 2))
}
