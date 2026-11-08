'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const draw = require('../../draw-tool.user.js')

const storeOf = (saved) => ({
  getData: (key) => saved[key],
  setData: (key, value) => { saved[key] = value },
  removeData: (key) => { delete saved[key] }
})

// Spec 268's acceptance at `npm test`, through Text Anywhere's pure functions: a text and a click that opens it, the notes saved per puzzle and read back, the 51st puzzle dropping the oldest, a stored stroke
// kept untouched, and the panel's choices read back with bad values refused. This seam is blind to real
// SudokuPad: the Text button, the mouse and keys, a later click finding its note (the browser's own hit test), the notes on the board, the text box, the dialogs, Restart and the
// reload are `npm run test:live`'s. Neither run covers a real Tampermonkey install, touch, a
// stylus or Windows (where the browser opens its menu on the right button's release).
test('spec 268 gives a solver a text tool whose notes are kept per puzzle', () => {
  const { TOOL_NAME, textItem, isClick } = draw

  // No tool key lands on the tool.
  const names = ['normal', 'corner', 'centre', 'colour', TOOL_NAME]
  assert.deepEqual(draw.toolNamesFor(names, { type: 'keydown', eventPhase: 1 }), names.slice(0, 4))

  // A text: a click that does not move opens it.
  assert.equal(isClick([[300, 300], [301, 300]]), true)
  assert.equal(isClick([[300, 300], [340, 300]]), false, 'a drag is no click')
  const sum = textItem([300, 300], '15', 1, draw.textSizeFor(draw.DEFAULT_WIDTH))
  // A stroke saved by an earlier version stays in the saved list.
  const oldStroke = { kind: 'stroke', color: 1, width: 6, points: [[0, 0], [64, 64]] }
  const drawing = [oldStroke, sum]

  // Saved under the puzzle's key and read back the same; another puzzle keeps its own.
  const key = draw.puzzleKey(undefined, 'https://sudokupad.app/scl123')
  const saved = {}
  const store = storeOf(saved)
  draw.saveDrawingTo(store, 'other', [sum])
  draw.saveDrawingTo(store, key, drawing)
  assert.deepEqual(draw.readDrawing(JSON.parse(JSON.stringify(saved[draw.DRAWING_PREFIX + key].data))).items, drawing)
  assert.deepEqual(saved[draw.DRAWING_PREFIX + 'other'], { v: 0, data: [sum] })
  assert.deepEqual(draw.readIndex(saved[draw.INDEX_KEY]), ['other', key])

  // Drawing on 49 more puzzles, the 51st, drops the oldest, 'other', and keeps this one and the 49 after it.
  for (let i = 1; i <= 49; i++) draw.saveDrawingTo(store, `p${i}`, [sum])
  assert.equal(saved[draw.DRAWING_PREFIX + 'other'], undefined)
  assert.deepEqual(saved[draw.DRAWING_PREFIX + key], { v: 0, data: drawing })
  assert.equal(saved[draw.INDEX_KEY].length, 50)
  assert.deepEqual(saved[draw.INDEX_KEY].slice(0, 2), [key, 'p1'])

  // Saved data that is not a drawing is refused, never read as an empty drawing.
  assert.throws(() => draw.readDrawing('not a drawing {'), /saved drawing/)

  // The panel's choices read back, and bad saved values read as the defaults.
  assert.deepEqual([draw.readColor(4), draw.readWidth(3)], [4, 3])
  assert.deepEqual([draw.readColor('purple'), draw.readWidth(17), draw.readBackground('yes')], [draw.DEFAULT_COLOR, draw.DEFAULT_WIDTH, false])
})
