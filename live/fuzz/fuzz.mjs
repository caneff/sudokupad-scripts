// The fuzz on real SudokuPad: opens the recorded page of `live/page.mjs` with all six scripts installed the way a userscript manager does (at
// DOMContentLoaded of every load, so a reload keeps them), gives the engine (`engine.mjs`) a page of its own for every action list, and reads the crash
// signals (`signals.mjs`) from it. The seed picks the puzzle. Not a check itself; `fuzz.smoke.mjs` is the test, `run.mjs` the command line.
import { readFileSync } from 'node:fs'
import { captureConsoleErrors, openPage, startPuzzle } from '../page.mjs'
import { cellCentre, openPenTool } from '../pen.mjs'
import { openScriptDialog } from '../settings.mjs'
import { DRAW_BUTTON, finishNote, TEXT_BOX, TEXTS } from '../draw-tool/draw-tool-fixtures.mjs'
import { installAll, puzzleData, puzzleIdFor, openPuzzleId, resumeAfterHistory, startWithTools } from '../puzzles.mjs'
import { clickUntil, SETTLE_MS } from '../settle.mjs'
import { runFuzz } from './engine.mjs'
import { newestErrorRecords, NOTICE_SELECTOR } from './signals.mjs'

// The key the scripts' guard writes the shared error log under, read from the shared module so this cannot drift from it.
const ERROR_LOG_KEY = /const ERROR_LOG_KEY = '([^']+)'/.exec(readFileSync(new URL('../../lib/sudokupad.js', import.meta.url), 'utf8'))[1]

// A 6x6 with 2x3 boxes and six givens: a puzzle that is not a standard 9x9 (#590 Q7).
const SIX_BY_SIX = puzzleData({ id: 'fuzz-6x6', rows: 6, cols: 6, boxRows: 2, boxCols: 3, givens: [[0, 0, 1], [1, 3, 2], [2, 1, 3], [3, 4, 4], [4, 2, 5], [5, 5, 6]], metadata: { title: 'fuzz 6x6' } })

// The puzzles a seed can pick: `live/puzzle-url.txt`'s recording, and the 6x6.
export const PUZZLES = [
  { name: 'recorded 9x9', open: (p) => startWithTools(p) },
  { name: '6x6', open: async (p) => openPuzzleId(p, await puzzleIdFor(p, SIX_BY_SIX)) }
]
export const puzzleFor = (seed) => PUZZLES[Math.abs(seed) % PUZZLES.length]

// A page error thrown after an Escape pressed while a mouse button is down: the planted failure the smoke test and `--plant-escape-error` use.
const plantEscapeError = (p) => p.addInitScript(() => {
  let down = false
  window.addEventListener('mousedown', () => { down = true }, true)
  window.addEventListener('mouseup', () => { down = false }, true)
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && down) setTimeout(() => { throw new Error('planted page error') }, 0) }, true)
})

// A real click on the middle of the element `selector` matches, which waits for nothing: a button that cannot be pressed now (Undo with nothing to undo)
// is pressed like a user presses it, and nothing happens. Returns false when there is no such element.
async function clickIn (p, selector) {
  const box = await p.locator(selector).first().boundingBox({ timeout: 2000 }).catch(() => null)
  if (!box) return false
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  return true
}

// The env `actions.mjs` runs on, over a real page whose free cells are `cells`.
function envFor (p, cells) {
  const useTool = (button, name) => clickUntil(() => clickIn(p, button), () => p.evaluate(() => Framework.app.tool), name, SETTLE_MS)
  return {
    page: p,
    cellPoint: async (i) => (await cellCentre(p, ...cells[i])).slice(0, 2),
    async usePen (color) {
      await openPenTool(p)
      await clickIn(p, `.tool-pen button[data-key="${color}"]`)
    },
    useNotes: () => useTool(DRAW_BUTTON, 'draw'),
    turnPenPage: () => clickIn(p, '.pen-tool-extras-page'),
    undo: () => clickIn(p, '#control-undo'),
    redo: () => clickIn(p, '#control-redo'),
    clickColorMode: () => clickIn(p, '#control-colorbydigit'),
    async placeNote (text, i) {
      await useTool(DRAW_BUTTON, 'draw')
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
export async function openTarget (browser, puzzle, { planted }) {
  const { context, p, errors } = await openPage(browser, {
    seed: async (page, collected) => {
      captureConsoleErrors(page, collected)
      if (planted) await plantEscapeError(page)
      await installAll(page)
    }
  })
  try {
    await puzzle.open(p)
    const cells = await freeCells(p)
    return {
      env: envFor(p, cells),
      cells,
      snapshot: async () => ({ errors: [...errors], notices: await p.evaluate((selector) => [...document.querySelectorAll(selector)].map((e) => e.textContent.trim()), NOTICE_SELECTOR) }),
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
// path, `<fast-check path>@<command path>`, which replays that one failure. `planted` plants the Escape-during-drag page error.
export async function fuzz ({ browser, seed, runs, minutes, shrinkMinutes, path, planted = false }) {
  const puzzle = puzzleFor(seed)
  const probe = await openTarget(browser, puzzle, { planted })
  const cells = probe.cells
  await probe.close()
  const [fcPath, replayPath] = path == null ? [] : path.split('@')
  const result = await runFuzz({
    openTarget: () => openTarget(browser, puzzle, { planted }),
    cells,
    seed,
    runs,
    minutes,
    shrinkMinutes,
    path: fcPath,
    replayPath
  })
  if (!result.failed) return { ...result, puzzle: puzzle.name }
  const replayArgs = ['--seed', result.seed, '--path', `${result.path}@${result.replayPath}`, ...(planted ? ['--plant-escape-error'] : [])]
  return { ...result, puzzle: puzzle.name, path: `${result.path}@${result.replayPath}`, replayCommand: `npm run test:fuzz -- ${replayArgs.join(' ')}` }
}
