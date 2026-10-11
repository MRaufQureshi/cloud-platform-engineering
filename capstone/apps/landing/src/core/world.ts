// The single WebGL world behind the page: renderer, camera, image-based lighting and the
// post-processing chain (render → bloom → tone mapping → grade). Rendering is driven by
// gsap.ticker so scroll-scrubbed tweens and frames stay in lockstep. Without input for a
// moment only every second frame is drawn, and a lost GL context pauses drawing until restored.
import * as THREE from 'three'
import { gsap } from 'gsap'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { createClampPass, createGradePass } from './gradePass.ts'
import { createStudioEnvironment } from './studioEnv.ts'
import type { Quality } from './quality.ts'

export type TickFn = (time: number, dt: number) => void

/** Input that keeps rendering at full rate; IDLE_MS after the last one, every second frame is drawn. */
const ACTIVITY = ['scroll', 'wheel', 'pointermove', 'pointerdown', 'keydown', 'touchstart', 'touchmove']
const IDLE_MS = 1500

export class World {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly composer: EffectComposer | null = null
  readonly bloom: UnrealBloomPass | null = null
  readonly grade: ShaderPass | null = null
  readonly quality: Quality
  private env: THREE.Texture
  private readonly ticks = new Set<TickFn>()
  private running = false
  private elapsed = 0
  /** Dynamic resolution: 1 = full budget; drops when frames run long, recovers with headroom. */
  private scale = 1
  /** `?fixres` pins the render scale at 1 (QA: stable pixel ratio for measurements). */
  private readonly fixedRes = new URLSearchParams(location.search).has('fixres')
  private slowFrames = 0
  private fastFrames = 0
  private frameAvg = 16.7
  /** Idle throttle: full-rate drawing until this performance.now() time. */
  private awakeUntil = 0
  private skipped = false
  private contextLost = false
  private readonly loop = (_t: number, deltaMs: number) => {
    this.adapt(deltaMs)
    this.frame(Math.min(deltaMs, 50) / 1000)
  }

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality
    const usePost = quality.bloom
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !usePost,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.shadowMap.enabled = quality.shadows
    this.renderer.shadowMap.type = THREE.PCFShadowMap

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 4000)
    this.camera.position.set(0, 6, 18)

    this.env = createStudioEnvironment(this.renderer)
    this.scene.environment = this.env
    this.scene.background = new THREE.Color('#0b0f14')

    if (usePost) {
      const target = new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        samples: quality.msaa,
      })
      const composer = new EffectComposer(this.renderer, target)
      composer.addPass(new RenderPass(this.scene, this.camera))
      composer.addPass(createClampPass(6))
      const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.5, 2.4)
      composer.addPass(bloom)
      composer.addPass(new OutputPass())
      const grade = createGradePass()
      if (new URLSearchParams(location.search).has('nograin')) grade.uniforms.uGrain.value = 0 // QA: noise-free frames for shimmer measurements
      composer.addPass(grade)
      this.composer = composer
      this.bloom = bloom
      this.grade = grade
    }

    this.resize()
    addEventListener('resize', () => this.resize())
    const onInput = () => this.wake()
    for (const type of ACTIVITY) addEventListener(type, onInput, { passive: true, capture: true })

    // three already skips its draws while the context is lost; pause the composer too. On
    // restore three rebuilds its GL state, but the PMREM environment (rendered once at boot)
    // comes back empty, so render it again and recompile before drawing.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.contextLost = true
    })
    canvas.addEventListener('webglcontextrestored', () => {
      const old = this.env
      this.env = createStudioEnvironment(this.renderer)
      this.scene.environment = this.env
      old.dispose()
      const resume = () => {
        this.contextLost = false
        this.wake()
      }
      // Programs compiled on a lost context never report ready, so don't wait forever.
      Promise.race([this.prewarm(), new Promise((r) => setTimeout(r, 3000))]).then(resume, resume)
    })
  }

  /** Studio IBL texture (replaced after a GL context restore; scene.environment follows it). */
  get envMap(): THREE.Texture {
    return this.env
  }

  /** Pixel ratio within the tier's DPR cap, its pixel ceiling and the dynamic scale. */
  private pixelRatio(w: number, h: number): number {
    const q = this.quality
    const budget = Math.sqrt(q.maxPixels / Math.max(1, w * h))
    return Math.max(0.5, Math.min(devicePixelRatio, q.dpr, budget) * this.scale)
  }

  resize(): void {
    const w = innerWidth
    const h = innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(this.pixelRatio(w, h))
    this.renderer.setSize(w, h, false)
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio())
      this.composer.setSize(w, h)
    }
  }

  /** Adjusts render resolution after sustained slow or fast stretches (never every frame). */
  private adapt(dtMs: number): void {
    if (this.fixedRes || dtMs <= 0 || dtMs > 250) return // first frame, tab switches
    this.frameAvg += (dtMs - this.frameAvg) * 0.05
    if (this.frameAvg > 24) {
      this.fastFrames = 0
      if (++this.slowFrames > 45 && this.scale > 0.55) {
        this.scale = Math.max(0.55, this.scale * 0.85)
        this.slowFrames = 0
        this.frameAvg = 16.7
        this.resize()
      }
    } else if (this.frameAvg < 15 && this.scale < 1) {
      this.slowFrames = 0
      if (++this.fastFrames > 240) {
        this.scale = Math.min(1, this.scale * 1.1)
        this.fastFrames = 0
        this.resize()
      }
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1)
    }
  }

  /**
   * Compiles every material for the target the scene really renders into (the composer's
   * linear buffer when post-processing is on, else the canvas), so no program variant has to
   * be built on the first frames.
   */
  async prewarm(): Promise<void> {
    const r = this.renderer
    const previous = r.getRenderTarget()
    if (this.composer) r.setRenderTarget(this.composer.renderTarget1)
    try {
      await r.compileAsync(this.scene, this.camera)
    } finally {
      r.setRenderTarget(previous)
    }
  }

  /** Keeps full-rate drawing for at least `ms`. Input does this itself; call it for scripted animations. */
  wake(ms = IDLE_MS): void {
    this.awakeUntil = Math.max(this.awakeUntil, performance.now() + ms)
  }

  onTick(fn: TickFn): () => void {
    this.ticks.add(fn)
    return () => this.ticks.delete(fn)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.wake()
    gsap.ticker.add(this.loop)
  }

  stop(): void {
    this.running = false
    gsap.ticker.remove(this.loop)
  }

  /** Renders one frame immediately (used before the ticker starts and for screenshots). */
  renderNow(): void {
    this.frame(0, true)
  }

  /** Draws the scene once as it is, without running tick callbacks (used to build lazily created programs). */
  drawOnce(): void {
    if (this.contextLost) return
    if (this.composer) this.composer.render(0)
    else this.renderer.render(this.scene, this.camera)
  }

  private frame(dt: number, force = false): void {
    this.elapsed += dt
    for (const fn of this.ticks) fn(this.elapsed, dt)
    if (this.contextLost) return
    // Idle: ticks still run every frame (damping keeps settling); only every second one is drawn.
    if (!force && performance.now() > this.awakeUntil) {
      this.skipped = !this.skipped
      if (this.skipped) return
    }
    if (this.grade) this.grade.uniforms.uTime.value = this.elapsed
    if (this.composer) this.composer.render(dt)
    else this.renderer.render(this.scene, this.camera)
  }
}
