'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const colorByDigit = require('../color-by-digit.user.js')
const { startScript } = require('./unit-start.js')

function warningWithoutGetApp (name) {
  const element = () => ({ style: { setProperty () {} }, setAttribute () {}, append () {}, addEventListener () {}, remove () {} })
  const document = { createElement: element, head: { appendChild () {} }, body: { appendChild () {}, append () {} }, documentElement: { outerHTML: '' }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], fonts: null }
  const window = { MutationObserver: class { observe () {} }, addEventListener () {} }
  return startScript(require.resolve(`../${name}.user.js`), { document, window, Framework: {} }).warnings
}

// Blind to real SudokuPad: the Framework calls, rendering and undo are `npm run test:live`'s.
test('painting a digit moves it between groups, a page layout drops a rejected key, and a page with no getApp names it once in Color by Digit and never in Dark Page, whose settings do not need it', () => {
  const { paintDigit, rowAfterKey, layoutPages } = colorByDigit
  // Painting a digit moves it, and a group left with no digits is gone.
  let groups = paintDigit([{ key: 'a', digits: ['5'] }], '2', 'b')
  assert.deepEqual(groups, [{ key: 'b', digits: ['2'] }, { key: 'a', digits: ['5'] }])
  groups = paintDigit(groups, '5', 'b')
  assert.deepEqual(groups, [{ key: 'b', digits: ['2', '5'] }])
  assert.deepEqual(paintDigit(paintDigit(groups, '2', 'b'), '5', 'b'), [])
  assert.equal(rowAfterKey('ArrowUp', 0, 3), 2)

  const page = ['clear', 'a1', 'rejected']
  const [{ rows }] = layoutPages([page], 0, (key) => (key === 'rejected' ? '' : `#${key}`))
  assert.deepEqual(rows[0].slice(0, 2).map((slot) => slot && slot.key), ['a1', null])

  for (const [name, namingGetApp] of [['color-by-digit', 1], ['dark-page', 0]]) {
    const warnings = warningWithoutGetApp(name)
    // Each script's features lack Framework's data calls too, in warnings of their own.
    const named = warnings.filter((warning) => warning.includes('getApp'))
    assert.equal(named.length, namingGetApp, name)
    for (const warning of warnings) assert.ok(warning.startsWith(`${name}: `), warning)
  }
})
