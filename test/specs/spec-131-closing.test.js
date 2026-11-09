'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const colorByDigit = require('../../color-by-digit.user.js')
const { startScript } = require('../unit-start.js')

function warningWithoutGetApp (name) {
  const element = () => ({ style: { setProperty () {} }, setAttribute () {}, append () {}, addEventListener () {}, remove () {} })
  const document = { createElement: element, head: { appendChild () {} }, body: { appendChild () {}, append () {} }, documentElement: { outerHTML: '' }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], fonts: null }
  const window = { MutationObserver: class { observe () {} }, addEventListener () {} }
  return startScript(require.resolve(`../../${name}.user.js`), { document, window, Framework: {} }).warnings
}

// Spec 131's acceptance as one pass over its scripts that are still in the repo, at `npm test`. This seam is blind
// to real SudokuPad: the Framework calls, rendering and undo are `npm run test:live`'s, and a real
// Tampermonkey install is `npm run test:tampermonkey`'s.
test('Color by Digit and Dark Page hold spec 131 together', () => {
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

  for (const name of ['color-by-digit', 'dark-page']) {
    const warnings = warningWithoutGetApp(name)
    // Each script's other features lack Framework's data calls too, in warnings of their own; the one naming getApp is spec 131's.
    const named = warnings.filter((warning) => warning.includes('getApp'))
    assert.equal(named.length, 1, name)
    for (const warning of warnings) assert.ok(warning.startsWith(`${name}: `), warning)
  }
})
