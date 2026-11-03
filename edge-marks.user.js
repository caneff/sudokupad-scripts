// ==UserScript==
// @name         SudokuPad Edge Marks
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.1.2
// @description  Adds direction arrows and a dot to the pen tool's marks on a cell edge. Clicking an edge cycles through the marks ticked in a settings dialog. Relies on SudokuPad internals, so an update can break it.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/edge-marks.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/edge-marks.user.js
// ==/UserScript==

/* global ToolPen */

(function () {
  'use strict'

  // Shown in the options dialog, and the same as @version above. The script cannot read its own header
  // (GM_info is absent when it runs without Tampermonkey), so the number is kept here too.
  const VERSION = '0.1.2'
  // The settings group the entry goes in; SudokuPad declares it, and the dialog starts it collapsed.
  const SETTINGS_GROUP = 'experimental'
  const DATA_KEY = 'EdgeMarks_marks'
  const STYLE_ID = 'edge-marks-style'
  // The pen value of SudokuPad's own edge X on the right, bottom, left and top edge of a cell.
  // An edge between two cells is stored on one of them, so a click on it is always one of
  // these four values.
  const EDGE_X = ['3', '4', 'b', 'c']
  // The values this script adds, per edge: the first direction, the second direction, the dot.
  // SudokuPad's own pen values stop at `g`, so `h` onward are free.
  const ADDED = { 3: ['h', 'i', 'j'], 4: ['k', 'l', 'm'], b: ['n', 'o', 'p'], c: ['q', 'r', 's'] }
  // The two directions of a vertical edge, then of a horizontal one.
  const SHAPES = { 3: ['>', '<'], 4: ['^', 'v'], b: ['>', '<'], c: ['^', 'v'] }
  // The types of mark in cycle order. `directions` is the one checkbox for dirA and dirB.
  const CYCLE = ['x', 'dirA', 'dirB', 'dot']
  const SETTING_OF = { x: 'x', dirA: 'directions', dirB: 'directions', dot: 'dot' }
  const DEFAULT_SETTINGS = { x: true, directions: true, dot: true }
  // Stroke widths in SudokuPad's cell units (a cell is 64): thin like the edge X, and a dot
  // wide enough to read as one.
  const ARROW_WIDTH = 2.5
  const DOT_WIDTH = 7
  const DOT = '.'

  // Saved data is untrusted: returns { x, directions, dot } with the default (ticked) for any
  // entry that is not a boolean.
  function normalizeSettings (data) {
    const saved = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
    const out = {}
    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      out[key] = typeof saved[key] === 'boolean' ? saved[key] : DEFAULT_SETTINGS[key]
    })
    return out
  }

  // The pen value of each type on the edge whose X value is `edge`.
  function valueOfType (edge, type) {
    return type === 'x' ? edge : ADDED[edge][CYCLE.indexOf(type) - 1]
  }

  // The type of mark after `current` ('empty' or a type), skipping unticked types. 'empty' is
  // always allowed. A `current` whose type is unticked still moves on.
  function nextType (current, settings) {
    const order = [...CYCLE, 'empty']
    const from = order.indexOf(current)
    for (let step = 1; step <= order.length; step++) {
      const type = order[(from + step) % order.length]
      if (type === 'empty' || settings[SETTING_OF[type]]) return type
    }
    throw new Error('edge-marks: the cycle has no empty step')
  }

  // What one click on the edge whose X value is `edge` does to a cell that holds the pen
  // values `present`: { remove, add }, the values to toggle off and the one to toggle on (or
  // null). Null when nothing is ticked, so the click does nothing.
  function planClick (edge, present, settings) {
    if (!Object.keys(DEFAULT_SETTINGS).some((key) => settings[key])) return null
    const held = CYCLE.filter((type) => present.includes(valueOfType(edge, type)))
    const next = nextType(held.length ? held[0] : 'empty', settings)
    return {
      remove: held.map((type) => valueOfType(edge, type)),
      add: next === 'empty' ? null : valueOfType(edge, next)
    }
  }

  // The X value of the edge a value this script adds belongs to, or null for any other value.
  function edgeOf (value) {
    return EDGE_X.find((edge) => ADDED[edge].includes(value)) || null
  }

  // The shape a value this script adds draws: '>', '<', '^', 'v' or '.', else null.
  function shapeOf (value) {
    const edge = edgeOf(value)
    if (edge === null) return null
    const index = ADDED[edge].indexOf(value)
    return index === 2 ? DOT : SHAPES[edge][index]
  }

  // SVG path data, relative to the edge's midpoint, for a shape. `s` is the half-size in
  // SudokuPad's units. An arrow is a chevron whose tip points the way it names; the dot is a
  // zero-length segment, which a round cap draws even with `fill: none`.
  function shapePath (shape, s) {
    switch (shape) {
      case '>': return ` m ${-0.6 * s},${-s} l${1.2 * s},${s} l${-1.2 * s},${s}`
      case '<': return ` m ${0.6 * s},${-s} l${-1.2 * s},${s} l${1.2 * s},${s}`
      case '^': return ` m ${-s},${0.6 * s} l${s},${-1.2 * s} l${s},${1.2 * s}`
      case 'v': return ` m ${-s},${-0.6 * s} l${s},${1.2 * s} l${s},${-1.2 * s}`
      case DOT: return ' l0 0'
      default: throw new Error(`edge-marks: no shape named ${shape}`)
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, nextType, planClick, normalizeSettings, shapeOf, shapePath, DEFAULT_SETTINGS }
  }
  if (typeof Framework === 'undefined' || !Framework.getApp) return

  let settings = normalizeSettings(null)

  // The midpoint of an edge, as [row, col] in cell units, for the cell that stores it.
  function edgeMidpoint (edge, row, col) {
    switch (edge) {
      case '3': return [row + 0.5, col + 1]
      case '4': return [row + 1, col + 0.5]
      case 'b': return [row + 0.5, col]
      default: return [row, col + 0.5]
    }
  }

  // `.cell-pen.pen-X` outranks SudokuPad's `.cell-pen` width whichever stylesheet loads last.
  function buildCss () {
    const arrows = []
    const dots = []
    EDGE_X.forEach((edge) => {
      arrows.push(`.cell-pen.pen-${ADDED[edge][0]}, .cell-pen.pen-${ADDED[edge][1]}`)
      dots.push(`.cell-pen.pen-${ADDED[edge][2]}`)
    })
    return [
      `${arrows.join(', ')} { stroke-width: ${ARROW_WIDTH}; }`,
      `${dots.join(', ')} { stroke-width: ${DOT_WIDTH}; }`
    ].join('\n')
  }

  function applyCss () {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = buildCss()
    document.head.appendChild(style)
  }

  // Draws the values this script adds. SudokuPad's own `renderPen` has no case for them and
  // gives the path no `d`; it copies every option onto the path, so passing `d` is enough.
  function wrapRenderPen (proto, renderer) {
    const original = proto.renderPen
    const size = renderer.constructor.CellSize
    proto.renderPen = function (opts = {}) {
      const shape = shapeOf(opts.value)
      if (shape === null) return original.call(this, opts)
      const [r, c] = edgeMidpoint(edgeOf(opts.value), opts.row, opts.col)
      const d = this.constructor.rcToPathData([[r, c]]) + shapePath(shape, size * 0.125)
      return original.call(this, Object.assign({}, opts, { d }))
    }
  }

  // Chooses the mark for an edge click. The original `clickCell` runs unchanged, so its
  // edge-versus-cell hit test decides what was clicked; its `actSend` is held back to see
  // the actions it queued. An edge click has a select action and one pen action with an
  // edge X value; those are replaced by this script's cycle, and everything else is sent as
  // it was. The actions still go out through `actSend`, one group per click, so one undo
  // reverses one click.
  function wrapClickCell (tool) {
    const original = tool.clickCell
    tool.clickCell = function () {
      const hadOwn = Object.prototype.hasOwnProperty.call(this, 'actSend')
      const ownSend = this.actSend
      let queued = null
      this.actSend = function () { queued = this._actList.slice() }
      try {
        original.apply(this, arguments)
      } finally {
        if (hadOwn) this.actSend = ownSend
        else delete this.actSend
      }
      if (queued === null) return
      const [select, pen] = queued
      const isEdgeClick = queued.length === 2 && select.type === 'select' && pen.type === 'pen' && EDGE_X.includes(pen.arg)
      let acts = queued
      if (isEdgeClick) {
        const cell = select.arg[0]
        const plan = planClick(pen.arg, (cell.pen || []).map((valueColor) => valueColor[0]), settings)
        if (plan === null) return
        acts = [select, ...plan.remove.map((arg) => ({ type: 'pen', arg })), ...(plan.add === null ? [] : [{ type: 'pen', arg: plan.add }])]
      }
      this._actList.length = 0
      acts.forEach((act) => this.actAdd(act))
      this.actSend()
    }
  }

  // Cells drawn before the wrap hold values the old `renderPen` drew as nothing.
  function redrawAddedMarks (app) {
    app.puzzle.cells.forEach((cell) => {
      if ((cell.pen || []).some((valueColor) => shapeOf(valueColor[0]) !== null)) cell.renderContent(true)
    })
  }

  function install (app) {
    const tool = typeof ToolPen !== 'undefined' ? ToolPen.tool : undefined
    const renderer = app.svgRenderer
    const proto = renderer ? Object.getPrototypeOf(renderer) : undefined
    const found = tool && ['clickCell', 'actSend', 'actAdd'].every((name) => typeof tool[name] === 'function') &&
      Array.isArray(tool._actList) &&
      proto && typeof proto.renderPen === 'function' &&
      typeof renderer.constructor.rcToPathData === 'function' && typeof renderer.constructor.CellSize === 'number'
    if (!found) {
      console.warn('edge-marks: the pen tool or its renderer was not found, so the pen tool is left unchanged')
      return
    }
    wrapRenderPen(proto, renderer)
    wrapClickCell(tool)
    applyCss()
    redrawAddedMarks(app)
  }

  function renderEditor (current) {
    const row = (key, label) =>
      '<label style="display:block;margin:4px 0">' +
      `<input type="checkbox" data-mark="${key}"${current[key] ? ' checked' : ''}> ${label}</label>`
    return row('x', 'X') + row('directions', 'Directions (&gt; &lt; ^ v)') + row('dot', 'Dot')
  }

  function openDialog () {
    let current = normalizeSettings(Framework.getData(DATA_KEY))
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: `<b>Edge marks</b> <small style="opacity:.6">v${VERSION}</small><br>Marks a click on a cell edge cycles through` },
        { tag: 'text', innerHTML: '<div id="edge-marks-editor"></div>' },
        {
          tag: 'options',
          options: [
            {
              tag: 'button',
              content: 'Save',
              handler: () => {
                Framework.setData(DATA_KEY, current)
                settings = current
                Framework.closeDialog()
              }
            },
            { tag: 'button', content: 'Cancel', action: 'close' }
          ]
        }
      ]
    })
    const box = document.getElementById('edge-marks-editor')
    if (!box) throw new Error('edge-marks: the dialog has no editor element')
    box.innerHTML = renderEditor(current)
    box.addEventListener('change', (event) => {
      const el = event.target.closest('input[type="checkbox"]')
      if (!el) return
      current = { ...current, [el.dataset.mark]: el.checked }
    })
  }

  Framework.getApp().then(() => {
    settings = normalizeSettings(Framework.getData(DATA_KEY))
    Framework.addSetting({
      tag: 'button',
      name: 'edgemarks',
      group: SETTINGS_GROUP,
      content: 'Edge marks',
      handler: () => {
        Framework.closeDialog()
        setTimeout(openDialog, 0)
      }
    })
    install(Framework.app)
  })
})()
