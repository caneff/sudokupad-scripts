'use strict'
// Text Anywhere's looks table, its one look target, the notes list that follows a deletion, the note-changed rule and the skip hooks, at the `npm test` seam over
// text-anywhere.user.js's pure functions.
// Blind to real SudokuPad: the Framework calls, rendering and undo. The live suites cover them on sudokupad.app: text-anywhere-settings (Copy and Paste of every look),
// settings-copy-paste (the failed-paste snapshot of the looks), text-anywhere-outline (Save), text-anywhere-background and text-anywhere-sliders (the look target, Background
// on an open note), text-anywhere-resize (Delete while a handle is held), text-anywhere-saved (Restart and its Undo), text-anywhere-move (the drag's ends) and text-anywhere-panel
// (a second start).
const test = require('node:test')
const assert = require('node:assert/strict')
const { fakeStore } = require('./fake-store.js')
const {
  LOOKS, READERS, tableKeys, pasteReaders, readLooks, changedDialogLooks, copiedSettings, pastedSettings, COLORS_KEY, WIDTH_KEY, OPACITY_KEY, OUTLINE_KEY, BOX_KEY,
  FRAME_KEY, FONT_KEY, lookTarget, indexAfterKeep, followKept, noteChanged, textItem, FEATURES
} = require('../text-anywhere.user.js')

test('the looks table holds every saved look once, and a look added to it reaches Copy, Paste, the start load and Save\'s changed rows', () => {
  assert.deepEqual(tableKeys(LOOKS), [WIDTH_KEY, OPACITY_KEY, OUTLINE_KEY, BOX_KEY, FRAME_KEY, FONT_KEY])
  assert.deepEqual(Object.keys(READERS), [COLORS_KEY, ...tableKeys(LOOKS)], 'Paste reads the colors and every look')
  assert.deepEqual(Object.keys(JSON.parse(copiedSettings(fakeStore()))), tableKeys(LOOKS), 'Copy carries every look')

  const spin = { name: 'spin', key: 'TextAnywhere_spin', read: (saved) => (saved === 'left' ? 'left' : 'none'), dialog: true }
  const withSpin = [...LOOKS, spin]
  const store = fakeStore({ TextAnywhere_spin: 'left' })
  assert.equal(JSON.parse(copiedSettings(store, withSpin)).TextAnywhere_spin, 'left', 'Copy')
  assert.deepEqual(pastedSettings(JSON.stringify({ TextAnywhere_spin: 'left' }), pasteReaders(withSpin)).values, { TextAnywhere_spin: 'left' }, 'Paste')
  assert.equal(readLooks(store, withSpin).spin, 'left', 'the start load')
  assert.ok(tableKeys(withSpin).includes('TextAnywhere_spin'), 'the snapshot\'s keys')
  const now = readLooks(fakeStore(), withSpin)
  assert.deepEqual(changedDialogLooks(withSpin, { ...now, spin: 'left' }, now).map((row) => row.name), ['spin'], 'Save\'s changed rows')
})

test('a look change reaches the open note, else the selected notes, else the next note', () => {
  const note = textItem([0, 0], 'a', 1, 20)
  assert.equal(lookTarget({ item: note }, [0]), 'open')
  assert.equal(lookTarget(null, [0]), 'selected')
  assert.equal(lookTarget(null, []), 'next')
})

test('a deletion moves every index after it down, and the note-changed rule counts each part of a note', () => {
  const keep = [true, false, true]
  assert.equal(indexAfterKeep(2, keep), 1, 'the open note follows the deletion before it')
  assert.equal(indexAfterKeep(1, keep), -1, 'the note deleted has none')
  const followed = followKept({ textBoxIndex: 2, resizing: { index: 2 }, move: [{ index: 2 }] }, keep)
  assert.equal(followed.textBoxIndex, 1, 'the open note follows')
  assert.equal(followed.resizing.index, 1, 'its resize follows')
  assert.deepEqual(followed.move, [{ index: 1 }], 'a move follows')

  const saved = { ...textItem([0, 0], 'a', 1, 20), box: [10, 4] }
  assert.equal(noteChanged({ ...saved }, 'a', saved), false)
  for (const [part, changed] of [['text', [saved, 'b']], ['color', [{ ...saved, color: 2 }, 'a']], ['size', [{ ...saved, size: 24 }, 'a']], ['opacity', [{ ...saved, opacity: 50 }, 'a']],
    ['background', [{ ...saved, bg: true }, 'a']], ['box', [{ ...saved, box: [12, 4] }, 'a']]]) assert.equal(noteChanged(...changed, saved), true, part)
})

test('a skipped notes feature does not throw on a page with no notes layer', () => {
  const saved = globalThis.document
  globalThis.document = { getElementById: () => null }
  try {
    assert.doesNotThrow(() => FEATURES.notes.onSkip(), 'a skip with no layer on the page')
  } finally {
    globalThis.document = saved
  }
})
