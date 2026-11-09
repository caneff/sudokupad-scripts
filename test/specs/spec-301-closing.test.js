'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { fakeStore } = require('../fake-store.js')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const ROOT = join(__dirname, '..', '..')

const read = (file) => readFileSync(join(ROOT, file), 'utf8')
const textAnywhere = require('../../draw-tool.user.js')

// Typed out as the independent source: SudokuPad's own nine pen colors
// (tool-pen.css) are what the "SudokuPad colors" preset sets.
const SUDOKUPAD = { 1: '#1f8020', 2: '#e87cf1', 3: '#e49632', 4: '#f53a37', 5: '#d2be32', 6: '#3d99f5', 7: '#d6d6d6', 8: '#7c7c7c', 9: '#000000' }
const PEN = { 1: '#112233', 2: '#223344', 3: '#334455', 4: '#445566', 5: '#556677', 6: '#667788', 7: '#778899', 8: '#8899aa', 9: '#99aabb' }
const readPen = (n) => PEN[n]

// Spec 301's acceptance as one pass over Text Anywhere's pure functions and the site, at `npm test`: the slider range and text size from it, a missing opacity read as solid (Chris's ruling D4),
// its own nine colors and the first-use copy; the presets and Copy/Paste settings; old saved notes; and the homepage, details page
// and README. This seam is blind to real
// SudokuPad: the panel's layout in the keypad, the hold-to-recolor picker, a drag on the board, rendering, the settings
// entry and undo are `npm run test:live`'s, and a real Tampermonkey install is `npm run test:tampermonkey`'s.
test('spec 301: Text Anywhere has its own colors, one Size slider and a settings dialog', () => {
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

  // Its own colors: nothing saved means the pen colors are still to be copied; once saved they are its own, and a
  // saved value that cannot be read is kept, never overwritten by the copy.
  assert.equal(textAnywhere.readNoteColors(null), null)
  assert.deepEqual(textAnywhere.copiedPenColors(readPen), PEN)
  assert.deepEqual(textAnywhere.readNoteColors(PEN), PEN)
  assert.notEqual(textAnywhere.readNoteColors('garbage'), null)

  // Presets: "Pen colors" and "SudokuPad colors" always, with a "Darker page" per palette page between them.
  assert.deepEqual(textAnywhere.presetOptions(3).map((id) => textAnywhere.PRESET_LABELS[id]), ['Pen colors', 'Darker page 1', 'Darker page 2', 'Darker page 3', 'SudokuPad colors'])
  assert.deepEqual(textAnywhere.presetColors('sudokupad', [], null, readPen), SUDOKUPAD)
  assert.deepEqual(textAnywhere.presetColors('pen', [], null, readPen), PEN)

  // Copy carries the colors, the size, transparency, outline, box color, frame and font (defaults here) and no notes; Paste keeps its own values, skips a bad size or colors and counts them (a bad outline, box color, frame or font reads as its default).
  const copied = JSON.parse(textAnywhere.copiedSettings(fakeStore({ TextAnywhere_colors: PEN, TextAnywhere_width: 3.5, TextAnywhere_notes_x: [text] })))
  assert.deepEqual(copied, { TextAnywhere_colors: PEN, TextAnywhere_width: 3.5, TextAnywhere_opacity: 100, TextAnywhere_outline: 'medium', TextAnywhere_box: 'page', TextAnywhere_frame: false, TextAnywhere_font: 'proportional' })
  const pasted = textAnywhere.pastedSettings(JSON.stringify({ ...copied, TextAnywhere_width: 99, PenToolExtras_x: 1 }), textAnywhere.READERS)
  assert.deepEqual(pasted, { values: { TextAnywhere_colors: PEN, TextAnywhere_opacity: 100, TextAnywhere_outline: 'medium', TextAnywhere_box: 'page', TextAnywhere_frame: false, TextAnywhere_font: 'proportional' }, skipped: 1 })
  assert.throws(() => textAnywhere.pastedSettings('not settings', textAnywhere.READERS))

  // The site: the homepage summary and @description name the notes and the tool's own colors, the details page has a bullet for
  // each part, and the README still says every script has a settings entry.
  const summary = /Text Anywhere tool for typed notes on the board or beside it, such as cage sums, in colors of its own/
  assert.match(read('site/index.html'), summary)
  assert.match(read('draw-tool.user.js'), summary)
  const details = read('site/text-anywhere.html')
  for (const lead of ['Typed notes anywhere', 'Colors, size and transparency', 'Readable over digits', 'Settings']) assert.match(details, new RegExp(`<strong>${lead}</strong>`))
  assert.match(read('README.md'), /Each script adds an entry/)
})
