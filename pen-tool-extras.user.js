// ==UserScript==
// @name         SudokuPad Pen Tool Extras
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      1.1.0
// @description  Pen tool extras in one settings dialog: sets the pen's nine colors to your current cell color page, darkened (or your own, saved in the dialog or by holding a pen color button), sets how thick pen lines, circles, crosses and edge marks are with one slider, and adds direction arrows and a circle to the marks a click on a cell edge cycles through. Relies on SudokuPad internals for the edge marks, so an update can break them.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/pen-tool-extras.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/pen-tool-extras.user.js
// ==/UserScript==

/* global ToolPen */

(function () {
  'use strict'

  // Shown in the options dialog, and the same as @version above. The script cannot read its own header
  // (GM_info is absent when it runs without Tampermonkey), so the number is kept here too.
  const VERSION = '1.1.0'
  // The settings group the entry goes in; SudokuPad declares it, and the dialog starts it collapsed.
  const SETTINGS_GROUP = 'experimental'
  // PenColor_colors and EdgeMarks_marks are the keys the scripts this one replaced saved under;
  // PenColor_thickness is new.
  const COLORS_KEY = 'PenColor_colors'
  const THICKNESS_KEY = 'PenColor_thickness'
  const MARKS_KEY = 'EdgeMarks_marks'
  const STYLE_ID = 'pen-tool-extras-style'
  // The element SudokuPad draws the grid in.
  const GRID_SELECTOR = '#svgrenderer'
  // `MouseEvent.button` of the right mouse button.
  const RIGHT_BUTTON = 2
  const PEN_COLORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  // SudokuPad's own pen colors (tool-pen.css), as #rrggbb. Pen color 9 is written there as
  // rgb(-36, -36, -36), which clamps to black.
  const DEFAULT_COLORS = {
    1: '#1f8020',
    2: '#e87cf1',
    3: '#e49632',
    4: '#f53a37',
    5: '#d2be32',
    6: '#3d99f5',
    7: '#d6d6d6',
    8: '#7c7c7c',
    9: '#000000'
  }
  const HEX_COLOR = /^#[0-9a-f]{6}$/i
  // How much of its OKLCH lightness a cell color keeps as a pen color. Low enough that the
  // pen reads clearly against the cell colors drawn at 60% opacity, high enough that the
  // lightest cell colors still show as 5px lines on white and the nine stay apart.
  const LIGHTNESS_FACTOR = 0.75
  // The OKLCH chroma under which a darkened color counts as grey. SudokuPad's own greys are 0;
  // a tinted dark grey such as rgb(10, 20, 30) is about 0.024; the least saturated hued colors
  // of the default pages, darkened, are above 0.08.
  const GREY_CHROMA = 0.04
  // The one thickness slider. SudokuPad draws free lines, the cell circle and the cross 5 wide
  // (in its cell units, a cell being 64) and the edge X 2.5 wide; the slider's value is the first
  // width, and everything else scales with it, so an edge mark is always half of it.
  const THICKNESS = { min: 1, max: 12, step: 1, fallback: 5 }
  const MARK_PER_THICKNESS = 0.5
  // The pen values (the `pen-<value>` class of a stroke) SudokuPad draws at the full width, from
  // `docs/research/sudokupad-pen-edge-marks.md`: the free lines, and 5 and 6 (the cell circle and
  // cross). Left out on purpose: 3, 4, b and c (the edge X marks, half the width), and h to s (the
  // arrows and circles this script adds, also half).
  const FULL_WIDTH_VALUES = ['1', '2', '5', '6', '7', '8', '9', 'a', 'd', 'e', 'f', 'g']
  // The pen value of SudokuPad's own edge X on the right, bottom, left and top edge of a cell.
  // An edge between two cells is stored on one of them, so a click on it is always one of
  // these four values.
  const EDGE_X = ['3', '4', 'b', 'c']
  // The values this script adds, per edge: the first direction, the second direction, the circle.
  // SudokuPad's own pen values stop at `g`, so `h` onward are free.
  const ADDED = { 3: ['h', 'i', 'j'], 4: ['k', 'l', 'm'], b: ['n', 'o', 'p'], c: ['q', 'r', 's'] }
  // The two directions of a vertical edge, then of a horizontal one.
  const SHAPES = { 3: ['>', '<'], 4: ['^', 'v'], b: ['>', '<'], c: ['^', 'v'] }
  // The types of mark in cycle order. `directions` is the one checkbox for dirA and dirB.
  const CYCLE = ['x', 'dirA', 'dirB', 'dot']
  const MARK_SETTING_OF = { x: 'x', dirA: 'directions', dirB: 'directions', dot: 'dot' }
  const DEFAULT_MARK_SETTINGS = { x: true, directions: true, dot: true }
  // The shape of the third mark per edge. Its checkbox is the `dot` field of the saved settings.
  const CIRCLE = 'o'
  const CIRCLE_RADIUS_PER_HALF_SIZE = 0.83
  const COLOR_TOOL_WAIT_MS = 10000
  const COLOR_TOOL_POLL_MS = 100
  // How long a pen color button is held to open the pickers: SudokuPad's color tool uses the
  // same 1000 ms (HoldToEditDelayMs) for its cell color buttons.
  const HOLD_TO_EDIT_MS = 1000

  // Saved data is untrusted: returns { penColor: '#rrggbb' } for every pen color, with the
  // default for any entry that is missing or not a #rrggbb string.
  function normalizeColors (data) {
    const saved = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
    const out = {}
    PEN_COLORS.forEach((n) => {
      const value = saved[n]
      out[n] = typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : DEFAULT_COLORS[n]
    })
    return out
  }

  // Saved data is untrusted: the saved set as { penColor: '#rrggbb' }, or null when nothing
  // usable is saved (not a plain object, or no entry that is a #rrggbb string), which means
  // the derived colors apply.
  function savedColors (data) {
    const set = normalizeColors(data)
    const usable = data && typeof data === 'object' && !Array.isArray(data) &&
      PEN_COLORS.some((n) => typeof data[n] === 'string' && HEX_COLOR.test(data[n]))
    return usable ? set : null
  }

  // The whole current set with pen color `pen` set to `value` (a #rrggbb string), lowercased.
  // The set is what gets saved, so a pen color or value that is not valid throws rather than
  // saving a set with a wrong entry.
  function editedColors (colors, pen, value) {
    if (!PEN_COLORS.includes(pen)) throw new RangeError(`pen-tool-extras: ${pen} is not a pen color`)
    if (typeof value !== 'string' || !HEX_COLOR.test(value)) throw new RangeError(`pen-tool-extras: ${value} is not a #rrggbb color`)
    return { ...colors, [pen]: value.toLowerCase() }
  }

  // Saved data is untrusted: the saved thickness when it is a whole number from THICKNESS.min to
  // THICKNESS.max, else THICKNESS.fallback.
  function normalizeThickness (data) {
    const ok = Number.isInteger(data) && data >= THICKNESS.min && data <= THICKNESS.max
    return ok ? data : THICKNESS.fallback
  }

  // Saved data is untrusted: returns { x, directions, dot } with the default (ticked) for any
  // entry that is not a boolean.
  function normalizeMarkSettings (data) {
    const saved = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
    const out = {}
    Object.keys(DEFAULT_MARK_SETTINGS).forEach((key) => {
      out[key] = typeof saved[key] === 'boolean' ? saved[key] : DEFAULT_MARK_SETTINGS[key]
    })
    return out
  }

  // The pen value of each type on the edge whose X value is `edge`.
  function valueOfType (edge, type) {
    return type === 'x' ? edge : ADDED[edge][CYCLE.indexOf(type) - 1]
  }

  // The type of mark `direction` steps (1 forward, -1 backward) from `current` ('empty' or a
  // type) round the cycle, skipping unticked types. 'empty' is always allowed. A `current`
  // whose type is unticked still moves on.
  function stepType (current, settings, direction) {
    const order = [...CYCLE, 'empty']
    const from = order.indexOf(current)
    for (let step = 1; step <= order.length; step++) {
      const type = order[(((from + direction * step) % order.length) + order.length) % order.length]
      if (type === 'empty' || settings[MARK_SETTING_OF[type]]) return type
    }
    throw new Error('pen-tool-extras: the cycle has no empty step')
  }

  // The type of mark a left click moves to from `current`.
  function nextType (current, settings) {
    return stepType(current, settings, 1)
  }

  // The type of mark a right click moves to from `current`: the same cycle, backwards.
  function previousType (current, settings) {
    return stepType(current, settings, -1)
  }

  // What one click on the edge whose X value is `edge` does to a cell that holds the pen
  // values `present`: { remove, add }, the values to toggle off and the one to toggle on (or
  // null). Null when nothing is ticked, so the click does nothing. `backwards` steps the cycle
  // the other way.
  function planClick (edge, present, settings, backwards = false) {
    if (!Object.keys(DEFAULT_MARK_SETTINGS).some((key) => settings[key])) return null
    const held = CYCLE.filter((type) => present.includes(valueOfType(edge, type)))
    const next = (backwards ? previousType : nextType)(held.length ? held[0] : 'empty', settings)
    return {
      remove: held.map((type) => valueOfType(edge, type)),
      add: next === 'empty' ? null : valueOfType(edge, next)
    }
  }

  // The X value of the edge a value this script adds belongs to, or null for any other value.
  function edgeOf (value) {
    return EDGE_X.find((edge) => ADDED[edge].includes(value)) || null
  }

  // The shape a value this script adds draws: '>', '<', '^', 'v' or 'o' (the circle), else null.
  function shapeOf (value) {
    const edge = edgeOf(value)
    if (edge === null) return null
    const index = ADDED[edge].indexOf(value)
    return index === 2 ? CIRCLE : SHAPES[edge][index]
  }

  // SVG path data, relative to the edge's midpoint, for a shape. `s` is the half-size in
  // SudokuPad's units. An arrow is a chevron whose tip points the way it names; the circle is an
  // open ring, two arcs from the left point round and back.
  function shapePath (shape, s) {
    const r = CIRCLE_RADIUS_PER_HALF_SIZE * s
    switch (shape) {
      case '>': return ` m ${-0.6 * s},${-s} l${1.2 * s},${s} l${-1.2 * s},${s}`
      case '<': return ` m ${0.6 * s},${-s} l${-1.2 * s},${s} l${1.2 * s},${s}`
      case '^': return ` m ${-s},${0.6 * s} l${s},${-1.2 * s} l${s},${1.2 * s}`
      case 'v': return ` m ${-s},${-0.6 * s} l${s},${1.2 * s} l${s},${-1.2 * s}`
      case CIRCLE: return ` m ${-r},0 a ${r},${r} 0 1,0 ${2 * r},0 a ${r},${r} 0 1,0 ${-2 * r},0`
      default: throw new Error(`pen-tool-extras: no shape named ${shape}`)
    }
  }

  const clamp255 = (x) => Math.max(0, Math.min(255, x))
  const RGB_TEXT = /^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)$/

  // True for `transparent` and an `rgba()` with alpha 0, the colors a page lists to leave a
  // slot empty (key 0 of each default page). Anything else, readable or not, is false.
  function isTransparent (text) {
    if (typeof text !== 'string') return false
    const value = text.trim().toLowerCase()
    const rgba = RGB_TEXT.exec(value)
    return value === 'transparent' || Boolean(rgba && rgba[4] !== undefined && Number(rgba[4]) <= 0)
  }

  // A color as `#rrggbb` or `rgb(r, g, b)` / `rgba(r, g, b, a)` text -> [r, g, b] whole numbers
  // clamped to 0-255, ignoring alpha; null for a fully transparent or unreadable value.
  // SudokuPad's own cell color 3 is `rgb(-36, -36, -36)`, which clamps to black.
  function parseColor (text) {
    if (typeof text !== 'string' || isTransparent(text)) return null
    const value = text.trim().toLowerCase()
    const hex = /^#([0-9a-f]{6})$/.exec(value)
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16))
    const rgb = RGB_TEXT.exec(value)
    return rgb ? rgb.slice(1, 4).map((x) => Math.round(clamp255(Number(x)))) : null
  }

  const toLinear = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  const fromLinear = (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)

  // sRGB [r, g, b] -> OKLab [L, a, b] and back (Ottosson's published matrices). The way back
  // returns the unclamped linear channels, so a caller can tell an out-of-gamut color.
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

  const EDGE = 1e-6
  const inGamut = (linear) => linear.every((x) => x >= -EDGE && x <= 1 + EDGE)

  // [r, g, b] -> '#rrggbb' with its OKLCH lightness multiplied by LIGHTNESS_FACTOR and its
  // hue kept. Lowering lightness at fixed chroma can leave sRGB, so chroma is reduced just
  // far enough to fit (a bisection), which keeps the hue. Channels are clamped to 0-255
  // first, so any number gives a valid color.
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
    return '#' + out.map((x) => Math.round(clamp255(fromLinear(Math.max(0, Math.min(1, x)))))
      .toString(16).padStart(2, '0')).join('')
  }

  // The pen colors a cell color page gives: pen color N is the color at index N of the page
  // (SudokuPad shows index K on the cell color button with data-key K, so the pen buttons line
  // up with the cell buttons), darkened, for N 1-9; index 0 is never used. A transparent or
  // unreadable entry, or an index past the page's end, keeps SudokuPad's own pen color in that
  // same place and is listed in `missing`, by number, with nothing moving up. Of the darkened
  // colors, the darkest one whose OKLCH chroma is under GREY_CHROMA becomes #000000; a page with
  // no such color changes nothing, and a kept SudokuPad color is not considered.
  function penColorsFromPage (keys, readColor) {
    const colors = {}
    const missing = []
    const derived = []
    PEN_COLORS.forEach((n) => {
      const rgb = n < keys.length ? parseColor(readColor(keys[n])) : null
      if (rgb) {
        colors[n] = darkenColor(rgb)
        derived.push(n)
      } else {
        colors[n] = DEFAULT_COLORS[n]
        missing.push(Number(n))
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

  // Overrides SudokuPad's nine pen color variables. Strokes (`.pencolor-N`) and the tool's
  // button swatches both read them; the eraser has its own fixed color and no variable.
  // SudokuPad's `tool-pen.css` loads when the pen tool is enabled, so a plain `:root` rule
  // would lose to it by coming first; `:root:root` outranks it whichever loads last.
  function buildCss (colors) {
    const lines = PEN_COLORS.map((n) => `  --puzzle-pencolor-${n}: ${colors[n]};`)
    return [':root:root {', ...lines, '}'].join('\n')
  }

  // Sets the stroke widths, for strokes drawn already and new ones: FULL_WIDTH_VALUES at
  // `thickness`; SudokuPad's edge X marks and this script's arrows and circles at half of it.
  // `:root:root` outranks SudokuPad's `.cell-pen` and `.pen-3` width rules whichever stylesheet
  // loads last, and the two lists share no value, so no value has two width rules.
  function buildThicknessCss (thickness) {
    if (normalizeThickness(thickness) !== thickness) throw new RangeError(`pen-tool-extras: ${thickness} is not a thickness from ${THICKNESS.min} to ${THICKNESS.max}`)
    const rule = (values, width) => `${values.map((v) => `:root:root .cell-pen.pen-${v}`).join(', ')} { stroke-width: ${width}; }`
    const marks = EDGE_X.flatMap((edge) => [edge, ...ADDED[edge]])
    return [rule(FULL_WIDTH_VALUES, thickness), rule(marks, thickness * MARK_PER_THICKNESS)].join('\n')
  }

  // Edit mode (the class is on the pen tool's panel): each color picker sits over its button
  // and the button's swatch is hidden under it. The sizes are those SudokuPad's color tool
  // uses for the same job.
  const EDITING = 'pen-tool-extras-editing'
  const PICKER = 'pen-tool-extras-picker'
  const EDIT_CSS = [
    `.${EDITING} button[data-value]::after { opacity: 0; }`,
    `.${EDITING} .${PICKER} { width: 0; height: 0; overflow: visible; }`,
    `.${EDITING} .${PICKER} input { position: absolute; width: 2.4rem; height: 2.4rem; margin-left: 0.95rem; margin-top: 0.95rem; z-index: 10; pointer-events: all; }`
  ].join('\n')
  // The elements a hold starts on, and the ones the context menu is suppressed over: the pen
  // tool's color buttons and, in edit mode, the pickers standing in for them (a right-click
  // hold ends over a picker, and Windows opens the menu on release).
  const HOLD_TARGETS = `.tool-pen button[data-value], .tool-pen .${PICKER} input`

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      VERSION,
      normalizeColors,
      savedColors,
      editedColors,
      parseColor,
      isTransparent,
      darkenColor,
      penColorsFromPage,
      buildCss,
      normalizeThickness,
      buildThicknessCss,
      normalizeMarkSettings,
      nextType,
      previousType,
      planClick,
      shapeOf,
      shapePath,
      DEFAULT_COLORS,
      DEFAULT_MARK_SETTINGS,
      THICKNESS,
      FULL_WIDTH_VALUES,
      LIGHTNESS_FACTOR,
      GREY_CHROMA,
      COLOR_TOOL_WAIT_MS,
      HOLD_TO_EDIT_MS
    }
  }
  if (typeof Framework === 'undefined' || !Framework.getApp) return

  // The pen colors in force and the pen colors (by number) that kept SudokuPad's own because
  // the color page had no usable color at their index. Until the color tool is read they are
  // SudokuPad's own, which is what the page shows with no override.
  let active = { ...DEFAULT_COLORS }
  let activeMissing = []
  // The thickness in force; the dialog previews another without changing it.
  let activeThickness = THICKNESS.fallback
  // The edge mark types ticked in the dialog, which the edge click cycles through.
  let markSettings = normalizeMarkSettings(null)

  // SudokuPad's color tool, once it holds the palette and current page it read at startup;
  // null before then. `init` assigns the page and sets the `--cell-color-<key>` variables in
  // one synchronous step, so a palette on the tool means the variables are set too (the
  // stylesheet's own values for them exist earlier and say nothing about a custom palette).
  function readyColorTool () {
    const tool = Framework.app && Framework.app.tools && Framework.app.tools.colour
    const palette = tool && tool.palette
    const ready = palette && Array.isArray(palette.pages) && Array.isArray(palette.pages[tool.currentPage])
    return ready ? tool : null
  }

  // Resolves to the ready color tool, or null if it is not ready after COLOR_TOOL_WAIT_MS.
  function waitForColorTool () {
    return new Promise((resolve) => {
      const deadline = Date.now() + COLOR_TOOL_WAIT_MS
      const check = () => {
        const tool = readyColorTool()
        if (tool || Date.now() >= deadline) resolve(tool)
        else setTimeout(check, COLOR_TOOL_POLL_MS)
      }
      check()
    })
  }

  // The darkened colors of the color tool's current page, read now from the raw
  // `--cell-color-<key>` values (not the 60% opacity they show with on the grid). A custom
  // palette can hold any CSS color (`#f00`, `red`, `hsl()`), and the variable reads back as
  // written, so each value goes through the browser to become `rgb()` text first. A value the
  // browser rejects stays as written, and `penColorsFromPage` treats it as unreadable.
  function deriveFromTool (tool) {
    const root = document.documentElement
    const rootStyle = window.getComputedStyle(root)
    const probe = document.createElement('span')
    root.appendChild(probe)
    try {
      return penColorsFromPage(tool.palette.pages[tool.currentPage], (key) => {
        const value = rootStyle.getPropertyValue(`--cell-color-${key}`).trim()
        probe.style.color = ''
        probe.style.color = value
        return probe.style.color ? window.getComputedStyle(probe).color : value
      })
    } finally {
      probe.remove()
    }
  }

  // The midpoint of an edge, as [row, col] in cell units, for the cell that stores it.
  function edgeMidpoint (edge, row, col) {
    switch (edge) {
      case '3': return [row + 0.5, col + 1]
      case '4': return [row + 1, col + 0.5]
      case 'b': return [row + 0.5, col]
      default: return [row, col + 0.5]
    }
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

  // Runs the original `clickCell` with its `actSend` held back and returns the actions it
  // queued (null when it queued none), leaving the tool's action list empty.
  function queuedActs (tool, original, args) {
    const hadOwn = Object.prototype.hasOwnProperty.call(tool, 'actSend')
    const ownSend = tool.actSend
    let queued = null
    tool.actSend = function () { queued = this._actList.slice() }
    try {
      original.apply(tool, args)
    } finally {
      if (hadOwn) tool.actSend = ownSend
      else delete tool.actSend
    }
    tool._actList.length = 0
    return queued
  }

  // An edge click has a select action and one pen action with an edge X value.
  function isEdgeActs (acts) {
    return acts !== null && acts.length === 2 && acts[0].type === 'select' && acts[1].type === 'pen' && EDGE_X.includes(acts[1].arg)
  }

  // The mouse button of the latest press or release. SudokuPad calls `clickCell` on the
  // release, with no event, so the button is read from the pointer events before it.
  let lastButton = 0

  function trackButton () {
    const remember = (event) => { lastButton = event.button }
    window.addEventListener('pointerdown', remember, true)
    window.addEventListener('pointerup', remember, true)
  }

  // Chooses the mark for an edge click. The original `clickCell` runs unchanged, so its
  // edge-versus-cell hit test decides what was clicked; its `actSend` is held back to see
  // the actions it queued. An edge click is replaced by this script's cycle (backwards after a
  // right click), and everything else is sent as it was. The actions still go out through
  // `actSend`, one group per click, so one undo reverses one click.
  function wrapClickCell (tool, original) {
    tool.clickCell = function () {
      const queued = queuedActs(this, original, arguments)
      if (queued === null) return
      let acts = queued
      if (isEdgeActs(queued)) {
        const [select, pen] = queued
        const cell = select.arg[0]
        const plan = planClick(pen.arg, (cell.pen || []).map((valueColor) => valueColor[0]), markSettings, lastButton === RIGHT_BUTTON)
        if (plan === null) return
        acts = [select, ...plan.remove.map((arg) => ({ type: 'pen', arg })), ...(plan.add === null ? [] : [{ type: 'pen', arg: plan.add }])]
      }
      acts.forEach((act) => this.actAdd(act))
      this.actSend()
    }
  }

  // Whether a click at the pointer's current position would be an edge click, found by running
  // the original `clickCell` without sending what it queues.
  function edgeUnderPointer (tool, original) {
    return isEdgeActs(queuedActs(tool, original, []))
  }

  // The pen tool steps an edge backwards on a right click, so the browser's menu must not open
  // over it. The check runs the pen tool's own hit test at the pointer, so only an edge counts:
  // a right click in a cell's middle, with another tool, or off the grid keeps its menu.
  function suppressEdgeMenu (app, isEdgeClick) {
    document.addEventListener('contextmenu', (event) => {
      if (app.tool === 'pen' && event.target.closest(GRID_SELECTOR) && isEdgeClick()) event.preventDefault()
    }, true)
  }

  // Cells drawn before the wrap hold values the old `renderPen` drew as nothing.
  function redrawAddedMarks (app) {
    app.puzzle.cells.forEach((cell) => {
      if ((cell.pen || []).some((valueColor) => shapeOf(valueColor[0]) !== null)) cell.renderContent(true)
    })
  }

  function installEdgeMarks (app) {
    const tool = typeof ToolPen !== 'undefined' ? ToolPen.tool : undefined
    const renderer = app.svgRenderer
    const proto = renderer ? Object.getPrototypeOf(renderer) : undefined
    const found = tool && ['clickCell', 'actSend', 'actAdd'].every((name) => typeof tool[name] === 'function') &&
      Array.isArray(tool._actList) &&
      proto && typeof proto.renderPen === 'function' &&
      typeof renderer.constructor.rcToPathData === 'function' && typeof renderer.constructor.CellSize === 'number'
    if (!found) {
      console.warn('pen-tool-extras: the pen tool or its renderer was not found, so the edge marks are not installed')
      return
    }
    wrapRenderPen(proto, renderer)
    const original = tool.clickCell
    wrapClickCell(tool, original)
    trackButton()
    suppressEdgeMenu(app, () => edgeUnderPointer(tool, original))
    redrawAddedMarks(app)
  }

  // The thickness the style shows now: the one in force, or the one a dialog is previewing.
  let shownThickness = THICKNESS.fallback

  function applyStyle (colors, thickness) {
    shownThickness = thickness
    let style = document.getElementById(STYLE_ID)
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = [buildCss(colors), buildThicknessCss(thickness), EDIT_CSS].join('\n')
  }

  function missingNote (missing) {
    if (!missing.length) return ''
    const list = (missing.length === 1 ? 'pen color ' : 'pen colors ') + missing.join(', ')
    return `<div style="margin:6px 0;max-width:20em">The current cell color page has no usable color at the matching button, so ${list} keep${missing.length === 1 ? 's' : ''} SudokuPad's own.</div>`
  }

  // A small picture of each edge mark, drawn in the text color: the X, the arrows, the circle.
  const MARK_PICTURES = {
    x: '<path d="M3 3 L13 13 M13 3 L3 13"/>',
    directions: '<path d="M1 4 L4 8 L1 12 M15 4 L12 8 L15 12"/>',
    dot: '<circle cx="8" cy="8" r="5.2"/>'
  }
  const markPicture = (key) =>
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MARK_PICTURES[key]}</svg>`

  function renderEditor (state) {
    const rows = PEN_COLORS.map((n) =>
      '<div style="margin:3px 0;display:flex;align-items:center;gap:8px">' +
      `<b style="width:1.2em;text-align:right">${n}</b>` +
      `<input type="color" data-pen="${n}" value="${state.colors[n]}"></div>`
    ).join('')
    const box = (key, label) =>
      '<div style="margin:4px 0;display:flex;justify-content:flex-start;align-items:center;gap:6px">' +
      `<input type="checkbox" id="pen-tool-extras-mark-${key}" data-mark="${key}"${state.marks[key] ? ' checked' : ''}>` +
      `${markPicture(key)}<label for="pen-tool-extras-mark-${key}" style="width:auto;text-align:left">${label}</label></div>`
    return '<div style="font-weight:600">Pen colors</div>' + rows +
      missingNote(state.missing) +
      '<div style="margin:8px 0;display:flex;align-items:center;gap:8px">' +
      '<label for="pen-tool-extras-thickness">Thickness</label>' +
      `<input type="range" id="pen-tool-extras-thickness" min="${THICKNESS.min}" max="${THICKNESS.max}" step="${THICKNESS.step}" value="${state.thickness}">` +
      `<output for="pen-tool-extras-thickness">${state.thickness}</output></div>` +
      '<div style="font-weight:600;margin-top:10px">Edge marks a click cycles through</div>' +
      box('x', 'X') + box('directions', 'Directions (&gt; &lt; ^ v)') + box('dot', 'Circle')
  }

  function openDialog () {
    let colors = { ...active }
    let missing = activeMissing
    // True after Restore defaults until a color is edited: Save then clears the saved set.
    let reset = false
    // The pen colors picked by hand since the dialog opened or Restore defaults. Save with none
    // changes nothing, so a derived set is never saved by accident.
    const edited = new Set()
    // The thickness shown by the slider, and whether Restore defaults set it with no slider move
    // since: Save then clears the saved thickness.
    let thickness = activeThickness
    let thicknessReset = false
    let marks = markSettings
    let committed = false
    let box = null
    const draw = () => {
      box.innerHTML = renderEditor({ colors, missing: missing.filter((n) => !edited.has(String(n))), thickness, marks })
    }
    // Reads the color tool's current page now; with no color tool, SudokuPad's own colors.
    const restoreDefaults = () => {
      const tool = readyColorTool()
      const derived = tool ? deriveFromTool(tool) : { colors: { ...DEFAULT_COLORS }, missing: [] }
      colors = derived.colors
      missing = derived.missing
      edited.clear()
      reset = true
      thickness = THICKNESS.fallback
      thicknessReset = true
      applyStyle(active, thickness)
      draw()
    }
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: `<b>Pen tool extras</b> <small style="opacity:.6">v${VERSION}</small>` },
        { tag: 'text', innerHTML: '<div id="pen-tool-extras-editor"></div>' },
        {
          tag: 'options',
          options: [
            {
              tag: 'button',
              content: 'Save',
              handler: () => {
                committed = true
                if (reset || edited.size) {
                  if (reset) Framework.removeData(COLORS_KEY)
                  else Framework.setData(COLORS_KEY, colors)
                  adoptColors(colors, edited.size ? [] : missing)
                }
                if (thicknessReset) Framework.removeData(THICKNESS_KEY)
                else if (thickness !== activeThickness) Framework.setData(THICKNESS_KEY, thickness)
                adoptThickness(thickness)
                if (Object.keys(marks).some((key) => marks[key] !== markSettings[key])) Framework.setData(MARKS_KEY, marks)
                markSettings = marks
                Framework.closeDialog()
              }
            },
            { tag: 'button', content: 'Cancel', action: 'close' },
            { tag: 'button', content: 'Restore defaults', handler: restoreDefaults }
          ]
        }
      ]
    })
    box = document.getElementById('pen-tool-extras-editor')
    if (!box) throw new Error('pen-tool-extras: the dialog has no editor element')
    draw()
    // Any way of closing the dialog but Save ends the thickness preview: the one in force comes back.
    const closeWatch = new window.MutationObserver(() => {
      if (box.isConnected) return
      closeWatch.disconnect()
      if (!committed) applyStyle(active, activeThickness)
    })
    closeWatch.observe(document.body, { childList: true, subtree: true })
    // `input` fires as the slider moves: the strokes change live, and Cancel undoes it.
    box.addEventListener('input', (event) => {
      const el = event.target.closest('input[type="range"]')
      if (!el) return
      thickness = Number(el.value)
      thicknessReset = false
      applyStyle(active, thickness)
      el.nextElementSibling.textContent = el.value
    })
    // `change` fires when a color picker closes (the swatch the user sees is already the new
    // color) and when a mark box is ticked.
    box.addEventListener('change', (event) => {
      const mark = event.target.closest('input[type="checkbox"]')
      if (mark) {
        marks = { ...marks, [mark.dataset.mark]: mark.checked }
        return
      }
      const el = event.target.closest('input[type="color"]')
      if (!el) return
      colors = editedColors(colors, el.dataset.pen, el.value)
      edited.add(el.dataset.pen)
      reset = false
      draw()
    })
  }

  // Makes `colors` the set in force: the style, the dialog's starting point and any pickers
  // already open, so every place that shows a pen color shows the same one.
  function adoptColors (colors, missing) {
    active = colors
    activeMissing = missing
    // New colors keep whatever thickness the style shows, so a dialog's preview survives them.
    applyStyle(colors, shownThickness)
    document.querySelectorAll(`.${PICKER} input`).forEach((el) => { el.value = colors[el.dataset.pen] })
  }

  // Makes `thickness` the one in force.
  function adoptThickness (thickness) {
    activeThickness = thickness
    applyStyle(active, thickness)
  }

  // Sets pen color `pen` live and saves the whole current set, the same as Save in the dialog:
  // from then on the set no longer follows the cell color page.
  function savePenColor (pen, value) {
    const colors = editedColors(active, pen, value)
    Framework.setData(COLORS_KEY, colors)
    adoptColors(colors, [])
  }

  // Holding a pen color button for HOLD_TO_EDIT_MS, with either mouse button or a finger, puts
  // a color picker over each of the nine colors; a second hold, or leaving the pen tool, takes
  // them away. SudokuPad keeps one panel element and swaps its `tool-pen` class for the next
  // tool's, so the pickers would stay behind on their own: a class watcher ends edit mode when
  // the panel stops being the pen's.
  let leaveWatch = null

  function exitEditMode (panel) {
    if (leaveWatch) leaveWatch.disconnect()
    leaveWatch = null
    panel.classList.remove(EDITING)
    panel.querySelectorAll(`.${PICKER}`).forEach((el) => el.remove())
  }

  function enterEditMode (panel) {
    // Every button is found before anything changes, so a missing one leaves no half edit mode.
    const buttons = PEN_COLORS.map((n) => {
      const button = panel.querySelector(`button[data-value="${n}"]`)
      if (!button) throw new Error(`pen-tool-extras: the pen tool has no button for pen color ${n}`)
      return button
    })
    panel.classList.add(EDITING)
    buttons.forEach((button, i) => {
      button.insertAdjacentHTML('beforebegin',
        `<div class="${PICKER}"><input type="color" data-pen="${PEN_COLORS[i]}" value="${active[PEN_COLORS[i]]}"></div>`)
    })
    leaveWatch = new window.MutationObserver(() => {
      if (!panel.classList.contains('tool-pen')) exitEditMode(panel)
    })
    leaveWatch.observe(panel, { attributes: true, attributeFilter: ['class'] })
  }

  function toggleEditMode (panel) {
    if (panel.classList.contains(EDITING)) exitEditMode(panel)
    else enterEditMode(panel)
  }

  function installHoldToEdit () {
    let timer
    // True from the moment a hold opens or closes edit mode until the next press anywhere.
    let holdDone = false
    const cancel = () => { clearTimeout(timer); timer = undefined }
    // Pointer events carry a mouse button of either kind, and touch too (touch is not tested).
    document.addEventListener('pointerdown', (event) => {
      cancel()
      holdDone = false
      const target = event.target.closest(HOLD_TARGETS)
      if (!target) return
      const panel = target.closest('.tool-pen')
      timer = setTimeout(() => { holdDone = true; toggleEditMode(panel) }, HOLD_TO_EDIT_MS)
    }, true)
    window.addEventListener('pointerup', cancel, true)
    window.addEventListener('pointercancel', cancel, true)
    // The browser's menu would open over the picker during a right-click hold or a long touch:
    // when the press is still going (Linux opens it on press), or after the hold has run its
    // course (Windows opens it on release, over the picker that appeared under the pointer).
    // A quick right-click on a button, released before the delay, keeps its menu on Windows.
    document.addEventListener('contextmenu', (event) => {
      if ((timer !== undefined || holdDone) && event.target.closest(HOLD_TARGETS)) event.preventDefault()
    }, true)
    // `input` fires as the picker moves, so the color changes live.
    document.addEventListener('input', (event) => {
      const el = event.target
      if (el.matches(`.${PICKER} input`)) savePenColor(el.dataset.pen, el.value)
    })
  }

  Framework.getApp().then(async () => {
    installHoldToEdit()
    markSettings = normalizeMarkSettings(Framework.getData(MARKS_KEY))
    adoptThickness(normalizeThickness(Framework.getData(THICKNESS_KEY)))
    Framework.addSetting({
      tag: 'button',
      name: 'pentoolextras',
      group: SETTINGS_GROUP,
      content: 'Pen tool extras',
      handler: () => {
        Framework.closeDialog()
        setTimeout(openDialog, 0)
      }
    })
    installEdgeMarks(Framework.app)
    const saved = savedColors(Framework.getData(COLORS_KEY))
    if (saved) {
      adoptColors(saved, [])
      return
    }
    // Nothing saved: the pen takes the darkened current color page, read once at load. When
    // the color tool never becomes ready, SudokuPad's own pen colors stay in force.
    const tool = await waitForColorTool()
    // A save made in the dialog while waiting outranks the derived colors.
    if (!tool || savedColors(Framework.getData(COLORS_KEY))) return
    const derived = deriveFromTool(tool)
    adoptColors(derived.colors, derived.missing)
  })
})()
