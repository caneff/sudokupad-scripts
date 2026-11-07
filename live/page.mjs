// Shared by the live checks: opening SudokuPad's puzzle page and getting it past Start Puzzle, with a script
// injected at any of the three times a userscript can load. Not a check itself, so `live/*.live.mjs` skips it.

import { LOAD_MS, puzzleUrl, routeSudokuPad, START } from './cache.mjs'

export { START }

export const PUZZLE_URL = puzzleUrl()

// The injection times a check can ask for: a script that waits on SudokuPad's own startup behaves differently at each.
export const MODES = ['document-idle', 'before-start', 'after-start']

const VIEWPORT = { width: 1200, height: 900 }
const FRAMEWORK_MS = 30000

// A page of `context` served from the recording, with the page's errors collected into the returned `errors`.
export async function newPage (context) {
  const errors = []
  const p = await context.newPage()
  p.on('pageerror', (e) => errors.push(String(e)))
  await routeSudokuPad(p)
  return { p, errors }
}

// Collects the page's `console.error` lines into `errors`, leaving out a resource that failed to load, which a
// replay's aborted trackers print. Fits `openPage`'s `seed` as it is. `take(text)`, when given, is asked first:
// a line it returns true for is the caller's, and stays out of `errors`.
export const captureConsoleErrors = (page, errors, take = () => false) => {
  page.on('console', (m) => {
    if (m.type() !== 'error' || /Failed to load resource/.test(m.text()) || take(m.text())) return
    errors.push(`console.error: ${m.text()}`)
  })
}

// Runs the code at DOMContentLoaded, before the page's own scripts finish, and records in `window.__fwAtIdle`
// what `Framework` looked like at that moment.
export const injectAtIdle = (p, code) => p.addInitScript((src) => {
  document.addEventListener('DOMContentLoaded', () => {
    window.__fwAtIdle = typeof Framework + '/' + (typeof Framework !== 'undefined' && typeof Framework.getApp)
    const s = document.createElement('script')
    s.textContent = src
    document.documentElement.appendChild(s)
  })
}, code)

// Loads the puzzle page and returns when it has loaded.
export const gotoPuzzle = (p) => p.goto(PUZZLE_URL, { waitUntil: 'load', timeout: LOAD_MS })

// Opens a context (1200x900 unless `contextOptions` say otherwise) with one page on the puzzle, served from the
// recording. `seed(p, errors)` runs before the page loads, for init scripts and listeners that must see the load.
// `injection` is `{ mode, code }`: with mode `document-idle` the code is injected here, at DOMContentLoaded;
// the other modes are `startPuzzle`'s.
export async function openPage (browser, { contextOptions = {}, seed, injection } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, ...contextOptions })
  const { p, errors } = await newPage(context)
  if (seed) await seed(p, errors)
  if (injection?.mode === 'document-idle') await injectAtIdle(p, injection.code)
  await gotoPuzzle(p)
  return { context, p, errors }
}

// Waits for SudokuPad's own page to have a puzzle.
const waitForFramework = (p) => p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: FRAMEWORK_MS })

// Waits for the puzzle, clicks Start Puzzle once it shows and returns once the controls exist. `beforeStart()`
// runs while the button still shows. `injection` (`{ mode, code }`) adds the code at `before-start`, just
// before that hook, or at `after-start`, once the controls exist.
export async function startPuzzle (p, { beforeStart, injection } = {}) {
  await waitForFramework(p)
  const start = p.getByRole('button', { name: START }).first()
  await start.waitFor({ state: 'visible' })
  if (injection?.mode === 'before-start') await p.addScriptTag({ content: injection.code })
  if (beforeStart) await beforeStart()
  await start.click()
  await start.waitFor({ state: 'hidden' })
  await p.locator('#control-undo').waitFor({ state: 'visible' })
  if (injection?.mode === 'after-start') await p.addScriptTag({ content: injection.code })
}

// The scale of a computed `transform` (a `matrix(s, 0, 0, s, 0, 0)` or `none`): pen-tool-extras grows edge and corner marks
// by a CSS scale, so a mark's width on screen is its stroke width times this.
export const scaleOf = (transform) => transform === 'none' ? 1 : parseFloat(/matrix\(([\d.]+)/.exec(transform)[1])

// The width a stroke draws at on screen, from its computed `strokeWidth` and `transform`, rounded to 4 places.
export const drawnWidth = ({ strokeWidth, transform }) => Math.round(parseFloat(strokeWidth) * scaleOf(transform) * 1e4) / 1e4

// Empties the puzzle's replay and undo stack. Every earlier check in a file grows the replay, and `loadReplay` plays one back
// at about 13 ms an action, so a check that loads a replay restarts first and holds only its own actions.
export const restartPuzzle = (page) => page.evaluate(() => Framework.app.restartPuzzle())
