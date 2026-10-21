// Scroll reveals:
//   [data-reveal="lines"]  masked line-by-line rise (SplitText)
//   [data-reveal="chars"]  masked character rise for big headlines
//   [data-reveal="fade"]   fade + lift; children of [data-stagger] are staggered
//   [data-count-to="400"]  numbers count up (data-decimals, data-prefix, data-suffix)
// Reveals animate opacity only (never visibility), so content stays focusable and in the
// accessibility tree before it has been scrolled into view; focusing an element completes
// its pending reveal. With reduced motion everything is shown immediately.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import type { Director } from '../director.ts'
import { fmt, onBeforeLangChange, onLangChange } from '../i18n/lang.ts'

gsap.registerPlugin(ScrollTrigger, SplitText)

/**
 * Every live SplitText. The text of a split element is rewritten when the language changes, so the splits are
 * undone first and made again after. A split keeps the time of its tween when it is reverted and re-split, so a
 * heading that has already risen stays risen, and one that has not still waits for its scroll trigger.
 */
const splits: Array<{ split: SplitText; vars: SplitText.Vars }> = []
onBeforeLangChange(() => splits.forEach((s) => s.split.revert()))
onLangChange(() => splits.forEach((s) => s.split.split(s.vars)))

/** SplitText.create, remembered so the language switch can undo and redo it. */
function splitText(el: HTMLElement, vars: SplitText.Vars): SplitText {
  const split = SplitText.create(el, vars)
  splits.push({ split, vars })
  return split
}

export function initReveals(reducedMotion: boolean): void {
  initCounters(reducedMotion)
  if (reducedMotion) return

  for (const el of document.querySelectorAll<HTMLElement>('[data-reveal="lines"], [data-reveal="chars"]')) {
    const chars = el.dataset.reveal === 'chars'
    // Paragraph text must stay readable: only headings get SplitText's aria-label treatment.
    const heading = /^H[1-6]$/.test(el.tagName)
    splitText(el, {
      type: chars ? 'lines,chars' : 'lines',
      mask: 'lines',
      linesClass: 'split-line',
      autoSplit: true,
      aria: heading ? 'auto' : 'none',
      onSplit(self) {
        const targets = chars ? self.chars : self.lines
        return gsap.from(targets, {
          // Characters start a little lower: their boxes are shorter (line-height 0.86), and the mask now reaches below the baseline.
          yPercent: chars ? 130 : 110,
          rotate: chars ? 4 : 0,
          duration: chars ? 1.1 : 1.0,
          ease: 'expo.out',
          stagger: chars ? 0.018 : 0.09,
          scrollTrigger: { trigger: el, start: 'top 86%', once: true },
        })
      },
    })
  }

  for (const el of document.querySelectorAll<HTMLElement>('[data-reveal="fade"]')) {
    gsap.from(el, {
      opacity: 0,
      y: 28,
      duration: 1.0,
      ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    })
  }

  for (const group of document.querySelectorAll<HTMLElement>('[data-stagger]')) {
    gsap.from(group.children, {
      opacity: 0,
      y: 32,
      duration: 0.9,
      ease: 'expo.out',
      stagger: 0.08,
      scrollTrigger: { trigger: group, start: 'top 85%', once: true },
    })
  }

  // Keyboard users may reach content before scrolling to it: finish its reveal at once.
  // Only one-shot reveals qualify. Scrubbed tweens (the pinned chapters' exit fade, the research build)
  // belong to the scroll position: forcing one to its end hides or finishes the chapter that was just
  // focused (every nav jump focuses its target section), and nothing resets it until the scroll moves.
  document.addEventListener('focusin', (e) => {
    const target = e.target as Node
    for (const st of ScrollTrigger.getAll()) {
      if (!st.vars.once) continue
      const trigger = st.trigger as Element | undefined
      if (trigger && trigger.contains(target) && st.animation && st.animation.progress() < 1) st.animation.progress(1)
    }
  })
}

/** Count-ups animate visible digits only; assistive tech always reads the final value. */
function initCounters(reducedMotion: boolean): void {
  const counters: Array<{ el: HTMLElement; to: number; shown: HTMLElement; spoken: HTMLElement; state: { v: number } }> = []
  for (const el of document.querySelectorAll<HTMLElement>('[data-count-to]')) {
    const to = Number(el.dataset.countTo)
    const final = formatCount(el, to)
    const shown = document.createElement('span')
    shown.setAttribute('aria-hidden', 'true')
    const spoken = document.createElement('span')
    spoken.className = 'sr-only'
    spoken.textContent = final
    el.replaceChildren(shown, spoken)
    const state = { v: reducedMotion ? to : 0 }
    counters.push({ el, to, shown, spoken, state })
    if (reducedMotion) {
      shown.textContent = final
      continue
    }
    shown.textContent = formatCount(el, 0)
    gsap.to(state, {
      v: to,
      duration: 1.8,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      onUpdate: () => {
        shown.textContent = formatCount(el, state.v)
      },
    })
  }
  // The number format (and the % suffix, an attribute the language switch rewrites) follows the language.
  onLangChange(() => {
    for (const c of counters) {
      c.spoken.textContent = formatCount(c.el, c.to)
      c.shown.textContent = formatCount(c.el, c.state.v)
    }
  })
}

export function formatCount(el: HTMLElement, v: number): string {
  const decimals = Number(el.dataset.decimals ?? 0)
  return `${el.dataset.prefix ?? ''}${fmt.num(v, decimals)}${el.dataset.suffix ?? ''}`
}

/**
 * Shows the hero headline. After the ignition swarm has drawn it in particles, the DOM
 * headline simply fades in on top (no second rise); without the swarm it rises by character.
 */
export function revealHeadline(el: HTMLElement, reducedMotion: boolean, afterSwarm: boolean): Promise<void> {
  if (reducedMotion) {
    el.style.opacity = '1'
    return Promise.resolve()
  }
  if (afterSwarm) return new Promise((resolve) => void gsap.to(el, { opacity: 1, duration: 0.55, ease: 'power2.out', onComplete: () => resolve() }))
  el.style.opacity = '1'
  return new Promise((resolve) => {
    splitText(el, {
      type: 'lines,chars',
      mask: 'lines',
      linesClass: 'split-line',
      onSplit(self) {
        return gsap.from(self.chars, { yPercent: 130, rotate: 4, duration: 1.1, ease: 'expo.out', stagger: 0.022, onComplete: () => resolve() })
      },
    })
  })
}

/**
 * Closing call to action: the moment the title itself scrolls into view (its top at 88% of the viewport) the
 * particle swarm converges into it, the real (accessible) DOM title fades in on top and the particles dissolve
 * behind it, so the visitor watches the letters form. Runs once; scrolling away and back simply shows the
 * title. The caller has hidden the title (opacity 0) and prepared the swarm. `onShown` is called once the real
 * title is showing for good (it starts the hover lens, which must not touch a title that is still animating).
 */
export function initClosingTitle(director: Director, title: HTMLElement, onShown?: () => void): void {
  const closing = director.closing
  const section = title.closest<HTMLElement>('section')
  if (!closing) {
    title.style.opacity = '1'
    onShown?.()
    return
  }
  let started = false
  const assemble = () => {
    if (started) return
    started = true
    section?.classList.add('is-assembling') // eases the scrims off, so the swarm shows through
    void (async () => {
      try {
        await Promise.race([closing.assemble(1.7), new Promise((r) => setTimeout(r, 4500))])
        await revealHeadline(title, false, true)
      } catch (err) {
        console.warn('Closing title assembly skipped.', err)
      } finally {
        title.style.opacity = '1' // whatever happened, the real title ends up showing
        closing.handOver()
        window.setTimeout(() => section?.classList.remove('is-assembling'), 600)
        onShown?.()
      }
    })()
  }
  ScrollTrigger.create({
    trigger: title,
    start: 'top 88%',
    onEnter: assemble,
    // A jump that lands beyond the title (End key, a footer link) never sees it arrive: show the finished title.
    onLeave: () => {
      if (started) return
      started = true
      title.style.opacity = '1'
      onShown?.()
    },
  })
}

/** Hero eyebrow, lead and actions follow the headline in a short stagger. */
export function revealHeroRest(reducedMotion: boolean): void {
  const items = [...document.querySelectorAll<HTMLElement>('.hero-seq')]
  if (reducedMotion) {
    for (const el of items) el.style.opacity = '1'
    return
  }
  gsap.fromTo(items, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08 })
}
