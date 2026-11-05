// ==UserScript==
// @name         SudokuPad Pen Tool Extras
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      1.14.14
// @description  Pen tool extras: sets the pen's nine colors to your current cell color page, darkened (or your own, saved in a settings dialog or by holding a pen color button), adds a second page of nine pens that draw the same colors as dashed lines and a third page of nine that draw a line as wide as a page 1 line with a run of arrows (filled triangles) pointing the way the line was dragged (a page button, Tab or the mouse wheel over the page button changes page; either line style can be switched off in the dialog, which takes its page out of the rotation; lines in those pens are invisible without this script), puts two sliders in the pen tool's panel (each can be hidden in the settings dialog, which also holds both) for how thick pen lines, circles, crosses, edge marks and corner marks are and how see-through the pen layer is, lets the dialog set how long the page 2 dashes are and how far apart the page 3 arrows are and put SudokuPad's own pen colors back with one button, moves the pen's line mode pulldown into the settings dialog, puts a white outline around every pen mark (on by default, optional), and adds direction arrows and a circle to the marks a click on a cell edge cycles through (X, circle, then the two directions), plus an X and a circle for a click near a grid corner, and erases a whole line (every piece joined to it, drawn with the same pen) with a middle click (optional). A small gear in the corner of the pen tool button opens the settings dialog. Relies on SudokuPad internals, so an update can break a part of it: that part is skipped, the browser console and the settings dialog say which, and SudokuPad's own pen tool keeps working.
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

  // 1. Core: the settings table, the install step guard, the style writer and shared constants
  // The script cannot read its own header (GM_info is absent without Tampermonkey), so @version is repeated here.
  const VERSION = '1.14.14'
  const SETTINGS_GROUP = 'experimental'
  const STYLE_ID = 'pen-tool-extras-style'
  const GRID_SELECTOR = '#svgrenderer'
  const PEN_LAYER = '#cell-pen'
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
  const MIDDLE_BUTTON = 1
  const PEN_COLOR_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  // SudokuPad draws free lines, the cell circle and the cross 5 wide (in cell units, a cell being 64) and the edge X 2.5 wide. The slider's value is the first width
  // and everything else scales with it.
  const THICKNESS = { min: 1, max: 16, step: 1, fallback: 5 }
  // A page 2 dash's length in line widths; 0 draws dots.
  const DASH = { min: 0, max: 8, step: 1, fallback: 3 }
  // The distance between two page 3 arrows' middles, in line widths; 5 gives a run of arrows rather than a solid row.
  const ARROW_SPACING = { min: 3, max: 12, step: 1, fallback: 5 }
  // SudokuPad draws every pen mark with `.cell-pen { opacity: 0.8 }` (tool-pen.css), so 80 leaves the marks as they are; 20 is the floor where a mark still shows.
  const OPACITY = { min: 20, max: 100, step: 5, fallback: 80 }
  // The outline's width on each side of the pen layer's shape, in cell units. It does not scale with the thickness; 2 shows over a colored cell and a digit without covering the digits beside a line.
  const OUTLINE_WIDTH = { min: 1, max: 8, step: 1, fallback: 2 }
  // The pen values (the `pen-<value>` class of a stroke) SudokuPad draws at the full width, from `docs/research/sudokupad-pen-edge-marks.md`: the free lines, and 5 and 6
  // (the cell circle and cross). Not 3, 4, b and c (the edge X marks, half the width), nor h to y (the marks this script adds, also half).
  const FULL_WIDTH_VALUES = ['1', '2', '5', '6', '7', '8', '9', 'a', 'd', 'e', 'f', 'g']
  // The lines among them, which a dashed page draws as dashes: the cell circle and cross (5 and 6) stay solid. The diagonal ones span a cell's diagonal, 64 * sqrt(2); the others, 64.
  const DIAGONAL_LINES = ['d', 'e', 'f', 'g']
  const ORTHOGONAL_LINES = FULL_WIDTH_VALUES.filter((v) => v !== '5' && v !== '6' && !DIAGONAL_LINES.includes(v))
  const CELL_UNITS = 64

  const isPlainObject = (data) => Boolean(data) && typeof data === 'object' && !Array.isArray(data)

  function wrapIndex (index, delta, count) {
    return (((index + delta) % count) + count) % count
  }

  function inRange (value, range) {
    return Number.isInteger(value) && value >= range.min && value <= range.max && (value - range.min) % range.step === 0
  }

  // Data saved before a name existed reads as true.
  function decodeFlags (names, data) {
    const saved = isPlainObject(data) ? data : {}
    return Object.fromEntries(names.map((name) => [name, saved[name] !== false]))
  }

  const doNothing = () => {}

  // `effect` runs once `inForce` holds the new value; the style is written after the effects, so an effect need not.
  function slider (key, range, effect, dialog) {
    return { key, fallback: range.fallback, normalize: (data) => inRange(data, range) ? data : range.fallback, effect, range, dialog }
  }

  function flag (key, effect = doNothing, dialog) {
    return { key, fallback: true, normalize: (data) => data !== false, effect, dialog }
  }

  function flags (key, names, effect, dialog, normalize = (data) => decodeFlags(names, data)) {
    return { key, fallback: decodeFlags(names), normalize, effect, dialog }
  }

  // The line mode is saved its own way. A row `under` a box is hidden while that box is unticked.
  const SETTINGS = {
    thickness: slider('PenColor_thickness', THICKNESS, adoptThickness, { label: 'Thickness', section: 'Line settings', box: 'show' }),
    opacity: slider('PenColor_opacity', OPACITY, adoptOpacity, { label: 'Opacity (%)', section: 'Line settings', box: 'show' }),
    dash: slider('PenColor_dash', DASH, syncPenPanel, { label: 'Dash length', under: 'lineStyles.dashed' }),
    arrowSpacing: slider('PenColor_arrowspacing', ARROW_SPACING, redrawArrowLines, { label: 'Arrow spacing', under: 'lineStyles.arrows' }),
    outlineWidth: slider('PenColor_outlinewidth', OUTLINE_WIDTH, adoptOutline, { label: 'Outline width', under: 'outline' }),
    outline: flag('PenColor_outline', adoptOutline, { label: 'White outline on lines and marks', section: 'Other' }),
    middleErase: flag('PenColor_middleerase', doNothing, { label: 'Middle click erases a whole line', section: 'Other' }),
    lineStyles: flags('PenColor_linestyles', ['dashed', 'arrows'], adoptLineStyles,
      { section: 'Line styles', attribute: 'style', labels: { dashed: 'Dashed lines', arrows: 'Directional arrow lines' } }),
    show: flags('PenColor_sliders', ['thickness', 'opacity'], adoptShow, { title: 'Show this slider in the pen panel' }),
    // The marks table is built by hand in the dialog, so this row has no section.
    marks: flags('EdgeMarks_marks', ['x', 'directions', 'circle', 'cornerX', 'cornerCircle'], doNothing, { attribute: 'mark' }, normalizeMarkSettings)
  }
  const SETTING_NAMES = Object.keys(SETTINGS)
  const boxAttribute = (name) => SETTINGS[name].dialog.attribute || name

  const boxValue = (state, under) => under.split('.').reduce((value, name) => value[name], state)

  function draftWithBox (draft, dataset, checked) {
    const name = SETTING_NAMES.find((n) => !SETTINGS[n].range && boxAttribute(n) in dataset)
    const flagName = name && dataset[boxAttribute(name)]
    return name && { ...draft, [name]: flagName ? { ...draft[name], [flagName]: checked } : checked }
  }

  function sameValue (a, b) {
    return a === b || (isPlainObject(a) && isPlainObject(b) && Object.keys(a).every((name) => a[name] === b[name]))
  }

  function settingDefaults () {
    return Object.fromEntries(SETTING_NAMES.map((name) => [name, SETTINGS[name].fallback]))
  }

  function readSettings (store) {
    return Object.fromEntries(SETTING_NAMES.map((name) => [name, SETTINGS[name].normalize(store.getData(SETTINGS[name].key))]))
  }

  function changedSettings (draft, current) {
    return SETTING_NAMES.filter((name) => !sameValue(draft[name], current[name]))
  }

  // A value at its default removes its key, so a default that changes later reaches everyone who never chose another.
  function saveSetting (store, setting, value) {
    if (sameValue(value, setting.fallback)) store.removeData(setting.key)
    else store.setData(setting.key, value)
  }

  // A write that throws leaves `current` as it was, so a retry finds the same settings changed and their effects still run.
  function saveChangedSettings (store, draft, current) {
    const changed = changedSettings(draft, current)
    changed.forEach((name) => saveSetting(store, SETTINGS[name], draft[name]))
    changed.forEach((name) => { current[name] = draft[name] })
    return changed
  }

  function effectsOf (names) {
    return [...new Set(names.map((name) => SETTINGS[name].effect))]
  }

  // SudokuPad stores a segment on an edge shared by two cells as the right (7) or bottom (8) edge of the cell before it, and as the left (9) or top (a) edge only on the grid's own
  // border, so lineSegment prefers the values in this order.
  const LINE_VALUES = [...ORTHOGONAL_LINES, ...DIAGONAL_LINES]
  // Where `renderPen` starts and ends each line value, as [row, col] offsets in cells from its cell's top left corner. A line dragged from start to end is dragged the way
  // SudokuPad draws it (forward).
  const LINE_PATHS = {
    1: [[0.5, 0.5], [0.5, 1.5]],
    2: [[0.5, 0.5], [1.5, 0.5]],
    7: [[0, 1], [1, 1]],
    8: [[1, 0], [1, 1]],
    9: [[0, 0], [1, 0]],
    a: [[0, 0], [0, 1]],
    d: [[0.5, 0.5], [-0.5, 1.5]],
    e: [[0.5, 0.5], [1.5, 1.5]],
    f: [[0, 1], [1, 0]],
    g: [[0, 0], [1, 1]]
  }

  // Two segments are joined when they share a point: a cell's middle for a center or diagonal line, a cell corner for an edge line.
  function linePoints (value, row, col) {
    return LINE_PATHS[value].map(([r, c]) => [row + r, col + c])
  }

  // SudokuPad's purple, as its own icons draw it.
  const PANEL_COLOR = '#6a1b9a'

  const STEP_LABELS = {
    colors: 'colors',
    pages: 'pen pages',
    arrowLines: 'arrow lines',
    dragHint: 'drag highlight',
    marks: 'marks',
    lineErase: 'line erase',
    penPanel: 'pen panel',
    gear: 'settings gear'
  }

  // A step stays off once skipped, so its error is warned once and not on every event. `skip(why, false)` is for a step never installed.
  function createStep (label, skipped, onSkip = doNothing) {
    const step = {
      off: false,
      skip (why, installed = true) {
        if (step.off) return
        step.off = true
        skipped.push(label)
        if (!installed) return
        console.warn(`pen-tool-extras: ${label} skipped because SudokuPad changed:`, why)
        try {
          onSkip()
        } catch (error) {
          // Best effort: the step is off already, and what it left behind stays until the page reloads.
          console.warn(`pen-tool-extras: could not undo ${label}:`, error)
        }
      },
      run (fn, fallback = doNothing) {
        if (step.off) return fallback()
        try {
          return fn()
        } catch (error) {
          step.skip(error)
          return fallback()
        }
      },
      // SudokuPad's code runs only through `stock` or `stock.sudokupad`, so a throw from it passes through as SudokuPad's own. After the
      // body's own throw, the original runs only if nothing was sent for this event: a click half sent must not be sent again. A call
      // that sends nothing (`stock.sudokupad(fn, false)`) leaves the original to run.
      wrap (owner, name, body) {
        const original = owner[name]
        owner[name] = function (...args) {
          if (step.off) return original.apply(this, args)
          let reached = false
          let result
          let failure = null
          const sudokupad = (fn, sends = true) => {
            if (sends) reached = true
            try {
              return fn()
            } catch (error) {
              failure = { error }
              throw error
            }
          }
          const stock = (...stockArgs) => sudokupad(() => { result = original.apply(this, stockArgs); return result })
          stock.sudokupad = sudokupad
          try {
            return body.call(this, stock, ...args)
          } catch (error) {
            if (failure && failure.error === error) throw error
            step.skip(error)
            return reached ? result : original.apply(this, args)
          }
        }
      }
    }
    return step
  }

  function lackingInternals (app, tool) {
    const renderer = app.svgRenderer
    const proto = renderer ? Object.getPrototypeOf(renderer) : undefined
    const grid = app.grid
    const fn = (owner, name) => [name, Boolean(owner) && typeof owner[name] === 'function']
    const toolFns = (...names) => names.map((name) => fn(tool, name))
    const actions = [...toolFns('actStart', 'actAdd', 'actSend', 'clickCell'), ['_actList', Boolean(tool) && Array.isArray(tool._actList)]]
    const cells = ['puzzle.cells', Boolean(app.puzzle) && Array.isArray(app.puzzle.cells)]
    const requirements = {
      colors: [['tools.colour', Boolean(app.tools) && Boolean(app.tools.colour)]],
      pages: toolFns('setSelectedColor', 'handleToolEnter', 'handleToolExit'),
      arrowLines: [fn(proto, 'renderPen'), fn(renderer, 'renderPart'), ...actions, cells],
      dragHint: toolFns('drawLineHint'),
      marks: [
        ...actions, ...toolFns('getInputRc'), fn(grid, 'getCell'), ['grid.rows', Number.isInteger(grid && grid.rows)], ['grid.cols', Number.isInteger(grid && grid.cols)],
        fn(proto, 'renderPen'), fn(renderer && renderer.constructor, 'rcToPathData'), ['CellSize', Boolean(renderer) && typeof renderer.constructor.CellSize === 'number'], cells
      ],
      // `lineMode` is not on the tool on every page load, so the pulldown the sliders sit beside is what is watched (checkPanelRow).
      penPanel: [['ToolPen.tool', Boolean(tool)]],
      lineErase: [...actions, fn(app, 'xyToRCExact'), fn(grid, 'getCell'), cells]
    }
    const lacking = new Map()
    Object.entries(requirements).forEach(([name, needs]) => {
      const missing = needs.find(([, present]) => !present)
      if (missing) lacking.set(missing[0], [...(lacking.get(missing[0]) || []), name])
    })
    return lacking
  }

  const skipped = []
  const steps = {
    colors: createStep(STEP_LABELS.colors, skipped),
    // With pen pages off the pad cannot turn back from page 2 or 3, so it and the pen go back to page 1.
    pages: createStep(STEP_LABELS.pages, skipped, () => {
      setPadPage(0)
      putStockPenBack()
      syncPenPanel()
    }),
    arrowLines: createStep(STEP_LABELS.arrowLines, skipped),
    dragHint: createStep(STEP_LABELS.dragHint, skipped),
    marks: createStep(STEP_LABELS.marks, skipped),
    lineErase: createStep(STEP_LABELS.lineErase, skipped),
    penPanel: createStep(STEP_LABELS.penPanel, skipped, () => {
      applyStyle()
      syncPenPanel()
    }),
    gear: createStep(STEP_LABELS.gear, skipped, () => document.querySelectorAll(`.${GEAR_CLASS}`).forEach((el) => el.remove()))
  }
  const inForce = settingDefaults()

  // SudokuPad calls `clickCell` on the release, with no event, so the button is read from the pointer events before it.
  let lastButton = 0

  function trackButton () {
    const remember = (event) => { lastButton = event.button }
    window.addEventListener('pointerdown', remember, true)
    window.addEventListener('pointerup', remember, true)
  }

  function sendActs (tool, acts) {
    acts.forEach((act) => tool.actAdd(act))
    tool.actSend()
  }

  // The panel rules are left out once SudokuPad's line mode pulldown, whose row they take, is not ours to hide.
  function applyStyle () {
    let style = document.getElementById(STYLE_ID)
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = [
      buildCss(active),
      buildThicknessCss(inForce.thickness),
      buildOpacityCss(inForce.opacity),
      buildOutlineCss(inForce.outline),
      buildPagesCss(inForce.thickness, inForce.dash),
      EDIT_CSS,
      DIALOG_CSS,
      GEAR_CSS,
      steps.penPanel.off ? '' : PANEL_CSS
    ].join('\n')
  }

  // The effects run with every new value in place, and the style is written once.
  function saveSettings (draft) {
    const changed = saveChangedSettings(Framework, draft, inForce)
    if (!changed.length) return
    effectsOf(changed).forEach((effect) => effect())
    applyStyle()
  }

  function layerIn (id, beside) {
    let layer = document.getElementById(id)
    const penLayer = document.querySelector(PEN_LAYER)
    if (!layer && penLayer) {
      layer = document.createElementNS(SVG_NAMESPACE, 'g')
      layer.id = id
      if (beside) penLayer.after(layer)
      else penLayer.appendChild(layer)
    }
    return layer
  }

  function checkSteps (app) {
    const tool = typeof ToolPen !== 'undefined' ? ToolPen.tool : undefined
    lackingInternals(app, tool).forEach((names, missing) => {
      names.forEach((name) => steps[name].skip(missing, false))
      console.warn(`pen-tool-extras: ${names.map((name) => STEP_LABELS[name]).join(', ')} skipped because SudokuPad has no ${missing}`)
    })
  }

  // 2. Pen colors: the saved set, derived colors and edit mode
  // Keys saved by the scripts this one replaced, kept so their saved data still reads.
  const COLORS_KEY = 'PenColor_colors'
  // SudokuPad's own pen colors (tool-pen.css). Color 9 is rgb(-36, -36, -36) there, which clamps to black.
  const SUDOKUPAD_PEN_COLORS = {
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
  // The share of its OKLCH lightness a cell color keeps as a pen color: low enough to read against cell colors drawn at 60% opacity, high enough that the
  // lightest still show as 5px lines on white and the nine stay apart.
  const LIGHTNESS_FACTOR = 0.75
  // The OKLCH chroma under which a darkened color counts as grey: SudokuPad's greys are 0, a tinted dark grey such as rgb(10, 20, 30) is about 0.024, and the
  // least saturated darkened default colors are above 0.08.
  const GREY_CHROMA = 0.04
  const COLOR_TOOL_WAIT_MS = 10000
  const COLOR_TOOL_POLL_MS = 100
  // SudokuPad's color tool holds its cell color buttons for the same 1000 ms (HoldToEditDelayMs).
  const HOLD_TO_EDIT_MS = 1000
  const isHexColor = (value) => typeof value === 'string' && HEX_COLOR.test(value)

  function normalizeColors (data) {
    const saved = isPlainObject(data) ? data : {}
    const out = {}
    PEN_COLOR_NUMBERS.forEach((n) => {
      out[n] = isHexColor(saved[n]) ? saved[n].toLowerCase() : SUDOKUPAD_PEN_COLORS[n]
    })
    return out
  }

  // null when nothing usable is saved, which means the derived colors apply.
  function savedColors (data) {
    const usable = isPlainObject(data) && PEN_COLOR_NUMBERS.some((n) => isHexColor(data[n]))
    return usable ? normalizeColors(data) : null
  }

  // The set is what gets saved, so an invalid pen or value throws rather than saving a wrong entry.
  function editedColors (colors, pen, value) {
    if (!PEN_COLOR_NUMBERS.includes(pen)) throw new RangeError(`pen-tool-extras: ${pen} is not a pen color`)
    if (!isHexColor(value)) throw new RangeError(`pen-tool-extras: ${value} is not a #rrggbb color`)
    return { ...colors, [pen]: value.toLowerCase() }
  }

  const clamp255 = (x) => Math.max(0, Math.min(255, x))
  const RGB_TEXT = /^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)$/

  // A page lists `transparent` or an `rgba()` with alpha 0 to leave a slot empty (key 0 of each default page).
  function isTransparent (text) {
    if (typeof text !== 'string') return false
    const value = text.trim().toLowerCase()
    const rgba = RGB_TEXT.exec(value)
    return value === 'transparent' || Boolean(rgba && rgba[4] !== undefined && Number(rgba[4]) <= 0)
  }

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

  const EDGE = 1e-6
  const inGamut = (linear) => linear.every((x) => x >= -EDGE && x <= 1 + EDGE)

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
    return '#' + out.map((x) => Math.round(clamp255(fromLinear(Math.max(0, Math.min(1, x)))))
      .toString(16).padStart(2, '0')).join('')
  }

  // Pen color N is the color at index N of the page: SudokuPad shows index K on the cell color button with data-key K, so the pen buttons line up with the cell buttons.
  // Of the darkened colors, the darkest one under GREY_CHROMA becomes #000000, so the darkest pen is black as in SudokuPad's own set.
  function derivedPenColors (keys, readColor) {
    const colors = {}
    const missing = []
    const derived = []
    PEN_COLOR_NUMBERS.forEach((n) => {
      const rgb = n < keys.length ? parseColor(readColor(keys[n])) : null
      if (rgb) {
        colors[n] = darkenColor(rgb)
        derived.push(n)
      } else {
        colors[n] = SUDOKUPAD_PEN_COLORS[n]
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

  // Strokes (`.pencolor-N`) and the tool's button swatches both read these variables; the eraser has its own fixed color and no variable.
  // SudokuPad's `tool-pen.css` loads when the pen tool is enabled, so a plain `:root` rule would lose to it by coming first; `:root:root` outranks it whichever loads last.
  function buildCss (colors) {
    const lines = PEN_COLOR_NUMBERS.map((n) => `  --puzzle-pencolor-${n}: ${colors[n]};`)
    return [':root:root {', ...lines, '}'].join('\n')
  }

  // Edit mode: each color picker sits over its button and the button's swatch is hidden under it. The sizes are those SudokuPad's color tool uses for the same job.
  const EDITING = 'pen-tool-extras-editing'
  const PICKER = 'pen-tool-extras-picker'
  const EDIT_CSS = [
    `.${EDITING} button[data-value]::after { opacity: 0; }`,
    `.${EDITING} .${PICKER} { width: 0; height: 0; overflow: visible; }`,
    `.${EDITING} .${PICKER} input { position: absolute; width: 2.4rem; height: 2.4rem; margin-left: 0.95rem; margin-top: 0.95rem; z-index: 10; pointer-events: all; }`
  ].join('\n')
  // A right-click hold ends over a picker in edit mode, and Windows opens the context menu on release, so it is suppressed over the pickers as well as the buttons.
  const HOLD_TARGETS = `.tool-pen button[data-value], .tool-pen .${PICKER} input`

  // Until the color tool is read they are SudokuPad's own, which is what the page shows with no override.
  let active = { ...SUDOKUPAD_PEN_COLORS }
  let activeMissing = []

  // `init` assigns the page and sets the `--cell-color-<key>` variables in one synchronous step, so a palette on the tool means the variables are set too (the stylesheet's own
  // values for them exist earlier and say nothing about a custom palette).
  function readyColorTool () {
    const tool = Framework.app && Framework.app.tools && Framework.app.tools.colour
    const palette = tool && tool.palette
    const ready = palette && Array.isArray(palette.pages) && Array.isArray(palette.pages[tool.currentPage])
    return ready ? tool : null
  }

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

  // The raw `--cell-color-<key>` values, not the 60% opacity they show with on the grid. A custom palette can hold any CSS color (`#f00`, `red`, `hsl()`), and the variable
  // reads back as written, so each value goes through the browser to become `rgb()` text first. A value the browser rejects stays as written, and `derivedPenColors` treats it as unreadable.
  function deriveFromTool (tool) {
    const root = document.documentElement
    const rootStyle = window.getComputedStyle(root)
    const probe = document.createElement('span')
    root.appendChild(probe)
    try {
      return derivedPenColors(tool.palette.pages[tool.currentPage], (key) => {
        const value = rootStyle.getPropertyValue(`--cell-color-${key}`).trim()
        probe.style.color = ''
        probe.style.color = value
        return probe.style.color ? window.getComputedStyle(probe).color : value
      })
    } finally {
      probe.remove()
    }
  }

  function adoptColors (colors, missing) {
    active = colors
    activeMissing = missing
    applyStyle()
    document.querySelectorAll(`.${PICKER} input`).forEach((el) => { el.value = colors[el.dataset.pen] })
  }

  function savePenColor (pen, value) {
    const colors = editedColors(active, pen, value)
    Framework.setData(COLORS_KEY, colors)
    adoptColors(colors, [])
  }

  // SudokuPad keeps one panel element and swaps its `tool-pen` class for the next tool's, so the pickers would stay behind on their own: a class watcher ends edit mode when the
  // panel stops being the pen's.
  let leaveWatch = null

  function exitEditMode (panel) {
    if (leaveWatch) leaveWatch.disconnect()
    leaveWatch = null
    panel.classList.remove(EDITING)
    panel.querySelectorAll(`.${PICKER}`).forEach((el) => el.remove())
  }

  function enterEditMode (panel) {
    // Every button is found before anything changes, so a missing one leaves no half edit mode.
    const buttons = PEN_COLOR_NUMBERS.map((n) => {
      const button = panel.querySelector(`button[data-key="${n}"]`)
      if (!button) throw new Error(`pen-tool-extras: the pen tool has no button for pen color ${n}`)
      return button
    })
    panel.classList.add(EDITING)
    buttons.forEach((button, i) => {
      button.insertAdjacentHTML('beforebegin',
        `<div class="${PICKER}"><input type="color" data-pen="${PEN_COLOR_NUMBERS[i]}" value="${active[PEN_COLOR_NUMBERS[i]]}"></div>`)
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
    let holdDone = false
    const cancel = () => { clearTimeout(timer); timer = undefined }
    // Pointer events carry a mouse button of either kind, and touch too (touch is not tested).
    document.addEventListener('pointerdown', (event) => {
      cancel()
      holdDone = false
      const target = event.target.closest(HOLD_TARGETS)
      if (!target) return
      const panel = target.closest('.tool-pen')
      timer = setTimeout(() => { holdDone = true; steps.colors.run(() => toggleEditMode(panel)) }, HOLD_TO_EDIT_MS)
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
    document.addEventListener('input', (event) => {
      const el = event.target
      if (el.matches(`.${PICKER} input`)) savePenColor(el.dataset.pen, el.value)
    })
  }

  // 3. Pen pages: the pages, line styles and the page button
  // The pen pages in paging order. Page N's characters line up with PEN_COLOR_NUMBERS, so a recolor changes the pen on every page.
  // A stroke stores the character after its value (`pc:a`), and any lowercase letter draws, undoes and replays (docs/research/sudokupad-pen-tool.md, "Pen colors past nine").
  // Page 1 is SudokuPad's own and stays first: stock SudokuPad can select only its characters.
  // A pen value has no direction, so an arrow page's pen is two characters: `chars` for a line dragged the way SudokuPad draws the value, `reverse` for the other way.
  // Only `chars` is ever selected.
  const PEN_PAGES = [
    { chars: PEN_COLOR_NUMBERS, dashed: false },
    { chars: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], dashed: true },
    { chars: ['j', 'l', 'n', 'p', 'r', 't', 'v', 'x', 'z'], reverse: ['k', 'm', 'o', 'q', 's', 'u', 'w', 'y', '0'], dashed: false, arrowLines: true }
  ]
  // SudokuPad's own `ToolPen_color` stays a digit: stock SudokuPad throws when the pen tool opens on a letter there, and this script may be removed with the letter saved.
  const PEN_KEY = 'PenColor_pen'
  const PAGE_BUTTON = 'pen-tool-extras-page'
  const PAGE_ATTRIBUTE = 'data-pen-page'

  // Each color character of the pen pages: its pen (the character on its button), its page, its color number, and `forward`, the way an arrow page's character was dragged
  // (null off an arrow page). An arrow page's pen also gives its `reverse` character.
  const COLOR_CHARS = new Map(PEN_PAGES.flatMap((page, index) => page.chars.flatMap((pen, i) => {
    const entry = (forward) => ({ pen, page: index, number: PEN_COLOR_NUMBERS[i], forward, reverse: page.arrowLines ? page.reverse[i] : undefined })
    return page.arrowLines ? [[pen, entry(true)], [page.reverse[i], entry(false)]] : [[pen, entry(null)]]
  })))

  // An arrow page's reverse characters are on no button, so they are no pen.
  function penOf (pen) {
    const entry = COLOR_CHARS.get(pen)
    return entry && entry.pen === pen ? entry : undefined
  }

  function penPageOf (pen) {
    const entry = penOf(pen)
    return entry ? entry.page : -1
  }

  function penNumber (pen) {
    const entry = penOf(pen)
    return entry && entry.number
  }

  function penCharOn (page, number) {
    return PEN_PAGES[page].chars[PEN_COLOR_NUMBERS.indexOf(number)]
  }

  // SudokuPad's `getData` parses what it reads, so a saved '3' comes back as the number 3.
  function normalizePen (data) {
    const pen = typeof data === 'number' ? String(data) : data
    return typeof pen === 'string' && penPageOf(pen) !== -1 ? pen : null
  }

  function enabledPages (styles) {
    return PEN_PAGES.map((_, index) => index).filter((index) => index === 0 || (PEN_PAGES[index].arrowLines ? styles.arrows : styles.dashed))
  }

  // `page` may itself be a page that is not enabled.
  function stepEnabledPage (page, delta, styles) {
    const enabled = enabledPages(styles)
    let next = page
    do next = wrapIndex(next, delta, PEN_PAGES.length)
    while (!enabled.includes(next))
    return next
  }

  function pageAfterSave (pen, styles) {
    const page = penPageOf(pen)
    return page === -1 || enabledPages(styles).includes(page) ? pen : penNumber(pen)
  }

  const swatchMask = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}") center / 100% no-repeat`
  // Page 1 has no page attribute selector, so it applies with the extra pages off too, where nothing sets the attribute; the pages after it outrank it by that attribute.
  const swatchRule = (n, page, svg) => {
    const mask = swatchMask(svg)
    return `.tool-pen button[data-key="${n}"]${page === 1 ? '' : `[${PAGE_ATTRIBUTE}="${page}"]`}:after { background-color: var(--puzzle-pencolor-${n}); -webkit-mask: ${mask}; mask: ${mask}; }`
  }
  // The look of the pages after the first, which SudokuPad's own CSS knows nothing about, and the pen buttons' line swatches of every page: each pen character strokes in the color of its partner on the first page. A dash of 0
  // is a zero-length dash with the round cap `.cell-pen` already has, spaced by `thickness`, so it scales with the slider. `:root:root` outranks SudokuPad's own rules whichever
  // stylesheet loads last.
  function buildPagesCss (thickness, dash) {
    if (!inRange(thickness, THICKNESS)) throw new RangeError(`pen-tool-extras: ${thickness} is not a thickness from ${THICKNESS.min} to ${THICKNESS.max}`)
    if (!inRange(dash, DASH)) throw new RangeError(`pen-tool-extras: ${dash} is not a dash length from ${DASH.min} to ${DASH.max}`)
    const rules = PEN_COLOR_NUMBERS.map((n) => swatchRule(n, 1, SOLID_SWATCH))
    PEN_PAGES.forEach((page, index) => {
      if (index === 0) return
      page.chars.forEach((char, i) => [char, ...(page.reverse ? [page.reverse[i]] : [])].forEach((c) => {
        rules.push(`.pencolor-${c} { stroke: var(--puzzle-pencolor-${PEN_COLOR_NUMBERS[i]}); }`)
        // A line is stroked and an arrow is filled, in the same color: the arrows' path has no stroke of its own.
        if (page.arrowLines) rules.push(`:root:root .pencolor-${c} [data-arrow-line-part='arrows'] { fill: var(--puzzle-pencolor-${PEN_COLOR_NUMBERS[i]}); stroke: none; }`)
      }))
      if (page.arrowLines) PEN_COLOR_NUMBERS.forEach((n) => rules.push(swatchRule(n, index + 1, ARROW_LINE_SWATCH)))
      if (!page.dashed) return
      const colors = `:is(${page.chars.map((char) => `.pencolor-${char}`).join(',')})`
      const lines = (values, length) => `:root:root .cell-pen:is(${values.map((v) => `.pen-${v}`).join(',')})${colors} { ${dashDeclarations(thickness, dash, length)} }`
      rules.push(lines(ORTHOGONAL_LINES, CELL_UNITS), lines(DIAGONAL_LINES, CELL_UNITS * Math.SQRT2))
      PEN_COLOR_NUMBERS.forEach((n) => rules.push(swatchRule(n, index + 1, dashSwatch(dash))))
    })
    return rules.join('\n')
  }

  // A sample of the line the button turns to, under a dot for each enabled page with the current one filled, as SudokuPad's color tool's page button has.
  const SAMPLE_FROM = [12, 54]
  const SAMPLE_TO = [52, 26]
  const SAMPLE_WIDTH = 7.2
  const SAMPLE_DASH_SHARE = 0.42
  const SAMPLE_ARROW_LINE = { line: 3.2, at: [0.25, 0.5, 0.75] }
  function renderPageIcon (current, dash, styles) {
    const next = PEN_PAGES[stepEnabledPage(current, 1, styles)]
    const kind = next.arrowLines ? 'arrowLines' : !next.dashed ? 'solid' : dash === 0 ? 'dots' : 'dashed'
    let sample
    const [dx, dy] = [SAMPLE_TO[0] - SAMPLE_FROM[0], SAMPLE_TO[1] - SAMPLE_FROM[1]]
    const length = Math.hypot(dx, dy)
    if (kind === 'arrowLines') {
      sample = `<path d="M${SAMPLE_FROM.join(' ')} L${SAMPLE_TO.join(' ')}" stroke-width="${SAMPLE_ARROW_LINE.line}" stroke-linecap="round" fill="none" data-sample-line/>` +
        SAMPLE_ARROW_LINE.at.map((t) => {
          const [wing, tip, other] = arrowCorners(SAMPLE_FROM[0] + dx * t, SAMPLE_FROM[1] + dy * t, dx / length, dy / length, ARROW_LINE.halfLength * SAMPLE_ARROW_LINE.line, ARROW_LINE.halfWidth * SAMPLE_ARROW_LINE.line)
          return `<path d="M${pointText(wing)} L${pointText(tip)} L${pointText(other)}Z" stroke="none" data-arrow/>`
        }).join('')
    } else if (kind === 'dots') {
      sample = [0, 1, 2, 3, 4].map((k) => `<circle cx="${14 + 9 * k}" cy="${52 - 7 * k}" r="3.6" fill="currentColor" stroke="none"/>`).join('')
    } else if (kind === 'dashed') {
      const share = Math.min(dash * SAMPLE_WIDTH, SAMPLE_DASH_SHARE * length) / length
      const point = (t) => `${(SAMPLE_FROM[0] + dx * t).toFixed(1)} ${(SAMPLE_FROM[1] + dy * t).toFixed(1)}`
      sample = [[0, share], [1 - share, 1]].map(([a, b]) =>
        `<path d="M${point(a)} L${point(b)}" stroke-width="${SAMPLE_WIDTH}" stroke-linecap="round" fill="none" data-dash/>`).join('')
    } else {
      sample = `<path d="M${SAMPLE_FROM.join(' ')} L${SAMPLE_TO.join(' ')}" stroke-width="${SAMPLE_WIDTH}" stroke-linecap="round" fill="none"/>`
    }
    const pages = enabledPages(styles)
    const dots = pages.map((page, i) =>
      `<circle cx="${54 - 8 * (pages.length - i - 1)}" cy="10" r="3" data-page-dot="${page === current ? 'filled' : 'outline'}"${page === current ? '' : ' fill="none"'}/>`)
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 64 64" stroke="currentColor" fill="currentColor" stroke-width="1">' +
      `<g data-page-sample="${kind}">${sample}</g><g>${dots.join('')}</g></svg>`
  }

  // Lines already drawn in a page that is not enabled still draw: its rules stay in the style.
  function adoptLineStyles () {
    steps.pages.run(() => {
      const pen = pageAfterSave(selectedPen(), inForce.lineStyles)
      if (pen === selectedPen()) return
      if (ToolPen.tool.active) ToolPen.tool.setSelectedColor(pen)
      else Framework.setData(PEN_KEY, pen)
    })
    syncPenPanel()
  }

  function removePageButtons () {
    document.querySelectorAll(`.${PAGE_BUTTON}`).forEach((el) => el.remove())
  }

  function putStockPenBack () {
    const pen = selectedPen()
    if (penPageOf(pen) >= 1) ToolPen.tool.setSelectedColor(penNumber(pen))
  }

  // SudokuPad's own selection reads `ToolPen_color` with `getData`, which parses a saved '3' into the number 3, so the selection can be a number.
  const selectedPen = () => String(ToolPen.tool.selectedColor)

  function currentPage () {
    return Math.max(0, penPageOf(selectedPen()))
  }

  // As SudokuPad's color tool does for its pages, each button keeps its `data-key` and takes the pen's character as its `data-value` (and title), since the button press and the
  // selection both read `data-value`. Button 0 is not a pen.
  function setPadPage (page) {
    document.querySelectorAll('.controls-input button[data-key]').forEach((button) => {
      const index = PEN_COLOR_NUMBERS.indexOf(button.dataset.key)
      if (index === -1) return
      const pen = PEN_PAGES[page].chars[index]
      button.dataset.value = pen
      button.setAttribute('title', pen)
      button.setAttribute(PAGE_ATTRIBUTE, String(page + 1))
    })
  }

  // The picture is only rewritten when what it shows changed, so the panel's mutation watcher does not loop on it.
  function syncPageButton (mode) {
    steps.pages.run(() => {
      if (!hasPageToTurnTo()) return removePageButtons()
      let button = document.querySelector(`.${PAGE_BUTTON}`)
      if (!button) {
        mode.insertAdjacentHTML('afterend', `<button class="${PAGE_BUTTON}" data-control="penpage" title="Next pen page"></button>`)
        button = document.querySelector(`.${PAGE_BUTTON}`)
      }
      const shown = `${currentPage()}:${inForce.dash}:${enabledPages(inForce.lineStyles)}`
      if (button.dataset.shown === shown) return
      button.innerHTML = renderPageIcon(currentPage(), inForce.dash, inForce.lineStyles)
      button.dataset.shown = shown
    }, removePageButtons)
  }

  const hasPageToTurnTo = () => enabledPages(inForce.lineStyles).length > 1

  // A page turn keeps the color and changes how it draws, and a pen is always selected on the page showing.
  function turnPage (delta) {
    const number = penNumber(selectedPen()) || PEN_COLOR_NUMBERS[0]
    ToolPen.tool.setSelectedColor(penCharOn(stepEnabledPage(currentPage(), delta, inForce.lineStyles), number))
  }

  // The selected pen is saved under PEN_KEY, and `ToolPen_color` keeps only its color number. After a
  // reload SudokuPad has selected that number on the first page; the saved pen replaces it when its color
  // number is that one, so a number changed by stock SudokuPad (the script removed for a while) wins.
  function restoreSelectedPen (saved) {
    if (saved && saved !== selectedPen() && penNumber(saved) === selectedPen()) ToolPen.tool.setSelectedColor(saved)
  }

  const pageAfterSavedPen = (pen) => pen && pageAfterSave(pen, inForce.lineStyles)

  function installPenPages (tool) {
    // SudokuPad's own looks for the button holding the color, so the pad shows the pen's page first, and it
    // saves the pen to `ToolPen_color`, which is put back to the color number the moment it returns.
    // Its own read of `ToolPen_color` gives a number for a digit (`getData` parses), so the color is a string here.
    steps.pages.wrap(tool, 'setSelectedColor', function (stock, color) {
      const pen = String(color)
      const page = penPageOf(pen)
      if (page === -1) return stock(color)
      setPadPage(page)
      stock(pen)
      Framework.setData('ToolPen_color', penNumber(pen))
      Framework.setData(PEN_KEY, pen)
      syncPenPanel()
    })
    // SudokuPad's own enter selects the saved color number through the wrapper above, which saves it as the
    // pen, so the saved pen is read first.
    steps.pages.wrap(tool, 'handleToolEnter', function (stock) {
      const saved = pageAfterSavedPen(normalizePen(Framework.getData(PEN_KEY)))
      stock()
      restoreSelectedPen(saved)
    })
    // The panel's buttons are shared with the other tools, which read their `data-value`.
    steps.pages.wrap(tool, 'handleToolExit', function (stock) {
      stock()
      setPadPage(0)
    })
    // SudokuPad asks every tool's `handleKeydown` before its key handlers, and stops at the first that answers, so
    // answering Tab here also keeps it from the letter tool's Tab binding (which does nothing in the pen tool in
    // SudokuPad now, with No Tab Letters installed or not), and the key's default of moving the focus is stopped.
    // Shift+Tab is left alone: a held Shift is the letter tool's own temporary switch.
    if (typeof tool.handleKeydown !== 'function') tool.handleKeydown = () => false
    steps.pages.wrap(tool, 'handleKeydown', function (stock, event) {
      if (!hasPageToTurnTo() || Framework.app.tool !== this.name || event.code !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return stock(event)
      event.preventDefault()
      turnPage(1)
      return true
    })
    document.addEventListener('click', (event) => steps.pages.run(() => {
      if (event.target.closest(`.${PAGE_BUTTON}`)) turnPage(1)
    }))
    // The wheel turns the page only over the page button, as SudokuPad's color tool does over its own, and like that one it does not cancel the wheel.
    document.addEventListener('wheel', (event) => steps.pages.run(() => {
      if (event.deltaY === 0 || !hasPageToTurnTo() || !event.target.closest(`.${PAGE_BUTTON}`)) return
      turnPage(event.deltaY < 0 ? -1 : 1)
    }))
    if (tool.active) restoreSelectedPen(pageAfterSavedPen(normalizePen(Framework.getData(PEN_KEY))))
  }

  // 4. Dashed lines
  // The round caps take half a line width of the `stroke-dasharray` gap at each end, so the gap that shows is one line width less: this keeps it at least one, on a straight
  // and a diagonal piece alike.
  const MIN_DASH_GAP_PER_THICKNESS = 2
  // Snapped per line so a segment holds whole dots.
  const DOT_SPACING_PER_THICKNESS = 2

  // With the spacing exactly `length / dots` the last dot falls on the segment's end, where the browser draws no zero-length dash, so a line's far end would have no dot;
  // shrinking the spacing puts it a hair before the end (0.0064 of a unit on a cell of 64).
  const END_DOT_SHRINK = 0.9999
  // Each segment of a line is its own path with its own pattern, so a whole number of periods is fitted to the segment's `length`. A dash of 0 is dots (a zero-length dash
  // with the round cap), with a dot on both ends of the segment. With a dash, the pattern is shifted to start half a dash in, so a segment starts and ends with half a dash and
  // the two halves at a cell boundary make one whole dash: the ends of a line, every turn and every join between cells are inked, as a solid line has a point there. A dash too
  // long for the segment to hold a gap of MIN_DASH_GAP_PER_THICKNESS line widths is shortened to leave one, so a page 2 line never draws solid.
  function dashPattern (thickness, dash, length) {
    if (dash === 0) {
      return { on: 0, gap: END_DOT_SHRINK * length / Math.max(1, Math.round(length / (DOT_SPACING_PER_THICKNESS * thickness))), offset: 0 }
    }
    const minGap = MIN_DASH_GAP_PER_THICKNESS * thickness
    let periods = Math.max(1, Math.round(length / ((dash + DOT_SPACING_PER_THICKNESS) * thickness)))
    while (periods > 1 && length / periods - dash * thickness < minGap) periods--
    const period = length / periods
    const on = Math.min(dash * thickness, period - minGap)
    return { on, gap: period - on, offset: on / 2 }
  }

  function dashDeclarations (thickness, dash, length) {
    const { on, gap, offset } = dashPattern(thickness, dash, length)
    return `stroke-dasharray: ${on} ${gap};${dash === 0 ? '' : ` stroke-dashoffset: ${offset};`}`
  }
  const DASH_SWATCH = { width: 2, from: 2, to: 22 }
  const lineSwatch = (dashes = '') => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#000' stroke-linecap='round'><path d='M${DASH_SWATCH.from} 12H${DASH_SWATCH.to}' stroke-width='${DASH_SWATCH.width}'${dashes}/></svg>`
  const SOLID_SWATCH = lineSwatch()
  function dashSwatch (dash) {
    const { on, gap, offset } = dashPattern(DASH_SWATCH.width, dash, DASH_SWATCH.to - DASH_SWATCH.from)
    const round = (x) => Math.round(x * 1000) / 1000
    return lineSwatch(` stroke-dasharray='${round(on)} ${round(gap)}' stroke-dashoffset='${round(offset)}'`)
  }

  // 5. Arrow lines
  // An arrow is a filled triangle on the line: its base `halfWidth` out to each side of the line's middle and `halfLength` back from it, its tip `halfLength` forward. An arrow
  // never shrinks below its size at the default thickness, so its direction stays visible at 1. The furthest an arrow reaches off its line stays inside what Dark Page keeps
  // past a cell (its `SOLVER_REACH`; a unit test holds the two together).
  const ARROW_LINE = { halfLength: 1.125, halfWidth: 1.5, line: 1 }

  function arrowLineWayOf (char) {
    const entry = COLOR_CHARS.get(char)
    return entry ? entry.forward : null
  }

  function directionCharOf (pen, forward) {
    const entry = penOf(pen)
    return forward || !entry || !entry.reverse ? pen : entry.reverse
  }

  function lineSegment (from, to) {
    for (const value of LINE_VALUES) {
      const [start, end] = LINE_PATHS[value]
      for (const forward of [true, false]) {
        const [a, b] = forward ? [start, end] : [end, start]
        const row = from.r - a[0]
        const col = from.c - a[1]
        if (row >= 0 && col >= 0 && Number.isInteger(row) && Number.isInteger(col) && row + b[0] === to.r && col + b[1] === to.c) return { value, row, col, forward }
      }
    }
    return null
  }

  // The tool queues one select and one pen action per value over all the cells that hold it, whichever way each was dragged; here the cells of the two ways are split into two
  // actions of the same group, so one undo still takes the whole drag back.
  function splitLineActs (acts, path, pen) {
    const ways = new Map()
    for (let i = 1; i < path.length; i++) {
      const segment = lineSegment(path[i - 1], path[i])
      if (segment) ways.set(`${segment.row},${segment.col},${segment.value}`, segment.forward)
    }
    const out = []
    for (let i = 0; i < acts.length; i++) {
      const [select, draw] = [acts[i], acts[i + 1]]
      if (!(select.type === 'select' && draw && draw.type === 'pen' && LINE_VALUES.includes(draw.arg))) {
        out.push(select)
        continue
      }
      const cellsOf = (forward) => select.arg.filter((cell) => {
        const way = ways.get(`${cell.row},${cell.col},${draw.arg}`)
        if (way === undefined) throw new RangeError(`pen-tool-extras: no segment of the drag draws ${draw.arg} on row ${cell.row}, col ${cell.col}`)
        return way === forward
      })
      ;[true, false].map((forward) => [forward, cellsOf(forward)]).filter(([, cells]) => cells.length).forEach(([forward, cells], k) => {
        if (k) out.push({ type: 'deselect' })
        out.push({ type: 'select', arg: cells }, { type: 'pen', arg: draw.arg + directionCharOf(pen, forward) })
      })
      i++
    }
    return out
  }

  function arrowCorners (x, y, ux, uy, half, wide) {
    return [[x - ux * half - uy * wide, y - uy * half + ux * wide], [x + ux * half, y + uy * half], [x - ux * half + uy * wide, y - uy * half - ux * wide]]
  }

  const pointText = ([x, y]) => `${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`

  // Whole arrows are fitted to the segment, each in the middle of its share of it, so two segments in a row space them alike across their join.
  function arrowLine (value, forward, row, col, thickness, spacing) {
    const points = linePoints(value, row, col)
    const [from, to] = (forward ? points : points.reverse()).map(([r, c]) => [c * CELL_UNITS, r * CELL_UNITS])
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    const [ux, uy] = [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
    // Arrows keep the size they have at the default thickness below it; only the line gets thinner.
    const size = Math.max(thickness, THICKNESS.fallback)
    const [half, wide] = [ARROW_LINE.halfLength * size, ARROW_LINE.halfWidth * size]
    // Every segment holds at least one arrow, however wide the spacing and thick the pen (a cell side rounds to none at the top of both), so a line never loses its direction.
    const count = Math.max(1, Math.round(length / (spacing * size)))
    let arrows = ''
    for (let i = 0; i < count; i++) {
      const along = (i + 0.5) * length / count
      const [wing, tip, other] = arrowCorners(from[0] + ux * along, from[1] + uy * along, ux, uy, half, wide)
      arrows += `M${pointText(wing)}L${pointText(tip)}L${pointText(other)}Z`
    }
    return {
      line: `M${pointText(from)}L${pointText(to)}`,
      arrows,
      lineWidth: ARROW_LINE.line * thickness
    }
  }
  const ARROW_LINE_SWATCH = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#000' stroke-linecap='round'><path d='M2 12H22' stroke-width='2'/><path d='M5 6.5L12 12L5 17.5ZM13 6.5L20 12L13 17.5Z' fill='#000' stroke='none'/></svg>"

  // An arrow line's class holds a page 3 color character, as in `cell-pen pen-1 pencolor-j`.
  function arrowLineOf (opts) {
    const match = /(?:^|\s)pencolor-(\S+)$/.exec(opts.className || '')
    return match && LINE_VALUES.includes(opts.value) ? arrowLineWayOf(match[1]) : null
  }

  // The group carries the classes the line would have had, so the color, the opacity and the eraser's lookups act on it as on any stroke; the arrows' fill is set in CSS, with the group's color.
  function renderArrowLine (renderer, opts, forward) {
    const shape = arrowLine(opts.value, forward, opts.row, opts.col, inForce.thickness, inForce.arrowSpacing)
    const group = renderer.renderPart({ target: 'cell-pen', type: 'g', attr: { class: opts.className } })
    ;[['line', shape.line], ['arrows', shape.arrows]].forEach(([name, d]) => {
      const path = document.createElementNS(SVG_NAMESPACE, 'path')
      path.setAttribute('d', d)
      if (name === 'line') path.setAttribute('stroke-width', String(shape.lineWidth))
      path.setAttribute('data-arrow-line-part', name)
      group.appendChild(path)
    })
    return group
  }

  // An arrow's size and spacing are fixed when it is drawn, so a change of thickness, and a wrap that came after the cell was drawn, need a redraw.
  function redrawArrowLines () {
    steps.arrowLines.run(() => Framework.app.puzzle.cells.forEach((cell) => {
      if ((cell.pen || []).some((valueColor) => LINE_VALUES.includes(valueColor[0]) && arrowLineWayOf(valueColor[1]) !== null)) cell.renderContent(true)
    }))
  }

  // A line dragged with a page 3 pen is stored with the character of the way each segment was dragged: the tool queues its actions (and its path) before `actSend` sends them, so
  // they are rewritten there. A drag that erases queues the value alone, which removes the line whichever way it was stored, and is left as it is.
  function installArrowLines (app, tool) {
    steps.arrowLines.wrap(Object.getPrototypeOf(app.svgRenderer), 'renderPen', function (stock, opts = {}) {
      const forward = arrowLineOf(opts)
      return forward === null ? stock(opts) : renderArrowLine(this, opts, forward)
    })
    steps.arrowLines.wrap(tool, 'actSend', function (stock, ...args) {
      if (!this.eraseMode && Array.isArray(this.currentPath) && arrowLineWayOf(selectedPen()) !== null) {
        this._actList.splice(0, this._actList.length, ...splitLineActs(this._actList, this.currentPath, selectedPen()))
      }
      return stock(...args)
    })
    redrawArrowLines()
  }

  // 6. Marks: edge marks, grid-corner marks, right click goes backwards and the marks layer
  // Every edge mark, grid-corner mark and cell circle and cross is drawn here, last in the pen layer: SudokuPad adds a cell's strokes in cell order, so a later
  // cell's line would otherwise cover an earlier cell's mark. The pen layer's opacity then fades marks and lines as one picture.
  const MARKS_LAYER_ID = 'pen-tool-extras-marks'
  const RIGHT_BUTTON = 2
  // Keyed by the pen value of SudokuPad's own edge X on a cell's right, bottom, left and top edge. An edge between two cells is stored on one of them, so a click on it is always
  // one of these four. `midpoint` is the edge's middle as a [row, col] offset from the cell's top left corner. `added` is the values this script adds, in ADDED_ORDER: SudokuPad's
  // own pen values stop at `g`, so `h` onward are free; they stay lowercase letters because SudokuPad lowercases a pen value when it undoes or replays one. `arrows` is the
  // shapes dirA and dirB draw.
  const EDGES = {
    3: { midpoint: [0.5, 1], added: ['h', 'i', 'j'], arrows: ['>', '<'] },
    4: { midpoint: [1, 0.5], added: ['k', 'l', 'm'], arrows: ['^', 'v'] },
    b: { midpoint: [0.5, 0], added: ['n', 'o', 'p'], arrows: ['>', '<'] },
    c: { midpoint: [0, 0.5], added: ['q', 'r', 's'], arrows: ['^', 'v'] }
  }
  const EDGE_X = Object.keys(EDGES)
  const ADDED_ORDER = ['dirA', 'dirB', 'circle']
  // `directions` is the one checkbox for dirA and dirB.
  const EDGE_CYCLE = {
    types: ['x', 'circle', 'dirA', 'dirB'],
    setting: { x: 'x', dirA: 'directions', dirB: 'directions', circle: 'circle' }
  }
  // A grid corner has no edge direction for an arrow to name, so it cycles an X and a circle.
  const CORNER_CYCLE = {
    types: ['x', 'circle'],
    setting: { x: 'cornerX', circle: 'cornerCircle' }
  }
  // The names older saves hold the two circle boxes under.
  const OLD_MARK_NAMES = { circle: 'dot', cornerCircle: 'cornerDot' }
  // An edge's midpoint is 0.5 from its corners and a cell's middle 0.71, so neither comes near 0.2, which is a circle about 12 px across at a cell 60 px wide. It takes the corner end
  // of an edge click (SudokuPad's edge zone reaches 0.57 along the side from the midpoint).
  const CORNER_RADIUS = 0.2
  // A grid corner is stored as a mark on one cell. `br` is a cell's bottom right corner, which is every corner with a cell up and to the left of it, so a corner shared by four
  // cells is stored once; `tl` is the top left corner, for the grid's top and left edge; `far` is the top right corner of the top row's last cell or the bottom left corner of the
  // bottom row's first, the two grid corners the other kinds cannot reach. Each kind lists the X, then the circle.
  const CORNER_VALUES = { tl: ['t', 'w'], br: ['u', 'x'], far: ['v', 'y'] }
  const CIRCLE = 'o'
  const CIRCLE_RADIUS_PER_HALF_SIZE = 0.83
  // Each pen value this script draws, to its `edge` or corner `kind`, its type in the edge cycle or corner cycle, and its shape.
  const ADDED_MARKS = new Map([
    ...Object.entries(EDGES).flatMap(([edge, { added, arrows }]) =>
      ADDED_ORDER.map((type, i) => [added[i], { edge, type, shape: type === 'circle' ? CIRCLE : arrows[i] }])),
    ...Object.entries(CORNER_VALUES).flatMap(([kind, values]) =>
      CORNER_CYCLE.types.map((type, i) => [values[i], { kind, type, shape: type === 'x' ? 'x' : CIRCLE }]))
  ])
  // The marks that grow with thickness: the edge X marks and every mark this script adds.
  const GROWING_MARKS = [...EDGE_X, ...ADDED_MARKS.keys()]
  const MARK_VALUES = [...EDGE_X, '5', '6', ...ADDED_MARKS.keys()]

  // Data saved before the corner boxes existed has no corner entry, so both read as ticked. A circle box saved under its old name reads as the new one, which wins when both are
  // there; the result holds only the new names, so the next save writes those.
  function normalizeMarkSettings (data) {
    const saved = isPlainObject(data) ? data : {}
    const underOldNames = Object.fromEntries(Object.entries(OLD_MARK_NAMES).map(([name, old]) => [name, saved[old]]))
    return decodeFlags(Object.keys(SETTINGS.marks.fallback), { ...underOldNames, ...saved })
  }

  function valueOfType (edge, type) {
    return type === 'x' ? edge : EDGES[edge].added[ADDED_ORDER.indexOf(type)]
  }

  function stepType (current, settings, direction, cycle) {
    const order = [...cycle.types, 'empty']
    const from = order.indexOf(current)
    for (let step = 1; step <= order.length; step++) {
      const type = order[wrapIndex(from, direction * step, order.length)]
      if (type === 'empty' || settings[cycle.setting[type]]) return type
    }
    throw new Error('pen-tool-extras: the cycle has no empty step')
  }

  function planCycleClick (cycle, valueOf, present, settings, backwards) {
    if (!cycle.types.some((type) => settings[cycle.setting[type]])) return null
    const held = cycle.types.filter((type) => present.includes(valueOf(type)))
    const next = stepType(held.length ? held[0] : 'empty', settings, backwards ? -1 : 1, cycle)
    return {
      remove: held.map(valueOf),
      add: next === 'empty' ? null : valueOf(next)
    }
  }

  function planClick (edge, present, settings, backwards = false) {
    return planCycleClick(EDGE_CYCLE, (type) => valueOfType(edge, type), present, settings, backwards)
  }

  function planCornerClick (kind, present, settings, backwards = false) {
    return planCycleClick(CORNER_CYCLE, (type) => CORNER_VALUES[kind][CORNER_CYCLE.types.indexOf(type)], present, settings, backwards)
  }

  // A point just outside the grid is measured too, so the outer corners can be clicked.
  function cornerAt (r, c, rows, cols) {
    const row = Math.max(0, Math.min(rows, Math.round(r)))
    const col = Math.max(0, Math.min(cols, Math.round(c)))
    return Math.hypot(r - row, c - col) < CORNER_RADIUS ? { row, col } : null
  }

  function cornerStorage (row, col, rows, cols) {
    if (row >= 1 && col >= 1) return { kind: 'br', row: row - 1, col: col - 1 }
    if (row < rows && col < cols) return { kind: 'tl', row, col }
    return { kind: 'far', row: row === 0 ? 0 : rows - 1, col: row === 0 ? cols - 1 : 0 }
  }

  // The inverse of cornerStorage; `cols` tells the `far` kind's two cells apart.
  function cornerPoint (kind, row, col, cols) {
    switch (kind) {
      case 'br': return [row + 1, col + 1]
      case 'tl': return [row, col]
      default: return row === 0 && col === cols - 1 ? [row, col + 1] : [row + 1, col]
    }
  }

  function cornerMarkOf (value) {
    const mark = ADDED_MARKS.get(value)
    return mark && mark.kind ? { kind: mark.kind, type: mark.type } : null
  }

  // An edge mark's shape; null for any other value.
  function shapeOf (value) {
    const mark = ADDED_MARKS.get(value)
    return mark && mark.edge ? mark.shape : null
  }

  // Relative to the point the mark is centred on, `s` being the half-size in SudokuPad's units; 'x' is SudokuPad's own edge X.
  function shapePath (shape, s) {
    const r = CIRCLE_RADIUS_PER_HALF_SIZE * s
    switch (shape) {
      case '>': return ` m ${-0.6 * s},${-s} l${1.2 * s},${s} l${-1.2 * s},${s}`
      case '<': return ` m ${0.6 * s},${-s} l${-1.2 * s},${s} l${1.2 * s},${s}`
      case '^': return ` m ${-s},${0.6 * s} l${s},${-1.2 * s} l${s},${1.2 * s}`
      case 'v': return ` m ${-s},${-0.6 * s} l${s},${1.2 * s} l${s},${-1.2 * s}`
      case 'x': return ` m ${-s},${-s} l${2 * s},${2 * s} m ${-2 * s},0 l${2 * s},${-2 * s}`
      case CIRCLE: return ` m ${-r},0 a ${r},${r} 0 1,0 ${2 * r},0 a ${r},${r} 0 1,0 ${-2 * r},0`
      default: throw new Error(`pen-tool-extras: no shape named ${shape}`)
    }
  }

  function edgeMidpoint (edge, row, col) {
    const [dr, dc] = EDGES[edge].midpoint
    return [row + dr, col + dc]
  }

  function addedMark (value, row, col, cols) {
    const mark = ADDED_MARKS.get(value)
    if (!mark) return null
    return { point: mark.edge ? edgeMidpoint(mark.edge, row, col) : cornerPoint(mark.kind, row, col, cols), shape: mark.shape }
  }

  function isEdgeActs (acts) {
    return acts !== null && acts.length === 2 && acts[0].type === 'select' && acts[1].type === 'pen' && EDGE_X.includes(acts[1].arg)
  }

  function penValuesOf (cell) {
    return (cell.pen || []).map((valueColor) => valueColor[0])
  }

  function planActs (cell, plan) {
    return [
      { type: 'select', arg: [cell] },
      ...plan.remove.map((arg) => ({ type: 'pen', arg })),
      ...(plan.add === null ? [] : [{ type: 'pen', arg: plan.add }])
    ]
  }

  // A stroke SudokuPad has just added displaces the marks layer, so it goes back as the last child. The cell still holds the same element, so erasing, undo and a redraw remove it from wherever it is.
  function keepMarksAbove (part, isMark) {
    const layer = marksLayer()
    if (!layer) return
    if (isMark && part && part.parentNode !== layer) layer.appendChild(part)
    if (layer.parentNode.lastChild !== layer) layer.parentNode.appendChild(layer)
  }

  // SudokuPad's own `renderPen` has no case for the values and gives the path no `d`; it copies every option onto the path, so passing `d` is enough.
  function wrapRenderPenMarks (renderer) {
    const proto = Object.getPrototypeOf(renderer)
    const size = renderer.constructor.CellSize
    steps.marks.wrap(proto, 'renderPen', function (stock, opts = {}) {
      const mark = addedMark(opts.value, opts.row, opts.col, Framework.app.grid.cols)
      const part = stock(mark === null ? opts : { ...opts, d: this.constructor.rcToPathData([mark.point]) + shapePath(mark.shape, size * 0.125) })
      keepMarksAbove(part, MARK_VALUES.includes(opts.value))
      return part
    })
  }

  // The actions `click` (SudokuPad's own `clickCell`) queues, with its `actSend` held back.
  function queuedActs (tool, click) {
    const hadOwn = Object.prototype.hasOwnProperty.call(tool, 'actSend')
    const ownSend = tool.actSend
    let queued = null
    tool.actSend = function () { queued = this._actList.slice() }
    try {
      click()
    } finally {
      if (hadOwn) tool.actSend = ownSend
      else delete tool.actSend
      tool._actList.length = 0
    }
    return queued
  }

  // null also while both corner boxes are unticked, so the original hit test handles every click as it did before. SudokuPad's `clickCell` hit-tests `getInputRc()`, the pointer in
  // cell units, and so does this.
  function cornerUnderPointer (tool) {
    if (!inForce.marks.cornerX && !inForce.marks.cornerCircle) return null
    const { r, c } = tool.getInputRc()
    const { rows, cols } = Framework.app.grid
    return cornerAt(r, c, rows, cols)
  }

  function cornerActs (corner) {
    const { rows, cols } = Framework.app.grid
    const { kind, row, col } = cornerStorage(corner.row, corner.col, rows, cols)
    const cell = Framework.app.grid.getCell(row, col)
    return planActs(cell, planCornerClick(kind, penValuesOf(cell), inForce.marks, steppingBackwards()))
  }

  // A click within CORNER_RADIUS of a grid corner is a corner click, checked first. Otherwise the original `clickCell` runs unchanged, so its edge-versus-cell hit test decides what
  // was clicked, its `actSend` held back to see the actions it queued. The actions still go out through `actSend`, one group per click, so one undo reverses one click. A middle click
  // is left to the line erase.
  function wrapClickCell (tool, original) {
    steps.marks.wrap(tool, 'clickCell', function (stock, ...args) {
      if (lastButton === MIDDLE_BUTTON) return stock(...args)
      const corner = cornerUnderPointer(this)
      if (corner !== null) {
        const acts = cornerActs(corner)
        return stock.sudokupad(() => { this.actStart(); sendActs(this, acts) })
      }
      const queued = stock.sudokupad(() => queuedActs(this, () => original.apply(this, args)), false)
      if (queued === null) return
      let acts = queued
      if (isEdgeActs(queued)) {
        const cell = queued[0].arg[0]
        const plan = planClick(queued[1].arg, penValuesOf(cell), inForce.marks, steppingBackwards())
        if (plan === null) return
        acts = planActs(cell, plan)
      }
      stock.sudokupad(() => sendActs(this, acts))
    })
  }

  function steppingBackwards () {
    return lastButton === RIGHT_BUTTON
  }

  function markUnderPointer (tool, original) {
    return cornerUnderPointer(tool) !== null || isEdgeActs(queuedActs(tool, () => original.apply(tool, [])))
  }

  // The pen tool steps a corner or an edge backwards on a right click, so the browser's menu must not open over one. The check runs the same hit test as the click, so a right click
  // in a cell's middle, with another tool, or off the grid keeps its menu.
  function suppressMarkMenu (app, isMarkClick) {
    document.addEventListener('contextmenu', (event) => steps.marks.run(() => {
      if (app.tool === 'pen' && event.target.closest(GRID_SELECTOR) && isMarkClick()) event.preventDefault()
    }), true)
  }

  // Cells drawn before the wrap hold values the old `renderPen` drew as nothing (this script's marks) or in the pen layer (every mark).
  function redrawMarks (app) {
    app.puzzle.cells.forEach((cell) => {
      if ((cell.pen || []).some((valueColor) => MARK_VALUES.includes(valueColor[0]))) cell.renderContent(true)
    })
  }

  // Wrapped after the line erase and the arrow lines, so a mark's click and drawing come first and the marks layer stays on top of an arrow line.
  function installMarks (app, tool) {
    wrapRenderPenMarks(app.svgRenderer)
    const original = tool.clickCell
    wrapClickCell(tool, original)
    suppressMarkMenu(app, () => markUnderPointer(tool, original))
    redrawMarks(app)
  }

  function marksLayer () {
    return layerIn(MARKS_LAYER_ID, false)
  }

  // 7. Middle click erase
  const LINE_HIT_RADIUS = 0.2

  // An arrow pen's two direction characters are one pen.
  function lineIdentityOf (color) {
    const entry = COLOR_CHARS.get(color)
    return entry ? entry.pen : color
  }

  function distanceToSegment (point, a, b) {
    const [dr, dc] = [b[0] - a[0], b[1] - a[1]]
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dr + (point[1] - a[1]) * dc) / (dr * dr + dc * dc)))
    return Math.hypot(point[0] - (a[0] + t * dr), point[1] - (a[1] + t * dc))
  }

  function segmentNear (point, segments, radius) {
    let best = null
    let bestDistance = radius
    for (const segment of segments) {
      const distance = distanceToSegment(point, ...linePoints(segment.value, segment.row, segment.col))
      if (distance <= bestDistance) {
        best = segment
        bestDistance = distance
      }
    }
    return best
  }

  // A segment of another pen stops the line, and a branch is joined.
  function connectedLine (segments, start) {
    const pen = lineIdentityOf(start.color)
    const key = (point) => point.join(',')
    const at = new Map()
    for (const segment of segments) {
      if (lineIdentityOf(segment.color) !== pen) continue
      for (const point of linePoints(segment.value, segment.row, segment.col)) {
        if (!at.has(key(point))) at.set(key(point), [])
        at.get(key(point)).push(segment)
      }
    }
    const found = new Set([start])
    const queue = [start]
    while (queue.length) {
      const segment = queue.pop()
      for (const point of linePoints(segment.value, segment.row, segment.col)) {
        for (const next of at.get(key(point)) || []) {
          if (found.has(next)) continue
          found.add(next)
          queue.push(next)
        }
      }
    }
    return [...found]
  }

  // The bare value toggles a stroke off whichever color character it was stored with. One group sends the actions, so one undo restores the line.
  function eraseLineActs (segments, cellAt) {
    const cellsOf = new Map()
    for (const { value, row, col } of segments) {
      if (!cellsOf.has(value)) cellsOf.set(value, [])
      cellsOf.get(value).push(cellAt(row, col))
    }
    const acts = []
    for (const [value, cells] of cellsOf) {
      if (acts.length) acts.push({ type: 'deselect' })
      acts.push({ type: 'select', arg: cells }, { type: 'pen', arg: value })
    }
    return acts
  }

  function lineSegmentsOf (cells) {
    return cells.flatMap((cell) => (cell.pen || [])
      .filter((valueColor) => LINE_VALUES.includes(valueColor[0]))
      .map((valueColor) => ({ value: valueColor[0], row: cell.row, col: cell.col, color: valueColor.slice(1) })))
  }

  function eraseLineAt (tool, { r, c }) {
    const segments = lineSegmentsOf(Framework.app.puzzle.cells)
    const hit = segmentNear([r, c], segments, LINE_HIT_RADIUS)
    if (hit === null) return
    tool.actStart()
    sendActs(tool, eraseLineActs(connectedLine(segments, hit), (row, col) => Framework.app.grid.getCell(row, col)))
  }

  // A middle press over the grid in the pen tool erases the line under the pointer and has its default prevented, which stops the
  // browser's autoscroll. A prevented `pointerdown` also stops the browser sending `mousedown`, `mouseup` and so SudokuPad's
  // `clickCell` (checked live), so the erase runs from the press itself and no pen mark or drag follows. `mousedown` is prevented
  // too for a browser that still sends it, which stops only the autoscroll: SudokuPad's own `mousedown` handler still runs there.
  // The press's own coordinates are hit-tested, not SudokuPad's cached pointer position, which a dialog stops updating.
  function installLineErase (app, tool) {
    // A middle press that was not over the grid (just off its edge) still reaches `clickCell` on the release: it makes no mark.
    steps.lineErase.wrap(tool, 'clickCell', (stock, ...args) => lastButton === MIDDLE_BUTTON && inForce.middleErase ? undefined : stock(...args))
    const middlePress = (event) => inForce.middleErase && event.button === MIDDLE_BUTTON && app.tool === 'pen' && event.target.closest && event.target.closest(GRID_SELECTOR)
    window.addEventListener('pointerdown', (event) => steps.lineErase.run(() => {
      if (!middlePress(event)) return
      event.preventDefault()
      eraseLineAt(tool, app.xyToRCExact(event.clientX, event.clientY))
    }), true)
    window.addEventListener('mousedown', (event) => steps.lineErase.run(() => { if (middlePress(event)) event.preventDefault() }), true)
  }

  // 8. Line look: thickness, opacity, white outline and the hint layer
  // The drag highlight (`.penhint`, also the erase highlight) is moved here, right above the pen layer, so the pen layer's opacity does not fade it.
  const HINT_LAYER_ID = 'pen-tool-extras-hint'
  const MARK_PER_THICKNESS = 0.5
  // Edge and corner marks keep their size up to the default thickness and grow above it, to 1 + MARK_GROWTH times at the largest, by a CSS scale (which also resizes
  // marks already drawn) about the mark's middle. At 16 an edge X then reaches 12.8 from its middle against the line's half width of 8, so it clears a line of the same thickness.
  const MARK_GROWTH = 0.6
  // The outline is made in two steps. The layer's alpha is first grown square by OUTLINE_SQUARE_SHARE of the width, so a thin shape (a one-wide dot) is wide enough for
  // the second step to keep; then it is blurred and cut at OUTLINE_CUT, which rounds the corners a square growth alone steps round and adds the rest of the width. Along a
  // straight edge the blurred alpha falls to OUTLINE_CUT at OUTLINE_CUT_SIGMAS blur widths (the normal curve's 95th percentile) out, which sets the blur width. The cut is a steep
  // ramp (OUTLINE_SOFTNESS per unit of alpha) so the edge is not jagged. A blur alone dims a thin shape below the cut at the largest widths, and its outline fades to a faint halo.
  const OUTLINE_SQUARE_SHARE = 1 / 3
  const OUTLINE_CUT = 0.05
  const OUTLINE_CUT_SIGMAS = 1.645
  const OUTLINE_SOFTNESS = 16
  const OUTLINE_FILTER_ID = 'pen-tool-extras-outline-filter'
  // A CSS `filter: url(#id)` needs the filter's element in the document.
  const OUTLINE_HOLDER_ID = 'pen-tool-extras-outline-holder'
  // The filter's region, in cell units, is far past any grid (100000 is over 1500 cells): the default region is a margin of the layer's bounding box, which gives a lone
  // horizontal line no height to hold an outline in.
  const OUTLINE_REGION = { min: -100000, size: 200000 }

  function markGrowthScale (thickness) {
    if (thickness <= THICKNESS.fallback) return 1
    const grown = 1 + MARK_GROWTH * (thickness - THICKNESS.fallback) / (THICKNESS.max - THICKNESS.fallback)
    return Math.round(grown * 1e4) / 1e4
  }

  // The marks are scaled by markGrowthScale about their middle (`fill-box` is the path's own box, which is centred on the edge midpoint or corner), and their stroke width is
  // divided by that scale so the stroke stays as thick and only the mark's length grows. Lines are never scaled. `:root:root` outranks SudokuPad's `.cell-pen` and `.pen-3`
  // width rules whichever stylesheet loads last, and the two lists share no value, so no value has two width rules.
  function buildThicknessCss (thickness) {
    if (!inRange(thickness, THICKNESS)) throw new RangeError(`pen-tool-extras: ${thickness} is not a thickness from ${THICKNESS.min} to ${THICKNESS.max}`)
    const selector = (values) => values.map((v) => `:root:root .cell-pen.pen-${v}`).join(', ')
    const scale = markGrowthScale(thickness)
    return [
      `${selector(FULL_WIDTH_VALUES)} { stroke-width: ${thickness}; }`,
      `${selector(GROWING_MARKS)} { stroke-width: ${thickness * MARK_PER_THICKNESS / scale}; transform: scale(${scale}); transform-box: fill-box; transform-origin: center; }`
    ].join('\n')
  }

  // SudokuPad's own rule gives each stroke path `opacity: 0.8`, and each segment of a line is its own path, so strokes that overlap darken where they do. Here the paths are
  // solid and the group they are drawn in carries the opacity, so the layer fades as one picture and an overlap shows the same as the rest of its stroke (where two colors
  // cross, the later one covers the earlier). `:root:root` outranks SudokuPad's rule whichever stylesheet loads last.
  function buildOpacityCss (opacity) {
    if (!inRange(opacity, OPACITY)) throw new RangeError(`pen-tool-extras: ${opacity} is not an opacity from ${OPACITY.min} to ${OPACITY.max} in steps of ${OPACITY.step}`)
    return `:root:root .cell-pen { opacity: 1; }\n:root:root ${PEN_LAYER} { opacity: ${opacity / 100}; }`
  }

  // A filter runs on the layer's picture before its opacity does, so the outline fades with the marks. The highlight (`.penhint`) is in its own group beside the layer, so it is not outlined.
  function buildOutlineCss (outline) {
    if (typeof outline !== 'boolean') throw new RangeError(`pen-tool-extras: ${outline} is not true or false`)
    return outline ? `:root:root ${PEN_LAYER} { filter: url(#${OUTLINE_FILTER_ID}); }` : ''
  }

  // The layer's alpha is grown in the two steps described at OUTLINE_SQUARE_SHARE, as one shape, so the outline does not cut across where lines join or cross. The filter works
  // in sRGB so the layer's own colors pass through unchanged.
  function renderOutlineFilter (width) {
    if (!inRange(width, OUTLINE_WIDTH)) throw new RangeError(`pen-tool-extras: ${width} is not an outline width from ${OUTLINE_WIDTH.min} to ${OUTLINE_WIDTH.max}`)
    const { min, size } = OUTLINE_REGION
    const square = Math.round(width * OUTLINE_SQUARE_SHARE * 1000) / 1000
    return `<svg id="${OUTLINE_HOLDER_ID}" width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="${OUTLINE_FILTER_ID}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB" x="${min}" y="${min}" width="${size}" height="${size}">` +
      `<feMorphology in="SourceAlpha" operator="dilate" radius="${square}" result="squared"/>` +
      `<feGaussianBlur in="squared" stdDeviation="${Math.round((width - square) / OUTLINE_CUT_SIGMAS * 1000) / 1000}" result="blurred"/>` +
      `<feComponentTransfer in="blurred" result="grown"><feFuncA type="linear" slope="${OUTLINE_SOFTNESS}" intercept="${Math.round((0.5 - OUTLINE_SOFTNESS * OUTLINE_CUT) * 1000) / 1000}"/></feComponentTransfer>` +
      '<feFlood flood-color="#ffffff" result="white"/>' +
      '<feComposite in="white" in2="grown" operator="in" result="halo"/>' +
      '<feMerge><feMergeNode in="halo"/><feMergeNode in="SourceGraphic"/></feMerge></filter></svg>'
  }

  function adoptThickness () {
    redrawArrowLines()
    document.querySelectorAll(`#${THICKNESS_SLIDER}`).forEach((el) => { el.value = inForce.thickness })
  }

  function adoptOpacity () {
    document.querySelectorAll(`#${OPACITY_SLIDER}`).forEach((el) => { el.value = inForce.opacity })
  }

  function adoptOutline () {
    const holder = document.getElementById(OUTLINE_HOLDER_ID)
    if (holder) holder.remove()
    if (inForce.outline) document.body.insertAdjacentHTML('beforeend', renderOutlineFilter(inForce.outlineWidth))
  }

  function hintLayer () {
    return layerIn(HINT_LAYER_ID, true)
  }

  // SudokuPad draws the drag highlight inside the pen layer; it moves to the layer beside it, so the pen layer's opacity and outline do not touch it.
  function installHintLayer (tool) {
    steps.dragHint.wrap(tool, 'drawLineHint', function (stock, ...args) {
      stock(...args)
      const layer = hintLayer()
      if (layer && this.linePart && this.linePart.parentNode !== layer) layer.appendChild(this.linePart)
    })
  }

  // 9. Pen panel: the pen panel sliders and line mode
  const THICKNESS_SLIDER = 'pen-tool-extras-thickness'
  const OPACITY_SLIDER = 'pen-tool-extras-opacity'
  const SLIDERS = 'pen-tool-extras-sliders'
  const SLIDER_ROW = 'pen-tool-extras-slider'
  // SudokuPad's line mode pulldown (hidden here, offered in the dialog), the key it saves the mode under, and its three values with SudokuPad's labels.
  const LINE_MODE_BOX = '.tool-pen .penlinemode'
  const LINE_MODE_KEY = 'ToolPen_linemode'
  const LINE_MODES = [['both', 'Center & Edge'], ['centeronly', 'Center only'], ['edgeonly', 'Edge only']]

  // 'both' is SudokuPad's own default.
  function normalizeLineMode (data) {
    return LINE_MODES.some(([value]) => value === data) ? data : LINE_MODES[0][0]
  }

  // SudokuPad draws `.penlinemode` as a box across the panel's last row, 4rem tall, absolutely placed 13rem down `.controls-input`. That box is hidden, and the row holds
  // the two sliders and the page button instead, so the pad is no taller.
  const PANEL_ROW_TOP_REM = 13
  const PANEL_ROW_HEIGHT_REM = 4
  const PAGE_BUTTON_WIDTH_REM = PANEL_ROW_HEIGHT_REM
  const PAGE_GAP_REM = 0.5
  const LINE_PICTURE_WIDTH = 3.4
  // A hidden slider's empty row has the same height, so the other keeps its place.
  const SLIDER_ROW_HEIGHT_REM = 1.4
  const PANEL_CSS = [
    `${LINE_MODE_BOX} { display: none; }`,
    `.${SLIDERS} { position: absolute; left: 0.2rem; right: ${PAGE_BUTTON_WIDTH_REM + PAGE_GAP_REM}rem; top: ${PANEL_ROW_TOP_REM}rem; height: ${PANEL_ROW_HEIGHT_REM}rem; display: flex; flex-direction: column; justify-content: center; gap: 0.5rem; color: ${PANEL_COLOR}; }`,
    `.${SLIDER_ROW} { display: flex; align-items: center; gap: 0.4rem; height: ${SLIDER_ROW_HEIGHT_REM}rem; }`,
    `.${SLIDER_ROW} svg { flex: none; width: 1.4rem; height: 1.1rem; }`,
    `.${SLIDER_ROW} input { flex: 1; min-width: 0; margin: 0; accent-color: ${PANEL_COLOR}; }`,
    `.tool-pen .controls-input button.${PAGE_BUTTON} { position: absolute; right: 0; top: ${PANEL_ROW_TOP_REM}rem; width: ${PAGE_BUTTON_WIDTH_REM}rem; height: ${PANEL_ROW_HEIGHT_REM}rem; padding: 0; background-color: var(--body-bg); color: ${PANEL_COLOR}; }`,
    `.${PAGE_BUTTON} svg { width: 2.6rem; height: 2.6rem; }`
  ].join('\n')

  const linePicture = (width, strokeOpacity) =>
    `<svg viewBox="0 0 20 16" fill="none" stroke="currentColor" stroke-width="${width}" stroke-opacity="${strokeOpacity}" stroke-linecap="round" aria-hidden="true"><path d="M3 13 L17 3"/></svg>`

  // A hidden slider keeps an empty row so the other keeps its place. Neither slider takes keyboard focus by tabbing (`tabindex="-1"`): a drag ends with the focus handed back to the page.
  function renderPanelSliders (thickness, opacity, show) {
    if (!show.thickness && !show.opacity) return ''
    const row = (shown, id, label, picture, range, value) => shown
      ? `<div class="${SLIDER_ROW}" title="${label}">${picture}` +
        `<input type="range" id="${id}" aria-label="${label}" tabindex="-1" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}"></div>`
      : `<div class="${SLIDER_ROW}" data-empty></div>`
    return `<div class="${SLIDERS}">` +
      row(show.thickness, THICKNESS_SLIDER, 'Thickness', linePicture(LINE_PICTURE_WIDTH, 1), THICKNESS, thickness) +
      row(show.opacity, OPACITY_SLIDER, 'Opacity', linePicture(LINE_PICTURE_WIDTH, 0.35), OPACITY, opacity) +
      '</div>'
  }

  function lineModeChoice (lineMode) {
    if (lineMode === undefined) return ''
    const options = LINE_MODES.map(([value, label]) => `<option value="${value}"${value === lineMode ? ' selected' : ''}>${label}</option>`).join('')
    return sectionHeading('Pen line mode') +
      `<select data-line-mode>${options}</select>`
  }

  // The saved mode: SudokuPad's pen tool holds its default until it first opens and reads the saved mode then, and with the pulldown hidden only this dialog changes it. It does not
  // depend on the page support in `installPenPages`.
  function currentLineMode () {
    return steps.penPanel.off ? undefined : normalizeLineMode(Framework.getData(LINE_MODE_KEY))
  }

  // Saved where SudokuPad saves it, so its hidden pulldown, when the pen tool is on, shows it too.
  function applyLineMode (lineMode) {
    ToolPen.tool.lineMode = lineMode
    Framework.setData(LINE_MODE_KEY, lineMode)
    const select = document.querySelector(`${LINE_MODE_BOX} select`)
    if (select) select.value = lineMode
  }

  function adoptShow () {
    document.querySelectorAll(`.${SLIDERS}`).forEach((el) => el.remove())
    syncPenPanel()
  }

  // A panel slider changes no cell, so nothing goes on the undo stack or in the replay.
  function saveSlider (input) {
    const name = input.id === THICKNESS_SLIDER ? 'thickness' : 'opacity'
    saveSettings({ ...inForce, [name]: Number(input.value) })
  }

  const PEN_PANEL = '.tool-pen .controls-input'
  // The panel may be up for a moment without a line mode pulldown, since SudokuPad builds it in steps.
  const PANEL_CHECK_MS = 1000
  let panelCheck = null

  // A panel with no pulldown, whose row the sliders and page button take, means SudokuPad renamed the element, so the row is not ours.
  function checkPanelRow () {
    if (panelCheck !== null || !document.querySelector(PEN_PANEL)) return
    panelCheck = setTimeout(() => {
      panelCheck = null
      if (document.querySelector(PEN_PANEL) && !document.querySelector(LINE_MODE_BOX)) steps.penPanel.skip('the pen tool panel has no .penlinemode')
    }, PANEL_CHECK_MS)
  }

  // SudokuPad builds `.penlinemode` each time the pen tool is turned on and removes it when another tool is. The sliders and the page button are added beside it (it is hidden,
  // not removed, so SudokuPad's own handlers keep their element) and taken away with it. Safe to run any number of times.
  function syncPenPanel () {
    steps.penPanel.run(() => {
      const mode = document.querySelector(LINE_MODE_BOX)
      if (!mode) {
        checkPanelRow()
        return removePanelParts()
      }
      const markup = renderPanelSliders(inForce.thickness, inForce.opacity, inForce.show)
      const sliders = document.querySelector(`.${SLIDERS}`)
      if (!markup && sliders) sliders.remove()
      if (markup && !sliders) mode.insertAdjacentHTML('afterend', markup)
      syncPageButton(mode)
    }, removePanelParts)
  }

  function removePanelParts () {
    document.querySelectorAll(`.${SLIDERS}`).forEach((el) => el.remove())
    removePageButtons()
  }

  // A drag on a slider leaves the focus on it, and then the arrow and paging keys would move the slider
  // and not reach the puzzle; the focus goes back to the page when the pointer is released.
  function installPenPanel () {
    new window.MutationObserver(syncPenPanel).observe(document.body, { childList: true, subtree: true })
    syncPenPanel()
    document.addEventListener('input', (event) => {
      if (event.target.matches(`.${SLIDERS} input`)) saveSlider(event.target)
    })
    // SudokuPad cancels (`preventDefault`) every mouse move on the page, and a cancelled move stops
    // the browser dragging a slider's thumb. A mouse move over a slider is kept from SudokuPad's
    // handlers, so the thumb drags and the drag reaches nothing else on the page.
    document.addEventListener('mousemove', (event) => {
      if (event.target.closest(`.${SLIDERS}`)) event.stopPropagation()
    }, true)
    window.addEventListener('pointerup', () => {
      const focused = document.activeElement
      if (focused && focused.matches(`.${SLIDERS} input`)) focused.blur()
    }, true)
  }

  // 10. Settings dialog and settings gear
  const EDITOR_ID = 'pen-tool-extras-editor'
  const GEAR_BUTTON = '#control-pen'
  const GEAR_CLASS = 'pen-tool-extras-gear'
  const GEAR_LABEL = 'Pen tool extras settings'
  const GEAR_SIZE_PX = 13
  const GEAR_INSET_PX = 2
  const GEAR_ICON_PX = 9
  // SudokuPad's own CSS turns pointer events off on what is inside a tool button, so the gear turns them back on.
  const GEAR_CSS = [
    `${GEAR_BUTTON} { position: relative; }`,
    `.${GEAR_CLASS} { position: absolute; right: ${GEAR_INSET_PX}px; top: ${GEAR_INSET_PX}px; box-sizing: border-box; width: ${GEAR_SIZE_PX}px; height: ${GEAR_SIZE_PX}px; border: 1.5px solid ${PANEL_COLOR}; border-radius: 3px; background: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; pointer-events: auto; }`,
    // A selected tool's icons are turned white, which would hide the glyph on its white box.
    `.${GEAR_CLASS} path { fill: ${PANEL_COLOR} !important; }`
  ].join('\n')
  const GEAR_MARKUP = `<span class="${GEAR_CLASS}" role="button" aria-label="${GEAR_LABEL}" title="${GEAR_LABEL}"><svg viewBox="0 0 24 24" width="${GEAR_ICON_PX}" height="${GEAR_ICON_PX}" fill="${PANEL_COLOR}" aria-hidden="true"><path d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.88 2h-3.84a.5.5 0 0 0-.49.42l-.36 2.54a7 7 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.64 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54a7 7 0 0 0 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg></span>`

  const MARK_PICTURES = {
    x: ['16', '<path d="M3 3 L13 13 M13 3 L3 13"/>'],
    directions: ['64', '<path d="M3 3 L9 8 L3 13 M25 3 L19 8 L25 13 M36 11 L41 5 L46 11 M54 5 L59 11 L64 5"/>'],
    circle: ['16', '<circle cx="8" cy="8" r="5.2"/>']
  }
  const markPicture = (key) => {
    const [width, shapes] = MARK_PICTURES[key]
    return `<svg width="${width}" height="16" viewBox="0 0 ${width} 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`
  }

  function offNote (off) {
    if (!off.length) return ''
    return `<div class="${NOTE}">Off because SudokuPad changed: ${off.join(', ')}</div>`
  }

  function missingNote (missing) {
    if (!missing.length) return ''
    const list = (missing.length === 1 ? 'pen color ' : 'pen colors ') + missing.join(', ')
    return `<div class="${NOTE}">The current cell color page has no usable color at the matching button, so ${list} keep${missing.length === 1 ? 's' : ''} SudokuPad's own.</div>`
  }

  const sectionHeading = (text) => `${DIVIDER}<div class="${SECTION_TITLE}">${text}</div>`

  // Class names the editor's markup and its rules (`DIALOG_CSS`) share.
  const NOTE = 'pen-tool-extras-note'
  const SECTION_TITLE = 'pen-tool-extras-section-title'
  const DIVIDER = '<div class="pen-tool-extras-divider"></div>'
  const SLIDER_COLUMNS = 'pen-tool-extras-columns'
  const COLUMN_HEADING = 'pen-tool-extras-column-heading'

  const DIALOG_CLASS = 'pen-tool-extras-dialog'

  // Scoped by DIALOG_CLASS, so SudokuPad's other dialogs are left alone.
  const DIALOG_CSS = [
    `.dialog-options.${DIALOG_CLASS} { display: flex !important; flex-direction: row !important; align-items: center; gap: 10px; justify-content: flex-end; border-top: 1px solid #e3dff0; padding: 14px 4px 2px; margin-top: 8px; box-sizing: border-box; width: 100%; }`,
    `.dialog-options.${DIALOG_CLASS} button { width: auto !important; min-width: 0 !important; margin: 0 !important; padding: 0 22px !important; height: 38px !important; line-height: 36px !important; border-radius: 8px !important; font-size: 1rem !important; flex: none; }`,
    `.dialog-options.${DIALOG_CLASS} button[data-role="save"] { background: ${PANEL_COLOR} !important; color: #fff !important; border: 1px solid #5a3489 !important; font-weight: 600; }`,
    `.dialog-options.${DIALOG_CLASS} button[data-role="cancel"] { background: #f1eff5 !important; color: #333 !important; border: 1px solid #cfc9db !important; }`,
    `.dialog-options.${DIALOG_CLASS} button[data-role="restore"] { margin-right: auto !important; background: none !important; border: none !important; color: #777 !important; padding: 0 4px !important; font-size: 0.85rem !important; text-decoration: underline; text-underline-offset: 3px; }`,
    `#${EDITOR_ID} .${NOTE} { margin: 6px 0; max-width: 20em; }`,
    `#${EDITOR_ID} .${SECTION_TITLE} { font-weight: 600; margin-top: 10px; }`,
    `#${EDITOR_ID} .pen-tool-extras-pen-title { font-weight: 600; }`,
    `#${EDITOR_ID} .pen-tool-extras-divider { border-top: 1px solid #e3dff0; margin: 12px 0 0; }`,
    // The slider rows share four columns, so the sliders of Line settings, Line styles and the outline line up. The first two shrink on a narrow dialog.
    `#${EDITOR_ID} .${SLIDER_COLUMNS} { display: grid; grid-template-columns: minmax(6em, 12.5em) minmax(5em, 11em) 2em 6.2em; column-gap: 8px; align-items: center; margin: 4px 0; }`,
    `#${EDITOR_ID} .${SLIDER_COLUMNS}.pen-tool-extras-style-block { margin-bottom: 0; }`,
    `#${EDITOR_ID} .${SLIDER_COLUMNS}.pen-tool-extras-heading-row { margin: 10px 0 4px; }`,
    `#${EDITOR_ID} .pen-tool-extras-span { grid-column: 1 / 4; }`,
    `#${EDITOR_ID} .pen-tool-extras-heading-row .pen-tool-extras-span { font-weight: 600; }`,
    `#${EDITOR_ID} .${COLUMN_HEADING} { font-size: .8rem; color: #666; font-weight: 400; justify-self: center; white-space: nowrap; }`,
    `#${EDITOR_ID} .pen-tool-extras-label { width: auto; text-align: left; margin: 0; }`,
    `#${EDITOR_ID} .pen-tool-extras-label.pen-tool-extras-under { padding-left: 1.2em; color: #444; box-sizing: border-box; }`,
    `#${EDITOR_ID} .pen-tool-extras-range { width: 100%; min-width: 0; margin: 0; }`,
    `#${EDITOR_ID} .pen-tool-extras-box { margin: 0; justify-self: center; }`,
    `#${EDITOR_ID} .pen-tool-extras-check { margin: 0; }`,
    `#${EDITOR_ID} .pen-tool-extras-check-row { margin: 4px 0; display: flex; justify-content: flex-start; align-items: center; gap: 6px; }`,
    `#${EDITOR_ID} .pen-tool-extras-pen { display: flex; align-items: center; gap: 8px; }`,
    `#${EDITOR_ID} .pen-tool-extras-pen b { width: 1.2em; text-align: right; }`,
    `#${EDITOR_ID} .pen-tool-extras-pen-grid { display: grid; grid-template-columns: repeat(3, max-content); gap: 6px 18px; margin: 4px 0; }`,
    `#${EDITOR_ID} [data-colors-row] { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; }`,
    `#${EDITOR_ID} .pen-tool-extras-mark { display: flex; align-items: center; gap: 6px; margin: 0; width: auto; }`,
    `#${EDITOR_ID} .pen-tool-extras-marks-table { display: grid; grid-template-columns: max-content repeat(3, max-content); column-gap: 28px; row-gap: 6px; align-items: center; margin: 4px 0; }`,
    `#${EDITOR_ID} .pen-tool-extras-mark-head { font-size: .85rem; color: #666; }`,
    `#${EDITOR_ID} [data-sudokupad-colors] { font-size: inherit; white-space: nowrap; background: #f1eff5 !important; color: #333 !important; border: 1px solid #cfc9db !important; border-radius: 8px !important; padding: 0 14px !important; height: 34px !important; line-height: 32px !important; margin: 0 !important; font-weight: 500; text-align: center; }`,
    `#${EDITOR_ID} select[data-line-mode] { margin: 4px 0; font-size: 1rem; padding: 4px 28px 4px 10px; border: 1px solid #b9b0c9; border-radius: 6px; appearance: none; color: #222; background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b4fa0'/%3E%3C/svg%3E") no-repeat right 10px center; }`
  ].join('\n')

  // Its values are drafts that take effect on Save, so the panel's sliders and these agree when the dialog opens.
  function renderEditor (state) {
    const cells = PEN_COLOR_NUMBERS.map((n) =>
      '<div class="pen-tool-extras-pen">' +
      `<b>${n}</b>` +
      `<input type="color" data-pen="${n}" value="${state.colors[n]}"></div>`
    ).join('')
    const grid = `<div class="pen-tool-extras-pen-grid">${cells}</div>`
    const colorsRow = `<div data-colors-row>${grid}` +
      '<button type="button" data-sudokupad-colors>SudokuPad colors</button></div>'
    // A box with no word label carries its name as its accessible name and hover title.
    const markBox = (key, name, picture) =>
      `<label title="${name}" class="pen-tool-extras-mark">` +
      `<input type="checkbox" id="pen-tool-extras-mark-${key}" data-mark="${key}" aria-label="${name}" title="${name}"${state.marks[key] ? ' checked' : ''}>` +
      `${markPicture(picture)}</label>`
    const box = (attributes, checked, title) => `<input type="checkbox" ${attributes}${checked ? ' checked' : ''}${title ? ` title="${title}"` : ''} class="pen-tool-extras-box">`
    const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    const flagBox = (name, flagName, extra = '') =>
      box(`id="pen-tool-extras-${boxAttribute(name)}-${flagName}" data-${boxAttribute(name)}="${flagName}"${extra}`, state[name][flagName], SETTINGS[name].dialog.title)
    const sliderRow = (key) => {
      const { range, dialog: { label, under, box } } = SETTINGS[key]
      const value = state[key]
      return `<div data-row="${key}" class="${SLIDER_COLUMNS}"${!under || boxValue(state, under) ? '' : ' style="display:none"'}>` +
        `<label for="pen-tool-extras-setting-${key}" class="pen-tool-extras-label${under ? ' pen-tool-extras-under' : ''}">${label}</label>` +
        `<input type="range" data-setting="${key}" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}" id="pen-tool-extras-setting-${key}" class="pen-tool-extras-range">` +
        `<output data-readout="${key}">${value}</output>${box ? flagBox(box, key) : '<span></span>'}</div>`
    }
    const rowsUnder = (path) => SETTING_NAMES.filter((name) => SETTINGS[name].dialog.under === path).map(sliderRow).join('')
    const labelled = (name) => '<div class="pen-tool-extras-check-row">' +
      `<input type="checkbox" id="pen-tool-extras-${kebab(name)}" data-${kebab(name)}${state[name] ? ' checked' : ''} class="pen-tool-extras-check">` +
      `<label for="pen-tool-extras-${kebab(name)}" class="pen-tool-extras-label">${SETTINGS[name].dialog.label}</label></div>`
    const styleBlock = (name, flagName, text) =>
      `<div class="${SLIDER_COLUMNS} pen-tool-extras-style-block"><span class="pen-tool-extras-span">${text}</span>` +
      `${flagBox(name, flagName, ` aria-label="Enable ${text}"`)}</div>`
    const settingRows = (name) => {
      const { range, dialog: { labels } } = SETTINGS[name]
      if (range) return sliderRow(name)
      if (labels) return Object.entries(labels).map(([flagName, text]) => styleBlock(name, flagName, text) + rowsUnder(`${name}.${flagName}`)).join('')
      return labelled(name) + rowsUnder(name)
    }
    const sectionRows = (section) => SETTING_NAMES.filter((name) => SETTINGS[name].dialog.section === section).map(settingRows).join('')
    const heading = (text, caption) =>
      DIVIDER + `<div class="${SLIDER_COLUMNS} pen-tool-extras-heading-row"><span class="pen-tool-extras-span">${text}</span>` +
      `<span class="${COLUMN_HEADING}">${caption || ''}</span></div>`
    const markRow = (label, cellsMarkup) => `<div>${label}</div>${cellsMarkup}`
    const columnHead = (text) => `<div class="pen-tool-extras-mark-head">${text}</div>`
    const marksTable = '<div class="pen-tool-extras-marks-table">' +
      '<div></div>' + columnHead('X Mark') + columnHead('Circle') + columnHead('Directions') +
      markRow('Edge', markBox('x', 'Edge X Mark', 'x') + markBox('circle', 'Edge Circle', 'circle') + markBox('directions', 'Edge Directions', 'directions')) +
      markRow('Corner', markBox('cornerX', 'Corner X Mark', 'x') + markBox('cornerCircle', 'Corner Circle', 'circle') + '<div></div>') +
      '</div>'
    return offNote(state.off) + '<div class="pen-tool-extras-pen-title">Pen colors</div>' + colorsRow +
      missingNote(state.missing) +
      heading('Line settings', 'Slider in panel') + sectionRows('Line settings') +
      heading('Line styles', 'Enable') + sectionRows('Line styles') +
      sectionHeading('Marks a click cycles through') + marksTable +
      sectionHeading('Other') + sectionRows('Other') +
      lineModeChoice(state.lineMode)
  }

  // The events that end a press. SudokuPad's pen tool takes its click from `mouseup` (seen live), and
  // a touch ends with `pointerup`, `touchend` and a compatibility `mouseup`, so all four are swallowed.
  const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'mouseup', 'touchend']

  // The next press ends the swallowing even when no release came (a close from the keyboard).
  function swallowRelease () {
    const swallow = (event) => event.stopImmediatePropagation()
    const stop = () => {
      RELEASE_EVENTS.forEach((type) => window.removeEventListener(type, swallow, true))
      window.removeEventListener('pointerdown', stop, true)
    }
    RELEASE_EVENTS.forEach((type) => window.addEventListener(type, swallow, true))
    window.addEventListener('pointerdown', stop, true)
  }

  // SudokuPad runs a dialog button's handler on the press and removes the dialog at once, so the release lands on the grid and the pen tool takes it for a click on the cell under the button.
  function closeDialogKeepingGrid () {
    Framework.closeDialog()
    swallowRelease()
  }

  // SudokuPad also closes a dialog on a press on its overlay, which covers the page. The grid never
  // saw that press, so the release would mark the cell of the pointer's last position on the grid.
  // The overlay of this script's own dialog is told apart by the editor inside it.
  function installOverlayPressSwallow () {
    window.addEventListener('pointerdown', (event) => {
      const target = event.target
      if (target.classList && target.classList.contains('dialog-overlay') && target.querySelector(`#${EDITOR_ID}`)) swallowRelease()
    }, true)
  }

  // A dialog whose buttons are not the three of this one's is left with SudokuPad's own stacked buttons.
  function arrangeButtons (editor) {
    const dialog = editor.closest('.dialog')
    const options = dialog && dialog.querySelector('.dialog-options')
    if (!options) return
    const roles = { Save: 'save', Cancel: 'cancel', 'Restore defaults': 'restore' }
    const byRole = {}
    options.querySelectorAll('button').forEach((button) => {
      const role = roles[button.textContent.trim()]
      if (!role) return
      byRole[role] = button
      button.dataset.role = role
    })
    if (Object.keys(byRole).length !== Object.keys(roles).length) return
    options.classList.add(DIALOG_CLASS)
    options.replaceChildren(byRole.restore, byRole.cancel, byRole.save)
  }

  function openDialog () {
    let colors = { ...active }
    let missing = activeMissing
    let reset = false
    // Only colors picked by hand are saved, so a derived set is never saved by accident.
    const edited = new Set()
    let lineMode = currentLineMode()
    let draft = { ...inForce }
    let box = null
    const draw = () => {
      box.innerHTML = renderEditor({ colors, missing: missing.filter((n) => !edited.has(String(n))), lineMode, ...draft, off: skipped })
    }
    const restoreDefaults = () => {
      const tool = readyColorTool()
      const derived = (tool && steps.colors.run(() => deriveFromTool(tool), () => null)) || { colors: { ...SUDOKUPAD_PEN_COLORS }, missing: [] }
      colors = derived.colors
      missing = derived.missing
      edited.clear()
      reset = true
      // The sliders and boxes are drafts like the colors: Cancel leaves what is in force. The mark boxes keep their draft: Restore defaults has never reset the edge and corner cycles.
      draft = { ...settingDefaults(), marks: draft.marks }
      draw()
    }
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: `<b>Pen tool extras</b> <small style="opacity:.6">v${VERSION}</small>` },
        { tag: 'text', innerHTML: `<div id="${EDITOR_ID}"></div>` },
        {
          tag: 'options',
          options: [
            {
              tag: 'button',
              content: 'Save',
              handler: () => {
                if (reset || edited.size) {
                  if (reset) Framework.removeData(COLORS_KEY)
                  else Framework.setData(COLORS_KEY, colors)
                  adoptColors(colors, edited.size ? [] : missing)
                }
                saveSettings(draft)
                if (lineMode !== undefined && lineMode !== currentLineMode()) steps.penPanel.run(() => applyLineMode(lineMode))
                closeDialogKeepingGrid()
              }
            },
            { tag: 'button', content: 'Cancel', handler: closeDialogKeepingGrid },
            { tag: 'button', content: 'Restore defaults', handler: restoreDefaults }
          ]
        }
      ]
    })
    box = document.getElementById(EDITOR_ID)
    if (!box) throw new Error('pen-tool-extras: the dialog has no editor element')
    const showRows = () => SETTING_NAMES.filter((name) => SETTINGS[name].dialog.under).forEach((name) => {
      box.querySelector(`[data-row="${name}"]`).style.display = boxValue(draft, SETTINGS[name].dialog.under) ? 'grid' : 'none'
    })
    draw()
    arrangeButtons(box)
    // `change` fires when a color picker closes (the swatch the user sees is already the new color), when a mark box or a slider box is ticked and when the line mode is chosen.
    box.addEventListener('input', (event) => {
      const el = event.target.closest('input[type="range"]')
      if (!el) return
      const value = Number(el.value)
      if (!SETTINGS[el.dataset.setting]) throw new Error(`pen-tool-extras: the dialog has no slider named ${el.dataset.setting}`)
      draft[el.dataset.setting] = value
      box.querySelector(`output[data-readout="${el.dataset.setting}"]`).textContent = String(value)
    })
    // As if each had been picked by hand: Save keeps them as the user's colors. It closes nothing, so the release of its press lands on the dialog.
    box.addEventListener('click', (event) => {
      if (!event.target.closest('button[data-sudokupad-colors]')) return
      colors = { ...SUDOKUPAD_PEN_COLORS }
      PEN_COLOR_NUMBERS.forEach((n) => edited.add(n))
      reset = false
      draw()
    })
    box.addEventListener('change', (event) => {
      const mode = event.target.closest('select[data-line-mode]')
      if (mode) {
        lineMode = normalizeLineMode(mode.value)
        return
      }
      const ticked = event.target.closest('input[type="checkbox"]')
      if (ticked) {
        const next = draftWithBox(draft, ticked.dataset, ticked.checked)
        if (!next) throw new Error(`pen-tool-extras: the dialog box ${ticked.id} is in no table row`)
        draft = next
        showRows()
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

  // A page without the button (the pen tool is off, or the controls are not built yet) gets none.
  function syncGear () {
    steps.gear.run(() => {
      const button = document.querySelector(GEAR_BUTTON)
      if (button && !button.querySelector(`.${GEAR_CLASS}`)) button.insertAdjacentHTML('beforeend', GEAR_MARKUP)
    })
  }

  // SudokuPad runs a tool button's action on the press and cancels the touch events of a tap, which stops the browser sending the click. A press
  // or touch on the gear is kept from SudokuPad's handlers (the capture phase on the window runs before the document's and the button's own); the
  // click then opens the dialog and selects nothing.
  function installGear () {
    const onGear = (event) => event.target.closest && event.target.closest(`.${GEAR_CLASS}`)
    ;['mousedown', 'touchstart', 'touchend', 'pointerdown'].forEach((type) => {
      window.addEventListener(type, (event) => { if (onGear(event)) event.stopPropagation() }, true)
    })
    window.addEventListener('click', (event) => {
      if (!onGear(event)) return
      event.stopPropagation()
      openDialog()
    }, true)
    // SudokuPad builds its controls after Start Puzzle and can rebuild them, so the gear is put back whenever it is missing.
    new window.MutationObserver(syncGear).observe(document.body, { childList: true, subtree: true })
    syncGear()
  }

  // 11. Startup: the test exports, the Framework guard and Framework.getApp()
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, SETTINGS, draftWithBox, slider, flag, flags, isPlainObject, isHexColor, inRange, settingDefaults, readSettings, changedSettings, saveSetting, saveChangedSettings, effectsOf, normalizeColors, savedColors, editedColors, parseColor, isTransparent, darkenColor, derivedPenColors, buildCss, buildThicknessCss, buildOpacityCss, buildOutlineCss, renderOutlineFilter, OUTLINE_FILTER_ID, OUTLINE_WIDTH, ARROW_SPACING, enabledPages, stepEnabledPage, pageAfterSave, MARK_VALUES, MARKS_LAYER_ID, PEN_PAGES, LINE_VALUES, directionCharOf, arrowLineWayOf, ARROW_LINE, lineSegment, splitLineActs, linePoints, lineIdentityOf, segmentNear, connectedLine, eraseLineActs, LINE_HIT_RADIUS, arrowLine, penPageOf, penNumber, penCharOn, normalizePen, wrapIndex, normalizeLineMode, LINE_MODES, buildPagesCss, renderPageIcon, renderPanelSliders, renderEditor, DIALOG_CSS, lackingInternals, markGrowthScale, DASH, normalizeMarkSettings, stepType, edgeMidpoint, addedMark, arrowLineOf, isEdgeActs, penValuesOf, planActs, lineSegmentsOf, planClick, planCornerClick, cornerAt, cornerStorage, cornerPoint, cornerMarkOf, shapeOf, shapePath, EDGE_CYCLE, CORNER_RADIUS, CORNER_VALUES, SUDOKUPAD_PEN_COLORS, THICKNESS, OPACITY, FULL_WIDTH_VALUES, LIGHTNESS_FACTOR, GREY_CHROMA, COLOR_TOOL_WAIT_MS, HOLD_TO_EDIT_MS, createStep, STEP_LABELS }
  }
  // A page with no Framework is not SudokuPad (the match covers other pages of crackingthecryptic.com); a Framework without `getApp` is one this script cannot hook, which is reported.
  if (typeof Framework === 'undefined') return
  if (!Framework.getApp) {
    console.warn('pen-tool-extras: SudokuPad\'s Framework has no getApp, so nothing was changed')
    return
  }

  Framework.getApp().then(async () => {
    const app = Framework.app
    // Read before the panel is built, which the first sync does with the pen tool already on.
    Object.assign(inForce, readSettings(Framework))
    checkSteps(app)
    trackButton()
    steps.lineErase.run(() => installLineErase(app, ToolPen.tool))
    steps.arrowLines.run(() => installArrowLines(app, ToolPen.tool))
    steps.marks.run(() => installMarks(app, ToolPen.tool))
    steps.pages.run(() => installPenPages(ToolPen.tool))
    steps.dragHint.run(() => installHintLayer(ToolPen.tool))
    steps.colors.run(installHoldToEdit)
    steps.penPanel.run(installPenPanel)
    steps.gear.run(installGear)
    installOverlayPressSwallow()
    effectsOf(SETTING_NAMES).forEach((effect) => effect())
    applyStyle()
    Framework.addSetting({
      tag: 'button',
      name: 'pentoolextras',
      group: SETTINGS_GROUP,
      content: 'Pen tool extras',
      handler: () => {
        closeDialogKeepingGrid()
        setTimeout(openDialog, 0)
      }
    })
    const saved = savedColors(Framework.getData(COLORS_KEY))
    if (saved) {
      adoptColors(saved, [])
      return
    }
    // Nothing saved: the pen takes the darkened current color page, read once at load. When
    // the color tool never becomes ready, SudokuPad's own pen colors stay in force.
    if (steps.colors.off) return
    const tool = await waitForColorTool()
    // A save made in the dialog while waiting outranks the derived colors.
    if (savedColors(Framework.getData(COLORS_KEY))) return
    if (!tool) {
      console.warn(`pen-tool-extras: the color tool was not ready after ${COLOR_TOOL_WAIT_MS / 1000} s, so the pen keeps SudokuPad's own colors`)
      return
    }
    const derived = steps.colors.run(() => deriveFromTool(tool), () => null)
    if (derived) adoptColors(derived.colors, derived.missing)
  })
})()
