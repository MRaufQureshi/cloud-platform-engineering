import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { clearMotionOptIn, hasMotionOptIn, saveMotionOptIn } from './motionPref.ts'

// The module reads localStorage, sessionStorage and name from globalThis, so each test installs its own.
const saved = new Map<string, PropertyDescriptor | undefined>()
function stub(name: string, descriptor: PropertyDescriptor): void {
  if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, { configurable: true, ...descriptor })
}
afterEach(() => {
  for (const [name, d] of saved) {
    if (d) Object.defineProperty(globalThis, name, d)
    else Reflect.deleteProperty(globalThis, name)
  }
  saved.clear()
})

function memoryStorage() {
  const m = new Map<string, string>()
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}
/** A sandboxed iframe: merely touching the storage object throws. */
const blocked = { get() { throw new Error('SecurityError') } }
const windowName = (value = '') => ({ value, writable: true })
const currentName = () => (globalThis as unknown as { name: string }).name

test('the opt-in goes to localStorage and reads back', () => {
  const local = memoryStorage()
  stub('localStorage', { value: local })
  stub('sessionStorage', { value: memoryStorage() })
  stub('name', windowName())
  assert.equal(hasMotionOptIn(), false)
  assert.equal(saveMotionOptIn(), true)
  assert.equal(local.m.get('theo-motion'), 'full')
  assert.equal(hasMotionOptIn(), true)
  assert.equal(clearMotionOptIn(), true)
  assert.equal(local.m.size, 0)
})

test('sessionStorage takes over when localStorage is blocked', () => {
  const session = memoryStorage()
  stub('localStorage', blocked)
  stub('sessionStorage', { value: session })
  stub('name', windowName())
  assert.equal(saveMotionOptIn(), true)
  assert.equal(session.m.get('theo-motion'), 'full')
  assert.equal(currentName(), '', 'window.name is only the last resort')
})

test('a write that does not read back is not trusted', () => {
  const forgetful = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  const session = memoryStorage()
  stub('localStorage', { value: forgetful })
  stub('sessionStorage', { value: session })
  stub('name', windowName())
  assert.equal(saveMotionOptIn(), true)
  assert.equal(session.m.get('theo-motion'), 'full')
})

test('window.name keeps a token next to whatever the host stored there', () => {
  stub('localStorage', blocked)
  stub('sessionStorage', blocked)
  stub('name', windowName('viewer-frame'))
  assert.equal(hasMotionOptIn(), false)
  assert.equal(saveMotionOptIn(), true)
  assert.equal(currentName(), 'viewer-frame;theo-motion=full')
  assert.equal(hasMotionOptIn(), true)
  assert.equal(saveMotionOptIn(), true)
  assert.equal(currentName(), 'viewer-frame;theo-motion=full', 'saving twice adds one token')
  assert.equal(clearMotionOptIn(), true)
  assert.equal(currentName(), 'viewer-frame')
})

test('the token is matched whole, not as part of another name', () => {
  stub('localStorage', blocked)
  stub('sessionStorage', blocked)
  stub('name', windowName('x-theo-motion=full'))
  assert.equal(hasMotionOptIn(), false)
  stub('name', windowName('theo-motion=full;other'))
  assert.equal(hasMotionOptIn(), true)
  assert.equal(clearMotionOptIn(), true)
  assert.equal(currentName(), 'other')
})

test('with nothing to store it in, saving reports failure so the page does not reload', () => {
  stub('localStorage', blocked)
  stub('sessionStorage', blocked)
  stub('name', { get: () => '', set: () => {} })
  assert.equal(saveMotionOptIn(), false)
  assert.equal(hasMotionOptIn(), false)
})
