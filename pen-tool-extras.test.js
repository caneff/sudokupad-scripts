'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const {
  normalizeColors, buildCss, DEFAULT_COLORS, parseColor, isTransparent, darkenColor, penColorsFromPage, savedColors, editedColors,
  HOLD_TO_EDIT_MS, normalizeThickness, buildThicknessCss, normalizeOpacity, buildOpacityCss, renderPanelSliders, OPACITY, THICKNESS, FULL_WIDTH_VALUES, LIGHTNESS_FACTOR, GREY_CHROMA, COLOR_TOOL_WAIT_MS, VERSION,
  stepType, EDGE_CYCLE, planClick, normalizeMarkSettings, shapeOf, shapePath, DEFAULT_MARK_SETTINGS,
  CORNER_RADIUS, CORNER_VALUES, cornerAt, cornerStorage, cornerPoint, cornerMarkOf, planCornerClick,
  PEN_PAGES, penPageOf, penSlot, penCharOn, normalizePen, stepPage, buildPagesCss, renderPageIcon, normalizeLineMode, LINE_MODES
} = require('./pen-tool-extras.user.js')

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

test('the thickness runs 1 to 12 in whole steps from SudokuPad\'s own pen width of 5', () => {
  assert.deepEqual(THICKNESS, { min: 1, max: 12, step: 1, fallback: 5 })
})

test('normalizeThickness keeps a saved whole number from 1 to 12', () => {
  for (const ok of [1, 5, 8, 12]) assert.equal(normalizeThickness(ok), ok)
})

test('normalizeThickness falls back to 5 for nothing saved and for anything untrusted', () => {
  for (const bad of [null, undefined, 0, 13, -3, 2.5, NaN, Infinity, '7', [7], { a: 7 }, true]) {
    assert.equal(normalizeThickness(bad), 5, String(bad))
  }
})

test('the full width values are the free lines and the cell circle and cross, not the edge X marks or the arrows and circles this script adds', () => {
  assert.deepEqual(FULL_WIDTH_VALUES, ['1', '2', '5', '6', '7', '8', '9', 'a', 'd', 'e', 'f', 'g'])
})

// The width each pen value gets from the CSS, read back from the rules.
function widthsOf (css) {
  const widths = {}
  for (const rule of css.split('\n')) {
    const [selector, body] = rule.split(' { ')
    for (const part of selector.split(', ')) widths[part.replace(':root:root .cell-pen.pen-', '')] = body.replace('stroke-width: ', '').replace('; }', '')
  }
  return widths
}

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

test('buildThicknessCss refuses a thickness it cannot save', () => {
  assert.throws(() => buildThicknessCss(0), RangeError)
  assert.throws(() => buildThicknessCss(13), RangeError)
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
  const html = renderPanelSliders(9, 35)
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
  const rx = Number(/ a ([\d.]+),/.exec(shapePath('o', 8))[1])
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

// Pen pages: page 1 is SudokuPad's own 1 to 9, page 2 is the color characters a to i, drawn dotted.
test('the pages are a list: SudokuPad\'s 1 to 9, then a to i drawn dotted', () => {
  assert.deepEqual(PEN_PAGES, [
    { chars: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], dotted: false },
    { chars: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], dotted: true }
  ])
})

test('penPageOf, penSlot and penCharOn move between a color character, its page and its button number', () => {
  assert.equal(penPageOf('3'), 0)
  assert.equal(penPageOf('c'), 1)
  assert.equal(penPageOf('z'), -1)
  assert.equal(penSlot('c'), '3')
  assert.equal(penSlot('3'), '3')
  assert.equal(penSlot('i'), '9')
  assert.equal(penCharOn(1, '1'), 'a')
  assert.equal(penCharOn(0, '9'), '9')
  assert.equal(penCharOn(1, '9'), 'i')
})

test('normalizePen keeps a saved color character of any page and nothing else', () => {
  for (const ok of ['1', '9', 'a', 'i']) assert.equal(normalizePen(ok), ok)
  // SudokuPad's getData parses a saved '3' into the number 3
  assert.equal(normalizePen(3), '3')
  for (const bad of [null, undefined, 0, 10, 3.5, 'j', 'z', '0', '', 'ab', ['a'], { a: 1 }]) assert.equal(normalizePen(bad), null, JSON.stringify(bad))
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
  const rules = rulesOf(buildPagesCss(5))
  for (let i = 0; i < 9; i++) {
    const rule = rules.find((r) => r.selector === `.pencolor-${PEN_PAGES[1].chars[i]}`)
    assert.equal(rule && rule.body, `stroke: var(--puzzle-pencolor-${i + 1});`)
  }
})

test('dots are on lines only: the free lines and the edge and diagonal lines, never 5, 6 or a mark', () => {
  const dots = rulesOf(buildPagesCss(5)).filter((r) => r.body.startsWith('stroke-dasharray'))
  const named = dots.flatMap((r) => r.selector.match(/\.pen-([0-9a-z])/g)).map((v) => v.slice(5))
  assert.deepEqual([...new Set(named)].sort(), ['1', '2', '7', '8', '9', 'a', 'd', 'e', 'f', 'g'])
  for (const r of dots) {
    assert.match(r.selector, /^:root:root \.cell-pen:is\(/)
    assert.match(r.selector, /:is\(\.pencolor-a,\.pencolor-b,\.pencolor-c,\.pencolor-d,\.pencolor-e,\.pencolor-f,\.pencolor-g,\.pencolor-h,\.pencolor-i\)$/)
  }
})

test('the dot spacing is two line widths, snapped so a cell of 64 holds whole dots and a diagonal cell of 90.51 does too, the last dot a hair before the segment\'s end', () => {
  const gaps = (t) => rulesOf(buildPagesCss(t)).filter((r) => r.body.startsWith('stroke-dasharray')).map((r) => Number(r.body.match(/^stroke-dasharray: 0 ([\d.]+);$/)[1]))
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
  assert.throws(() => buildPagesCss(0), RangeError)
})

test('a page 2 swatch is dotted in the pen color of its button, and a page 1 swatch is left to SudokuPad', () => {
  const css = buildPagesCss(5)
  for (let n = 1; n <= 9; n++) {
    const rule = rulesOf(css).find((r) => r.selector === `.tool-pen button[data-key="${n}"][data-pen-page="2"]:after`)
    assert.ok(rule, `swatch ${n}`)
    assert.match(rule.body, new RegExp(`radial-gradient\\(.*var\\(--puzzle-pencolor-${n}\\)`))
  }
  assert.equal(css.includes('data-pen-page="1"'), false)
})

test('the page button samples the page it turns to: dots on page 2, a solid line on page 1, and a dot for each page with the current one filled', () => {
  const fromOne = renderPageIcon(0)
  assert.match(fromOne, /data-page-sample="dotted"/)
  assert.equal((fromOne.match(/<circle/g) || []).length, 5 + 2)
  const fromTwo = renderPageIcon(1)
  assert.match(fromTwo, /data-page-sample="solid"/)
  assert.equal((fromTwo.match(/<circle/g) || []).length, 2)
  assert.equal((fromTwo.match(/<path/g) || []).length, 1)
  for (const icon of [fromOne, fromTwo]) {
    assert.equal((icon.match(/data-page-dot="filled"/g) || []).length, 1)
    assert.equal((icon.match(/data-page-dot="outline"/g) || []).length, 1)
  }
  assert.match(fromOne, /<circle[^>]*data-page-dot="filled"[^>]*\/>[^]*<circle[^>]*data-page-dot="outline"/)
  assert.match(fromTwo, /<circle[^>]*data-page-dot="outline"[^>]*\/>[^]*<circle[^>]*data-page-dot="filled"/)
})

test('the line mode choices are SudokuPad\'s three, and anything else saved reads as both', () => {
  assert.deepEqual(LINE_MODES.map(([value]) => value), ['both', 'centeronly', 'edgeonly'])
  for (const ok of ['both', 'centeronly', 'edgeonly']) assert.equal(normalizeLineMode(ok), ok)
  for (const bad of [null, undefined, 'edge', 1, ['both'], '']) assert.equal(normalizeLineMode(bad), 'both', JSON.stringify(bad))
})

test('VERSION is the @version in the script header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, 'pen-tool-extras.user.js'), 'utf8')))
})
