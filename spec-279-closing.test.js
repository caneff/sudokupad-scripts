'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const read = (file) => readFileSync(join(__dirname, file), 'utf8')
const byDigit = require('./color-by-digit.user.js')

const storeOf = (saved) => ({ getData: (key) => saved[key] ?? null })
const group = (key, digits) => ({ key, digits })
// Typed out as the independent source: Odd/Even, a profile of two groups, and SudokuPad's black, its givens' color.
const ODD_EVEN = [group('1', ['1', '3', '5', '7', '9']), group('2', ['0', '2', '4', '6', '8'])]
const SPLIT = [group('4', ['1', '2', '3', '4', '5']), group('6', ['8', '9'])]
const GIVEN_BLACK = '#000000'
const PALETTE = { 1: 'rgb(214, 214, 214)', 2: 'rgb(124, 124, 124)', 4: 'rgb(179, 229, 106)', 5: 'rgb(232, 124, 241)', 6: 'rgb(228, 150, 50)', 7: 'rgb(245, 58, 55)', 8: 'rgb(252, 235, 63)', 9: 'rgb(61, 153, 245)', e: 'rgb(238, 153, 170)', h: 'rgb(160, 90, 30)', j: 'rgb(145, 30, 180)', m: 'rgb(76, 175, 80)' }
const colorOf = (key) => PALETTE[key] ?? ''
const digitsIn = (css) => [...new Set([...css.matchAll(/="(\d)"/g)].map((m) => m[1]))].sort()

// Spec 279's acceptance as one pass over Color by Digit's pure functions and the homepage, at `npm test`: the four modes
// and their press cycle, label and starting mode; copy and paste of the mode, from settings saved before it too; leaving
// cell coloring; the digit stylesheet, its shades and the conflict circle's CSS; the Each digit preload; the digit
// profile sync and "Use digit colors"; and Digit Color gone. This seam is blind to real SudokuPad: the Framework calls,
// the rendering of cells, digits and circles, and undo are `npm run test:live`'s, and neither run covers a real
// Tampermonkey install or crackingthecryptic.com.
test('spec 279: Color by Digit colors cells, digits or both, and Digit Color is merged into it', () => {
  const { nextMode, allowedMode, startingMode, modeLabelHtml, copiedSettings, pastedSettings } = byDigit

  // A press steps Cell, Digit, Both, Off and round; the label names the mode where AUTO was.
  const cycle = ['cell']
  for (let i = 0; i < 4; i++) cycle.push(nextMode(cycle[i], true))
  assert.deepEqual(cycle, ['cell', 'digit', 'both', 'off', 'cell'])
  assert.deepEqual(cycle.slice(0, 4).map((mode) => />([A-Z]+)</.exec(modeLabelHtml(mode))[1]), ['CELL', 'DIGIT', 'BOTH', 'OFF'])
  assert.doesNotMatch(byDigit.iconHtml('cell', ODD_EVEN, colorOf), /AUTO/)

  // Starting mode: the saved one, else Cell, or Off when auto mode was saved off.
  assert.equal(startingMode(null, null), 'cell')
  assert.equal(startingMode(null, true), 'cell')
  assert.equal(startingMode(null, false), 'off')
  assert.equal(startingMode('both', false), 'both')

  // Copy carries the mode; a paste from before the mode turns auto mode into Cell or Off.
  assert.equal(JSON.parse(copiedSettings(storeOf({ ColorByDigit_mode: 'digit' }))).ColorByDigit_mode, 'digit')
  assert.equal(pastedSettings(JSON.stringify({ ColorByDigit_auto: true })).values.ColorByDigit_mode, 'cell')
  assert.equal(pastedSettings(JSON.stringify({ ColorByDigit_auto: false })).values.ColorByDigit_mode, 'off')

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
  // the icon shows the digit profile in Digit; the menu has Cells and Digits sections only while unsynced.
  const two = { profiles: [{ name: 'Split', groups: SPLIT }, { name: 'Odd/Even', groups: ODD_EVEN }], active: 0 }
  assert.equal(byDigit.isSynced(two), true)
  const apart = byDigit.setDigitActive(byDigit.setSync(two, false), 1)
  assert.deepEqual([byDigit.activeGroups(apart), byDigit.digitGroups(apart)], [SPLIT, ODD_EVEN])
  assert.deepEqual([byDigit.iconGroups(apart, 'digit'), byDigit.iconGroups(apart, 'both')], [ODD_EVEN, SPLIT])
  assert.match(byDigit.renderMenu(apart, colorOf), />Cells<[\s\S]*>Digits</)
  assert.doesNotMatch(byDigit.renderMenu(two, colorOf), />Cells<|>Digits</)

  // "Use digit colors" off: the cycle is Cell and Off, Digit falls back to Off and Both to Cell, and the menu is one list.
  const off = byDigit.setUseDigitColors(apart, false)
  assert.deepEqual([nextMode('cell', false), nextMode('off', false)], ['off', 'cell'])
  assert.deepEqual([allowedMode('digit', false), allowedMode('both', false)], ['off', 'cell'])
  assert.doesNotMatch(byDigit.renderMenu(off, colorOf), />Digits</)

  // Digit Color is gone: no script, and the homepage names it nowhere.
  assert.equal(existsSync(join(__dirname, 'digit-color.user.js')), false)
  assert.doesNotMatch(read('site/index.html'), /Digit Color|digit-color/)
})
