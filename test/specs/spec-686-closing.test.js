'use strict'
// Spec #686's closing test: Text Anywhere's looks table, its one look target, the notes list that follows a deletion, the note-changed rule, the one drag cleanup,
// the panel style through addStyleOnce and `?.` in the skip hooks, driven at the `npm test` seam over text-anywhere.user.js's pure functions and its own source.
// Blind to real SudokuPad: the Framework calls, rendering and undo. The live suites cover them on sudokupad.app: text-anywhere-settings (Copy and Paste of every look),
// settings-copy-paste (the failed-paste snapshot of the looks), text-anywhere-outline (Save), text-anywhere-background and text-anywhere-sliders (the look target, Background
// on an open note), text-anywhere-resize (Delete while a handle is held), text-anywhere-saved (Restart and its Undo), text-anywhere-move (the drag's ends) and text-anywhere-panel
// (a second start).
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { fakeStore } = require('../fake-store.js')
const {
  LOOKS, READERS, lookKeys, lookReaders, readLooks, changedDialogLooks, copiedSettings, pastedSettings, COLORS_KEY, WIDTH_KEY, OPACITY_KEY, OUTLINE_KEY, BOX_KEY,
  FRAME_KEY, FONT_KEY, lookTarget, indexAfterKeep, noteChanged, textItem, FEATURES
} = require('../../text-anywhere.user.js')

const SOURCE = readFileSync(join(__dirname, '..', '..', 'text-anywhere.user.js'), 'utf8')
// The body of the script's function `name`, to the closing brace at its own indent.
const body = (name) => {
  const match = SOURCE.match(new RegExp(`\\n( *)function ${name} \\(.*\\) \\{\\n([\\s\\S]*?)\\n\\1\\}`))
  assert.ok(match, `function ${name} is in the script`)
  return match[2]
}

test('#693: the looks table holds every saved look once, and Copy, Paste, the start load, the snapshot and Save all read it', () => {
  assert.deepEqual(lookKeys(LOOKS), [WIDTH_KEY, OPACITY_KEY, OUTLINE_KEY, BOX_KEY, FRAME_KEY, FONT_KEY])
  assert.deepEqual(Object.keys(READERS), [COLORS_KEY, ...lookKeys(LOOKS)], 'Paste reads the colors and every look')
  assert.deepEqual(Object.keys(JSON.parse(copiedSettings(fakeStore()))), lookKeys(LOOKS), 'Copy carries every look')
  assert.match(SOURCE, /snapshotStore\(savedData, \[COLORS_KEY, \.\.\.lookKeys\(LOOKS\)\]/, 'the failed-save snapshot takes its keys from the table')
  assert.match(SOURCE, /changedDialogLooks\(LOOKS, draftLooks, look\)/, 'Save writes the table\'s changed dialog rows')
  assert.match(SOURCE, /Object\.assign\(look, readLooks\(savedData\)\)/, 'the start load reads the table')

  const spin = { name: 'spin', key: 'TextAnywhere_spin', read: (saved) => (saved === 'left' ? 'left' : 'none'), dialog: true }
  const withSpin = [...LOOKS, spin]
  const store = fakeStore({ TextAnywhere_spin: 'left' })
  assert.equal(JSON.parse(copiedSettings(store, withSpin)).TextAnywhere_spin, 'left', 'Copy')
  assert.deepEqual(pastedSettings(JSON.stringify({ TextAnywhere_spin: 'left' }), lookReaders(withSpin)).values, { TextAnywhere_spin: 'left' }, 'Paste')
  assert.equal(readLooks(store, withSpin).spin, 'left', 'the start load')
  assert.ok(lookKeys(withSpin).includes('TextAnywhere_spin'), 'the snapshot\'s keys')
  const now = readLooks(fakeStore(), withSpin)
  assert.deepEqual(changedDialogLooks(withSpin, { ...now, spin: 'left' }, now).map((row) => row.name), ['spin'], 'Save\'s changed rows')
})

test('#694: a look change reaches the open note, else the selected notes, else the next note', () => {
  const note = textItem([0, 0], 'a', 1, 20)
  assert.equal(lookTarget({ item: note }, [0]), 'open')
  assert.equal(lookTarget(null, [0]), 'selected')
  assert.equal(lookTarget(null, []), 'next')
  for (const name of ['pickColor', 'slideLook', 'pressBackground']) assert.match(SOURCE, new RegExp(`${name}[\\s\\S]{0,400}?applyLook\\(`), `${name} goes through applyLook`)
  assert.match(body('applyLook'), /target === 'open'\) changeOpen\(/, 'an open note, Background included, changes through changeOpen')
})

test('#695: a deletion moves every index after it down, and the note-changed rule counts each part of a note', () => {
  const keep = [true, false, true]
  assert.equal(indexAfterKeep(2, keep), 1, 'the open note follows the deletion before it')
  assert.equal(indexAfterKeep(1, keep), -1, 'the note deleted has none')
  const remap = body('followKept')
  for (const held of ['editing.index', 'resizing.index', 'entry.index']) assert.match(remap, new RegExp(`${held.replace('.', '\\.')}`), held)
  assert.match(body('keepItems'), /followKept\(marks\)/, 'keepItems remaps them')

  const saved = { ...textItem([0, 0], 'a', 1, 20), box: [10, 4] }
  assert.equal(noteChanged({ ...saved }, 'a', saved), false)
  for (const [part, changed] of [['text', [saved, 'b']], ['color', [{ ...saved, color: 2 }, 'a']], ['size', [{ ...saved, size: 24 }, 'a']], ['opacity', [{ ...saved, opacity: 50 }, 'a']],
    ['background', [{ ...saved, bg: true }, 'a']], ['box', [{ ...saved, box: [12, 4] }, 'a']]]) assert.equal(noteChanged(...changed, saved), true, part)
})

test('#696: one clearDrag ends every drag, the panel style goes through addStyleOnce, and the skip hooks use ?.', () => {
  for (const end of ['endDrag', 'cancelDrag', 'cancelInput']) assert.match(body(end), /clearDrag\(/, `${end} uses clearDrag`)
  assert.match(SOURCE, /addStyleOnce\(PANEL_STYLE_ID, PANEL_CSS\)/)
  for (const [name, { onSkip }] of Object.entries(FEATURES)) if (onSkip) assert.doesNotMatch(String(onSkip), /if \(\w+\) \w+\./, `${name}'s onSkip`)
  const saved = globalThis.document
  globalThis.document = { getElementById: () => null }
  try {
    assert.doesNotThrow(() => FEATURES.notes.onSkip(), 'a skip with no layer on the page')
  } finally {
    globalThis.document = saved
  }
})
