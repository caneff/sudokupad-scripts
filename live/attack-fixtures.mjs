// Shared by the attacks that cross scripts (`live/attacks-*.live.mjs`, #628 from #590): a page with Text Anywhere, Pen Tool Extras and
// Color by Digit installed together, since an attack on input, storage or the display hits whichever script is listening. Not a
// check itself, so `live/**/*.live.mjs` skips it.
/* global Framework */
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { captureConsoleErrors, openPage, startPuzzle } from './page.mjs'
import { openPenTool } from './pen.mjs'
import { settle } from './settle.mjs'
import * as draw from './draw-tool/draw-tool-fixtures.mjs'

const read = (file) => readFileSync(new URL(`../${file}.user.js`, import.meta.url), 'utf8')
// The three scripts an attack installs, by name.
export const SOURCES = { text: read('draw-tool'), pen: read('pen-tool-extras'), color: read('color-by-digit') }
// The button each script adds, which shows once the script has started.
const BUTTONS = { text: '#control-draw', pen: '#control-pen', color: '#control-colorbydigit' }

// Starts the puzzle on `p` and installs the scripts named in `names` (keys of SOURCES) after Start Puzzle, returning once each one's button shows.
export async function installScripts (p, names = Object.keys(SOURCES)) {
  await startPuzzle(p)
  for (const name of names) await p.addScriptTag({ content: SOURCES[name] })
  if (names.includes('pen')) await p.evaluate(() => Framework.setSetting('toolpen', true))
  for (const name of names) await p.locator(BUTTONS[name]).waitFor({ state: 'visible' })
}

// A fresh context and page with `names` installed, the page's console errors collected beside its uncaught errors and skip lines.
export async function openAttackPage (browser, { names, contextOptions, seed = captureConsoleErrors } = {}) {
  const opened = await openPage(browser, { contextOptions, seed })
  await installScripts(opened.p, names)
  return opened
}

// The crash signals: no uncaught error, console error or skip line, with `why` naming the step.
export const assertClean = (errors, why = 'the page') => assert.deepEqual(errors, [], `${why} shows no uncaught error, console error or skip line`)

// SudokuPad's tool `name` made current with its own button.
export const pickTool = async (p, name) => {
  if (name === 'pen') await openPenTool(p)
  else if (name === 'draw') await draw.pickDraw(p)
  else {
    await p.click(`#control-${name}`)
    assert.equal(await settle(() => draw.tool(p), name), name, `${name} is the current tool`)
  }
}

// The first cell with no given, as [row, column]: an entry made in it shows in its own value, marks, colours or pen.
export const emptyCell = (p) => p.evaluate(() => {
  const cell = Framework.app.puzzle.cells.find((c) => !c.given)
  return [cell.row, cell.col]
})

// What the board holds in cell [row, col], as one string.
export const cellState = (p, [row, col]) => p.evaluate(([r, c]) => {
  const cell = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c)
  return JSON.stringify({ value: cell.value ?? null, marks: cell.pencilmarks, colours: cell.colours, pen: cell.pen })
}, [row, col])
