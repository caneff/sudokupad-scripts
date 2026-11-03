// Takes docs/research/dark-page.png, the homepage's picture of Dark Page: ChinStrap's Speed Stripes
// as it opens (link in dark-page-puzzle-url.txt), 1200x900 viewport, mascot hidden. Run from the repo root:
// node docs/research/dark-page-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('./dark-page-puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../dark-page.user.js', import.meta.url), 'utf8')
const out = new URL('./dark-page.png', import.meta.url).pathname

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length > 0)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.addScriptTag({ content: script })
await page.locator('#dark-page-style').waitFor({ state: 'attached' })
await page.waitForTimeout(500)
const shown = await page.evaluate(() => getComputedStyle(document.querySelector('#svenpeek')).display)
if (shown !== 'none') throw new Error(`mascot still shown: ${shown}`)
await page.screenshot({ path: out })
await browser.close()
