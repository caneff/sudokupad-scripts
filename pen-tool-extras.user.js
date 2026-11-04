// ==UserScript==
// @name         SudokuPad Pen Tool Extras
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      1.7.0
// @description  Pen tool extras: sets the pen's nine colors to your current cell color page, darkened (or your own, saved in a settings dialog or by holding a pen color button), adds a second page of nine pens that draw the same colors as dotted (or dashed) lines and a third page of nine that draw a thin line with a run of chevrons pointing the way the line was dragged (a page button, Tab or the mouse wheel changes page; lines in those pens are invisible without this script), puts two sliders in the pen tool's panel (each can be hidden in the settings dialog, which also holds both) for how thick pen lines, circles, crosses, edge marks and corner marks are and how see-through the pen layer is, lets the dialog set how long the page 2 dashes are, moves the pen's line mode pulldown into the settings dialog, and adds direction arrows and a circle to the marks a click on a cell edge cycles through, plus an X and a circle for a click near a grid corner. Relies on SudokuPad internals for the pages, the edge and corner marks and the panel's two sliders, so an update can break them.
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
  const VERSION = '1.7.0'
  // The settings group the entry goes in; SudokuPad declares it, and the dialog starts it collapsed.
  const SETTINGS_GROUP = 'experimental'
  // PenColor_colors and EdgeMarks_marks are the keys the scripts this one replaced saved under;
  // PenColor_thickness and PenColor_opacity are new.
  const COLORS_KEY = 'PenColor_colors'
  const THICKNESS_KEY = 'PenColor_thickness'
  const OPACITY_KEY = 'PenColor_opacity'
  // The dash length of page 2 and which panel sliders show are the script's own keys too.
  const DASH_KEY = 'PenColor_dash'
  const SLIDERS_SHOWN_KEY = 'PenColor_sliders'
  // The `id` of each slider in the pen tool's panel; the input handler tells them apart by it.
  const THICKNESS_SLIDER = 'pen-tool-extras-thickness'
  const OPACITY_SLIDER = 'pen-tool-extras-opacity'
  // The `id` of the editor inside this script's dialog.
  const EDITOR_ID = 'pen-tool-extras-editor'
  // The block of both sliders in the pen tool's panel, and the row of each.
  const SLIDERS = 'pen-tool-extras-sliders'
  const SLIDER_ROW = 'pen-tool-extras-slider'
  // SudokuPad's line mode pulldown (`.penlinemode`), which this script hides and offers in its dialog instead.
  // `ToolPen_linemode` is where SudokuPad saves the mode; its three values and SudokuPad's own labels.
  const LINE_MODE_BOX = '.tool-pen .penlinemode'
  const LINE_MODE_KEY = 'ToolPen_linemode'
  const LINE_MODES = [['both', 'Center & Edge'], ['centeronly', 'Center only'], ['edgeonly', 'Edge only']]
  const MARKS_KEY = 'EdgeMarks_marks'
  const STYLE_ID = 'pen-tool-extras-style'
  // The element SudokuPad draws the grid in.
  const GRID_SELECTOR = '#svgrenderer'
  // The group SudokuPad draws every pen stroke in.
  const PEN_LAYER = '#cell-pen'
  // The group the drag highlight (`.penhint`, and the erase highlight, which is the same element) is moved
  // to while a line is dragged, so the pen layer's opacity does not fade it. It sits right above the pen layer.
  const HINT_LAYER_ID = 'pen-tool-extras-hint'
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
  // `MouseEvent.button` of the right mouse button.
  const RIGHT_BUTTON = 2
  const PEN_COLORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  // The pages of pens, in paging order. Each page's characters line up with PEN_COLORS: the pen on button
  // N is the Nth character, and its color is color N, so a recolor changes the pen on every page. A
  // character is the one a stroke stores after its value and the replay holds (`pc:a`), which draws,
  // undoes and replays for any lowercase letter (docs/research/sudokupad-pen-tool.md, "Pen colors past
  // nine"). The first page is SudokuPad's own and must stay first: its characters are the only ones stock
  // SudokuPad can select. A dotted page draws its lines as dots. A pen value has no direction, so a chevron page's
  // pen is two characters: the one on its button (`chars`) for a line dragged the way SudokuPad draws the value, and
  // the `reverse` one at the same index for a line dragged the other way. Only the first is ever selected.
  const PEN_PAGES = [
    { chars: PEN_COLORS, dotted: false },
    { chars: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], dotted: true },
    { chars: ['j', 'l', 'n', 'p', 'r', 't', 'v', 'x', 'z'], reverse: ['k', 'm', 'o', 'q', 's', 'u', 'w', 'y', '0'], dotted: false, chevrons: true }
  ]
  // The key the selected pen character is saved under. `ToolPen_color` is SudokuPad's own and stays a
  // digit: stock SudokuPad throws when the pen tool opens on a letter there, and this script may be
  // removed with the letter still saved.
  const PEN_KEY = 'PenColor_pen'
  // The panel's own key of a page button, and the attribute of each color button that names the page its pen is on.
  const PAGE_BUTTON = 'pen-tool-extras-page'
  const PAGE_ATTRIBUTE = 'data-pen-page'
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
  // The thickness setting, which the pen tool's panel and the settings dialog both have a slider for. SudokuPad draws free lines, the cell circle and the cross 5 wide
  // (in its cell units, a cell being 64) and the edge X 2.5 wide; the slider's value is the first
  // width, and everything else scales with it, so an edge mark is always half of it.
  const THICKNESS = { min: 1, max: 16, step: 1, fallback: 5 }
  const MARK_PER_THICKNESS = 0.5
  // The edge and corner marks keep their size up to the default thickness and grow gradually above it, to
  // 1 + MARK_GROWTH times at the largest, by a CSS scale (which also changes marks already drawn) about the
  // middle of the mark, which is the point it is centred on.
  const MARK_GROWTH = 0.3
  // The length of a page 2 dash in line widths, from the dots of today (0) to longer dashes.
  const DASH = { min: 0, max: 8, step: 1, fallback: 0 }
  // The least space between two dashes, in line widths, measured between the round caps' ends (so the dash-to-dash
  // gap is one line width more, the caps' two half widths).
  const MIN_DASH_GAP_PER_THICKNESS = 1.3
  // The opacity setting, in percent, which the panel and the dialog both have a slider for. SudokuPad draws every pen mark with `.cell-pen { opacity: 0.8 }`
  // (tool-pen.css), so 80 is the fallback and leaves the marks as they are; 100 is solid, and 20 is the
  // floor where a mark still shows.
  const OPACITY = { min: 20, max: 100, step: 5, fallback: 80 }
  // The pen values (the `pen-<value>` class of a stroke) SudokuPad draws at the full width, from
  // `docs/research/sudokupad-pen-edge-marks.md`: the free lines, and 5 and 6 (the cell circle and
  // cross). Left out on purpose: 3, 4, b and c (the edge X marks, half the width), and h to y (the
  // arrows, circles and grid-corner marks this script adds, also half).
  const FULL_WIDTH_VALUES = ['1', '2', '5', '6', '7', '8', '9', 'a', 'd', 'e', 'f', 'g']
  // The lines among them, which a dotted page draws as dots: the cell circle and cross (5 and 6) stay solid.
  // The diagonal ones span a cell's diagonal, 64 * sqrt(2), the others one side, 64 (a cell is 64 units).
  const DIAGONAL_LINES = ['d', 'e', 'f', 'g']
  const ORTHOGONAL_LINES = FULL_WIDTH_VALUES.filter((v) => v !== '5' && v !== '6' && !DIAGONAL_LINES.includes(v))
  const CELL_UNITS = 64
  // The distance between dot centres, in line widths. Snapped per line so a segment holds whole dots.
  const DOT_SPACING_PER_THICKNESS = 2
  // The pen value of SudokuPad's own edge X on the right, bottom, left and top edge of a cell.
  // An edge between two cells is stored on one of them, so a click on it is always one of
  // these four values.
  const EDGE_X = ['3', '4', 'b', 'c']
  // The values this script adds, per edge: the first direction, the second direction, the circle.
  // SudokuPad's own pen values stop at `g`, so `h` onward are free. They stay lowercase letters:
  // SudokuPad lowercases a pen value when it undoes or replays one.
  const ADDED = { 3: ['h', 'i', 'j'], 4: ['k', 'l', 'm'], b: ['n', 'o', 'p'], c: ['q', 'r', 's'] }
  // The two directions of a vertical edge, then of a horizontal one.
  const SHAPES = { 3: ['>', '<'], 4: ['^', 'v'], b: ['>', '<'], c: ['^', 'v'] }
  // The types of mark in cycle order, and the setting that ticks each. `directions` is the one
  // checkbox for dirA and dirB.
  const EDGE_CYCLE = {
    types: ['x', 'dirA', 'dirB', 'dot'],
    setting: { x: 'x', dirA: 'directions', dirB: 'directions', dot: 'dot' }
  }
  // A grid corner has no edge direction for an arrow to name, so it cycles an X and a circle.
  const CORNER_CYCLE = {
    types: ['x', 'dot'],
    setting: { x: 'cornerX', dot: 'cornerDot' }
  }
  const DEFAULT_MARK_SETTINGS = { x: true, directions: true, dot: true, cornerX: true, cornerDot: true }
  // How far from a grid corner, in cells, a click still counts as on the corner. An edge's midpoint
  // is 0.5 from its corners and a cell's middle 0.71, so neither comes near it; the 0.2 is a circle
  // about 12 px across the radius at a cell 60 px wide, and it takes the corner-end of an edge
  // click (SudokuPad's edge zone reaches 0.57 along the side from the midpoint).
  const CORNER_RADIUS = 0.2
  // A grid corner is stored as a mark on one cell. `br` is the bottom right corner of the cell, which
  // is every corner with a cell up and to the left of it, so a corner shared by four cells is stored
  // once; `tl` is the top left corner, for the top and left edge of the grid; `far` is the top right
  // corner of the cell in the top row's last column, or the bottom left corner of the cell in the
  // bottom row's first column, the two grid corners the other kinds cannot reach. Per kind: the X,
  // then the circle, in the order of CORNER_CYCLE.types.
  const CORNER_VALUES = { tl: ['t', 'w'], br: ['u', 'x'], far: ['v', 'y'] }
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

  // Saved data is untrusted: the saved line mode when it is one of the three, else 'both' (SudokuPad's own default).
  function normalizeLineMode (data) {
    return LINE_MODES.some(([value]) => value === data) ? data : LINE_MODES[0][0]
  }

  // The index of the page whose button holds the color character `pen` (a chevron page's reverse characters are on no
  // button, so they are no pen), or -1.
  function penPageOf (pen) {
    return PEN_PAGES.findIndex((page) => page.chars.includes(pen))
  }

  // The number of the color (and of the button) of the pen `pen`, as PEN_COLORS names it; undefined for no pen.
  function penNumber (pen) {
    const page = PEN_PAGES[penPageOf(pen)]
    return page ? PEN_COLORS[page.chars.indexOf(pen)] : undefined
  }

  // The color character of the pen with color number `number` on page `page`.
  function penCharOn (page, number) {
    return PEN_PAGES[page].chars[PEN_COLORS.indexOf(number)]
  }

  // Saved data is untrusted: the saved pen character when it is one of a page, else null. SudokuPad's
  // `getData` parses what it reads, so a saved '3' comes back as the number 3.
  function normalizePen (data) {
    const pen = typeof data === 'number' ? String(data) : data
    return typeof pen === 'string' && penPageOf(pen) !== -1 ? pen : null
  }

  // The page `delta` pages (1 forward, -1 back) from `page`, going round `count` pages.
  function stepPage (page, delta, count) {
    return (((page + delta) % count) + count) % count
  }

  // Saved data is untrusted: the saved thickness when it is a whole number from THICKNESS.min to
  // THICKNESS.max, else THICKNESS.fallback.
  function normalizeThickness (data) {
    const ok = Number.isInteger(data) && data >= THICKNESS.min && data <= THICKNESS.max
    return ok ? data : THICKNESS.fallback
  }

  // Saved data is untrusted: the saved opacity when it is a whole number from OPACITY.min to
  // OPACITY.max on the slider's steps, else OPACITY.fallback.
  function normalizeOpacity (data) {
    const ok = Number.isInteger(data) && data >= OPACITY.min && data <= OPACITY.max && (data - OPACITY.min) % OPACITY.step === 0
    return ok ? data : OPACITY.fallback
  }

  // Saved data is untrusted: the saved dash length when it is a whole number from DASH.min to DASH.max,
  // else DASH.fallback (the dots of today).
  function normalizeDash (data) {
    const ok = Number.isInteger(data) && data >= DASH.min && data <= DASH.max
    return ok ? data : DASH.fallback
  }

  // Saved data is untrusted: { thickness, opacity }, each true (the slider shows in the pen tool's panel)
  // unless saved as the boolean false; data saved before the setting existed shows both.
  function normalizeSliderVisibility (data) {
    const saved = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
    return { thickness: saved.thickness !== false, opacity: saved.opacity !== false }
  }

  // Saved data is untrusted: returns { x, directions, dot, cornerX, cornerDot } with the default
  // (ticked) for any entry that is not a boolean. Data saved before the corner boxes existed has no
  // corner entry, so both read as ticked.
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
    return type === 'x' ? edge : ADDED[edge][EDGE_CYCLE.types.indexOf(type) - 1]
  }

  // The type of mark `direction` steps (1 forward, -1 backward) from `current` ('empty' or a
  // type of `cycle`) round the cycle, skipping unticked types. 'empty' is always allowed. A
  // `current` whose type is unticked still moves on.
  function stepType (current, settings, direction, cycle) {
    const order = [...cycle.types, 'empty']
    const from = order.indexOf(current)
    for (let step = 1; step <= order.length; step++) {
      const type = order[(((from + direction * step) % order.length) + order.length) % order.length]
      if (type === 'empty' || settings[cycle.setting[type]]) return type
    }
    throw new Error('pen-tool-extras: the cycle has no empty step')
  }

  // What one click does to a cell that holds the pen values `present`, on a mark whose types
  // have the pen values `valueOf(type)`: { remove, add }, the values to toggle off and the one to
  // toggle on (or null). Null when nothing in `cycle` is ticked, so the click does nothing.
  // `backwards` steps the cycle the other way.
  function planCycleClick (cycle, valueOf, present, settings, backwards) {
    if (!cycle.types.some((type) => settings[cycle.setting[type]])) return null
    const held = cycle.types.filter((type) => present.includes(valueOf(type)))
    const next = stepType(held.length ? held[0] : 'empty', settings, backwards ? -1 : 1, cycle)
    return {
      remove: held.map(valueOf),
      add: next === 'empty' ? null : valueOf(next)
    }
  }

  // What one click on the edge whose X value is `edge` does to a cell that holds `present`.
  function planClick (edge, present, settings, backwards = false) {
    return planCycleClick(EDGE_CYCLE, (type) => valueOfType(edge, type), present, settings, backwards)
  }

  // What one click on a grid corner stored as `kind` does to a cell that holds `present`.
  function planCornerClick (kind, present, settings, backwards = false) {
    return planCycleClick(CORNER_CYCLE, (type) => CORNER_VALUES[kind][CORNER_CYCLE.types.indexOf(type)], present, settings, backwards)
  }

  // The grid corner (as { row, col } of the corner, 0 to rows and 0 to cols) within CORNER_RADIUS
  // of the point (r, c), in cell units from the grid's top left; null when none is. A point just
  // outside the grid is measured too, so the outer corners can be clicked.
  function cornerAt (r, c, rows, cols) {
    const row = Math.max(0, Math.min(rows, Math.round(r)))
    const col = Math.max(0, Math.min(cols, Math.round(c)))
    return Math.hypot(r - row, c - col) < CORNER_RADIUS ? { row, col } : null
  }

  // The cell and kind that store the grid corner (row, col): see CORNER_VALUES.
  function cornerStorage (row, col, rows, cols) {
    if (row >= 1 && col >= 1) return { kind: 'br', row: row - 1, col: col - 1 }
    if (row < rows && col < cols) return { kind: 'tl', row, col }
    return { kind: 'far', row: row === 0 ? 0 : rows - 1, col: row === 0 ? cols - 1 : 0 }
  }

  // The grid corner, as [row, col] in cell units, that a corner mark of `kind` on the cell at
  // (row, col) sits on: the inverse of cornerStorage. `cols` tells the `far` kind's two cells apart.
  function cornerPoint (kind, row, col, cols) {
    switch (kind) {
      case 'br': return [row + 1, col + 1]
      case 'tl': return [row, col]
      default: return row === 0 && col === cols - 1 ? [row, col + 1] : [row + 1, col]
    }
  }

  // The kind and type ('x' or 'dot') of a value this script adds on a grid corner, or null for any
  // other value.
  function cornerMarkOf (value) {
    for (const kind of Object.keys(CORNER_VALUES)) {
      const index = CORNER_VALUES[kind].indexOf(value)
      if (index !== -1) return { kind, type: CORNER_CYCLE.types[index] }
    }
    return null
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

  // SVG path data, relative to the point the mark is centred on (an edge's midpoint or a grid
  // corner), for a shape. `s` is the half-size in SudokuPad's units. An arrow is a chevron whose
  // tip points the way it names; the circle is an open ring, two arcs from the left point round
  // and back; 'x' is SudokuPad's own edge X.
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

  // The ten line values in the order lineSegment prefers them: SudokuPad stores a segment on an edge shared by two cells as
  // the right (7) or bottom (8) edge of the cell before it, and as the left (9) or top (a) edge only on the grid's own border.
  const LINE_VALUES = [...ORTHOGONAL_LINES, ...DIAGONAL_LINES]
  // Where `renderPen` starts and ends each line value, as [row, col] offsets in cells from its cell's top left corner. A line
  // dragged from the start to the end is dragged the way SudokuPad draws it (forward); from the end to the start, the other way.
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
  // The sizes of a chevron line, in line widths (the thickness setting; the line's own width follows it all the way down, but a
  // chevron is never smaller than at the default thickness, so its direction stays visible at 1): a chevron's wings reach `halfLength` back and
  // `halfWidth` out from its middle and its tip `halfLength` forward; `line` and `stroke` are the widths of the thin line and the
  // chevrons; `spacing` is the distance between two chevrons' middles, fitted to a whole number per segment. The furthest a
  // chevron reaches off its line, halfWidth plus half the stroke at the largest thickness, stays inside what Dark Page keeps
  // past a cell (its `SOLVER_REACH`; a unit test holds the two together).
  const CHEVRON = { halfLength: 0.5, halfWidth: 0.75, stroke: 0.45, line: 0.25, spacing: 2.6 }

  // Which way a line stored with the color character `char` was dragged: true for the character on a chevron page's button
  // (forward), false for its reverse character, null for a character no chevron page uses.
  function chevronWayOf (char) {
    for (const page of PEN_PAGES) {
      if (!page.chevrons) continue
      if (page.chars.includes(char)) return true
      if (page.reverse.includes(char)) return false
    }
    return null
  }

  // The color character a line dragged `forward` (or not) is stored with when pen `pen` is selected: the pen's own character,
  // except on a chevron page for a line dragged the other way.
  function directionCharOf (pen, forward) {
    const page = PEN_PAGES[penPageOf(pen)]
    return !page || !page.chevrons || forward ? pen : page.reverse[page.chars.indexOf(pen)]
  }

  // The value, cell and way of the segment of a drag from `from` to `to` (each { r, c }, in cells from the grid's top left, the
  // way SudokuPad's pen tool holds its path), as SudokuPad stores it; null for two points that are not a segment.
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

  // The actions of a drag with the pen `pen` selected, in place of the ones SudokuPad's pen tool queued: a pen action for a
  // line value gets the color character of the way its cells were dragged, so a drag with turns stores each segment's way. The
  // tool queues one select and one pen action for each value over all the cells that hold it, whichever way each was dragged;
  // here the cells of the two ways are split into two actions of the same group, so one undo still takes the whole drag back.
  // `path` is the tool's path of the drag. Throws RangeError for a cell the path has no segment for.
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

  // The corners of a chevron, wing, tip, wing, as [x, y] points: its middle at (x, y), pointing along the unit vector (ux, uy),
  // its wings `half` back and `wide` out from the middle and its tip `half` forward.
  function chevronCorners (x, y, ux, uy, half, wide) {
    return [[x - ux * half - uy * wide, y - uy * half + ux * wide], [x + ux * half, y + uy * half], [x - ux * half + uy * wide, y - uy * half - ux * wide]]
  }

  // A point as path data text, to 2 places.
  const pointText = ([x, y]) => `${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`

  // The path data of a chevron line, in the renderer's units (a cell is CELL_UNITS), for the line value `value` on the cell at
  // (row, col) dragged `forward` or not, at `thickness`: { line, chevrons, lineWidth, chevronWidth }. The line is the whole
  // segment, thin; each chevron is wing, tip, wing, the tip toward the way it was dragged. Whole chevrons are fitted to the
  // segment, each in the middle of its share of it, so two segments in a row space them alike across their join.
  function chevronLine (value, forward, row, col, thickness) {
    const [start, end] = LINE_PATHS[value]
    const [from, to] = (forward ? [start, end] : [end, start]).map(([r, c]) => [(col + c) * CELL_UNITS, (row + r) * CELL_UNITS])
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    const [ux, uy] = [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
    // Chevrons keep the size they have at the default thickness below it; only the thin line gets thinner.
    const size = Math.max(thickness, THICKNESS.fallback)
    const [half, wide] = [CHEVRON.halfLength * size, CHEVRON.halfWidth * size]
    // The shortest segment (a cell side) holds at least two even at the largest thickness, so there is never none.
    const count = Math.round(length / (CHEVRON.spacing * size))
    let chevrons = ''
    for (let i = 0; i < count; i++) {
      const along = (i + 0.5) * length / count
      const [wing, tip, other] = chevronCorners(from[0] + ux * along, from[1] + uy * along, ux, uy, half, wide)
      chevrons += `M${pointText(wing)}L${pointText(tip)}L${pointText(other)}`
    }
    return {
      line: `M${pointText(from)}L${pointText(to)}`,
      chevrons,
      lineWidth: CHEVRON.line * thickness,
      chevronWidth: CHEVRON.stroke * size
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

  // How much an edge or corner mark is scaled at `thickness`: 1 up to the default thickness, then growing
  // evenly to 1 + MARK_GROWTH at THICKNESS.max.
  function markGrowthScale (thickness) {
    if (thickness <= THICKNESS.fallback) return 1
    const grown = 1 + MARK_GROWTH * (thickness - THICKNESS.fallback) / (THICKNESS.max - THICKNESS.fallback)
    return Math.round(grown * 1e4) / 1e4
  }

  // Sets the stroke widths, for strokes drawn already and new ones: FULL_WIDTH_VALUES at
  // `thickness`; SudokuPad's edge X marks and this script's arrows and circles at half of it. The marks
  // are also scaled by markGrowthScale about their middle (`fill-box` is the path's own box, which is
  // centred on the edge midpoint or corner), and their stroke width is divided by that scale so the
  // stroke ends up as thick as it was and only the mark's length grows. Lines are never scaled.
  // `:root:root` outranks SudokuPad's `.cell-pen` and `.pen-3` width rules whichever stylesheet
  // loads last, and the two lists share no value, so no value has two width rules.
  function buildThicknessCss (thickness) {
    if (normalizeThickness(thickness) !== thickness) throw new RangeError(`pen-tool-extras: ${thickness} is not a thickness from ${THICKNESS.min} to ${THICKNESS.max}`)
    const selector = (values) => values.map((v) => `:root:root .cell-pen.pen-${v}`).join(', ')
    const marks = [...EDGE_X.flatMap((edge) => [edge, ...ADDED[edge]]), ...Object.values(CORNER_VALUES).flat()]
    const scale = markGrowthScale(thickness)
    return [
      `${selector(FULL_WIDTH_VALUES)} { stroke-width: ${thickness}; }`,
      `${selector(marks)} { stroke-width: ${thickness * MARK_PER_THICKNESS / scale}; transform: scale(${scale}); transform-box: fill-box; transform-origin: center; }`
    ].join('\n')
  }

  // Sets the opacity of every pen stroke, for strokes drawn already and new ones. SudokuPad's own rule
  // gives each stroke path `opacity: 0.8`, and each segment of a line is its own path, so strokes that
  // overlap darken where they do. Here the paths are solid and the group they are drawn in carries the
  // opacity, so the layer fades as one picture and an overlap shows the same as the rest of its stroke
  // (where two colors cross, the later one covers the earlier). `:root:root` outranks SudokuPad's rule
  // whichever stylesheet loads last.
  function buildOpacityCss (opacity) {
    if (normalizeOpacity(opacity) !== opacity) throw new RangeError(`pen-tool-extras: ${opacity} is not an opacity from ${OPACITY.min} to ${OPACITY.max} in steps of ${OPACITY.step}`)
    return `:root:root .cell-pen { opacity: 1; }\n:root:root ${PEN_LAYER} { opacity: ${opacity / 100}; }`
  }

  // How much shorter than an even split of a segment the dot spacing is. With the spacing exactly `length / dots`
  // the last dot falls on the segment's end, where the browser draws no zero-length dash, so a line's far end
  // would have no dot; this puts it a hair before the end (0.0064 of a unit on a cell of 64).
  const END_DOT_SHRINK = 0.9999
  // The dashes of a page 2 line of `length` at `thickness` and a dash length of `dash` line widths, as the
  // declarations `stroke-dasharray` and (for a dash) `stroke-dashoffset`. Each segment of a line is its own
  // path with its own pattern, so a whole number of periods is fitted to the segment's `length`: with a dash of 0
  // that is the dots of today (a zero-length dash with the round cap, spaced DOT_SPACING_PER_THICKNESS line widths,
  // the last dot a hair before the end, which is the segment's end where the browser draws no zero-length dash);
  // with a dash, the pattern is shifted to start half a gap in, so a segment starts and ends with half a gap and
  // the two halves at a cell boundary make one gap like the rest. A dash too long for the segment to hold a gap
  // of MIN_DASH_GAP_PER_THICKNESS line widths is shortened to leave one, so a page 2 line never draws solid.
  function dashDeclarations (thickness, dash, length) {
    if (dash === 0) {
      return `stroke-dasharray: 0 ${END_DOT_SHRINK * length / Math.max(1, Math.round(length / (DOT_SPACING_PER_THICKNESS * thickness)))};`
    }
    const minGap = MIN_DASH_GAP_PER_THICKNESS * thickness
    let periods = Math.max(1, Math.round(length / ((dash + DOT_SPACING_PER_THICKNESS) * thickness)))
    while (periods > 1 && length / periods - dash * thickness < minGap) periods--
    const period = length / periods
    const on = Math.min(dash * thickness, period - minGap)
    return `stroke-dasharray: ${on} ${period - on}; stroke-dashoffset: ${on + (period - on) / 2};`
  }

  // A chevron page's swatch: a thin line and two chevrons, cut out of the button's pen-colored square, so a recolor follows.
  const CHEVRON_SWATCH = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23000\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M2 12H22\' stroke-width=\'1.4\'/%3E%3Cpath d=\'M6 6L11 12L6 18M14 6L19 12L14 18\' stroke-width=\'2.6\'/%3E%3C/svg%3E") center / 100% no-repeat'
  // The look of the pages after the first, which SudokuPad's own CSS knows nothing about: each pen
  // character strokes in the color of its partner on the first page, a dotted page's lines are dots
  // (a zero-length dash with the round cap `.cell-pen` already has, spaced by `thickness`, so they
  // scale with the slider; the dash setting lengthens each dot into a dash), and its buttons' swatches are dots too. `:root:root` outranks SudokuPad's
  // own rules whichever stylesheet loads last.
  function buildPagesCss (thickness, dash) {
    if (normalizeThickness(thickness) !== thickness) throw new RangeError(`pen-tool-extras: ${thickness} is not a thickness from ${THICKNESS.min} to ${THICKNESS.max}`)
    if (normalizeDash(dash) !== dash) throw new RangeError(`pen-tool-extras: ${dash} is not a dash length from ${DASH.min} to ${DASH.max}`)
    const rules = []
    PEN_PAGES.forEach((page, index) => {
      if (index === 0) return
      page.chars.forEach((char, i) => [char, ...(page.reverse ? [page.reverse[i]] : [])].forEach((c) => rules.push(`.pencolor-${c} { stroke: var(--puzzle-pencolor-${PEN_COLORS[i]}); }`)))
      if (page.chevrons) PEN_COLORS.forEach((n) => rules.push(`.tool-pen button[data-key="${n}"][${PAGE_ATTRIBUTE}="${index + 1}"]:after { background-color: var(--puzzle-pencolor-${n}); -webkit-mask: ${CHEVRON_SWATCH}; mask: ${CHEVRON_SWATCH}; }`))
      if (!page.dotted) return
      const colors = `:is(${page.chars.map((char) => `.pencolor-${char}`).join(',')})`
      const lines = (values, length) => `:root:root .cell-pen:is(${values.map((v) => `.pen-${v}`).join(',')})${colors} { ${dashDeclarations(thickness, dash, length)} }`
      rules.push(lines(ORTHOGONAL_LINES, CELL_UNITS), lines(DIAGONAL_LINES, CELL_UNITS * Math.SQRT2))
      PEN_COLORS.forEach((n) => rules.push(
        `.tool-pen button[data-key="${n}"][${PAGE_ATTRIBUTE}="${index + 1}"]:after { background-color: transparent; background-image: radial-gradient(circle, var(--puzzle-pencolor-${n}) 0.14rem, transparent calc(0.14rem + 0.5px)); background-size: 25% 25%; background-position: center; }`))
    })
    return rules.join('\n')
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

  // The pen tool's panel: SudokuPad draws `.penlinemode` as a box across the panel's last row, 4rem
  // tall, absolutely placed in `.controls-input`. That box is hidden, and the row holds the two sliders
  // and the page button instead, so the pad is no taller.
  // SudokuPad's purple, as its own icons draw it.
  const PANEL_COLOR = '#6a1b9a'
  // The row `.penlinemode` fills (SudokuPad's own CSS puts it 13rem down `.controls-input`, 4rem tall).
  const PANEL_ROW_TOP_REM = 13
  const PANEL_ROW_HEIGHT_REM = 4
  // The page button is a square the height of the row at its right end, and the sliders stop short of it.
  const PAGE_BUTTON_WIDTH_REM = PANEL_ROW_HEIGHT_REM
  const PAGE_GAP_REM = 0.5
  // The stroke width of the line picture on each slider's left, in its 20 x 16 view box.
  const LINE_PICTURE_WIDTH = 3.4
  // The height of each slider row; a hidden slider's empty row has the same, so the other keeps its place.
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

  // A slanted line, the picture of a slider: its width says Thickness, its fading says Opacity.
  const linePicture = (width, strokeOpacity) =>
    `<svg viewBox="0 0 20 16" fill="none" stroke="currentColor" stroke-width="${width}" stroke-opacity="${strokeOpacity}" stroke-linecap="round" aria-hidden="true"><path d="M3 13 L17 3"/></svg>`

  // The markup of the panel sliders that show, Thickness above Opacity, at the given values; `show` says which
  // do. A hidden slider is an empty row of the same height, so the other keeps its place, and with both
  // hidden there is no block at all, so the panel has nothing left over. Neither slider takes keyboard
  // focus by tabbing (`tabindex="-1"`): a drag ends with the focus handed back to the page.
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

  // The page button's picture: a sample of the line the button turns to (dots or, with a dash length, dashes
  // on a dotted page, else a solid line) in the panel's colour, under a dot for each page with the current one
  // filled, as SudokuPad's color tool's page button has. The sample line runs from (12, 54) to (52, 26); a
  // dash is drawn at each end of it, `dash` line widths long and no longer than 0.42 of the line.
  const SAMPLE_FROM = [12, 54]
  const SAMPLE_TO = [52, 26]
  const SAMPLE_WIDTH = 7.2
  const SAMPLE_DASH_SHARE = 0.42
  // The chevron sample: its thin line and chevron widths, a chevron's half extents (as CHEVRON's), and where along the line
  // the three sit, as shares of its length.
  const SAMPLE_CHEVRON = { line: 2.4, stroke: 4.4, half: 4, wide: 7, at: [0.25, 0.5, 0.75] }
  function renderPageIcon (current, dash) {
    const next = PEN_PAGES[stepPage(current, 1, PEN_PAGES.length)]
    const kind = next.chevrons ? 'chevrons' : !next.dotted ? 'solid' : dash === 0 ? 'dotted' : 'dashed'
    let sample
    const [dx, dy] = [SAMPLE_TO[0] - SAMPLE_FROM[0], SAMPLE_TO[1] - SAMPLE_FROM[1]]
    const length = Math.hypot(dx, dy)
    if (kind === 'chevrons') {
      // a thin line and three chevrons along it, tips toward the line's end
      sample = `<path d="M${SAMPLE_FROM.join(' ')} L${SAMPLE_TO.join(' ')}" stroke-width="${SAMPLE_CHEVRON.line}" stroke-linecap="round" fill="none" data-sample-line/>` +
        SAMPLE_CHEVRON.at.map((t) => {
          const [wing, tip, other] = chevronCorners(SAMPLE_FROM[0] + dx * t, SAMPLE_FROM[1] + dy * t, dx / length, dy / length, SAMPLE_CHEVRON.half, SAMPLE_CHEVRON.wide)
          return `<path d="M${pointText(wing)} L${pointText(tip)} L${pointText(other)}" stroke-width="${SAMPLE_CHEVRON.stroke}" stroke-linecap="round" stroke-linejoin="round" fill="none" data-chevron/>`
        }).join('')
    } else if (kind === 'dotted') {
      sample = [0, 1, 2, 3, 4].map((k) => `<circle cx="${14 + 9 * k}" cy="${52 - 7 * k}" r="3.6" fill="currentColor" stroke="none"/>`).join('')
    } else if (kind === 'dashed') {
      const share = Math.min(dash * SAMPLE_WIDTH, SAMPLE_DASH_SHARE * length) / length
      const point = (t) => `${(SAMPLE_FROM[0] + dx * t).toFixed(1)} ${(SAMPLE_FROM[1] + dy * t).toFixed(1)}`
      sample = [[0, share], [1 - share, 1]].map(([a, b]) =>
        `<path d="M${point(a)} L${point(b)}" stroke-width="${SAMPLE_WIDTH}" stroke-linecap="round" fill="none" data-dash/>`).join('')
    } else {
      sample = `<path d="M${SAMPLE_FROM.join(' ')} L${SAMPLE_TO.join(' ')}" stroke-width="${SAMPLE_WIDTH}" stroke-linecap="round" fill="none"/>`
    }
    const dots = PEN_PAGES.map((_, i) =>
      `<circle cx="${54 - 8 * (PEN_PAGES.length - i - 1)}" cy="10" r="3" data-page-dot="${i === current ? 'filled' : 'outline'}"${i === current ? '' : ' fill="none"'}/>`)
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 64 64" stroke="currentColor" fill="currentColor" stroke-width="1">' +
      `<g data-page-sample="${kind}">${sample}</g><g>${dots.join('')}</g></svg>`
  }

  // A small picture of each edge mark, drawn in the text color: the X, the arrows, the circle.
  const MARK_PICTURES = {
    x: '<path d="M3 3 L13 13 M13 3 L3 13"/>',
    directions: '<path d="M1 4 L4 8 L1 12 M15 4 L12 8 L15 12"/>',
    dot: '<circle cx="8" cy="8" r="5.2"/>'
  }
  const markPicture = (key) =>
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MARK_PICTURES[key]}</svg>`

  function missingNote (missing) {
    if (!missing.length) return ''
    const list = (missing.length === 1 ? 'pen color ' : 'pen colors ') + missing.join(', ')
    return `<div style="margin:6px 0;max-width:20em">The current cell color page has no usable color at the matching button, so ${list} keep${missing.length === 1 ? 's' : ''} SudokuPad's own.</div>`
  }

  // The pen's line mode choice, in place of SudokuPad's own pulldown in the panel, which this script hides.
  // `lineMode` is undefined when the page has no pen tool, and the choice is left out.
  function lineModeChoice (lineMode) {
    if (lineMode === undefined) return ''
    const options = LINE_MODES.map(([value, label]) => `<option value="${value}"${value === lineMode ? ' selected' : ''}>${label}</option>`).join('')
    return '<div style="font-weight:600;margin-top:10px">Pen line mode</div>' +
      `<select data-line-mode style="margin:4px 0;font-size:1rem">${options}</select>`
  }

  // The dialog's body at the state it holds: the nine pen colors as a 3 by 3 grid in the order of the pen
  // tool's buttons (1 2 3, 4 5 6, 7 8 9), each with its number; the two slider boxes and the three sliders;
  // the mark boxes; the line mode. A slider here is a draft that takes effect on Save, so the panel's own
  // sliders and these show the same value when the dialog opens.
  function renderEditor (state) {
    const cells = PEN_COLORS.map((n) =>
      '<div style="display:flex;align-items:center;gap:8px">' +
      `<b style="width:1.2em;text-align:right">${n}</b>` +
      `<input type="color" data-pen="${n}" value="${state.colors[n]}"></div>`
    ).join('')
    const grid = `<div style="display:grid;grid-template-columns: repeat(3, max-content);gap:6px 18px;margin:4px 0">${cells}</div>`
    const box = (key, label, picture = key) =>
      '<div style="margin:4px 0;display:flex;justify-content:flex-start;align-items:center;gap:6px">' +
      `<input type="checkbox" id="pen-tool-extras-mark-${key}" data-mark="${key}"${state.marks[key] ? ' checked' : ''}>` +
      `${markPicture(picture)}<label for="pen-tool-extras-mark-${key}" style="width:auto;text-align:left;margin:0">${label}</label></div>`
    const showBox = (key, label) =>
      '<div style="margin:4px 0;display:flex;justify-content:flex-start;align-items:center;gap:6px">' +
      `<input type="checkbox" id="pen-tool-extras-show-${key}" data-show="${key}"${state.show[key] ? ' checked' : ''}>` +
      `<label for="pen-tool-extras-show-${key}" style="width:auto;text-align:left;margin:0">${label}</label></div>`
    const slider = (key, label, range, value) =>
      '<div style="margin:4px 0;display:flex;align-items:center;gap:8px">' +
      `<label for="pen-tool-extras-setting-${key}" style="width:auto;text-align:left;min-width:9em;margin:0">${label}</label>` +
      `<input type="range" data-setting="${key}" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}" id="pen-tool-extras-setting-${key}">` +
      `<output data-readout="${key}" style="min-width:2.4em">${value}</output></div>`
    return '<div style="font-weight:600">Pen colors</div>' + grid +
      missingNote(state.missing) +
      '<div style="font-weight:600;margin-top:10px">Sliders</div>' +
      showBox('thickness', 'Show thickness slider') + showBox('opacity', 'Show opacity slider') +
      slider('thickness', 'Thickness', THICKNESS, state.thickness) +
      slider('opacity', 'Opacity (%)', OPACITY, state.opacity) +
      slider('dash', 'Dash length (page 2)', DASH, state.dash) +
      '<div style="font-weight:600;margin-top:10px">Edge marks a click cycles through</div>' +
      box('x', 'X') + box('directions', 'Directions (&gt; &lt; ^ v)') + box('dot', 'Circle') +
      '<div style="font-weight:600;margin-top:10px">Corner marks a click near a grid corner cycles through</div>' +
      box('cornerX', 'X', 'x') + box('cornerDot', 'Circle', 'dot') +
      lineModeChoice(state.lineMode)
  }

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
      normalizeOpacity,
      buildOpacityCss,
      PEN_PAGES,
      LINE_VALUES,
      directionCharOf,
      chevronWayOf,
      CHEVRON,
      lineSegment,
      splitLineActs,
      chevronLine,
      penPageOf,
      penNumber,
      penCharOn,
      normalizePen,
      stepPage,
      normalizeLineMode,
      LINE_MODES,
      buildPagesCss,
      renderPageIcon,
      renderPanelSliders,
      renderEditor,
      markGrowthScale,
      DASH,
      normalizeDash,
      normalizeSliderVisibility,
      normalizeMarkSettings,
      stepType,
      planClick,
      planCornerClick,
      cornerAt,
      cornerStorage,
      cornerPoint,
      cornerMarkOf,
      shapeOf,
      shapePath,
      EDGE_CYCLE,
      CORNER_RADIUS,
      CORNER_VALUES,
      DEFAULT_COLORS,
      DEFAULT_MARK_SETTINGS,
      THICKNESS,
      OPACITY,
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
  // The thickness, opacity and page 2 dash length in force, and which panel sliders show.
  let activeThickness = THICKNESS.fallback
  let activeOpacity = OPACITY.fallback
  let activeDash = DASH.fallback
  let activeShow = normalizeSliderVisibility(null)
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

  // The point (as [row, col] in cell units) and shape that the value this script adds draws at, on
  // the cell at (row, col); null for any other value.
  function addedMark (value, row, col) {
    const shape = shapeOf(value)
    if (shape !== null) return { point: edgeMidpoint(edgeOf(value), row, col), shape }
    const corner = cornerMarkOf(value)
    if (corner === null) return null
    const { cols } = Framework.app.grid
    return { point: cornerPoint(corner.kind, row, col, cols), shape: corner.type === 'x' ? 'x' : CIRCLE }
  }

  // Whether the chevron line `opts` asks `renderPen` for was dragged forward (true or false), when its value is a line and its
  // class holds a page 3 color character (`cell-pen pen-1 pencolor-j`); null for anything else.
  function chevronOf (opts) {
    const match = /(?:^|\s)pencolor-(\S+)$/.exec(opts.className || '')
    return match && LINE_VALUES.includes(opts.value) ? chevronWayOf(match[1]) : null
  }

  // Draws a chevron line as a group (in the pen layer, with the classes the line would have had, so the color, the opacity and the
  // eraser's lookups act on it as on any stroke) of a thin line and a path of chevrons, each with its own width.
  function renderChevronLine (renderer, opts, forward) {
    const shape = chevronLine(opts.value, forward, opts.row, opts.col, activeThickness)
    const group = renderer.renderPart({ target: 'cell-pen', type: 'g', attr: { class: opts.className } })
    ;[['line', shape.line, shape.lineWidth], ['chevrons', shape.chevrons, shape.chevronWidth]].forEach(([name, d, width]) => {
      const path = document.createElementNS(SVG_NAMESPACE, 'path')
      path.setAttribute('d', d)
      path.setAttribute('stroke-width', String(width))
      path.setAttribute('data-chevron-part', name)
      group.appendChild(path)
    })
    return group
  }

  // Draws the values this script adds. SudokuPad's own `renderPen` has no case for them and
  // gives the path no `d`; it copies every option onto the path, so passing `d` is enough. A line in a page 3
  // pen's color is drawn as a chevron line instead.
  function wrapRenderPen (proto, renderer) {
    const original = proto.renderPen
    const size = renderer.constructor.CellSize
    proto.renderPen = function (opts = {}) {
      const forward = chevronOf(opts)
      if (forward !== null) return renderChevronLine(this, opts, forward)
      const mark = addedMark(opts.value, opts.row, opts.col)
      if (mark === null) return original.call(this, opts)
      const d = this.constructor.rcToPathData([mark.point]) + shapePath(mark.shape, size * 0.125)
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

  // The events that end a press. SudokuPad's pen tool takes its click from `mouseup` (seen live), and
  // a touch ends with `pointerup`, `touchend` and a compatibility `mouseup`, so all four are swallowed.
  const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'mouseup', 'touchend']

  // Swallows the events that end the current press before the grid sees them, until the next press,
  // which ends the swallowing even when no release came (a close from the keyboard).
  function swallowRelease () {
    const swallow = (event) => event.stopImmediatePropagation()
    const stop = () => {
      RELEASE_EVENTS.forEach((type) => window.removeEventListener(type, swallow, true))
      window.removeEventListener('pointerdown', stop, true)
    }
    RELEASE_EVENTS.forEach((type) => window.addEventListener(type, swallow, true))
    window.addEventListener('pointerdown', stop, true)
  }

  // Closes the open dialog. SudokuPad runs a dialog button's handler on the press and removes the
  // dialog at once, so the release lands on the grid and the pen tool takes it for a click on the
  // cell under the button.
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

  // The grid corner under the pointer, as cornerAt names it, or null: also null while both corner
  // boxes are unticked, so the original hit test handles every click as it did before. SudokuPad's
  // `clickCell` hit-tests `getInputRc()`, the pointer in cell units, and so does this.
  function cornerUnderPointer (tool) {
    if (!markSettings.cornerX && !markSettings.cornerDot) return null
    const { r, c } = tool.getInputRc()
    const { rows, cols } = Framework.app.grid
    return cornerAt(r, c, rows, cols)
  }

  // The pen values a cell holds, without their colors.
  function penValuesOf (cell) {
    return (cell.pen || []).map((valueColor) => valueColor[0])
  }

  // The actions of one click that applies `plan` to `cell`: select it, toggle off what the plan
  // removes, toggle on what it adds.
  function planActs (cell, plan) {
    return [
      { type: 'select', arg: [cell] },
      ...plan.remove.map((arg) => ({ type: 'pen', arg })),
      ...(plan.add === null ? [] : [{ type: 'pen', arg: plan.add }])
    ]
  }

  // A click on a grid corner: this script's corner cycle (backwards after a right click) on the
  // cell that stores the corner, sent as one group like any pen click.
  function clickCorner (tool, corner) {
    const { rows, cols } = Framework.app.grid
    const { kind, row, col } = cornerStorage(corner.row, corner.col, rows, cols)
    const cell = Framework.app.grid.getCell(row, col)
    tool.actStart()
    planActs(cell, planCornerClick(kind, penValuesOf(cell), markSettings, lastButton === RIGHT_BUTTON)).forEach((act) => tool.actAdd(act))
    tool.actSend()
  }

  // Chooses the mark for a click. A click within CORNER_RADIUS of a grid corner is a corner
  // click, checked first. Otherwise the original `clickCell` runs unchanged, so its
  // edge-versus-cell hit test decides what was clicked; its `actSend` is held back to see
  // the actions it queued. An edge click is replaced by this script's cycle (backwards after a
  // right click), and everything else is sent as it was. The actions still go out through
  // `actSend`, one group per click, so one undo reverses one click.
  function wrapClickCell (tool, original) {
    tool.clickCell = function () {
      const corner = cornerUnderPointer(this)
      if (corner !== null) return clickCorner(this, corner)
      const queued = queuedActs(this, original, arguments)
      if (queued === null) return
      let acts = queued
      if (isEdgeActs(queued)) {
        const cell = queued[0].arg[0]
        const plan = planClick(queued[1].arg, penValuesOf(cell), markSettings, lastButton === RIGHT_BUTTON)
        if (plan === null) return
        acts = planActs(cell, plan)
      }
      acts.forEach((act) => this.actAdd(act))
      this.actSend()
    }
  }

  // Whether a click at the pointer's current position would be a corner click or an edge click,
  // the edge found by running the original `clickCell` without sending what it queues.
  function markUnderPointer (tool, original) {
    return cornerUnderPointer(tool) !== null || isEdgeActs(queuedActs(tool, original, []))
  }

  // The pen tool steps a corner or an edge backwards on a right click, so the browser's menu must
  // not open over one. The check runs the same hit test as the click at the pointer, so only a
  // corner or an edge counts: a right click in a cell's middle, with another tool, or off the grid
  // keeps its menu.
  function suppressMarkMenu (app, isMarkClick) {
    document.addEventListener('contextmenu', (event) => {
      if (app.tool === 'pen' && event.target.closest(GRID_SELECTOR) && isMarkClick()) event.preventDefault()
    }, true)
  }

  // Cells drawn before the wrap hold values the old `renderPen` drew as nothing.
  function redrawAddedMarks (app) {
    app.puzzle.cells.forEach((cell) => {
      if ((cell.pen || []).some((valueColor) => addedMark(valueColor[0], cell.row, cell.col) !== null)) cell.renderContent(true)
    })
  }

  // Whether the wrap on `renderPen` is in, so a chevron line is drawn by this script.
  let chevronsDrawn = false

  // Draws every chevron line again: a chevron's size and spacing are fixed when it is drawn, so a change of thickness, and a
  // wrap that came after the cell was drawn, need it. Cells with no chevron line are left alone.
  function redrawChevronLines () {
    if (!chevronsDrawn) return
    Framework.app.puzzle.cells.forEach((cell) => {
      if ((cell.pen || []).some((valueColor) => LINE_VALUES.includes(valueColor[0]) && chevronWayOf(valueColor[1]) !== null)) cell.renderContent(true)
    })
  }

  function installEdgeMarks (app) {
    const tool = typeof ToolPen !== 'undefined' ? ToolPen.tool : undefined
    const renderer = app.svgRenderer
    const proto = renderer ? Object.getPrototypeOf(renderer) : undefined
    const grid = app.grid
    const found = tool && ['clickCell', 'actStart', 'actSend', 'actAdd', 'getInputRc'].every((name) => typeof tool[name] === 'function') &&
      Array.isArray(tool._actList) &&
      grid && typeof grid.getCell === 'function' && Number.isInteger(grid.rows) && Number.isInteger(grid.cols) &&
      proto && typeof proto.renderPen === 'function' &&
      typeof renderer.constructor.rcToPathData === 'function' && typeof renderer.constructor.CellSize === 'number'
    if (!found) {
      console.warn('pen-tool-extras: the pen tool or its renderer was not found, so the edge and corner marks are not installed')
      return
    }
    wrapRenderPen(proto, renderer)
    chevronsDrawn = true
    const original = tool.clickCell
    wrapClickCell(tool, original)
    trackButton()
    suppressMarkMenu(app, () => markUnderPointer(tool, original))
    redrawAddedMarks(app)
    redrawChevronLines()
  }

  // Writes the style for the colors, thickness and opacity in force.
  function applyStyle () {
    let style = document.getElementById(STYLE_ID)
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = [buildCss(active), buildThicknessCss(activeThickness), buildOpacityCss(activeOpacity), buildPagesCss(activeThickness, activeDash), EDIT_CSS, PANEL_CSS].join('\n')
  }

  // The pen's line mode now, or undefined with no pen tool. It is the saved one: SudokuPad's pen tool holds its
  // default until it first opens and reads the saved mode then, and with the pulldown hidden only this dialog
  // changes it. It does not depend on the page support in `installPenPages`.
  function currentLineMode () {
    return typeof ToolPen === 'undefined' ? undefined : normalizeLineMode(Framework.getData(LINE_MODE_KEY))
  }

  // Sets the line mode and saves it where SudokuPad does, so its hidden pulldown, when the pen tool is on, shows it too.
  function applyLineMode (lineMode) {
    ToolPen.tool.lineMode = lineMode
    Framework.setData(LINE_MODE_KEY, lineMode)
    const select = document.querySelector(`${LINE_MODE_BOX} select`)
    if (select) select.value = lineMode
  }

  function openDialog () {
    let colors = { ...active }
    let missing = activeMissing
    // True after Restore defaults until a color is edited: Save then clears the saved set.
    let reset = false
    // The pen colors picked by hand since the dialog opened or Restore defaults. Save with none
    // changes nothing, so a derived set is never saved by accident.
    const edited = new Set()
    let marks = markSettings
    let lineMode = currentLineMode()
    // The sliders and boxes are drafts of what is in force, applied on Save.
    let thickness = activeThickness
    let opacity = activeOpacity
    let dash = activeDash
    let show = activeShow
    let box = null
    const draw = () => {
      box.innerHTML = renderEditor({ colors, missing: missing.filter((n) => !edited.has(String(n))), marks, lineMode, thickness, opacity, dash, show })
    }
    // Reads the color tool's current page now; with no color tool, SudokuPad's own colors.
    const restoreDefaults = () => {
      const tool = readyColorTool()
      const derived = tool ? deriveFromTool(tool) : { colors: { ...DEFAULT_COLORS }, missing: [] }
      colors = derived.colors
      missing = derived.missing
      edited.clear()
      reset = true
      // The sliders and boxes are drafts like the colors: they go back to their defaults on Save, and Cancel
      // leaves what is in force.
      thickness = THICKNESS.fallback
      opacity = OPACITY.fallback
      dash = DASH.fallback
      show = normalizeSliderVisibility(null)
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
                if (Object.keys(marks).some((key) => marks[key] !== markSettings[key])) Framework.setData(MARKS_KEY, marks)
                markSettings = marks
                saveDialogSliders({ thickness, opacity, dash, show })
                if (lineMode !== undefined && lineMode !== currentLineMode()) applyLineMode(lineMode)
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
    draw()
    // `change` fires when a color picker closes (the swatch the user sees is already the new
    // color), when a mark box or a slider box is ticked and when the line mode is chosen.
    // A dialog slider is a draft: its readout moves with it and nothing is applied until Save.
    box.addEventListener('input', (event) => {
      const el = event.target.closest('input[type="range"]')
      if (!el) return
      const value = Number(el.value)
      switch (el.dataset.setting) {
        case 'thickness': thickness = value; break
        case 'opacity': opacity = value; break
        case 'dash': dash = value; break
        default: throw new Error(`pen-tool-extras: the dialog has no slider named ${el.dataset.setting}`)
      }
      box.querySelector(`output[data-readout="${el.dataset.setting}"]`).textContent = String(value)
    })
    box.addEventListener('change', (event) => {
      const mode = event.target.closest('select[data-line-mode]')
      if (mode) {
        lineMode = normalizeLineMode(mode.value)
        return
      }
      const shown = event.target.closest('input[data-show]')
      if (shown) {
        show = { ...show, [shown.dataset.show]: shown.checked }
        return
      }
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
    applyStyle()
    document.querySelectorAll(`.${PICKER} input`).forEach((el) => { el.value = colors[el.dataset.pen] })
  }

  // Makes `thickness` the one in force: the style, and the panel's slider when it is showing.
  function adoptThickness (thickness) {
    activeThickness = thickness
    applyStyle()
    redrawChevronLines()
    document.querySelectorAll(`#${THICKNESS_SLIDER}`).forEach((el) => { el.value = thickness })
  }

  // Makes `opacity` the one in force: the style, and the panel's slider when it is showing.
  function adoptOpacity (opacity) {
    activeOpacity = opacity
    applyStyle()
    document.querySelectorAll(`#${OPACITY_SLIDER}`).forEach((el) => { el.value = opacity })
  }

  // Makes `dash` the page 2 dash length in force: the style, and the page button's picture.
  function adoptDash (dash) {
    activeDash = dash
    applyStyle()
    syncPageButton()
  }

  // Makes `show` the set of panel sliders that show: the sliders in the panel are rebuilt (or taken away).
  function adoptShow (show) {
    activeShow = show
    document.querySelectorAll(`.${SLIDERS}`).forEach((el) => el.remove())
    syncPenPanel()
  }

  // What Save does with the dialog's sliders and boxes: each that differs from what is in force is applied and
  // saved, and one back at its default clears its saved value.
  function saveDialogSliders (draft) {
    const save = (key, value, fallback) => {
      if (value === fallback) Framework.removeData(key)
      else Framework.setData(key, value)
    }
    if (draft.thickness !== activeThickness) {
      save(THICKNESS_KEY, draft.thickness, THICKNESS.fallback)
      adoptThickness(draft.thickness)
    }
    if (draft.opacity !== activeOpacity) {
      save(OPACITY_KEY, draft.opacity, OPACITY.fallback)
      adoptOpacity(draft.opacity)
    }
    if (draft.dash !== activeDash) {
      save(DASH_KEY, draft.dash, DASH.fallback)
      adoptDash(draft.dash)
    }
    if (draft.show.thickness !== activeShow.thickness || draft.show.opacity !== activeShow.opacity) {
      if (draft.show.thickness && draft.show.opacity) Framework.removeData(SLIDERS_SHOWN_KEY)
      else Framework.setData(SLIDERS_SHOWN_KEY, draft.show)
      adoptShow(draft.show)
    }
  }

  // Moving a panel slider sets and saves its value at once. It changes no cell, so nothing goes on the
  // undo stack or in the replay.
  function saveSlider (slider) {
    const value = Number(slider.value)
    if (slider.id === THICKNESS_SLIDER) {
      Framework.setData(THICKNESS_KEY, value)
      adoptThickness(value)
    } else {
      Framework.setData(OPACITY_KEY, value)
      adoptOpacity(value)
    }
  }

  // Keeps the pen tool's panel as this script wants it. SudokuPad builds `.penlinemode` each time
  // the pen tool is turned on and removes it when another tool is; the sliders and the page button are
  // added beside it (it is hidden, not removed, so SudokuPad's own handlers keep their element) and taken
  // away with it. Safe to run any number of times.
  function syncPenPanel () {
    const mode = document.querySelector(LINE_MODE_BOX)
    const sliders = document.querySelector(`.${SLIDERS}`)
    if (!mode) {
      if (sliders) sliders.remove()
      document.querySelectorAll(`.${PAGE_BUTTON}`).forEach((el) => el.remove())
      return
    }
    const markup = renderPanelSliders(activeThickness, activeOpacity, activeShow)
    if (!markup && sliders) sliders.remove()
    if (markup && !sliders) mode.insertAdjacentHTML('afterend', markup)
    syncPageButton()
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

  // The pen tool, once its selection is wrapped for pages; null until then, and when it cannot be.
  let penTool = null

  // The selected pen's color character. SudokuPad's own selection reads `ToolPen_color` with `getData`, which
  // parses a saved '3' into the number 3, so the selection can be a number.
  const selectedPen = () => String(penTool.selectedColor)

  // The index of the page the selected pen is on; the first page before any pen is selected.
  function currentPage () {
    return Math.max(0, penPageOf(selectedPen()))
  }

  // Gives the panel's nine color buttons the pens of page `page`: each keeps its `data-key` and takes the
  // pen's character as its `data-value` (and title), as SudokuPad's color tool does for its pages, since the
  // button press and the selection both read `data-value`. Button 0 is not a pen.
  function setPadPage (page) {
    document.querySelectorAll('.controls-input button[data-key]').forEach((button) => {
      const index = PEN_COLORS.indexOf(button.dataset.key)
      if (index === -1) return
      const pen = PEN_PAGES[page].chars[index]
      button.dataset.value = pen
      button.setAttribute('title', pen)
      button.setAttribute(PAGE_ATTRIBUTE, String(page + 1))
    })
  }

  // The page button, at the right end of the panel's last row: it shows the next page and a dot per page. The picture is
  // only rewritten when what it shows changed, so the panel's mutation watcher does not loop on it.
  function syncPageButton () {
    const mode = document.querySelector(LINE_MODE_BOX)
    if (!penTool || !mode) return
    let button = document.querySelector(`.${PAGE_BUTTON}`)
    if (!button) {
      mode.insertAdjacentHTML('afterend', `<button class="${PAGE_BUTTON}" data-control="penpage" title="Next pen page"></button>`)
      button = document.querySelector(`.${PAGE_BUTTON}`)
    }
    const shown = `${currentPage()}:${activeDash}`
    if (button.dataset.shown === shown) return
    button.innerHTML = renderPageIcon(currentPage(), activeDash)
    button.dataset.shown = shown
  }

  // Selects the pen on the page `delta` pages from the selected one with the same color number: a page
  // turn keeps the color and changes how it draws, and a pen is always selected on the page showing.
  function turnPage (delta) {
    const number = penNumber(selectedPen()) || PEN_COLORS[0]
    penTool.setSelectedColor(penCharOn(stepPage(currentPage(), delta, PEN_PAGES.length), number))
  }

  // The selected pen is saved under PEN_KEY, and `ToolPen_color` keeps only its color number. After a
  // reload SudokuPad has selected that number on the first page; the saved pen replaces it when its color
  // number is that one, so a number changed by stock SudokuPad (the script removed for a while) wins.
  function restoreSelectedPen (saved) {
    if (saved && saved !== selectedPen() && penNumber(saved) === selectedPen()) penTool.setSelectedColor(saved)
  }

  // The group the drag highlight lives in, made on first use beside the pen layer; null when the page has no
  // pen layer.
  function hintLayer () {
    let layer = document.getElementById(HINT_LAYER_ID)
    const penLayer = document.querySelector(PEN_LAYER)
    if (!layer && penLayer) {
      layer = document.createElementNS(SVG_NAMESPACE, 'g')
      layer.id = HINT_LAYER_ID
      penLayer.after(layer)
    }
    return layer
  }

  function installPenPages (tool) {
    const found = tool && ['setSelectedColor', 'handleToolEnter', 'handleToolExit', 'drawLineHint', 'actSend'].every((name) => typeof tool[name] === 'function')
    if (!found) {
      console.warn('pen-tool-extras: the pen tool has no setSelectedColor, drawLineHint, actSend or tool enter and exit handler, so the extra pages of pens are not installed')
      return
    }
    penTool = tool
    const select = tool.setSelectedColor
    // SudokuPad's own looks for the button holding the color, so the pad shows the pen's page first, and it
    // saves the pen to `ToolPen_color`, which is put back to the color number the moment it returns.
    // Its own read of `ToolPen_color` gives a number for a digit (`getData` parses), so the color is a string here.
    tool.setSelectedColor = function (color) {
      const pen = String(color)
      const page = penPageOf(pen)
      if (page === -1) return select.call(this, color)
      setPadPage(page)
      select.call(this, pen)
      Framework.setData('ToolPen_color', penNumber(pen))
      Framework.setData(PEN_KEY, pen)
      syncPageButton()
    }
    const enter = tool.handleToolEnter
    // SudokuPad's own enter selects the saved color number through the wrapper above, which saves it as the
    // pen, so the saved pen is read first.
    tool.handleToolEnter = function () {
      const saved = normalizePen(Framework.getData(PEN_KEY))
      enter.call(this)
      restoreSelectedPen(saved)
    }
    // The panel's buttons are shared with the other tools, which read their `data-value`.
    const exit = tool.handleToolExit
    tool.handleToolExit = function () {
      exit.call(this)
      setPadPage(0)
    }
    // SudokuPad draws the highlight inside the pen layer; it is moved to the layer beside it the moment it exists.
    const drawHint = tool.drawLineHint
    tool.drawLineHint = function (path) {
      drawHint.call(this, path)
      const layer = hintLayer()
      if (layer && this.linePart && this.linePart.parentNode !== layer) layer.appendChild(this.linePart)
    }
    // A line dragged with a page 3 pen is stored with the character of the way each segment was dragged. The tool queues its
    // actions (and its path) before `actSend` sends them, so they are rewritten there. A drag that erases queues the value
    // alone, which removes the line whichever way it was stored, and is left as it is.
    const send = tool.actSend
    tool.actSend = function () {
      if (!this.eraseMode && Array.isArray(this.currentPath) && chevronWayOf(selectedPen()) !== null) {
        try {
          this._actList.splice(0, this._actList.length, ...splitLineActs(this._actList, this.currentPath, selectedPen()))
        } catch (error) {
          // The drag is sent as SudokuPad queued it, every line in the pen's own character, rather than lost.
          console.error(error)
        }
      }
      return send.apply(this, arguments)
    }
    // SudokuPad asks every tool's `handleKeydown` before its key handlers, and stops at the first that answers, so
    // answering Tab here also keeps it from the letter tool's Tab binding (which does nothing in the pen tool in
    // SudokuPad now, with No Tab Letters installed or not), and the key's default of moving the focus is stopped.
    // Shift+Tab is left alone: a held Shift is the letter tool's own temporary switch.
    const keydown = tool.handleKeydown
    tool.handleKeydown = function (event) {
      if (Framework.app.tool !== this.name || event.code !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return typeof keydown === 'function' ? keydown.call(this, event) : false
      }
      event.preventDefault()
      turnPage(1)
      return true
    }
    document.addEventListener('click', (event) => {
      if (event.target.closest(`.${PAGE_BUTTON}`)) turnPage(1)
    })
    // `preventDefault` needs a listener that is not passive.
    document.addEventListener('wheel', (event) => {
      if (event.deltaY === 0 || !event.target.closest('.tool-pen .controls-input') || event.target.closest(`.${SLIDERS}`)) return
      event.preventDefault()
      turnPage(event.deltaY < 0 ? -1 : 1)
    }, { passive: false })
    if (tool.active) restoreSelectedPen(normalizePen(Framework.getData(PEN_KEY)))
    syncPageButton()
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
      const button = panel.querySelector(`button[data-key="${n}"]`)
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
    // Read before the panel is built, which the first sync does with the pen tool already on.
    activeShow = normalizeSliderVisibility(Framework.getData(SLIDERS_SHOWN_KEY))
    installHoldToEdit()
    installPenPanel()
    installOverlayPressSwallow()
    markSettings = normalizeMarkSettings(Framework.getData(MARKS_KEY))
    adoptThickness(normalizeThickness(Framework.getData(THICKNESS_KEY)))
    adoptOpacity(normalizeOpacity(Framework.getData(OPACITY_KEY)))
    adoptDash(normalizeDash(Framework.getData(DASH_KEY)))
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
    installEdgeMarks(Framework.app)
    installPenPages(typeof ToolPen !== 'undefined' ? ToolPen.tool : undefined)
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
