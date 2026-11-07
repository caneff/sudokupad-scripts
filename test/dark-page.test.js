'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { buildCss, unionBoxes, snapOutward, clampBox, growBox, paintAlpha, hasVisiblePaint, halfStroke, markerReach, PAD, SOLVER_REACH, RECT_ID, VERSION, DEFAULT_COLOR, textColorFor, savedColor, readSavedColor, DATA_KEY, copiedSettings, pastedSettings, pasteReport } = require('../dark-page.user.js')

function rules () {
  return buildCss(DEFAULT_COLOR).split('\n').map((line) => {
    const m = /^(.*?) \{ (.*) \}$/.exec(line)
    assert.ok(m, `not a one-line rule: ${line}`)
    return { selector: m[1], declarations: m[2] }
  })
}

const rule = (selector) => rules().find((r) => r.selector === selector)

test('the page background is black by default', () => {
  assert.equal(DEFAULT_COLOR, '#000000')
  assert.deepEqual(rule('body'), { selector: 'body', declarations: 'background-color: #000000 !important' })
})

test('the page background is the color given', () => {
  const given = buildCss('#336699').split('\n').find((line) => line.startsWith('body '))
  assert.equal(given, 'body { background-color: #336699 !important }')
})

test('textColorFor gives light text on a dark page and dark text on a light one, switching where their contrast with the page color is equal', () => {
  assert.equal(textColorFor('#000000'), '#dddddd')
  assert.equal(textColorFor('#333333'), '#dddddd')
  assert.equal(textColorFor('#0000ff'), '#dddddd')
  assert.equal(textColorFor('#ffffff'), '#222222')
  assert.equal(textColorFor('#cccccc'), '#222222')
  assert.equal(textColorFor('#ffff00'), '#222222')
  // Mid greys either side of the contrast crossover, where a plain half-way split on lightness differs.
  assert.equal(textColorFor('#777777'), '#222222')
  assert.equal(textColorFor('#707070'), '#dddddd')
  // The switch falls between these two neighbouring greys.
  assert.equal(textColorFor('#747474'), '#dddddd')
  assert.equal(textColorFor('#757575'), '#222222')
})

test('readSavedColor reads the saved color through the Framework, and reports a Framework it cannot read as nothing saved', () => {
  assert.equal(readSavedColor({ getData: (key) => (key === DATA_KEY ? '#ABCDEF' : null) }), '#abcdef')
  assert.equal(readSavedColor({ getData: () => null }), null)
  assert.equal(readSavedColor({}), null)
  assert.equal(readSavedColor(null), null)
  const logged = []
  const original = console.error
  console.error = (...args) => logged.push(args)
  try {
    assert.equal(readSavedColor({ getData: () => { throw new Error('storage blocked') } }), null)
  } finally {
    console.error = original
  }
  assert.equal(logged.length, 1)
})

test('the credit line takes the text color for the page color given', () => {
  const credit = (color) => buildCss(color).split('\n').find((line) => line.startsWith('.controls-footer'))
  assert.equal(credit('#ffffff'), '.controls-footer, .controls-footer a { color: #222222 !important }')
  assert.equal(credit('#000000'), '.controls-footer, .controls-footer a { color: #dddddd !important }')
})

test('the replay tool\'s readout (the ::after of .controls-input) takes the text color for the page color given', () => {
  const readout = (color) => buildCss(color).split('\n').find((line) => line.startsWith('.controls-input::after'))
  assert.equal(readout('#ffffff'), '.controls-input::after { color: #222222 !important }')
  assert.equal(readout('#000000'), '.controls-input::after { color: #dddddd !important }')
  assert.equal(readout('#ffcc00'), '.controls-input::after { color: #222222 !important }')
})

const buttonRules = (color) => buildCss(color).split('\n').filter((line) => /button/.test(line.split(' {')[0]))

test('on a dark page color the control buttons go dark gray with light purple text, and a button that is on keeps its own fill and gets a purple border', () => {
  assert.deepEqual(buttonRules('#000000'), [
    '.controls-app button:not(.selected):not(.selectedperm), .controls-tool button:not(.selected):not(.selectedperm), .controls-aux button:not(.selected):not(.selectedperm) { background-color: #2a2a2a !important; color: #d2a8f0 !important; border-color: #4a4a4a !important }',
    '.controls-app button.selected, .controls-app button.selectedperm, .controls-tool button.selected, .controls-tool button.selectedperm, .controls-aux button.selected, .controls-aux button.selectedperm { border-color: #d2a8f0 !important }',
    '.button-row button { border-color: #4a4a4a !important }'
  ])
})

test('on a light page color SudokuPad\'s buttons are left as they are', () => {
  assert.deepEqual(buttonRules('#ffffff'), [])
  assert.deepEqual(buttonRules('#ffcc00'), [])
})

test('the buttons switch exactly where the credit text does', () => {
  for (const color of ['#000000', '#333333', '#747474', '#757575', '#cccccc', '#ffffff', '#0000ff', '#ffff00']) {
    assert.equal(buttonRules(color).length > 0, textColorFor(color) === '#dddddd', color)
  }
})

test('savedColor reads a saved #rrggbb string as lowercase, and anything else as nothing saved', () => {
  assert.equal(savedColor('#336699'), '#336699')
  assert.equal(savedColor('#ABCDEF'), '#abcdef')
  for (const bad of [null, undefined, '', 'red', '#fff', '#12345g', 5, {}, ['#000000']]) assert.equal(savedColor(bad), null, String(bad))
})

test('the rectangle takes SudokuPad\'s own page background, so it follows SudokuPad\'s dark mode', () => {
  assert.deepEqual(rule(`#${RECT_ID}`), { selector: `#${RECT_ID}`, declarations: 'background-color: var(--body-bg) !important' })
})

test('every declaration is !important, so SudokuPad\'s own rules, dark mode included, lose', () => {
  for (const { selector, declarations } of rules()) {
    for (const d of declarations.split('; ')) assert.ok(d.endsWith(' !important'), `${selector}: ${d}`)
  }
})

test('no rule declares a theme variable, which would reach the grid through the shared :root', () => {
  for (const { selector, declarations } of rules()) {
    assert.ok(!/(^|[;\s])--[\w-]+\s*:/.test(declarations), `${selector} declares a variable`)
    assert.ok(!/:root|\bhtml\b/.test(selector), `${selector} reaches the root`)
  }
})

test('no rule reaches inside the board, or sets color on body or a container of it', () => {
  for (const { selector, declarations } of rules()) {
    for (const part of selector.split(',').map((s) => s.trim())) {
      assert.ok(!/svg|\.grid|\.cells|\.game|\.app|#board|\*/.test(part), `${selector} reaches the board or a container of it: ${part}`)
      if (/(^|[;\s])color\s*:/.test(declarations)) assert.notEqual(part, 'body', selector)
    }
  }
})

test('unionBoxes covers every box and is null for none', () => {
  assert.equal(unionBoxes([]), null)
  assert.deepEqual(unionBoxes([{ left: 5, top: 6, right: 10, bottom: 12 }, { left: 1, top: 8, right: 7, bottom: 20 }]), { left: 1, top: 6, right: 10, bottom: 20 })
})

test('snapOutward pads, then rounds every edge away from the box, so no partial pixel is left dark', () => {
  assert.deepEqual(snapOutward({ left: 17.69, top: 134.69, right: 688.31, bottom: 805.31 }, 0), { left: 17, top: 134, right: 689, bottom: 806 })
  assert.deepEqual(snapOutward({ left: 10.5, top: 10.5, right: 20.5, bottom: 20.5 }, 2), { left: 8, top: 8, right: 23, bottom: 23 })
  assert.deepEqual(snapOutward({ left: 10, top: 10, right: 20, bottom: 20 }, 0), { left: 10, top: 10, right: 20, bottom: 20 })
})

test('the border PAD leaves is at most 2px on any edge, as ruled', () => {
  for (const edge of [0, 0.01, 0.25, 0.5, 0.75, 0.99]) {
    const out = snapOutward({ left: 100 + edge, top: 100 + edge, right: 200 + edge, bottom: 200 + edge }, PAD)
    assert.equal(100 + edge - out.left <= 2 && out.right - (200 + edge) <= 2 && 100 + edge - out.top <= 2 && out.bottom - (200 + edge) <= 2, true, JSON.stringify(out))
  }
})

test('clampBox keeps the part of a box that lies within the limit', () => {
  assert.deepEqual(clampBox({ left: 0, top: 5, right: 50, bottom: 60 }, { left: 10, top: 0, right: 40, bottom: 100 }), { left: 10, top: 5, right: 40, bottom: 60 })
})

test('growBox grows every side by the amount', () => {
  assert.deepEqual(growBox({ left: 10, top: 20, right: 30, bottom: 40 }, 3), { left: 7, top: 17, right: 33, bottom: 43 })
})

test('the margin kept around the cells is 36px, the value Chris ruled: the largest arrow\'s reach of 34 and the White outline\'s 2', () => {
  assert.equal(SOLVER_REACH, 36, `reach ${SOLVER_REACH}: each unit adds white around every puzzle, so it is not raised past the ruled 36`)
})

test('markerReach is the farthest side of the marker from its reference point, times the stroke width unless it is in user units, times the scale', () => {
  const none = { markerWidth: null, markerHeight: null, refX: null, refY: null, markerUnits: null }
  assert.equal(markerReach(none, 2, 1), 6, 'the SVG defaults: a 3x3 box with the reference point at its corner')
  assert.equal(markerReach({ ...none, markerWidth: '4', markerHeight: '2.5', refX: '1', markerUnits: null }, 2, 1.5), 9)
  assert.equal(markerReach({ markerWidth: '80', markerHeight: '80', refX: '30', refY: '40', markerUnits: 'userSpaceOnUse' }, 9, 2), 100)
})

test('paintAlpha reads the alpha of a computed color, and none is 0', () => {
  assert.equal(paintAlpha('none'), 0)
  assert.equal(paintAlpha('rgba(255, 255, 255, 0)'), 0)
  assert.equal(paintAlpha('rgba(0, 0, 0, 0.4)'), 0.4)
  assert.equal(paintAlpha('rgb(0, 0, 0)'), 1)
  assert.equal(paintAlpha('url("#pattern")'), 1)
  assert.equal(paintAlpha('transparent'), 0)
})

const painted = { display: 'inline', visibility: 'visible', opacity: '1', fill: 'rgb(0, 0, 0)', fillOpacity: '1', stroke: 'none', strokeOpacity: '1', strokeWidth: '0px' }

test('an element with a fill, or with a stroke of some width, has visible paint', () => {
  assert.equal(hasVisiblePaint(painted), true)
  assert.equal(hasVisiblePaint({ ...painted, fill: 'none', stroke: 'rgb(0, 0, 0)', strokeWidth: '2px' }), true)
})

test('an element with no visible paint does not count', () => {
  assert.equal(hasVisiblePaint({ ...painted, fill: 'rgba(255, 255, 255, 0)' }), false, 'transparent fill')
  assert.equal(hasVisiblePaint({ ...painted, fill: 'none', stroke: 'rgb(0, 0, 0)', strokeWidth: '0px' }), false, 'zero-width stroke')
  assert.equal(hasVisiblePaint({ ...painted, fill: 'none', stroke: 'none' }), false, 'no fill and no stroke')
  assert.equal(hasVisiblePaint({ ...painted, fillOpacity: '0' }), false, 'fill-opacity 0')
  assert.equal(hasVisiblePaint({ ...painted, opacity: '0' }), false, 'opacity 0')
  assert.equal(hasVisiblePaint({ ...painted, display: 'none' }), false, 'display none')
  assert.equal(hasVisiblePaint({ ...painted, visibility: 'hidden' }), false, 'visibility hidden')
})

test('halfStroke is half the stroke width in page pixels, and 0 when there is no visible stroke', () => {
  assert.equal(halfStroke({ ...painted, stroke: 'rgb(0, 0, 0)', strokeWidth: '4px' }, 2), 4)
  assert.equal(halfStroke({ ...painted, stroke: 'none', strokeWidth: '4px' }, 2), 0)
  assert.equal(halfStroke({ ...painted, stroke: 'rgba(0, 0, 0, 0)', strokeWidth: '4px' }, 2), 0)
})

test('VERSION is the @version in the script header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, '..', 'dark-page.user.js'), 'utf8')))
})

const SVG_BOX = { left: 0, top: 0, right: 500, bottom: 500 }
const CELL_BOX = { left: 100, top: 100, right: 200, bottom: 200 }

// Starts the script on a page holding a board of one cell, with `framework` as the page's Framework, or none.
function startOnBoard (framework) {
  const file = require.resolve('../dark-page.user.js')
  const appended = []
  const observed = []
  const element = () => ({ style: { setProperty (name, value) { this[name] = value } } })
  const svg = { getScreenCTM: () => ({ a: 1 }), getBoundingClientRect: () => SVG_BOX, querySelectorAll: () => [] }
  const cell = { getBoundingClientRect: () => ({ ...CELL_BOX, width: 100, height: 100 }) }
  const saved = { document: global.document, window: global.window, Framework: global.Framework }
  global.document = {
    createElement: element,
    head: { appendChild: (el) => appended.push(el) },
    body: { appendChild: (el) => appended.push(el) },
    querySelector: (selector) => (selector === '#svgrenderer' ? svg : null),
    querySelectorAll: (selector) => (selector === '.cells .cell' ? [cell] : []),
    fonts: null
  }
  global.window = { MutationObserver: class { observe (target) { observed.push(target) } }, addEventListener () {}, requestAnimationFrame () {} }
  delete global.Framework
  if (framework) global.Framework = framework
  const warnings = []
  const realWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  delete require.cache[file]
  try {
    require(file)
  } finally {
    console.warn = realWarn
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete global[name]
      else global[name] = value
    }
    delete require.cache[file]
  }
  return {
    warnings,
    observed,
    style: appended.find((el) => el.id === 'dark-page-style'),
    rect: appended.find((el) => el.id === RECT_ID)
  }
}

function assertDarkens ({ style, rect, observed }) {
  const kept = clampBox(snapOutward(growBox(CELL_BOX, SOLVER_REACH), PAD), snapOutward(SVG_BOX, 0))
  assert.equal(style.textContent, buildCss(DEFAULT_COLOR))
  assert.equal(style.disabled, false)
  assert.equal(rect.style.display, 'block')
  assert.equal(rect.style.left, `${kept.left}px`)
  assert.equal(rect.style.width, `${kept.right - kept.left}px`)
  assert.equal(observed.length, 1)
}

test('a Framework without getApp warns that the settings entry was skipped, and the page still darkens', () => {
  const page = startOnBoard({})
  assert.equal(page.warnings.length, 1)
  assert.match(page.warnings[0], /^dark-page: .*getApp/)
  assertDarkens(page)
})

test('a page with no Framework at all darkens without a warning', () => {
  const page = startOnBoard()
  assert.deepEqual(page.warnings, [])
  assertDarkens(page)
})

test('copiedSettings: the color in force, the default when none is saved', () => {
  assert.deepEqual(JSON.parse(copiedSettings({ getData: () => null })), { [DATA_KEY]: DEFAULT_COLOR })
  assert.deepEqual(JSON.parse(copiedSettings({ getData: (key) => ({ [DATA_KEY]: '#123456', Other_key: 1 }[key]) })), { [DATA_KEY]: '#123456' })
})

test('pastedSettings: a valid color is kept lower-case, a bad one is skipped and counted, other keys are ignored', () => {
  assert.deepEqual(pastedSettings(JSON.stringify({ [DATA_KEY]: '#ABCDEF', ColorByDigit_auto: true })), { values: { [DATA_KEY]: '#abcdef' }, skipped: 0 })
  assert.deepEqual(pastedSettings(JSON.stringify({ [DATA_KEY]: 'red' })), { values: {}, skipped: 1 })
})

test('pastedSettings: throws on text that is not a JSON object', () => {
  assert.throws(() => pastedSettings('{'), /not JSON/)
  assert.throws(() => pastedSettings('"#ffffff"'), /not a settings object/)
})

test('pasteReport: says how many were pasted and how many skipped, and when the text held nothing', () => {
  assert.equal(pasteReport(2, 0), 'Pasted 2 settings.')
  assert.equal(pasteReport(1, 3), 'Pasted 1 setting; skipped 3 that did not check out.')
  assert.equal(pasteReport(0, 1), 'Pasted 0 settings; skipped 1 that did not check out.')
  assert.equal(pasteReport(0, 0), 'Nothing to paste: the text holds none of this script\'s settings.')
})

test('pastedSettings: text with none of this script\'s keys pastes and skips nothing; an array is no settings object', () => {
  assert.deepEqual(pastedSettings('{}'), { values: {}, skipped: 0 })
  assert.deepEqual(pastedSettings(JSON.stringify({ ColorByDigit_auto: true })), { values: {}, skipped: 0 })
  assert.throws(() => pastedSettings('[{"DarkPage_color":"#ffffff"}]'), /not a settings object/)
})
