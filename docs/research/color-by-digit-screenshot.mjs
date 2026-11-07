// Takes docs/research/site-color-by-digit.png: the sample puzzle's grid on a fresh install, which starts in Cell
// and colors the givens by its active profile, Low/5/High, the mascot hidden. Run from the repo root:
// node docs/research/color-by-digit-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')
const out = new URL('./site-color-by-digit.png', import.meta.url).pathname

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.addScriptTag({ content: script })
await page.locator('#control-colorbydigit').waitFor({ state: 'visible' })
// Throws when no cell is colored within the timeout.
await page.waitForFunction(() => document.querySelectorAll('#svgrenderer .cell-colour, #svgrenderer [class*="cell-colo"]').length > 0, null, { timeout: 10000 })
await page.waitForTimeout(500)
const box = await page.locator('#svgrenderer').boundingBox()
await page.screenshot({ path: out, clip: box })
await browser.close()
