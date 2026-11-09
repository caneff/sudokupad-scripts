// Shared by the live checks: where a cell is on the screen, a click and a drag there with the real mouse, Undo back to the start,
// Restart, and a Text Anywhere note placed. Not a check itself, so `live/**/*.live.mjs` skips it.
import assert from 'node:assert/strict'
import { pickDraw, SELECTED, TEXT_BOX, TEXTS } from './draw-tool/draw-tool-fixtures.mjs'
import { settle } from './settle.mjs'

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

// Presses Undo until the undo stack is empty, each press taking at least one step.
export async function undoAll (page) {
  const depth = () => page.evaluate(() => Framework.app.puzzle.undoStack.length)
  for (let now = await depth(); now > 0; now = await depth()) {
    await page.click('#control-undo')
    assert.equal(await settle(async () => (await depth()) < now, true), true, 'an undo takes a step')
  }
}

// Restart through the confirm dialog, as a player does: its Restart button, not Restart (Keep Time).
export async function restart (page) {
  await page.click('#control-restart')
  await page.locator('.dialog button').filter({ hasText: /Restart/ }).filter({ hasNotText: /Keep Time/ }).first().click()
  await page.locator('.dialog').waitFor({ state: 'detached' })
}

// Whether a Text Anywhere note is open for typing.
export const boxOpen = async (page) => (await page.locator(TEXT_BOX).count()) === 1

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
  await pickDraw(page)
  await typeText(page, at, text)
  assert.equal(await settle(count, before + 1), before + 1, 'the note was placed')
}
