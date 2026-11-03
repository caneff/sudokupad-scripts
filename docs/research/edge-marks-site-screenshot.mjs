// Takes docs/research/site-edge-marks.png, the homepage's Edge Marks picture: a block of the sample puzzle's grid with Edge Marks' four
// marks (X, two arrows, dot) drawn on cell edges in several pen colors, the mascot hidden.
// Run from the repo root: node docs/research/edge-marks-site-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../edge-marks.user.js', import.meta.url), 'utf8')
const out = new URL('./site-edge-marks.png', import.meta.url).pathname

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.addScriptTag({ content: script })
await page.locator('style#edge-marks-style').waitFor({ state: 'attached' })
await page.evaluate(() => Framework.setSetting('toolpen', true))
await page.locator('#control-pen').waitFor({ state: 'visible' })
const shown = () => page.locator('.tool-pen button[data-key="1"]').isVisible()
for (let i = 0; i < 20 && !(await shown()); i++) { await page.click('#control-pen'); await page.waitForTimeout(300) }

// A click 2 px inside a cell, next to one side, is an edge click; each further click on the same
// edge steps through X, two arrows, a dot.
const edgePoint = (row, col, side) => page.evaluate(([r, c, s]) => {
  const e = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).elem.getBoundingClientRect()
  return { right: [e.x + e.width - 2, e.y + e.height / 2], bottom: [e.x + e.width / 2, e.y + e.height - 2] }[s]
}, [row, col, side])
// [row, col, side, clicks, pen color button]
const MARKS = [
  [1, 1, 'right', 1, 4], [1, 4, 'bottom', 1, 1], [2, 2, 'right', 2, 2], [2, 4, 'right', 3, 3],
  [3, 1, 'bottom', 2, 6], [3, 3, 'bottom', 4, 5], [4, 1, 'right', 3, 7], [4, 4, 'bottom', 4, 8],
  [4, 3, 'right', 1, 9], [5, 2, 'right', 2, 4], [2, 1, 'bottom', 3, 1], [5, 5, 'right', 4, 2]
]
for (const [row, col, side, clicks, key] of MARKS) {
  await page.locator(`.tool-pen button[data-key="${key}"]`).click()
  const [x, y] = await edgePoint(row, col, side)
  for (let i = 0; i < clicks; i++) { await page.mouse.click(x, y); await page.waitForTimeout(150) }
}
await page.waitForTimeout(500)
const gone = await page.evaluate(() => getComputedStyle(document.querySelector('#svenpeek')).display)
if (gone !== 'none') throw new Error(`mascot still shown: ${gone}`)
// Crop to the block of cells the marks sit in, so the small marks stay readable.
const box = await page.evaluate(() => {
  const rect = (r, c) => Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).elem.getBoundingClientRect()
  const a = rect(1, 1)
  const b = rect(5, 5)
  // A margin past the last cell keeps a mark on its right edge whole.
  const margin = 12
  return { x: a.x, y: a.y, width: b.right - a.x + margin, height: b.bottom - a.y + margin }
})
await page.screenshot({ path: out, clip: box })
await browser.close()
