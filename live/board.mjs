/* global Framework */
// Shared by the live checks: where a cell is on the screen, the cell actions (select, colour, click), the current tool, a click and a drag there with the real mouse, Undo back to the start,
// Restart, and a Text Anywhere note placed. Not a check itself, so `live/**/*.live.mjs` skips it.
import assert from 'node:assert/strict'
import { clickUntil, settle, SETTLE_MS } from './settle.mjs'

// Text Anywhere's notes as the board shows them, defined here since a note helper below reads them and a shared module imports no script's fixtures.
// The notes drawn, leaving out the one open for typing, which is its own element in the layer while it is open.
export const TEXTS = '#text-anywhere-layer .text-anywhere-text:not(.text-anywhere-textbox)'
export const TEXT_BOX = '#text-anywhere-layer .text-anywhere-textbox'
export const SELECTED = '#text-anywhere-layer .text-anywhere-selected'

// The text of each note drawn, in document order.
export const texts = (page) => page.evaluate((selector) => [...document.querySelectorAll(selector)].map((t) => t.textContent), TEXTS)

// The tool SudokuPad has current.
export const currentTool = (page) => page.evaluate(() => Framework.app.tool)

// Picks the tool named `name` by its button and returns once SudokuPad has it: SudokuPad binds a new button's click a moment after it appears, so the click repeats.
export async function pickTool (page, name) {
  const tool = await clickUntil(() => page.click(`#control-${name}`), () => currentTool(page), name, SETTLE_MS)
  assert.equal(tool, name, `${name} is the current tool`)
  return tool
}

// Selects the cell at (`row`, `col`) the way SudokuPad's own click does, with nothing else selected.
export const selectCell = (page, row, col) => page.evaluate(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [row, col])

// Gives the cell at [row, col] the colour `color` through SudokuPad's own colour action, then clears the selection.
export async function colorCell (page, [row, col], color) {
  await selectCell(page, row, col)
  await page.evaluate((arg) => { Framework.app.act({ type: 'colour', arg }); Framework.app.deselect() }, String(color))
}

// A real click at the centre of the cell at (`row`, `col`).
export const clickCell = (page, row, col) => clickAt(page, [row + 0.5, col + 0.5])

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

// A real click at `at`, in cells from the grid's top left; `options` go to Playwright's click.
export const clickAt = async (page, at, options) => page.mouse.click(...await gridPoint(page, at), options)

// A drag along `points` with `button` held (the left one unless given), each [row, col] in cells from the grid's top left,
// with real mouse input and a few mouse moves between each two points.
export async function mouseDrag (page, points, { button = 'left' } = {}) {
  await page.mouse.move(...await gridPoint(page, points[0]))
  await page.mouse.down({ button })
  for (const point of points.slice(1)) await page.mouse.move(...await gridPoint(page, point), { steps: 8 })
  await page.mouse.up({ button })
}

// How many steps SudokuPad's undo stack holds.
export const undoDepth = (page) => page.evaluate(() => Framework.app.puzzle.undoStack.length)

// Presses Undo until the undo stack is empty, each press changing its depth. The first Undo after a Restart brings the board from before it back, which grows the stack.
export async function undoAll (page) {
  for (let now = await undoDepth(page); now > 0; now = await undoDepth(page)) {
    await page.click('#control-undo')
    assert.equal(await settle(async () => (await undoDepth(page)) !== now, true), true, 'an undo changes the undo stack')
  }
}

// Restart through the confirm dialog, as a player does: its Restart button, not Restart (Keep Time).
export async function restart (page) {
  await page.click('#control-restart')
  await page.locator('.dialog button').filter({ hasText: /Restart/ }).filter({ hasNotText: /Keep Time/ }).first().click()
  await page.locator('.dialog').waitFor({ state: 'detached' })
}

// Whether a note's text box is open: two boxes at once is a bug, so it throws rather than read as closed.
export async function boxOpen (page) {
  const open = await page.locator(TEXT_BOX).count()
  assert.ok(open <= 1, `${open} text boxes are open at once`)
  return open === 1
}

// Escape finishes the open note and leaves it selected; a second Escape ends that selection, so the next click on empty space opens a note again.
export async function finishNote (page) {
  await page.keyboard.press('Escape')
  if (await page.locator(SELECTED).count() > 0) await page.keyboard.press('Escape')
}

// With Text Anywhere current, a click at `at` (in cells from the grid's top left) opens a note, `text` is typed into it and it is finished.
export async function typeText (page, at, text) {
  await clickAt(page, at)
  await page.locator(TEXT_BOX).waitFor({ state: 'attached' })
  await page.keyboard.type(text)
  await finishNote(page)
}

// Picks Text Anywhere, then `typeText`, and checks the board has one note more.
export async function placeNote (page, at, text) {
  const count = () => page.locator(TEXTS).count()
  const before = await count()
  await pickTool(page, 'textanywhere')
  await typeText(page, at, text)
  assert.equal(await settle(count, before + 1), before + 1, 'the note was placed')
}
