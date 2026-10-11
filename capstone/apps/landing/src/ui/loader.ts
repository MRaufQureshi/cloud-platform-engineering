// Intro loader: a battery ring charges to 100% while fonts load and shaders compile, then
// the overlay opens with a circular wipe onto the first rendered frame.
import { gsap } from 'gsap'

export interface Loader {
  /** Report real progress 0–1; the display eases towards it. */
  progress(p: number): void
  /** Completes the count, plays the exit and resolves when the page is revealed.
   *  `onOpen` runs as the overlay starts to open, so the next moment can begin under it. */
  finish(onOpen?: () => void): Promise<void>
}

export function createLoader(root: HTMLElement, reducedMotion: boolean): Loader {
  const count = root.querySelector<HTMLElement>('[data-loader-count]')
  const ring = root.querySelector<SVGCircleElement>('[data-loader-ring]')
  const state = { shown: 0, target: 0 }
  const circumference = ring ? 2 * Math.PI * Number(ring.getAttribute('r')) : 0
  if (ring) {
    ring.style.strokeDasharray = `${circumference}`
    ring.style.strokeDashoffset = `${circumference}`
  }
  const render = () => {
    const v = Math.round(state.shown * 100)
    if (count) count.textContent = String(v).padStart(3, '0')
    if (ring) ring.style.strokeDashoffset = `${circumference * (1 - state.shown)}`
    root.setAttribute('aria-valuenow', String(v))
  }
  const tween = gsap.to(state, { shown: 0, duration: 0.01 })
  const started = performance.now()

  return {
    progress(p) {
      state.target = Math.max(state.target, Math.min(p, 1))
      tween.kill()
      gsap.to(state, { shown: state.target * 0.98, duration: 0.8, ease: 'power2.out', onUpdate: render, overwrite: true })
    },
    async finish(onOpen) {
      // Keep the intro on screen long enough to read as a moment, not a flash.
      const minMs = reducedMotion ? 0 : 700
      const wait = Math.max(0, minMs - (performance.now() - started))
      await new Promise((r) => setTimeout(r, wait))
      await gsap.to(state, { shown: 1, duration: reducedMotion ? 0 : 0.6, ease: 'power3.inOut', onUpdate: render, overwrite: true })
      root.setAttribute('aria-busy', 'false')
      if (reducedMotion) {
        root.remove()
        onOpen?.()
        return
      }
      const tl = gsap.timeline()
      tl.call(() => onOpen?.(), [], 0.3)
      tl.to(root.querySelector('.loader-inner'), { scale: 0.92, autoAlpha: 0, duration: 0.5, ease: 'power3.in' })
      tl.fromTo(
        root,
        { clipPath: 'circle(150% at 50% 50%)' },
        { clipPath: 'circle(0% at 50% 50%)', duration: 1.1, ease: 'expo.inOut' },
        '-=0.15',
      )
      await tl
      root.remove()
    },
  }
}
