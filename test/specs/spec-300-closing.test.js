'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const read = (file) => readFileSync(join(__dirname, '..', '..', file), 'utf8')
const byDigit = require('../../color-by-digit.user.js')

const group = (key, digits) => ({ key, digits })
// Typed out as the independent source: three profiles, the third a nine-group Each digit.
const ODD_EVEN = [group('a1', ['1', '3', '5', '7', '9']), group('a2', ['2', '4', '6', '8'])]
const LOW_HIGH = [group('a3', ['1', '2', '3', '4']), group('a4', ['5']), group('a5', ['6', '7', '8', '9'])]
const EACH = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => group(`a${d}`, [d]))
const STATE = { profiles: [{ name: 'Odd/Even', groups: ODD_EVEN }, { name: 'Low/5/High', groups: LOW_HIGH }, { name: 'Each digit', groups: EACH }], active: 0 }
const colorOf = (key) => `#${key}`
const PAGES = byDigit.layoutPages([['clear', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9']], 0, colorOf)

const count = (html, re) => (html.match(re) || []).length

// Spec 300's acceptance as one pass over Color by Digit's pure functions and its details page, at `npm test`: the top
// row's pulldowns, the two-column layout's CSS, the selected row
// apart from the cell and digit profiles, rename, "+ New profile", the paint editor's palette and digit keys (#347), the three-chip
// cap, and the details page's annotated dialog picture. This seam is blind to real SudokuPad: the Framework calls, the
// dialog's rendering at 1200 and 390 px, Save reaching the puzzle and undo are `npm run test:live`'s
// (live/color-by-digit/*.live.mjs), and neither run covers a real Tampermonkey install or crackingthecryptic.com.
test('spec 300: the Color by Digit settings dialog edits a selected profile in two columns, by painting digits', () => {
  const { renderEditor, renderProfiles, renderMenu, setSync, setActive, setDigitActive, copyProfile, renameProfile, setUseDigitColors } = byDigit

  // Top row: the Mode pulldown offers four modes, or Cell and Off without digit colors.
  const modes = (html) => [...html.match(/<select data-role="mode-draft">(.*?)<\/select>/s)[1].matchAll(/<option value="([a-z]+)"/g)].map((m) => m[1])
  assert.deepEqual(modes(byDigit.renderPulldowns(STATE, 'both')), ['cell', 'digit', 'both', 'off'])
  assert.deepEqual(modes(byDigit.renderPulldowns(setUseDigitColors(STATE, false), 'cell')), ['cell', 'off'])
  const css = byDigit.STYLE_CSS.replace(/\s+/g, ' ')
  // Two columns where 640 px allows, one on a phone.
  assert.match(css, /width: 640px; max-width: calc\(100vw - 16px\)/)
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(270px, 1fr\)\)/)

  // The selected row is apart from the cell profile, and no row has a tag.
  const list = renderProfiles(setUseDigitColors(STATE, true), colorOf, 2)
  assert.match(list, /data-index="2" role="radio" aria-checked="true"/)
  assert.match(list, /data-index="0" role="radio" aria-checked="false"/)
  assert.doesNotMatch(list, /tag-cells|tag-digits/)
  const tagged = setDigitActive(setActive(setSync(setUseDigitColors(STATE, true), false), 1), 2)
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
  assert.equal(count(paint, /<select data-act="page"/g), 1)
  assert.equal(count(paint, /data-act="digit"/g), 10)
  assert.equal(count(paint, /aria-pressed="true"/g), 1)
  assert.match(paint, /data-digit="1" data-key="a3" style="background:#a3"/)
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
  assert.equal(count(eachRow(renderMenu(STATE, colorOf), 'data-role="menu-row"'), /data-role="chip"/g), 3)
  assert.equal(count(byDigit.iconHtml('cell', EACH, colorOf), /data-role="chip"/g), 3)

  // The details page shows the annotated dialog picture, and the undo-with-Multi-color-off claim is gone.
  const page = read('site/color-by-digit.html')
  assert.match(page, /docs\/research\/color-by-digit\/color-by-digit-dialog-annotated\.png\?v=[0-9a-f]+/)
  for (const text of [page, read('README.md')]) assert.doesNotMatch(text, /undoing a profile switch/i)
})
