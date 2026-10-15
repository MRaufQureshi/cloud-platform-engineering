// Hover lens for the closing title. While the pointer is over the headline, a soft circular lens follows
// it: inside the lens the solid letters give way to a thin outline, and a sparse network of dots and
// hairlines floats over the dissolved letters, trailing the pointer. Leave the title and everything settles
// back to the plain, crisp text.
// The real title is never rewritten. The lens is presentation only: an outline twin of the title (masked to
// the lens), a canvas for the network, and a CSS mask that opens a hole in the real title. All of it is
// aria-hidden and ignores the pointer, so the selectable, accessible text stays the single source of truth.
// It is off with reduced motion, on touch screens and while "Pause animation" is on, and it only starts once
// the title has been shown.
import { readHeadline, sampleText } from '../scene/textPoints.ts'

const CELL = 22 // spatial hash for the glyph samples, px
const MAX_DOTS = 150
const MAX_DPR = 2
const WHITE = '248,250,252'
const TEAL = '94,234,212' // --accent

interface Dot {
  x: number // px in the title's box, so the network scrolls with the text
  y: number
  vx: number
  vy: number
  size: number
  age: number
  ttl: number
  phase: number
  accent: boolean
  a: number
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** A soft round sprite, drawn behind the larger dots. */
function halo(rgb: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d') as CanvasRenderingContext2D
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, `rgba(${rgb},0.5)`)
  grad.addColorStop(0.3, `rgba(${rgb},0.13)`)
  grad.addColorStop(1, `rgba(${rgb},0)`)
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return c
}

export function initTitleLens(title: HTMLElement, reducedMotion: boolean): void {
  if (reducedMotion || !matchMedia('(hover: hover) and (pointer: fine)').matches) return
  const host = title.offsetParent
  if (!(host instanceof HTMLElement)) return
  const motionToggle = document.querySelector<HTMLElement>('.motion-toggle')

  const layer = document.createElement('div') // sits exactly over the title and holds its outline twin
  layer.className = 'title-lens'
  layer.setAttribute('aria-hidden', 'true')
  layer.hidden = true
  host.append(layer)
  const canvas = document.createElement('canvas') // the dots and hairlines, in viewport space
  canvas.className = 'title-lens-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.hidden = true
  document.body.append(canvas)
  const g = canvas.getContext('2d')
  if (!g) {
    layer.remove()
    canvas.remove()
    return
  }
  const haloWhite = halo(WHITE)
  const haloTeal = halo(TEAL)

  // Glyph samples of the title (px in its box), bucketed in a grid: where dots may sit, and where "over the text" is.
  let xs = new Float32Array(0)
  let ys = new Float32Array(0)
  let accent: Uint8Array = new Uint8Array(0)
  let cols = 0
  let rows = 0
  let cells: number[][] = []
  let bounds = { l: 0, t: 0, r: 0, b: 0 }
  let R = 70 // lens radius, px: about one letter wide
  let density = 1 // dot budget, scaled with the lens area
  let sizeScale = 1 // dot size, scaled with the lens
  let docTop = 0 // the title's place in the document, so far-away pointer moves cost no layout read
  let docHeight = 0
  let ready = false
  let token = 0

  const nearest = (x: number, y: number, r: number): number => {
    const n = Math.ceil(r / CELL)
    const cx = Math.floor(x / CELL)
    const cy = Math.floor(y / CELL)
    let best = -1
    let bestD = r * r
    for (let j = Math.max(0, cy - n); j <= Math.min(rows - 1, cy + n); j++) {
      for (let i = Math.max(0, cx - n); i <= Math.min(cols - 1, cx + n); i++) {
        for (const s of cells[j * cols + i]) {
          const d = (xs[s] - x) ** 2 + (ys[s] - y) ** 2
          if (d < bestD) {
            bestD = d
            best = s
          }
        }
      }
    }
    return best
  }
  const countNear = (x: number, y: number, r: number, limit: number): number => {
    const n = Math.ceil(r / CELL)
    const cx = Math.floor(x / CELL)
    const cy = Math.floor(y / CELL)
    let found = 0
    for (let j = Math.max(0, cy - n); j <= Math.min(rows - 1, cy + n); j++) {
      for (let i = Math.max(0, cx - n); i <= Math.min(cols - 1, cx + n); i++) {
        for (const s of cells[j * cols + i]) {
          if ((xs[s] - x) ** 2 + (ys[s] - y) ** 2 < r * r && ++found >= limit) return found
        }
      }
    }
    return found
  }
  /** Is the pointer over the headline's letters? Looser once the lens is open, so it does not flicker at the edge. */
  const over = (x: number, y: number, open: boolean): boolean => {
    if (!ready) return false
    const m = R * (open ? 0.6 : 0.4)
    if (x < bounds.l - m || x > bounds.r + m || y < bounds.t - m || y > bounds.b + m) return false
    return countNear(x, y, R * (open ? 0.95 : 0.62), 2) >= 2
  }

  // The outline twin and the glyph samples are rebuilt whenever the title's layout may have changed.
  const prepare = async () => {
    const mine = ++token
    ready = false
    const box = title.getBoundingClientRect()
    const h = readHeadline(title)
    const upper = getComputedStyle(title).textTransform === 'uppercase'
    const { text, rect, marks, ...style } = h
    const shown = upper ? text.toUpperCase() : text
    const samples = await sampleText(shown, { ...style, size: 150, marks: shown.length === text.length ? marks : undefined }, 2600, Math.random)
    if (mine !== token) return
    const n = samples.points.length / 2
    xs = new Float32Array(n)
    ys = new Float32Array(n)
    accent = samples.accent
    cols = Math.ceil(box.width / CELL) + 1
    rows = Math.ceil(box.height / CELL) + 1
    cells = Array.from({ length: cols * rows }, () => [])
    for (let i = 0; i < n; i++) {
      // The glyph block spans u ∈ [-0.5, 0.5] across the DOM glyph rect, and v uses the same scale.
      const x = rect.left + (samples.points[2 * i] + 0.5) * rect.width - box.left
      const y = rect.top + rect.height / 2 - samples.points[2 * i + 1] * rect.width - box.top
      xs[i] = x
      ys[i] = y
      const cx = Math.floor(x / CELL)
      const cy = Math.floor(y / CELL)
      if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) cells[cy * cols + cx].push(i)
    }
    bounds = { l: rect.left - box.left, t: rect.top - box.top, r: rect.right - box.left, b: rect.bottom - box.top }
    R = Math.min(110, Math.max(52, parseFloat(getComputedStyle(title).fontSize) * 0.5))
    density = Math.min(1.2, Math.max(0.3, (R / 105) ** 2)) // 1 = the budget the network was tuned with, at R = 105
    sizeScale = Math.min(1, Math.max(0.75, R / 90))
    docTop = box.top + scrollY
    docHeight = box.height
    ready = n > 0
  }
  const rebuild = () => {
    layer.style.left = `${title.offsetLeft}px`
    layer.style.top = `${title.offsetTop}px`
    layer.style.width = `${title.offsetWidth}px`
    const twin = title.cloneNode(true) as HTMLElement
    for (const name of ['id', 'style', 'aria-label', 'data-reveal']) twin.removeAttribute(name)
    for (const el of twin.querySelectorAll('[id]')) el.removeAttribute('id')
    twin.classList.remove('is-lensing')
    twin.classList.add('title-lens-twin')
    layer.replaceChildren(twin)
    void prepare()
  }
  let rebuildTimer = 0
  const rebuildSoon = (ms = 220) => {
    clearTimeout(rebuildTimer)
    rebuildTimer = window.setTimeout(rebuild, ms)
  }

  /** Is the title still where it was measured? Not while a reveal is running or the layout has moved. */
  const fresh = (): boolean => {
    const box = title.getBoundingClientRect()
    const r = readHeadline(title).rect
    return (
      Math.abs(r.left - box.left - bounds.l) < 3 &&
      Math.abs(r.top - box.top - bounds.t) < 3 &&
      Math.abs(r.right - box.left - bounds.r) < 3 &&
      Math.abs(r.bottom - box.top - bounds.b) < 3
    )
  }

  const sizeCanvas = () => {
    const dpr = Math.min(devicePixelRatio || 1, MAX_DPR)
    canvas.width = Math.round(innerWidth * dpr)
    canvas.height = Math.round(innerHeight * dpr)
    canvas.style.width = `${innerWidth}px`
    canvas.style.height = `${innerHeight}px`
  }

  // --- the lens ---
  const pointer = { x: -1e4, y: -1e4, seen: false }
  const lens = { x: 0, y: 0, vx: 0, vy: 0, open: 0 }
  const dots: Dot[] = []
  let raf = 0
  let lastT = 0
  let spawnDebt = 0
  let wasActive = false
  let lastMask = ''

  const spawn = () => {
    let x = 0
    let y = 0
    let tealDot = false
    let onGlyph = false
    if (Math.random() < 0.74 && xs.length) {
      for (let tries = 0; tries < 5 && !onGlyph; tries++) {
        const a = Math.random() * Math.PI * 2
        const r = R * 1.05 * Math.sqrt(Math.random())
        const i = nearest(lens.x + Math.cos(a) * r, lens.y + Math.sin(a) * r, 16)
        if (i >= 0) {
          x = xs[i] + (Math.random() - 0.5) * 5
          y = ys[i] + (Math.random() - 0.5) * 5
          tealDot = accent[i] === 1
          onGlyph = true
        }
      }
    }
    if (!onGlyph) {
      // A few float free of the letters, as in a constellation.
      const a = Math.random() * Math.PI * 2
      const r = R * (0.45 + Math.random())
      x = lens.x + Math.cos(a) * r
      y = lens.y + Math.sin(a) * r
      const i = nearest(x, y, 70)
      tealDot = i >= 0 && accent[i] === 1
    }
    const a = Math.random() * Math.PI * 2
    const sp = 6 + 24 * Math.random()
    dots.push({
      x,
      y,
      vx: Math.cos(a) * sp + lens.vx * 0.1,
      vy: Math.sin(a) * sp + lens.vy * 0.1,
      size: (Math.random() < 0.18 ? 2.4 + 1.8 * Math.random() : 1.1 + Math.random()) * sizeScale,
      age: 0,
      ttl: 1.1 + 1.3 * Math.random(),
      phase: Math.random() * 6.283,
      accent: tealDot,
      a: 0,
    })
  }

  const finish = () => {
    lastT = 0
    lastMask = ''
    title.classList.remove('is-lensing')
    for (const name of ['--lens-x', '--lens-y', '--lens-r']) title.style.removeProperty(name)
    layer.hidden = true
    canvas.hidden = true
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, canvas.width, canvas.height)
  }

  const frame = (now: number) => {
    raf = 0
    const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : 1 / 60)
    lastT = now
    const box = title.getBoundingClientRect()
    const px = pointer.x - box.left
    const py = pointer.y - box.top
    let active = pointer.seen && motionToggle?.dataset.state !== 'paused' && over(px, py, wasActive)
    if (active && !wasActive && lens.open < 0.02 && !fresh()) {
      active = false // measure again first (the twin and the samples may be from before a reveal or a reflow)
      rebuildSoon(0)
    }
    if (active && !wasActive && lens.open < 0.02) {
      lens.x = px // open right under the pointer instead of flying in from where it last was
      lens.y = py
      lens.vx = lens.vy = 0
      for (let i = 0, n = Math.max(6, Math.round(16 * density)); i < n && xs.length; i++) spawn() // a first handful, so the lens never opens empty
    }
    wasActive = active

    // The lens trails the pointer a little; its speed feeds the dots.
    const ox = lens.x
    const oy = lens.y
    if (active) {
      const k = 1 - Math.exp(-dt / 0.085)
      lens.x += (px - lens.x) * k
      lens.y += (py - lens.y) * k
    }
    const ks = 1 - Math.exp(-dt / 0.12)
    lens.vx += ((lens.x - ox) / dt - lens.vx) * ks
    lens.vy += ((lens.y - oy) / dt - lens.vy) * ks
    const goal = active ? 1 : 0
    lens.open += (goal - lens.open) * (1 - Math.exp(-dt / (goal > lens.open ? 0.12 : 0.32)))
    if (!active && lens.open < 0.004) lens.open = 0
    const e = 1 - (1 - lens.open) ** 3
    const on = lens.open > 0

    // Open (or close) the hole in the real title and show the outline twin inside it.
    const twin = layer.firstElementChild as HTMLElement | null
    if (on) {
      const mask = `${lens.x.toFixed(1)}|${lens.y.toFixed(1)}|${(R * e).toFixed(1)}`
      if (mask !== lastMask) {
        lastMask = mask
        for (const el of twin ? [title, twin] : [title]) {
          el.style.setProperty('--lens-x', `${lens.x.toFixed(1)}px`)
          el.style.setProperty('--lens-y', `${lens.y.toFixed(1)}px`)
          el.style.setProperty('--lens-r', `${(R * e).toFixed(1)}px`)
        }
      }
    }
    title.classList.toggle('is-lensing', on)
    if (layer.hidden === on) layer.hidden = !on

    // Dots: born on the letters under the lens (faster when the pointer moves), drift, fade, and link up.
    spawnDebt += e * density * (34 + Math.min(Math.hypot(lens.vx, lens.vy), 1600) * 0.09) * dt
    while (spawnDebt >= 1) {
      spawnDebt -= 1
      if (dots.length < Math.max(40, Math.round(MAX_DOTS * density)) && xs.length) spawn()
    }
    if (!on && !active) dots.length = 0 // fully closed: whatever is left is invisible anyway
    const env = Math.min(1, lens.open * 2.5)
    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i]
      d.age += dt
      if (d.age >= d.ttl) {
        dots.splice(i, 1)
        continue
      }
      const drag = Math.exp(-1.2 * dt)
      d.vx = d.vx * drag + (Math.random() - 0.5) * 60 * dt
      d.vy = d.vy * drag + (Math.random() - 0.5) * 60 * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      const f = d.age / d.ttl
      const far = 1 - smooth(R * 1.2, R * 2.1, Math.hypot(d.x - lens.x, d.y - lens.y))
      d.a = smooth(0, 0.1, f) * (1 - smooth(0.55, 1, f)) * far * env * (0.86 + 0.14 * Math.sin(now / 250 + d.phase))
    }

    const hide = dots.length === 0 && !on
    if (canvas.hidden !== hide) canvas.hidden = hide
    const dpr = canvas.width / Math.max(1, innerWidth)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, innerWidth, innerHeight)
    if (dots.length) {
      const ox0 = box.left
      const oy0 = box.top
      const link = R * 0.8
      g.lineWidth = 1.1
      g.lineCap = 'round'
      const drawn = new Set<number>()
      const join = (i: number, j: number, dd: number) => {
        if (j < 0) return
        const key = i < j ? i * 512 + j : j * 512 + i
        if (drawn.has(key)) return
        drawn.add(key)
        const a = dots[i]
        const b = dots[j]
        const al = 0.85 * (1 - Math.sqrt(dd) / link) ** 0.9 * Math.min(a.a, b.a)
        if (al < 0.015) return
        g.strokeStyle = `rgba(${a.accent && b.accent ? TEAL : WHITE},${al.toFixed(3)})`
        g.beginPath()
        g.moveTo(ox0 + a.x, oy0 + a.y)
        g.lineTo(ox0 + b.x, oy0 + b.y)
        g.stroke()
      }
      for (let i = 0; i < dots.length; i++) {
        const a = dots[i]
        if (a.a < 0.03) continue
        let n1 = -1
        let d1 = link * link
        let n2 = -1
        let d2 = d1
        let n3 = -1
        let d3 = d1
        for (let j = 0; j < dots.length; j++) {
          const b = dots[j]
          if (j === i || b.a < 0.03) continue
          const dd = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
          if (dd < d1) {
            n3 = n2
            d3 = d2
            n2 = n1
            d2 = d1
            n1 = j
            d1 = dd
          } else if (dd < d2) {
            n3 = n2
            d3 = d2
            n2 = j
            d2 = dd
          } else if (dd < d3) {
            n3 = j
            d3 = dd
          }
        }
        join(i, n1, d1)
        join(i, n2, d2)
        join(i, n3, d3)
      }
      for (const d of dots) {
        if (d.a < 0.02) continue
        const cx = ox0 + d.x
        const cy = oy0 + d.y
        if (d.size > 1.5) {
          const s = d.size * 7
          g.globalAlpha = Math.min(1, d.a * 0.95)
          g.drawImage(d.accent ? haloTeal : haloWhite, cx - s / 2, cy - s / 2, s, s)
          g.globalAlpha = 1
        }
        g.fillStyle = `rgba(${d.accent ? TEAL : WHITE},${Math.min(1, d.a * 1.3).toFixed(3)})`
        g.beginPath()
        g.arc(cx, cy, d.size, 0, Math.PI * 2)
        g.fill()
      }
    }

    if (active || on || dots.length) raf = requestAnimationFrame(frame)
    else finish()
  }

  /** Starts the loop when something is worth animating; idle pages run nothing at all. */
  const wake = () => {
    if (raf || !ready) return
    const top = docTop - scrollY
    if (top + docHeight < -R || top > innerHeight + R) return
    const box = title.getBoundingClientRect()
    if (!over(pointer.x - box.left, pointer.y - box.top, false) && lens.open === 0 && !dots.length) return
    raf = requestAnimationFrame(frame)
  }

  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return
      pointer.x = e.clientX
      pointer.y = e.clientY
      pointer.seen = true
      wake()
    },
    { passive: true },
  )
  addEventListener('scroll', () => pointer.seen && wake(), { passive: true })
  const gone = () => {
    pointer.seen = false
  }
  document.addEventListener('pointerleave', gone)
  document.documentElement.addEventListener('pointerleave', gone)
  addEventListener('blur', gone)
  addEventListener('resize', () => {
    sizeCanvas()
    rebuildSoon()
  })
  let observed = false
  new ResizeObserver(() => {
    if (observed) rebuildSoon()
    observed = true // the first callback only reports the size it started with
  }).observe(title)
  new MutationObserver(() => rebuildSoon()).observe(title, { childList: true, subtree: true, characterData: true })
  if (document.fonts && document.fonts.status !== 'loaded') void document.fonts.ready.then(() => rebuildSoon())

  sizeCanvas()
  // Rasterising the title for the samples takes a moment: do it when the page is idle, not as the title appears.
  if ('requestIdleCallback' in window) requestIdleCallback(() => rebuild(), { timeout: 1500 })
  else rebuildSoon(500)
}
