// Takes docs/research/site/site-pen-tool-extras-details.png (900 px wide):
// site/pen-tool-extras.html. The page's raw.githubusercontent.com images come from this checkout, since a branch is not on main yet.
// Run from the repo root: node docs/research/site/site-pen-tool-extras-details-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const RAW = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/'
const root = new URL('../../../', import.meta.url)
const browser = await chromium.launch()
for (const [width, file] of [[900, 'site-pen-tool-extras-details.png']]) {
  const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage()
  await page.route(RAW + '**', (r) => r.fulfill({ body: readFileSync(new URL(r.request().url().slice(RAW.length), root)), contentType: r.request().url().endsWith('.gif') ? 'image/gif' : 'image/png' }))
  await page.goto(new URL('site/pen-tool-extras.html', root).href, { waitUntil: 'load' })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 0) throw new Error(`the page overflows by ${overflow}px at ${width}px`)
  await page.screenshot({ path: new URL('docs/research/site/' + file, root).pathname, fullPage: true })
  await page.close()
}
await browser.close()
