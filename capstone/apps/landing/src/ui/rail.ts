// Chapter navigation built from every [data-chapter] section:
//  - the right-side rail (as in the reference): one tick per chapter, the active one drawn
//    as a ring; its label shows on hover or keyboard focus;
//  - a "Chapters" menu for narrow screens, where the rail and the top nav are hidden.
// Both scroll to the chapter and move keyboard focus into it.
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { Scroll } from '../core/scroll.ts'
import { onLangChange, t } from '../i18n/lang.ts'

export function initRail(rail: HTMLElement, scroll: Scroll): void {
  const sections = [...document.querySelectorAll<HTMLElement>('[data-chapter]')]
  const go = (sec: HTMLElement) => {
    scroll.scrollTo(sec)
    sec.setAttribute('tabindex', '-1')
    sec.focus({ preventScroll: true })
  }

  // Chapter names come from data-label, which the language switch rewrites; relabel() reads them again.
  const labelOf = (sec: HTMLElement, i: number) => sec.dataset.label ?? t('rail.chapter', { n: i + 1 })
  const list = document.createElement('ol')
  const ticks = sections.map((sec) => {
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'rail-tick'
    btn.innerHTML = `<span class="rail-label"></span><span class="rail-dot" aria-hidden="true"></span>`
    btn.addEventListener('click', () => go(sec))
    li.append(btn)
    list.append(li)
    return btn
  })
  rail.append(list)

  // Narrow-screen menu
  const toggle = document.getElementById('menu-toggle') as HTMLButtonElement | null
  const menu = document.getElementById('chapter-menu')
  const links: HTMLAnchorElement[] = []
  if (toggle && menu) {
    const ol = document.createElement('ol')
    sections.forEach((sec, i) => {
      const li = document.createElement('li')
      const a = document.createElement('a')
      a.href = `#${sec.id}`
      a.innerHTML = `<span class="mono">${String(i).padStart(2, '0')}</span><span class="menu-label"></span>`
      a.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        close()
        go(sec)
      })
      li.append(a)
      ol.append(li)
      links.push(a)
    })
    menu.append(ol)
    const open = () => {
      menu.hidden = false
      toggle.setAttribute('aria-expanded', 'true')
      links.find((l) => l.getAttribute('aria-current') === 'true')?.focus() ?? links[0]?.focus()
    }
    const close = () => {
      menu.hidden = true
      toggle.setAttribute('aria-expanded', 'false')
    }
    toggle.addEventListener('click', () => (menu.hidden ? open() : close()))
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) {
        close()
        toggle.focus()
      }
    })
    document.addEventListener('pointerdown', (e) => {
      if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== toggle) close()
    })
  }

  const relabel = () => {
    sections.forEach((sec, i) => {
      const label = labelOf(sec, i)
      const tick = ticks[i]
      const text = tick.querySelector('.rail-label')
      if (text) text.textContent = label
      tick.setAttribute('aria-label', t('rail.goto', { label }))
      const menuText = links[i]?.querySelector('.menu-label')
      if (menuText) menuText.textContent = sec.dataset.label ?? sec.id
    })
  }
  relabel()
  onLangChange(relabel)

  const setActive = (i: number) => {
    ticks.forEach((b, j) => {
      b.classList.toggle('is-active', i === j)
      if (i === j) b.setAttribute('aria-current', 'step')
      else b.removeAttribute('aria-current')
    })
    links.forEach((a, j) => a.setAttribute('aria-current', String(i === j)))
  }
  sections.forEach((sec, i) => {
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (self) => self.isActive && setActive(i),
    })
  })
  setActive(0)
}
