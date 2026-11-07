// ==UserScript==
// @name         SudokuPad Pen Tool Extras
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      1.24.1
// @description  Adds to SudokuPad's pen tool: customizable pen colors, dashed and arrow lines, and marks on cell edges and grid corners. Turn the pen tool on in SudokuPad's settings first.
// @homepageURL  https://caneff.github.io/sudokupad-scripts/pen-tool-extras.html
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
  const VERSION = '1.24.1'
  const SETTINGS_GROUP = 'experimental'
  const STYLE_ID = 'pen-tool-extras-style'
  const GRID_SELECTOR = '#svgrenderer'
  const PEN_LAYER = '#cell-pen'
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
  const MIDDLE_BUTTON = 1
  const PEN_COLOR_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  // SudokuPad draws free lines, the cell circle and the cross 5 wide (in cell units, a cell being 64) and the edge X 2.5 wide. The slider's value is the first width
  // and everything else scales with it.
  const THICKNESS = { min: 1, max: 16, step: 0.5, fallback: 5 }
  // A page 2 dash's length in line widths; 0 draws dots.
  const DASH = { min: 0, max: 8, step: 1, fallback: 3 }
  // Scales the distance between two page 3 arrows' middles (see `arrowGapOf`); 5 gives a run of arrows rather than a solid row.
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

  // Any multiple of the step from the minimum; counted in steps rather than by a remainder, which a fractional step would leave inexact.
  function inRange (value, range) {
    return typeof value === 'number' && value >= range.min && value <= range.max && Number.isInteger((value - range.min) / range.step)
  }

  // Data saved before a name existed reads as true.
  function decodeFlags (names, data) {
    const saved = isPlainObject(data) ? data : {}
    return Object.fromEntries(names.map((name) => [name, saved[name] !== false]))
  }

  const doNothing = () => {}

  // `effect` runs once `inForce` holds the new value; the style is written after the effects, so an effect need not.
  function slider (key, range, effect, dialog) {
    return { key, fallback: range.fallback, normalize: (data) => inRange(data, range) ? data : range.fallback, accepts: (data) => inRange(data, range), effect, range, dialog }
  }

  function flag (key, effect = doNothing, dialog) {
    return { key, fallback: true, normalize: (data) => data !== false, accepts: (data) => typeof data === 'boolean', effect, dialog }
  }

  function flags (key, names, effect, dialog, normalize = (data) => decodeFlags(names, data)) {
    const accepts = (data) => isPlainObject(data) && Object.keys(data).length > 0 && Object.entries(data).every(([name, value]) => names.includes(name) && typeof value === 'boolean')
    return { key, fallback: decodeFlags(names), normalize, accepts, effect, dialog }
  }

  // The line mode is saved its own way. A row `under` a box is hidden while that box is unticked.
  const SETTINGS = {
    thickness: slider('PenColor_thickness', THICKNESS, adoptThickness, { label: 'Thickness', section: 'Line settings', box: 'show' }),
    opacity: slider('PenColor_opacity', OPACITY, adoptOpacity, { label: 'Opacity (%)', section: 'Line settings', box: 'show' }),
    dash: slider('PenColor_dash', DASH, syncPenPanel, { label: 'Dash length', under: 'lineStyles.dashed' }),
    arrowSpacing: slider('PenColor_arrowspacing', ARROW_SPACING, adoptArrowSpacing, { label: 'Arrow spacing', under: 'lineStyles.arrows' }),
    outlineWidth: slider('PenColor_outlinewidth', OUTLINE_WIDTH, adoptOutline, { label: 'Outline width', under: 'outline' }),
    outline: flag('PenColor_outline', adoptOutline, { label: 'White outlines', section: 'Other' }),
    middleErase: flag('PenColor_middleerase', doNothing, { label: 'Middle click erase', section: 'Other' }),
    lineStyles: flags('PenColor_linestyles', ['dashed', 'arrows'], adoptLineStyles,
      { section: 'Line styles', labels: { dashed: 'Dashed lines', arrows: 'Directional arrow lines' } }),
    show: flags('PenColor_sliders', ['thickness', 'opacity'], adoptShow, { title: 'Show this slider in the pen panel' }),
    // The marks table is built by hand in the dialog, so this row has no section.
    marks: flags('EdgeMarks_marks', ['x', 'directions', 'circle', 'cornerX', 'cornerCircle'], doNothing, {}, normalizeMarkSettings)
  }
  const SETTING_NAMES = Object.keys(SETTINGS)

  // A dialog box and a row `under` one name a setting by its path: `<setting>` for a flag, `<setting>.<flag>` for one of a set of flags.
  const boxValue = (state, path) => path.split('.').reduce((value, name) => value[name], state)

  function draftWithBox (draft, path, checked) {
    const [name, flagName, ...rest] = path.split('.')
    const fallback = Object.hasOwn(SETTINGS, name) ? SETTINGS[name].fallback : undefined
    const known = rest.length === 0 && (flagName === undefined ? typeof fallback === 'boolean' : isPlainObject(fallback) && Object.hasOwn(fallback, flagName))
    if (!known) throw new Error(`pen-tool-extras: the dialog box path "${path}" names no box of the settings table`)
    return { ...draft, [name]: flagName === undefined ? checked : { ...draft[name], [flagName]: checked } }
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
    penPanel: 'pen panel'
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
    })
  }
  const inForce = settingDefaults()

  // SudokuPad calls `clickCell` on the release, with no event, so the button is read from the pointer events before it.
  let lastButton = 0

  function trackButton () {
    const remember = (event) => { lastButton = event.button }
    window.addEventListener('pointerdown', remember, true)
    window.addEventListener('pointerup', remember, true)
  }

  // `holds` is asked of each pen stroke of a cell, as [value, color character].
  function redrawCells (holds) {
    Framework.app.puzzle.cells.forEach((cell) => {
      if ((cell.pen || []).some(holds)) cell.renderContent(true)
    })
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
      buildCss(active.colors),
      buildThicknessCss(inForce.thickness),
      buildOpacityCss(inForce.opacity),
      buildOutlineCss(inForce.outline),
      buildPagesCss(inForce.thickness, inForce.dash),
      EDIT_CSS,
      DIALOG_CSS,
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
  const HEX_COLOR = /^#[0-9a-f]{6}$/i
  // A pen color preset's id is saved beside the colors under `preset`; a set with none, or one not in SAVED_PRESETS, is Custom. One page preset per cell color page, up
  // to three, then SudokuPad's own colors. UNSAVED is SudokuPad's own colors before the install save, never saved.
  const PAGE_PRESETS = ['page-1', 'page-2', 'page-3']
  const SUDOKUPAD_PRESET = 'sudokupad'
  const SAVED_PRESETS = [...PAGE_PRESETS, SUDOKUPAD_PRESET]
  const CUSTOM = 'custom'
  const UNSAVED = 'unsaved'
  const PRESET_LABELS = {
    'page-1': 'Darker page 1',
    'page-2': 'Darker page 2',
    'page-3': 'Darker page 3',
    [SUDOKUPAD_PRESET]: 'SudokuPad colors',
    [CUSTOM]: 'Custom',
    [UNSAVED]: 'SudokuPad (unsaved)'
  }
  // The share of its OKLCH lightness a cell color keeps as a pen color: low enough to read against cell colors drawn at 60% opacity, high enough that the
  // lightest still show as 5px lines on white and the nine stay apart.
  const LIGHTNESS_FACTOR = 0.75
  // The OKLCH chroma under which a darkened color counts as grey: SudokuPad's greys are 0, a tinted dark grey such as rgb(10, 20, 30) is about 0.024, and the
  // least saturated darkened default colors are above 0.08.
  const GREY_CHROMA = 0.04
  const COLOR_TOOL_POLL_MS = 100
  // SudokuPad's color tool holds its cell color buttons for the same 1000 ms (HoldToEditDelayMs).
  const HOLD_TO_EDIT_MS = 1000
  const isHexColor = (value) => typeof value === 'string' && HEX_COLOR.test(value)

  // A pen color set is `{ colors, preset, missing }`: the nine colors, the preset they came from, and the pens of that page with no usable color, which keep SudokuPad's own.
  const SUDOKUPAD_SET = Object.freeze({ colors: SUDOKUPAD_PEN_COLORS, preset: SUDOKUPAD_PRESET, missing: Object.freeze([]) })

  // null when nothing usable is saved, which means the install save is still owed. A bad entry beside a usable one keeps SudokuPad's own color.
  function readPenColors (data) {
    if (!isPlainObject(data) || !PEN_COLOR_NUMBERS.some((n) => isHexColor(data[n]))) return null
    const colors = Object.fromEntries(PEN_COLOR_NUMBERS.map((n) => [n, isHexColor(data[n]) ? data[n].toLowerCase() : SUDOKUPAD_PEN_COLORS[n]]))
    return { colors, preset: SAVED_PRESETS.includes(data.preset) ? data.preset : CUSTOM, missing: [] }
  }

  // The colors stay under keys 1 to 9, where older versions read them.
  function storedPenColors ({ colors, preset }) {
    return preset === CUSTOM ? { ...colors } : { ...colors, preset }
  }

  // A table passes when it holds a usable color and every pen color it holds is one: `readPenColors` would keep SudokuPad's own color for a bad entry.
  const readPastedColors = (data) => {
    const set = readPenColors(data)
    return set && PEN_COLOR_NUMBERS.every((n) => !(n in data) || isHexColor(data[n])) ? storedPenColors(set) : undefined
  }

  const READERS = {
    ...Object.fromEntries(SETTING_NAMES.map((name) => [SETTINGS[name].key, (data) => (SETTINGS[name].accepts(data) ? SETTINGS[name].normalize(data) : undefined)])),
    [COLORS_KEY]: readPastedColors
  }
  // Every setting at the value in force, defaults included, so a paste can put one back to its default; the pen colors only once they are saved.
  function copiedSettings (store) {
    const settings = readSettings(store)
    const copied = Object.fromEntries(SETTING_NAMES.map((name) => [SETTINGS[name].key, settings[name]]))
    const colors = readPenColors(store.getData(COLORS_KEY))
    if (colors) copied[COLORS_KEY] = storedPenColors(colors)
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
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('the clipboard text is not a settings object')
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

  // Only the install save (`wait`, then page 1 darkened, or `save` with no color tool at all) changes the colors without the user.
  function startupPenColors (data, hasColorTool) {
    const saved = readPenColors(data)
    if (saved) return { load: saved }
    return hasColorTool ? { wait: true } : { save: SUDOKUPAD_SET }
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

  function presetOptions (pageCount) {
    return [...PAGE_PRESETS.slice(0, pageCount), SUDOKUPAD_PRESET]
  }

  // `pages` is the palette's pages of color keys, and `readColor` reads a key's color as CSS text.
  function presetColors (preset, pages, readColor) {
    if (preset === SUDOKUPAD_PRESET) return SUDOKUPAD_SET
    const page = presetOptions(pages.length).indexOf(preset)
    if (page === -1) throw new RangeError(`pen-tool-extras: ${preset} is not a preset of this palette`)
    return { ...derivedPenColors(pages[page], readColor), preset }
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
    // The panel is a grid, so a picker in the flow would take a cell: it is absolute and fills its button's cell, which `PANEL_CSS` names.
    `.${EDITING} .${PICKER} { position: absolute; inset: 0; z-index: 10; }`,
    `.${EDITING} .${PICKER} input { position: absolute; inset: 0; margin: auto; width: 2.4rem; height: 2.4rem; pointer-events: all; }`
  ].join('\n')
  // A right-click hold ends over a picker in edit mode, and Windows opens the context menu on release, so it is suppressed over the pickers as well as the buttons.
  const HOLD_TARGETS = `.tool-pen button[data-value], .tool-pen .${PICKER} input`

  // The set in force. Until the install save it is SudokuPad's own, which is what the page shows with no override.
  let active = { ...SUDOKUPAD_SET, preset: UNSAVED }
  // The page preset the set in force came from: a hand edit in the dialog makes the set Custom and keeps its missing pens, whose page the note still names.
  let activePickedPreset = active.preset

  // `init` assigns the page and sets the `--cell-color-<key>` variables in one synchronous step, so a palette on the tool means the variables are set too (the stylesheet's own
  // values for them exist earlier and say nothing about a custom palette).
  function readyColorTool () {
    const tool = Framework.app && Framework.app.tools && Framework.app.tools.colour
    const palette = tool && tool.palette
    const ready = palette && Array.isArray(palette.pages) && Array.isArray(palette.pages[0])
    return ready ? tool : null
  }

  // No time limit: the install save is page 1 darkened, and until then the pens show SudokuPad's own colors.
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

  // The page presets the palette in force offers, and SudokuPad's own colors, which need no color tool.
  const availablePresets = () => {
    const tool = steps.colors.off ? null : readyColorTool()
    return presetOptions(tool ? tool.palette.pages.length : 0)
  }

  // The raw `--cell-color-<key>` values, not the 60% opacity they show with on the grid. A custom palette can hold any CSS color (`#f00`, `red`, `hsl()`), and the variable
  // reads back as written, so each value goes through the browser to become `rgb()` text first. A value the browser rejects stays as written, and `derivedPenColors` treats it as unreadable.
  // SudokuPad sets the variable of every key in the palette, so any page reads, not only the current one.
  function presetFromTool (tool, preset) {
    const root = document.documentElement
    const rootStyle = window.getComputedStyle(root)
    const probe = document.createElement('span')
    root.appendChild(probe)
    try {
      return presetColors(preset, tool.palette.pages, (key) => {
        const value = rootStyle.getPropertyValue(`--cell-color-${key}`).trim()
        probe.style.color = ''
        probe.style.color = value
        return probe.style.color ? window.getComputedStyle(probe).color : value
      })
    } finally {
      probe.remove()
    }
  }

  function adoptColors (set, pickedPreset = set.preset) {
    active = set
    activePickedPreset = pickedPreset
    applyStyle()
    document.querySelectorAll(`.${PICKER} input`).forEach((el) => { el.value = set.colors[el.dataset.pen] })
  }

  function saveColors (set, pickedPreset) {
    Framework.setData(COLORS_KEY, storedPenColors(set))
    adoptColors(set, pickedPreset)
  }

  function savePenColor (pen, value) {
    saveColors({ colors: editedColors(active.colors, pen, value), preset: CUSTOM, missing: [] })
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
        `<div class="${PICKER}" data-pen="${PEN_COLOR_NUMBERS[i]}"><input type="color" data-pen="${PEN_COLOR_NUMBERS[i]}" value="${active.colors[PEN_COLOR_NUMBERS[i]]}"></div>`)
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

  // A pen on a page that Save turns off goes back to its page 1 pen, whose character is its pen number.
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
    const rules = PEN_PAGES.flatMap((page, index) => PEN_COLOR_NUMBERS.map((n) => swatchRule(n, index + 1, pageSwatch(page, dash, 0))))
    PEN_PAGES.forEach((page, index) => {
      if (index === 0) return
      page.chars.forEach((char, i) => [char, ...(page.reverse ? [page.reverse[i]] : [])].forEach((c) => {
        rules.push(`.pencolor-${c} { stroke: var(--puzzle-pencolor-${PEN_COLOR_NUMBERS[i]}); }`)
        // A line is stroked and an arrow is filled, in the same color: the arrows' path has no stroke of its own.
        if (page.arrowLines) rules.push(`:root:root .pencolor-${c} [data-arrow-line-part='arrows'] { fill: var(--puzzle-pencolor-${PEN_COLOR_NUMBERS[i]}); stroke: none; }`)
      }))
      if (!page.dashed) return
      const colors = `:is(${page.chars.map((char) => `.pencolor-${char}`).join(',')})`
      const lines = (values, length) => `:root:root .cell-pen:is(${values.map((v) => `.pen-${v}`).join(',')})${colors} { ${dashDeclarations(thickness, dash, length)} }`
      rules.push(lines(ORTHOGONAL_LINES, CELL_UNITS), lines(DIAGONAL_LINES, CELL_UNITS * Math.SQRT2))
    })
    return rules.join('\n')
  }

  // The slant is atan(28 / 40), the rise over the run of the line the button first showed. Under the line is a dot for each enabled page with the current one filled, as SudokuPad's color tool's page button has.
  const PAGE_BUTTON_ANGLE = 35
  // The viewBox of the icon that shows each page's style (the page the button turns to), drawn 34 px on its longest side and centred on its ink: see MODE_ICON_VIEWBOX.
  const PAGE_ICON_VIEWBOX = ['0.09 -2.31 24.352 24.352', '0 -2.5 24.6 24.6', '0.12 -2.18 24.352 24.352']
  function renderPageIcon (current, dash, styles) {
    const next = stepEnabledPage(current, 1, styles)
    const pages = enabledPages(styles)
    const dots = pages.map((page, i) =>
      `<circle cx="${20 - 3 * (pages.length - i - 1)}" cy="3" r="1.1" data-page-dot="${page === current ? 'filled' : 'outline'}"${page === current ? '' : ' fill="none"'}/>`)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="${PAGE_ICON_VIEWBOX[next]}">` +
      `<g data-page-sample="${next + 1}" ${SWATCH_PAINT}>${swatchPicture(PEN_PAGES[next], dash, PAGE_BUTTON_ANGLE)}</g>` +
      `<g stroke="currentColor" fill="currentColor" stroke-width="0.5">${dots.join('')}</g></svg>`
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

  // The picture is only rewritten when what it shows changed, so the page's mutation watcher does not loop on it.
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
  // `currentColor`, so one picture works both as a CSS mask and inline. The round cap is what makes a zero-length dash a dot.
  const SWATCH_LINE = { width: 3, from: 2, to: 22, middle: 12 }
  // The dash layout was worked out at width 2. The width 3 round caps add 0.5 to each end of a dash, so each dash is 1 shorter and each gap 1 longer to show the same gaps, and
  // the offset moves by half of that to keep each dash centred. A dot (a dash of 0) cannot be shorter.
  const SWATCH_PATTERN_WIDTH = 2
  // Two heads a quarter and three quarters along the line, at the scale that sticks out 2.4 past the width 3 line, whatever the arrow spacing.
  const SWATCH_ARROW_SCALE = 0.4588
  function swatchDashes (dash) {
    const { on, gap } = dashPattern(SWATCH_PATTERN_WIDTH, dash, SWATCH_LINE.to - SWATCH_LINE.from)
    const shown = Math.max(0, on - 1)
    return { on: shown, gap: gap + 1, offset: shown / 2 }
  }
  function swatchArrows () {
    const headScale = arrowHeadScaleOf(THICKNESS.fallback) * SWATCH_ARROW_SCALE
    const [half, wide] = [ARROW_LINE.halfLength * headScale, ARROW_LINE.halfWidth * headScale]
    const length = SWATCH_LINE.to - SWATCH_LINE.from
    return [0.25, 0.75].map((along) => {
      const [wing, tip, other] = arrowCorners(SWATCH_LINE.from + along * length, SWATCH_LINE.middle, 1, 0, half, wide)
      return `M${pointText(wing)}L${pointText(tip)}L${pointText(other)}Z`
    }).join('')
  }
  const SWATCH_PAINT = "fill='none' stroke='currentColor' stroke-linecap='round'"
  function swatchPicture (page, dash, angle) {
    const { on, gap, offset } = swatchDashes(dash)
    const round = (x) => Math.round(x * 1000) / 1000
    const dashes = page.dashed ? ` stroke-dasharray='${round(on)} ${round(gap)}' stroke-dashoffset='${round(offset)}'` : ''
    const line = `<path d='M${SWATCH_LINE.from} ${SWATCH_LINE.middle}H${SWATCH_LINE.to}' stroke-width='${SWATCH_LINE.width}'${dashes}/>${page.arrowLines ? `<path d='${swatchArrows()}' fill='currentColor' stroke='none'/>` : ''}`
    return `<g transform='rotate(${-angle} ${SWATCH_LINE.middle} ${SWATCH_LINE.middle})'>${line}</g>`
  }
  const pageSwatch = (page, dash, angle) => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' ${SWATCH_PAINT}>${swatchPicture(page, dash, angle)}</svg>`

  // 5. Arrow lines
  // An arrow is a filled triangle on the line: its base `halfWidth` out to each side of the line's middle and `halfLength` back from it, its tip `halfLength` forward, all times
  // `arrowHeadScaleOf`. The furthest an arrow reaches off its line stays inside what Dark Page keeps past a cell (its `SOLVER_REACH`; a unit test holds the two together).
  const ARROW_LINE = { halfLength: 1.4375, halfWidth: 2.125, line: 1 }

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

  // The heads shrink with the line, a little slower than it (0.8 times the thickness at the default thickness); the gap between arrows grows with it more slowly still.
  const arrowHeadScaleOf = (thickness) => 0.8 * THICKNESS.fallback * (thickness / THICKNESS.fallback) ** 0.8
  const arrowGapOf = (thickness, spacing) => spacing * 8 * (thickness / THICKNESS.fallback) ** 0.2

  // Whole arrows are fitted to the segment, each in the middle of its share of it, so two segments in a row space them alike across their join. `shrink` draws a line of
  // `thickness` at that fraction of its size (the swatch).
  function arrowRun (from, to, thickness, spacing, shrink = 1) {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    const [ux, uy] = [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
    const headScale = arrowHeadScaleOf(thickness) * shrink
    const [half, wide] = [ARROW_LINE.halfLength * headScale, ARROW_LINE.halfWidth * headScale]
    // Every segment holds at least one arrow, so a line never loses its direction.
    const count = Math.max(1, Math.round(length / (arrowGapOf(thickness, spacing) * shrink)))
    let arrows = ''
    for (let i = 0; i < count; i++) {
      const along = (i + 0.5) * length / count
      const [wing, tip, other] = arrowCorners(from[0] + ux * along, from[1] + uy * along, ux, uy, half, wide)
      arrows += `M${pointText(wing)}L${pointText(tip)}L${pointText(other)}Z`
    }
    return arrows
  }

  function arrowLine (value, forward, row, col, thickness, spacing) {
    const points = linePoints(value, row, col)
    const [from, to] = (forward ? points : points.reverse()).map(([r, c]) => [c * CELL_UNITS, r * CELL_UNITS])
    return {
      line: `M${pointText(from)}L${pointText(to)}`,
      arrows: arrowRun(from, to, thickness, spacing),
      lineWidth: ARROW_LINE.line * thickness
    }
  }

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
    steps.arrowLines.run(() => redrawCells((valueColor) => LINE_VALUES.includes(valueColor[0]) && arrowLineWayOf(valueColor[1]) !== null))
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

  // Wrapped after the line erase and the arrow lines, so a mark's click and drawing come first and the marks layer stays on top of an arrow line.
  function installMarks (app, tool) {
    wrapRenderPenMarks(app.svgRenderer)
    const original = tool.clickCell
    wrapClickCell(tool, original)
    suppressMarkMenu(app, () => markUnderPointer(tool, original))
    // Cells drawn before the wrap hold values the old `renderPen` drew as nothing (this script's marks) or in the pen layer (every mark).
    redrawCells((valueColor) => MARK_VALUES.includes(valueColor[0]))
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
    return `:root:root .cell-pen { opacity: 1; }\n:root:root ${PEN_LAYER} { opacity: ${opacity / 100}; }`
  }

  // A filter runs on the layer's picture before its opacity does, so the outline fades with the marks. The highlight (`.penhint`) is in its own group beside the layer, so it is not outlined.
  function buildOutlineCss (outline) {
    return outline ? `:root:root ${PEN_LAYER} { filter: url(#${OUTLINE_FILTER_ID}); }` : ''
  }

  // The layer's alpha is grown in the two steps described at OUTLINE_SQUARE_SHARE, as one shape, so the outline does not cut across where lines join or cross. The filter works
  // in sRGB so the layer's own colors pass through unchanged.
  function renderOutlineFilter (width) {
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

  function adoptArrowSpacing () {
    redrawArrowLines()
    syncPenPanel()
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
  // SudokuPad's line mode pulldown (hidden here, stepped by the panel's line mode button), the key it saves the mode under, and its three values with SudokuPad's labels.
  const LINE_MODE_BOX = '.tool-pen .penlinemode'
  const LINE_MODE_KEY = 'ToolPen_linemode'
  const LINE_MODES = [['both', 'Center & Edge'], ['centeronly', 'Center only'], ['edgeonly', 'Edge only']]

  // 'both' is SudokuPad's own default.
  function normalizeLineMode (data) {
    return LINE_MODES.some(([value]) => value === data) ? data : LINE_MODES[0][0]
  }

  // SudokuPad draws `.penlinemode` as a box across the panel's last row, which is hidden here. The panel keeps SudokuPad's outer size (four rows of a 4rem button between 0.15rem margins)
  // and lays itself out as a grid: the nine color buttons shortened to 2.5rem, a gap, a row of the line mode, line type and settings buttons at the full 4rem on the color columns, and
  // the sliders across the rest. A tray sits behind the last two rows; it is placed in their area but takes no cell, so the buttons fill the row.
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
  const TRAY_COLOR = '#efeaf4'
  const TRAY_RADIUS_PX = 14
  // The tray reaches this far past the color block on each side, and holds its buttons this far from its edge on every side, so the margin of a button and the reach make up most of it.
  const TRAY_REACH_REM = 0.25
  const TRAY_PADDING_REM = 0.4
  const TRAY_TOP_REM = rem(CONTROLS_GAP_REM + PANEL_BUTTON_MARGIN_REM - TRAY_PADDING_REM)
  const MODE_BUTTON = 'pen-tool-extras-mode'
  const SETTINGS_BUTTON = 'pen-tool-extras-settings'
  const SETTINGS_LABEL = 'Pen Tool Extras settings'
  const TRAY = 'pen-tool-extras-tray'
  const SLIDER_TRACK_REM = 0.8
  const SLIDER_THUMB_REM = 1.1
  const SLIDER_THUMB_RING_REM = 0.2
  // The tracks say what the sliders do: thickness is a wedge widening to the right, opacity fades from faint to solid. The wedge is a data-URI picture, since a CSS gradient
  // cannot draw a slanted edge. `preserveAspectRatio="none"` stretches it over the track.
  const WEDGE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'><polygon points='0,4.5 100,1.5 100,8.5 0,5.5' fill='${PANEL_COLOR}'/></svg>`
  const WEDGE_PICTURE = `url("data:image/svg+xml,${encodeURIComponent(WEDGE_SVG)}") center / 100% 100% no-repeat`
  const FADE_PICTURE = `linear-gradient(to right, color-mix(in srgb, ${PANEL_COLOR} 8%, transparent), ${PANEL_COLOR})`
  const TRACK_SHAPE = `height: ${SLIDER_TRACK_REM}rem; border: none; border-radius: ${SLIDER_TRACK_REM / 2}rem;`
  const THUMB_SHAPE = `box-sizing: border-box; width: ${SLIDER_THUMB_REM}rem; height: ${SLIDER_THUMB_REM}rem; border-radius: 50%; background: #fff; border: ${SLIDER_THUMB_RING_REM}rem solid ${PANEL_COLOR};`
  // A hidden slider's empty row has the same height, so the other keeps its place.
  const SLIDER_ROW_HEIGHT_REM = 1.4
  // Each color button keeps `position: relative`, since its color line is its `::after`. The row of buttons is ordered by `order`, so a missing line type button leaves no hole.
  const CONTROL_BUTTONS = [MODE_BUTTON, PAGE_BUTTON, SETTINGS_BUTTON]
  const controlButtons = CONTROL_BUTTONS.map((name) => `.tool-pen .controls-input button.${name}`).join(', ')
  const PANEL_CSS = [
    `${LINE_MODE_BOX} { display: none; }`,
    `.tool-pen .controls-input { display: grid !important; grid-template-columns: repeat(${PANEL_COLUMNS}, ${PANEL_CELL_REM}rem); grid-template-rows: repeat(${COLOR_ROWS}, ${COLOR_CELL_REM}rem) ${rem(CONTROLS_GAP_REM + PANEL_CELL_REM)}rem 1fr; height: ${PANEL_HEIGHT_REM}rem !important; padding: 0 !important; box-sizing: border-box; justify-items: center; align-items: center; }`,
    '.tool-pen .controls-input > .button-row { display: contents !important; }',
    '.tool-pen .controls-input button[data-key="0"], .tool-pen .controls-input button[data-control="delete"] { display: none !important; }',
    `.tool-pen .controls-input button[data-key] { position: relative; width: ${PANEL_BUTTON_REM}rem !important; height: ${COLOR_BUTTON_REM}rem !important; min-width: 0 !important; margin: ${PANEL_BUTTON_MARGIN_REM}rem !important; }`,
    `${controlButtons} { grid-row: ${CONTROLS_ROW}; align-self: end; position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; width: ${PANEL_BUTTON_REM}rem; height: ${PANEL_BUTTON_REM}rem; margin: ${PANEL_BUTTON_MARGIN_REM}rem; padding: 0; background-color: var(--body-bg); color: ${PANEL_COLOR}; }`,
    ...CONTROL_BUTTONS.map((name, i) => `.tool-pen .controls-input button.${name} { order: ${i + 1}; }`),
    `.${TRAY} { grid-row: ${CONTROLS_ROW} / ${SLIDERS_ROW + 1}; grid-column: 1 / ${PANEL_COLUMNS + 1}; position: absolute; inset: 0; z-index: 0; margin: ${TRAY_TOP_REM}rem -${TRAY_REACH_REM}rem 0; background: ${TRAY_COLOR}; border-radius: ${TRAY_RADIUS_PX}px; }`,
    // With no sliders the tray ends under the controls, as far past their margin as the other sides: an absolutely placed box needs its end line, or it runs to the panel's edge.
    `.tool-pen .controls-input:not(:has(.${SLIDERS})) .${TRAY} { grid-row: ${CONTROLS_ROW} / ${SLIDERS_ROW}; margin-bottom: -${rem(TRAY_PADDING_REM - PANEL_BUTTON_MARGIN_REM)}rem; }`,
    // SudokuPad's Keypad Flipped swaps the first and third rows of colors with a transform on each `.button-row`, which has no box here, so the rows are swapped by grid row.
    ...[[1, 2, 3, COLOR_ROWS], [7, 8, 9, 1]].flatMap(([a, b, c, row]) => [a, b, c].map((key) => `.setting-flipkeypad .tool-pen .controls-input :is(button[data-key="${key}"], .${PICKER}[data-pen="${key}"]) { grid-row: ${row} / span 1; }`)),
    // In edit mode a picker sits in its button's cell, so it follows the button when Keypad Flipped moves it.
    ...PEN_COLOR_NUMBERS.map((n) => `.tool-pen .controls-input .${PICKER}[data-pen="${n}"] { grid-row: ${Math.ceil(n / PANEL_COLUMNS)} / span 1; grid-column: ${(n - 1) % PANEL_COLUMNS + 1} / span 1; }`),
    `.${SLIDERS} { grid-row: ${SLIDERS_ROW}; grid-column: 1 / ${PANEL_COLUMNS + 1}; justify-self: stretch; align-self: stretch; position: relative; z-index: 1; box-sizing: border-box; margin: ${PANEL_BUTTON_MARGIN_REM}rem ${PANEL_BUTTON_MARGIN_REM}rem ${TRAY_PADDING_REM}rem; padding: 0 0.8rem; display: flex; flex-direction: column; justify-content: space-evenly; color: ${PANEL_COLOR}; }`,
    `.${SLIDER_ROW} { display: flex; align-items: center; gap: 0.4rem; height: ${SLIDER_ROW_HEIGHT_REM}rem; }`,
    `.${SLIDER_ROW} input { flex: 1; min-width: 0; margin: 0; height: ${SLIDER_ROW_HEIGHT_REM}rem; background: transparent; -webkit-appearance: none; appearance: none; }`,
    `.${SLIDER_ROW} input::-webkit-slider-runnable-track { ${TRACK_SHAPE} }`,
    `.${SLIDER_ROW} input::-moz-range-track { ${TRACK_SHAPE} }`,
    `#${THICKNESS_SLIDER}::-webkit-slider-runnable-track { background: ${WEDGE_PICTURE}; }`,
    `#${THICKNESS_SLIDER}::-moz-range-track { background: ${WEDGE_PICTURE}; }`,
    `#${OPACITY_SLIDER}::-webkit-slider-runnable-track { background: ${FADE_PICTURE}; }`,
    `#${OPACITY_SLIDER}::-moz-range-track { background: ${FADE_PICTURE}; }`,
    `.${SLIDER_ROW} input::-webkit-slider-thumb { -webkit-appearance: none; margin-top: ${(SLIDER_TRACK_REM - SLIDER_THUMB_REM) / 2}rem; ${THUMB_SHAPE} }`,
    `.${SLIDER_ROW} input::-moz-range-thumb { ${THUMB_SHAPE} }`,
    `.${MODE_BUTTON} svg, .${PAGE_BUTTON} svg, .${SETTINGS_BUTTON} svg { width: 2.6rem; height: 2.6rem; }`,
    // SudokuPad's CSS fills every `svg path`, which would turn the icon's lines into blobs.
    `.${MODE_BUTTON} path, .${SETTINGS_BUTTON} path, .${SETTINGS_BUTTON} circle { fill: none !important; }`
  ].join('\n')

  // A 2x2 cell grid, faint, with the center line (through the cell centers) and the edge line (along the cell edges) drawn over it.
  const MODE_ICON_LINES = {
    center: '<path data-line="center" d="M7.5 7.5H16.5V16.5"/>',
    edge: '<path data-line="edge" d="M3 12H12V21"/>'
  }
  // Each icon is drawn at one size, 34 px on the longest side of its visible ink, centred on its ink, at 1200x900 (docs/research/pen-tool-extras-panel-redesign-mockup.png). The
  // corrections were measured from rendered pixels, one for each picture an icon can show, and live in its viewBox (live/pen-tool-extras-panel-layout.live.mjs measures them again).
  const MODE_ICON_VIEWBOX = { both: '-0.62 -0.8 25.059 25.059', centeronly: '0.25 -0.57 24 24', edgeonly: '-0.54 -0.7 24.882 24.882' }
  const SETTINGS_ICON_VIEWBOX = '-1.51 -2.63 27.882 27.882'
  const MODE_ICON_SHOWS = { both: ['center', 'edge'], centeronly: ['center'], edgeonly: ['edge'] }

  function nextLineMode (lineMode) {
    const values = LINE_MODES.map(([value]) => value)
    return values[wrapIndex(values.indexOf(normalizeLineMode(lineMode)), 1, values.length)]
  }

  // The hover label is SudokuPad's own label for the current mode (the markup's `&amp;` reads as the label's `&`).
  function renderLineModeButton (lineMode) {
    const mode = normalizeLineMode(lineMode)
    const label = LINE_MODES.find(([value]) => value === mode)[1].replace('&', '&amp;')
    return `<button class="${MODE_BUTTON}" data-control="penlinemode-step" data-mode="${mode}" title="${label}" aria-label="${label}">` +
      `<svg viewBox="${MODE_ICON_VIEWBOX[mode]}" fill="none" stroke="currentColor" aria-hidden="true"><path data-grid d="M3 3h18v18H3zM12 3v18M3 12h18" stroke-opacity="0.55" stroke-width="1"/>` +
      `<g stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${MODE_ICON_SHOWS[mode].map((name) => MODE_ICON_LINES[name]).join('')}</g></svg></button>`
  }

  // A hidden slider keeps an empty row so the other keeps its place. Neither slider takes keyboard focus by tabbing (`tabindex="-1"`): a drag ends with the focus handed back to the page.
  function renderPanelSliders (thickness, opacity, show) {
    if (!show.thickness && !show.opacity) return ''
    const row = (shown, id, label, range, value) => shown
      ? `<div class="${SLIDER_ROW}" title="${label}">` +
        `<input type="range" id="${id}" aria-label="${label}" tabindex="-1" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}"></div>`
      : `<div class="${SLIDER_ROW}" data-empty></div>`
    return `<div class="${SLIDERS}">` +
      row(show.thickness, THICKNESS_SLIDER, 'Thickness', THICKNESS, thickness) +
      row(show.opacity, OPACITY_SLIDER, 'Opacity', OPACITY, opacity) +
      '</div>'
  }

  // The settings icon is Lucide's `settings` (https://lucide.dev, ISC licence). Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT);
  // all other copyright (c) for Lucide are held by Lucide Contributors 2022. Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is
  // hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
  const SETTINGS_ICON = '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'

  function renderSettingsButton () {
    return `<button class="${SETTINGS_BUTTON}" data-control="penextras-settings" title="${SETTINGS_LABEL}" aria-label="${SETTINGS_LABEL}">` +
      `<svg viewBox="${SETTINGS_ICON_VIEWBOX}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SETTINGS_ICON}</svg></button>`
  }

  // The saved mode: SudokuPad's pen tool holds its default until it first opens and reads the saved mode then, and with the pulldown hidden only the panel's button changes it.
  // It does not depend on the page support in `installPenPages`.
  function currentLineMode () {
    return normalizeLineMode(Framework.getData(LINE_MODE_KEY))
  }

  // The button is rewritten only when the mode it shows changed, so the page's mutation watcher does not loop on it.
  function syncModeButton (mode) {
    const lineMode = currentLineMode()
    const button = document.querySelector(`.${MODE_BUTTON}`)
    if (button && button.dataset.mode === lineMode) return
    if (button) button.remove()
    mode.insertAdjacentHTML('afterend', renderLineModeButton(lineMode))
  }

  function syncPart (mode, selector, markup) {
    if (!document.querySelector(selector)) mode.insertAdjacentHTML('afterend', markup)
  }

  // Saved where SudokuPad saves it, so its hidden pulldown, when the pen tool is on, shows it too.
  function applyLineMode (lineMode) {
    ToolPen.tool.lineMode = lineMode
    Framework.setData(LINE_MODE_KEY, lineMode)
    const select = document.querySelector(`${LINE_MODE_BOX} select`)
    if (select) select.value = lineMode
    syncPenPanel()
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
  // A click this soon after a tap on the line mode button is that tap's own.
  const TAP_CLICK_MS = 1000
  let panelCheck = null

  // A panel with no pulldown, whose row the controls take, means SudokuPad renamed the element, so the row is not ours.
  function checkPanelRow () {
    if (panelCheck !== null || !document.querySelector(PEN_PANEL)) return
    panelCheck = setTimeout(() => {
      panelCheck = null
      if (document.querySelector(PEN_PANEL) && !document.querySelector(LINE_MODE_BOX)) steps.penPanel.skip('the pen tool panel has no .penlinemode')
    }, PANEL_CHECK_MS)
  }

  // SudokuPad builds `.penlinemode` each time the pen tool is turned on and removes it when another tool is. The sliders, the tray and the three buttons are added beside it (it is hidden,
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
      if (markup) syncPart(mode, `.${SLIDERS}`, markup)
      syncPart(mode, `.${TRAY}`, `<div class="${TRAY}"></div>`)
      syncPart(mode, `.${SETTINGS_BUTTON}`, renderSettingsButton())
      syncModeButton(mode)
      syncPageButton(mode)
    }, removePanelParts)
  }

  function removePanelParts () {
    document.querySelectorAll(`.${SLIDERS}, .${MODE_BUTTON}, .${SETTINGS_BUTTON}, .${TRAY}`).forEach((el) => el.remove())
    removePageButtons()
  }

  // A drag on a slider leaves the focus on it, and then the arrow and paging keys would move the slider
  // and not reach the puzzle; the focus goes back to the page when the pointer is released.
  function installPenPanel () {
    document.addEventListener('input', (event) => {
      if (event.target.matches(`.${SLIDERS} input`)) saveSlider(event.target)
    })
    // SudokuPad cancels the touch events on its panel buttons, which keeps the browser from sending the click after a tap, so a tap acts at `touchstart`. The click a
    // browser may still send after that tap must not act a second time.
    let tappedAt = -Infinity
    const actions = [[MODE_BUTTON, () => steps.penPanel.run(() => applyLineMode(nextLineMode(currentLineMode())))], [SETTINGS_BUTTON, openDialog]]
    window.addEventListener('touchstart', (event) => {
      const action = actions.find(([name]) => event.target.closest(`.${name}`))
      if (!action) return
      event.stopPropagation()
      tappedAt = Date.now()
      action[1]()
    }, true)
    document.addEventListener('click', (event) => {
      const action = actions.find(([name]) => event.target.closest(`.${name}`))
      if (action && Date.now() - tappedAt > TAP_CLICK_MS) action[1]()
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

  // 10. Settings dialog
  const EDITOR_ID = 'pen-tool-extras-editor'

  const MARK_PICTURES = {
    x: ['16', '<path d="M3 3 L13 13 M13 3 L3 13"/>'],
    directions: ['30', '<path d="M3 11 L8 5 L13 11 M17 5 L22 11 L27 5"/>'],
    circle: ['16', '<circle cx="8" cy="8" r="5.2"/>']
  }
  const markPicture = (key) => {
    const [width, shapes] = MARK_PICTURES[key]
    return `<svg width="${width}" height="16" viewBox="0 0 ${width} 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`
  }

  const ICON_PICTURES = {
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4"/>'
  }
  const iconButton = (act, label, picture) =>
    `<button type="button" data-act="${act}" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${picture}</svg></button>`

  function renderTitle (version) {
    return '<div class="pen-tool-extras-title-row">' +
      `<span><b>Pen Tool Extras</b> <small class="pen-tool-extras-version">v${version}</small></span>` +
      '<span data-role="settings-status"></span>' +
      '<span class="pen-tool-extras-tools">' + iconButton('copy-settings', 'Copy settings', ICON_PICTURES.copy) + iconButton('paste-settings', 'Paste settings', ICON_PICTURES.paste) + '</span></div>'
  }

  // The class names more than one template writes, named once here; a class only one template writes is spelled in that template and in its rule in `DIALOG_CSS`.
  const NOTE = 'pen-tool-extras-note'
  const SECTION_TITLE = 'pen-tool-extras-section-title'
  const DIVIDER = '<div class="pen-tool-extras-divider"></div>'
  const LINE_COLOR = '#e3dff0'
  // The ruled mockup's colors for the grid's lines and for the marks table's.
  const GRID_LINE_COLOR = '#ddd'
  const MARKS_LINE_COLOR = '#eee'
  const INDENTED_COLOR = '#444'
  const MUTED_COLOR = '#777'
  const INDENT_EM = 1.2
  // The gap between the two columns, either side of the vertical line, and the slider's length, shared by all five sliders.
  const COLUMN_GAP_PX = 24
  const SLIDER_PX = 96
  const MARK_CELL_PX = 28
  const ONE_COLUMN_BELOW_PX = 600
  const SLIDER_COLUMNS = 'pen-tool-extras-columns'
  const CELL = 'pen-tool-extras-cell'

  function offNote (off) {
    if (!off.length) return ''
    return `<div class="${NOTE}">Off because SudokuPad changed: ${off.join(', ')}</div>`
  }

  // `pickedPreset` is the page preset the missing pens came from.
  function missingNote (missing, pickedPreset) {
    if (!missing.length) return ''
    const page = PAGE_PRESETS.indexOf(pickedPreset) + 1
    const list = (missing.length === 1 ? 'pen color ' : 'pen colors ') + missing.join(', ')
    return `<div class="${NOTE}">Cell color page ${page} has no usable color at the matching button, so ${list} keep${missing.length === 1 ? 's' : ''} SudokuPad's own.</div>`
  }

  // A set in force that is no pickable preset (Custom, a page the palette no longer has, a preset while the colors step is off, or the colors before the install save) is
  // shown first and cannot be picked, so the pulldown says what is in force and every preset stays pickable: picking the option already shown fires no `change`.
  function presetChoice (preset, presets) {
    const option = (id, disabled) => `<option value="${id}"${id === preset ? ' selected' : ''}${disabled ? ' disabled' : ''}>${PRESET_LABELS[id]}</option>`
    const inForce = presets.includes(preset) ? '' : option(preset, true)
    return `<select data-pen-preset aria-label="Pen color preset">${inForce}${presets.map((id) => option(id, false)).join('')}</select>`
  }

  const sectionTitle = (text) => `<div class="${SECTION_TITLE}">${text}</div>`

  const DIALOG_CLASS = 'pen-tool-extras-dialog'

  const EDITOR = `#${EDITOR_ID}`

  // Scoped by DIALOG_CLASS and the editor's id, so SudokuPad's other dialogs are left alone.
  const DIALOG_CSS = [
    // Sized to its content and centred in the window; the paragraph around the editor loses SudokuPad's bottom margin so the vertical line meets the footer's line.
    `.dialog:has(${EDITOR}) { width: fit-content !important; max-width: 96vw !important; }`,
    `.dialog p:has(> ${EDITOR}) { margin-bottom: 0 !important; }`,
    `.dialog-options.${DIALOG_CLASS} { display: flex !important; flex-direction: row !important; align-items: center; gap: 10px; justify-content: flex-end; border-top: 1px solid ${LINE_COLOR}; padding: 14px 4px 2px; margin-top: 0; box-sizing: border-box; width: 100%; }`,
    `.dialog-options.${DIALOG_CLASS} button { width: auto !important; min-width: 0 !important; margin: 0 !important; padding: 0 22px !important; height: 38px !important; line-height: 36px !important; border-radius: 8px !important; font-size: 1rem !important; flex: none; }`,
    `.dialog-options.${DIALOG_CLASS} button[data-role="save"] { background: ${PANEL_COLOR} !important; color: #fff !important; border: 1px solid #5a3489 !important; font-weight: 600; }`,
    `.dialog-options.${DIALOG_CLASS} button[data-role="cancel"] { background: #f1eff5 !important; color: #333 !important; border: 1px solid #cfc9db !important; }`,
    `.dialog-options.${DIALOG_CLASS} button[data-role="restore"] { margin-right: auto !important; background: none !important; border: none !important; color: ${MUTED_COLOR} !important; padding: 0 4px !important; font-size: 0.85rem !important; text-decoration: underline; text-underline-offset: 3px; }`,
    '.pen-tool-extras-version { opacity: .6; }',
    '.pen-tool-extras-title-row { display: flex; align-items: center; gap: 12px; }',
    '.pen-tool-extras-tools { display: flex; align-items: center; gap: 4px; }',
    `.pen-tool-extras-tools button { background: none !important; border: none !important; box-shadow: none !important; padding: 4px !important; margin: 0 !important; width: auto !important; min-width: 0 !important; height: auto !important; line-height: 0 !important; color: ${MUTED_COLOR} !important; cursor: pointer; border-radius: 6px !important; }`,
    '.pen-tool-extras-tools button:hover { background: #f0edf5 !important; }',
    '.pen-tool-extras-tools svg { width: 20px; height: 20px; }',
    '.pen-tool-extras-tools svg * { fill: none !important; }',
    // A flex item with no intrinsic width: a long message wraps in the room the title leaves and never widens the dialog.
    `.pen-tool-extras-title-row [data-role="settings-status"] { flex: 1 1 0; min-width: 0; contain: inline-size; text-align: right; font-size: .8rem; color: ${MUTED_COLOR}; }`,
    `${EDITOR} .${NOTE} { margin: 6px 0; max-width: 20em; }`,
    // In the first column the note wraps to the column set by the marks table; it never sets it.
    `${EDITOR} .${CELL} .${NOTE} { width: 0; min-width: 100%; max-width: none; }`,
    // The first column is as wide as the marks table; the pen colors fill it and never set it.
    `${EDITOR} .pen-tool-extras-layout { display: grid; grid-template-columns: max-content 1fr; margin-top: 8px; }`,
    // Every cell has its own top line, so the vertical line starts at the line under the title.
    `${EDITOR} .${CELL} { min-width: 0; padding: 10px ${COLUMN_GAP_PX}px 10px 0; border-top: 1px solid ${GRID_LINE_COLOR}; }`,
    `${EDITOR} .${CELL}:nth-child(2n) { border-left: 1px solid ${GRID_LINE_COLOR}; padding: 10px 0 10px ${COLUMN_GAP_PX}px; }`,
    `${EDITOR} .${SECTION_TITLE} { font-weight: 600; margin: 0 0 4px; }`,
    // It starts at the vertical line: the column gap and the line's own width back.
    `${EDITOR} .pen-tool-extras-divider { border-top: 1px solid ${GRID_LINE_COLOR}; margin: 10px 0 10px calc(-1 * (${COLUMN_GAP_PX}px + 1px)); }`,
    // Every slider row has one label column, so the five sliders start at the same x.
    `${EDITOR} .${SLIDER_COLUMNS} { display: grid; grid-template-columns: 7.6em ${SLIDER_PX}px 2em; column-gap: 8px; align-items: center; margin: 4px 0; }`,
    `${EDITOR} .pen-tool-extras-label { width: auto; text-align: left; margin: 0; }`,
    `${EDITOR} .pen-tool-extras-label.pen-tool-extras-under { padding-left: ${INDENT_EM}em; color: ${INDENTED_COLOR}; box-sizing: border-box; }`,
    `${EDITOR} .pen-tool-extras-range { width: 100%; min-width: 0; margin: 0; }`,
    `${EDITOR} .pen-tool-extras-check-row.pen-tool-extras-sub { padding-left: ${INDENT_EM}em; color: ${INDENTED_COLOR}; margin: 0 0 4px; }`,
    `${EDITOR} .pen-tool-extras-check { margin: 0; }`,
    `${EDITOR} .pen-tool-extras-check-row { margin: 4px 0; display: flex; justify-content: flex-start; align-items: center; gap: 6px; }`,
    `${EDITOR} .pen-tool-extras-pen-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; margin: 6px 0; }`,
    `${EDITOR} .pen-tool-extras-pen-grid input[type=color] { -webkit-appearance: none; appearance: none; box-sizing: border-box; width: 100%; height: auto; aspect-ratio: 1; padding: 0; margin: 0; border: 1px solid rgb(0 0 0 / .25); border-radius: 6px; background: none; cursor: pointer; }`,
    `${EDITOR} .pen-tool-extras-pen-grid input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }`,
    `${EDITOR} .pen-tool-extras-pen-grid input[type=color]::-webkit-color-swatch { border: none; border-radius: 5px; }`,
    `${EDITOR} .pen-tool-extras-pen-grid input[type=color]::-moz-color-swatch { border: none; border-radius: 5px; }`,
    `${EDITOR} .pen-tool-extras-marks-table { display: grid; grid-template-columns: max-content repeat(3, ${MARK_CELL_PX}px); margin: 6px 0 0; }`,
    `${EDITOR} .pen-tool-extras-marks-table > * { display: flex; align-items: center; justify-content: center; height: ${MARK_CELL_PX}px; box-sizing: border-box; margin: 0; }`,
    `${EDITOR} .pen-tool-extras-marks-table > :nth-child(4n+1) { justify-content: flex-start; padding-right: 10px; }`,
    `${EDITOR} .pen-tool-extras-marks-table > :not(:nth-child(4n+1)) { border-left: 1px solid ${MARKS_LINE_COLOR}; }`,
    `${EDITOR} .pen-tool-extras-marks-table > :nth-child(n+5) { border-top: 1px solid ${MARKS_LINE_COLOR}; }`,
    `${EDITOR} .pen-tool-extras-mark input { margin: 0; }`,
    `${EDITOR} .pen-tool-extras-mark-head { color: ${INDENTED_COLOR}; }`,
    `${EDITOR} .pen-tool-extras-mark-head svg { stroke-width: 2.6; overflow: visible; }`,
    `${EDITOR} select[data-pen-preset] { box-sizing: border-box; width: 0; min-width: 100%; margin: 6px 0 0; font-size: 1rem; padding: 4px 28px 4px 10px; border: 1px solid #b9b0c9; border-radius: 6px; appearance: none; color: #222; background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b4fa0'/%3E%3C/svg%3E") no-repeat right 10px center; }`,
    // Below ONE_COLUMN_BELOW_PX the cells stack in one column, in their order in the markup.
    `@media (max-width: ${ONE_COLUMN_BELOW_PX}px) {
${EDITOR} .pen-tool-extras-layout { grid-template-columns: minmax(0, 1fr); }
${EDITOR} .${CELL}:nth-child(n) { border-left: none; padding: 10px 0; }
${EDITOR} .pen-tool-extras-divider { margin-left: 0; }
${EDITOR} .pen-tool-extras-pen-grid, ${EDITOR} select[data-pen-preset] { max-width: 14rem; }
}`
  ].join('\n')

  const boxId = (path) => `pen-tool-extras-box-${path.replace('.', '-')}`
  const boxAttributes = (path) => `id="${boxId(path)}" data-box="${path}"`

  // Its values are drafts that take effect on Save, so the panel's sliders and these agree when the dialog opens.
  function renderEditor (state) {
    const grid = '<div class="pen-tool-extras-pen-grid">' +
      PEN_COLOR_NUMBERS.map((n) => `<input type="color" data-pen="${n}" value="${state.colors[n]}" aria-label="Pen color ${n}">`).join('') + '</div>'
    // A box with no word label carries its name as its accessible name and hover title.
    const markBox = (key, name) =>
      `<label title="${name}" class="pen-tool-extras-mark">` +
      `<input type="checkbox" ${boxAttributes(`marks.${key}`)} aria-label="${name}" title="${name}"${state.marks[key] ? ' checked' : ''}></label>`
    const sliderRow = (key) => {
      const { range, dialog: { label, under } } = SETTINGS[key]
      const value = state[key]
      return `<div data-row="${key}" class="${SLIDER_COLUMNS}"${!under || boxValue(state, under) ? '' : ' style="display:none"'}>` +
        `<label for="pen-tool-extras-setting-${key}" class="pen-tool-extras-label${under ? ' pen-tool-extras-under' : ''}">${label}</label>` +
        `<input type="range" data-setting="${key}" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}" id="pen-tool-extras-setting-${key}" class="pen-tool-extras-range">` +
        `<output data-readout="${key}">${value}</output></div>`
    }
    const rowsUnder = (path) => SETTING_NAMES.filter((name) => SETTINGS[name].dialog.under === path).map(sliderRow).join('')
    const labelled = (path, checked, text, { rowClass = '', title = '' } = {}) => `<div class="pen-tool-extras-check-row${rowClass}">` +
      `<input type="checkbox" ${boxAttributes(path)}${checked ? ' checked' : ''}${title ? ` title="${title}"` : ''} class="pen-tool-extras-check">` +
      `<label for="${boxId(path)}" class="pen-tool-extras-label">${text}</label></div>`
    const settingRows = (name) => {
      const { range, dialog: { labels, box } } = SETTINGS[name]
      if (range) return sliderRow(name) + (box ? labelled(`${box}.${name}`, state[box][name], 'Slider in panel', { rowClass: ' pen-tool-extras-sub', title: SETTINGS[box].dialog.title }) : '')
      if (labels) return Object.entries(labels).map(([flagName, text]) => labelled(`${name}.${flagName}`, state[name][flagName], text) + rowsUnder(`${name}.${flagName}`)).join('')
      return labelled(name, state[name], SETTINGS[name].dialog.label) + rowsUnder(name)
    }
    const section = (title) => sectionTitle(title) + SETTING_NAMES.filter((name) => SETTINGS[name].dialog.section === title).map(settingRows).join('')
    const markRow = (label, cellsMarkup) => `<div>${label}</div>${cellsMarkup}`
    const columnHead = (picture) => `<div class="pen-tool-extras-mark-head">${markPicture(picture)}</div>`
    const marksTable = '<div class="pen-tool-extras-marks-table">' +
      '<div></div>' + columnHead('x') + columnHead('circle') + columnHead('directions') +
      markRow('Edge', markBox('x', 'Edge X Mark') + markBox('circle', 'Edge Circle') + markBox('directions', 'Edge Directions')) +
      markRow('Corner', markBox('cornerX', 'Corner X Mark') + markBox('cornerCircle', 'Corner Circle') + '<div></div>') +
      '</div>'
    const cell = (markup) => `<div class="${CELL}">${markup}</div>`
    return offNote(state.off) + '<div class="pen-tool-extras-layout">' +
      cell(sectionTitle('Pen colors') + presetChoice(state.preset, state.presets) + grid + missingNote(state.missing, state.pickedPreset)) +
      cell(section('Line settings') + DIVIDER + section('Line styles')) +
      cell(sectionTitle('Marks to cycle') + marksTable) +
      cell(section('Other')) + '</div>'
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
    let set = active
    let pickedPreset = activePickedPreset
    // Save writes the colors only once a preset is picked or a picker edited, so opening and saving never stands in for the install save.
    let colorsChosen = false
    let draft = { ...inForce }
    let box = null
    const draw = () => {
      box.innerHTML = renderEditor({ ...set, pickedPreset, presets: availablePresets(), ...draft, off: skipped })
    }
    // Computed now, from the palette in force: the saved colors are a snapshot. False when the colors step is off or goes off reading the palette.
    const pickPreset = (id) => {
      const picked = id === SUDOKUPAD_PRESET ? SUDOKUPAD_SET : steps.colors.run(() => presetFromTool(readyColorTool(), id), () => null)
      if (picked) {
        set = picked
        pickedPreset = id
        colorsChosen = true
      }
      draw()
      return Boolean(picked)
    }
    // SudokuPad's own colors when page 1 cannot be read, as before the presets.
    const restoreDefaults = () => {
      // The sliders and boxes are drafts like the colors: Cancel leaves what is in force. The mark boxes keep their draft: Restore defaults has never reset the edge and corner cycles.
      draft = { ...settingDefaults(), marks: draft.marks }
      if (!pickPreset(availablePresets()[0])) pickPreset(SUDOKUPAD_PRESET)
    }
    Framework.showDialog({
      parts: [
        { tag: 'text', innerHTML: renderTitle(VERSION) },
        { tag: 'text', innerHTML: `<div id="${EDITOR_ID}"></div>` },
        {
          tag: 'options',
          options: [
            {
              tag: 'button',
              content: 'Save',
              handler: () => {
                if (colorsChosen) saveColors(set, pickedPreset)
                saveSettings(draft)
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
    wireCopyPaste(box.closest('.dialog'), (values) => {
      const pasted = SETTING_NAMES.filter((name) => SETTINGS[name].key in values)
      const next = { ...inForce, ...Object.fromEntries(pasted.map((name) => [name, values[SETTINGS[name].key]])) }
      saveSettings(next)
      draft = { ...draft, ...Object.fromEntries(pasted.map((name) => [name, next[name]])) }
      if (COLORS_KEY in values) {
        const pastedSet = readPenColors(values[COLORS_KEY])
        saveColors(pastedSet)
        set = pastedSet
        pickedPreset = pastedSet.preset
        colorsChosen = false
      }
      draw()
      showRows()
    })
    // `change` fires when a color picker closes (the swatch the user sees is already the new color), and when a mark box or a slider box is ticked.
    box.addEventListener('input', (event) => {
      const el = event.target.closest('input[type="range"]')
      if (!el) return
      const value = Number(el.value)
      if (!SETTINGS[el.dataset.setting]) throw new Error(`pen-tool-extras: the dialog has no slider named ${el.dataset.setting}`)
      draft[el.dataset.setting] = value
      box.querySelector(`output[data-readout="${el.dataset.setting}"]`).textContent = String(value)
    })
    box.addEventListener('change', (event) => {
      const choice = event.target.closest('select[data-pen-preset]')
      if (choice) {
        pickPreset(choice.value)
        return
      }
      const ticked = event.target.closest('input[type="checkbox"]')
      if (ticked) {
        draft = draftWithBox(draft, ticked.dataset.box || '', ticked.checked)
        showRows()
        return
      }
      const el = event.target.closest('input[type="color"]')
      if (!el) return
      // A pen picked by hand leaves the missing-color note; the others stay on it.
      const pen = el.dataset.pen
      set = { colors: editedColors(set.colors, pen, el.value), preset: CUSTOM, missing: set.missing.filter((n) => String(n) !== pen) }
      colorsChosen = true
      draw()
    })
  }

  // SudokuPad builds its controls after Start Puzzle and can rebuild them, and builds the line mode pulldown each time the pen tool is turned on, so the panel syncs on every change to the page.
  function watchControls () {
    new window.MutationObserver(syncPenPanel).observe(document.body, { childList: true, subtree: true })
    syncPenPanel()
  }

  // 11. Startup: the test exports, the Framework guard and Framework.getApp()
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, copiedSettings, pastedSettings, pasteReport, SETTINGS, draftWithBox, slider, flag, flags, isPlainObject, isHexColor, inRange, settingDefaults, readSettings, changedSettings, saveSetting, saveChangedSettings, effectsOf, editedColors, readPenColors, storedPenColors, startupPenColors, presetOptions, presetColors, PRESET_LABELS, renderTitle, parseColor, isTransparent, darkenColor, derivedPenColors, buildCss, buildThicknessCss, buildOpacityCss, buildOutlineCss, renderOutlineFilter, OUTLINE_FILTER_ID, OUTLINE_WIDTH, ARROW_SPACING, enabledPages, stepEnabledPage, pageAfterSave, MARK_VALUES, MARKS_LAYER_ID, PEN_PAGES, LINE_VALUES, directionCharOf, arrowLineWayOf, ARROW_LINE, lineSegment, splitLineActs, linePoints, lineIdentityOf, segmentNear, connectedLine, eraseLineActs, LINE_HIT_RADIUS, arrowLine, penPageOf, penNumber, penCharOn, normalizePen, wrapIndex, normalizeLineMode, LINE_MODES, buildPagesCss, pageSwatch, PAGE_BUTTON_ANGLE, renderPageIcon, renderPanelSliders, renderLineModeButton, renderSettingsButton, nextLineMode, PANEL_CSS, renderEditor, DIALOG_CSS, lackingInternals, markGrowthScale, DASH, normalizeMarkSettings, stepType, edgeMidpoint, addedMark, arrowLineOf, isEdgeActs, penValuesOf, planActs, lineSegmentsOf, planClick, planCornerClick, cornerAt, cornerStorage, cornerPoint, shapePath, EDGE_CYCLE, CORNER_RADIUS, CORNER_VALUES, SUDOKUPAD_PEN_COLORS, THICKNESS, OPACITY, FULL_WIDTH_VALUES, LIGHTNESS_FACTOR, GREY_CHROMA, HOLD_TO_EDIT_MS, createStep, STEP_LABELS }
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
    // Read before any step runs, so only the startup check can have turned the colors step off.
    const hasColorTool = !steps.colors.off
    trackButton()
    steps.lineErase.run(() => installLineErase(app, ToolPen.tool))
    steps.arrowLines.run(() => installArrowLines(app, ToolPen.tool))
    steps.marks.run(() => installMarks(app, ToolPen.tool))
    steps.pages.run(() => installPenPages(ToolPen.tool))
    steps.dragHint.run(() => installHintLayer(ToolPen.tool))
    steps.colors.run(installHoldToEdit)
    steps.penPanel.run(installPenPanel)
    watchControls()
    installOverlayPressSwallow()
    effectsOf(SETTING_NAMES).forEach((effect) => effect())
    applyStyle()
    Framework.addSetting({
      tag: 'button',
      name: 'pentoolextras',
      group: SETTINGS_GROUP,
      content: 'Pen Tool Extras',
      handler: () => {
        closeDialogKeepingGrid()
        setTimeout(openDialog, 0)
      }
    })
    const start = startupPenColors(Framework.getData(COLORS_KEY), hasColorTool)
    if (start.load) return adoptColors(start.load)
    if (start.save) return saveColors(start.save)
    // The install save, once: page 1 darkened.
    const tool = await waitForColorTool()
    // A save made in the dialog while waiting outranks it.
    if (readPenColors(Framework.getData(COLORS_KEY))) return
    // Tried even with the colors step off since startup (edit mode failing to install): only a failure to read page 1 itself leaves nothing saved, reported as the step's.
    let derived = null
    try {
      derived = presetFromTool(tool, PAGE_PRESETS[0])
    } catch (error) {
      steps.colors.skip(error)
    }
    if (derived) saveColors(derived)
  })
})()
