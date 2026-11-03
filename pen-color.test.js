'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeColors, buildCss, DEFAULT_COLORS, parseColor, darkenColor, penColorsFromPage, savedColors, LIGHTNESS_FACTOR } = require('./pen-color.user.js')

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
  for (const bad of ['transparent', '', '  ', 'banana', 'rgb(1, 2)', undefined, null, 'rgba(0, 0, 0, 0)']) {
    assert.equal(parseColor(bad), null, String(bad))
  }
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

test('a darkened light color is still visible as a line on white', () => {
  // Light yellow and light gray, the lightest of the default cell colors.
  for (const rgb of [[252, 235, 63], [214, 214, 214], [255, 255, 255]]) {
    assert.ok(oklch(darkenColor(rgb)).L < 0.8, JSON.stringify(rgb))
  }
})

test('the darkened default first page keeps the nine apart', () => {
  const page = ['rgb(214, 214, 214)', 'rgb(124, 124, 124)', 'rgb(-36, -36, -36)', 'rgb(179, 229, 106)', 'rgb(232, 124, 241)', 'rgb(228, 150, 50)', 'rgb(245, 58, 55)', 'rgb(252, 235, 63)', 'rgb(61, 153, 245)']
  const out = page.map((c) => darkenColor(parseColor(c)))
  assert.equal(new Set(out).size, 9)
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

test('penColorsFromPage maps the page\'s visible colors in order to pen colors 1-9, darkened', () => {
  const r = penColorsFromPage(PAGE_KEYS, (k) => CELL[k])
  assert.deepEqual(r.missing, [])
  assert.deepEqual(Object.keys(r.colors), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  assert.equal(r.colors[1], darkenColor([214, 214, 214]))
  assert.equal(r.colors[3], '#000000')
  assert.equal(r.colors[9], darkenColor([61, 153, 245]))
})

test('penColorsFromPage skips transparent keys wherever they sit, and keeps SudokuPad\'s pen color where the page runs short', () => {
  const read = (k) => ({ a: 'transparent', b: 'rgb(204, 51, 17)', c: 'rgb(17, 119, 51)', d: 'garbage', e: 'rgb(238, 153, 170)' })[k]
  const r = penColorsFromPage(['a', 'b', 'c', 'd', 'e'], read)
  assert.deepEqual(r.missing, [4, 5, 6, 7, 8, 9])
  assert.equal(r.colors[1], darkenColor([204, 51, 17]))
  assert.equal(r.colors[2], darkenColor([17, 119, 51]))
  assert.equal(r.colors[3], darkenColor([238, 153, 170]))
  for (const n of [4, 5, 6, 7, 8, 9]) assert.equal(r.colors[n], DEFAULT_COLORS[n])
})

test('penColorsFromPage ignores colors past the ninth visible one', () => {
  const keys = 'abcdefghijkl'.split('')
  const r = penColorsFromPage(keys, () => 'rgb(10, 20, 30)')
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
