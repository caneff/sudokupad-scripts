// Text Anywhere's live fixtures: the script, its storage keys and selectors, the puzzle key rule, and the helpers that boot
// it after Start Puzzle, reload it and pick Text Anywhere. Not a check itself, so `live/**/*.live.mjs` skips it.
// The keys are typed out here, not imported from the script (docs/adr/0001-live-tests-type-storage-keys.md).

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { startPuzzle } from '../page.mjs'
import { clickUntil, SETTLE_MS } from '../settle.mjs'
import { gridPoint } from '../pen.mjs'

const { HOLD_TO_EDIT_MS } = createRequire(import.meta.url)('../../draw-tool.user.js')

export const script = readFileSync(new URL('../../draw-tool.user.js', import.meta.url), 'utf8')

// SudokuPad's tool keys, App.toolHotkeys.
export const TOOL_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm']

export const DRAW_BUTTON = '#control-draw'
export const DIGIT_BUTTON = '#control-normal'
// The layer's two groups of notes: those on the board, and the fixed ones.
export const NOTE_GROUPS = '.draw-tool-board, .draw-tool-screen'
// Anything in the notes' layer that is not a note, a resize handle, a selection outline or one of the groups, such as a stroke or shape an earlier version drew: none is drawn now.
export const NOT_NOTES = `#draw-tool-layer > :not(.draw-tool-text, .draw-tool-resize, .draw-tool-selection, ${NOTE_GROUPS}), :is(${NOTE_GROUPS}) > :not(.draw-tool-text)`
// Every element in the layer but the groups themselves.
export const IN_LAYER = `#draw-tool-layer > :not(${NOTE_GROUPS}), :is(${NOTE_GROUPS}) > *`
// The notes drawn, leaving out the one open for typing, which is its own element in the layer while it is open.
export const TEXT_BGS = '#draw-tool-layer .draw-tool-text-bg:not(.draw-tool-textbox)'
export const TEXTS = '#draw-tool-layer .draw-tool-text:not(.draw-tool-textbox)'
export const TEXT_BOX = '#draw-tool-layer .draw-tool-textbox'
// The sliders under the controls, and the Size and Transparency sliders in them.
export const SLIDERS = '.draw-tool-sliders'
export const TRAY = '.draw-tool-tray'
export const SIZE_SLIDER = '#draw-tool-size'
export const OPACITY_SLIDER = '#draw-tool-opacity'
export const CLEAR_BUTTON = '.draw-tool-clear'
export const SETTINGS_BUTTON = '.draw-tool-settings'
export const BACKGROUND_BUTTON = '.draw-tool-background'
export const HIDE_BUTTON = '.draw-tool-hide-all'
export const PICKER = '.draw-tool-picker input'
export const DIALOG = '.dialog'
export const DRAWING_PREFIX = 'DrawTool_drawing_'
export const INDEX_KEY = 'DrawTool_index'
export const RESTARTED_PREFIX = 'DrawTool_restarted_'
export const COLOR_KEY = 'DrawTool_color'
export const WIDTH_KEY = 'DrawTool_width'
export const COLORS_KEY = 'DrawTool_colors'
export const BACKGROUND_KEY = 'DrawTool_background'
export const OUTLINE_KEY = 'DrawTool_outline'
export const OPACITY_KEY = 'DrawTool_opacity'
export const BOX_KEY = 'DrawTool_box'
export const FRAME_KEY = 'DrawTool_frame'
export const FONT_KEY = 'DrawTool_font'

// The pickers appear only when the hold timer fires.
export const HOLD_WAIT_MS = HOLD_TO_EDIT_MS + 5000
export const NEAR_PX = 0.5
// How far a release may move a note to put its left and top on whole device pixels: half a pixel on each axis, and the two together.
export const CRISP_HALF_PX = 0.5
export const CRISP_PX = Math.hypot(CRISP_HALF_PX, CRISP_HALF_PX)
// The resize handles on a note alone selected or open.
export const HANDLES = '#draw-tool-layer .draw-tool-resize'
export const NINE = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const KEYPAD = '.controls-input'
export const SETTINGS_EDITOR = '#draw-tool-dialog'
export const SETTINGS_STATUS = '.dialog [data-role="settings-status"]'
export const PICKER_BOX = '.draw-tool-picker'

// A press held on the middle of `selector` with `button`, until the pickers reach `state`.
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

// The middle of a Playwright bounding box.
export const middleOf = ({ x, y, width, height }) => [x + width / 2, y + height / 2]

export const tool = (p) => p.evaluate(() => Framework.app.tool)
// The slider thumb's width in rem, as lib/panel.js's SLIDER_THUMB_REM draws it.
const SLIDER_THUMB_REM = 1.1
// A slider's value.
export const valueOf = (p, slider) => p.evaluate((selector) => Number(document.querySelector(selector).value), slider)
// Presses on `slider`'s track where `value` lies and releases, with real mouse input. The thumb's centre runs from half a thumb in from each end of the track.
// A press on the thumb drags it by the offset it was pressed at and does not jump, so when the thumb is under the target the track is first pressed at its other end.
export async function slideTo (p, slider, value) {
  const { box, min, max, thumb, now } = await p.evaluate(([selector, rem]) => {
    const input = document.querySelector(selector)
    const { x, y, width, height } = input.getBoundingClientRect()
    return { box: { x, y, width, height }, min: Number(input.min), max: Number(input.max), now: Number(input.value), thumb: rem * parseFloat(window.getComputedStyle(document.documentElement).fontSize) }
  }, [slider, SLIDER_THUMB_REM])
  const xOf = (v) => box.x + thumb / 2 + (box.width - thumb) * (v - min) / (max - min)
  const y = box.y + box.height / 2
  if (Math.abs(xOf(now) - xOf(value)) < thumb && now !== value) await p.mouse.click(xOf(value <= (min + max) / 2 ? max : min), y)
  await p.mouse.click(xOf(value), y)
}

export const pickDraw = (p) => clickUntil(() => p.click(DRAW_BUTTON), () => tool(p), 'draw', SETTLE_MS)

// The puzzle's key, as the script keys its drawing: its id, or the page URL when it has none, as the recorded puzzle does.
export const puzzleKey = (p) => p.evaluate(() => String(Framework.app.puzzle.puzzleId || window.location.href))
// The drawing saved for the puzzle on the page: the list inside the `{ v, data }` the store saves (or a planted list, not yet saved over), or null when nothing is saved.
export const drawingOf = (value) => {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value
  if (Array.isArray(value.data)) return value.data
  throw new Error(`not a saved drawing: ${JSON.stringify(value)}`)
}
export const saved = async (p) => drawingOf(await p.evaluate((key) => Framework.getData(key), DRAWING_PREFIX + await puzzleKey(p)))

// Each note drawn: its text, its computed color and its size in board units, its font size on the screen over the board's scale.
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
// Escape finishes the open note and leaves it selected; a second Escape ends that selection, so the next click on empty space opens a note again.
export const SELECTED = '#draw-tool-layer .draw-tool-selected'
export const clickAt = async (p, at) => p.mouse.click(...await gridPoint(p, at))
export async function typeText (p, at, content) {
  await clickAt(p, at)
  await p.keyboard.type(content)
  await finishNote(p)
}

export async function finishNote (p) {
  await p.keyboard.press('Escape')
  if (await p.locator(SELECTED).count() > 0) await p.keyboard.press('Escape')
}
export const texts = (p) => p.evaluate((selector) => [...document.querySelectorAll(selector)].map((t) => t.textContent), TEXTS)

// Removes every saved drawing, every set of notes a Restart kept, and the index.
export const forgetDrawings = (p) => p.evaluate(([prefixes, index]) => {
  Object.keys(window.localStorage).filter((k) => prefixes.some((prefix) => k.includes(prefix))).forEach((k) => window.localStorage.removeItem(k))
  Framework.removeData(index)
}, [[DRAWING_PREFIX, RESTARTED_PREFIX], INDEX_KEY])

export async function boot (p) {
  await startPuzzle(p)
  await p.addScriptTag({ content: script })
  await p.locator(DRAW_BUTTON).waitFor({ state: 'visible' })
}

export async function reload (p) {
  await p.reload({ waitUntil: 'load' })
  await boot(p)
}

// Plants `items` as the saved drawing of the puzzle on the page, so the next load reads them.
export async function plantDrawing (p, items) {
  const key = DRAWING_PREFIX + await puzzleKey(p)
  await p.evaluate(([k, value]) => Framework.setData(k, value), [key, items])
}

// The tool buttons in the order they are drawn (the bar fills a column down, then the next one), not their order in the page:
// Text Anywhere's place comes from a CSS rule, so the page order does not change.
export const buttonIds = (p) => p.evaluate(() => [...document.querySelectorAll('.controls-tool > button')]
  .map((b) => ({ id: b.id, ...b.getBoundingClientRect().toJSON() }))
  .sort((a, b) => Math.round(a.left) - Math.round(b.left) || a.top - b.top)
  .map((b) => b.id))
