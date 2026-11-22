'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { fakeStore } = require('./fake-store.js')
const textAnywhere = require('../text-anywhere.user.js')

// Typed out as the independent source: SudokuPad's own nine pen colors
// (tool-pen.css) are what the "SudokuPad colors" preset sets.
const SUDOKUPAD = { 1: '#1f8020', 2: '#e87cf1', 3: '#e49632', 4: '#f53a37', 5: '#d2be32', 6: '#3d99f5', 7: '#d6d6d6', 8: '#7c7c7c', 9: '#000000' }
const PEN = { 1: '#112233', 2: '#223344', 3: '#334455', 4: '#445566', 5: '#556677', 6: '#667788', 7: '#778899', 8: '#8899aa', 9: '#99aabb' }
const readPen = (n) => PEN[n]

// Blind to real SudokuPad: the panel's layout in the keypad, the hold-to-recolor picker, a drag on the board, rendering, the settings
// entry and undo are `npm run test:live`'s.
test('Text Anywhere\'s Size slider range and text size, a missing opacity read as solid, its own nine colors, its presets, and Copy and Paste of settings', () => {
  // Size: 1 to 16 in steps of 0.5, default 6; text size is 2w + 8.
  assert.equal(textAnywhere.readWidth(null), 6)
  assert.deepEqual([1, 6.5, 16, 0.5, 6.25, 16.5].map(textAnywhere.readWidth), [1, 6.5, 16, 6, 6, 6])
  assert.deepEqual([1, 6, 16].map(textAnywhere.textSizeFor), [10, 20, 40])

  // A saved text keeps its own opacity; an old item with none reads as solid.
  const text = { ...textAnywhere.textItem([32, 32], '15', 4, textAnywhere.textSizeFor(2.5)), opacity: 40 }
  const oldText = { kind: 'text', color: 1, size: 20, text: '7', at: [64, 64] }
  assert.deepEqual(textAnywhere.readNotes([text]).items, [text])
  assert.deepEqual([text, oldText].map(textAnywhere.itemOpacity), [40, 100])
  // Read against the stored format only (#488), so an opacity off today's slider still reads, and one that is not a percentage is kept, not drawn.
  assert.deepEqual(textAnywhere.readNotes([{ ...text, opacity: 10 }]).items, [{ ...text, opacity: 10 }])
  assert.deepEqual(textAnywhere.readNotes([{ ...text, opacity: 0 }]), { items: [], kept: [{ ...text, opacity: 0 }] })

  // Its own colors: nothing usable saved means the pen colors are still to be copied; once saved they are its own. A saved
  // value with no usable color counts as nothing saved, as in Pen Tool Extras (ruled by Chris 2026-11-17).
  assert.equal(textAnywhere.readNoteColorSet(null), null)
  assert.deepEqual(textAnywhere.copiedPenColors(readPen), PEN)
  assert.deepEqual(textAnywhere.readNoteColorSet(PEN).colors, PEN)
  assert.equal(textAnywhere.readNoteColorSet('garbage'), null)

  // Presets: "Pen colors" and "SudokuPad colors" always, with a "Darker page" per palette page between them.
  assert.deepEqual(textAnywhere.presetOptions(3).map((id) => textAnywhere.PRESET_LABELS[id]), ['Pen colors', 'Darker page 1', 'Darker page 2', 'Darker page 3', 'SudokuPad colors'])
  assert.deepEqual(textAnywhere.noteColorSet('sudokupad', [], null, readPen).colors, SUDOKUPAD)
  assert.deepEqual(textAnywhere.noteColorSet('pen', [], null, readPen).colors, PEN)

  // Copy carries the colors, the size, opacity, outline, box color, frame and font (defaults here) and no notes; Paste keeps its own values, skips a bad size or colors and counts them (a bad outline, box color, frame or font reads as its default).
  const copied = JSON.parse(textAnywhere.copiedSettings(fakeStore({ TextAnywhere_colors: PEN, TextAnywhere_width: 3.5, TextAnywhere_notes_x: [text] })))
  assert.deepEqual(copied, { TextAnywhere_colors: PEN, TextAnywhere_width: 3.5, TextAnywhere_opacity: 100, TextAnywhere_outline: 'medium', TextAnywhere_box: 'page', TextAnywhere_frame: false, TextAnywhere_font: 'proportional' })
  const pasted = textAnywhere.pastedSettings(JSON.stringify({ ...copied, TextAnywhere_width: 99, PenToolExtras_x: 1 }), textAnywhere.READERS)
  assert.deepEqual(pasted, { values: { TextAnywhere_colors: PEN, TextAnywhere_opacity: 100, TextAnywhere_outline: 'medium', TextAnywhere_box: 'page', TextAnywhere_frame: false, TextAnywhere_font: 'proportional' }, skipped: 1 })
  assert.throws(() => textAnywhere.pastedSettings('not settings', textAnywhere.READERS))
})

test('Text Anywhere\'s note color is 2 with nothing saved and a saved 1 stays 1', () => {
  const { readColor } = textAnywhere
  assert.equal(readColor(undefined), 2)
  assert.equal(readColor(null), 2)
  assert.equal(readColor(1), 1)
})

test('a new note\'s size follows the cell size against a 9x9, and holding + or - repeats faster as it is held, up to a cap', () => {
  const { newNoteWidth, textSizeFor, DEFAULT_WIDTH, REFERENCE_GRID, heldSliderSteps, HELD_SLIDER_MAX_STEPS, HELD_REPEAT_MS, HELD_RAMP_MS } = textAnywhere
  assert.equal(REFERENCE_GRID, 9)
  assert.equal(newNoteWidth(DEFAULT_WIDTH, 9), DEFAULT_WIDTH)
  // Measured in cells, the drawn size on a 4x4 and a 16x16 is within a fifth of a 9x9's.
  const inCells = (grid) => textSizeFor(newNoteWidth(DEFAULT_WIDTH, grid)) / grid
  for (const grid of [4, 16]) assert.ok(Math.abs(inCells(grid) / inCells(9) - 1) < 0.2, `${grid}x${grid}`)
  // Not the 9x9's size unchanged, which against the cell would be 2.25 times as big on a 4x4 and little over half on a 16x16.
  assert.ok(newNoteWidth(DEFAULT_WIDTH, 4) < DEFAULT_WIDTH && newNoteWidth(DEFAULT_WIDTH, 16) > DEFAULT_WIDTH)
  // Steps a tick, by how long the key has been held: none before the pause, then one, ramping to the cap.
  assert.equal(heldSliderSteps(HELD_REPEAT_MS - 1), 0, 'a short press is one step, taken on the press')
  assert.equal(heldSliderSteps(HELD_REPEAT_MS), 1)
  const ticks = [HELD_REPEAT_MS, HELD_RAMP_MS / 2, HELD_RAMP_MS, HELD_RAMP_MS * 2].map(heldSliderSteps)
  assert.ok(ticks.every((steps, i) => i === 0 || steps >= ticks[i - 1]) && ticks.at(-1) > ticks[0], `${ticks}`)
  assert.equal(HELD_SLIDER_MAX_STEPS > 1, true)
  assert.equal(heldSliderSteps(HELD_RAMP_MS * 10), HELD_SLIDER_MAX_STEPS)
})
