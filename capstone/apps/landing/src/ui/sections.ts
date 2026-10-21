// Non-3D section behaviour: top bar state, the readiness dial, grid-chapter steps and demand
// ribbon, the virtual-power-plant slider, flowchart connectors, the join form, glossary and
// source popovers, pinned-chapter exits and the static-flow fallback for pinned chapters.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { Director } from '../director.ts'
import type { Scroll } from '../core/scroll.ts'
import { fmt, onLangChange, t } from '../i18n/lang.ts'
import type { StringKey } from '../i18n/strings.ts'

const EV_STOCK = 2_034_260 // KBA, 1 Jan 2026
const WALLBOX_KW = 7.4

export function initSections(director: Director | null, scroll: Scroll, reducedMotion: boolean): void {
  const topbar = document.querySelector<HTMLElement>('.topbar')
  // A plain scroll listener: a trigger with no `end` deactivates at the very bottom, which dropped the glass bar over the footer.
  const markScrolled = () => topbar?.classList.toggle('is-scrolled', window.scrollY > 80)
  addEventListener('scroll', markScrolled, { passive: true })
  markScrolled()

  initStaticFlow(director)
  initDial(reducedMotion)
  initGridSteps()
  initVpp(director)
  initFlowchart(reducedMotion)
  initJoin()
  initTips(scroll)
  initFocusIntoPins(scroll)
  if (!reducedMotion) {
    initGhosts()
    initPinnedExits()
    initFactoryScrub()
    initScrubSync()
  }
  initDemand(director)
}

/**
 * Pinned chapters normally play inside a 100vh sticky stage. Without WebGL, or when the
 * stage's content no longer fits (browser zoom, large text, very short screens), they fall
 * back to ordinary flowing sections so nothing is clipped.
 */
function initStaticFlow(director: Director | null) {
  const sections = [...document.querySelectorAll<HTMLElement>('[data-pin]')]
  const noGl = document.documentElement.classList.contains('no-webgl')
  const content = '.copy, .research, .step, .fleet-board-mount, .policy, .day-captions li, .day-hud, .day-intro h2'
  const check = () => {
    let changed = false
    for (const sec of sections) {
      const sticky = sec.querySelector<HTMLElement>('.sticky')
      if (!sticky) continue
      const was = sec.classList.contains('flow-static')
      let overflow = noGl
      if (!noGl) {
        sec.classList.remove('flow-static')
        const box = sticky.getBoundingClientRect()
        const topbar = 56
        for (const el of sticky.querySelectorAll<HTMLElement>(content)) {
          const r = el.getBoundingClientRect()
          if (r.height === 0) continue
          if (r.bottom > box.bottom + 2 || r.top < box.top + topbar - 2) {
            overflow = true
            break
          }
        }
      }
      sec.classList.toggle('flow-static', overflow)
      if (overflow !== was) changed = true
    }
    if (changed) {
      ScrollTrigger.refresh()
      director?.measure()
    }
  }
  check()
  onLangChange(check) // German runs longer: a chapter that fitted its stage may not any more
  let timer = 0
  addEventListener('resize', () => {
    clearTimeout(timer)
    timer = window.setTimeout(check, 250)
  })
  document.fonts?.ready.then(check)
}

/** Pinned chapters fade their overlay out before the next chapter's copy arrives. */
function initPinnedExits() {
  for (const section of document.querySelectorAll<HTMLElement>('[data-pin]')) {
    const sticky = section.querySelector<HTMLElement>('.sticky')
    if (!sticky) continue
    gsap.fromTo(
      sticky,
      { opacity: 1, filter: 'blur(0px)' },
      {
        opacity: 0,
        filter: 'blur(6px)',
        ease: 'none',
        immediateRender: false,
        scrollTrigger: { trigger: section, start: 'bottom bottom', end: 'bottom 75%', scrub: true },
      },
    )
  }
}

/**
 * A scrubbed tween is a function of the scroll position alone (the pinned chapters' exit fade, the ghost words).
 * Once scrolling has settled, any that drifted from its trigger's progress (something wrote to it directly, a refresh
 * landed in the middle of a jump) is put back, so a chapter never depends on how the visitor got there. Smoothed
 * scrubs (the research build) trail their trigger on purpose and are left alone.
 */
function initScrubSync() {
  ScrollTrigger.addEventListener('scrollEnd', () => {
    for (const st of ScrollTrigger.getAll()) {
      const anim = st.animation
      if (anim && st.vars.scrub === true && Math.abs(anim.totalProgress() - st.progress) > 0.001) anim.totalProgress(st.progress)
    }
  })
}

/** The research card builds with the pin: bars grow, the combined plan settles, KPIs count. */
function initFactoryScrub() {
  const section = document.getElementById('factory')
  if (!section) return
  const seq = section.querySelector<HTMLElement>('.bar-fill.seq')
  const comb = section.querySelector<HTMLElement>('.bar-fill.comb')
  const kpis = [...section.querySelectorAll<HTMLElement>('.research-kpis p')]
  const quote = section.querySelector<HTMLElement>('.quote')
  if (!seq || !comb) return
  const tl = gsap.timeline({ scrollTrigger: { trigger: section, start: 'top top', end: 'bottom bottom', scrub: 0.6 } })
  // Both plans start level with the sequential cost; then the combined plan settles lower.
  tl.fromTo(seq, { scaleX: 0 }, { scaleX: 1, duration: 0.2, ease: 'power2.out' }, 0.08)
  tl.fromTo(comb, { scaleX: 0 }, { scaleX: 1 / 0.895, duration: 0.2, ease: 'power2.out' }, 0.12)
  tl.to(comb, { scaleX: 1, duration: 0.15, ease: 'power2.inOut' }, 0.42)
  tl.fromTo(kpis, { opacity: 0.25, y: 10 }, { opacity: 1, y: 0, duration: 0.15, stagger: 0.05 }, 0.55)
  if (quote) tl.fromTo(quote, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.15 }, 0.75)
}

// Schematic street demand from 14:00 to 24:00 (relative units): an evening peak when every
// car charges on arrival, and the flattened shape when charging is shifted and cars lend power.
const DEMAND_PEAK = [0.34, 0.36, 0.42, 0.58, 0.86, 1.0, 0.93, 0.72, 0.52, 0.42, 0.37]
const DEMAND_FLAT = [0.34, 0.37, 0.43, 0.5, 0.57, 0.6, 0.6, 0.57, 0.53, 0.5, 0.47]

function demandPath(values: number[], w: number, h: number, close: boolean): string {
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 8 - v * (h - 30)] as const)
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return close ? `${d} L${w},${h} L0,${h} Z` : d
}

function initDemand(director: Director | null) {
  const fig = document.getElementById('demand')
  const section = document.getElementById('grid')
  if (!fig || !section) return
  const line = fig.querySelector<SVGPathElement>('.demand-line')
  const area = fig.querySelector<SVGPathElement>('.demand-area')
  const ghost = fig.querySelector<SVGPathElement>('.demand-ghost')
  const state = fig.querySelector<HTMLElement>('[data-demand-state]')
  const W = 360
  const H = 170
  ghost?.setAttribute('d', demandPath(DEMAND_PEAK, W, H, false))
  let coordinated = false
  const paintState = () => {
    if (state) state.textContent = t(coordinated ? 'demand.coordinated' : 'demand.uncoordinated')
  }
  onLangChange(paintState)
  let last = -1
  const draw = (t: number) => {
    if (Math.abs(t - last) < 0.002) return
    last = t
    const v = DEMAND_PEAK.map((a, i) => a + (DEMAND_FLAT[i] - a) * t)
    line?.setAttribute('d', demandPath(v, W, H, false))
    area?.setAttribute('d', demandPath(v, W, H, true))
    fig.style.setProperty('--peak-mix', String(1 - t))
    coordinated = t > 0.6
    paintState()
  }
  draw(0)
  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      fig.classList.toggle('is-on', self.progress > 0.3 && self.progress < 0.97)
      // Follows the 3D wave when WebGL runs; otherwise maps scroll directly.
      const t = director ? director.state.wave : Math.min(1, Math.max(0, (self.progress - 0.62) / 0.33))
      draw(t)
    },
  })
  if (director) {
    const tick = () => {
      requestAnimationFrame(tick)
      if (director.active.id === 'grid') draw(director.state.wave)
    }
    tick()
  }
}

/** Giant outlined chapter words drift against the scroll. */
function initGhosts() {
  for (const el of document.querySelectorAll<HTMLElement>('.ghost')) {
    gsap.fromTo(
      el,
      { yPercent: 35 },
      { yPercent: -35, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } },
    )
  }
}

/**
 * One popover for glossary terms (hover or focus) and source citations (click or tap). It can
 * be hovered itself, closes on Escape, and only hides after a short grace period.
 */
function initTips(scroll: Scroll) {
  const tip = document.createElement('div')
  tip.className = 'tip'
  tip.id = 'site-tip'
  tip.setAttribute('role', 'tooltip')
  tip.hidden = true
  document.body.append(tip)
  let current: HTMLElement | null = null
  let hideTimer = 0
  let shownAt = 0

  const place = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    tip.style.left = `${Math.max(8, Math.min(r.left, innerWidth - tip.offsetWidth - 8))}px`
    const above = r.top - tip.offsetHeight - 10
    tip.style.top = `${above > 64 ? above : r.bottom + 10}px`
  }
  const show = (el: HTMLElement, content: string | Node) => {
    clearTimeout(hideTimer)
    current?.removeAttribute('aria-describedby')
    current = el
    tip.replaceChildren(content)
    tip.classList.toggle('source-tip', typeof content !== 'string')
    tip.hidden = false
    el.setAttribute('aria-describedby', tip.id)
    place(el)
    tip.classList.add('is-on')
    shownAt = performance.now()
  }
  const hide = () => {
    current?.removeAttribute('aria-describedby')
    current = null
    tip.classList.remove('is-on')
    hideTimer = window.setTimeout(() => (tip.hidden = true), 200)
  }
  const hideSoon = () => {
    clearTimeout(hideTimer)
    hideTimer = window.setTimeout(hide, 220)
  }
  tip.addEventListener('pointerenter', () => clearTimeout(hideTimer))
  tip.addEventListener('pointerleave', hideSoon)

  // Glossary terms are rewritten when the language changes, so their listeners sit on the document.
  const term = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>('abbr[data-tip]') : null)
  const focusable = () => document.querySelectorAll<HTMLElement>('abbr[data-tip]').forEach((el) => (el.tabIndex = 0))
  focusable()
  onLangChange(() => {
    hide()
    focusable()
  })
  document.addEventListener('pointerover', (e) => {
    const el = term(e.target)
    if (el && el !== term(e.relatedTarget)) show(el, el.dataset.tip ?? '')
  })
  document.addEventListener('pointerout', (e) => {
    const el = term(e.target)
    if (el && el !== term(e.relatedTarget)) hideSoon()
  })
  document.addEventListener('focusin', (e) => {
    const el = term(e.target)
    if (el) show(el, el.dataset.tip ?? '')
  })
  document.addEventListener('focusout', (e) => {
    if (term(e.target)) hideSoon()
  })

  // Citations: show the source in place; "All sources" jumps to the footer list.
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('sup a[href^="#src-"]')
    if (!a) return
    e.preventDefault()
    e.stopPropagation()
    const id = a.getAttribute('href') as string
    const src = document.querySelector<HTMLElement>(id)
    if (!src) return
    const box = document.createElement('div')
    const text = document.createElement('p')
    text.style.margin = '0'
    text.textContent = src.textContent?.trim() ?? ''
    const all = document.createElement('a')
    all.href = id
    all.textContent = t('src.all')
    all.addEventListener('click', (ev) => {
      ev.preventDefault()
      hide()
      history.pushState(null, '', id)
      document.querySelectorAll('.sources li.is-target').forEach((li) => li.classList.remove('is-target'))
      src.classList.add('is-target')
      scroll.scrollTo(src, { offset: -120 })
    })
    box.append(text, all)
    show(a, box)
  }, true)

  addEventListener('keydown', (e) => e.key === 'Escape' && hide())
  document.addEventListener('pointerdown', (e) => {
    if (!tip.hidden && !tip.contains(e.target as Node) && !current?.contains(e.target as Node)) hide()
  })
  // Scrolling hides the popover, except the scroll that keyboard focus itself causes.
  addEventListener('scroll', () => {
    if (current && performance.now() - shownAt > 400) hide()
  }, { passive: true })
}

/**
 * Some controls live inside crossfading layers of pinned chapters (grid steps, day captions).
 * When keyboard focus lands in one, scroll the chapter to where that layer is showing.
 */
function initFocusIntoPins(scroll: Scroll) {
  const toPin = (section: HTMLElement, p: number) => {
    if (section.classList.contains('flow-static')) return
    const top = section.getBoundingClientRect().top + scrollY
    const y = top + (section.offsetHeight - innerHeight) * p
    scroll.scrollTo(y, { immediate: true })
  }
  document.addEventListener('focusin', (e) => {
    const t = e.target as Element
    const step = t.closest<HTMLElement>('#grid .step[data-from]')
    if (step && !step.classList.contains('is-active')) {
      const from = Number(step.dataset.from)
      const to = Math.min(1, Number(step.dataset.to))
      toPin(document.getElementById('grid') as HTMLElement, (from + to) / 2)
      return
    }
    const caption = t.closest<HTMLElement>('#day .day-captions li[data-at]')
    if (caption && !caption.classList.contains('is-active')) {
      // Mirrors the day chapter's mapping: 06:00 at p = 0.04, 06:00 next day at p = 0.96.
      const hour = Number(caption.dataset.at)
      toPin(document.getElementById('day') as HTMLElement, 0.04 + ((hour - 6) / 24) * 0.92 + 0.005)
    }
  })
}

function initDial(reducedMotion: boolean) {
  const dial = document.getElementById('dial')
  if (!dial) return
  const r = 96
  const c = 2 * Math.PI * r
  const reserve = dial.querySelector<SVGCircleElement>('.dial-reserve')
  const charge = dial.querySelector<SVGCircleElement>('.dial-charge')
  const ticks = dial.querySelector('.dial-ticks')
  if (ticks) {
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2
      const l = i % 4 === 0 ? 10 : 5
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', String(120 + Math.cos(a) * (r - 18)))
      line.setAttribute('y1', String(120 + Math.sin(a) * (r - 18)))
      line.setAttribute('x2', String(120 + Math.cos(a) * (r - 18 - l)))
      line.setAttribute('y2', String(120 + Math.sin(a) * (r - 18 - l)))
      line.setAttribute('stroke', 'rgba(255,255,255,0.18)')
      line.setAttribute('stroke-width', '1')
      ticks.append(line)
    }
  }
  // Inline style beats any stylesheet value, so the arcs always draw.
  const set = (el: SVGCircleElement | null, frac: number) => {
    if (el) el.style.strokeDasharray = `${c * frac} ${c}`
  }
  if (reducedMotion) {
    set(charge, 0.8)
    set(reserve, 0.4)
    return
  }
  const st = { a: 0, b: 0 }
  gsap.to(st, {
    a: 0.8,
    b: 0.4,
    duration: 2,
    ease: 'expo.out',
    scrollTrigger: { trigger: dial, start: 'top 80%', once: true },
    onUpdate: () => {
      set(charge, st.a)
      set(reserve, st.b)
    },
  })
}

function initGridSteps() {
  const section = document.getElementById('grid')
  const steps = [...document.querySelectorAll<HTMLElement>('#grid-steps .step')]
  if (!section || !steps.length) return
  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      for (const s of steps) {
        const on = self.progress >= Number(s.dataset.from) && self.progress < Number(s.dataset.to)
        s.classList.toggle('is-active', on)
      }
      section.classList.toggle('is-step-3', self.progress >= 0.6)
    },
  })
  steps[0].classList.add('is-active')
  fitClosingStep(section, steps)
}

/**
 * The closing step (title + share card) is the tallest and is centred in the pinned frame, so in a
 * laptop-height window it runs into the dated policy row at the bottom. Layout sizes are measured
 * (transforms are ignored); with no room left, the row fades out while that step shows.
 */
function fitClosingStep(section: HTMLElement, steps: HTMLElement[]) {
  const last = steps[steps.length - 1]
  const frame = last.parentElement
  const policy = section.querySelector<HTMLElement>('.policy')
  if (!frame || !policy) return
  const fit = () => {
    const bottom = (frame.clientHeight + last.offsetHeight) / 2
    section.classList.toggle('no-policy-room', policy.offsetTop - bottom < 20)
  }
  new ResizeObserver(fit).observe(frame)
  void document.fonts?.ready.then(fit)
  fit()
}

function initVpp(director: Director | null) {
  const input = document.getElementById('vpp-share') as HTMLInputElement | null
  const out = document.getElementById('vpp-share-out')
  const gw = document.getElementById('vpp-gw')
  if (!input || !out || !gw) return
  const shown = { v: 0 }
  const paintShare = () => {
    out.textContent = fmt.pct(Number(input.value))
    input.setAttribute('aria-valuetext', t('vpp.valuetext', { n: input.value }))
    gw.textContent = fmt.num(shown.v, 1)
  }
  onLangChange(paintShare)
  const update = () => {
    const share = Number(input.value) / 100
    paintShare()
    const target = (EV_STOCK * share * WALLBOX_KW) / 1e6
    gsap.to(shown, {
      v: target,
      duration: 0.6,
      ease: 'power3.out',
      onUpdate: () => {
        gw.textContent = fmt.num(shown.v, 1)
      },
    })
    // The scene lights the same share of its cars.
    if (director) director.state.participation = share
  }
  input.addEventListener('input', update)
  update()
}

/**
 * Connectors from inputs to the optimiser to actions (horizontal on wide screens, vertical below 960 px).
 * The curves draw in once when the chart scrolls into view. After that, small light pulses tell the story:
 * the inputs flow into the core, the plan is re-made, and actions go out, one box lighting up at a time.
 * One shared ticker drives it, and only while the chart is on screen; pulses follow the real path geometry
 * (getPointAtLength), so they stay on the curves after a resize. Reduced motion: static lines, no pulses.
 */
function initFlowchart(reducedMotion: boolean) {
  const chart = document.getElementById('flowchart')
  const svg = chart?.querySelector<SVGSVGElement>('.fc-lines')
  const coreEl = chart?.querySelector<HTMLElement>('.fc-core')
  if (!chart || !svg || !coreEl) return
  const NS = 'http://www.w3.org/2000/svg'
  const el = <T extends SVGElement>(tag: string, attrs: Record<string, string> = {}): T => {
    const node = document.createElementNS(NS, tag) as T
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
    return node
  }

  // Colour grammar, read from each action's dot: Charge = grid indigo, Hold = neutral, Power the home and
  // Support the grid = stored-energy teal. The inputs are information, not energy, so they stay neutral.
  type Tone = 'slate' | 'indigo' | 'teal'
  const TONES: Record<Tone, { rgb: string; line: string }> = {
    slate: { rgb: '203,213,225', line: 'rgba(148,163,184,0.5)' },
    indigo: { rgb: '129,140,248', line: 'rgba(129,140,248,0.62)' },
    teal: { rgb: '94,234,212', line: 'rgba(94,234,212,0.65)' },
  }
  const toneOf = (li: HTMLElement): Tone => (li.querySelector('.dot-grid') ? 'indigo' : li.querySelector('.dot-energy') ? 'teal' : 'slate')
  if (!reducedMotion) {
    // Glow is a plain radial gradient (white-hot centre), never a filter.
    const defs = el('defs')
    for (const [name, t] of Object.entries(TONES)) {
      const g = el('radialGradient', { id: `fc-glow-${name}` })
      g.append(
        el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0.95' }),
        el('stop', { offset: '0.2', 'stop-color': `rgb(${t.rgb})`, 'stop-opacity': '0.85' }),
        el('stop', { offset: '1', 'stop-color': `rgb(${t.rgb})`, 'stop-opacity': '0' }),
      )
      defs.append(g)
    }
    svg.prepend(defs)
  } else {
    chart.classList.add('is-static') // the ring stands still too
  }

  interface Link {
    p: SVGPathElement
    li: HTMLElement
    isIn: boolean
    len: number
    head: SVGGElement
    tail: SVGCircleElement
    shown: boolean
  }
  const lines = el<SVGGElement>('g')
  const pulses = el<SVGGElement>('g')
  svg.append(lines, pulses)
  const links: Link[] = [...chart.querySelectorAll<HTMLElement>('.fc-in li, .fc-out li')].map((li) => {
    const isIn = li.closest('.fc-in') !== null
    const tone: Tone = isIn ? 'slate' : toneOf(li)
    li.style.setProperty('--tone', TONES[tone].rgb.replace(/,/g, ' '))
    const p = el<SVGPathElement>('path', { fill: 'none', stroke: TONES[tone].line, 'stroke-width': '1.2' })
    lines.append(p)
    const head = el<SVGGElement>('g', { opacity: '0' })
    const tail = el<SVGCircleElement>('circle', { r: '6', fill: `url(#fc-glow-${tone})`, opacity: '0' })
    if (!reducedMotion) {
      head.append(el('circle', { r: '11', fill: `url(#fc-glow-${tone})` }), el('circle', { r: '2.3', fill: '#fff' }))
      pulses.append(tail, head)
    }
    return { p, li, isIn, len: 0, head, tail, shown: false }
  })
  const inputs = links.filter((l) => l.isIn)
  const outputs = links.filter((l) => !l.isIn)

  // Both kinds of path run in the direction the information flows: input box → core, core → action box.
  let drawn = reducedMotion
  let drawDone = reducedMotion
  const layout = () => {
    const box = chart.getBoundingClientRect()
    const core = coreEl.getBoundingClientRect()
    const cx = core.left - box.left + core.width / 2
    const cy = core.top - box.top + core.height / 2
    const vertical = innerWidth < 960
    for (const link of links) {
      const { p, li, isIn } = link
      const r = li.getBoundingClientRect()
      let d: string
      if (vertical) {
        const x = r.left - box.left + r.width / 2
        const y = isIn ? r.bottom - box.top : r.top - box.top
        const ey = isIn ? core.top - box.top : core.bottom - box.top
        const my = (y + ey) / 2
        d = isIn ? `M${x},${y} C${x},${my} ${cx},${my} ${cx},${ey}` : `M${cx},${ey} C${cx},${my} ${x},${my} ${x},${y}`
      } else {
        const x = isIn ? r.right - box.left : r.left - box.left
        const y = r.top - box.top + r.height / 2
        const ex = isIn ? cx - core.width / 2 : cx + core.width / 2
        const mx = (x + ex) / 2
        d = isIn ? `M${x},${y} C${mx},${y} ${mx},${cy} ${ex},${cy}` : `M${ex},${cy} C${mx},${cy} ${mx},${y} ${x},${y}`
      }
      p.setAttribute('d', d)
      link.len = p.getTotalLength()
      p.style.strokeDasharray = `${link.len}`
      if (!drawn) p.style.strokeDashoffset = `${link.len}`
      else if (drawDone) p.style.strokeDashoffset = '0' // mid-draw the tween finishes the job
    }
  }
  layout()

  // ---- Pulses ---------------------------------------------------------------------------------
  const CYCLE = 6.6 // seconds per plan
  const IN_DUR = 1
  const OUT_DUR = 0.9
  const inAt = (i: number) => 0.15 + i * 0.17
  const planAt = inAt(inputs.length - 1) + IN_DUR + 0.12 // the optimiser re-plans once the last input lands
  const outAt = (j: number) => planAt + 0.1 + j * 0.5
  const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
  const sine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x)
  const envelope = (u: number) => smooth(u / 0.14) * (1 - smooth((u - 0.86) / 0.14))
  /** A flash: eases up over `rise` seconds after t = 0, then fades out with time constant `tau`. */
  const flash = (t: number, rise: number, tau: number) => (t <= 0 ? 0 : t < rise ? smooth(t / rise) : Math.exp(-(t - rise) / tau))

  const place = (link: Link, u: number) => {
    if (u <= 0 || u >= 1) {
      if (link.shown) {
        link.head.setAttribute('opacity', '0')
        link.tail.setAttribute('opacity', '0')
        link.shown = false
      }
      return
    }
    const a = envelope(u)
    const s = sine(u) * link.len
    const pt = link.p.getPointAtLength(s)
    const tp = link.p.getPointAtLength(Math.max(0, s - 12))
    link.head.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`)
    link.head.setAttribute('opacity', a.toFixed(3))
    link.tail.setAttribute('cx', tp.x.toFixed(1))
    link.tail.setAttribute('cy', tp.y.toFixed(1))
    link.tail.setAttribute('opacity', (a * 0.55).toFixed(3))
    link.shown = true
  }
  const written = new WeakMap<HTMLElement, Map<string, string>>()
  const setVar = (target: HTMLElement, name: string, v: number) => {
    const text = v.toFixed(3)
    let seen = written.get(target)
    if (!seen) written.set(target, (seen = new Map()))
    if (seen.get(name) !== text) {
      seen.set(name, text)
      target.style.setProperty(`--${name}`, text)
    }
  }
  const frame = (c: number) => {
    inputs.forEach((l, i) => {
      place(l, (c - inAt(i)) / IN_DUR)
      setVar(l.li, 'lit', 0.5 * flash(c - inAt(i), 0.12, 0.3)) // a gentle send
    })
    outputs.forEach((l, j) => {
      place(l, (c - outAt(j)) / OUT_DUR)
      setVar(l.li, 'lit', flash(c - (outAt(j) + OUT_DUR), 0.12, 0.5)) // lights up as its pulse arrives
    })
    let glow = flash(c - planAt, 0.1, 0.55)
    inputs.forEach((_, i) => (glow += 0.4 * flash(c - (inAt(i) + IN_DUR), 0.08, 0.32))) // each input landing nudges the core
    setVar(coreEl, 'fc-glow', Math.min(1, glow))
    const ping = (c - planAt) / 0.9
    setVar(coreEl, 'fc-ping', ping < 0 || ping > 1 ? 1 : 1 - Math.pow(1 - ping, 2))
  }

  let clock = 0
  let started = false
  let onScreen = false
  let running = false
  const tick = (_: number, deltaMs: number) => {
    clock += Math.min(0.1, deltaMs / 1000)
    frame(clock % CYCLE)
  }
  const sync = () => {
    const want = started && onScreen && !reducedMotion
    if (want === running) return
    running = want
    if (want) gsap.ticker.add(tick)
    else gsap.ticker.remove(tick)
  }
  if (!reducedMotion) {
    new IntersectionObserver(
      (entries) => {
        onScreen = entries[entries.length - 1].isIntersecting
        sync()
      },
      { rootMargin: '60px 0px' },
    ).observe(chart)
    ScrollTrigger.create({
      trigger: chart,
      start: 'top 75%',
      once: true,
      onEnter: () => {
        drawn = true
        const tl = gsap.timeline({ onComplete: () => (drawDone = true) })
        tl.to(inputs.map((l) => l.p), { strokeDashoffset: 0, duration: 1, ease: 'power2.inOut', stagger: 0.08 })
        tl.to(outputs.map((l) => l.p), { strokeDashoffset: 0, duration: 1, ease: 'power2.inOut', stagger: 0.08 }, 0.95)
        tl.call(() => {
          started = true
          sync()
        }, [], 1.3) // the inputs are drawn; the outputs finish while the first pulses are still on their way
      },
    })
  }

  // Layout follows the window and any size change of the chart or its boxes (webfonts landing late).
  let timer = 0
  const relayout = () => {
    clearTimeout(timer)
    timer = window.setTimeout(layout, 120)
  }
  addEventListener('resize', relayout)
  const ro = new ResizeObserver(relayout)
  ro.observe(chart)
  ro.observe(coreEl)
  for (const l of links) ro.observe(l.li)
}

function initJoin() {
  const form = document.getElementById('join-form') as HTMLFormElement | null
  const status = document.getElementById('join-status')
  const email = document.getElementById('join-email') as HTMLInputElement | null
  if (!form || !status || !email) return
  // The message on screen, so it can be said again in another language.
  let message: StringKey | null = null
  const say = (key: StringKey | null) => {
    message = key
    status.textContent = key ? t(key) : ''
  }
  onLangChange(() => say(message))
  const clear = () => {
    email.removeAttribute('aria-invalid')
    email.removeAttribute('aria-describedby')
    status.classList.remove('is-error')
  }
  email.addEventListener('input', clear)
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())
    if (!ok) {
      status.classList.add('is-error')
      say('join.invalid')
      email.setAttribute('aria-invalid', 'true')
      email.setAttribute('aria-describedby', 'join-status')
      email.focus()
      return
    }
    // Prototype: no backend is connected, and nothing is stored. Say so plainly.
    clear()
    say('join.thanks')
    form.reset()
  })
}
