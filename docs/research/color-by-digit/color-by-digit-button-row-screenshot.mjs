// Takes docs/research/color-by-digit/color-by-digit-button-row.png: the controls after Start Puzzle with Color by
// digit in the bottom row beside Undo, Redo, Check and Select. Run from the repo root:
// node docs/research/color-by-digit/color-by-digit-button-row-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const url = readFileSync(new URL('../../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../../color-by-digit.user.js', import.meta.url), 'utf8')
const out = new URL('./color-by-digit-button-row.png', import.meta.url).pathname

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addScriptTag({ content: script })
await page.locator('#control-colorbydigit').waitFor({ state: 'visible' })
// SudokuPad re-fits the controls on a throttle; wait for the row to stop moving.
let last = ''
let settled = false
for (let i = 0; i < 40 && !settled; i++) {
  await page.waitForTimeout(250)
  const now = JSON.stringify(await page.locator('.controls-aux').boundingBox())
  settled = now === last
  last = now
}
if (!settled) throw new Error('the controls were still moving after 10 s: ' + last)
writeFileSync(out, await page.locator('.controls').screenshot())
await browser.close()
