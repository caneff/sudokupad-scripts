// Takes docs/research/site-digit-color.png, the homepage's Digit Color picture: a close crop of the
// sample puzzle with four entered digits in different colors, corner and centre marks in their
// digit colors, and one conflicting corner 3 (a given 3 shares its box) with its red circle, the
// mascot hidden. Run from the repo root: node docs/research/digit-color-site-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../digit-color.user.js', import.meta.url), 'utf8')
const out = new URL('./site-digit-color.png', import.meta.url).pathname

// [row, column, digits entered there in the current mode], 0-based. None but the corner 3 at
// (1, 2) shares a row, column or box with the same digit.
const DIGITS = [[0, 2, '4'], [0, 3, '6'], [1, 1, '2'], [3, 1, '1']]
const CORNER = [[1, 2, '73'], [0, 5, '28']]
const CENTRE = [[2, 3, '23'], [2, 5, '4']]

const browser = await chromium.launch()
// A large viewport makes the cells, and so the marks, bigger in the crop.
const page = await (await browser.newContext({ viewport: { width: 1800, height: 1400 } })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.addScriptTag({ content: script })
await page.locator('#digit-color-style').waitFor({ state: 'attached' })

const center = (row, col) => page.evaluate(([row, col]) => {
  const r = Framework.app.puzzle.cells.find((c) => c.row === row && c.col === col).elem.getBoundingClientRect()
  return [r.x + r.width / 2, r.y + r.height / 2]
}, [row, col])
const fill = async (list) => {
  for (const [row, col, digits] of list) {
    const [x, y] = await center(row, col)
    await page.mouse.click(x, y)
    for (const d of digits) await page.keyboard.press(d)
  }
}
await fill(DIGITS.map(([r, c, d]) => [r, c, d]))
await page.click('#control-corner')
await fill(CORNER)
await page.click('#control-centre')
await fill(CENTRE)
await page.click('#control-normal')
await page.evaluate(() => Framework.app.deselect())
await page.waitForTimeout(500)

const conflicts = await page.evaluate(() => document.querySelectorAll('#cell-pencilmarks .conflict, #cell-candidates .conflict').length)
const circles = await page.evaluate(() => document.querySelectorAll('#digit-color-circles circle').length)
if (conflicts !== 1 || circles !== 1) throw new Error(`want one conflicting mark and one circle, got ${conflicts} and ${circles}`)
const gone = await page.evaluate(() => getComputedStyle(document.querySelector('#svenpeek')).display)
if (gone !== 'none') throw new Error(`mascot still shown: ${gone}`)
// Rows 0-2, columns 1-5.
const box = await page.evaluate(() => {
  const rect = (r, c) => Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).elem.getBoundingClientRect()
  const a = rect(0, 1)
  const b = rect(2, 5)
  return { x: a.x, y: a.y, width: b.right - a.x, height: b.bottom - a.y }
})
await page.screenshot({ path: out, clip: box })
await browser.close()
