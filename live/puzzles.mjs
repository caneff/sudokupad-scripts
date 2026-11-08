// Shared by the live attacks that change the puzzle or its shape: every script installed the way a userscript manager does, puzzles other than
// `live/puzzle-url.txt` built as data and opened by their id, and the board read back. Not a check itself, so `live/**/*.live.mjs` skips it.
import { readdirSync, readFileSync } from 'node:fs'
import { LOAD_MS } from './cache.mjs'
import { GIVENS, MODE_STORAGE_KEY, savedProfiles, SEED } from './color-by-digit/color-by-digit-fixtures.mjs'
import { injectAtIdle, startPuzzle } from './page.mjs'

const ROOT = new URL('../', import.meta.url)
const SCRIPT_FILES = readdirSync(ROOT).filter((f) => f.endsWith('.user.js')).sort()
export const ALL_SCRIPTS = SCRIPT_FILES.map((f) => readFileSync(new URL(f, ROOT), 'utf8'))

export const SUDOKUPAD = 'https://sudokupad.app/'

// A 1x1 transparent PNG.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

// Registers every script to run at DOMContentLoaded on every load of `p`, as Tampermonkey runs them at document-idle.
// Tag Manager's script is answered with an empty one: the harness aborts it, and SudokuPad loads it again on a second
// puzzle in a tab (it has saved progress by then) and leaves the abort an uncaught `Event` rejection that no script caused.
// The two pictures of the solved dialog are answered with an empty one too: the recording never loaded the dialog, and a request it lacks fails the run.
export async function installAll (p) {
  await p.route(/googletagmanager/, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  await p.route(/\/images\/(?:sven)?toby-icon\.png/, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }))
  for (const code of ALL_SCRIPTS) await injectAtIdle(p, code)
}

// Saves Color by Digit's Odd/Even profile in Cell mode before the page loads, so odd digits take one color and even digits another.
export const seedOddEvenCells = (p) => {
  const entries = Object.entries({ ...savedProfiles(SEED), [MODE_STORAGE_KEY]: 'cell' }).map(([k, v]) => [k, JSON.stringify(v)])
  return p.addInitScript((list) => list.forEach(([k, v]) => window.localStorage.setItem(k, v)), entries)
}

// Starts the puzzle on the page and turns on the pen and replay tools, so every script has its control.
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

// A puzzle's data: `rows` by `cols` cells in boxes `boxRows` by `boxCols`, `givens` as `[row, col, value]`, and `extra` merged in.
// An inline `scl` puzzle has no id of its own and SudokuPad then saves its progress under `progress_undefined`, shared by every such
// puzzle, so each built puzzle carries its own `id`.
export function puzzleData ({ id = 'live-attack', rows = 9, cols = 9, boxRows = 3, boxCols = 3, givens = [], title = 'live attack', ...extra } = {}) {
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
  return { id, size: Math.max(rows, cols), metadata: { title }, cells, regions, ...extra }
}

// The id SudokuPad opens `data` under: `scl` and the page's own compression, read from the loaded page.
export async function puzzleIdFor (p, data) {
  await p.addScriptTag({ content: 'window.__compressPuzzle = loadFPuzzle.compressPuzzle' })
  return p.evaluate((json) => 'scl' + window.__compressPuzzle(json), JSON.stringify(data))
}

// Goes to the puzzle with `id` in the same tab and starts it (Resume or Continue when the page remembers it).
export async function openPuzzleId (p, id, { start = startWithTools } = {}) {
  await p.goto(SUDOKUPAD + id, { waitUntil: 'load', timeout: LOAD_MS })
  await start(p)
}

// The board as a solver sees it: entered digits, corner and centre marks, cell colors (the color tool's and Color by Digit's),
// the pen entries, and the Text Anywhere notes' texts.
export const boardOf = (p) => p.evaluate(() => ({
  id: window.location.pathname,
  entered: Framework.app.puzzle.cells.filter((c) => !c.given && c.propGet('normal')).map((c) => `${c.row},${c.col}:${c.propGet('normal')}`),
  corner: Framework.app.puzzle.cells.filter((c) => c.propGet('corner').length).map((c) => `${c.row},${c.col}:${c.propGet('corner').join('')}`),
  colours: Framework.app.puzzle.cells.filter((c) => (c.colours || []).length).map((c) => `${c.row},${c.col}:${c.colours.join('')}`),
  pen: Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => `${c.row},${c.col}:${v}`)).sort(),
  notes: [...document.querySelectorAll('#draw-tool-layer .draw-tool-text:not(.draw-tool-textbox)')].map((t) => t.textContent)
}))

// Returns once the page after a Back or a Forward shows its puzzle, pressing Start Puzzle (or Continue) when the page asks for it.
export async function resumeAfterHistory (p) {
  const state = await p.waitForFunction(() => {
    if (typeof Framework === 'undefined' || !Framework.app?.puzzle?.cells?.length) return false
    const start = [...document.querySelectorAll('button')].find((b) => /Start Puzzle|Continue|Resume/i.test(b.textContent) && b.offsetParent)
    return start ? 'start' : (document.querySelector('#control-undo')?.offsetParent ? 'ready' : false)
  }, null, { timeout: LOAD_MS })
  if (await state.jsonValue() === 'start') await startPuzzle(p)
  await enableTools(p)
}

// Waits for the open dialog to stop sliding in: SudokuPad animates the dialog and its overlay, and a point read or a click before they end lands off.
export const dialogAtRest = async (p) => {
  await p.locator('.dialog').waitFor({ state: 'visible' })
  await p.locator('.dialog').evaluate((el) => Promise.all([el, el.closest('.dialog-overlay')].flatMap((e) => e.getAnimations()).map((a) => a.finished)))
}
