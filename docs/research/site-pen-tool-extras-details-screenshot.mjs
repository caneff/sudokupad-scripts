// Takes docs/research/site-pen-tool-extras-details.png (900 px wide) and site-pen-tool-extras-details-phone.png (390 px
// wide): site/pen-tool-extras.html. The page's raw.githubusercontent.com images come from this checkout, since a branch is not on main yet.
// Run from the repo root: node docs/research/site-pen-tool-extras-details-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const RAW = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/'
const root = new URL('../../', import.meta.url)
const browser = await chromium.launch()
for (const [width, file] of [[900, 'site-pen-tool-extras-details.png'], [390, 'site-pen-tool-extras-details-phone.png']]) {
  const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage()
  await page.route(RAW + '**', (r) => r.fulfill({ body: readFileSync(new URL(r.request().url().slice(RAW.length), root)), contentType: 'image/png' }))
  await page.goto(new URL('site/pen-tool-extras.html', root).href, { waitUntil: 'load' })
  await page.screenshot({ path: new URL('docs/research/' + file, root).pathname, fullPage: true })
  await page.close()
}
await browser.close()
