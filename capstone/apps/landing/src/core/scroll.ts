// Smooth scrolling (Lenis) wired into GSAP's ticker and ScrollTrigger. With reduced motion
// the page keeps native scrolling and jumps instead of gliding.
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export interface Scroll {
  lenis: Lenis | null
  scrollTo(target: string | number | HTMLElement, opts?: { immediate?: boolean; offset?: number }): void
  /** Jump to a fraction (0–1) of the document height. */
  scrollToProgress(p: number, immediate?: boolean): void
  stop(): void
  start(): void
}

export function initScroll(reducedMotion: boolean): Scroll {
  if (reducedMotion) {
    const behavior: ScrollBehavior = 'auto'
    return {
      lenis: null,
      scrollTo(target, opts) {
        const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target
        const top = typeof el === 'number' ? el : el ? el.getBoundingClientRect().top + scrollY + (opts?.offset ?? 0) : 0
        scrollTo({ top, behavior })
      },
      scrollToProgress(p) {
        scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * p, behavior })
      },
      stop() {
        document.documentElement.style.overflow = 'hidden'
      },
      start() {
        document.documentElement.style.overflow = ''
      },
    }
  }

  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, touchMultiplier: 1.3 })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)

  return {
    lenis,
    scrollTo(target, opts) {
      lenis.scrollTo(target, { immediate: opts?.immediate, offset: opts?.offset ?? 0, duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) })
    },
    scrollToProgress(p, immediate = true) {
      lenis.scrollTo((document.documentElement.scrollHeight - innerHeight) * p, { immediate, force: true })
      ScrollTrigger.update()
    },
    stop: () => lenis.stop(),
    start: () => lenis.start(),
  }
}
