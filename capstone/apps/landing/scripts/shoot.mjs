// Headless Chrome screenshots with real (Metal-backed) WebGL.
// usage: node scripts/shoot.mjs <url> <outDir> [--mobile] [--positions=0,0.25,1 | --chapter=day:0.1,0.5] [--wait=1200]
//        [--frames=N --interval=100] [--prefix=name] [--width=1440 --height=900] [--dpr=2]
// The page may expose window.__scrollToProgress(p) for an instant jump (Lenis-safe);
// otherwise window.scrollTo is used. Console errors are written to <outDir>/console.log.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const [url, outDir = 'shots'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const opt = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=')
    return [k, v ?? true]
  }),
)
if (!url) {
  console.error('usage: node scripts/shoot.mjs <url> <outDir> [--mobile] [--positions=0,0.5] [--frames=N]')
  process.exit(1)
}
const mobile = Boolean(opt.mobile)
const viewport = mobile
  ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { width: Number(opt.width ?? 1440), height: Number(opt.height ?? 900), deviceScaleFactor: Number(opt.dpr ?? 1) }
// --chapter=day:0.1,0.2 → positions inside one chapter (uses window.__scrollToChapter)
const chapter = opt.chapter ? String(opt.chapter).split(':')[0] : null
const positions = String(chapter ? String(opt.chapter).split(':')[1] : (opt.positions ?? '0')).split(',').map(Number)
const wait = Number(opt.wait ?? 1200)
const frames = Number(opt.frames ?? 0)
const interval = Number(opt.interval ?? 100)
const prefix = String(opt.prefix ?? (mobile ? 'm' : 'd'))
fs.mkdirSync(outDir, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: viewport,
})
const logs = []
try {
  const page = await browser.newPage()
  if (mobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warn') logs.push(`[${m.type()}] ${m.text()}`)
  })
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  await page.waitForFunction(() => window.__ready === true, { timeout: 30000 }).catch(() => logs.push('[shoot] __ready timeout'))
  await new Promise((r) => setTimeout(r, 600))
  const written = []
  for (const p of positions) {
    await page.evaluate((p, chapter) => {
      if (chapter && typeof window.__scrollToChapter === 'function') return window.__scrollToChapter(chapter, p)
      if (typeof window.__scrollToProgress === 'function') return window.__scrollToProgress(p)
      const max = document.documentElement.scrollHeight - innerHeight
      window.scrollTo(0, Math.round(max * p))
    }, p, chapter)
    await new Promise((r) => setTimeout(r, wait))
    const tag = String(Math.round(p * 1000)).padStart(4, '0')
    if (frames > 0) {
      for (let i = 0; i < frames; i++) {
        const file = path.join(outDir, `${prefix}-${tag}-f${String(i).padStart(2, '0')}.png`)
        await page.screenshot({ path: file })
        written.push(file)
        await new Promise((r) => setTimeout(r, interval))
      }
    } else {
      const file = path.join(outDir, `${prefix}-${tag}.png`)
      await page.screenshot({ path: file })
      written.push(file)
    }
  }
  console.log(written.join('\n'))
} finally {
  fs.writeFileSync(path.join(outDir, `console-${prefix}.log`), logs.join('\n') + '\n')
  if (logs.length) console.log(`${logs.length} console warnings/errors → ${path.join(outDir, `console-${prefix}.log`)}`)
  await browser.close().catch(() => {})
  // A lingering GPU/IPC handle can keep Node alive after close; screenshots are on disk.
  setTimeout(() => process.exit(0), 200).unref()
}
