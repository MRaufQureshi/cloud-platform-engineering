// Turns the Vite build (dist/) into a claude.ai Artifact page: the artifact host supplies the
// document skeleton, so the page is the head's title/meta/links/scripts followed by the
// body's content, with no <!doctype>, <html>, <head> or <body> tags of its own. Assets stay
// as relative files published next to the page.
// usage: npm run build && node scripts/artifact-page.mjs [title]
import fs from 'node:fs'
import path from 'node:path'

const dist = path.resolve('dist')
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const title = process.argv[2]

const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? ''
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? ''

const keep = head
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !/^<meta (charset|name="viewport")/i.test(l))
  .join('\n')
  .replace(/<title>[\s\S]*?<\/title>/i, (t) => (title ? `<title>${title}</title>` : t))

const page = `${keep}\n${body.trim()}\n`
const out = path.join(dist, 'artifact.html')
fs.writeFileSync(out, page)

const files = fs.readdirSync(path.join(dist, 'assets')).map((f) => `assets/${f}`)
for (const f of fs.readdirSync(dist)) if (/\.(svg|png|ico)$/.test(f)) files.push(f)
console.log(JSON.stringify({ page: out, files }, null, 1))
