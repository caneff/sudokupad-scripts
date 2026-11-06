// Takes the Pen Tool Extras pictures in docs/research/, the mascot hidden:
//   (the homepage picture, site-pen-tool-extras.png, now comes from site-pen-tool-extras-screenshot.mjs)
//                                    marks (X, arrows, circle) in several pen colors, at the defaults
//   pen-tool-extras-dialog.png       the merged settings dialog, its thickness slider at the default 5
//   pen-tool-extras-thin.png         the same drawing at thickness 2
//   pen-tool-extras-thick.png        the same drawing at thickness 11
// The thin and thick pictures are the dialog's live preview, taken before Cancel.
// Run from the repo root: node docs/research/pen-tool-extras-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')
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
// A click 2 px inside a cell, next to one side, is an edge click; each further click on the same
// edge steps through X, two arrows, a circle.
const edgePoint = async (row, col, side) => {
  const e = await rect(row, col)
  return { right: [e.x + e.width - 2, e.y + e.height / 2], bottom: [e.x + e.width / 2, e.y + e.height - 2] }[side]
}
const pick = (key) => page.locator(`.tool-pen button[data-key="${key}"]`).click()

// Lines: one drag across columns 0-3 in each of rows 0-5, pen colors 4-9 (the first three
// derived colors are greys).
for (let k = 1; k <= 6; k++) {
  await pick(k + 3)
  const a = await rect(k - 1, 0)
  const b = await rect(k - 1, 3)
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
  await page.mouse.up()
}
// Marks on the right of the lines: [row, col, side, clicks, pen color button]
const MARKS = [
  [0, 5, 'right', 1, 9], [1, 5, 'right', 2, 8], [2, 5, 'right', 3, 6],
  [3, 5, 'right', 4, 7], [4, 5, 'bottom', 2, 5], [5, 5, 'bottom', 3, 4]
]
for (const [row, col, side, clicks, key] of MARKS) {
  await pick(key)
  const [x, y] = await edgePoint(row, col, side)
  for (let i = 0; i < clicks; i++) { await page.mouse.click(x, y); await page.waitForTimeout(150) }
}
await page.waitForTimeout(500)
const gone = await page.evaluate(() => getComputedStyle(document.querySelector('#svenpeek')).display)
if (gone !== 'none') throw new Error(`mascot still shown: ${gone}`)
const block = async () => {
  const a = await rect(0, 0)
  const b = await rect(5, 6)
  const margin = 12
  return { x: a.x, y: a.y, width: b.x + b.width - a.x + margin, height: b.y + b.height - a.y + margin }
}

const openDialog = async () => {
  await page.click('#control-settings')
  const group = page.locator('.dialog .setting-group').filter({ has: page.locator('label', { hasText: 'Experimental' }) })
  await group.waitFor({ state: 'visible' })
  if (await page.locator('.dialog .setting-group:not(.closed)').filter({ has: page.locator('label', { hasText: 'Experimental' }) }).count() === 0) await group.locator('label').first().click()
  await page.locator('.dialog button').filter({ hasText: 'Pen Tool Extras' }).first().click()
  await page.locator('#pen-tool-extras-editor').waitFor({ state: 'visible' })
}
const slide = (value) => page.locator('#pen-tool-extras-thickness')
  .evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })) }, value)

await openDialog()
await page.locator('.dialog').screenshot({ path: out('pen-tool-extras-dialog.png') })
// The dialog sits over the board, so its preview is shown by moving the pointer-free overlay
// away: only the board is cropped, from a page screenshot taken with the dialog hidden.
const hideDialog = () => page.addStyleTag({ content: '.dialog, .dialog-overlay, .modal { visibility: hidden !important }' })
await hideDialog()
for (const [name, thickness] of [['thin', 2], ['thick', 11]]) {
  await slide(thickness)
  await page.waitForTimeout(300)
  await page.screenshot({ path: out(`pen-tool-extras-${name}.png`), clip: await block() })
}
await browser.close()
