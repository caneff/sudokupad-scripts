// Takes docs/research/pen-color-match.png: on the default first color page, a pen stroke in
// each of the nine derived pen colors (cols 2-4) beside a cell in the matching cell color
// (col 7), one row per color, the mascot hidden. Run from the repo root: node docs/research/pen-color-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../pen-color.user.js', import.meta.url), 'utf8')
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.addScriptTag({ content: script })
await page.locator('#pen-color-style').waitFor({ state: 'attached' })
await page.evaluate(() => Framework.setSetting('toolpen', true))
await page.locator('#control-pen').waitFor({ state: 'visible' })
const shown = () => page.locator('.tool-pen button[data-key="1"]').isVisible()
for (let i = 0; i < 20 && !(await shown()); i++) { await page.click('#control-pen'); await page.waitForTimeout(300) }

const center = (row, col) => page.evaluate(([row, col]) => {
  const cell = Framework.app.puzzle.cells.find((c) => c.row === row && c.col === col)
  const r = cell.elem.getBoundingClientRect()
  return [r.x + r.width / 2, r.y + r.height / 2]
}, [row, col])

for (let k = 1; k <= 9; k++) {
  await page.locator(`.tool-pen button[data-key="${k}"]`).click()
  const [x1, y] = await center(k - 1, 1)
  const [x2] = await center(k - 1, 3)
  await page.mouse.move(x1, y)
  await page.mouse.down()
  await page.mouse.move(x2, y, { steps: 10 })
  await page.mouse.up()
}
// Cell colors: key k colors the cell in row k - 1, column 6 (0-based).
await page.evaluate(() => {
  const app = Framework.app
  for (let k = 1; k <= 9; k++) {
    app.deselect()
    app.select([app.puzzle.cells.find((c) => c.row === k - 1 && c.col === 6)])
    app.act({ type: 'colour', arg: String(k) })
  }
  app.deselect()
})
await page.waitForTimeout(500)
const box = await page.locator('#svgrenderer').boundingBox()
await page.screenshot({ path: new URL('./pen-color-match.png', import.meta.url).pathname, clip: box })
await browser.close()
