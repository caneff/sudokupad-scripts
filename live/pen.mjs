// Not a check itself, so `live/**/*.live.mjs` skips it.
import assert from 'node:assert/strict'
import { cellCentre, mouseDrag } from './board.mjs'
import { setInputValue } from './input.mjs'
import { clickUntil, SETTLE_MS, settle } from './settle.mjs'

// Pen Tool Extras' page button, and the values of the number pad's buttons 1 to 9 on each of its pages.
export const PAGE_BUTTON = '.pen-tool-extras-page'
export const PAGE_ONE = '123456789'
export const PAGE_TWO = 'abcdefghi'
export const PAGE_THREE = 'jlnprtvxz'
// How long one press on the page button gets to turn the page before it is pressed again.
const PAGE_TURN_MS = 500

// How long one click on the pen button gets to show the tool: longer than the tool takes to open, since a second click
// on the toggle closes it again.
const TOOL_OPENS_MS = 500

// The pen button toggles the tool, and SudokuPad binds its handler a moment after the button appears, so it is
// clicked again until the tool's buttons show. Returns true once they show; an open tool is left as it is.
export async function openPenTool (page) {
  const shown = () => page.locator('.tool-pen button[data-key="1"]').isVisible()
  if (await shown()) return true
  return clickUntil(() => page.click('#control-pen'), shown, true, SETTLE_MS, TOOL_OPENS_MS)
}

// The values of the number pad's buttons 1 to 9 as one string, which says which pen page is up.
export const padValues = (page) => page.evaluate(() => [...document.querySelectorAll('.controls-input button[data-key]')].filter((b) => b.dataset.key !== '0').map((b) => b.dataset.value).join(''))

export const penEntries = (page) => page.evaluate(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => `${c.row},${c.col}:${v}`)).sort())

// The pen entries of every cell without their colors (each entry's first character), sorted.
export const penValuesNoColor = (page) => page.evaluate(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => v[0])).sort())

export const penValuesAt = (page, row, col) => page.evaluate(([r, c]) => Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).pen.map((v) => v[0]).sort(), [row, col])

export const penStrings = (page) => page.evaluate(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => String(v))).sort())

export async function drag (page, points) {
  const before = JSON.stringify(await penEntries(page))
  await mouseDrag(page, points)
  const changed = await settle(async () => JSON.stringify(await penEntries(page)) !== before, true)
  if (changed !== true) throw new Error('the drag changed nothing on the grid')
}

// One free line in pen color 1 from the centre of the cell at [row, col], a real drag by (`dx`, `dy`) page pixels,
// returning once the line is in the pen layer. A line drawn over an existing one erases it, so a second line takes
// another row.
export async function draw (page, row, { col = 4, dx = 110, dy = 10, steps = 6 } = {}) {
  await openPenTool(page)
  await page.locator('.tool-pen button[data-key="1"]').click()
  const [x, y] = await cellCentre(page, row, col)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps })
  await page.mouse.up()
  await page.locator('.cell-pen.pencolor-1').first().waitFor({ state: 'attached' })
}

export async function setSlider (page, selector, value) {
  await openPenTool(page)
  await setInputValue(page.locator(selector), value)
}

// Stores `raw` (a string, possibly corrupt) as the saved value of the script's data key `key`, for a reload to read.
// Throws, naming the key, when nothing is saved there yet: a renamed storage key would otherwise take the planted value
// to a dead key, the script would read nothing and fall back to its defaults, and the test would pass unproven.
export const plantSaved = (page, key, raw) => page.evaluate(([k, value]) => {
  const stored = Framework.makeDataKey(k)
  if (window.localStorage.getItem(stored) === null) throw new Error('no stored value at ' + k)
  window.localStorage.setItem(stored, value)
}, [key, raw])

// Like `plantSaved`, for a setting that may not be saved yet (a default untouched since the page opened): it plants either way.
export const plantUnchecked = (page, key, raw) => page.evaluate(([k, value]) => { window.localStorage.setItem(Framework.makeDataKey(k), value) }, [key, raw])

export async function goToPenPage (page, values) {
  for (let i = 0; i < 3 && (await padValues(page)) !== values; i++) {
    await page.locator(PAGE_BUTTON).click()
    await settle(() => padValues(page), values, PAGE_TURN_MS)
  }
  assert.equal(await settle(() => padValues(page), values), values)
}

// A real click this many px inside a button's left edge: the part nearest the grid, where a press that leaks to the board marks it (#521).
const LEFT_EDGE_PX = 3
// How long the board gets to show what a click drew; only a "nothing happened in N ms" check.
const NO_MARK_MS = 300

// Clicks the left edge of `selector`'s button and returns the pen entries the click added and how many `mousedown`s reached `window` from it.
// A button that stops its `mousedown` reaches neither; a press that reached `window` is what SudokuPad's board turns into a mark.
export async function clickLeftEdge (page, selector) {
  await page.evaluate(() => {
    if (window.__leakedMousedowns === undefined) window.addEventListener('mousedown', () => { window.__leakedMousedowns++ })
    window.__leakedMousedowns = 0
  })
  const before = await penEntries(page)
  const box = await page.locator(selector).boundingBox()
  await page.mouse.click(box.x + LEFT_EDGE_PX, box.y + box.height / 2)
  await page.waitForTimeout(NO_MARK_MS)
  const after = await penEntries(page)
  return { added: after.filter((e) => !before.includes(e)), leaked: await page.evaluate(() => window.__leakedMousedowns) }
}

export const penDrawnCount = (page) => page.evaluate(() => document.querySelectorAll('#cell-pen .cell-pen').length)
