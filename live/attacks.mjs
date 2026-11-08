// Every script loaded on one SudokuPad page, the crash signals, and a snapshot of SudokuPad's puzzle state, for the predefined
// attack tests (#590). Not a check itself, so `live/**/*.live.mjs` skips it.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { captureConsoleErrors, openPage, startPuzzle } from './page.mjs'
import { DRAW_BUTTON, pickDraw, SCRIPTS } from './scripts.mjs'
import { gridPoint } from './pen.mjs'
import { settle } from './settle.mjs'

export const NOTICE_BAR = '#sudokupad-scripts-notices [data-script]'
export { DRAW_BUTTON, pickDraw }
export const NOTES = '#draw-tool-layer .draw-tool-text'

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

// Injects all six scripts into a page past Start Puzzle.
export async function injectScripts (p) {
  for (const script of SCRIPTS) await p.addScriptTag({ content: source(script.file) })
}

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
// `errors` holds the page errors, console errors and skip lines; `expectedSkips` and `seed` go to `openPage` and `afterStart(p)` runs before the scripts go in.
export async function openWithAllScripts (browser, { expectedSkips, seed, afterStart } = {}) {
  const opened = await openPage(browser, {
    expectedSkips,
    seed: async (p, errors) => { captureConsoleErrors(p, errors); if (seed) await seed(p, errors) }
  })
  await startPuzzle(opened.p)
  if (afterStart) await afterStart(opened.p)
  await loadScripts(opened.p)
  return opened
}

// Rules four times the harness's, long enough that a different window needs a refit to keep them from scrolling.
export const setLongRules = (p) => p.evaluate(() => {
  const rules = 'Normal sudoku rules apply. Digits along an arrow sum to the digit in its circle. Cells separated by a white dot contain consecutive digits. '
  Framework.app.showMetaInfoUI({ title: 'Rules', author: 'Tester', rules: rules.repeat(4) })
  Framework.app.resize()
})

// The rules pane's width, and whether its text scrolls.
export const rulesWidth = (p) => p.evaluate(() => Math.round(document.querySelector('.puzzle-rules').getBoundingClientRect().width))
export const rulesScroll = (p) => p.evaluate(() => { const r = document.querySelector('.puzzle-rules'); return r.scrollHeight > r.clientHeight })

// Reloads the page and puts all six scripts back, without `ready`, which would set the pen tool on again.
export async function reloadWithScripts (p) {
  await p.reload({ waitUntil: 'load' })
  await startPuzzle(p)
  await injectScripts(p)
  await p.locator('#control-colorbydigit').waitFor({ state: 'visible' })
}

// The crash signals: no page error, console error or skip line, and no notice bar.
export async function assertNoCrash (p, errors) {
  assert.deepEqual(errors, [])
  assert.equal(await p.locator(NOTICE_BAR).count(), 0, 'a script put up its notice bar')
}

// SudokuPad's state of every cell (givens, digits, marks, colors, pen), the string it saves and undoes.
export const cellsState = (p) => p.evaluate(() => Framework.app.puzzle.createState().cells)

// How many notes Text Anywhere draws.
export const noteCount = (p) => p.locator(NOTES).count()

export async function typeDigits (p, [row, col], digits) {
  await p.evaluate(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [row, col])
  await p.keyboard.type(digits)
}

// Opens a page with all six scripts, runs `body(p)`, then checks the crash signals and closes the page.
export async function attack (browser, body) {
  const { context, p, errors } = await openWithAllScripts(browser)
  try {
    await body(p)
    await assertNoCrash(p, errors)
  } finally {
    await context.close()
  }
}

export const emptyCells = (state) => state.flatMap((c, i) => c === '' ? [i] : [])

export const rowCol = (i) => [Math.floor(i / 9), i % 9]

// Undo after Restart loads the progress SudokuPad saves a moment after an action; a player pauses that long, so the save is forced.
export const flushSave = (p) => p.evaluate(() => Framework.app.puzzle.saveProgress(true))

// Colors the cell at [row, col] with SudokuPad's color `color` (1-9), as its color tool does.
export const colorCell = (p, [row, col], color) => p.evaluate(([r, c, arg]) => {
  const a = Framework.app
  a.deselect(); a.select(a.grid.getCell(r, c)); a.act({ type: 'colour', arg }); a.deselect()
}, [row, col, String(color)])

// `point` is in cells from the grid's top left, a cell's middle at .5.
export async function placeNote (p, point, text) {
  const before = await noteCount(p)
  await pickDraw(p)
  await p.mouse.click(...await gridPoint(p, point))
  await p.keyboard.type(text)
  await p.keyboard.press('Escape')
  assert.equal(await settle(() => noteCount(p), before + 1), before + 1, 'the note was placed')
}

// Restart through the confirm dialog, as a player does.
export async function restart (p) {
  await p.click('#control-restart')
  await p.locator('.dialog button').filter({ hasText: /^\s*⟲ Restart/ }).first().click()
  await p.locator('.dialog').waitFor({ state: 'detached' })
}
