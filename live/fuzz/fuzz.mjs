// The fuzz on real SudokuPad: opens the recorded page of `live/page.mjs` with all six scripts installed the way a userscript manager does (at
// DOMContentLoaded of every load, so a reload keeps them), gives the engine (`engine.mjs`) a page of its own for every action list, and reads the crash
// signals (`signals.mjs`) from it. The seed picks the puzzle. Not a check itself; `fuzz.smoke.mjs` is the test, `run.mjs` the command line.
import { setTimeout as sleep } from 'node:timers/promises'
import { ERROR_LOG_KEY, captureConsoleErrors, openPage, startPuzzle } from '../page.mjs'
import { NOTICE_BAR } from '../attacks.mjs'
import { cellCentre, openPenTool, PAGE_BUTTON, undoAll } from '../pen.mjs'
import { closeExtrasEditorWith, openExtrasEditor, openScriptDialog } from '../settings.mjs'
import { finishNote, pickDraw, TEXT_BOX, TEXTS } from '../draw-tool/draw-tool-fixtures.mjs'
import { installAll, puzzleData, puzzleIdFor, openPuzzleId, resumeAfterHistory, startWithTools } from '../puzzles.mjs'
import { runFuzz } from './engine.mjs'
import { readPageState } from './page-state.mjs'
import { plantPatch } from './plants.mjs'
import { newestErrorRecords } from './signals.mjs'

// A 6x6 with 2x3 boxes and six givens: a puzzle that is not a standard 9x9 (#590 Q7).
const SIX_BY_SIX = puzzleData({ id: 'fuzz-6x6', rows: 6, cols: 6, boxRows: 2, boxCols: 3, givens: [[0, 0, 1], [1, 3, 2], [2, 1, 3], [3, 4, 4], [4, 2, 5], [5, 5, 6]], metadata: { title: 'fuzz 6x6' } })

// The puzzles a seed can pick: `live/puzzle-url.txt`'s recording, and the 6x6.
export const PUZZLES = [
  { name: 'recorded 9x9', open: (p) => startWithTools(p) },
  { name: '6x6', open: async (p) => openPuzzleId(p, await puzzleIdFor(p, SIX_BY_SIX)) }
]
export const puzzleFor = (seed) => PUZZLES[Math.abs(seed) % PUZZLES.length]

// The rules text every fuzz page shows: twenty times a short paragraph, which at every fuzz window size Auto Rules Resizer has to shrink below SudokuPad's own font
// to fit and can (the recorded puzzle has no rules of its own).
const RULES_TEXT = Array(20).fill('Normal sudoku rules apply. Digits along an arrow sum to the digit in its circle. Cells separated by a white dot contain consecutive digits.').join(' ')
// A page error thrown after an Escape pressed while a mouse button is down: the planted failure the smoke test and `--plant-escape-error` use.
const plantEscapeError = (p) => p.addInitScript(() => {
  let down = false
  window.addEventListener('mousedown', () => { down = true }, true)
  window.addEventListener('mouseup', () => { down = false }, true)
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && down) setTimeout(() => { throw new Error('planted page error') }, 0) }, true)
})

// Shows the rules text the way a loaded puzzle gets it; the snapshot waits for the fit.
async function showRules (p) {
  await p.evaluate((rules) => {
    Framework.app.showMetaInfoUI({ title: 'fuzz', author: 'fuzz', rules })
    Framework.app.resize()
  }, RULES_TEXT)
}

// A real click on the middle of the element `selector` matches, which waits for nothing about its state: a button that cannot be pressed now (Undo
// with nothing to undo) is pressed like a user presses it, and nothing happens. An element that is not there is a crash: a script lost its control.
async function clickIn (p, selector) {
  const box = await p.locator(selector).first().boundingBox({ timeout: 2000 })
  if (!box) throw new Error(`no ${selector} on the page to click`)
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

// The env `actions.mjs` runs on, over a real page whose free cells are `cells`.
function envFor (p, cells) {
  const openPen = async () => {
    if (!await openPenTool(p)) throw new Error('the pen tool could not be opened')
  }
  const pickNotes = async () => {
    if (await pickDraw(p) !== 'draw') throw new Error('Text Anywhere\'s tool could not be picked')
  }
  return {
    page: p,
    cellPoint: async (i) => (await cellCentre(p, ...cells[i])).slice(0, 2),
    async usePen (color) {
      await openPen()
      await clickIn(p, `.tool-pen button[data-key="${color}"]`)
    },
    useNotes: pickNotes,
    async turnPenPage () {
      await openPen()
      await clickIn(p, PAGE_BUTTON)
    },
    undo: () => clickIn(p, '#control-undo'),
    redo: () => clickIn(p, '#control-redo'),
    undoAll: () => undoAll(p),
    clickColorMode: () => clickIn(p, '#control-colorbydigit'),
    async placeNote (text, i) {
      await pickNotes()
      await p.mouse.click(...await this.cellPoint(i))
      // A click that lands on a note selects it and opens no box; that is a user's click too, not a failure.
      const opened = await p.locator(TEXT_BOX).waitFor({ state: 'attached', timeout: 1500 }).then(() => true, () => false)
      if (opened) await p.keyboard.type(text)
      await finishNote(p)
    },
    noteCentre: () => p.evaluate((selector) => {
      const note = document.querySelector(selector)
      if (!note) return null
      const box = note.getBoundingClientRect()
      return [box.x + box.width / 2, box.y + box.height / 2]
    }, TEXTS),
    async extrasDialog (save) {
      await openExtrasEditor(p)
      await closeExtrasEditorWith(p, save ? 'Save' : 'Cancel')
    },
    resize: (size) => p.setViewportSize(size),
    blurFocus: () => p.evaluate(() => {
      window.dispatchEvent(new Event('blur'))
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    }),
    async reload () {
      await p.reload({ waitUntil: 'load' })
      // The intro dialog (Resume Puzzle) can show after the board does, which `resumeAfterHistory` alone would not wait for.
      await startPuzzle(p)
      await resumeAfterHistory(p)
      await showRules(p)
    },
    async darkPage (color, save) {
      await openScriptDialog(p, 'Dark Page', 'input[type=color]')
      await p.locator('.dialog input[type=color]').fill(color)
      await p.locator('.dialog').getByRole('button', { name: save ? 'Save' : 'Cancel', exact: true }).click()
      await p.locator('.dialog').waitFor({ state: 'detached' })
    }
  }
}

// Opens a page for one action list: SudokuPad past Start Puzzle on `puzzle`, every script installed, the pen and replay tools on.
export async function openTarget (browser, puzzle, { planted, plant }) {
  const { context, p, errors } = await openPage(browser, {
    seed: async (page, collected) => {
      captureConsoleErrors(page, collected)
      if (planted) await plantEscapeError(page)
      await installAll(page, plant && plantPatch(plant))
    }
  })
  try {
    await puzzle.open(p)
    // Tab must have a letter tool to switch to, and the page needs rules for Auto Rules Resizer to fit.
    await p.evaluate(() => Framework.setSetting('toolletter', true))
    await showRules(p)
    const cells = await freeCells(p)
    return {
      env: envFor(p, cells),
      cells,
      snapshot: async () => ({ errors: [...errors], notices: await p.evaluate((selector) => [...document.querySelectorAll(selector)].map((e) => e.textContent.trim()), NOTICE_BAR), page: await readPageState(p) }),
      wait: (ms) => sleep(ms),
      errorLog: async () => newestErrorRecords(await p.evaluate((key) => window.localStorage.getItem(key), ERROR_LOG_KEY)),
      close: () => context.close()
    }
  } catch (error) {
    await context.close()
    throw error
  }
}

// The cells a digit can go in, as `[row, col]`.
const freeCells = (p) => p.evaluate(() => Framework.app.puzzle.cells.filter((c) => !c.given).map((c) => [c.row, c.col]))

// Fuzzes with `seed` (a number; the puzzle is `puzzleFor(seed)`) for `minutes` or `runs` action lists, then shrinks a failure. `path` is a printed replay
// path, `<fast-check path>@<command path>`, which replays that one failure. `planted` plants the Escape-during-drag page error; `plant` (`plants.mjs`) swaps one script's text for a planted bug.
export async function fuzz ({ browser, seed, runs, minutes, shrinkMinutes, path, planted = false, plant }) {
  const puzzle = puzzleFor(seed)
  const probe = await openTarget(browser, puzzle, { planted, plant })
  const cells = probe.cells
  await probe.close()
  const [fcPath, replayPath] = path == null ? [] : path.split('@')
  const result = await runFuzz({
    openTarget: () => openTarget(browser, puzzle, { planted, plant }),
    cells,
    seed,
    runs,
    minutes,
    shrinkMinutes,
    path: fcPath,
    replayPath
  })
  if (!result.failed) return { ...result, puzzle: puzzle.name }
  const replayArgs = ['--seed', result.seed, '--path', `${result.path}@${result.replayPath}`, ...(planted ? ['--plant-escape-error'] : []), ...(plant ? ['--plant', plant.id] : [])]
  return { ...result, puzzle: puzzle.name, path: `${result.path}@${result.replayPath}`, replayCommand: `npm run test:fuzz -- ${replayArgs.join(' ')}` }
}
