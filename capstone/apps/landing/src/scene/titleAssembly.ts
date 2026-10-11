// A particle twin for one DOM title. It reads the element (lines as wrapped, font, tracking,
// glyph rect), rasterises its text into a swarm, assembles it over a few seconds, keeps the
// particles glued to the DOM text while the page scrolls, and finally hands over to the real
// text. The hero headline and the closing call to action both use it.
import * as THREE from 'three'
import { planeFromRect, readHeadline, type Swarm, type TextPlane } from './swarm.ts'

/** Distance of the text plane in front of the camera, world units. */
const DISTANCE = 9

export interface PrepareOptions {
  /** Plain words white and accent-coloured (<em>) words teal. Default: every particle teal. */
  split?: boolean
}

export class TitleAssembly {
  readonly plane: TextPlane = { center: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), width: 1 }
  /** Assembly progress 0 → 1 (time-based); 1 means the particles form the title. */
  intro = 0
  /** Seconds since the DOM title took over; −1 until then. */
  handOff = -1
  private el: HTMLElement | null = null
  private options: PrepareOptions = {}
  private rect: DOMRect | null = null
  private scroll = 0
  private rate = 0
  private done: (() => void) | null = null
  private readonly live = new DOMRect()
  private text = ''
  private aspect = 0
  private token = 0

  readonly swarm: Swarm
  private readonly camera: THREE.PerspectiveCamera

  constructor(swarm: Swarm, camera: THREE.PerspectiveCamera) {
    this.swarm = swarm
    this.camera = camera
  }

  /** The particles hold until the DOM title is fully in, then dissolve behind it: 1 → 0. */
  get hold(): number {
    return this.handOff < 0 ? 1 : 1 - THREE.MathUtils.smoothstep(this.handOff, 0.15, 0.75)
  }

  /** Reads the element, rasterises its text with the site font and lays the particles out on its rect. */
  async prepare(el: HTMLElement, options: PrepareOptions = {}): Promise<void> {
    this.el = el
    this.options = options
    const token = ++this.token
    const h = readHeadline(el)
    this.remember(h.rect)
    planeFromRect(h.rect, this.camera, DISTANCE, { width: innerWidth, height: innerHeight }, this.plane)
    const upper = getComputedStyle(el).textTransform === 'uppercase'
    const { text, rect: _rect, marks, ...style } = h
    void _rect
    const shown = upper ? text.toUpperCase() : text
    await this.swarm.setTextTarget(shown, { ...style, plane: this.plane, marks: options.split && shown.length === text.length ? marks : undefined })
    if (token !== this.token) return
    this.text = text
    this.aspect = h.rect.height / Math.max(1, h.rect.width)
  }

  /** Starts the assembly clock; resolves once the particles form the title. */
  play(seconds: number): Promise<void> {
    this.rate = 1 / Math.max(0.1, seconds)
    return new Promise<void>((resolve) => {
      this.done = resolve
    })
  }

  /** The real title is showing: the particles may dissolve. */
  handOver(): void {
    if (this.handOff < 0) this.handOff = 0
  }

  /**
   * Re-reads the title's position after a layout change (pin spacers, reflowed text). With `resample`, also
   * re-rasterises it when its wrapping changed, which resolves once the new layout is uploaded.
   */
  async reread(resample = false): Promise<void> {
    if (!this.el) return
    const h = readHeadline(this.el)
    this.remember(h.rect)
    if (resample && this.intro === 0 && (h.text !== this.text || Math.abs(h.rect.height / Math.max(1, h.rect.width) / (this.aspect || 1) - 1) > 0.02)) {
      await this.prepare(this.el, this.options)
    }
  }

  /** Keeps the text plane on the DOM title (it moves as the page scrolls) without advancing any clock. */
  track(): void {
    if (!this.rect) return
    this.live.x = this.rect.x
    this.live.y = this.rect.y - (scrollY - this.scroll)
    this.live.width = this.rect.width
    this.live.height = this.rect.height
    planeFromRect(this.live, this.camera, DISTANCE, { width: innerWidth, height: innerHeight }, this.plane)
    this.swarm.setTextPlane(this.plane)
  }

  /** Advances the assembly and hand-over clocks, then tracks the DOM title. */
  step(dt: number): void {
    if (this.intro < 1 && this.rate > 0) {
      this.intro = Math.min(1, this.intro + Math.max(dt, 1 / 240) * this.rate)
      if (this.intro >= 1 && this.done) {
        this.done()
        this.done = null
      }
    }
    this.track()
    if (this.intro >= 1 && this.handOff >= 0) this.handOff += dt
  }

  // Headline rect in document coordinates, so the particle text scrolls with its DOM twin.
  private remember(rect: DOMRect): void {
    this.rect = rect
    this.scroll = scrollY
  }
}
