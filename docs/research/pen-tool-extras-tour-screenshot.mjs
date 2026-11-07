// Takes docs/research/pen-tool-extras-tour.gif, the tour animation at the top of site/pen-tool-extras.html, from the real script on the
// live page, on a blank grid. Each frame is the board patch in use beside the pen panel, cropped tight, with a caption under the board:
//   1. a pen color recolored through edit mode: a hold on its button, the color set from the script with the picker's own input event
//      (the browser's color dialog is drawn by the operating system and is not shown), the button and the line recoloring, a second hold
//   2. a solid line, a page turn with the page button and a dashed line, another turn and an arrow line
//   3. edge marks, then grid-corner marks, back on page 1
//   4. one middle click on the first line, which erases the whole of it
// Every line is a real drag, every mark a real click, every hold a real press; a red ring marks where a hold or the middle click lands,
// since a screenshot draws no pointer. The last state holds for 2.6 s. Needs python3 with Pillow for the GIF.
// Run from the repo root: node docs/research/pen-tool-extras-tour-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openPage, startPuzzle } from '../../live/page.mjs'
import { cellCentre, gridPoint, mouseDrag, openPenTool, PAGE_BUTTON } from '../../live/pen.mjs'
import { joinGif } from './gif-join.mjs'
import { holdPenButton, pickPenColor } from './pen-tool-extras-recolor.mjs'

const target = new URL('./pen-tool-extras-tour.gif', import.meta.url).pathname
const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const COLS = 5
const ROWS = 6
const MARGIN = 12
const CLICK_PAUSE_MS = 150
const SETTLE_MS = 400
const EDGE_INSET_PX = 2
const NEW_COLOR = '#00897b'
const RING = 'tour-ring'

const browser = await chromium.launch()
const { p } = await openPage(browser, { contextOptions: { deviceScaleFactor: 2 } })
await startPuzzle(p)
await p.evaluate(() => Framework.app.loadCompactClassicSudoku('0'.repeat(81)))
await p.waitForFunction(() => Framework.app.puzzle.cells.every((c) => !c.given))
await p.addStyleTag({ content: '#svenpeek { display: none !important }' })
await p.addScriptTag({ content: script })
await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
await p.evaluate(() => Framework.setSetting('toolpen', true))
await p.locator('#control-pen').waitFor({ state: 'visible' })
await openPenTool(p)
await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
await p.evaluate(() => { ToolPen.tool.lineMode = 'centeronly' })

const frames = mkdtempSync(join(tmpdir(), 'pte-tour-'))
const list = []
const [, , cell] = await cellCentre(p, 0, 0)
const [x0, y0] = await gridPoint(p, [0, 0])
const patch = { x: x0 - MARGIN, y: y0 - MARGIN, width: COLS * cell + 2 * MARGIN, height: ROWS * cell + 2 * MARGIN }
const panel = p.locator('.tool-pen .controls-input')
const frame = async (caption, ms) => {
  await p.waitForTimeout(SETTLE_MS)
  const i = list.length
  await p.screenshot({ path: join(frames, `${i}-board.png`), clip: patch })
  await panel.screenshot({ path: join(frames, `${i}-panel.png`) })
  list.push({ files: [join(frames, `${i}-board.png`), join(frames, `${i}-panel.png`)], caption, captionUnder: 0, ms })
}
const pick = (key) => p.locator(`.tool-pen button[data-key="${key}"]`).click()
const park = () => p.mouse.move(5, 5)
const ring = (x, y) => p.evaluate(([x, y, id]) => {
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('div')
    el.id = id
    el.style.cssText = 'position:fixed;width:34px;height:34px;border:4px solid #e53935;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:99999'
    document.body.appendChild(el)
  }
  el.style.left = x + 'px'
  el.style.top = y + 'px'
}, [x, y, RING])
const unring = () => p.evaluate((id) => document.getElementById(id)?.remove(), RING)
const buttonCentre = async (key) => {
  const b = await p.locator(`.tool-pen button[data-key="${key}"]`).boundingBox()
  return [b.x + b.width / 2, b.y + b.height / 2]
}
const holdWithRing = async (key) => {
  await ring(...await buttonCentre(key))
  await holdPenButton(p, key)
}
const line = async (key, points) => { await pick(key); await mouseDrag(p, points); await park() }
const turnPage = async () => { await p.locator(PAGE_BUTTON).click(); await park() }
const clickTimes = async (x, y, n) => { for (let i = 0; i < n; i++) { await p.mouse.click(x, y); await p.waitForTimeout(CLICK_PAUSE_MS) } }
const edgeClicks = async (row, col, side, n, key) => {
  await pick(key)
  const [cx, cy, w] = await cellCentre(p, row, col)
  const [x, y] = side === 'right' ? [cx + w / 2 - EDGE_INSET_PX, cy] : [cx, cy + w / 2 - EDGE_INSET_PX]
  await clickTimes(x, y, n)
}
const penCount = () => p.evaluate(() => Framework.app.puzzle.cells.reduce((n, c) => n + c.pen.length, 0))

// 1. Recolor pen 1 in edit mode.
await frame('The pen tool', 1000)
await line(1, [[0.5, 0.5], [0.5, 4.5]])
await frame('Draw a line', 1200)
await holdWithRing(1)
await frame('Hold a color button', 1600)
await pickPenColor(p, 1, NEW_COLOR)
await unring()
await frame('Pick a color', 1600)
await holdWithRing(1)
await unring()
await frame('Hold again to finish', 1200)

// 2. A solid line, then the page button turns to dashed and arrow lines.
await line(6, [[1.5, 0.5], [1.5, 4.5]])
await frame('A solid line', 1200)
await turnPage()
await frame('The page button', 1000)
await line(6, [[2.5, 0.5], [2.5, 4.5]])
await frame('A dashed line', 1200)
await turnPage()
await frame('Another page', 1000)
await line(6, [[3.5, 0.5], [3.5, 4.5]])
await frame('An arrow line', 1400)

// 3. Edge marks and grid-corner marks, on page 1 again.
await turnPage()
await edgeClicks(4, 0, 'right', 1, 9)
await edgeClicks(4, 1, 'bottom', 4, 6)
await edgeClicks(4, 3, 'right', 2, 4)
await park()
await frame('Edge marks', 1600)
await pick(5)
await clickTimes(...await gridPoint(p, [5, 1]), 1)
await pick(9)
await clickTimes(...await gridPoint(p, [5, 4]), 2)
await park()
await frame('Grid-corner marks', 1600)

// 4. One middle click erases the whole first line.
const before = await penCount()
const [lx, ly] = await gridPoint(p, [0.5, 2.5])
await ring(lx, ly)
await frame('Middle-click a line', 1200)
await p.mouse.click(lx, ly, { button: 'middle' })
await unring()
await park()
if (await penCount() >= before) throw new Error('the middle click erased nothing')
await frame('The whole line is gone', 2600)

joinGif(list, target)
rmSync(frames, { recursive: true })
await browser.close()
