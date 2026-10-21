// The German copy must stay a faithful twin of the English page: same keys, same markup, same citations,
// same numbers. These checks read index.html as text, so they need no DOM.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { DE } from './de.ts'
import { eur, NBSP, num, pct } from './format.ts'
import { simulateFleet } from '../sim/fleet.ts'
import { STRINGS, translate, type StringKey } from './strings.ts'

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

/** Collapses whitespace the way a browser does, so line wraps in index.html don't matter. */
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

interface Keyed {
  key: string
  tag: string
  inner: string
}

/** Every element carrying data-i18n, with its inner HTML (found by counting same-name tags). */
function keyedElements(source: string): Keyed[] {
  const out: Keyed[] = []
  const open = /<(\w+)\b[^>]*?\sdata-i18n="([^"]+)"[^>]*>/g
  for (let m = open.exec(source); m; m = open.exec(source)) {
    const tag = m[1]
    const start = open.lastIndex
    const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g')
    tags.lastIndex = start
    let depth = 1
    let end = -1
    for (let n = tags.exec(source); n; n = tags.exec(source)) {
      depth += n[1] ? -1 : 1
      if (depth === 0) {
        end = n.index
        break
      }
    }
    assert.ok(end > 0, `no closing </${tag}> for ${m[2]}`)
    out.push({ key: m[2], tag, inner: squash(source.slice(start, end)) })
  }
  return out
}

/** [attr, key] pairs from every data-i18n-attr. */
function attrKeys(source: string): Array<{ attr: string; key: string }> {
  const out: Array<{ attr: string; key: string }> = []
  for (const m of source.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of m[1].split(';')) {
      const i = pair.indexOf(':')
      out.push({ attr: pair.slice(0, i).trim(), key: pair.slice(i + 1).trim() })
    }
  }
  return out
}

const keyed = keyedElements(html)
const attrs = attrKeys(html)

/** Tags, in order, with the attributes that carry meaning (class, href, id): the markup's skeleton. */
function skeleton(fragment: string): string[] {
  return [...fragment.matchAll(/<\/?[a-z][^>]*>/gi)].map((m) => {
    const tag = m[0]
    const name = /^<\/?([a-z0-9]+)/i.exec(tag)?.[1] ?? ''
    if (tag.startsWith('</')) return `</${name}>`
    const pick = (attr: string) => new RegExp(`\\s${attr}="([^"]*)"`).exec(tag)?.[1]
    return [`<${name}`, pick('class') && `class=${pick('class')}`, pick('href') && `href=${pick('href')}`, pick('id') && `id=${pick('id')}`, tag.includes(' data-tip=') && 'tip']
      .filter(Boolean)
      .join(' ')
  })
}

/** Every number in a string as bare digits: "€1,095", "1.095 €" and "1095" all read 1095; "7.7" and "7,7" read 77. */
function digits(s: string): string[] {
  return (s.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').match(/\d+(?:[.,:]\d+)*/g) ?? []).map((n) => n.replace(/\D/g, '')).sort()
}

test('every data-i18n key in index.html has German copy, and none is left over', () => {
  const used = new Set([...keyed.map((k) => k.key), ...attrs.map((a) => a.key)])
  const missing = [...used].filter((k) => !(k in DE))
  assert.deepEqual(missing, [], `no German for: ${missing.join(', ')}`)
  const head = new Set(['meta.title', 'meta.description'])
  const unused = Object.keys(DE).filter((k) => !used.has(k) && !head.has(k))
  assert.deepEqual(unused, [], `German keys no element uses: ${unused.join(', ')}`)
})

test('keyed elements are not nested, so swapping one never destroys another', () => {
  const spans: Array<[number, number]> = []
  const open = /<(\w+)\b[^>]*?\sdata-i18n="([^"]+)"[^>]*>/g
  for (let m = open.exec(html); m; m = open.exec(html)) {
    const k = keyed.find((e) => e.key === m[2] && e.tag === m[1])
    assert.ok(k)
    spans.push([m.index, open.lastIndex + k.inner.length])
  }
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] >= spans[i - 1][0], 'document order')
  // an opening tag of a keyed element inside another keyed element's range would nest
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) assert.ok(spans[j][0] >= spans[i][1] - 1, `data-i18n elements ${i} and ${j} overlap`)
  }
})

test('one key means one English text wherever it is used', () => {
  const byKey = new Map<string, string>()
  for (const k of keyed) {
    const seen = byKey.get(k.key)
    if (seen === undefined) byKey.set(k.key, k.inner)
    else assert.equal(k.inner, seen, `${k.key} is used with different English text`)
  }
})

test('German copy keeps the markup of the English: tags, citations, tooltips and brand spans', () => {
  for (const { key, inner } of keyed) {
    assert.deepEqual(skeleton(squash(DE[key])), skeleton(inner), `markup of ${key} differs`)
  }
})

test('German copy keeps every number of the English', () => {
  for (const { key, inner } of keyed) {
    assert.deepEqual(digits(squash(DE[key])), digits(inner), `numbers in ${key} differ`)
  }
  for (const { attr, key } of attrs) {
    if (attr === 'data-label' || attr === 'data-suffix') continue
    const en = new RegExp(`${attr}="([^"]*)"[^>]*data-i18n-attr="[^"]*${key.replace(/\./g, '\\.')}`).exec(html)?.[1]
    if (en === undefined) continue
    assert.deepEqual(digits(DE[key]), digits(en), `numbers in ${key} (${attr}) differ`)
  }
})

test('T.H.E.O. stays T.H.E.O.: the name is never translated or spelled out', () => {
  // In page copy the name always sits in a .brand-mark span (which main.ts keeps in step with config.ts);
  // plain-text attributes and the document head may spell it out.
  for (const { key } of keyed) {
    const bare = DE[key].replace(/<span class="brand-mark">[^<]*<\/span>/g, '')
    assert.ok(!/T\.H\.E\.O/.test(bare), `${key} has the name outside a .brand-mark span`)
  }
  assert.match(DE['meta.title'], /^T\.H\.E\.O\./)
  assert.match(DE['meta.description'], /T\.H\.E\.O\. \(The Holistic Energy Orchestrator\)/)
})

test('illustrative numbers stay labelled: German copy that says "Simulation" says beispielhaft', () => {
  for (const key of ['day.note', 'fleet.note', 'vpp.note']) assert.match(DE[key], /[Bb]eispielhaft/, key)
  for (const key of ['sim.total', 'sim.caveat', 'sim.footnote', 'sim.status'] as const) assert.match(STRINGS.de[key], /[Bb]eispielhaft/, key)
})

test('string table: both languages use the same placeholders, and nothing is empty', () => {
  const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
  for (const key of Object.keys(STRINGS.en) as StringKey[]) {
    assert.ok(STRINGS.de[key].trim().length > 0, `${key} is empty in German`)
    assert.deepEqual(holes(STRINGS.de[key]), holes(STRINGS.en[key]), `${key}: placeholders differ`)
  }
  assert.deepEqual(Object.keys(STRINGS.de).sort(), Object.keys(STRINGS.en).sort())
})

test('translate fills placeholders and leaves unknown ones visible', () => {
  assert.equal(translate('en', 'rail.goto', { label: 'Fleets' }), 'Go to: Fleets')
  assert.equal(translate('de', 'rail.goto', { label: 'Flotten' }), 'Gehe zu: Flotten')
  assert.equal(translate('en', 'rail.goto', {}), 'Go to: {label}')
  assert.equal(translate('en', 'hud.with', { brand: 'T.H.E.O.' }), 'With T.H.E.O.')
  assert.equal(translate('de', 'hud.with', { brand: 'T.H.E.O.' }), 'Mit T.H.E.O.')
})

test('the English fleet reasons are the engine\'s own sentences, so nothing reads differently in English', () => {
  const r = simulateFleet()
  const seen = new Set<string>()
  for (const hour of r.hours) {
    for (const v of hour.vehicles) {
      seen.add(v.reasonKey)
      assert.equal(translate('en', `fleet.reason.${v.reasonKey}`, v.reasonArgs), v.reason)
      // German has a line for the same case, with every placeholder filled
      assert.doesNotMatch(translate('de', `fleet.reason.${v.reasonKey}`, v.reasonArgs), /\{\w+\}/)
    }
  }
  assert.ok(seen.size >= 5, `only ${[...seen].join(', ')} were exercised`)
})

test('number formats: English as before, German with comma, dot and spaced units', () => {
  assert.equal(num('en', 1234.5, 1), '1,234.5')
  assert.equal(num('de', 1234.5, 1), '1.234,5')
  assert.equal(eur('en', 1095), '€1,095')
  assert.equal(eur('de', 1095), `1.095${NBSP}€`)
  assert.equal(eur('en', 0.5, 2), '€0.50')
  assert.equal(eur('de', 0.5, 2), `0,50${NBSP}€`)
  assert.equal(pct('en', 40), '40%')
  assert.equal(pct('de', 40), `40${NBSP}%`)
  assert.equal(num('de', 4.5, 1), '4,5')
})
