// Takes docs/research/pen-tool-extras-tour.gif, the tour animation at the top of site/pen-tool-extras.html, from the real script on the
// live page, on a blank grid. Each frame is the board patch in use beside the pen panel, cropped tight, with a caption under the board:
//   1. a pen color recolored through edit mode: a hold on its button, the color set from the script with the picker's own input event
//      (the browser's color dialog is drawn by the operating system and is not shown), the button and the line recoloring, a second hold
//   2. a solid line, a dashed line and an arrow line (the page button turns the page between them, and is not shown)
//   3. one cell edge clicked again and again, stepping X, circle and the two arrows, then one grid corner, stepping X and circle
//   4. the Thickness slider moved, every line and mark thicker and then thinner; the Opacity slider moved, the whole pen layer fainter and then firmer
//   5. a line across cells colored dark grey with White outlines off and then on, the box switched in the settings dialog
//   6. one middle click on the first line, which erases the whole of it
// Every line is a real drag, every mark a real click, every hold a real press; a red ring marks where a hold or the middle click lands,
// since a screenshot draws no pointer. Each line, mark and hold is checked to have landed, and the last state holds longer than the rest.
// The GIF joins with a 256-color palette and dithering, so the Opacity slider's gradient does not band. Needs python3 with Pillow.
// Run from the repo root: node docs/research/pen-tool-extras-tour-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openPage, startPuzzle } from '../../live/page.mjs'
import { cellCentre, gridPoint, mouseDrag, openPenTool, PAGE_BUTTON, penStrings, setInputValue } from '../../live/pen.mjs'
import { closeExtrasEditorWith, openExtrasEditor } from '../../live/settings.mjs'
import { joinGif } from './gif-join.mjs'
import { holdPenButton, PICTURE_PEN_COLORS, pickPenColor } from './pen-tool-extras-recolor.mjs'

const target = new URL('./pen-tool-extras-tour.gif', import.meta.url).pathname
const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')
// A 900 x 700 window draws cells 53 px wide and a pen panel 159 px wide and 212 px tall. The board is three columns and four rows of them,
// as tall as the panel, so the picture is about 340 px wide on the page and no taller than the panel and its caption.
const VIEWPORT = { width: 900, height: 700 }
const COLS = 3
const ROWS = 4
// Room around the board for a line's round ends, and the top and bottom margin, small so the board is no taller than the panel.
const MARGIN = 8
const MARGIN_Y = 2
// The most the board's height may differ from the panel's, in page pixels, before the retake fails.
const HEIGHT_SLACK_PX = 8
// The board and panel gap and the caption's size, in pixels of the file, which is drawn at twice the page size.
const GAP_PX = 16
const CAPTION_PX = 28
// The rows of the lines drawn in turn (in cells from the grid's top, a cell's middle at .5): along a cell's middle and its edges, half a cell apart. A line on an edge runs the full width, from corner to corner.
const [TEAL_ROW, SOLID_ROW, DASHED_ROW, ARROW_ROW] = [0.5, 1, 1.5, 2]
const DARK_ROW = 3
const OUTLINE_ROW = DARK_ROW + 0.5
// The cell whose right edge takes the edge mark, and the grid corner (row, column) that takes the corner mark.
const [EDGE_MARK_ROW, EDGE_MARK_COL, CORNER_MARK] = [2, 0, [3, 2]]
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
const frames = mkdtempSync(join(tmpdir(), 'pte-tour-'))
const list = []
const [, , cell] = await cellCentre(p, 0, 0)
const [x0, y0] = await gridPoint(p, [0, 0])
const patch = { x: x0 - MARGIN, y: y0 - MARGIN_Y, width: COLS * cell + 2 * MARGIN, height: ROWS * cell + 2 * MARGIN_Y }
const panel = p.locator('.tool-pen .controls-input')
const panelHeight = (await panel.boundingBox()).height
if (Math.abs(panelHeight - patch.height) > HEIGHT_SLACK_PX) throw new Error(`the board is ${patch.height} px tall and the panel ${panelHeight}: change ROWS or VIEWPORT`)
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

// 1. Recolor pen 1 in edit mode.
await frame('The pen tool', 1000)
await line(NEW_PEN_COLOR_KEY, [[TEAL_ROW, 0.5], [TEAL_ROW, 2.5]])
await frame('Draw a line', 1200)
await holdWithRing(NEW_PEN_COLOR_KEY)
await frame('Hold a color button', 1500)
await pickPenColor(p, NEW_PEN_COLOR_KEY, NEW_COLOR)
await unring()
await frame('Pick a color', 1500)
await holdWithRing(NEW_PEN_COLOR_KEY)
await unring()
await frame('Hold again to finish', 1200)

// 2. A solid line, then dashed and arrow lines on the next pages.
await line(SOLID_PEN, [[SOLID_ROW, 0], [SOLID_ROW, 3]])
await frame('A solid line', 1200)
await turnPage()
await line(SOLID_PEN, [[DASHED_ROW, 0], [DASHED_ROW, 3]])
await frame('A dashed line', 1200)
await turnPage()
await line(SOLID_PEN, [[ARROW_ROW, 0], [ARROW_ROW, 3]])
await frame('An arrow line', 1300)
await turnPage()

// 3. One edge clicked over and over, then one grid corner.
await pick(EDGE_PEN)
const [ex, ey, ew] = await cellCentre(p, EDGE_MARK_ROW, EDGE_MARK_COL)
const edge = [ex + ew / 2 - EDGE_INSET_PX, ey]
for (const caption of ['An edge mark: X', 'Click again: circle', 'Again: arrow', 'Again: the other arrow']) {
  await changing(caption, async () => { await p.mouse.click(...edge); await park() })
  await frame(caption, 1200)
}
await pick(CORNER_PEN)
const corner = await gridPoint(p, CORNER_MARK)
for (const caption of ['A corner mark: X', 'Click again: circle']) {
  await changing(caption, async () => { await p.mouse.click(...corner); await park() })
  await frame(caption, 1200)
}

// 4. The sliders change every line and mark already drawn.
for (const [selector, value, caption] of [[THICKNESS, 12, 'Thickness up'], [THICKNESS, 2, 'Thickness down'], [THICKNESS, 5, 'Thickness back'], [OPACITY, 30, 'Opacity down'], [OPACITY, 100, 'Opacity up'], [OPACITY, 80, 'Opacity back']]) {
  await sliderValue(selector, value)
  await frame(caption, 1000)
}

// 5. A line across dark cells, White outlines off and then on.
for (const col of [0, 1, 2]) await colorCell(DARK_ROW, col, DARK_CELL_KEY)
await line(OUTLINE_PEN, [[OUTLINE_ROW, 0.5], [OUTLINE_ROW, 2.5]])
await setOutline(false)
await frame('White outlines off', 1500)
await setOutline(true)
await frame('White outlines on', 1500)

// 6. One middle click erases the whole first line.
const before = await penCount()
const [lx, ly] = await gridPoint(p, [TEAL_ROW, 1.5])
await ring(lx, ly)
await frame('Middle-click a line', 1200)
await p.mouse.click(lx, ly, { button: 'middle' })
await unring()
await park()
await p.waitForFunction((n) => Framework.app.puzzle.cells.reduce((sum, c) => sum + c.pen.length, 0) < n, before, { timeout: SETTLE_TIMEOUT_MS })
await frame('The whole line is gone', 2600)

joinGif(list, target, { colors: 256, dither: true, gap: GAP_PX, captionPx: CAPTION_PX })
rmSync(frames, { recursive: true })
await browser.close()
