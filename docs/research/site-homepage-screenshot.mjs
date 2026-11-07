// Takes docs/research/site-homepage-desktop.png and checks site/index.html at desktop width (1280),
// light and dark: no horizontal scroll, every image loaded, and every Install
// button at the same offset from its entry's left edge. The page's
// raw.githubusercontent.com images come from this checkout, since a branch is not on main yet.
// The dark one goes to $SHOTS, else /tmp.
// Run from the repo root: node docs/research/site-homepage-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const RAW = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/'
const root = new URL('../../', import.meta.url)
const browser = await chromium.launch()
for (const [name, width] of [['desktop', 1280]]) {
  for (const scheme of ['light', 'dark']) {
    const page = await (await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme })).newPage()
    await page.route(RAW + '**', (r) => r.fulfill({ body: readFileSync(new URL(r.request().url().slice(RAW.length), root)), contentType: 'image/png' }))
    await page.goto(new URL('site/index.html', root).href, { waitUntil: 'load' })
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      broken: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
      offsets: [...new Set([...document.querySelectorAll('section .install')].map((a) => a.getBoundingClientRect().left - a.closest('section').getBoundingClientRect().left))]
    }))
    if (m.scroll > 0 || m.broken > 0 || m.offsets.length !== 1) throw new Error(`${name} ${scheme}: ${JSON.stringify(m)}`)
    const out = scheme === 'light' && name === 'desktop' ? new URL('./site-homepage-desktop.png', import.meta.url).pathname : `${process.env.SHOTS || '/tmp'}/site-${name}-${scheme}.png`
    await page.screenshot({ path: out, fullPage: true })
    console.log(name, scheme, JSON.stringify(m))
  }
}
await browser.close()
