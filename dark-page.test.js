'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { buildCss, unionBoxes, snapOutward, clampBox, growBox, paintAlpha, hasVisiblePaint, halfStroke, markerReach, PAD, SOLVER_REACH, RECT_ID, VERSION, DEFAULT_COLOR, textColorFor, savedColor, readSavedColor, DATA_KEY } = require('./dark-page.user.js')

// The rules buildCss returns, one per line, as { selector, declarations }.
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

test('a pen mark\'s reach is kept around the cells, past the 10.07px measured on the page', () => {
  assert.equal(SOLVER_REACH >= 10.07, true)
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
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, 'dark-page.user.js'), 'utf8')))
})
