// ==UserScript==
// @name         SudokuPad Draw Tool
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.3.0
// @description  Adds a Draw tool to SudokuPad: with it on, a drag on the board draws a smooth freehand line that stays on the cells it was drawn on, and Shift+drag draws a straight line. The keypad's nine pen colors, or the digit keys 1 to 9, pick a line's color, and three buttons pick its width. Each puzzle keeps its own drawing over a reload, and Restart clears it.
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

  const VERSION = '0.3.0'
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
  const WIDTHS_CLASS = 'draw-tool-widths'
  const DRAWING_PREFIX = 'DrawTool_drawing_'
  const INDEX_KEY = 'DrawTool_index'
  // How far, in board units, a mouse point may stray from the simplified line before it is kept.
  const SIMPLIFY_TOLERANCE = 1.5
  const KEPT_PUZZLES = 50
  const PRIMARY_BUTTON = 0
  const SHIFT_KEY = 'Shift'
  const BUTTON_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c3-6 5-9 7-6s1 6 4 3 4-8 7-9"/></svg>'

  const distanceToSegment = ([px, py], [ax, ay], [bx, by]) => {
    const dx = bx - ax
    const dy = by - ay
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }

  // Ramer-Douglas-Peucker: the fewest points whose line stays within `tolerance` of every point given.
  function simplifyPath (points, tolerance = SIMPLIFY_TOLERANCE) {
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
    if (farthest <= tolerance) return [first, last]
    const head = simplifyPath(points.slice(0, farthestIndex + 1), tolerance)
    return head.slice(0, -1).concat(simplifyPath(points.slice(farthestIndex), tolerance))
  }

  const roundToTenth = (value) => Math.round(value * 10) / 10
  const coordinate = (value) => String(roundToTenth(value))
  const point = ([x, y]) => `${coordinate(x)} ${coordinate(y)}`
  const midpoint = ([ax, ay], [bx, by]) => [(ax + bx) / 2, (ay + by) / 2]

  // Each inner point is the control of a curve that runs between the midpoints of its two segments.
  function strokePath (points) {
    if (points.length <= 2) return `M${point(points[0])} L${point(points[points.length - 1])}`
    const curves = []
    for (let i = 1; i < points.length - 1; i++) {
      const end = i === points.length - 2 ? points[i + 1] : midpoint(points[i], points[i + 1])
      curves.push(`Q${point(points[i])} ${point(end)}`)
    }
    return `M${point(points[0])} ${curves.join(' ')} L${point(points[points.length - 1])}`
  }

  // A keypad button's data-value is text, and Framework.getData parses a saved number back as a number.
  function penColor (value) {
    const n = typeof value === 'string' && /^[0-9]$/.test(value) ? Number(value) : value
    return Number.isInteger(n) && n >= 1 && n <= PEN_COLORS ? n : undefined
  }
  const readColor = (saved) => penColor(saved) ?? DEFAULT_COLOR
  const readWidth = (saved) => WIDTHS.includes(saved) ? saved : DEFAULT_WIDTH

  const straightLine = (points) => points.length <= 1 ? points.slice() : [points[0], points[points.length - 1]]

  // A drawing is a list of items, each with a kind; a stroke's points are in board units.
  const strokeItem = (points, color, width) => ({ kind: 'stroke', color, width, points: points.map(([x, y]) => [roundToTenth(x), roundToTenth(y)]) })

  const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
  const isStroke = (item) => item !== null && typeof item === 'object' && item.kind === 'stroke' &&
    isNumber(item.color) && isNumber(item.width) && Array.isArray(item.points) && item.points.length > 0 &&
    item.points.every((p) => Array.isArray(p) && p.length === 2 && p.every(isNumber))

  // A puzzle with nothing saved has an empty drawing; saved data that is not a drawing throws rather than read as one.
  function readDrawing (saved) {
    if (saved === null || saved === undefined) return []
    if (!Array.isArray(saved) || !saved.every(isStroke)) throw new Error(`draw-tool: the saved drawing is not a list of strokes: ${JSON.stringify(saved).slice(0, 200)}`)
    return saved
  }

  // As Auto Rules Resizer keys its saved data: a puzzle with no id falls back to the page URL.
  const puzzleKey = (puzzleId, href) => String(puzzleId || href)

  // The index lists puzzle keys oldest change first.
  function readIndex (saved) {
    if (saved === null || saved === undefined) return []
    if (!Array.isArray(saved) || !saved.every((key) => typeof key === 'string')) throw new Error(`draw-tool: the saved index is not a list of puzzle keys: ${JSON.stringify(saved).slice(0, 200)}`)
    return saved
  }

  function touchIndex (index, key) {
    const next = index.filter((k) => k !== key).concat(key)
    return { index: next.slice(-KEPT_PUZZLES), dropped: next.slice(0, Math.max(0, next.length - KEPT_PUZZLES)) }
  }

  // SudokuPad gives the tools the keys Z X C V B N M by their place in getToolNames(). Leaving Draw out of the
  // list while a keydown is dispatched gives Draw no key, and keeps every other tool's key where it is without Draw.
  const toolNamesFor = (names, event) => event && event.type === 'keydown' && event.eventPhase !== 0
    ? names.filter((name) => name !== TOOL_NAME)
    : names

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, TOOL_NAME, simplifyPath, strokePath, straightLine, toolNamesFor, strokeItem, readDrawing, puzzleKey, touchIndex, readIndex, KEPT_PUZZLES, WIDTHS, DEFAULT_COLOR, DEFAULT_WIDTH, penColor, readColor, readWidth }
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
    return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom &&
      !event.target.closest('button, .dialog, .controls-buttons')
  }

  const toBoard = (layer, event) => {
    const p = new window.DOMPoint(event.clientX, event.clientY).matrixTransform(layer.getScreenCTM().inverse())
    return [p.x, p.y]
  }

  function newStroke (layer, color, width) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('class', 'draw-tool-stroke')
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke-width', String(width))
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    path.setAttribute('stroke-opacity', String(STROKE_OPACITY))
    path.style.stroke = `var(--puzzle-pencolor-${color})`
    layer.appendChild(path)
    return path
  }

  // The keypad with Draw current, in the style of SudokuPad's tool-pen.css: each digit button a pen color swatch,
  // 0 and delete covered by the width box. The swatches read the pen color variables, so a changed one shows.
  const PANEL_CSS = `
.tool-draw .controls-input { position: relative; }
.tool-draw .controls-input button.digit { position: relative; text-indent: -999em; overflow: hidden; }
.tool-draw .controls-input button.digit:not(.current) { color: transparent; background-color: var(--body-bg); }
.tool-draw .controls-input button.digit:after { content: ""; position: absolute; width: 60%; height: 60%; left: 20%; top: 20%; }
${Array.from({ length: PEN_COLORS }, (_, i) => `.tool-draw .controls-input button[data-key="${i + 1}"]:after { background-color: var(--puzzle-pencolor-${i + 1}); }`).join('\n')}
.tool-draw .controls-input button[data-key="0"], .tool-draw .controls-input button[data-control="delete"] { visibility: hidden; }
.${WIDTHS_CLASS} { position: absolute; left: 0; right: 0; top: 13rem; height: 4rem; display: flex; gap: 0.4rem; }
.tool-draw .controls-input .${WIDTHS_CLASS} button { flex: 1; width: auto; height: 100%; margin: 0; padding: 0; }
.tool-draw .controls-input .${WIDTHS_CLASS} button:not(.current) { background-color: var(--body-bg); color: rgb(124, 124, 124); }
.${WIDTHS_CLASS} svg { width: 100%; height: 100%; pointer-events: none; }
`
  const widthIcon = (width) => `<svg viewBox="0 0 48 32"><line x1="10" y1="16" x2="38" y2="16" stroke="currentColor" stroke-linecap="round" stroke-width="${width}"/></svg>`

  let color = DEFAULT_COLOR
  let width = DEFAULT_WIDTH
  let widthsBox = null

  const keypad = () => document.querySelector('.controls-input')

  const unmarkColor = () => { for (const button of keypad().querySelectorAll('button.digit.current')) button.classList.remove('current') }

  function markColor () {
    unmarkColor()
    keypad().querySelector(`button[data-key="${color}"]`).classList.add('current')
  }

  function markWidth () {
    if (!widthsBox) return
    for (const button of widthsBox.children) button.classList.toggle('current', Number(button.dataset.width) === width)
  }

  function pickColor (next) {
    color = next
    Framework.setData(COLOR_KEY, color)
    markColor()
  }

  function pickWidth (next) {
    width = next
    Framework.setData(WIDTH_KEY, width)
    markWidth()
  }

  function showWidths () {
    widthsBox = document.createElement('div')
    widthsBox.className = WIDTHS_CLASS
    for (const w of WIDTHS) {
      const button = document.createElement('button')
      button.dataset.width = String(w)
      button.title = `Line width ${WIDTHS.indexOf(w) + 1} of ${WIDTHS.length}`
      button.innerHTML = widthIcon(w)
      widthsBox.appendChild(button)
    }
    widthsBox.addEventListener('click', (event) => {
      const button = event.target.closest('button')
      if (button) pickWidth(Number(button.dataset.width))
    })
    keypad().querySelector('.button-row:last-child').appendChild(widthsBox)
    markWidth()
  }

  let stroke = null
  let drawing = []
  // False while this puzzle's saved drawing cannot be read, so the script never writes over it.
  let savable = true

  const currentPuzzleKey = () => puzzleKey(Framework.app.puzzle.puzzleId, window.location.href)
  const drawingKey = (key) => DRAWING_PREFIX + key

  function showSavedDrawing () {
    stroke = null
    const layer = drawingLayer()
    layer.replaceChildren()
    try {
      drawing = readDrawing(Framework.getData(drawingKey(currentPuzzleKey())))
      savable = true
    } catch (err) {
      console.warn(`${err.message}. It is left as it is, and this puzzle's drawing is not saved.`)
      drawing = []
      savable = false
    }
    for (const item of drawing) newStroke(layer, item.color, item.width).setAttribute('d', strokePath(item.points))
  }

  // Writes the drawing, or removes the puzzle's entry when it is empty, and keeps the index to the newest puzzles.
  function saveDrawing () {
    const key = currentPuzzleKey()
    let index
    try {
      index = readIndex(Framework.getData(INDEX_KEY))
    } catch (err) {
      console.warn(`${err.message}. It is left as it is, and the drawing is not saved.`)
      return
    }
    if (drawing.length === 0) {
      Framework.removeData(drawingKey(key))
      Framework.setData(INDEX_KEY, index.filter((k) => k !== key))
      return
    }
    const touched = touchIndex(index, key)
    for (const dropped of touched.dropped) Framework.removeData(drawingKey(dropped))
    Framework.setData(INDEX_KEY, touched.index)
    Framework.setData(drawingKey(key), drawing)
  }

  // Restart, which SudokuPad confirms first, empties the drawing, an unreadable saved one included.
  function emptyDrawing () {
    drawing = []
    stroke = null
    drawingLayer().replaceChildren()
    savable = true
    saveDrawing()
  }

  const shownPoints = (points, event) => event.shiftKey ? straightLine(points) : points

  const tool = {
    name: TOOL_NAME,
    isTool: true,
    // A press that starts a stroke returns true, so SudokuPad starts no drag and selects no cell.
    handleInputdown (event) {
      if (event.type !== 'mousedown' || event.button !== PRIMARY_BUTTON || !onBoard(event)) return false
      const layer = drawingLayer()
      stroke = { layer, path: newStroke(layer, color, width), color, width, points: [toBoard(layer, event)], moved: false }
      stroke.path.setAttribute('d', strokePath(stroke.points))
      return true
    },
    handleInputMove (event) {
      if (!stroke) return false
      stroke.points.push(toBoard(stroke.layer, event))
      stroke.moved = true
      stroke.path.setAttribute('d', strokePath(shownPoints(stroke.points, event)))
      return true
    },
    handleInputup (event) {
      if (!stroke) return false
      const { path, points, moved, color: strokeColor, width: strokeWidth } = stroke
      stroke = null
      if (!moved) {
        path.remove()
        return true
      }
      const item = strokeItem(event.shiftKey ? straightLine(points) : simplifyPath(points), strokeColor, strokeWidth)
      path.setAttribute('d', strokePath(item.points))
      drawing.push(item)
      if (savable) saveDrawing()
      return true
    },
    handleToolEnter () {
      showWidths()
      markColor()
    },
    handleToolExit () {
      widthsBox?.remove()
      widthsBox = null
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
    if (app.puzzle.currentPuzzle) showSavedDrawing()
  })
})()
