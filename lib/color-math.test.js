'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text.
const NAMES = ['parseColor', 'isTransparent', 'toHex', 'toOklab', 'darkenColor', 'textColorFor', 'LIGHTNESS_FACTOR', 'LIGHT_TEXT', 'DARK_TEXT']
const { parseColor, isTransparent, toHex, toOklab, darkenColor, textColorFor, LIGHTNESS_FACTOR, LIGHT_TEXT, DARK_TEXT } =
  new Function(`${fs.readFileSync(path.join(__dirname, 'color-math.js'), 'utf8')}\nreturn { ${NAMES.join(', ')} }`)() // eslint-disable-line no-new-func

// OKLCH from the module's own OKLab, whose matrices the golden shades below pin.
const oklch = (hex) => {
  const [L, a, b] = toOklab(parseColor(hex))
  return { L, h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 }
}
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

test('parseColor reads #rgb and #rrggbb in either case', () => {
  assert.deepEqual(parseColor('#3d99f5'), [61, 153, 245])
  assert.deepEqual(parseColor('#3D99F5'), [61, 153, 245])
  assert.deepEqual(parseColor('#fff'), [255, 255, 255])
  assert.deepEqual(parseColor(' #a1c '), [170, 17, 204])
})

test('parseColor reads rgb() and rgba() with comma, space or slash separators', () => {
  for (const text of ['rgb(61, 153, 245)', 'rgb(61,153,245)', 'rgb(61 153 245)', 'rgba(61, 153, 245, 0.5)', 'rgba(61 153 245 / 0.5)', 'RGB(61, 153, 245)', 'rgb(61 153 245 / 1)',
    'rgba(61 153 245 / 50%)', 'rgba(61, 153, 245, 50%)', 'rgba(61, 153, 245, x)']) {
    assert.deepEqual(parseColor(text), [61, 153, 245], text)
  }
})

test('parseColor clamps channels to 0 to 255 and rounds them', () => {
  assert.deepEqual(parseColor('rgb(-36, -36, -36)'), [0, 0, 0])
  assert.deepEqual(parseColor('rgb(300, 12.4, 0)'), [255, 12, 0])
  assert.deepEqual(parseColor('rgb(0.5, 254.6, 1e2)'), [1, 255, 100])
})

test('parseColor gives null for transparent, empty and unreadable values', () => {
  for (const bad of ['transparent', ' TRANSPARENT ', 'rgba(0, 0, 0, 0)', 'rgba(9 9 9 / 0)', '', '  ', 'banana', 'rgb(1, 2)', 'rgb(1, 2, x)', '#abcd', '#abcdef0', 'red', 'hsl(0, 100%, 50%)', undefined, null, 42]) {
    assert.equal(parseColor(bad), null, String(bad))
  }
})

test('isTransparent names only the fully transparent', () => {
  for (const clear of ['transparent', ' TRANSPARENT ', 'rgba(0, 0, 0, 0)', 'rgba(9, 9, 9, 0)', 'rgb(9 9 9 / 0)', 'rgba(9 9 9 / 0%)', '#abc0', '#AABBCC00',
    'hsla(0, 100%, 50%, 0)', 'hsl(0 100% 50% / 0%)']) assert.equal(isTransparent(clear), true, clear)
  for (const seen of ['rgb(0, 0, 0)', 'rgba(0, 0, 0, 0.1)', 'rgba(0 0 0 / 1%)', '#abc', '#abc1', '#aabbcc01', 'hsla(0, 100%, 50%, 0.5)', 'hsl(0, 100%, 0%)',
    'red', '', undefined, null, 'banana']) assert.equal(isTransparent(seen), false, String(seen))
})

test('toHex writes #rrggbb, rounding and clamping', () => {
  assert.equal(toHex([61, 153, 245]), '#3d99f5')
  assert.equal(toHex([-4, 255.4, 0.6]), '#00ff01')
})

test('darkenColor keeps the hue, lowers OKLCH lightness by the named factor, and gives #rrggbb', () => {
  for (const rgb of [[61, 153, 245], [245, 58, 55], [232, 124, 241], [228, 150, 50], [179, 229, 106]]) {
    const hex = toHex(rgb)
    const out = darkenColor(rgb)
    assert.match(out, /^#[0-9a-f]{6}$/)
    assert.ok(hueGap(oklch(hex).h, oklch(out).h) < 3, `${hex} -> ${out}`)
    assert.ok(Math.abs(oklch(out).L - oklch(hex).L * LIGHTNESS_FACTOR) < 0.02, `${hex} -> ${out}`)
  }
  assert.ok(LIGHTNESS_FACTOR < 1 && LIGHTNESS_FACTOR > 0)
})

test('darkenColor gives the golden shades', () => {
  const before = [
    [[61, 153, 245], '#0065b5'], [[245, 58, 55], '#b10011'], [[232, 124, 241], '#aa40b3'], [[228, 150, 50], '#a06200'],
    [[179, 229, 106], '#719f17'], [[255, 255, 255], '#aeaeae'], [[0, 0, 0], '#000000'], [[252, 235, 63], '#ada000'],
    [[214, 214, 214], '#919191'], [[255, 0, 0], '#ae0000'], [[0, 255, 255], '#00aeae'], [[-36, -36, -36], '#000000'],
    [[999, -5, 40], '#ae0018'], [[1, 1, 1], '#000000']
  ]
  for (const [rgb, shade] of before) assert.equal(darkenColor(rgb), shade, JSON.stringify(rgb))
})

test('a darkened light color has OKLCH lightness under 0.8, the bar for a 5px line on white', () => {
  for (const rgb of [[252, 235, 63], [214, 214, 214], [255, 255, 255]]) assert.ok(oklch(darkenColor(rgb)).L < 0.8, JSON.stringify(rgb))
})

test('textColorFor gives light text on a dark background and dark text on a light one, switching where their contrast with the background is equal', () => {
  assert.equal(LIGHT_TEXT, '#dddddd')
  assert.equal(DARK_TEXT, '#222222')
  for (const dark of ['#000000', '#333333', '#0000ff']) assert.equal(textColorFor(dark), LIGHT_TEXT, dark)
  for (const light of ['#ffffff', '#cccccc', '#ffff00']) assert.equal(textColorFor(light), DARK_TEXT, light)
  // Mid greys either side of the contrast crossover, where a plain half-way split on lightness differs.
  assert.equal(textColorFor('#777777'), DARK_TEXT)
  assert.equal(textColorFor('#707070'), LIGHT_TEXT)
  // The switch falls between these two neighbouring greys.
  assert.equal(textColorFor('#747474'), LIGHT_TEXT)
  assert.equal(textColorFor('#757575'), DARK_TEXT)
})

test('textColorFor reads any color parseColor reads, and refuses text it cannot read', () => {
  assert.equal(textColorFor('rgb(0 0 0)'), LIGHT_TEXT)
  assert.equal(textColorFor('#fff'), DARK_TEXT)
  assert.throws(() => textColorFor('transparent'), /not a color/)
})
