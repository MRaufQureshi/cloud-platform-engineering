// Language state and the DOM swap. English is the default and lives in index.html; German comes from
// de.ts (static copy, keyed by data-i18n) and strings.ts (text that scripts generate).
//
// Markup conventions:
//   data-i18n="key"                  innerHTML of this element is swapped (German from de.ts)
//   data-i18n-attr="attr:key;…"      attributes are swapped (aria-label, placeholder, data-label, data-suffix …)
//   data-t="key"                     textContent from strings.ts (for markup that scripts create)
//   data-t-attr="attr:key;…"         attributes from strings.ts
//
// Changing language is live (no reload). Anything that keeps its own copy of the text (SplitText line
// splits, count-ups, the rail, the 3D headline particles, the simulator) subscribes:
//   onBeforeLangChange  runs while the old language is still on the page: undo splits and the like
//   onLangChange        runs after the new language is on the page: measure, split and draw again
// Hooks run in the order they were added.
//
// The site always opens in English. A visitor's own choice is remembered (localStorage "theo-lang"),
// and ?lang=de|en overrides it for one visit (handy for QA); the browser's language is never consulted.

import { BRAND } from '../config.ts'
import { DE } from './de.ts'
import { eur, num, pct, LANGS, type Lang } from './format.ts'
import { translate, type Params, type StringKey } from './strings.ts'

export type { Lang }

const STORE_KEY = 'theo-lang'

let current: Lang = 'en'
let started = false
const beforeHooks: Array<(next: Lang) => void> = []
const afterHooks: Array<(lang: Lang) => void> = []

// What index.html said, captured before anything else touches the DOM.
const englishHtml = new Map<HTMLElement, string>()
const englishAttrs = new Map<HTMLElement, Record<string, string | null>>()
let englishTitle = ''
let englishDescription = ''

export const getLang = (): Lang => current

/** A string.ts entry in the current language; `{brand}` is always available. */
export function t(key: StringKey, params?: Params): string {
  return translate(current, key, { brand: BRAND, ...params })
}

/** Number formatting in the current language. */
export const fmt = {
  num: (v: number, min = 0, max = min) => num(current, v, min, max),
  eur: (v: number, decimals = 0) => eur(current, v, decimals),
  pct: (n: number, decimals = 0) => pct(current, n, decimals),
}

export function onBeforeLangChange(cb: (next: Lang) => void): void {
  beforeHooks.push(cb)
}

export function onLangChange(cb: (lang: Lang) => void): void {
  afterHooks.push(cb)
}

function parseAttrSpec(spec: string | undefined): Array<[attr: string, key: string]> {
  return (spec ?? '')
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf(':')
      return [pair.slice(0, i), pair.slice(i + 1)] as [string, string]
    })
}

const metaDescription = () => document.querySelector<HTMLMetaElement>('meta[name="description"]')

function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v)
}

/** ?lang= for this visit, else the visitor's saved choice, else English. */
function requested(): Lang {
  try {
    const q = new URLSearchParams(location.search).get('lang')
    if (isLang(q)) return q
  } catch {
    /* no location */
  }
  try {
    const saved = localStorage.getItem(STORE_KEY)
    if (isLang(saved)) return saved
  } catch {
    /* storage unavailable */
  }
  return 'en'
}

function remember(lang: Lang): void {
  try {
    localStorage.setItem(STORE_KEY, lang)
  } catch {
    /* the choice lasts for this visit */
  }
}

/** Puts `lang` on the page: html lang, head, every keyed element. Runs no hooks. */
function paint(lang: Lang): void {
  current = lang
  document.documentElement.lang = lang
  document.title = lang === 'en' ? englishTitle : (DE['meta.title'] ?? englishTitle)
  const meta = metaDescription()
  if (meta) meta.content = lang === 'en' ? englishDescription : (DE['meta.description'] ?? englishDescription)

  for (const [el, html] of englishHtml) {
    const key = el.dataset.i18n ?? ''
    el.innerHTML = lang === 'en' ? html : (DE[key] ?? html)
  }
  for (const [el, saved] of englishAttrs) {
    for (const [attr, key] of parseAttrSpec(el.dataset.i18nAttr)) {
      const value = lang === 'en' ? saved[attr] : (DE[key] ?? saved[attr])
      if (value === null || value === undefined) el.removeAttribute(attr)
      else el.setAttribute(attr, value)
    }
  }
  translateTree(document)
}

/** Fills the data-t / data-t-attr elements (markup built by scripts) under `root`. */
export function translateTree(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-t]')) el.textContent = t(el.dataset.t as StringKey)
  for (const el of root.querySelectorAll<HTMLElement>('[data-t-attr]')) {
    for (const [attr, key] of parseAttrSpec(el.dataset.tAttr)) el.setAttribute(attr, t(key as StringKey))
  }
}

/** Call once, first thing at boot: remembers the English page, then shows the visitor's language. */
export function initLang(): void {
  if (started) return
  started = true
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) englishHtml.set(el, el.innerHTML)
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    const saved: Record<string, string | null> = {}
    for (const [attr] of parseAttrSpec(el.dataset.i18nAttr)) saved[attr] = el.getAttribute(attr)
    englishAttrs.set(el, saved)
  }
  englishTitle = document.title
  englishDescription = metaDescription()?.content ?? ''
  const wanted = requested()
  if (wanted !== 'en') paint(wanted) // nothing has subscribed yet, and nothing has been split or measured
}

const guarded = (name: string, fn: () => void) => {
  try {
    fn()
  } catch (err) {
    console.error(`Language ${name} hook failed.`, err)
  }
}

/** Switches the page language live. `persist: false` is for scripted changes (QA hooks). */
export function setLang(lang: Lang, persist = true): void {
  if (lang === current) return
  for (const cb of beforeHooks) guarded('before', () => cb(lang))
  paint(lang)
  if (persist) remember(lang)
  for (const cb of afterHooks) guarded('after', () => cb(lang))
}
