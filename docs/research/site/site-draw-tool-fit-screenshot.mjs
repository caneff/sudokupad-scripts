// Takes the Draw Tool details page's slideshow at 1280x720 (the frame only):
// docs/research/site/site-draw-tool-fit-after.png from this checkout, and site-draw-tool-fit-before.png from the checkout
// whose root is given as the first argument (a worktree of the commit before the fit fix).
// Run from the repo root: node docs/research/site/site-draw-tool-fit-screenshot.mjs [<root of the "before" checkout>]
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const RAW = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/'
const here = new URL('../../../', import.meta.url)
const before = process.argv[2] && pathToFileURL(resolve(process.argv[2]) + '/')
const browser = await chromium.launch()
// The commit before the fit fix still names the page draw-tool.html.
for (const [root, file, details] of [[before, 'site-draw-tool-fit-before.png', 'draw-tool.html'], [here, 'site-draw-tool-fit-after.png', 'text-anywhere.html']]) {
  if (!root) continue
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
  await page.route(RAW + '**', (r) => r.fulfill({ body: readFileSync(new URL(r.request().url().slice(RAW.length).replace(/\?.*$/, ''), here)), contentType: 'image/png' }))
  await page.goto(new URL('site/' + details, root).href, { waitUntil: 'load' })
  await page.locator('.slide-frame').screenshot({ path: fileURLToPath(new URL('docs/research/site/' + file, here)) })
  await page.close()
}
await browser.close()
