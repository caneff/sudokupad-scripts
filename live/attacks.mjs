// Not a check itself, so `live/**/*.live.mjs` skips it.
import assert from 'node:assert/strict'
import { pickDraw } from './draw-tool/draw-tool-fixtures.mjs'
import { captureConsoleErrors } from './page.mjs'
import { SCRIPTS } from './scripts.mjs'
import { addScripts, openWith, reloadWith } from './session.mjs'

export const NOTICE_BAR = '#sudokupad-scripts-notices [data-script]'
export const NOTES = '#draw-tool-layer .draw-tool-text'

const FILES = SCRIPTS.map((script) => script.file)

// Waits for each script to be up. Pen Tool Extras' `ready` leaves the pen tool current, so this ends on the normal tool, where
// a player starts. Picking Text Anywhere's tool first waits out the moment its button's click is dead.
async function allReady (p) {
  for (const script of SCRIPTS) await script.ready(p)
  await pickDraw(p)
  await p.click('#control-normal')
}

export async function loadScripts (p) {
  await addScripts(p, FILES)
  await allReady(p)
}

export async function openWithAllScripts (browser, { seed, ...options } = {}) {
  const opened = await openWith(browser, FILES, {
    ...options,
    seed: async (p, errors) => { captureConsoleErrors(p, errors); if (seed) await seed(p, errors) }
  })
  await allReady(opened.p)
  return opened
}

// Several lines at SudokuPad's own width.
export const setLongRules = (p) => p.evaluate(() => {
  const rules = 'Normal sudoku rules apply. Digits along an arrow sum to the digit in its circle. Cells separated by a white dot contain consecutive digits. '
  Framework.app.showMetaInfoUI({ title: 'Rules', author: 'Tester', rules: rules.repeat(4) })
  Framework.app.resize()
})

export const rulesWidth = (p) => p.evaluate(() => Math.round(document.querySelector('.puzzle-rules').getBoundingClientRect().width))
export const rulesScroll = (p) => p.evaluate(() => { const r = document.querySelector('.puzzle-rules'); return r.scrollHeight > r.clientHeight })

// Reloads the page and puts all the scripts back, without `ready`, which would set the pen tool on again.
export async function reloadWithScripts (p) {
  await reloadWith(p, FILES)
  await p.locator('#control-colorbydigit').waitFor({ state: 'visible' })
}

export async function assertNoCrash (p, errors) {
  assert.deepEqual(errors, [])
  assert.equal(await p.locator(NOTICE_BAR).count(), 0, 'a script put up its notice bar')
}

// SudokuPad's state of every cell (givens, digits, marks, colors, pen), the string it saves and undoes.
export const cellsState = (p) => p.evaluate(() => Framework.app.puzzle.createState().cells)

export const noteCount = (p) => p.locator(NOTES).count()

export async function typeDigits (p, [row, col], digits) {
  await p.evaluate(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [row, col])
  await p.keyboard.type(digits)
}

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

export const colorCell = (p, [row, col], color) => p.evaluate(([r, c, arg]) => {
  const a = Framework.app
  a.deselect(); a.select(a.grid.getCell(r, c)); a.act({ type: 'colour', arg }); a.deselect()
}, [row, col, String(color)])
