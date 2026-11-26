'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const byDigit = require('../color-by-digit.user.js')

const group = (key, digits) => ({ key, digits })
// Typed out as the independent source: three profiles, the third a nine-group Each digit.
const ODD_EVEN = [group('a1', ['1', '3', '5', '7', '9']), group('a2', ['2', '4', '6', '8'])]
const LOW_HIGH = [group('a3', ['1', '2', '3', '4']), group('a4', ['5']), group('a5', ['6', '7', '8', '9'])]
const EACH = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => group(`a${d}`, [d]))
const STATE = { profiles: [{ name: 'Odd/Even', groups: ODD_EVEN }, { name: 'Low/5/High', groups: LOW_HIGH }, { name: 'Each digit', groups: EACH }], active: 0 }
const colorOf = (key) => `#${key}`
const PAGES = byDigit.layoutPages([['clear', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9']], 0, colorOf)

const count = (html, re) => (html.match(re) || []).length

// Blind to real SudokuPad: the Framework calls, the dialog's rendering at 1200 px, Save reaching the puzzle and undo are
// `npm run test:live`'s (live/color-by-digit/*.live.mjs).
test('the Color by Digit settings dialog edits a selected profile in two columns, by painting digits', () => {
  const { renderEditor, renderProfiles, renderMenu, setSync, setActive, setDigitActive, copyProfile, renameProfile } = byDigit

  // Top row: the mode's On, Cell and Digit checkboxes, ticked as the mode says.
  const ticked = (html) => [...html.matchAll(/data-role="mode-tick" data-box="(\w+)"( checked)?/g)].filter((m) => m[2]).map((m) => m[1])
  assert.deepEqual(ticked(byDigit.renderPulldowns(STATE, { on: true, cell: true, digit: true })), ['on', 'cell', 'digit'])
  assert.deepEqual(ticked(byDigit.renderPulldowns(STATE, { on: false, cell: true, digit: false })), ['cell'])
  const css = byDigit.STYLE_CSS.replace(/\s+/g, ' ')
  // Two columns where 640 px allows, one on a phone.
  assert.match(css, /width: 640px; max-width: calc\(100vw - 16px\)/)
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(270px, 1fr\)\)/)

  // The selected row is apart from the cell profile, and no row has a tag.
  const list = renderProfiles(STATE, colorOf, 2)
  assert.match(list, /data-index="2" role="radio" aria-checked="true"/)
  assert.match(list, /data-index="0" role="radio" aria-checked="false"/)
  assert.doesNotMatch(list, /tag-cells|tag-digits/)
  const tagged = setDigitActive(setActive(setSync(STATE, false), 1), 2)
  assert.deepEqual(byDigit.digitGroups(tagged), EACH)
  assert.deepEqual(byDigit.activeGroups(tagged), LOW_HIGH)

  // "+ New profile" copies the selected profile as "<name> copy", cut to the name limit; it is disabled at six; a blank
  // rename keeps the old name.
  const copied = copyProfile(STATE, 1)
  assert.deepEqual(copied.profiles[3], { name: 'Low/5/High copy', groups: LOW_HIGH })
  const long = renameProfile(STATE, 0, 'x'.repeat(byDigit.MAX_NAME_LENGTH))
  assert.equal(copyProfile(long, 0).profiles[3].name.length, byDigit.MAX_NAME_LENGTH)
  let six = STATE
  while (six.profiles.length < byDigit.MAX_PROFILES) six = copyProfile(six, 0)
  assert.equal(copyProfile(six, 0), six)
  assert.match(renderProfiles(six, colorOf, 0), /data-act="new-profile" disabled/)
  assert.equal(renameProfile(STATE, 0, '   ').profiles[0].name, 'Odd/Even')
  assert.equal(renameProfile(STATE, 0, 'Parity').profiles[0].name, 'Parity')
  assert.match(renderProfiles(STATE, colorOf, 2), /data-role="profile-name" maxlength="24" value="Each digit"/)

  // Digits: one page pulldown, the brush marked, and ten digit keys, each filled with its group's color (#347).
  const paint = renderEditor({ groups: LOW_HIGH, pages: PAGES, page: 0, brush: 'a3' })
  assert.equal(count(paint, /<select [^>]*data-role="color-choice"/g), 1)
  assert.equal(count(paint, /data-act="digit"/g), 10)
  assert.equal(count(paint, /aria-pressed="true"/g), 1)
  assert.match(paint, /data-digit="1" data-key="a3" style="background:color-mix\(in srgb, #a3 60%, transparent\)"/)
  assert.match(paint, /data-digit="0" data-key=""/)
  assert.doesNotMatch(paint, /data-act="(open|remove|add-group)"|data-role="numpad"/)
  assert.deepEqual(byDigit.paintDigit(LOW_HIGH, '1', 'a4').map((g) => g.digits), [['1', '5'], ['2', '3', '4'], ['6', '7', '8', '9']])

  // The selected profile follows its row through a reorder and a delete.
  assert.equal(byDigit.indexAfterMove(2, 2, 0), 0)
  assert.equal(byDigit.indexAfterMove(1, 2, 0), 2)
  assert.equal(byDigit.indexAfterDelete(2, 0, 3), 1)

  // Chips stop at three in the menu, the list and the button's icon.
  const eachRow = (html, marker) => html.split(marker).find((row) => row.includes('Each digit'))
  assert.equal(count(eachRow(renderProfiles(STATE, colorOf, 0), 'data-role="profile-row"'), /data-role="chip"/g), 3)
  assert.equal(count(eachRow(renderMenu(STATE, colorOf, { on: true, cell: true, digit: false }), 'data-role="menu-row"'), /data-role="chip"/g), 3)
  assert.equal(count(byDigit.iconHtml('cell', byDigit.shownChips('cell', EACH, EACH), colorOf), /data-role="chip"/g), 3)
})

test('Color by Digit\'s profile drag shifts the rows between the dragged row\'s start and its drop by one step, the other way', () => {
  const { asideOf } = byDigit
  const shifts = (from, to) => [0, 1, 2, 3].map((i) => asideOf(from, to, 20, i))
  assert.deepEqual(shifts(0, 2), [0, -20, -20, 0])
  assert.deepEqual(shifts(3, 1), [0, 20, 20, 0])
  assert.deepEqual(shifts(1, 1), [0, 0, 0, 0])
})
