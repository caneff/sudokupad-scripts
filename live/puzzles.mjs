/* global Framework, loadFPuzzle */
import assert from 'node:assert/strict'
import { LOAD_MS } from './cache.mjs'
import { GIVENS, MODE_STORAGE_KEY, savedProfiles, SEED } from './color-by-digit/color-by-digit-fixtures.mjs'
import { texts, tool } from './draw-tool/draw-tool-fixtures.mjs'
import { injectAtIdle, startPuzzle, START } from './page.mjs'
import { cellCentre } from './board.mjs'
import { clickUntil, SETTLE_MS } from './settle.mjs'
import { SCRIPT_FILES, scriptSource } from './session.mjs'
import { animationsDone } from './settings.mjs'

const ALL_SCRIPTS = SCRIPT_FILES.map(scriptSource)

const SUDOKUPAD = 'https://sudokupad.app/'

// A 1x1 transparent PNG.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

// Registers every script to run at DOMContentLoaded on every load of `p`, as Tampermonkey runs them at document-idle.
// Tag Manager's script is answered with an empty one: the harness aborts it, and SudokuPad loads it again on a second
// puzzle in a tab (it has saved progress by then) and leaves the abort an uncaught `Event` rejection that no script caused.
// The two pictures of the solved dialog are answered with an empty one too: the recording never loaded the dialog, and a request it lacks fails the run.
// `patch(file, code)` returns the text to inject for a script; the files on disk are never touched.
export async function installAll (p, patch = (file, code) => code) {
  await p.route(/googletagmanager/, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  await p.route(/\/images\/(?:sven)?toby-icon\.png/, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }))
  for (const [i, code] of ALL_SCRIPTS.entries()) await injectAtIdle(p, patch(SCRIPT_FILES[i], code))
}

// Saves Color by Digit's Odd/Even profile in Cell mode before the page loads, so odd digits take one color and even digits another.
export const seedOddEvenCells = (p) => {
  const entries = Object.entries({ ...savedProfiles(SEED), [MODE_STORAGE_KEY]: 'cell' }).map(([k, v]) => [k, JSON.stringify(v)])
  return p.addInitScript((list) => list.forEach(([k, v]) => window.localStorage.setItem(k, v)), entries)
}

export async function startWithTools (p) {
  await startPuzzle(p)
  await enableTools(p)
}

// Turns on the pen and replay tools, which a page load leaves off, and waits for every script's control.
async function enableTools (p) {
  await p.evaluate(() => { Framework.setSetting('toolpen', true); Framework.setSetting('toolreplay', true) })
  await p.locator('#control-pen').waitFor({ state: 'visible' })
  await p.locator('#control-replay').waitFor({ state: 'visible' })
  await p.locator('#control-draw').waitFor({ state: 'visible' })
  await p.locator('#control-colorbydigit').waitFor({ state: 'visible' })
}

// The recorded puzzle's givens (the classic 9x9) and its solution.
export const CLASSIC_SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
export const CLASSIC_GIVENS = [...GIVENS].flatMap((d, i) => d === '0' ? [] : [[Math.floor(i / 9), i % 9, Number(d)]])

// A puzzle's data; `givens` are `[row, col, value]` and `extra` (overlays, foglight) is merged in.
// An inline `scl` puzzle has no id of its own and SudokuPad then saves its progress under `progress_undefined`, shared by every such
// puzzle, so each built puzzle carries its own `id`.
export function puzzleData ({ id = 'live-attack', rows = 9, cols = 9, boxRows = 3, boxCols = 3, givens = [], metadata = { title: 'live attack' }, ...extra } = {}) {
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({})))
  for (const [r, c, value] of givens) cells[r][c] = { value }
  const regions = []
  for (let r0 = 0; r0 < rows; r0 += boxRows) {
    for (let c0 = 0; c0 < cols; c0 += boxCols) {
      const region = []
      for (let r = r0; r < Math.min(rows, r0 + boxRows); r++) for (let c = c0; c < Math.min(cols, c0 + boxCols); c++) region.push([r, c])
      regions.push(region)
    }
  }
  return { id, size: Math.max(rows, cols), metadata, cells, regions, ...extra }
}

// The id SudokuPad opens `data` under: `scl` and the page's own compression, read from the loaded page.
export async function puzzleIdFor (p, data) {
  return p.evaluate((json) => 'scl' + loadFPuzzle.compressPuzzle(json), JSON.stringify(data))
}

export async function openPuzzleId (p, id) {
  await p.goto(SUDOKUPAD + id, { waitUntil: 'load', timeout: LOAD_MS })
  await startWithTools(p)
}

export const boardOf = async (p) => ({
  ...await p.evaluate(() => {
    const cells = Framework.app.puzzle.cells
    const at = (c) => `${c.row},${c.col}`
    return {
      id: window.location.pathname,
      entered: cells.filter((c) => !c.given && c.propGet('normal')).map((c) => `${at(c)}:${c.propGet('normal')}`),
      corner: cells.filter((c) => c.propGet('corner').length).map((c) => `${at(c)}:${c.propGet('corner').join('')}`),
      centre: cells.filter((c) => c.propGet('centre').length).map((c) => `${at(c)}:${c.propGet('centre').join('')}`),
      colours: cells.filter((c) => (c.colours || []).length).map((c) => `${at(c)}:${c.colours.join('')}`),
      pen: cells.flatMap((c) => c.pen.map((v) => `${at(c)}:${v}`)).sort()
    }
  }),
  notes: await texts(p)
})

// Where the attacks put a note, in cells from the grid's top left, and a drag that starts on the overlay beside the dialog over the board.
export const NOTE_POINT = [8.2, 2.25]
export const OVERLAY_DRAG = [[4.5, 0.6], [4.5, 1.5]]

export const dialogWith = (p, text) => p.locator('.dialog', { hasText: text })

// SudokuPad's pause dialog: opened by the timer button, closed by its Stay Paused or Resume button.
export const PAUSED = 'Game paused'
export async function pauseGame (p) {
  await p.click('.timer-control')
  await dialogWith(p, PAUSED).waitFor({ state: 'visible' })
  await dialogAtRest(p)
}
export async function closePauseDialog (p, button) {
  await dialogWith(p, PAUSED).locator('button', { hasText: button }).click()
  await p.locator('.dialog').waitFor({ state: 'detached' })
}

export async function clickCell (p, row, col) {
  const [x, y] = await cellCentre(p, row, col)
  await p.mouse.click(x, y)
}

// Picks the tool whose button is `button` and returns once SudokuPad has it; a click in the first moments after a script is injected is dead.
export async function useTool (p, button) {
  const name = button.replace('#control-', '')
  assert.equal(await clickUntil(() => p.click(button), () => tool(p), name, SETTLE_MS), name)
}

export async function resumeAfterHistory (p) {
  const state = await p.waitForFunction(([source, flags]) => {
    if (typeof Framework === 'undefined' || !Framework.app?.puzzle?.cells?.length) return false
    const start = [...document.querySelectorAll('button')].find((b) => new RegExp(source, flags).test(b.textContent) && b.offsetParent)
    return start ? 'start' : (document.querySelector('#control-undo')?.offsetParent ? 'ready' : false)
  }, [START.source, START.flags], { timeout: LOAD_MS })
  if (await state.jsonValue() === 'start') await startPuzzle(p)
  await enableTools(p)
}

// Waits for the open dialog to stop sliding in: a point read or a click before it ends lands off.
export const dialogAtRest = async (p) => {
  await p.locator('.dialog').waitFor({ state: 'visible' })
  await animationsDone(p.locator('.dialog'))
}
