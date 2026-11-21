'use strict'
// Text Anywhere's keys and the copy of a board saved under its old name, Draw Tool (0.44.14): every old key reads under the new keys after a start, the old keys
// stay, a start the browser refused room for copies again at the next, and settings text the old version copied pastes.
// Blind to real SudokuPad: the startup copy and the paste run through Framework, which live/text-anywhere/text-anywhere-old-keys.live.mjs covers.
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { fakeStore } = require('./fake-store.js')
const { guardId } = require('../sync-lib.js')
const ta = require('../text-anywhere.user.js')

const SCRIPT = 'text-anywhere.user.js'

const NOTE = ta.textItem([100, 50], '15', 3, 20)
const COLORS = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, '#112233']))
const DISMISSAL = { version: '0.616.0', features: ['tool'] }
// What 0.44.14 copied with Copy settings, and the rest of what it saved for a board: its keys as that version named them, not mapped from the new ones.
const OLD_COPIED = { DrawTool_colors: COLORS, DrawTool_width: 3.5, DrawTool_opacity: 55, DrawTool_outline: 'thin', DrawTool_box: 'tint', DrawTool_frame: true, DrawTool_font: 'fixed' }
const OLD_BOARD = {
  ...OLD_COPIED,
  DrawTool_color: 4,
  DrawTool_background: true,
  DrawTool_index: ['p1', 'p2'],
  DrawTool_drawing_p1: { v: 0, data: [NOTE] },
  DrawTool_restarted_p2: [NOTE],
  'draw-tool-notice': DISMISSAL
}
const NEW_LOOKS = { width: 3.5, opacity: 55, outline: 'thin', boxColor: 'tint', frame: true, noteFont: 'fixed' }

test('the tool, the guard id and every saved key are Text Anywhere\'s', () => {
  const id = guardId(readFileSync(join(__dirname, '..', SCRIPT), 'utf8'))
  assert.equal(id, 'text-anywhere')
  assert.equal(ta.NOTICE_KEY, `${id}-notice`, 'the dismissal the start copies is the one the guard reads')
  assert.equal(ta.TOOL_NAME, 'textanywhere')
  for (const key of [ta.COLOR_KEY, ta.BACKGROUND_KEY, ta.COLORS_KEY, ...ta.tableKeys(ta.LOOKS), ta.INDEX_KEY, ta.NOTES_PREFIX, ta.RESTARTED_PREFIX]) assert.match(key, /^TextAnywhere_/)
})

test('a board saved by 0.44.14 starts with its notes, settings and dismissal under the new keys, and the old keys stay', () => {
  const saved = structuredClone(OLD_BOARD)
  const store = fakeStore(saved)
  ta.copyOldKeys(store)
  assert.deepEqual(ta.loadNotes(store, 'p1').items, [NOTE])
  assert.deepEqual(store.getData(ta.RESTARTED_PREFIX + 'p2'), [NOTE], 'Restart\'s kept notes')
  assert.deepEqual(ta.readIndex(store.getData(ta.INDEX_KEY)), ['p1', 'p2'])
  assert.deepEqual(ta.readLooks(store), NEW_LOOKS)
  assert.equal(ta.readColor(store.getData(ta.COLOR_KEY)), 4)
  assert.equal(ta.readBackground(store.getData(ta.BACKGROUND_KEY)), true)
  assert.deepEqual(ta.readNoteColorSet(store.getData(ta.COLORS_KEY)).colors, COLORS)
  assert.deepEqual(store.getData(ta.NOTICE_KEY), DISMISSAL)
  for (const [key, value] of Object.entries(OLD_BOARD)) assert.deepEqual(saved[key], value, `${key} stays`)

  // A puzzle cleared after the start is not brought back from its old notes at the next one.
  ta.saveNotesTo(store, 'p1', [])
  ta.copyOldKeys(store)
  assert.deepEqual(ta.loadNotes(store, 'p1').items, [])
})

test('a start the browser refused room for leaves the index unsaved, and the next start copies the rest', () => {
  const big = [ta.textItem([0, 0], 'x'.repeat(2000), 1, 20)]
  const saved = { DrawTool_index: ['small', 'big'], DrawTool_drawing_small: [NOTE], DrawTool_drawing_big: big }
  const store = fakeStore(saved)
  // The guarded store drops a write the browser refuses, after telling the user.
  ta.copyOldKeys({ ...store, setData: (key, value) => { if (JSON.stringify(value).length < 1000) store.setData(key, value) } })
  assert.equal(store.getData(ta.INDEX_KEY), null)
  ta.copyOldKeys(store)
  assert.deepEqual(ta.loadNotes(store, 'big').items, big)
  assert.deepEqual(ta.readIndex(store.getData(ta.INDEX_KEY)), ['small', 'big'])
})

test('settings text 0.44.14 copied pastes under the new keys', () => {
  const { values, skipped } = ta.pastedSettings(JSON.stringify(OLD_COPIED), ta.READERS, ta.withNewKeys)
  assert.equal(skipped, 0)
  assert.deepEqual(values, Object.fromEntries(Object.entries(OLD_COPIED).map(([key, value]) => [key.replace(/^DrawTool_/, 'TextAnywhere_'), value])))
})
