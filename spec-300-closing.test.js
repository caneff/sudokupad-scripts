'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const read = (file) => readFileSync(join(__dirname, file), 'utf8')
const byDigit = require('./color-by-digit.user.js')

const group = (key, digits) => ({ key, digits })
// Typed out as the independent source: three profiles, the third a nine-group Each digit.
const ODD_EVEN = [group('a1', ['1', '3', '5', '7', '9']), group('a2', ['2', '4', '6', '8'])]
const LOW_HIGH = [group('a3', ['1', '2', '3', '4']), group('a4', ['5']), group('a5', ['6', '7', '8', '9'])]
const EACH = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => group(`a${d}`, [d]))
const STATE = { profiles: [{ name: 'Odd/Even', groups: ODD_EVEN }, { name: 'Low/5/High', groups: LOW_HIGH }, { name: 'Each digit', groups: EACH }], active: 0 }
const colorOf = (key) => `#${key}`
const PAGES = byDigit.layoutPages([['clear', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9']], 0, colorOf)

const count = (html, re) => (html.match(re) || []).length
const tagsOfRow = (html, i) => {
  const row = html.split('data-role="profile-row"')[i + 1]
  return [...row.matchAll(/data-act="tag-(cells|digits)"[^>]*aria-pressed="(true|false)">([A-Za-z]+)</g)].map((m) => `${m[3]}:${m[2]}`)
}

// Spec 300's acceptance as one pass over Color by Digit's pure functions and its details page, at `npm test`: the top
// row's checkboxes and one-row mode, the two-column layout's CSS, the profile list's Cells/Digits/Active tags apart from
// the selected row, rename, "+ New profile", compact group rows with one open and the taken-digit dot, the three-chip
// cap, and the details page's annotated dialog picture. This seam is blind to real SudokuPad: the Framework calls, the
// dialog's rendering at 1200 and 390 px, Save reaching the puzzle and undo are `npm run test:live`'s
// (live/color-by-digit*.live.mjs), and neither run covers a real Tampermonkey install or crackingthecryptic.com.
test('spec 300: the Color by Digit settings dialog edits a selected profile in two columns, with compact groups', () => {
  const { renderEditor, renderProfiles, renderMenu, iconLayout, setSync, setActive, setDigitActive, copyProfile, renameProfile, setUseDigitColors } = byDigit

  // Top row: each checkbox sits inside its label; Mode is one row of four buttons, or Cell and Off without digit colors.
  const top = renderEditor([], PAGES, [], 'both', '', true, true)
  assert.match(top, /<label class="cbd-check"><input type="checkbox" data-role="use-digit-colors" checked> Use digit colors<\/label>/)
  assert.match(top, /<label class="cbd-check"><input type="checkbox" data-role="sync" checked> Sync digit profile with cell profile<\/label>/)
  const modes = (html) => [...html.matchAll(/data-mode="([a-z]+)">/g)].map((m) => m[1])
  assert.deepEqual(modes(top), ['cell', 'digit', 'both', 'off'])
  assert.deepEqual(modes(renderEditor([], PAGES, [], 'cell', '', false, true)), ['cell', 'off'])
  const css = byDigit.STYLE_CSS.replace(/\s+/g, ' ')
  assert.match(css, /\.cbd-mode\[role="radiogroup"\] \{ display: flex; flex-direction: row/)
  // Two columns where 640 px allows, one on a phone.
  assert.match(css, /width: 640px; max-width: calc\(100vw - 16px\)/)
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(270px, 1fr\)\)/)

  // Synced: one Active tag per row, on the cell profile; the selected row is apart from it.
  const synced = setUseDigitColors(STATE, true)
  const list = renderProfiles(synced, colorOf, 2)
  assert.deepEqual([0, 1, 2].map((i) => tagsOfRow(list, i)), [['Active:true'], ['Active:false'], ['Active:false']])
  assert.match(list, /data-index="2" role="radio" aria-checked="true"/)
  assert.match(list, /data-index="0" role="radio" aria-checked="false"/)

  // Unticking Sync shows both tags, Digits starting on the cell profile; each tag sets its own pick.
  const unsynced = setSync(synced, false)
  assert.deepEqual(tagsOfRow(renderProfiles(unsynced, colorOf, 0), 0), ['Cells:true', 'Digits:true'])
  const tagged = setDigitActive(setActive(unsynced, 1), 2)
  assert.deepEqual([0, 1, 2].map((i) => tagsOfRow(renderProfiles(tagged, colorOf, 0), i)), [['Cells:false', 'Digits:false'], ['Cells:true', 'Digits:false'], ['Cells:false', 'Digits:true']])
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
  assert.match(renderEditor(EACH, PAGES, [], 'cell', '', true, true, 'Each digit'), /data-role="profile-name" maxlength="24" value="Each digit"/)

  // Groups: three compact rows, one open with its pad; a digit another group holds shows that group's color dot.
  const groups = renderEditor(LOW_HIGH, PAGES, [0, 0, 0], 'cell', '', true, true, 'Low/5/High', 1)
  assert.equal(count(groups, /data-act="open"/g), 3)
  assert.equal(count(groups, /aria-expanded="true"/g), 1)
  assert.equal(count(groups, /data-role="numpad"/g), 1)
  assert.match(groups, /data-digit="1" style="[^"]*">1<span data-role="holder" title="a3"/)
  assert.doesNotMatch(groups, /data-digit="5" style="[^"]*">5<span data-role="holder"/)
  assert.equal(count(renderEditor(EACH, PAGES, [], 'cell', '', true, true, 'Each digit', null), /data-role="numpad"/g), 0)
  // A group Add group makes opens; a click on a digit another group holds moves it to the open group.
  assert.equal(byDigit.openGroupAfter(null, 'add-group', undefined, 3, 4), 3)
  assert.deepEqual(byDigit.assignDigit(LOW_HIGH, 1, '1').map((g) => g.digits), [['2', '3', '4'], ['1', '5'], ['6', '7', '8', '9']])

  // The selected profile follows its row through a reorder and a delete, and the mode row is one tab stop.
  assert.equal(byDigit.indexAfterMove(2, 2, 0), 0)
  assert.equal(byDigit.indexAfterMove(1, 2, 0), 2)
  assert.equal(byDigit.indexAfterDelete(2, 0, 3), 1)
  assert.match(top, /aria-checked="true" tabindex="0" data-role="mode-draft" data-mode="both"/)

  // Copy settings and Paste settings join Cancel and Save in the bottom row, sized by the row's one button rule.
  assert.doesNotMatch(byDigit.COPY_PASTE_BUTTONS_HTML, /style=|class=/)
  assert.match(css, /\.dialog-options\.color-by-digit-dialog button \{ background: #f1eff5;[^}]*height: 38px/)

  // Chips stop at three in the menu and the list; the button's icon keeps four.
  const eachRow = (html, marker) => html.split(marker).find((row) => row.includes('Each digit'))
  assert.equal(count(eachRow(renderProfiles(STATE, colorOf, 0), 'data-role="profile-row"'), /data-role="chip"/g), 3)
  assert.equal(count(eachRow(renderMenu(STATE, colorOf), 'role="menuitemradio"'), /data-role="chip"/g), 3)
  assert.equal(byDigit.CHIP_MAX_GROUPS, 3)
  assert.equal(byDigit.ICON_MAX_GROUPS, 4)
  assert.equal(iconLayout(EACH).length, 4)

  // The details page shows the annotated dialog picture, and the undo-with-Multi-color-off claim is gone.
  const page = read('site/color-by-digit.html')
  assert.match(page, /docs\/research\/color-by-digit-dialog-annotated\.png\?v=[0-9a-f]+/)
  for (const text of [page, read('README.md')]) assert.doesNotMatch(text, /undoing a profile switch/i)
})
