'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { buildCss, unionBoxes, snapOutward, paintAlpha, hasVisiblePaint, halfStroke, PAD } = require('./dark-page.user.js')

// The rules buildCss returns, one per line, as { selector, declarations }.
function rules () {
  return buildCss().split('\n').map((line) => {
    const m = /^(.*?) \{ (.*) \}$/.exec(line)
    assert.ok(m, `not a one-line rule: ${line}`)
    return { selector: m[1], declarations: m[2] }
  })
}

const rule = (selector) => rules().find((r) => r.selector === selector)

test('the page background is black', () => {
  assert.deepEqual(rule('body'), { selector: 'body', declarations: 'background-color: #000000 !important' })
})

test('the rectangle takes SudokuPad\'s own page background, so it follows SudokuPad\'s dark mode', () => {
  const { declarations } = rule('#dark-page-rect')
  assert.ok(declarations.includes('background-color: var(--body-bg) !important'), declarations)
})

test('the rectangle sits behind everything and never takes a click', () => {
  const { declarations } = rule('#dark-page-rect')
  assert.ok(declarations.includes('z-index: -1 !important'), declarations)
  assert.ok(declarations.includes('pointer-events: none !important'), declarations)
  assert.ok(declarations.includes('position: fixed !important'), declarations)
})

test('the credit line gets a readable color', () => {
  assert.deepEqual(rule('.controls-footer, .controls-footer a'), { selector: '.controls-footer, .controls-footer a', declarations: 'color: #dddddd !important' })
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
  assert.deepEqual(snapOutward({ left: 10.5, top: 10.5, right: 20.5, bottom: 20.5 }, PAD), { left: 8, top: 8, right: 23, bottom: 23 })
  assert.deepEqual(snapOutward({ left: 10, top: 10, right: 20, bottom: 20 }, 0), { left: 10, top: 10, right: 20, bottom: 20 })
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
