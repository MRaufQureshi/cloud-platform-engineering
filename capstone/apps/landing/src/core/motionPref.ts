// The visitor's opt-in to full motion on a device that asks for less.
//
// The site honours `prefers-reduced-motion` by default. That setting is often on without the visitor knowing
// it (Windows "Show animations" off, remote desktops, virtual machines), and a page cannot show where it comes
// from. So the visitor can opt in, and the choice is kept as `theo-motion=full`.
//
// A locked-down embedding frame (a sandboxed iframe) throws on any storage access, so the choice goes to the
// first of these that holds it: localStorage, sessionStorage, then a token in window.name, which survives a
// reload of the same frame. window.name is the last resort because it is shared with the host page's use of it;
// the token is appended to, and removed from, whatever else the name holds.

const KEY = 'theo-motion'
const FULL = 'full'
const TOKEN = `${KEY}=${FULL}`
const TOKEN_RE = new RegExp(`(^|;)${TOKEN}(?=;|$)`)

interface WebStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
type Store = 'local' | 'session' | 'name'
const STORES: readonly Store[] = ['local', 'session', 'name']

// Read through globalThis so a throwing getter (sandboxed frame) lands inside the try blocks below.
const env = globalThis as unknown as { localStorage?: WebStorage; sessionStorage?: WebStorage; name?: string }

const webStorage = (store: 'local' | 'session'): WebStorage | undefined => (store === 'local' ? env.localStorage : env.sessionStorage)

function read(store: Store): boolean {
  try {
    if (store === 'name') return TOKEN_RE.test(env.name ?? '')
    return webStorage(store)?.getItem(KEY) === FULL
  } catch {
    return false
  }
}

function write(store: Store): void {
  if (store === 'name') {
    const name = env.name ?? ''
    if (!TOKEN_RE.test(name)) env.name = name ? `${name};${TOKEN}` : TOKEN
  } else {
    webStorage(store)?.setItem(KEY, FULL)
  }
}

function remove(store: Store): void {
  try {
    if (store === 'name') env.name = (env.name ?? '').replace(TOKEN_RE, '').replace(/^;/, '')
    else webStorage(store)?.removeItem(KEY)
  } catch {
    /* unavailable: nothing to remove */
  }
}

/** True when the visitor has opted in to full motion. */
export function hasMotionOptIn(): boolean {
  return STORES.some(read)
}

/** Remember the opt-in in the first store that holds it. True only if it reads back, so a reload can rely on it. */
export function saveMotionOptIn(): boolean {
  for (const store of STORES) {
    try {
      write(store)
      if (read(store)) return true
    } catch {
      /* this store is blocked: try the next one */
    }
    remove(store)
  }
  return false
}

/** Forget the opt-in everywhere. True when nothing reads back any more. */
export function clearMotionOptIn(): boolean {
  for (const store of STORES) remove(store)
  return !hasMotionOptIn()
}
