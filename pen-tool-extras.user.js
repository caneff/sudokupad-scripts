// ==UserScript==
// @name         SudokuPad Pen Tool Extras
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      1.14.9
// @description  Pen tool extras: sets the pen's nine colors to your current cell color page, darkened (or your own, saved in a settings dialog or by holding a pen color button), adds a second page of nine pens that draw the same colors as dashed lines and a third page of nine that draw a line as wide as a page 1 line with a run of arrows (filled triangles) pointing the way the line was dragged (a page button, Tab or the mouse wheel over the page button changes page; either line style can be switched off in the dialog, which takes its page out of the rotation; lines in those pens are invisible without this script), puts two sliders in the pen tool's panel (each can be hidden in the settings dialog, which also holds both) for how thick pen lines, circles, crosses, edge marks and corner marks are and how see-through the pen layer is, lets the dialog set how long the page 2 dashes are and how far apart the page 3 arrows are and put SudokuPad's own pen colors back with one button, moves the pen's line mode pulldown into the settings dialog, puts a white outline around every pen mark (on by default, optional), and adds direction arrows and a circle to the marks a click on a cell edge cycles through (X, circle, then the two directions), plus an X and a circle for a click near a grid corner, and erases a whole line (every piece joined to it, drawn with the same pen) with a middle click (optional). A small gear in the corner of the pen tool button opens the settings dialog. Relies on SudokuPad internals, so an update can break a feature: that feature turns off alone and the settings dialog says which, and SudokuPad's own pen drawing is left as it is.
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
  const VERSION = '1.14.9'
  const SETTINGS_GROUP = 'experimental'
  // PenColor_colors and EdgeMarks_marks are the keys the scripts this one replaced saved under.
  const COLORS_KEY = 'PenColor_colors'
  // The `id` of each slider in the pen tool's panel; the input handler tells them apart by it.
  const THICKNESS_SLIDER = 'pen-tool-extras-thickness'
  const OPACITY_SLIDER = 'pen-tool-extras-opacity'
  const EDITOR_ID = 'pen-tool-extras-editor'
  const SLIDERS = 'pen-tool-extras-sliders'
  const SLIDER_ROW = 'pen-tool-extras-slider'
  // SudokuPad's line mode pulldown (`.penlinemode`), which this script hides and offers in its dialog instead.
  // `ToolPen_linemode` is where SudokuPad saves the mode; its three values and SudokuPad's own labels.
  const LINE_MODE_BOX = '.tool-pen .penlinemode'
  const LINE_MODE_KEY = 'ToolPen_linemode'
  const LINE_MODES = [['both', 'Center & Edge'], ['centeronly', 'Center only'], ['edgeonly', 'Edge only']]
  const MARKS_KEY = 'EdgeMarks_marks'
  const STYLE_ID = 'pen-tool-extras-style'
  const GRID_SELECTOR = '#svgrenderer'
  const PEN_LAYER = '#cell-pen'
  // The group the drag highlight (`.penhint`, and the erase highlight, which is the same element) is moved
  // to while a line is dragged, so the pen layer's opacity does not fade it. It sits right above the pen layer.
  const HINT_LAYER_ID = 'pen-tool-extras-hint'
  // The group every edge mark, grid-corner mark and cell circle and cross is drawn in. It is the last child of the pen layer, so a mark is over every line
  // whichever cell holds it (SudokuPad adds a cell's strokes to the pen layer in cell order, so a later cell's line covers an earlier cell's mark), and the
  // pen layer's opacity fades marks and lines as one picture.
  const MARKS_LAYER_ID = 'pen-tool-extras-marks'
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
  const MIDDLE_BUTTON = 1
  const RIGHT_BUTTON = 2
  const PEN_COLOR_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  // The pages of pens, in paging order. Each page's characters line up with PEN_COLOR_NUMBERS: the pen on button
  // N is the Nth character, and its color is color N, so a recolor changes the pen on every page. A
  // character is the one a stroke stores after its value and the replay holds (`pc:a`), which draws,
  // undoes and replays for any lowercase letter (docs/research/sudokupad-pen-tool.md, "Pen colors past
  // nine"). The first page is SudokuPad's own and must stay first: its characters are the only ones stock
  // SudokuPad can select. A dashed page draws its lines as dashes (dots at a dash length of 0). A pen value has no direction, so an arrow page's
  // pen is two characters: the one on its button (`chars`) for a line dragged the way SudokuPad draws the value, and
  // the `reverse` one at the same index for a line dragged the other way. Only the first is ever selected.
  const PEN_PAGES = [
    { chars: PEN_COLOR_NUMBERS, dashed: false },
    { chars: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], dashed: true },
    { chars: ['j', 'l', 'n', 'p', 'r', 't', 'v', 'x', 'z'], reverse: ['k', 'm', 'o', 'q', 's', 'u', 'w', 'y', '0'], dashed: false, arrowLines: true }
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
  // middle of the mark, which is the point it is centred on. At 16 an edge X then reaches 12.8 from its middle against the
  // line's half width of 8, so the whole X clears a line of the same thickness.
  const MARK_GROWTH = 0.6
  // The length of a page 2 dash in line widths, from dots (0) to longer dashes; 3 is the default, which draws dashes.
  const DASH = { min: 0, max: 8, step: 1, fallback: 3 }
  // The distance between two arrows' middles on page 3, in line widths, set by a slider in the dialog; 5 is the default, a run of arrows rather than a solid row.
  const ARROW_SPACING = { min: 3, max: 12, step: 1, fallback: 5 }
  // The least `stroke-dasharray` gap between two dashes, in line widths. The round caps take half a line width of it at each end, so the
  // gap that shows is one line width less: at least one line width, on a straight and a diagonal piece alike.
  const MIN_DASH_GAP_PER_THICKNESS = 2
  // The opacity setting, in percent, which the panel and the dialog both have a slider for. SudokuPad draws every pen mark with `.cell-pen { opacity: 0.8 }`
  // (tool-pen.css), so 80 is the fallback and leaves the marks as they are; 100 is solid, and 20 is the
  // floor where a mark still shows.
  const OPACITY = { min: 20, max: 100, step: 5, fallback: 80 }
  // The white outline's width on each side of the pen layer's shape, in cell units (a cell is 64; a default line is 5 wide), set by a slider in the dialog. It
  // does not scale with the thickness. 2 shows over a colored cell and a digit as well as over white without covering the digits beside a line.
  const OUTLINE_WIDTH = { min: 1, max: 8, step: 1, fallback: 2 }
  // The outline is made in two steps. The layer's alpha is first grown square by OUTLINE_SQUARE_SHARE of the width, so a thin shape (a one-wide
  // dot) is already wide enough for the second step to keep; then it is blurred and cut at OUTLINE_CUT, which rounds the corners (a square dilation
  // alone steps round every corner) and grows it by the rest of the width. Along a straight edge the blurred alpha falls to OUTLINE_CUT at
  // OUTLINE_CUT_SIGMAS blur widths (the normal curve's 95th percentile, 1.645) out, so the blur width is the rest of the width over that. The cut is a
  // steep ramp (OUTLINE_SOFTNESS per unit of alpha) so the edge is not jagged. A blur alone, with no first step, dims a thin shape below the cut at
  // the largest widths, and its outline fades to a faint halo.
  const OUTLINE_SQUARE_SHARE = 1 / 3
  const OUTLINE_CUT = 0.05
  const OUTLINE_CUT_SIGMAS = 1.645
  const OUTLINE_SOFTNESS = 16
  const OUTLINE_FILTER_ID = 'pen-tool-extras-outline-filter'
  // The element that holds the outline's filter, which a CSS `filter: url(#id)` needs in the document.
  const OUTLINE_HOLDER_ID = 'pen-tool-extras-outline-holder'
  // The filter's region, in cell units: far past any grid (a cell is 64, so 100000 is over 1500 cells), because the default region is a margin of the
  // layer's own bounding box, which a lone horizontal line gives no height to hold an outline in.
  const OUTLINE_REGION = { min: -100000, size: 200000 }
  // The pen values (the `pen-<value>` class of a stroke) SudokuPad draws at the full width, from
  // `docs/research/sudokupad-pen-edge-marks.md`: the free lines, and 5 and 6 (the cell circle and
  // cross). Left out on purpose: 3, 4, b and c (the edge X marks, half the width), and h to y (the
  // arrows, circles and grid-corner marks this script adds, also half).
  const FULL_WIDTH_VALUES = ['1', '2', '5', '6', '7', '8', '9', 'a', 'd', 'e', 'f', 'g']
  // The lines among them, which a dashed page draws as dashes: the cell circle and cross (5 and 6) stay solid.
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
  // The values this script adds, per edge: the first direction, the second direction, the circle (in that order here, which is not the cycle's).
  // SudokuPad's own pen values stop at `g`, so `h` onward are free. They stay lowercase letters:
  // SudokuPad lowercases a pen value when it undoes or replays one.
  const ADDED = { 3: ['h', 'i', 'j'], 4: ['k', 'l', 'm'], b: ['n', 'o', 'p'], c: ['q', 'r', 's'] }
  const ADDED_ORDER = ['dirA', 'dirB', 'circle']
  const SHAPES = { 3: ['>', '<'], 4: ['^', 'v'], b: ['>', '<'], c: ['^', 'v'] }
  // The types of mark in cycle order (X, circle, first direction, second direction), and the setting that ticks each. `directions` is the one
  // checkbox for dirA and dirB.
  const EDGE_CYCLE = {
    types: ['x', 'circle', 'dirA', 'dirB'],
    setting: { x: 'x', dirA: 'directions', dirB: 'directions', circle: 'circle' }
  }
  // A grid corner has no edge direction for an arrow to name, so it cycles an X and a circle.
  const CORNER_CYCLE = {
    types: ['x', 'circle'],
    setting: { x: 'cornerX', circle: 'cornerCircle' }
  }
  const DEFAULT_MARK_SETTINGS = { x: true, directions: true, circle: true, cornerX: true, cornerCircle: true }
  // The names the scripts this one replaced saved the two circle boxes under, by the name each is saved under now.
  const OLD_MARK_NAMES = { circle: 'dot', cornerCircle: 'cornerDot' }
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
  // The pen values drawn in the marks layer: SudokuPad's own edge X and cell circle and cross, and every edge mark and grid-corner mark value this script adds.
  const MARK_VALUES = [...EDGE_X, '5', '6', ...EDGE_X.flatMap((edge) => ADDED[edge]), ...Object.values(CORNER_VALUES).flat()]
  // The shape of the third mark per edge. Its checkbox is the `circle` field of the saved settings.
  const CIRCLE = 'o'
  const CIRCLE_RADIUS_PER_HALF_SIZE = 0.83
  const COLOR_TOOL_WAIT_MS = 10000
  const COLOR_TOOL_POLL_MS = 100
  // How long a pen color button is held to open the pickers: SudokuPad's color tool uses the
  // same 1000 ms (HoldToEditDelayMs) for its cell color buttons.
  const HOLD_TO_EDIT_MS = 1000

  const isPlainObject = (data) => Boolean(data) && typeof data === 'object' && !Array.isArray(data)
  const isHexColor = (value) => typeof value === 'string' && HEX_COLOR.test(value)

  // Saved data is untrusted: returns { penColor: '#rrggbb' } for every pen color, with the
  // default for any entry that is missing or not a #rrggbb string.
  function normalizeColors (data) {
    const saved = isPlainObject(data) ? data : {}
    const out = {}
    PEN_COLOR_NUMBERS.forEach((n) => {
      out[n] = isHexColor(saved[n]) ? saved[n].toLowerCase() : SUDOKUPAD_PEN_COLORS[n]
    })
    return out
  }

  // Saved data is untrusted: the saved set as { penColor: '#rrggbb' }, or null when nothing
  // usable is saved (not a plain object, or no entry that is a #rrggbb string), which means
  // the derived colors apply.
  function savedColors (data) {
    const usable = isPlainObject(data) && PEN_COLOR_NUMBERS.some((n) => isHexColor(data[n]))
    return usable ? normalizeColors(data) : null
  }

  // The whole current set with pen color `pen` set to `value` (a #rrggbb string), lowercased.
  // The set is what gets saved, so a pen color or value that is not valid throws rather than
  // saving a set with a wrong entry.
  function editedColors (colors, pen, value) {
    if (!PEN_COLOR_NUMBERS.includes(pen)) throw new RangeError(`pen-tool-extras: ${pen} is not a pen color`)
    if (!isHexColor(value)) throw new RangeError(`pen-tool-extras: ${value} is not a #rrggbb color`)
    return { ...colors, [pen]: value.toLowerCase() }
  }

  // Saved data is untrusted: the saved line mode when it is one of the three, else 'both' (SudokuPad's own default).
  function normalizeLineMode (data) {
    return LINE_MODES.some(([value]) => value === data) ? data : LINE_MODES[0][0]
  }

  // The index of the page whose button holds the color character `pen` (an arrow page's reverse characters are on no
  // button, so they are no pen), or -1.
  function penPageOf (pen) {
    return PEN_PAGES.findIndex((page) => page.chars.includes(pen))
  }

  // The number of the color (and of the button) of the pen `pen`, as PEN_COLOR_NUMBERS names it; undefined for no pen.
  function penNumber (pen) {
    const page = PEN_PAGES[penPageOf(pen)]
    return page ? PEN_COLOR_NUMBERS[page.chars.indexOf(pen)] : undefined
  }

  function penCharOn (page, number) {
    return PEN_PAGES[page].chars[PEN_COLOR_NUMBERS.indexOf(number)]
  }

  // Saved data is untrusted: the saved pen character when it is one of a page, else null. SudokuPad's
  // `getData` parses what it reads, so a saved '3' comes back as the number 3.
  function normalizePen (data) {
    const pen = typeof data === 'number' ? String(data) : data
    return typeof pen === 'string' && penPageOf(pen) !== -1 ? pen : null
  }

  // The indexes of the pages in the rotation: page 1 always, the dashed page with dashed lines enabled and the arrow page with arrow lines enabled.
  function enabledPages (styles) {
    return PEN_PAGES.map((_, index) => index).filter((index) => index === 0 || (PEN_PAGES[index].arrowLines ? styles.arrows : styles.dashed))
  }

  // The enabled page `delta` pages (1 forward, -1 back) from `page`, which may itself be a page that is not enabled.
  function stepEnabledPage (page, delta, styles) {
    const enabled = enabledPages(styles)
    let next = page
    do next = wrapIndex(next, delta, PEN_PAGES.length)
    while (!enabled.includes(next))
    return next
  }

  // The pen to have selected once `styles` are saved: a pen on a page that is not enabled becomes the pen of the same number on page 1.
  function pageAfterSave (pen, styles) {
    const page = penPageOf(pen)
    return page === -1 || enabledPages(styles).includes(page) ? pen : penCharOn(0, penNumber(pen))
  }

  // The index `delta` places (1 forward, -1 back) from `index`, going round a list of `count` items.
  function wrapIndex (index, delta, count) {
    return (((index + delta) % count) + count) % count
  }

  // A whole number from `range.min` to `range.max` on the steps counted from `range.min`.
  function inRange (value, range) {
    return Number.isInteger(value) && value >= range.min && value <= range.max && (value - range.min) % range.step === 0
  }

  // Saved data is untrusted: each of `names` is true unless saved as the boolean false, so data saved before a name existed reads as true.
  function decodeFlags (names, data) {
    const saved = isPlainObject(data) ? data : {}
    return Object.fromEntries(names.map((name) => [name, saved[name] !== false]))
  }

  const doNothing = () => {}

  // A table row: the key it saves under, its default, what makes saved data (untrusted) usable, and `effect`, which brings the page in line once
  // `inForce` holds the new value. The style is written after the effects, so an effect need not.
  function slider (key, range, effect = doNothing) {
    return { key, fallback: range.fallback, normalize: (data) => inRange(data, range) ? data : range.fallback, effect }
  }

  function flag (key, effect = doNothing) {
    return { key, fallback: true, normalize: (data) => data !== false, effect }
  }

  function flags (key, names, effect = doNothing) {
    return { key, fallback: decodeFlags(names), normalize: (data) => decodeFlags(names, data), effect }
  }

  // Every setting the dialog holds. `lineStyles` is which line styles (page 2 dashed lines, page 3 arrow lines) are enabled, and `show` which panel
  // sliders show. `outline` is the white outline on the pen layer. Marks and the line mode are saved their own way.
  const SETTINGS = {
    thickness: slider('PenColor_thickness', THICKNESS, adoptThickness),
    opacity: slider('PenColor_opacity', OPACITY, adoptOpacity),
    dash: slider('PenColor_dash', DASH, syncPageButton),
    arrowSpacing: slider('PenColor_arrowspacing', ARROW_SPACING, redrawArrowLines),
    outlineWidth: slider('PenColor_outlinewidth', OUTLINE_WIDTH, adoptOutline),
    outline: flag('PenColor_outline', adoptOutline),
    middleErase: flag('PenColor_middleerase'),
    lineStyles: flags('PenColor_linestyles', ['dashed', 'arrows'], adoptLineStyles),
    show: flags('PenColor_sliders', ['thickness', 'opacity'], adoptShow)
  }
  const SETTING_NAMES = Object.keys(SETTINGS)

  // Two values of one setting are the same when equal, name by name for a `flags` setting.
  function sameValue (a, b) {
    return a === b || (isPlainObject(a) && isPlainObject(b) && Object.keys(a).every((name) => a[name] === b[name]))
  }

  function settingDefaults () {
    return Object.fromEntries(SETTING_NAMES.map((name) => [name, SETTINGS[name].fallback]))
  }

  // Every setting as saved in `store` (SudokuPad's `Framework`).
  function readSettings (store) {
    return Object.fromEntries(SETTING_NAMES.map((name) => [name, SETTINGS[name].normalize(store.getData(SETTINGS[name].key))]))
  }

  // The names of the settings whose value in `draft` is not the one in `current`.
  function changedSettings (draft, current) {
    return SETTING_NAMES.filter((name) => !sameValue(draft[name], current[name]))
  }

  // A value at its default removes its key, so a default that changes later reaches everyone who never chose another.
  function saveSetting (store, setting, value) {
    if (sameValue(value, setting.fallback)) store.removeData(setting.key)
    else store.setData(setting.key, value)
  }

  // Saved data is untrusted: returns { x, directions, circle, cornerX, cornerCircle }, each ticked unless saved as false. Data saved before the corner boxes
  // existed has no corner entry, so both read as ticked. A circle box saved under its old name reads as the new one, which wins when both are there;
  // the result holds only the new names, so the next save writes those.
  function normalizeMarkSettings (data) {
    const saved = isPlainObject(data) ? data : {}
    const underOldNames = Object.fromEntries(Object.entries(OLD_MARK_NAMES).map(([name, old]) => [name, saved[old]]))
    return decodeFlags(Object.keys(DEFAULT_MARK_SETTINGS), { ...underOldNames, ...saved })
  }

  function valueOfType (edge, type) {
    return type === 'x' ? edge : ADDED[edge][ADDED_ORDER.indexOf(type)]
  }

  // The type of mark `direction` steps (1 forward, -1 backward) from `current` ('empty' or a
  // type of `cycle`) round the cycle, skipping unticked types. 'empty' is always allowed. A
  // `current` whose type is unticked still moves on.
  function stepType (current, settings, direction, cycle) {
    const order = [...cycle.types, 'empty']
    const from = order.indexOf(current)
    for (let step = 1; step <= order.length; step++) {
      const type = order[wrapIndex(from, direction * step, order.length)]
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

  // The kind and type ('x' or 'circle') of a value this script adds on a grid corner, or null for any
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
  // corner), for a shape. `s` is the half-size in SudokuPad's units. An arrow is an open two-segment head whose
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
  // The sizes of an arrow line (page 3), in line widths (the thickness setting; the line's width follows it all the way down, but an arrow's size
  // is never smaller than at the default thickness, so its direction stays visible at 1): an arrow is a filled triangle on the line, its base
  // `halfWidth` out to each side of the line's middle and `halfLength` back from it, and its tip `halfLength` forward (so it is twice `halfLength`
  // long); `line` is the width of the line (1, the same as a page 1 line at every thickness). The arrows are spaced by ARROW_SPACING, fitted to a whole number per segment. The furthest an
  // arrow reaches off its line stays inside what Dark Page keeps past a cell (its `SOLVER_REACH`; a unit test holds the two together).
  const ARROW_LINE = { halfLength: 1.125, halfWidth: 1.5, line: 1 }

  // Which way a line stored with the color character `char` was dragged: true for the character on an arrow page's button
  // (forward), false for its reverse character, null for a character no arrow page uses.
  function arrowLineWayOf (char) {
    for (const page of PEN_PAGES) {
      if (!page.arrowLines) continue
      if (page.chars.includes(char)) return true
      if (page.reverse.includes(char)) return false
    }
    return null
  }

  // The color character a line dragged `forward` (or not) is stored with when pen `pen` is selected: the pen's own character,
  // except on an arrow page for a line dragged the other way.
  function directionCharOf (pen, forward) {
    const page = PEN_PAGES[penPageOf(pen)]
    return !page || !page.arrowLines || forward ? pen : page.reverse[page.chars.indexOf(pen)]
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

  // How far from a line, in cells, a middle click still hits it.
  const LINE_HIT_RADIUS = 0.2

  // The two grid points of the line `value` stored on the cell (row, col), as [row, col] in cell units from the grid's top left. Two
  // segments are joined when they share a point: a cell's middle for a center or diagonal line, a cell corner for an edge line.
  function linePoints (value, row, col) {
    return LINE_PATHS[value].map(([r, c]) => [row + r, col + c])
  }

  // What makes two line colors one pen: the color character itself, except that an arrow pen's two direction characters are one pen.
  function lineIdentityOf (color) {
    for (const page of PEN_PAGES) {
      if (page.reverse && page.reverse.includes(color)) return page.chars[page.reverse.indexOf(color)]
    }
    return color
  }

  // The distance from `point` to the segment from `a` to `b` (all [row, col]).
  function distanceToSegment (point, a, b) {
    const [dr, dc] = [b[0] - a[0], b[1] - a[1]]
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dr + (point[1] - a[1]) * dc) / (dr * dr + dc * dc)))
    return Math.hypot(point[0] - (a[0] + t * dr), point[1] - (a[1] + t * dc))
  }

  // The segment of `segments` ({ value, row, col, color }) nearest `point` ([row, col] in cell units) and within `radius` of it; null for none.
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

  // Every segment of `segments` joined to `start` through shared points and drawn with the same pen (a segment of another pen stops it; a
  // branch is joined), `start` included.
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

  // The actions that erase `segments`: for each value, one select of the cells that hold it and the bare value, which toggles it off
  // whichever color character it was stored with. `cellAt(row, col)` gives SudokuPad's cell. One group sends them, so one undo restores the line.
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

  // The corners of a triangle (an arrow of an arrow line, and the page button's sample of one), base corner, tip, base corner, as [x, y] points: its middle at (x, y), pointing along the unit vector (ux, uy),
  // its base `half` back and `wide` out from the middle and its tip `half` forward.
  function arrowLineCorners (x, y, ux, uy, half, wide) {
    return [[x - ux * half - uy * wide, y - uy * half + ux * wide], [x + ux * half, y + uy * half], [x - ux * half + uy * wide, y - uy * half - ux * wide]]
  }

  const pointText = ([x, y]) => `${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`

  // The path data of an arrow line, in the renderer's units (a cell is CELL_UNITS), for the line value `value` on the cell at
  // (row, col) dragged `forward` or not, at `thickness` with arrows `spacing` line widths apart: { line, arrows, lineWidth }. The line is the whole
  // segment, as wide as a page 1 line; each arrow in `arrows` is a closed triangle, base corner, tip, base corner, the tip toward the way it was
  // dragged. Whole arrows are fitted to the segment, each in the middle of its share of it, so two segments in a row space them alike across their join.
  function arrowLine (value, forward, row, col, thickness, spacing) {
    const points = linePoints(value, row, col)
    const [from, to] = (forward ? points : points.reverse()).map(([r, c]) => [c * CELL_UNITS, r * CELL_UNITS])
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    const [ux, uy] = [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
    // Arrows keep the size they have at the default thickness below it; only the line gets thinner.
    const size = Math.max(thickness, THICKNESS.fallback)
    const [half, wide] = [ARROW_LINE.halfLength * size, ARROW_LINE.halfWidth * size]
    // Every segment holds at least one arrow, however wide the spacing and thick the pen (the shortest segment, a cell side, rounds to none at the top of both), so a line never loses its direction.
    const count = Math.max(1, Math.round(length / (spacing * size)))
    let arrows = ''
    for (let i = 0; i < count; i++) {
      const along = (i + 0.5) * length / count
      const [wing, tip, other] = arrowLineCorners(from[0] + ux * along, from[1] + uy * along, ux, uy, half, wide)
      arrows += `M${pointText(wing)}L${pointText(tip)}L${pointText(other)}Z`
    }
    return {
      line: `M${pointText(from)}L${pointText(to)}`,
      arrows,
      lineWidth: ARROW_LINE.line * thickness
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

  // Overrides SudokuPad's nine pen color variables. Strokes (`.pencolor-N`) and the tool's
  // button swatches both read them; the eraser has its own fixed color and no variable.
  // SudokuPad's `tool-pen.css` loads when the pen tool is enabled, so a plain `:root` rule
  // would lose to it by coming first; `:root:root` outranks it whichever loads last.
  function buildCss (colors) {
    const lines = PEN_COLOR_NUMBERS.map((n) => `  --puzzle-pencolor-${n}: ${colors[n]};`)
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
    if (!inRange(thickness, THICKNESS)) throw new RangeError(`pen-tool-extras: ${thickness} is not a thickness from ${THICKNESS.min} to ${THICKNESS.max}`)
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
    if (!inRange(opacity, OPACITY)) throw new RangeError(`pen-tool-extras: ${opacity} is not an opacity from ${OPACITY.min} to ${OPACITY.max} in steps of ${OPACITY.step}`)
    return `:root:root .cell-pen { opacity: 1; }\n:root:root ${PEN_LAYER} { opacity: ${opacity / 100}; }`
  }

  // Puts a white outline round the pen layer's combined shape, for strokes drawn already and new ones: a filter on the layer, the same element that carries
  // the opacity. A filter runs on the layer's picture before its opacity does, so the outline fades with the marks. The highlight (`.penhint`) is in its
  // own group beside the layer, so it is not outlined. Empty when the outline is off.
  function buildOutlineCss (outline) {
    if (typeof outline !== 'boolean') throw new RangeError(`pen-tool-extras: ${outline} is not true or false`)
    return outline ? `:root:root ${PEN_LAYER} { filter: url(#${OUTLINE_FILTER_ID}); }` : ''
  }

  // The markup of a hidden SVG holding the outline's filter: the layer's alpha grown by about `width` (an outline width) in every direction with round corners, in the two steps described at OUTLINE_SQUARE_SHARE (one
  // shape, so the outline does not cut across where lines join or cross), filled white, with the layer drawn over it. The filter works in sRGB so
  // the layer's own colors pass through unchanged.
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

  // How much shorter than an even split of a segment the dot spacing is. With the spacing exactly `length / dots`
  // the last dot falls on the segment's end, where the browser draws no zero-length dash, so a line's far end
  // would have no dot; this puts it a hair before the end (0.0064 of a unit on a cell of 64).
  const END_DOT_SHRINK = 0.9999
  // The dash pattern of a page 2 line of `length` at `thickness` and a dash length of `dash` line widths: { on, gap, offset }, the
  // `stroke-dasharray` values and the `stroke-dashoffset`. Each segment of a line is its own path with its own pattern, so a whole
  // number of periods is fitted to the segment's `length`. A dash of 0 is dots (a zero-length dash with the round cap, spaced
  // DOT_SPACING_PER_THICKNESS line widths, the last dot a hair before the end, which is the segment's end where the browser draws
  // no zero-length dash), with a dot on both ends of the segment. With a dash, the pattern is shifted to start half a dash in, so a
  // segment starts and ends with half a dash and the two halves at a cell boundary make one whole dash: the ends of a line, every
  // turn and every join between cells are inked, as a solid line has a point there. A dash too long for the segment to hold a gap of
  // MIN_DASH_GAP_PER_THICKNESS line widths is shortened to leave one, so a page 2 line never draws solid.
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

  // A swatch, cut out of the button's pen-colored square by a mask so a recolor follows: the line `svg` draws.
  const swatchMask = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}") center / 100% no-repeat`
  const swatchRule = (n, page, svg) => {
    const mask = swatchMask(svg)
    return `.tool-pen button[data-key="${n}"][${PAGE_ATTRIBUTE}="${page}"]:after { background-color: var(--puzzle-pencolor-${n}); -webkit-mask: ${mask}; mask: ${mask}; }`
  }
  // An arrow page's swatch: a line and two filled arrows.
  const ARROW_LINE_SWATCH = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#000' stroke-linecap='round'><path d='M2 12H22' stroke-width='2'/><path d='M5 6.5L12 12L5 17.5ZM13 6.5L20 12L13 17.5Z' fill='#000' stroke='none'/></svg>"
  // A dashed page's swatch: one line across the 24 wide swatch, 2 wide, from x 2 to 22, dashed by the page's own rule
  // (dashPattern) at the dash length in force, so it shows dots at 0 and longer dashes as the setting grows.
  const DASH_SWATCH = { width: 2, from: 2, to: 22 }
  function dashSwatch (dash) {
    const { on, gap, offset } = dashPattern(DASH_SWATCH.width, dash, DASH_SWATCH.to - DASH_SWATCH.from)
    const round = (x) => Math.round(x * 1000) / 1000
    return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#000' stroke-linecap='round'><path d='M${DASH_SWATCH.from} 12H${DASH_SWATCH.to}' stroke-width='${DASH_SWATCH.width}' stroke-dasharray='${round(on)} ${round(gap)}' stroke-dashoffset='${round(offset)}'/></svg>`
  }
  // The look of the pages after the first, which SudokuPad's own CSS knows nothing about: each pen
  // character strokes in the color of its partner on the first page, a dashed page's lines are dashes
  // (a dash of the dash setting, or at 0 a zero-length dash with the round cap `.cell-pen` already has, spaced by `thickness`, so
  // they scale with the slider), and its buttons' swatches are a dashed line. `:root:root` outranks SudokuPad's
  // own rules whichever stylesheet loads last.
  function buildPagesCss (thickness, dash) {
    if (!inRange(thickness, THICKNESS)) throw new RangeError(`pen-tool-extras: ${thickness} is not a thickness from ${THICKNESS.min} to ${THICKNESS.max}`)
    if (!inRange(dash, DASH)) throw new RangeError(`pen-tool-extras: ${dash} is not a dash length from ${DASH.min} to ${DASH.max}`)
    const rules = []
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
  // The settings gear in the corner of SudokuPad's pen tool button: a small white box with a purple border and gear, which opens the dialog.
  const GEAR_BUTTON = '#control-pen'
  const GEAR_CLASS = 'pen-tool-extras-gear'
  const GEAR_LABEL = 'Pen tool extras settings'
  const GEAR_SIZE_PX = 13
  const GEAR_INSET_PX = 2
  const GEAR_ICON_PX = 9
  // SudokuPad's own CSS turns pointer events off on what is inside a tool button, so the gear turns them back on.
  const GEAR_CSS = [
    `${GEAR_BUTTON} { position: relative; }`,
    `.${GEAR_CLASS} { position: absolute; right: ${GEAR_INSET_PX}px; top: ${GEAR_INSET_PX}px; box-sizing: border-box; width: ${GEAR_SIZE_PX}px; height: ${GEAR_SIZE_PX}px; border: 1.5px solid ${PANEL_COLOR}; border-radius: 3px; background: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; pointer-events: auto; }`
  ].join('\n')
  const GEAR_MARKUP = `<span class="${GEAR_CLASS}" role="button" aria-label="${GEAR_LABEL}" title="${GEAR_LABEL}"><svg viewBox="0 0 24 24" width="${GEAR_ICON_PX}" height="${GEAR_ICON_PX}" fill="${PANEL_COLOR}" aria-hidden="true"><path d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.88 2h-3.84a.5.5 0 0 0-.49.42l-.36 2.54a7 7 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.64 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54a7 7 0 0 0 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg></span>`
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

  // The page button's picture: a sample of the line the button turns to (dashes on a dashed page, or dots at a dash length of 0,
  // else a solid line) in the panel's colour, under a dot for each enabled page with the current one
  // filled, as SudokuPad's color tool's page button has. The sample line runs from (12, 54) to (52, 26); a
  // dash is drawn at each end of it, `dash` line widths long and no longer than 0.42 of the line.
  const SAMPLE_FROM = [12, 54]
  const SAMPLE_TO = [52, 26]
  const SAMPLE_WIDTH = 7.2
  const SAMPLE_DASH_SHARE = 0.42
  // The arrow sample: its line width, an arrow's half extents (ARROW_LINE's proportions of the line width), and where along the line
  // the three sit, as shares of its length.
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
          const [wing, tip, other] = arrowLineCorners(SAMPLE_FROM[0] + dx * t, SAMPLE_FROM[1] + dy * t, dx / length, dy / length, ARROW_LINE.halfLength * SAMPLE_ARROW_LINE.line, ARROW_LINE.halfWidth * SAMPLE_ARROW_LINE.line)
          return `<path d="M${pointText(wing)} L${pointText(tip)} L${pointText(other)}Z" stroke="none" data-arrow-line/>`
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

  // A small picture of each mark, drawn in the text color: the X, the four arrows (> < ^ v), the circle.
  const MARK_PICTURES = {
    x: ['16', '<path d="M3 3 L13 13 M13 3 L3 13"/>'],
    directions: ['64', '<path d="M3 3 L9 8 L3 13 M25 3 L19 8 L25 13 M36 11 L41 5 L46 11 M54 5 L59 11 L64 5"/>'],
    circle: ['16', '<circle cx="8" cy="8" r="5.2"/>']
  }
  const markPicture = (key) => {
    const [width, shapes] = MARK_PICTURES[key]
    return `<svg width="${width}" height="16" viewBox="0 0 ${width} 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`
  }

  // The one plain line that names the features that are off because SudokuPad changed; nothing when none is.
  function offNote (off) {
    if (!off.length) return ''
    return `<div style="margin:6px 0;max-width:20em">Off because SudokuPad changed: ${off.map((name) => FEATURE_LABELS[name]).join(', ')}</div>`
  }

  function missingNote (missing) {
    if (!missing.length) return ''
    const list = (missing.length === 1 ? 'pen color ' : 'pen colors ') + missing.join(', ')
    return `<div style="margin:6px 0;max-width:20em">The current cell color page has no usable color at the matching button, so ${list} keep${missing.length === 1 ? 's' : ''} SudokuPad's own.</div>`
  }

  // The heading of a dialog section after the first: the divider line above it, then the title.
  const sectionHeading = (text) => `${DIVIDER}<div style="font-weight:600;margin-top:10px">${text}</div>`

  // The pen's line mode choice, in place of SudokuPad's own pulldown in the panel, which this script hides.
  // `lineMode` is undefined when the page has no pen tool, and the choice is left out.
  function lineModeChoice (lineMode) {
    if (lineMode === undefined) return ''
    const options = LINE_MODES.map(([value, label]) => `<option value="${value}"${value === lineMode ? ' selected' : ''}>${label}</option>`).join('')
    return sectionHeading('Pen line mode') +
      `<select data-line-mode style="margin:4px 0;font-size:1rem">${options}</select>`
  }

  // The dialog's slider rows share four columns, so the sliders of Line settings, Line styles and the outline line up: the label, the slider, its
  // value, and a box (Slider in panel, Enable) centred under its small grey heading. The first two shrink on a narrow dialog.
  const SLIDER_COLUMNS = 'display:grid;grid-template-columns:minmax(6em,12.5em) minmax(5em,11em) 2em 6.2em;column-gap:8px;align-items:center;margin:4px 0'
  const COLUMN_HEADING = 'font-size:.8rem;color:#666;font-weight:400;justify-self:center;white-space:nowrap'
  const DIVIDER = '<div style="border-top:1px solid #e3dff0;margin:12px 0 0"></div>'
  const DIALOG_CLASS = 'pen-tool-extras-dialog'
  const STYLE_SLIDERS = { dashed: 'dash', arrows: 'arrowSpacing' }

  // The look of the dialog's button row (Restore defaults as small underlined text at the left, Cancel and Save at the right, under a
  // divider), of the SudokuPad colors button and of the pen line mode pulldown. Scoped by DIALOG_CLASS, so SudokuPad's other dialogs are left alone.
  const DIALOG_CSS = [
    `.dialog-options.${DIALOG_CLASS} { display: flex !important; flex-direction: row !important; align-items: center; gap: 10px; justify-content: flex-end; border-top: 1px solid #e3dff0; padding: 14px 4px 2px; margin-top: 8px; box-sizing: border-box; width: 100%; }`,
    `.dialog-options.${DIALOG_CLASS} button { width: auto !important; min-width: 0 !important; margin: 0 !important; padding: 0 22px !important; height: 38px !important; line-height: 36px !important; border-radius: 8px !important; font-size: 1rem !important; flex: none; }`,
    `.dialog-options.${DIALOG_CLASS} button[data-role="save"] { background: ${PANEL_COLOR} !important; color: #fff !important; border: 1px solid #5a3489 !important; font-weight: 600; }`,
    `.dialog-options.${DIALOG_CLASS} button[data-role="cancel"] { background: #f1eff5 !important; color: #333 !important; border: 1px solid #cfc9db !important; }`,
    `.dialog-options.${DIALOG_CLASS} button[data-role="restore"] { margin-right: auto !important; background: none !important; border: none !important; color: #777 !important; padding: 0 4px !important; font-size: 0.85rem !important; text-decoration: underline; text-underline-offset: 3px; }`,
    `#${EDITOR_ID} [data-sudokupad-colors] { background: #f1eff5 !important; color: #333 !important; border: 1px solid #cfc9db !important; border-radius: 8px !important; padding: 0 14px !important; height: 34px !important; line-height: 32px !important; margin: 0 !important; font-weight: 500; text-align: center; }`,
    `#${EDITOR_ID} select[data-line-mode] { font-size: 0.95rem; padding: 4px 28px 4px 10px; border: 1px solid #b9b0c9; border-radius: 6px; appearance: none; color: #222; background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b4fa0'/%3E%3C/svg%3E") no-repeat right 10px center; }`
  ].join('\n')

  // The dialog's body at the state it holds: the nine pen colors as a 3 by 3 grid in the order of the pen
  // tool's buttons (1 2 3, 4 5 6, 7 8 9), each with its number; Line settings (the thickness and opacity sliders, each with the box that
  // shows it in the pen tool's panel); Line styles (dashed and arrow lines, each with an Enable box and a slider that is hidden while it is unticked);
  // the table of marks a click cycles through; the outline and the middle click boxes; the line mode. A slider here is a draft that takes effect on
  // Save, so the panel's own sliders and these show the same value when the dialog opens.
  function renderEditor (state) {
    const off = new Set(state.off)
    const cells = PEN_COLOR_NUMBERS.map((n) =>
      '<div style="display:flex;align-items:center;gap:8px">' +
      `<b style="width:1.2em;text-align:right">${n}</b>` +
      `<input type="color" data-pen="${n}" value="${state.colors[n]}"></div>`
    ).join('')
    const grid = `<div style="display:grid;grid-template-columns: repeat(3, max-content);gap:6px 18px;margin:4px 0">${cells}</div>`
    const colorsRow = `<div data-colors-row style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px">${grid}` +
      '<button type="button" data-sudokupad-colors style="font-size:inherit;white-space:nowrap">SudokuPad colors</button></div>'
    // A box with no word label: its picture, and its name as the accessible name and the hover title.
    const markBox = (key, name, picture) =>
      `<label title="${name}" style="display:flex;align-items:center;gap:6px;margin:0;width:auto">` +
      `<input type="checkbox" id="pen-tool-extras-mark-${key}" data-mark="${key}" aria-label="${name}" title="${name}"${state.marks[key] ? ' checked' : ''}>` +
      `${markPicture(picture)}</label>`
    const box = (attributes, checked, title) => `<input type="checkbox" ${attributes}${checked ? ' checked' : ''}${title ? ` title="${title}"` : ''} style="margin:0;justify-self:center">`
    // `shown` false hides the row (a setting under an unticked box); `boxMarkup` is the box in the fourth column; `indented` sets the label under a name above it.
    const slider = (key, label, range, value, { indented = false, shown = true, boxMarkup = '<span></span>' } = {}) =>
      `<div data-row="${key}" style="${SLIDER_COLUMNS}${shown ? '' : ';display:none'}">` +
      `<label for="pen-tool-extras-setting-${key}" style="width:auto;text-align:left;margin:0${indented ? ';padding-left:1.2em;color:#444;box-sizing:border-box' : ''}">${label}</label>` +
      `<input type="range" data-setting="${key}" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}" id="pen-tool-extras-setting-${key}" style="width:100%;min-width:0;margin:0">` +
      `<output data-readout="${key}">${value}</output>${boxMarkup}</div>`
    // A name and its Enable box, with the slider row under it, hidden while the box is unticked.
    const styleBlock = (key, name, enabled, sliderMarkup) =>
      `<div style="${SLIDER_COLUMNS};margin-bottom:0"><span style="grid-column:1 / 4">${name}</span>` +
      `${box(`id="pen-tool-extras-style-${key}" data-style="${key}" aria-label="Enable ${name}"`, enabled)}</div>` + sliderMarkup
    const when = (feature, markup) => off.has(feature) ? '' : markup
    const heading = (text, caption) =>
      DIVIDER + `<div style="${SLIDER_COLUMNS};margin:10px 0 4px"><span style="font-weight:600;grid-column:1 / 4">${text}</span>` +
      `<span style="${COLUMN_HEADING}">${caption || ''}</span></div>`
    const markRow = (label, cellsMarkup) => `<div>${label}</div>${cellsMarkup}`
    const columnHead = (text) => `<div style="font-size:.85rem;color:#666">${text}</div>`
    const marksTable = '<div style="display:grid;grid-template-columns:max-content repeat(3, max-content);column-gap:28px;row-gap:6px;align-items:center;margin:4px 0">' +
      '<div></div>' + columnHead('X Mark') + columnHead('Circle') + columnHead('Directions') +
      markRow('Edge', markBox('x', 'Edge X Mark', 'x') + markBox('circle', 'Edge Circle', 'circle') + markBox('directions', 'Edge Directions', 'directions')) +
      markRow('Corner', markBox('cornerX', 'Corner X Mark', 'x') + markBox('cornerCircle', 'Corner Circle', 'circle') + '<div></div>') +
      '</div>'
    const dashed = !off.has('dashes')
    const arrows = !off.has('arrowLines')
    const labelled = (id, attributes, checked, text) =>
      '<div style="margin:4px 0;display:flex;justify-content:flex-start;align-items:center;gap:6px">' +
      `<input type="checkbox" id="${id}" ${attributes}${checked ? ' checked' : ''} style="margin:0">` +
      `<label for="${id}" style="width:auto;text-align:left;margin:0">${text}</label></div>`
    return offNote(state.off) + '<div style="font-weight:600">Pen colors</div>' + colorsRow +
      missingNote(state.missing) +
      when('sliders', heading('Line settings', 'Slider in panel') +
        slider('thickness', 'Thickness', THICKNESS, state.thickness, { boxMarkup: box('id="pen-tool-extras-show-thickness" data-show="thickness"', state.show.thickness, 'Show this slider in the pen panel') }) +
        slider('opacity', 'Opacity (%)', OPACITY, state.opacity, { boxMarkup: box('id="pen-tool-extras-show-opacity" data-show="opacity"', state.show.opacity, 'Show this slider in the pen panel') })) +
      (dashed || arrows
        ? heading('Line styles', 'Enable') +
          (dashed ? styleBlock('dashed', 'Dashed lines', state.lineStyles.dashed, slider('dash', 'Dash length', DASH, state.dash, { indented: true, shown: state.lineStyles.dashed })) : '') +
          (arrows ? styleBlock('arrows', 'Directional arrow lines', state.lineStyles.arrows, slider('arrowSpacing', 'Arrow spacing', ARROW_SPACING, state.arrowSpacing, { indented: true, shown: state.lineStyles.arrows })) : '')
        : '') +
      when('marks', sectionHeading('Marks a click cycles through') + marksTable) +
      (off.has('outline') && off.has('lineErase')
        ? ''
        : sectionHeading('Other') +
          when('outline', labelled('pen-tool-extras-outline', 'data-outline', state.outline, 'White outline on lines and marks') +
            slider('outlineWidth', 'Outline width', OUTLINE_WIDTH, state.outlineWidth, { indented: true, shown: state.outline })) +
          when('lineErase', labelled('pen-tool-extras-middle-erase', 'data-middle-erase', state.middleErase, 'Middle click erases a whole line'))) +
      lineModeChoice(state.lineMode)
  }

  // The features that can each fail on their own when a SudokuPad update changes an internal they rely on, in the order the dialog names them, and the words the
  // dialog uses for each.
  const FEATURE_LABELS = {
    colors: 'colors',
    pages: 'pen pages',
    dashes: 'dashes',
    arrowLines: 'arrow lines',
    sliders: 'sliders',
    marks: 'marks',
    rightClick: 'right click',
    lineMode: 'line mode',
    outline: 'outline',
    lineErase: 'line erase',
    gear: 'settings gear'
  }
  // The features that cannot work without another one: the dashes and arrows are pens on pages, and a right click steps the marks' cycle.
  const FEATURE_NEEDS = { dashes: ['pages'], arrowLines: ['pages'], rightClick: ['marks'] }

  // A failure in SudokuPad's own function that a feature merely called: `attempt` lets it through without blaming the feature.
  class StockFailure extends Error {
    constructor (cause) {
      super(String(cause && cause.message))
      this.cause = cause
    }
  }

  // Runs `call`, SudokuPad's own function, so that a throw in it is SudokuPad's and not the feature's.
  function inStock (call) {
    try {
      return call()
    } catch (error) {
      throw new StockFailure(error)
    }
  }

  // The record of which features are off, and the one place that turns a feature off and falls back to stock SudokuPad. `log(labels, why)` reports it
  // and `changed()` is told after a feature goes off, so the style and the panel can follow. `attempt(names, run, fallback)` runs `run()` unless
  // every one of `names` is off already; when it throws, all of `names` go off for good, the error is logged once and `fallback(error)` answers. A
  // feature that is off is not run again, so its error does not repeat on every event, and `fallback()` answers at once. `run` holds the SudokuPad
  // calls a feature makes and the pure helpers of this file, so a throw there is a changed SudokuPad (or a bug, which the log shows with the error
  // itself); a SudokuPad function the feature only calls is wrapped in `inStock`, and its throw passes through as SudokuPad's own.
  function createFeatures (labels, needs, { log, changed }) {
    const off = new Set()
    const isOff = (name) => off.has(name) || (needs[name] || []).some(isOff)
    const offNames = () => Object.keys(labels).filter(isOff)
    const turnOff = (names, why) => {
      const fresh = [].concat(names).filter((name) => !off.has(name))
      if (!fresh.length) return
      fresh.forEach((name) => off.add(name))
      log(fresh.map((name) => labels[name]), why)
      changed()
    }
    return {
      isOff,
      turnOff,
      offNames,
      attempt (names, run, fallback = () => {}) {
        if ([].concat(names).every(isOff)) return fallback()
        try {
          return run()
        } catch (error) {
          if (error instanceof StockFailure) throw error.cause
          turnOff(names, error)
          return fallback(error)
        }
      }
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
  // the cell at (row, col) of a grid `cols` wide; null for any other value.
  function addedMark (value, row, col, cols) {
    const shape = shapeOf(value)
    if (shape !== null) return { point: edgeMidpoint(edgeOf(value), row, col), shape }
    const corner = cornerMarkOf(value)
    if (corner === null) return null
    return { point: cornerPoint(corner.kind, row, col, cols), shape: corner.type === 'x' ? 'x' : CIRCLE }
  }

  // Whether the arrow line `opts` asks `renderPen` for was dragged forward (true or false), when its value is a line and its
  // class holds a page 3 color character (`cell-pen pen-1 pencolor-j`); null for anything else.
  function arrowLineOf (opts) {
    const match = /(?:^|\s)pencolor-(\S+)$/.exec(opts.className || '')
    return match && LINE_VALUES.includes(opts.value) ? arrowLineWayOf(match[1]) : null
  }

  // An edge click has a select action and one pen action with an edge X value.
  function isEdgeActs (acts) {
    return acts !== null && acts.length === 2 && acts[0].type === 'select' && acts[1].type === 'pen' && EDGE_X.includes(acts[1].arg)
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

  // Every pen line on the grid as { value, row, col, color }, read off the cells; marks are not lines and are left out.
  function lineSegmentsOf (cells) {
    return cells.flatMap((cell) => (cell.pen || [])
      .filter((valueColor) => LINE_VALUES.includes(valueColor[0]))
      .map((valueColor) => ({ value: valueColor[0], row: cell.row, col: cell.col, color: valueColor.slice(1) })))
  }

  // The SudokuPad internals each feature cannot work without, as a Map of the first internal a feature lacks to the features that lack it, in the order the
  // dialog names them. `app` is `Framework.app` and `tool` is `ToolPen.tool`, undefined when SudokuPad has no pen tool. An empty map means nothing is missing.
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
      sliders: toolFns('drawLineHint'),
      outline: toolFns('drawLineHint'),
      marks: [
        ...actions, ...toolFns('getInputRc'), fn(grid, 'getCell'), ['grid.rows', Number.isInteger(grid && grid.rows)], ['grid.cols', Number.isInteger(grid && grid.cols)],
        fn(proto, 'renderPen'), fn(renderer && renderer.constructor, 'rcToPathData'), ['CellSize', Boolean(renderer) && typeof renderer.constructor.CellSize === 'number'], cells
      ],
      // `lineMode` is not on the tool on every page load, so the pulldown the sliders sit beside is what is watched (checkPanelRow).
      lineMode: [['ToolPen.tool', Boolean(tool)]],
      lineErase: [...actions, fn(app, 'xyToRCExact'), fn(grid, 'getCell'), cells]
    }
    // The features that lack the same internal go off in one report.
    const lacking = new Map()
    Object.entries(requirements).forEach(([name, needs]) => {
      const missing = needs.find(([, present]) => !present)
      if (missing) lacking.set(missing[0], [...(lacking.get(missing[0]) || []), name])
    })
    return lacking
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      VERSION,
      SETTINGS,
      slider,
      flag,
      flags,
      isPlainObject,
      isHexColor,
      inRange,
      settingDefaults,
      readSettings,
      changedSettings,
      saveSetting,
      normalizeColors,
      savedColors,
      editedColors,
      parseColor,
      isTransparent,
      darkenColor,
      derivedPenColors,
      buildCss,
      buildThicknessCss,
      buildOpacityCss,
      buildOutlineCss,
      renderOutlineFilter,
      OUTLINE_FILTER_ID,
      OUTLINE_WIDTH,
      ARROW_SPACING,
      enabledPages,
      stepEnabledPage,
      pageAfterSave,
      MARK_VALUES,
      MARKS_LAYER_ID,
      PEN_PAGES,
      LINE_VALUES,
      directionCharOf,
      arrowLineWayOf,
      ARROW_LINE,
      lineSegment,
      splitLineActs,
      linePoints,
      lineIdentityOf,
      segmentNear,
      connectedLine,
      eraseLineActs,
      LINE_HIT_RADIUS,
      arrowLine,
      penPageOf,
      penNumber,
      penCharOn,
      normalizePen,
      wrapIndex,
      normalizeLineMode,
      LINE_MODES,
      buildPagesCss,
      renderPageIcon,
      renderPanelSliders,
      renderEditor,
      createFeatures,
      lackingInternals,
      inStock,
      FEATURE_LABELS,
      FEATURE_NEEDS,
      markGrowthScale,
      DASH,
      normalizeMarkSettings,
      stepType,
      edgeMidpoint,
      addedMark,
      arrowLineOf,
      isEdgeActs,
      penValuesOf,
      planActs,
      lineSegmentsOf,
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
      SUDOKUPAD_PEN_COLORS,
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
  // A page with no Framework is not SudokuPad (the match covers other pages of crackingthecryptic.com) and is left alone;
  // a Framework without `getApp` is a SudokuPad this script cannot hook, which is reported.
  if (typeof Framework === 'undefined') return
  if (!Framework.getApp) {
    console.warn('pen-tool-extras: SudokuPad\'s Framework has no getApp, so nothing was changed')
    return
  }

  // Which features are off because SudokuPad changed. A feature that goes off leaves stock SudokuPad behavior; the dialog names it.
  const features = createFeatures(FEATURE_LABELS, FEATURE_NEEDS, {
    log: (labels, why) => console.error(`pen-tool-extras: ${labels.join(', ')} turned off because SudokuPad changed:`, why),
    changed: () => featuresChanged()
  })

  // The pen colors in force and the pen colors (by number) that kept SudokuPad's own because
  // the color page had no usable color at their index. Until the color tool is read they are
  // SudokuPad's own, which is what the page shows with no override.
  let active = { ...SUDOKUPAD_PEN_COLORS }
  let activeMissing = []
  // The value of every row of SETTINGS in force.
  const inForce = settingDefaults()
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
  // browser rejects stays as written, and `derivedPenColors` treats it as unreadable.
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

  // Draws an arrow line as a group (in the pen layer, with the classes the line would have had, so the color, the opacity and the
  // eraser's lookups act on it as on any stroke) of a line and a path of filled arrows (the fill is set in CSS, with the group's color).
  function renderArrowLine (renderer, opts, forward) {
    const shape = arrowLine(opts.value, forward, opts.row, opts.col, effectiveThickness(), inForce.arrowSpacing)
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

  // Puts the marks layer back as the last child of the pen layer, which a stroke SudokuPad has just added after it displaced, and
  // moves `part` into it when it is a mark. The cell still holds the same element, so erasing, undo and a redraw remove it from
  // wherever it is.
  function keepMarksAbove (part, isMark) {
    const layer = marksLayer()
    if (!layer) return
    if (isMark && part && part.parentNode !== layer) layer.appendChild(part)
    if (layer.parentNode.lastChild !== layer) layer.parentNode.appendChild(layer)
  }

  // Draws the values this script adds, and keeps every mark above the lines. SudokuPad's own `renderPen` has no case for the values
  // and gives the path no `d`; it copies every option onto the path, so passing `d` is enough. A line in a page 3
  // pen's color is drawn as an arrow line instead. A feature that is off draws as SudokuPad does.
  function wrapRenderPen (proto, renderer) {
    const original = proto.renderPen
    const size = renderer.constructor.CellSize
    // The options to draw with: a mark's get the path of its shape.
    const withMarkPath = (self, opts) => {
      const mark = addedMark(opts.value, opts.row, opts.col, Framework.app.grid.cols)
      return mark === null ? opts : Object.assign({}, opts, { d: self.constructor.rcToPathData([mark.point]) + shapePath(mark.shape, size * 0.125) })
    }
    proto.renderPen = function (opts = {}) {
      const forward = arrowLineOf(opts)
      // SudokuPad's own drawing runs outside what is tried, so a failure in it is not put down to a feature.
      const part = (forward !== null && features.attempt('arrowLines', () => renderArrowLine(this, opts, forward), () => null)) ||
        original.call(this, features.attempt('marks', () => withMarkPath(this, opts), () => opts))
      features.attempt('marks', () => keepMarksAbove(part, MARK_VALUES.includes(opts.value)))
      return part
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
      inStock(() => original.apply(tool, args))
    } finally {
      if (hadOwn) tool.actSend = ownSend
      else delete tool.actSend
      tool._actList.length = 0
    }
    return queued
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
    if (!markSettings.cornerX && !markSettings.cornerCircle) return null
    const { r, c } = tool.getInputRc()
    const { rows, cols } = Framework.app.grid
    return cornerAt(r, c, rows, cols)
  }

  // A click on a grid corner: this script's corner cycle (backwards after a right click) on the
  // cell that stores the corner, sent as one group like any pen click.
  function clickCorner (tool, corner) {
    const { rows, cols } = Framework.app.grid
    const { kind, row, col } = cornerStorage(corner.row, corner.col, rows, cols)
    const cell = Framework.app.grid.getCell(row, col)
    tool.actStart()
    planActs(cell, planCornerClick(kind, penValuesOf(cell), markSettings, steppingBackwards())).forEach((act) => tool.actAdd(act))
    inStock(() => tool.actSend())
  }

  // Erases the whole line under `point` ({ r, c } in cells from the grid's top left): every segment joined to the one nearest it and
  // drawn with the same pen, in one group, so one undo restores it. A point that is not near a line sends nothing.
  function eraseLineAt (tool, { r, c }) {
    const segments = lineSegmentsOf(Framework.app.puzzle.cells)
    const hit = segmentNear([r, c], segments, LINE_HIT_RADIUS)
    if (hit === null) return
    tool.actStart()
    eraseLineActs(connectedLine(segments, hit), (row, col) => Framework.app.grid.getCell(row, col)).forEach((act) => tool.actAdd(act))
    tool.actSend()
  }

  // A middle press over the grid in the pen tool erases the line under the pointer and has its default prevented, which stops the
  // browser's autoscroll. A prevented `pointerdown` also stops the browser sending `mousedown`, `mouseup` and so SudokuPad's
  // `clickCell` (checked live), so the erase runs from the press itself and no pen mark or drag follows. `mousedown` is prevented
  // too for a browser that still sends it, which stops only the autoscroll: SudokuPad's own `mousedown` handler still runs there.
  // The press's own coordinates are hit-tested, not SudokuPad's cached pointer position, which a dialog stops updating.
  function installMiddleClickErase (app, tool) {
    const middlePress = (event) => inForce.middleErase && event.button === MIDDLE_BUTTON && app.tool === 'pen' && event.target.closest && event.target.closest(GRID_SELECTOR)
    window.addEventListener('pointerdown', (event) => features.attempt('lineErase', () => {
      if (!middlePress(event)) return
      event.preventDefault()
      eraseLineAt(tool, app.xyToRCExact(event.clientX, event.clientY))
    }), true)
    window.addEventListener('mousedown', (event) => features.attempt('lineErase', () => { if (middlePress(event)) event.preventDefault() }), true)
  }

  // Chooses the mark for a click. A click within CORNER_RADIUS of a grid corner is a corner
  // click, checked first. Otherwise the original `clickCell` runs unchanged, so its
  // edge-versus-cell hit test decides what was clicked; its `actSend` is held back to see
  // the actions it queued. An edge click is replaced by this script's cycle (backwards after a
  // right click), and everything else is sent as it was. The actions still go out through
  // `actSend`, one group per click, so one undo reverses one click.
  function wrapClickCell (tool, original) {
    const clickMark = (self, args) => {
      const corner = cornerUnderPointer(self)
      if (corner !== null) return clickCorner(self, corner)
      const queued = queuedActs(self, original, args)
      if (queued === null) return
      let acts = queued
      if (isEdgeActs(queued)) {
        const cell = queued[0].arg[0]
        const plan = planClick(queued[1].arg, penValuesOf(cell), markSettings, steppingBackwards())
        if (plan === null) return
        acts = planActs(cell, plan)
      }
      acts.forEach((act) => self.actAdd(act))
      inStock(() => self.actSend())
    }
    tool.clickCell = function () {
      if (lastButton === MIDDLE_BUTTON && !features.isOff('lineErase')) {
        // A middle press that was not over the grid (just off its edge) still reaches `clickCell` on the release: it makes no mark.
        if (inForce.middleErase) return
        return original.apply(this, arguments)
      }
      // A click that failed half way leaves actions queued, which the original click must not send as its own.
      return features.attempt('marks', () => clickMark(this, arguments), (error) => {
        if (error && Array.isArray(this._actList)) this._actList.length = 0
        return original.apply(this, arguments)
      })
    }
  }

  // Whether the click now ending steps the cycle backwards: a right click, unless the right click feature is off.
  function steppingBackwards () {
    return lastButton === RIGHT_BUTTON && !features.isOff('rightClick')
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
    document.addEventListener('contextmenu', (event) => features.attempt('rightClick', () => {
      if (app.tool === 'pen' && event.target.closest(GRID_SELECTOR) && isMarkClick()) event.preventDefault()
    }), true)
  }

  // Cells drawn before the wrap hold values the old `renderPen` drew as nothing (this script's marks) or in the pen layer (every mark).
  function redrawMarks (app) {
    app.puzzle.cells.forEach((cell) => {
      if ((cell.pen || []).some((valueColor) => MARK_VALUES.includes(valueColor[0]))) cell.renderContent(true)
    })
  }

  // Whether the wrap on `renderPen` is in, so an arrow line is drawn by this script.
  let arrowLinesDrawn = false

  // Draws every arrow line again: an arrow's size and spacing are fixed when it is drawn, so a change of thickness, and a
  // wrap that came after the cell was drawn, need it. Cells with no arrow line are left alone.
  function redrawArrowLines () {
    if (!arrowLinesDrawn) return
    features.attempt('arrowLines', () => Framework.app.puzzle.cells.forEach((cell) => {
      if ((cell.pen || []).some((valueColor) => LINE_VALUES.includes(valueColor[0]) && arrowLineWayOf(valueColor[1]) !== null)) cell.renderContent(true)
    }))
  }

  function installEdgeMarks (app) {
    const marks = !features.isOff('marks')
    const lineErase = !features.isOff('lineErase')
    const arrowLines = !features.isOff('arrowLines')
    if (!marks && !lineErase && !arrowLines) return
    const tool = ToolPen.tool
    if (marks || arrowLines) wrapRenderPen(Object.getPrototypeOf(app.svgRenderer), app.svgRenderer)
    arrowLinesDrawn = arrowLines
    const original = tool.clickCell
    if (marks || lineErase) wrapClickCell(tool, original)
    trackButton()
    if (lineErase) installMiddleClickErase(app, tool)
    if (marks) {
      suppressMarkMenu(app, () => markUnderPointer(tool, original))
      features.attempt('marks', () => redrawMarks(app))
    }
    redrawArrowLines()
  }

  // The thickness and opacity in force: with the sliders off, SudokuPad's own, so the saved values wait for the sliders to come back.
  const effectiveThickness = () => features.isOff('sliders') ? THICKNESS.fallback : inForce.thickness
  const effectiveOpacity = () => features.isOff('sliders') ? OPACITY.fallback : inForce.opacity

  // Writes the style for the colors, thickness and opacity in force. The page rules, the outline and the panel rules are left out for a feature that is
  // off, and the panel rules also when SudokuPad's line mode pulldown, whose row they take, is not ours to hide.
  function applyStyle () {
    let style = document.getElementById(STYLE_ID)
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = [
      buildCss(active),
      buildThicknessCss(effectiveThickness()),
      buildOpacityCss(effectiveOpacity()),
      buildOutlineCss(inForce.outline && !features.isOff('outline')),
      features.isOff('pages') ? '' : buildPagesCss(effectiveThickness(), inForce.dash),
      EDIT_CSS,
      DIALOG_CSS,
      features.isOff('gear') ? '' : GEAR_CSS,
      features.isOff('lineMode') ? '' : PANEL_CSS
    ].join('\n')
  }

  // After a feature goes off: the style drops its rules, the pen buttons go back to SudokuPad's own and the panel loses what is no longer ours.
  function featuresChanged () {
    applyStyle()
    if (features.isOff('pages')) {
      setPadPage(0)
      putStockPenBack()
    }
    syncPenPanel()
  }

  // The pen's line mode now, or undefined when the line mode feature is off. It is the saved one: SudokuPad's pen tool holds its
  // default until it first opens and reads the saved mode then, and with the pulldown hidden only this dialog
  // changes it. It does not depend on the page support in `installPenPages`.
  function currentLineMode () {
    return features.isOff('lineMode') ? undefined : normalizeLineMode(Framework.getData(LINE_MODE_KEY))
  }

  // Sets the line mode and saves it where SudokuPad does, so its hidden pulldown, when the pen tool is on, shows it too.
  function applyLineMode (lineMode) {
    ToolPen.tool.lineMode = lineMode
    Framework.setData(LINE_MODE_KEY, lineMode)
    const select = document.querySelector(`${LINE_MODE_BOX} select`)
    if (select) select.value = lineMode
  }

  // Gives the dialog's button row its look (DIALOG_CSS): Restore defaults at the left, then Cancel and Save, under a divider. A dialog whose
  // buttons are not the three of this one's is left with SudokuPad's own stacked buttons.
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
    // True after Restore defaults until a color is edited: Save then clears the saved set.
    let reset = false
    // The pen colors picked by hand since the dialog opened or Restore defaults. Save with none
    // changes nothing, so a derived set is never saved by accident.
    const edited = new Set()
    let marks = markSettings
    let lineMode = currentLineMode()
    // The sliders and boxes are drafts of what is in force, applied on Save.
    let draft = { ...inForce }
    let box = null
    const draw = () => {
      box.innerHTML = renderEditor({ colors, missing: missing.filter((n) => !edited.has(String(n))), marks, lineMode, ...draft, off: features.offNames() })
    }
    // Reads the color tool's current page now; with no color tool, SudokuPad's own colors.
    const restoreDefaults = () => {
      const tool = readyColorTool()
      const derived = (tool && features.attempt('colors', () => deriveFromTool(tool), () => null)) || { colors: { ...SUDOKUPAD_PEN_COLORS }, missing: [] }
      colors = derived.colors
      missing = derived.missing
      edited.clear()
      reset = true
      // The sliders and boxes are drafts like the colors: they go back to their defaults on Save, and Cancel
      // leaves what is in force.
      draft = settingDefaults()
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
                saveSettings(draft)
                if (lineMode !== undefined && lineMode !== currentLineMode()) features.attempt('lineMode', () => applyLineMode(lineMode))
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
    // A ticked or unticked box shows or hides the slider row under it at once; the slider keeps its value.
    const showRow = (key, shown) => { box.querySelector(`[data-row="${key}"]`).style.display = shown ? 'grid' : 'none' }
    draw()
    arrangeButtons(box)
    // `change` fires when a color picker closes (the swatch the user sees is already the new
    // color), when a mark box or a slider box is ticked and when the line mode is chosen.
    // A dialog slider is a draft: its readout moves with it and nothing is applied until Save.
    box.addEventListener('input', (event) => {
      const el = event.target.closest('input[type="range"]')
      if (!el) return
      const value = Number(el.value)
      if (!SETTINGS[el.dataset.setting]) throw new Error(`pen-tool-extras: the dialog has no slider named ${el.dataset.setting}`)
      draft[el.dataset.setting] = value
      box.querySelector(`output[data-readout="${el.dataset.setting}"]`).textContent = String(value)
    })
    // The button sets the nine pickers to SudokuPad's own pen colors, as if each had been picked by hand: Save keeps them as the user's
    // colors and Cancel leaves the colors in force. It closes nothing, so the release of its press lands on the dialog.
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
      const outlined = event.target.closest('input[data-outline]')
      if (outlined) {
        draft.outline = outlined.checked
        showRow('outlineWidth', draft.outline)
        return
      }
      const erasing = event.target.closest('input[data-middle-erase]')
      if (erasing) {
        draft.middleErase = erasing.checked
        return
      }
      const styled = event.target.closest('input[data-style]')
      if (styled) {
        draft.lineStyles = { ...draft.lineStyles, [styled.dataset.style]: styled.checked }
        showRow(STYLE_SLIDERS[styled.dataset.style], styled.checked)
        return
      }
      const shown = event.target.closest('input[data-show]')
      if (shown) {
        draft.show = { ...draft.show, [shown.dataset.show]: shown.checked }
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

  // Thickness in force changed: arrow lines already drawn are drawn again at it, and the panel's slider, when it is showing, moves to it.
  function adoptThickness () {
    redrawArrowLines()
    document.querySelectorAll(`#${THICKNESS_SLIDER}`).forEach((el) => { el.value = inForce.thickness })
  }

  // Opacity in force changed: the panel's slider, when it is showing, moves to it.
  function adoptOpacity () {
    document.querySelectorAll(`#${OPACITY_SLIDER}`).forEach((el) => { el.value = inForce.opacity })
  }

  // The outline or its width in force changed: the filter the style points at is rebuilt at the width, or taken away with the outline off.
  function adoptOutline () {
    const holder = document.getElementById(OUTLINE_HOLDER_ID)
    if (holder) holder.remove()
    if (inForce.outline) document.body.insertAdjacentHTML('beforeend', renderOutlineFilter(inForce.outlineWidth))
  }

  // The enabled line styles changed: the page button, Tab and the wheel skip a page that is not enabled, and a pen on one becomes the
  // pen of the same number on page 1. Lines already drawn in a page that is not enabled still draw: its rules stay in the style.
  function adoptLineStyles () {
    if (penTool) {
      const pen = pageAfterSave(selectedPen(), inForce.lineStyles)
      if (pen !== selectedPen()) {
        if (penTool.active) penTool.setSelectedColor(pen)
        else Framework.setData(PEN_KEY, pen)
      }
    }
    syncPenPanel()
  }

  // The panel sliders that show changed: the sliders in the panel are rebuilt (or taken away).
  function adoptShow () {
    document.querySelectorAll(`.${SLIDERS}`).forEach((el) => el.remove())
    syncPenPanel()
  }

  // Each setting that differs from what is in force is saved and put in force, then the effects run with every new value in place, and the style is written once.
  function saveSettings (draft) {
    const changed = changedSettings(draft, inForce)
    if (!changed.length) return
    changed.forEach((name) => {
      saveSetting(Framework, SETTINGS[name], draft[name])
      inForce[name] = draft[name]
    })
    changed.forEach((name) => SETTINGS[name].effect())
    applyStyle()
  }

  // Moving a panel slider sets and saves its value at once. It changes no cell, so nothing goes on the
  // undo stack or in the replay.
  function saveSlider (slider) {
    const name = slider.id === THICKNESS_SLIDER ? 'thickness' : 'opacity'
    saveSettings({ ...inForce, [name]: Number(slider.value) })
  }

  const PEN_PANEL = '.tool-pen .controls-input'
  // How long the pen tool's panel may be up without a line mode pulldown before the pulldown is taken for gone: SudokuPad builds the panel in steps.
  const PANEL_CHECK_MS = 1000
  let panelCheck = null

  // The panel is up and SudokuPad's pulldown, whose row the sliders and page button take, is not in it: a renamed element, so the row is not ours.
  function checkPanelRow () {
    if (panelCheck !== null || !document.querySelector(PEN_PANEL)) return
    panelCheck = setTimeout(() => {
      panelCheck = null
      if (document.querySelector(PEN_PANEL) && !document.querySelector(LINE_MODE_BOX)) features.turnOff('lineMode', 'the pen tool panel has no .penlinemode')
    }, PANEL_CHECK_MS)
  }

  // Keeps the pen tool's panel as this script wants it. SudokuPad builds `.penlinemode` each time
  // the pen tool is turned on and removes it when another tool is; the sliders and the page button are
  // added beside it (it is hidden, not removed, so SudokuPad's own handlers keep their element) and taken
  // away with it. Safe to run any number of times.
  function syncPenPanel () {
    const mode = document.querySelector(LINE_MODE_BOX)
    const sliders = document.querySelector(`.${SLIDERS}`)
    const removeSliders = () => { if (sliders) sliders.remove() }
    if (!mode) checkPanelRow()
    // The panel's last row is ours only while the line mode pulldown that fills it is hidden and moved into the dialog.
    if (!mode || features.isOff('lineMode')) {
      removeSliders()
      removePageButtons()
      return
    }
    features.attempt('sliders', () => {
      const markup = renderPanelSliders(inForce.thickness, inForce.opacity, inForce.show)
      if (!markup) removeSliders()
      if (markup && !sliders) mode.insertAdjacentHTML('afterend', markup)
    }, removeSliders)
    syncPageButton()
  }

  // Puts the gear in the pen tool button, once; a page without the button (the pen tool is off, or the controls are not built yet) gets none.
  function syncGear () {
    features.attempt('gear', () => {
      const button = document.querySelector(GEAR_BUTTON)
      if (button && !button.querySelector(`.${GEAR_CLASS}`)) button.insertAdjacentHTML('beforeend', GEAR_MARKUP)
    }, () => document.querySelectorAll(`.${GEAR_CLASS}`).forEach((el) => el.remove()))
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

  function removePageButtons () {
    document.querySelectorAll(`.${PAGE_BUTTON}`).forEach((el) => el.remove())
  }

  // A drag on a slider leaves the focus on it, and then the arrow and paging keys would move the slider
  // and not reach the puzzle; the focus goes back to the page when the pointer is released.
  function installPenPanel () {
    new window.MutationObserver(syncPenPanel).observe(document.body, { childList: true, subtree: true })
    syncPenPanel()
    document.addEventListener('input', (event) => {
      if (event.target.matches(`.${SLIDERS} input`)) features.attempt('sliders', () => saveSlider(event.target))
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

  // The pen tool, once its selection is wrapped for pages; null until then, and when it cannot be. `stockSelectColor` is SudokuPad's own
  // `setSelectedColor`, which the wrapper replaced.
  let penTool = null
  let stockSelectColor = null

  // A page 2 or page 3 pen still selected when the pages go off would draw with no color, so SudokuPad's own pen of the same color number is selected.
  function putStockPenBack () {
    if (!penTool || penPageOf(selectedPen()) < 1) return
    try {
      stockSelectColor.call(penTool, penNumber(selectedPen()))
    } catch (error) {
      // Best effort: the pages are off already, and the pen stays as it is until the user picks another.
      console.error('pen-tool-extras: could not select the pen on page 1 again:', error)
    }
  }

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
      const index = PEN_COLOR_NUMBERS.indexOf(button.dataset.key)
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
    if (!penTool || !mode || features.isOff('lineMode')) return
    features.attempt('pages', () => {
      // With no line style enabled there is no page to turn to, and no button.
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

  // Selects the pen on the enabled page `delta` pages from the selected one with the same color number: a page
  // turn keeps the color and changes how it draws, and a pen is always selected on the page showing.
  function turnPage (delta) {
    const number = penNumber(selectedPen()) || PEN_COLOR_NUMBERS[0]
    penTool.setSelectedColor(penCharOn(stepEnabledPage(currentPage(), delta, inForce.lineStyles), number))
  }

  // The selected pen is saved under PEN_KEY, and `ToolPen_color` keeps only its color number. After a
  // reload SudokuPad has selected that number on the first page; the saved pen replaces it when its color
  // number is that one, so a number changed by stock SudokuPad (the script removed for a while) wins.
  function restoreSelectedPen (saved) {
    if (saved && saved !== selectedPen() && penNumber(saved) === selectedPen()) penTool.setSelectedColor(saved)
  }

  // The saved pen `pen` (or null), moved to page 1 when its page is not enabled.
  const pageAfterSavedPen = (pen) => pen && pageAfterSave(pen, inForce.lineStyles)

  // The group `id`, made on first use as the last child of the pen layer, or right after it with `beside`; null when the page has no
  // pen layer.
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

  // The group the marks live in, inside the pen layer; null when the page has no pen layer.
  function marksLayer () {
    return layerIn(MARKS_LAYER_ID, false)
  }

  // The group the drag highlight lives in, made on first use beside the pen layer; null when the page has no
  // pen layer.
  function hintLayer () {
    return layerIn(HINT_LAYER_ID, true)
  }

  // Each wrapper below asks SudokuPad's own function when its feature is off, or when it just failed.
  function installPenPages (tool) {
    penTool = tool
    const select = tool.setSelectedColor
    stockSelectColor = select
    // SudokuPad's own looks for the button holding the color, so the pad shows the pen's page first, and it
    // saves the pen to `ToolPen_color`, which is put back to the color number the moment it returns.
    // Its own read of `ToolPen_color` gives a number for a digit (`getData` parses), so the color is a string here.
    tool.setSelectedColor = function (color) {
      const pen = String(color)
      const page = features.attempt('pages', () => penPageOf(pen), () => -1)
      if (page === -1) return select.call(this, color)
      features.attempt('pages', () => setPadPage(page))
      select.call(this, pen)
      features.attempt('pages', () => {
        Framework.setData('ToolPen_color', penNumber(pen))
        Framework.setData(PEN_KEY, pen)
        syncPageButton()
      })
    }
    const enter = tool.handleToolEnter
    // SudokuPad's own enter selects the saved color number through the wrapper above, which saves it as the
    // pen, so the saved pen is read first.
    tool.handleToolEnter = function () {
      const saved = features.attempt('pages', () => pageAfterSavedPen(normalizePen(Framework.getData(PEN_KEY))), () => null)
      enter.call(this)
      features.attempt('pages', () => restoreSelectedPen(saved))
    }
    // The panel's buttons are shared with the other tools, which read their `data-value`.
    const exit = tool.handleToolExit
    tool.handleToolExit = function () {
      exit.call(this)
      features.attempt('pages', () => setPadPage(0))
    }
    // SudokuPad asks every tool's `handleKeydown` before its key handlers, and stops at the first that answers, so
    // answering Tab here also keeps it from the letter tool's Tab binding (which does nothing in the pen tool in
    // SudokuPad now, with No Tab Letters installed or not), and the key's default of moving the focus is stopped.
    // Shift+Tab is left alone: a held Shift is the letter tool's own temporary switch.
    const keydown = tool.handleKeydown
    tool.handleKeydown = function (event) {
      const turned = features.attempt('pages', () => {
        if (!hasPageToTurnTo() || Framework.app.tool !== this.name || event.code !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false
        event.preventDefault()
        turnPage(1)
        return true
      }, () => false)
      return turned || (typeof keydown === 'function' ? keydown.call(this, event) : false)
    }
    document.addEventListener('click', (event) => features.attempt('pages', () => {
      if (event.target.closest(`.${PAGE_BUTTON}`)) turnPage(1)
    }))
    // The wheel turns the page only over the page button, as SudokuPad's color tool does over its own, and like that one it does not cancel the wheel.
    document.addEventListener('wheel', (event) => features.attempt('pages', () => {
      if (event.deltaY === 0 || !hasPageToTurnTo() || !event.target.closest(`.${PAGE_BUTTON}`)) return
      turnPage(event.deltaY < 0 ? -1 : 1)
    }))
    features.attempt('pages', () => {
      if (tool.active) restoreSelectedPen(pageAfterSavedPen(normalizePen(Framework.getData(PEN_KEY))))
      syncPageButton()
    })
  }

  // SudokuPad draws the drag highlight inside the pen layer; it is moved to the layer beside it the moment it exists, so the layer's opacity and outline do
  // not touch it.
  function installHintLayer (tool) {
    const drawHint = tool.drawLineHint
    tool.drawLineHint = function (path) {
      drawHint.call(this, path)
      features.attempt(['sliders', 'outline'], () => {
        const layer = hintLayer()
        if (layer && this.linePart && this.linePart.parentNode !== layer) layer.appendChild(this.linePart)
      })
    }
  }

  // A line dragged with a page 3 pen is stored with the character of the way each segment was dragged. The tool queues its
  // actions (and its path) before `actSend` sends them, so they are rewritten there. A drag that erases queues the value
  // alone, which removes the line whichever way it was stored, and is left as it is.
  function installArrowDrags (tool) {
    const send = tool.actSend
    tool.actSend = function () {
      features.attempt('arrowLines', () => {
        if (this.eraseMode || !Array.isArray(this.currentPath) || arrowLineWayOf(selectedPen()) === null) return
        // A drag that no segment explains (SudokuPad's path changed) turns the arrows off and goes out as SudokuPad queued it, every line in the pen's own character.
        this._actList.splice(0, this._actList.length, ...splitLineActs(this._actList, this.currentPath, selectedPen()))
      })
      return send.apply(this, arguments)
    }
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
    // True from the moment a hold opens or closes edit mode until the next press anywhere.
    let holdDone = false
    const cancel = () => { clearTimeout(timer); timer = undefined }
    // Pointer events carry a mouse button of either kind, and touch too (touch is not tested).
    document.addEventListener('pointerdown', (event) => {
      cancel()
      holdDone = false
      if (features.isOff('colors')) return
      const target = event.target.closest(HOLD_TARGETS)
      if (!target) return
      const panel = target.closest('.tool-pen')
      timer = setTimeout(() => { holdDone = true; features.attempt('colors', () => toggleEditMode(panel)) }, HOLD_TO_EDIT_MS)
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

  // Turns off each feature whose SudokuPad internals are not there, before anything is installed, so it leaves stock SudokuPad behavior.
  function checkFeatures (app) {
    const tool = typeof ToolPen !== 'undefined' ? ToolPen.tool : undefined
    lackingInternals(app, tool).forEach((names, missing) => features.turnOff(names, `SudokuPad has no ${missing}`))
  }

  Framework.getApp().then(async () => {
    checkFeatures(Framework.app)
    // Read before the panel is built, which the first sync does with the pen tool already on.
    Object.assign(inForce, readSettings(Framework))
    installHoldToEdit()
    installPenPanel()
    installGear()
    installOverlayPressSwallow()
    markSettings = normalizeMarkSettings(Framework.getData(MARKS_KEY))
    Object.values(SETTINGS).forEach((setting) => setting.effect())
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
    installEdgeMarks(Framework.app)
    if (!features.isOff('pages')) installPenPages(ToolPen.tool)
    if (!features.isOff('sliders') || !features.isOff('outline')) installHintLayer(ToolPen.tool)
    if (!features.isOff('arrowLines')) installArrowDrags(ToolPen.tool)
    const saved = savedColors(Framework.getData(COLORS_KEY))
    if (saved) {
      adoptColors(saved, [])
      return
    }
    // Nothing saved: the pen takes the darkened current color page, read once at load. When
    // the color tool never becomes ready, SudokuPad's own pen colors stay in force.
    if (features.isOff('colors')) return
    const tool = await waitForColorTool()
    if (!tool) {
      console.warn(`pen-tool-extras: the color tool was not ready after ${COLOR_TOOL_WAIT_MS / 1000} s, so the pen keeps SudokuPad's own colors`)
      return
    }
    // A save made in the dialog while waiting outranks the derived colors.
    if (savedColors(Framework.getData(COLORS_KEY))) return
    const derived = features.attempt('colors', () => deriveFromTool(tool), () => null)
    if (derived) adoptColors(derived.colors, derived.missing)
  })
})()
