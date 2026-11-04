// Takes docs/research/pen-tool-extras-example.png, the picture on site/pen-tool-extras.html: one puzzle grid on
// sudokupad.app with pen-tool-extras.user.js injected, at the default thickness, marked with every kind of line
// (solid, dotted and chevron, in several colors) and every mark (edge X, direction arrows and circle, corner X and
// circle), all on empty cells' lines and edges so no mark covers a digit. Every line is a real mouse drag and every
// mark a real click, the way a player makes them. The mascot is hidden.
// Run from the repo root with Playwright's Chromium installed: node docs/research/pen-tool-extras-example-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const out = new URL('./pen-tool-extras-example.png', import.meta.url).pathname

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.addScriptTag({ content: script })
await page.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
await page.evaluate(() => Framework.setSetting('toolpen', true))
await page.locator('#control-pen').waitFor({ state: 'visible' })
const shown = () => page.locator('.tool-pen button[data-key="1"]').isVisible()
for (let i = 0; i < 20 && !(await shown()); i++) { await page.click('#control-pen'); await page.waitForTimeout(300) }

const rect = (row, col) => page.evaluate(([r, c]) => {
  const e = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).elem.getBoundingClientRect()
  return { x: e.x, y: e.y, width: e.width, height: e.height }
}, [row, col])
const first = await rect(0, 0)
const cell = (await rect(1, 1)).x - first.x
// The page point of grid position (row, col) in cell units: a cell's center is at +0.5, a grid corner is whole.
const at = (row, col) => [first.x + col * cell, first.y + row * cell]
const pick = (key) => page.locator(`.tool-pen button[data-key="${key}"]`).click()
// The page button cycles page 1, 2, 3 and back to 1.
const pageButton = page.locator('.pen-tool-extras-page')
await pageButton.waitFor()
const drag = async (points) => {
  await page.mouse.move(...at(...points[0]))
  await page.mouse.down()
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = at(...points[i - 1])
    const [x1, y1] = at(...points[i])
    for (let k = 1; k <= 14; k++) await page.mouse.move(x0 + (x1 - x0) * k / 14, y0 + (y1 - y0) * k / 14)
  }
  await page.mouse.up()
}
const mode = (m) => page.evaluate((v) => { ToolPen.tool.lineMode = v }, m)

// Page 1: solid lines. Pen 4 is green, 7 red.
await mode('centeronly')
await pick(4); await drag([[2.5, 3.5], [2.5, 6.5]])
await pick(7); await drag([[3.5, 1.5], [5.5, 1.5]])
// Page 2: dotted lines. Pen 9 is blue, 5 purple.
await pageButton.click()
await pick(9); await drag([[6.5, 2.5], [6.5, 5.5]])
await pick(5); await drag([[3.5, 7.5], [5.5, 7.5]])
// Page 3: chevron lines, one dragged each way. Pen 6 is orange, 5 purple.
await pageButton.click()
await pick(6); await drag([[0.5, 6.5], [0.5, 8.5], [2.5, 8.5]])
await pick(5); await drag([[8.5, 3.5], [8.5, 0.5]])

// Marks are pen clicks near an edge or corner; back on page 1 so each takes its pen's solid color.
await pageButton.click()
// [row, col, side, clicks, pen]: a click near a cell's side marks that edge; 1 click is the X, 2 and 3 the two arrows, 4 the circle.
const EDGES = [[1, 1, 'right', 1, 9], [4, 5, 'right', 2, 4], [4, 5, 'bottom', 3, 7], [7, 7, 'left', 4, 6], [0, 2, 'bottom', 1, 5]]
for (const [row, col, side, clicks, key] of EDGES) {
  await pick(key)
  const e = await rect(row, col)
  const [x, y] = { right: [e.x + e.width - 2, e.y + e.height / 2], left: [e.x + 2, e.y + e.height / 2], bottom: [e.x + e.width / 2, e.y + e.height - 2] }[side]
  for (let i = 0; i < clicks; i++) { await page.mouse.click(x, y); await page.waitForTimeout(150) }
}
// [row, col, clicks, pen]: a corner, 0 to 9; 1 click is the X, 2 the circle.
const CORNERS = [[0, 0, 1, 4], [0, 9, 2, 6], [9, 0, 2, 9], [9, 9, 1, 5], [3, 3, 2, 7], [6, 6, 1, 9]]
for (const [row, col, clicks, key] of CORNERS) {
  await pick(key)
  for (let i = 0; i < clicks; i++) { await page.mouse.click(...at(row, col)); await page.waitForTimeout(150) }
}
await page.mouse.move(5, 5)
await page.waitForTimeout(500)
const gone = await page.evaluate(() => getComputedStyle(document.querySelector('#svenpeek')).display)
if (gone !== 'none') throw new Error(`mascot still shown: ${gone}`)
const margin = 16
await page.screenshot({ path: out, clip: { x: first.x - margin, y: first.y - margin, width: cell * 9 + 2 * margin, height: cell * 9 + 2 * margin } })
await browser.close()
