// Takes the slides of Pen Tool Extras' slideshow (site/index.html and site/pen-tool-extras.html), from the real script on the live page, on a
// blank grid. Each slide is the board patch in use beside the pen panel, cropped tight, with no caption drawn in (the captions are page text):
//   pen-tool-extras-slide-1-line.png       a line drawn in the first pen
//   pen-tool-extras-slide-2-hold.png       a hold on a pen color button: edit mode, a color picker under each pen button
//   pen-tool-extras-slide-3-color.png      a color picked, the button and the line recolored
//   pen-tool-extras-slide-4-solid.png      a solid line
//   pen-tool-extras-slide-5-dashed.png     a dashed line
//   pen-tool-extras-slide-6-arrow.png      an arrow line
//   pen-tool-extras-slide-7-edges.png      four cell edges marked, clicked once to four times: an X, a circle and both arrows
//   pen-tool-extras-slide-8-corner.png     two grid corners marked, clicked once and twice: an X and a circle
//   pen-tool-extras-slide-9-thickness.png  the Thickness slider up: every line and mark thicker
//   pen-tool-extras-slide-10-opacity.png   the Opacity slider down: the whole pen layer fainter
//   pen-tool-extras-slide-11-outline-off.png  a line across dark cells with White outlines off
//   pen-tool-extras-slide-12-outline-on.png   the same line with White outlines on
//   pen-tool-extras-slide-13-erase.png     a red ring on a line, where a right click lands
//   pen-tool-extras-slide-14-erased.png    the whole line gone after the right click
// Every line is a real drag, every mark a real click, every hold a real press; a red ring marks where a hold or the right click lands,
// since a screenshot draws no pointer. Each line, mark and hold is checked to have landed. The board patch and the panel are joined side
// by side on white with Python's Pillow (python3 with Pillow).
// Run from the repo root: node docs/research/pen-tool-extras/pen-tool-extras-slides-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openPage, startPuzzle } from '../../../live/page.mjs'
import { cellCentre, gridPoint, mouseDrag, openPenTool, PAGE_BUTTON, penStrings, setInputValue } from '../../../live/pen.mjs'
import { closeExtrasEditorWith, openExtrasEditor } from '../../../live/settings.mjs'
import { holdPenButton, PICTURE_PEN_COLORS, pickPenColor } from './pen-tool-extras-recolor.mjs'

const target = (name) => new URL(`./pen-tool-extras-slide-${name}.png`, import.meta.url).pathname
const script = readFileSync(new URL('../../../pen-tool-extras.user.js', import.meta.url), 'utf8')
// A 900 x 700 window draws cells 53 px wide and a pen panel 159 px wide and 212 px tall. The board is three columns and four rows of them,
// as tall as the panel, so the picture is about 340 px wide on the page and no taller than the panel.
const VIEWPORT = { width: 900, height: 700 }
const COLS = 3
const ROWS = 4
// Room around the board for a line's round ends, and the top and bottom margin, small so the board is no taller than the panel.
const MARGIN = 8
const MARGIN_Y = 2
// The most the board's height may differ from the panel's, in page pixels, before the retake fails.
const HEIGHT_SLACK_PX = 8
// The gap between the board and the panel, in pixels of the file, which is drawn at twice the page size.
const GAP_PX = 16
const JOIN = `
import sys
from PIL import Image
board, panel, target, gap = Image.open(sys.argv[1]).convert('RGB'), Image.open(sys.argv[2]).convert('RGB'), sys.argv[3], int(sys.argv[4])
height = max(board.height, panel.height)
sheet = Image.new('RGB', (board.width + gap + panel.width, height), 'white')
sheet.paste(board, (0, (height - board.height) // 2))
sheet.paste(panel, (board.width + gap, (height - panel.height) // 2))
sheet.save(target)
`
// The rows of the lines drawn in turn (in cells from the grid's top, a cell's middle at .5): along a cell's middle and its edges, half a cell apart. A line on an edge runs the full width, from corner to corner.
const [TEAL_ROW, SOLID_ROW, DASHED_ROW, ARROW_ROW] = [0.5, 1, 1.5, 2]
const DARK_ROW = 3
const OUTLINE_ROW = DARK_ROW + 0.5
// The row whose cells take the edge marks, and the grid corners (row, column) that take the corner marks.
const EDGE_MARK_ROW = 2
const CORNER_MARKS = [[[3, 1], 2, 'a circle'], [[3, 2], 1, 'an X']]
const SETTLE_MS = 400
const EDGE_INSET_PX = 2
const [NEW_COLOR] = PICTURE_PEN_COLORS
const RING = 'tour-ring'
const SETTLE_TIMEOUT_MS = 5000

const browser = await chromium.launch()
const { p } = await openPage(browser, { contextOptions: { deviceScaleFactor: 2 } })
await p.setViewportSize(VIEWPORT)
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
await p.evaluate(() => { ToolPen.tool.lineMode = 'both' })

const penCount = () => p.evaluate(() => Framework.app.puzzle.cells.reduce((n, c) => n + c.pen.length, 0))
// Throws when `act` leaves the grid with no more pen values than before it, so a line or mark that missed fails the run.
const landing = async (what, act) => {
  const before = await penCount()
  await act()
  if (await penCount() <= before) throw new Error(`${what} did not land`)
}
// Throws when `act` leaves the pen values as they were, for a click that replaces a mark with the next one in its cycle.
const changing = async (what, act) => {
  const before = JSON.stringify(await penStrings(p))
  await act()
  if (JSON.stringify(await penStrings(p)) === before) throw new Error(`${what} changed nothing`)
}
const frames = mkdtempSync(join(tmpdir(), 'pte-slides-'))
const [, , cell] = await cellCentre(p, 0, 0)
const [x0, y0] = await gridPoint(p, [0, 0])
const patch = { x: x0 - MARGIN, y: y0 - MARGIN_Y, width: COLS * cell + 2 * MARGIN, height: ROWS * cell + 2 * MARGIN_Y }
const panel = p.locator('.tool-pen .controls-input')
const panelHeight = (await panel.boundingBox()).height
if (Math.abs(panelHeight - patch.height) > HEIGHT_SLACK_PX) throw new Error(`the board is ${patch.height} px tall and the panel ${panelHeight}: change ROWS or VIEWPORT`)
// Writes one slide: the board patch beside the panel, joined.
const slide = async (name) => {
  await p.waitForTimeout(SETTLE_MS)
  await p.screenshot({ path: join(frames, 'board.png'), clip: patch })
  await panel.screenshot({ path: join(frames, 'panel.png') })
  const joined = spawnSync('python3', ['-I', '-c', JOIN, join(frames, 'board.png'), join(frames, 'panel.png'), target(name), String(GAP_PX)], { encoding: 'utf8' })
  if (joined.status !== 0) throw new Error(`joining slide ${name} failed: ${joined.error ?? joined.stderr}`)
  console.log(`wrote ${target(name)}`)
}
const pick = (key) => p.locator(`.tool-pen button[data-key="${key}"]`).click()
const park = () => p.mouse.move(5, 5)
const ring = (x, y) => p.evaluate(([x, y, id]) => {
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('div')
    el.id = id
    el.style.cssText = 'position:fixed;width:26px;height:26px;border:3px solid #e53935;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:99999'
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
const line = async (key, points) => { await pick(key); await landing(`the line from ${points[0]}`, () => mouseDrag(p, points)); await park() }
const turnPage = async () => { await p.locator(PAGE_BUTTON).click(); await park() }
const [NEW_PEN_COLOR_KEY, SOLID_PEN, EDGE_PEN, CORNER_PEN, OUTLINE_PEN] = [1, 6, 9, 5, 8]
// SudokuPad's cell color key for the dark grey the outline picture draws on.
const DARK_CELL_KEY = '3'
const sliderValue = async (selector, value) => { await setInputValue(p.locator(selector), value); await park() }
const setOutline = async (on) => {
  await openExtrasEditor(p)
  await p.locator('#pen-tool-extras-editor input[data-box="outline"]').setChecked(on)
  await closeExtrasEditorWith(p, 'Save')
  await park()
}
const colorCell = (row, col, key) => p.evaluate(([row, col, key]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(row, col)); a.act({ type: 'colour', arg: key }); a.deselect() }, [row, col, key])
const THICKNESS = '#pen-tool-extras-thickness'
const OPACITY = '#pen-tool-extras-opacity'

// 1 to 3. Recolor pen 1 in edit mode.
await line(NEW_PEN_COLOR_KEY, [[TEAL_ROW, 0.5], [TEAL_ROW, 2.5]])
await slide('1-line')
await holdWithRing(NEW_PEN_COLOR_KEY)
await slide('2-hold')
await pickPenColor(p, NEW_PEN_COLOR_KEY, NEW_COLOR)
await unring()
await slide('3-color')
await holdWithRing(NEW_PEN_COLOR_KEY)
await unring()

// 4 to 6. A solid line, then dashed and arrow lines on the next pages.
await line(SOLID_PEN, [[SOLID_ROW, 0], [SOLID_ROW, 3]])
await slide('4-solid')
await turnPage()
await line(SOLID_PEN, [[DASHED_ROW, 0], [DASHED_ROW, 3]])
await slide('5-dashed')
await turnPage()
await line(SOLID_PEN, [[ARROW_ROW, 0], [ARROW_ROW, 3]])
await slide('6-arrow')
await turnPage()

// 7. Four edges, clicked once to four times: an X, a circle and an arrow each way. The arrows are on cells' bottom edges, so they stay inside the picture.
await pick(EDGE_PEN)
for (const [col, down, clicks, what] of [[0, false, 1, 'an X'], [1, false, 2, 'a circle'], [0, true, 3, 'an arrow'], [2, true, 4, 'the arrow turned round']]) {
  const [ex, ey, ew] = await cellCentre(p, EDGE_MARK_ROW, col)
  const edge = down ? [ex, ey + ew / 2 - EDGE_INSET_PX] : [ex + ew / 2 - EDGE_INSET_PX, ey]
  for (let i = 0; i < clicks; i++) {
    await changing(`${what} on the edge of column ${col}`, async () => { await p.mouse.click(...edge); await park() })
  }
}
await slide('7-edges')

// 8. Two grid corners, clicked once and twice: an X and a circle.
await pick(CORNER_PEN)
for (const [at, clicks, what] of CORNER_MARKS) {
  const corner = await gridPoint(p, at)
  for (let i = 0; i < clicks; i++) await changing(`${what} on the corner ${at}`, async () => { await p.mouse.click(...corner); await park() })
}
await slide('8-corner')

// 9 and 10. The sliders change every line and mark already drawn.
await sliderValue(THICKNESS, 12)
await slide('9-thickness')
await sliderValue(THICKNESS, 5)
await sliderValue(OPACITY, 30)
await slide('10-opacity')
await sliderValue(OPACITY, 80)

// 11 and 12. A line across dark cells, White outlines off and then on.
for (const col of [0, 1, 2]) await colorCell(DARK_ROW, col, DARK_CELL_KEY)
await line(OUTLINE_PEN, [[OUTLINE_ROW, 0.5], [OUTLINE_ROW, 2.5]])
await setOutline(false)
await slide('11-outline-off')
await setOutline(true)
await slide('12-outline-on')

// 13 and 14. One right click erases the whole first line.
const before = await penCount()
const [lx, ly] = await gridPoint(p, [TEAL_ROW, 1.5])
await ring(lx, ly)
await slide('13-erase')
await p.mouse.click(lx, ly, { button: 'right' })
await unring()
await park()
await p.waitForFunction((n) => Framework.app.puzzle.cells.reduce((sum, c) => sum + c.pen.length, 0) < n, before, { timeout: SETTLE_TIMEOUT_MS })
await slide('14-erased')

rmSync(frames, { recursive: true })
await browser.close()
