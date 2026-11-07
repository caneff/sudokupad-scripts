// ==UserScript==
// @name         SudokuPad Draw Tool
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.6.1
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

  const VERSION = '0.6.1'
  const TOOL_NAME = 'draw'
  const LAYER_ID = 'draw-tool-layer'
  const SVG_NS = 'http://www.w3.org/2000/svg'
  // Board units: SudokuPad's board SVG draws a cell 64 wide. Test Markup's brush is 3.
  const WIDTHS = [3, 6, 10]
  const DEFAULT_WIDTH = WIDTHS[1]
  const STROKE_OPACITY = 0.75
  // A stroke's color is the number of a SudokuPad pen color, 1 to 9; its color is the CSS variable --puzzle-pencolor-<n>.
  const PEN_COLORS = 9
  const DEFAULT_COLOR = 1
  const COLOR_KEY = 'DrawTool_color'
  const WIDTH_KEY = 'DrawTool_width'
  // Board units, as a text's height. Separate from the line widths.
  const TEXT_SIZES = [14, 20, 28]
  const DEFAULT_TEXT_SIZE = TEXT_SIZES[1]
  const TEXT_SIZE_KEY = 'DrawTool_textsize'
  // A character's width as a share of the text size: the widest digit of a sans-serif font, so a hit test errs wide.
  const CHAR_WIDTH = 0.6
  // How far, in board units, the mouse may move between press and release and the press still be a click.
  const CLICK_SLOP = 2
  const PANEL_BOX_CLASS = 'draw-tool-panel-box'
  const TEXT_BOX_CLASS = 'draw-tool-textbox'
  const CLEAR_CLASS = 'draw-tool-clear'
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
  const readWidth = (saved) => WIDTHS.includes(saved) ? saved : DEFAULT_WIDTH
  const readTextSize = (saved) => TEXT_SIZES.includes(saved) ? saved : DEFAULT_TEXT_SIZE

  const straightLine = (points) => points.length <= 1 ? points.slice() : [points[0], points[points.length - 1]]

  // A drawing is a list of items, each with a kind: a stroke or a text. Their points are in board units.
  const strokeItem = (points, color, width) => ({ kind: 'stroke', color, width, points: points.map(([x, y]) => [roundToTenth(x), roundToTenth(y)]) })
  const textItem = ([x, y], text, color, size) => ({ kind: 'text', color, size, text, at: [roundToTenth(x), roundToTenth(y)] })

  const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
  const isStroke = (item) => item !== null && typeof item === 'object' && item.kind === 'stroke' &&
    penColor(item.color) !== undefined && WIDTHS.includes(item.width) && Array.isArray(item.points) && item.points.length > 0 &&
    item.points.every((p) => Array.isArray(p) && p.length === 2 && p.every(isNumber))
  const isText = (item) => item !== null && typeof item === 'object' && item.kind === 'text' &&
    penColor(item.color) !== undefined && TEXT_SIZES.includes(item.size) && typeof item.text === 'string' && item.text.length > 0 &&
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
    module.exports = { VERSION, TOOL_NAME, simplifyPath, strokePath, straightLine, toolNamesFor, strokeItem, readDrawing, puzzleKey, touchIndex, readIndex, saveDrawingTo, DRAWING_PREFIX, INDEX_KEY, WIDTHS, DEFAULT_COLOR, DEFAULT_WIDTH, penColor, readColor, readWidth, drawnLine, touchesStroke, ERASE_TOLERANCE, TEXT_SIZES, DEFAULT_TEXT_SIZE, readTextSize, textItem, textBox, textAt, touchesItem, isClick, CLICK_SLOP }
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

  const penColorVar = (n) => `var(--puzzle-pencolor-${n})`

  function newStroke (layer, color, width) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('class', 'draw-tool-stroke')
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke-width', String(width))
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    path.setAttribute('stroke-opacity', String(STROKE_OPACITY))
    path.style.stroke = penColorVar(color)
    layer.appendChild(path)
    return path
  }

  // Solid, unlike a stroke, so a typed sum reads like one of the puzzle's own.
  function newText (layer, item) {
    const text = document.createElementNS(SVG_NS, 'text')
    text.setAttribute('class', 'draw-tool-text')
    text.setAttribute('x', coordinate(item.at[0]))
    text.setAttribute('y', coordinate(item.at[1]))
    text.setAttribute('font-size', String(item.size))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'central')
    text.style.fill = penColorVar(item.color)
    text.textContent = item.text
    layer.appendChild(text)
    return text
  }

  // The keypad with Draw current, in the style of SudokuPad's tool-pen.css: each digit button a pen color swatch,
  // 0 and delete covered by the panel box. The swatches read the pen color variables, so a changed one shows.
  const GREY = 'rgb(124, 124, 124)'
  const PANEL_CSS = `
.tool-draw .controls-input { position: relative; }
.tool-draw .controls-input button.digit { position: relative; text-indent: -999em; overflow: hidden; }
.tool-draw .controls-input button.digit:not(.current) { color: transparent; background-color: var(--body-bg); }
.tool-draw .controls-input button.digit:after { content: ""; position: absolute; width: 60%; height: 60%; left: 20%; top: 20%; }
${Array.from({ length: PEN_COLORS }, (_, i) => `.tool-draw .controls-input button[data-key="${i + 1}"]:after { background-color: ${penColorVar(i + 1)}; }`).join('\n')}
.tool-draw .controls-input button[data-key="0"], .tool-draw .controls-input button[data-control="delete"] { visibility: hidden; }
.${PANEL_BOX_CLASS} { position: absolute; left: 0; right: 0; top: 13rem; height: 4rem; display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: 1fr 1fr; gap: 0.25rem 0.4rem; }
.tool-draw .controls-input .${PANEL_BOX_CLASS} button { width: auto; height: auto; min-height: 0; margin: 0; padding: 0; }
.tool-draw .controls-input .${PANEL_BOX_CLASS} button:not(.current) { background-color: var(--body-bg); color: ${GREY}; }
.${PANEL_BOX_CLASS} svg { width: 100%; height: 100%; pointer-events: none; }
.tool-draw .controls-input .${PANEL_BOX_CLASS} button.${CLEAR_CLASS} { grid-column: 4; grid-row: 1 / span 2; font-size: 0.85rem; line-height: 1.15; color: ${GREY}; background-color: var(--body-bg); }
.${TEXT_BOX_CLASS} { position: absolute; z-index: 1000; box-sizing: content-box; margin: 0; padding: 0; border: 1px dashed currentColor; outline: none; background: transparent; text-align: center; }
`
  const widthIcon = (width) => `<svg viewBox="0 0 48 32"><line x1="10" y1="16" x2="38" y2="16" stroke="currentColor" stroke-linecap="round" stroke-width="${width}"/></svg>`
  const textSizeIcon = (size) => `<svg viewBox="0 0 48 32"><text x="24" y="16" text-anchor="middle" dominant-baseline="central" fill="currentColor" font-size="${size}">15</text></svg>`

  let color = DEFAULT_COLOR
  let width = DEFAULT_WIDTH
  let textSize = DEFAULT_TEXT_SIZE
  let panelBox = null

  const keypad = () => document.querySelector('.controls-input')

  const unmarkColor = () => { for (const button of keypad().querySelectorAll('button.digit.current')) button.classList.remove('current') }

  function markColor () {
    unmarkColor()
    keypad().querySelector(`button[data-key="${color}"]`).classList.add('current')
  }

  function markPanelBox () {
    if (!panelBox) return
    for (const button of panelBox.querySelectorAll('button[data-width]')) button.classList.toggle('current', Number(button.dataset.width) === width)
    for (const button of panelBox.querySelectorAll('button[data-text-size]')) button.classList.toggle('current', Number(button.dataset.textSize) === textSize)
  }

  function pickColor (next) {
    color = next
    Framework.setData(COLOR_KEY, color)
    markColor()
  }

  function pickWidth (next) {
    width = next
    Framework.setData(WIDTH_KEY, width)
    markPanelBox()
  }

  function pickTextSize (next) {
    textSize = next
    Framework.setData(TEXT_SIZE_KEY, textSize)
    markPanelBox()
  }

  function showPanelBox () {
    panelBox = document.createElement('div')
    panelBox.className = PANEL_BOX_CLASS
    const choices = [[WIDTHS, 'width', 'Line width', widthIcon], [TEXT_SIZES, 'textSize', 'Text size', textSizeIcon]]
    for (const [values, data, label, icon] of choices) {
      values.forEach((value, i) => {
        const button = document.createElement('button')
        button.dataset[data] = String(value)
        button.title = `${label} ${i + 1} of ${values.length}`
        button.innerHTML = icon(value)
        panelBox.appendChild(button)
      })
    }
    const clear = document.createElement('button')
    clear.className = CLEAR_CLASS
    clear.title = 'Clear the whole drawing'
    clear.innerHTML = 'Clear<br>all'
    panelBox.appendChild(clear)
    panelBox.addEventListener('click', (event) => {
      const button = event.target.closest('button')
      if (!button) return
      if (button === clear) confirmClear()
      else if (button.dataset.textSize) pickTextSize(Number(button.dataset.textSize))
      else pickWidth(Number(button.dataset.width))
    })
    keypad().querySelector('.button-row:last-child').appendChild(panelBox)
    markPanelBox()
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
      else newStroke(layer, item.color, item.width).setAttribute('d', strokePath(item.points))
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
    const item = index === -1 ? textItem(at, '', color, textSize) : { ...drawing[index] }
    const input = document.createElement('input')
    input.className = TEXT_BOX_CLASS
    input.type = 'text'
    input.value = item.text
    input.style.color = penColorVar(item.color)
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
    const { path, points, color: strokeColor, width: strokeWidth } = stroke
    stroke = null
    const item = strokeItem(straight ? straightLine(points) : simplifyPath(points), strokeColor, strokeWidth)
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
      stroke = { layer, path: newStroke(layer, color, width), color, width, straight: false, points: [toBoard(layer, event)] }
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
      showPanelBox()
      markColor()
    },
    handleToolExit () {
      endGesture()
      if (editing) finishText()
      panelBox?.remove()
      panelBox = null
      unmarkColor()
    },
    // A digit key or keypad button gets the button's data-value. With Draw current it picks a pen color, and no key
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

  Framework.getApp().then((app) => {
    color = readColor(Framework.getData(COLOR_KEY))
    width = readWidth(Framework.getData(WIDTH_KEY))
    textSize = readTextSize(Framework.getData(TEXT_SIZE_KEY))
    const style = document.createElement('style')
    style.textContent = PANEL_CSS
    document.head.appendChild(style)
    const names = app.getToolNames
    app.getToolNames = function () { return toolNamesFor(names.call(this), this.currentEvent) }
    Framework.addTool({
      button: { name: TOOL_NAME, title: 'Draw', content: `<div class="icon">${BUTTON_ICON}</div>Draw` },
      tool
    })
    app.puzzle.on('loaded', showSavedDrawing)
    app.on('restarted', emptyDrawing)
    window.addEventListener('contextmenu', suppressMenu)
    window.addEventListener('blur', endGesture)
    window.addEventListener('pointerdown', finishTextOnPress, { capture: true })
    window.addEventListener('pointerup', () => { pressFinishedText = false }, { capture: true })
    for (const type of ['keydown', 'keypress', 'keyup']) window.addEventListener(type, keepBoxKeys, { capture: true })
    if (app.puzzle.currentPuzzle) showSavedDrawing()
  })
})()
