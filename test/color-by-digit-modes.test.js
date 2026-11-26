'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { fakeStore } = require('./fake-store.js')
const byDigit = require('../color-by-digit.user.js')

const group = (key, digits) => ({ key, digits })
// Typed out as the independent source: Odd/Even, a profile of two groups, SudokuPad's black (its givens' color) and the
// default palette colors these use (tool-color.css).
const ODD_EVEN = [group('1', ['1', '3', '5', '7', '9']), group('2', ['0', '2', '4', '6', '8'])]
const SPLIT = [group('4', ['1', '2', '3', '4', '5']), group('6', ['8', '9'])]
const GIVEN_BLACK = '#000000'
const PALETTE = { 1: 'rgb(214, 214, 214)', 2: 'rgb(124, 124, 124)', 3: 'rgb(-36, -36, -36)', 4: 'rgb(179, 229, 106)', 5: 'rgb(232, 124, 241)', 6: 'rgb(228, 150, 50)', 7: 'rgb(245, 58, 55)', 8: 'rgb(252, 235, 63)', 9: 'rgb(61, 153, 245)', e: 'rgb(238, 153, 170)', h: 'rgb(160, 90, 30)', j: 'rgb(145, 30, 180)', m: 'rgb(76, 175, 80)' }
const colorOf = (key) => PALETTE[key] ?? ''
const digitsIn = (css) => [...new Set([...css.matchAll(/="(\d)"/g)].map((m) => m[1]))].sort()

// Blind to real SudokuPad: the Framework calls, the rendering of cells, digits and circles, and undo are `npm run test:live`'s.
test('Color by Digit\'s modes: the press, labels, starting mode, copy and paste of the mode, leaving cell coloring, the digit stylesheet, Each digit and the digit profile sync', () => {
  const { pressedMode, modeWord, startingMode, buttonLabel, copiedSettings, pastedSettings } = byDigit
  const BOTH = { on: true, cell: true, digit: true }

  // A press turns coloring off and on and keeps the ticks; the button's label names the word the ticks give (#354: its word and chips show it, its title says it).
  assert.deepEqual(pressedMode(BOTH), { on: false, cell: true, digit: true })
  assert.deepEqual(pressedMode(pressedMode(BOTH)), BOTH)
  assert.deepEqual([BOTH, { on: true, cell: false, digit: true }, pressedMode(BOTH)].map((m) => buttonLabel(modeWord(m))), ['Color by Digit: Both', 'Color by Digit: Digit', 'Color by Digit: Off'])
  assert.doesNotMatch(byDigit.iconHtml('cell', byDigit.shownChips('cell', ODD_EVEN, ODD_EVEN), colorOf), /AUTO/)

  // Starting mode: the saved one, else the word saved before it, else on with Cell, or Off when auto mode was saved off.
  assert.deepEqual(startingMode(null, null, null), { on: true, cell: true, digit: false })
  assert.deepEqual(startingMode(null, null, false), { on: false, cell: true, digit: false })
  assert.deepEqual(startingMode(null, 'both', false), BOTH)

  // Copy carries the mode; a paste from before the ticks turns the word, or auto mode, into on/off and ticks.
  assert.deepEqual(JSON.parse(copiedSettings(fakeStore({ ColorByDigit_ticks: BOTH }))).ColorByDigit_ticks, BOTH)
  assert.deepEqual(pastedSettings(JSON.stringify({ ColorByDigit_mode: 'digit' }), byDigit.READERS, byDigit.withUpgradedMode).values.ColorByDigit_ticks, { on: true, cell: false, digit: true })
  assert.deepEqual(pastedSettings(JSON.stringify({ ColorByDigit_auto: false }), byDigit.READERS, byDigit.withUpgradedMode).values.ColorByDigit_ticks, { on: false, cell: true, digit: false })

  // Leaving cell coloring takes every group color off and keeps a hand color in no group, with the same SudokuPad actions
  // whether Multi-color is on or off.
  const cells = [{ value: '3', colours: ['1', '9'] }, { colours: ['2'] }, { colours: ['9'] }]
  const ops = byDigit.planClear(cells, byDigit.groupKeys(ODD_EVEN))
  assert.deepEqual(ops, [{ action: 'remove', key: '1', indices: [0] }, { action: 'remove', key: '2', indices: [1] }])
  assert.deepEqual(byDigit.colorSteps(cells, ops), [{ type: 'clear', arg: 'colour', indices: [0, 1] }, { type: 'colour', arg: '9', indices: [0] }])

  // Digit colors: grouped digits take the darker shade of their group's palette color; givens and a digit in no group are
  // left out; a conflicting mark keeps its shade and the circle shows only while SudokuPad shows conflicts.
  const css = byDigit.buildDigitCss(SPLIT, colorOf)
  assert.deepEqual(digitsIn(css), ['1', '2', '3', '4', '5', '8', '9'])
  assert.match(css, new RegExp(`\\[data-val="8"\\] \\{ fill: ${byDigit.darkenColor(byDigit.parseColor(PALETTE[6]))} \\}`))
  assert.doesNotMatch(css, /cell-given|conflict/)
  assert.match(byDigit.CIRCLE_CSS, /\.setting-checkpencilmarks #color-by-digit-circles \{ display: inline \}/)

  // Each digit: 1 to 9 alone on nine colors whose shades are none of them the givens' black, 0 in no group; added once.
  const eachDigit = byDigit.PRELOADS['Each digit']
  assert.deepEqual(eachDigit.map((g) => g.digits), [['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['7'], ['8'], ['9']])
  const shades = eachDigit.map((g) => byDigit.darkenColor(byDigit.parseColor(colorOf(g.key))))
  assert.equal(new Set(shades).size, 9)
  assert.equal(shades.includes(GIVEN_BLACK), false)
  const old = { profiles: [{ name: 'Odd/Even', groups: ODD_EVEN }], active: 0 }
  const added = byDigit.withAddedPreloads(old, ['Each digit'])
  assert.deepEqual(added.profiles.map((p) => p.name), ['Odd/Even', 'Each digit'])
  assert.deepEqual(byDigit.withAddedPreloads(added, ['Each digit']), added)

  // The digit profile: synced by default; unticked it starts at the cell profile; a Digits pick moves only the digits;
  // the icon's numbers are each mode's own pick (#389); the menu has Cell and Digit dot columns only while unsynced (#354).
  const two = { profiles: [{ name: 'Split', groups: SPLIT }, { name: 'Odd/Even', groups: ODD_EVEN }], active: 0 }
  assert.equal(byDigit.isSynced(two), true)
  const apart = byDigit.setDigitActive(byDigit.setSync(two, false), 1)
  assert.deepEqual([byDigit.activeGroups(apart), byDigit.digitGroups(apart)], [SPLIT, ODD_EVEN])
  assert.deepEqual(byDigit.activeGroups(apart), SPLIT)
  const cellOn = { on: true, cell: true, digit: false }
  assert.match(byDigit.renderMenu(apart, colorOf, cellOn), /data-role="column-head"[\s\S]*>Cell<[\s\S]*>Digit<[\s\S]*data-target="digits"/)
  assert.doesNotMatch(byDigit.renderMenu(two, colorOf, cellOn), /data-role="column-head"|data-target="digits"/)
})
