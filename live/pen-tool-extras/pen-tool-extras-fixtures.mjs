// Pen Tool Extras' live fixtures: the script, its stylesheet's selector, and the helpers that open SudokuPad with it, reload it and
// turn on and open the pen tool. Not a check itself, so `live/**/*.live.mjs` skips it.

import { createRequire } from 'node:module'
import { scaleOf } from '../page.mjs'
import { openWith, reloadWith, scriptSource } from '../session.mjs'
import { openPenTool, PAGE_BUTTON, PAGE_ONE, PAGE_THREE, PAGE_TWO } from '../pen.mjs'

export const SCRIPT_FILE = 'pen-tool-extras.user.js'
export const script = scriptSource(SCRIPT_FILE)
export const STYLE = 'style#pen-tool-extras-style'
// The pen tool's three pages of pens, by page number: the characters on each page's buttons.
export const PAGES = { 1: PAGE_ONE, 2: PAGE_TWO, 3: PAGE_THREE }

// What the script exports for tests, such as its constants.
export const scriptExports = createRequire(import.meta.url)('../../pen-tool-extras.user.js')
export const { HOLD_TO_EDIT_MS } = scriptExports
// The pickers appear only when the hold timer fires.
export const HOLD_WAIT_MS = HOLD_TO_EDIT_MS + 5000

// What every suite waits for once the script is in: its stylesheet, the settings that show the tool (the pen tool is off until its
// own setting turns it on), its button and, unless `penTool` is false, the tool opened with Pen Tool Extras' page button in it.
async function ready (p, { penTool = true, settings = { toolpen: true } } = {}) {
  await p.locator(STYLE).waitFor({ state: 'attached' })
  await p.evaluate((values) => { for (const [name, value] of Object.entries(values)) Framework.setSetting(name, value) }, settings)
  await p.locator('#control-pen').waitFor({ state: 'visible' })
  if (penTool) {
    await openPenTool(p)
    await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
  }
}

// Opens SudokuPad with Pen Tool Extras injected after Start Puzzle (`scripts` names others, or `{ code }` text of the test's own),
// the pen tool on and open (`penTool: false` leaves it closed) and `settings` set (the pen tool's own by default), and returns
// `{ context, p, errors }`. The other options are `openWith`'s (live/session.mjs).
export async function open (browser, { scripts = [SCRIPT_FILE], penTool, settings, ...options } = {}) {
  const opened = await openWith(browser, scripts, options)
  await ready(opened.p, { penTool, settings })
  return opened
}

// Reloads the page with `scripts` (Pen Tool Extras alone by default, as `open` has it) and gets it ready again, as `open` does.
export async function reload (p, { scripts = [SCRIPT_FILE], penTool, settings } = {}) {
  await reloadWith(p, scripts)
  await ready(p, { penTool, settings })
}

// The opacity each element matching `selector` shows at, in document order: its own times every ancestor's, since
// pen-tool-extras puts the slider's value on the pen layer and leaves each stroke solid. Rounded to 3 places.
export const effectiveOpacities = (page, selector) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => {
  let product = 1
  for (let el = e; el && el.nodeType === 1; el = el.parentElement) product *= parseFloat(window.getComputedStyle(el).opacity)
  return Math.round(product * 1000) / 1000
}), selector)

// The width a stroke shows on screen: its stroke width times its computed `transform`'s scale.
export const drawnWidth = ({ strokeWidth, transform }) => Math.round(parseFloat(strokeWidth) * scaleOf(transform) * 1e4) / 1e4
