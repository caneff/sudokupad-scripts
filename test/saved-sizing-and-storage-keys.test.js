'use strict'
// Auto Rules Resizer's sizing kept per puzzle, and the stored keys that shipped installs wrote, at the `npm test` seam over each script's pure functions.
// Blind to real SudokuPad: the Framework calls, rendering and undo. The live suites cover them on sudokupad.app: auto-rules-resizer (a resized puzzle reloads with
// its sizing, puzzle B opens at the default after A, Restore defaults), settings-shell (the Auto Rules Resizer dialog's buttons) and sudokupad-attacks (blocked storage).
const test = require('node:test')
const assert = require('node:assert/strict')
const { fakeStore, quietly } = require('./fake-store.js')
const cbd = require('../color-by-digit.user.js')
const arr = require('../auto-rules-resizer.user.js')
const darkPage = require('../dark-page.user.js')
const uiTweaks = require('../ui-tweaks.user.js')

test('Color by Digit draws chips from the chips it is given', () => {
  const groups = [{ key: 'a', digits: ['1', '2'] }]
  const svg = cbd.renderChips(cbd.shownChips('cell', groups, groups), () => '#c00', { size: 16, style: 'cell' })
  assert.match(svg, /^<svg/)
})

test('UI Tweaks and Dark Page save under the keys shipped installs wrote', () => {
  const store = fakeStore()
  uiTweaks.saveOptions(store, { tab: false, hideSelect: true, wrapButtons: true, digitPad: 80 })
  assert.deepEqual(Object.keys(store.data).sort(), ['UiTweaks_digitPad', 'UiTweaks_hideSelect', 'UiTweaks_tab', 'UiTweaks_wrapButtons'], 'UI Tweaks\' stored keys')
  assert.equal(darkPage.DATA_KEY, 'DarkPage_color', 'Dark Page\'s stored key')
})

test('a resized puzzle keeps its sizing, another puzzle starts at the default, and an unreadable sizing is kept aside', () => {
  const store = fakeStore()
  const sized = { fontOffsetPx: -0.8, box: { w: 120, h: 0, x: 0, y: 0 } }
  arr.saveSizing(store, 'puzzle-a', sized)
  assert.deepEqual(arr.loadSizing(store, 'puzzle-b'), arr.noSizing(), 'B, opened after A, is at the default')
  const reloaded = fakeStore(store.data)
  assert.deepEqual(arr.loadSizing(reloaded, 'puzzle-a'), sized, 'a reload of A keeps its font offset and pane, a fraction of a px included')
  assert.equal(store.data['AutoRulesResizer_sizing_puzzle-b'], undefined, 'a puzzle never resized saves nothing')

  const bad = { v: 0, data: { nudgePx: 'big', box: sized.box } }
  const broken = fakeStore({ 'AutoRulesResizer_sizing_puzzle-c': bad })
  const { result, warnings } = quietly(() => arr.loadSizing(broken, 'puzzle-c'))
  assert.deepEqual(result, arr.noSizing(), 'the puzzle starts at the default')
  assert.deepEqual(broken.data['AutoRulesResizer_sizing_puzzle-c_unreadable'], bad, 'the unreadable value is kept aside')
  assert.equal(warnings.length, 1)
})
