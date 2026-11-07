// ==UserScript==
// @name         SudokuPad Draw Tool
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.9.0
// @description  Adds a Draw tool for freehand lines and typed text, such as cage sums, in the pen colors. Each puzzle keeps its own drawing.
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

  const VERSION = '0.9.0'
  const TOOL_NAME = 'draw'
  const LAYER_ID = 'draw-tool-layer'
  const SVG_NS = 'http://www.w3.org/2000/svg'
  // Board units: SudokuPad's board SVG draws a cell 64 wide. Test Markup's brush is 3.
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
  const PEN_COLORS = 9
  const COLOR_NUMBERS = Array.from({ length: PEN_COLORS }, (_, i) => i + 1)
  const DEFAULT_COLOR = 1
  const COLOR_KEY = 'DrawTool_color'
  const COLORS_KEY = 'DrawTool_colors'
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
  const CLEAR_OK = 'OK'
  const CLEAR_CANCEL = 'Cancel'
  const DRAWING_PREFIX = 'DrawTool_drawing_'
  const INDEX_KEY = 'DrawTool_index'
  // How far, in board units, a mouse point may stray from the simplified line before it is kept.
  const SIMPLIFY_TOLERANCE = 1.5
  // How far, in board units, a right-drag may pass from a line's edge and still erase it.
  const ERASE_TOLERANCE = 4
  // Straight pieces per curve when a stroke's drawn line is hit-tested.
  const CURVE_STEPS = 8
  const KEPT_PUZZLES = 50
  const PRIMARY_BUTTON = 0
  const SECONDARY_BUTTON = 2
  const SHIFT_KEY = 'Shift'
  const BUTTON_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c3-6 5-9 7-6s1 6 4 3 4-8 7-9"/></svg>'

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

  // Whether a right-drag from `from` to `to` passes within the tolerance of the line's edge.
  function touchesStroke (item, from, to) {
    const reach = ERASE_TOLERANCE + item.width / 2
    const line = drawnLine(item.points)
    if (line.length === 1) return distanceToSegment(line[0], from, to) <= reach
    for (let i = 1; i < line.length; i++) {
      if (segmentsDistance(from, to, line[i - 1], line[i]) <= reach) return true
    }
    return false
  }

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

  const touchesItem = (item, from, to) => item.kind === 'text' ? touchesText(item, from, to) : touchesStroke(item, from, to)

  // A press whose every point stays within the slop of where it began.
  const isClick = (points) => points.every(([x, y]) => Math.hypot(x - points[0][0], y - points[0][1]) <= CLICK_SLOP)

  // A keypad button's data-value is text, and Framework.getData parses a saved number back as a number.
  function penColor (value) {
    const n = typeof value === 'string' && /^[0-9]$/.test(value) ? Number(value) : value
    return Number.isInteger(n) && n >= 1 && n <= PEN_COLORS ? n : undefined
  }
  const readColor = (saved) => penColor(saved) ?? DEFAULT_COLOR
  const onSlider = (value, min, max, step) => isNumber(value) && value >= min && value <= max && Number.isInteger((value - min) / step)
  const isWidth = (value) => onSlider(value, MIN_WIDTH, MAX_WIDTH, WIDTH_STEP)
  const isOpacity = (value) => onSlider(value, MIN_OPACITY, MAX_OPACITY, OPACITY_STEP)
  const readWidth = (saved) => isWidth(saved) ? saved : DEFAULT_WIDTH
  const readOpacity = (saved) => isOpacity(saved) ? saved : DEFAULT_OPACITY
  // Board units, as a text's height: the line width's slider also sets the text size.
  const textSizeFor = (width) => 2 * width + 8
  const isTextSize = (value) => Number.isInteger(value) && isWidth((value - 8) / 2)
  const itemOpacity = (item) => item.opacity ?? DEFAULT_OPACITY

  const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

  // A color picker takes only #rrggbb, so every draw color is kept as one. A transparent color has none to keep.
  function hexColor (text) {
    if (typeof text !== 'string') return undefined
    const value = text.trim().toLowerCase()
    if (HEX_COLOR.test(value)) return value
    const short = SHORT_HEX_COLOR.exec(value)
    if (short) return `#${short.slice(1).map((c) => c + c).join('')}`
    const rgb = RGB_TEXT.exec(value)
    if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) === 0)) return undefined
    return `#${rgb.slice(1, 4).map((x) => Math.round(Math.max(0, Math.min(255, Number(x)))).toString(16).padStart(2, '0')).join('')}`
  }

  // null when nothing usable is saved, which means the first-use copy of the pen colors is still owed.
  function readDrawColors (saved) {
    if (!isPlainObject(saved)) return null
    const hex = (value) => typeof value === 'string' && HEX_COLOR.test(value.toLowerCase()) ? value.toLowerCase() : undefined
    if (!COLOR_NUMBERS.some((n) => hex(saved[n]))) return null
    return Object.fromEntries(COLOR_NUMBERS.map((n) => [n, hex(saved[n]) ?? SUDOKUPAD_PEN_COLORS[n]]))
  }

  // `readPenColor(n)` reads pen color n as the browser computes it.
  const copiedPenColors = (readPenColor) => Object.fromEntries(COLOR_NUMBERS.map((n) => [n, hexColor(readPenColor(n)) ?? SUDOKUPAD_PEN_COLORS[n]]))

  function editedColor (colors, n, value) {
    if (penColor(n) === undefined) throw new RangeError(`draw-tool: ${n} is not a color number`)
    const hex = hexColor(value)
    if (!hex) throw new RangeError(`draw-tool: ${value} is not a color`)
    return { ...colors, [n]: hex }
  }

  // `:root:root` outranks a plain `:root` rule whichever stylesheet loads last.
  const colorsCss = (colors) => [':root:root {', ...COLOR_NUMBERS.map((n) => `  --draw-tool-color-${n}: ${colors[n]};`), '}'].join('\n')

  const straightLine = (points) => points.length <= 1 ? points.slice() : [points[0], points[points.length - 1]]

  // A drawing is a list of items, each with a kind: a stroke or a text. Their points are in board units.
  const strokeItem = (points, color, width, opacity) => ({ kind: 'stroke', color, width, opacity, points: points.map(([x, y]) => [roundToTenth(x), roundToTenth(y)]) })
  const textItem = ([x, y], text, color, size, opacity) => ({ kind: 'text', color, size, opacity, text, at: [roundToTenth(x), roundToTenth(y)] })

  const isStroke = (item) => item !== null && typeof item === 'object' && item.kind === 'stroke' &&
    penColor(item.color) !== undefined && isWidth(item.width) && (item.opacity === undefined || isOpacity(item.opacity)) && Array.isArray(item.points) && item.points.length > 0 &&
    item.points.every((p) => Array.isArray(p) && p.length === 2 && p.every(isNumber))
  const isText = (item) => item !== null && typeof item === 'object' && item.kind === 'text' &&
    penColor(item.color) !== undefined && isTextSize(item.size) && (item.opacity === undefined || isOpacity(item.opacity)) && typeof item.text === 'string' && item.text.length > 0 &&
    Array.isArray(item.at) && item.at.length === 2 && item.at.every(isNumber)

  // A puzzle with nothing saved has an empty drawing; saved data that is not a drawing throws rather than read as one.
  function readDrawing (saved) {
    if (saved === null || saved === undefined) return []
    if (!Array.isArray(saved) || !saved.every((item) => isStroke(item) || isText(item))) throw new Error(`the saved drawing is not a list of strokes and texts: ${JSON.stringify(saved).slice(0, 200)}`)
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
    module.exports = { VERSION, TOOL_NAME, simplifyPath, strokePath, straightLine, toolNamesFor, strokeItem, readDrawing, puzzleKey, touchIndex, readIndex, saveDrawingTo, DRAWING_PREFIX, INDEX_KEY, DEFAULT_COLOR, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH, DEFAULT_OPACITY, penColor, readColor, readWidth, readOpacity, textSizeFor, itemOpacity, drawnLine, touchesStroke, ERASE_TOLERANCE, textItem, textBox, textAt, touchesItem, isClick, CLICK_SLOP, SUDOKUPAD_PEN_COLORS, hexColor, readDrawColors, copiedPenColors, editedColor, colorsCss, HOLD_TO_EDIT_MS }
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
  const itemColor = (n) => `var(--draw-tool-color-${n}, var(--puzzle-pencolor-${n}))`

  function newStroke (layer, color, width, opacity) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('class', 'draw-tool-stroke')
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke-width', String(width))
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    path.setAttribute('stroke-opacity', String(opacity / 100))
    path.style.stroke = itemColor(color)
    layer.appendChild(path)
    return path
  }

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

  // Pen Tool Extras' pen panel, in the same sizes: SudokuPad's outer keypad size (four rows of a 4rem button between 0.15rem margins) as a grid of the nine
  // color buttons shortened to 2.5rem, a gap, a row of Clear all, the Shape slot and the settings gear at the full 4rem, and the sliders across the rest. The tray
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
  // The column of each control in its row; the Shape slot, column 2, is left empty.
  const CONTROL_COLUMNS = { [CLEAR_CLASS]: 1, [SETTINGS_CLASS]: 3 }
  const GREY = 'rgb(124, 124, 124)'
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
    ...COLOR_NUMBERS.map((n) => `${PANEL} button[data-key="${n}"]::after { background-color: var(--draw-tool-color-${n}); }`),
    `${controlButtons} { grid-row: ${CONTROLS_ROW}; align-self: end; position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; width: ${PANEL_BUTTON_REM}rem; height: ${PANEL_BUTTON_REM}rem; min-height: 0; margin: ${PANEL_BUTTON_MARGIN_REM}rem; padding: 0; background-color: var(--body-bg); color: ${PANEL_COLOR}; }`,
    ...Object.entries(CONTROL_COLUMNS).map(([name, column]) => `${PANEL} button.${name} { grid-column: ${column}; }`),
    `${PANEL} button.${CLEAR_CLASS} { font-size: 0.85rem; line-height: 1.15; color: ${GREY}; }`,
    `.${SETTINGS_CLASS} svg { width: 2.6rem; height: 2.6rem; }`,
    // SudokuPad's CSS fills every 'svg path', which would turn the gear's lines into a blob.
    `.${SETTINGS_CLASS} path, .${SETTINGS_CLASS} circle { fill: none !important; }`,
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
  let color = DEFAULT_COLOR
  let width = DEFAULT_WIDTH
  let opacity = DEFAULT_OPACITY
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

  // The browser turns a pen color of any CSS form into rgb() text. A value it rejects, or none, reads as unreadable.
  function readPenColor (n) {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(`--puzzle-pencolor-${n}`).trim()
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

  // A slider sets only the next item and is saved for the next visit.
  function sliderRow (id, label, min, max, step, value) {
    const row = document.createElement('div')
    row.className = SLIDER_ROW_CLASS
    row.title = label
    const input = document.createElement('input')
    Object.assign(input, { type: 'range', id, min, max, step, value, tabIndex: -1 })
    input.setAttribute('aria-label', label)
    row.appendChild(input)
    return row
  }

  function showPanel () {
    const tray = document.createElement('div')
    tray.className = TRAY_CLASS
    const clear = document.createElement('button')
    clear.className = CLEAR_CLASS
    clear.title = 'Clear the whole drawing'
    clear.innerHTML = 'Clear<br>all'
    clear.addEventListener('click', confirmClear)
    const settings = document.createElement('button')
    settings.className = SETTINGS_CLASS
    settings.title = SETTINGS_LABEL
    settings.setAttribute('aria-label', SETTINGS_LABEL)
    settings.innerHTML = `<svg viewBox="${SETTINGS_ICON_VIEWBOX}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SETTINGS_ICON}</svg>`
    const sliders = document.createElement('div')
    sliders.className = SLIDERS_CLASS
    sliders.append(
      sliderRow(SIZE_SLIDER, 'Size', MIN_WIDTH, MAX_WIDTH, WIDTH_STEP, width),
      sliderRow(OPACITY_SLIDER, 'Opacity (%)', MIN_OPACITY, MAX_OPACITY, OPACITY_STEP, opacity)
    )
    sliders.addEventListener('input', (event) => {
      if (event.target.id === SIZE_SLIDER) {
        width = readWidth(Number(event.target.value))
        Framework.setData(WIDTH_KEY, width)
      } else {
        opacity = readOpacity(Number(event.target.value))
        Framework.setData(OPACITY_KEY, opacity)
      }
    })
    panelParts = [tray, clear, settings, sliders]
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

  let stroke = null
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
      if (editing && editing.index === i) return
      if (item.kind === 'text') newText(layer, item)
      else newStroke(layer, item.color, item.width, itemOpacity(item)).setAttribute('d', strokePath(item.points))
    })
  }

  // The solver loses work they think is kept, so each failure is shown once a page in SudokuPad's own dialog. Its
  // showDialog does nothing while another dialog is open, so the failure is shown at the next save instead.
  function report (message) {
    console.warn(`draw-tool: ${message}`)
    if (reported.has(message) || document.querySelector('.dialog-overlay')) return
    reported.add(message)
    Framework.showDialog({
      parts: [{ tag: 'text', content: message }, { tag: 'options', options: [{ tag: 'button', content: CLEAR_OK }] }],
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

  // A stroke or erase in progress ends as a release ends it; a press that never moved opens no text box.
  function endGesture () {
    if (erasing) endErase()
    if (!stroke) return
    if (isClick(stroke.points)) {
      stroke.path.remove()
      stroke = null
    } else endStroke(stroke.straight)
  }

  function endErase () {
    const { erased } = erasing
    erasing = null
    if (erased) save()
  }

  function endStroke (straight) {
    const { path, points, color: strokeColor, width: strokeWidth, opacity: strokeOpacity } = stroke
    stroke = null
    const item = strokeItem(straight ? straightLine(points) : simplifyPath(points), strokeColor, strokeWidth, strokeOpacity)
    path.setAttribute('d', strokePath(item.points))
    drawing.push(item)
    save()
  }

  function cancelInput () {
    stroke = null
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
        { tag: 'options', options: [{ tag: 'button', content: CLEAR_OK }, { tag: 'button', content: CLEAR_CANCEL }] }
      ],
      onButton: (label) => { if (label === CLEAR_OK) emptyDrawing() },
      centerOverBoard: true
    })
  }

  // The mouse button each gesture is held by, as a bit of a MouseEvent's `buttons`.
  const PRIMARY_HELD = 1
  const SECONDARY_HELD = 2

  const tool = {
    name: TOOL_NAME,
    isTool: true,
    // A press that starts a stroke returns true, so SudokuPad starts no drag and selects no cell. A press that
    // finished a text box does nothing else on the board.
    handleInputdown (event) {
      if (event.type !== 'mousedown' || stroke || erasing) return false
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
      stroke = { layer, path: newStroke(layer, color, width, opacity), color, width, opacity, straight: false, points: [toBoard(layer, event)] }
      stroke.path.setAttribute('d', strokePath(stroke.points))
      return true
    },
    // A release the page never saw (off the window, or under another tool) leaves the button up on the next move.
    handleInputMove (event) {
      if (event.type === 'mousemove' && (erasing || stroke) && !(event.buttons & (erasing ? SECONDARY_HELD : PRIMARY_HELD))) {
        endGesture()
        return false
      }
      if (erasing) {
        const at = toBoard(drawingLayer(), event)
        eraseAlong(erasing.last, at)
        erasing.last = at
        return true
      }
      if (!stroke) return false
      stroke.points.push(toBoard(stroke.layer, event))
      stroke.straight = event.shiftKey
      stroke.path.setAttribute('d', strokePath(stroke.straight ? straightLine(stroke.points) : stroke.points))
      return true
    },
    handleInputup (event) {
      if (erasing) {
        endErase()
        return true
      }
      if (!stroke) return false
      // A text box opens only on the release of Draw's own press, never on a release or click alone.
      if (isClick(stroke.points)) {
        const [at] = stroke.points
        stroke.path.remove()
        stroke = null
        openText(at)
        return true
      }
      endStroke(event.shiftKey)
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
      const picked = penColor(value)
      if (picked !== undefined) pickColor(picked)
      return true
    },
    // SudokuPad calls every tool's handleKeydown first, and true ends the keydown there. Shift would otherwise switch
    // to Corner for as long as it is held (that tool's tempKey), and Shift+drag would never reach Draw.
    handleKeydown (event) { return Framework.app.tool === TOOL_NAME && event.key === SHIFT_KEY }
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
    width = readWidth(Framework.getData(WIDTH_KEY))
    opacity = readOpacity(Framework.getData(OPACITY_KEY))
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
