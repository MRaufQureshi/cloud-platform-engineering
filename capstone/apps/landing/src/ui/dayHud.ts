// HUD for the "day, orchestrated" chapter: clock, live price, solar, home and car readouts,
// the action of the hour, the running net cost with and without planning, a 24-hour price
// ribbon with a playhead, and 3D-anchored node labels. All values come from the director's
// state (the optimiser's story day); the DOM is only touched when a shown value changes.
import * as THREE from 'three'
import type { Director } from '../director.ts'
import { costSoFar, sampleDay } from '../director.ts'
import { BRAND } from '../config.ts'
import { PRICE_EUR_KWH } from '../sim/model.ts'
import type { HourFlow } from '../sim/v2h.ts'

/** The three most expensive hours of the illustrative tariff count as "peak". */
const PEAK_CT = Math.round([...PRICE_EUR_KWH].sort((a, b) => b - a)[2] * 100)

function actionLabel(step: HourFlow, pv: number, view: 'smart' | 'baseline'): string {
  switch (step.action) {
    case 'away':
      return pv > 0.05 ? 'Car away · solar runs the house' : 'Car away · home on the grid'
    case 'solar-charge':
      return 'Charging the car from the sun'
    case 'grid-charge':
      return view === 'baseline' ? 'Charging at full power on arrival' : 'Topping up while power is cheap'
    case 'v2h':
      return 'Car powering the home'
    default:
      return pv > 0.05 ? 'Home on solar & grid · car resting' : 'Home on the grid · car resting'
  }
}

export function initDayHud(director: Director | null): void {
  const hud = document.getElementById('day-hud')
  const captions = [...document.querySelectorAll<HTMLElement>('#day-captions li')]
  const labelsRoot = document.getElementById('scene-labels')
  if (!hud) return
  if (!director) {
    // Without WebGL the captions render as a static list (.flow-static) and the HUD stays hidden.
    hud.hidden = true
    return
  }

  const W = 600
  const H = 70
  const max = Math.max(...PRICE_EUR_KWH)
  const min = Math.min(...PRICE_EUR_KWH)
  const yOf = (p: number) => H - 8 - ((p - min) / (max - min)) * (H - 20)
  const pts = [...PRICE_EUR_KWH, PRICE_EUR_KWH[0]].map((p, i) => `${((i / 24) * W).toFixed(1)},${yOf(p).toFixed(1)}`)
  const peakY = yOf(PEAK_CT / 100)
  hud.innerHTML = `
    <div class="hud-panel">
      <div class="hud-toggle" role="group" aria-label="Compare plans">
        <button type="button" data-view="smart" aria-pressed="true">With ${BRAND}</button>
        <button type="button" data-view="baseline" aria-pressed="false">Without</button>
      </div>
      <div class="hud-clock"><span data-k="clock">06:00</span><span class="hud-sub" data-k="phase">Morning</span></div>
      <dl class="hud-metrics">
        <div><dt>Price</dt><dd><span data-k="price">27</span><small>ct/kWh</small></dd></div>
        <div class="hud-opt"><dt>Solar</dt><dd><span data-k="pv">0.0</span><small>kW</small></dd></div>
        <div class="hud-opt"><dt>Home</dt><dd><span data-k="load">0.0</span><small>kW</small></dd></div>
        <div><dt>Car</dt><dd><span data-k="soc">86</span><small>%</small><span class="hud-bar"><span data-k="socbar"></span></span></dd></div>
      </dl>
      <p class="hud-action"><span class="hud-dot" data-k="dot"></span><span data-k="action">…</span></p>
      <p class="hud-bill"><span class="dim">Net cost since 06:00</span><strong data-k="bill">€0.00</strong></p>
      <p class="hud-bill-other dim" data-k="billOther"></p>
      <div class="hud-ribbon" aria-hidden="true">
        <p class="hud-ribbon-label">Price · ct/kWh</p>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <rect x="0" y="0" width="${W}" height="${peakY.toFixed(1)}" fill="rgba(251,113,133,0.10)"/>
          <polyline points="${pts.join(' ')}" fill="none" stroke="rgba(226,232,240,0.85)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
          <line data-k="playhead" x1="0" x2="0" y1="0" y2="${H}" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke"/>
        </svg>
        <div class="hud-ribbon-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      </div>
      <ul class="hud-legend" aria-label="Energy colours in the scene">
        <li><span class="dot dot-solar"></span>From the sun</li>
        <li><span class="dot dot-energy"></span>From the car battery</li>
        <li><span class="dot dot-grid"></span>From the grid</li>
      </ul>
    </div>`
  const q = (k: string) => hud.querySelector(`[data-k="${k}"]`) as HTMLElement
  const el = {
    clock: q('clock'),
    phase: q('phase'),
    price: q('price'),
    pv: q('pv'),
    load: q('load'),
    soc: q('soc'),
    socbar: q('socbar'),
    action: q('action'),
    dot: q('dot'),
    bill: q('bill'),
    billOther: q('billOther'),
    playhead: hud.querySelector('[data-k="playhead"]') as SVGLineElement,
  }
  // Write-through cache: only touch the DOM when the shown text or style changes.
  const shown = new Map<HTMLElement | SVGElement, string>()
  const text = (node: HTMLElement, value: string) => {
    if (shown.get(node) === value) return
    shown.set(node, value)
    node.textContent = value
  }
  const style = (node: HTMLElement, prop: 'color' | 'background' | 'width', value: string) => {
    const key = `${prop}:${value}`
    if (shown.get(node) === key) return
    shown.set(node, key)
    node.style[prop] = value
  }

  // 3D-anchored labels for the four energy nodes
  const names: Record<string, string> = { pv: 'Solar', home: 'Home', car: 'Car', grid: 'Grid' }
  const labels = new Map<string, HTMLElement>()
  if (labelsRoot) {
    for (const k of Object.keys(names)) {
      const l = document.createElement('span')
      l.className = `scene-label scene-label-${k}`
      l.textContent = names[k]
      labelsRoot.append(l)
      labels.set(k, l)
    }
  }

  const v = new THREE.Vector3()
  const intro = document.querySelector<HTMLElement>('.day-intro')
  const dayEl = document.getElementById('day')
  const toggles = [...hud.querySelectorAll<HTMLButtonElement>('[data-view]')]
  const setView = (view: 'smart' | 'baseline') => {
    director.view = view
    toggles.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.view === view)))
    hud.classList.toggle('is-baseline', view === 'baseline')
    // Captions tell the story of whichever plan is playing.
    for (const c of captions) {
      c.querySelector<HTMLElement>('[data-smart]')?.toggleAttribute('hidden', view === 'baseline')
      c.querySelector<HTMLElement>('[data-baseline]')?.toggleAttribute('hidden', view !== 'baseline')
    }
  }
  for (const b of toggles) b.addEventListener('click', () => setView(b.dataset.view === 'baseline' ? 'baseline' : 'smart'))

  // Summer days with rooftop solar often end in credit: say so instead of showing a minus sign.
  const euro = (x: number) => (x < -0.005 ? `€${Math.abs(x).toFixed(2)} credit` : `€${Math.max(0, x).toFixed(2)}`)
  const ease = (t: number) => t * t * (3 - 2 * t)
  let lastCaption = -1
  let wasOn = false
  let lastPlayhead = -1

  const rectsOverlap = (a: DOMRect, x: number, y: number) => x > a.left - 60 && x < a.right + 10 && y > a.top - 30 && y < a.bottom + 10

  const tick = () => {
    requestAnimationFrame(tick)
    const p = director.active.p
    const inDay = director.active.id === 'day'
    const on = inDay && p < 0.985
    if (on !== wasOn) {
      hud.classList.toggle('is-on', on)
      wasOn = on
    }
    // In the static list (phones, zoomed text) the scene sits behind the cards, so anchored labels would float over copy.
    labelsRoot?.classList.toggle('is-on', on && p < 0.97 && director.state.flowsOpacity > 0.5 && !dayEl?.classList.contains('flow-static'))
    // In the static flow (phones, zoomed text) the title is an ordinary heading above the cards: progress must not fade it.
    const flow = dayEl?.classList.contains('flow-static') ?? false
    if (flow && intro && intro.style.opacity !== '') intro.style.opacity = ''
    if (!inDay) return
    // The chapter title hands over to the captions once the clock starts running.
    if (intro && !flow) intro.style.opacity = String(1 - Math.min(1, Math.max(0, (p - 0.045) / 0.045)))
    const h = director.state.dayHour
    const hh = ((h % 24) + 24) % 24
    const { step, next, frac } = sampleDay(director.plan, h, director.view)
    // Same easing as the 3D flows, so the numbers and the particles agree.
    const k = ease(frac)
    const pv = step.pv + (next.pv - step.pv) * k
    const load = step.load + (next.load - step.load) * k
    const hours = Math.floor(hh)
    const mins = Math.floor((hh - hours) * 60)
    text(el.clock, `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`)
    text(el.phase, hh < 5 ? 'Night' : hh < 10.5 ? 'Morning' : hh < 12 ? 'Late morning' : hh < 15 ? 'Midday' : hh < 18 ? 'Afternoon' : hh < 22 ? 'Evening' : 'Night')
    const ct = Math.round(step.price * 100)
    text(el.price, String(ct))
    style(el.price, 'color', ct >= PEAK_CT ? 'var(--peak)' : 'var(--text)')
    text(el.pv, pv.toFixed(1))
    text(el.load, load.toFixed(1))
    const soc = Math.round(director.state.soc * 100)
    text(el.soc, String(soc))
    style(el.socbar, 'width', `${soc}%`)
    const moving = director.state.drive > 0.02 && director.state.drive < 0.98
    text(el.action, moving ? (hh < 12 ? 'Leaving for the day' : 'Arriving home, plugging in') : actionLabel(step, pv, director.view))
    const mine = costSoFar(director.plan, h, director.view)
    const other = costSoFar(director.plan, h, director.view === 'smart' ? 'baseline' : 'smart')
    text(el.bill, euro(mine))
    text(el.billOther, director.view === 'smart' ? `${euro(other)} without planning` : `${euro(other)} with ${BRAND}`)
    style(
      el.dot,
      'background',
      step.action === 'v2h' ? 'var(--energy)' : step.action === 'grid-charge' ? 'var(--grid)' : step.action === 'solar-charge' ? 'var(--solar)' : '#94a3b8',
    )
    const px = Math.round((hh / 24) * W * 2) / 2
    if (px !== lastPlayhead) {
      el.playhead.setAttribute('x1', String(px))
      el.playhead.setAttribute('x2', String(px))
      lastPlayhead = px
    }

    // caption for the current hour
    let idx = 0
    captions.forEach((c, i) => {
      if (h >= Number(c.dataset.at) - 0.01) idx = i
    })
    if (idx !== lastCaption) {
      captions.forEach((c, i) => c.classList.toggle('is-active', i === idx))
      lastCaption = idx
    }

    // node labels, hidden where they would sit on the HUD or the caption
    if (labelsRoot && labelsRoot.classList.contains('is-on')) {
      const hudRect = hud.getBoundingClientRect()
      const capRect = captions[idx]?.getBoundingClientRect()
      for (const [key, l] of labels) {
        v.copy(director.modules.flows.nodes[key as 'pv']).project(director.camera)
        const x = ((v.x + 1) / 2) * innerWidth
        const y = ((1 - v.y) / 2) * innerHeight
        const blocked = rectsOverlap(hudRect, x, y) || (capRect ? rectsOverlap(capRect, x, y) : false)
        const visible = v.z < 1 && !blocked && x > 0 && x < innerWidth - 40 && y > 70 && y < innerHeight && (key !== 'car' || director.state.drive < 0.3)
        l.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
        l.style.opacity = visible ? '1' : '0'
      }
    }
  }
  tick()
}
