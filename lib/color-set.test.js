'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')

// color-set.js reads color-math.js, plain.js and palette.js, which the scripts copy in before it.
const NAMES = ['CUSTOM', 'hexColor', 'savedColorSet', 'storedColorSet', 'editedColorSet', 'pastedColorSet', 'copiedColorSet', 'colorSetCss']
const { CUSTOM, hexColor, savedColorSet, storedColorSet, editedColorSet, pastedColorSet, copiedColorSet, colorSetCss } =
  loadLib(['color-math', 'plain', 'palette', 'color-set'], NAMES)

// SudokuPad's tool-pen.css (v0.611.0) as #rrggbb, typed out here as the independent source.
const TABLE = { 1: '#1f8020', 2: '#e87cf1', 3: '#e49632', 4: '#f53a37', 5: '#d2be32', 6: '#3d99f5', 7: '#d6d6d6', 8: '#7c7c7c', 9: '#000000' }
// Nine distinct colors, so a test can tell which entry went where.
const NINE = { 1: '#010101', 2: '#020202', 3: '#030303', 4: '#040404', 5: '#050505', 6: '#060606', 7: '#070707', 8: '#080808', 9: '#090909' }
// Pen Tool Extras' presets and Text Anywhere's, the one difference in what each saves.
const PEN_TOOL_PRESETS = ['page-1', 'page-2', 'page-3', 'sudokupad']
const NOTE_PRESETS = ['pen', 'page-1', 'page-2', 'page-3', 'sudokupad']

test('hexColor reads #rgb, #rrggbb, rgb() and rgba() as lowercase #rrggbb, clamping each channel', () => {
  assert.equal(hexColor('#1F8020'), '#1f8020')
  assert.equal(hexColor('#abc'), '#aabbcc')
  assert.equal(hexColor('rgb(31, 128, 32)'), '#1f8020')
  assert.equal(hexColor('rgba(232, 124, 241, 0.5)'), '#e87cf1')
  assert.equal(hexColor(' rgb(-4, 300, 0) '), '#00ff00')
  for (const text of ['', 'red', 'transparent', 'rgba(0, 0, 0, 0)', 'rgba(1, 2, 3, -1)', '#12345', null, undefined, 7]) assert.equal(hexColor(text), undefined, JSON.stringify(text))
})

test('nothing usable saved reads as not saved, so the install save or the first use\'s copy is still owed and may replace it', () => {
  for (const none of [null, undefined, 'red', 7, true, [], ['#ff0000'], '{"1":"#ff0000"}', {}, { preset: 'page-1' }, { 4: 'url(x)' }, { 0: '#ff0000' }, { 1: 'red', 2: 5 }, { 1: '#abc' }]) {
    assert.equal(savedColorSet(none, PEN_TOOL_PRESETS), null, JSON.stringify(none))
  }
})

test('a saved set is read with no array read by index', () => {
  // Index 1 holds a usable color: only the array guard stops it counting as color 1.
  assert.equal(savedColorSet(['x', '#ff0000', '#00ff00'], PEN_TOOL_PRESETS), null)
})

test('a saved set reads as the nine #rrggbb colors, lowercased, a bad entry beside a usable one reading as SudokuPad\'s own', () => {
  const saved = { 1: '#00FF00', 2: 'red', 3: '#abc', 4: 7, 5: null, 0: '#ff0000', 10: '#ff0000', x: '#ff0000', 9: '#ff0000;}body{display:none', 6: ['#ff0000'], 7: { toLowerCase: () => '#ff0000' } }
  const set = savedColorSet(saved, PEN_TOOL_PRESETS)
  assert.deepEqual(set.colors, { ...TABLE, 1: '#00ff00' })
  assert.deepEqual(Object.keys(set.colors), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
})

test('the colors read are a copy, never the saved object or the defaults', () => {
  const saved = { ...TABLE }
  assert.notEqual(savedColorSet(saved, PEN_TOOL_PRESETS).colors, saved)
  assert.notEqual(savedColorSet(saved, PEN_TOOL_PRESETS).colors, TABLE)
})

test('a saved set keeps a preset of the script\'s list, and reads every other one as Custom, with no missing pens', () => {
  assert.deepEqual(savedColorSet({ ...NINE, preset: 'page-2' }, PEN_TOOL_PRESETS), { colors: NINE, preset: 'page-2', missing: [], fromPreset: null })
  assert.deepEqual(savedColorSet(NINE, PEN_TOOL_PRESETS), { colors: NINE, preset: CUSTOM, missing: [], fromPreset: null })
  assert.equal(savedColorSet({ ...NINE, preset: 'pen' }, NOTE_PRESETS).preset, 'pen')
  assert.equal(savedColorSet({ ...NINE, preset: 'pen' }, PEN_TOOL_PRESETS).preset, CUSTOM, 'a preset of the other script\'s list')
  for (const odd of ['page-4', 'custom', 'unsaved', 'Darker page 1', 7, null]) assert.equal(savedColorSet({ ...NINE, preset: odd }, PEN_TOOL_PRESETS).preset, CUSTOM, JSON.stringify(odd))
})

test('Custom has one form in memory for both scripts, the string custom, whether read or made by an edit', () => {
  for (const presets of [PEN_TOOL_PRESETS, NOTE_PRESETS]) {
    assert.equal(savedColorSet(NINE, presets).preset, 'custom')
    assert.equal(savedColorSet({ ...NINE, preset: 'nope' }, presets).preset, 'custom')
    assert.equal(editedColorSet(savedColorSet({ ...NINE, preset: 'page-1' }, presets), 1, '#ff0000').preset, 'custom')
  }
  assert.equal(CUSTOM, 'custom')
})

// Byte compatibility: what each script wrote before the module is what it writes now, and reads back unchanged.
test('a stored set is its nine colors under keys 1 to 9 with the preset beside them, and none for Custom, byte for byte', () => {
  assert.equal(JSON.stringify(storedColorSet({ colors: NINE, preset: 'page-1', missing: [4], fromPreset: 'page-1' })),
    '{"1":"#010101","2":"#020202","3":"#030303","4":"#040404","5":"#050505","6":"#060606","7":"#070707","8":"#080808","9":"#090909","preset":"page-1"}')
  assert.equal(JSON.stringify(storedColorSet({ colors: NINE, preset: CUSTOM, missing: [], fromPreset: null })),
    '{"1":"#010101","2":"#020202","3":"#030303","4":"#040404","5":"#050505","6":"#060606","7":"#070707","8":"#080808","9":"#090909"}')
  for (const [presets, preset] of [[PEN_TOOL_PRESETS, 'page-3'], [PEN_TOOL_PRESETS, 'sudokupad'], [NOTE_PRESETS, 'pen']]) {
    const text = JSON.stringify({ ...NINE, preset })
    assert.equal(JSON.stringify(storedColorSet(savedColorSet(JSON.parse(text), presets))), text, preset)
  }
  const custom = JSON.stringify(NINE)
  assert.equal(JSON.stringify(storedColorSet(savedColorSet(JSON.parse(custom), NOTE_PRESETS))), custom)
})

test('an edit converts any color parseColor reads to #rrggbb, makes the set Custom and leaves the set it was made from', () => {
  const set = { colors: { ...TABLE }, preset: 'page-1', missing: [], fromPreset: 'page-1' }
  for (const [value, hex] of [['#AABBCC', '#aabbcc'], ['#abc', '#aabbcc'], ['rgb(1, 2, 3)', '#010203']]) {
    const edited = editedColorSet(set, 4, value)
    assert.deepEqual(edited.colors, { ...TABLE, 4: hex }, value)
    assert.equal(edited.preset, CUSTOM)
  }
  assert.deepEqual(set.colors, TABLE)
  assert.equal(set.preset, 'page-1')
})

test('an edit takes the pen as a number or a key, and refuses a pen or a value it cannot save', () => {
  const set = { colors: { ...TABLE }, preset: CUSTOM, missing: [], fromPreset: null }
  assert.equal(editedColorSet(set, '4', '#123456').colors[4], '#123456')
  assert.equal(editedColorSet(set, 4, '#123456').colors[4], '#123456')
  for (const pen of ['0', 0, 10, '10', 'x', undefined]) assert.throws(() => editedColorSet(set, pen, '#aabbcc'), RangeError, String(pen))
  for (const value of ['red', 'transparent', '', undefined]) assert.throws(() => editedColorSet(set, 4, value), RangeError, String(value))
})

test('an edit drops only the edited pen from the missing note and keeps the page the note names', () => {
  const set = { colors: { ...TABLE }, preset: 'page-2', missing: [1, 4, 9], fromPreset: 'page-2' }
  const edited = editedColorSet(set, '4', '#123456')
  assert.deepEqual(edited.missing, [1, 9])
  assert.equal(edited.fromPreset, 'page-2')
  assert.deepEqual(editedColorSet(edited, 1, '#123456').missing, [9], 'a pen given as a number')
  assert.deepEqual(set.missing, [1, 4, 9])
})

test('a pasted set passes when it holds a usable color and every color it holds is one, and is read as stored', () => {
  assert.deepEqual(pastedColorSet({ ...NINE, preset: 'page-2' }, PEN_TOOL_PRESETS), { ...NINE, preset: 'page-2' })
  assert.deepEqual(pastedColorSet({ 1: '#ABCDEF' }, NOTE_PRESETS), { ...TABLE, 1: '#abcdef' })
  assert.deepEqual(pastedColorSet({ ...NINE, preset: 'nope' }, NOTE_PRESETS), NINE, 'a preset none of ours is Custom')
  for (const bad of [null, 'red', [], {}, { preset: 'page-1' }, { ...NINE, 4: 'red' }, { 1: '#abc' }, { 1: '#123456', 2: null }]) {
    assert.equal(pastedColorSet(bad, PEN_TOOL_PRESETS), undefined, JSON.stringify(bad))
  }
})

test('a copied set is the saved set as stored, and nothing when nothing usable is saved', () => {
  assert.deepEqual(copiedColorSet({ ...NINE, preset: 'sudokupad' }, PEN_TOOL_PRESETS), { ...NINE, preset: 'sudokupad' })
  assert.deepEqual(copiedColorSet({ ...NINE, preset: 'nope' }, PEN_TOOL_PRESETS), NINE)
  assert.deepEqual(copiedColorSet({ 2: '#ABCDEF', 3: 'red' }, PEN_TOOL_PRESETS), { ...TABLE, 2: '#abcdef' })
  for (const none of [null, undefined, {}, 'red', { 1: 'red' }]) assert.equal(copiedColorSet(none, PEN_TOOL_PRESETS), undefined, JSON.stringify(none))
})

test('the CSS sets one variable per color under :root:root, which outranks a plain :root', () => {
  const css = colorSetCss({ ...TABLE, 4: '#112233' }, (n) => `--x-${n}`)
  assert.deepEqual(css.split('\n'), [':root:root {', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `  --x-${n}: ${n === 4 ? '#112233' : TABLE[n]};`), '}'])
})
