'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const draw = require('./draw-tool.user.js')

const storeOf = (saved) => ({
  getData: (key) => saved[key],
  setData: (key, value) => { saved[key] = value },
  removeData: (key) => { delete saved[key] }
})
// A mouse path as the browser reports it: a point every pixel or so along a quarter circle of radius 100, in board units.
const denseArc = Array.from({ length: 160 }, (_, i) => {
  const a = (Math.PI / 2) * (i / 159)
  return [100 * Math.cos(a), 100 * Math.sin(a)]
})

// Spec 268's acceptance at `npm test`, through Draw Tool's pure functions: a stroke smoothed or straight, a text and a
// click on it, a right-drag that erases one item and keeps another, the drawing saved per puzzle and read back, the 51st
// puzzle dropping the oldest, and the panel's choices read back with bad values refused. This seam is blind to real
// SudokuPad: the Draw button, the mouse and keys, the drawing on the board, the text box, the dialogs, Restart and the
// reload are `npm run test:live`'s. Neither run covers a real Tampermonkey install, crackingthecryptic.com, touch, a
// stylus or Windows (where the browser opens its menu on the right button's release).
test('spec 268 gives a solver a Draw tool whose strokes and texts are kept per puzzle and erased by a right-drag', () => {
  const { TOOL_NAME, simplifyPath, strokePath, straightLine, strokeItem, textItem, textAt, touchesItem, isClick } = draw

  // No tool key lands on Draw.
  const names = ['normal', 'corner', 'centre', 'colour', TOOL_NAME]
  assert.deepEqual(draw.toolNamesFor(names, { type: 'keydown', eventPhase: 1 }), names.slice(0, 4))

  // A stroke: the dense mouse path smoothed to a few points drawn as curves, or with Shift its two ends.
  const smooth = simplifyPath(denseArc)
  assert.equal(smooth.length > 2 && smooth.length < 40, true, `${smooth.length} points of 160`)
  assert.match(strokePath(smooth), /^M100 0 (Q[\d. ]+ )+L0 100$/)
  assert.deepEqual(straightLine(denseArc), [denseArc[0], denseArc[159]])
  assert.equal(isClick(denseArc), false, 'a drag is no click')
  const arc = strokeItem(smooth, 3, draw.WIDTHS[2])

  // A text: a click that does not move opens it, and a later click on it finds it.
  assert.equal(isClick([[300, 300], [301, 300]]), true)
  const sum = textItem([300, 300], '15', 1, draw.DEFAULT_TEXT_SIZE)
  const drawing = [arc, sum]
  assert.equal(textAt(drawing, [302, 298]), 1)
  assert.equal(textAt(drawing, [400, 400]), -1)

  // A right-drag across the arc erases it whole and keeps the text.
  assert.deepEqual(drawing.filter((item) => !touchesItem(item, [60, 60], [80, 80])), [sum])

  // Saved under the puzzle's key and read back the same; another puzzle keeps its own.
  const key = draw.puzzleKey(undefined, 'https://sudokupad.app/scl123')
  const saved = {}
  const store = storeOf(saved)
  draw.saveDrawingTo(store, 'other', [sum])
  draw.saveDrawingTo(store, key, drawing)
  assert.deepEqual(draw.readDrawing(JSON.parse(JSON.stringify(saved[draw.DRAWING_PREFIX + key]))), drawing)
  assert.deepEqual(saved[draw.DRAWING_PREFIX + 'other'], [sum])
  assert.deepEqual(draw.readIndex(saved[draw.INDEX_KEY]), ['other', key])

  // Drawing on 49 more puzzles, the 51st, drops the oldest, 'other', and keeps this one and the 49 after it.
  for (let i = 1; i <= 49; i++) draw.saveDrawingTo(store, `p${i}`, [sum])
  assert.equal(saved[draw.DRAWING_PREFIX + 'other'], undefined)
  assert.deepEqual(saved[draw.DRAWING_PREFIX + key], drawing)
  assert.equal(saved[draw.INDEX_KEY].length, 50)
  assert.deepEqual(saved[draw.INDEX_KEY].slice(0, 2), [key, 'p1'])

  // Saved data that is not a drawing is refused, never read as an empty drawing.
  assert.throws(() => draw.readDrawing('not a drawing {'), /saved drawing/)

  // The panel's choices read back, and bad saved values read as the defaults.
  assert.deepEqual([draw.readColor(4), draw.readWidth(draw.WIDTHS[0]), draw.readTextSize(draw.TEXT_SIZES[2])], [4, draw.WIDTHS[0], draw.TEXT_SIZES[2]])
  assert.deepEqual([draw.readColor('purple'), draw.readWidth(7), draw.readTextSize('huge')], [draw.DEFAULT_COLOR, draw.DEFAULT_WIDTH, draw.DEFAULT_TEXT_SIZE])
})
