// Custom cursor: a dot that tracks the pointer and a ring that lags behind it. The ring
// grows over interactive elements and can show a short label (data-cursor="Drag").
// Disabled for touch input and reduced motion; the native cursor stays available.
import { gsap } from 'gsap'

export function initCursor(reducedMotion: boolean): void {
  if (reducedMotion || matchMedia('(pointer: coarse)').matches) return
  const dot = document.createElement('div')
  const ring = document.createElement('div')
  dot.className = 'cursor-dot'
  ring.className = 'cursor-ring'
  ring.innerHTML = '<span class="cursor-label"></span>'
  dot.setAttribute('aria-hidden', 'true')
  ring.setAttribute('aria-hidden', 'true')
  document.body.append(dot, ring)
  document.documentElement.classList.add('has-cursor', 'cursor-out')
  const label = ring.querySelector('.cursor-label') as HTMLElement

  const dx = gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'power3' })
  const dy = gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'power3' })
  const rx = gsap.quickTo(ring, 'x', { duration: 0.42, ease: 'power3' })
  const ry = gsap.quickTo(ring, 'y', { duration: 0.42, ease: 'power3' })

  addEventListener('pointermove', (e) => {
    document.documentElement.classList.remove('cursor-out')
    dx(e.clientX)
    dy(e.clientY)
    rx(e.clientX)
    ry(e.clientY)
  })
  addEventListener('pointerdown', () => ring.classList.add('is-down'))
  addEventListener('pointerup', () => ring.classList.remove('is-down'))
  document.addEventListener('pointerleave', () => document.documentElement.classList.add('cursor-out'))
  document.addEventListener('pointerenter', () => document.documentElement.classList.remove('cursor-out'))

  const interactive = 'a, button, [role="button"], input, select, label, [data-cursor]'
  document.addEventListener('pointerover', (e) => {
    const el = (e.target as Element).closest<HTMLElement>(interactive)
    ring.classList.toggle('is-hover', Boolean(el))
    const text = el?.dataset.cursor ?? ''
    label.textContent = text
    ring.classList.toggle('has-label', Boolean(text))
  })
}
