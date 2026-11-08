// Shared by the predefined attack tests (#590): every script loaded on one SudokuPad page, the crash signals, and a
// snapshot of SudokuPad's puzzle state. Not a check itself, so `live/**/*.live.mjs` skips it.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { captureConsoleErrors, openPage, startPuzzle } from './page.mjs'
import { SCRIPTS } from './scripts.mjs'
import { gridPoint } from './pen.mjs'
import { clickUntil, SETTLE_MS, settle } from './settle.mjs'

export const NOTICE_BAR = '#sudokupad-scripts-notices [data-script]'
export const DRAW_BUTTON = '#control-draw'
export const NOTES = '#draw-tool-layer .draw-tool-text'

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

// Injects all six scripts into a page past Start Puzzle.
export async function injectScripts (p) {
  for (const script of SCRIPTS) await p.addScriptTag({ content: source(script.file) })
}

// Picks Text Anywhere's tool: SudokuPad binds a new button's click a moment after it appears, so the click repeats until the tool is current.
export const pickDraw = (p) => clickUntil(() => p.click(DRAW_BUTTON), () => p.evaluate(() => Framework.app.tool), 'draw', SETTLE_MS)

// Injects all six scripts into a page past Start Puzzle and waits for each to be up. Pen Tool Extras' `ready` leaves the pen
// tool current, so this ends on the normal tool, where a player starts. Picking Text Anywhere's tool first waits out the
// moment its button's click is dead.
export async function loadScripts (p) {
  await injectScripts(p)
  for (const script of SCRIPTS) await script.ready(p)
  await pickDraw(p)
  await p.click('#control-normal')
}

// Opens the puzzle, gets past Start Puzzle and injects all six scripts, as a user with all of them installed has;
// `errors` holds the page errors, console errors and skip lines. `contextOptions`, `expectedSkips` and `seed` go to `openPage`; `afterStart(p)` runs before the scripts go in.
export async function openWithAllScripts (browser, { contextOptions, expectedSkips, seed, afterStart } = {}) {
  const opened = await openPage(browser, {
    contextOptions,
    expectedSkips,
    seed: async (p, errors) => { captureConsoleErrors(p, errors); if (seed) await seed(p, errors) }
  })
  await startPuzzle(opened.p)
  if (afterStart) await afterStart(opened.p)
  await loadScripts(opened.p)
  return opened
}

// The crash signals: no page error, console error or skip line, and no notice bar ("<script> is off — SudokuPad changed").
export async function assertNoCrash (p, errors) {
  assert.deepEqual(errors, [])
  assert.equal(await p.locator(NOTICE_BAR).count(), 0, 'a script put up its notice bar')
}

// SudokuPad's state of every cell (givens, digits, marks, colors, pen), the string it saves and undoes.
export const cellsState = (p) => p.evaluate(() => Framework.app.puzzle.createState().cells)

// How many notes Text Anywhere draws.
export const noteCount = (p) => p.locator(NOTES).count()

// Selects the cell at [row, col] the way a click does and types `digits`.
export async function typeDigits (p, [row, col], digits) {
  await p.evaluate(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [row, col])
  await p.keyboard.type(digits)
}

// Waits for `read` to give `expected`, failing with `what` and the last value.
export async function expectSettled (read, expected, what) {
  assert.deepEqual(await settle(read, expected), expected, what)
}

// Opens a page with all six scripts, runs `body(p, errors)`, then checks the crash signals and closes the page.
export async function attack (browser, options, body) {
  const { context, p, errors } = await openWithAllScripts(browser, options)
  try {
    await body(p, errors)
    await assertNoCrash(p, errors)
  } finally {
    await context.close()
  }
}

// The cell indices of the empty cells in `state` (a `cellsState` reading).
export const emptyCells = (state) => state.flatMap((c, i) => c === '' ? [i] : [])

// A cell [row, col] of the 9x9 board from an index.
export const rowCol = (i) => [Math.floor(i / 9), i % 9]

// SudokuPad saves progress a moment after an action, and Undo after Restart loads that save; a user pauses that long.
export const flushSave = (p) => p.evaluate(() => Framework.app.puzzle.saveProgress(true))

// Colors the cell at [row, col] with SudokuPad's color `color` (1-9), as its color tool does.
export const colorCell = (p, [row, col], color) => p.evaluate(([r, c, arg]) => {
  const a = Framework.app
  a.deselect(); a.select(a.grid.getCell(r, c)); a.act({ type: 'colour', arg }); a.deselect()
}, [row, col, String(color)])

// Puts a note at [row, col] (in cells from the grid's top left, middle at .5) with `text`, with Text Anywhere's tool.
export async function placeNote (p, point, text) {
  const before = await noteCount(p)
  await pickDraw(p)
  await p.mouse.click(...await gridPoint(p, point))
  await p.keyboard.type(text)
  await p.keyboard.press('Escape')
  assert.equal(await settle(() => noteCount(p), before + 1), before + 1, 'the note was placed')
}

// Presses Restart and confirms it, then waits for the board to be at its start.
export async function restart (p) {
  await p.click('#control-restart')
  await p.locator('.dialog button').filter({ hasText: /^\s*⟲ Restart/ }).first().click()
  await p.locator('.dialog').waitFor({ state: 'detached' })
}
