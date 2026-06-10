#!/usr/bin/env node
/* prepack.mjs — generate app.packed.json from app.json + .env.<mode>
 *
 * Why this exists:
 *   1. The Even App WebView blocks every network call to a domain not
 *      listed in app.json `permissions[name=network].whitelist`. With
 *      an empty whitelist, our SSE connection to the relay server fails
 *      silently on device (works fine in dev because vite proxies it).
 *   2. We ship two builds — personal (David's box) and company (Even's
 *      hosted relay) — each pointing at a different origin. The
 *      whitelist must match the VITE_SERVER_URL that vite baked into
 *      the JS bundle, so deriving both from one env file keeps them
 *      from drifting.
 *
 * Flow (run AFTER `vite build --mode <mode>`, BEFORE `evenhub pack`):
 *   - load .env.<mode>           → reads VITE_SERVER_URL
 *   - assert URL is HTTPS         (App rejects http://)
 *   - assert dist/index.html      (catch missing vite build step)
 *   - read app.json template      (committed, no whitelist)
 *   - write app.packed.json       (gitignored, whitelist filled in)
 *   - evenhub pack uses app.packed.json
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name) {
  const eq = process.argv.find(a => a.startsWith(`--${name}=`))
  if (eq) return eq.slice(name.length + 3)
  const ix = process.argv.indexOf(`--${name}`)
  return ix !== -1 ? process.argv[ix + 1] : undefined
}

const mode = arg('mode')
if (!mode) {
  console.error('prepack: --mode is required (personal | company)')
  process.exit(1)
}

const envFile = join(ROOT, `.env.${mode}`)
if (!existsSync(envFile)) {
  console.error(`prepack: ${envFile} not found.`)
  console.error(`prepack: copy .env.${mode}.example → .env.${mode} and fill in VITE_SERVER_URL.`)
  process.exit(1)
}

const env = {}
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  if (line.trim().startsWith('#') || !line.includes('=')) continue
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}

const url = env.VITE_SERVER_URL
if (!url) {
  console.error(`prepack: VITE_SERVER_URL missing in ${envFile}`)
  process.exit(1)
}
if (!/^https:\/\//i.test(url)) {
  console.error(`prepack: VITE_SERVER_URL must be HTTPS (got "${url}"). The Even App rejects http:// origins in production builds.`)
  process.exit(1)
}

let origin
try {
  origin = new URL(url).origin
} catch {
  console.error(`prepack: VITE_SERVER_URL is not a valid URL: "${url}"`)
  process.exit(1)
}

const distHtml = join(ROOT, 'dist', 'index.html')
if (!existsSync(distHtml)) {
  console.error(`prepack: dist/index.html missing — run "npm run build:${mode}" first.`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'))
manifest.permissions = [
  {
    name: 'network',
    desc: 'Streams live World Cup match updates from the relay server over Server-Sent Events.',
    whitelist: [origin],
  },
]

const outPath = join(ROOT, 'app.packed.json')
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n')

console.log(`prepack: ${mode} → whitelist [${origin}] → app.packed.json`)
