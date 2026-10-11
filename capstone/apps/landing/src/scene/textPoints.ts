// Text → particle targets. Rasterises a string with the site font on an offscreen canvas
// and spreads samples evenly inside the glyphs (jittered hex grid) in "plane units": the
// widest line spans u ∈ [-0.5, 0.5] and the block is centred on 0. The DOM helpers read a
// rendered headline and map its rect onto a camera-facing plane, so particle text can sit
// exactly on top of the HTML text (canvas and DOM share the font, tracking and metrics).
import '@fontsource-variable/manrope'
import * as THREE from 'three'

export interface TextStyle {
  /** CSS font shorthand at any px size, e.g. getComputedStyle(el).font. Default: Manrope 800. */
  font?: string
  /** Raster font size in px: sampling resolution only, independent of the on-screen size. */
  size?: number
  /** CSS letter-spacing in em (default -0.035, as the hero headline). */
  letterSpacing?: number
  /** Baseline-to-baseline distance in em for '\n'-separated lines (default 0.86). */
  lineHeight?: number
  align?: 'left' | 'center'
  /**
   * One string per line, same length as the line: '1' marks a character shown in the accent colour
   * (an <em>), '0' the base colour. Lets a swarm tell the two apart (see `accent` in TextSamples).
   */
  marks?: string[]
}

/** A camera-facing rectangle in world space; the text block's width spans `width`. */
export interface TextPlane {
  center: THREE.Vector3
  /** Unit vectors spanning the plane; text reads along `right`. */
  right: THREE.Vector3
  up: THREE.Vector3
  width: number
}

export interface TextSamples {
  /** u, v pairs in plane units. */
  points: Float32Array
  /** Per sample: 1 on the glyph rim, fading to 0 about one spacing inside. */
  edge: Float32Array
  /** Per sample: 1 when it lies on a character marked as accent (all 0 without `marks`). */
  accent: Uint8Array
  /** Mean distance between neighbouring samples, in plane units. */
  spacing: number
  /** Block height in plane units (its width is 1). */
  height: number
}

export const DEFAULT_FONT = '800 100px "Manrope Variable", Manrope, ui-sans-serif, system-ui, sans-serif'
// Densest packing used, in em. Short words need fewer particles than the swarm has; the
// surplus stays hidden in the text state instead of piling up into blown-out glyphs.
const MIN_SPACING_EM = 0.017
const MAX_CANVAS = 4096

export async function sampleText(text: string, style: TextStyle, maxCount: number, rand: () => number): Promise<TextSamples> {
  const lines = text.split('\n')
  let size = style.size ?? 220
  const letterSpacing = style.letterSpacing ?? -0.035
  const lineHeight = style.lineHeight ?? 0.86
  const withSize = (px: number) => (style.font ?? DEFAULT_FONT).replace(/\d*\.?\d+px(\s*\/\s*\S+)?/, `${px}px`)
  await document.fonts.load(withSize(size), text).catch(() => [])

  const canvas = document.createElement('canvas')
  const g = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  const spaced = typeof (g as Partial<CanvasRenderingContext2D>).letterSpacing === 'string'
  const setFont = (px: number) => {
    g.font = withSize(px)
    if (spaced) g.letterSpacing = `${letterSpacing * px}px`
  }
  // Without canvas letter-spacing, place glyphs one by one (prefix widths keep most kerning).
  const measure = (line: string, px: number) => (spaced ? g.measureText(line).width : g.measureText(line).width + line.length * letterSpacing * px)

  setFont(size)
  let widths = lines.map((l) => measure(l, size))
  const longest = Math.max(1, ...widths)
  if (longest + size > MAX_CANVAS) {
    size = Math.floor((size * MAX_CANVAS) / (longest + size))
    setFont(size)
    widths = lines.map((l) => measure(l, size))
  }
  const metrics = g.measureText(text.replace(/\n/g, ''))
  const ascent = metrics.fontBoundingBoxAscent || size * 0.9
  const descent = metrics.fontBoundingBoxDescent || size * 0.25
  const advance = lineHeight * size
  const blockW = Math.max(1, ...widths)
  // Same box the DOM reports for inline text: first ascent to last descent.
  const blockH = (lines.length - 1) * advance + ascent + descent
  const pad = Math.ceil(size * 0.15)
  canvas.width = Math.ceil(blockW + 2 * pad)
  canvas.height = Math.ceil(blockH + 2 * pad)
  setFont(size) // resizing resets the context state
  g.textBaseline = 'alphabetic'
  // Accent characters are drawn green and base ones white, so the red channel tells them apart below.
  const BASE = '#fff'
  const ACCENT = '#0f0'
  const markedAny = Boolean(style.marks?.some((m, i) => m.includes('1') && m.length === lines[i]?.length))
  lines.forEach((line, i) => {
    const x = pad + (style.align === 'left' ? 0 : (blockW - widths[i]) / 2)
    const y = pad + ascent + i * advance
    const m = style.marks?.[i]
    const mark = m && m.length === line.length ? m : '0'.repeat(line.length)
    if (spaced && !mark.includes('1')) {
      g.fillStyle = BASE
      g.fillText(line, x, y)
    } else if (spaced) {
      // Runs of one colour; prefix widths keep the kerning inside the line.
      for (let a = 0; a < line.length; ) {
        let b = a
        while (b < line.length && mark[b] === mark[a]) b++
        g.fillStyle = mark[a] === '1' ? ACCENT : BASE
        g.fillText(line.slice(a, b), x + (a ? g.measureText(line.slice(0, a)).width : 0), y)
        a = b
      }
    } else {
      for (let c = 0; c < line.length; c++) {
        g.fillStyle = mark[c] === '1' ? ACCENT : BASE
        g.fillText(line[c], x + g.measureText(line.slice(0, c)).width + c * letterSpacing * size, y)
      }
    }
  })

  const { width: W, height: H } = canvas
  const alpha = g.getImageData(0, 0, W, H).data
  const inside = (x: number, y: number) => {
    const xi = x | 0
    const yi = y | 0
    return xi >= 0 && yi >= 0 && xi < W && yi < H && alpha[(yi * W + xi) * 4 + 3] >= 128
  }
  let filled = 0
  for (let i = 3; i < alpha.length; i += 4) if (alpha[i] >= 128) filled++
  if (!filled) return { points: new Float32Array(0), edge: new Float32Array(0), accent: new Uint8Array(0), spacing: 1, height: blockH / blockW }

  const wanted = Math.max(1, Math.min(maxCount, Math.floor(filled / (MIN_SPACING_EM * size) ** 2)))
  // Jittered hex grid: even spacing reads as crisp type; the jitter keeps it organic.
  const hexArea = Math.sqrt(3) / 2
  let s = Math.sqrt(filled / (wanted * hexArea))
  let found: number[] = []
  for (let attempt = 0; attempt < 4; attempt++) {
    found = []
    const rowH = s * hexArea
    for (let row = 0, y = rowH / 2; y < H; row++, y += rowH) {
      for (let x = (row & 1 ? s : s / 2); x < W; x += s) {
        const px = x + (rand() - 0.5) * s * 0.9
        const py = y + (rand() - 0.5) * rowH * 0.9
        if (inside(px, py)) found.push(px, py)
      }
    }
    if (found.length / 2 >= wanted * 0.985) break
    s *= Math.sqrt(found.length / 2 / wanted) * 0.99
  }
  let n = found.length / 2
  // Trim the excess at random (partial Fisher–Yates), top up with random glyph pixels.
  for (let i = 0; i < wanted && n > wanted; i++) {
    const j = i + Math.floor(rand() * (n - i))
    ;[found[2 * i], found[2 * j]] = [found[2 * j], found[2 * i]]
    ;[found[2 * i + 1], found[2 * j + 1]] = [found[2 * j + 1], found[2 * i + 1]]
  }
  n = Math.min(n, wanted)
  for (let guard = 0; n < wanted && guard < wanted * 200; guard++) {
    const px = rand() * W
    const py = rand() * H
    if (!inside(px, py)) continue
    found[2 * n] = px
    found[2 * n + 1] = py
    n++
  }

  // Inside distance to the outline (two-pass chamfer). Samples near the outline are eased
  // onto a clean inner rim, which is what makes the letters read crisp rather than ragged.
  const dist = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) dist[i] = alpha[i * 4 + 3] >= 128 ? 1e6 : 0
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : dist[y * W + x])
  for (let pass = 0; pass < 2; pass++) {
    const d = pass ? -1 : 1
    for (let k = 0; k < W * H; k++) {
      const i = pass ? W * H - 1 - k : k
      if (!dist[i]) continue
      const x = i % W
      const y = (i - x) / W
      dist[i] = Math.min(dist[i], at(x - d, y) + 1, at(x, y - d) + 1, at(x - d, y - d) + Math.SQRT2, at(x + d, y - d) + Math.SQRT2)
    }
  }
  const points = new Float32Array(n * 2)
  const edge = new Float32Array(n)
  const accent = new Uint8Array(n)
  const cx = pad + blockW / 2
  const cy = pad + blockH / 2
  for (let i = 0; i < n; i++) {
    let px = found[2 * i]
    let py = found[2 * i + 1]
    const xi = px | 0
    const yi = py | 0
    if (markedAny) accent[i] = alpha[(yi * W + xi) * 4] < 128 ? 1 : 0
    let d = at(xi, yi)
    if (d < s * 0.5) {
      const gx = at(xi + 1, yi) - at(xi - 1, yi)
      const gy = at(xi, yi + 1) - at(xi, yi - 1)
      const gl = Math.hypot(gx, gy)
      const next = s * 0.3 + d * 0.5
      if (gl > 0) {
        px += (gx / gl) * (next - d)
        py += (gy / gl) * (next - d)
        d = next
      }
    }
    edge[i] = 1 - THREE.MathUtils.smoothstep(d, s * 0.35, s * 1.4)
    points[2 * i] = (px - cx) / blockW
    points[2 * i + 1] = (cy - py) / blockW
  }
  return { points, edge, accent, spacing: s / blockW, height: blockH / blockW }
}

export interface Headline extends Required<Omit<TextStyle, 'size' | 'marks'>> {
  /** The text as wrapped on screen, lines joined with '\n'. */
  text: string
  /** Per line, '1' for characters in an accent-coloured element (<em>), else '0'. */
  marks: string[]
  /** Union of the glyph boxes in CSS px (the block setTextTarget lays out). */
  rect: DOMRect
}

/** Reads a rendered headline (lines as wrapped, font, tracking, glyph rect). Call once the
 *  layout and any reveal transforms have settled; re-read on resize. */
export function readHeadline(el: HTMLElement): Headline {
  const cs = getComputedStyle(el)
  const fontSize = parseFloat(cs.fontSize)
  const range = document.createRange()
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const lines: string[] = []
  const marks: string[] = []
  let line = ''
  let mark = ''
  let lastTop = NaN
  // A character counts as accent when its element's colour differs from the headline's (an <em>).
  const accentOf = new Map<Element, boolean>()
  const isAccent = (node: Node) => {
    const parent = node.parentElement
    if (!parent || parent === el) return false
    let v = accentOf.get(parent)
    if (v === undefined) accentOf.set(parent, (v = getComputedStyle(parent).color !== cs.color))
    return v
  }
  const flush = () => {
    const t = line.trimEnd()
    if (t) {
      lines.push(t)
      marks.push(mark.slice(0, t.length))
    }
    line = ''
    mark = ''
  }
  let l = Infinity
  let t = Infinity
  let r = -Infinity
  let b = -Infinity
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const str = node.textContent ?? ''
    for (let i = 0; i < str.length; i++) {
      if (/\s/.test(str[i])) {
        if (line && !line.endsWith(' ')) {
          line += ' '
          mark += isAccent(node) ? '1' : '0'
        }
        continue
      }
      range.setStart(node, i)
      range.setEnd(node, i + 1)
      const box = range.getBoundingClientRect()
      if (!box.width && !box.height) continue
      if (line && Math.abs(box.top - lastTop) > fontSize * 0.5) flush()
      lastTop = box.top
      line += str[i]
      mark += isAccent(node) ? '1' : '0'
      l = Math.min(l, box.left)
      t = Math.min(t, box.top)
      r = Math.max(r, box.right)
      b = Math.max(b, box.bottom)
    }
  }
  if (line.trim()) flush()
  const em = (v: string, fallback: number) => (v.endsWith('px') ? parseFloat(v) / fontSize : fallback)
  return {
    text: lines.join('\n'),
    marks,
    font: `${cs.fontStyle} ${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`,
    letterSpacing: em(cs.letterSpacing, 0),
    lineHeight: em(cs.lineHeight, 1.2),
    align: cs.textAlign === 'center' ? 'center' : 'left',
    rect: lines.length ? new DOMRect(l, t, r - l, b - t) : el.getBoundingClientRect(),
  }
}

const _cam = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _ray = new THREE.Vector3()

/** Plane `distance` in front of the camera that projects exactly onto a viewport rect (CSS
 *  px, full-window canvas). Uses the live projection, so lens shift / view offset is honoured. */
export function planeFromRect(
  rect: { left: number; top: number; width: number; height: number },
  camera: THREE.PerspectiveCamera,
  distance: number,
  viewport = { width: innerWidth, height: innerHeight },
  out?: TextPlane,
): TextPlane {
  camera.updateMatrixWorld()
  camera.getWorldPosition(_cam)
  camera.getWorldDirection(_fwd)
  const toWorld = (x: number, y: number, target: THREE.Vector3) => {
    _ray.set((x / viewport.width) * 2 - 1, 1 - (y / viewport.height) * 2, 0.5).unproject(camera).sub(_cam).normalize()
    return target.copy(_cam).addScaledVector(_ray, distance / _ray.dot(_fwd))
  }
  const plane = out ?? { center: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), width: 1 }
  const cy = rect.top + rect.height / 2
  const a = toWorld(rect.left, cy, plane.right)
  const c = toWorld(rect.left + rect.width, cy, plane.up)
  plane.width = a.distanceTo(c)
  toWorld(rect.left + rect.width / 2, cy, plane.center)
  plane.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
  plane.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize()
  return plane
}
