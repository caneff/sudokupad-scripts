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
// A smaller window than the default makes the board's cells smaller, so the whole picture is narrower.
const VIEWPORT = { width: 1000, height: 680 }
const COLS = 4
const ROWS = 7
const MARGIN = 6
const CLICK_PAUSE_MS = 150
const SETTLE_MS = 400
const EDGE_INSET_PX = 2
const [NEW_COLOR] = PICTURE_PEN_COLORS
const RING = 'tour-ring'
const SETTLE_TIMEOUT_MS = 5000

const browser = await chromium.launch()
const { p } = await openPage(browser, { contextOptions: { deviceScaleFactor: 2, viewport: VIEWPORT } })
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
const line = async (key, points) => { await pick(key); await landing(`the line from ${points[0]}`, () => mouseDrag(p, points)); await park() }
const turnPage = async () => { await p.locator(PAGE_BUTTON).click(); await park() }
const clickTimes = async (x, y, n) => { for (let i = 0; i < n; i++) { await p.mouse.click(x, y); await p.waitForTimeout(CLICK_PAUSE_MS) } }
const [NEW_PEN_COLOR_KEY, EDGE_PEN, CORNER_PEN, OUTLINE_PEN] = [1, 9, 5, 8]
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
await line(NEW_PEN_COLOR_KEY, [[0.5, 0.5], [0.5, 3.5]])
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
await line(6, [[1.5, 0.5], [1.5, 3.5]])
await frame('A solid line', 1200)
await turnPage()
await line(6, [[2.5, 0.5], [2.5, 3.5]])
await frame('A dashed line', 1200)
await turnPage()
await line(6, [[3.5, 0.5], [3.5, 3.5]])
await frame('An arrow line', 1300)
await turnPage()

// 3. One edge clicked over and over, then one grid corner.
await pick(EDGE_PEN)
const [ex, ey, ew] = await cellCentre(p, 4, 1)
const edge = [ex + ew / 2 - EDGE_INSET_PX, ey]
for (const caption of ['An edge mark: X', 'Click again: circle', 'Again: arrow', 'Again: the other arrow']) {
  await changing(caption, async () => { await p.mouse.click(...edge); await park() })
  await frame(caption, 1200)
}
await pick(CORNER_PEN)
const corner = await gridPoint(p, [5, 2])
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
for (const [col, key] of [[0, '3'], [1, '3'], [2, '3'], [3, '3']]) await colorCell(6, col, key)
await line(OUTLINE_PEN, [[6.5, 0.5], [6.5, 3.5]])
await setOutline(false)
await frame('White outlines off', 1500)
await setOutline(true)
await frame('White outlines on', 1500)

// 6. One middle click erases the whole first line.
const before = await penCount()
const [lx, ly] = await gridPoint(p, [0.5, 2])
await ring(lx, ly)
await frame('Middle-click a line', 1200)
await p.mouse.click(lx, ly, { button: 'middle' })
await unring()
await park()
await p.waitForFunction((n) => Framework.app.puzzle.cells.reduce((sum, c) => sum + c.pen.length, 0) < n, before, { timeout: SETTLE_TIMEOUT_MS })
await frame('The whole line is gone', 2600)

joinGif(list, target, { colors: 256, dither: true })
rmSync(frames, { recursive: true })
await browser.close()
