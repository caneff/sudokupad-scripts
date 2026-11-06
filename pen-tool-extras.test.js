'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const {
  buildCss, SUDOKUPAD_PEN_COLORS, parseColor, isTransparent, darkenColor, derivedPenColors, editedColors,
  readPenColors, storedPenColors, startupPenColors, presetOptions, presetColors, PRESET_LABELS,
  HOLD_TO_EDIT_MS, buildThicknessCss, buildOpacityCss, renderPanelSliders, renderEditor, DIALOG_CSS, markGrowthScale, MARK_VALUES, DASH, OPACITY, THICKNESS, FULL_WIDTH_VALUES, LIGHTNESS_FACTOR, GREY_CHROMA, VERSION, buildOutlineCss, renderOutlineFilter, OUTLINE_FILTER_ID, OUTLINE_WIDTH,
  SETTINGS, draftWithBox, slider, flag, flags, isPlainObject, isHexColor, inRange, settingDefaults, readSettings, changedSettings, saveSetting, saveChangedSettings, effectsOf,
  stepType, EDGE_CYCLE, planClick, normalizeMarkSettings, shapePath,
  CORNER_VALUES, cornerAt, cornerStorage, cornerPoint, planCornerClick,
  PEN_PAGES, penPageOf, penNumber, penCharOn, normalizePen, wrapIndex, buildPagesCss, renderPageIcon, normalizeLineMode, LINE_MODES,
  LINE_VALUES, directionCharOf, arrowLineWayOf, ARROW_LINE, lineSegment, splitLineActs, arrowLine,
  ARROW_SPACING, enabledPages, stepEnabledPage, pageAfterSave,
  linePoints, lineIdentityOf, segmentNear, connectedLine, eraseLineActs, LINE_HIT_RADIUS,
  createStep, lackingInternals, STEP_LABELS,
  edgeMidpoint, addedMark, arrowLineOf, isEdgeActs, penValuesOf, planActs, lineSegmentsOf
} = require('./pen-tool-extras.user.js')
const { SOLVER_REACH } = require('./dark-page.user.js')

const nextType = (current, settings) => stepType(current, settings, 1, EDGE_CYCLE)
const previousType = (current, settings) => stepType(current, settings, -1, EDGE_CYCLE)

// SudokuPad's tool-pen.css (v0.611.0) as #rrggbb, typed out here as the independent source.
// Pen color 9 is written there as rgb(-36, -36, -36), which clamps to black.
const TABLE = {
  1: '#1f8020', 2: '#e87cf1', 3: '#e49632', 4: '#f53a37', 5: '#d2be32', 6: '#3d99f5', 7: '#d6d6d6', 8: '#7c7c7c', 9: '#000000'
}

test('SUDOKUPAD_PEN_COLORS are SudokuPad\'s own nine pen colors', () => {
  assert.deepEqual(SUDOKUPAD_PEN_COLORS, TABLE)
})

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
  assert.notEqual(colorsRead(saved), SUDOKUPAD_PEN_COLORS)
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

// An independent sRGB -> OKLCH (Ottosson's published matrices), so the tests do not lean on
// the script's own conversion. Returns { L, C, h } with h in degrees.
function oklch (hex) {
  const lin = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const [r, g, b] = lin
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L, C: Math.hypot(A, B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 }
}
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

test('parseColor reads rgb() and #rrggbb, clamping out-of-range channels', () => {
  assert.deepEqual(parseColor('rgb(61, 153, 245)'), [61, 153, 245])
  assert.deepEqual(parseColor('#3d99f5'), [61, 153, 245])
  assert.deepEqual(parseColor('rgb(-36, -36, -36)'), [0, 0, 0])
  assert.deepEqual(parseColor('rgb(300, 12.4, 0)'), [255, 12, 0])
})

test('parseColor gives null for transparent, empty and unreadable values', () => {
  for (const bad of ['transparent', '', '  ', 'banana', 'rgb(1, 2)', undefined, null, 'rgba(0, 0, 0, 0)', '#abc', 'red', 'hsl(0, 100%, 50%)']) {
    assert.equal(parseColor(bad), null, String(bad))
  }
})

test('parseColor reads a partly transparent rgba() by its color, and isTransparent names only the fully transparent', () => {
  assert.deepEqual(parseColor('rgba(0, 0, 255, 0.5)'), [0, 0, 255])
  assert.deepEqual(parseColor('rgba(0, 0, 255, 1)'), [0, 0, 255])
  for (const clear of ['transparent', ' TRANSPARENT ', 'rgba(0, 0, 0, 0)', 'rgba(9, 9, 9, 0)']) assert.equal(isTransparent(clear), true, clear)
  for (const seen of ['rgb(0, 0, 0)', 'rgba(0, 0, 0, 0.1)', '#abc', 'red', '', undefined, null, 'banana']) assert.equal(isTransparent(seen), false, String(seen))
})

test('darkenColor keeps the hue, lowers lightness by the named factor, and gives #rrggbb', () => {
  for (const rgb of [[61, 153, 245], [245, 58, 55], [232, 124, 241], [228, 150, 50], [179, 229, 106]]) {
    const hex = '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('')
    const out = darkenColor(rgb)
    assert.match(out, /^#[0-9a-f]{6}$/)
    const before = oklch(hex)
    const after = oklch(out)
    assert.ok(hueGap(before.h, after.h) < 3, `${hex} -> ${out}: hue ${before.h} -> ${after.h}`)
    assert.ok(Math.abs(after.L - before.L * LIGHTNESS_FACTOR) < 0.02, `${hex} -> ${out}: L ${before.L} -> ${after.L}`)
  }
})

test('darkenColor makes every color darker, and black stays black', () => {
  assert.equal(darkenColor([0, 0, 0]), '#000000')
  assert.ok(oklch(darkenColor([214, 214, 214])).L < oklch('#d6d6d6').L)
  assert.ok(LIGHTNESS_FACTOR < 1 && LIGHTNESS_FACTOR > 0)
})

test('darkenColor gives a valid hex for near-black, white and out-of-range input', () => {
  for (const rgb of [[1, 1, 1], [0, 0, 1], [255, 255, 255], [-36, -36, -36], [999, -5, 40]]) {
    assert.match(darkenColor(rgb), /^#[0-9a-f]{6}$/, JSON.stringify(rgb))
  }
})

test('a darkened light color has OKLCH lightness under 0.8, the bar for a 5px line on white', () => {
  for (const rgb of [[252, 235, 63], [214, 214, 214], [255, 255, 255]]) {
    assert.ok(oklch(darkenColor(rgb)).L < 0.8, JSON.stringify(rgb))
  }
})

const PAGE_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const CELL = {
  0: 'transparent',
  1: 'rgb(214, 214, 214)',
  2: 'rgb(124, 124, 124)',
  3: 'rgb(-36, -36, -36)',
  4: 'rgb(179, 229, 106)',
  5: 'rgb(232, 124, 241)',
  6: 'rgb(228, 150, 50)',
  7: 'rgb(245, 58, 55)',
  8: 'rgb(252, 235, 63)',
  9: 'rgb(61, 153, 245)'
}

const PEN_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const chromaOf = (hex) => oklch(hex).C

test('the darkened default first page gives nine different #rrggbb values', () => {
  const out = PAGE_KEYS.slice(1).map((k) => darkenColor(parseColor(CELL[k])))
  assert.equal(new Set(out).size, 9)
})

test('derivedPenColors maps index N of the page to pen color N, darkened', () => {
  const r = derivedPenColors(PAGE_KEYS, (k) => CELL[k])
  assert.deepEqual(r.missing, [])
  assert.deepEqual(Object.keys(r.colors), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  assert.equal(r.colors[1], darkenColor([214, 214, 214]))
  assert.equal(r.colors[3], '#000000')
  assert.equal(r.colors[9], darkenColor([61, 153, 245]))
})

test('derivedPenColors reads pen N from index N of the page, never index 0, even when index 0 holds a color', () => {
  const page = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  const read = (k) => ({ 0: 'rgb(250, 250, 250)', 1: 'rgb(204, 51, 17)', 2: 'rgb(17, 119, 51)', 3: 'rgb(238, 153, 170)', 4: 'rgb(0, 68, 136)', 5: 'rgb(187, 85, 0)', 6: 'rgb(0, 153, 136)', 7: 'rgb(170, 51, 170)', 8: 'rgb(136, 136, 34)', 9: 'rgb(120, 80, 200)' })[k]
  const r = derivedPenColors(page, read)
  assert.deepEqual(r.missing, [])
  assert.equal(r.colors[1], darkenColor([204, 51, 17]))
  assert.equal(r.colors[2], darkenColor([17, 119, 51]))
  assert.equal(r.colors[9], darkenColor([120, 80, 200]))
  for (const n of PEN_NUMBERS) assert.notEqual(r.colors[n], darkenColor([250, 250, 250]))
})

test('derivedPenColors keeps SudokuPad\'s pen color at a transparent middle entry, lists it as missing, and shifts nothing', () => {
  const page = ['0', '1', '2', '3', '4']
  const read = (k) => ({ 0: 'transparent', 1: 'rgb(204, 51, 17)', 2: 'transparent', 3: 'rgb(17, 119, 51)', 4: 'rgb(238, 153, 170)' })[k]
  const r = derivedPenColors(page, read)
  assert.deepEqual(r.missing, [2, 5, 6, 7, 8, 9])
  assert.equal(r.colors[1], darkenColor([204, 51, 17]))
  assert.equal(r.colors[2], SUDOKUPAD_PEN_COLORS[2])
  assert.equal(r.colors[3], darkenColor([17, 119, 51]))
  assert.equal(r.colors[4], darkenColor([238, 153, 170]))
  for (const n of [5, 6, 7, 8, 9]) assert.equal(r.colors[n], SUDOKUPAD_PEN_COLORS[n])
})

test('derivedPenColors keeps an unreadable color\'s place: its pen color keeps SudokuPad\'s own, and later colors do not shift up', () => {
  const page = ['a', 'b', 'c', 'd', 'e']
  const read = (k) => ({ a: 'transparent', b: 'rgb(204, 51, 17)', c: 'unparseable', d: 'rgb(238, 153, 170)', e: 'rgb(17, 119, 51)' })[k]
  const r = derivedPenColors(page, read)
  assert.equal(r.colors[1], darkenColor([204, 51, 17]))
  assert.equal(r.colors[2], SUDOKUPAD_PEN_COLORS[2])
  assert.equal(r.colors[3], darkenColor([238, 153, 170]))
  assert.equal(r.colors[4], darkenColor([17, 119, 51]))
  assert.deepEqual(r.missing, [2, 5, 6, 7, 8, 9])
})

const hueful = ['rgb(204, 51, 17)', 'rgb(17, 119, 51)', 'rgb(0, 68, 136)', 'rgb(187, 85, 0)']
const pageOf = (colors) => ['transparent', ...colors]
const penColors = (colors) => derivedPenColors(pageOf(colors).map((_, i) => String(i)), (k) => pageOf(colors)[k]).colors

test('the darkest low-chroma pen color becomes #000000, wherever it sits on the page', () => {
  // Two greys among hued colors: pen 3 is the darker grey and the only one turned black.
  const colors = penColors([hueful[0], hueful[1], 'rgb(90, 90, 90)', hueful[2], 'rgb(200, 200, 200)', hueful[3], hueful[0], hueful[1], hueful[2]])
  assert.equal(colors[3], '#000000')
  assert.equal(colors[5], darkenColor([200, 200, 200]))
  assert.equal(colors[1], darkenColor([204, 51, 17]))
  assert.ok(chromaOf(darkenColor([90, 90, 90])) < GREY_CHROMA, String(chromaOf(darkenColor([90, 90, 90]))))
})

test('a near-grey with a slight tint counts as low chroma and goes black when it is the darkest', () => {
  const colors = penColors([hueful[0], 'rgb(10, 20, 30)', hueful[1], hueful[2], hueful[3], hueful[0], hueful[1], hueful[2], hueful[3]])
  assert.equal(colors[2], '#000000')
})

test('a page with no low-chroma color changes nothing: no pen color becomes black', () => {
  const nine = [hueful[0], hueful[1], hueful[2], hueful[3], 'rgb(120, 80, 200)', 'rgb(0, 153, 136)', 'rgb(170, 51, 170)', 'rgb(136, 136, 34)', 'rgb(238, 153, 170)']
  const colors = penColors(nine)
  nine.forEach((rgb, i) => assert.equal(colors[i + 1], darkenColor(parseColor(rgb))))
  assert.deepEqual(PEN_NUMBERS.filter((n) => colors[n] === '#000000'), [])
})

test('a pen color kept from SudokuPad is outside the black rule: the derived grey turns black, not the kept black pen 9', () => {
  // Pens 4-9 have no page entry and keep SudokuPad's own, pen 9 being #000000. Counted in, pen 9
  // would be the darkest grey and the derived grey (pen 2) would stay grey.
  const page = ['t', 'a', 'b', 'c']
  const read = (k) => ({ t: 'transparent', a: hueful[0], b: 'rgb(90, 90, 90)', c: hueful[1] })[k]
  const r = derivedPenColors(page, read)
  assert.equal(r.colors[1], darkenColor([204, 51, 17]))
  assert.equal(r.colors[2], '#000000')
  assert.equal(r.colors[3], darkenColor([17, 119, 51]))
  for (const n of [4, 5, 6, 7, 8, 9]) assert.equal(r.colors[n], SUDOKUPAD_PEN_COLORS[n])
})

test('SudokuPad\'s default first page keeps its result: index 3 is already black and stays the darkest', () => {
  const r = derivedPenColors(PAGE_KEYS, (k) => CELL[k])
  assert.equal(r.colors[1], darkenColor([214, 214, 214]))
  assert.equal(r.colors[2], darkenColor([124, 124, 124]))
  assert.equal(r.colors[3], '#000000')
})

test('derivedPenColors ignores entries past index 9', () => {
  const keys = 'abcdefghijkl'.split('')
  const r = derivedPenColors(keys, () => 'rgb(204, 51, 17)')
  assert.deepEqual(r.missing, [])
  assert.equal(Object.keys(r.colors).length, 9)
})

test('derivedPenColors on an empty page keeps all nine SudokuPad colors', () => {
  const r = derivedPenColors([], () => 'rgb(1, 2, 3)')
  assert.deepEqual(r.colors, SUDOKUPAD_PEN_COLORS)
  assert.deepEqual(r.missing, [1, 2, 3, 4, 5, 6, 7, 8, 9])
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
  for (const odd of ['page-4', 'custom', 'unsaved', 'Darker cell color page 1', 7, null]) {
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

test('presetOptions lists one darker page per palette page, up to three, then SudokuPad default colors last', () => {
  assert.deepEqual(presetOptions(3), ['page-1', 'page-2', 'page-3', 'sudokupad'])
  assert.deepEqual(presetOptions(5), ['page-1', 'page-2', 'page-3', 'sudokupad'])
  assert.deepEqual(presetOptions(1), ['page-1', 'sudokupad'])
  assert.deepEqual(presetOptions(0), ['sudokupad'])
  assert.deepEqual(['page-1', 'page-2', 'page-3', 'sudokupad', 'custom'].map((id) => PRESET_LABELS[id]),
    ['Darker cell color page 1', 'Darker cell color page 2', 'Darker cell color page 3', 'SudokuPad default colors', 'Custom'])
})

test('presetColors darkens the named page, not the first or the current one, and gives SudokuPad\'s own for its preset', () => {
  const pages = [['a0', 'a1'], ['b0', 'b1'], ['c0', 'c1']]
  const read = (key) => ({ a1: 'rgb(255, 0, 0)', b1: 'rgb(0, 0, 255)', c1: 'rgb(0, 128, 0)' })[key]
  // Blue darkens to #0000ae, as the live test's custom page types it out.
  assert.equal(presetColors('page-2', pages, read).colors[1], '#0000ae')
  assert.notEqual(presetColors('page-1', pages, read).colors[1], '#0000ae')
  assert.deepEqual(presetColors('page-3', pages, read).missing, [2, 3, 4, 5, 6, 7, 8, 9])
  assert.deepEqual(presetColors('sudokupad', pages, read), { colors: TABLE, preset: 'sudokupad', missing: [] })
})

test('presetColors names the preset it was given in the set it returns', () => {
  const pages = [['a0', 'a1'], ['b0', 'b1']]
  for (const preset of ['page-1', 'page-2', 'sudokupad']) assert.equal(presetColors(preset, pages, () => 'rgb(255, 0, 0)').preset, preset)
})

test('SudokuPad\'s own set is frozen, so no edit of a set in force can change it', () => {
  const set = presetColors('sudokupad', [], () => 'red')
  assert.equal(Object.isFrozen(set) && Object.isFrozen(set.colors) && Object.isFrozen(set.missing), true)
  assert.equal(presetColors('sudokupad', [], () => 'red'), set, 'one set, not a fresh copy each time')
})

test('presetColors refuses a page preset the palette has no page for, rather than giving a set nobody picked', () => {
  assert.throws(() => presetColors('page-3', [['a0'], ['b0']], () => 'red'), /page-3 is not a preset of this palette/)
  assert.throws(() => presetColors('custom', [['a0']], () => 'red'), /custom is not a preset/)
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

test('the thickness runs 1 to 16 in whole steps from SudokuPad\'s own pen width of 5', () => {
  assert.deepEqual(THICKNESS, { min: 1, max: 16, step: 1, fallback: 5 })
})

test('the thickness setting keeps a saved whole number from 1 to 16', () => {
  for (const ok of [1, 5, 8, 12, 16]) assert.equal(SETTINGS.thickness.normalize(ok), ok)
})

test('the thickness setting falls back to 5 for nothing saved and for anything untrusted', () => {
  for (const bad of [null, undefined, 0, 17, -3, 2.5, NaN, Infinity, '7', [7], { a: 7 }, true]) {
    assert.equal(SETTINGS.thickness.normalize(bad), 5, String(bad))
  }
})

test('the full width values are the free lines and the cell circle and cross, not the edge X marks or the arrows and circles this script adds', () => {
  assert.deepEqual(FULL_WIDTH_VALUES, ['1', '2', '5', '6', '7', '8', '9', 'a', 'd', 'e', 'f', 'g'])
})

// The stroke width and scale each pen value's rule gives it, read back from the CSS, as { value: { width, scale } }
// (a rule with no transform has scale 1).
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

test('MARK_VALUES holds exactly the values of SudokuPad\'s edge X and cell circle and cross and of every edge mark and grid-corner mark this script adds, and no line value', () => {
  const expected = ['3', '4', 'b', 'c', '5', '6', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y']
  assert.deepEqual([...MARK_VALUES].sort(), [...expected].sort())
  assert.deepEqual(MARK_VALUES.filter((v) => LINE_VALUES.includes(v)), [])
})

test('the scale lands on every edge and corner mark and on no line, and a mark stays centred on its edge or corner while it grows', () => {
  const css = buildThicknessCss(16)
  const scales = scalesOf(css)
  const marks = ['3', '4', 'b', 'c', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y']
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
  assert.equal(html.match(/tabindex="-1"/g).length, 2)
})

test('the hold that opens edit mode lasts 1000 ms, the same as SudokuPad\'s color tool', () => {
  assert.equal(HOLD_TO_EDIT_MS, 1000)
})

const ALL = { x: true, directions: true, circle: true, cornerX: true, cornerCircle: true }
const NONE = { x: false, directions: false, circle: false, cornerX: false, cornerCircle: false }

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
  assert.deepEqual(normalizeMarkSettings({ x: false, directions: 'no', circle: false, cornerX: 'no', cornerCircle: false }), { x: false, directions: true, circle: false, cornerX: true, cornerCircle: false })
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

test('with everything ticked the backward cycle is empty, other direction, direction, circle, X, empty', () => {
  const seen = []
  let type = 'empty'
  for (let i = 0; i < 5; i++) {
    type = previousType(type, ALL)
    seen.push(type)
  }
  assert.deepEqual(seen, ['dirB', 'dirA', 'circle', 'x', 'empty'])
})

test('going backwards from empty lands on the last ticked mark, and from the X on empty', () => {
  assert.equal(previousType('empty', { x: true, directions: true, circle: false }), 'dirB')
  assert.equal(previousType('empty', { x: true, directions: false, circle: true }), 'circle')
  assert.equal(previousType('empty', { x: true, directions: false, circle: false }), 'x')
  assert.equal(previousType('x', ALL), 'empty')
  assert.equal(previousType('empty', NONE), 'empty')
})

test('going backwards skips an unticked type', () => {
  assert.equal(previousType('dirA', { x: true, directions: true, circle: false }), 'x')
  assert.equal(previousType('circle', { x: false, directions: true, circle: true }), 'empty')
  assert.equal(previousType('empty', { x: true, directions: false, circle: true }), 'circle')
  assert.equal(previousType('dirA', { x: true, directions: true, circle: true }), 'circle')
})

test('a mark whose type is unticked moves back to the previous ticked mark, or to empty', () => {
  assert.equal(previousType('dirA', { x: true, directions: false, circle: false }), 'x')
  assert.equal(previousType('dirB', { x: false, directions: false, circle: true }), 'circle')
  assert.equal(previousType('circle', { x: false, directions: false, circle: true }), 'empty')
  assert.equal(previousType('dirA', NONE), 'empty')
})

test('backwards on a right edge goes empty, i, h, j, 3, empty', () => {
  assert.deepEqual(planClick('3', [], ALL, true), { remove: [], add: 'i' })
  assert.deepEqual(planClick('3', ['i'], ALL, true), { remove: ['i'], add: 'h' })
  assert.deepEqual(planClick('3', ['h'], ALL, true), { remove: ['h'], add: 'j' })
  assert.deepEqual(planClick('3', ['j'], ALL, true), { remove: ['j'], add: '3' })
  assert.deepEqual(planClick('3', ['3'], ALL, true), { remove: ['3'], add: null })
})

test('backwards with nothing ticked does nothing', () => {
  assert.equal(planClick('3', ['3'], NONE, true), null)
})

test('a click on an empty right edge adds the X, which is the character 3', () => {
  assert.deepEqual(planClick('3', [], ALL), { remove: [], add: '3' })
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
  for (const other of ['3', '4', 'b', 'c', '0', '5', 'a', 'g', 'z']) {
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

test('cornerAt finds the grid corner within the radius, inner and outer, and nothing farther', () => {
  assert.deepEqual(cornerAt(3, 3, 9, 9), { row: 3, col: 3 })
  assert.deepEqual(cornerAt(3.19, 3, 9, 9), { row: 3, col: 3 })
  assert.equal(cornerAt(0.2, 0, 9, 9), null, 'exactly the radius is outside')
  assert.deepEqual(cornerAt(0.19, 0, 9, 9), { row: 0, col: 0 })
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

test('the corner cycle backwards is circle, X, empty', () => {
  const [x, circle] = CORNER_VALUES.tl
  assert.deepEqual(planCornerClick('tl', [], ALL, true), { remove: [], add: circle })
  assert.deepEqual(planCornerClick('tl', [circle], ALL, true), { remove: [circle], add: x })
  assert.deepEqual(planCornerClick('tl', [x], ALL, true), { remove: [x], add: null })
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

// Pen pages: page 1 is SudokuPad's own 1 to 9, page 2 is the color characters a to i, drawn dashed, page 3 is j to z and 0, two
// to a pen, drawn as arrow lines.
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

test('wrapIndex goes round a list of any length in either direction', () => {
  assert.equal(wrapIndex(0, 1, 2), 1)
  assert.equal(wrapIndex(1, 1, 2), 0)
  assert.equal(wrapIndex(0, -1, 2), 1)
  assert.equal(wrapIndex(1, -1, 3), 0)
  assert.equal(wrapIndex(2, 1, 3), 0)
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
test('the page button samples the page it turns to: dashes on page 2, an arrow line on page 3, a solid line on page 1, and a dot for each page with the current one filled', () => {
  const fromOne = renderPageIcon(0, 3, BOTH_STYLES)
  assert.match(fromOne, /data-page-sample="dashed"/)
  assert.equal((fromOne.match(/<circle/g) || []).length, 3)
  assert.equal((fromOne.match(/<path[^>]*data-dash/g) || []).length, 2)
  const fromTwo = renderPageIcon(1, 0, BOTH_STYLES)
  assert.match(fromTwo, /data-page-sample="arrowLines"/)
  assert.equal((fromTwo.match(/<circle/g) || []).length, 3)
  assert.equal((fromTwo.match(/<path[^>]*data-arrow/g) || []).length, 3)
  assert.equal((fromTwo.match(/<path[^>]*data-sample-line/g) || []).length, 1)
  const fromThree = renderPageIcon(2, 0, BOTH_STYLES)
  assert.match(fromThree, /data-page-sample="solid"/)
  assert.equal((fromThree.match(/<circle/g) || []).length, 3)
  assert.equal((fromThree.match(/<path/g) || []).length, 1)
  for (const icon of [fromOne, fromTwo, fromThree]) {
    assert.equal((icon.match(/data-page-dot="filled"/g) || []).length, 1)
    assert.equal((icon.match(/data-page-dot="outline"/g) || []).length, 2)
  }
  assert.match(fromOne, /<circle[^>]*data-page-dot="filled"[^>]*\/>[^]*<circle[^>]*data-page-dot="outline"/)
  assert.match(fromThree, /<circle[^>]*data-page-dot="outline"[^>]*\/>[^]*<circle[^>]*data-page-dot="filled"/)
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

// The declarations of the first (orthogonal) and second (diagonal) page 2 line rule, as { dash, gap, offset } numbers
// (offset 0 where a rule has no dashoffset).
const dashesOf = (thickness, dash) => rulesOf(buildPagesCss(thickness, dash)).filter((r) => r.body.startsWith('stroke-dasharray'))
  .map((r) => {
    const [, on, gap] = /^stroke-dasharray: ([\d.]+) ([\d.]+);/.exec(r.body)
    const offset = /stroke-dashoffset: ([\d.]+);$/.exec(r.body)
    return { dash: Number(on), gap: Number(gap), offset: offset ? Number(offset[1]) : 0 }
  })

test('at dash 0 the page 2 lines are the dots they were: the spacing origin/main gave, as literals', () => {
  // The dasharray of the orthogonal and the diagonal rule at thicknesses 1, 5 and 12.
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

test('the page button samples dashes as long as the setting, and dots at 0', () => {
  const dots = renderPageIcon(0, 0, BOTH_STYLES)
  assert.match(dots, /data-page-sample="dots"/)
  assert.equal((dots.match(/<circle/g) || []).length, 5 + 3)
  const dashed = renderPageIcon(0, 4, BOTH_STYLES)
  assert.match(dashed, /data-page-sample="dashed"/)
  const short = renderPageIcon(0, 1, BOTH_STYLES).match(/<path[^>]*data-dash/g)
  const long = dashed.match(/<path[^>]*data-dash/g)
  assert.equal(short.length >= 2 && long.length >= 2, true)
  const span = (path) => { const [x1, y1, x2, y2] = path.match(/M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)/).slice(1).map(Number); return Math.hypot(x2 - x1, y2 - y1) }
  assert.equal(span(long[0]) > span(short[0]), true)
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
  lineMode: 'both',
  thickness: 5,
  opacity: 80,
  show: { thickness: true, opacity: true },
  dash: 0,
  arrowSpacing: 7,
  lineStyles: { dashed: true, arrows: true },
  middleErase: true,
  outline: true,
  outlineWidth: 2,
  off: [],
  ...over
})

test('the dialog\'s pen colors are a 3 by 3 grid in the order of the pen tool\'s buttons, each keeping its number', () => {
  const html = renderEditor(editorState())
  assert.match(html, /<div class="pen-tool-extras-pen-grid">/)
  assert.match(DIALOG_CSS, /\.pen-tool-extras-pen-grid \{[^}]*grid-template-columns: repeat\(3, /)
  const cells = [...html.matchAll(/<b[^>]*>(\d)<\/b><input type="color" data-pen="(\d)" value="(#[0-9a-f]{6})">/g)].map((m) => m.slice(1))
  assert.deepEqual(cells.map(([label, pen]) => [label, pen]), [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), String(n)]))
  assert.deepEqual(cells.map((c) => c[2]), [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => SUDOKUPAD_PEN_COLORS[n]))
})

const presetMenu = (html) => {
  const menu = /<select data-pen-preset[^>]*>([\s\S]*?)<\/select>/.exec(html)
  assert.ok(menu, 'a pen color preset pulldown')
  return [...menu[1].matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g)].map(([, value, attributes, label]) => ({ value, label, selected: / selected/.test(attributes), disabled: / disabled/.test(attributes) }))
}

test('the Pen colors section has a preset pulldown above the grid, its options in order, the preset in force selected, and no SudokuPad colors button', () => {
  const html = renderEditor(editorState({ preset: 'page-2' }))
  assert.deepEqual(presetMenu(html).map(({ value, label, selected }) => [value, label, selected]), [
    ['page-1', 'Darker cell color page 1', false],
    ['page-2', 'Darker cell color page 2', true],
    ['page-3', 'Darker cell color page 3', false],
    ['sudokupad', 'SudokuPad default colors', false]
  ])
  const section = html.indexOf('Pen colors')
  assert.equal(section < html.indexOf('data-pen-preset') && html.indexOf('data-pen-preset') < html.indexOf('data-pen="1"'), true, 'heading, pulldown, then the grid')
  assert.doesNotMatch(html, /SudokuPad colors<|data-sudokupad-colors/)
})

test('the pulldown lists only the pages the palette has', () => {
  assert.deepEqual(presetMenu(renderEditor(editorState({ presets: ['page-1', 'sudokupad'] }))).map((o) => o.value), ['page-1', 'sudokupad'])
})

test('a set in force that is no pickable preset is listed first, selected and not pickable, so every preset stays pickable', () => {
  // A page-3 set with a one-page palette, a page-1 set with the colors step off, and SudokuPad's colors before the install save.
  assert.deepEqual(presetMenu(renderEditor(editorState({ preset: 'page-3', presets: ['page-1', 'sudokupad'] }))), [
    { value: 'page-3', label: 'Darker cell color page 3', selected: true, disabled: true },
    { value: 'page-1', label: 'Darker cell color page 1', selected: false, disabled: false },
    { value: 'sudokupad', label: 'SudokuPad default colors', selected: false, disabled: false }
  ])
  assert.deepEqual(presetMenu(renderEditor(editorState({ preset: 'page-1', presets: ['sudokupad'] }))).map((o) => [o.value, o.selected, o.disabled]), [['page-1', true, true], ['sudokupad', false, false]])
  assert.deepEqual(presetMenu(renderEditor(editorState({ preset: 'unsaved', presets: ['sudokupad'] }))), [
    { value: 'unsaved', label: 'SudokuPad colors, not saved yet', selected: true, disabled: true },
    { value: 'sudokupad', label: 'SudokuPad default colors', selected: false, disabled: false }
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
  assert.match(noDash, /data-page-sample="arrowLines"/)
  assert.equal((noDash.match(/<circle/g) || []).length, 2)
  assert.equal((noDash.match(/data-page-dot="filled"/g) || []).length, 1)
  const noArrows = renderPageIcon(1, 3, { dashed: true, arrows: false })
  assert.match(noArrows, /data-page-sample="solid"/)
  assert.equal((noArrows.match(/<circle/g) || []).length, 2)
  assert.match(noArrows, /<circle[^>]*data-page-dot="outline"[^>]*\/>[^]*<circle[^>]*data-page-dot="filled"/)
})

const rowOf = (html, key) => new RegExp(`<div data-row="${key}"[^>]*>[\\s\\S]*?</div>`).exec(html)[0]

test('Line settings: Thickness and Opacity are one row each, with a Slider in panel box at the right end that is ticked as saved', () => {
  const box = (html, key) => new RegExp(`<input type="checkbox" id="pen-tool-extras-box-show-${key}" data-box="show.${key}"( checked)?`).exec(rowOf(html, key))
  const both = renderEditor(editorState())
  assert.equal(Boolean(box(both, 'thickness')[1]) && Boolean(box(both, 'opacity')[1]), true)
  assert.match(both, />Slider in panel</)
  assert.doesNotMatch(both, /Show thickness slider|Show opacity slider/)
  const none = renderEditor(editorState({ show: { thickness: false, opacity: true } }))
  assert.equal(box(none, 'thickness')[1], undefined, 'unticked, and the slider is still in the dialog')
  assert.match(none, /data-setting="thickness"/)
  assert.equal(Boolean(box(none, 'opacity')[1]), true)
  const row = rowOf(both, 'thickness')
  assert.equal(row.indexOf('data-setting="thickness"') < row.indexOf('data-readout="thickness"') && row.indexOf('data-readout="thickness"') < row.indexOf('data-box="show.thickness"'), true, 'label, slider, value, then the box')
})

test('the dialog always holds the thickness, opacity, dash, arrow spacing and outline width sliders, at the values in force, whether or not the panel shows them', () => {
  const html = renderEditor(editorState({ thickness: 9, opacity: 35, show: { thickness: false, opacity: false } }))
  const ranges = [...html.matchAll(/<input type="range" data-setting="(\w+)" min="(\d+)" max="(\d+)" step="(\d+)" value="(\d+)"/g)].map((m) => m.slice(1))
  assert.deepEqual(ranges, [
    ['thickness', String(THICKNESS.min), String(THICKNESS.max), String(THICKNESS.step), '9'],
    ['opacity', String(OPACITY.min), String(OPACITY.max), String(OPACITY.step), '35'],
    ['dash', String(DASH.min), String(DASH.max), String(DASH.step), '0'],
    ['arrowSpacing', String(ARROW_SPACING.min), String(ARROW_SPACING.max), String(ARROW_SPACING.step), '7'],
    ['outlineWidth', String(OUTLINE_WIDTH.min), String(OUTLINE_WIDTH.max), String(OUTLINE_WIDTH.step), '2']
  ])
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
  assert.equal(draftWithBox(draft, 'middleErase', false).middleErase, false)
  assert.deepEqual(draftWithBox(draft, 'lineStyles.dashed', false).lineStyles, { dashed: false, arrows: true })
  assert.deepEqual(draftWithBox(draft, 'show.opacity', false).show, { thickness: true, opacity: false })
  assert.deepEqual(draft.lineStyles, { dashed: true, arrows: true }, 'the draft given is left alone')
  assert.deepEqual(draftWithBox(draft, 'marks.cornerX', false).marks, { ...ALL, cornerX: false })
})

test('a box path that names no box of the table gives no draft', () => {
  const draft = editorState()
  for (const path of ['', 'nothing', 'thickness', 'outline.x', 'lineStyles', 'lineStyles.solid', 'marks.toString']) assert.equal(draftWithBox(draft, path, false), null, path)
})

test('every checkbox the dialog draws names its setting path, and the path reads back the value it shows', () => {
  const state = editorState({ show: { thickness: false, opacity: true }, lineStyles: { dashed: true, arrows: false }, outline: false, marks: { ...ALL, circle: false } })
  const html = renderEditor(state)
  const boxes = [...html.matchAll(/<input type="checkbox"[^>]*>/g)].map((m) => m[0])
  assert.equal(boxes.length, 11)
  for (const box of boxes) {
    const path = /data-box="([^"]+)"/.exec(box)
    assert.ok(path, box)
    const [name, flagName] = path[1].split('.')
    assert.equal(/ checked/.test(box), flagName ? state[name][flagName] : state[name], path[1])
  }
})

test('every slider row has the same four columns, so the sliders of Line settings, Line styles and the outline line up', () => {
  const html = renderEditor(editorState())
  const classes = ['thickness', 'opacity', 'dash', 'arrowSpacing', 'outlineWidth'].map((key) => /^<div data-row="[^"]+" class="([^"]+)"/.exec(rowOf(html, key))[1])
  assert.equal(new Set(classes).size, 1, classes.join(' | '))
  const columns = new RegExp(`\\.${classes[0]} \\{[^}]*grid-template-columns: ([^;]+);`).exec(DIALOG_CSS)[1]
  assert.equal(columns.trim().split(/ (?![^(]*\))/).length, 4)
})

test('Line styles: Dashed lines and Directional arrow lines each have an Enable box, with Dash length and Arrow spacing indented under them', () => {
  const html = renderEditor(editorState())
  assert.match(html, />Line styles</)
  assert.match(html, />Enable</)
  const dashed = /<input type="checkbox" id="pen-tool-extras-box-lineStyles-dashed" data-box="lineStyles.dashed" aria-label="Enable Dashed lines"( checked)?/.exec(html)
  const arrows = /<input type="checkbox" id="pen-tool-extras-box-lineStyles-arrows" data-box="lineStyles.arrows" aria-label="Enable Directional arrow lines"( checked)?/.exec(html)
  assert.equal(Boolean(dashed[1]) && Boolean(arrows[1]), true)
  assert.match(html, />Dashed lines<[\s\S]*data-box="lineStyles.dashed"[\s\S]*>Dash length<[\s\S]*>Directional arrow lines<[\s\S]*data-box="lineStyles.arrows"[\s\S]*>Arrow spacing</)
  assert.match(rowOf(html, 'dash'), /class="pen-tool-extras-label pen-tool-extras-under"/)
  assert.match(rowOf(html, 'arrowSpacing'), /class="pen-tool-extras-label pen-tool-extras-under"/)
  assert.match(DIALOG_CSS, /\.pen-tool-extras-label\.pen-tool-extras-under \{ padding-left: 1\.2em;/, 'the indent')
  assert.doesNotMatch(rowOf(html, 'dash'), /display:none/)
})

test('an unticked line style is drawn unticked and its slider row is hidden, the other is untouched; the slider keeps its value', () => {
  const html = renderEditor(editorState({ dash: 6, lineStyles: { dashed: false, arrows: true } }))
  assert.doesNotMatch(html, /data-box="lineStyles.dashed"[^>]* checked/)
  assert.match(rowOf(html, 'dash'), /display:none/)
  assert.match(rowOf(html, 'dash'), /value="6"/)
  assert.doesNotMatch(rowOf(html, 'arrowSpacing'), /display:none/)
})

test('Marks a click cycles through is one table: columns X Mark, Circle, Directions; rows Edge (three boxes) and Corner (X Mark and Circle)', () => {
  const html = renderEditor(editorState())
  assert.match(html, />Marks a click cycles through</)
  assert.doesNotMatch(html, /Edge marks a click|Corner marks a click/)
  assert.match(html, />X Mark<[\s\S]*>Circle<[\s\S]*>Directions<[\s\S]*>Edge<[\s\S]*data-box="marks.x"[\s\S]*data-box="marks.circle"[\s\S]*data-box="marks.directions"[\s\S]*>Corner<[\s\S]*data-box="marks.cornerX"[\s\S]*data-box="marks.cornerCircle"/)
  const boxes = [...html.matchAll(/<input type="checkbox" id="pen-tool-extras-box-marks-(\w+)" data-box="marks\.\w+" aria-label="([^"]+)" title="([^"]+)"( checked)?>/g)]
  assert.deepEqual(boxes.map((m) => [m[1], m[2], m[3]]), [
    ['x', 'Edge X Mark', 'Edge X Mark'], ['circle', 'Edge Circle', 'Edge Circle'], ['directions', 'Edge Directions', 'Edge Directions'],
    ['cornerX', 'Corner X Mark', 'Corner X Mark'], ['cornerCircle', 'Corner Circle', 'Corner Circle']
  ])
  assert.equal(boxes.every((m) => m[4] === ' checked'), true)
})

test('a mark box shows its picture only: no word label beside it, and Directions is one picture of all four arrows', () => {
  const html = renderEditor(editorState())
  assert.doesNotMatch(html, /<label for="pen-tool-extras-box-marks-/)
  const label = (key) => new RegExp(`<label[^>]*>(<input[^>]*data-box="marks.${key}"[^>]*>)(.*?)</label>`).exec(html)[2]
  assert.equal((label('directions').match(/<svg/g) || []).length, 1)
  assert.equal(label('directions').match(/M\d+ \d+ L\d+ \d+ L\d+ \d+/g).length, 4, 'four arrow heads')
  assert.doesNotMatch(label('x') + label('circle') + label('directions'), />[A-Za-z]/, 'no text')
})

test('Other: the White outline box has its own line with Outline width under it, hidden while the box is unticked, and the middle click box follows', () => {
  const html = renderEditor(editorState())
  assert.match(html, />Other</)
  assert.match(html, /<input type="checkbox" id="pen-tool-extras-box-outline" data-box="outline" checked[^>]*>\s*<label for="pen-tool-extras-box-outline"[^>]*>White outline on lines and marks<\/label>/)
  assert.equal(html.indexOf('data-box="outline"') < html.indexOf('data-setting="outlineWidth"') && html.indexOf('data-setting="outlineWidth"') < html.indexOf('data-box="middleErase"'), true)
  assert.match(rowOf(html, 'outlineWidth'), /class="pen-tool-extras-label pen-tool-extras-under"/)
  assert.match(DIALOG_CSS, /\.pen-tool-extras-label\.pen-tool-extras-under \{ padding-left: 1\.2em;/, 'the indent')
  assert.match(rowOf(html, 'outlineWidth'), /<label for="pen-tool-extras-setting-outlineWidth"[^>]*>Outline width<\/label>/)
  assert.doesNotMatch(rowOf(html, 'outlineWidth'), /display:none/)
  const off = renderEditor(editorState({ outline: false, outlineWidth: 5 }))
  assert.doesNotMatch(off, /data-box="outline" checked/)
  assert.match(rowOf(off, 'outlineWidth'), /display:none/)
  assert.match(rowOf(off, 'outlineWidth'), /value="5"/)
})

test('the middle click box is ticked unless the setting is off', () => {
  const box = (html) => /<input type="checkbox" id="pen-tool-extras-box-middleErase" data-box="middleErase"( checked)?[^>]*>\s*<label for="pen-tool-extras-box-middleErase"[^>]*>Middle click erases a whole line<\/label>/.exec(html)
  assert.equal(box(renderEditor(editorState()))[1], ' checked')
  assert.equal(box(renderEditor(editorState({ middleErase: false })))[1], undefined)
})

test('every section after the first has a divider above it, and Pen line mode is the last', () => {
  const html = renderEditor(editorState({ lineMode: 'both' }))
  const heads = ['Line settings', 'Line styles', 'Marks a click cycles through', 'Other', 'Pen line mode']
  heads.forEach((head) => assert.match(html, new RegExp(`<div class="pen-tool-extras-divider"></div><div[^>]*>(<span[^>]*>)?${head}<`), head))
  assert.match(DIALOG_CSS, /\.pen-tool-extras-divider \{ border-top: 1px solid #e3dff0;/)
  assert.equal(html.lastIndexOf('Pen line mode') > html.indexOf('Other'), true)
})

const HEADER = fs.readFileSync(path.join(__dirname, 'pen-tool-extras.user.js'), 'utf8')
const headerField = (name) => (new RegExp(`^// @${name}\\s+(.+)$`, 'm').exec(HEADER) || [])[1]

test('the header describes the script in Chris\'s approved intro and links its details page', () => {
  assert.equal(headerField('description'), 'Adds to SudokuPad\'s pen tool: pen colors that match your cell colors, dashed and arrow lines, and marks on cell edges and grid corners. Turn the pen tool on in SudokuPad\'s settings first.')
  assert.equal(headerField('homepageURL'), 'https://caneff.github.io/sudokupad-scripts/pen-tool-extras.html')
})

test('VERSION is the @version in the script header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, 'pen-tool-extras.user.js'), 'utf8')))
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
  // The picture itself: a stroked line and two closed triangles that are filled, since an unfilled triangle is an outline of an arrow, not one.
  const mask = rules.find((r) => r.selector === '.tool-pen button[data-key="1"][data-pen-page="3"]:after').body
  const svg = decodeURIComponent(/url\("data:image\/svg\+xml,([^"]+)"\)/.exec(mask)[1])
  const triangles = /<path d='([^']+)' fill='#000' stroke='none'\/>/.exec(svg)
  assert.ok(triangles, `the arrows are filled paths with no stroke: ${svg}`)
  assert.equal(triangles[1].split('Z').length - 1, 2, 'two closed arrows')
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
    assert.equal(wing[1] - tip[1], tip[1] - other[1], 'the wings are either side of the line')
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

test('below the default thickness the arrows keep their size at the default and only the line gets thinner, so the direction shows at 1', () => {
  const one = arrowLineAt('1', true, 0, 0, 1)
  const five = arrowLineAt('1', true, 0, 0, THICKNESS.fallback)
  assert.equal(one.arrows, five.arrows)
  assert.equal(one.lineWidth, 1, 'the line is as thick as a page 1 line, 1')
  assert.equal(one.lineWidth < five.lineWidth, true, `the line is ${one.lineWidth} at 1 and ${five.lineWidth} at 5`)
})

test('the line under the arrows is as thick as a page 1 line at every slider value, and the arrows clearly stick out past it', () => {
  for (let t = THICKNESS.min; t <= THICKNESS.max; t++) {
    const shape = arrowLineAt('a', true, 0, 0, t)
    assert.equal(shape.lineWidth, t, `the line at thickness ${t}`)
    // 'a' is the top edge line, so a point's distance from y 0 is its distance from the line's middle.
    const reach = Math.max(...pointsOf(shape.arrows).map(([, y]) => Math.abs(y)))
    assert.equal(reach - t / 2 >= Math.max(t / 2, 2), true, `at thickness ${t} the arrows stick out ${reach - t / 2} past a line ${t} wide`)
  }
})

test('the arrow sizes are the ruled ones: base 1.5 line widths out to each side, 2.25 long, one spacing of 5', () => {
  assert.deepEqual([ARROW_LINE.halfWidth, 2 * ARROW_LINE.halfLength, ARROW_LINE.line, ARROW_SPACING.fallback], [1.5, 2.25, 1, 5])
})

test('from thickness 5 up an arrow\'s base reaches ARROW_LINE.halfWidth (1.5) times the thickness to each side, it is twice ARROW_LINE.halfLength (1.125) times the thickness long, and the spacing scales with it', () => {
  for (const t of [5, 8, 10, 13, 16]) {
    const shape = arrowLineAt('a', true, 0, 0, t)
    const points = pointsOf(shape.arrows)
    const [first, tip] = points
    assert.equal(Math.abs(Math.max(...points.map(([, y]) => Math.abs(y))) - ARROW_LINE.halfWidth * t) < 0.01, true, `reach at ${t}`)
    assert.equal(Math.abs(Math.abs(tip[0] - first[0]) - 2 * ARROW_LINE.halfLength * t) < 0.01, true, `length at ${t}`)
  }
})

test('the arrow count at the default spacing of 5 is the worked one for each thickness: 3 at 5, 2 at 8, then 1', () => {
  const worked = { 5: 3, 8: 2, 10: 1, 13: 1, 16: 1 }
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

test('at the largest thickness an arrow on a grid\'s outer edge reaches no further than Dark Page keeps (SOLVER_REACH)', () => {
  // a top edge line, 'a', on row 0: the arrow's base corners are the furthest from the edge itself
  const shape = arrowLineAt('a', true, 0, 0, THICKNESS.max)
  const reach = Math.max(...pointsOf(shape.arrows).map(([, y]) => Math.abs(y)))
  assert.equal(Math.abs(reach - ARROW_LINE.halfWidth * THICKNESS.max) < 0.01, true, `the drawn reach ${reach} is the ARROW_LINE size at the largest thickness`)
  assert.equal(reach <= SOLVER_REACH, true, `reach ${reach} against ${SOLVER_REACH}, on a board with cells up to about ${Math.round(SOLVER_REACH / reach * 64)} units (px) wide`)
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

test('buildOutlineCss is empty when the outline is off and filters the pen layer, and only it, when on', () => {
  assert.equal(buildOutlineCss(false), '')
  assert.equal(buildOutlineCss(true), `:root:root #cell-pen { filter: url(#${OUTLINE_FILTER_ID}); }`)
  assert.doesNotMatch(buildOutlineCss(true), /penhint|pen-tool-extras-hint/)
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

test('arrow spacing runs 3 to 12 line widths in whole steps and starts at 5, and the arrow spacing setting keeps a saved whole number in range', () => {
  assert.deepEqual(ARROW_SPACING, { min: 3, max: 12, step: 1, fallback: 5 })
  for (const ok of [3, 5, 12]) assert.equal(SETTINGS.arrowSpacing.normalize(ok), ok)
  for (const bad of [undefined, null, 2, 13, 4.5, '6', true, {}, []]) assert.equal(SETTINGS.arrowSpacing.normalize(bad), 5, JSON.stringify(bad))
})

test('middle click erase is on unless saved as the boolean false', () => {
  assert.equal(SETTINGS.middleErase.normalize(false), false)
  for (const ok of [true, undefined, null, 0, 'false', {}, []]) assert.equal(SETTINGS.middleErase.normalize(ok), true, JSON.stringify(ok))
})

test('both line styles are enabled unless saved as the boolean false, each on its own; saved junk enables both', () => {
  assert.deepEqual(SETTINGS.lineStyles.normalize(undefined), { dashed: true, arrows: true })
  assert.deepEqual(SETTINGS.lineStyles.normalize({ dashed: false }), { dashed: false, arrows: true })
  assert.deepEqual(SETTINGS.lineStyles.normalize({ arrows: false }), { dashed: true, arrows: false })
  assert.deepEqual(SETTINGS.lineStyles.normalize({ dashed: false, arrows: false }), { dashed: false, arrows: false })
  for (const bad of [null, 0, 'no', [false, false], { dashed: 0, arrows: 'no' }]) assert.deepEqual(SETTINGS.lineStyles.normalize(bad), { dashed: true, arrows: true }, JSON.stringify(bad))
})

test('a wider arrow spacing gives fewer arrows on the same segment and the spacing sets their distance', () => {
  const count = (spacing) => pointsOf(arrowLineAt('1', true, 0, 0, 5, spacing).arrows).length / 3
  assert.deepEqual([count(3), count(5), count(12)], [4, 3, 1])
  assert.equal(count(3) > count(5) && count(5) > count(12), true, `${count(3)}, ${count(5)}, ${count(12)}`)
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

test('eraseLineActs removes each value from its own cells as one select and one bare pen action per value', () => {
  const cellAt = (row, col) => ({ row, col })
  const acts = eraseLineActs([seg('1', 0, 0, 'j'), seg('2', 0, 1), seg('1', 0, 2, 'k')], cellAt)
  assert.deepEqual(acts, [
    { type: 'select', arg: [{ row: 0, col: 0 }, { row: 0, col: 2 }] },
    { type: 'pen', arg: '1' },
    { type: 'deselect' },
    { type: 'select', arg: [{ row: 0, col: 1 }] },
    { type: 'pen', arg: '2' }
  ])
  assert.deepEqual(eraseLineActs([], cellAt), [])
})

// A step with its warnings and skipped labels caught.
const newStep = (onSkip) => {
  const warned = []
  const skipped = []
  const warn = console.warn
  console.warn = (...args) => warned.push(args)
  const step = createStep('marks', skipped, onSkip)
  return { step, warned, skipped, restore: () => { console.warn = warn } }
}

test('a throw in a step\'s own code skips it, warns once naming it, and the fallback answers from then on', (t) => {
  const { step, warned, skipped, restore } = newStep()
  t.after(restore)
  const boom = new TypeError('x is not a function')
  let runs = 0
  const run = () => { runs++; throw boom }
  assert.equal(step.run(run, () => 'fallback'), 'fallback')
  assert.equal(step.run(run, () => 'again'), 'again')
  assert.equal(runs, 1, 'a skipped step is not run again')
  assert.deepEqual(warned, [['pen-tool-extras: marks skipped because SudokuPad changed:', boom]])
  assert.deepEqual(skipped, ['marks'])
})

test('a step that works runs, keeps its result and warns nothing', (t) => {
  const { step, warned, restore } = newStep()
  t.after(restore)
  assert.equal(step.run(() => 42, () => 'fallback'), 42)
  assert.deepEqual(warned, [])
})

test('a wrapper whose own code throws after SudokuPad\'s call answers with that call\'s result, without calling it twice, and is stock from then on', (t) => {
  const { step, warned, restore } = newStep()
  t.after(restore)
  const calls = []
  let ownRuns = 0
  const owner = { click (n) { calls.push(n); return n * 10 } }
  step.wrap(owner, 'click', (stock, n) => { ownRuns++; stock(n); throw new Error('own') })
  assert.equal(owner.click(1), 10)
  assert.deepEqual(calls, [1])
  assert.equal(owner.click(2), 20)
  assert.deepEqual(calls, [1, 2])
  assert.equal(ownRuns, 1, 'the wrapper\'s own code does not run once the step is skipped')
  assert.equal(warned.length, 1)
})

test('a wrapper whose own code throws after another SudokuPad function ran for the event does not call the original', (t) => {
  const { step, warned, restore } = newStep()
  t.after(restore)
  const sent = []
  const owner = { click () { sent.push('stock click') }, send (act) { sent.push(act) } }
  step.wrap(owner, 'click', function (stock) { stock.sudokupad(() => this.send('mark')); throw new Error('own') })
  assert.equal(owner.click(), undefined)
  assert.deepEqual(sent, ['mark'], 'the click is not sent a second time')
  assert.equal(warned.length, 1)
})

test('a wrapper whose own code throws after a SudokuPad call that sends nothing still calls the original', (t) => {
  const { step, restore } = newStep()
  t.after(restore)
  const sent = []
  const owner = { click () { sent.push('stock click') }, peek () { return 'queued' } }
  step.wrap(owner, 'click', function (stock) { stock.sudokupad(() => this.peek(), false); throw new Error('own') })
  owner.click()
  assert.deepEqual(sent, ['stock click'])
})

test('a throw from a SudokuPad function called through stock.sudokupad passes through, is not retried and leaves the step on', (t) => {
  const { step, warned, skipped, restore } = newStep()
  t.after(restore)
  const stockError = new TypeError('render failed')
  const sent = []
  const owner = { click () { sent.push('stock click') }, send (act) { sent.push(act); throw stockError } }
  step.wrap(owner, 'click', function (stock) { stock.sudokupad(() => this.send('mark')) })
  assert.throws(() => owner.click(), (error) => error === stockError)
  assert.deepEqual(sent, ['mark'])
  assert.deepEqual([warned, skipped], [[], []])
})

test('a wrapper whose own code throws before SudokuPad\'s call makes that call with the arguments it was given', (t) => {
  const { step, restore } = newStep()
  t.after(restore)
  const owner = { name: 'pen', click (n) { return `${this.name} ${n}` } }
  step.wrap(owner, 'click', () => { throw new Error('own') })
  assert.equal(owner.click(3), 'pen 3')
})

test('a throw in SudokuPad\'s own function passes through a wrapper and leaves the step on', (t) => {
  const { step, warned, skipped, restore } = newStep()
  t.after(restore)
  const stockError = new TypeError('SudokuPad broke')
  let fail = true
  const owner = { click () { if (fail) throw stockError; return 'stock' } }
  step.wrap(owner, 'click', (stock) => `own ${stock()}`)
  assert.throws(() => owner.click(), (error) => error === stockError)
  fail = false
  assert.equal(owner.click(), 'own stock')
  assert.deepEqual([warned, skipped], [[], []])
})

test('a step skipped puts back what it changed once, and a failure there is warned, not thrown', (t) => {
  let undone = 0
  const { step, warned, restore } = newStep(() => { undone++; throw new Error('undo') })
  t.after(restore)
  step.run(() => { throw new Error('own') })
  step.skip(new Error('again'))
  assert.equal(undone, 1)
  assert.equal(warned.length, 2)
  assert.match(warned[1][0], /^pen-tool-extras: could not undo marks/)
})

test('a step skipped for a missing internal is quiet and puts nothing back: nothing was installed', (t) => {
  let undone = 0
  const { step, warned, skipped, restore } = newStep(() => { undone++ })
  t.after(restore)
  step.skip('getInputRc', false)
  assert.equal(step.run(() => 'ran', () => 'fallback'), 'fallback')
  assert.deepEqual([warned, skipped, undone], [[], ['marks'], 0])
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
    middleErase: ['PenColor_middleerase', true],
    lineStyles: ['PenColor_linestyles', { dashed: true, arrows: true }],
    show: ['PenColor_sliders', { thickness: true, opacity: true }],
    marks: ['EdgeMarks_marks', ALL]
  })
})

// A store that keeps what is saved, as SudokuPad's own does between a save and the next read.
function memoryStore (saved = {}) {
  return { saved, getData: (key) => saved[key], setData: (key, value) => { saved[key] = value }, removeData: (key) => { delete saved[key] } }
}

test('the marks a save writes read back the same, and so do marks saved under the old circle names', () => {
  const unticked = { ...ALL, circle: false, cornerCircle: false }
  const store = memoryStore()
  const current = settingDefaults()
  saveChangedSettings(store, { ...current, marks: unticked }, current)
  assert.deepEqual(readSettings(store).marks, unticked)
  const oldSave = memoryStore({ EdgeMarks_marks: { x: true, directions: true, dot: false, cornerX: true, cornerDot: false } })
  assert.deepEqual(readSettings(oldSave).marks, unticked)
})

test('saving one mark unticked writes the key, and saving all five ticked removes it so the next read is all ticked', () => {
  const store = memoryStore()
  const current = settingDefaults()
  assert.deepEqual(saveChangedSettings(store, { ...current, marks: { ...ALL, directions: false } }, current), ['marks'])
  assert.deepEqual(store.saved, { EdgeMarks_marks: { ...ALL, directions: false } })
  assert.deepEqual(saveChangedSettings(store, { ...current, marks: ALL }, current), ['marks'])
  assert.deepEqual(store.saved, {})
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
  assert.equal(SETTINGS.middleErase.effect(), undefined)
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
  const read = readSettings({ getData: (key) => saved[key] })
  assert.deepEqual(read, {
    ...settingDefaults(),
    thickness: 9,
    outline: false,
    show: { thickness: true, opacity: false }
  })
})

test('settingDefaults holds every row\'s default', () => {
  assert.deepEqual(settingDefaults(), { thickness: 5, opacity: 80, dash: 3, arrowSpacing: 5, outlineWidth: 2, outline: true, middleErase: true, lineStyles: { dashed: true, arrows: true }, show: { thickness: true, opacity: true }, marks: ALL })
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

// The requirement table: which SudokuPad internal each install step cannot work without.
const TOOL_FNS = ['actStart', 'actAdd', 'actSend', 'clickCell', 'getInputRc', 'setSelectedColor', 'handleToolEnter', 'handleToolExit', 'drawLineHint']
// A SudokuPad stand-in with every internal the steps need.
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
  return { app, tool }
}

test('a complete SudokuPad lacks nothing', () => {
  const { app, tool } = completeSudokuPad()
  assert.deepEqual(lackingInternals(app, tool), new Map())
})

// Each internal removed alone, and the steps it holds back.
const LACKING_ALONE = [
  ...['actStart', 'actAdd', 'actSend', 'clickCell', '_actList'].map((name) => [name, (s) => { delete s.tool[name] }, ['arrowLines', 'marks', 'lineErase']]),
  ['getInputRc', (s) => { delete s.tool.getInputRc }, ['marks']],
  ['setSelectedColor', (s) => { delete s.tool.setSelectedColor }, ['pages']],
  ['handleToolEnter', (s) => { delete s.tool.handleToolEnter }, ['pages']],
  ['handleToolExit', (s) => { delete s.tool.handleToolExit }, ['pages']],
  ['drawLineHint', (s) => { delete s.tool.drawLineHint }, ['dragHint']],
  ['getCell', (s) => { delete s.app.grid.getCell }, ['marks', 'lineErase']],
  ['puzzle.cells', (s) => { delete s.app.puzzle.cells }, ['arrowLines', 'marks', 'lineErase']],
  ['grid.rows', (s) => { s.app.grid.rows = '9' }, ['marks']],
  ['grid.cols', (s) => { s.app.grid.cols = 9.5 }, ['marks']],
  ['CellSize', (s) => { delete s.app.svgRenderer.constructor.CellSize }, ['marks']],
  ['rcToPathData', (s) => { delete s.app.svgRenderer.constructor.rcToPathData }, ['marks']],
  ['renderPen', (s) => { delete Object.getPrototypeOf(s.app.svgRenderer).renderPen }, ['arrowLines', 'marks']],
  ['renderPart', (s) => { delete s.app.svgRenderer.renderPart }, ['arrowLines']],
  ['xyToRCExact', (s) => { delete s.app.xyToRCExact }, ['lineErase']],
  ['tools.colour', (s) => { delete s.app.tools.colour }, ['colors']]
]
for (const [internal, remove, featureNames] of LACKING_ALONE) {
  test(`without ${internal}, exactly ${featureNames.join(', ')} are lacking`, () => {
    const stub = completeSudokuPad()
    remove(stub)
    assert.deepEqual(lackingInternals(stub.app, stub.tool), new Map([[internal, featureNames]]))
  })
}

test('every step with a requirement is lacking under some internal removed alone', () => {
  // gear needs nothing of SudokuPad's, and penPanel needs ToolPen.tool (the next test).
  const own = Object.keys(STEP_LABELS).filter((name) => !['gear', 'penPanel'].includes(name))
  assert.deepEqual([...new Set(LACKING_ALONE.flatMap(([, , names]) => names))].sort(), own.sort())
})

test('without a pen tool, every step that needs it is reported under the first internal it lacks', () => {
  const { app } = completeSudokuPad()
  assert.deepEqual(lackingInternals(app, undefined), new Map([
    ['setSelectedColor', ['pages']],
    ['actStart', ['arrowLines', 'marks', 'lineErase']],
    ['drawLineHint', ['dragHint']],
    ['ToolPen.tool', ['penPanel']]
  ]))
})

// The startup guard: a page with no Framework is not SudokuPad and stays silent; a Framework without getApp is a SudokuPad the script cannot hook, which it reports.
function loadWithFramework (framework) {
  const file = require.resolve('./pen-tool-extras.user.js')
  const warnings = []
  const warn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  if (framework !== undefined) global.Framework = framework
  delete require.cache[file]
  try {
    require(file)
  } finally {
    console.warn = warn
    delete global.Framework
    delete require.cache[file]
  }
  return warnings
}

test('a Framework with no getApp is reported once, naming the script', () => {
  assert.deepEqual(loadWithFramework({}), ['pen-tool-extras: SudokuPad\'s Framework has no getApp, so nothing was changed'])
})

test('a page with no Framework is left alone without a word', () => {
  assert.deepEqual(loadWithFramework(undefined), [])
})
