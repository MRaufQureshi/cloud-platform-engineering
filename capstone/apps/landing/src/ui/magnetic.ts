// Magnetic hover: [data-magnetic] elements drift toward the pointer (strength in px via
// data-magnetic="14") and spring back on leave.
import { gsap } from 'gsap'

export function initMagnetic(reducedMotion: boolean): void {
  if (reducedMotion || matchMedia('(pointer: coarse)').matches) return
  for (const el of document.querySelectorAll<HTMLElement>('[data-magnetic]')) {
    const strength = Number(el.dataset.magnetic || 12)
    const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.45)' })
    const y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.45)' })
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect()
      x(((e.clientX - r.left) / r.width - 0.5) * strength * 2)
      y(((e.clientY - r.top) / r.height - 0.5) * strength * 2)
    })
    el.addEventListener('pointerleave', () => {
      x(0)
      y(0)
    })
  }
}
