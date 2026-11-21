'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { fakeStore } = require('./fake-store.js')
const textAnywhere = require('../text-anywhere.user.js')

// Blind to real SudokuPad: the Text button, the mouse and keys, a later click finding its note (the browser's own hit test), the notes on the board,
// the text box, the dialogs, Restart and the reload are `npm run test:live`'s.
test('Text Anywhere keeps its notes per puzzle, drops the oldest past 50 puzzles, keeps a stored stroke, and reads bad saved choices as defaults', () => {
  const { TOOL_NAME, textItem, isClick } = textAnywhere

  // No tool key lands on the tool.
  const names = ['normal', 'corner', 'centre', 'colour', TOOL_NAME]
  assert.deepEqual(textAnywhere.toolNamesFor(names, { type: 'keydown', eventPhase: 1 }), names.slice(0, 4))

  // A text: a click that does not move opens it.
  assert.equal(isClick([[300, 300], [301, 300]]), true)
  assert.equal(isClick([[300, 300], [340, 300]]), false, 'a drag is no click')
  const sum = textItem([300, 300], '15', 1, textAnywhere.textSizeFor(textAnywhere.DEFAULT_WIDTH))
  // A stroke saved by an earlier version stays in the saved list, kept apart from the notes.
  const oldStroke = { kind: 'stroke', color: 1, width: 6, points: [[0, 0], [64, 64]] }

  // Saved under the puzzle's key and read back the same; another puzzle keeps its own.
  const key = textAnywhere.puzzleKey(undefined, 'https://sudokupad.app/scl123')
  const store = fakeStore()
  const saved = store.data
  textAnywhere.saveNotesTo(store, 'other', [sum])
  textAnywhere.saveNotesTo(store, key, [sum], [oldStroke])
  assert.deepEqual(textAnywhere.readNotes(JSON.parse(JSON.stringify(saved[textAnywhere.NOTES_PREFIX + key].data))), { items: [sum], kept: [oldStroke] })
  assert.deepEqual(saved[textAnywhere.NOTES_PREFIX + 'other'], { v: 0, data: [sum] })
  assert.deepEqual(textAnywhere.readIndex(saved[textAnywhere.INDEX_KEY]), ['other', key])

  // Notes on 49 more puzzles, the 51st, drops the oldest, 'other', and keeps this one and the 49 after it.
  for (let i = 1; i <= 49; i++) textAnywhere.saveNotesTo(store, `p${i}`, [sum])
  assert.equal(saved[textAnywhere.NOTES_PREFIX + 'other'], undefined)
  assert.deepEqual(saved[textAnywhere.NOTES_PREFIX + key], { v: 0, data: [sum, oldStroke] })
  assert.equal(saved[textAnywhere.INDEX_KEY].length, 50)
  assert.deepEqual(saved[textAnywhere.INDEX_KEY].slice(0, 2), [key, 'p1'])

  // Saved data that is not a list of notes is refused, never read as no notes.
  assert.throws(() => textAnywhere.readNotes('not a list {'), /saved notes/)

  // The panel's choices read back, and bad saved values read as the defaults.
  assert.deepEqual([textAnywhere.readColor(4), textAnywhere.readWidth(3)], [4, 3])
  assert.deepEqual([textAnywhere.readColor('purple'), textAnywhere.readWidth(17), textAnywhere.readBackground('yes')], [textAnywhere.DEFAULT_COLOR, textAnywhere.DEFAULT_WIDTH, false])
})
