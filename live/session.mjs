// Shared by the live checks: one Chromium per test file, and every script a check runs on SudokuPad put onto the page at one of the
// three times a userscript can load (live/README.md § Injection time). Only this module injects a script; live/README.md § Injection
// time names the checks that load one another way and why. Not a check itself, so `live/**/*.live.mjs` skips it.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { after, before } from 'node:test'
import { chromium } from 'playwright'
import { gotoPuzzle, MODES, newPage, startPuzzle, VIEWPORT } from './page.mjs'

const ROOT = new URL('../', import.meta.url)
// The scripts at the repo root, by file name.
export const SCRIPT_FILES = readdirSync(ROOT).filter((f) => f.endsWith('.user.js')).sort()

// The text of the script `file` (one of SCRIPT_FILES), as a user installs it.
export function scriptSource (file) {
  assert.ok(SCRIPT_FILES.includes(file), `no script ${file}`)
  return readFileSync(new URL(file, ROOT), 'utf8')
}

// Launches one Chromium before the file's tests and closes it after them; call it at the top of a test file. Returns a
// function that gives the browser, since it exists only once the tests start. `launchOptions` go to Playwright's launch.
export function useBrowser (launchOptions) {
  let browser
  before(async () => { browser = await chromium.launch(launchOptions) })
  after(async () => { await browser?.close() })
  return () => browser
}

// A script is a file name from SCRIPT_FILES, or `{ code }` for text of the test's own, such as a script with a break planted.
const codeOf = (script) => typeof script === 'string' ? scriptSource(script) : script.code

const checkMode = (mode) => assert.ok(MODES.includes(mode), `no injection mode ${mode}`)

const injectNow = async (p, codes) => { for (const code of codes) await p.addScriptTag({ content: code }) }

// Runs each code at DOMContentLoaded of every later load of `p`, before the page's own scripts finish, and records in
// `window.__fwAtIdle` what `Framework` looked like at that moment.
async function injectAtIdle (p, codes) {
  for (const code of codes) {
    await p.addInitScript((src) => {
      document.addEventListener('DOMContentLoaded', () => {
        window.__fwAtIdle = typeof Framework + '/' + (typeof Framework !== 'undefined' && typeof Framework.getApp)
        const s = document.createElement('script')
        s.textContent = src
        document.documentElement.appendChild(s)
      })
    }, code)
  }
}

// Adds `scripts` to a page already past Start Puzzle, now, as `after-start` does: for a check that reads the page without them first.
export const addScripts = async (p, scripts) => injectNow(p, scripts.map(codeOf))

// Registers `scripts` at `document-idle` for every later load of `p`, as a userscript manager runs them: for a check that loads
// puzzles in the tab itself.
export const installAtIdle = async (p, scripts) => injectAtIdle(p, scripts.map(codeOf))

// Gets the loaded page past Start Puzzle with `codes` injected at `mode`; `afterStart(p)` runs once the controls exist, before an
// `after-start` injection.
async function startWith (p, codes, { mode, afterStart }) {
  await startPuzzle(p, { beforeStart: mode === 'before-start' ? () => injectNow(p, codes) : undefined })
  if (afterStart) await afterStart(p)
  if (mode === 'after-start') await injectNow(p, codes)
}

// Opens a page of `context` on the puzzle, served from the recording, and gets it past Start Puzzle with `scripts` injected at
// `mode` (after Start Puzzle unless it says otherwise). `seed(p, errors)` runs before the page loads, for init scripts and listeners
// that must see the load; `expectedSkips` declares the skip lines the suite plants (`newPage`). Returns `{ p, errors }`.
export async function addPage (context, scripts, { mode = 'after-start', seed, expectedSkips, afterStart } = {}) {
  checkMode(mode)
  const codes = scripts.map(codeOf)
  const { p, errors } = await newPage(context, { expectedSkips })
  if (seed) await seed(p, errors)
  if (mode === 'document-idle') await injectAtIdle(p, codes)
  await gotoPuzzle(p)
  await startWith(p, codes, { mode, afterStart })
  return { p, errors }
}

// `addPage` in a context of its own (1200x900 unless `contextOptions` say otherwise). Returns `{ context, p, errors }`.
export async function openWith (browser, scripts, { contextOptions = {}, ...options } = {}) {
  checkMode(options.mode ?? 'after-start')
  const context = await browser.newContext({ viewport: VIEWPORT, ...contextOptions })
  return { context, ...await addPage(context, scripts, options) }
}

// Reloads the page and gets it past Start Puzzle with `scripts` injected at `mode` again. A script injected at `document-idle`
// stays registered for every later load of its page, so a page opened that way reloads with no scripts named.
export async function reloadWith (p, scripts, { mode = 'after-start' } = {}) {
  checkMode(mode)
  const codes = scripts.map(codeOf)
  if (mode === 'document-idle') await injectAtIdle(p, codes)
  await p.reload({ waitUntil: 'load' })
  await startWith(p, codes, { mode })
}
