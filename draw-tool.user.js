// ==UserScript==
// @name         SudokuPad Text Annotation
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.20.0
// @description  Adds a Text Annotation tool for typed notes on the board or beside it, such as cage sums, in colors of its own. Each puzzle keeps its own notes.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/draw-tool.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/draw-tool.user.js
// ==/UserScript==

(function () {
  'use strict'

  const VERSION = '0.20.0'
  const TOOL_NAME = 'draw'
  const LAYER_ID = 'draw-tool-layer'
  const MIN_WIDTH = 1
  const MAX_WIDTH = 16
  const WIDTH_STEP = 0.5
  const DEFAULT_WIDTH = 6
  // Percent. A note has no opacity control; one saved with an opacity keeps it, and one saved without reads as the default.
  const MIN_OPACITY = 20
  const MAX_OPACITY = 100
  const OPACITY_STEP = 5
  const DEFAULT_OPACITY = 100
  // An item saves its color as a number, 1 to 9, the number of one of the nine colors, so a recolor recolors it.
  const DRAW_COLORS = 9
  const COLOR_NUMBERS = Array.from({ length: DRAW_COLORS }, (_, i) => i + 1)
  const DEFAULT_COLOR = 1
  const COLOR_KEY = 'DrawTool_color'
  const COLORS_KEY = 'DrawTool_colors'
  // The CSS variable that holds draw color n: the items, the color buttons and the text box all read it.
  const colorVar = (n) => `--draw-tool-color-${n}`
  // <lib:palette>
  // Generated from lib/palette.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // Reads parseColor, darkenColor and toOklab from color-math.
  /* global parseColor, darkenColor, toOklab */
  // SudokuPad's own pen colors (tool-pen.css). Color 9 is rgb(-36, -36, -36) there, which clamps to black.
  const SUDOKUPAD_PEN_COLORS = Object.freeze({
    1: '#1f8020',
    2: '#e87cf1',
    3: '#e49632',
    4: '#f53a37',
    5: '#d2be32',
    6: '#3d99f5',
    7: '#d6d6d6',
    8: '#7c7c7c',
    9: '#000000'
  })
  const PEN_COLOR_NUMBERS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9])
  // The OKLCH chroma under which a darkened color counts as grey: SudokuPad's greys are 0, a tinted dark grey such as rgb(10, 20, 30) is about 0.024, and the
  // least saturated darkened default colors are above 0.08.
  const GREY_CHROMA = 0.04
  // One page preset per cell color page, up to three, then SudokuPad's own colors.
  const PAGE_PRESETS = ['page-1', 'page-2', 'page-3']
  const SUDOKUPAD_PRESET = 'sudokupad'
  const PALETTE_PRESET_LABELS = {
    'page-1': 'Darker page 1',
    'page-2': 'Darker page 2',
    'page-3': 'Darker page 3',
    [SUDOKUPAD_PRESET]: 'SudokuPad colors'
  }
  const COLOR_TOOL_POLL_MS = 100

  // A color set is `{ colors, preset, missing }`: the nine colors, the preset they came from, and the pens of that page with no usable color, which keep SudokuPad's own.
  const SUDOKUPAD_SET = Object.freeze({ colors: SUDOKUPAD_PEN_COLORS, preset: SUDOKUPAD_PRESET, missing: Object.freeze([]) })

  // Color N is the color at index N of the page: SudokuPad shows index K on the cell color button with data-key K, so color N lines up with cell color button N.
  // Of the darkened colors, the darkest one under GREY_CHROMA becomes #000000, so the darkest color is black as in SudokuPad's own set.
  function darkerPageColors (keys, readCell) {
    const colors = {}
    const missing = []
    const derived = []
    PEN_COLOR_NUMBERS.forEach((n) => {
      const rgb = n < keys.length ? parseColor(readCell(keys[n])) : null
      if (rgb) {
        colors[n] = darkenColor(rgb)
        derived.push(n)
      } else {
        colors[n] = SUDOKUPAD_PEN_COLORS[n]
        missing.push(n)
      }
    })
    let darkest = null
    let darkestLightness = Infinity
    for (const n of derived) {
      const [lightness, a, b] = toOklab(parseColor(colors[n]))
      if (Math.hypot(a, b) < GREY_CHROMA && lightness < darkestLightness) {
        darkest = n
        darkestLightness = lightness
      }
    }
    if (darkest) colors[darkest] = '#000000'
    return { colors, missing }
  }

  function paletteOptions (pageCount) {
    return [...PAGE_PRESETS.slice(0, pageCount), SUDOKUPAD_PRESET]
  }

  // `pages` is the palette's pages of color keys, and `readCell` reads a key's color as CSS text.
  function paletteColors (preset, pages, readCell) {
    if (preset === SUDOKUPAD_PRESET) return SUDOKUPAD_SET
    const page = paletteOptions(pages.length).indexOf(preset)
    if (page === -1) throw new RangeError(`palette: ${preset} is not a preset of this palette`)
    return { ...darkerPageColors(pages[page], readCell), preset }
  }

  const colorTool = () => Framework.app?.tools?.colour

  // `init` assigns the page and sets the `--cell-color-<key>` variables in one synchronous step, so a palette on the tool means the variables are set too (the stylesheet's own
  // values for them exist earlier and say nothing about a custom palette).
  function readyColorTool () {
    const tool = colorTool()
    const pages = tool?.palette?.pages
    return Array.isArray(pages) && Array.isArray(pages[0]) ? tool : null
  }

  // No time limit: until the color tool is ready the caller shows SudokuPad's own colors.
  function waitForColorTool () {
    return new Promise((resolve) => {
      const check = () => {
        const tool = readyColorTool()
        if (tool) resolve(tool)
        else setTimeout(check, COLOR_TOOL_POLL_MS)
      }
      check()
    })
  }

  // The pages of cell color keys of the palette in force, or none until the color tool has one.
  function palettePages () {
    const palette = colorTool()?.palette
    if (!palette) return []
    if (!Array.isArray(palette.pages) || !palette.pages.every(Array.isArray)) throw new Error('SudokuPad\'s color palette has no pages of color keys, so the Darker page presets are left out')
    return palette.pages
  }

  // A custom palette can hold any CSS color (`#f00`, `red`, `hsl()`) and the variable reads back as written, so the browser turns it into `rgb()` text on a probe.
  // '' for a value it rejects or a variable with none.
  function readRootColor (name) {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    const probe = document.createElement('span')
    probe.style.color = value
    if (!probe.style.color) return ''
    document.body.appendChild(probe)
    try {
      return window.getComputedStyle(probe).color
    } finally {
      probe.remove()
    }
  }

  const readPenColor = (n) => readRootColor(`--puzzle-pencolor-${n}`)
  // The raw `--cell-color-<key>` value, not the 60% opacity it shows with on the grid. SudokuPad sets the variable of every key in the palette, so any page reads.
  const readCellColor = (key) => readRootColor(`--cell-color-${key}`)
  /* eslint-enable no-unused-vars */
  // </lib:palette>
  const HEX_COLOR = /^#([0-9a-f]{6})$/
  // Preset ids; the labels are what the dialog shows.
  const PEN_PRESET = 'pen'
  const PRESET_LABELS = {
    [PEN_PRESET]: 'Pen colors',
    ...PALETTE_PRESET_LABELS
  }
  // The size slider keeps the width slider's name, range and key, so a saved size still reads.
  const WIDTH_KEY = 'DrawTool_width'
  const BACKGROUND_KEY = 'DrawTool_background'
  // A character's width as a share of the text size: the widest digit of a sans-serif font, so a hit test errs wide.
  const CHAR_WIDTH = 0.6
  // A line's height as a share of the text size, in the font's own spacing, so a note's box is as tall as the note drawn.
  const LINE_HEIGHT = 1.15
  // A note never resized wraps at this many em and stops growing at this many lines, then scrolls.
  const BOX_WIDTH_EM = 16
  const BOX_LINES = 8
  // The smallest box the resize handle leaves: about three characters wide and one line high, in em.
  const MIN_BOX_EM = [3, LINE_HEIGHT]
  // How far, in screen pixels, the mouse may move between press and release and the press still be a click.
  const CLICK_SLOP = 2
  const TEXT_BOX_CLASS = 'draw-tool-textbox'
  const CLEAR_CLASS = 'draw-tool-clear'
  const SETTINGS_CLASS = 'draw-tool-settings'
  const BACKGROUND_CLASS = 'draw-tool-background'
  const BACKGROUND_FILL_CLASS = 'draw-tool-background-fill'
  const TEXT_CLASS = 'draw-tool-text'
  const TEXT_BACKGROUND_CLASS = 'draw-tool-text-bg'
  const SELECTED_CLASS = 'draw-tool-selected'
  // A note whose text runs past its box, and the one such note under the pointer, which shows its scroll bar.
  const SCROLLS_CLASS = 'draw-tool-scrolls'
  const HOVER_CLASS = 'draw-tool-hover'
  const RECTANGLE_CLASS = 'draw-tool-selection-rectangle'
  const TRAY_CLASS = 'draw-tool-tray'
  const SLIDERS_CLASS = 'draw-tool-sliders'
  const SLIDER_ROW_CLASS = 'draw-tool-slider'
  const CLASS_PREFIX = 'draw-tool-'
  const COLORS_STYLE_ID = 'draw-tool-colors'
  const PANEL_STYLE_ID = 'draw-tool-style'
  const SIZE_SLIDER = 'draw-tool-size'
  const SIZE_LABEL = 'Size'
  const CLEAR_QUESTION = 'Clear all notes?'
  const OK_LABEL = 'OK'
  const CANCEL_LABEL = 'Cancel'
  const DRAWING_PREFIX = 'DrawTool_drawing_'
  const INDEX_KEY = 'DrawTool_index'
  const KEPT_PUZZLES = 50
  // How far, in board units, an erase may pass from a text's box and still erase it.
  const ERASE_TOLERANCE = 4
  const PRIMARY_BUTTON = 0
  const SECONDARY_BUTTON = 2
  const TEXT_KIND = 'text'
  // Kinds an earlier version saved; they stay in storage and are never drawn.
  const HIDDEN_KINDS = ['stroke', 'shape']
  const TEXT_GLYPH = '<path d="M8 15l4-8 4 8M9.5 12.5h5"/>'
  const BUTTON_ICON = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TEXT_GLYPH}</svg>`
  // The box behind a note with a background: the text's own box grown by these shares of the text size, with rounded corners.
  const BACKGROUND_PAD_X = 0.35
  const BACKGROUND_PAD_Y = 0.15
  const BACKGROUND_RADIUS = 0.3
  // How far a note's halo reaches past its letters, as a share of the text size.
  const HALO_EM = 0.14

  const roundToTenth = (value) => Math.round(value * 10) / 10

  const cross = ([ax, ay], [bx, by], [cx, cy]) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  const segmentsCross = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0

  // Markers in the order they are tried, each with the flag it sets. `**` comes before `*` so a bold marker is never read as two italic ones.
  const FLAGS = ['bold', 'italic', 'strike']
  const MARKERS = [['**', 'bold'], ['~~', 'strike'], ['*', 'italic'], ['_', 'italic']]
  const isWordChar = (char) => char !== undefined && /\w/.test(char)
  const isSpace = (char) => char === undefined || /\s/.test(char)

  // One line of a note as runs of text, each `{ text }` with its `bold`, `italic` or `strike` flag set where it applies. A marker opens only before a
  // non-space and closes only after one, `_` only at a word's edge, and a marker with no partner shows as typed.
  function parseLine (line) {
    const memo = new Map()
    const add = (runs, run) => {
      const last = runs[runs.length - 1]
      if (last && FLAGS.every((flag) => Boolean(last[flag]) === Boolean(run[flag]))) last.text += run.text
      else runs.push({ ...run })
    }
    // The runs from `at` up to the marker that closes `stop`, or to the end when `stop` is empty; `closed` says whether it was found.
    function read (at, stop) {
      const key = `${stop}@${at}`
      if (memo.has(key)) return memo.get(key)
      const runs = []
      let i = at
      let result = null
      while (i < line.length && !result) {
        const opener = MARKERS.find(([mark]) => line.startsWith(mark, i) && !isSpace(line[i + mark.length]) && !(mark === '_' && isWordChar(line[i - 1])))
        const inner = opener && read(i + opener[0].length, opener[0])
        if (inner && inner.closed) {
          for (const run of inner.runs) add(runs, { ...run, [opener[1]]: true })
          i = inner.end
        } else if (stop && line.startsWith(stop, i) && i > at && !isSpace(line[i - 1]) && !(stop === '_' && isWordChar(line[i + 1]))) {
          result = { runs, end: i + stop.length, closed: true }
        } else {
          const mark = opener ? opener[0] : line[i]
          add(runs, { text: mark })
          i += mark.length
        }
      }
      result ??= { runs, end: i, closed: false }
      memo.set(key, result)
      return result
    }
    return read(0, '').runs
  }

  // A note's text as one list of runs per line; a marker does not reach across a line break.
  const parseMarkdown = (text) => text.split('\n').map(parseLine)

  const shownLength = (runs) => runs.reduce((sum, run) => sum + run.text.length, 0)

  // A note's width and height in board units: its stored `box` once resized, else its text wrapped at BOX_WIDTH_EM and cut off at BOX_LINES.
  function noteSize (item) {
    if (item.box) return item.box
    const widths = parseMarkdown(item.text).map((runs) => Math.max(1, shownLength(runs)) * CHAR_WIDTH)
    const rows = widths.reduce((sum, width) => sum + Math.ceil(width / BOX_WIDTH_EM), 0)
    return [Math.min(BOX_WIDTH_EM, Math.max(...widths)) * item.size, Math.min(BOX_LINES, rows) * LINE_HEIGHT * item.size]
  }

  // The box a text takes on the board, centred on its point: the text is drawn anchored at its middle.
  function textBox (item) {
    const [halfWidth, halfHeight] = noteSize(item).map((side) => side / 2)
    const [x, y] = item.at
    return { left: x - halfWidth, right: x + halfWidth, top: y - halfHeight, bottom: y + halfHeight }
  }

  // What a note answers to: its text's box, and with a background the box drawn behind it.
  function noteBox (item) {
    const box = textBox(item)
    if (!item.bg) return box
    const [padX, padY] = [item.size * BACKGROUND_PAD_X, item.size * BACKGROUND_PAD_Y]
    return { left: box.left - padX, right: box.right + padX, top: box.top - padY, bottom: box.bottom + padY }
  }

  const inBox = ([x, y], box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom

  // The index of the text a click at `at` lands on, the one drawn last when texts overlap, or -1 for none.
  function textAt (drawing, at) {
    for (let i = drawing.length - 1; i >= 0; i--) {
      if (drawing[i].kind === TEXT_KIND && inBox(at, noteBox(drawing[i]))) return i
    }
    return -1
  }

  // The indices of the notes whose box the rectangle with opposite corners `a` and `b` touches.
  function notesTouched (drawing, [ax, ay], [bx, by]) {
    const [left, right, top, bottom] = [Math.min(ax, bx), Math.max(ax, bx), Math.min(ay, by), Math.max(ay, by)]
    return drawing.flatMap((item, i) => {
      if (item.kind !== TEXT_KIND) return []
      const box = noteBox(item)
      return box.left <= right && box.right >= left && box.top <= bottom && box.bottom >= top ? [i] : []
    })
  }

  // Whether an erase from `from` to `to` passes within the tolerance of the note's box.
  function touchesText (item, from, to) {
    const b = noteBox(item)
    const box = { left: b.left - ERASE_TOLERANCE, right: b.right + ERASE_TOLERANCE, top: b.top - ERASE_TOLERANCE, bottom: b.bottom + ERASE_TOLERANCE }
    if (inBox(from, box) || inBox(to, box)) return true
    const corners = [[box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom]]
    return corners.some((corner, i) => segmentsCross(from, to, corner, corners[(i + 1) % 4]))
  }

  const roundPoint = ([x, y]) => [roundToTenth(x), roundToTenth(y)]

  // A note put down at screen point `point` is pinned to the grid in board units when the point is over the board, and is
  // fixed on the screen, under its own `fixed` field, when it is not: an older version reads every note's `at` as board units.
  // `board` is the board's screen box and the map from a screen point to board units.
  function placedItem (item, point, board) {
    const { at, fixed, ...rest } = item
    return inBox(point, board.box) ? { ...rest, at: roundPoint(board.toBoard(point)) } : { ...rest, fixed: roundPoint(point) }
  }

  // The note in board units, wherever it is stored, so one hit test serves notes on and off the board.
  const boardView = (item, toBoard) => item.fixed ? { ...item, at: toBoard(item.fixed) } : item

  const screenPoint = (item, toScreen) => item.fixed ?? toScreen(item.at)

  // A press whose every point stays within the slop of where it began.
  const isClick = (points) => points.every(([x, y]) => Math.hypot(x - points[0][0], y - points[0][1]) <= CLICK_SLOP)

  // A keypad button's data-value is text, and Framework.getData parses a saved number back as a number.
  function drawColor (value) {
    const n = typeof value === 'string' && /^[0-9]$/.test(value) ? Number(value) : value
    return Number.isInteger(n) && n >= 1 && n <= DRAW_COLORS ? n : undefined
  }
  const readColor = (saved) => drawColor(saved) ?? DEFAULT_COLOR
  const onSlider = (value, min, max, step) => isNumber(value) && value >= min && value <= max && Number.isInteger((value - min) / step)
  const isWidth = (value) => onSlider(value, MIN_WIDTH, MAX_WIDTH, WIDTH_STEP)
  const isOpacity = (value) => onSlider(value, MIN_OPACITY, MAX_OPACITY, OPACITY_STEP)
  const readWidth = (saved) => isWidth(saved) ? saved : DEFAULT_WIDTH
  const readBackground = (saved) => saved === true
  // Board units, as a text's height: the size slider's value gives the text size.
  const TEXT_SIZE_PER_WIDTH = 2
  const TEXT_SIZE_BASE = 8
  const textSizeFor = (width) => TEXT_SIZE_PER_WIDTH * width + TEXT_SIZE_BASE
  const widthFor = (size) => (size - TEXT_SIZE_BASE) / TEXT_SIZE_PER_WIDTH
  const isTextSize = (value) => Number.isInteger(value) && isWidth(widthFor(value))
  const itemOpacity = (item) => item.opacity ?? DEFAULT_OPACITY

  // A color or background the notes do not share is null; the slider must show one size, so it shows the first note's (the oldest).
  function panelLooks (items) {
    const shared = (values) => values.every((v) => v === values[0]) ? values[0] : null
    return { color: shared(items.map((item) => item.color)), width: widthFor(items[0].size), bg: shared(items.map((item) => Boolean(item.bg))) }
  }

  const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
  // <lib:plain>
  // Generated from lib/plain.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  const rem = (value) => Math.round(value * 100) / 100
  /* eslint-enable no-unused-vars */
  // </lib:plain>

  // <lib:color-math>
  // Generated from lib/color-math.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  const clamp255 = (x) => Math.max(0, Math.min(255, x))

  // The share of its OKLCH lightness a cell color keeps when darkened: low enough to read against cell colors drawn at 60% opacity, high enough that the lightest still show as 5px lines on white and the nine stay apart.
  const LIGHTNESS_FACTOR = 0.75
  const GAMUT_EDGE = 1e-6
  const LIGHT_TEXT = '#dddddd'
  const DARK_TEXT = '#222222'

  const COLOR_FUNCTION = /^(rgb|hsl)a?\(([^)]*)\)$/
  const HEX_DIGITS = /^#([0-9a-f]{3}|[0-9a-f]{6})$/
  const HEX_ALPHA = /^#[0-9a-f]{3}([0-9a-f])$|^#[0-9a-f]{6}([0-9a-f]{2})$/

  // An alpha written as a number or a percentage, as a number from 0 to 1 (NaN for other text).
  const alphaOf = (text) => text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text)

  // The kind (rgb or hsl), first three arguments and alpha of a color function with comma, space or slash separators, or null for any other text.
  function colorFunction (value) {
    const fn = COLOR_FUNCTION.exec(value)
    if (!fn) return null
    const parts = fn[2].split(/[,/\s]+/).filter(Boolean)
    return { kind: fn[1], args: parts.slice(0, 3), alpha: parts.length > 3 ? alphaOf(parts[3]) : undefined }
  }

  // A page lists `transparent`, or a color with alpha 0, to leave a slot empty (key 0 of each default page).
  function isTransparent (text) {
    if (typeof text !== 'string') return false
    const value = text.trim().toLowerCase()
    if (value === 'transparent') return true
    const hex = HEX_ALPHA.exec(value)
    if (hex) return parseInt(hex[1] ?? hex[2], 16) === 0
    const fn = colorFunction(value)
    return Boolean(fn && fn.alpha <= 0)
  }

  // A color's [r, g, b] channels, from #rgb, #rrggbb, rgb() or rgba() text (its alpha a number or a percentage), or null for a transparent or unreadable one.
  // SudokuPad's own cell color 3 is `rgb(-36, -36, -36)`, which clamps to black.
  function parseColor (text) {
    if (typeof text !== 'string' || isTransparent(text)) return null
    const value = text.trim().toLowerCase()
    const hex = HEX_DIGITS.exec(value)
    if (hex) {
      const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
      return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16))
    }
    const fn = colorFunction(value)
    if (!fn || fn.kind !== 'rgb' || fn.args.length < 3) return null
    const channels = fn.args.map(Number)
    return channels.some(Number.isNaN) ? null : channels.map((x) => Math.round(clamp255(x)))
  }

  const toHex = (rgb) => '#' + rgb.map((x) => Math.round(clamp255(x)).toString(16).padStart(2, '0')).join('')

  const toLinear = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  const fromLinear = (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)

  // Ottosson's published matrices. The way back returns the unclamped linear channels, so a caller can tell an out-of-gamut color.
  function toOklab ([r, g, b]) {
    const [lr, lg, lb] = [r, g, b].map(toLinear)
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    ]
  }

  function fromOklabLinear ([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
    ]
  }

  const inGamut = (linear) => linear.every((x) => x >= -GAMUT_EDGE && x <= 1 + GAMUT_EDGE)

  // Lowering lightness at fixed chroma can leave sRGB, so chroma is reduced just far enough to fit (a bisection), which keeps the hue.
  function darkenColor (rgb) {
    const [L, a, b] = toOklab(rgb.map(clamp255))
    const target = L * LIGHTNESS_FACTOR
    let low = 1
    if (!inGamut(fromOklabLinear([target, a, b]))) {
      low = 0
      let high = 1
      for (let i = 0; i < 30; i++) {
        const mid = (low + high) / 2
        if (inGamut(fromOklabLinear([target, a * mid, b * mid]))) low = mid
        else high = mid
      }
    }
    const out = fromOklabLinear([target, a * low, b * low])
    return toHex(out.map((x) => fromLinear(Math.max(0, Math.min(1, x)))))
  }

  // WCAG relative luminance of [r, g, b] channels.
  function wcagLuminance (rgb) {
    const [r, g, b] = rgb.map((c) => {
      const x = c / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  // LIGHT_TEXT or DARK_TEXT, whichever contrasts more with the background color (any parseColor text).
  function textColorFor (background) {
    const rgb = parseColor(background)
    if (!rgb) throw new RangeError(`color-math: ${background} is not a color`)
    const page = wcagLuminance(rgb) + 0.05
    const contrast = (text) => { const t = wcagLuminance(parseColor(text)) + 0.05; return Math.max(page, t) / Math.min(page, t) }
    return contrast(LIGHT_TEXT) >= contrast(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
  }
  /* eslint-enable no-unused-vars */
  // </lib:color-math>
  // <lib:color-picker>
  // Generated from lib/color-picker.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // Reads PEN_COLOR_NUMBERS from palette.
  /* global PEN_COLOR_NUMBERS */
  // SudokuPad's color tool holds its cell color buttons for the same 1000 ms (HoldToEditDelayMs).
  const HOLD_TO_EDIT_MS = 1000
  // One swatch's side and the gap between swatches; a caller lining its own keys up with the grid uses the same two.
  const SWATCH_PX = 34
  const SWATCH_GAP_PX = 4
  // The pickers over the panel's buttons, in the size SudokuPad's color tool uses for the same job.
  const PICKER_INPUT_REM = 2.4
  const PICKER_COLUMNS = 3
  // Percent-encoded; its inner quotes are single, so the url("...") wrapper's double quotes hold it.
  const CHOICE_ARROW = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%236b4fa0\'/%3E%3C/svg%3E")'

  const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  // The dialog's color block: a pulldown above a grid of swatches, three to a row.
  // Free mode (no `picked`) makes each swatch a color input; palette mode makes each a button, `picked` the pressed one, and a null swatch an empty cell.
  // `options` are `{ value, label, selected, disabled }`; `beside` goes in the grid's row, after it.
  function renderColorBlock ({ prefix, label, options, swatches, picked, beside = '' }) {
    const palette = picked !== undefined
    const option = ({ value, label, selected, disabled }) =>
      `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}>${escapeHtml(label)}</option>`
    const named = (swatch) => `aria-label="${escapeHtml(swatch.label)}" title="${escapeHtml(swatch.label)}"`
    const swatch = (s) => {
      const head = `class="${prefix}swatch" data-role="swatch"`
      if (!s) return `<span ${head} data-empty="slot"></span>`
      if (!palette) return `<input type="color" ${head} data-key="${escapeHtml(s.key)}" value="${escapeHtml(s.value)}" ${named(s)}>`
      return `<button type="button" ${head} data-key="${escapeHtml(s.key)}" aria-pressed="${s.key === picked}" ${named(s)} style="background:${escapeHtml(s.value)}"></button>`
    }
    return `<div class="${prefix}color-block">` +
      `<select class="${prefix}color-choice" data-role="color-choice" aria-label="${escapeHtml(label)}">${options.map(option).join('')}</select>` +
      `<div class="${prefix}color-row"><div class="${prefix}swatches">${swatches.map(swatch).join('')}</div>${beside}</div></div>`
  }

  // `scope` is the dialog's own element (`#id`), so SudokuPad's rules for its dialogs' selects and buttons are outranked without !important.
  function colorBlockCss (prefix, scope) {
    const at = (selector) => `${scope} .${prefix}${selector}`
    return [
      `${at('color-block')} { display: grid; justify-items: start; gap: 6px; margin: 6px 0; }`,
      // As wide as the block, whatever its longest option: a select is otherwise as wide as that, and would widen the dialog's column.
      `${at('color-choice')} { box-sizing: border-box; width: 0; min-width: 100%; margin: 0; font-size: 1rem; padding: 4px 28px 4px 10px; border: 1px solid #b9b0c9; border-radius: 6px; appearance: none; color: #222; background: #fff ${CHOICE_ARROW} no-repeat right 10px center; }`,
      `${at('color-row')} { display: flex; align-items: flex-start; gap: 12px; }`,
      `${at('swatches')} { display: grid; grid-template-columns: repeat(${PICKER_COLUMNS}, ${SWATCH_PX}px); gap: ${SWATCH_GAP_PX}px; }`,
      `${at('swatch')} { box-sizing: border-box; display: block; width: ${SWATCH_PX}px; height: ${SWATCH_PX}px; margin: 0; padding: 0; border: 1px solid rgb(0 0 0 / .25); border-radius: 6px; background: none; cursor: pointer; -webkit-appearance: none; appearance: none; }`,
      `${at('swatch')}[data-empty] { border: none; cursor: default; }`,
      `${at('swatch')}[aria-pressed="true"] { border: 2px solid #fff; outline: 3px solid #000; }`,
      `${at('swatch')}::-webkit-color-swatch-wrapper { padding: 0; }`,
      `${at('swatch')}::-webkit-color-swatch { border: none; border-radius: 5px; }`,
      `${at('swatch')}::-moz-color-swatch { border: none; border-radius: 5px; }`
    ].join('\n')
  }

  // Edit mode's looks, for SudokuPad's tool `tool` (its panel carries `tool-<tool>`): each picker fills the grid cell of its button, whose own picture is hidden under it.
  // A picker is out of the flow, so it takes no cell from the buttons the panel places itself.
  function pickerCss (prefix, tool) {
    const panel = `.tool-${tool} .controls-input`
    const picker = (n) => `${panel} .${prefix}picker[data-key="${n}"]`
    const rows = PEN_COLOR_NUMBERS.length / PICKER_COLUMNS
    return [
      `.${prefix}editing .controls-input button[data-key]::after { opacity: 0; }`,
      `.${prefix}editing .${prefix}picker { position: absolute; inset: 0; z-index: 10; }`,
      `.${prefix}editing .${prefix}picker input { position: absolute; inset: 0; margin: auto; width: ${PICKER_INPUT_REM}rem; height: ${PICKER_INPUT_REM}rem; padding: 0; pointer-events: all; }`,
      ...PEN_COLOR_NUMBERS.map((n) => `${picker(n)} { grid-row: ${Math.ceil(n / PICKER_COLUMNS)} / span 1; grid-column: ${(n - 1) % PICKER_COLUMNS + 1} / span 1; }`),
      // SudokuPad's Keypad Flipped swaps the first and third rows of buttons, so each picker follows its button.
      ...[[[1, 2, 3], rows], [[7, 8, 9], 1]].flatMap(([keys, row]) => keys.map((n) => `.setting-flipkeypad ${picker(n)} { grid-row: ${row} / span 1; }`))
    ].join('\n')
  }

  // Every open picker shows the color `colorOf(n)` gives now.
  function refreshPickers (prefix, colorOf) {
    document.querySelectorAll(`.${prefix}picker input`).forEach((input) => { input.value = colorOf(input.dataset.key) })
  }

  // A hold of HOLD_TO_EDIT_MS on one of the tool's nine color buttons, with either mouse button, puts a color picker over each; a picker's input calls `save(n, value)` at once.
  // A second hold, or the panel leaving the tool, ends edit mode. `guard` runs each toggle, so a caller can report a failure its own way.
  function installHoldToEdit ({ prefix, tool, colorOf, save, guard = (toggle) => toggle() }) {
    const toolClass = `tool-${tool}`
    const editing = `${prefix}editing`
    const pickerClass = `${prefix}picker`
    // A right-click hold ends over a picker in edit mode, and Windows opens the context menu on release, so it is suppressed over the pickers as well as the buttons.
    const targets = `.${toolClass} .controls-input button[data-key], .${toolClass} .${pickerClass} input`
    // SudokuPad keeps one panel element and swaps its `tool-<name>` class for the next tool's, so a class watcher ends edit mode when the panel stops being this tool's.
    let leaveWatch = null

    function exit (panel) {
      if (leaveWatch) leaveWatch.disconnect()
      leaveWatch = null
      panel.classList.remove(editing)
      panel.querySelectorAll(`.${pickerClass}`).forEach((el) => el.remove())
    }

    function enter (panel) {
      // Every button is found before anything changes, so a missing one leaves no half edit mode.
      const buttons = PEN_COLOR_NUMBERS.map((n) => {
        const button = panel.querySelector(`.controls-input button[data-key="${n}"]`)
        if (!button) throw new Error(`${prefix}color-picker: the ${tool} tool has no button for color ${n}`)
        return button
      })
      panel.classList.add(editing)
      buttons.forEach((button, i) => {
        const n = PEN_COLOR_NUMBERS[i]
        button.insertAdjacentHTML('beforebegin', `<div class="${pickerClass}" data-key="${n}"><input type="color" data-key="${n}" value="${escapeHtml(colorOf(String(n)))}"></div>`)
      })
      leaveWatch = new window.MutationObserver(() => {
        if (!panel.classList.contains(toolClass)) exit(panel)
      })
      leaveWatch.observe(panel, { attributes: true, attributeFilter: ['class'] })
    }

    let timer
    let holdDone = false
    const cancel = () => { clearTimeout(timer); timer = undefined }
    // Pointer events carry a mouse button of either kind.
    document.addEventListener('pointerdown', (event) => {
      cancel()
      holdDone = false
      const target = event.target.closest(targets)
      if (!target) return
      const panel = target.closest(`.${toolClass}`)
      timer = setTimeout(() => {
        timer = undefined
        holdDone = true
        if (!panel.classList.contains(toolClass)) return
        guard(() => panel.classList.contains(editing) ? exit(panel) : enter(panel))
      }, HOLD_TO_EDIT_MS)
    }, true)
    window.addEventListener('pointerup', cancel, true)
    window.addEventListener('pointercancel', cancel, true)
    // The browser's menu would open over the picker during a right-click hold: when the press is still going (Linux opens it on press),
    // or after the hold has run its course (Windows opens it on release, over the picker that appeared under the pointer).
    // A quick right-click on a button, released before the delay, keeps its menu on Windows.
    document.addEventListener('contextmenu', (event) => {
      if ((timer !== undefined || holdDone) && event.target.closest(targets)) event.preventDefault()
    }, true)
    document.addEventListener('input', (event) => {
      const input = event.target
      if (input.matches(`.${pickerClass} input`)) save(input.dataset.key, input.value)
    })
  }
  /* eslint-enable no-unused-vars */
  // </lib:color-picker>

  // A color picker takes only #rrggbb, so every draw color is kept as one. A transparent color has none to keep.
  const hexColor = (text) => {
    const rgb = parseColor(text)
    return rgb ? toHex(rgb) : undefined
  }

  const savedHex = (value) => typeof value === 'string' && HEX_COLOR.test(value.toLowerCase()) ? value.toLowerCase() : undefined

  // null when nothing is saved, which means the first-use copy of the pen colors is still owed. A saved value that is not
  // nine colors still counts as saved, so the copy never writes over it: each color it lacks shows SudokuPad's own.
  function readDrawColors (saved) {
    if (saved === null || saved === undefined) return null
    const entries = isPlainObject(saved) ? saved : {}
    return Object.fromEntries(COLOR_NUMBERS.map((n) => [n, savedHex(entries[n]) ?? SUDOKUPAD_PEN_COLORS[n]]))
  }

  // `readPenColor(n)` reads pen color n as the browser computes it.
  const copiedPenColors = (readPenColor) => Object.fromEntries(COLOR_NUMBERS.map((n) => [n, hexColor(readPenColor(n)) ?? SUDOKUPAD_PEN_COLORS[n]]))

  function editedColor (colors, n, value) {
    if (drawColor(n) === undefined) throw new RangeError(`draw-tool: ${n} is not a color number`)
    const hex = hexColor(value)
    if (!hex) throw new RangeError(`draw-tool: ${value} is not a color`)
    return { ...colors, [n]: hex }
  }

  // `:root:root` outranks a plain `:root` rule whichever stylesheet loads last.
  const colorsCss = (colors) => [':root:root {', ...COLOR_NUMBERS.map((n) => `  ${colorVar(n)}: ${colors[n]};`), '}'].join('\n')

  // The presets the palette in force offers: the pen colors, then the palette's own.
  const presetOptions = (pageCount) => [PEN_PRESET, ...paletteOptions(pageCount)]

  // `pages` is the palette's pages of color keys; `readCell` reads a key's color and `readPen` a pen color, each as CSS text.
  function presetColors (preset, pages, readCell, readPen) {
    if (preset === PEN_PRESET) return copiedPenColors(readPen)
    return { ...paletteColors(preset, pages, readCell).colors }
  }

  // Copy and Paste carry the colors and the size, and not the notes, the color picked or the background button.
  const readPastedColors = (data) => isPlainObject(data) && COLOR_NUMBERS.some((n) => n in data) && COLOR_NUMBERS.every((n) => !(n in data) || savedHex(data[n])) ? readDrawColors(data) : undefined
  const READERS = {
    [COLORS_KEY]: readPastedColors,
    [WIDTH_KEY]: (data) => isWidth(data) ? data : undefined
  }

  // The size in force, default included, so a paste can put it back to its default; the colors only once they are saved.
  function copiedSettings (store) {
    const copied = { [WIDTH_KEY]: readWidth(store.getData(WIDTH_KEY)) }
    const savedColors = readDrawColors(store.getData(COLORS_KEY))
    if (savedColors) copied[COLORS_KEY] = savedColors
    return JSON.stringify(copied)
  }

  // A note is a text item. `bg` is set only on a note made with the Background button on, so a note saved without it has no box.
  const textItem = ([x, y], text, color, size, background) => ({ kind: TEXT_KIND, color, size, opacity: DEFAULT_OPACITY, ...(background ? { bg: true } : {}), text, at: [roundToTenth(x), roundToTenth(y)] })

  const isOpacityOrNone = (value) => value === undefined || isOpacity(value)
  const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(isNumber)
  const isBox = (box) => isPoint(box) && box.every((side) => side > 0)
  const isText = (item) => isPlainObject(item) && item.kind === TEXT_KIND && drawColor(item.color) !== undefined && isOpacityOrNone(item.opacity) &&
    (item.bg === undefined || item.bg === true) && (item.box === undefined || isBox(item.box)) && isTextSize(item.size) && typeof item.text === 'string' && item.text.length > 0 &&
    (isPoint(item.at) ? item.fixed === undefined : item.at === undefined && isPoint(item.fixed))
  // A drawing saved by an earlier version holds strokes and shapes. They are kept in storage as they are and never drawn, so they are not read further.
  const isHiddenItem = (item) => isPlainObject(item) && HIDDEN_KINDS.includes(item.kind)

  // A puzzle with nothing saved has an empty drawing; saved data that is not a drawing throws rather than read as one.
  function readDrawing (saved) {
    if (saved === null || saved === undefined) return []
    if (!Array.isArray(saved) || !saved.every((item) => isText(item) || isHiddenItem(item))) throw new Error(`the saved drawing is not a list of texts, strokes and shapes: ${JSON.stringify(saved).slice(0, 200)}`)
    return saved
  }

  // As Auto Rules Resizer keys its saved data: a puzzle with no id falls back to the page URL.
  const puzzleKey = (puzzleId, href) => String(puzzleId || href)

  // The index lists puzzle keys oldest change first.
  function readIndex (saved) {
    if (saved === null || saved === undefined) return []
    if (!Array.isArray(saved) || !saved.every((key) => typeof key === 'string')) throw new Error(`the saved index is not a list of puzzle keys: ${JSON.stringify(saved).slice(0, 200)}`)
    return saved
  }

  function touchIndex (index, key) {
    const next = index.filter((k) => k !== key).concat(key)
    return { index: next.slice(-KEPT_PUZZLES), dropped: next.slice(0, Math.max(0, next.length - KEPT_PUZZLES)) }
  }

  const drawingKey = (key) => DRAWING_PREFIX + key

  // `store` has Framework's getData, setData and removeData. The drawing is written before the index, and the dropped
  // puzzles' drawings are removed last, so a write that throws (a full localStorage) loses no drawing already saved.
  // An index that cannot be read throws before anything is written.
  function saveDrawingTo (store, key, drawing) {
    const index = readIndex(store.getData(INDEX_KEY))
    if (drawing.length === 0) {
      store.removeData(drawingKey(key))
      store.setData(INDEX_KEY, index.filter((k) => k !== key))
      return
    }
    const touched = touchIndex(index, key)
    store.setData(drawingKey(key), drawing)
    store.setData(INDEX_KEY, touched.index)
    for (const dropped of touched.dropped) store.removeData(drawingKey(dropped))
  }

  // SudokuPad gives the tools the keys Z X C V B N M by their place in getToolNames(). Leaving Text Annotation out of the
  // list while a keydown is dispatched gives it no key, and keeps every other tool's key where it is without it.
  const toolNamesFor = (names, event) => event && event.type === 'keydown' && event.eventPhase !== 0
    ? names.filter((name) => name !== TOOL_NAME)
    : names

  // <lib:settings-dialog>
  // Generated from lib/settings-dialog.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // The events that end a press. SudokuPad's pen tool takes its click from `mouseup` (seen live), and
  // a touch ends with `pointerup`, `touchend` and a compatibility `mouseup`, so all four are swallowed.
  const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'mouseup', 'touchend']
  const SETTINGS_GROUP = 'experimental'
  const TITLE_MUTED = '#777'

  // The next press ends the swallowing even when no release came (a close from the keyboard).
  function swallowRelease (win = window) {
    const swallow = (event) => event.stopImmediatePropagation()
    const stop = () => {
      RELEASE_EVENTS.forEach((type) => win.removeEventListener(type, swallow, true))
      win.removeEventListener('pointerdown', stop, true)
    }
    RELEASE_EVENTS.forEach((type) => win.addEventListener(type, swallow, true))
    win.addEventListener('pointerdown', stop, true)
  }

  // SudokuPad runs a dialog button's handler on the press and removes the dialog at once, so the release lands on the grid and the pen tool takes it for a click on the cell under the button.
  function closeDialogKeepingGrid (framework, win = window) {
    framework.closeDialog()
    swallowRelease(win)
  }

  // SudokuPad's showDialog does nothing while its settings dialog is open, so that one closes first; `open` then runs after the close has settled.
  function addSettingsEntry (framework, { name, content, open }) {
    framework.addSetting({
      tag: 'button',
      name,
      group: SETTINGS_GROUP,
      content,
      handler: () => {
        closeDialogKeepingGrid(framework)
        setTimeout(open, 0)
      }
    })
  }

  const COPY_PASTE_PICTURES = {
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4"/>'
  }
  const titleIconButton = (act, label, picture) =>
    `<button type="button" data-act="${act}" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${picture}</svg></button>`

  // The dialog's first part: its own title rules, then the name with the version beside it, and Copy settings and Paste settings as icons at the right end,
  // after the status line they report to. The rules travel with the row, so they are in the page exactly while the dialog is.
  function renderDialogTitle ({ prefix, name, version }) {
    return `<style>${dialogTitleCss(prefix)}</style>` +
      `<div class="${prefix}title-row"><span><b>${name}</b> <small class="${prefix}version">v${version}</small></span>` +
      '<span data-role="settings-status"></span>' +
      `<span class="${prefix}tools">${titleIconButton('copy-settings', 'Copy settings', COPY_PASTE_PICTURES.copy)}${titleIconButton('paste-settings', 'Paste settings', COPY_PASTE_PICTURES.paste)}</span></div>`
  }

  function dialogTitleCss (prefix) {
    const tools = `.${prefix}tools`
    return [
      `.${prefix}version { opacity: .6; }`,
      `.${prefix}title-row { display: flex; align-items: center; gap: 12px; }`,
      `${tools} { display: flex; align-items: center; gap: 4px; }`,
      // SudokuPad styles a dialog's buttons by tag, so each of these is forced.
      `${tools} button { background: none !important; border: none !important; box-shadow: none !important; padding: 4px !important; margin: 0 !important; width: auto !important; min-width: 0 !important; height: auto !important; line-height: 0 !important; color: ${TITLE_MUTED} !important; cursor: pointer; border-radius: 6px !important; }`,
      `${tools} button:hover { background: #f0edf5 !important; }`,
      `${tools} svg { width: 20px; height: 20px; }`,
      `${tools} svg * { fill: none !important; }`,
      // A flex item with no intrinsic width: a long message wraps in the room the title leaves and never widens the dialog.
      `.${prefix}title-row [data-role="settings-status"] { flex: 1 1 0; min-width: 0; contain: inline-size; text-align: right; font-size: .8rem; color: ${TITLE_MUTED}; }`
    ].join('\n')
  }
  /* eslint-enable no-unused-vars */
  // </lib:settings-dialog>
  // <lib:settings-transfer>
  // Generated from lib/settings-transfer.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // A reader returns the value to save, or undefined for one it refuses. Keys of other scripts are ignored, not counted: only a value of the script's own that its reader refuses is skipped. `upgrade` rewrites the parsed object first, for text copied by an older version.
  function pastedSettings (text, readers, upgrade = (data) => data) {
    let data
    try {
      data = JSON.parse(text)
    } catch (error) {
      throw new Error('the clipboard text is not JSON', { cause: error })
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('the clipboard text is not a settings object')
    data = upgrade(data)
    const values = {}
    let skipped = 0
    for (const [key, read] of Object.entries(readers)) {
      if (!Object.hasOwn(data, key)) continue
      const value = read(data[key])
      if (value === undefined) skipped++
      else values[key] = value
    }
    return { values, skipped }
  }

  function pasteReport (applied, skipped) {
    if (applied === 0 && skipped === 0) return 'Nothing to paste: the text holds none of this script\'s settings.'
    return `Pasted ${applied} setting${applied === 1 ? '' : 's'}${skipped ? `; skipped ${skipped} that did not check out` : ''}.`
  }

  // Wires the title row's Copy settings and Paste settings icons: `copied()` is the text to copy, `apply(values)` takes what a paste kept; `readers` and `upgrade` are `pastedSettings`'.
  function wireCopyPaste (root, { copied, readers, upgrade }, apply) {
    const say = (message) => { root.querySelector('[data-role="settings-status"]').textContent = message }
    root.addEventListener('click', async (event) => {
      const act = event.target.closest('button[data-act]')?.dataset.act
      if (act !== 'copy-settings' && act !== 'paste-settings') return
      event.preventDefault()
      event.stopPropagation()
      try {
        if (act === 'copy-settings') {
          await navigator.clipboard.writeText(copied())
          say('Settings copied.')
        } else {
          const { values, skipped } = pastedSettings(await navigator.clipboard.readText(), readers, upgrade)
          if (Object.keys(values).length > 0) apply(values)
          say(pasteReport(Object.keys(values).length, skipped))
        }
      } catch (error) {
        say(`Could not ${act === 'copy-settings' ? 'copy' : 'paste'}: ${error.message}`)
      }
    })
  }
  /* eslint-enable no-unused-vars */
  // </lib:settings-transfer>
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, READERS, TOOL_NAME, toolNamesFor, readDrawing, puzzleKey, touchIndex, readIndex, saveDrawingTo, DRAWING_PREFIX, INDEX_KEY, DEFAULT_COLOR, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH, DEFAULT_OPACITY, drawColor, readColor, readWidth, readBackground, textSizeFor, itemOpacity, ERASE_TOLERANCE, textItem, textBox, noteBox, parseMarkdown, textAt, notesTouched, panelLooks, touchesText, placedItem, boardView, screenPoint, isClick, CLICK_SLOP, SUDOKUPAD_PEN_COLORS, hexColor, readDrawColors, presetOptions, presetColors, copiedSettings, pastedSettings, pasteReport, PRESET_LABELS, COLORS_KEY, WIDTH_KEY, BACKGROUND_KEY, copiedPenColors, editedColor, colorsCss, HOLD_TO_EDIT_MS }
  }
  if (typeof document === 'undefined') return

  // The match also covers other crackingthecryptic.com pages, which have no Framework.
  if (typeof Framework === 'undefined') return
  if (!Framework.getApp || !Framework.addTool) {
    console.warn('draw-tool: SudokuPad\'s Framework has no getApp or addTool, so no Text Annotation tool was added')
    return
  }

  const boardSvg = () => Framework.app.svgRenderer.getElem()

  // A press on these goes to SudokuPad's controls (or a link or field anywhere), never to a note: the control panel, the top bar, the menu drawer and an open dialog.
  const CONTROLS = '#controls, .topbar, #appmenu, .dialog-overlay, button, a, input, select, textarea'
  const overControl = (event) => event.target instanceof window.Element && event.target.closest(CONTROLS) !== null

  // The notes' layer covers the page, above the board's digits and SudokuPad's clock and rules copy (z-index 10) and below its dialogs and menu drawer (1000).
  const LAYER_Z = 20

  function drawingLayer () {
    let layer = document.getElementById(LAYER_ID)
    if (!layer) {
      layer = document.createElement('div')
      layer.id = LAYER_ID
      document.body.appendChild(layer)
    }
    return layer
  }

  const eventPoint = (event) => [event.clientX, event.clientY]

  // The board as the notes see it now: its screen box, the maps between screen points and board units, and screen pixels per board unit.
  function boardMap () {
    const svg = boardSvg()
    const ctm = svg.getScreenCTM()
    const through = (matrix) => ([x, y]) => {
      const p = new window.DOMPoint(x, y).matrixTransform(matrix)
      return [p.x, p.y]
    }
    const { left, top, right, bottom } = svg.getBoundingClientRect()
    return { box: { left, top, right, bottom }, toBoard: through(ctm.inverse()), toScreen: through(ctm), scale: ctm.a }
  }

  // The page's own color, as SudokuPad's buttons use it behind their icons.
  const PAGE_COLOR = 'var(--body-bg, #fff)'

  // Until Text Annotation is first made current its colors are not copied yet, so a note drawn by an older version shows in the pen color.
  const itemColor = (n) => `var(${colorVar(n)}, var(--puzzle-pencolor-${n}))`

  // The opacity is the text's alone, so a note's background box stays solid.
  const textColor = (item) => itemOpacity(item) === 100 ? itemColor(item.color) : `color-mix(in srgb, ${itemColor(item.color)} ${itemOpacity(item)}%, transparent)`

  // A note is drawn at the board's scale, on the board or off it, centred on its screen point; a background is a page-colored rounded box around the text.
  // A resized note is exactly its stored box; any other takes the stylesheet's automatic width and height. A note with no background is padded by its
  // halo's reach, since its box clips what overflows it.
  function styleNote (element, item, map) {
    const [x, y] = screenPoint(item, map.toScreen)
    const px = (units) => `${roundToTenth(units * item.size * map.scale)}px`
    const [boxWidth, boxHeight] = item.box ? item.box.map((side) => `${roundToTenth(side * map.scale)}px`) : ['', '']
    Object.assign(element.style, {
      left: `${roundToTenth(x)}px`,
      top: `${roundToTenth(y)}px`,
      fontSize: px(1),
      width: boxWidth,
      height: boxHeight,
      maxWidth: item.box ? 'none' : '',
      maxHeight: item.box ? 'none' : '',
      color: textColor(item),
      backgroundColor: item.bg ? PAGE_COLOR : 'transparent',
      padding: item.bg ? `${px(BACKGROUND_PAD_Y)} ${px(BACKGROUND_PAD_X)}` : px(HALO_EM),
      borderRadius: item.bg ? px(BACKGROUND_RADIUS) : '0'
    })
    element.classList.toggle(TEXT_BACKGROUND_CLASS, Boolean(item.bg))
  }

  const FLAG_STYLES = (run) => ({ ...(run.bold && { fontWeight: 'bold' }), ...(run.italic && { fontStyle: 'italic' }), ...(run.strike && { textDecoration: 'line-through' }) })

  function runElement (run) {
    if (!FLAGS.some((flag) => run[flag])) return run.text
    const element = document.createElement('span')
    element.textContent = run.text
    Object.assign(element.style, FLAG_STYLES(run))
    return element
  }

  // A note being edited shows its text as typed, markers and all; a finished one shows the styled runs, lines joined by line breaks.
  function newNote (item, map, { raw = false } = {}) {
    const element = document.createElement('div')
    element.className = TEXT_CLASS
    if (raw) element.textContent = item.text
    else element.append(...parseMarkdown(item.text).flatMap((runs, i) => [...(i ? ['\n'] : []), ...runs.map(runElement)]))
    styleNote(element, item, map)
    return element
  }

  // <lib:panel>
  // Generated from lib/panel.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // Reads rem from plain.
  /* global rem */
  // A tool's purple panel: SudokuPad's outer keypad size (four rows of a 4rem button between 0.15rem margins) as a grid of the nine
  // color buttons shortened to 2.5rem, a gap, a row of three controls at the full 4rem, and the sliders across the rest. A tray sits behind the last two rows; it is placed in
  // their area but takes no cell, so the buttons fill the row.
  // SudokuPad's purple, as its own icons draw it.
  const PANEL_COLOR = '#6a1b9a'
  const TRAY_COLOR = '#efeaf4'
  const PANEL_BUTTON_REM = 4
  const COLOR_BUTTON_REM = 2.5
  const PANEL_BUTTON_MARGIN_REM = 0.15
  const PANEL_CELL_REM = rem(PANEL_BUTTON_REM + 2 * PANEL_BUTTON_MARGIN_REM)
  const COLOR_CELL_REM = rem(COLOR_BUTTON_REM + 2 * PANEL_BUTTON_MARGIN_REM)
  const PANEL_HEIGHT_REM = 4 * PANEL_CELL_REM
  const PANEL_COLUMNS = 3
  const COLOR_ROWS = 3
  const CONTROLS_ROW = COLOR_ROWS + 1
  const SLIDERS_ROW = CONTROLS_ROW + 1
  const CONTROLS_GAP_REM = 0.75
  const TRAY_RADIUS_PX = 14
  // The tray reaches this far past the color block on each side, and holds its buttons this far from its edge on every side, so the margin of a button and the reach make up most of it.
  const TRAY_REACH_REM = 0.25
  const TRAY_PADDING_REM = 0.4
  const TRAY_TOP_REM = rem(CONTROLS_GAP_REM + PANEL_BUTTON_MARGIN_REM - TRAY_PADDING_REM)
  const SLIDER_TRACK_REM = 0.8
  const SLIDER_THUMB_REM = 1.1
  const SLIDER_THUMB_RING_REM = 0.2
  // A hidden slider's empty row has the same height, so the other keeps its place.
  const SLIDER_ROW_HEIGHT_REM = 1.4
  // The wedge is a data-URI picture, since a CSS gradient cannot draw a slanted edge. `preserveAspectRatio="none"` stretches it over the track.
  const WEDGE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'><polygon points='0,4.5 100,1.5 100,8.5 0,5.5' fill='${PANEL_COLOR}'/></svg>`
  const WEDGE_PICTURE = `url("data:image/svg+xml,${encodeURIComponent(WEDGE_SVG)}") center / 100% 100% no-repeat`
  const FADE_PICTURE = `linear-gradient(to right, color-mix(in srgb, ${PANEL_COLOR} 8%, transparent), ${PANEL_COLOR})`
  const TRACK_SHAPE = `height: ${SLIDER_TRACK_REM}rem; border: none; border-radius: ${SLIDER_TRACK_REM / 2}rem;`
  const THUMB_SHAPE = `box-sizing: border-box; width: ${SLIDER_THUMB_REM}rem; height: ${SLIDER_THUMB_REM}rem; border-radius: 50%; background: #fff; border: ${SLIDER_THUMB_RING_REM}rem solid ${PANEL_COLOR};`

  // The panel's rules, as a list of CSS rules. `panel` is the keypad's selector and `colorButton` the selector of a color button under it; `controlButtons` is the
  // selector list of the three control buttons; `tray`, `sliders` and `sliderRow` are class names; `wedgeSlider` and `fadeSlider` are the ids of the slider drawn as a wedge
  // (widening to the right) and the one drawn as a fade (faint to solid); a panel with no fade slider leaves `fadeSlider` out.
  function panelCss ({ panel, colorButton, controlButtons, tray, sliders, sliderRow, wedgeSlider, fadeSlider }) {
    const rows = [[1, 2, 3, COLOR_ROWS], [7, 8, 9, 1]]
    return [
      `${panel} { display: grid !important; grid-template-columns: repeat(${PANEL_COLUMNS}, ${PANEL_CELL_REM}rem); grid-template-rows: repeat(${COLOR_ROWS}, ${COLOR_CELL_REM}rem) ${rem(CONTROLS_GAP_REM + PANEL_CELL_REM)}rem 1fr; height: ${PANEL_HEIGHT_REM}rem !important; padding: 0 !important; box-sizing: border-box; justify-items: center; align-items: center; position: relative; }`,
      `${panel} > .button-row { display: contents !important; }`,
      `${panel} button[data-key="0"], ${panel} button[data-control="delete"] { display: none !important; }`,
      // Each color button keeps `position: relative`, since its color line is its `::after`.
      `${panel} ${colorButton} { position: relative; width: ${PANEL_BUTTON_REM}rem !important; height: ${COLOR_BUTTON_REM}rem !important; min-width: 0 !important; margin: ${PANEL_BUTTON_MARGIN_REM}rem !important; }`,
      `${controlButtons} { grid-row: ${CONTROLS_ROW}; align-self: end; position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; width: ${PANEL_BUTTON_REM}rem; height: ${PANEL_BUTTON_REM}rem; min-height: 0; margin: ${PANEL_BUTTON_MARGIN_REM}rem; padding: 0; background-color: var(--body-bg); color: ${PANEL_COLOR}; }`,
      `.${tray} { grid-row: ${CONTROLS_ROW} / ${SLIDERS_ROW + 1}; grid-column: 1 / ${PANEL_COLUMNS + 1}; position: absolute; inset: 0; z-index: 0; margin: ${TRAY_TOP_REM}rem -${TRAY_REACH_REM}rem 0; background: ${TRAY_COLOR}; border-radius: ${TRAY_RADIUS_PX}px; }`,
      // With no sliders the tray ends under the controls, as far past their margin as the other sides: an absolutely placed box needs its end line, or it runs to the panel's edge.
      `${panel}:not(:has(.${sliders})) .${tray} { grid-row: ${CONTROLS_ROW} / ${SLIDERS_ROW}; margin-bottom: -${rem(TRAY_PADDING_REM - PANEL_BUTTON_MARGIN_REM)}rem; }`,
      // SudokuPad's Keypad Flipped swaps the first and third rows of colors with a transform on each `.button-row`, which has no box here, so the rows are swapped by grid row.
      ...rows.flatMap(([a, b, c, row]) => [a, b, c].map((key) => `.setting-flipkeypad ${panel} button[data-key="${key}"] { grid-row: ${row} / span 1; }`)),
      `.${sliders} { grid-row: ${SLIDERS_ROW}; grid-column: 1 / ${PANEL_COLUMNS + 1}; justify-self: stretch; align-self: stretch; position: relative; z-index: 1; box-sizing: border-box; margin: ${PANEL_BUTTON_MARGIN_REM}rem ${PANEL_BUTTON_MARGIN_REM}rem ${TRAY_PADDING_REM}rem; padding: 0 0.8rem; display: flex; flex-direction: column; justify-content: space-evenly; color: ${PANEL_COLOR}; }`,
      `.${sliderRow} { display: flex; align-items: center; gap: 0.4rem; height: ${SLIDER_ROW_HEIGHT_REM}rem; }`,
      `.${sliderRow} input { flex: 1; min-width: 0; margin: 0; height: ${SLIDER_ROW_HEIGHT_REM}rem; background: transparent; outline: none; -webkit-appearance: none; appearance: none; }`,
      `.${sliderRow} input::-webkit-slider-runnable-track { ${TRACK_SHAPE} }`,
      `.${sliderRow} input::-moz-range-track { ${TRACK_SHAPE} }`,
      `#${wedgeSlider}::-webkit-slider-runnable-track { background: ${WEDGE_PICTURE}; }`,
      `#${wedgeSlider}::-moz-range-track { background: ${WEDGE_PICTURE}; }`,
      ...(fadeSlider ? [`#${fadeSlider}::-webkit-slider-runnable-track { background: ${FADE_PICTURE}; }`, `#${fadeSlider}::-moz-range-track { background: ${FADE_PICTURE}; }`] : []),
      `.${sliderRow} input::-webkit-slider-thumb { -webkit-appearance: none; margin-top: ${rem((SLIDER_TRACK_REM - SLIDER_THUMB_REM) / 2)}rem; ${THUMB_SHAPE} }`,
      `.${sliderRow} input::-moz-range-thumb { ${THUMB_SHAPE} }`
    ]
  }

  // SudokuPad cancels (`preventDefault`) every mouse move on the page, and a cancelled move stops the browser dragging a slider's thumb. A move over the sliders is kept from
  // SudokuPad's handlers, so the thumb drags and the drag reaches nothing else on the page. A drag leaves the focus on the slider, where the arrow keys would move it and not
  // reach the puzzle, so the focus goes back to the page when the pointer is released. `sliders` is the selector of the block that holds the slider inputs.
  function installSliderGuards (sliders, doc = document, win = window) {
    doc.addEventListener('mousemove', (event) => {
      if (event.target.closest(sliders)) event.stopPropagation()
    }, true)
    win.addEventListener('pointerup', () => {
      const focused = doc.activeElement
      if (focused && focused.matches(`${sliders} input`)) focused.blur()
    }, true)
  }
  /* eslint-enable no-unused-vars */
  // </lib:panel>
  const COLOR_LABEL_REM = 1.7
  const SIZE_LABEL_REM = [0.85, 1.6]
  // The column of each control in its row: Clear all, the Background button and the settings gear.
  const CONTROL_COLUMNS = { [CLEAR_CLASS]: 1, [BACKGROUND_CLASS]: 2, [SETTINGS_CLASS]: 3 }
  const PANEL = '.tool-draw .controls-input'
  const controlButtons = Object.keys(CONTROL_COLUMNS).map((name) => `${PANEL} button.${name}`).join(', ')
  // Each color button shows "Aa" in its draw color, so a recolor follows.
  const PANEL_CSS = [
    ...panelCss({ panel: PANEL, colorButton: 'button.digit', controlButtons, tray: TRAY_CLASS, sliders: SLIDERS_CLASS, sliderRow: SLIDER_ROW_CLASS, wedgeSlider: SIZE_SLIDER }),
    `${PANEL} button.digit { text-indent: -999em; overflow: hidden; color: transparent; }`,
    `${PANEL} button.digit:not(.current) { background-color: var(--body-bg); }`,
    `${PANEL} button.digit::after { content: "Aa"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-indent: 0; font-size: ${COLOR_LABEL_REM}rem; font-weight: 600; line-height: 1; }`,
    ...COLOR_NUMBERS.map((n) => `${PANEL} button[data-key="${n}"]::after { color: var(${colorVar(n)}); }`),
    ...Object.entries(CONTROL_COLUMNS).map(([name, column]) => `${PANEL} button.${name} { grid-column: ${column}; }`),
    `:is(.${CLEAR_CLASS}, .${SETTINGS_CLASS}, .${BACKGROUND_CLASS}) svg { width: 2.6rem; height: 2.6rem; }`,
    // SudokuPad's CSS fills every 'svg path', which would turn the icons' lines into blobs.
    `:is(.${CLEAR_CLASS}, .${SETTINGS_CLASS}) :is(path, circle, rect, ellipse), .${BACKGROUND_CLASS} :is(path, circle, rect, ellipse):not(.${BACKGROUND_FILL_CLASS}) { fill: none !important; }`,
    `.${BACKGROUND_CLASS}[aria-pressed="true"] { background-color: ${TRAY_COLOR}; outline: 2px solid ${PANEL_COLOR}; }`,
    // Some selected notes have a box and some do not: a dashed ring, neither on nor off.
    `.${BACKGROUND_CLASS}[aria-pressed="mixed"] { outline: 2px dashed ${PANEL_COLOR}; }`,
    ...COLOR_NUMBERS.map((n) => `${PANEL} button[data-key="${n}"] { grid-row: ${Math.ceil(n / PANEL_COLUMNS)} / span 1; grid-column: ${(n - 1) % PANEL_COLUMNS + 1} / span 1; }`),
    pickerCss(CLASS_PREFIX, TOOL_NAME),
    // The slider row's gap stands between each "A" and the track, so a label is padded only on its outer side.
    `.${SLIDER_ROW_CLASS} span { font-weight: 600; line-height: 1; }`,
    `.${SLIDER_ROW_CLASS} span:first-child { font-size: ${SIZE_LABEL_REM[0]}rem; padding-left: 0.35rem; }`,
    `.${SLIDER_ROW_CLASS} span:last-child { font-size: ${SIZE_LABEL_REM[1]}rem; padding-right: 0.35rem; }`,
    `#${LAYER_ID} { position: fixed; inset: 0; z-index: ${LAYER_Z}; pointer-events: none; overflow: hidden; }`,
    // A line as tall as the hit box, so a note's background box is as tall as a digit and covers one under it.
    // SudokuPad sizes every box border-box; a note's sizes are its text's, as its hit box is, with the padding around them.
    `.${TEXT_CLASS} { position: absolute; transform: translate(-50%, -50%); box-sizing: content-box; line-height: ${LINE_HEIGHT}; white-space: pre-wrap; overflow-wrap: anywhere; width: max-content; max-width: ${BOX_WIDTH_EM}em; max-height: ${roundToTenth(BOX_LINES * LINE_HEIGHT)}em; overflow: hidden; }`,
    // A thin bar whose room is kept whether it shows or not, so the text does not wrap again as the pointer comes and goes.
    `.${TEXT_CLASS}.${SCROLLS_CLASS} { overflow-y: auto; scrollbar-width: thin; scrollbar-color: transparent transparent; }`,
    `.${TEXT_CLASS}.${SCROLLS_CLASS}.${HOVER_CLASS} { scrollbar-color: currentColor transparent; }`,
    // A halo in the page's color, painted under the letters so only its outer half shows; a note with a background box already sits on that color.
    `.${TEXT_CLASS}:not(.${TEXT_BACKGROUND_CLASS}) { -webkit-text-stroke: ${HALO_EM * 2}em ${PAGE_COLOR}; paint-order: stroke fill; stroke-linejoin: round; }`,
    `.${SELECTED_CLASS} { outline: 2px dashed ${PANEL_COLOR}; outline-offset: 2px; }`,
    `.${RECTANGLE_CLASS} { position: absolute; box-sizing: border-box; border: 1px dashed ${PANEL_COLOR}; background: color-mix(in srgb, ${PANEL_COLOR} 8%, transparent); }`,
    `.${TEXT_BOX_CLASS} { pointer-events: auto; min-width: 0.3em; outline: 1px dashed currentColor; outline-offset: 1px; cursor: text; }`,
    // The tool bar is a grid and stock buttons have order 0, so Text Annotation's stays last whenever another is added.
    `.controls-tool #control-${TOOL_NAME} { order: 1; }`
  ].join('\n')
  // Pen Tool Extras' gear, at its viewBox.
  const SETTINGS_ICON_VIEWBOX = '-1.51 -2.63 27.882 27.882'
  const SETTINGS_ICON = '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'
  const SETTINGS_LABEL = 'Text Annotation settings'
  // The panel's three control buttons draw their icon with these strokes.
  const controlIcon = (paths, viewBox = '0 0 24 24') => `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
  // Clear all is a trash can.
  const CLEAR_LABEL = 'Clear all'
  const DELETE_SELECTED_LABEL = 'Delete the selected notes'
  const CLEAR_ICON = '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>'
  let color = DEFAULT_COLOR
  let width = DEFAULT_WIDTH
  // Whether the next note is made with a background. The Background button turns it on and off, and it is remembered.
  let background = false
  // Text Annotation's nine colors, or null until they are first copied from the pen colors.
  let colors = null
  // The elements the panel adds to SudokuPad's keypad while Text Annotation is current.
  let panelParts = []

  const keypad = () => document.querySelector('.controls-input')

  const unmarkColor = () => { for (const button of keypad().querySelectorAll('button.digit.current')) button.classList.remove('current') }

  function pickColor (next) {
    if (selected.length) {
      changeSelected((item) => ({ ...item, color: next }))
      return
    }
    color = next
    Framework.setData(COLOR_KEY, color)
    showPanelValues()
  }

  function showColors () {
    let style = document.getElementById(COLORS_STYLE_ID)
    if (!style) {
      style = document.createElement('style')
      style.id = COLORS_STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = colors ? colorsCss(colors) : ''
  }

  function saveColors (next) {
    colors = next
    Framework.setData(COLORS_KEY, colors)
    showColors()
    refreshPickers(CLASS_PREFIX, (n) => colors[n])
  }

  // The slider sets only the next note and is saved for the next visit, and a paste sets it as a move of the slider would.
  function setSize (value) {
    width = value
    Framework.setData(WIDTH_KEY, value)
  }

  function sizeRow () {
    const row = document.createElement('div')
    row.className = SLIDER_ROW_CLASS
    row.title = SIZE_LABEL
    const input = document.createElement('input')
    Object.assign(input, { type: 'range', id: SIZE_SLIDER, min: MIN_WIDTH, max: MAX_WIDTH, step: WIDTH_STEP, value: width, tabIndex: -1 })
    input.setAttribute('aria-label', SIZE_LABEL)
    const [small, large] = ['A', 'A'].map((letter) => Object.assign(document.createElement('span'), { textContent: letter }))
    row.append(small, input, large)
    return row
  }

  // The settings dialog: nine color pickers and a preset list that fill a draft Save writes, and Copy and Paste settings, which act at once.
  const DIALOG_ID = 'draw-tool-dialog'
  const DIALOG_STYLE_ID = 'draw-tool-dialog-style'
  const CUSTOM_LABEL = 'Custom'
  const SAVE_LABEL = 'Save'
  const DIALOG_CSS = [
    `#${DIALOG_ID} .draw-tool-section-title { font-weight: 600; margin: 6px 0 0; }`,
    colorBlockCss(CLASS_PREFIX, `#${DIALOG_ID}`)
  ].join('\n')

  // A pasted value is saved and shown at once, whether or not Text Annotation is current.
  function applyPasted (values) {
    if (WIDTH_KEY in values) {
      setSize(values[WIDTH_KEY])
      const input = document.getElementById(SIZE_SLIDER)
      if (input) input.value = values[WIDTH_KEY]
    }
    if (COLORS_KEY in values) saveColors(values[COLORS_KEY])
  }

  function openDialog () {
    if (!document.getElementById(DIALOG_STYLE_ID)) {
      const style = document.createElement('style')
      style.id = DIALOG_STYLE_ID
      style.textContent = DIALOG_CSS
      document.head.appendChild(style)
    }
    // Until the colors are first copied, the draft is the pen colors a first use would copy.
    let draft = colors ?? copiedPenColors(readPenColor)
    let chosen = null
    let changed = false
    let pages = []
    let paletteNote = ''
    try {
      pages = palettePages()
    } catch (error) {
      console.warn(`draw-tool: ${error.message}`)
      paletteNote = error.message
    }
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: renderDialogTitle({ prefix: CLASS_PREFIX, name: 'Text Annotation', version: VERSION }) },
        { tag: 'text', innerHTML: `<div id="${DIALOG_ID}"></div>` },
        {
          tag: 'options',
          options: [
            { tag: 'button', content: CANCEL_LABEL, action: 'close' },
            { tag: 'button', content: SAVE_LABEL, handler: () => { if (changed) saveColors(draft); Framework.closeDialog() } }
          ]
        }
      ]
    })
    const box = document.getElementById(DIALOG_ID)
    if (!box) return
    const draw = () => {
      const options = [{ value: '', label: CUSTOM_LABEL, selected: !chosen }, ...presetOptions(pages.length).map((id) => ({ value: id, label: PRESET_LABELS[id], selected: id === chosen }))]
      box.innerHTML = '<div class="draw-tool-section-title">Colors</div>' +
        renderColorBlock({ prefix: CLASS_PREFIX, label: 'Text color preset', options, swatches: COLOR_NUMBERS.map((n) => ({ key: String(n), value: draft[n], label: `Text color ${n}` })) }) +
        (paletteNote ? `<div data-role="palette-note">${paletteNote}.</div>` : '')
    }
    draw()
    box.addEventListener('change', (event) => {
      const target = event.target
      if (target.matches('[data-role="color-choice"]')) {
        chosen = target.value || null
        if (chosen) {
          draft = presetColors(chosen, pages, readCellColor, readPenColor)
          changed = true
        }
        draw()
      } else if (target.matches('input[data-role="swatch"]')) {
        draft = editedColor(draft, Number(target.dataset.key), target.value)
        chosen = null
        changed = true
        draw()
      }
    })
    wireCopyPaste(box.closest('.dialog'), { copied: () => copiedSettings(Framework), readers: READERS }, (values) => {
      applyPasted(values)
      draft = colors ?? draft
      chosen = null
      changed = false
      draw()
    })
  }

  const BACKGROUND_ON_LABEL = 'Background: on. Click to turn off'
  const BACKGROUND_OFF_LABEL = 'Background: off. Click to turn on'
  const BACKGROUND_MIXED_LABEL = 'Background: on for some selected notes. Click to turn on for all'
  const BACKGROUND_ICON = `<rect class="${BACKGROUND_FILL_CLASS}" x="3" y="5" width="18" height="14" rx="3" fill="currentColor" fill-opacity=".22"/><rect x="3" y="5" width="18" height="14" rx="3" stroke-dasharray="3 3"/>${TEXT_GLYPH}`

  // The button shows the open note's own background while a note is open, the selection's (null when it is mixed) while notes are selected, and the setting for the next note otherwise.
  const backgroundShown = () => editing ? Boolean(editing.item.bg) : selected.length ? panelLooks(selectedNotes()).bg : background

  function showBackground () {
    const button = document.querySelector(`.${BACKGROUND_CLASS}`)
    if (!button) return
    const shown = backgroundShown()
    const label = shown === null ? BACKGROUND_MIXED_LABEL : shown ? BACKGROUND_ON_LABEL : BACKGROUND_OFF_LABEL
    button.title = label
    button.setAttribute('aria-label', label)
    button.setAttribute('aria-pressed', shown === null ? 'mixed' : String(shown))
  }

  function setBackground (on) {
    background = on
    Framework.setData(BACKGROUND_KEY, on)
  }

  // A press turns the open note's background on or off, and the setting only when the note is a new one; with no note open it turns the selected notes' on or off
  // (on when it is mixed), and with none selected the setting.
  function pressBackground () {
    if (!editing && selected.length) {
      const on = backgroundShown() !== true
      changeSelected(({ bg, ...rest }) => on ? { ...rest, bg: true } : rest)
      return
    }
    if (!editing) setBackground(!background)
    else {
      const on = !editing.item.bg
      const { bg, ...rest } = editing.item
      editing.item = on ? { ...rest, bg: true } : rest
      styleNote(editing.element, editing.item, boardMap())
      if (editing.index === -1) setBackground(on)
    }
    showBackground()
  }

  function showPanel () {
    const tray = document.createElement('div')
    tray.className = TRAY_CLASS
    const clear = document.createElement('button')
    clear.className = CLEAR_CLASS
    clear.innerHTML = controlIcon(CLEAR_ICON)
    clear.addEventListener('click', () => selected.length ? deleteSelected() : confirmClear())
    const settings = document.createElement('button')
    settings.className = SETTINGS_CLASS
    settings.title = SETTINGS_LABEL
    settings.setAttribute('aria-label', SETTINGS_LABEL)
    settings.innerHTML = controlIcon(SETTINGS_ICON, SETTINGS_ICON_VIEWBOX)
    settings.addEventListener('click', openDialog)
    const backgroundButton = document.createElement('button')
    backgroundButton.className = BACKGROUND_CLASS
    backgroundButton.innerHTML = controlIcon(BACKGROUND_ICON)
    // A press on the button keeps the focus in an open text box, so the box stays open for the click.
    backgroundButton.addEventListener('mousedown', (event) => event.preventDefault())
    backgroundButton.addEventListener('click', pressBackground)
    const sliders = document.createElement('div')
    sliders.className = SLIDERS_CLASS
    sliders.append(sizeRow())
    sliders.addEventListener('input', (event) => {
      const value = readWidth(Number(event.target.value))
      if (selected.length) changeSelected((item) => ({ ...item, size: textSizeFor(value) }))
      else setSize(value)
    })
    panelParts = [tray, clear, backgroundButton, settings, sliders]
    keypad().append(...panelParts)
    showPanelValues()
  }

  function showPanelValues () {
    if (panelParts.length === 0) return
    const looks = selected.length ? panelLooks(selectedNotes()) : { color, width }
    unmarkColor()
    if (looks.color !== null) keypad().querySelector(`button[data-key="${looks.color}"]`).classList.add('current')
    document.getElementById(SIZE_SLIDER).value = looks.width
    showBackground()
    const clear = document.querySelector(`.${CLEAR_CLASS}`)
    const label = selected.length ? DELETE_SELECTED_LABEL : CLEAR_LABEL
    clear.title = label
    clear.setAttribute('aria-label', label)
  }

  function hidePanel () {
    for (const part of panelParts) part.remove()
    panelParts = []
  }

  // A hold on a color button toggles a color picker over each, and a picker recolors its color number at once: every note in it reads the variable.
  function installColorPickers () {
    installHoldToEdit({ prefix: CLASS_PREFIX, tool: TOOL_NAME, colorOf: (n) => colors[n], save: (n, value) => saveColors(editedColor(colors, Number(n), value)) })
  }

  // A left press in progress: `start` is the index of the note it began on, or -1 for none; `points` its points on the screen; `move` the notes it moves
  // (each with its index and the item as it was at the press), or null; `shift` and `detail` the press's Shift key and click count; and `rectangle`, the selection
  // rectangle's element once a press on no note has dragged.
  let drag = null
  // A right-drag in progress: the last point it reached and whether it has erased an item yet. The right button's `buttons` bit holds it.
  let erasing = null
  // The note open for typing: the index of the text it reopened, or -1 for a new one, the item, and its element, which the solver types in.
  let editing = null
  // True from a press that finished a text box until its release, so the press does nothing else on the page.
  let pressFinishedText = false
  let drawing = []
  // The indices of the selected notes in the drawing, in order.
  let selected = []
  // False while this puzzle's saved drawing cannot be read: no save writes over it but an explicit wipe's.
  let savable = true
  // The failures already shown in a dialog on this page.
  const reported = new Set()
  // The pointer's last screen point, so a note drawn again under a still pointer shows its scroll bar.
  let pointer = null
  // Each drawn note's item. Its scroll position is kept on the item under a symbol, which a spread copies and JSON leaves out, so a redraw, a move or a
  // recolor keeps it and no save stores it.
  const noteItems = new WeakMap()
  const SCROLL = Symbol('scroll')

  const currentPuzzleKey = () => puzzleKey(Framework.app.puzzle.puzzleId, window.location.href)
  const selectedNotes = () => selected.map((i) => drawing[i])

  // The board moves and scales with the window and SudokuPad's layout, which sets the styles of the board and the boxes round it, so the
  // notes are placed again whenever those change.
  const watchedBoards = new WeakSet()
  let placing = false
  function placeSoon () {
    if (placing) return
    placing = true
    window.requestAnimationFrame(() => {
      placing = false
      renderDrawing()
    })
  }

  function watchBoard (svg) {
    if (watchedBoards.has(svg)) return
    watchedBoards.add(svg)
    const mutations = new window.MutationObserver(placeSoon)
    for (let box = svg; box && box !== document.body; box = box.parentElement) mutations.observe(box, { attributes: true, attributeFilter: ['style', 'class', 'viewBox', 'width', 'height', 'transform'] })
  }

  const boardDrawing = (map) => drawing.map((item) => boardView(item, map.toBoard))

  // The open note's element and the selection rectangle stay in the layer, so the note keeps the focus.
  function renderDrawing () {
    const layer = drawingLayer()
    const svg = boardSvg()
    watchBoard(svg)
    const map = boardMap()
    layer.style.fontFamily = window.getComputedStyle(svg).fontFamily
    const kept = [editing?.element, drag?.rectangle]
    for (const child of [...layer.children]) if (!kept.includes(child)) child.remove()
    const notes = drawing.flatMap((item, i) => {
      if (item.kind !== TEXT_KIND || (editing && editing.index === i)) return []
      const note = newNote(item, map)
      if (selected.includes(i)) note.classList.add(SELECTED_CLASS)
      noteItems.set(note, item)
      return [note]
    })
    layer.prepend(...notes)
    for (const note of notes) {
      markScrolling(note)
      note.scrollTop = noteItems.get(note)[SCROLL] ?? 0
    }
    if (editing) {
      styleNote(editing.element, editing.item, map)
      markScrolling(editing.element)
    }
    showHover()
  }

  const scrollRoom = (note) => note.scrollHeight - note.clientHeight
  // A pixel of rounding is not text past the box.
  function markScrolling (note) {
    note.classList.toggle(SCROLLS_CLASS, scrollRoom(note) > 1)
  }

  // The topmost note whose box holds screen point `point`, or null. The notes' layer takes no pointer, so the page cannot say.
  function noteUnder ([x, y]) {
    const notes = [...drawingLayer().querySelectorAll(`.${TEXT_CLASS}`)].reverse()
    return notes.find((note) => inBox([x, y], note.getBoundingClientRect())) ?? null
  }

  function showHover () {
    const over = pointer && noteUnder(pointer)
    for (const note of drawingLayer().querySelectorAll(`.${HOVER_CLASS}`)) if (note !== over) note.classList.remove(HOVER_CLASS)
    if (over) over.classList.add(HOVER_CLASS)
  }

  function trackPointer (event) {
    pointer = eventPoint(event)
    showHover()
  }

  // A wheel's lines and pages, as pixels of the note it scrolls.
  const WHEEL_UNITS = { [window.WheelEvent.DOM_DELTA_LINE]: (note) => parseFloat(window.getComputedStyle(note).fontSize) * LINE_HEIGHT, [window.WheelEvent.DOM_DELTA_PAGE]: (note) => note.clientHeight }

  // The wheel over a note with text past its box scrolls it, and never reaches SudokuPad, until the note can scroll no further that way; Ctrl+wheel stays the browser's zoom.
  function scrollNote (event) {
    if (event.ctrlKey || event.deltaY === 0) return
    const note = noteUnder(eventPoint(event))
    if (!note || !note.classList.contains(SCROLLS_CLASS)) return
    const room = event.deltaY < 0 ? note.scrollTop : scrollRoom(note) - note.scrollTop
    if (room < 1) return
    event.preventDefault()
    event.stopImmediatePropagation()
    note.scrollTop += event.deltaY * (WHEEL_UNITS[event.deltaMode]?.(note) ?? 1)
    const item = noteItems.get(note)
    if (item) item[SCROLL] = note.scrollTop
  }

  function redraw () {
    renderDrawing()
    showPanelValues()
  }

  function select (indices) {
    selected = [...new Set(indices)].sort((a, b) => a - b)
    redraw()
  }

  // The solver loses work they think is kept, so each failure is shown once a page in SudokuPad's own dialog. Its
  // showDialog does nothing while another dialog is open, so the failure is shown at the next save instead.
  function report (message) {
    console.warn(`draw-tool: ${message}`)
    if (reported.has(message) || document.querySelector('.dialog-overlay')) return
    reported.add(message)
    Framework.showDialog({
      parts: [{ tag: 'text', content: message }, { tag: 'options', options: [{ tag: 'button', content: OK_LABEL }] }],
      centerOverBoard: true
    })
  }

  function save () {
    if (!savable) {
      report('This puzzle\'s saved notes cannot be read, so Text Annotation leaves them as they are and does not save notes on this puzzle. Clear all or Restart replaces them.')
      return
    }
    try {
      saveDrawingTo(Framework, currentPuzzleKey(), drawing)
    } catch (err) {
      report(`Text Annotation could not save this puzzle's notes: ${err.message}`)
    }
  }

  function changeSelected (change) {
    for (const i of selected) drawing[i] = change(drawing[i])
    redraw()
    save()
  }

  // Keeps the items `keep` passes, and those of them that were selected stay selected. Whether any item went.
  function keepItems (keep) {
    const kept = []
    const stillSelected = []
    drawing.forEach((item, i) => {
      if (!keep(item, i)) return
      if (selected.includes(i)) stillSelected.push(kept.length)
      kept.push(item)
    })
    const removed = kept.length !== drawing.length
    drawing = kept
    selected = stillSelected
    return removed
  }

  function deleteSelected () {
    const gone = selected
    keepItems((_, i) => !gone.includes(i))
    redraw()
    save()
  }

  // The note is typed in place: `index` names the text to reopen, or -1 for a new one at screen point `point`. Opening a note ends the selection.
  function openText (index, point) {
    selected = []
    const map = boardMap()
    const item = index === -1 ? placedItem(textItem(map.toBoard(point), '', color, textSizeFor(width), background), point, map) : { ...drawing[index] }
    const element = newNote(item, map, { raw: true })
    element.classList.add(TEXT_BOX_CLASS)
    element.contentEditable = 'plaintext-only'
    element.spellcheck = false
    // As SudokuPad's own buttons do: a press in the note is the note's, and never reaches a tool.
    for (const type of ['mousedown', 'touchstart']) element.addEventListener(type, (event) => event.stopPropagation())
    element.addEventListener('blur', () => { if (editing && editing.element === element) finishText() })
    editing = { index, item, element }
    drawingLayer().appendChild(element)
    redraw()
    element.focus()
    window.getSelection().selectAllChildren(element)
    window.getSelection().collapseToEnd()
  }

  // Blank lines before and after the text are dropped; line breaks inside it stay.
  const typedText = (element) => element.textContent.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '')

  // An empty box removes its text.
  function finishText () {
    const { index, item, element } = editing
    editing = null
    element.remove()
    const before = index === -1 ? '' : drawing[index].text
    const text = typedText(element)
    const changed = text !== before || (index !== -1 && Boolean(item.bg) !== Boolean(drawing[index].bg))
    if (changed) {
      if (text === '') drawing.splice(index, 1)
      else if (index === -1) drawing.push({ ...item, text })
      else drawing[index] = { ...item, text }
    }
    renderDrawing()
    showBackground()
    if (changed) save()
  }

  // SudokuPad's key listeners are on the document and the window, and its App's in the document's capture phase, so
  // a key typed in the box is stopped in the window's capture phase, before them all. Its default is left alone, so
  // the note types, edits, pastes and composes as any editable text does, and F5 or Tab do what they do anywhere.
  function keepBoxKeys (event) {
    if (!editing || event.target !== editing.element) return
    event.stopImmediatePropagation()
    if (event.type !== 'keydown' || event.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      finishText()
    }
  }

  // SudokuPad's buttons and dialogs stop their mousedown, so a press outside the box finishes it from the window's
  // capture phase, before any of them.
  function finishTextOnPress (event) {
    if (!editing || editing.element.contains(event.target) || event.target.closest(`.${BACKGROUND_CLASS}`)) return
    pressFinishedText = true
    finishText()
  }

  // A drag ends its move or its selection rectangle on its release; a press that never moved does nothing more, unless `click` is given to run it.
  function endDrag (click = () => {}) {
    const ended = drag
    drag = null
    if (ended.rectangle) ended.rectangle.remove()
    if (isClick(ended.points)) click(ended)
    else if (ended.move) endMove(ended)
    else if (ended.start === -1) selectInRectangle(ended)
  }

  // An erase in progress, or a drag, ends as a release ends it; a press that never moved opens no text box.
  function endGesture () {
    if (erasing) endErase()
    if (drag) endDrag()
  }

  // The second press of a double-click has a click count (`detail`) of 2.
  function clickNote ({ start, points, shift, detail }) {
    if (start === -1) {
      if (selected.length) select([])
      else openText(-1, points[0])
    } else if (detail >= 2) openText(start)
    else if (shift) select(selected.includes(start) ? selected.filter((i) => i !== start) : [...selected, start])
    else select([start])
  }

  // The rectangle from the press to the pointer, on the screen.
  function rectangleBox ({ points }) {
    const [[ax, ay], [bx, by]] = [points[0], points[points.length - 1]]
    return { left: Math.min(ax, bx), top: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) }
  }

  function showRectangle (d) {
    if (!d.rectangle) {
      d.rectangle = document.createElement('div')
      d.rectangle.className = RECTANGLE_CLASS
      drawingLayer().appendChild(d.rectangle)
    }
    const box = rectangleBox(d)
    for (const side of ['left', 'top', 'width', 'height']) d.rectangle.style[side] = `${roundToTenth(box[side])}px`
  }

  function selectInRectangle (d) {
    const map = boardMap()
    const touched = notesTouched(boardDrawing(map), map.toBoard(d.points[0]), map.toBoard(d.points[d.points.length - 1]))
    select(d.shift ? [...selected, ...touched] : touched)
  }

  const dragOffset = (d) => {
    const [x, y] = d.points[0]
    const [lastX, lastY] = d.points[d.points.length - 1]
    return [lastX - x, lastY - y]
  }

  // Each note keeps its offset from the pointer, and its own drop point decides whether it is pinned to the grid or fixed on the screen.
  function applyMove (d, map) {
    const [dx, dy] = dragOffset(d)
    for (const { index, item } of d.move) {
      const [x, y] = screenPoint(item, map.toScreen)
      drawing[index] = placedItem(item, [x + dx, y + dy], map)
    }
  }

  // A note stays where a press can still reach it: its middle inside the window and clear of the controls. The notes' layer takes no pointer, so the page under it answers.
  function reachable ([x, y]) {
    if (!inBox([x, y], { left: 0, top: 0, right: window.innerWidth - 1, bottom: window.innerHeight - 1 })) return false
    const under = document.elementFromPoint(x, y)
    return under !== null && under.closest(CONTROLS) === null
  }

  function moveKeepsReachable (d, [px, py]) {
    const map = boardMap()
    const [dx, dy] = [px - d.points[0][0], py - d.points[0][1]]
    return d.move.every(({ item }) => {
      const [x, y] = screenPoint(item, map.toScreen)
      return reachable([x + dx, y + dy])
    })
  }

  function endMove (d) {
    applyMove(d, boardMap())
    renderDrawing()
    save()
  }

  function endErase () {
    const { erased } = erasing
    erasing = null
    if (erased) save()
  }

  function cancelInput () {
    if (drag?.rectangle) drag.rectangle.remove()
    drag = null
    erasing = null
    selected = []
    const open = editing
    editing = null
    if (open) open.element.remove()
  }

  function showSavedDrawing () {
    cancelInput()
    try {
      drawing = readDrawing(Framework.getData(drawingKey(currentPuzzleKey())))
      savable = true
    } catch (err) {
      console.warn(`draw-tool: ${err.message}. It is left as it is, and this puzzle's notes are not saved.`)
      drawing = []
      savable = false
    }
    redraw()
  }

  // The saved strokes and shapes of an earlier version are left as they are, but an unreadable saved drawing is written over.
  function emptyDrawing () {
    drawing = drawing.filter((item) => item.kind !== TEXT_KIND)
    cancelInput()
    redraw()
    savable = true
    save()
  }

  // Deletes, whole, every note the drag from `from` to `to`, in board units, passes near.
  function eraseAlong (from, to, map) {
    if (!keepItems((item) => item.kind !== TEXT_KIND || !touchesText(boardView(item, map.toBoard), from, to))) return
    erasing.erased = true
    redraw()
  }

  // SudokuPad gives a tool every button's mousedown; the browser opens its menu on the press on Linux and on the
  // release on Windows, so it is suppressed everywhere but over the controls for as long as Text Annotation is current.
  // On Windows a right-drag that ends over a control still opens the menu there.
  function suppressMenu (event) {
    if (Framework.app.tool === TOOL_NAME && !overControl(event)) event.preventDefault()
  }

  function confirmClear () {
    Framework.showDialog({
      parts: [
        { tag: 'text', content: CLEAR_QUESTION },
        { tag: 'options', options: [{ tag: 'button', content: OK_LABEL }, { tag: 'button', content: CANCEL_LABEL }] }
      ],
      onButton: (label) => { if (label === OK_LABEL) emptyDrawing() },
      centerOverBoard: true
    })
  }

  // The mouse button each gesture is held by, as a bit of a MouseEvent's `buttons`.
  const PRIMARY_HELD = 1
  const SECONDARY_HELD = 2

  const tool = {
    name: TOOL_NAME,
    isTool: true,
    // A press that starts a drag returns true, so SudokuPad starts no drag of its own and selects no cell. A press that
    // finished a text box does nothing else on the page.
    handleInputdown (event) {
      if (event.type !== 'mousedown' || drag || erasing || overControl(event)) return false
      if (pressFinishedText) return true
      const map = boardMap()
      const point = eventPoint(event)
      if (event.button === SECONDARY_BUTTON) {
        const at = map.toBoard(point)
        erasing = { last: at, erased: false }
        eraseAlong(at, at, map)
        return true
      }
      if (event.button !== PRIMARY_BUTTON) return false
      // A press on a note moves the selection once it drags, after selecting just that note when it was not selected; with Shift it only adds or removes the note on its release.
      // A press on empty space draws a selection rectangle once it drags.
      const start = textAt(boardDrawing(map), map.toBoard(point))
      const shift = event.shiftKey
      if (start !== -1 && !shift && !selected.includes(start)) select([start])
      const move = start === -1 || shift ? null : selected.map((index) => ({ index, item: drawing[index] }))
      drag = { start, move, points: [point], shift, detail: event.detail, rectangle: null }
      return true
    },
    // A release the page never saw (off the window, or under another tool) leaves the button up on the next move.
    handleInputMove (event) {
      if (event.type === 'mousemove' && (erasing || drag) && !(event.buttons & (erasing ? SECONDARY_HELD : PRIMARY_HELD))) {
        endGesture()
        return false
      }
      if (erasing) {
        const map = boardMap()
        const at = map.toBoard(eventPoint(event))
        eraseAlong(erasing.last, at, map)
        erasing.last = at
        return true
      }
      if (!drag) return false
      // The browser goes on sending a held drag's moves past the window's edge, so a move ends at the last point that leaves every note reachable.
      const point = eventPoint(event)
      if (drag.move && !moveKeepsReachable(drag, point)) return true
      drag.points.push(point)
      if (isClick(drag.points)) return true
      if (drag.move) {
        applyMove(drag, boardMap())
        renderDrawing()
      } else if (drag.start === -1) showRectangle(drag)
      return true
    },
    handleInputup (event) {
      if (erasing) {
        endErase()
        return true
      }
      if (!drag) return false
      // A click acts only on the release of Text Annotation's own press, never on a release or click alone.
      endDrag(clickNote)
      return true
    },
    handleToolEnter () {
      if (!colors) saveColors(copiedPenColors(readPenColor))
      showPanel()
    },
    handleToolExit () {
      endGesture()
      if (editing) finishText()
      selected = []
      renderDrawing()
      hidePanel()
      unmarkColor()
    },
    // A digit key or keypad button gets the button's data-value. With Text Annotation current it picks a color, and no key
    // or button enters anything in a cell.
    handleToolButton (value) {
      const picked = drawColor(value)
      if (picked !== undefined) pickColor(picked)
      return true
    },
    // SudokuPad calls every tool's handleKeydown first, and true ends the keydown there. Shift would otherwise switch
    // to Corner for as long as it is held (that tool's tempKey), and a drag with it held would never reach Text Annotation.
    // With notes selected, Escape ends the selection and Delete or Backspace (a Mac's delete key) deletes them, and none reaches the cells.
    handleKeydown (event) {
      if (Framework.app.tool !== TOOL_NAME) return false
      if (event.key === 'Shift') return true
      if (selected.length === 0) return false
      if (event.key === 'Escape') select([])
      else if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected()
      else return false
      return true
    }
  }

  Framework.getApp().then((app) => {
    color = readColor(Framework.getData(COLOR_KEY))
    width = readWidth(Framework.getData(WIDTH_KEY))
    background = readBackground(Framework.getData(BACKGROUND_KEY))
    colors = readDrawColors(Framework.getData(COLORS_KEY))
    showColors()
    const style = document.createElement('style')
    style.id = PANEL_STYLE_ID
    style.textContent = PANEL_CSS
    document.head.appendChild(style)
    const names = app.getToolNames
    app.getToolNames = function () { return toolNamesFor(names.call(this), this.currentEvent) }
    Framework.addTool({
      button: { name: TOOL_NAME, title: 'Text Annotation', content: `<div class="icon">${BUTTON_ICON}</div>Text` },
      tool
    })
    addSettingsEntry(Framework, { name: 'drawtool', content: 'Text Annotation', open: openDialog })
    app.puzzle.on('loaded', showSavedDrawing)
    app.on('restarted', emptyDrawing)
    window.addEventListener('contextmenu', suppressMenu)
    installColorPickers()
    window.addEventListener('blur', endGesture)
    installSliderGuards(`.${SLIDERS_CLASS}`)
    window.addEventListener('pointerdown', finishTextOnPress, { capture: true })
    window.addEventListener('pointerup', () => { pressFinishedText = false }, { capture: true })
    window.addEventListener('wheel', scrollNote, { capture: true, passive: false })
    window.addEventListener('mousemove', trackPointer, { capture: true, passive: true })
    for (const type of ['keydown', 'keypress', 'keyup']) window.addEventListener(type, keepBoxKeys, { capture: true })
    if (app.puzzle.currentPuzzle) showSavedDrawing()
  })
})()
