'use strict'
require('./fake-page-storage.js')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { fakeStore } = require('./fake-store.js')
const { startScript } = require('./unit-start.js')
const { loadLib } = require('./load-lib.js')
const { SUDOKUPAD_PURPLE } = loadLib(['sudokupad'], ['SUDOKUPAD_PURPLE'])
const {
  buildCss, SUDOKUPAD_PEN_COLORS, editedColors,
  readPenColors, storedPenColors, startupPenColors, PRESET_LABELS,
  buildThicknessCss, buildOpacityCss, renderPanelSliders, renderLineModeButton, nextLineMode, PANEL_CSS, renderEditor, DIALOG_CSS, markGrowthScale, MARK_VALUES, DASH, OPACITY, THICKNESS, FULL_WIDTH_VALUES, VERSION, buildOutlineCss, buildFeedbackCss, renderOutlineFilter, OUTLINE_FILTER_ID, OUTLINE_WIDTH,
  copiedSettings, pastedSettings, READERS, SETTINGS, draftWithBox, slider, flag, flags, isPlainObject, isHexColor, inRange, settingDefaults, readSettings, changedSettings, saveSetting, saveChangedSettings, effectsOf,
  stepType, EDGE_CYCLE, planClick, normalizeMarkSettings, shapePath,
  CORNER_VALUES, cornerAt, cornerStorage, cornerPoint, cornerMarks,
  clickedMarks, marksAtPoint, holdsMark, DOT_FILL_CSS,
  PEN_PAGES, penPageOf, penNumber, penCharOn, digitKeyPen, normalizePen, buildPagesCss, pageSwatch, renderSettingsButton, PAGE_BUTTON_ANGLE, renderPageIcon, normalizeLineMode, LINE_MODES,
  LINE_VALUES, directionCharOf, arrowLineWayOf, ARROW_LINE, lineSegment, splitLineActs, arrowLine,
  ARROW_SPACING, enabledPages, stepEnabledPage, pageAfterSave,
  linePoints, lineIdentityOf, segmentNear, connectedLine, eraseActs, LINE_HIT_RADIUS, hitRadiusAt, HIT_FLOOR_PX, CORNER_RADIUS, CORNER_RADIUS_MAX, LINE_HIT_RADIUS_MAX,
  lackingInternals, FEATURES, arrowHeads,
  edgeMidpoint, addedMark, arrowLineOf, isEdgeActs, penValuesOf, planActs, lineSegmentsOf, whenReady
} = require('../pen-tool-extras.user.js')
const readPaste = (text) => pastedSettings(text, READERS)

const nextType = (current, settings) => stepType(current, settings, EDGE_CYCLE)
// A corner's and a cell middle's step through their marks, as the click takes it.
const planCornerClick = (kind, present, settings) => cornerMarks(kind, {}).plan(present, settings)
const planCellClick = (present, settings) => clickedMarks([{ type: 'select', arg: [{}] }, { type: 'pen', arg: '5' }]).plan(present, settings)

// SudokuPad's tool-pen.css (v0.611.0) as #rrggbb, typed out here as the independent source.
// Pen color 9 is written there as rgb(-36, -36, -36), which clamps to black.
const TABLE = {
  1: '#1f8020', 2: '#e87cf1', 3: '#e49632', 4: '#f53a37', 5: '#d2be32', 6: '#3d99f5', 7: '#d6d6d6', 8: '#7c7c7c', 9: '#000000'
}

const colorsRead = (data) => readPenColors(data).colors

test('a saved #rrggbb color is kept, lowercased', () => {
  assert.deepEqual(colorsRead({ 4: '#FF0000' }), { ...TABLE, 4: '#ff0000' })
})

test('a saved entry that is not a #rrggbb color falls back to that pen color\'s default', () => {
  const saved = { 1: '#00ff00', 2: 'red', 3: '#abc', 4: 7, 5: null, 6: undefined, 0: '#ff0000', 10: '#ff0000', x: '#ff0000', 9: '#ff0000;}body{display:none' }
  assert.deepEqual(colorsRead(saved), { ...TABLE, 1: '#00ff00' })
})

test('a saved color with junk before it, or a non-string entry, falls back to that pen color\'s default', () => {
  const saved = { 1: 'x;}body{display:none}#ff0000', 2: ['#ff0000'], 3: { toLowerCase: () => '#ff0000' }, 4: '#00ff00' }
  assert.deepEqual(colorsRead(saved), { ...TABLE, 4: '#00ff00' })
})

test('the colors read have exactly nine keys, whatever was saved', () => {
  assert.deepEqual(Object.keys(colorsRead({ 10: '#ff0000', 0: '#ff0000', 4: '#00ff00' })), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
})

test('the colors read are a copy, never the saved object or the defaults', () => {
  const saved = { 1: '#ff0000' }
  assert.notEqual(colorsRead(saved), saved)
  // Every saved color is SudokuPad's own, so only a copy tells the result from the defaults.
  assert.notEqual(colorsRead({ ...SUDOKUPAD_PEN_COLORS }), SUDOKUPAD_PEN_COLORS)
})

test('buildCss writes the nine variables under :root:root, not plain :root', () => {
  const css = buildCss({ ...TABLE, 4: '#112233' })
  const lines = css.split('\n')
  assert.equal(lines[0], ':root:root {')
  assert.equal(lines[lines.length - 1], '}')
  assert.equal(lines.length, 11)
  assert.ok(lines.includes('  --puzzle-pencolor-4: #112233;'))
  assert.ok(lines.includes('  --puzzle-pencolor-9: #000000;'))
  assert.equal(css.includes('pencolor-erase'), false)
})
// A saved set of nine distinct colors, so a test can tell which entry went where.
const NINE_SAVED = { 1: '#010101', 2: '#020202', 3: '#030303', 4: '#040404', 5: '#050505', 6: '#060606', 7: '#070707', 8: '#080808', 9: '#090909' }

test('readPenColors is null when nothing usable is saved, so the install save is still owed', () => {
  for (const none of [null, undefined, 'red', 7, true, [], ['#ff0000'], '{"1":"#ff0000"}', {}, { preset: 'page-1' }, { 4: 'url(x)' }, { 0: '#ff0000' }]) {
    assert.equal(readPenColors(none), null, JSON.stringify(none))
  }
})

test('readPenColors does not read an array by index', () => {
  // Index 1 holds a usable color: only the array guard stops it counting as pen color 1.
  assert.equal(readPenColors(['x', '#ff0000', '#00ff00']), null)
})

test('readPenColors reads colors saved with no preset name, as older versions save them, as Custom and unchanged', () => {
  assert.deepEqual(readPenColors(NINE_SAVED), { colors: NINE_SAVED, preset: 'custom', missing: [] })
})

test('readPenColors keeps a saved preset name, and reads one it does not know as Custom', () => {
  assert.deepEqual(readPenColors({ ...NINE_SAVED, preset: 'page-2' }), { colors: NINE_SAVED, preset: 'page-2', missing: [] })
  assert.deepEqual(readPenColors({ ...NINE_SAVED, preset: 'sudokupad' }), { colors: NINE_SAVED, preset: 'sudokupad', missing: [] })
  for (const odd of ['page-4', 'custom', 'unsaved', 'Darker page 1', 7, null]) {
    assert.equal(readPenColors({ ...NINE_SAVED, preset: odd }).preset, 'custom', JSON.stringify(odd))
  }
})

test('storedPenColors keeps the nine colors where older versions read them and adds the preset name beside them, but none for Custom', () => {
  assert.deepEqual(storedPenColors({ colors: NINE_SAVED, preset: 'page-1', missing: [4] }), { ...NINE_SAVED, preset: 'page-1' })
  assert.deepEqual(storedPenColors({ colors: NINE_SAVED, preset: 'custom', missing: [] }), NINE_SAVED)
  assert.deepEqual(readPenColors(storedPenColors({ colors: NINE_SAVED, preset: 'page-3', missing: [] })), { colors: NINE_SAVED, preset: 'page-3', missing: [] })
})

test('startupPenColors loads a saved set, waits for the color tool when nothing is saved, and saves SudokuPad\'s colors when there is no color tool', () => {
  assert.deepEqual(startupPenColors({ ...NINE_SAVED, preset: 'page-2' }, true), { load: { colors: NINE_SAVED, preset: 'page-2', missing: [] } })
  assert.deepEqual(startupPenColors(NINE_SAVED, false), { load: { colors: NINE_SAVED, preset: 'custom', missing: [] } })
  assert.deepEqual(startupPenColors(null, true), { wait: true })
  assert.deepEqual(startupPenColors(null, false), { save: { colors: TABLE, preset: 'sudokupad', missing: [] } })
})

test('PRESET_LABELS names the palette presets and the two states a set can be in beside them', () => {
  assert.deepEqual(['page-1', 'page-2', 'page-3', 'sudokupad', 'custom', 'unsaved'].map((id) => PRESET_LABELS[id]),
    ['Darker page 1', 'Darker page 2', 'Darker page 3', 'SudokuPad colors', 'Custom', 'SudokuPad (unsaved)'])
})

test('editedColors gives the whole current set with one pen color changed, lowercased, leaving the input alone', () => {
  const current = { ...TABLE }
  const out = editedColors(current, '4', '#AABBCC')
  assert.deepEqual(out, { ...TABLE, 4: '#aabbcc' })
  assert.deepEqual(current, TABLE)
})

test('editedColors refuses a pen color or a value it cannot save, rather than saving a wrong set', () => {
  assert.throws(() => editedColors(TABLE, '0', '#aabbcc'), RangeError)
  assert.throws(() => editedColors(TABLE, '10', '#aabbcc'), RangeError)
  assert.throws(() => editedColors(TABLE, '4', 'red'), RangeError)
  assert.throws(() => editedColors(TABLE, '4', '#abc'), RangeError)
})

test('the thickness runs 1 to 16 in half steps from SudokuPad\'s own pen width of 5', () => {
  assert.deepEqual(THICKNESS, { min: 1, max: 16, step: 0.5, fallback: 5 })
})

test('the thickness setting keeps a saved whole or half number from 1 to 16 unchanged', () => {
  for (const ok of [1, 1.5, 2.5, 5, 8, 12.5, 15.5, 16]) {
    assert.equal(SETTINGS.thickness.normalize(ok), ok)
    assert.equal(SETTINGS.thickness.accepts(ok), true, String(ok))
  }
})

test('a half-step thickness is saved as it is, not rounded', () => {
  const calls = []
  saveSetting({ setData: (key, value) => calls.push([key, value]), removeData: () => {} }, SETTINGS.thickness, 1.5)
  assert.deepEqual(calls, [['PenColor_thickness', 1.5]])
})

test('inRange takes any multiple of the step from the minimum, and a whole-number range stays whole', () => {
  assert.equal(inRange(2.5, THICKNESS), true)
  assert.equal(inRange(2.25, THICKNESS), false)
  assert.equal(inRange(2.5, DASH), false)
  assert.equal(inRange(2.5, OPACITY), false)
  assert.equal(inRange(22, OPACITY), false)
})

test('the thickness setting falls back to 5 for nothing saved and for anything untrusted', () => {
  for (const bad of [null, undefined, 0, 0.5, 16.5, 17, -3, 2.25, 1.75, 2.4, NaN, Infinity, '7', [7], { a: 7 }, true]) {
    assert.equal(SETTINGS.thickness.normalize(bad), 5, String(bad))
  }
})

test('the full width values are the free lines and the cell circle and cross, not the edge X marks or the arrows and circles this script adds', () => {
  assert.deepEqual(FULL_WIDTH_VALUES, ['1', '2', '5', '6', '7', '8', '9', 'a', 'd', 'e', 'f', 'g'])
})

function rulesByValue (css) {
  const byValue = {}
  for (const rule of css.split('\n')) {
    const [selector, body] = rule.split(' { ')
    const scale = /transform: scale\(([\d.]+)\)/.exec(body)
    const entry = { width: Number(/stroke-width: ([\d.]+);/.exec(body)[1]), scale: scale ? Number(scale[1]) : 1 }
    for (const part of selector.split(', ')) byValue[part.replace(':root:root .cell-pen.pen-', '')] = entry
  }
  return byValue
}

function widthsOf (css) {
  return Object.fromEntries(Object.entries(rulesByValue(css)).map(([v, { width, scale }]) => [v, String(Math.round(width * scale * 1e6) / 1e6)]))
}

const scalesOf = (css) => Object.fromEntries(Object.entries(rulesByValue(css)).map(([v, { scale }]) => [v, scale]))

test('buildThicknessCss at 5 gives the widths the pen had before: free lines, circle and cross 5; edge X marks, arrows and edge circles 2.5', () => {
  const widths = widthsOf(buildThicknessCss(5))
  for (const v of FULL_WIDTH_VALUES) assert.equal(widths[v], '5', v)
  for (const v of ['3', '4', 'b', 'c', 'h', 'i', 'k', 'l', 'n', 'o', 'q', 'r', 'j', 'm', 'p', 's']) assert.equal(widths[v], '2.5', v)
})

test('one thickness scales every width by the same factor: 10 doubles all of them', () => {
  const before = widthsOf(buildThicknessCss(5))
  const after = widthsOf(buildThicknessCss(10))
  assert.deepEqual(Object.keys(after), Object.keys(before))
  for (const v of Object.keys(before)) assert.equal(Number(after[v]), Number(before[v]) * 2, v)
})

test('every selector sits under :root:root, and no value gets two width rules', () => {
  const selectors = buildThicknessCss(5).split('\n').flatMap((rule) => rule.split(' { ')[0].split(', '))
  for (const s of selectors) assert.match(s, /^:root:root \.cell-pen\.pen-[0-9a-z]$/)
  assert.equal(new Set(selectors).size, selectors.length)
})

test('edge marks and corner marks keep today\'s size up to the default thickness of 5 and grow gradually above it, to 1.6 times at 16', () => {
  for (const t of [1, 3, 5]) assert.equal(markGrowthScale(t), 1, String(t))
  assert.equal(markGrowthScale(16), 1.6)
  const grown = [6, 10, 16].map(markGrowthScale)
  assert.equal(grown[0] > 1 && grown[0] < grown[1] && grown[1] < grown[2], true, grown.join(' < '))
  assert.equal(markGrowthScale(10), 1.2727)
})

test('MARK_VALUES holds exactly the values of SudokuPad\'s edge X and cell circle and cross and of every edge, grid-corner and cell mark this script adds, and no line value', () => {
  const expected = ['3', '4', 'b', 'c', '5', '6', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z']
  assert.deepEqual([...MARK_VALUES].sort(), [...expected].sort())
  assert.deepEqual(MARK_VALUES.filter((v) => LINE_VALUES.includes(v)), [])
})

test('the scale lands on every edge and corner mark and the cell dot and on no line, and a mark stays centred on its edge, corner or cell while it grows', () => {
  const css = buildThicknessCss(16)
  const scales = scalesOf(css)
  const marks = ['3', '4', 'b', 'c', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z']
  for (const v of marks) assert.equal(scales[v], 1.6, v)
  for (const v of FULL_WIDTH_VALUES) assert.equal(scales[v], 1, v)
  const rule = css.split('\n').find((r) => r.includes('.pen-3,'))
  assert.match(rule, /transform-box: fill-box; transform-origin: center;/)
})

test('a grown mark is as thick as before: its stroke width is shrunk by the scale, so only its length grows', () => {
  const widths = widthsOf(buildThicknessCss(16))
  for (const v of ['3', 'h', 'o', 's', 't', 'y']) assert.equal(widths[v], '8', v)
  const rule = buildThicknessCss(16).split('\n').find((r) => r.includes('.pen-3,'))
  assert.match(rule, /stroke-width: 5;/)
})

test('lines are never scaled', () => {
  const lines = buildThicknessCss(16).split('\n').find((r) => r.includes('.pen-1,'))
  assert.equal(lines.includes('transform'), false)
})

test('the opacity runs 20 to 100 percent in steps of 5 from SudokuPad\'s own pen opacity of 80', () => {
  assert.deepEqual(OPACITY, { min: 20, max: 100, step: 5, fallback: 80 })
})

test('the opacity setting keeps a saved whole number from 20 to 100 on the slider\'s steps', () => {
  for (const ok of [20, 55, 80, 100]) assert.equal(SETTINGS.opacity.normalize(ok), ok)
})

test('the opacity setting falls back to 80 for nothing saved and for anything untrusted', () => {
  for (const bad of [null, undefined, 0, 19, 105, -80, 82, 80.5, NaN, Infinity, '70', [70], { a: 70 }, true]) {
    assert.equal(SETTINGS.opacity.normalize(bad), 80, String(bad))
  }
})

test('buildOpacityCss at 80 fades the pen layer to SudokuPad\'s own 0.8 as one group and leaves each stroke solid, under :root:root', () => {
  assert.equal(buildOpacityCss(80), ':root:root .cell-pen { opacity: 1; }\n:root:root #cell-pen { opacity: 0.8; }')
})

test('buildOpacityCss writes the fraction of the percent, and 1 at 100', () => {
  const layer = (css) => css.split('\n')[1]
  assert.equal(layer(buildOpacityCss(20)), ':root:root #cell-pen { opacity: 0.2; }')
  assert.equal(layer(buildOpacityCss(35)), ':root:root #cell-pen { opacity: 0.35; }')
  assert.equal(layer(buildOpacityCss(100)), ':root:root #cell-pen { opacity: 1; }')
})

const slidersIn = (html) => [...html.matchAll(/<input type="range" id="([^"]+)"[^>]* min="([^"]+)" max="([^"]+)" step="([^"]+)" value="([^"]+)"/g)].map((m) => m.slice(1))

test('the panel markup has Thickness above Opacity, each with the range and value of its setting, and neither takes focus by tabbing', () => {
  const html = renderPanelSliders(9, 35, { thickness: true, opacity: true })
  assert.deepEqual(slidersIn(html), [
    ['pen-tool-extras-thickness', String(THICKNESS.min), String(THICKNESS.max), String(THICKNESS.step), '9'],
    ['pen-tool-extras-opacity', String(OPACITY.min), String(OPACITY.max), String(OPACITY.step), '35']
  ])
  assert.deepEqual([...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]), ['Thickness', 'Opacity'])
  assert.equal(html.match(/<input [^>]*tabindex="-1"/g).length, 2)
  assert.doesNotMatch(html, /<button/)
})

const ALL = { x: true, directions: true, circle: true, cornerX: true, cornerCircle: true, cellCircle: true, cellCross: true, cellDot: true }
const NONE = { x: false, directions: false, circle: false, cornerX: false, cornerCircle: false, cellCircle: false, cellCross: false, cellDot: false }

test('fresh install has every mark ticked', () => {
  assert.deepEqual(SETTINGS.marks.fallback, ALL)
  assert.deepEqual(normalizeMarkSettings(null), ALL)
  assert.deepEqual(normalizeMarkSettings(undefined), ALL)
})

test('corrupt saved settings fall back to every mark ticked', () => {
  for (const bad of ['x', 7, true, [], [false], '{"x":false}']) {
    assert.deepEqual(normalizeMarkSettings(bad), ALL, JSON.stringify(bad))
  }
})

test('a saved boolean is kept and a non-boolean entry takes its default', () => {
  assert.deepEqual(normalizeMarkSettings({ x: false, directions: 'no', circle: false, cornerX: 'no', cornerCircle: false, cellCircle: 'no', cellCross: false, cellDot: true }), { ...ALL, x: false, circle: false, cornerCircle: false, cellCross: false })
})

test('settings saved under the old names dot and cornerDot load as circle and cornerCircle with the same values', () => {
  assert.deepEqual(normalizeMarkSettings({ x: true, directions: true, dot: false, cornerX: true, cornerDot: true }), { ...ALL, circle: false })
  assert.deepEqual(normalizeMarkSettings({ x: true, directions: true, dot: true, cornerX: true, cornerDot: false }), { ...ALL, cornerCircle: false })
})

test('a new name wins over an old name saved beside it', () => {
  assert.deepEqual(normalizeMarkSettings({ circle: true, dot: false, cornerCircle: false, cornerDot: true }), { ...ALL, cornerCircle: false })
})

// The values saved inside puzzles, typed out from docs/research/sudokupad-pen-edge-marks.md: a rename of a type must not move one.
test('the pen values saved inside puzzles stay: each edge cycles X, circle, direction, other direction, and each corner X, circle', () => {
  const edgeCycles = { 3: ['3', 'j', 'h', 'i'], 4: ['4', 'm', 'k', 'l'], b: ['b', 'p', 'n', 'o'], c: ['c', 's', 'q', 'r'] }
  for (const [edge, cycle] of Object.entries(edgeCycles)) {
    assert.deepEqual(planClick(edge, [], ALL), { remove: [], add: cycle[0] }, edge)
    for (let i = 1; i < cycle.length; i++) assert.deepEqual(planClick(edge, [cycle[i - 1]], ALL), { remove: [cycle[i - 1]], add: cycle[i] }, cycle[i])
  }
  const cornerCycles = { tl: ['t', 'w'], br: ['u', 'x'], far: ['v', 'y'] }
  for (const [kind, [x, circle]] of Object.entries(cornerCycles)) {
    assert.deepEqual(planCornerClick(kind, [], ALL), { remove: [], add: x }, kind)
    assert.deepEqual(planCornerClick(kind, [x], ALL), { remove: [x], add: circle }, kind)
  }
})

test('with everything ticked the cycle is X, circle, direction, other direction, empty', () => {
  const seen = []
  let type = 'empty'
  for (let i = 0; i < 5; i++) {
    type = nextType(type, ALL)
    seen.push(type)
  }
  assert.deepEqual(seen, ['x', 'circle', 'dirA', 'dirB', 'empty'])
})

test('an unticked type is skipped', () => {
  assert.equal(nextType('empty', { x: false, directions: true, circle: true }), 'circle')
  assert.equal(nextType('circle', { x: true, directions: true, circle: false }), 'dirA')
  assert.equal(nextType('x', { x: true, directions: true, circle: false }), 'dirA')
  assert.equal(nextType('dirB', { x: true, directions: true, circle: false }), 'empty')
  assert.equal(nextType('x', { x: true, directions: false, circle: true }), 'circle')
  assert.equal(nextType('empty', { x: false, directions: false, circle: true }), 'circle')
  assert.equal(nextType('circle', { x: false, directions: false, circle: true }), 'empty')
})

test('Directions is one box: both directions or neither', () => {
  const only = { x: false, directions: true, circle: false }
  assert.equal(nextType('empty', only), 'dirA')
  assert.equal(nextType('dirA', only), 'dirB')
  assert.equal(nextType('dirB', only), 'empty')
})

test('a mark whose type is unticked moves to the next ticked mark, or to empty', () => {
  assert.equal(nextType('x', { x: false, directions: true, circle: false }), 'dirA')
  assert.equal(nextType('x', { x: false, directions: false, circle: false }), 'empty')
  assert.equal(nextType('circle', { x: true, directions: false, circle: false }), 'empty')
})

test('the cycle on a right edge uses 3, j (circle), h, i then clears', () => {
  assert.deepEqual(planClick('3', ['3'], ALL), { remove: ['3'], add: 'j' })
  assert.deepEqual(planClick('3', ['j'], ALL), { remove: ['j'], add: 'h' })
  assert.deepEqual(planClick('3', ['h'], ALL), { remove: ['h'], add: 'i' })
  assert.deepEqual(planClick('3', ['i'], ALL), { remove: ['i'], add: null })
})

test('each edge has its own characters, none shared with another edge or with SudokuPad\'s lines', () => {
  const used = new Set()
  for (const edge of ['3', '4', 'b', 'c']) {
    let present = []
    for (let i = 0; i < 4; i++) {
      const plan = planClick(edge, present, ALL)
      assert.notEqual(plan.add, null)
      assert.equal(used.has(plan.add), false, plan.add)
      used.add(plan.add)
      present = [plan.add]
    }
  }
  assert.deepEqual([...used].sort(), ['3', '4', 'b', 'c', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's'])
})

test('a mark on another edge of the same cell is left alone', () => {
  // the cell has the right-edge X and the bottom-edge circle; a click on the right edge sees only its own
  assert.deepEqual(planClick('3', ['3', 'm', '5'], ALL), { remove: ['3'], add: 'j' })
})

test('with nothing ticked the click does nothing, and an existing mark stays', () => {
  assert.equal(planClick('3', [], NONE), null)
  assert.equal(planClick('3', ['3'], NONE), null)
  assert.equal(planClick('4', ['k'], NONE), null)
})

test('an unticked mark already on the grid moves to the next ticked mark', () => {
  assert.deepEqual(planClick('3', ['3'], { ...NONE, circle: true }), { remove: ['3'], add: 'j' })
})

test('two marks on one edge, as a replay can hold, both go on the next click', () => {
  assert.deepEqual(planClick('3', ['3', 'i'], ALL), { remove: ['3', 'i'], add: 'j' })
})

test('addedMark draws the arrow each edge character names, per edge, and nothing for a value it does not add', () => {
  const shapes = (values) => values.map((v) => addedMark(v, 3, 4, 9).shape)
  assert.deepEqual(shapes(['h', 'i', 'j']), ['>', '<', 'o'])
  assert.deepEqual(shapes(['k', 'l', 'm']), ['^', 'v', 'o'])
  assert.deepEqual(shapes(['n', 'o', 'p']), ['>', '<', 'o'])
  assert.deepEqual(shapes(['q', 'r', 's']), ['^', 'v', 'o'])
  for (const other of ['3', '4', 'b', 'c', '0', '5', '6', 'a', 'g']) {
    assert.equal(addedMark(other, 3, 4, 9), null, other)
  }
})

test('the edge circle is an open ring closed back at the edge midpoint, about 1.7 times an old 7 unit point across', () => {
  // Two half-circle arcs of radius r, from -r to +r and back: relative moves sum to zero.
  const m = /^ m (-?[\d.]+),0 a ([\d.]+),([\d.]+) 0 1,0 (-?[\d.]+),0 a ([\d.]+),([\d.]+) 0 1,0 (-?[\d.]+),0$/.exec(shapePath('o', 8))
  assert.notEqual(m, null)
  const [r1, rx, ry, to, rx2, ry2, back] = m.slice(1).map(Number)
  assert.equal(rx, ry)
  assert.equal(rx2, rx)
  assert.equal(ry2, rx)
  assert.equal(r1, -rx)
  assert.equal(to, 2 * rx)
  assert.equal(back, -2 * rx)
  // At the default the ring's outer diameter (path plus its 2.5 stroke) is about 16 units, a
  // 64 unit cell's quarter.
  const outer = 2 * rx + 2.5
  assert.equal(outer > 15 && outer < 17, true, String(outer))
})

test('the edge circle\'s hole stays clearly open at the largest thickness', () => {
  // The ring grows with the mark's scale and keeps its stroke width, so the radius on screen is the scaled one.
  const rx = Number(/ a ([\d.]+),/.exec(shapePath('o', 8))[1]) * markGrowthScale(THICKNESS.max)
  const stroke = THICKNESS.max * 0.5
  // The inner radius is the path radius less half the stroke: more than a stroke's width.
  assert.equal(rx - stroke / 2 > stroke / 2, true, `${rx} ${stroke}`)
})

test('a direction arrow is an open head pointing the way it names', () => {
  // relative to the edge midpoint: the tip is the middle vertex
  const tip = (d) => {
    const [, mx, my, l1x, l1y] = d.match(/m ?(-?[\d.]+),(-?[\d.]+) l ?(-?[\d.]+),(-?[\d.]+)/)
    return [Number(mx) + Number(l1x), Number(my) + Number(l1y)]
  }
  const [rx] = tip(shapePath('>', 8))
  const [lx] = tip(shapePath('<', 8))
  const [, uy] = tip(shapePath('^', 8))
  const [, dy] = tip(shapePath('v', 8))
  assert.equal(rx > 0, true)
  assert.equal(lx < 0, true)
  assert.equal(uy < 0, true)
  assert.equal(dy > 0, true)
})

test('settings saved before corner marks existed read back with both corner marks ticked', () => {
  assert.deepEqual(normalizeMarkSettings({ x: true, directions: false, circle: true }), { ...ALL, directions: false })
})

test('settings saved before the Cell row existed read back with all three cell marks ticked', () => {
  assert.deepEqual(normalizeMarkSettings({ x: true, directions: true, circle: false, cornerX: false, cornerCircle: true }), { ...ALL, circle: false, cornerX: false })
})

// SudokuPad's own circle (5) and cross (6) keep their values; the dot is z, the value docs/research/sudokupad-pen-edge-marks.md left unused.
test('the cell cycle is circle, cross, dot, empty, in the pen values 5, 6 and z', () => {
  assert.deepEqual(planCellClick([], ALL), { remove: [], add: '5' })
  assert.deepEqual(planCellClick(['5'], ALL), { remove: ['5'], add: '6' })
  assert.deepEqual(planCellClick(['6'], ALL), { remove: ['6'], add: 'z' })
  assert.deepEqual(planCellClick(['z'], ALL), { remove: ['z'], add: null })
})

test('an unticked cell mark is skipped, and with all three unticked a cell click does nothing', () => {
  assert.deepEqual(planCellClick([], { ...ALL, cellCircle: false }), { remove: [], add: '6' })
  assert.deepEqual(planCellClick(['5'], { ...ALL, cellCross: false }), { remove: ['5'], add: 'z' })
  assert.deepEqual(planCellClick(['6'], { ...ALL, cellDot: false }), { remove: ['6'], add: null })
  assert.deepEqual(planCellClick(['z'], { ...NONE, cellCross: true }), { remove: ['z'], add: null })
  assert.equal(planCellClick([], { ...ALL, cellCircle: false, cellCross: false, cellDot: false }), null)
  assert.equal(planCellClick(['z'], { ...ALL, cellCircle: false, cellCross: false, cellDot: false }), null)
})

test('a cell click sees only the cell\'s cell marks: an edge or corner mark on the cell stays', () => {
  assert.deepEqual(planCellClick(['3', 'h', 'u', 'z'], ALL), { remove: ['z'], add: null })
})

test('the edge and corner boxes do not drive the cell cycle, nor the cell boxes the edge cycle', () => {
  assert.deepEqual(planCellClick([], { ...NONE, cellDot: true }), { remove: [], add: 'z' })
  assert.equal(planClick('3', [], { ...NONE, cellCircle: true, cellCross: true, cellDot: true }), null)
})

test('addedMark places the dot at the cell\'s middle, in the dot shape', () => {
  assert.deepEqual(addedMark('z', 3, 4, 9), { point: [3.5, 4.5], shape: '.' })
})

test('the dot is a closed disc about a fifth of a 64 unit cell across at the default thickness', () => {
  const m = /^ m (-?[\d.]+),0 a ([\d.]+),([\d.]+) 0 1,0 (-?[\d.]+),0 a ([\d.]+),([\d.]+) 0 1,0 (-?[\d.]+),0$/.exec(shapePath('.', 8))
  assert.notEqual(m, null)
  const rx = Number(m[2])
  // Its outer size is the path plus the default 2.5 stroke.
  const across = 2 * rx + THICKNESS.fallback * 0.5
  assert.equal(across > 64 / 5 - 1 && across < 64 / 5 + 1, true, String(across))
})

test('DOT_FILL_CSS fills the dot in its pen\'s color on every page, forward and reverse characters, and fills no other value', () => {
  const rules = DOT_FILL_CSS.split('\n')
  const chars = PEN_PAGES.flatMap((page) => page.chars.map((char, i) => [char, i]).concat((page.reverse || []).map((char, i) => [char, i])))
  assert.equal(rules.length, chars.length)
  for (const [char, i] of chars) assert.equal(rules.includes(`:root:root .cell-pen.pen-z.pencolor-${char} { fill: var(--puzzle-pencolor-${i + 1}); }`), true, char)
})

test('clickedMarks reads SudokuPad\'s queued click as the cell, the values of the edge\'s or the cell\'s marks, and the click\'s step through them', () => {
  const cell = { row: 2, col: 3 }
  const edge = clickedMarks([{ type: 'select', arg: [cell] }, { type: 'pen', arg: '3' }])
  assert.deepEqual([edge.cell, edge.values], [cell, ['3', 'h', 'i', 'j']])
  assert.deepEqual(edge.plan(['3'], ALL), planClick('3', ['3'], ALL))
  // SudokuPad's cell click queues the toggles from circle to cross, cross to nothing, or nothing to circle.
  for (const toggles of [['5', '6'], ['6'], ['5']]) {
    const middle = clickedMarks([{ type: 'select', arg: [cell] }, ...toggles.map((arg) => ({ type: 'pen', arg }))])
    assert.deepEqual([middle.cell, middle.values], [cell, ['5', '6', 'z']], toggles.join())
    assert.deepEqual(middle.plan(['6'], ALL), { remove: ['6'], add: 'z' }, toggles.join())
  }
  assert.equal(clickedMarks(null), null)
  assert.equal(clickedMarks([{ type: 'select', arg: [cell] }, { type: 'pen', arg: '1' }]), null)
})

test('cornerAt finds the grid corner within the radius, inner and outer, and nothing farther', () => {
  assert.deepEqual(cornerAt(3, 3, 9, 9), { row: 3, col: 3 })
  assert.deepEqual(cornerAt(3.19, 3, 9, 9), { row: 3, col: 3 })
  assert.equal(cornerAt(0.2, 0, 9, 9), null, 'exactly the radius is outside')
  assert.deepEqual(cornerAt(0.19, 0, 9, 9), { row: 0, col: 0 })
})

test('cornerAt takes the radius it is given, so a corner on a small cell keeps a wider zone', () => {
  assert.equal(cornerAt(3.25, 3, 9, 9), null, 'outside the default radius')
  assert.deepEqual(cornerAt(3.25, 3, 9, 9, 0.3), { row: 3, col: 3 })
  assert.equal(cornerAt(3.31, 3, 9, 9, 0.3), null)
})

test('hitRadiusAt keeps the cell-unit radius on a big cell, floors it at 10 px on a small one and stops at the cap', () => {
  assert.equal(HIT_FLOOR_PX, 10)
  assert.equal(hitRadiusAt(CORNER_RADIUS, CORNER_RADIUS_MAX, 75), CORNER_RADIUS, '75 px cell: 0.2 of it is 15 px, above the floor')
  assert.equal(hitRadiusAt(CORNER_RADIUS, CORNER_RADIUS_MAX, 50), CORNER_RADIUS, '50 px cell: 0.2 is exactly 10 px')
  assert.equal(hitRadiusAt(CORNER_RADIUS, CORNER_RADIUS_MAX, 40), 0.25, '40 px cell: 10 px is 0.25')
  assert.equal(hitRadiusAt(CORNER_RADIUS, CORNER_RADIUS_MAX, 20), 0.3, '20 px cell: 10 px is 0.5, capped at 0.3')
  assert.equal(hitRadiusAt(LINE_HIT_RADIUS, LINE_HIT_RADIUS_MAX, 20), 0.24, 'the line cap keeps a centre line and the edge line beside it (0.5 apart) from both hitting')
})

test('cornerAt measures distance, so a point in the square around a corner but outside the circle is not a corner', () => {
  assert.equal(cornerAt(3.15, 3.15, 9, 9), null)
  assert.deepEqual(cornerAt(3.14, 3.14, 9, 9), { row: 3, col: 3 })
})

test('cornerAt leaves an edge midpoint and a cell middle to the edge and cell marks', () => {
  assert.equal(cornerAt(3.5, 3, 9, 9), null)
  assert.equal(cornerAt(3, 3.5, 9, 9), null)
  assert.equal(cornerAt(3.5, 3.5, 9, 9), null)
  assert.equal(cornerAt(3.3, 3, 9, 9), null)
})

test('cornerAt counts the four outer corners, also for a point just outside the grid', () => {
  assert.deepEqual(cornerAt(0, 0, 9, 9), { row: 0, col: 0 })
  assert.deepEqual(cornerAt(9, 9, 9, 9), { row: 9, col: 9 })
  assert.deepEqual(cornerAt(0, 9, 9, 9), { row: 0, col: 9 })
  assert.deepEqual(cornerAt(9, 0, 9, 9), { row: 9, col: 0 })
  assert.deepEqual(cornerAt(-0.1, -0.1, 9, 9), { row: 0, col: 0 })
  assert.deepEqual(cornerAt(9.1, 8.95, 9, 9), { row: 9, col: 9 })
  assert.equal(cornerAt(-0.5, -0.5, 9, 9), null, 'far outside the grid')
  assert.equal(cornerAt(-1, 4, 9, 9), null)
})

test('cornerAt reads a non-square grid by its own rows and columns', () => {
  assert.deepEqual(cornerAt(4, 6, 4, 6), { row: 4, col: 6 })
  assert.equal(cornerAt(4, 7, 4, 6), null)
})

// A 9 by 9 grid of cells holding their pen values; `stockActs` stands in for SudokuPad's own click, which hits the cell middle of (4, 4).
const markGrid = (pens = {}) => {
  const cells = Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, col) => ({ row, col, pen: (pens[`${row},${col}`] || []).map((value) => [value, 'r']) })))
  return { rows: 9, cols: 9, getCell: (row, col) => cells[row][col] }
}
const marksFor = (point, takesCorner, grid = markGrid()) => {
  const stockAt = []
  const stockActs = (at) => { stockAt.push(at); return [{ type: 'select', arg: [grid.getCell(4, 4)] }, { type: 'pen', arg: '5' }] }
  const found = marksAtPoint(point, { grid, radius: CORNER_RADIUS, takesCorner, stockActs })
  return { ...found, stockAt, grid }
}

test('marksAtPoint for the erase takes a corner holding a mark, whatever is ticked', () => {
  const { marks, corner, queued, stockAt, grid } = marksFor({ r: 3, c: 3 }, holdsMark, markGrid({ '2,2': ['u'] }))
  assert.deepEqual([marks.cell, marks.values, corner, queued, stockAt], [grid.getCell(2, 2), ['u', 'x'], true, null, []])
})

test('marksAtPoint for the erase passes an empty corner to SudokuPad\'s own click, as what that click hit', () => {
  const { marks, corner, queued, stockAt, grid } = marksFor({ r: 3, c: 3 }, holdsMark)
  assert.deepEqual([marks.cell, marks.values, corner, queued.length, stockAt], [grid.getCell(4, 4), ['5', '6', 'z'], false, 2, [{ r: 3, c: 3 }]])
})

test('marksAtPoint takes an empty corner its predicate takes, and steps it through the corner cycle', () => {
  const { marks, corner, queued, stockAt, grid } = marksFor({ r: 3, c: 3 }, () => true)
  assert.deepEqual([marks.cell, marks.values, corner, queued, stockAt], [grid.getCell(2, 2), ['u', 'x'], true, null, []])
  assert.deepEqual(marks.plan([], ALL), { remove: [], add: 'u' })
})

test('marksAtPoint leaves a corner its predicate refuses to SudokuPad\'s own click, a held mark too', () => {
  const { marks, corner, stockAt, grid } = marksFor({ r: 3, c: 3 }, () => false, markGrid({ '2,2': ['u'] }))
  assert.deepEqual([marks.cell, corner, stockAt], [grid.getCell(4, 4), false, [{ r: 3, c: 3 }]])
})

test('marksAtPoint for a click away from every corner asks no predicate and runs SudokuPad\'s own click', () => {
  const { marks, corner, stockAt, grid } = marksFor({ r: 4.5, c: 4.5 }, () => { throw new Error('asked') })
  assert.deepEqual([marks.cell, corner, stockAt], [grid.getCell(4, 4), false, [{ r: 4.5, c: 4.5 }]])
})

function allCorners (rows, cols) {
  const corners = []
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) corners.push({ row, col })
  return corners
}

test('every grid corner is stored on one cell inside the grid, and no two corners share a cell and kind', () => {
  for (const [rows, cols] of [[9, 9], [4, 6], [6, 4], [1, 5], [5, 1]]) {
    const seen = new Set()
    for (const corner of allCorners(rows, cols)) {
      const where = cornerStorage(corner.row, corner.col, rows, cols)
      assert.equal(where.row >= 0 && where.row < rows && where.col >= 0 && where.col < cols, true, JSON.stringify({ corner, where }))
      const key = JSON.stringify(where)
      assert.equal(seen.has(key), false, `${key} holds two corners`)
      seen.add(key)
    }
  }
})

test('the stored cell and kind give the corner back: cornerPoint undoes cornerStorage on every grid', () => {
  for (const [rows, cols] of [[9, 9], [4, 6], [6, 4], [2, 2], [1, 5], [5, 1]]) {
    for (const corner of allCorners(rows, cols)) {
      const { kind, row, col } = cornerStorage(corner.row, corner.col, rows, cols)
      assert.deepEqual(cornerPoint(kind, row, col, cols), [corner.row, corner.col], JSON.stringify({ corner, kind, rows, cols }))
    }
  }
})

test('an inner corner is the bottom right of the cell up and left of it, so a shared corner is stored once', () => {
  assert.deepEqual(cornerStorage(3, 3, 9, 9), { kind: 'br', row: 2, col: 2 })
  assert.deepEqual(cornerStorage(9, 9, 9, 9), { kind: 'br', row: 8, col: 8 })
  assert.deepEqual(cornerStorage(9, 4, 9, 9), { kind: 'br', row: 8, col: 3 })
  assert.deepEqual(cornerStorage(4, 9, 9, 9), { kind: 'br', row: 3, col: 8 })
})

test('the outer corners on the top and left are the top left of the cell they touch; the other two have their own kind', () => {
  assert.deepEqual(cornerStorage(0, 0, 9, 9), { kind: 'tl', row: 0, col: 0 })
  assert.deepEqual(cornerStorage(0, 4, 9, 9), { kind: 'tl', row: 0, col: 4 })
  assert.deepEqual(cornerStorage(4, 0, 9, 9), { kind: 'tl', row: 4, col: 0 })
  assert.deepEqual(cornerStorage(0, 9, 9, 9), { kind: 'far', row: 0, col: 8 })
  assert.deepEqual(cornerStorage(9, 0, 9, 9), { kind: 'far', row: 8, col: 0 })
})

test('the corner characters are lowercase letters SudokuPad does not use and the edge marks do not use, two per kind', () => {
  const used = new Set()
  for (const kind of ['tl', 'br', 'far']) {
    assert.equal(CORNER_VALUES[kind].length, 2)
    for (const value of CORNER_VALUES[kind]) {
      assert.match(value, /^[h-z]$/)
      assert.deepEqual(addedMark(value, 3, 4, 9).point, cornerPoint(kind, 3, 4, 9), `${value} is drawn at its corner, not an edge`)
      assert.equal(used.has(value), false, value)
      used.add(value)
    }
  }
  assert.equal(used.size, 6)
})

test('addedMark draws a corner character at its kind\'s corner, the X as x and the circle as o', () => {
  assert.deepEqual(addedMark(CORNER_VALUES.br[0], 3, 4, 9), { point: cornerPoint('br', 3, 4, 9), shape: 'x' })
  assert.deepEqual(addedMark(CORNER_VALUES.br[1], 3, 4, 9), { point: cornerPoint('br', 3, 4, 9), shape: 'o' })
  assert.deepEqual(addedMark(CORNER_VALUES.far[1], 0, 8, 9), { point: cornerPoint('far', 0, 8, 9), shape: 'o' })
})

test('the corner cycle is X, circle, empty, and a click on an empty corner adds the X', () => {
  const [x, circle] = CORNER_VALUES.br
  assert.deepEqual(planCornerClick('br', [], ALL), { remove: [], add: x })
  assert.deepEqual(planCornerClick('br', [x], ALL), { remove: [x], add: circle })
  assert.deepEqual(planCornerClick('br', [circle], ALL), { remove: [circle], add: null })
})

test('an unticked corner type is skipped, and with both unticked the corner click does nothing', () => {
  const [x, circle] = CORNER_VALUES.far
  assert.deepEqual(planCornerClick('far', [], { ...ALL, cornerX: false }), { remove: [], add: circle })
  assert.deepEqual(planCornerClick('far', [circle], { ...ALL, cornerX: false }), { remove: [circle], add: null })
  assert.deepEqual(planCornerClick('far', [x], { ...ALL, cornerCircle: false }), { remove: [x], add: null })
  assert.equal(planCornerClick('far', [x], { ...ALL, cornerX: false, cornerCircle: false }), null)
})

test('a corner click sees only its own kind: another kind, an edge mark or a cell mark on the cell stays', () => {
  const [x] = CORNER_VALUES.br
  assert.deepEqual(planCornerClick('br', [CORNER_VALUES.tl[0], '3', 'h', '5'], ALL), { remove: [], add: x })
})

test('the edge cycle ignores the corner boxes, and the corner cycle ignores the edge boxes', () => {
  assert.deepEqual(planClick('3', [], { ...NONE, cornerX: true }), null)
  assert.equal(planCornerClick('br', [], { ...NONE, x: true, directions: true, circle: true }), null)
})

test('corner marks are half the thickness, like edge marks', () => {
  const widths = widthsOf(buildThicknessCss(5))
  for (const kind of ['tl', 'br', 'far']) for (const value of CORNER_VALUES[kind]) assert.equal(widths[value], '2.5', value)
})

test('the corner X is two crossing diagonals of half-size s, drawn from the point it is centred on', () => {
  assert.equal(shapePath('x', 8), ' m -8,-8 l16,16 m -16,0 l16,-16')
})

test('the pages are a list: SudokuPad\'s 1 to 9, then a to i drawn dashed, then arrow lines with a character for each way', () => {
  assert.deepEqual(PEN_PAGES, [
    { chars: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], dashed: false },
    { chars: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], dashed: true },
    { chars: ['j', 'l', 'n', 'p', 'r', 't', 'v', 'x', 'z'], reverse: ['k', 'm', 'o', 'q', 's', 'u', 'w', 'y', '0'], dashed: false, arrowLines: true }
  ])
})

test('penPageOf, penNumber and penCharOn move between a color character, its page and its button number', () => {
  assert.equal(penPageOf('3'), 0)
  assert.equal(penPageOf('c'), 1)
  assert.equal(penPageOf('z'), 2)
  assert.equal(penPageOf('k'), -1, 'the reverse character of an arrow line pen is not a pen to select')
  assert.equal(penPageOf('A'), -1)
  assert.equal(penNumber('c'), '3')
  assert.equal(penNumber('3'), '3')
  assert.equal(penNumber('i'), '9')
  assert.equal(penCharOn(1, '1'), 'a')
  assert.equal(penCharOn(0, '9'), '9')
  assert.equal(penCharOn(1, '9'), 'i')
  assert.equal(penCharOn(2, '1'), 'j')
  assert.equal(penCharOn(2, '9'), 'z')
})

test('normalizePen keeps a saved color character of any page and nothing else', () => {
  for (const ok of ['1', '9', 'a', 'i', 'j', 'z']) assert.equal(normalizePen(ok), ok)
  // SudokuPad's getData parses a saved '3' into the number 3
  assert.equal(normalizePen(3), '3')
  for (const bad of [null, undefined, 0, 10, 3.5, 'k', '0', 'A', '', 'ab', ['a'], { a: 1 }]) assert.equal(normalizePen(bad), null, JSON.stringify(bad))
})

const rulesOf = (css) => css.split('\n').filter(Boolean).map((rule) => { const i = rule.indexOf(' { '); return { selector: rule.slice(0, i), body: rule.slice(i + 3, -2) } })

test('every page 2 color character strokes in the color of its page 1 partner, so one recolor changes both', () => {
  const rules = rulesOf(buildPagesCss(5, 0))
  for (let i = 0; i < 9; i++) {
    const rule = rules.find((r) => r.selector === `.pencolor-${PEN_PAGES[1].chars[i]}`)
    assert.equal(rule && rule.body, `stroke: var(--puzzle-pencolor-${i + 1});`)
  }
})

test('dashes are on lines only: the free lines and the edge and diagonal lines, never 5, 6 or a mark', () => {
  const dashes = rulesOf(buildPagesCss(5, 0)).filter((r) => r.body.startsWith('stroke-dasharray'))
  const named = dashes.flatMap((r) => r.selector.match(/\.pen-([0-9a-z])/g)).map((v) => v.slice(5))
  assert.deepEqual([...new Set(named)].sort(), ['1', '2', '7', '8', '9', 'a', 'd', 'e', 'f', 'g'])
  for (const r of dashes) {
    assert.match(r.selector, /^:root:root \.cell-pen:is\(/)
    assert.match(r.selector, /:is\(\.pencolor-a,\.pencolor-b,\.pencolor-c,\.pencolor-d,\.pencolor-e,\.pencolor-f,\.pencolor-g,\.pencolor-h,\.pencolor-i\)$/)
  }
})

test('the dot spacing is two line widths, snapped so a cell of 64 holds whole dots and a diagonal cell of 90.51 does too, the last dot a hair before the segment\'s end', () => {
  const gaps = (t) => rulesOf(buildPagesCss(t, 0)).filter((r) => r.body.startsWith('stroke-dasharray')).map((r) => Number(r.body.match(/^stroke-dasharray: 0 ([\d.]+);$/)[1]))
  const [ortho, diagonal] = [64, 64 * Math.SQRT2]
  // [thickness, dots in a cell, dots in a diagonal]: 64 / 10 = 6.4 -> 6 and 90.51 / 10 = 9.05 -> 9; 64 / 24 = 2.67 -> 3 and 90.51 / 24 = 3.77 -> 4; 32 dots at 1
  for (const [thickness, cell, diag] of [[5, 6, 9], [12, 3, 4], [1, 32, 45]]) {
    const [g1, g2] = gaps(thickness)
    assert.equal(Math.round(ortho / g1), cell, `thickness ${thickness}`)
    assert.equal(Math.round(diagonal / g2), diag, `thickness ${thickness}`)
    for (const [g, n, length] of [[g1, cell, ortho], [g2, diag, diagonal]]) {
      assert.equal(n * g < length && n * g > length - 0.02, true, `${n} dots of ${g} end a hair before ${length}`)
    }
  }
})

const maskSvg = (rule) => decodeURIComponent(/data:image\/svg\+xml,([^"]*)"/.exec(rule.body)[1])

test('a page 2 swatch is a single dashed line in the pen color of its button, as a mask so the color follows a recolor, and no rule names page 1\'s attribute', () => {
  const css = buildPagesCss(5, 3)
  for (let n = 1; n <= 9; n++) {
    const rule = rulesOf(css).find((r) => r.selector === `.tool-pen button[data-key="${n}"][data-pen-page="2"]:after`)
    assert.ok(rule, `swatch ${n}`)
    assert.match(rule.body, new RegExp(`background-color: var\\(--puzzle-pencolor-${n}\\)`))
    assert.match(rule.body, /mask(-image)?: url\("data:image\/svg\+xml,/)
    assert.doesNotMatch(rule.body, /radial-gradient/)
  }
  assert.equal(css.includes('data-pen-page="1"'), false)
})

test('a page 1 swatch is a solid line of the page 2 line\'s position and width in the pen color, as a mask, with no page attribute so it holds with the pages off', () => {
  const css = buildPagesCss(5, 3)
  const dashed = maskSvg(rulesOf(css).find((r) => r.selector === '.tool-pen button[data-key="1"][data-pen-page="2"]:after'))
  for (let n = 1; n <= 9; n++) {
    const rule = rulesOf(css).find((r) => r.selector === `.tool-pen button[data-key="${n}"]:after`)
    assert.ok(rule, `swatch ${n}`)
    assert.match(rule.body, new RegExp(`background-color: var\\(--puzzle-pencolor-${n}\\)`))
    const svg = maskSvg(rule)
    assert.equal(svg, dashed.replace(/ stroke-dasharray='[^']*'/, '').replace(/ stroke-dashoffset='[^']*'/, ''))
    assert.doesNotMatch(svg, /dasharray/)
  }
})

const swatchDashes = (dash) => {
  const rule = rulesOf(buildPagesCss(5, dash)).find((r) => r.selector === '.tool-pen button[data-key="1"][data-pen-page="2"]:after')
  const svg = maskSvg(rule)
  const paths = svg.match(/<path[^>]*>/g)
  assert.equal(paths.length, 1, 'one line')
  const array = /stroke-dasharray='([\d. ]+)'/.exec(paths[0])[1].split(' ').map(Number)
  const offset = Number((/stroke-dashoffset='([\d.]+)'/.exec(paths[0]) || [0, 0])[1])
  return { array, offset, path: paths[0] }
}

test('the page 2 swatch follows the dash length: dots at 0, longer dashes as it grows, a dash at each end of the line', () => {
  assert.equal(swatchDashes(0).array[0], 0)
  const [short, long] = [swatchDashes(1), swatchDashes(5)]
  assert.equal(short.array[0] > 0 && long.array[0] > short.array[0], true, `dashes ${short.array[0]} and ${long.array[0]}`)
  assert.equal(long.offset, long.array[0] / 2, 'the line starts half a dash in, so it is inked at both ends')
})

const BOTH_STYLES = { dashed: true, arrows: true }
// What a swatch draws, without its own svg element: the page button draws it inside its own, whose viewBox holds the icon's correction.
const pictureOf = (svg) => svg.replace(/^<svg[^>]*>|<\/svg>$/g, '')
const dashArrayOf = (svg) => /stroke-dasharray='([\d. ]+)'/.exec(svg)[1].split(' ').map(Number)
test('the page button shows the picture of the page it turns to, slanted 35 degrees, and a dot for each page with the current one filled', () => {
  for (const [current, next] of [[0, 1], [1, 2], [2, 0]]) {
    const icon = renderPageIcon(current, 3, BOTH_STYLES)
    assert.ok(icon.includes(pictureOf(pageSwatch(PEN_PAGES[next], 3, PAGE_BUTTON_ANGLE))), `from page ${current + 1}: ${icon}`)
    assert.match(icon, new RegExp(`data-page-sample="${next + 1}"`))
    assert.equal((icon.match(/<circle/g) || []).length, 3)
    assert.equal((icon.match(/data-page-dot="filled"/g) || []).length, 1)
    assert.equal((icon.match(/data-page-dot="outline"/g) || []).length, 2)
  }
  assert.match(renderPageIcon(0, 3, BOTH_STYLES), /<circle[^>]*data-page-dot="filled"[^>]*\/>[^]*<circle[^>]*data-page-dot="outline"/)
  assert.match(renderPageIcon(2, 3, BOTH_STYLES), /<circle[^>]*data-page-dot="outline"[^>]*\/>[^]*<circle[^>]*data-page-dot="filled"/)
  assert.equal(PAGE_BUTTON_ANGLE, 35)
  assert.match(pageSwatch(PEN_PAGES[1], 3, PAGE_BUTTON_ANGLE), /rotate\(-35 12 12\)/)
  assert.match(pageSwatch(PEN_PAGES[1], 3, 0), /rotate\(0 12 12\)/)
})

test('the page button shows dots at dash 0 and dashes as long as the setting from there', () => {
  const sampleOf = (dash) => renderPageIcon(0, dash, BOTH_STYLES)
  assert.equal(dashArrayOf(sampleOf(0))[0], 0)
  assert.match(sampleOf(0), /stroke-linecap='round'/, 'a zero-length dash is a dot only with a round cap')
  const [short, long] = [dashArrayOf(sampleOf(1))[0], dashArrayOf(sampleOf(4))[0]]
  assert.equal(short > 0 && long > short, true, `dashes ${short} and ${long}`)
})

test('the line mode choices are SudokuPad\'s three, and anything else saved reads as both', () => {
  assert.deepEqual(LINE_MODES.map(([value]) => value), ['both', 'centeronly', 'edgeonly'])
  for (const ok of ['both', 'centeronly', 'edgeonly']) assert.equal(normalizeLineMode(ok), ok)
  for (const bad of [null, undefined, 'edge', 1, ['both'], '']) assert.equal(normalizeLineMode(bad), 'both', JSON.stringify(bad))
})

test('the dash length runs from 0 (dots) to 8 line widths in whole steps, and starts at 3, which draws dashes', () => {
  assert.deepEqual(DASH, { min: 0, max: 8, step: 1, fallback: 3 })
})

test('the dash setting keeps a saved whole number from 0 to 8, a saved 0 included, and anything else is 3', () => {
  for (const ok of [0, 1, 4, 8]) assert.equal(SETTINGS.dash.normalize(ok), ok)
  for (const bad of [null, undefined, -1, 9, 2.5, NaN, Infinity, '3', [3], { a: 3 }, true]) assert.equal(SETTINGS.dash.normalize(bad), 3, String(bad))
})

const dashesOf = (thickness, dash) => rulesOf(buildPagesCss(thickness, dash)).filter((r) => r.body.startsWith('stroke-dasharray'))
  .map((r) => {
    const [, on, gap] = /^stroke-dasharray: ([\d.]+) ([\d.]+);/.exec(r.body)
    const offset = /stroke-dashoffset: ([\d.]+);$/.exec(r.body)
    return { dash: Number(on), gap: Number(gap), offset: offset ? Number(offset[1]) : 0 }
  })

test('at dash 0 the page 2 lines are the dots they were: the spacing origin/main gave, as literals', () => {
  const before = { 1: ['0 1.9998', '0 2.011124822779531'], 5: ['0 10.6656', '0 10.055624113897656'], 12: ['0 21.3312', '0 22.625154256269724'] }
  for (const [thickness, want] of Object.entries(before)) {
    const got = rulesOf(buildPagesCss(Number(thickness), 0)).filter((r) => r.body.startsWith('stroke-dasharray'))
    assert.deepEqual(got.map((r) => r.body), want.map((d) => `stroke-dasharray: ${d};`), `thickness ${thickness}`)
  }
})

test('a dash is its setting in line widths long and scales with the thickness slider, until a cell\'s line is too short for it', () => {
  for (const [thickness, dash] of [[5, 3], [10, 2], [4, 4], [2, 8]]) {
    for (const { dash: on } of dashesOf(thickness, dash)) assert.equal(on, thickness * dash, `thickness ${thickness} dash ${dash}`)
  }
})

test('every dash length at every thickness fits whole periods in a cell and a diagonal, with half a dash at each end and a gap that leaves the round caps apart, never solid', () => {
  for (let thickness = THICKNESS.min; thickness <= THICKNESS.max; thickness++) {
    for (let dash = DASH.min + 1; dash <= DASH.max; dash++) {
      const rows = dashesOf(thickness, dash)
      assert.equal(rows.length, 2)
      const lengths = [64, 64 * Math.SQRT2]
      rows.forEach(({ dash: on, gap, offset }, i) => {
        const where = `thickness ${thickness} dash ${dash} line ${i}`
        const periods = Math.round(lengths[i] / (on + gap))
        assert.equal(Math.abs(periods * (on + gap) - lengths[i]) < 1e-6, true, `${where}: ${periods} periods of ${on + gap} fill ${lengths[i]}`)
        assert.equal(offset, on / 2, `${where}: the pattern starts half a dash in, so the piece is inked at both ends`)
        assert.equal(on > 0 && on <= dash * thickness + 1e-9, true, `${where}: dash ${on}`)
        assert.equal(gap - thickness >= thickness - 1e-9, true, `${where}: gap ${gap} leaves a visible gap of a line width between the round caps`)
      })
    }
  }
})

test('a dash too long for a cell to hold a gap is shortened to leave one, and page 2 still differs from page 1 at the longest dash and thickness', () => {
  const [ortho] = dashesOf(16, 8)
  assert.equal(ortho.dash < 8 * 16, true)
  assert.equal(ortho.gap - 16 >= 16 - 1e-9, true, 'a visible gap of a line width')
  assert.equal(Math.abs(ortho.dash + ortho.gap - 64) < 1e-9, true, 'one period in a cell')
})

test('both sliders show unless saved as hidden, and saved data without the setting shows both', () => {
  assert.deepEqual(SETTINGS.show.normalize(undefined), { thickness: true, opacity: true })
  assert.deepEqual(SETTINGS.show.normalize(null), { thickness: true, opacity: true })
  assert.deepEqual(SETTINGS.show.normalize({}), { thickness: true, opacity: true })
  assert.deepEqual(SETTINGS.show.normalize({ thickness: false }), { thickness: false, opacity: true })
  assert.deepEqual(SETTINGS.show.normalize({ opacity: false, thickness: false }), { thickness: false, opacity: false })
  assert.deepEqual(SETTINGS.show.normalize({ thickness: 0, opacity: 'no' }), { thickness: true, opacity: true })
  assert.deepEqual(SETTINGS.show.normalize([false, false]), { thickness: true, opacity: true })
})

test('a hidden slider has no input, and the other keeps its place beside an empty row of the same height', () => {
  const only = (id) => slidersIn(renderPanelSliders(9, 35, { thickness: id === 'thickness', opacity: id === 'opacity' })).map((s) => s[0])
  assert.deepEqual(only('thickness'), ['pen-tool-extras-thickness'])
  assert.deepEqual(only('opacity'), ['pen-tool-extras-opacity'])
  const html = renderPanelSliders(9, 35, { thickness: false, opacity: true })
  assert.match(html, /^<div class="pen-tool-extras-sliders"><div class="pen-tool-extras-slider" data-empty><\/div><div class="pen-tool-extras-slider"/)
  const low = renderPanelSliders(9, 35, { thickness: true, opacity: false })
  assert.match(low, /<div class="pen-tool-extras-slider" data-empty><\/div><\/div>$/)
})

test('with both sliders hidden the panel has no slider block at all, so no gap is left', () => {
  assert.equal(renderPanelSliders(9, 35, { thickness: false, opacity: false }), '')
})

const editorState = (over = {}) => ({
  colors: SUDOKUPAD_PEN_COLORS,
  missing: [],
  preset: 'page-1',
  presets: ['page-1', 'page-2', 'page-3', 'sudokupad'],
  marks: ALL,
  thickness: 5,
  opacity: 80,
  show: { thickness: true, opacity: true },
  dash: 0,
  arrowSpacing: 7,
  lineStyles: { dashed: true, arrows: true },
  eraseClicks: true,
  outline: true,
  outlineWidth: 2,
  off: [],
  ...over
})

test('the dialog\'s pen colors are the shared color block: a grid of color inputs in the order of the pen tool\'s buttons, with no numbers, styled under the editor', () => {
  const html = renderEditor(editorState())
  const grid = /<div class="pen-tool-extras-swatches">([\s\S]*?)<\/div>/.exec(html)[1]
  assert.deepEqual([...grid.matchAll(/<input type="color" [^>]*data-key="(\d)" value="(#[0-9a-f]{6})"[^>]*>/g)].map((m) => m[1]), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  assert.deepEqual([...grid.matchAll(/value="(#[0-9a-f]{6})"/g)].map((m) => m[1]), [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => SUDOKUPAD_PEN_COLORS[n]))
  assert.doesNotMatch(grid, /<b[ >]/, 'no numbers')
  assert.match(DIALOG_CSS, /#pen-tool-extras-editor \.pen-tool-extras-swatches \{[^}]*grid-template-columns: repeat\(3, /)
})

const presetMenu = (html) => {
  const menu = /<select [^>]*data-role="color-choice"[^>]*>([\s\S]*?)<\/select>/.exec(html)
  assert.ok(menu, 'a pen color preset pulldown')
  return [...menu[1].matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g)].map(([, value, attributes, label]) => ({ value, label, selected: / selected/.test(attributes), disabled: / disabled/.test(attributes) }))
}

test('the Pen colors section has a preset pulldown above the grid, its options in order, the preset in force selected, and no SudokuPad colors button', () => {
  const html = renderEditor(editorState({ preset: 'page-2' }))
  assert.deepEqual(presetMenu(html).map(({ value, label, selected }) => [value, label, selected]), [
    ['page-1', 'Darker page 1', false],
    ['page-2', 'Darker page 2', true],
    ['page-3', 'Darker page 3', false],
    ['sudokupad', 'SudokuPad colors', false]
  ])
  const section = html.indexOf('Pen colors')
  assert.equal(section < html.indexOf('color-choice') && html.indexOf('color-choice') < html.indexOf('data-key="1"'), true, 'heading, pulldown, then the grid')
  assert.doesNotMatch(html, /<button|data-sudokupad-colors/)
})

test('the pulldown lists only the pages the palette has', () => {
  assert.deepEqual(presetMenu(renderEditor(editorState({ presets: ['page-1', 'sudokupad'] }))).map((o) => o.value), ['page-1', 'sudokupad'])
})

test('a set in force that is no pickable preset is listed first, selected and not pickable, so every preset stays pickable', () => {
  // A page-3 set with a one-page palette, a page-1 set with the colors step off, and SudokuPad's colors before the install save.
  assert.deepEqual(presetMenu(renderEditor(editorState({ preset: 'page-3', presets: ['page-1', 'sudokupad'] }))), [
    { value: 'page-3', label: 'Darker page 3', selected: true, disabled: true },
    { value: 'page-1', label: 'Darker page 1', selected: false, disabled: false },
    { value: 'sudokupad', label: 'SudokuPad colors', selected: false, disabled: false }
  ])
  assert.deepEqual(presetMenu(renderEditor(editorState({ preset: 'page-1', presets: ['sudokupad'] }))).map((o) => [o.value, o.selected, o.disabled]), [['page-1', true, true], ['sudokupad', false, false]])
  assert.deepEqual(presetMenu(renderEditor(editorState({ preset: 'unsaved', presets: ['sudokupad'] }))), [
    { value: 'unsaved', label: 'SudokuPad (unsaved)', selected: true, disabled: true },
    { value: 'sudokupad', label: 'SudokuPad colors', selected: false, disabled: false }
  ])
})

test('Custom is in the pulldown only while the set is custom, selected and not pickable', () => {
  assert.deepEqual(presetMenu(renderEditor(editorState({ preset: 'custom' }))).filter((o) => o.value === 'custom'), [{ value: 'custom', label: 'Custom', selected: true, disabled: true }])
  assert.equal(presetMenu(renderEditor(editorState({ preset: 'page-1' }))).some((o) => o.value === 'custom'), false)
})

test('the missing-color note names the page the colors came from and the pens that keep SudokuPad\'s own', () => {
  const text = renderEditor(editorState({ missing: [4, 5], preset: 'custom', pickedPreset: 'page-2' }))
  assert.match(text, /Cell color page 2 has no usable color at the matching button, so pen colors 4, 5 keep SudokuPad's own\./)
  assert.match(renderEditor(editorState({ missing: [7], pickedPreset: 'page-1' })), /Cell color page 1 has no usable color at the matching button, so pen color 7 keeps SudokuPad's own\./)
  assert.doesNotMatch(renderEditor(editorState()), /no usable color/)
})

test('the page button turns to the next enabled page and has a dot for each enabled page only', () => {
  const noDash = renderPageIcon(0, 3, { dashed: false, arrows: true })
  assert.ok(noDash.includes(pictureOf(pageSwatch(PEN_PAGES[2], 3, PAGE_BUTTON_ANGLE))), noDash)
  assert.equal((noDash.match(/<circle/g) || []).length, 2)
  assert.equal((noDash.match(/data-page-dot="filled"/g) || []).length, 1)
  const noArrows = renderPageIcon(1, 3, { dashed: true, arrows: false })
  assert.ok(noArrows.includes(pictureOf(pageSwatch(PEN_PAGES[0], 3, PAGE_BUTTON_ANGLE))), noArrows)
  assert.equal((noArrows.match(/<circle/g) || []).length, 2)
  assert.match(noArrows, /<circle[^>]*data-page-dot="outline"[^>]*\/>[^]*<circle[^>]*data-page-dot="filled"/)
})

test('every pen button swatch is the page\'s pageSwatch at angle 0, on every page', () => {
  const rules = rulesOf(buildPagesCss(5, 2))
  PEN_PAGES.forEach((page, index) => {
    const selector = `.tool-pen button[data-key="4"]${index === 0 ? '' : `[data-pen-page="${index + 1}"]`}:after`
    assert.equal(maskSvg(rules.find((r) => r.selector === selector)), pageSwatch(page, 2, 0), `page ${index + 1}`)
  })
})

const rowOf = (html, key) => new RegExp(`<div data-row="${key}"[^>]*>[\\s\\S]*?</div>`).exec(html)[0]

const subLineOf = (html, key) => new RegExp(`<div class="pen-tool-extras-check-row pen-tool-extras-sub"><input type="checkbox" id="pen-tool-extras-box-show-${key}" data-box="show.${key}"( checked)? title="[^"]+" class="pen-tool-extras-check"><label for="pen-tool-extras-box-show-${key}" class="pen-tool-extras-label">Slider in panel</label></div>`).exec(html)

test('Line settings: Thickness and Opacity each have a sub-line under them, a box then "Slider in panel", ticked as saved; no caption column', () => {
  const both = renderEditor(editorState())
  assert.equal(Boolean(subLineOf(both, 'thickness')[1]) && Boolean(subLineOf(both, 'opacity')[1]), true)
  assert.match(both, /data-row="thickness"[\s\S]*?<\/div><div class="pen-tool-extras-check-row pen-tool-extras-sub">[\s\S]*data-row="opacity"[\s\S]*?<\/div><div class="pen-tool-extras-check-row pen-tool-extras-sub">/, 'each sub-line follows its row')
  assert.doesNotMatch(both, /pen-tool-extras-column-heading|>In panel</)
  assert.equal((both.match(/>Slider in panel</g) || []).length, 2)
  const none = renderEditor(editorState({ show: { thickness: false, opacity: true } }))
  assert.equal(subLineOf(none, 'thickness')[1], undefined, 'unticked, and the slider is still in the dialog')
  assert.match(none, /data-setting="thickness"/)
  assert.equal(Boolean(subLineOf(none, 'opacity')[1]), true)
  const row = rowOf(both, 'thickness')
  assert.equal(row.indexOf('<label') < row.indexOf('data-setting="thickness"') && row.indexOf('data-setting="thickness"') < row.indexOf('data-readout="thickness"'), true, 'label, slider, then the value')
  assert.match(DIALOG_CSS, /\.pen-tool-extras-sub \{[^}]*padding-left: 1\.2em;[^}]*color: #444;/)
})

test('the dialog always holds the thickness, opacity, dash, arrow spacing and outline width sliders, at the values in force, whether or not the panel shows them', () => {
  const html = renderEditor(editorState({ thickness: 9, opacity: 35, show: { thickness: false, opacity: false } }))
  const ranges = [...html.matchAll(/<input type="range" data-setting="(\w+)" min="(\d+)" max="(\d+)" step="([\d.]+)" value="([\d.]+)"/g)].map((m) => m.slice(1))
  assert.deepEqual(ranges, [
    ['thickness', String(THICKNESS.min), String(THICKNESS.max), String(THICKNESS.step), '9'],
    ['opacity', String(OPACITY.min), String(OPACITY.max), String(OPACITY.step), '35'],
    ['dash', String(DASH.min), String(DASH.max), String(DASH.step), '0'],
    ['arrowSpacing', String(ARROW_SPACING.min), String(ARROW_SPACING.max), String(ARROW_SPACING.step), '7'],
    ['outlineWidth', String(OUTLINE_WIDTH.min), String(OUTLINE_WIDTH.max), String(OUTLINE_WIDTH.step), '2']
  ])
})

test('the dialog slider and its readout show a half step as 2.5', () => {
  const row = rowOf(renderEditor(editorState({ thickness: 2.5 })), 'thickness')
  assert.match(row, /step="0.5" value="2.5"/)
  assert.match(row, /<output data-readout="thickness">2.5<\/output>/)
})

test('every slider in the settings table has one dialog row, with the label and range of its table entry', () => {
  const html = renderEditor(editorState())
  const sliders = Object.entries(SETTINGS).filter(([, row]) => row.range)
  assert.deepEqual(sliders.map(([name, row]) => [name, row.dialog.label]), [
    ['thickness', 'Thickness'], ['opacity', 'Opacity (%)'], ['dash', 'Dash length'], ['arrowSpacing', 'Arrow spacing'], ['outlineWidth', 'Outline width']
  ])
  for (const [name, { range, dialog }] of sliders) {
    const row = rowOf(html, name)
    assert.match(row, new RegExp(`<label for="pen-tool-extras-setting-${name}"[^>]*>${dialog.label.replace(/[()]/g, '\\$&')}</label>`), name)
    assert.match(row, new RegExp(`data-setting="${name}" min="${range.min}" max="${range.max}" step="${range.step}"`), name)
  }
  assert.equal((html.match(/<input type="range"/g) || []).length, sliders.length)
})

test('a box ticked in the dialog sets its setting in the draft through the table, a mark box included', () => {
  const draft = editorState()
  assert.equal(draftWithBox(draft, 'outline', false).outline, false)
  assert.equal(draftWithBox(draft, 'eraseClicks', false).eraseClicks, false)
  assert.deepEqual(draftWithBox(draft, 'lineStyles.dashed', false).lineStyles, { dashed: false, arrows: true })
  assert.deepEqual(draftWithBox(draft, 'show.opacity', false).show, { thickness: true, opacity: false })
  assert.deepEqual(draft.lineStyles, { dashed: true, arrows: true }, 'the draft given is left alone')
  assert.deepEqual(draftWithBox(draft, 'marks.cornerX', false).marks, { ...ALL, cornerX: false })
})

test('a box path that names no box of the table is refused, not drafted', () => {
  const draft = editorState()
  for (const path of ['', 'nothing', 'thickness', 'outline.x', 'lineStyles', 'lineStyles.solid', 'marks.toString', 'marks.x.y']) {
    assert.throws(() => draftWithBox(draft, path, false), /names no box of the settings table/, path)
  }
})

test('every checkbox the dialog draws names its setting path, and the path reads back the value it shows', () => {
  const state = editorState({ show: { thickness: false, opacity: true }, lineStyles: { dashed: true, arrows: false }, outline: false, marks: { ...ALL, circle: false } })
  const html = renderEditor(state)
  const boxes = [...html.matchAll(/<input type="checkbox"[^>]*>/g)].map((m) => m[0])
  assert.equal(boxes.length, 14)
  for (const box of boxes) {
    const path = /data-box="([^"]+)"/.exec(box)
    assert.ok(path, box)
    const [name, flagName] = path[1].split('.')
    assert.equal(/ checked/.test(box), flagName ? state[name][flagName] : state[name], path[1])
  }
})

test('every slider row has the same three columns, a 96px slider after one shared label column, so the five sliders line up', () => {
  const html = renderEditor(editorState())
  const classes = ['thickness', 'opacity', 'dash', 'arrowSpacing', 'outlineWidth'].map((key) => /^<div data-row="[^"]+" class="([^"]+)"/.exec(rowOf(html, key))[1])
  assert.equal(new Set(classes).size, 1, classes.join(' | '))
  const columns = new RegExp(`\\.${classes[0]} \\{[^}]*grid-template-columns: ([^;]+);`).exec(DIALOG_CSS)[1]
  assert.match(columns.trim(), /^[\d.]+em 96px [\d.]+em$/)
})

test('Line styles: each style\'s box sits before its label, with no Enable caption, and Dash length and Arrow spacing indented under them', () => {
  const html = renderEditor(editorState())
  assert.match(html, />Line styles</)
  assert.doesNotMatch(html, />Enable</)
  const dashed = /<input type="checkbox" id="pen-tool-extras-box-lineStyles-dashed" data-box="lineStyles.dashed"( checked)?[^>]*>\s*<label for="pen-tool-extras-box-lineStyles-dashed"[^>]*>Dashed lines<\/label>/.exec(html)
  const arrows = /<input type="checkbox" id="pen-tool-extras-box-lineStyles-arrows" data-box="lineStyles.arrows"( checked)?[^>]*>\s*<label for="pen-tool-extras-box-lineStyles-arrows"[^>]*>Directional arrow lines<\/label>/.exec(html)
  assert.equal(Boolean(dashed[1]) && Boolean(arrows[1]), true)
  assert.match(html, />Dashed lines<[\s\S]*>Dash length<[\s\S]*>Directional arrow lines<[\s\S]*>Arrow spacing</)
  assert.match(rowOf(html, 'dash'), /<label [^>]*class="pen-tool-extras-label pen-tool-extras-under"/)
  assert.match(rowOf(html, 'arrowSpacing'), /<label [^>]*class="pen-tool-extras-label pen-tool-extras-under"/)
  assert.match(DIALOG_CSS, /\.pen-tool-extras-label\.pen-tool-extras-under \{ padding-left: 1\.2em;/, 'the indent')
  assert.doesNotMatch(html, /display:none/)
})

test('an unticked line style is drawn unticked and the stylesheet hides its slider row while its box is unticked; the slider keeps its value', () => {
  const html = renderEditor(editorState({ dash: 6, lineStyles: { dashed: false, arrows: true } }))
  assert.doesNotMatch(html, /data-box="lineStyles.dashed"[^>]* checked/)
  assert.match(rowOf(html, 'dash'), /value="6"/)
  assert.match(DIALOG_CSS, /#pen-tool-extras-editor:not\(:has\(input\[data-box="lineStyles\.dashed"\]:checked\)\) \[data-row="dash"\] \{ display: none; \}/)
  assert.match(DIALOG_CSS, /#pen-tool-extras-editor:not\(:has\(input\[data-box="lineStyles\.arrows"\]:checked\)\) \[data-row="arrowSpacing"\] \{ display: none; \}/)
})

test('Marks to cycle is one 3 by 4 table: headings X, circle, an up arrow head and a down arrow head, dot; rows Edge (X, circle, directions), Corner (X and circle) and Cell (cross, circle, dot)', () => {
  const html = renderEditor(editorState())
  assert.match(html, />Marks to cycle</)
  assert.doesNotMatch(html, /Marks a click cycles through|X Mark<|>Circle<|>Directions</)
  assert.match(html, /<div class="pen-tool-extras-mark-head">[\s\S]*<div class="pen-tool-extras-mark-head">[\s\S]*<div class="pen-tool-extras-mark-head">[\s\S]*<div class="pen-tool-extras-mark-head">[\s\S]*>Edge<[\s\S]*data-box="marks.x"[\s\S]*data-box="marks.circle"[\s\S]*data-box="marks.directions"[\s\S]*>Corner<[\s\S]*data-box="marks.cornerX"[\s\S]*data-box="marks.cornerCircle"[\s\S]*>Cell<[\s\S]*data-box="marks.cellCross"[\s\S]*data-box="marks.cellCircle"[\s\S]*data-box="marks.cellDot"/)
  const boxes = [...html.matchAll(/<input type="checkbox" id="pen-tool-extras-box-marks-(\w+)" data-box="marks\.\w+" aria-label="([^"]+)" title="([^"]+)"( checked)?>/g)]
  assert.deepEqual(boxes.map((m) => [m[1], m[2], m[3]]), [
    ['x', 'Edge X Mark', 'Edge X Mark'], ['circle', 'Edge Circle', 'Edge Circle'], ['directions', 'Edge Directions', 'Edge Directions'],
    ['cornerX', 'Corner X Mark', 'Corner X Mark'], ['cornerCircle', 'Corner Circle', 'Corner Circle'],
    ['cellCross', 'Cell Cross', 'Cell Cross'], ['cellCircle', 'Cell Circle', 'Cell Circle'], ['cellDot', 'Cell Dot', 'Cell Dot']
  ])
  assert.equal(boxes.every((m) => m[4] === ' checked'), true)
  // Each row is five children: the label and four cells, the Cell row's third (directions) empty.
  const cellRow = html.slice(html.indexOf('>Cell<'))
  assert.match(cellRow, /^>Cell<\/div><label[^>]*>.*?<\/label><label[^>]*>.*?<\/label><div><\/div><label[^>]*>.*?<\/label><\/div>/)
  assert.match(DIALOG_CSS, /\.pen-tool-extras-marks-table \{[^}]*grid-template-columns: max-content repeat\(4, 28px\);/)
  assert.match(DIALOG_CSS, /\.pen-tool-extras-marks-table > :nth-child\(5n\+1\) \{ justify-content: flex-start;/)
  assert.match(DIALOG_CSS, /\.pen-tool-extras-marks-table > :not\(:nth-child\(5n\+1\)\) \{ border-left: 1px solid #eee;/)
  assert.match(DIALOG_CSS, /\.pen-tool-extras-marks-table > :nth-child\(n\+6\) \{ border-top: 1px solid #eee;/)
})

test('the marks table shows pictures only in its headings, in #444 at stroke 2.6: Directions is an up arrow head and a down arrow head, just ^ and v, and the cells hold plain boxes', () => {
  const html = renderEditor(editorState())
  assert.doesNotMatch(html, /<label for="pen-tool-extras-box-marks-/)
  const heads = [...html.matchAll(/<div class="pen-tool-extras-mark-head">(.*?)<\/div>/g)].map((m) => m[1])
  assert.equal(heads.length, 4)
  assert.match(heads[3], /<circle [^>]*fill="currentColor"/, 'the dot heading is filled')
  assert.equal(heads.every((head) => (head.match(/<svg/g) || []).length === 1 && !/>[A-Za-z]/.test(head)), true, 'one picture, no text')
  assert.match(heads[2], /<path d="M\d+ \d+ L\d+ \d+ L\d+ \d+ M\d+ \d+ L\d+ \d+ L\d+ \d+"\/>/, 'two arrow heads')
  assert.match(DIALOG_CSS, /\.pen-tool-extras-mark-head \{[^}]*color: #444;/)
  assert.match(DIALOG_CSS, /\.pen-tool-extras-mark-head svg \{[^}]*stroke-width: 2\.6;/)
  const cell = (key) => new RegExp(`<label[^>]*class="pen-tool-extras-mark"[^>]*>(<input[^>]*data-box="marks.${key}"[^>]*>)</label>`).exec(html)
  assert.ok(cell('directions') && cell('cornerCircle'), 'a box is alone in its label')
})

test('Other: the White outlines box has its own line with Outline width under it, hidden while the box is unticked, and the right click erase box follows', () => {
  const html = renderEditor(editorState())
  assert.match(html, />Other</)
  assert.match(html, /<input type="checkbox" id="pen-tool-extras-box-outline" data-box="outline" checked[^>]*>\s*<label for="pen-tool-extras-box-outline"[^>]*>White outlines<\/label>/)
  assert.equal(html.indexOf('data-box="outline"') < html.indexOf('data-setting="outlineWidth"') && html.indexOf('data-setting="outlineWidth"') < html.indexOf('data-box="eraseClicks"'), true)
  assert.match(rowOf(html, 'outlineWidth'), /class="pen-tool-extras-label pen-tool-extras-under"/)
  assert.match(DIALOG_CSS, /\.pen-tool-extras-label\.pen-tool-extras-under \{ padding-left: 1\.2em;/, 'the indent')
  assert.match(rowOf(html, 'outlineWidth'), /<label for="pen-tool-extras-setting-outlineWidth"[^>]*>Outline width<\/label>/)
  assert.match(DIALOG_CSS, /#pen-tool-extras-editor:not\(:has\(input\[data-box="outline"\]:checked\)\) \[data-row="outlineWidth"\] \{ display: none; \}/)
  const off = renderEditor(editorState({ outline: false, outlineWidth: 5 }))
  assert.doesNotMatch(off, /data-box="outline" checked/)
  assert.match(rowOf(off, 'outlineWidth'), /value="5"/)
})

test('the right click erase box is ticked unless the setting is off', () => {
  const box = (html) => /<input type="checkbox" id="pen-tool-extras-box-eraseClicks" data-box="eraseClicks"( checked)?[^>]*>\s*<label for="pen-tool-extras-box-eraseClicks"[^>]*>Right click erase<\/label>/.exec(html)
  assert.equal(box(renderEditor(editorState()))[1], ' checked')
  assert.equal(box(renderEditor(editorState({ eraseClicks: false })))[1], undefined)
})

test('the editor is a two by two grid: Pen colors | Line settings and Line styles above Marks to cycle | Other, with one divider between Line settings and Line styles', () => {
  const html = renderEditor(editorState())
  const cells = html.split('<div class="pen-tool-extras-cell">').slice(1)
  assert.equal(cells.length, 4)
  const titles = cells.map((cell) => [...cell.matchAll(/<div class="pen-tool-extras-section-title">([^<]*)<\/div>/g)].map((m) => m[1]))
  assert.deepEqual(titles, [['Pen colors'], ['Line settings', 'Line styles'], ['Marks to cycle'], ['Other']])
  assert.equal((html.match(/<div class="pen-tool-extras-divider"><\/div>/g) || []).length, 1)
  assert.match(cells[1], /Opacity[\s\S]*pen-tool-extras-divider[\s\S]*>Line styles</)
  assert.match(DIALOG_CSS, /@media \(max-width: \d+px\) \{[^@]*grid-template-columns: minmax\(0, 1fr\)/, 'one column on a narrow screen')
})

test('the dialog is sized to its content, the paragraph around the editor loses its bottom margin', () => {
  assert.match(DIALOG_CSS, /\.dialog:has\(#pen-tool-extras-editor\) \{[^}]*width: fit-content !important;/)
  assert.match(DIALOG_CSS, /\.dialog p:has\(> #pen-tool-extras-editor\) \{ margin-bottom: 0 !important; \}/)
})

test('a missing-color note in the first column wraps within it and never sets its width', () => {
  assert.match(DIALOG_CSS, /\.pen-tool-extras-cell \.pen-tool-extras-note \{[^}]*width: 0;[^}]*min-width: 100%;/)
  assert.match(renderEditor(editorState({ missing: [4], pickedPreset: 'page-1' })), /<div class="pen-tool-extras-cell"><div class="pen-tool-extras-section-title">Pen colors<\/div>[\s\S]*no usable color[\s\S]*<\/div><div class="pen-tool-extras-cell">/, 'the note is in the Pen colors cell')
})

test('the grid\'s lines are the mockup\'s #ddd: each cell has a top line and each right-hand cell a left line, and the divider a top line', () => {
  assert.match(DIALOG_CSS, /\.pen-tool-extras-cell \{[^}]*border-top: 1px solid #ddd;/)
  assert.match(DIALOG_CSS, /\.pen-tool-extras-cell:nth-child\(2n\) \{ border-left: 1px solid #ddd;/)
  assert.match(DIALOG_CSS, /\.pen-tool-extras-divider \{ border-top: 1px solid #ddd;/)
})

test('the settings dialog has no line mode pulldown: the panel button is the one control', () => {
  const html = renderEditor(editorState())
  assert.equal(html.includes('Pen line mode'), false)
  assert.equal(html.includes('data-line-mode'), false)
})

test('the line mode button steps Center & Edge, Center only, Edge only and back round', () => {
  assert.equal(nextLineMode('both'), 'centeronly')
  assert.equal(nextLineMode('centeronly'), 'edgeonly')
  assert.equal(nextLineMode('edgeonly'), 'both')
})

test('the line mode button names the current mode with SudokuPad\'s label, as its hover title and its aria-label', () => {
  const labels = { both: 'Center &amp; Edge', centeronly: 'Center only', edgeonly: 'Edge only' }
  Object.entries(labels).forEach(([mode, label]) => {
    const html = renderLineModeButton(mode)
    assert.match(html, /^<button [^>]*class="pen-tool-extras-mode"[^>]*>/)
    assert.match(html, new RegExp(`title="${label}"`))
    assert.match(html, new RegExp(`aria-label="${label}"`))
  })
})

test('the line mode icon draws the faint 2x2 grid, with the center line, the edge line, or both', () => {
  const lines = (mode) => [...renderLineModeButton(mode).matchAll(/<path data-line="(\w+)"/g)].map((m) => m[1])
  assert.deepEqual(lines('both'), ['center', 'edge'])
  assert.deepEqual(lines('centeronly'), ['center'])
  assert.deepEqual(lines('edgeonly'), ['edge'])
  assert.match(renderLineModeButton('both'), /<path data-grid [^>]*stroke-opacity="0\.55"/)
  // The lines are solid: only the grid carries a stroke opacity.
  assert.equal(renderLineModeButton('both').match(/stroke-opacity/g).length, 1)
  // SudokuPad's CSS fills every `svg path`, so each path has to turn the fill off to draw as a line.
  assert.match(PANEL_CSS, /\.pen-tool-extras-mode path, [^{]*\{ fill: none !important;/)
})

const ruleOf = (selector) => (new RegExp(`^${selector.replace(/[.[\]~]/g, '\\$&')} \\{([^}]*)\\}`, 'm').exec(PANEL_CSS) || [])[1]
const BUTTON_SIZE = /width: 4rem; height: 4rem;/

test('the three controls are one 4rem square size, in one rule, in the order mode, line type, settings, in the fourth grid row', () => {
  const controls = ruleOf('.tool-pen .controls-input button.pen-tool-extras-mode, .tool-pen .controls-input button.pen-tool-extras-page, .tool-pen .controls-input button.pen-tool-extras-settings')
  assert.match(controls, BUTTON_SIZE)
  assert.match(controls, /grid-row: 4;/)
  // No other rule gives a control a size of its own.
  assert.equal(PANEL_CSS.split('\n').filter((rule) => /button\.pen-tool-extras-(mode|page|settings)/.test(rule) && /width|height/.test(rule)).length, 1)
  ;[['mode', 1], ['page', 2], ['settings', 3]].forEach(([name, order]) => assert.match(ruleOf(`.tool-pen .controls-input button.pen-tool-extras-${name}`), new RegExp(`order: ${order};`)))
})

test('the settings button is a button named Pen Tool Extras settings, drawing an outline gear in the panel color and no fill', () => {
  const html = renderSettingsButton()
  assert.match(html, /^<button class="pen-tool-extras-settings" data-control="penextras-settings" title="Pen Tool Extras settings" aria-label="Pen Tool Extras settings">/)
  assert.match(html, /<svg viewBox="[^"]+" fill="none" stroke="currentColor"/)
  assert.match(html, /<circle cx="12" cy="12" r="3"\/>/)
  assert.match(PANEL_CSS, /\.pen-tool-extras-settings path, \.pen-tool-extras-settings circle \{ fill: none !important; \}/)
})

test('each control icon is drawn from a square viewBox that is not the plain 24 box, for every picture an icon shows', () => {
  const icons = [...LINE_MODES.map(([mode]) => renderLineModeButton(mode)), renderSettingsButton(), ...PEN_PAGES.map((_, page) => renderPageIcon(page, 3, BOTH_STYLES))]
  assert.equal(icons.length, 7)
  icons.forEach((html) => {
    const box = /viewBox="([^"]+)"/.exec(html)[1]
    const [, , w, h] = box.split(' ').map(Number)
    assert.equal(w, h, box)
    assert.notEqual(box, '0 0 24 24', 'the icon carries its measured correction')
  })
})

test('every page has a measured icon viewBox, so the line type button never shows viewBox="undefined"', () => {
  PEN_PAGES.forEach((_, page) => assert.doesNotMatch(renderPageIcon(page, 3, BOTH_STYLES), /viewBox="undefined"/, `page ${page + 1}`))
})

test('Keypad Flipped swaps the rows of color buttons by grid row, since its transform on each button row has no box here', () => {
  const rule = (key) => new RegExp(`\\.setting-flipkeypad \\.tool-pen \\.controls-input button\\[data-key="${key}"\\] \\{ grid-row: (\\d) / span 1; \\}`).exec(PANEL_CSS)[1]
  assert.deepEqual([1, 2, 3, 7, 8, 9].map(rule), ['3', '3', '3', '1', '1', '1'])
})

test('the thickness track is a wedge wider at the right than at the left, and the opacity track fades from faint to solid', () => {
  const wedge = decodeURIComponent((/url\("data:image\/svg\+xml,([^"]+)"\)/.exec(ruleOf('#pen-tool-extras-thickness::-webkit-slider-runnable-track')) || [])[1])
  const [topLeft, topRight, bottomRight, bottomLeft] = /points='([^']+)'/.exec(wedge)[1].split(' ').map((point) => point.split(',').map(Number))
  const heightAt = (top, bottom) => bottom[1] - top[1]
  assert.equal(heightAt(topLeft, bottomLeft) > 0, true)
  assert.equal(heightAt(topRight, bottomRight) > 2 * heightAt(topLeft, bottomLeft), true, 'the wedge widens to the right')
  assert.match(wedge, new RegExp(`fill='${SUDOKUPAD_PURPLE}'`))
  assert.match(ruleOf('#pen-tool-extras-opacity::-webkit-slider-runnable-track'), new RegExp(`linear-gradient\\(to right, color-mix\\(in srgb, ${SUDOKUPAD_PURPLE} 8%, transparent\\), ${SUDOKUPAD_PURPLE}\\)`))
})

test('the sliders carry no line pictures, and keep their hover labels', () => {
  const html = renderPanelSliders(9, 35, { thickness: true, opacity: true })
  assert.equal(html.includes('<svg'), false)
  assert.match(html, /class="pen-tool-extras-slider" title="Thickness"/)
  assert.match(html, /class="pen-tool-extras-slider" title="Opacity"/)
})

test('the slider tracks are styled for Chromium and Firefox: a wedge for thickness, a fade for opacity, a white thumb with a purple ring', () => {
  ;['::-webkit-slider-runnable-track', '::-moz-range-track', '::-webkit-slider-thumb', '::-moz-range-thumb'].forEach((part) => assert.equal(PANEL_CSS.includes(part), true, part))
  assert.match(PANEL_CSS, /#pen-tool-extras-thickness::-webkit-slider-runnable-track \{[^}]*polygon/)
  assert.match(PANEL_CSS, /#pen-tool-extras-thickness::-moz-range-track \{[^}]*polygon/)
  assert.match(PANEL_CSS, /#pen-tool-extras-opacity::-webkit-slider-runnable-track \{[^}]*linear-gradient/)
  assert.match(PANEL_CSS, /#pen-tool-extras-opacity::-moz-range-track \{[^}]*linear-gradient/)
  assert.match(PANEL_CSS, new RegExp(`::-webkit-slider-thumb \\{[^}]*background: #fff; border: [^;]*${SUDOKUPAD_PURPLE}`))
  assert.match(PANEL_CSS, new RegExp(`::-moz-range-thumb \\{[^}]*background: #fff; border: [^;]*${SUDOKUPAD_PURPLE}`))
})

const HEADER = fs.readFileSync(path.join(__dirname, '..', 'pen-tool-extras.user.js'), 'utf8')
const headerField = (name) => (new RegExp(`^// @${name}\\s+(.+)$`, 'm').exec(HEADER) || [])[1]

test('the header describes the script in Chris\'s approved intro and links its details page', () => {
  assert.equal(headerField('description'), 'Adds to SudokuPad\'s pen tool: customizable pen colors, dashed and arrow lines, and marks on cell edges and grid corners. Turn the pen tool on in SudokuPad\'s settings first.')
  assert.equal(headerField('homepageURL'), 'https://caneff.github.io/sudokupad-scripts/pen-tool-extras.html')
})

test('VERSION is the @version in the script header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, '..', 'pen-tool-extras.user.js'), 'utf8')))
})

// Page 3: arrow lines. A page 3 pen is two color characters; the one a line stores says which way it was dragged.
test('a page 3 pen\'s two characters are the 18 from j to z and 0, two to a pen, the first for the way a line is stored', () => {
  const page = PEN_PAGES[2]
  assert.deepEqual([...page.chars, ...page.reverse].sort(), 'jklmnopqrstuvwxyz0'.split('').sort())
  assert.equal(new Set([...PEN_PAGES.flatMap((p) => [...p.chars, ...(p.reverse || [])])]).size, 36, 'no character is on two pages')
})

test('directionCharOf gives a page 3 pen\'s character for the way a line is dragged, and any other pen its own', () => {
  assert.equal(directionCharOf('j', true), 'j')
  assert.equal(directionCharOf('j', false), 'k')
  assert.equal(directionCharOf('z', false), '0')
  assert.equal(directionCharOf('c', false), 'c')
  assert.equal(directionCharOf('3', false), '3')
})

test('arrowLineWayOf reads a stored character back as the way its line was dragged, and is null for any other character', () => {
  assert.equal(arrowLineWayOf('j'), true)
  assert.equal(arrowLineWayOf('k'), false)
  assert.equal(arrowLineWayOf('0'), false)
  assert.equal(arrowLineWayOf('z'), true)
  for (const other of ['1', 'a', 'i', 'A', '', undefined, 'jk']) assert.equal(arrowLineWayOf(other), null, String(other))
})

test('the page 3 characters stroke in the color of their page 1 partner, both ways, and are never dashed', () => {
  const rules = rulesOf(buildPagesCss(5, 3))
  PEN_PAGES[2].chars.forEach((char, i) => {
    for (const c of [char, PEN_PAGES[2].reverse[i]]) {
      const rule = rules.find((r) => r.selector === `.pencolor-${c}`)
      assert.equal(rule && rule.body, `stroke: var(--puzzle-pencolor-${i + 1});`, c)
    }
  })
  for (const r of rules.filter((r) => r.body.startsWith('stroke-dasharray'))) assert.doesNotMatch(r.selector, /pencolor-[j-z0]/)
})

test('a page 3 arrow is filled and not stroked, in the pen color of its character, for the way it was stored and the way back', () => {
  const css = buildPagesCss(5, 0)
  const page = PEN_PAGES[2]
  page.chars.forEach((char, i) => [char, page.reverse[i]].forEach((c) => {
    assert.ok(css.includes(`:root:root .pencolor-${c} [data-arrow-line-part='arrows'] { fill: var(--puzzle-pencolor-${i + 1}); stroke: none; }`), `character ${c}`)
  }))
})

test('a page 3 swatch is an arrow in the pen color of its button, as a mask so the color follows a recolor', () => {
  const rules = rulesOf(buildPagesCss(5, 0))
  for (let n = 1; n <= 9; n++) {
    const rule = rules.find((r) => r.selector === `.tool-pen button[data-key="${n}"][data-pen-page="3"]:after`)
    assert.ok(rule, `swatch ${n}`)
    assert.match(rule.body, new RegExp(`background-color: var\\(--puzzle-pencolor-${n}\\)`))
    assert.match(rule.body, /mask(-image)?: url\("data:image\/svg\+xml,/)
  }
  // The picture itself: a stroked line and closed triangles that are filled, since an unfilled triangle is an outline of an arrow, not one.
  const mask = rules.find((r) => r.selector === '.tool-pen button[data-key="1"][data-pen-page="3"]:after').body
  const svg = decodeURIComponent(/url\("data:image\/svg\+xml,([^"]+)"\)/.exec(mask)[1])
  const triangles = /<path d='([^']+)' fill='currentColor' stroke='none'\/>/.exec(svg)
  assert.ok(triangles, `the arrows are filled paths with no stroke: ${svg}`)
  assert.equal(triangles[1].split('Z').length - 1, 2, 'two closed arrows')
})

// The swatch line is 3 wide in a 24 box, from x 2 to 22; its two arrows are those of a line of thickness 5, drawn at 0.4588 of their size.
const swatchArrows = () => {
  const svg = pageSwatch(PEN_PAGES[2], 3, 0)
  const d = /<path d='([^']+)' fill='currentColor' stroke='none'\/>/.exec(svg)[1]
  return d.split('Z').filter(Boolean).map((arrow) => arrow.match(/-?[\d.]+/g).map(Number)).map(([wx, wy, tx, ty, ox, oy]) => ({ length: tx - wx, width: oy - wy, centre: (wx + tx) / 2, middle: ty }))
}

test('the page 3 swatch has two arrows, centred a quarter and three quarters along its line, each 7.8 wide so it sticks out 2.4 past the 3 wide line', () => {
  const arrows = swatchArrows()
  assert.equal(arrows.length, 2)
  assert.deepEqual(arrows.map((a) => Math.round(a.centre * 10) / 10), [7, 17])
  for (const arrow of arrows) {
    // the path text rounds to 2 places
    assert.equal(Math.abs(-arrow.width - 7.8) < 0.011, true, `width ${-arrow.width}`)
    assert.equal(Math.abs(arrow.length - 5.28) < 0.011, true, `length ${arrow.length}`)
    assert.equal(arrow.middle, 12)
  }
})

test('every swatch line is 3 wide', () => {
  PEN_PAGES.forEach((page) => assert.match(pageSwatch(page, 3, 0), /<path d='M2 12H22' stroke-width='3'/))
})

test('the page 2 swatch keeps width 2\'s dash layout, each dash 1 shorter and each gap 1 longer, with the offset moved to keep each dash centred', () => {
  // [dash length, dasharray, dashoffset]: worked at width 2 on a line of 20 (dash 0: 5 periods of 4, rounded to 3 places; 1: 3 of 6.667; 3: 2 of 10; 8: 1 of 20), then on - 1, gap + 1, offset - 0.5.
  const want = [[0, [0, 5], 0], [1, [1, 5.667], 0.5], [3, [5, 5], 2.5], [8, [15, 5], 7.5]]
  for (const [dash, array, offset] of want) {
    const got = swatchDashes(dash)
    assert.deepEqual(got.array.map((x) => Math.round(x * 1000) / 1000), array, `dash ${dash}`)
    assert.equal(got.offset, offset, `dash ${dash}`)
  }
})

test('at every dash length the page 2 swatch has a dash of 0 or more, 2 units visible between the 3 wide round caps, and whole periods in its line', () => {
  for (let dash = DASH.min; dash <= DASH.max; dash++) {
    const { array } = swatchDashes(dash)
    assert.equal(array[0] >= 0, true, `dash ${dash}`)
    assert.equal(array[1] - 3 > 1.99, true, `gap ${array[1]} leaves 2 visible between 3 wide caps`)
    const periods = 20 / (array[0] + array[1])
    assert.equal(Math.abs(periods - Math.round(periods)) < 0.01, true, `dash ${dash}: ${periods} periods`)
  }
})

// The segments a drag is made of, as SudokuPad's own pen tool stores them: the value, the cell that holds it,
// and whether the drag ran along the line the way renderPen draws it. Each row: from [r, c], to [r, c], then the result.
test('lineSegment names the value, cell and way of every kind of segment, as SudokuPad stores it', () => {
  const rc = ([r, c]) => ({ r, c })
  const cases = [
    // center lines: 1 runs right, 2 runs down, d runs up and right, e runs down and right
    [[2.5, 2.5], [2.5, 3.5], { value: '1', row: 2, col: 2, forward: true }],
    [[2.5, 3.5], [2.5, 2.5], { value: '1', row: 2, col: 2, forward: false }],
    [[2.5, 2.5], [3.5, 2.5], { value: '2', row: 2, col: 2, forward: true }],
    [[3.5, 2.5], [2.5, 2.5], { value: '2', row: 2, col: 2, forward: false }],
    [[3.5, 2.5], [2.5, 3.5], { value: 'd', row: 3, col: 2, forward: true }],
    [[2.5, 3.5], [3.5, 2.5], { value: 'd', row: 3, col: 2, forward: false }],
    [[2.5, 2.5], [3.5, 3.5], { value: 'e', row: 2, col: 2, forward: true }],
    [[3.5, 3.5], [2.5, 2.5], { value: 'e', row: 2, col: 2, forward: false }],
    // edge lines: 8 and 7 are the bottom and right edge of a cell, 9 and a the left and top edge, used only on the grid's own left and top
    [[3, 2], [3, 3], { value: '8', row: 2, col: 2, forward: true }],
    [[3, 3], [3, 2], { value: '8', row: 2, col: 2, forward: false }],
    [[2, 3], [3, 3], { value: '7', row: 2, col: 2, forward: true }],
    [[3, 3], [2, 3], { value: '7', row: 2, col: 2, forward: false }],
    [[0, 4], [0, 5], { value: 'a', row: 0, col: 4, forward: true }],
    [[0, 5], [0, 4], { value: 'a', row: 0, col: 4, forward: false }],
    [[4, 0], [5, 0], { value: '9', row: 4, col: 0, forward: true }],
    [[5, 0], [4, 0], { value: '9', row: 4, col: 0, forward: false }],
    // edge diagonals: f runs from the top right of its cell to the bottom left, g from the top left to the bottom right
    [[2, 3], [3, 2], { value: 'f', row: 2, col: 2, forward: true }],
    [[3, 2], [2, 3], { value: 'f', row: 2, col: 2, forward: false }],
    [[2, 2], [3, 3], { value: 'g', row: 2, col: 2, forward: true }],
    [[3, 3], [2, 2], { value: 'g', row: 2, col: 2, forward: false }]
  ]
  for (const [from, to, want] of cases) assert.deepEqual(lineSegment(rc(from), rc(to)), want, JSON.stringify([from, to]))
  assert.equal(lineSegment(rc([2.5, 2.5]), rc([2.5, 4.5])), null, 'a step of two is not a segment')
  assert.deepEqual(LINE_VALUES, ['1', '2', '7', '8', '9', 'a', 'd', 'e', 'f', 'g'])
})

const cellAt = (row, col) => ({ row, col })
const pt = (r, c) => ({ r, c })

test('splitLineActs gives a drag that runs one way a single action whose pen value carries the pen\'s character', () => {
  const cells = [cellAt(2, 2), cellAt(2, 3)]
  const acts = [{ type: 'select', arg: cells }, { type: 'pen', arg: '1' }]
  const out = splitLineActs(acts, [pt(2.5, 2.5), pt(2.5, 3.5), pt(2.5, 4.5)], 'j')
  assert.deepEqual(out, [{ type: 'select', arg: cells }, { type: 'pen', arg: '1j' }])
  const back = splitLineActs(acts, [pt(2.5, 4.5), pt(2.5, 3.5), pt(2.5, 2.5)], 'j')
  assert.deepEqual(back, [{ type: 'select', arg: cells }, { type: 'pen', arg: '1k' }])
})

test('splitLineActs splits one value that was dragged both ways into two actions, in the same group, each with its own character', () => {
  // right along row 2, down, then left along row 3: SudokuPad queues the four '1' cells as one action
  const acts = [
    { type: 'select', arg: [cellAt(2, 2), cellAt(2, 3), cellAt(3, 3), cellAt(3, 2)] }, { type: 'pen', arg: '1' }, { type: 'deselect' },
    { type: 'select', arg: [cellAt(2, 4)] }, { type: 'pen', arg: '2' }
  ]
  const path = [pt(2.5, 2.5), pt(2.5, 3.5), pt(2.5, 4.5), pt(3.5, 4.5), pt(3.5, 3.5), pt(3.5, 2.5)]
  assert.deepEqual(splitLineActs(acts, path, 'l'), [
    { type: 'select', arg: [cellAt(2, 2), cellAt(2, 3)] }, { type: 'pen', arg: '1l' }, { type: 'deselect' },
    { type: 'select', arg: [cellAt(3, 3), cellAt(3, 2)] }, { type: 'pen', arg: '1m' }, { type: 'deselect' },
    { type: 'select', arg: [cellAt(2, 4)] }, { type: 'pen', arg: '2l' }
  ])
})

test('splitLineActs leaves actions that are not line values alone, and refuses a cell no segment of the drag draws', () => {
  const mark = [{ type: 'select', arg: [cellAt(1, 1)] }, { type: 'pen', arg: '5' }, { type: 'deselect' }]
  assert.deepEqual(splitLineActs(mark, [], 'j'), mark)
  assert.throws(() => splitLineActs([{ type: 'select', arg: [cellAt(7, 7)] }, { type: 'pen', arg: '1' }], [pt(2.5, 2.5), pt(2.5, 3.5)], 'j'), RangeError)
})

// Arrow line geometry (`arrowLine` in the code). A page 3 line is a line as wide as a page 1 line and a run of arrows along it.
const arrowLineAt = (value, forward, row, col, thickness, spacing = ARROW_SPACING.fallback) => arrowLine(value, forward, row, col, thickness, spacing)
const numbersOf = (d) => d.match(/-?\d+(?:\.\d+)?/g).map(Number)
const pointsOf = (d) => { const n = numbersOf(d); const out = []; for (let i = 0; i < n.length; i += 2) out.push([n[i], n[i + 1]]); return out }

test('an arrow line draws the line along the whole segment and the arrows as closed triangles of three points: base corner, tip, base corner', () => {
  const { line, arrows } = arrowLineAt('1', true, 2, 3, 5)
  // the cell at row 2, col 3 is at x 192, y 128; the center line runs right from its middle
  assert.deepEqual(pointsOf(line), [[224, 160], [288, 160]])
  const points = pointsOf(arrows)
  assert.equal(points.length % 3, 0)
  assert.equal(arrows.split('Z').length - 1, points.length / 3, 'every arrow is a closed triangle')
  for (let i = 0; i < points.length; i += 3) {
    const [wing, tip, other] = points.slice(i, i + 3)
    assert.equal(tip[0] > wing[0] && tip[0] > other[0], true, `the tip points the way the line was dragged (right): wing ${wing}, tip ${tip}, wing ${other}`)
    assert.equal(Math.abs(wing[1] - tip[1] - (tip[1] - other[1])) < 0.011, true, 'the wings are either side of the line, to the 2 places the path text keeps')
    assert.equal(tip[1], 160)
  }
})

test('an arrow line dragged the other way has its arrows pointing back and the same line', () => {
  const forward = arrowLineAt('1', true, 0, 0, 5)
  const back = arrowLineAt('1', false, 0, 0, 5)
  assert.deepEqual(pointsOf(back.line).slice().reverse(), pointsOf(forward.line))
  const [wing, tip] = pointsOf(back.arrows)
  assert.equal(tip[0] < wing[0], true, `dragged left, the tip is left of the wings: wing ${wing}, tip ${tip}`)
})

test('arrows point along a diagonal and along a vertical line as well', () => {
  const [wing, tip, other] = pointsOf(arrowLineAt('e', true, 0, 0, 5).arrows).slice(0, 3)
  // down and right: the tip is the furthest of the three along (1, 1)
  const along = ([x, y]) => x + y
  assert.equal(along(tip) > along(wing) && along(tip) > along(other), true, `down and right, the tip is furthest along (1, 1): ${wing} ${tip} ${other}`)
  const [w2, t2] = pointsOf(arrowLineAt('2', false, 0, 0, 5).arrows)
  assert.equal(t2[1] < w2[1], true, `dragged up, the tip is above the wings: wing ${w2}, tip ${t2}`)
})

test('the arrows are evenly spaced along the line, half a space in from each end, so two cells in a row read as one run', () => {
  // an arrow's middle is halfway between its base corners and its tip
  const middles = (d) => { const p = pointsOf(d); const out = []; for (let i = 0; i < p.length; i += 3) out.push((p[i][0] + p[i + 1][0]) / 2); return out }
  for (const thickness of [1, 5, 12, 16]) {
    const xs = middles(arrowLineAt('1', true, 0, 0, thickness).arrows)
    const space = 64 / xs.length
    xs.forEach((x, i) => assert.equal(Math.abs(x - (32 + (i + 0.5) * space)) < 0.01, true, `arrow ${i} of ${xs.length} at thickness ${thickness}: ${x}`))
  }
})

test('the arrows and the line scale with the thickness: larger arrows, a wider line, fewer arrows', () => {
  const thin = arrowLineAt('1', true, 0, 0, 2)
  const thick = arrowLineAt('1', true, 0, 0, 12)
  assert.equal(thick.lineWidth > thin.lineWidth, true, `line widths ${thin.lineWidth} at 2, ${thick.lineWidth} at 12`)
  assert.equal(arrowLineAt('1', true, 0, 0, 10).lineWidth / arrowLineAt('1', true, 0, 0, 5).lineWidth, 2, 'above the line\'s minimum it scales with the thickness')
  assert.equal(pointsOf(thin.arrows).length > pointsOf(thick.arrows).length, true, `${pointsOf(thin.arrows).length / 3} arrows at 2, ${pointsOf(thick.arrows).length / 3} at 12`)
  const span = (c) => { const ys = pointsOf(c.arrows).map((p) => p[1]); return Math.max(...ys) - Math.min(...ys) }
  assert.equal(span(thick) > span(thin), true, `spans ${span(thin)} at 2, ${span(thick)} at 12`)
})

test('the line under the arrows is as thick as a page 1 line at every slider value, and the arrows clearly stick out past it', () => {
  for (let t = THICKNESS.min; t <= THICKNESS.max; t++) {
    const shape = arrowLineAt('a', true, 0, 0, t)
    assert.equal(shape.lineWidth, t, `the line at thickness ${t}`)
    // 'a' is the top edge line, so a point's distance from y 0 is its distance from the line's middle.
    const reach = Math.max(...pointsOf(shape.arrows).map(([, y]) => Math.abs(y)))
    assert.equal(reach - t / 2 >= t / 2, true, `at thickness ${t} the arrows stick out ${reach - t / 2} past a line ${t} wide`)
  }
})

test('the arrow sizes are the ruled ones: halfWidth 2.125 and halfLength 1.4375 of the head scale, one spacing of 5', () => {
  assert.deepEqual([ARROW_LINE.halfWidth, 2 * ARROW_LINE.halfLength, ARROW_LINE.line, ARROW_SPACING.fallback], [2.125, 2.875, 1, 5])
})

test('an arrow\'s base reaches ARROW_LINE.halfWidth (2.125) times the head scale to each side and it is twice ARROW_LINE.halfLength (1.4375) times the scale long, the scale being 0.8 * 5 * (t / 5) ** 0.8', () => {
  // [thickness, head scale], worked from the ruling
  for (const [t, scale] of [[1, 1.1048], [5, 4], [8, 5.8261], [10, 6.9644], [16, 10.1387]]) {
    const points = pointsOf(arrowLineAt('a', true, 0, 0, t).arrows)
    const [first, tip] = points
    assert.equal(Math.abs(Math.max(...points.map(([, y]) => Math.abs(y))) - ARROW_LINE.halfWidth * scale) < 0.02, true, `reach at ${t}`)
    assert.equal(Math.abs(Math.abs(tip[0] - first[0]) - 2 * ARROW_LINE.halfLength * scale) < 0.02, true, `length at ${t}`)
  }
})

test('the arrow count on a cell side at the default spacing of 5 is the worked one: the distance between middles is 5 * 8 * (t / 5) ** 0.2, so 2 at 1 and 5 (29 and 40 apart), then 1', () => {
  const worked = { 1: 2, 5: 2, 8: 1, 10: 1, 13: 1, 16: 1 }
  for (const [t, count] of Object.entries(worked)) assert.equal(pointsOf(arrowLineAt('a', true, 0, 0, Number(t)).arrows).length / 3, count, `count at ${t}`)
})

test('an arrow is centered on its line, on a diagonal as on a straight line, at every thickness from 1 to 16: its two base corners mirror each other across the line', () => {
  for (const value of ['1', '2', 'a', 'e', 'd']) {
    for (let t = THICKNESS.min; t <= THICKNESS.max; t++) {
      const shape = arrowLineAt(value, true, 3, 3, t)
      const [[x0, y0], [x1, y1]] = pointsOf(shape.line)
      const length = Math.hypot(x1 - x0, y1 - y0)
      const [ux, uy] = [(x1 - x0) / length, (y1 - y0) / length]
      const points = pointsOf(shape.arrows)
      for (let i = 0; i < points.length; i += 3) {
        const [wing, tip, other] = points.slice(i, i + 3)
        // distance of a point from the line's axis (positive on one side), and how far along the line it is
        const across = ([x, y]) => (x - x0) * -uy + (y - y0) * ux
        const along = ([x, y]) => (x - x0) * ux + (y - y0) * uy
        assert.equal(Math.abs(across(tip)) < 0.02, true, `the tip is on the line: ${value} at ${t}`)
        assert.equal(Math.abs(across(wing) + across(other)) < 0.02, true, `the wings are on opposite sides at the same distance: ${value} at ${t}`)
        assert.equal(Math.abs(along(wing) - along(other)) < 0.02, true, `the wings are the same distance back: ${value} at ${t}`)
      }
    }
  }
})

test('an arrow line has at least one arrow on any segment at any thickness and any arrow spacing, so a run never has none', () => {
  for (const value of LINE_VALUES) {
    for (let t = THICKNESS.min; t <= THICKNESS.max; t++) {
      for (let spacing = ARROW_SPACING.min; spacing <= ARROW_SPACING.max; spacing++) {
        assert.equal(pointsOf(arrowLineAt(value, true, 4, 4, t, spacing).arrows).length >= 3, true, `at least one arrow: ${value} at thickness ${t}, spacing ${spacing}`)
      }
    }
  }
})

test('the outline setting is off only for a saved false: nothing saved and anything untrusted is on', () => {
  assert.equal(SETTINGS.outline.normalize(false), false)
  for (const ok of [true, undefined, null, 'false', 0, 1, {}, []]) assert.equal(SETTINGS.outline.normalize(ok), true, JSON.stringify(ok))
})

test('buildOutlineCss is empty when the outline is off and filters the pen layer and not the highlight, when on', () => {
  assert.equal(buildOutlineCss(false), '')
  assert.equal(buildOutlineCss(true), `:root:root #cell-pen, :root:root .pen-tool-extras-faded-group { filter: url(#${OUTLINE_FILTER_ID}); }`)
  assert.doesNotMatch(buildOutlineCss(true), /penhint|pen-tool-extras-hint/)
})

test('buildFeedbackCss hides the erase\'s strokes (their copies, in one group, show the fade), and outranks the layer\'s opacity-1 rule', () => {
  const rules = buildFeedbackCss(3).split('\n')
  assert.equal(rules[0], ':root:root .cell-pen.pen-tool-extras-faded { opacity: 0; }')
})

test('buildFeedbackCss dashes the hint of the page 2 pens only, for the hint\'s width of 16: 3 widths is 32 on, 32 off, half a dash in; 0 is dots', () => {
  const dashed = (dash) => buildFeedbackCss(dash).split('\n').filter((rule) => rule.startsWith(':root:root .penhint:is'))
  assert.deepEqual(dashed(3), [':root:root .penhint:is(.pencolor-a, .pencolor-b, .pencolor-c, .pencolor-d, .pencolor-e, .pencolor-f, .pencolor-g, .pencolor-h, .pencolor-i) { stroke-dasharray: 32 32; stroke-dashoffset: 16; }'])
  assert.match(dashed(0)[0], /\{ stroke-dasharray: 0 31\.9968; \}$/)
})

test('buildFeedbackCss fills the arrowheads beside an arrow pen\'s hint in that pen\'s color, one rule for each of the nine, solid (the hint layer carries the 0.6)', () => {
  const heads = buildFeedbackCss(3).split('\n').filter((rule) => rule.includes('hint-arrows'))
  assert.equal(heads.length, 9)
  assert.equal(heads[0], ':root:root .pen-tool-extras-hint-arrows.pencolor-j { fill: var(--puzzle-pencolor-1); stroke: none; }')
  assert.equal(heads[8], ':root:root .pen-tool-extras-hint-arrows.pencolor-z { fill: var(--puzzle-pencolor-9); stroke: none; }')
})

test('buildFeedbackCss fades the hint layer as one picture: 0.6 on the layer, the drag hint and its arrowheads solid, the erase hint at the 0.5 it has today', () => {
  const rules = buildFeedbackCss(3).split('\n').filter((rule) => rule.startsWith(':root:root #pen-tool-extras-hint'))
  assert.deepEqual(rules, [
    ':root:root #pen-tool-extras-hint { opacity: 0.6; }',
    ':root:root #pen-tool-extras-hint .penhint { opacity: 1; }',
    ':root:root #pen-tool-extras-hint .penhint.pencolor-erase { opacity: calc(0.5 / 0.6); }'
  ])
})

test('the outline filter grows the layer\'s combined shape by the default width with a square growth then a blur and a cut (round corners), fills it white and draws the layer over it', () => {
  const svg = renderOutlineFilter(OUTLINE_WIDTH.fallback)
  assert.match(svg, new RegExp(`<filter id="${OUTLINE_FILTER_ID}"`))
  const square = /<feMorphology in="SourceAlpha" operator="dilate" radius="([\d.]+)" result="squared"\/>/.exec(svg)
  assert.ok(square, 'the layer\'s alpha is first grown square, so a thin shape survives the blur')
  const blur = /<feGaussianBlur in="squared" stdDeviation="([\d.]+)"/.exec(svg)
  assert.ok(blur, 'the grown alpha is then blurred')
  assert.equal(Math.abs(Number(square[1]) + Number(blur[1]) * 1.645 - OUTLINE_WIDTH.fallback) < 0.01, true, `a square growth of ${square[1]} and a blur of ${blur[1]} reach ${OUTLINE_WIDTH.fallback} units out at the cut`)
  assert.match(svg, /<feComponentTransfer in="blurred" result="grown"><feFuncA type="linear" slope="16" intercept="-0\.3"\/>/)
  assert.match(svg, /<feFlood flood-color="#ffffff" result="white"\/><feComposite in="white" in2="grown" operator="in" result="halo"\/>/, 'the white is kept where the grown shape is')
  assert.match(svg, /<feMerge><feMergeNode in="halo"\/><feMergeNode in="SourceGraphic"\/><\/feMerge>/, 'the layer is merged over the white')
})

test('the outline width setting keeps a saved whole number from 1 to 8 and reads anything else, nothing saved included, as 2', () => {
  assert.deepEqual(OUTLINE_WIDTH, { min: 1, max: 8, step: 1, fallback: 2 })
  for (const ok of [1, 3, 8]) assert.equal(SETTINGS.outlineWidth.normalize(ok), ok)
  for (const bad of [undefined, null, 0, 9, 2.5, '4', true, {}, []]) assert.equal(SETTINGS.outlineWidth.normalize(bad), 2, JSON.stringify(bad))
})

test('the outline filter grows and blurs more for a wider outline', () => {
  const blurOf = (width) => Number(/stdDeviation="([\d.]+)"/.exec(renderOutlineFilter(width))[1])
  const squareOf = (width) => Number(/radius="([\d.]+)"/.exec(renderOutlineFilter(width))[1])
  assert.equal(blurOf(1) < blurOf(3) && blurOf(3) < blurOf(8), true, `${blurOf(1)}, ${blurOf(3)}, ${blurOf(8)}`)
  assert.equal(squareOf(1) < squareOf(3) && squareOf(3) < squareOf(8), true, `${squareOf(1)}, ${squareOf(3)}, ${squareOf(8)}`)
})

test('arrow spacing runs 3 to 12 in whole steps and starts at 5, and the arrow spacing setting keeps a saved whole number in range', () => {
  assert.deepEqual(ARROW_SPACING, { min: 3, max: 12, step: 1, fallback: 5 })
  for (const ok of [3, 5, 12]) assert.equal(SETTINGS.arrowSpacing.normalize(ok), ok)
  for (const bad of [undefined, null, 2, 13, 4.5, '6', true, {}, []]) assert.equal(SETTINGS.arrowSpacing.normalize(bad), 5, JSON.stringify(bad))
})

test('right click erase is on unless saved as the boolean false', () => {
  assert.equal(SETTINGS.eraseClicks.normalize(false), false)
  for (const ok of [true, undefined, null, 0, 'false', {}, []]) assert.equal(SETTINGS.eraseClicks.normalize(ok), true, JSON.stringify(ok))
})

test('both line styles are enabled unless saved as the boolean false, each on its own; saved junk enables both', () => {
  assert.deepEqual(SETTINGS.lineStyles.normalize(undefined), { dashed: true, arrows: true })
  assert.deepEqual(SETTINGS.lineStyles.normalize({ dashed: false }), { dashed: false, arrows: true })
  assert.deepEqual(SETTINGS.lineStyles.normalize({ arrows: false }), { dashed: true, arrows: false })
  assert.deepEqual(SETTINGS.lineStyles.normalize({ dashed: false, arrows: false }), { dashed: false, arrows: false })
  for (const bad of [null, 0, 'no', [false, false], { dashed: 0, arrows: 'no' }]) assert.deepEqual(SETTINGS.lineStyles.normalize(bad), { dashed: true, arrows: true }, JSON.stringify(bad))
})

test('a wider arrow spacing gives fewer arrows on the same segment', () => {
  const count = (spacing) => pointsOf(arrowLineAt('1', true, 0, 0, 5, spacing).arrows).length / 3
  assert.deepEqual([count(3), count(5), count(12)], [3, 2, 1])
})

test('the pages in the rotation are page 1 always, page 2 with dashed lines enabled and page 3 with arrow lines enabled', () => {
  assert.deepEqual(enabledPages({ dashed: true, arrows: true }), [0, 1, 2])
  assert.deepEqual(enabledPages({ dashed: false, arrows: true }), [0, 2])
  assert.deepEqual(enabledPages({ dashed: true, arrows: false }), [0, 1])
  assert.deepEqual(enabledPages({ dashed: false, arrows: false }), [0])
})

test('a page turn skips a page that is not enabled, in either direction, and stays on page 1 when it is the only one', () => {
  const noDash = { dashed: false, arrows: true }
  assert.equal(stepEnabledPage(0, 1, noDash), 2)
  assert.equal(stepEnabledPage(2, 1, noDash), 0)
  assert.equal(stepEnabledPage(0, -1, noDash), 2)
  assert.equal(stepEnabledPage(2, -1, noDash), 0)
  assert.equal(stepEnabledPage(0, 1, { dashed: false, arrows: false }), 0)
  assert.equal(stepEnabledPage(1, 1, noDash), 2)
  assert.equal(stepEnabledPage(1, -1, noDash), 0)
})

test('after Save a selected pen on a page that is not enabled moves to the same number on page 1, and any other pen stays', () => {
  assert.equal(pageAfterSave('b', { dashed: false, arrows: true }), '2')
  assert.equal(pageAfterSave('k', { dashed: true, arrows: false }), 'k', 'k is a reverse character and no pen, so it stays')
  assert.equal(pageAfterSave('l', { dashed: true, arrows: false }), '2')
  assert.equal(pageAfterSave('b', { dashed: true, arrows: false }), 'b')
  assert.equal(pageAfterSave('r', { dashed: false, arrows: false }), '5')
  assert.equal(pageAfterSave('3', { dashed: false, arrows: false }), '3')
})

const seg = (value, row, col, color = '1') => ({ value, row, col, color })

test('linePoints gives the two grid points of every line value, in cell units from the grid top left', () => {
  const want = {
    1: [[2.5, 3.5], [2.5, 4.5]],
    2: [[2.5, 3.5], [3.5, 3.5]],
    7: [[2, 4], [3, 4]],
    8: [[3, 3], [3, 4]],
    9: [[2, 3], [3, 3]],
    a: [[2, 3], [2, 4]],
    d: [[2.5, 3.5], [1.5, 4.5]],
    e: [[2.5, 3.5], [3.5, 4.5]],
    f: [[2, 4], [3, 3]],
    g: [[2, 3], [3, 4]]
  }
  assert.deepEqual(Object.keys(want).sort(), [...LINE_VALUES].sort())
  for (const [value, points] of Object.entries(want)) assert.deepEqual(linePoints(value, 2, 3), points, value)
})

test('the right edge of one cell and the left edge of the next are the same two points', () => {
  assert.deepEqual(linePoints('7', 4, 4), linePoints('9', 4, 5))
  assert.deepEqual(linePoints('8', 4, 4), linePoints('a', 5, 4))
})

test('lineIdentityOf makes both direction characters of an arrow pen one pen, and keeps other pens apart', () => {
  assert.equal(lineIdentityOf('k'), lineIdentityOf('j'))
  assert.equal(lineIdentityOf('0'), lineIdentityOf('z'))
  assert.notEqual(lineIdentityOf('j'), lineIdentityOf('l'))
  assert.notEqual(lineIdentityOf('1'), lineIdentityOf('a'), 'a page 2 pen is not the page 1 pen of its color')
  assert.equal(lineIdentityOf('3'), '3')
})

test('segmentNear picks the segment closest to a point, and none beyond the hit radius', () => {
  const across = seg('1', 0, 0)
  const below = seg('1', 1, 0)
  assert.equal(segmentNear([0.5, 1.0], [across, below], LINE_HIT_RADIUS), across)
  assert.equal(segmentNear([1.5, 0.9], [across, below], LINE_HIT_RADIUS), below)
  assert.equal(segmentNear([0.5 + LINE_HIT_RADIUS * 0.9, 1.0], [across], LINE_HIT_RADIUS), across)
  assert.equal(segmentNear([0.5 + LINE_HIT_RADIUS * 1.5, 0.5], [across], LINE_HIT_RADIUS), null)
  assert.equal(segmentNear([0.5, 2.5], [across], LINE_HIT_RADIUS), null, 'past the segment end')
  assert.equal(segmentNear([0.5, 1.0], [], LINE_HIT_RADIUS), null)
})

test('segmentNear picks the nearer of two segments both within reach, whichever comes first in the list', () => {
  // The center line 1 of cell (0,0) runs along row 0.5, the center line 2 down column 0.5; both are within the radius of this point.
  const along = seg('1', 0, 0)
  const down = seg('2', 0, 0)
  assert.equal(segmentNear([0.55, 0.58], [down, along], LINE_HIT_RADIUS), along)
  assert.equal(segmentNear([0.55, 0.58], [along, down], LINE_HIT_RADIUS), along)
  assert.equal(segmentNear([0.58, 0.55], [along, down], LINE_HIT_RADIUS), down)
  assert.equal(segmentNear([0.58, 0.55], [down, along], LINE_HIT_RADIUS), down)
})

test('connectedLine follows shared points through a bend and a branch', () => {
  // Row 0: 1 at col 0, 1 at col 1 (a straight run), a branch down from col 1's end, an unrelated far segment.
  const a = seg('1', 0, 0)
  const b = seg('1', 0, 1)
  const down = seg('2', 0, 2)
  const branch = seg('1', 1, 2)
  const far = seg('1', 5, 5)
  const all = [far, branch, down, b, a]
  assert.deepEqual(new Set(connectedLine(all, a)), new Set([a, b, down, branch]))
  assert.deepEqual(connectedLine(all, far), [far])
})

test('connectedLine joins an edge line stored on two cells and a diagonal through a cell middle', () => {
  const right = seg('7', 0, 0)
  const nextTop = seg('a', 1, 0)
  // 7 of (0,0) runs (0,1)-(1,1); a of (1,0) runs (1,0)-(1,1): they meet at (1,1).
  assert.deepEqual(new Set(connectedLine([right, nextTop], right)), new Set([right, nextTop]))
  const centre = seg('1', 0, 0)
  const diagonal = seg('e', 0, 1)
  // 1 of (0,0) ends at the middle of (0,1); e of (0,1) starts there.
  assert.deepEqual(new Set(connectedLine([centre, diagonal], centre)), new Set([centre, diagonal]))
})

test('connectedLine stops at a segment of another pen, and a crossing of the same pen is connected', () => {
  const a = seg('1', 0, 0, '1')
  const other = seg('1', 0, 1, '2')
  const beyond = seg('1', 0, 2, '1')
  assert.deepEqual(connectedLine([a, other, beyond], a), [a])
  const same = seg('1', 0, 1, '1')
  assert.deepEqual(new Set(connectedLine([a, same, beyond], a)), new Set([a, same, beyond]))
})

test('connectedLine counts both direction characters of an arrow pen as one pen', () => {
  const forward = seg('1', 0, 0, 'j')
  const backward = seg('1', 0, 1, 'k')
  assert.deepEqual(new Set(connectedLine([forward, backward], forward)), new Set([forward, backward]))
  const otherPen = seg('1', 0, 2, 'l')
  assert.deepEqual(new Set(connectedLine([forward, backward, otherPen], forward)), new Set([forward, backward]))
})

test('connectedLine does not join lines that only cross, sharing no end point', () => {
  // The center line 1 and the edge line 7 of the same cell cross at (0.5, 1), each one's midpoint, and share no end point.
  const centre = seg('1', 0, 0)
  const edge = seg('7', 0, 0)
  assert.deepEqual(connectedLine([centre, edge], centre), [centre])
})

test('eraseActs removes each value from its own cells as one select and one bare pen action per value', () => {
  const cellAt = (row, col) => ({ row, col })
  const acts = eraseActs([seg('1', 0, 0, 'j'), seg('2', 0, 1), seg('1', 0, 2, 'k')], [], cellAt)
  assert.deepEqual(acts, [
    { type: 'select', arg: [{ row: 0, col: 0 }, { row: 0, col: 2 }] },
    { type: 'pen', arg: '1' },
    { type: 'deselect' },
    { type: 'select', arg: [{ row: 0, col: 1 }] },
    { type: 'pen', arg: '2' }
  ])
  assert.deepEqual(eraseActs([], [], cellAt), [])
})

test('eraseActs removes a cell\'s marks after the lines, each cell in its own group', () => {
  const cellAt = (row, col) => ({ row, col })
  const [one, two] = [{ row: 1, col: 1 }, { row: 2, col: 2 }]
  assert.deepEqual(eraseActs([seg('1', 0, 0)], [{ cell: one, values: ['3', 'u'] }, { cell: two, values: ['j'] }], cellAt), [
    { type: 'select', arg: [{ row: 0, col: 0 }] },
    { type: 'pen', arg: '1' },
    { type: 'deselect' },
    { type: 'select', arg: [one] },
    { type: 'pen', arg: '3' },
    { type: 'pen', arg: 'u' },
    { type: 'deselect' },
    { type: 'select', arg: [two] },
    { type: 'pen', arg: 'j' }
  ])
  assert.deepEqual(eraseActs([], [{ cell: one, values: ['3'] }], cellAt), [{ type: 'select', arg: [one] }, { type: 'pen', arg: '3' }])
})

test('every settings table row with a section is drawn in the dialog, so a section whose rows went astray fails here', () => {
  const html = renderEditor(editorState())
  for (const [name, row] of Object.entries(SETTINGS)) {
    if (!row.dialog.section) continue
    assert.ok(html.includes(row.range ? `data-row="${name}"` : `data-box="${name}`), name)
  }
})

test('the dialog shows one plain line naming the steps that are skipped, and nothing when none is', () => {
  assert.doesNotMatch(renderEditor(editorState({ off: [] })), /Off because/)
  assert.match(renderEditor(editorState({ off: ['arrow lines'] })), />Off because SudokuPad changed: arrow lines<\/div>/)
  assert.match(renderEditor(editorState({ off: ['marks', 'line erase'] })), />Off because SudokuPad changed: marks, line erase<\/div>/)
})

test('inRange takes a whole number from min to max on the steps counted from min, and nothing else', () => {
  const range = { min: 20, max: 100, step: 5, fallback: 80 }
  for (const ok of [20, 25, 80, 100]) assert.equal(inRange(ok, range), true, String(ok))
  for (const bad of [15, 105, 22, 20.5, '20', null, undefined, NaN, true, [20]]) assert.equal(inRange(bad, range), false, String(bad))
})

test('isPlainObject takes an object and no array, null or scalar', () => {
  assert.equal(isPlainObject({}), true)
  assert.equal(isPlainObject({ a: 1 }), true)
  for (const bad of [null, undefined, [], [1], 'x', 1, true]) assert.equal(isPlainObject(bad), false, JSON.stringify(bad))
})

test('isHexColor takes #rrggbb in either case and nothing else', () => {
  for (const ok of ['#000000', '#a1B2c3']) assert.equal(isHexColor(ok), true, ok)
  for (const bad of ['#fff', '#12345g', '123456', ' #123456', '#1234567', null, undefined, 123456, ['#123456']]) assert.equal(isHexColor(bad), false, JSON.stringify(bad))
})

test('the table holds each setting\'s saved key and default', () => {
  const rows = Object.fromEntries(Object.entries(SETTINGS).map(([name, row]) => [name, [row.key, row.fallback]]))
  assert.deepEqual(rows, {
    thickness: ['PenColor_thickness', 5],
    opacity: ['PenColor_opacity', 80],
    dash: ['PenColor_dash', 3],
    arrowSpacing: ['PenColor_arrowspacing', 5],
    outlineWidth: ['PenColor_outlinewidth', 2],
    outline: ['PenColor_outline', true],
    eraseClicks: ['PenColor_middleerase', true],
    lineStyles: ['PenColor_linestyles', { dashed: true, arrows: true }],
    show: ['PenColor_sliders', { thickness: true, opacity: true }],
    marks: ['EdgeMarks_marks', ALL]
  })
})

test('the marks a save writes read back the same, and so do marks saved under the old circle names', () => {
  const unticked = { ...ALL, circle: false, cornerCircle: false }
  const store = fakeStore()
  const current = settingDefaults()
  saveChangedSettings(store, { ...current, marks: unticked }, current)
  assert.deepEqual(readSettings(store).marks, unticked)
  const oldSave = fakeStore({ EdgeMarks_marks: { x: true, directions: true, dot: false, cornerX: true, cornerDot: false } })
  assert.deepEqual(readSettings(oldSave).marks, unticked)
})

test('saving one mark unticked writes the key, and saving every box ticked removes it so the next read is all ticked', () => {
  const store = fakeStore()
  const current = settingDefaults()
  assert.deepEqual(saveChangedSettings(store, { ...current, marks: { ...ALL, directions: false } }, current), ['marks'])
  assert.deepEqual(store.data, { EdgeMarks_marks: { ...ALL, directions: false } })
  assert.deepEqual(saveChangedSettings(store, { ...current, marks: ALL }, current), ['marks'])
  assert.deepEqual(store.data, {})
  assert.deepEqual(readSettings(store).marks, ALL)
})

test('a slider row built from a range normalizes and saves by that range alone', () => {
  const row = slider('New_key', { min: 2, max: 10, step: 2, fallback: 4 }, () => {})
  assert.equal(row.normalize(6), 6)
  for (const bad of [0, 12, 5, '6', null, {}]) assert.equal(row.normalize(bad), 4, JSON.stringify(bad))
  const calls = []
  const store = { setData: (key, value) => calls.push(['set', key, value]), removeData: (key) => calls.push(['remove', key]) }
  saveSetting(store, row, 6)
  saveSetting(store, row, 4)
  assert.deepEqual(calls, [['set', 'New_key', 6], ['remove', 'New_key']])
})

test('a row built with no effect has one that does nothing', () => {
  assert.equal(flag('Flag_key').effect(), undefined)
  assert.equal(SETTINGS.eraseClicks.effect(), undefined)
})

test('saving what changed updates the values in force and names what changed', () => {
  const saved = {}
  const store = { setData: (key, value) => { saved[key] = value }, removeData: (key) => { delete saved[key] } }
  const current = settingDefaults()
  assert.deepEqual(saveChangedSettings(store, { ...current, thickness: 9, opacity: 55 }, current), ['thickness', 'opacity'])
  assert.deepEqual([current.thickness, current.opacity], [9, 55])
  assert.deepEqual(saved, { [SETTINGS.thickness.key]: 9, [SETTINGS.opacity.key]: 55 })
})

test('a failed write leaves the values in force alone, so a retry saves every change again', () => {
  const saved = {}
  let failing = true
  const store = {
    setData: (key, value) => {
      if (failing && key === SETTINGS.opacity.key) throw new Error('quota')
      saved[key] = value
    },
    removeData: (key) => { delete saved[key] }
  }
  const current = settingDefaults()
  const draft = { ...current, thickness: 9, opacity: 55 }
  assert.throws(() => saveChangedSettings(store, draft, current), /quota/)
  assert.deepEqual(current, settingDefaults())
  failing = false
  assert.deepEqual(saveChangedSettings(store, draft, current), ['thickness', 'opacity'])
})

test('an effect two rows share runs once', () => {
  assert.equal(SETTINGS.outline.effect, SETTINGS.outlineWidth.effect)
  assert.deepEqual(effectsOf(['outline', 'outlineWidth', 'thickness']), [SETTINGS.outline.effect, SETTINGS.thickness.effect])
})

test('flags decode each name on its own: only a saved false is off, a non-object is all on, an unknown name is dropped', () => {
  const row = flags('Flags_key', ['a', 'b'])
  assert.deepEqual(row.fallback, { a: true, b: true })
  assert.deepEqual(row.normalize({ a: false }), { a: false, b: true })
  assert.deepEqual(row.normalize({ a: 0, b: false, c: false }), { a: true, b: false })
  for (const bad of [null, undefined, 'x', 1, [false, false]]) assert.deepEqual(row.normalize(bad), { a: true, b: true }, JSON.stringify(bad))
})

test('readSettings normalizes what is saved under each key and falls back for the rest', () => {
  const saved = { PenColor_thickness: 9, PenColor_opacity: 57, PenColor_outline: false, PenColor_sliders: { opacity: false } }
  const read = readSettings(fakeStore(saved))
  assert.deepEqual(read, {
    ...settingDefaults(),
    thickness: 9,
    outline: false,
    show: { thickness: true, opacity: false }
  })
})

test('settingDefaults holds every row\'s default', () => {
  assert.deepEqual(settingDefaults(), { thickness: 5, opacity: 80, dash: 3, arrowSpacing: 5, outlineWidth: 2, outline: true, eraseClicks: true, lineStyles: { dashed: true, arrows: true }, show: { thickness: true, opacity: true }, marks: ALL })
})

test('changedSettings names only the settings whose value differs, reading flags by value', () => {
  const now = settingDefaults()
  assert.deepEqual(changedSettings({ ...now }, now), [])
  assert.deepEqual(changedSettings({ ...now, lineStyles: { dashed: true, arrows: true } }, now), [])
  assert.deepEqual(changedSettings({ ...now, thickness: 9, lineStyles: { dashed: true, arrows: false } }, now), ['thickness', 'lineStyles'])
  assert.deepEqual(changedSettings({ ...now, show: { thickness: false, opacity: true }, outline: false }, now), ['outline', 'show'])
})

test('saveSetting removes the key of a value at its default and sets any other', () => {
  const calls = []
  const store = {
    setData: (key, value) => calls.push(['set', key, value]),
    removeData: (key) => calls.push(['remove', key])
  }
  saveSetting(store, SETTINGS.thickness, 5)
  saveSetting(store, SETTINGS.thickness, 9)
  saveSetting(store, SETTINGS.outline, true)
  saveSetting(store, SETTINGS.outline, false)
  saveSetting(store, SETTINGS.lineStyles, { dashed: true, arrows: true })
  saveSetting(store, SETTINGS.lineStyles, { dashed: false, arrows: true })
  assert.deepEqual(calls, [
    ['remove', 'PenColor_thickness'],
    ['set', 'PenColor_thickness', 9],
    ['remove', 'PenColor_outline'],
    ['set', 'PenColor_outline', false],
    ['remove', 'PenColor_linestyles'],
    ['set', 'PenColor_linestyles', { dashed: false, arrows: true }]
  ])
})

// The helpers a click and a redraw share, tested without SudokuPad.
test('edgeMidpoint puts each edge value on the right side of the cell', () => {
  assert.deepEqual(edgeMidpoint('3', 2, 4), [2.5, 5])
  assert.deepEqual(edgeMidpoint('4', 2, 4), [3, 4.5])
  assert.deepEqual(edgeMidpoint('b', 2, 4), [2.5, 4])
  assert.deepEqual(edgeMidpoint('c', 2, 4), [2, 4.5])
})

test('isEdgeActs accepts a select then an edge pen action, and nothing else', () => {
  const select = { type: 'select', arg: [] }
  const pen = (arg) => ({ type: 'pen', arg })
  assert.equal(isEdgeActs([select, pen('3')]), true)
  assert.equal(isEdgeActs(null), false)
  assert.equal(isEdgeActs([select]), false)
  assert.equal(isEdgeActs([select, pen('3'), pen('4')]), false)
  assert.equal(isEdgeActs([{ type: 'deselect' }, pen('3')]), false)
  assert.equal(isEdgeActs([select, pen('1')]), false)
  assert.equal(isEdgeActs([select, { type: 'select', arg: '3' }]), false)
})

test('arrowLineOf reads the way of an arrow line, and is null for anything else', () => {
  const line = LINE_VALUES[0]
  const way = arrowLineOf({ value: line, className: `cell-pen pen-1 pencolor-${PEN_PAGES[2].chars[0]}` })
  assert.equal(way, arrowLineWayOf(PEN_PAGES[2].chars[0]))
  assert.equal(typeof way, 'boolean')
  assert.equal(arrowLineOf({ value: '3', className: `cell-pen pencolor-${PEN_PAGES[2].chars[0]}` }), null)
  assert.equal(arrowLineOf({ value: line, className: 'cell-pen pen-1' }), null)
  assert.equal(arrowLineOf({ value: line }), null)
})

test('addedMark draws an edge mark at its edge, a corner x as x and the other corner type as the circle, and a stock value as null', () => {
  assert.equal(addedMark('1', 0, 0, 9), null)
  assert.deepEqual(addedMark('h', 3, 4, 9), { point: edgeMidpoint('3', 3, 4), shape: '>' })
  assert.deepEqual(addedMark('t', 3, 4, 9), { point: cornerPoint('tl', 3, 4, 9), shape: 'x' })
  assert.deepEqual(addedMark('w', 3, 4, 9), { point: cornerPoint('tl', 3, 4, 9), shape: 'o' })
  // The far corner's two cells sit on different corners, told apart by the grid's width.
  assert.deepEqual(addedMark('v', 0, 8, 9), { point: [0, 9], shape: 'x' })
  assert.deepEqual(addedMark('v', 0, 8, 12), { point: [1, 8], shape: 'x' })
})

test('penValuesOf lists the values of a cell without their colors, and none for a cell with no pen', () => {
  assert.deepEqual(penValuesOf({ pen: ['3a', '4b'] }), ['3', '4'])
  assert.deepEqual(penValuesOf({}), [])
})

test('planActs selects the cell, toggles off what the plan removes, then toggles on what it adds', () => {
  const cell = { row: 1, col: 2 }
  assert.deepEqual(planActs(cell, { remove: ['3', '4'], add: 'c' }), [
    { type: 'select', arg: [cell] }, { type: 'pen', arg: '3' }, { type: 'pen', arg: '4' }, { type: 'pen', arg: 'c' }
  ])
  assert.deepEqual(planActs(cell, { remove: [], add: null }), [{ type: 'select', arg: [cell] }])
})

test('lineSegmentsOf lists the line values of every cell with their color, and leaves marks out', () => {
  const line = LINE_VALUES[0]
  const mark = MARK_VALUES[0]
  const cells = [{ row: 1, col: 2, pen: [`${line}x`, `${mark}y`] }, { row: 0, col: 0 }]
  assert.deepEqual(lineSegmentsOf(cells), [{ value: line, row: 1, col: 2, color: 'x' }])
})

// The requirement table: which SudokuPad internal each feature (an install step, the saved settings, the settings dialog) cannot work without.
const FRAMEWORK_FNS = ['getApp', 'getData', 'setData', 'removeData', 'addSetting', 'showDialog', 'closeDialog']
const TOOL_FNS = ['actStart', 'actAdd', 'actSend', 'clickCell', 'getInputRc', 'setSelectedColor', 'handleToolEnter', 'handleToolExit', 'drawLineHint']
const completeSudokuPad = () => {
  class Renderer {
    static CellSize = 64
    static rcToPathData () {}
    renderPen () {}
  }
  const renderer = new Renderer()
  renderer.renderPart = () => {}
  const tool = { _actList: [] }
  TOOL_FNS.forEach((name) => { tool[name] = () => {} })
  const app = {
    tools: { colour: {} },
    svgRenderer: renderer,
    grid: { rows: 9, cols: 9, getCell: () => {} },
    puzzle: { cells: [] },
    xyToRCExact: () => {}
  }
  const framework = { app }
  for (const name of FRAMEWORK_FNS) framework[name] = () => {}
  return { Framework: framework, ToolPen: { tool } }
}

test('a complete SudokuPad lacks nothing', () => {
  assert.deepEqual(lackingInternals(FEATURES, completeSudokuPad()), new Map())
})

// Each internal removed alone, and the steps it holds back.
const LACKING_ALONE = [
  ...['actStart', 'actAdd', 'actSend', 'clickCell', '_actList'].map((name) => [`ToolPen.tool.${name}`, (s) => { delete s.ToolPen.tool[name] }, ['arrowLines', 'marks', 'lineErase']]),
  ['ToolPen.tool.getInputRc', (s) => { delete s.ToolPen.tool.getInputRc }, ['marks', 'lineErase']],
  ['ToolPen.tool.setSelectedColor', (s) => { delete s.ToolPen.tool.setSelectedColor }, ['pages']],
  ['ToolPen.tool.handleToolEnter', (s) => { delete s.ToolPen.tool.handleToolEnter }, ['pages']],
  ['ToolPen.tool.handleToolExit', (s) => { delete s.ToolPen.tool.handleToolExit }, ['pages']],
  ['ToolPen.tool.drawLineHint', (s) => { delete s.ToolPen.tool.drawLineHint }, ['dragHint']],
  ['Framework.app.grid.getCell', (s) => { delete s.Framework.app.grid.getCell }, ['marks', 'lineErase']],
  ['Framework.app.puzzle.cells', (s) => { delete s.Framework.app.puzzle.cells }, ['arrowLines', 'marks', 'lineErase']],
  ['Framework.app.grid.rows', (s) => { s.Framework.app.grid.rows = '9' }, ['marks', 'lineErase']],
  ['Framework.app.grid.cols', (s) => { s.Framework.app.grid.cols = 9.5 }, ['marks', 'lineErase']],
  ['Framework.app.svgRenderer.constructor.CellSize', (s) => { delete s.Framework.app.svgRenderer.constructor.CellSize }, ['marks']],
  ['Framework.app.svgRenderer.constructor.rcToPathData', (s) => { delete s.Framework.app.svgRenderer.constructor.rcToPathData }, ['marks']],
  ['Framework.app.svgRenderer.renderPen', (s) => { delete Object.getPrototypeOf(s.Framework.app.svgRenderer).renderPen }, ['arrowLines', 'marks']],
  ['Framework.app.svgRenderer.renderPart', (s) => { delete s.Framework.app.svgRenderer.renderPart }, ['arrowLines']],
  ['Framework.app.xyToRCExact', (s) => { delete s.Framework.app.xyToRCExact }, ['marks', 'lineErase']],
  ['Framework.app.tools.colour', (s) => { delete s.Framework.app.tools.colour }, ['colors']],
  ['Framework.getApp', (s) => { delete s.Framework.getApp }, ['colors', 'pages', 'arrowLines', 'dragHint', 'marks', 'penPanel', 'lineErase']],
  ...['getData', 'removeData'].map((name) => [`Framework.${name}`, (s) => { delete s.Framework[name] }, ['saved']]),
  // The install save writes the colors with setData.
  ['Framework.setData', (s) => { delete s.Framework.setData }, ['saved', 'colorSave']],
  ...['addSetting', 'closeDialog'].map((name) => [`Framework.${name}`, (s) => { delete s.Framework[name] }, ['settings']]),
  // The dialog's overlay is SudokuPad's dialog's, so it goes with showDialog.
  ['Framework.showDialog', (s) => { delete s.Framework.showDialog }, ['settings', 'overlay']]
]
for (const [internal, remove, featureNames] of LACKING_ALONE) {
  test(`without ${internal}, exactly ${featureNames.join(', ')} are lacking`, () => {
    const roots = completeSudokuPad()
    remove(roots)
    assert.deepEqual(lackingInternals(FEATURES, roots), new Map([[internal, featureNames]]))
  })
}

test('every feature is lacking under some internal removed alone', () => {
  const own = Object.keys(FEATURES)
  assert.deepEqual([...new Set(LACKING_ALONE.flatMap(([, , names]) => names))].sort(), own.sort())
})

test('without a pen tool, every step that needs it is reported under the first internal it lacks', () => {
  const roots = completeSudokuPad()
  delete roots.ToolPen.tool
  assert.deepEqual(lackingInternals(FEATURES, roots), new Map([
    ['ToolPen.tool.setSelectedColor', ['pages']],
    ['ToolPen.tool.actStart', ['arrowLines', 'marks', 'lineErase']],
    ['ToolPen.tool.drawLineHint', ['dragHint']],
    ['ToolPen.tool', ['penPanel']]
  ]))
})

// The startup guard: a page with no Framework is not SudokuPad and stays silent; a Framework without getApp holds every install step off, which the probe reports.
function loadWithFramework (framework) {
  return startScript('../pen-tool-extras.user.js', { Framework: framework }).warnings
}

// Runs `fn` on a page with a document and a window that take every call the startup makes and find none of SudokuPad's own elements.
function withPage (fn) {
  const element = () => new Proxy({ style: {}, classList: { add () {}, remove () {}, toggle () {}, contains: () => false }, dataset: {} }, {
    get: (target, key) => key in target ? target[key] : (key === 'then' ? undefined : () => element())
  })
  const saved = { document: global.document, window: global.window }
  global.document = {
    createElement: element,
    createElementNS: element,
    head: element(),
    body: element(),
    documentElement: { outerHTML: '' },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener () {}
  }
  global.window = { addEventListener () {}, MutationObserver: class { observe () {} }, getComputedStyle: () => ({}) }
  try {
    return fn()
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete global[name]
      else global[name] = value
    }
  }
}

test('a Framework with no getApp turns every install step off in one warning naming getApp, and leaves the saved settings and the settings dialog on', () => {
  const { Framework: framework } = completeSudokuPad()
  delete framework.getApp
  const entries = []
  framework.addSetting = (setting) => entries.push(setting.name)
  const steps = ['colors', 'pen pages', 'arrow lines', 'drag highlight', 'marks', 'pen panel', 'line erase']
  const warnings = withPage(() => loadWithFramework(framework))
  assert.deepEqual(warnings, [`pen-tool-extras: ${steps.join(', ')} skipped because SudokuPad has no Framework.getApp`])
  assert.deepEqual(entries, ['pentoolextras'])
})

test('a page with no Framework is left alone without a word', () => {
  assert.deepEqual(loadWithFramework(undefined), [])
})

test('copiedSettings: every setting at the value in force, the pen colors once saved, and no key it does not own', () => {
  const saved = {
    PenColor_thickness: 9,
    PenColor_outline: false,
    PenColor_linestyles: { dashed: false, arrows: true },
    EdgeMarks_marks: { x: false },
    PenColor_colors: { 1: '#112233', preset: 'page-2' },
    PenColor_pen: '3',
    ToolPen_linemode: 'edgeonly',
    ColorByDigit_auto: true
  }
  const copied = JSON.parse(copiedSettings(fakeStore(saved)))
  assert.deepEqual(Object.keys(copied).sort(), [...Object.values(SETTINGS).map((row) => row.key), 'PenColor_colors'].sort())
  assert.equal(copied.PenColor_thickness, 9)
  assert.equal(copied.PenColor_opacity, SETTINGS.opacity.fallback)
  assert.equal(copied.PenColor_outline, false)
  assert.deepEqual(copied.EdgeMarks_marks, normalizeMarkSettings({ x: false }))
  assert.deepEqual(copied.PenColor_colors, storedPenColors(readPenColors(saved.PenColor_colors)))
  assert.equal('PenColor_colors' in JSON.parse(copiedSettings({ getData: () => null })), false)
})

test('pastedSettings: a setting that reads back is kept, one its reader would replace with a default is skipped and counted', () => {
  const pasted = readPaste(JSON.stringify({
    PenColor_thickness: 9,
    PenColor_opacity: 7,
    PenColor_dash: 'long',
    PenColor_outline: false,
    PenColor_middleerase: 'yes',
    PenColor_linestyles: { dashed: false },
    PenColor_sliders: { thickness: 1 },
    EdgeMarks_marks: { x: false, circle: true },
    PenColor_outlinewidth: 2.5,
    PenColor_arrowspacing: { foo: true }
  }))
  assert.deepEqual(pasted.values, {
    PenColor_thickness: 9, PenColor_outline: false, PenColor_linestyles: { dashed: false, arrows: true }, EdgeMarks_marks: normalizeMarkSettings({ x: false, circle: true })
  })
  assert.equal(pasted.skipped, 6)
  for (const bad of [{ foo: true }, {}]) assert.deepEqual(readPaste(JSON.stringify({ PenColor_linestyles: bad })), { values: {}, skipped: 1 }, JSON.stringify(bad))
})

test('pastedSettings: pen colors are kept in the saved form, a table with a bad or no color is skipped, other scripts\' keys and the selected pen are ignored', () => {
  assert.deepEqual(readPaste(JSON.stringify({ PenColor_colors: { 1: '#ABCDEF', preset: 'page-2' }, PenColor_pen: '3', ToolPen_linemode: 'edgeonly', DarkPage_color: '#ffffff' })),
    { values: { PenColor_colors: storedPenColors(readPenColors({ 1: '#abcdef', preset: 'page-2' })) }, skipped: 0 })
  for (const bad of [{ 1: 'nope' }, { 1: '#abcdef', 2: 'nope' }]) assert.deepEqual(readPaste(JSON.stringify({ PenColor_colors: bad })), { values: {}, skipped: 1 }, JSON.stringify(bad))
})

test('pastedSettings: text with none of this script\'s keys pastes and skips nothing', () => {
  assert.deepEqual(readPaste('{}'), { values: {}, skipped: 0 })
  assert.deepEqual(readPaste(JSON.stringify({ DarkPage_color: '#ffffff' })), { values: {}, skipped: 0 })
})

test('the dialog is styled through the editor inside the dialog; its button row look is the shared shell\'s', () => {
  assert.match(DIALOG_CSS, /\.dialog:has\(#pen-tool-extras-editor\) \{ width: fit-content !important;/)
  assert.doesNotMatch(DIALOG_CSS, /data-role="(save|cancel|restore)"/)
  assert.doesNotMatch(DIALOG_CSS, /pen-tool-extras-dialog/)
})

test('digitKeyPen: a bare digit 1 to 9 picks that pen on the page showing, and nothing else does', () => {
  const key = (k, extra = {}) => ({ key: k, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...extra })
  assert.equal(digitKeyPen(key('3'), 0), '3')
  assert.equal(digitKeyPen(key('3'), 1), 'c')
  assert.equal(digitKeyPen(key('9'), 2), penCharOn(2, '9'))
  assert.equal(digitKeyPen(key('0'), 0), null, 'key 0 stays unused')
  assert.equal(digitKeyPen(key('a'), 0), null)
  assert.equal(digitKeyPen(key('12'), 0), null)
  const field = { closest: (selector) => (selector.includes('input') ? {} : null) }
  assert.equal(digitKeyPen(key('3', { target: field }), 0), null, 'a key typed into a field')
  assert.equal(digitKeyPen(key('3', { target: { closest: () => null } }), 0), '3', 'a key on a non-field')
  for (const mod of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey']) assert.equal(digitKeyPen(key('3', { [mod]: true }), 0), null, mod)
})

test('whenReady resolves with the value check() gives', async () => {
  assert.equal(await whenReady(() => 'tool', { timeoutMs: 1000, what: 'the tool' }), 'tool')
})

test('whenReady calls check() before it returns, so a tool that is ready already costs no poll', () => {
  let calls = 0
  whenReady(() => { calls++; return 'tool' }, { timeoutMs: 1000, what: 'the tool' })
  assert.equal(calls, 1)
})

test('whenReady takes 0 and an empty string as ready; only null, undefined and false are not', async () => {
  assert.equal(await whenReady(() => 0, { timeoutMs: 1000, what: 'the tool' }), 0)
  assert.equal(await whenReady(() => '', { timeoutMs: 1000, what: 'the tool' }), '')
  await assert.rejects(whenReady(() => false, { timeoutMs: 20, what: 'x', pollMs: 5 }), /x not ready after 20 ms/)
  await assert.rejects(whenReady(() => undefined, { timeoutMs: 20, what: 'x', pollMs: 5 }), /x not ready after 20 ms/)
})

test('whenReady keeps polling until check() is ready', async () => {
  let calls = 0
  const value = await whenReady(() => (++calls < 4 ? null : calls), { timeoutMs: 2000, what: 'the tool', pollMs: 5 })
  assert.equal(value, 4)
})

test('whenReady rejects with "<what> not ready after <ms> ms" when check() never is', async () => {
  await assert.rejects(
    whenReady(() => null, { timeoutMs: 40, what: 'the color tool', pollMs: 5 }),
    (error) => error instanceof Error && error.message === 'the color tool not ready after 40 ms')
})

test('whenReady stops polling after it rejects', async () => {
  let calls = 0
  await assert.rejects(whenReady(() => { calls++; return null }, { timeoutMs: 30, what: 'x', pollMs: 5 }))
  const seen = calls
  // A quiet window longer than the poll: a timer left running would call check() again in it.
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(calls, seen)
})

test('whenReady rejects with the error check() throws, rather than leaving the promise pending', async () => {
  await assert.rejects(
    whenReady(() => { throw new TypeError('boom') }, { timeoutMs: 1000, what: 'the tool' }),
    /boom/)
})

test('arrowHeads puts `count` heads at the middles of equal shares of the way, each pointing at the end', () => {
  assert.equal(arrowHeads([0, 0], [64, 0], 1, 2), 'M14.56 2.13L17.44 0L14.56 -2.12ZM46.56 2.13L49.44 0L46.56 -2.12Z')
  assert.equal(arrowHeads([0, 0], [0, 64], 1, 1), 'M-2.12 30.56L0 33.44L2.13 30.56Z')
  assert.equal(arrowHeads([0, 0], [64, 0], 1, 0), '')
})
