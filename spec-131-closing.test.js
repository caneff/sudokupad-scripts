'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const colorByDigit = require('./color-by-digit.user.js')
const digitColor = require('./digit-color.user.js')
const darkPage = require('./dark-page.user.js')

// The warning each script prints starting on a page whose Framework has no getApp.
function warningWithoutGetApp (name) {
  const file = require.resolve(`./${name}.user.js`)
  const element = () => ({ style: { setProperty () {} } })
  const saved = { document: global.document, window: global.window }
  global.document = { createElement: element, head: { appendChild () {} }, body: { appendChild () {} }, querySelector: () => null, querySelectorAll: () => [], fonts: null }
  global.window = { MutationObserver: class { observe () {} }, addEventListener () {} }
  global.Framework = {}
  const warnings = []
  const realWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  const cached = require.cache[file]
  delete require.cache[file]
  try {
    require(file)
  } finally {
    console.warn = realWarn
    delete global.Framework
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete global[key]
      else global[key] = value
    }
    require.cache[file] = cached
  }
  return warnings
}

// Spec 131's acceptance as one pass over the three scripts, at `npm test`. This seam is blind to real
// SudokuPad: the Framework calls, rendering and undo are `npm run test:live`'s, and neither run covers
// a real Tampermonkey install or crackingthecryptic.com.
test('Color by Digit, Digit Color and Dark Page hold spec 131 together', () => {
  const { editGroupsFor, rowAfterKey, layoutPages } = colorByDigit
  const colors = [{ key: 'a' }, { key: 'b' }]
  let edit = editGroupsFor([{ key: 'a', digits: [] }], [0], 'add-group', {}, colors)
  assert.deepEqual(edit.groups[1], { key: 'b', digits: [] })
  edit = editGroupsFor(edit.groups, [4, 7], 'digit', { group: 1, digit: '5' }, colors)
  edit = editGroupsFor(edit.groups, edit.shown, 'remove', { group: 0 }, colors)
  assert.deepEqual(edit, { groups: [{ key: 'b', digits: ['5'] }], shown: [7] })
  assert.deepEqual(editGroupsFor(edit.groups, edit.shown, 'clear', {}, colors), { groups: [], shown: [] })
  assert.equal(rowAfterKey('ArrowUp', 0, 3), 2)

  const page = ['clear', 'a1', 'rejected']
  const [{ rows }] = layoutPages([page], 0, (key) => (key === 'rejected' ? '' : `#${key}`))
  assert.deepEqual(rows[0].slice(0, 2).map((slot) => slot && slot.key), ['a1', null])

  const html = digitColor.renderEditor({ ...digitColor.DEFAULT_COLORS, 3: null })
  assert.match(html, /data-digit="3" value="#1d6ae5" style="opacity:0.4"/)
  const css = digitColor.buildCss(digitColor.DEFAULT_COLORS)
  for (const selector of ['#cell-pencilmarks .cell-pencilmark', '#cell-candidates tspan']) assert.ok(css.includes(selector), selector)

  const box = { left: 10.5, top: 10.5, right: 20.5, bottom: 20.5 }
  assert.deepEqual(darkPage.snapOutward(box, 2), { left: 8, top: 8, right: 23, bottom: 23 })

  for (const name of ['color-by-digit', 'digit-color', 'dark-page']) {
    const warnings = warningWithoutGetApp(name)
    assert.equal(warnings.length, 1, name)
    assert.ok(warnings[0].startsWith(`${name}: `) && warnings[0].includes('getApp'), warnings[0])
  }
})
