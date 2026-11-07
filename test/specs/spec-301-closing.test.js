'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const ROOT = join(__dirname, '..', '..')

const read = (file) => readFileSync(join(ROOT, file), 'utf8')
const draw = require('../../draw-tool.user.js')

const storeOf = (saved) => ({ getData: (key) => saved[key] ?? null })
// Typed out as the independent source: a SudokuPad cell is 64 board units, and SudokuPad's own nine pen colors
// (tool-pen.css) are what the "SudokuPad colors" preset sets.
const CELL = 64
const SUDOKUPAD = { 1: '#1f8020', 2: '#e87cf1', 3: '#e49632', 4: '#f53a37', 5: '#d2be32', 6: '#3d99f5', 7: '#d6d6d6', 8: '#7c7c7c', 9: '#000000' }
const PEN = { 1: '#112233', 2: '#223344', 3: '#334455', 4: '#445566', 5: '#556677', 6: '#667788', 7: '#778899', 8: '#8899aa', 9: '#99aabb' }
const readPen = (n) => PEN[n]

// Spec 301's acceptance as one pass over Draw Tool's pure functions and the site, at `npm test`: per-item opacity and
// any slider width, a missing opacity read as solid (Chris's ruling D4), text size from width, the slider ranges;
// Draw's own nine colors and the first-use copy; shapes, erasing and the Shape button's order; the
// presets and Copy/Paste settings; old drawings; and the homepage, details page and README. This seam is blind to real
// SudokuPad: the panel's layout in the keypad, the hold-to-recolor picker, a drag on the board, rendering, the settings
// entry and undo are `npm run test:live`'s, and neither run covers a real Tampermonkey install or crackingthecryptic.com.
test('spec 301: Draw Tool has its own colors, Size and Opacity sliders, Shape mode and a settings dialog', () => {
  // Size: width 1 to 16 in steps of 0.5, default 6; text size is 2w + 8. Opacity: 20 to 100 in steps of 5, default 100.
  assert.equal(draw.readWidth(null), 6)
  assert.deepEqual([1, 6.5, 16, 0.5, 6.25, 16.5].map(draw.readWidth), [1, 6.5, 16, 6, 6, 6])
  assert.deepEqual([1, 6, 16].map(draw.textSizeFor), [10, 20, 40])
  assert.equal(draw.readOpacity(null), 100)
  assert.deepEqual([20, 55, 100, 15, 22, 105].map(draw.readOpacity), [20, 55, 100, 100, 100, 100])

  // Each item keeps its own width and opacity; an old item with no opacity reads as solid.
  const stroke = draw.strokeItem([[10, 10], [100, 10]], 3, 2.5, 40)
  const text = draw.textItem([32, 32], '15', 4, draw.textSizeFor(2.5), 40)
  const oldStroke = { kind: 'stroke', color: 1, width: 6, points: [[0, 0], [64, 64]] }
  assert.deepEqual(draw.readDrawing([stroke, text, oldStroke]), [stroke, text, oldStroke])
  assert.deepEqual([stroke, oldStroke].map(draw.itemOpacity), [40, 100])
  assert.throws(() => draw.readDrawing([{ ...stroke, opacity: 10 }]))

  // Draw's own colors: nothing saved means the pen colors are still to be copied; once saved they are Draw's own, and a
  // saved value that cannot be read is kept, never overwritten by the copy.
  assert.equal(draw.readDrawColors(null), null)
  assert.deepEqual(draw.copiedPenColors(readPen), PEN)
  assert.deepEqual(draw.readDrawColors(PEN), PEN)
  assert.notEqual(draw.readDrawColors('garbage'), null)

  // Shapes: the Shape button steps Off, Rectangle, Ellipse and round; a drag is exactly its own box. A box with no width or height is refused.
  const modes = ['off']
  for (let i = 0; i < 3; i++) modes.push(draw.nextShapeMode(modes[i]))
  assert.deepEqual(modes, ['off', 'rect', 'ellipse', 'off'])
  assert.deepEqual(draw.shapeBox([CELL + 10, CELL + 50], [2 * CELL + 5, 3 * CELL + 1]), [CELL + 10, CELL + 50, 2 * CELL + 5, 3 * CELL + 1])
  const rect = draw.shapeItem('rect', [CELL, CELL, 3 * CELL, 4 * CELL], 2, 6, 60)
  assert.deepEqual(draw.readDrawing([rect]), [rect])
  assert.throws(() => draw.readDrawing([draw.shapeItem('rect', [CELL, CELL, CELL, 4 * CELL], 2, 6, 60)]))

  // A right-drag across a shape's outline erases it; one inside it, clear of the outline, does not.
  assert.equal(draw.touchesItem(rect, [CELL - 20, 2 * CELL], [CELL + 20, 2 * CELL]), true)
  assert.equal(draw.touchesItem(rect, [2 * CELL - 10, 2 * CELL], [2 * CELL + 10, 2 * CELL]), false)

  // Presets: "Pen colors" and "SudokuPad colors" always, with a "Darker page" per palette page between them.
  assert.deepEqual(draw.presetOptions(3).map((id) => draw.PRESET_LABELS[id]), ['Pen colors', 'Darker page 1', 'Darker page 2', 'Darker page 3', 'SudokuPad colors'])
  assert.deepEqual(draw.presetColors('sudokupad', [], null, readPen), SUDOKUPAD)
  assert.deepEqual(draw.presetColors('pen', [], null, readPen), PEN)

  // Copy carries the colors and both sliders and no drawing; Paste keeps Draw's own values, skips bad ones and counts them.
  const copied = JSON.parse(draw.copiedSettings(storeOf({ DrawTool_colors: PEN, DrawTool_width: 3.5, DrawTool_opacity: 45, DrawTool_drawing_x: [stroke] })))
  assert.deepEqual(copied, { DrawTool_colors: PEN, DrawTool_width: 3.5, DrawTool_opacity: 45 })
  const pasted = draw.pastedSettings(JSON.stringify({ ...copied, DrawTool_opacity: 7, PenToolExtras_x: 1 }), draw.READERS)
  assert.deepEqual(pasted, { values: { DrawTool_colors: PEN, DrawTool_width: 3.5 }, skipped: 1 })
  assert.throws(() => draw.pastedSettings('not settings', draw.READERS))

  // The site: the homepage summary and @description name shapes and Draw's own colors, the details page has a bullet for
  // each new part, and the README no longer says Draw Tool has no settings entry.
  const summary = /freehand lines, shapes and typed text, such as cage sums, in colors of its own/
  assert.match(read('site/index.html'), summary)
  assert.match(read('draw-tool.user.js'), summary)
  const details = read('site/draw-tool.html')
  for (const lead of ['Shapes', 'Colors of its own', 'Size and opacity', 'Settings']) assert.match(details, new RegExp(`<strong>${lead}</strong>`))
  assert.match(read('README.md'), /Each script except No Tab Letters adds an entry/)
})
