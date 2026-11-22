'use strict'
const test = require('node:test')
const { mock } = test
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')

// color-picker.js reads PEN_COLOR_NUMBERS from palette.js, escapeHtml from plain.js and DIALOG_PURPLE from settings-dialog.js.
const NAMES = ['HOLD_TO_EDIT_MS', 'SWATCH_PX', 'SWATCH_GAP_PX', 'renderColorBlock', 'colorBlockCss', 'pickerCss', 'presetChoices']
const { HOLD_TO_EDIT_MS, SWATCH_PX, SWATCH_GAP_PX, renderColorBlock, colorBlockCss, pickerCss, presetChoices } =
  loadLib(['palette', 'plain', 'sudokupad', 'write-style', 'settings-dialog', 'color-picker'], NAMES, { Framework: {} })

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
  assert.match(css, new RegExp(`\\.pte-swatches:only-child \\{[^}]*width: 100%;[^}]*grid-template-columns: repeat\\(3, minmax\\(${SWATCH_PX}px, 1fr\\)\\);`))
  assert.match(css, /\.pte-color-row:has\(> \.pte-swatches:only-child\) \{[^}]*width: 0; min-width: 100%;/)
  assert.match(css, /\.pte-swatches:only-child \.pte-swatch \{[^}]*width: auto; height: auto; aspect-ratio: 1;/)
  const swatch = rulesOf(css).find((r) => r.selectors.includes('#editor .pte-swatch'))
  assert.match(swatch.body, new RegExp(`width: ${SWATCH_PX}px; height: ${SWATCH_PX}px;`))
  assert.match(css, /\.pte-swatch\[aria-pressed="true"\] \{[^}]*outline: 3px solid #000/)
  assert.match(css, /\.pte-color-choice \{[^}]*width: 0; min-width: 100%;[^}]*appearance: none;/)
  // The pulldown's arrow is the dialog's one purple, the Save fill's, as the data URL's escaped `#`.
  assert.match(css, /\.pte-color-choice \{[^}]*background: #fff url\("data:image\/svg\+xml,[^"]*fill='%236b3fa0'/)
})

test('in edit mode the picker of color n fills the cell of button n, and Keypad Flipped swaps the first and third rows', () => {
  const rules = rulesOf(pickerCss('dt-', 'textanywhere'))
  const placed = (n) => rules.find((r) => r.selectors.includes(`.tool-textanywhere .controls-input .dt-picker[data-key="${n}"]`)).body
  assert.deepEqual(NINE.map((n) => /grid-row: (\d) \/ span 1; grid-column: (\d) \/ span 1;/.exec(placed(n)).slice(1).join(',')), ['1,1', '1,2', '1,3', '2,1', '2,2', '2,3', '3,1', '3,2', '3,3'])
  const flipped = (n) => rules.find((r) => r.selectors.includes(`.setting-flipkeypad .tool-textanywhere .controls-input .dt-picker[data-key="${n}"]`))?.body
  assert.deepEqual([1, 2, 3, 4, 7, 8, 9].map((n) => flipped(n) && /grid-row: (\d)/.exec(flipped(n))[1]), ['3', '3', '3', undefined, '1', '1', '1'])
  assert.match(pickerCss('dt-', 'textanywhere'), /\.dt-editing \.controls-input button\[data-key\]::after \{ opacity: 0; \}/)
})

test('a picker fades and scales in from 0.95 over 150 ms, leaves at once, and does neither under reduced motion', () => {
  const css = pickerCss('dt-', 'textanywhere')
  assert.match(css, /\.dt-editing \.dt-picker \{[^}]*animation: dt-picker-in 150ms ease-out;[^}]*\}/)
  assert.match(css, /@keyframes dt-picker-in \{ from \{ opacity: 0; transform: scale\(0\.95\); \} \}/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.dt-editing \.dt-picker \{ animation: none; \} \}/)
})

test('in edit mode a held color button keeps its box: the press shrink is off on it at once', () => {
  assert.match(pickerCss('dt-', 'textanywhere'), /\.tool-textanywhere\.dt-editing \.controls-input button\[data-key\]:active \{ transform: none; transition: none; \}/)
})

function fakePage () {
  const listeners = {}
  const on = (name, handler) => { (listeners[name] ||= []).push(handler) }
  const off = (name, handler) => { listeners[name] = (listeners[name] || []).filter((h) => h !== handler) }
  const fire = (name, event = {}) => {
    const e = { defaultPrevented: false, preventDefault () { this.defaultPrevented = true }, stopImmediatePropagation () { this.stopped = true }, ...event }
    for (const handler of listeners[name] || []) { if (!e.stopped) handler(e) }
    return e
  }
  const classes = new Set(['tool-pen'])
  const pickers = []
  const panel = {
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    querySelector: () => ({ insertAdjacentHTML: (_, html) => pickers.push(html) }),
    querySelectorAll: () => ({ forEach () { pickers.length = 0 } }),
    closest: () => panel,
    contains: (node) => node.where !== 'outside'
  }
  const target = (where) => ({ where, closest: (selector) => (where === 'button' ? panel : null) })
  const fakeDocument = { addEventListener: on, removeEventListener: off, querySelector: (selector) => (selector === '.tool-pen' ? (classes.has('tool-pen') ? panel : null) : null), querySelectorAll: () => [] }
  const fakeWindow = { addEventListener: on, MutationObserver: class { observe () {} disconnect () {} } }
  const { installHoldToEdit } = loadLib(['plain', 'color-picker'], ['installHoldToEdit'], { document: fakeDocument, window: fakeWindow, PEN_COLOR_NUMBERS: [1, 2, 3, 4, 5, 6, 7, 8, 9] })
  const api = installHoldToEdit({ prefix: 'x-', tool: 'pen', colorOf: () => '#000000', save () {} })
  return { fire, target, api, editing: () => classes.has('x-editing'), classes }
}
const altDown = (page) => page.fire('keydown', { code: 'AltLeft', target: page.target('outside') })
const openByHold = (page) => {
  mock.timers.enable({ apis: ['setTimeout'] })
  page.fire('pointerdown', { button: 0, target: page.target('button') })
  mock.timers.tick(HOLD_TO_EDIT_MS)
  mock.timers.reset()
}

test('left Alt held with the tool current does nothing of the script\'s own: no edit mode, and SudokuPad\'s own Alt handling is not stopped', () => {
  const page = fakePage()
  const down = altDown(page)
  assert.equal(page.editing(), false)
  assert.equal(down.stopped, undefined)
  assert.equal(down.defaultPrevented, false)
  page.fire('keyup', { code: 'AltLeft' })
  assert.equal(page.editing(), false)
})

test('left Alt pressed in a hold-opened edit mode is not stopped, and its release does not close it', () => {
  const page = fakePage()
  openByHold(page)
  assert.equal(page.editing(), true)
  assert.equal(altDown(page).stopped, undefined)
  // The fake page's MutationObserver does nothing, so this holds the script's own Alt handling only: on the real page SudokuPad's tool switch ends edit mode.
  page.fire('keyup', { code: 'AltLeft' })
  assert.equal(page.editing(), true)
})

test('Escape ends edit mode and does nothing outside it', () => {
  const page = fakePage()
  page.fire('keydown', { key: 'Escape', code: 'Escape', target: page.target('outside') })
  assert.equal(page.editing(), false)
  openByHold(page)
  assert.equal(page.editing(), true)
  page.fire('keydown', { key: 'Escape', code: 'Escape', target: page.target('outside') })
  assert.equal(page.editing(), false)
})

test('a press outside the panel ends edit mode and is swallowed; a press inside keeps it', () => {
  const page = fakePage()
  openByHold(page)
  const inside = page.fire('pointerdown', { button: 0, target: page.target('panel') })
  assert.equal(page.editing(), true)
  assert.equal(inside.defaultPrevented, false)
  const outside = page.fire('pointerdown', { button: 0, target: page.target('outside') })
  assert.equal(page.editing(), false)
  assert.equal(outside.defaultPrevented, true)
  assert.equal(outside.stopped, true)
  const later = page.fire('pointerdown', { button: 0, target: page.target('outside') })
  assert.equal(later.defaultPrevented, false, 'outside edit mode a press is nobody\'s business')
})

test('the click that follows a swallowed press is swallowed too, once', () => {
  const page = fakePage()
  openByHold(page)
  page.fire('pointerdown', { button: 0, target: page.target('outside') })
  assert.equal(page.fire('click', { target: page.target('outside') }).defaultPrevented, true)
  assert.equal(page.fire('click', { target: page.target('outside') }).defaultPrevented, false)
})

test('a right press outside the panel ends edit mode but leaves no trap for the next click', () => {
  const page = fakePage()
  openByHold(page)
  page.fire('pointerdown', { button: 2, target: page.target('outside') })
  assert.equal(page.editing(), false)
  assert.equal(page.fire('click', { target: page.target('outside') }).defaultPrevented, false)
})

test('the next press clears the click trap an earlier outside press set', () => {
  const page = fakePage()
  openByHold(page)
  page.fire('pointerdown', { button: 0, target: page.target('outside') })
  page.fire('pointerdown', { button: 0, target: page.target('outside') })
  assert.equal(page.fire('click', { target: page.target('outside') }).defaultPrevented, false)
})

test('the window losing focus ends edit mode', () => {
  const page = fakePage()
  openByHold(page)
  page.fire('blur')
  assert.equal(page.editing(), false)
})

test('a page change, told by the caller, ends edit mode', () => {
  const page = fakePage()
  openByHold(page)
  page.api.endEditMode()
  assert.equal(page.editing(), false)
})

test('presetChoices lists the presets with the one in force selected, and shows a set that is none of them first, disabled', () => {
  const labels = { a: 'A', b: 'B', custom: 'Custom' }
  const shown = (preset) => presetChoices(preset, ['a', 'b'], labels).map(({ value, label, selected, disabled }) => [value, label, Boolean(selected), Boolean(disabled)])
  assert.deepEqual(shown('b'), [['a', 'A', false, false], ['b', 'B', true, false]])
  assert.deepEqual(shown('custom'), [['custom', 'Custom', true, true], ['a', 'A', false, false], ['b', 'B', false, false]])
})
