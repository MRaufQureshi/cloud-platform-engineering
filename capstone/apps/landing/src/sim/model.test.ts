import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PEAK_EUR_KWH, PRICE_EUR_KWH } from './model.ts'

test('the sample tariff is a typical day on a 0.5 ct grid', () => {
  assert.equal(PRICE_EUR_KWH.length, 24)
  for (const p of PRICE_EUR_KWH) assert.ok(Math.abs(p * 200 - Math.round(p * 200)) < 1e-9, `${p} is not a multiple of 0.5 ct`)
  const mean = PRICE_EUR_KWH.reduce((a, b) => a + b, 0) / 24
  assert.ok(Math.abs(mean - 0.315) < 0.005, `mean ${mean}`)
  assert.equal(Math.min(...PRICE_EUR_KWH), 0.275)
  assert.equal(Math.max(...PRICE_EUR_KWH), 0.37)
})

test('the peak threshold picks the evening peak and the morning hour that costs as much', () => {
  const peak = PRICE_EUR_KWH.flatMap((p, h) => (p >= PEAK_EUR_KWH ? [h] : []))
  assert.deepEqual(peak, [8, 18, 19, 20])
})
