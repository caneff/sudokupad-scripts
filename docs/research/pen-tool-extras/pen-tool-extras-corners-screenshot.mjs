// Takes the Pen Tool Extras grid-corner mark pictures in docs/research/, the mascot hidden:
//   pen-tool-extras-corners-grid.png    inner and outer grid corners marked with X and circles in several pen
//                                       colors, one edge mark and one cell mark beside them
//   pen-tool-extras-corners-dialog.png  the settings dialog with its Corner marks boxes
// Every mark is made with a real mouse click at a grid corner's pixel.
// Run from the repo root: node docs/research/pen-tool-extras/pen-tool-extras-corners-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const out = (name) => new URL(`./${name}`, import.meta.url).pathname

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
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
// The page point of the grid corner [row, col], 0 to 9.
const cornerPoint = async (row, col) => {
  const e = await rect(Math.min(row, 8), Math.min(col, 8))
  return [e.x + (col > 8 ? e.width : 0), e.y + (row > 8 ? e.height : 0)]
}
const pick = (key) => page.locator(`.tool-pen button[data-key="${key}"]`).click()

// [row, col, clicks, pen color button]: 1 click is the X, 2 the circle.
const CORNERS = [
  [0, 0, 1, 4], [0, 9, 2, 6], [9, 0, 2, 9], [9, 9, 1, 5], [0, 4, 1, 8],
  [3, 3, 1, 4], [3, 6, 2, 6], [6, 3, 2, 9], [6, 6, 1, 5], [4, 0, 2, 4], [9, 5, 1, 6]
]
for (const [row, col, clicks, key] of CORNERS) {
  await pick(key)
  const [x, y] = await cornerPoint(row, col)
  for (let i = 0; i < clicks; i++) { await page.mouse.click(x, y); await page.waitForTimeout(150) }
}
// An edge mark and a cell mark for comparison.
await pick(1)
const edge = await rect(4, 4)
await page.mouse.click(edge.x + edge.width - 2, edge.y + edge.height / 2)
await page.mouse.click(edge.x + edge.width / 2, edge.y + edge.height / 2)
await page.waitForTimeout(500)
const gone = await page.evaluate(() => getComputedStyle(document.querySelector('#svenpeek')).display)
if (gone !== 'none') throw new Error(`mascot still shown: ${gone}`)
const first = await rect(0, 0)
const last = await rect(8, 8)
const margin = 16
await page.screenshot({
  path: out('pen-tool-extras-corners-grid.png'),
  clip: { x: first.x - margin, y: first.y - margin, width: last.x + last.width - first.x + 2 * margin, height: last.y + last.height - first.y + 2 * margin }
})

await page.click('#control-settings')
const group = page.locator('.dialog .setting-group').filter({ has: page.locator('label', { hasText: 'Experimental' }) })
await group.waitFor({ state: 'visible' })
if (await page.locator('.dialog .setting-group:not(.closed)').filter({ has: page.locator('label', { hasText: 'Experimental' }) }).count() === 0) await group.locator('label').first().click()
await page.locator('.dialog button').filter({ hasText: 'Pen Tool Extras' }).first().click()
await page.locator('#pen-tool-extras-editor').waitFor({ state: 'visible' })
await page.locator('.dialog').screenshot({ path: out('pen-tool-extras-corners-dialog.png') })
await browser.close()
