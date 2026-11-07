// ==UserScript==
// @name         SudokuPad Draw Tool
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.13.0
// @description  Adds a Draw tool for freehand lines, shapes and typed text, such as cage sums, in colors of its own. Each puzzle keeps its own drawing.
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

  const VERSION = '0.13.0'
  const TOOL_NAME = 'draw'
  const LAYER_ID = 'draw-tool-layer'
  const SVG_NS = 'http://www.w3.org/2000/svg'
  // Board units: SudokuPad's board SVG draws a cell 64 wide, from (0, 0). Test Markup's brush is 3.
  const CELL_SIZE = 64
  // The shapes a drag can draw, as a shape item saves them.
  const RECT = 'rect'
  const ELLIPSE = 'ellipse'
  const SHAPES = [RECT, ELLIPSE]
  // The Shape button's modes in the order it steps through them: Off draws free lines.
  const SHAPE_OFF = 'off'
  const SHAPE_MODES = [SHAPE_OFF, ...SHAPES]
  const SHAPE_KEY = 'DrawTool_shape'
  const MIN_WIDTH = 1
  const MAX_WIDTH = 16
  const WIDTH_STEP = 0.5
  const DEFAULT_WIDTH = 6
  // Percent. An item saved before opacity existed has none and reads as the default.
  const MIN_OPACITY = 20
  const MAX_OPACITY = 100
  const OPACITY_STEP = 5
  const DEFAULT_OPACITY = 100
  // An item saves its color as a number, 1 to 9, the number of one of Draw's nine colors, so a recolor recolors it.
  const DRAW_COLORS = 9
  const COLOR_NUMBERS = Array.from({ length: DRAW_COLORS }, (_, i) => i + 1)
  const DEFAULT_COLOR = 1
  const COLOR_KEY = 'DrawTool_color'
  const COLORS_KEY = 'DrawTool_colors'
  // The CSS variable that holds draw color n: the items, the color buttons and the text box all read it.
  const colorVar = (n) => `--draw-tool-color-${n}`
  // Copied from Pen Tool Extras: SudokuPad's own pen colors, for a color that cannot be read.
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
  const HEX_COLOR = /^#([0-9a-f]{6})$/
  // Preset ids; the labels are what the dialog shows.
  const PEN_PRESET = 'pen'
  const PAGE_PRESETS = [1, 2, 3].map((page) => `page-${page}`)
  const SUDOKUPAD_PRESET = 'sudokupad'
  const PRESET_LABELS = {
    [PEN_PRESET]: 'Pen colors',
    ...Object.fromEntries(PAGE_PRESETS.map((id, i) => [id, `Darker page ${i + 1}`])),
    [SUDOKUPAD_PRESET]: 'SudokuPad colors'
  }
  // The share of its OKLCH lightness a cell color keeps as a Darker page color, and the OKLCH chroma under which a darkened color counts as grey (Pen Tool Extras' values).
  const LIGHTNESS_FACTOR = 0.75
  const GREY_CHROMA = 0.04
  const GAMUT_EDGE = 1e-6
  const SHORT_HEX_COLOR = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/
  const RGB_TEXT = /^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)$/
  // SudokuPad's color tool holds its cell color buttons for the same 1000 ms (HoldToEditDelayMs), as Pen Tool Extras' pen buttons do.
  const HOLD_TO_EDIT_MS = 1000
  const WIDTH_KEY = 'DrawTool_width'
  const OPACITY_KEY = 'DrawTool_opacity'
  // A character's width as a share of the text size: the widest digit of a sans-serif font, so a hit test errs wide.
  const CHAR_WIDTH = 0.6
  // How far, in board units, the mouse may move between press and release and the press still be a click.
  const CLICK_SLOP = 2
  const TEXT_BOX_CLASS = 'draw-tool-textbox'
  const CLEAR_CLASS = 'draw-tool-clear'
  const SETTINGS_CLASS = 'draw-tool-settings'
  const SHAPE_BUTTON_CLASS = 'draw-tool-shape-mode'
  const SHAPE_ITEM_CLASS = 'draw-tool-shape'
  const TRAY_CLASS = 'draw-tool-tray'
  const SLIDERS_CLASS = 'draw-tool-sliders'
  const SLIDER_ROW_CLASS = 'draw-tool-slider'
  const EDITING_CLASS = 'draw-tool-editing'
  const PICKER_CLASS = 'draw-tool-picker'
  const COLORS_STYLE_ID = 'draw-tool-colors'
  const PANEL_STYLE_ID = 'draw-tool-style'
  const SIZE_SLIDER = 'draw-tool-size'
  const OPACITY_SLIDER = 'draw-tool-opacity'
  // Pen Tool Extras' slider tray: the same purple tray, wedge track for size and fade track for opacity.
  const PANEL_COLOR = '#6a1b9a'
  const TRAY_COLOR = '#efeaf4'
  const SLIDER_TRACK_REM = 0.8
  const SLIDER_THUMB_REM = 1.1
  const SLIDER_THUMB_RING_REM = 0.2
  const CLEAR_QUESTION = 'Clear the drawing?'
  const OK_LABEL = 'OK'
  const CANCEL_LABEL = 'Cancel'
  const DRAWING_PREFIX = 'DrawTool_drawing_'
  const INDEX_KEY = 'DrawTool_index'
  // How far, in board units, a mouse point may stray from the simplified line before it is kept.
  const SIMPLIFY_TOLERANCE = 1.5
  // How far, in board units, a right-drag may pass from a line's edge and still erase it.
  const ERASE_TOLERANCE = 4
  // Straight pieces per curve when a stroke's drawn line is hit-tested.
  const CURVE_STEPS = 8
  // Straight pieces round an ellipse's outline when it is hit-tested.
  const ELLIPSE_STEPS = 64
  const KEPT_PUZZLES = 50
  const PRIMARY_BUTTON = 0
  const SECONDARY_BUTTON = 2
  const HELD_KEYS = ['Shift', 'Alt']
  const FREE_LINE_ICON = '<path d="M3 17c3-6 5-9 7-6s1 6 4 3 4-8 7-9"/>'
  const BUTTON_ICON = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${FREE_LINE_ICON}</svg>`

  const distanceToSegment = ([px, py], [ax, ay], [bx, by]) => {
    const dx = bx - ax
    const dy = by - ay
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }

  // Ramer-Douglas-Peucker: the fewest points whose line stays within SIMPLIFY_TOLERANCE of every point given.
  function simplifyPath (points) {
    if (points.length <= 2) return points.slice()
    const first = points[0]
    const last = points[points.length - 1]
    let farthest = 0
    let farthestIndex = 0
    for (let i = 1; i < points.length - 1; i++) {
      const distance = distanceToSegment(points[i], first, last)
      if (distance > farthest) {
        farthest = distance
        farthestIndex = i
      }
    }
    if (farthest <= SIMPLIFY_TOLERANCE) return [first, last]
    const head = simplifyPath(points.slice(0, farthestIndex + 1))
    return head.slice(0, -1).concat(simplifyPath(points.slice(farthestIndex)))
  }

  const roundToTenth = (value) => Math.round(value * 10) / 10
  const coordinate = (value) => String(roundToTenth(value))
  const point = ([x, y]) => `${coordinate(x)} ${coordinate(y)}`
  const midpoint = ([ax, ay], [bx, by]) => [(ax + bx) / 2, (ay + by) / 2]

  // Each inner point is the control of a curve that runs between the midpoints of its two segments: [start, control, end].
  function strokeCurves (points) {
    const curves = []
    let start = points[0]
    for (let i = 1; i < points.length - 1; i++) {
      const end = i === points.length - 2 ? points[i + 1] : midpoint(points[i], points[i + 1])
      curves.push([start, points[i], end])
      start = end
    }
    return curves
  }

  function strokePath (points) {
    if (points.length <= 2) return `M${point(points[0])} L${point(points[points.length - 1])}`
    const curves = strokeCurves(points).map(([, control, end]) => `Q${point(control)} ${point(end)}`)
    return `M${point(points[0])} ${curves.join(' ')} L${point(points[points.length - 1])}`
  }

  const onCurve = ([sx, sy], [cx, cy], [ex, ey], t) => {
    const u = 1 - t
    return [u * u * sx + 2 * u * t * cx + t * t * ex, u * u * sy + 2 * u * t * cy + t * t * ey]
  }

  // The line strokePath draws, as straight pieces close enough to its curves to hit-test.
  function drawnLine (points) {
    if (points.length <= 2) return points.slice()
    const line = [points[0]]
    for (const [start, control, end] of strokeCurves(points)) {
      for (let step = 1; step <= CURVE_STEPS; step++) line.push(onCurve(start, control, end, step / CURVE_STEPS))
    }
    return line
  }

  const cross = ([ax, ay], [bx, by], [cx, cy]) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  const segmentsCross = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
  const segmentsDistance = (a, b, c, d) => segmentsCross(a, b, c, d)
    ? 0
    : Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b))

  // Whether a right-drag from `from` to `to` passes within the tolerance of the edge of a line drawn `width` wide.
  function touchesLine (line, width, from, to) {
    const reach = ERASE_TOLERANCE + width / 2
    if (line.length === 1) return distanceToSegment(line[0], from, to) <= reach
    for (let i = 1; i < line.length; i++) {
      if (segmentsDistance(from, to, line[i - 1], line[i]) <= reach) return true
    }
    return false
  }

  const touchesStroke = (item, from, to) => touchesLine(drawnLine(item.points), item.width, from, to)

  // A shape's outline as a closed line of straight pieces; an ellipse's are close enough to its curve to hit-test.
  function shapeOutline ({ shape, box: [left, top, right, bottom] }) {
    if (shape === RECT) return [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]]
    const [cx, cy, rx, ry] = [(left + right) / 2, (top + bottom) / 2, (right - left) / 2, (bottom - top) / 2]
    return Array.from({ length: ELLIPSE_STEPS + 1 }, (_, i) => {
      const a = (2 * Math.PI * i) / ELLIPSE_STEPS
      return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]
    })
  }

  const touchesShape = (item, from, to) => touchesLine(shapeOutline(item), item.width, from, to)

  // The box a text takes on the board, centred on its point: the text is drawn anchored at its middle.
  function textBox (item) {
    const halfWidth = (Math.max(1, item.text.length) * item.size * CHAR_WIDTH) / 2
    const [x, y] = item.at
    return { left: x - halfWidth, right: x + halfWidth, top: y - item.size / 2, bottom: y + item.size / 2 }
  }

  const inBox = ([x, y], box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom

  // The index of the text a click at `at` lands on, the one drawn last when texts overlap, or -1 for none.
  function textAt (drawing, at) {
    for (let i = drawing.length - 1; i >= 0; i--) {
      if (drawing[i].kind === 'text' && inBox(at, textBox(drawing[i]))) return i
    }
    return -1
  }

  // Whether a right-drag from `from` to `to` passes within the tolerance of the text's box.
  function touchesText (item, from, to) {
    const b = textBox(item)
    const box = { left: b.left - ERASE_TOLERANCE, right: b.right + ERASE_TOLERANCE, top: b.top - ERASE_TOLERANCE, bottom: b.bottom + ERASE_TOLERANCE }
    if (inBox(from, box) || inBox(to, box)) return true
    const corners = [[box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom]]
    return corners.some((corner, i) => segmentsCross(from, to, corner, corners[(i + 1) % 4]))
  }

  const TOUCHES = { stroke: touchesStroke, text: touchesText, shape: touchesShape }
  const touchesItem = (item, from, to) => TOUCHES[item.kind](item, from, to)

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
  const readShapeMode = (saved) => SHAPE_MODES.includes(saved) ? saved : SHAPE_OFF
  const nextShapeMode = (mode) => SHAPE_MODES[(SHAPE_MODES.indexOf(mode) + 1) % SHAPE_MODES.length]
  const readWidth = (saved) => isWidth(saved) ? saved : DEFAULT_WIDTH
  const readOpacity = (saved) => isOpacity(saved) ? saved : DEFAULT_OPACITY
  // Board units, as a text's height: the line width's slider also sets the text size.
  const TEXT_SIZE_PER_WIDTH = 2
  const TEXT_SIZE_BASE = 8
  const textSizeFor = (width) => TEXT_SIZE_PER_WIDTH * width + TEXT_SIZE_BASE
  const isTextSize = (value) => Number.isInteger(value) && isWidth((value - TEXT_SIZE_BASE) / TEXT_SIZE_PER_WIDTH)
  const itemOpacity = (item) => item.opacity ?? DEFAULT_OPACITY

  const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

  const clamp255 = (x) => Math.max(0, Math.min(255, x))

  // A color's [r, g, b] channels, from #rgb, #rrggbb, rgb() or rgba() text, or null for a transparent or unreadable one.
  // SudokuPad's own cell color 3 is `rgb(-36, -36, -36)`, which clamps to black. Copied from Pen Tool Extras.
  function parseColor (text) {
    if (typeof text !== 'string') return null
    const value = text.trim().toLowerCase()
    const short = SHORT_HEX_COLOR.exec(value)
    const hex = HEX_COLOR.exec(short ? `#${short.slice(1).map((c) => c + c).join('')}` : value)
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16))
    const rgb = RGB_TEXT.exec(value)
    if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) <= 0)) return null
    return rgb.slice(1, 4).map((x) => Math.round(clamp255(Number(x))))
  }

  const toHex = (rgb) => '#' + rgb.map((x) => Math.round(clamp255(x)).toString(16).padStart(2, '0')).join('')

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
    let low = 0
    let high = 1
    if (!inGamut(fromOklabLinear([target, a, b]))) {
      for (let i = 0; i < 30; i++) {
        const mid = (low + high) / 2
        if (inGamut(fromOklabLinear([target, a * mid, b * mid]))) low = mid
        else high = mid
      }
    } else {
      low = 1
    }
    const out = fromOklabLinear([target, a * low, b * low])
    return toHex(out.map((x) => fromLinear(Math.max(0, Math.min(1, x)))))
  }

  // Color N is the color at index N of the page: SudokuPad shows index K on the cell color button with data-key K, so the buttons line up.
  // Of the darkened colors, the darkest one under GREY_CHROMA becomes #000000, so the darkest color is black as in SudokuPad's own set.
  // A slot with no usable color keeps SudokuPad's own pen color.
  function darkerPageColors (keys, readCell) {
    const colors = {}
    const darkened = []
    COLOR_NUMBERS.forEach((n) => {
      const rgb = n < keys.length ? parseColor(readCell(keys[n])) : null
      colors[n] = rgb ? darkenColor(rgb) : SUDOKUPAD_PEN_COLORS[n]
      if (rgb) darkened.push(n)
    })
    let darkest = null
    let darkestLightness = Infinity
    for (const n of darkened) {
      const [lightness, a, b] = toOklab(parseColor(colors[n]))
      if (Math.hypot(a, b) < GREY_CHROMA && lightness < darkestLightness) {
        darkest = n
        darkestLightness = lightness
      }
    }
    if (darkest) colors[darkest] = '#000000'
    return colors
  }

  // The presets the palette in force offers: one Darker page per cell color page, up to three, between the pen colors and SudokuPad's own.
  const presetOptions = (pageCount) => [PEN_PRESET, ...PAGE_PRESETS.slice(0, pageCount), SUDOKUPAD_PRESET]

  // `pages` is the palette's pages of color keys; `readCell` reads a key's color and `readPen` a pen color, each as CSS text.
  function presetColors (preset, pages, readCell, readPen) {
    if (preset === SUDOKUPAD_PRESET) return { ...SUDOKUPAD_PEN_COLORS }
    if (preset === PEN_PRESET) return copiedPenColors(readPen)
    const page = PAGE_PRESETS.indexOf(preset)
    if (page === -1 || page >= pages.length) throw new RangeError(`draw-tool: ${preset} is not a preset of this palette`)
    return darkerPageColors(pages[page], readCell)
  }

  // Copy and Paste carry the colors and both slider values, and not the drawings or the color picked.
  const readPastedColors = (data) => isPlainObject(data) && COLOR_NUMBERS.some((n) => n in data) && COLOR_NUMBERS.every((n) => !(n in data) || savedHex(data[n])) ? readDrawColors(data) : undefined
  const READERS = {
    [COLORS_KEY]: readPastedColors,
    [WIDTH_KEY]: (data) => isWidth(data) ? data : undefined,
    [OPACITY_KEY]: (data) => isOpacity(data) ? data : undefined
  }

  // The width and opacity in force, defaults included, so a paste can put one back to its default; the colors only once they are saved.
  function copiedSettings (store) {
    const copied = { [WIDTH_KEY]: readWidth(store.getData(WIDTH_KEY)), [OPACITY_KEY]: readOpacity(store.getData(OPACITY_KEY)) }
    const savedColors = readDrawColors(store.getData(COLORS_KEY))
    if (savedColors) copied[COLORS_KEY] = savedColors
    return JSON.stringify(copied)
  }

  // A reader returns the value to save, or undefined for one it refuses. Keys of other scripts are ignored, not counted: only a value of this script's own that its reader refuses is skipped.
  function pastedSettings (text) {
    let data
    try {
      data = JSON.parse(text)
    } catch (error) {
      throw new Error('the clipboard text is not JSON', { cause: error })
    }
    if (!isPlainObject(data)) throw new Error('the clipboard text is not a settings object')
    const values = {}
    let skipped = 0
    for (const [key, read] of Object.entries(READERS)) {
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

  // A shape's box as [left, top, right, bottom]: each corner of the drag snapped to the nearest quarter-cell line, or the drag's own box when `exact`.
  function shapeBox ([ax, ay], [bx, by], exact) {
    const quarter = CELL_SIZE / 4
    const snap = (v) => exact ? v : Math.round(v / quarter) * quarter
    const [sax, say, sbx, sby] = [ax, ay, bx, by].map(snap)
    return [Math.min(sax, sbx), Math.min(say, sby), Math.max(sax, sbx), Math.max(say, sby)].map(roundToTenth)
  }

  const straightLine = (points) => points.length <= 1 ? points.slice() : [points[0], points[points.length - 1]]

  // A drawing is a list of items, each with a kind: a stroke, a text or a shape. Their points and boxes are in board units.
  const strokeItem = (points, color, width, opacity) => ({ kind: 'stroke', color, width, opacity, points: points.map(([x, y]) => [roundToTenth(x), roundToTenth(y)]) })
  const textItem = ([x, y], text, color, size, opacity) => ({ kind: 'text', color, size, opacity, text, at: [roundToTenth(x), roundToTenth(y)] })
  const shapeItem = (shape, box, color, width, opacity) => ({ kind: 'shape', shape, color, width, opacity, box })

  const isItem = (item, kind, isItemOpacity) => isPlainObject(item) && item.kind === kind && drawColor(item.color) !== undefined && isItemOpacity(item.opacity)
  const isOpacityOrNone = (value) => value === undefined || isOpacity(value)
  const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(isNumber)
  // SVG draws nothing for a rectangle or an ellipse with no width or no height.
  const hasArea = ([left, top, right, bottom]) => left < right && top < bottom
  const isStroke = (item) => isItem(item, 'stroke', isOpacityOrNone) && isWidth(item.width) && Array.isArray(item.points) && item.points.length > 0 && item.points.every(isPoint)
  const isText = (item) => isItem(item, 'text', isOpacityOrNone) && isTextSize(item.size) && typeof item.text === 'string' && item.text.length > 0 && isPoint(item.at)
  // A shape is newer than opacity, so it always has one.
  const isShape = (item) => isItem(item, 'shape', isOpacity) && SHAPES.includes(item.shape) && isWidth(item.width) &&
    Array.isArray(item.box) && item.box.length === 4 && item.box.every(isNumber) && hasArea(item.box)

  // A puzzle with nothing saved has an empty drawing; saved data that is not a drawing throws rather than read as one.
  function readDrawing (saved) {
    if (saved === null || saved === undefined) return []
    if (!Array.isArray(saved) || !saved.every((item) => isStroke(item) || isText(item) || isShape(item))) throw new Error(`the saved drawing is not a list of strokes, texts and shapes: ${JSON.stringify(saved).slice(0, 200)}`)
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

  // SudokuPad gives the tools the keys Z X C V B N M by their place in getToolNames(). Leaving Draw out of the
  // list while a keydown is dispatched gives Draw no key, and keeps every other tool's key where it is without Draw.
  const toolNamesFor = (names, event) => event && event.type === 'keydown' && event.eventPhase !== 0
    ? names.filter((name) => name !== TOOL_NAME)
    : names

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, hasArea, shapeBox, shapeItem, nextShapeMode, readShapeMode, TOOL_NAME, simplifyPath, strokePath, straightLine, toolNamesFor, strokeItem, readDrawing, puzzleKey, touchIndex, readIndex, saveDrawingTo, DRAWING_PREFIX, INDEX_KEY, DEFAULT_COLOR, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH, DEFAULT_OPACITY, drawColor, readColor, readWidth, readOpacity, textSizeFor, itemOpacity, drawnLine, touchesStroke, ERASE_TOLERANCE, textItem, textBox, textAt, touchesItem, isClick, CLICK_SLOP, SUDOKUPAD_PEN_COLORS, hexColor, readDrawColors, presetOptions, presetColors, darkerPageColors, copiedSettings, pastedSettings, pasteReport, PRESET_LABELS, COLORS_KEY, WIDTH_KEY, OPACITY_KEY, copiedPenColors, editedColor, colorsCss, HOLD_TO_EDIT_MS }
  }
  if (typeof document === 'undefined') return

  // The match also covers other crackingthecryptic.com pages, which have no Framework.
  if (typeof Framework === 'undefined') return
  if (!Framework.getApp || !Framework.addTool) {
    console.warn('draw-tool: SudokuPad\'s Framework has no getApp or addTool, so no Draw tool was added')
    return
  }

  const boardSvg = () => Framework.app.svgRenderer.getElem()

  // The layer is the board SVG's last child, so it draws above the digits; SudokuPad's board scaling moves it with the cells.
  function drawingLayer () {
    const svg = boardSvg()
    let layer = svg.querySelector(`#${LAYER_ID}`)
    if (!layer) {
      layer = document.createElementNS(SVG_NS, 'g')
      layer.id = LAYER_ID
      layer.setAttribute('pointer-events', 'none')
    }
    if (svg.lastElementChild !== layer) svg.appendChild(layer)
    return layer
  }

  const onBoard = (event) => {
    const box = boardSvg().getBoundingClientRect()
    return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
  }

  const toBoard = (layer, event) => {
    const p = new window.DOMPoint(event.clientX, event.clientY).matrixTransform(layer.getScreenCTM().inverse())
    return [p.x, p.y]
  }

  // Until Draw is first made current its colors are not copied yet, so an item drawn by an older version shows in the pen color.
  const itemColor = (n) => `var(${colorVar(n)}, var(--puzzle-pencolor-${n}))`

  // An unfilled line in a draw color, as a stroke and a shape are drawn.
  function newOutline (layer, tag, className, color, width, opacity) {
    const element = document.createElementNS(SVG_NS, tag)
    element.setAttribute('class', className)
    element.setAttribute('fill', 'none')
    element.setAttribute('stroke-width', String(width))
    element.setAttribute('stroke-linejoin', 'round')
    element.setAttribute('stroke-opacity', String(opacity / 100))
    element.style.stroke = itemColor(color)
    layer.appendChild(element)
    return element
  }

  function newStroke (layer, color, width, opacity) {
    const path = newOutline(layer, 'path', 'draw-tool-stroke', color, width, opacity)
    path.setAttribute('stroke-linecap', 'round')
    return path
  }

  function newShape (layer, item) {
    const [left, top, right, bottom] = item.box
    const element = newOutline(layer, item.shape === RECT ? 'rect' : 'ellipse', SHAPE_ITEM_CLASS, item.color, item.width, item.opacity)
    const geometry = item.shape === RECT
      ? { x: left, y: top, width: right - left, height: bottom - top }
      : { cx: (left + right) / 2, cy: (top + bottom) / 2, rx: (right - left) / 2, ry: (bottom - top) / 2 }
    for (const [name, value] of Object.entries(geometry)) element.setAttribute(name, coordinate(value))
    return element
  }

  const drawStroke = (layer, item) => newStroke(layer, item.color, item.width, itemOpacity(item)).setAttribute('d', strokePath(item.points))

  function newText (layer, item) {
    const text = document.createElementNS(SVG_NS, 'text')
    text.setAttribute('class', 'draw-tool-text')
    text.setAttribute('x', coordinate(item.at[0]))
    text.setAttribute('y', coordinate(item.at[1]))
    text.setAttribute('font-size', String(item.size))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'central')
    text.style.fill = itemColor(item.color)
    text.setAttribute('fill-opacity', String(itemOpacity(item) / 100))
    text.textContent = item.text
    layer.appendChild(text)
    return text
  }

  const DRAWERS = { stroke: drawStroke, text: newText, shape: newShape }

  // Pen Tool Extras' pen panel, in the same sizes: SudokuPad's outer keypad size (four rows of a 4rem button between 0.15rem margins) as a grid of the nine
  // color buttons shortened to 2.5rem, a gap, a row of Clear all, the Shape button and the settings gear at the full 4rem, and the sliders across the rest. The tray
  // sits behind the last two rows; it is placed in their area but takes no cell. Each color button shows a line in its draw color, cut out of the button so a recolor follows.
  const rem = (value) => Math.round(value * 100) / 100
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
  const TRAY_REACH_REM = 0.25
  const TRAY_PADDING_REM = 0.4
  const TRAY_TOP_REM = rem(CONTROLS_GAP_REM + PANEL_BUTTON_MARGIN_REM - TRAY_PADDING_REM)
  const SLIDER_ROW_HEIGHT_REM = 1.4
  const SWATCH_REM = 2.4
  // The column of each control in its row.
  const CONTROL_COLUMNS = { [CLEAR_CLASS]: 1, [SHAPE_BUTTON_CLASS]: 2, [SETTINGS_CLASS]: 3 }
  const SWATCH_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M2 12H22' stroke='black' stroke-width='3' stroke-linecap='round'/></svg>"
  const SWATCH_MASK = `url("data:image/svg+xml,${encodeURIComponent(SWATCH_SVG).replace(/'/g, '%27')}") center / 100% no-repeat`
  // A CSS gradient cannot draw a slanted edge, so the wedge is a data-URI picture stretched over the track.
  const WEDGE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'><polygon points='0,4.5 100,1.5 100,8.5 0,5.5' fill='${PANEL_COLOR}'/></svg>`
  const WEDGE_PICTURE = `url("data:image/svg+xml,${encodeURIComponent(WEDGE_SVG)}") center / 100% 100% no-repeat`
  const FADE_PICTURE = `linear-gradient(to right, color-mix(in srgb, ${PANEL_COLOR} 8%, transparent), ${PANEL_COLOR})`
  const TRACK_SHAPE = `height: ${SLIDER_TRACK_REM}rem; border: none; border-radius: ${SLIDER_TRACK_REM / 2}rem;`
  const THUMB_SHAPE = `box-sizing: border-box; width: ${SLIDER_THUMB_REM}rem; height: ${SLIDER_THUMB_REM}rem; border-radius: 50%; background: #fff; border: ${SLIDER_THUMB_RING_REM}rem solid ${PANEL_COLOR};`
  const PANEL = '.tool-draw .controls-input'
  const controlButtons = Object.keys(CONTROL_COLUMNS).map((name) => `${PANEL} button.${name}`).join(', ')
  const PANEL_CSS = [
    `${PANEL} { display: grid !important; grid-template-columns: repeat(${PANEL_COLUMNS}, ${PANEL_CELL_REM}rem); grid-template-rows: repeat(${COLOR_ROWS}, ${COLOR_CELL_REM}rem) ${rem(CONTROLS_GAP_REM + PANEL_CELL_REM)}rem 1fr; height: ${PANEL_HEIGHT_REM}rem !important; padding: 0 !important; box-sizing: border-box; justify-items: center; align-items: center; position: relative; }`,
    `${PANEL} > .button-row { display: contents !important; }`,
    `${PANEL} button[data-key="0"], ${PANEL} button[data-control="delete"] { display: none !important; }`,
    `${PANEL} button.digit { position: relative; width: ${PANEL_BUTTON_REM}rem !important; height: ${COLOR_BUTTON_REM}rem !important; min-width: 0 !important; margin: ${PANEL_BUTTON_MARGIN_REM}rem !important; text-indent: -999em; overflow: hidden; color: transparent; }`,
    `${PANEL} button.digit:not(.current) { background-color: var(--body-bg); }`,
    `${PANEL} button.digit::after { content: ""; position: absolute; inset: 0; margin: auto; width: ${SWATCH_REM}rem; height: ${SWATCH_REM}rem; -webkit-mask: ${SWATCH_MASK}; mask: ${SWATCH_MASK}; }`,
    ...COLOR_NUMBERS.map((n) => `${PANEL} button[data-key="${n}"]::after { background-color: var(${colorVar(n)}); }`),
    `${controlButtons} { grid-row: ${CONTROLS_ROW}; align-self: end; position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; width: ${PANEL_BUTTON_REM}rem; height: ${PANEL_BUTTON_REM}rem; min-height: 0; margin: ${PANEL_BUTTON_MARGIN_REM}rem; padding: 0; background-color: var(--body-bg); color: ${PANEL_COLOR}; }`,
    ...Object.entries(CONTROL_COLUMNS).map(([name, column]) => `${PANEL} button.${name} { grid-column: ${column}; }`),
    `:is(.${CLEAR_CLASS}, .${SETTINGS_CLASS}, .${SHAPE_BUTTON_CLASS}) svg { width: 2.6rem; height: 2.6rem; }`,
    // SudokuPad's CSS fills every 'svg path', which would turn the icons' lines into blobs.
    `:is(.${CLEAR_CLASS}, .${SETTINGS_CLASS}, .${SHAPE_BUTTON_CLASS}) :is(path, circle, rect, ellipse) { fill: none !important; }`,
    `.${TRAY_CLASS} { grid-row: ${CONTROLS_ROW} / ${SLIDERS_ROW + 1}; grid-column: 1 / ${PANEL_COLUMNS + 1}; position: absolute; inset: 0; z-index: 0; margin: ${TRAY_TOP_REM}rem -${TRAY_REACH_REM}rem 0; background: ${TRAY_COLOR}; border-radius: ${TRAY_RADIUS_PX}px; }`,
    // SudokuPad's Keypad Flipped swaps the first and third rows of colors with a transform on each '.button-row', which has no box here, so the rows are swapped by grid row.
    ...[[1, 2, 3, COLOR_ROWS], [7, 8, 9, 1]].flatMap(([a, b, c, row]) => [a, b, c].map((key) => `.setting-flipkeypad ${PANEL} :is(button[data-key="${key}"], .${PICKER_CLASS}[data-color="${key}"]) { grid-row: ${row} / span 1; }`)),
    ...COLOR_NUMBERS.map((n) => `${PANEL} .${PICKER_CLASS}[data-color="${n}"] { grid-row: ${Math.ceil(n / PANEL_COLUMNS)} / span 1; grid-column: ${(n - 1) % PANEL_COLUMNS + 1} / span 1; }`),
    // Edit mode: a color picker sits over each color button, with the button's line hidden under it, in the sizes SudokuPad's color tool uses for the same job.
    `.${EDITING_CLASS} button.digit::after { opacity: 0; }`,
    `.${EDITING_CLASS} .${PICKER_CLASS} { position: relative; justify-self: stretch; align-self: stretch; z-index: 10; }`,
    `.${EDITING_CLASS} .${PICKER_CLASS} input { position: absolute; inset: 0; margin: auto; width: ${SWATCH_REM}rem; height: ${SWATCH_REM}rem; padding: 0; pointer-events: all; }`,
    `.${SLIDERS_CLASS} { grid-row: ${SLIDERS_ROW}; grid-column: 1 / ${PANEL_COLUMNS + 1}; justify-self: stretch; align-self: stretch; position: relative; z-index: 1; box-sizing: border-box; margin: ${PANEL_BUTTON_MARGIN_REM}rem ${PANEL_BUTTON_MARGIN_REM}rem ${TRAY_PADDING_REM}rem; padding: 0 0.8rem; display: flex; flex-direction: column; justify-content: space-evenly; color: ${PANEL_COLOR}; }`,
    `.${SLIDER_ROW_CLASS} { display: flex; align-items: center; height: ${SLIDER_ROW_HEIGHT_REM}rem; }`,
    `.${SLIDER_ROW_CLASS} input { flex: 1; min-width: 0; margin: 0; height: ${SLIDER_ROW_HEIGHT_REM}rem; background: transparent; outline: none; -webkit-appearance: none; appearance: none; }`,
    `.${SLIDER_ROW_CLASS} input::-webkit-slider-runnable-track { ${TRACK_SHAPE} }`,
    `.${SLIDER_ROW_CLASS} input::-moz-range-track { ${TRACK_SHAPE} }`,
    `#${SIZE_SLIDER}::-webkit-slider-runnable-track { background: ${WEDGE_PICTURE}; }`,
    `#${SIZE_SLIDER}::-moz-range-track { background: ${WEDGE_PICTURE}; }`,
    `#${OPACITY_SLIDER}::-webkit-slider-runnable-track { background: ${FADE_PICTURE}; }`,
    `#${OPACITY_SLIDER}::-moz-range-track { background: ${FADE_PICTURE}; }`,
    `.${SLIDER_ROW_CLASS} input::-webkit-slider-thumb { -webkit-appearance: none; margin-top: ${(SLIDER_TRACK_REM - SLIDER_THUMB_REM) / 2}rem; ${THUMB_SHAPE} }`,
    `.${SLIDER_ROW_CLASS} input::-moz-range-thumb { ${THUMB_SHAPE} }`,
    `.${TEXT_BOX_CLASS} { position: absolute; z-index: 1000; box-sizing: content-box; margin: 0; padding: 0; border: 1px dashed currentColor; outline: none; background: transparent; text-align: center; }`
  ].join('\n')
  // Pen Tool Extras' gear, at its viewBox.
  const SETTINGS_ICON_VIEWBOX = '-1.51 -2.63 27.882 27.882'
  const SETTINGS_ICON = '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'
  const SETTINGS_LABEL = 'Draw Tool settings'
  // Clear all is a trash can.
  const CLEAR_LABEL = 'Clear all'
  const CLEAR_ICON = '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>'
  // The Shape button shows the mode in force: a free line, a rectangle or an ellipse.
  const SHAPE_LABELS = { [SHAPE_OFF]: 'Shape: off, free lines', [RECT]: 'Shape: rectangle', [ELLIPSE]: 'Shape: ellipse' }
  const SHAPE_ICONS = {
    [SHAPE_OFF]: FREE_LINE_ICON,
    [RECT]: '<rect x="4" y="5" width="16" height="14" rx="1"/>',
    [ELLIPSE]: '<ellipse cx="12" cy="12" rx="9" ry="7"/>'
  }
  let color = DEFAULT_COLOR
  let width = DEFAULT_WIDTH
  let opacity = DEFAULT_OPACITY
  let shapeMode = SHAPE_OFF
  // Draw's nine colors, or null until they are first copied from the pen colors.
  let colors = null
  // The elements the panel adds to SudokuPad's keypad while Draw is current.
  let panelParts = []

  const keypad = () => document.querySelector('.controls-input')

  const unmarkColor = () => { for (const button of keypad().querySelectorAll('button.digit.current')) button.classList.remove('current') }

  function markColor () {
    unmarkColor()
    keypad().querySelector(`button[data-key="${color}"]`).classList.add('current')
  }

  function pickColor (next) {
    color = next
    Framework.setData(COLOR_KEY, color)
    markColor()
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
  }

  // The browser turns a color of any CSS form into rgb() text. A value it rejects, or none, reads as unreadable.
  function readRootColor (name) {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    const probe = document.createElement('span')
    probe.style.color = value
    if (!probe.style.color) return undefined
    document.documentElement.appendChild(probe)
    try {
      return window.getComputedStyle(probe).color
    } finally {
      probe.remove()
    }
  }

  const readPenColor = (n) => readRootColor(`--puzzle-pencolor-${n}`)
  // The raw `--cell-color-<key>` values, not the 60% opacity they show with on the grid. SudokuPad sets the variable of every key in the palette, so any page reads.
  const readCellColor = (key) => readRootColor(`--cell-color-${key}`)

  // The pages of cell color keys of the palette in force, or none until the color tool has one.
  function palettePages () {
    const palette = Framework.app.tools?.colour?.palette
    if (!palette) return []
    if (!Array.isArray(palette.pages) || !palette.pages.every(Array.isArray)) throw new Error('SudokuPad\'s color palette has no pages of color keys, so the Darker page presets are left out')
    return palette.pages
  }

  // A slider sets only the next item and is saved for the next visit, and a paste sets it as a move of the slider would.
  const SLIDERS = [
    { id: SIZE_SLIDER, label: 'Size', key: WIDTH_KEY, min: MIN_WIDTH, max: MAX_WIDTH, step: WIDTH_STEP, read: readWidth, get: () => width, set: (value) => { width = value } },
    { id: OPACITY_SLIDER, label: 'Opacity (%)', key: OPACITY_KEY, min: MIN_OPACITY, max: MAX_OPACITY, step: OPACITY_STEP, read: readOpacity, get: () => opacity, set: (value) => { opacity = value } }
  ]

  function setSlider (slider, value) {
    slider.set(value)
    Framework.setData(slider.key, value)
  }

  function sliderRow ({ id, label, min, max, step, get }) {
    const row = document.createElement('div')
    row.className = SLIDER_ROW_CLASS
    row.title = label
    const input = document.createElement('input')
    Object.assign(input, { type: 'range', id, min, max, step, value: get(), tabIndex: -1 })
    input.setAttribute('aria-label', label)
    row.appendChild(input)
    return row
  }

  // The settings dialog: nine color pickers and a preset list that fill a draft Save writes, and Copy and Paste settings, which act at once.
  const DIALOG_ID = 'draw-tool-dialog'
  const DIALOG_STYLE_ID = 'draw-tool-dialog-style'
  const SETTINGS_ENTRY_GROUP = 'experimental'
  const CUSTOM_LABEL = 'Custom'
  const SAVE_LABEL = 'Save'
  const DIALOG_CSS = [
    `#${DIALOG_ID} .draw-tool-presets { margin: 6px 0; }`,
    `#${DIALOG_ID} .draw-tool-swatches { display: grid; grid-template-columns: repeat(3, auto); gap: 8px; justify-content: start; margin: 6px 0; }`,
    `#${DIALOG_ID} .draw-tool-swatches label { display: flex; align-items: center; gap: 6px; }`,
    `#${DIALOG_ID} .draw-tool-swatches input { width: 2.4rem; height: 2.4rem; padding: 0; }`,
    '.draw-tool-version { opacity: .6; font-weight: normal; }'
  ].join('\n')

  const COPY_PASTE_HTML = '<div style="margin:6px 0;display:flex;align-items:center;gap:8px">' +
    '<button type="button" data-act="copy-settings">Copy settings</button>' +
    '<button type="button" data-act="paste-settings">Paste settings</button></div>' +
    '<div data-role="settings-status" style="opacity:.7;min-height:1.2em"></div>'

  function wireCopyPaste (root, apply) {
    const say = (message) => { root.querySelector('[data-role="settings-status"]').textContent = message }
    root.addEventListener('click', async (event) => {
      const act = event.target.closest('button[data-act]')?.dataset.act
      if (act !== 'copy-settings' && act !== 'paste-settings') return
      event.preventDefault()
      event.stopPropagation()
      try {
        if (act === 'copy-settings') {
          await navigator.clipboard.writeText(copiedSettings(Framework))
          say('Settings copied.')
        } else {
          const { values, skipped } = pastedSettings(await navigator.clipboard.readText())
          if (Object.keys(values).length > 0) apply(values)
          say(pasteReport(Object.keys(values).length, skipped))
        }
      } catch (error) {
        say(`Could not ${act === 'copy-settings' ? 'copy' : 'paste'}: ${error.message}`)
      }
    })
  }

  // A pasted value is saved and shown at once, whether or not Draw is current.
  function applyPasted (values) {
    for (const slider of SLIDERS) {
      if (!(slider.key in values)) continue
      setSlider(slider, values[slider.key])
      const input = document.getElementById(slider.id)
      if (input) input.value = values[slider.key]
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
        { tag: 'text', innerHTML: `<b>Draw Tool</b> <small class="draw-tool-version">v${VERSION}</small>` },
        { tag: 'text', innerHTML: `<div id="${DIALOG_ID}"></div>` },
        { tag: 'text', innerHTML: COPY_PASTE_HTML },
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
      const options = [`<option value="">${CUSTOM_LABEL}</option>`, ...presetOptions(pages.length).map((id) => `<option value="${id}"${id === chosen ? ' selected' : ''}>${PRESET_LABELS[id]}</option>`)]
      box.innerHTML = `<label class="draw-tool-presets">Colors <select data-role="preset">${options.join('')}</select></label>` +
        (paletteNote ? `<div data-role="palette-note">${paletteNote}.</div>` : '') +
        `<div class="draw-tool-swatches">${COLOR_NUMBERS.map((n) => `<label>${n} <input type="color" data-color="${n}" value="${draft[n]}"></label>`).join('')}</div>`
    }
    draw()
    box.addEventListener('change', (event) => {
      const target = event.target
      if (target.matches('[data-role="preset"]')) {
        chosen = target.value || null
        if (chosen) {
          draft = presetColors(chosen, pages, readCellColor, readPenColor)
          changed = true
        }
        draw()
      } else if (target.matches('input[data-color]')) {
        draft = editedColor(draft, Number(target.dataset.color), target.value)
        chosen = null
        changed = true
        draw()
      }
    })
    wireCopyPaste(box.closest('.dialog'), (values) => {
      applyPasted(values)
      draft = colors ?? draft
      chosen = null
      changed = false
      draw()
    })
  }

  function showShapeMode (button) {
    button.dataset.mode = shapeMode
    button.title = SHAPE_LABELS[shapeMode]
    button.setAttribute('aria-label', SHAPE_LABELS[shapeMode])
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SHAPE_ICONS[shapeMode]}</svg>`
  }

  function showPanel () {
    const tray = document.createElement('div')
    tray.className = TRAY_CLASS
    const clear = document.createElement('button')
    clear.className = CLEAR_CLASS
    clear.title = CLEAR_LABEL
    clear.setAttribute('aria-label', CLEAR_LABEL)
    clear.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CLEAR_ICON}</svg>`
    clear.addEventListener('click', confirmClear)
    const settings = document.createElement('button')
    settings.className = SETTINGS_CLASS
    settings.title = SETTINGS_LABEL
    settings.setAttribute('aria-label', SETTINGS_LABEL)
    settings.innerHTML = `<svg viewBox="${SETTINGS_ICON_VIEWBOX}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SETTINGS_ICON}</svg>`
    settings.addEventListener('click', openDialog)
    const shapeButton = document.createElement('button')
    shapeButton.className = SHAPE_BUTTON_CLASS
    showShapeMode(shapeButton)
    shapeButton.addEventListener('click', () => {
      shapeMode = nextShapeMode(shapeMode)
      Framework.setData(SHAPE_KEY, shapeMode)
      showShapeMode(shapeButton)
    })
    const sliders = document.createElement('div')
    sliders.className = SLIDERS_CLASS
    sliders.append(...SLIDERS.map(sliderRow))
    sliders.addEventListener('input', (event) => {
      const slider = SLIDERS.find((s) => s.id === event.target.id)
      setSlider(slider, slider.read(Number(event.target.value)))
    })
    panelParts = [tray, clear, shapeButton, settings, sliders]
    keypad().append(...panelParts)
  }

  function hidePanel () {
    exitEditMode()
    for (const part of panelParts) part.remove()
    panelParts = []
  }

  // Edit mode: a hold on a color button puts a color picker over each one, and another hold takes them away.
  function exitEditMode () {
    const panel = keypad()
    panel.classList.remove(EDITING_CLASS)
    for (const picker of panel.querySelectorAll(`.${PICKER_CLASS}`)) picker.remove()
  }

  function enterEditMode () {
    const panel = keypad()
    panel.classList.add(EDITING_CLASS)
    for (const n of COLOR_NUMBERS) {
      const picker = document.createElement('div')
      picker.className = PICKER_CLASS
      picker.dataset.color = n
      const input = document.createElement('input')
      Object.assign(input, { type: 'color', value: colors[n] })
      input.dataset.color = n
      picker.appendChild(input)
      panel.appendChild(picker)
    }
  }

  const toggleEditMode = () => keypad().classList.contains(EDITING_CLASS) ? exitEditMode() : enterEditMode()

  const HOLD_TARGETS = `.tool-draw .controls-input button.digit, .tool-draw .${PICKER_CLASS} input`

  // As Pen Tool Extras' hold on a pen button: either mouse button, and touch, through pointer events.
  function installHoldToEdit () {
    let timer
    let holdDone = false
    const cancel = () => { clearTimeout(timer); timer = undefined }
    document.addEventListener('pointerdown', (event) => {
      cancel()
      holdDone = false
      if (!event.target.closest(HOLD_TARGETS)) return
      timer = setTimeout(() => {
        timer = undefined
        holdDone = true
        if (Framework.app.tool === TOOL_NAME) toggleEditMode()
      }, HOLD_TO_EDIT_MS)
    }, true)
    window.addEventListener('pointerup', cancel, true)
    window.addEventListener('pointercancel', cancel, true)
    // The browser's menu would open over the picker during a right-click hold: Linux opens it on the press, Windows on the release, over the picker
    // that appeared under the pointer. A quick right-click on a button, released before the delay, keeps its menu on Windows.
    document.addEventListener('contextmenu', (event) => {
      if ((timer !== undefined || holdDone) && event.target.closest(HOLD_TARGETS)) event.preventDefault()
    }, true)
    // Every item in that color number reads the variable, so the recolor shows on them at once.
    document.addEventListener('input', (event) => {
      const input = event.target
      if (input.matches(`.${PICKER_CLASS} input`)) saveColors(editedColor(colors, Number(input.dataset.color), input.value))
    })
  }

  // A left-drag in progress: a free line, or a shape when `shape` is set. `element` is what it shows on the board so far.
  // `held` is whether its key is held: Alt keeps a shape to the drag's own box, and Shift draws a free line straight.
  let drag = null
  // A right-drag in progress: the last point it reached, and whether it has erased an item yet.
  let erasing = null
  // The open text box: the index of the text it reopened, or -1 for a new one, the item, and the input the solver types in.
  let editing = null
  // True from a press that finished a text box until its release, so the press does nothing else on the board.
  let pressFinishedText = false
  let drawing = []
  // False while this puzzle's saved drawing cannot be read: no save writes over it but an explicit wipe's.
  let savable = true
  // The failures already shown in a dialog on this page.
  const reported = new Set()

  const currentPuzzleKey = () => puzzleKey(Framework.app.puzzle.puzzleId, window.location.href)

  function renderDrawing () {
    const layer = drawingLayer()
    layer.replaceChildren()
    drawing.forEach((item, i) => {
      if (!editing || editing.index !== i) DRAWERS[item.kind](layer, item)
    })
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
      report('This puzzle\'s saved drawing cannot be read, so Draw Tool leaves it as it is and does not save the drawing on this puzzle. Clear all or Restart replaces it.')
      return
    }
    try {
      saveDrawingTo(Framework, currentPuzzleKey(), drawing)
    } catch (err) {
      report(`Draw Tool could not save this puzzle's drawing: ${err.message}`)
    }
  }

  // The text box is an input over the board, at the text's point, the size the text is drawn at.
  function placeTextBox () {
    const { input, item } = editing
    const toScreen = drawingLayer().getScreenCTM()
    const scale = toScreen.a
    const box = textBox({ ...item, text: input.value })
    const corner = new window.DOMPoint(box.left, box.top).matrixTransform(toScreen)
    input.style.left = `${corner.x + window.scrollX - 1}px`
    input.style.top = `${corner.y + window.scrollY - 1}px`
    input.style.width = `${(box.right - box.left) * scale}px`
    input.style.height = `${item.size * scale}px`
    input.style.fontSize = `${item.size * scale}px`
    input.style.lineHeight = `${item.size * scale}px`
  }

  function openText (at) {
    const index = textAt(drawing, at)
    const item = index === -1 ? textItem(at, '', color, textSizeFor(width), opacity) : { ...drawing[index] }
    const input = document.createElement('input')
    input.className = TEXT_BOX_CLASS
    input.type = 'text'
    input.value = item.text
    input.style.color = itemColor(item.color)
    input.style.fontFamily = window.getComputedStyle(drawingLayer()).fontFamily
    // As SudokuPad's own buttons do: a press in the box is the box's, and never reaches a tool.
    for (const type of ['mousedown', 'touchstart']) input.addEventListener(type, (event) => event.stopPropagation())
    input.addEventListener('input', placeTextBox)
    input.addEventListener('blur', () => { if (editing && editing.input === input) finishText() })
    editing = { index, item, input }
    document.body.appendChild(input)
    placeTextBox()
    renderDrawing()
    input.focus()
  }

  // An empty box removes its text.
  function finishText () {
    const { index, item, input } = editing
    editing = null
    input.remove()
    const before = index === -1 ? '' : drawing[index].text
    const text = input.value
    if (text !== before) {
      if (text === '') drawing.splice(index, 1)
      else if (index === -1) drawing.push({ ...item, text })
      else drawing[index] = { ...item, text }
    }
    renderDrawing()
    if (text !== before) save()
  }

  function dropText () {
    const { input } = editing
    editing = null
    input.remove()
    renderDrawing()
  }

  // SudokuPad's key listeners are on the document and the window, and its App's in the document's capture phase, so
  // a key typed in the box is stopped in the window's capture phase, before them all. Its default is left alone, so
  // the input types, edits, pastes and composes as any input does, and F5 or Tab do what they do anywhere.
  function keepBoxKeys (event) {
    if (!editing || event.target !== editing.input) return
    event.stopImmediatePropagation()
    if (event.type !== 'keydown' || event.isComposing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      finishText()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      dropText()
    }
  }

  // SudokuPad's buttons and dialogs stop their mousedown, so a press outside the box finishes it from the window's
  // capture phase, before any of them.
  function finishTextOnPress (event) {
    if (!editing || event.target === editing.input) return
    pressFinishedText = true
    finishText()
  }

  // A drag or erase in progress ends as a release ends it; a press that never moved opens no text box.
  function endGesture () {
    if (erasing) endErase()
    if (!drag) return
    if (isClick(drag.points)) dropDrag()
    else if (drag.shape) endShape()
    else endStroke()
  }

  function dropDrag () {
    drag.element?.remove()
    drag = null
  }

  const dragKeyHeld = (event) => drag.shape ? event.altKey : event.shiftKey
  const dragShape = () => shapeItem(drag.shape, shapeBox(drag.points[0], drag.points[drag.points.length - 1], drag.held), drag.color, drag.width, drag.opacity)

  // An Alt drag straight along a row or a column has no box to draw, so it saves nothing.
  function endShape () {
    const item = dragShape()
    if (!hasArea(item.box)) {
      dropDrag()
      return
    }
    drag.element?.remove()
    newShape(drag.layer, item)
    drag = null
    drawing.push(item)
    save()
  }

  function endErase () {
    const { erased } = erasing
    erasing = null
    if (erased) save()
  }

  function endStroke () {
    const { element: path, points, held, color: strokeColor, width: strokeWidth, opacity: strokeOpacity } = drag
    drag = null
    const item = strokeItem(held ? straightLine(points) : simplifyPath(points), strokeColor, strokeWidth, strokeOpacity)
    path.setAttribute('d', strokePath(item.points))
    drawing.push(item)
    save()
  }

  function cancelInput () {
    drag = null
    erasing = null
    if (editing) editing.input.remove()
    editing = null
  }

  function showSavedDrawing () {
    cancelInput()
    try {
      drawing = readDrawing(Framework.getData(drawingKey(currentPuzzleKey())))
      savable = true
    } catch (err) {
      console.warn(`draw-tool: ${err.message}. It is left as it is, and this puzzle's drawing is not saved.`)
      drawing = []
      savable = false
    }
    renderDrawing()
  }

  // An unreadable saved drawing is written over too.
  function emptyDrawing () {
    drawing = []
    cancelInput()
    drawingLayer().replaceChildren()
    savable = true
    save()
  }

  // Deletes, whole, every item the drag from `from` to `to` passes near.
  function eraseAlong (from, to) {
    const kept = drawing.filter((item) => !touchesItem(item, from, to))
    if (kept.length === drawing.length) return
    drawing = kept
    erasing.erased = true
    renderDrawing()
  }

  // SudokuPad gives a tool every button's mousedown; the browser opens its menu on the press on Linux and on the
  // release on Windows, so it is suppressed over the board for as long as Draw is current. On Windows a right-drag
  // that ends off the board still opens the menu there.
  function suppressMenu (event) {
    if (Framework.app.tool === TOOL_NAME && onBoard(event)) event.preventDefault()
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
    // finished a text box does nothing else on the board.
    handleInputdown (event) {
      if (event.type !== 'mousedown' || drag || erasing) return false
      if (pressFinishedText) return onBoard(event)
      if (!onBoard(event)) return false
      if (event.button === SECONDARY_BUTTON) {
        const at = toBoard(drawingLayer(), event)
        erasing = { last: at, erased: false }
        eraseAlong(at, at)
        return true
      }
      if (event.button !== PRIMARY_BUTTON) return false
      const layer = drawingLayer()
      const shape = shapeMode === SHAPE_OFF ? null : shapeMode
      drag = { layer, shape, element: null, color, width, opacity, held: false, points: [toBoard(layer, event)] }
      // A shape shows only once the press moves, so a click that opens a text box flashes no box.
      if (!shape) {
        drag.element = newStroke(layer, color, width, opacity)
        drag.element.setAttribute('d', strokePath(drag.points))
      }
      return true
    },
    // A release the page never saw (off the window, or under another tool) leaves the button up on the next move.
    handleInputMove (event) {
      if (event.type === 'mousemove' && (erasing || drag) && !(event.buttons & (erasing ? SECONDARY_HELD : PRIMARY_HELD))) {
        endGesture()
        return false
      }
      if (erasing) {
        const at = toBoard(drawingLayer(), event)
        eraseAlong(erasing.last, at)
        erasing.last = at
        return true
      }
      if (!drag) return false
      drag.points.push(toBoard(drag.layer, event))
      drag.held = dragKeyHeld(event)
      if (drag.shape) {
        drag.element?.remove()
        drag.element = isClick(drag.points) ? null : newShape(drag.layer, dragShape())
      } else {
        drag.element.setAttribute('d', strokePath(drag.held ? straightLine(drag.points) : drag.points))
      }
      return true
    },
    handleInputup (event) {
      if (erasing) {
        endErase()
        return true
      }
      if (!drag) return false
      // A text box opens only on the release of Draw's own press, never on a release or click alone.
      if (isClick(drag.points)) {
        const [at] = drag.points
        dropDrag()
        openText(at)
        return true
      }
      drag.held = dragKeyHeld(event)
      if (drag.shape) endShape()
      else endStroke()
      return true
    },
    handleToolEnter () {
      if (!colors) saveColors(copiedPenColors(readPenColor))
      showPanel()
      markColor()
    },
    handleToolExit () {
      endGesture()
      if (editing) finishText()
      hidePanel()
      unmarkColor()
    },
    // A digit key or keypad button gets the button's data-value. With Draw current it picks a draw color, and no key
    // or button enters anything in a cell.
    handleToolButton (value) {
      const picked = drawColor(value)
      if (picked !== undefined) pickColor(picked)
      return true
    },
    // SudokuPad calls every tool's handleKeydown first, and true ends the keydown there. Shift would otherwise switch
    // to Corner for as long as it is held (that tool's tempKey), and Alt to Letter or Corner by the Letter Tool Hotkey
    // setting, and a drag with either held would never reach Draw.
    handleKeydown (event) { return Framework.app.tool === TOOL_NAME && HELD_KEYS.includes(event.key) }
  }

  // Every tool button is appended to the bar when it is added (the pen tool's on its setting, a script's whenever it
  // runs), so Draw's moves back to the end each time one lands after it.
  function keepButtonLast () {
    const bar = document.querySelector('.controls-tool')
    const button = bar?.querySelector(`#control-${TOOL_NAME}`)
    if (!button) return
    const moveToEnd = () => { if (bar.lastElementChild !== button) bar.appendChild(button) }
    moveToEnd()
    new window.MutationObserver(moveToEnd).observe(bar, { childList: true })
  }

  Framework.getApp().then((app) => {
    color = readColor(Framework.getData(COLOR_KEY))
    for (const slider of SLIDERS) slider.set(slider.read(Framework.getData(slider.key)))
    shapeMode = readShapeMode(Framework.getData(SHAPE_KEY))
    colors = readDrawColors(Framework.getData(COLORS_KEY))
    showColors()
    const style = document.createElement('style')
    style.id = PANEL_STYLE_ID
    style.textContent = PANEL_CSS
    document.head.appendChild(style)
    const names = app.getToolNames
    app.getToolNames = function () { return toolNamesFor(names.call(this), this.currentEvent) }
    Framework.addTool({
      button: { name: TOOL_NAME, title: 'Draw', content: `<div class="icon">${BUTTON_ICON}</div>Draw` },
      tool
    })
    // SudokuPad's showDialog does nothing while its settings dialog is open, so that one closes first.
    Framework.addSetting({
      tag: 'button',
      name: 'drawtool',
      group: SETTINGS_ENTRY_GROUP,
      content: 'Draw Tool',
      handler: () => {
        Framework.closeDialog()
        setTimeout(openDialog, 0)
      }
    })
    keepButtonLast()
    app.puzzle.on('loaded', showSavedDrawing)
    app.on('restarted', emptyDrawing)
    window.addEventListener('contextmenu', suppressMenu)
    installHoldToEdit()
    window.addEventListener('blur', endGesture)
    window.addEventListener('pointerdown', finishTextOnPress, { capture: true })
    window.addEventListener('pointerup', () => { pressFinishedText = false }, { capture: true })
    for (const type of ['keydown', 'keypress', 'keyup']) window.addEventListener(type, keepBoxKeys, { capture: true })
    if (app.puzzle.currentPuzzle) showSavedDrawing()
  })
})()
