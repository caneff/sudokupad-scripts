// Takes the 13 slides of Pen Tool Extras' slideshow (site/index.html and site/pen-tool-extras.html), from the real script on the live page, on a
// blank grid. Each slide is the board patch in use beside the pen panel, cropped tight, with no caption drawn in (the captions are page text).
// A slide that shows a before and an after is also an animated WebP (docs/research/site/slide-animation.py): the before, a crossfade, the after,
// a crossfade back. Its PNG is the after, the still a visitor who prefers reduced motion sees. A * marks those slides.
//   pen-tool-extras-slide-1-line.png       a line drawn in the first pen
//   pen-tool-extras-slide-2-color.png    * a hold on a pen color button (edit mode, a color picker under each pen button), then a color picked: the button and the line recolored
//   pen-tool-extras-slide-3-solid.png      a solid line
//   pen-tool-extras-slide-4-dashed.png     a dashed line
//   pen-tool-extras-slide-5-arrow.png      an arrow line
//   pen-tool-extras-slide-6-edges.png      four cell edges marked, clicked once to four times: an X, a circle and both arrows
//   pen-tool-extras-slide-7-corner.png     two grid corners marked, clicked once and twice: an X and a circle
//   pen-tool-extras-slide-8-center.png     three cell centers marked, clicked once to three times: a circle, a cross and a dot
//   pen-tool-extras-slide-9-thickness.png  * the default board, then the Thickness slider up: every line and mark thicker
//   pen-tool-extras-slide-10-opacity.png   * the default board, then the Opacity slider down: the whole pen layer fainter
//   pen-tool-extras-slide-11-outline.png   * a line across dark cells with White outlines off, then on
//   pen-tool-extras-slide-12-erase.png     * a red ring on a line, where a right press is held (the line is not dimmed), then the whole line gone after the right click
//   pen-tool-extras-slide-13-settings.png  a red ring on the panel's settings button, beside the settings dialog it opens
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
import { cellCentre, gridPoint, mouseDrag } from '../../../live/board.mjs'
import { openPenTool, PAGE_BUTTON, penStrings, penValuesNoColor, setInputValue } from '../../../live/pen.mjs'
import { closeExtrasEditorWith, openExtrasEditor } from '../../../live/settings.mjs'
import { holdPenButton, PICTURE_PEN_COLORS, pickPenColor } from './pen-tool-extras-recolor.mjs'

const target = (name, extension = 'png') => new URL(`./pen-tool-extras-slide-${name}.${extension}`, import.meta.url).pathname
const ANIMATE = new URL('../site/slide-animation.py', import.meta.url).pathname
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
// The row whose cells take the edge marks, and the grid corners that take the corner marks, which are written beside the slide.
const EDGE_MARK_ROW = 2
// The bottom row takes the cell marks, which the dark cells and the outline line of slides 12 and 13 then share.
const CELL_MARK_ROW = 3
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
// Throws when no cell holds the pen value `value` after `act`, so a click that cycled to the wrong mark fails the run, not only one that changed nothing.
const marking = async (what, value, act) => {
  await act()
  if (!(await penValuesNoColor(p)).includes(value)) throw new Error(`${what} did not give the pen value ${value}`)
}
const frames = mkdtempSync(join(tmpdir(), 'pte-slides-'))
const [, , cell] = await cellCentre(p, 0, 0)
const [x0, y0] = await gridPoint(p, [0, 0])
const patch = { x: x0 - MARGIN, y: y0 - MARGIN_Y, width: COLS * cell + 2 * MARGIN, height: ROWS * cell + 2 * MARGIN_Y }
const panel = p.locator('.tool-pen .controls-input')
const panelHeight = (await panel.boundingBox()).height
if (Math.abs(panelHeight - patch.height) > HEIGHT_SLACK_PX) throw new Error(`the board is ${patch.height} px tall and the panel ${panelHeight}: change ROWS or VIEWPORT`)
// Writes the board patch beside the panel, joined, to `file`.
const shoot = async (file) => {
  await p.waitForTimeout(SETTLE_MS)
  await p.screenshot({ path: join(frames, 'board.png'), clip: patch })
  await panel.screenshot({ path: join(frames, 'panel.png') })
  const joined = spawnSync('python3', ['-I', '-c', JOIN, join(frames, 'board.png'), join(frames, 'panel.png'), file, String(GAP_PX)], { encoding: 'utf8' })
  if (joined.status !== 0) throw new Error(`joining ${file} failed: ${joined.error ?? joined.stderr}`)
}
const slide = async (name) => {
  await shoot(target(name))
  console.log(`wrote ${target(name)}`)
}
// A before picture kept in the temporary folder, for `animatedSlide`.
const before = async (name) => shoot(join(frames, `before-${name}.png`))
// Writes the slide's still (the after) and its animation from the before kept under the same name. `beforeName` names a before kept for more than one slide.
const animatedSlide = async (name, beforeName = name) => {
  await slide(name)
  const animated = spawnSync('python3', ['-I', ANIMATE, join(frames, `before-${beforeName}.png`), target(name), target(name, 'webp')], { encoding: 'utf8' })
  if (animated.status !== 0) throw new Error(`animating slide ${name} failed: ${animated.error ?? animated.stderr}`)
  console.log(`wrote ${target(name, 'webp')}`)
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
// Clicks `point` `clicks` times: each click but the last must change the pen values, and the last must leave the pen value `value` somewhere.
const clickMark = async (point, clicks, what, value) => {
  for (let i = 0; i < clicks; i++) {
    const click = async () => { await p.mouse.click(...point); await park() }
    if (i === clicks - 1) await marking(what, value, click)
    else await changing(`click ${i + 1} on ${what}`, click)
  }
}
const turnPage = async () => { await p.locator(PAGE_BUTTON).click(); await park() }
const [NEW_PEN_COLOR_KEY, SOLID_PEN, EDGE_PEN, CORNER_PEN, OUTLINE_PEN, CENTER_PEN] = [1, 6, 9, 5, 8, 4]
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
// The settings slide: the panel and the dialog, both shrunk by one factor so the dialog fits the slide's height, centered on white in a picture
// the size of every other slide (the slides share one frame, site/slideshows.json).
const SETTINGS_JOIN = `
import sys
from PIL import Image
panel, dialog, target, gap = Image.open(sys.argv[1]).convert('RGB'), Image.open(sys.argv[2]).convert('RGB'), sys.argv[3], int(sys.argv[4])
width, height = int(sys.argv[5]), int(sys.argv[6])
scale = min(1, (height - 2 * gap) / dialog.height, (width - 3 * gap) / (panel.width + dialog.width))
shrink = lambda im: im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
panel, dialog = shrink(panel), shrink(dialog)
sheet = Image.new('RGB', (width, height), 'white')
left = (width - panel.width - gap - dialog.width) // 2
sheet.paste(panel, (left, (height - panel.height) // 2))
sheet.paste(dialog, (left + panel.width + gap, (height - dialog.height) // 2))
sheet.save(target)
`
const SETTINGS_BUTTON = '.pen-tool-extras-settings'
const DIALOG_VIEWPORT = { width: 1200, height: 900 }
const THICKNESS = '#pen-tool-extras-thickness'
const OPACITY = '#pen-tool-extras-opacity'

// 1 and 2. Recolor pen 1 in edit mode.
await line(NEW_PEN_COLOR_KEY, [[TEAL_ROW, 0.5], [TEAL_ROW, 2.5]])
await slide('1-line')
await holdWithRing(NEW_PEN_COLOR_KEY)
await before('2-color')
await pickPenColor(p, NEW_PEN_COLOR_KEY, NEW_COLOR)
await unring()
await animatedSlide('2-color')
await holdWithRing(NEW_PEN_COLOR_KEY)
await unring()

// 3 to 5. A solid line, then dashed and arrow lines on the next pages.
await line(SOLID_PEN, [[SOLID_ROW, 0], [SOLID_ROW, 3]])
await slide('3-solid')
await turnPage()
await line(SOLID_PEN, [[DASHED_ROW, 0], [DASHED_ROW, 3]])
await slide('4-dashed')
await turnPage()
await line(SOLID_PEN, [[ARROW_ROW, 0], [ARROW_ROW, 3]])
await slide('5-arrow')
await turnPage()

// 6. Four edges, clicked once to four times: an X, a circle and an arrow each way. The arrows are on cells' bottom edges, so they stay inside the picture.
await pick(EDGE_PEN)
// Each edge's last click gives the pen value of the mark it names: the right edge's X is 3 and its circle j, the bottom edge's arrows k and l.
for (const [col, down, clicks, what, value] of [[0, false, 1, 'an X', '3'], [1, false, 2, 'a circle', 'j'], [0, true, 3, 'an arrow', 'k'], [2, true, 4, 'the arrow turned round', 'l']]) {
  const [ex, ey, ew] = await cellCentre(p, EDGE_MARK_ROW, col)
  const edge = down ? [ex, ey + ew / 2 - EDGE_INSET_PX] : [ex + ew / 2 - EDGE_INSET_PX, ey]
  await clickMark(edge, clicks, `${what} on the edge of column ${col}`, value)
}
await slide('6-edges')

// 7. Two grid corners, clicked once and twice: an X and a circle.
await pick(CORNER_PEN)
// An inner corner is stored as the X u or the circle x.
for (const [at, clicks, what, value] of [[[3, 1], 2, 'a circle', 'x'], [[3, 2], 1, 'an X', 'u']]) {
  const corner = await gridPoint(p, at)
  await clickMark(corner, clicks, `${what} on the corner ${at}`, value)
}
await slide('7-corner')

// 8. Three cell centers in the bottom row, clicked once to three times: the cell marks: a circle, a cross and a dot, in SudokuPad's own cell values 5 and 6 and the script's z.
await pick(CENTER_PEN)
for (const [col, clicks, what, value] of [[0, 1, 'a circle', '5'], [1, 2, 'a cross', '6'], [2, 3, 'a dot', 'z']]) {
  const [cx, cy] = await cellCentre(p, CELL_MARK_ROW, col)
  await clickMark([cx, cy], clicks, `${what} in the cell of column ${col}`, value)
}
await slide('8-center')
// The board as it is now, with every setting at its default, is the before of the Thickness and Opacity slides.
await before('9-thickness')

// 9 and 10. The sliders change every line and mark already drawn.
await sliderValue(THICKNESS, 12)
await animatedSlide('9-thickness')
await sliderValue(THICKNESS, 5)
await sliderValue(OPACITY, 30)
await animatedSlide('10-opacity', '9-thickness')
await sliderValue(OPACITY, 80)

// The outline line runs through the bottom row's cell centers, so the cell marks are clicked on to empty first (a circle takes three more clicks, a cross two, a dot one).
for (const [col, clicks] of [[0, 3], [1, 2], [2, 1]]) {
  const [cx, cy] = await cellCentre(p, CELL_MARK_ROW, col)
  for (let i = 0; i < clicks; i++) await changing(`click ${i + 1} clearing the cell mark of column ${col}`, async () => { await p.mouse.click(cx, cy); await park() })
}
const leftOver = (await penValuesNoColor(p)).filter((v) => ['5', '6', 'z'].includes(v))
if (leftOver.length > 0) throw new Error(`the cell marks were not cleared: ${leftOver}`)

// 11. A line across dark cells, White outlines off and then on.
for (const col of [0, 1, 2]) await colorCell(DARK_ROW, col, DARK_CELL_KEY)
await line(OUTLINE_PEN, [[OUTLINE_ROW, 0.5], [OUTLINE_ROW, 2.5]])
await setOutline(false)
await before('11-outline')
await setOutline(true)
await animatedSlide('11-outline')

// 12. A right press on the first line shows no preview; letting go erases the whole line.
const lines = await penCount()
const [lx, ly] = await gridPoint(p, [TEAL_ROW, 1.5])
await ring(lx, ly)
await p.mouse.move(lx, ly)
await p.mouse.down({ button: 'right' })
await before('12-erase')
await p.mouse.up({ button: 'right' })
await unring()
await park()
await p.waitForFunction((n) => Framework.app.puzzle.cells.reduce((sum, c) => sum + c.pen.length, 0) < n, lines, { timeout: SETTLE_TIMEOUT_MS })
await animatedSlide('12-erase')

// 13. The settings button, and the dialog it opens.
const sheetSize = JSON.parse(readFileSync(new URL('../../../site/slideshows.json', import.meta.url), 'utf8'))['pen-tool-extras']
const gear = await p.locator(SETTINGS_BUTTON).boundingBox()
await ring(gear.x + gear.width / 2, gear.y + gear.height / 2)
await p.waitForTimeout(SETTLE_MS)
await panel.screenshot({ path: join(frames, 'panel.png') })
await unring()
// The dialog needs a larger window than the board's: at 900 x 700 its right column is clipped.
await p.setViewportSize(DIALOG_VIEWPORT)
await p.locator(SETTINGS_BUTTON).click()
const dialog = p.locator('.dialog').filter({ has: p.locator('#pen-tool-extras-editor') })
await dialog.waitFor({ state: 'visible' })
// The dialog fades in; a picture taken mid-fade is a shade off.
await p.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)))
await dialog.screenshot({ path: join(frames, 'dialog.png') })
const settingsJoined = spawnSync('python3', ['-I', '-c', SETTINGS_JOIN, join(frames, 'panel.png'), join(frames, 'dialog.png'), target('13-settings'), String(GAP_PX), String(sheetSize.width), String(sheetSize.height)], { encoding: 'utf8' })
if (settingsJoined.status !== 0) throw new Error(`joining slide 13-settings failed: ${settingsJoined.error ?? settingsJoined.stderr}`)
console.log(`wrote ${target('13-settings')}`)
await closeExtrasEditorWith(p, 'Cancel')

rmSync(frames, { recursive: true })
await browser.close()
