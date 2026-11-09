'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text. panel.js reads rem from plain.js.
const NAMES = ['PANEL_COLOR', 'TRAY_COLOR', 'panelCss', 'installSliderGuards']
const { PANEL_COLOR, TRAY_COLOR, panelCss, installSliderGuards } =
  new Function(`${['plain', 'panel'].map((name) => fs.readFileSync(path.join(__dirname, `${name}.js`), 'utf8')).join('\n')}\nreturn { ${NAMES.join(', ')} }`)() // eslint-disable-line no-new-func

const PEN = { panel: '.tool-pen .controls-input', colorButton: 'button[data-key]', controlButtons: '.tool-pen .controls-input button.mode', tray: 'x-tray', sliders: 'x-sliders', sliderRow: 'x-slider', wedgeSlider: 'x-wedge', fadeSlider: 'x-fade' }
const css = (options = PEN) => panelCss(options).join('\n')
const ruleOf = (selector, options = PEN) => (new RegExp(`^${selector.replace(/[.[\]~()]/g, '\\$&')} \\{([^}]*)\\}`, 'm').exec(css(options)) || [])[1]

test('the panel keeps SudokuPad\'s outer size, 3 columns of 4.3rem and 17.2rem tall, as a grid of three color rows, the controls and the sliders', () => {
  const panel = ruleOf('.tool-pen .controls-input')
  assert.match(panel, /grid-template-columns: repeat\(3, 4\.3rem\);/)
  assert.match(panel, /grid-template-rows: repeat\(3, 2\.8rem\) 5\.05rem 1fr;/)
  assert.match(panel, /height: 17\.2rem !important;/)
  assert.match(ruleOf('.tool-pen .controls-input button[data-key="0"], .tool-pen .controls-input button[data-control="delete"]'), /display: none !important;/)
})

test('the color buttons are 2.5rem tall at 4rem wide with 0.15rem margins and keep position: relative, which their color line is placed against', () => {
  const colors = ruleOf('.tool-pen .controls-input button[data-key]')
  assert.match(colors, /position: relative;/)
  assert.match(colors, /width: 4rem !important; height: 2\.5rem !important;/)
  assert.match(colors, /margin: 0\.15rem !important;/)
})

test('the three controls are one 4rem square size in the fourth grid row, in the panel color', () => {
  const controls = ruleOf(PEN.controlButtons)
  assert.match(controls, /width: 4rem; height: 4rem;/)
  assert.match(controls, /grid-row: 4;/)
  assert.match(controls, new RegExp(`color: ${PANEL_COLOR};`))
})

test('the tray is #efeaf4 with 14px corners, reaches 0.25rem past the color block and starts 0.5rem under it, behind the controls and the sliders, taking no cell', () => {
  assert.equal(TRAY_COLOR, '#efeaf4')
  const tray = ruleOf('.x-tray')
  assert.match(tray, /background: #efeaf4; border-radius: 14px;/)
  assert.match(tray, /margin: 0\.5rem -0\.25rem 0;/)
  assert.match(tray, /grid-row: 4 \/ 6; grid-column: 1 \/ 4;/)
  assert.match(tray, /position: absolute; inset: 0;/)
  assert.equal(css().includes('.tool-pen .controls-input:not(:has(.x-sliders)) .x-tray { grid-row: 4 / 5; margin-bottom: -0.25rem; }'), true, 'with no sliders the tray ends under the controls, with an end line since a box placed by its start alone runs to the panel\'s edge')
})

test('the sliders block spans the three columns of the fifth grid row, with the buttons\' margin and 0.4rem below, and draws no box of its own', () => {
  const rule = ruleOf('.x-sliders')
  assert.match(rule, /grid-row: 5; grid-column: 1 \/ 4;/)
  assert.match(rule, /box-sizing: border-box;/)
  assert.match(rule, /margin: 0\.15rem 0\.15rem 0\.4rem;/)
  assert.doesNotMatch(rule, /border:|background/)
  assert.match(rule, /z-index: 1;/)
})

test('the wedge track is the thickness-style picture and the fade track a gradient to the panel color, each only on its own slider id', () => {
  assert.match(ruleOf('#x-wedge::-webkit-slider-runnable-track'), /background: url\("data:image\/svg\+xml,/)
  assert.match(ruleOf('#x-wedge::-moz-range-track'), /background: url\("data:image\/svg\+xml,/)
  assert.match(ruleOf('#x-fade::-webkit-slider-runnable-track'), new RegExp(`background: linear-gradient\\(to right, color-mix\\(in srgb, ${PANEL_COLOR} 8%, transparent\\), ${PANEL_COLOR}\\);`))
  assert.match(ruleOf('#x-fade::-moz-range-track'), /background: linear-gradient/)
})

test('a panel with no fade slider gets no fade track rules', () => {
  const { fadeSlider, ...wedgeOnly } = PEN
  assert.doesNotMatch(css(wedgeOnly), /linear-gradient|undefined/)
  assert.match(ruleOf('#x-wedge::-webkit-slider-runnable-track', wedgeOnly), /background: url\("data:image\/svg\+xml,/)
})

test('both thumbs are 1.1rem white circles ringed in the panel color, centered on the 0.8rem track', () => {
  assert.match(ruleOf('.x-slider input::-webkit-slider-thumb'), new RegExp(`margin-top: -0\\.15rem; box-sizing: border-box; width: 1\\.1rem; height: 1\\.1rem; border-radius: 50%; background: #fff; border: 0\\.2rem solid ${PANEL_COLOR};`))
  assert.match(ruleOf('.x-slider input::-moz-range-thumb'), /width: 1\.1rem; height: 1\.1rem;/)
})

test('Keypad Flipped swaps the first and third color rows by grid row, under the panel selector', () => {
  const rule = (key) => ruleOf(`.setting-flipkeypad .tool-pen .controls-input button[data-key="${key}"]`)
  ;[1, 2, 3].forEach((key) => assert.equal(rule(key), ' grid-row: 3 / span 1; '))
  ;[7, 8, 9].forEach((key) => assert.equal(rule(key), ' grid-row: 1 / span 1; '))
})

test('two scripts get the same rules under their own selectors and nothing of the other\'s', () => {
  const draw = css({ ...PEN, panel: '.tool-draw .controls-input', controlButtons: '.tool-draw .controls-input button.clear', tray: 'd-tray', sliders: 'd-sliders', sliderRow: 'd-slider', wedgeSlider: 'd-size', fadeSlider: 'd-opacity' })
  assert.match(draw, /^\.tool-draw \.controls-input \{ display: grid !important;/m)
  assert.doesNotMatch(draw, /tool-pen|x-tray|x-wedge/)
})

test('a panel given no sliderRow gets no slider rule, and still gets its block under the controls and its tray', () => {
  const { sliderRow, wedgeSlider, fadeSlider, ...menus } = PEN
  const sliderless = css(menus)
  assert.doesNotMatch(sliderless, /range-track|range-thumb|x-wedge|x-fade|\.x-slider /)
  assert.match(sliderless, /^\.x-sliders \{ grid-row: 5;/m)
  assert.doesNotMatch(ruleOf('.x-sliders', menus), /display: flex|padding/, 'a block of buttons lays itself out')
  assert.match(ruleOf('.x-sliders', PEN) + css(PEN), /display: flex; flex-direction: column; justify-content: space-evenly/, 'a block of sliders is a flex column')
  assert.match(sliderless, /^\.x-tray \{ grid-row: 4 \/ 6;/m)
})

// A document and a window that record their listeners, with a controllable focused element.
const fakeDocument = (sliders) => {
  const listeners = {}
  const win = {}
  const doc = { activeElement: null, addEventListener: (type, fn, capture) => { listeners[`doc:${type}`] = { fn, capture } } }
  win.addEventListener = (type, fn, capture) => { listeners[`win:${type}`] = { fn, capture } }
  installSliderGuards(sliders, doc, win)
  return { doc, listeners }
}
const target = (matches) => ({ closest: (selector) => (matches === selector ? {} : null) })

test('a mouse move over the sliders is kept from the page, a move elsewhere is not, and the guard runs first (capture)', () => {
  const { listeners } = fakeDocument('.x-sliders')
  assert.equal(listeners['doc:mousemove'].capture, true)
  const over = { target: target('.x-sliders'), stopped: false, stopPropagation () { this.stopped = true } }
  listeners['doc:mousemove'].fn(over)
  assert.equal(over.stopped, true)
  const elsewhere = { target: target('.other'), stopped: false, stopPropagation () { this.stopped = true } }
  listeners['doc:mousemove'].fn(elsewhere)
  assert.equal(elsewhere.stopped, false)
})

test('releasing the pointer blurs a focused slider and no other element, in the capture phase', () => {
  const { doc, listeners } = fakeDocument('.x-sliders')
  assert.equal(listeners['win:pointerup'].capture, true)
  let blurred = 0
  doc.activeElement = { matches: (selector) => selector === '.x-sliders input', blur: () => { blurred++ } }
  listeners['win:pointerup'].fn()
  assert.equal(blurred, 1)
  doc.activeElement = { matches: () => false, blur: () => { blurred++ } }
  listeners['win:pointerup'].fn()
  doc.activeElement = null
  listeners['win:pointerup'].fn()
  assert.equal(blurred, 1)
})

test('a button named as pressButtons presses like the controls, and a panel that names none has the same rules as before', () => {
  const eye = '.tool-pen .controls-input button.eye'
  const list = `.tool-pen .controls-input button[data-key], .tool-pen .controls-input button.mode, ${eye}`
  const withEye = { ...PEN, pressButtons: eye }
  assert.match(ruleOf(list, withEye), /transition: transform 120ms ease-out;/)
  assert.match(ruleOf(`:is(${list}):active`, withEye), /transform: scale\(0\.97\);/)
  assert.equal(css(withEye).includes(`${list} { transition: none; } :is(${list}):active { transform: none; }`), true)
  assert.equal(css(PEN).includes('button.eye'), false)
})

test('a pressed color button or control shrinks to 0.97 over 120 ms, and the whole press motion is off under reduced motion', () => {
  const two = { ...PEN, controlButtons: '.tool-pen .controls-input button.mode, .tool-pen .controls-input button.page' }
  const list = '.tool-pen .controls-input button[data-key], .tool-pen .controls-input button.mode, .tool-pen .controls-input button.page'
  assert.match(ruleOf(list, two), /transition: transform 120ms ease-out;/)
  assert.match(ruleOf(`:is(${list}):active`, two), /transform: scale\(0\.97\);/)
  const reduced = '@media (prefers-reduced-motion: reduce) { ' + list + ' { transition: none; } :is(' + list + '):active { transform: none; } }'
  assert.equal(css(two).includes(reduced), true, `the reduced motion block is missing from:\n${css(two)}`)
})
