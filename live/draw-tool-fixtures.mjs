// Draw Tool's live fixtures: the script, its storage keys and selectors, the puzzle key rule, and the helpers that boot
// it after Start Puzzle, reload it and pick Draw. Not a check itself, so `live/*.live.mjs` skips it.
// The keys are typed out here, not imported from the script (docs/adr/0001-live-tests-type-storage-keys.md).

import { readFileSync } from 'node:fs'
import { startPuzzle } from './page.mjs'
import { clickUntil, SETTLE_MS } from './settle.mjs'

export const script = readFileSync(new URL('../draw-tool.user.js', import.meta.url), 'utf8')

export const DRAW_BUTTON = '#control-draw'
export const DIGIT_BUTTON = '#control-normal'
export const STROKES = '#draw-tool-layer path'
export const TEXTS = '#draw-tool-layer text.draw-tool-text'
export const TEXT_BOX = 'input.draw-tool-textbox'
export const PANEL_BOX = '.draw-tool-panel-box'
export const CLEAR_BUTTON = '.draw-tool-clear'
export const DIALOG = '.dialog'
export const DRAWING_PREFIX = 'DrawTool_drawing_'
export const INDEX_KEY = 'DrawTool_index'
export const COLOR_KEY = 'DrawTool_color'
export const WIDTH_KEY = 'DrawTool_width'
export const TEXT_SIZE_KEY = 'DrawTool_textsize'

export const tool = (p) => p.evaluate(() => Framework.app.tool)
export const pickDraw = (p) => clickUntil(() => p.click(DRAW_BUTTON), () => tool(p), 'draw', SETTLE_MS)

// The puzzle's key, as the script keys its drawing: its id, or the page URL when it has none, as the recorded puzzle does.
export const puzzleKey = (p) => p.evaluate(() => String(Framework.app.puzzle.puzzleId || window.location.href))
// The drawing saved for the puzzle on the page.
export const saved = async (p) => p.evaluate((key) => Framework.getData(key), DRAWING_PREFIX + await puzzleKey(p))

export const strokePaths = (p) => p.evaluate((selector) => [...document.querySelectorAll(selector)].map((e) => e.getAttribute('d')), STROKES)
export const texts = (p) => p.evaluate((selector) => [...document.querySelectorAll(selector)].map((t) => t.textContent), TEXTS)

// Removes every saved drawing and the index.
export const forgetDrawings = (p) => p.evaluate(([prefix, index]) => {
  Object.keys(window.localStorage).filter((k) => k.includes(prefix)).forEach((k) => window.localStorage.removeItem(k))
  Framework.removeData(index)
}, [DRAWING_PREFIX, INDEX_KEY])

export async function boot (p) {
  await startPuzzle(p)
  await p.addScriptTag({ content: script })
  await p.locator(DRAW_BUTTON).waitFor({ state: 'visible' })
}

export async function reload (p) {
  await p.reload({ waitUntil: 'load' })
  await boot(p)
}
