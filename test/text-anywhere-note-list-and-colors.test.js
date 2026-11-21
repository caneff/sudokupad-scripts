'use strict'
// Text Anywhere's note list rules as pure functions, and its note colors as one record, at the `npm test` seam.
// Blind to real SudokuPad: the Framework calls, rendering and undo. The live suites cover them on sudokupad.app: text-anywhere-nudge (Restart while an arrow key
// is held, then Undo brings the notes back) and text-anywhere-settings (Paste and Restore defaults in the dialog).
const test = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('node:path')

const textAnywhere = require(join(__dirname, '..', 'text-anywhere.user.js'))
const { loadLib } = require('./load-lib.js')
const { storedColorSet, editedColorSet } = loadLib(['color-math', 'plain', 'palette', 'color-set'], ['storedColorSet', 'editedColorSet'])

test('one rule builds the notes a closing note leaves: empty text removes it, a new note is appended, any other replaces the saved one', () => {
  const { notesAfterClose } = textAnywhere
  const notes = [{ text: 'a' }, { text: 'b' }]
  const item = { size: 20 }
  assert.deepEqual(notesAfterClose(notes, 0, item, ''), { notes: [{ text: 'b' }], index: -1 })
  assert.deepEqual(notesAfterClose(notes, -1, item, 'c'), { notes: [...notes, { size: 20, text: 'c' }], index: 2 })
  assert.deepEqual(notesAfterClose(notes, 1, item, 'd'), { notes: [{ text: 'a' }, { size: 20, text: 'd' }], index: 1 })
})

test('after notes go, the open text box and a resize follow their note, and a selected note\'s resize whose note went is cancelled', () => {
  const { followKept } = textAnywhere
  const keep = [true, false, true]
  const followed = followKept({ textBoxIndex: 2, resizing: { index: 2, cancelled: false }, move: [{ index: 2 }, { index: 1 }] }, keep)
  assert.deepEqual(followed, { textBoxIndex: 1, resizing: { index: 1, cancelled: false }, move: [{ index: 1 }], dragCancelled: false })
  assert.deepEqual(followKept({ textBoxIndex: null, resizing: { index: 1, cancelled: false }, move: null }, keep).resizing, { index: -1, cancelled: true })
  assert.equal(followKept({ textBoxIndex: null, resizing: null, move: [{ index: 1 }] }, keep).dragCancelled, true)
})

// Custom is 'custom' in memory in both scripts (lib/color-set.js).
test('Text Anywhere\'s note colors are one record, so a pasted set replaces every part of it and an edit makes the set Custom', () => {
  const { readNoteColorSet, READERS, COLORS_KEY } = textAnywhere
  const hexes = (hex) => Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, hex]))
  const pasted = readNoteColorSet(READERS[COLORS_KEY]({ ...hexes('#112233'), preset: 'page-2' }))
  assert.deepEqual(pasted, { colors: hexes('#112233'), preset: 'page-2', missing: [], fromPreset: null })
  assert.deepEqual(storedColorSet(pasted), { ...hexes('#112233'), preset: 'page-2' })
  const edited = editedColorSet({ ...pasted, missing: [3, 4], fromPreset: 'page-2' }, 3, '#445566')
  assert.equal(edited.preset, 'custom')
  assert.deepEqual(edited.missing, [4])
  assert.equal(edited.colors[3], '#445566')
})
