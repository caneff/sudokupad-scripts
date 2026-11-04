'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const {
  normalizeColors, buildCss, DEFAULT_COLORS, parseColor, isTransparent, darkenColor, penColorsFromPage, savedColors, editedColors,
  HOLD_TO_EDIT_MS, normalizeThickness, buildThicknessCss, normalizeOpacity, buildOpacityCss, renderPanelSliders, renderEditor, markGrowthScale, DASH, normalizeDash, normalizeSliderVisibility, OPACITY, THICKNESS, FULL_WIDTH_VALUES, LIGHTNESS_FACTOR, GREY_CHROMA, COLOR_TOOL_WAIT_MS, VERSION,
  stepType, EDGE_CYCLE, planClick, normalizeMarkSettings, shapeOf, shapePath, DEFAULT_MARK_SETTINGS,
  CORNER_RADIUS, CORNER_VALUES, cornerAt, cornerStorage, cornerPoint, cornerMarkOf, planCornerClick,
  PEN_PAGES, penPageOf, penNumber, penCharOn, normalizePen, stepPage, buildPagesCss, renderPageIcon, normalizeLineMode, LINE_MODES,
  LINE_VALUES, directionCharOf, chevronWayOf, CHEVRON, lineSegment, splitLineActs, chevronLine
} = require('./pen-tool-extras.user.js')
const { SOLVER_REACH } = require('./dark-page.user.js')

// The edge cycle, a step forward and a step back.
const nextType = (current, settings) => stepType(current, settings, 1, EDGE_CYCLE)
const previousType = (current, settings) => stepType(current, settings, -1, EDGE_CYCLE)

// SudokuPad's tool-pen.css (v0.611.0) as #rrggbb, typed out here as the independent source.
// Pen color 9 is written there as rgb(-36, -36, -36), which clamps to black.
const TABLE = {
  1: '#1f8020', 2: '#e87cf1', 3: '#e49632', 4: '#f53a37', 5: '#d2be32', 6: '#3d99f5', 7: '#d6d6d6', 8: '#7c7c7c', 9: '#000000'
}

test('the default colors are SudokuPad\'s own nine pen colors', () => {
  assert.deepEqual(DEFAULT_COLORS, TABLE)
})

test('nothing saved is the fresh-install state: every pen color has its default', () => {
  assert.deepEqual(normalizeColors(null), TABLE)
  assert.deepEqual(normalizeColors(undefined), TABLE)
})

test('corrupt saved data falls back to the default colors', () => {
  for (const bad of ['red', 7, true, [], ['#ff0000'], '{"1":"#ff0000"}']) {
    assert.deepEqual(normalizeColors(bad), TABLE, JSON.stringify(bad))
  }
})

test('a saved #rrggbb color is kept, lowercased', () => {
  assert.deepEqual(normalizeColors({ 4: '#FF0000' }), { ...TABLE, 4: '#ff0000' })
})

test('a saved entry that is not a #rrggbb color falls back to that pen color\'s default', () => {
  const saved = { 2: 'red', 3: '#abc', 4: 7, 5: null, 6: undefined, 0: '#00ff00', 10: '#00ff00', x: '#00ff00', 9: '#00ff00;}body{display:none' }
  assert.deepEqual(normalizeColors(saved), TABLE)
})

test('a saved color with junk before it, or a non-string entry, falls back to that pen color\'s default', () => {
  const saved = { 1: 'x;}body{display:none}#ff0000', 2: ['#ff0000'], 3: { toLowerCase: () => '#ff0000' } }
  assert.deepEqual(normalizeColors(saved), TABLE)
})

test('saved data that is an array is not read by index', () => {
  assert.deepEqual(normalizeColors(['x', '#ff0000']), TABLE)
})

test('the result has exactly nine keys, whatever was saved', () => {
  assert.deepEqual(Object.keys(normalizeColors({ 10: '#ff0000', 0: '#ff0000' })), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
})

test('normalizeColors returns a copy, never the saved object or the defaults', () => {
  const saved = { 1: '#ff0000' }
  assert.notEqual(normalizeColors(saved), saved)
  assert.notEqual(normalizeColors(null), DEFAULT_COLORS)
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
  // Light yellow and light gray, the lightest of the default cell colors.
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

test('penColorsFromPage maps index N of the page to pen color N, darkened', () => {
  const r = penColorsFromPage(PAGE_KEYS, (k) => CELL[k])
  assert.deepEqual(r.missing, [])
  assert.deepEqual(Object.keys(r.colors), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  assert.equal(r.colors[1], darkenColor([214, 214, 214]))
  assert.equal(r.colors[3], '#000000')
  assert.equal(r.colors[9], darkenColor([61, 153, 245]))
})

test('penColorsFromPage reads pen N from index N of the page, never index 0, even when index 0 holds a color', () => {
  const page = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  const read = (k) => ({ 0: 'rgb(250, 250, 250)', 1: 'rgb(204, 51, 17)', 2: 'rgb(17, 119, 51)', 3: 'rgb(238, 153, 170)', 4: 'rgb(0, 68, 136)', 5: 'rgb(187, 85, 0)', 6: 'rgb(0, 153, 136)', 7: 'rgb(170, 51, 170)', 8: 'rgb(136, 136, 34)', 9: 'rgb(120, 80, 200)' })[k]
  const r = penColorsFromPage(page, read)
  assert.deepEqual(r.missing, [])
  assert.equal(r.colors[1], darkenColor([204, 51, 17]))
  assert.equal(r.colors[2], darkenColor([17, 119, 51]))
  assert.equal(r.colors[9], darkenColor([120, 80, 200]))
  for (const n of PEN_NUMBERS) assert.notEqual(r.colors[n], darkenColor([250, 250, 250]))
})

test('penColorsFromPage keeps SudokuPad\'s pen color at a transparent middle entry, lists it as missing, and shifts nothing', () => {
  const page = ['0', '1', '2', '3', '4']
  const read = (k) => ({ 0: 'transparent', 1: 'rgb(204, 51, 17)', 2: 'transparent', 3: 'rgb(17, 119, 51)', 4: 'rgb(238, 153, 170)' })[k]
  const r = penColorsFromPage(page, read)
  assert.deepEqual(r.missing, [2, 5, 6, 7, 8, 9])
  assert.equal(r.colors[1], darkenColor([204, 51, 17]))
  assert.equal(r.colors[2], DEFAULT_COLORS[2])
  assert.equal(r.colors[3], darkenColor([17, 119, 51]))
  assert.equal(r.colors[4], darkenColor([238, 153, 170]))
  for (const n of [5, 6, 7, 8, 9]) assert.equal(r.colors[n], DEFAULT_COLORS[n])
})

test('penColorsFromPage keeps an unreadable color\'s place: its pen color keeps SudokuPad\'s own, and later colors do not shift up', () => {
  const page = ['a', 'b', 'c', 'd', 'e']
  const read = (k) => ({ a: 'transparent', b: 'rgb(204, 51, 17)', c: 'unparseable', d: 'rgb(238, 153, 170)', e: 'rgb(17, 119, 51)' })[k]
  const r = penColorsFromPage(page, read)
  assert.equal(r.colors[1], darkenColor([204, 51, 17]))
  assert.equal(r.colors[2], DEFAULT_COLORS[2])
  assert.equal(r.colors[3], darkenColor([238, 153, 170]))
  assert.equal(r.colors[4], darkenColor([17, 119, 51]))
  assert.deepEqual(r.missing, [2, 5, 6, 7, 8, 9])
})

const hueful = ['rgb(204, 51, 17)', 'rgb(17, 119, 51)', 'rgb(0, 68, 136)', 'rgb(187, 85, 0)']
const pageOf = (colors) => ['transparent', ...colors]
const penColors = (colors) => penColorsFromPage(pageOf(colors).map((_, i) => String(i)), (k) => pageOf(colors)[k]).colors

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
  const r = penColorsFromPage(page, read)
  assert.equal(r.colors[1], darkenColor([204, 51, 17]))
  assert.equal(r.colors[2], '#000000')
  assert.equal(r.colors[3], darkenColor([17, 119, 51]))
  for (const n of [4, 5, 6, 7, 8, 9]) assert.equal(r.colors[n], DEFAULT_COLORS[n])
})

test('SudokuPad\'s default first page keeps its result: index 3 is already black and stays the darkest', () => {
  const r = penColorsFromPage(PAGE_KEYS, (k) => CELL[k])
  assert.equal(r.colors[1], darkenColor([214, 214, 214]))
  assert.equal(r.colors[2], darkenColor([124, 124, 124]))
  assert.equal(r.colors[3], '#000000')
})

test('penColorsFromPage ignores entries past index 9', () => {
  const keys = 'abcdefghijkl'.split('')
  const r = penColorsFromPage(keys, () => 'rgb(204, 51, 17)')
  assert.deepEqual(r.missing, [])
  assert.equal(Object.keys(r.colors).length, 9)
})

test('penColorsFromPage on an empty page keeps all nine SudokuPad colors', () => {
  const r = penColorsFromPage([], () => 'rgb(1, 2, 3)')
  assert.deepEqual(r.colors, DEFAULT_COLORS)
  assert.deepEqual(r.missing, [1, 2, 3, 4, 5, 6, 7, 8, 9])
})

test('savedColors is null when nothing usable was saved, so the derived colors apply', () => {
  for (const none of [null, undefined, 'red', 7, true, [], ['#ff0000'], {}, { 4: 'url(x)' }, { 0: '#ff0000' }]) {
    assert.equal(savedColors(none), null, JSON.stringify(none))
  }
})

test('savedColors keeps a saved set whole, filling a bad entry with the default', () => {
  assert.deepEqual(savedColors({ 4: '#FF0000', 5: 'nope' }), { ...TABLE, 4: '#ff0000' })
})

test('savedColors does not read an array by index', () => {
  // Index 1 holds a usable color: only the array guard stops it counting as pen color 1.
  assert.equal(savedColors(['x', '#ff0000', '#00ff00']), null)
})

test('the wait for the color tool is a positive number of milliseconds', () => {
  assert.ok(COLOR_TOOL_WAIT_MS > 0)
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

test('normalizeThickness keeps a saved whole number from 1 to 16', () => {
  for (const ok of [1, 5, 8, 12, 16]) assert.equal(normalizeThickness(ok), ok)
})

test('normalizeThickness falls back to 5 for nothing saved and for anything untrusted', () => {
  for (const bad of [null, undefined, 0, 17, -3, 2.5, NaN, Infinity, '7', [7], { a: 7 }, true]) {
    assert.equal(normalizeThickness(bad), 5, String(bad))
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

// The width each pen value draws at: its stroke width times its scale, as a string.
function widthsOf (css) {
  return Object.fromEntries(Object.entries(rulesByValue(css)).map(([v, { width, scale }]) => [v, String(Math.round(width * scale * 1e6) / 1e6)]))
}

// The scale each pen value's rule gives it, 1 where it has none.
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

test('edge marks and corner marks keep today\'s size up to the default thickness of 5 and grow gradually above it, to 1.3 times at 16', () => {
  for (const t of [1, 3, 5]) assert.equal(markGrowthScale(t), 1, String(t))
  assert.equal(markGrowthScale(16), 1.3)
  const grown = [6, 10, 16].map(markGrowthScale)
  assert.equal(grown[0] > 1 && grown[0] < grown[1] && grown[1] < grown[2], true, grown.join(' < '))
  assert.equal(Math.abs(markGrowthScale(10) - (1 + 0.3 * 5 / 11)) < 1e-3, true)
})

test('the scale lands on every edge and corner mark and on no line, and a mark stays centred on its edge or corner while it grows', () => {
  const css = buildThicknessCss(16)
  const scales = scalesOf(css)
  const marks = ['3', '4', 'b', 'c', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y']
  for (const v of marks) assert.equal(scales[v], 1.3, v)
  for (const v of FULL_WIDTH_VALUES) assert.equal(scales[v], 1, v)
  const rule = css.split('\n').find((r) => r.includes('.pen-3,'))
  assert.match(rule, /transform-box: fill-box; transform-origin: center;/)
})

test('a grown mark is as thick as before: its stroke width is shrunk by the scale, so only its length grows', () => {
  const widths = widthsOf(buildThicknessCss(16))
  for (const v of ['3', 'h', 'o', 's', 't', 'y']) assert.equal(widths[v], '8', v)
  const rule = buildThicknessCss(16).split('\n').find((r) => r.includes('.pen-3,'))
  assert.match(rule, /stroke-width: 6\.1538\d*;/)
})

test('lines are never scaled', () => {
  const lines = buildThicknessCss(16).split('\n').find((r) => r.includes('.pen-1,'))
  assert.equal(lines.includes('transform'), false)
})

test('buildThicknessCss refuses a thickness it cannot save', () => {
  assert.throws(() => buildThicknessCss(0), RangeError)
  assert.throws(() => buildThicknessCss(17), RangeError)
  assert.throws(() => buildThicknessCss('5'), RangeError)
  assert.throws(() => buildThicknessCss(2.5), RangeError)
})

test('the opacity runs 20 to 100 percent in steps of 5 from SudokuPad\'s own pen opacity of 80', () => {
  assert.deepEqual(OPACITY, { min: 20, max: 100, step: 5, fallback: 80 })
})

test('normalizeOpacity keeps a saved whole number from 20 to 100 on the slider\'s steps', () => {
  for (const ok of [20, 55, 80, 100]) assert.equal(normalizeOpacity(ok), ok)
})

test('normalizeOpacity falls back to 80 for nothing saved and for anything untrusted', () => {
  for (const bad of [null, undefined, 0, 19, 105, -80, 82, 80.5, NaN, Infinity, '70', [70], { a: 70 }, true]) {
    assert.equal(normalizeOpacity(bad), 80, String(bad))
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

// The id, range and value of each range input in markup, in order.
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

test('buildOpacityCss refuses an opacity it cannot save', () => {
  assert.throws(() => buildOpacityCss(15), RangeError)
  assert.throws(() => buildOpacityCss(105), RangeError)
  assert.throws(() => buildOpacityCss('80'), RangeError)
  assert.throws(() => buildOpacityCss(82), RangeError)
})

test('the hold that opens edit mode lasts 1000 ms, the same as SudokuPad\'s color tool', () => {
  assert.equal(HOLD_TO_EDIT_MS, 1000)
})

const ALL = { x: true, directions: true, dot: true, cornerX: true, cornerDot: true }
const NONE = { x: false, directions: false, dot: false, cornerX: false, cornerDot: false }

test('fresh install has every mark ticked', () => {
  assert.deepEqual(DEFAULT_MARK_SETTINGS, ALL)
  assert.deepEqual(normalizeMarkSettings(null), ALL)
  assert.deepEqual(normalizeMarkSettings(undefined), ALL)
})

test('corrupt saved settings fall back to every mark ticked', () => {
  for (const bad of ['x', 7, true, [], [false], '{"x":false}']) {
    assert.deepEqual(normalizeMarkSettings(bad), ALL, JSON.stringify(bad))
  }
})

test('a saved boolean is kept and a non-boolean entry takes its default', () => {
  assert.deepEqual(normalizeMarkSettings({ x: false, directions: 'no', dot: false, cornerX: 'no', cornerDot: false }), { x: false, directions: true, dot: false, cornerX: true, cornerDot: false })
})

test('with everything ticked the cycle is X, direction, other direction, circle, empty', () => {
  const seen = []
  let type = 'empty'
  for (let i = 0; i < 5; i++) {
    type = nextType(type, ALL)
    seen.push(type)
  }
  assert.deepEqual(seen, ['x', 'dirA', 'dirB', 'dot', 'empty'])
})

test('an unticked type is skipped', () => {
  assert.equal(nextType('empty', { x: false, directions: true, dot: true }), 'dirA')
  assert.equal(nextType('dirB', { x: true, directions: true, dot: false }), 'empty')
  assert.equal(nextType('x', { x: true, directions: false, dot: true }), 'dot')
  assert.equal(nextType('empty', { x: false, directions: false, dot: true }), 'dot')
  assert.equal(nextType('dot', { x: false, directions: false, dot: true }), 'empty')
})

test('Directions is one box: both directions or neither', () => {
  const only = { x: false, directions: true, dot: false }
  assert.equal(nextType('empty', only), 'dirA')
  assert.equal(nextType('dirA', only), 'dirB')
  assert.equal(nextType('dirB', only), 'empty')
})

test('a mark whose type is unticked moves to the next ticked mark, or to empty', () => {
  assert.equal(nextType('x', { x: false, directions: false, dot: true }), 'dot')
  assert.equal(nextType('x', { x: false, directions: false, dot: false }), 'empty')
  assert.equal(nextType('dot', { x: true, directions: false, dot: false }), 'empty')
})

test('with everything ticked the backward cycle is empty, circle, other direction, direction, X, empty', () => {
  const seen = []
  let type = 'empty'
  for (let i = 0; i < 5; i++) {
    type = previousType(type, ALL)
    seen.push(type)
  }
  assert.deepEqual(seen, ['dot', 'dirB', 'dirA', 'x', 'empty'])
})

test('going backwards from empty lands on the last ticked mark, and from the X on empty', () => {
  assert.equal(previousType('empty', { x: true, directions: true, dot: false }), 'dirB')
  assert.equal(previousType('empty', { x: true, directions: false, dot: false }), 'x')
  assert.equal(previousType('x', ALL), 'empty')
  assert.equal(previousType('empty', NONE), 'empty')
})

test('going backwards skips an unticked type', () => {
  assert.equal(previousType('dot', { x: true, directions: false, dot: true }), 'x')
  assert.equal(previousType('dirA', { x: false, directions: true, dot: true }), 'empty')
  assert.equal(previousType('dot', { x: false, directions: true, dot: true }), 'dirB')
})

test('a mark whose type is unticked moves back to the previous ticked mark, or to empty', () => {
  assert.equal(previousType('dot', { x: true, directions: false, dot: false }), 'x')
  assert.equal(previousType('dirB', { x: false, directions: false, dot: true }), 'empty')
  assert.equal(previousType('dirA', NONE), 'empty')
})

test('backwards on a right edge goes empty, j, i, h, 3, empty', () => {
  assert.deepEqual(planClick('3', [], ALL, true), { remove: [], add: 'j' })
  assert.deepEqual(planClick('3', ['j'], ALL, true), { remove: ['j'], add: 'i' })
  assert.deepEqual(planClick('3', ['i'], ALL, true), { remove: ['i'], add: 'h' })
  assert.deepEqual(planClick('3', ['h'], ALL, true), { remove: ['h'], add: '3' })
  assert.deepEqual(planClick('3', ['3'], ALL, true), { remove: ['3'], add: null })
})

test('backwards with nothing ticked does nothing', () => {
  assert.equal(planClick('3', ['3'], NONE, true), null)
})

test('a click on an empty right edge adds the X, which is the character 3', () => {
  assert.deepEqual(planClick('3', [], ALL), { remove: [], add: '3' })
})

test('the cycle on a right edge uses 3, h, i, j then clears', () => {
  assert.deepEqual(planClick('3', ['3'], ALL), { remove: ['3'], add: 'h' })
  assert.deepEqual(planClick('3', ['h'], ALL), { remove: ['h'], add: 'i' })
  assert.deepEqual(planClick('3', ['i'], ALL), { remove: ['i'], add: 'j' })
  assert.deepEqual(planClick('3', ['j'], ALL), { remove: ['j'], add: null })
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
  assert.deepEqual(planClick('3', ['3', 'm', '5'], ALL), { remove: ['3'], add: 'h' })
})

test('with nothing ticked the click does nothing, and an existing mark stays', () => {
  assert.equal(planClick('3', [], NONE), null)
  assert.equal(planClick('3', ['3'], NONE), null)
  assert.equal(planClick('4', ['k'], NONE), null)
})

test('an unticked mark already on the grid moves to the next ticked mark', () => {
  assert.deepEqual(planClick('3', ['3'], { ...NONE, dot: true }), { remove: ['3'], add: 'j' })
})

test('two marks on one edge, as a replay can hold, both go on the next click', () => {
  assert.deepEqual(planClick('3', ['3', 'j'], ALL), { remove: ['3', 'j'], add: 'h' })
})

test('shapeOf names the arrow each character draws, per edge', () => {
  assert.deepEqual(['h', 'i', 'j'].map(shapeOf), ['>', '<', 'o'])
  assert.deepEqual(['k', 'l', 'm'].map(shapeOf), ['^', 'v', 'o'])
  assert.deepEqual(['n', 'o', 'p'].map(shapeOf), ['>', '<', 'o'])
  assert.deepEqual(['q', 'r', 's'].map(shapeOf), ['^', 'v', 'o'])
  for (const other of ['3', '4', 'b', 'c', '0', '5', 'a', 'g', 't', 'z']) {
    assert.equal(shapeOf(other), null, other)
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
  // 64 unit cell's quarter, against 11.3 before and a 7 unit point before that.
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

test('an arrow is a two-segment chevron pointing the way it names', () => {
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
  assert.deepEqual(normalizeMarkSettings({ x: true, directions: false, dot: true }), { ...ALL, directions: false })
})

test('the corner zone is 0.2 of a cell from a grid corner', () => {
  assert.equal(CORNER_RADIUS, 0.2)
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

// Every grid corner of a rows x cols grid.
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
      assert.equal(shapeOf(value), null, `${value} is an edge character`)
      assert.equal(used.has(value), false, value)
      used.add(value)
    }
  }
  assert.equal(used.size, 6)
})

test('cornerMarkOf names the kind and type a corner character draws, and nothing for another character', () => {
  assert.deepEqual(cornerMarkOf(CORNER_VALUES.br[0]), { kind: 'br', type: 'x' })
  assert.deepEqual(cornerMarkOf(CORNER_VALUES.br[1]), { kind: 'br', type: 'dot' })
  assert.deepEqual(cornerMarkOf(CORNER_VALUES.far[1]), { kind: 'far', type: 'dot' })
  for (const other of ['3', '4', 'b', 'c', '0', '5', 'a', 'g', 'h', 's', 'z']) assert.equal(cornerMarkOf(other), null, other)
})

test('the corner cycle is X, circle, empty, and a click on an empty corner adds the X', () => {
  const [x, dot] = CORNER_VALUES.br
  assert.deepEqual(planCornerClick('br', [], ALL), { remove: [], add: x })
  assert.deepEqual(planCornerClick('br', [x], ALL), { remove: [x], add: dot })
  assert.deepEqual(planCornerClick('br', [dot], ALL), { remove: [dot], add: null })
})

test('the corner cycle backwards is circle, X, empty', () => {
  const [x, dot] = CORNER_VALUES.tl
  assert.deepEqual(planCornerClick('tl', [], ALL, true), { remove: [], add: dot })
  assert.deepEqual(planCornerClick('tl', [dot], ALL, true), { remove: [dot], add: x })
  assert.deepEqual(planCornerClick('tl', [x], ALL, true), { remove: [x], add: null })
})

test('an unticked corner type is skipped, and with both unticked the corner click does nothing', () => {
  const [x, dot] = CORNER_VALUES.far
  assert.deepEqual(planCornerClick('far', [], { ...ALL, cornerX: false }), { remove: [], add: dot })
  assert.deepEqual(planCornerClick('far', [dot], { ...ALL, cornerX: false }), { remove: [dot], add: null })
  assert.deepEqual(planCornerClick('far', [x], { ...ALL, cornerDot: false }), { remove: [x], add: null })
  assert.equal(planCornerClick('far', [x], { ...ALL, cornerX: false, cornerDot: false }), null)
})

test('a corner click sees only its own kind: another kind, an edge mark or a cell mark on the cell stays', () => {
  const [x] = CORNER_VALUES.br
  assert.deepEqual(planCornerClick('br', [CORNER_VALUES.tl[0], '3', 'h', '5'], ALL), { remove: [], add: x })
})

test('the edge cycle ignores the corner boxes, and the corner cycle ignores the edge boxes', () => {
  assert.deepEqual(planClick('3', [], { ...NONE, cornerX: true }), null)
  assert.equal(planCornerClick('br', [], { ...NONE, x: true, directions: true, dot: true }), null)
})

test('corner marks are half the thickness, like edge marks', () => {
  const widths = widthsOf(buildThicknessCss(5))
  for (const kind of ['tl', 'br', 'far']) for (const value of CORNER_VALUES[kind]) assert.equal(widths[value], '2.5', value)
})

test('the corner X is two crossing diagonals of half-size s, drawn from the point it is centred on', () => {
  assert.equal(shapePath('x', 8), ' m -8,-8 l16,16 m -16,0 l16,-16')
})

// Pen pages: page 1 is SudokuPad's own 1 to 9, page 2 is the color characters a to i, drawn dotted, page 3 is j to z and 0, two
// to a pen, drawn as chevron lines.
test('the pages are a list: SudokuPad\'s 1 to 9, then a to i drawn dotted, then chevron lines with a character for each way', () => {
  assert.deepEqual(PEN_PAGES, [
    { chars: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], dotted: false },
    { chars: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], dotted: true },
    { chars: ['j', 'l', 'n', 'p', 'r', 't', 'v', 'x', 'z'], reverse: ['k', 'm', 'o', 'q', 's', 'u', 'w', 'y', '0'], dotted: false, chevrons: true }
  ])
})

test('penPageOf, penNumber and penCharOn move between a color character, its page and its button number', () => {
  assert.equal(penPageOf('3'), 0)
  assert.equal(penPageOf('c'), 1)
  assert.equal(penPageOf('z'), 2)
  assert.equal(penPageOf('k'), -1, 'the reverse character of a chevron pen is not a pen to select')
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

test('stepPage goes round the pages in either direction, whatever the count', () => {
  assert.equal(stepPage(0, 1, 2), 1)
  assert.equal(stepPage(1, 1, 2), 0)
  assert.equal(stepPage(0, -1, 2), 1)
  assert.equal(stepPage(1, -1, 3), 0)
  assert.equal(stepPage(2, 1, 3), 0)
})

// The rules of buildPagesCss as { selector, body }.
const rulesOf = (css) => css.split('\n').filter(Boolean).map((rule) => { const i = rule.indexOf(' { '); return { selector: rule.slice(0, i), body: rule.slice(i + 3, -2) } })

test('every page 2 color character strokes in the color of its page 1 partner, so one recolor changes both', () => {
  const rules = rulesOf(buildPagesCss(5, 0))
  for (let i = 0; i < 9; i++) {
    const rule = rules.find((r) => r.selector === `.pencolor-${PEN_PAGES[1].chars[i]}`)
    assert.equal(rule && rule.body, `stroke: var(--puzzle-pencolor-${i + 1});`)
  }
})

test('dots are on lines only: the free lines and the edge and diagonal lines, never 5, 6 or a mark', () => {
  const dots = rulesOf(buildPagesCss(5, 0)).filter((r) => r.body.startsWith('stroke-dasharray'))
  const named = dots.flatMap((r) => r.selector.match(/\.pen-([0-9a-z])/g)).map((v) => v.slice(5))
  assert.deepEqual([...new Set(named)].sort(), ['1', '2', '7', '8', '9', 'a', 'd', 'e', 'f', 'g'])
  for (const r of dots) {
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

test('buildPagesCss refuses a thickness it cannot save', () => {
  assert.throws(() => buildPagesCss(0, 0), RangeError)
})

test('a page 2 swatch is dotted in the pen color of its button, and a page 1 swatch is left to SudokuPad', () => {
  const css = buildPagesCss(5, 0)
  for (let n = 1; n <= 9; n++) {
    const rule = rulesOf(css).find((r) => r.selector === `.tool-pen button[data-key="${n}"][data-pen-page="2"]:after`)
    assert.ok(rule, `swatch ${n}`)
    assert.match(rule.body, new RegExp(`radial-gradient\\(.*var\\(--puzzle-pencolor-${n}\\)`))
  }
  assert.equal(css.includes('data-pen-page="1"'), false)
})

test('the page button samples the page it turns to: dots on page 2, a chevron line on page 3, a solid line on page 1, and a dot for each page with the current one filled', () => {
  const fromOne = renderPageIcon(0, 0)
  assert.match(fromOne, /data-page-sample="dotted"/)
  assert.equal((fromOne.match(/<circle/g) || []).length, 5 + 3)
  const fromTwo = renderPageIcon(1, 0)
  assert.match(fromTwo, /data-page-sample="chevrons"/)
  assert.equal((fromTwo.match(/<circle/g) || []).length, 3)
  assert.equal((fromTwo.match(/<path[^>]*data-chevron/g) || []).length, 3)
  assert.equal((fromTwo.match(/<path[^>]*data-sample-line/g) || []).length, 1)
  const fromThree = renderPageIcon(2, 0)
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

// Dash length (page 2): from the dots of today to longer dashes, in line widths.
test('the dash length runs from 0 (today\'s dots) to 8 line widths in whole steps', () => {
  assert.deepEqual(DASH, { min: 0, max: 8, step: 1, fallback: 0 })
})

test('normalizeDash keeps a saved whole number from 0 to 8, and anything else is the dots of today', () => {
  for (const ok of [0, 1, 4, 8]) assert.equal(normalizeDash(ok), ok)
  for (const bad of [null, undefined, -1, 9, 2.5, NaN, Infinity, '3', [3], { a: 3 }, true]) assert.equal(normalizeDash(bad), 0, String(bad))
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
  // The dasharray of the orthogonal and the diagonal rule at thicknesses 1, 5 and 12, from the script before dash lengths existed.
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

test('every dash length at every thickness fits whole periods in a cell and a diagonal, with half a gap at each end and a gap that leaves the round caps apart, never solid', () => {
  for (let thickness = THICKNESS.min; thickness <= THICKNESS.max; thickness++) {
    for (let dash = DASH.min + 1; dash <= DASH.max; dash++) {
      const rows = dashesOf(thickness, dash)
      assert.equal(rows.length, 2)
      const lengths = [64, 64 * Math.SQRT2]
      rows.forEach(({ dash: on, gap, offset }, i) => {
        const where = `thickness ${thickness} dash ${dash} line ${i}`
        const periods = Math.round(lengths[i] / (on + gap))
        assert.equal(Math.abs(periods * (on + gap) - lengths[i]) < 1e-6, true, `${where}: ${periods} periods of ${on + gap} fill ${lengths[i]}`)
        assert.equal(offset, on + gap / 2, `${where}: the pattern starts half a gap in`)
        assert.equal(on > 0 && on <= dash * thickness + 1e-9, true, `${where}: dash ${on}`)
        assert.equal(gap >= 1.3 * thickness - 1e-9, true, `${where}: gap ${gap} leaves the caps apart`)
      })
    }
  }
})

test('a dash too long for a cell to hold a gap is shortened to leave one, and page 2 still differs from page 1 at the longest dash and thickness', () => {
  const [ortho] = dashesOf(16, 8)
  assert.equal(ortho.dash < 8 * 16, true)
  assert.equal(ortho.gap >= 1.3 * 16 - 1e-9, true)
  assert.equal(Math.abs(ortho.dash + ortho.gap - 64) < 1e-9, true, 'one period in a cell')
})

test('buildPagesCss refuses a dash it cannot save', () => {
  assert.throws(() => buildPagesCss(5, 9), RangeError)
  assert.throws(() => buildPagesCss(5, 1.5), RangeError)
})

test('the page button samples dashes as long as the setting, and dots at 0', () => {
  assert.match(renderPageIcon(0, 0), /data-page-sample="dotted"/)
  const dashed = renderPageIcon(0, 4)
  assert.match(dashed, /data-page-sample="dashed"/)
  const short = renderPageIcon(0, 1).match(/<path[^>]*data-dash/g)
  const long = dashed.match(/<path[^>]*data-dash/g)
  assert.equal(short.length >= 2 && long.length >= 2, true)
  const span = (path) => { const [x1, y1, x2, y2] = path.match(/M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)/).slice(1).map(Number); return Math.hypot(x2 - x1, y2 - y1) }
  assert.equal(span(long[0]) > span(short[0]), true)
})

// Showing the sliders in the pen tool's panel.
test('both sliders show unless saved as hidden, and saved data without the setting shows both', () => {
  assert.deepEqual(normalizeSliderVisibility(undefined), { thickness: true, opacity: true })
  assert.deepEqual(normalizeSliderVisibility(null), { thickness: true, opacity: true })
  assert.deepEqual(normalizeSliderVisibility({}), { thickness: true, opacity: true })
  assert.deepEqual(normalizeSliderVisibility({ thickness: false }), { thickness: false, opacity: true })
  assert.deepEqual(normalizeSliderVisibility({ opacity: false, thickness: false }), { thickness: false, opacity: false })
  assert.deepEqual(normalizeSliderVisibility({ thickness: 0, opacity: 'no' }), { thickness: true, opacity: true })
  assert.deepEqual(normalizeSliderVisibility([false, false]), { thickness: true, opacity: true })
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

// The dialog.
const editorState = (over = {}) => ({
  colors: DEFAULT_COLORS,
  missing: [],
  marks: DEFAULT_MARK_SETTINGS,
  lineMode: 'both',
  thickness: 5,
  opacity: 80,
  show: { thickness: true, opacity: true },
  dash: 0,
  ...over
})

test('the dialog\'s pen colors are a 3 by 3 grid in the order of the pen tool\'s buttons, each keeping its number', () => {
  const html = renderEditor(editorState())
  assert.match(html, /grid-template-columns: repeat\(3, /)
  const cells = [...html.matchAll(/<b[^>]*>(\d)<\/b><input type="color" data-pen="(\d)" value="(#[0-9a-f]{6})">/g)].map((m) => m.slice(1))
  assert.deepEqual(cells.map(([label, pen]) => [label, pen]), [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), String(n)]))
  assert.deepEqual(cells.map((c) => c[2]), [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => DEFAULT_COLORS[n]))
})

test('the dialog has Show thickness slider and Show opacity slider boxes, ticked as saved', () => {
  const box = (html, key) => new RegExp(`<input type="checkbox" id="pen-tool-extras-show-${key}" data-show="${key}"( checked)?>`).exec(html)
  const both = renderEditor(editorState())
  assert.equal(Boolean(box(both, 'thickness')[1]) && Boolean(box(both, 'opacity')[1]), true)
  assert.match(both, /Show thickness slider/)
  assert.match(both, /Show opacity slider/)
  const none = renderEditor(editorState({ show: { thickness: false, opacity: true } }))
  assert.equal(box(none, 'thickness')[1], undefined)
  assert.equal(Boolean(box(none, 'opacity')[1]), true)
})

test('the dialog always holds the thickness and opacity sliders, at the values in force, whether or not the panel shows them', () => {
  const html = renderEditor(editorState({ thickness: 9, opacity: 35, show: { thickness: false, opacity: false } }))
  const ranges = [...html.matchAll(/<input type="range" data-setting="(\w+)" min="(\d+)" max="(\d+)" step="(\d+)" value="(\d+)"/g)].map((m) => m.slice(1))
  assert.deepEqual(ranges, [
    ['thickness', String(THICKNESS.min), String(THICKNESS.max), String(THICKNESS.step), '9'],
    ['opacity', String(OPACITY.min), String(OPACITY.max), String(OPACITY.step), '35'],
    ['dash', String(DASH.min), String(DASH.max), String(DASH.step), '0']
  ])
})

test('VERSION is the @version in the script header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, 'pen-tool-extras.user.js'), 'utf8')))
})

// Page 3: chevron lines. A page 3 pen is two color characters; the one a line stores says which way it was dragged.
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

test('chevronWayOf reads a stored character back as the way its line was dragged, and is null for any other character', () => {
  assert.equal(chevronWayOf('j'), true)
  assert.equal(chevronWayOf('k'), false)
  assert.equal(chevronWayOf('0'), false)
  assert.equal(chevronWayOf('z'), true)
  for (const other of ['1', 'a', 'i', 'A', '', undefined, 'jk']) assert.equal(chevronWayOf(other), null, String(other))
})

test('the page 3 characters stroke in the color of their page 1 partner, both ways, and are never dotted', () => {
  const rules = rulesOf(buildPagesCss(5, 3))
  PEN_PAGES[2].chars.forEach((char, i) => {
    for (const c of [char, PEN_PAGES[2].reverse[i]]) {
      const rule = rules.find((r) => r.selector === `.pencolor-${c}`)
      assert.equal(rule && rule.body, `stroke: var(--puzzle-pencolor-${i + 1});`, c)
    }
  })
  for (const r of rules.filter((r) => r.body.startsWith('stroke-dasharray'))) assert.doesNotMatch(r.selector, /pencolor-[j-z0]/)
})

test('a page 3 swatch is a chevron in the pen color of its button, as a mask so the color follows a recolor', () => {
  const rules = rulesOf(buildPagesCss(5, 0))
  for (let n = 1; n <= 9; n++) {
    const rule = rules.find((r) => r.selector === `.tool-pen button[data-key="${n}"][data-pen-page="3"]:after`)
    assert.ok(rule, `swatch ${n}`)
    assert.match(rule.body, new RegExp(`background-color: var\\(--puzzle-pencolor-${n}\\)`))
    assert.match(rule.body, /mask(-image)?: url\("data:image\/svg\+xml,/)
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

// Chevron geometry. A page 3 line is a thin line and a run of chevrons along it.
const numbersOf = (d) => d.match(/-?\d+(?:\.\d+)?/g).map(Number)
const pointsOf = (d) => { const n = numbersOf(d); const out = []; for (let i = 0; i < n.length; i += 2) out.push([n[i], n[i + 1]]); return out }

test('a chevron line draws the line along the whole segment and the chevrons as triples of points: wing, tip, wing', () => {
  const { line, chevrons } = chevronLine('1', true, 2, 3, 5)
  // the cell at row 2, col 3 is at x 192, y 128; the center line runs right from its middle
  assert.deepEqual(pointsOf(line), [[224, 160], [288, 160]])
  const points = pointsOf(chevrons)
  assert.equal(points.length % 3, 0)
  for (let i = 0; i < points.length; i += 3) {
    const [wing, tip, other] = points.slice(i, i + 3)
    assert.equal(tip[0] > wing[0] && tip[0] > other[0], true, `the tip points the way the line was dragged (right): wing ${wing}, tip ${tip}, wing ${other}`)
    assert.equal(wing[1] - tip[1], tip[1] - other[1], 'the wings are either side of the line')
    assert.equal(tip[1], 160)
  }
})

test('a chevron line dragged the other way has its chevrons pointing back and the same line', () => {
  const forward = chevronLine('1', true, 0, 0, 5)
  const back = chevronLine('1', false, 0, 0, 5)
  assert.deepEqual(pointsOf(back.line).slice().reverse(), pointsOf(forward.line))
  const [wing, tip] = pointsOf(back.chevrons)
  assert.equal(tip[0] < wing[0], true, `dragged left, the tip is left of the wings: wing ${wing}, tip ${tip}`)
})

test('chevrons point along a diagonal and along a vertical line as well', () => {
  const [wing, tip, other] = pointsOf(chevronLine('e', true, 0, 0, 5).chevrons).slice(0, 3)
  // down and right: the tip is the furthest of the three along (1, 1)
  const along = ([x, y]) => x + y
  assert.equal(along(tip) > along(wing) && along(tip) > along(other), true, `down and right, the tip is furthest along (1, 1): ${wing} ${tip} ${other}`)
  const [w2, t2] = pointsOf(chevronLine('2', false, 0, 0, 5).chevrons)
  assert.equal(t2[1] < w2[1], true, `dragged up, the tip is above the wings: wing ${w2}, tip ${t2}`)
})

test('the chevrons are evenly spaced along the line, half a space in from each end, so two cells in a row read as one run', () => {
  // a chevron's middle is halfway between its wings and its tip
  const middles = (d) => { const p = pointsOf(d); const out = []; for (let i = 0; i < p.length; i += 3) out.push((p[i][0] + p[i + 1][0]) / 2); return out }
  for (const thickness of [1, 5, 12, 16]) {
    const xs = middles(chevronLine('1', true, 0, 0, thickness).chevrons)
    const space = 64 / xs.length
    xs.forEach((x, i) => assert.equal(Math.abs(x - (32 + (i + 0.5) * space)) < 0.01, true, `chevron ${i} of ${xs.length} at thickness ${thickness}: ${x}`))
  }
})

test('the chevrons and the line scale with the thickness: wider chevrons, wider strokes, fewer chevrons', () => {
  const thin = chevronLine('1', true, 0, 0, 2)
  const thick = chevronLine('1', true, 0, 0, 12)
  assert.equal(thick.lineWidth > thin.lineWidth && thick.chevronWidth > thin.chevronWidth, true, `widths ${thin.lineWidth}/${thin.chevronWidth} at 2, ${thick.lineWidth}/${thick.chevronWidth} at 12`)
  assert.equal(thin.chevronWidth > thin.lineWidth, true, `the line is the thin part: ${thin.lineWidth} against ${thin.chevronWidth}`)
  assert.equal(thick.lineWidth / thin.lineWidth, 6)
  assert.equal(pointsOf(thin.chevrons).length > pointsOf(thick.chevrons).length, true, `${pointsOf(thin.chevrons).length / 3} chevrons at 2, ${pointsOf(thick.chevrons).length / 3} at 12`)
  const span = (c) => { const ys = pointsOf(c.chevrons).map((p) => p[1]); return Math.max(...ys) - Math.min(...ys) }
  assert.equal(span(thick) > span(thin), true, `spans ${span(thin)} at 2, ${span(thick)} at 12`)
})

test('at the largest thickness a chevron on a grid\'s outer edge reaches no further than Dark Page keeps (SOLVER_REACH)', () => {
  // a top edge line, 'a', on row 0: the chevron's wings are the furthest from the edge itself
  const shape = chevronLine('a', true, 0, 0, THICKNESS.max)
  const reach = Math.max(...pointsOf(shape.chevrons).map(([, y]) => Math.abs(y))) + shape.chevronWidth / 2
  assert.equal(Math.abs(reach - (CHEVRON.halfWidth + CHEVRON.stroke / 2) * THICKNESS.max) < 0.01, true, `the drawn reach ${reach} is the CHEVRON sizes at the largest thickness`)
  assert.equal(reach <= SOLVER_REACH, true, `reach ${reach} against ${SOLVER_REACH}`)
})

test('a chevron line has at least two chevrons on any segment at any thickness, so a run never has none', () => {
  for (const value of LINE_VALUES) {
    for (let t = THICKNESS.min; t <= THICKNESS.max; t++) {
      assert.equal(pointsOf(chevronLine(value, true, 4, 4, t).chevrons).length >= 6, true, `at least two chevrons: ${value} at ${t}`)
    }
  }
})
