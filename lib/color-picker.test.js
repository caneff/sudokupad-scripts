'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text. color-picker.js reads PEN_COLOR_NUMBERS from palette.js.
const NAMES = ['HOLD_TO_EDIT_MS', 'SWATCH_PX', 'SWATCH_GAP_PX', 'CHOICE_ARROW', 'escapeHtml', 'renderColorBlock', 'colorBlockCss', 'pickerCss']
const { HOLD_TO_EDIT_MS, SWATCH_PX, SWATCH_GAP_PX, CHOICE_ARROW, escapeHtml, renderColorBlock, colorBlockCss, pickerCss } =
  new Function(`${['palette', 'color-picker'].map((name) => fs.readFileSync(path.join(__dirname, `${name}.js`), 'utf8')).join('\n')}\nreturn { ${NAMES.join(', ')} }`)() // eslint-disable-line no-new-func

const NINE = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const options = [
  { value: 'custom', label: 'Custom', selected: true, disabled: true },
  { value: 'page-1', label: 'Darker page 1' },
  { value: 'sudokupad', label: 'SudokuPad colors' }
]
const freeBlock = (over = {}) => renderColorBlock({
  prefix: 'pte-',
  label: 'Pen color preset',
  options,
  swatches: NINE.map((n) => ({ key: String(n), value: `#00000${n}`, label: `Pen color ${n}` })),
  ...over
})
const choice = (html) => {
  const menu = /<select class="pte-color-choice" data-role="color-choice" aria-label="([^"]*)">([\s\S]*?)<\/select>/.exec(html)
  assert.ok(menu, html)
  return { label: menu[1], options: [...menu[2].matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g)].map(([, value, attributes, text]) => [value, text, / selected/.test(attributes), / disabled/.test(attributes)]) }
}
const swatchTags = (html) => [...html.matchAll(/<(input|button|span)[^>]*data-role="swatch"[^>]*>/g)].map((m) => m[0])

test('HOLD_TO_EDIT_MS is SudokuPad\'s own hold for its cell color buttons, 1000 ms', () => {
  assert.equal(HOLD_TO_EDIT_MS, 1000)
})

test('a color block is the pulldown, then the grid of swatches, each in the order given', () => {
  const html = freeBlock()
  assert.deepEqual(choice(html), {
    label: 'Pen color preset',
    options: [['custom', 'Custom', true, true], ['page-1', 'Darker page 1', false, false], ['sudokupad', 'SudokuPad colors', false, false]]
  })
  assert.equal(html.indexOf('<select') < html.indexOf('class="pte-swatches"'), true, 'pulldown above the grid')
  assert.deepEqual(swatchTags(html).map((tag) => /data-key="([^"]*)"/.exec(tag)[1]), NINE.map(String))
})

test('free mode: each swatch is a color input holding its color, named for screen readers and on hover', () => {
  const tags = swatchTags(freeBlock())
  assert.equal(tags.length, 9)
  assert.equal(tags[3], '<input type="color" class="pte-swatch" data-role="swatch" data-key="4" value="#000004" aria-label="Pen color 4" title="Pen color 4">')
})

test('palette mode: each swatch is a button showing its color, only the picked one pressed, and a gap is an empty cell that keeps its place', () => {
  const html = renderColorBlock({
    prefix: 'cbd-',
    label: 'Cell color page',
    options: [{ value: '0', label: 'Page 1', selected: true }],
    swatches: [{ key: 'a', value: 'rgb(1, 2, 3)', label: 'a' }, null, { key: 'b', value: '#bbb', label: 'b' }],
    picked: 'b'
  })
  assert.deepEqual(swatchTags(html), [
    '<button type="button" class="cbd-swatch" data-role="swatch" data-key="a" aria-pressed="false" aria-label="a" title="a" style="background:rgb(1, 2, 3)">',
    '<span class="cbd-swatch" data-role="swatch" data-empty="slot">',
    '<button type="button" class="cbd-swatch" data-role="swatch" data-key="b" aria-pressed="true" aria-label="b" title="b" style="background:#bbb">'
  ])
})

test('a palette swatch drawn with fillOpacity 0.6 mixes its color to 60% over what is behind it; the default leaves the color whole', () => {
  const swatches = [{ key: 'a', value: 'rgb(1, 2, 3)', label: 'a' }]
  const style = (html) => /style="([^"]*)"/.exec(swatchTags(html)[0])[1]
  const block = (over) => renderColorBlock({ prefix: 'cbd-', label: 'x', options: [], swatches, picked: null, ...over })
  assert.equal(style(block({ fillOpacity: 0.6 })), 'background:color-mix(in srgb, rgb(1, 2, 3) 60%, transparent)')
  assert.equal(style(block({})), 'background:rgb(1, 2, 3)')
})

test('picked: null is palette mode with no swatch pressed, for a brush with no color picked', () => {
  const html = renderColorBlock({ prefix: 'cbd-', label: 'x', options: [], swatches: [{ key: 'a', value: '#aaa', label: 'a' }, { key: 'b', value: '#bbb', label: 'b' }], picked: null })
  assert.deepEqual(swatchTags(html).map((tag) => [/^<(\w+)/.exec(tag)[1], /aria-pressed="(\w+)"/.exec(tag)?.[1]]), [['button', 'false'], ['button', 'false']])
})

test('a palette key or color is HTML-escaped, so a custom palette cannot break the markup', () => {
  assert.equal(escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
  const html = renderColorBlock({ prefix: 'cbd-', label: 'x', options: [{ value: '"0"', label: '<P>' }], swatches: [{ key: '"k"', value: 'red"', label: '<k>' }], picked: null })
  assert.doesNotMatch(html, /"k"|red"|<P>|<k>/)
})

test('what a caller puts beside the grid sits in the grid\'s row, after it', () => {
  const html = freeBlock({ beside: '<div id="pad"></div>' })
  assert.match(html, /<div class="pte-color-row"><div class="pte-swatches">[\s\S]*<\/div><div id="pad"><\/div><\/div>/)
})

const rulesOf = (css) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selectors, body]) => ({ selectors: selectors.trim().split(/,\s*/), body }))

test('the color block\'s styles are scoped by the script\'s editor and class prefix', () => {
  const rules = rulesOf(colorBlockCss('pte-', '#editor'))
  assert.ok(rules.length > 4)
  assert.deepEqual(rules.flatMap((r) => r.selectors).filter((s) => !/^#editor .*\.pte-/.test(s)), [])
})

test('the grid is three columns of square swatches of one size, and a free and a palette swatch share that look', () => {
  const css = colorBlockCss('pte-', '#editor')
  assert.match(css, new RegExp(`\\.pte-swatches \\{[^}]*grid-template-columns: repeat\\(3, ${SWATCH_PX}px\\);[^}]*gap: ${SWATCH_GAP_PX}px;`))
  const swatch = rulesOf(css).find((r) => r.selectors.includes('#editor .pte-swatch'))
  assert.match(swatch.body, new RegExp(`width: ${SWATCH_PX}px; height: ${SWATCH_PX}px;`))
  assert.match(css, /\.pte-swatch\[aria-pressed="true"\] \{[^}]*outline: 3px solid #000/)
  assert.match(css, /\.pte-color-choice \{[^}]*width: 0; min-width: 100%;[^}]*appearance: none;/)
  assert.ok(css.includes(CHOICE_ARROW))
})

test('in edit mode the picker of color n fills the cell of button n, and Keypad Flipped swaps the first and third rows', () => {
  const rules = rulesOf(pickerCss('dt-', 'draw'))
  const placed = (n) => rules.find((r) => r.selectors.includes(`.tool-draw .controls-input .dt-picker[data-key="${n}"]`)).body
  NINE.forEach((n) => assert.match(placed(n), new RegExp(`grid-row: ${Math.ceil(n / 3)} / span 1; grid-column: ${(n - 1) % 3 + 1} / span 1;`), `picker ${n}`))
  const flipped = (n) => rules.find((r) => r.selectors.includes(`.setting-flipkeypad .tool-draw .controls-input .dt-picker[data-key="${n}"]`))?.body
  assert.deepEqual([1, 2, 3, 4, 7, 8, 9].map((n) => flipped(n) && /grid-row: (\d)/.exec(flipped(n))[1]), ['3', '3', '3', undefined, '1', '1', '1'])
  assert.match(pickerCss('dt-', 'draw'), /\.dt-editing \.controls-input button\[data-key\]::after \{ opacity: 0; \}/)
})
