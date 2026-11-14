// Text Anywhere's live fixtures: the script, its storage keys and selectors, the puzzle key rule, and the helpers that open
// SudokuPad with it, reload it and pick Text Anywhere. Not a check itself, so `live/**/*.live.mjs` skips it.
// The keys are typed out here, not imported from the script (docs/adr/0001-live-tests-type-storage-keys.md).

import { createRequire } from 'node:module'
import { openWith, reloadWith, scriptSource } from '../session.mjs'
import { currentTool, pickTool, SELECTED, TEXT_BOX, TEXTS, texts } from '../board.mjs'

const { HOLD_TO_EDIT_MS } = createRequire(import.meta.url)('../../text-anywhere.user.js')

export const SCRIPT_FILE = 'text-anywhere.user.js'
export const script = scriptSource(SCRIPT_FILE)

// SudokuPad's tool keys, App.toolHotkeys.
export const TOOL_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm']

export const TOOL_BUTTON = '#control-textanywhere'
export const DIGIT_BUTTON = '#control-normal'
// The layer's two groups of notes: those on the board, and the fixed ones.
const NOTE_GROUPS = '.text-anywhere-board, .text-anywhere-screen'
// Anything in the notes' layer that is not a note, a resize handle, a selection outline or one of the groups, such as a stroke or shape an earlier version drew: none is drawn now.
export const NOT_NOTES = `#text-anywhere-layer > :not(.text-anywhere-text, .text-anywhere-resize, .text-anywhere-selection, ${NOTE_GROUPS}), :is(${NOTE_GROUPS}) > :not(.text-anywhere-text)`
export const IN_LAYER = `#text-anywhere-layer > :not(${NOTE_GROUPS}), :is(${NOTE_GROUPS}) > *`
// The notes drawn, leaving out the one open for typing, which is its own element in the layer while it is open.
export const TEXT_BGS = '#text-anywhere-layer .text-anywhere-text-bg:not(.text-anywhere-textbox)'
// Every note the player sees: the finished ones and the one open for typing (a text box is a note too).
export const SEEN_TEXTS = '#text-anywhere-layer .text-anywhere-text'
// A struck run in a finished note, and the words and gaps it is drawn in, each with a line of its own.
export const STRIKE_PIECE = '.text-anywhere-strike-piece'
const STRIKES = `${TEXTS} .text-anywhere-strike`
export const STRIKE_PIECES = `${STRIKES} ${STRIKE_PIECE}`
// A check box drawn in a finished note.
export const CHECK_BOXES = `${TEXTS} .text-anywhere-check`
export const SLIDERS = '.text-anywhere-sliders'
export const TRAY = '.text-anywhere-tray'
export const SIZE_SLIDER = '#text-anywhere-size'
export const OPACITY_SLIDER = '#text-anywhere-opacity'
export const CLEAR_BUTTON = '.text-anywhere-clear'
export const SETTINGS_BUTTON = '.text-anywhere-settings'
export const BACKGROUND_BUTTON = '.text-anywhere-background'
export const HIDE_BUTTON = '.text-anywhere-hide-all'
export const PICKER = '.text-anywhere-picker input'
export const DIALOG = '.dialog'
export const NOTES_PREFIX = 'TextAnywhere_notes_'
export const INDEX_KEY = 'TextAnywhere_index'
export const RESTARTED_PREFIX = 'TextAnywhere_restarted_'
export const COLOR_KEY = 'TextAnywhere_color'
export const WIDTH_KEY = 'TextAnywhere_width'
export const COLORS_KEY = 'TextAnywhere_colors'
export const BACKGROUND_KEY = 'TextAnywhere_background'
export const OUTLINE_KEY = 'TextAnywhere_outline'
export const OPACITY_KEY = 'TextAnywhere_opacity'
export const BOX_KEY = 'TextAnywhere_box'
export const FRAME_KEY = 'TextAnywhere_frame'
export const FONT_KEY = 'TextAnywhere_font'

// The pickers appear only when the hold timer fires.
export const HOLD_WAIT_MS = HOLD_TO_EDIT_MS + 5000
export const NEAR_PX = 0.5
// How far a release may move a note to put its left and top on whole device pixels: half a pixel on each axis, and the two together.
export const CRISP_HALF_PX = 0.5
export const CRISP_PX = Math.hypot(CRISP_HALF_PX, CRISP_HALF_PX)
// The resize handles on a note alone selected or open.
export const HANDLES = '#text-anywhere-layer .text-anywhere-resize'
export const NINE = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const KEYPAD = '.controls-input'
export const SETTINGS_EDITOR = '#text-anywhere-dialog'
// The settings dialog's Box color buttons, and the color input shown under Own.
export const BOX_PICKS = `${SETTINGS_EDITOR} button[data-role="box-pick"]`
export const BOX_CUSTOM_INPUT = `${SETTINGS_EDITOR} input[data-role="box-custom"]`
export const PICKER_BOX = '.text-anywhere-picker'

export async function holdForPickers (p, selector, button, state) {
  const box = await p.locator(selector).boundingBox()
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await p.mouse.down({ button })
  try {
    await p.locator(PICKER).first().waitFor({ state, timeout: HOLD_WAIT_MS })
  } finally {
    await p.mouse.up({ button })
  }
}

export const middleOf = ({ x, y, width, height }) => [x + width / 2, y + height / 2]

export const valueOf = (p, slider) => p.evaluate((selector) => Number(document.querySelector(selector).value), slider)

export const pickTextAnywhere = (p) => pickTool(p, 'textanywhere')
export { currentTool as tool, SELECTED, TEXT_BOX, TEXTS, texts }

// The puzzle's key, as the script keys its notes: its id, or the page URL when it has none, as the recorded puzzle does.
export const puzzleKey = (p) => p.evaluate(() => String(Framework.app.puzzle.puzzleId || window.location.href))
// The notes saved for the puzzle on the page: the list inside the `{ v, data }` the store saves (or a planted list, not yet saved over), or null when nothing is saved.
export const notesOf = (value) => {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value
  if (Array.isArray(value.data)) return value.data
  throw new Error(`not saved notes: ${JSON.stringify(value)}`)
}
export const saved = async (p) => notesOf(await p.evaluate((key) => Framework.getData(key), NOTES_PREFIX + await puzzleKey(p)))

export const noteLooks = (p) => p.evaluate((selector) => {
  const scale = Framework.app.svgRenderer.getElem().getScreenCTM().a
  return [...document.querySelectorAll(selector)].map((e) => {
    const style = window.getComputedStyle(e)
    // A note on the board sits in a group scaled by the board's transform.
    const boxScale = new window.DOMMatrix(window.getComputedStyle(e.parentElement).transform).a
    return { text: e.textContent, color: style.color, size: Math.round(parseFloat(style.fontSize) * boxScale / scale * 10) / 10 }
  })
}, TEXTS)

// Where the note that reads `text` starts, on the screen: the left edge of its text and the middle of its first line, where it was clicked.
export const noteStart = (p, text) => p.evaluate(([selector, want]) => {
  const range = document.createRange()
  range.selectNodeContents([...document.querySelectorAll(selector)].find((e) => e.textContent === want))
  const first = range.getClientRects()[0]
  return [first.left, (first.top + first.bottom) / 2]
}, [TEXTS, text])

// The top left of the text of the note that reads `text`, inside its padding, on the screen: the point a fixed note stores. It stays put while the board's scale changes the note's size.
export const notePoint = (p, text) => p.evaluate(([selector, want]) => {
  const element = [...document.querySelectorAll(selector)].find((e) => e.textContent === want)
  const box = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)
  return [box.left + parseFloat(style.paddingLeft), box.top + parseFloat(style.paddingTop)]
}, [TEXTS, text])

// Where the note that reads `text` starts, in cells from the grid's top left, as [row, column] to a tenth.
export async function noteInCells (p, text) {
  const [x, y] = await noteStart(p, text)
  const cell = await p.evaluate(() => Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect().toJSON())
  return [(y - cell.y) / cell.height, (x - cell.x) / cell.width].map((v) => Math.round(v * 10) / 10)
}

// The middle of the closed note that starts nearest screen point `[x, y]`: a note starts at the click that made it, so a press on it, which a handle or the edge may take at its start, goes to its middle.
export const middleAt = (p, point) => p.evaluate(([selector, [x, y]]) => {
  const boxes = [...document.querySelectorAll(selector)].map((e) => e.getBoundingClientRect())
  const distance = (box) => Math.hypot(box.left - x, (box.top + box.bottom) / 2 - y)
  const box = boxes.reduce((best, next) => distance(next) < distance(best) ? next : best)
  return [box.x + box.width / 2, box.y + box.height / 2]
}, [TEXTS, point])

// Opens the closed note that starts nearest screen point `point` with a double-click in its middle, and takes the caret to the end of its text, where the cases type.
export async function reopen (p, point) {
  await p.mouse.dblclick(...await middleAt(p, point))
  await p.keyboard.press('Control+End')
}

// For each note, what the page shows topmost at its middle: 'note' (itself), 'dialog' or 'other'. Under another tool the
// notes take no pointer, so each note is made hit-testable for its one check.
export const topmostAtNotes = (p) => p.evaluate((selector) => [...document.querySelectorAll(selector)].map((note) => {
  const { x, y, width, height } = note.getBoundingClientRect()
  note.style.pointerEvents = 'auto'
  try {
    const top = document.elementFromPoint(x + width / 2, y + height / 2)
    return top === note ? 'note' : top.closest('.dialog-overlay') ? 'dialog' : 'other'
  } finally {
    note.style.pointerEvents = ''
  }
}), TEXTS)

// Two frames: the pointer's work waits for the next one.
export const frames = (p) => p.evaluate(() => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))))
// A finished note stays selected until a second Escape or a click elsewhere.

export const forgetNotes = (p) => p.evaluate(([prefixes, index]) => {
  Object.keys(window.localStorage).filter((k) => prefixes.some((prefix) => k.includes(prefix))).forEach((k) => window.localStorage.removeItem(k))
  Framework.removeData(index)
}, [[NOTES_PREFIX, RESTARTED_PREFIX], INDEX_KEY])

const ready = (p) => p.locator(TOOL_BUTTON).waitFor({ state: 'visible' })

// Opens SudokuPad with Text Anywhere injected (after Start Puzzle unless `mode` says otherwise) and returns `{ context, p, errors }`
// once its button shows. The options are `openWith`'s (live/session.mjs).
export async function open (browser, options) {
  const opened = await openWith(browser, [SCRIPT_FILE], options)
  await ready(opened.p)
  return opened
}

// Reloads the page with Text Anywhere injected after Start Puzzle again.
export async function reload (p) {
  await reloadWith(p, [SCRIPT_FILE])
  await ready(p)
}

// Reloads, then picks Text Anywhere, where most cases start.
export async function reloadOnTextAnywhere (p) {
  await reload(p)
  await pickTextAnywhere(p)
}

export async function plantNotes (p, items) {
  const key = NOTES_PREFIX + await puzzleKey(p)
  await p.evaluate(([k, value]) => Framework.setData(k, value), [key, items])
}

// The tool buttons in the order they are drawn (the bar fills a column down, then the next one), not their order in the page:
// Text Anywhere's place comes from a CSS rule, so the page order does not change.
export const buttonIds = (p) => p.evaluate(() => [...document.querySelectorAll('.controls-tool > button')]
  .map((b) => ({ id: b.id, ...b.getBoundingClientRect().toJSON() }))
  .sort((a, b) => Math.round(a.left) - Math.round(b.left) || a.top - b.top)
  .map((b) => b.id))
