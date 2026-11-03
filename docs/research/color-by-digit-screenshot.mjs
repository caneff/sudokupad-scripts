// Takes docs/research/site-color-by-digit.png: the sample puzzle's grid after one press of the
// Color by digit button with its default groups, the mascot hidden. Run from the repo root:
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
// SudokuPad binds the button's handler a moment after it appears: click until a cell is colored.
const colored = () => page.evaluate(() => [...document.querySelectorAll('#svgrenderer .cell-colour, #svgrenderer [class*="cell-colo"]')].length)
for (let i = 0; i < 20 && (await colored()) === 0; i++) { await page.click('#control-colorbydigit'); await page.waitForTimeout(400) }
if ((await colored()) === 0) throw new Error('no cell got a color')
await page.waitForTimeout(500)
const box = await page.locator('#svgrenderer').boundingBox()
await page.screenshot({ path: out, clip: box })
await browser.close()
