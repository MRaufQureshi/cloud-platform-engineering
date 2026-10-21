// Top-bar language switch. The button names the language it switches to, in that language
// ("Deutsch" while the page is English, "English" while it is German), and carries that language in its
// own lang attribute so a screen reader pronounces it right. The visible text is the short code.
import { getLang, onLangChange, setLang, type Lang } from '../i18n/lang.ts'

const NAME: Record<Lang, string> = { en: 'English', de: 'Deutsch' }

export function initLangToggle(): void {
  const btn = document.getElementById('lang-toggle') as HTMLButtonElement | null
  const code = btn?.querySelector<HTMLElement>('span')
  if (!btn || !code) return
  const paint = (lang: Lang) => {
    const target: Lang = lang === 'en' ? 'de' : 'en'
    code.textContent = target.toUpperCase()
    btn.lang = target
    btn.setAttribute('aria-label', NAME[target])
    btn.dataset.tip = NAME[target] // the tooltip pill, like the other top-bar toggles
  }
  btn.addEventListener('click', () => setLang(getLang() === 'en' ? 'de' : 'en'))
  onLangChange(paint)
  paint(getLang())
}
