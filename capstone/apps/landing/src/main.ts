// Boot: loader → fonts → WebGL world + scroll director → UI systems → ignition → reveal.
import '@fontsource-variable/manrope'
import '@fontsource-variable/jetbrains-mono'
import 'lenis/dist/lenis.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/hud.css'
import './styles/simulator.css'
import './styles/fleet.css'
import './styles/sound.css'
import './styles/lens.css'

import { initAppLink } from './appLink'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { BRAND, BRAND_FULL } from './config.ts'
import { detectQuality, type Quality } from './core/quality.ts'
import { clearMotionOptIn, saveMotionOptIn } from './core/motionPref.ts'
import { initScroll, type Scroll } from './core/scroll.ts'
import { World } from './core/world.ts'
import { createDirector, type Director } from './director.ts'
import { createLoader } from './ui/loader.ts'
import { initCursor } from './ui/cursor.ts'
import { initMagnetic } from './ui/magnetic.ts'
import { initClosingTitle, initReveals, revealHeadline, revealHeroRest } from './ui/reveal.ts'
import { initTitleLens } from './ui/titleLens.ts'
import { initRail } from './ui/rail.ts'
import { initLang, onLangChange, setLang, t, type Lang } from './i18n/lang.ts'
import type { StringKey } from './i18n/strings.ts'
import { initLangToggle } from './ui/langToggle.ts'
import { initDayHud } from './ui/dayHud.ts'
import { initSimulator } from './ui/simulator.ts'
import { initSections } from './ui/sections.ts'
import { createFleetBoard } from './ui/fleet.ts'
import { bindHoverTicks, createSoundToggle, initSound } from './ui/sound.ts'

declare global {
  interface Window {
    __ready?: boolean
    __scrollToProgress?: (p: number) => void
    /** QA hook: jump to progress p (0–1) through a chapter (pinned chapters use their pin range). */
    __scrollToChapter?: (id: string, p: number) => void
    __director?: Director | null
    /** QA hook: switch the page language without saving the choice. */
    __setLang?: (lang: Lang) => void
  }
}

/** The static HTML already carries the name; this keeps every .brand-mark in step with config.ts. */
function applyBrand(): void {
  for (const el of document.querySelectorAll('.brand-mark')) el.textContent = BRAND
  for (const el of document.querySelectorAll('.brand-full')) el.textContent = BRAND_FULL
}

async function boot(): Promise<void> {
  initLang() // first: remembers the English page, then shows the visitor's language before anything is measured
  applyBrand()
  const quality = detectQuality()
  const root = document.documentElement
  root.classList.toggle('reduced-motion', quality.reducedMotion)
  // The device asks for less motion but the visitor opted in: the CSS that follows the device setting stands down.
  root.classList.toggle('motion-full', quality.osReducedMotion && !quality.reducedMotion)
  try {
    history.scrollRestoration = 'manual'
  } catch {
    /* not allowed in some embedded frames */
  }
  scrollTo(0, 0)

  const loader = createLoader(document.getElementById('loader') as HTMLElement, quality.reducedMotion)
  const scroll = initScroll(quality.reducedMotion)
  scroll.stop()
  loader.progress(0.12)

  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))])
  loader.progress(0.35)

  let director: Director | null = null
  if (quality.webgl) {
    try {
      const canvas = document.getElementById('gl') as HTMLCanvasElement
      const world = new World(canvas, quality)
      director = createDirector(world, quality.reducedMotion)
      const d = director
      world.onTick((t, dt) => d.frame(t, dt))
      loader.progress(0.6)
      d.frame(0, 1)
      // Compile the shader variants the post-processing path really uses.
      await world.prewarm()
      try {
        d.warmup() // an optimisation only: never let it take the scene down
      } catch (err) {
        console.warn('Shader warm-up skipped.', err)
      }
      loader.progress(0.85)
      world.renderNow()
      world.start()
      addEventListener('pointermove', (e) => d.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1))
    } catch (err) {
      console.error('WebGL scene failed, showing the static fallback.', err)
      root.classList.add('no-webgl')
      director = null
    }
  } else {
    root.classList.add('no-webgl')
  }
  window.__director = director

  // Closing title: its particle twin is rasterised now, under the loader, so that work never lands mid-scroll.
  // Without the swarm (reduced motion, lowest tier, no WebGL) the title keeps its character rise.
  const joinTitle = document.querySelector<HTMLElement>('#join .hero-title')
  let joinParticles = false
  if (director?.closing && joinTitle) {
    joinParticles = await Promise.race([director.closing.prepare(joinTitle), new Promise<boolean>((r) => setTimeout(() => r(false), 4000))])
    if (joinParticles) {
      joinTitle.dataset.reveal = 'particles' // shown by the swarm, not by the character rise
      joinTitle.style.opacity = '0' // initClosingTitle fades it in once the particles have assembled
    }
  }

  initRail(document.getElementById('rail') as HTMLElement, scroll)
  initFleetBoard(director)
  initSoundBridge(director, quality.reducedMotion)
  const inviteMotion = initMotionToggle(director, quality)
  initMotionReturn(quality)
  initReveals(quality.reducedMotion)
  initSimulator(quality.reducedMotion)
  initSections(director, scroll, quality.reducedMotion)
  // The hover lens needs the finished title: after the swarm has handed over, or, without the swarm, after the character rise.
  if (director && joinParticles && joinTitle) initClosingTitle(director, joinTitle, () => initTitleLens(joinTitle, quality.reducedMotion))
  else if (joinTitle) window.setTimeout(() => initTitleLens(joinTitle, quality.reducedMotion), 3000)
  initDayHud(director)
  initCursor(quality.reducedMotion)
  initMagnetic(quality.reducedMotion)
  initAnchors(scroll)
  initLangToggle()
  // Registered last, so it runs after every module has redrawn its text: the page is a different length
  // now, and the 3D headlines have to be read from the new words.
  onLangChange(() => {
    ScrollTrigger.refresh()
    director?.measure()
    void director?.retitle()
  })
  window.__setLang = (lang) => setLang(lang, false)

  window.__scrollToProgress = (p: number) => scroll.scrollToProgress(p, true)
  window.__scrollToChapter = (id: string, p: number) => {
    const el = document.getElementById(id)
    if (!el) return
    const top = el.getBoundingClientRect().top + scrollY
    const pinned = el.hasAttribute('data-pin') && !el.classList.contains('flow-static')
    const range = pinned ? el.offsetHeight - innerHeight : el.offsetHeight
    const first = el.previousElementSibling === null
    const y = pinned ? top + range * p : first ? top + el.offsetHeight * 0.5 * p : top + range * p - innerHeight * 0.5
    if (scroll.lenis) scroll.lenis.scrollTo(Math.max(0, y), { immediate: true, force: true })
    else scrollTo(0, Math.max(0, y))
  }

  // Ignition: as the loader opens, energy leaves the charge port and assembles the headline;
  // the crisp DOM headline fades in on top, then the rest of the hero follows.
  const heroTitle = document.getElementById('hero-title') as HTMLElement
  const swarm = Boolean(director?.modules.swarm)
  let ignition: Promise<unknown> | null = null
  loader.progress(1)
  await loader.finish(() => {
    if (director && swarm) ignition = Promise.race([director.ignite(heroTitle, 1.8), new Promise((r) => setTimeout(r, 4000))])
  })
  scroll.start()
  inviteMotion?.() // the loader has gone: draw the eye to the play button once
  ScrollTrigger.refresh()
  director?.measure()
  if (ignition) await ignition
  await revealHeadline(heroTitle, quality.reducedMotion, swarm)
  director?.handOver()
  revealHeroRest(quality.reducedMotion)
  director?.rereadHeadline()
  initHeroHandover(heroTitle, quality.reducedMotion)
  window.__ready = true
}

/** As the hero scrolls away, the DOM headline fades quickly and its particle twin takes over. */
function initHeroHandover(title: HTMLElement, reducedMotion: boolean): void {
  if (reducedMotion) return
  gsap.fromTo(
    title,
    { opacity: 1 },
    { opacity: 0, ease: 'none', immediateRender: false, scrollTrigger: { trigger: '#hero', start: 'top top', end: '6% top', scrub: true } },
  )
}

/** In-page links scroll smoothly, move focus to the target and keep the URL hash in sync. */
function initAnchors(scroll: Scroll): void {
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
    if (a.closest('sup') || a.closest('#chapter-menu')) continue // citations and the menu handle themselves
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href') as string
      const target = id.length > 1 ? document.querySelector<HTMLElement>(id) : null
      if (!target) return
      e.preventDefault()
      scroll.scrollTo(target)
      target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
    })
  }
}

/** Feeds the fleet board the depot's simulated hour (scroll-driven without WebGL). */
function initFleetBoard(director: Director | null): void {
  const mount = document.getElementById('fleet-board')
  const section = document.getElementById('fleet')
  if (!mount || !section) return
  const board = createFleetBoard(mount)
  if (director) {
    const tick = () => {
      requestAnimationFrame(tick)
      if (director.active.id === 'fleet') board.setHour(director.state.fleetHour)
    }
    tick()
  } else {
    ScrollTrigger.create({
      trigger: section,
      start: 'top 60%',
      end: 'bottom 40%',
      onUpdate: (self) => board.setHour(18 + 16 * self.progress),
    })
  }
}

/**
 * A pause button for ambient motion (WCAG 2.2.2), remembered per visitor.
 *
 * When the device asks for reduced motion the page starts still and says so: the button starts as "Play animation"
 * with a note under the top bar giving the reason. Pressing it opts the visitor in: the choice is stored
 * (core/motionPref.ts) and the page reloads so every module starts in full-motion mode. If the choice cannot be
 * stored, or `?reduced` pins the still layout, nothing reloads: ambient motion is un-paused for this visit only.
 * Afterwards the button is the ordinary pause/play control.
 *
 * Returns a function that draws attention to the button once the loader has gone, or null without a director.
 */
function initMotionToggle(director: Director | null, quality: Quality): (() => void) | null {
  const slot = document.getElementById('motion-slot')
  if (!slot || !director) {
    slot?.remove()
    return null
  }
  const still = quality.reducedMotion // the page was built in its still layout
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'sound-toggle motion-toggle'
  // The glyph shows what a click does: bars while the scene moves, a triangle while it is frozen.
  const PAUSE_ICON =
    '<svg class="motion-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3" width="2.6" height="10" rx="1" fill="currentColor"/><rect x="9.4" y="3" width="2.6" height="10" rx="1" fill="currentColor"/></svg>'
  const PLAY_ICON =
    '<svg class="motion-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.4 3.6v8.8L12.2 8z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  let paused = still
  let invite = still // while true, a click opts in instead of toggling
  let shown: boolean | null = null
  if (!still) {
    try {
      paused = localStorage.getItem('motion-pref') === 'paused'
    } catch {
      /* storage unavailable */
    }
  }

  // The reason the page is still, under the bar. It is the button's description, so screen readers get it too.
  let note: HTMLElement | null = null
  const syncNote = () => {
    if (!note) return
    if (note.dataset.mode === 'invite') note.classList.toggle('is-away', scrollY > innerHeight * 0.5)
    btn.classList.toggle('has-note', !note.classList.contains('is-away') && !note.classList.contains('is-gone'))
  }
  let noteKeys: [title: StringKey, text: StringKey] | null = null
  const paintNote = () => {
    if (!note || !noteKeys) return
    const strong = document.createElement('strong')
    strong.textContent = t(noteKeys[0])
    const span = document.createElement('span')
    span.textContent = t(noteKeys[1])
    note.replaceChildren(strong, span)
  }
  const setNote = (title: StringKey, text: StringKey, mode: string) => {
    if (!note) return
    noteKeys = [title, text]
    paintNote()
    note.dataset.mode = mode
    note.classList.remove('is-away', 'is-gone')
    syncNote()
  }
  if (still) {
    note = document.createElement('div')
    note.id = 'motion-note'
    note.className = 'motion-note'
    note.setAttribute('role', 'status')
    document.querySelector('.topbar')?.append(note)
    btn.setAttribute('aria-describedby', 'motion-note')
    btn.classList.add('is-invite')
    setNote('motion.off.title', 'motion.off.text', 'invite')
    note.addEventListener('click', () => {
      if (note?.dataset.mode === 'invite') btn.click()
    })
    addEventListener('scroll', syncNote, { passive: true })
  }

  const apply = () => {
    const label = t(paused ? 'motion.play' : 'motion.pause')
    if (shown !== paused) {
      btn.innerHTML = paused ? PLAY_ICON : PAUSE_ICON
      shown = paused
    }
    // The label already says what a click does, so no aria-pressed: a flipping label plus a pressed state would read as two answers.
    btn.dataset.state = paused ? 'paused' : 'playing'
    btn.setAttribute('aria-label', label)
    btn.dataset.tip = label // the tooltip pill (a native title would show a second tooltip)
    director.setPaused(paused)
  }

  const optIn = () => {
    const saved = !quality.motionForced && saveMotionOptIn()
    if (saved) {
      try {
        localStorage.setItem('motion-pref', 'playing') // an old "paused" must not undo the click
      } catch {
        /* the opt-in itself is stored */
      }
      setNote('motion.restart.title', 'motion.restart.text', 'live')
      scrollTo(0, 0) // restart from the top, so the loader and the hero title assemble in view
      try {
        location.reload()
        return
      } catch {
        /* a frame that may not reload itself: the choice is stored for the next visit, so play for now */
      }
    }
    // The choice cannot be remembered here (or `?reduced` pins the still layout): play ambient motion for this visit only.
    invite = false
    paused = false
    btn.classList.remove('is-invite', 'is-pulse')
    apply()
    const why: StringKey = quality.motionForced ? 'motion.on.forced' : saved ? 'motion.on.saved' : 'motion.on.unsaved'
    setNote('motion.on.title', why, 'live')
    setTimeout(() => {
      note?.classList.add('is-gone')
      syncNote()
    }, 9000)
  }

  btn.addEventListener('click', () => {
    if (invite) return optIn()
    paused = !paused
    if (!still) {
      try {
        localStorage.setItem('motion-pref', paused ? 'paused' : 'playing')
      } catch {
        /* the choice lasts for this visit */
      }
    }
    apply()
  })
  apply()
  onLangChange(() => {
    paintNote()
    apply()
  })
  slot.replaceWith(btn)
  return () => {
    if (invite) btn.classList.add('is-pulse')
  }
}

/** Opted in on a device that asks for less motion: a quiet footer link restores the device setting. */
function initMotionReturn(quality: Quality): void {
  const legal = document.querySelector('.legal')
  if (!legal || !quality.osReducedMotion || quality.reducedMotion) return
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'link-btn'
  let failed = false
  const paint = () => (btn.textContent = t(failed ? 'motion.returnFail' : 'motion.return'))
  paint()
  onLangChange(paint)
  btn.addEventListener('click', () => {
    if (clearMotionOptIn()) location.reload()
    else {
      failed = true
      paint()
    }
  })
  legal.append(' · ', btn)
}

/** Sound is off by default; when switched on it follows the energy on screen and the hour. */
function initSoundBridge(director: Director | null, reducedMotion: boolean): void {
  const sound = initSound()
  document.getElementById('sound-slot')?.replaceWith(createSoundToggle())
  bindHoverTicks(sound)
  if (!director) return
  let lastChapter = ''
  let lastAction = ''
  const tick = () => {
    requestAnimationFrame(tick)
    if (!sound.enabled) return
    const s = director.state
    const kw = Object.values(s.flows).reduce((a, b) => a + b, 0) * s.flowsOpacity
    sound.setFlow(kw + (s.depotOn > 0.5 ? 2 : 0) + s.wave * 3)
    sound.setNight(1 - director.modules.sky.daylight)
    if (director.active.id !== lastChapter) {
      if (lastChapter) sound.cue('reveal')
      lastChapter = director.active.id
    }
    const action = director.active.id === 'day' ? s.carMode : ''
    if (action === 'discharging' && lastAction === 'charging' && !reducedMotion) sound.cue('reversal')
    if (action) lastAction = action
  }
  tick()
}

initAppLink()
boot()
