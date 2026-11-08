// Shared by the live checks: opening SudokuPad's puzzle page and getting it past Start Puzzle, with a script
// injected at any of the three times a userscript can load. Not a check itself, so `live/**/*.live.mjs` skips it.

import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { LOAD_MS, puzzleUrl, routeSudokuPad, START } from './cache.mjs'
import { settle } from './settle.mjs'

export { START }

export const PUZZLE_URL = puzzleUrl()

// The injection times a check can ask for: a script that waits on SudokuPad's own startup behaves differently at each.
export const MODES = ['document-idle', 'before-start', 'after-start']

const VIEWPORT = { width: 1200, height: 900 }
const FRAMEWORK_MS = 30000

// A line a script logs when it turns a feature off because SudokuPad has no internal it needs or changed
// (`<script>: <feature> skipped because SudokuPad has no <internal>` or `... changed:`, lib/sudokupad.js).
// The ids are the scripts', read from the `*.user.js` at the repo root, so a new script is matched without an edit here.
const SCRIPT_IDS = readdirSync(new URL('../', import.meta.url)).filter((f) => f.endsWith('.user.js')).map((f) => f.replace('.user.js', ''))
const SKIP_LINE = new RegExp(`^(?:${SCRIPT_IDS.join('|')}): .* skipped because SudokuPad (?:has no|changed)`)

// Collects into `errors` every skip line a script logs, of any console type, so a test that asserts `errors`
// is empty fails when a script lost a feature. A line an `expectedSkips` pattern matches is the suite's own: it
// planted that break on purpose and checks the line itself.
export const collectSkipLines = (page, errors, expectedSkips = []) => {
  page.on('console', (m) => {
    const text = m.text()
    if (SKIP_LINE.test(text) && !expectedSkips.some((re) => re.test(text))) errors.push(`console.${m.type() === 'warning' ? 'warn' : m.type()}: ${text}`)
  })
}

// A page of `context` served from the recording, with its uncaught errors and its skip lines collected into the returned
// `errors`; `expectedSkips` (patterns) names the skip lines left out.
export async function newPage (context, { expectedSkips } = {}) {
  const errors = []
  const p = await context.newPage()
  p.on('pageerror', (e) => errors.push(String(e)))
  collectSkipLines(p, errors, expectedSkips)
  await routeSudokuPad(p)
  return { p, errors }
}

// Collects into `errors` the page's `console.error` lines, leaving out a resource that failed to load, which a
// replay's aborted trackers print, and a skip line, which `newPage` collects whatever its console type. Fits `openPage`'s `seed` as it is.
export const captureConsoleErrors = (page, errors) => {
  page.on('console', (m) => {
    const text = m.text()
    if (m.type() === 'error' && !/Failed to load resource/.test(text) && !SKIP_LINE.test(text)) errors.push(`console.error: ${text}`)
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
// `expectedSkips` (patterns) declares the skip lines a suite plants on purpose; any other skip line lands in `errors`.
// `injection` is `{ mode, code }`: with mode `document-idle` the code is injected here, at DOMContentLoaded;
// the other modes are `startPuzzle`'s.
export async function openPage (browser, { contextOptions = {}, seed, injection, expectedSkips } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, ...contextOptions })
  const { p, errors } = await newPage(context, { expectedSkips })
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

// How long a held button gets to show its press before the read gives up: far inside the 1000 ms hold that opens edit mode on a color button.
const PRESS_READ_MS = 500

// The scale a panel button has while the real mouse holds it down, read until it is `expected` or PRESS_READ_MS passes; the mouse then lets go away from the button.
export async function scaleWhilePressed (page, selector, expected) {
  const box = await page.locator(selector).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  try {
    return await settle(async () => scaleOf(await page.evaluate((s) => window.getComputedStyle(document.querySelector(s)).transform, selector)), expected, PRESS_READ_MS, PRESS_READ_MS)
  } finally {
    await page.mouse.move(2, 2)
    await page.mouse.up()
  }
}

// The panel button's press state: held, it is at `expected` (0.97, or 1 under reduced motion), and let go it is full size again.
export async function assertPressState (page, selector, expected) {
  assert.equal(await scaleWhilePressed(page, selector, expected), expected, `${selector} held`)
  assert.equal(await settle(async () => scaleOf(await page.evaluate((s) => window.getComputedStyle(document.querySelector(s)).transform, selector)), 1), 1, `${selector} let go`)
}

// The width a stroke draws at on screen, from its computed `strokeWidth` and `transform`, rounded to 4 places.
export const drawnWidth = ({ strokeWidth, transform }) => Math.round(parseFloat(strokeWidth) * scaleOf(transform) * 1e4) / 1e4

// Empties the puzzle's replay and undo stack. Every earlier check in a file grows the replay, and `loadReplay` plays one back
// at about 13 ms an action, so a check that loads a replay restarts first and holds only its own actions.
export const restartPuzzle = (page) => page.evaluate(() => Framework.app.restartPuzzle())
