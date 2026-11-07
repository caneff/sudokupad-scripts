// Shared by the live checks of the pen tool: opening it, reading what it drew and which pen page is up, drawing with
// the real mouse, setting its sliders, planting saved values and probing keydowns. Not a check itself, so
// `live/*.live.mjs` skips it.

import { clickUntil, SETTLE_MS, settle } from './settle.mjs'

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

// The pen entries of every cell as `row,col:value+color`, sorted.
export const penEntries = (page) => page.evaluate(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => `${c.row},${c.col}:${v}`)).sort())

// The pen entries of every cell without their colors (each entry's first character), sorted.
export const penValuesNoColor = (page) => page.evaluate(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => v[0])).sort())

// The pen entries of the cell at [row, col] without their colors, sorted.
export const penValuesAt = (page, row, col) => page.evaluate(([r, c]) => Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).pen.map((v) => v[0]).sort(), [row, col])

// The pen entries of every cell as the strings SudokuPad holds (value and color), sorted.
export const penStrings = (page) => page.evaluate(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => String(v))).sort())

// The page point at the centre of the cell at [row, col], then the cell's width.
export const cellCentre = (page, row, col) => page.evaluate(([r, c]) => {
  const box = Framework.app.puzzle.cells.find((cell) => cell.row === r && cell.col === c).elem.getBoundingClientRect()
  return [box.x + box.width / 2, box.y + box.height / 2, box.width]
}, [row, col])

// A point [row, col] in cells from the grid's top left (a cell's middle is at .5), as page pixels.
export const gridPoint = async (page, [r, c]) => {
  const [x0, y0, size] = await cellCentre(page, 0, 0)
  return [x0 + (c - 0.5) * size, y0 + (r - 0.5) * size]
}

// A left drag along `points`, each [row, col] in cells from the grid's top left, with real mouse input and a few mouse
// moves between each two points.
export async function mouseDrag (page, points) {
  await page.mouse.move(...await gridPoint(page, points[0]))
  await page.mouse.down()
  for (const point of points.slice(1)) await page.mouse.move(...await gridPoint(page, point), { steps: 8 })
  await page.mouse.up()
}

// A drag along `points`, as `mouseDrag`, returning once the grid has changed.
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

// Sets the slider matching `selector` in the pen tool's panel to `value`, with the same `input` event a drag fires.
export async function setSlider (page, selector, value) {
  await openPenTool(page)
  await page.locator(selector).evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })) }, value)
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

// Presses `key` and returns, for each keydown the page saw, whether its default was prevented.
export async function keydownDefaults (page, key) {
  await page.evaluate(() => {
    window.__keydowns = []
    window.addEventListener('keydown', (e) => window.__keydowns.push(e.defaultPrevented), { once: true })
  })
  await page.keyboard.press(key)
  return page.evaluate(() => window.__keydowns)
}
