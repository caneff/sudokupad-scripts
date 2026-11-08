// Probe for #544: what the page shows between navigation and Dark Page's first paint, and how long.
// Run from the repo root: node docs/research/dark-page/load-flash-probe.mjs [--network] [--color #223344]
// Installs dark-page.user.js into a real Tampermonkey (live/tampermonkey), loads the puzzle page, and records
// (a) an in-page requestAnimationFrame log of the page's colors and (b) CDP screencast frames, whose center-top
// pixel is read back. Results print as JSON lines. Findings: load-flash.md.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { launchTampermonkey, installScript, serveFiles } from '../../../live/tampermonkey/tampermonkey.mjs'
import { newPage, PUZZLE_URL } from '../../../live/page.mjs'

const args = process.argv.slice(2)
const network = args.includes('--network')
const color = args.includes('--color') ? args[args.indexOf('--color') + 1] : null
const out = fileURLToPath(new URL('./load-flash-frames/', import.meta.url))
mkdirSync(out, { recursive: true })
const src = readFileSync(fileURLToPath(new URL('../../../dark-page.user.js', import.meta.url)), 'utf8')
// Optionally rewrite the header to another @run-at, to probe a candidate fix without editing the script.
const runAt = args.includes('--run-at') ? args[args.indexOf('--run-at') + 1] : null
const text = runAt ? src.replace(/@run-at\s+\S+/, `@run-at       ${runAt}`) : src

const tm = await launchTampermonkey()
const served = await serveFiles({ 'dark-page.user.js': text })
try {
  console.log('install:', await installScript(tm, served.url + 'dark-page.user.js'))
  const ctx = tm.context
  const { p } = network ? { p: await ctx.newPage() } : await newPage(ctx)
  await p.addInitScript((saved) => {
    if (saved) localStorage.setItem('svencodes_DarkPage_color', saved)
    const log = (window.__log = [])
    const t0 = performance.now()
    const snap = (why) => {
      const h = document.documentElement; const b = document.body
      log.push({ t: Math.round(performance.now() - t0), why, rs: document.readyState,
        html: getComputedStyle(h).backgroundColor, body: b ? getComputedStyle(b).backgroundColor : null,
        board: !!document.getElementById('svgrenderer'), style: !!document.getElementById('dark-page-style'),
        fw: typeof Framework })
    }
    const tick = () => { snap('raf'); if (log.length < 4000) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    new PerformanceObserver((l) => l.getEntries().forEach((e) => log.push({ t: Math.round(e.startTime), paint: e.name }))).observe({ type: 'paint', buffered: true })
  }, color)
  const cdp = await ctx.newCDPSession(p)
  const frames = []
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ ts: f.metadata.timestamp, data: f.data })
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
  const started = Date.now()
  await p.goto(PUZZLE_URL, { waitUntil: 'load', timeout: 60000 })
  await p.waitForTimeout(3000)
  await cdp.send('Page.stopScreencast')
  const log = await p.evaluate(() => window.__log)
  writeFileSync(out + 'log.json', JSON.stringify(log))
  const t0 = frames[0]?.ts
  frames.forEach((f, i) => writeFileSync(`${out}f${String(i).padStart(3, '0')}.png`, Buffer.from(f.data, 'base64')))
  writeFileSync(out + 'times.json', JSON.stringify(frames.map((f) => Math.round((f.ts - t0) * 1000))))
  console.log(`frames: ${frames.length}, log: ${log.length}, ${Date.now() - started} ms`)
} finally {
  await served.close()
  await tm.close()
}
