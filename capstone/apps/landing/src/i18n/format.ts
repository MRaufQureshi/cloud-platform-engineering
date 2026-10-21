// Locale-aware number formatting. Pure (no DOM), so the tests can run it under Node.
// English keeps the formats the site always had (€1,234 · 12.5 · 40%); German uses the
// German conventions (1.234 € · 12,5 · 40 %), with a no-break space before € and %.

export type Lang = 'en' | 'de'

export const LANGS: readonly Lang[] = ['en', 'de']

export const LOCALE: Record<Lang, string> = { en: 'en-GB', de: 'de-DE' }

export const NBSP = ' '

/** 1,234.5 (en) or 1.234,5 (de), with between `min` and `max` decimals. */
export function num(lang: Lang, v: number, min = 0, max = min): string {
  return v.toLocaleString(LOCALE[lang], { minimumFractionDigits: min, maximumFractionDigits: max })
}

/** €1,234 (en) or 1.234 € (de). */
export function eur(lang: Lang, v: number, decimals = 0): string {
  const n = num(lang, v, decimals)
  return lang === 'en' ? `€${n}` : `${n}${NBSP}€`
}

/** 40% (en) or 40 % (de). `n` is the number as shown, not a fraction. */
export function pct(lang: Lang, n: number, decimals = 0): string {
  return `${num(lang, n, decimals)}${lang === 'en' ? '' : NBSP}%`
}

/** The suffix a count-up appends to its number ("%" or "&nbsp;%"). */
export function pctSuffix(lang: Lang): string {
  return lang === 'en' ? '%' : `${NBSP}%`
}
