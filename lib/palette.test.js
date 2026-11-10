'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')

// palette.js reads parseColor, darkenColor and toOklab from color-math.js.
const NAMES = ['parseColor', 'darkenColor', 'SUDOKUPAD_PEN_COLORS', 'GREY_CHROMA', 'darkerPageColors', 'paletteOptions', 'paletteColors', 'PALETTE_PRESET_LABELS', 'missingColorsText']
const { parseColor, darkenColor, SUDOKUPAD_PEN_COLORS, GREY_CHROMA, darkerPageColors, paletteOptions, paletteColors, PALETTE_PRESET_LABELS, missingColorsText } =
  loadLib(['color-math', 'palette'], NAMES)

// SudokuPad's tool-pen.css (v0.611.0) as #rrggbb, typed out here as the independent source.
const TABLE = {
  1: '#1f8020', 2: '#e87cf1', 3: '#e49632', 4: '#f53a37', 5: '#d2be32', 6: '#3d99f5', 7: '#d6d6d6', 8: '#7c7c7c', 9: '#000000'
}

test('SUDOKUPAD_PEN_COLORS are SudokuPad\'s own nine pen colors', () => {
  assert.deepEqual(SUDOKUPAD_PEN_COLORS, TABLE)
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

test('darkerPageColors maps index N of the page to pen color N, darkened', () => {
  const r = darkerPageColors(PAGE_KEYS, (k) => CELL[k])
  assert.deepEqual(r.missing, [])
  assert.deepEqual(Object.keys(r.colors), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  assert.equal(r.colors[1], darkenColor([214, 214, 214]))
  assert.equal(r.colors[3], '#000000')
  assert.equal(r.colors[9], darkenColor([61, 153, 245]))
})

test('darkerPageColors reads pen N from index N of the page, never index 0, even when index 0 holds a color', () => {
  const page = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  const read = (k) => ({ 0: 'rgb(250, 250, 250)', 1: 'rgb(204, 51, 17)', 2: 'rgb(17, 119, 51)', 3: 'rgb(238, 153, 170)', 4: 'rgb(0, 68, 136)', 5: 'rgb(187, 85, 0)', 6: 'rgb(0, 153, 136)', 7: 'rgb(170, 51, 170)', 8: 'rgb(136, 136, 34)', 9: 'rgb(120, 80, 200)' })[k]
  const r = darkerPageColors(page, read)
  assert.deepEqual(r.missing, [])
  assert.equal(r.colors[1], darkenColor([204, 51, 17]))
  assert.equal(r.colors[2], darkenColor([17, 119, 51]))
  assert.equal(r.colors[9], darkenColor([120, 80, 200]))
  for (const n of PEN_NUMBERS) assert.notEqual(r.colors[n], darkenColor([250, 250, 250]))
})

test('darkerPageColors keeps SudokuPad\'s pen color at a transparent middle entry, lists it as missing, and shifts nothing', () => {
  const page = ['0', '1', '2', '3', '4']
  const read = (k) => ({ 0: 'transparent', 1: 'rgb(204, 51, 17)', 2: 'transparent', 3: 'rgb(17, 119, 51)', 4: 'rgb(238, 153, 170)' })[k]
  const r = darkerPageColors(page, read)
  assert.deepEqual(r.missing, [2, 5, 6, 7, 8, 9])
  assert.equal(r.colors[1], darkenColor([204, 51, 17]))
  assert.equal(r.colors[2], SUDOKUPAD_PEN_COLORS[2])
  assert.equal(r.colors[3], darkenColor([17, 119, 51]))
  assert.equal(r.colors[4], darkenColor([238, 153, 170]))
  for (const n of [5, 6, 7, 8, 9]) assert.equal(r.colors[n], SUDOKUPAD_PEN_COLORS[n])
})

test('darkerPageColors keeps an unreadable color\'s place: its pen color keeps SudokuPad\'s own, and later colors do not shift up', () => {
  const page = ['a', 'b', 'c', 'd', 'e']
  const read = (k) => ({ a: 'transparent', b: 'rgb(204, 51, 17)', c: 'unparseable', d: 'rgb(238, 153, 170)', e: 'rgb(17, 119, 51)' })[k]
  const r = darkerPageColors(page, read)
  assert.equal(r.colors[1], darkenColor([204, 51, 17]))
  assert.equal(r.colors[2], SUDOKUPAD_PEN_COLORS[2])
  assert.equal(r.colors[3], darkenColor([238, 153, 170]))
  assert.equal(r.colors[4], darkenColor([17, 119, 51]))
  assert.deepEqual(r.missing, [2, 5, 6, 7, 8, 9])
})

const hueful = ['rgb(204, 51, 17)', 'rgb(17, 119, 51)', 'rgb(0, 68, 136)', 'rgb(187, 85, 0)']
const pageOf = (colors) => ['transparent', ...colors]
const penColors = (colors) => darkerPageColors(pageOf(colors).map((_, i) => String(i)), (k) => pageOf(colors)[k]).colors

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
  const r = darkerPageColors(page, read)
  assert.equal(r.colors[1], darkenColor([204, 51, 17]))
  assert.equal(r.colors[2], '#000000')
  assert.equal(r.colors[3], darkenColor([17, 119, 51]))
  for (const n of [4, 5, 6, 7, 8, 9]) assert.equal(r.colors[n], SUDOKUPAD_PEN_COLORS[n])
})

test('SudokuPad\'s default first page keeps its result: index 3 is already black and stays the darkest', () => {
  const r = darkerPageColors(PAGE_KEYS, (k) => CELL[k])
  assert.equal(r.colors[1], darkenColor([214, 214, 214]))
  assert.equal(r.colors[2], darkenColor([124, 124, 124]))
  assert.equal(r.colors[3], '#000000')
})

test('darkerPageColors ignores entries past index 9', () => {
  const keys = 'abcdefghijkl'.split('')
  const r = darkerPageColors(keys, () => 'rgb(204, 51, 17)')
  assert.deepEqual(r.missing, [])
  assert.equal(Object.keys(r.colors).length, 9)
})

test('darkerPageColors on an empty page keeps all nine SudokuPad colors', () => {
  const r = darkerPageColors([], () => 'rgb(1, 2, 3)')
  assert.deepEqual(r.colors, SUDOKUPAD_PEN_COLORS)
  assert.deepEqual(r.missing, [1, 2, 3, 4, 5, 6, 7, 8, 9])
})

test('paletteOptions lists one darker page per palette page, up to three, then SudokuPad colors last', () => {
  assert.deepEqual(paletteOptions(3), ['page-1', 'page-2', 'page-3', 'sudokupad'])
  assert.deepEqual(paletteOptions(5), ['page-1', 'page-2', 'page-3', 'sudokupad'])
  assert.deepEqual(paletteOptions(1), ['page-1', 'sudokupad'])
  assert.deepEqual(paletteOptions(0), ['sudokupad'])
  assert.deepEqual(['page-1', 'page-2', 'page-3', 'sudokupad'].map((id) => PALETTE_PRESET_LABELS[id]),
    ['Darker page 1', 'Darker page 2', 'Darker page 3', 'SudokuPad colors'])
})

test('paletteColors darkens the named page, not the first or the current one, and gives SudokuPad\'s own for its preset', () => {
  const pages = [['a0', 'a1'], ['b0', 'b1'], ['c0', 'c1']]
  const read = (key) => ({ a1: 'rgb(255, 0, 0)', b1: 'rgb(0, 0, 255)', c1: 'rgb(0, 128, 0)' })[key]
  // Blue darkens to #0000ae, as the live test's custom page types it out.
  assert.equal(paletteColors('page-2', pages, read).colors[1], '#0000ae')
  assert.notEqual(paletteColors('page-1', pages, read).colors[1], '#0000ae')
  assert.deepEqual(paletteColors('page-3', pages, read).missing, [2, 3, 4, 5, 6, 7, 8, 9])
  assert.deepEqual(paletteColors('sudokupad', pages, read), { colors: TABLE, preset: 'sudokupad', missing: [] })
})

test('paletteColors names the preset it was given in the set it returns', () => {
  const pages = [['a0', 'a1'], ['b0', 'b1']]
  for (const preset of ['page-1', 'page-2', 'sudokupad']) assert.equal(paletteColors(preset, pages, () => 'rgb(255, 0, 0)').preset, preset)
})

test('SudokuPad\'s own set is frozen, so no edit of a set in force can change it', () => {
  const set = paletteColors('sudokupad', [], () => 'red')
  assert.equal(Object.isFrozen(set), true, 'the set')
  assert.equal(Object.isFrozen(set.colors), true, 'its colors')
  assert.equal(Object.isFrozen(set.missing), true, 'its missing list')
  assert.equal(paletteColors('sudokupad', [], () => 'red'), set, 'one set, not a fresh copy each time')
})

test('paletteColors refuses a page preset the palette has no page for, rather than giving a set nobody picked', () => {
  assert.throws(() => paletteColors('page-3', [['a0'], ['b0']], () => 'red'), /page-3 is not a preset of this palette/)
  assert.throws(() => paletteColors('custom', [['a0']], () => 'red'), /custom is not a preset/)
})

test('missingColorsText names the page the colors came from and the pens that keep SudokuPad\'s own', () => {
  assert.equal(missingColorsText([4, 5], 'page-2'), 'Cell color page 2 has no usable color at the matching button, so pen colors 4, 5 keep SudokuPad\'s own.')
  assert.equal(missingColorsText([7], 'page-1'), 'Cell color page 1 has no usable color at the matching button, so pen color 7 keeps SudokuPad\'s own.')
})
