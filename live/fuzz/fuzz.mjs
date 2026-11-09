// The fuzz on real SudokuPad: opens a page of `live/page.mjs` (on the puzzle a list names) with all six scripts installed the way a userscript manager does (at
// DOMContentLoaded of every load, so a reload keeps them), gives the engine (`engine.mjs`) a page of its own for every action list, and reads the crash
// signals (`signals.mjs`) from it. Each list names its puzzle (`puzzle-set.mjs`, #679). Not a check itself; `fuzz.smoke.mjs` is the test, `run.mjs` the command line.
import { setTimeout as sleep } from 'node:timers/promises'
import { ERROR_LOG_KEY, captureConsoleErrors, openPage, startPuzzle } from '../page.mjs'
import { NOTICE_BAR } from '../attacks.mjs'
import { cellCentre, finishNote, gridPoint, undoAll } from '../board.mjs'
import { openPenTool, padValues, PAGE_BUTTON, PAGE_THREE, PAGE_TURN_MS, setInputValue } from '../pen.mjs'
import { closeDialogWith, closeExtrasEditorWith, EXTRAS_EDITOR, openExtrasEditor, openScriptDialog } from '../settings.mjs'
import { BACKGROUND_BUTTON, OPACITY_SLIDER as NOTE_OPACITY_SLIDER, SETTINGS_BUTTON, SETTINGS_EDITOR, SIZE_SLIDER as NOTE_SIZE_SLIDER, pickTextAnywhere, TEXT_BOX, TEXTS } from '../text-anywhere/text-anywhere-fixtures.mjs'
import { clickUntil, SETTLE_MS } from '../settle.mjs'
import { installAll, puzzleIdFor, openPuzzleId, resumeAfterHistory, startWithTools } from '../puzzles.mjs'
import { runFuzz, runScript } from './engine.mjs'
import { scriptedList } from './actions.mjs'
import { readPageState } from './page-state.mjs'
import { plantPatch } from './plants.mjs'
import { FUZZ_PUZZLES, insideGrid, rulesTextFor } from './puzzle-set.mjs'
import { newestErrorRecords } from './signals.mjs'

const plantEscapeError = (p) => p.addInitScript(() => {
  let down = false
  window.addEventListener('mousedown', () => { down = true }, true)
  window.addEventListener('mouseup', () => { down = false }, true)
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && down) setTimeout(() => { throw new Error('planted page error') }, 0) }, true)
})

// Shows the puzzle's rules text the way a loaded puzzle gets it; the snapshot waits for the fit. A puzzle with no rules text shows none.
async function showRules (p, puzzle) {
  const rules = rulesTextFor(puzzle)
  if (rules === null) return
  await p.evaluate((text) => {
    Framework.app.showMetaInfoUI({ title: 'fuzz', author: 'fuzz', rules: text })
    Framework.app.resize()
  }, rules)
}

// Each slider `actions.mjs` names: its selector, and whether the pen tool or Text Anywhere's tool shows it. Pen Tool Extras' ids are typed out, as the live tests type them.
const SLIDER_SELECTORS = {
  'pen thickness': { selector: '#pen-tool-extras-thickness', tool: 'pen' },
  'pen opacity': { selector: '#pen-tool-extras-opacity', tool: 'pen' },
  'note size': { selector: NOTE_SIZE_SLIDER, tool: 'notes' },
  'note transparency': { selector: NOTE_OPACITY_SLIDER, tool: 'notes' }
}
// A press on a track this far in from its end is on the track, not on the edge pixel that belongs to the next element.
const TRACK_MARGIN_PX = 6

// A real click on the middle of the element `selector` matches, which waits for nothing about its state: a button that cannot be pressed now (Undo
// with nothing to undo) is pressed like a user presses it, and nothing happens. An element that is not there is a crash: a script lost its control.
async function clickIn (p, selector) {
  const box = await p.locator(selector).first().boundingBox({ timeout: 2000 })
  if (!box) throw new Error(`no ${selector} on the page to click`)
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

// The env `actions.mjs` runs on, over a real page showing `puzzle`.
function envFor (p, puzzle) {
  const openPen = async () => {
    if (!await openPenTool(p)) throw new Error('the pen tool could not be opened')
  }
  const pickNotes = async () => {
    if (await pickTextAnywhere(p) !== 'textanywhere') throw new Error('Text Anywhere\'s tool could not be picked')
  }
  // Opens the tool that shows `name`'s slider and returns the slider's locator.
  const sliderFor = async (name) => {
    const { selector, tool } = SLIDER_SELECTORS[name]
    if (tool === 'pen') await openPen()
    else await pickNotes()
    return p.locator(selector)
  }
  return {
    page: p,
    // A target outside the grid is where the puzzle's clues are: the middle of the cell that would be there. SudokuPad's own links sit over a corner of the board
    // (a click there leaves the page, which no script did), so a point under a link is the nearest cell of the grid instead.
    cellPoint: async (i) => {
      const [row, col] = puzzle.cells[i]
      if (insideGrid(puzzle, [row, col])) return (await cellCentre(p, row, col)).slice(0, 2)
      const point = await gridPoint(p, [row + 0.5, col + 0.5])
      const onLink = await p.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('a')), point)
      return !onLink ? point : (await cellCentre(p, Math.min(Math.max(row, 0), puzzle.rows - 1), Math.min(Math.max(col, 0), puzzle.cols - 1))).slice(0, 2)
    },
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
    async extrasSettings (values, save) {
      await openExtrasEditor(p)
      for (const [key, value] of Object.entries(values)) await setInputValue(p.locator(`${EXTRAS_EDITOR} input[data-setting="${key}"]`), value)
      await closeExtrasEditorWith(p, save ? 'Save' : 'Cancel')
    },
    async sliderPoint (name, fraction) {
      const box = await (await sliderFor(name)).boundingBox({ timeout: 2000 })
      if (!box) throw new Error(`the ${name} slider is not on the page`)
      return [box.x + TRACK_MARGIN_PX + (box.width - 2 * TRACK_MARGIN_PX) * fraction, box.y + box.height / 2]
    },
    async focusSlider (name) { await (await sliderFor(name)).focus() },
    async leaveSlider (name) { await p.locator(SLIDER_SELECTORS[name].selector).evaluate((el) => el.blur()) },
    async noteBoxDialog (choice, color, save) {
      await pickNotes()
      await p.click(SETTINGS_BUTTON)
      await p.locator(SETTINGS_EDITOR).waitFor({ state: 'visible' })
      await p.locator(`${SETTINGS_EDITOR} button[data-role="box-pick"][data-value="${choice}"]`).click()
      if (choice === 'custom') await p.locator(`${SETTINGS_EDITOR} input[data-role="box-custom"]`).fill(color)
      await closeDialogWith(p, save ? 'Save' : 'Cancel', SETTINGS_EDITOR)
    },
    async setNoteBackground (on) {
      await pickNotes()
      if (await p.locator(BACKGROUND_BUTTON).getAttribute('aria-pressed') !== String(on)) await clickIn(p, BACKGROUND_BUTTON)
    },
    async useArrowPen (color) {
      await openPen()
      // The page button is pressed until the pad shows the arrow lines page; a pen with no such page is a crash.
      const shown = await clickUntil(() => clickIn(p, PAGE_BUTTON), () => padValues(p), PAGE_THREE, SETTLE_MS, PAGE_TURN_MS)
      if (shown !== PAGE_THREE) throw new Error(`the pen page button never reached the arrow lines page; the pad shows ${shown}`)
      await clickIn(p, `.tool-pen button[data-key="${color}"]`)
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
      await showRules(p, puzzle)
    },
    async darkPage (color, save) {
      await openScriptDialog(p, 'Dark Page', 'input[type=color]')
      await p.locator('.dialog input[type=color]').fill(color)
      await p.locator('.dialog').getByRole('button', { name: save ? 'Save' : 'Cancel', exact: true }).click()
      await p.locator('.dialog').waitFor({ state: 'detached' })
    }
  }
}

export async function openTarget (browser, puzzle, { planted, plant }) {
  const { context, p, errors } = await openPage(browser, {
    seed: async (page, collected) => {
      captureConsoleErrors(page, collected)
      if (planted) await plantEscapeError(page)
      await installAll(page, plant && plantPatch(plant))
    }
  })
  try {
    if (puzzle.data) await openPuzzleId(p, await puzzleIdFor(p, puzzle.data))
    else await startWithTools(p)
    // Tab must have a letter tool to switch to, and a puzzle with rules text shows it for Auto Rules Resizer to fit.
    await p.evaluate(() => Framework.setSetting('toolletter', true))
    await showRules(p, puzzle)
    // The puzzle set says which cells are free: a page that disagrees would send every action to the wrong cell.
    const onPage = await freeCells(p)
    if (JSON.stringify(sortedCells(onPage)) !== JSON.stringify(sortedCells(puzzle.free))) throw new Error(`the ${puzzle.name} puzzle opened with ${onPage.length} free cells that are not the ${puzzle.free.length} of puzzle-set.mjs`)
    return {
      env: envFor(p, puzzle),
      snapshot: async () => ({ errors: [...errors], notices: await p.evaluate((selector) => [...document.querySelectorAll(selector)].map((e) => e.textContent.trim()), NOTICE_BAR), page: await readPageState(p, { expectRules: rulesTextFor(puzzle) !== null }) }),
      wait: (ms) => sleep(ms),
      errorLog: async () => newestErrorRecords(await p.evaluate((key) => window.localStorage.getItem(key), ERROR_LOG_KEY)),
      close: () => context.close()
    }
  } catch (error) {
    await context.close()
    throw error
  }
}

const freeCells = (p) => p.evaluate(() => Framework.app.puzzle.cells.filter((c) => !c.given).map((c) => [c.row, c.col]))
const sortedCells = (cells) => [...cells].sort(([r1, c1], [r2, c2]) => r1 - r2 || c1 - c2)

// Fuzzes with `seed` (a number) for `minutes` or `runs` action lists, each on a puzzle of the set that the list names, then shrinks a failure. `path` is a printed replay
// path, `<fast-check path>@<command path>`, which replays that one failure on its puzzle. `planted` plants the Escape-during-drag page error; `plant` (`plants.mjs`) swaps one script's text for a planted bug.
export async function fuzz ({ browser, seed, runs, minutes, shrinkMinutes, path, planted = false, plant }) {
  const [fcPath, replayPath] = path == null ? [] : path.split('@')
  const result = await runFuzz({
    openTarget: (puzzle) => openTarget(browser, puzzle, { planted, plant }),
    puzzles: FUZZ_PUZZLES,
    seed,
    runs,
    minutes,
    shrinkMinutes,
    path: fcPath,
    replayPath
  })
  if (!result.failed) return result
  const replayArgs = ['--seed', result.seed, '--path', `${result.path}@${result.replayPath}`, ...(planted ? ['--plant-escape-error'] : []), ...(plant ? ['--plant', plant.id] : [])]
  return { ...result, path: `${result.path}@${result.replayPath}`, replayCommand: `npm run test:fuzz -- ${replayArgs.join(' ')}` }
}

// Runs one list written by hand (`steps`: `[kind, arg]`, `actions.mjs`) on `puzzle` with the checks of every run; resolves to nothing, or throws the failure.
export function fuzzScripted ({ browser, puzzle, steps }) {
  return runScript({ openTarget: (p) => openTarget(browser, p, { planted: false }), puzzle, actions: scriptedList(puzzle, steps) })
}
