'use strict'
require('./fake-page-storage.js')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { quietly, fakeStore } = require('./fake-store.js')
const { withoutPath } = require('./unit-start.js')
const { failEachListener } = require('./specs/broken-sudokupad.js')
const { snapAxis, gridLines, SNAP_PX, nudgeStep, NUDGE_PX, NUDGE_SHIFT_PX, NUDGE_REPEAT_MS, NUDGE_RAMP_MS, NUDGE_MAX_PX, NUDGE_SHIFT_MAX_PX, VERSION, lackingInternals, FEATURES, TOOL_NAME, toolNamesFor, wantsTextTool, readNotes, loadNotes, touchIndex, readIndex, saveNotesTo, keepRestartedTo, NOTES_PREFIX, RESTARTED_PREFIX, INDEX_KEY, DEFAULT_COLOR, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH, DEFAULT_OPACITY, noteColorNumber, readColor, readWidth, readBackground, textSizeFor, itemOpacity, HIT_MARGIN_PX, grownBox, noteAtPoint, pointerSpeed, isPlacing, SNAP_MAX_SPEED, SPEED_WINDOW_MS, lockedAxis, axisLocked, viewShift, WINDOW_PAD_PX, textItem, textRect, noteBox, parseMarkdown, closedSymbols, closedText, isSmallRectangle, RECTANGLE_CLICK_PX, symbolJustTyped, rawOffset, toggledCheck, notesTouched, panelLooks, lookTarget, noteChanged, indexAfterKeep, touchesBox, placedItem, boardView, screenPoint, SHOWN_AT, resizedItem, autoSized, CORNERS, reachablePoint, noteScreenBox, DRAWN_SIZE, isClick, CLICK_SLOP, SUDOKUPAD_PEN_COLORS, hexColor, readNoteColors, copiedPenColors, editedColor, colorsCss, presetOptions, presetColors, copiedSettings, pastedSettings, READERS, PRESET_LABELS, COLORS_KEY, WIDTH_KEY, OPACITY_KEY, OUTLINE_KEY, MIN_OPACITY, MAX_OPACITY, readOpacity, OUTLINES, DEFAULT_OUTLINE, OUTLINE_LABELS, readOutline, haloShadow, OUTLINE_EM, BOX_KEY, FRAME_KEY, BOX_PRESETS, DEFAULT_BOX_COLOR, readBoxColor, boxChoice, boxFill, readFrame, frameShadow, renderSamplePicks, FRAME_COLOR, BOX_YELLOW, FONT_KEY, FONTS, DEFAULT_FONT, FIXED_FONT_STACK, readFont, noteFontFamily, renderFontChoice, sizeStep, LOOKS, lookReaders, lookKeys, readLooks, changedDialogLooks, COLOR_KEY, BACKGROUND_KEY, copyOldKeys, withNewKeys } = require('../draw-tool.user.js')
const readPaste = (text) => pastedSettings(text, READERS, withNewKeys)

// The parts of an Event toolNamesFor reads: eventPhase is 0 once the browser has finished dispatching it.
const keydown = (eventPhase) => ({ type: 'keydown', eventPhase })
const NAMES = ['normal', 'corner', 'centre', 'colour', TOOL_NAME, 'pen']

test('toolNamesFor leaves Text Anywhere out while a keydown is being dispatched, so no tool key lands on it', () => {
  assert.deepEqual(toolNamesFor(NAMES, keydown(1)), ['normal', 'corner', 'centre', 'colour', 'pen'])
})

test('toolNamesFor keeps Text Anywhere for anything else: a keydown already dispatched, a mouse event, or none', () => {
  assert.deepEqual(toolNamesFor(NAMES, keydown(0)), NAMES)
  assert.deepEqual(toolNamesFor(NAMES, { type: 'mousedown', eventPhase: 3 }), NAMES)
  assert.deepEqual(toolNamesFor(NAMES, undefined), NAMES)
})

const TKEY = { key: 't', ctrlKey: false, altKey: false, metaKey: false, isComposing: false }
const PLAIN = { tool: 'normal', letterMode: false, dialogOpen: false, inField: false }

test('wantsTextTool: T, with or without Shift, makes Text Anywhere current from another tool', () => {
  assert.equal(wantsTextTool(TKEY, PLAIN), true)
  assert.equal(wantsTextTool({ ...TKEY, key: 'T', shiftKey: true }, PLAIN), true)
  assert.equal(wantsTextTool(TKEY, { ...PLAIN, tool: 'pen' }), true)
})

test('wantsTextTool: not for another key, a Ctrl, Alt or Meta chord, or composing', () => {
  assert.equal(wantsTextTool({ ...TKEY, key: 'z' }, PLAIN), false)
  for (const mod of ['ctrlKey', 'altKey', 'metaKey']) assert.equal(wantsTextTool({ ...TKEY, [mod]: true }, PLAIN), false, mod)
  assert.equal(wantsTextTool({ ...TKEY, isComposing: true }, PLAIN), false)
  assert.equal(wantsTextTool({}, PLAIN), false, 'a keydown with no key')
})

test('wantsTextTool: not with the Letter tool on, Text Anywhere already current, a dialog open or focus in a field', () => {
  assert.equal(wantsTextTool(TKEY, { ...PLAIN, letterMode: true }), false)
  assert.equal(wantsTextTool(TKEY, { ...PLAIN, tool: TOOL_NAME }), false)
  assert.equal(wantsTextTool(TKEY, { ...PLAIN, dialogOpen: true }), false)
  assert.equal(wantsTextTool(TKEY, { ...PLAIN, inField: true }), false)
})

test('a puzzle with no saved notes starts empty', () => {
  assert.deepEqual(readNotes(null), { items: [], kept: [] })
})

const line = textItem([0, 0], 'a', 1, 20)
const puzzles = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

// A cage sum "15" at size 20, centred on (100, 50) in board units.
const sum = textItem([100, 50], '15', 3, 20)
const readItems = (saved) => readNotes(saved).items
// What an earlier version saved: neither is drawn, and both stay in storage.
const oldStroke = { kind: 'stroke', color: 1, width: 6, opacity: 100, points: [[0, 50], [200, 50]] }
const oldShape = { kind: 'shape', shape: 'rect', color: 2, width: 6, opacity: 100, box: [0, 0, 100, 100] }

test('saving notes for a 51st puzzle drops the oldest puzzle and keeps the other 50', () => {
  const { index, dropped } = touchIndex(puzzles(50), 'p51')
  assert.deepEqual(dropped, ['p1'])
  assert.deepEqual(index, puzzles(51).slice(1))
})

test('saving notes for a 51st puzzle keeps the notes of the 50 newest and removes the oldest one', () => {
  const saved = { [INDEX_KEY]: puzzles(50) }
  for (const key of puzzles(50)) saved[NOTES_PREFIX + key] = [line]
  saveNotesTo(fakeStore(saved), 'p51', [line])
  assert.deepEqual(saved[INDEX_KEY], puzzles(51).slice(1))
  assert.deepEqual(Object.keys(saved).filter((k) => k !== INDEX_KEY).sort(), puzzles(51).slice(1).map((key) => NOTES_PREFIX + key).sort())
})

test('a save whose write throws loses no saved notes and leaves the index as it was', () => {
  const saved = { [INDEX_KEY]: puzzles(50) }
  for (const key of puzzles(50)) saved[NOTES_PREFIX + key] = [line]
  const before = structuredClone(saved)
  const full = { ...fakeStore(saved), setData: () => { throw new Error('QuotaExceededError') } }
  assert.throws(() => saveNotesTo(full, 'p51', [line]), /QuotaExceededError/)
  assert.deepEqual(saved, before)
})

test('an index that cannot be read refuses the save, and nothing is written', () => {
  const saved = { [INDEX_KEY]: 'oops', [NOTES_PREFIX + 'p1']: [line] }
  assert.throws(() => saveNotesTo(fakeStore(saved), 'p1', []), /saved index/)
  assert.throws(() => saveNotesTo(fakeStore(saved), 'p2', [line]), /saved index/)
  assert.deepEqual(saved, { [INDEX_KEY]: 'oops', [NOTES_PREFIX + 'p1']: [line] })
})

test('saving no notes removes the puzzle\'s saved notes and takes it out of the index', () => {
  const saved = { [INDEX_KEY]: ['p1', 'p2'], [NOTES_PREFIX + 'p1']: [line], [NOTES_PREFIX + 'p2']: [line] }
  saveNotesTo(fakeStore(saved), 'p1', [])
  assert.deepEqual(saved, { [INDEX_KEY]: ['p2'], [NOTES_PREFIX + 'p2']: [line] })
})

test('keeping a Restart\'s notes for a 51st puzzle removes the oldest puzzle\'s saved and kept notes', () => {
  const saved = { [INDEX_KEY]: puzzles(50) }
  for (const key of puzzles(50)) {
    saved[NOTES_PREFIX + key] = [line]
    saved[RESTARTED_PREFIX + key] = [line]
  }
  keepRestartedTo(fakeStore(saved), 'p51', [sum])
  assert.deepEqual(saved[INDEX_KEY], puzzles(51).slice(1))
  assert.equal(saved[NOTES_PREFIX + 'p1'], undefined)
  assert.equal(saved[RESTARTED_PREFIX + 'p1'], undefined)
  assert.deepEqual(saved[RESTARTED_PREFIX + 'p51'], [sum])
  assert.deepEqual(saved[RESTARTED_PREFIX + 'p2'], [line])
})

test('notes for a 51st puzzle remove the oldest puzzle\'s kept notes with its saved ones', () => {
  const saved = { [INDEX_KEY]: puzzles(50), [NOTES_PREFIX + 'p1']: [line], [RESTARTED_PREFIX + 'p1']: [line] }
  saveNotesTo(fakeStore(saved), 'p51', [line])
  assert.equal(saved[NOTES_PREFIX + 'p1'], undefined)
  assert.equal(saved[RESTARTED_PREFIX + 'p1'], undefined)
})

test('Restart, saving no notes, keeps the puzzle in the index while its kept notes are saved, so they drop out with it', () => {
  const saved = { [INDEX_KEY]: ['p1', 'p2'], [NOTES_PREFIX + 'p1']: [sum] }
  keepRestartedTo(fakeStore(saved), 'p1', [sum])
  saveNotesTo(fakeStore(saved), 'p1', [])
  assert.deepEqual(saved, { [INDEX_KEY]: ['p2', 'p1'], [RESTARTED_PREFIX + 'p1']: [sum] })
})

test('a Restart that clears no notes drops the notes an earlier Restart kept', () => {
  const saved = { [INDEX_KEY]: ['p1'], [RESTARTED_PREFIX + 'p1']: [sum] }
  keepRestartedTo(fakeStore(saved), 'p1', [])
  assert.deepEqual(saved, { [INDEX_KEY]: ['p1'] })
})

test('saving a puzzle already in the index makes it the newest and drops nothing', () => {
  const { index, dropped } = touchIndex(puzzles(50), 'p1')
  assert.deepEqual(dropped, [])
  assert.deepEqual(index, [...puzzles(50).slice(1), 'p1'])
})

test('an index with no saved data is empty, and one that is not a list of keys throws', () => {
  assert.deepEqual(readIndex(null), [])
  assert.deepEqual(readIndex(['a', 'b']), ['a', 'b'])
  for (const saved of ['oops', { a: 1 }, [1, 2]]) assert.throws(() => readIndex(saved), /saved index/, JSON.stringify(saved))
})

const hexes = (value) => Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, value]))
// What a version before the rename saved each key as, and back.
const oldKey = (key) => key.replace(/^TextAnywhere_notes_/, 'DrawTool_drawing_').replace(/^TextAnywhere_/, 'DrawTool_')
const newKey = (key) => key.replace(/^DrawTool_drawing_/, 'TextAnywhere_notes_').replace(/^DrawTool_/, 'TextAnywhere_')
const SETTINGS = { [COLOR_KEY]: 4, [COLORS_KEY]: hexes('#112233'), [BACKGROUND_KEY]: true, [WIDTH_KEY]: 3.5, [OPACITY_KEY]: 55, [OUTLINE_KEY]: 'thin', [BOX_KEY]: 'tint', [FRAME_KEY]: true, [FONT_KEY]: 'fixed' }
const withOldKeys = (saved) => Object.fromEntries(Object.entries(saved).map(([key, value]) => [oldKey(key), value]))

test('every key is saved under TextAnywhere_, the notes under TextAnywhere_notes_, and the old name of each is its DrawTool_ twin', () => {
  for (const key of [...Object.keys(SETTINGS), INDEX_KEY, NOTES_PREFIX, RESTARTED_PREFIX]) assert.match(key, /^TextAnywhere_/)
  assert.deepEqual([WIDTH_KEY, NOTES_PREFIX, INDEX_KEY, RESTARTED_PREFIX], ['TextAnywhere_width', 'TextAnywhere_notes_', 'TextAnywhere_index', 'TextAnywhere_restarted_'])
  assert.deepEqual([WIDTH_KEY, NOTES_PREFIX, INDEX_KEY, RESTARTED_PREFIX].map(oldKey), ['DrawTool_width', 'DrawTool_drawing_', 'DrawTool_index', 'DrawTool_restarted_'])
})

test('copyOldKeys: old keys only, so every setting, the index and each puzzle\'s notes and Restart\'s kept notes are copied, and the old keys stay', () => {
  const old = withOldKeys({ ...SETTINGS, [INDEX_KEY]: ['p1', 'p2'], [NOTES_PREFIX + 'p1']: { v: 0, data: [sum] }, [RESTARTED_PREFIX + 'p2']: [line] })
  const saved = structuredClone(old)
  const store = fakeStore(saved)
  copyOldKeys(store)
  const copied = Object.fromEntries(Object.entries(old).map(([key, value]) => [newKey(key), value]))
  assert.deepEqual(saved, { ...old, ...copied })
  assert.deepEqual(loadNotes(store, 'p1').items, [sum], 'the copied notes load under the new key')
  assert.deepEqual(readLooks(store).width, 3.5, 'the copied settings read under the new keys')
})

test('copyOldKeys: new keys only, nothing changes', () => {
  const saved = { ...SETTINGS, [INDEX_KEY]: ['p1'], [NOTES_PREFIX + 'p1']: [sum] }
  const before = structuredClone(saved)
  copyOldKeys(fakeStore(saved))
  assert.deepEqual(saved, before)
})

test('copyOldKeys: both present, the new values are never overwritten and the old ones are kept', () => {
  const newer = { [WIDTH_KEY]: 8, [FONT_KEY]: 'proportional', [INDEX_KEY]: ['p1'], [NOTES_PREFIX + 'p1']: [sum] }
  const old = withOldKeys({ [WIDTH_KEY]: 3.5, [FONT_KEY]: 'fixed', [OPACITY_KEY]: 55, [INDEX_KEY]: ['p1'], [NOTES_PREFIX + 'p1']: [line] })
  const saved = { ...structuredClone(newer), ...structuredClone(old) }
  copyOldKeys(fakeStore(saved))
  assert.deepEqual(saved, { ...newer, ...old, [OPACITY_KEY]: 55 }, 'only the setting with no new value is copied')
})

test('copyOldKeys: once the new index is saved, a puzzle cleared since is not brought back from its old notes', () => {
  const old = withOldKeys({ [INDEX_KEY]: ['p1', 'p2'], [NOTES_PREFIX + 'p1']: [line], [NOTES_PREFIX + 'p2']: [line], [RESTARTED_PREFIX + 'p2']: [line] })
  const saved = { ...structuredClone(old), [INDEX_KEY]: ['p2'], [NOTES_PREFIX + 'p2']: [sum] }
  copyOldKeys(fakeStore(saved))
  assert.deepEqual(saved, { ...old, [INDEX_KEY]: ['p2'], [NOTES_PREFIX + 'p2']: [sum] })
})

test('copyOldKeys: an unreadable old value is copied as it was saved, and the new key\'s load keeps it aside as lib/store.js does', () => {
  const later = { v: 99, data: [sum] }
  const old = withOldKeys({ [INDEX_KEY]: ['p1'], [NOTES_PREFIX + 'p1']: later, [COLORS_KEY]: 'not colors' })
  const saved = structuredClone(old)
  const store = fakeStore(saved)
  copyOldKeys(store)
  assert.deepEqual(saved, { ...old, [INDEX_KEY]: ['p1'], [NOTES_PREFIX + 'p1']: later, [COLORS_KEY]: 'not colors' })
  const { result, warnings } = quietly(() => loadNotes(store, 'p1'))
  assert.match(result.unreadable, /later version/)
  assert.deepEqual(saved[NOTES_PREFIX + 'p1_unreadable'], later)
  assert.equal(warnings.length, 1)
  copyOldKeys(store)
  assert.deepEqual(saved[NOTES_PREFIX + 'p1'], later, 'a second start copies nothing over it')
  assert.deepEqual(saved[oldKey(NOTES_PREFIX + 'p1')], later, 'the old key keeps it')
})

test('copyOldKeys: an unreadable old index is copied as it was saved, says why its puzzles\' notes stay under the old keys, and copies no notes', () => {
  const old = withOldKeys({ [INDEX_KEY]: 'oops', [NOTES_PREFIX + 'p1']: [line] })
  const saved = structuredClone(old)
  const { warnings } = quietly(() => copyOldKeys(fakeStore(saved)))
  assert.deepEqual(saved, { ...old, [INDEX_KEY]: 'oops' })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /saved index/)
})

test('Paste settings copied before the rename, under DrawTool_ keys, returns them under the new keys; a new key beside its old twin wins', () => {
  assert.deepEqual(readPaste(JSON.stringify(withOldKeys({ [WIDTH_KEY]: 3.5, [FRAME_KEY]: true, [COLORS_KEY]: hexes('#aabbcc') }))),
    { values: { [WIDTH_KEY]: 3.5, [FRAME_KEY]: true, [COLORS_KEY]: hexes('#aabbcc') }, skipped: 0 })
  assert.deepEqual(readPaste(JSON.stringify({ [oldKey(WIDTH_KEY)]: 3.5, [WIDTH_KEY]: 8 })), { values: { [WIDTH_KEY]: 8 }, skipped: 0 })
  assert.deepEqual(readPaste(JSON.stringify({ [oldKey(WIDTH_KEY)]: 99 })), { values: {}, skipped: 1 }, 'an old value is checked as a new one is')
})

test('the size slider runs 1 to 16 and starts at 6, a new note is fully opaque, and color 1 is the default', () => {
  assert.deepEqual([MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH], [1, 16, 6])
  assert.equal(DEFAULT_OPACITY, 100)
  assert.equal(DEFAULT_COLOR, 1)
})

test('a text is 2 x the size value + 8 tall: 10 to 40, and 20 at the default size', () => {
  assert.equal(textSizeFor(1), 10)
  assert.equal(textSizeFor(16), 40)
  assert.equal(textSizeFor(DEFAULT_WIDTH), 20)
  assert.equal(textSizeFor(7.5), 23)
})

// A keypad button's data-value is text; Framework.getData parses a saved 3 back as the number 3.
test('noteColorNumber reads 1 to 9, as text or a number, and nothing else', () => {
  for (let n = 1; n <= 9; n++) {
    assert.equal(noteColorNumber(String(n)), n)
    assert.equal(noteColorNumber(n), n)
  }
  for (const value of ['0', 0, 10, '10', 'a', '1.5', 1.5, '', null, undefined, {}, [3]]) assert.equal(noteColorNumber(value), undefined, JSON.stringify(value))
})

test('a saved color reads back, and a missing or bad one reads as note color 1', () => {
  assert.equal(readColor(4), 4)
  for (const saved of [null, undefined, 0, 12, 'red', '', {}]) assert.equal(readColor(saved), DEFAULT_COLOR, JSON.stringify(saved))
})

test('hexColor reads #rgb, #rrggbb, rgb() and rgba() as lowercase #rrggbb, clamping each channel', () => {
  assert.equal(hexColor('#1F8020'), '#1f8020')
  assert.equal(hexColor('#abc'), '#aabbcc')
  assert.equal(hexColor('rgb(31, 128, 32)'), '#1f8020')
  assert.equal(hexColor('rgba(232, 124, 241, 0.5)'), '#e87cf1')
  assert.equal(hexColor(' rgb(-4, 300, 0) '), '#00ff00')
  for (const text of ['', 'red', 'transparent', 'rgba(0, 0, 0, 0)', 'rgba(1, 2, 3, -1)', '#12345', null, undefined, 7]) assert.equal(hexColor(text), undefined, JSON.stringify(text))
})

test('nothing saved reads as no note colors, so the pen colors are copied', () => {
  for (const saved of [null, undefined]) assert.equal(readNoteColors(saved), null, String(saved))
})

test('a saved value with no usable color still reads as saved, so the copy never writes over it, and shows SudokuPad\'s own colors', () => {
  for (const saved of ['red', [], ['#000000'], {}, { 1: 'red', 2: 5 }]) assert.deepEqual(readNoteColors(saved), SUDOKUPAD_PEN_COLORS, JSON.stringify(saved))
})

test('saved note colors read back as the nine #rrggbb colors, a bad entry beside a usable one reading as SudokuPad\'s own pen color', () => {
  const nine = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, `#00000${n}`]))
  assert.deepEqual(readNoteColors(JSON.parse(JSON.stringify(nine))), nine)
  const partial = readNoteColors({ 1: '#ABCDEF', 2: 'pink' })
  assert.equal(partial[1], '#abcdef')
  assert.equal(partial[2], SUDOKUPAD_PEN_COLORS[2])
  assert.equal(partial[9], SUDOKUPAD_PEN_COLORS[9])
})

test('the first-use copy takes each pen color as #rrggbb, and SudokuPad\'s own for one it cannot read', () => {
  const pens = { 1: 'rgb(1, 2, 3)', 2: '#E87CF1', 3: 'nonsense' }
  const copied = copiedPenColors((n) => pens[n] ?? 'rgb(0, 0, 0)')
  assert.deepEqual(Object.keys(copied), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  assert.equal(copied[1], '#010203')
  assert.equal(copied[2], '#e87cf1')
  assert.equal(copied[3], SUDOKUPAD_PEN_COLORS[3])
  assert.equal(copied[4], '#000000')
  assert.deepEqual(readNoteColors(JSON.parse(JSON.stringify(copied))), copied, 'the copy saved reads back as it is')
})

test('editing a note color changes that color only, and refuses a color number or a color it cannot take', () => {
  const colors = { ...SUDOKUPAD_PEN_COLORS }
  const edited = editedColor(colors, 4, '#ABCDEF')
  assert.deepEqual(edited, { ...colors, 4: '#abcdef' })
  assert.equal(colors[4], SUDOKUPAD_PEN_COLORS[4], 'the colors given are left as they were')
  assert.throws(() => editedColor(colors, 10, '#000000'), RangeError)
  assert.throws(() => editedColor(colors, 4, 'red'), RangeError)
})

test('the colors\' CSS sets one variable per note color', () => {
  const css = colorsCss({ ...SUDOKUPAD_PEN_COLORS, 3: '#123456' })
  assert.match(css, /--text-anywhere-color-3: #123456;/)
  for (let n = 1; n <= 9; n++) assert.match(css, new RegExp(`--text-anywhere-color-${n}: #[0-9a-f]{6};`))
})

test('a saved width reads back for any slider value, and a missing or bad one reads as the default width', () => {
  for (const width of [1, 3, 6, 6.5, 10, 15.5, 16]) assert.equal(readWidth(width), width)
  for (const saved of [null, undefined, 0, 0.5, 16.5, 17, 6.25, '6', 'wide', {}, NaN]) assert.equal(readWidth(saved), DEFAULT_WIDTH, JSON.stringify(saved))
})

test('sizeStep moves the width one slider step and stops at the slider\'s ends', () => {
  assert.equal(sizeStep(6, 1), 6.5)
  assert.equal(sizeStep(6, -1), 5.5)
  assert.equal(sizeStep(MAX_WIDTH, 1), MAX_WIDTH)
  assert.equal(sizeStep(MAX_WIDTH - 0.5, 1), MAX_WIDTH)
  assert.equal(sizeStep(MIN_WIDTH, -1), MIN_WIDTH)
  assert.equal(sizeStep(MIN_WIDTH + 0.5, -1), MIN_WIDTH)
})

test('a press and release with the mouse still, or moved no more than the slop, is a click; a drag is not', () => {
  assert.equal(isClick([[10, 10]]), true)
  assert.equal(isClick([[10, 10], [10 + CLICK_SLOP, 10], [10, 10 - CLICK_SLOP]]), true)
  assert.equal(isClick([[10, 10], [10 + CLICK_SLOP + 0.1, 10]]), false)
  assert.equal(isClick([[10, 10], [40, 10], [10, 10]]), false, 'a drag that comes back to its start')
})

test('the slop is 4 px', () => {
  assert.equal(CLICK_SLOP, 4)
})

test('a rectangle under 8 px both ways is a sloppy click; one 8 px or more either way is a real rectangle', () => {
  assert.equal(RECTANGLE_CLICK_PX, 8)
  assert.equal(isSmallRectangle([[10, 10], [10, 10]]), true)
  assert.equal(isSmallRectangle([[10, 10], [17, 3]]), true)
  assert.equal(isSmallRectangle([[10, 10], [18, 10]]), false)
  assert.equal(isSmallRectangle([[10, 10], [10, 2]]), false)
  assert.equal(isSmallRectangle([[10, 10], [30, 10], [11, 11]]), true, 'the rectangle runs from the press to the release')
})

test('closedText drops trailing spaces and tabs from each line, and a note of only spaces is empty', () => {
  assert.equal(closedText('a  \nb\t \n  c   '), 'a\nb\n  c')
  assert.equal(closedText('   '), '')
  assert.equal(closedText(' \t \n  \n'), '')
  assert.equal(closedText('\n\nhi  \n\n'), 'hi')
  assert.equal(closedText('a \r\n b'), 'a\n b', 'a line break typed as CRLF')
  assert.equal(closedText('a\n\n  \nb'), 'a\n\n\nb', 'blank lines inside stay')
})

test('VERSION matches the @version header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, '..', 'draw-tool.user.js'), 'utf8')))
})

// SudokuPad's first cell color page: keys 0 to 9, 0 empty.
const PAGE = ['transparent', 'rgb(255, 0, 0)', 'rgb(0, 128, 0)', 'rgb(0, 0, 255)', 'rgb(255, 255, 0)', 'rgb(128, 0, 128)', 'rgb(255, 165, 0)', 'rgb(0, 255, 255)', 'rgb(200, 200, 200)', 'rgb(10, 10, 10)']

test('the presets are Pen colors, a Darker page for each page up to three, then SudokuPad colors', () => {
  assert.deepEqual(presetOptions(0).map((id) => PRESET_LABELS[id]), ['Pen colors', 'SudokuPad colors'])
  assert.deepEqual(presetOptions(2).map((id) => PRESET_LABELS[id]), ['Pen colors', 'Darker page 1', 'Darker page 2', 'SudokuPad colors'])
  assert.deepEqual(presetOptions(7).map((id) => PRESET_LABELS[id]), ['Pen colors', 'Darker page 1', 'Darker page 2', 'Darker page 3', 'SudokuPad colors'])
})

test('SudokuPad colors is SudokuPad\'s nine, and Pen colors is the pen colors as read', () => {
  assert.deepEqual(presetColors('sudokupad', [], () => undefined, () => undefined), SUDOKUPAD_PEN_COLORS)
  assert.deepEqual(presetColors('pen', [], () => undefined, (n) => `rgb(${n}, 0, 0)`), copiedPenColors((n) => `rgb(${n}, 0, 0)`))
})

test('a Darker page preset darkens the page\'s color at each index and makes the darkest grey black', () => {
  const colors = presetColors('page-1', [PAGE.map((_, i) => String(i))], (key) => PAGE[Number(key)], () => undefined)
  assert.equal(colors[9], '#000000')
  assert.notEqual(colors[1], SUDOKUPAD_PEN_COLORS[1])
  const red = parseInt(colors[1].slice(1, 3), 16)
  assert.equal(red < 255 && red > 100, true, `red darkened to ${colors[1]}`)
})

test('a Darker page preset the palette lacks, or an unknown one, throws', () => {
  assert.throws(() => presetColors('page-2', [['0']], () => undefined, () => undefined), /not a preset/)
  assert.throws(() => presetColors('nope', [], () => undefined, () => undefined), /not a preset/)
})

test('Copy settings holds the colors, size, transparency, outline, box color, frame and font, defaults included, and no notes, color pick or background', () => {
  const copied = JSON.parse(copiedSettings(fakeStore({ [COLORS_KEY]: hexes('#112233'), [WIDTH_KEY]: 3.5, [OPACITY_KEY]: 55, [OUTLINE_KEY]: 'thin', [BOX_KEY]: 'tint', [FRAME_KEY]: true, [FONT_KEY]: 'fixed', [COLOR_KEY]: 4, [NOTES_PREFIX + 'x']: [] })))
  assert.deepEqual(copied, { [COLORS_KEY]: hexes('#112233'), [WIDTH_KEY]: 3.5, [OPACITY_KEY]: 55, [OUTLINE_KEY]: 'thin', [BOX_KEY]: 'tint', [FRAME_KEY]: true, [FONT_KEY]: 'fixed' })
})

test('Copy settings leaves the colors out until they are saved', () => {
  assert.deepEqual(JSON.parse(copiedSettings(fakeStore({}))), { [WIDTH_KEY]: DEFAULT_WIDTH, [OPACITY_KEY]: DEFAULT_OPACITY, [OUTLINE_KEY]: 'medium', [BOX_KEY]: 'page', [FRAME_KEY]: false, [FONT_KEY]: 'proportional' })
})

// A row added to a copy of the table is handled by Copy, Paste, the start load, the snapshot's keys and Save's changed list, with no other edit. The script's own
// snapshotSave and Save read the real table, so these helpers are what a copy can reach. Live, settings-copy-paste.live.mjs's failed Text Anywhere paste
// covers the snapshot's looks, and text-anywhere-outline.live.mjs's 'Save applies the choice to every note' covers Save's.
const SPIN_KEY = 'TextAnywhere_spin'
const SPIN_ROW = { name: 'spin', key: SPIN_KEY, read: (saved) => (saved === 'left' ? 'left' : 'none'), dialog: true }
const WITH_SPIN = [...LOOKS, SPIN_ROW]

test('a row added to a copy of the looks table is copied, pasted and loaded, and is in the snapshot\'s keys and Save\'s changed rows', () => {
  const store = fakeStore({ [SPIN_KEY]: 'left' })
  assert.equal(JSON.parse(copiedSettings(store, WITH_SPIN))[SPIN_KEY], 'left')
  assert.equal(JSON.parse(copiedSettings(fakeStore({}), WITH_SPIN))[SPIN_KEY], 'none')
  assert.deepEqual(pastedSettings(JSON.stringify({ [SPIN_KEY]: 'left' }), lookReaders(WITH_SPIN)).values, { [SPIN_KEY]: 'left' })
  assert.equal(readLooks(store, WITH_SPIN).spin, 'left')
  assert.equal(readLooks(fakeStore({}), WITH_SPIN).spin, 'none')
  assert.ok(lookKeys(WITH_SPIN).includes(SPIN_KEY), 'the snapshot\'s keys hold the added row\'s key')
  assert.deepEqual(changedDialogLooks(WITH_SPIN, { ...readLooks(fakeStore({}), WITH_SPIN), spin: 'left' }, readLooks(fakeStore({}), WITH_SPIN)).map((row) => row.name), ['spin'])
})

test('the looks table is the one list behind Paste and Copy: every row reads and copies, and the paste readers match', () => {
  assert.deepEqual(Object.keys(lookReaders(LOOKS)), LOOKS.map((row) => row.key))
  assert.deepEqual(Object.keys(JSON.parse(copiedSettings(fakeStore({})))), LOOKS.map((row) => row.key))
  assert.deepEqual(Object.keys(readLooks(fakeStore({}))), LOOKS.map((row) => row.name))
  for (const key of lookKeys(LOOKS)) assert.ok(key in READERS, key)
})

test('a pasted size or transparency that is off its slider is skipped, and a pasted outline, box color, frame or font that is invalid is read as its default', () => {
  const readers = lookReaders(LOOKS)
  assert.equal(readers[WIDTH_KEY](3.5), 3.5)
  assert.equal(readers[WIDTH_KEY](999), undefined)
  assert.equal(readers[OPACITY_KEY]('x'), undefined)
  assert.equal(readers[OUTLINE_KEY]('nope'), DEFAULT_OUTLINE)
  assert.equal(readers[BOX_KEY]('nope'), DEFAULT_BOX_COLOR)
  assert.equal(readers[FRAME_KEY]('nope'), false)
  assert.equal(readers[FRAME_KEY](true), true)
  assert.equal(readers[FONT_KEY]('nope'), DEFAULT_FONT)
  assert.equal(readers[FONT_KEY]('fixed'), 'fixed')
})

test('changedDialogLooks lists the rows whose draft differs from the value in force', () => {
  const now = readLooks(fakeStore({}))
  assert.deepEqual(changedDialogLooks(LOOKS, { ...now }, now), [])
  assert.deepEqual(changedDialogLooks(LOOKS, { ...now, frame: true, noteFont: 'fixed' }, now).map((row) => row.name), ['frame', 'noteFont'])
  assert.deepEqual(changedDialogLooks(LOOKS, { ...now, width: 9 }, now), [], 'the sliders are not the dialog\'s')
})

test('the box color setting reads a preset or a #rrggbb color and anything else as Page', () => {
  assert.equal(DEFAULT_BOX_COLOR, 'page')
  for (const preset of ['page', 'white', 'yellow', 'tint']) assert.equal(readBoxColor(preset), preset)
  assert.equal(readBoxColor('#A1b2C3'), '#a1b2c3')
  for (const bad of [undefined, null, 5, true, {}, 'red', '#abc', '#12345g', 'custom', 'Tint']) assert.equal(readBoxColor(bad), 'page', String(bad))
})

test('the box choice is the preset, and Custom for a color', () => {
  assert.deepEqual(['page', 'white', 'yellow', 'tint', '#123456'].map(boxChoice), ['page', 'white', 'yellow', 'tint', 'custom'])
  assert.deepEqual(Object.keys(BOX_PRESETS), ['page', 'white', 'yellow', 'tint'])
})

test('the box is filled with the page color, white, the yellow, a tint of the note\'s own color, or the custom color', () => {
  assert.equal(boxFill('page', 'var(--c)'), 'var(--body-bg, #fff)')
  assert.equal(boxFill('white', 'var(--c)'), '#ffffff')
  assert.equal(boxFill('yellow', 'var(--c)'), BOX_YELLOW)
  assert.equal(boxFill('#123456', 'var(--c)'), '#123456')
  assert.equal(boxFill('tint', 'var(--c)'), 'color-mix(in srgb, var(--c) 15%, var(--body-bg, #fff))')
  assert.notEqual(boxFill('tint', 'red'), boxFill('tint', 'blue'))
})

test('the yellow keeps every one of SudokuPad\'s nine colors about as readable as white does', () => {
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
  for (const hex of Object.values(SUDOKUPAD_PEN_COLORS)) {
    assert.equal(contrast(hex, BOX_YELLOW) >= 0.8 * contrast(hex, '#ffffff'), true, `${hex} on the yellow ${BOX_YELLOW}: ${contrast(hex, BOX_YELLOW).toFixed(2)} against ${contrast(hex, '#ffffff').toFixed(2)} on white`)
  }
})

test('the frame setting is on only for true, and a frame is a thin light gray ring round a boxed note and nothing otherwise', () => {
  assert.deepEqual([true, false, undefined, null, 1, 'true'].map(readFrame), [true, false, false, false, false, false])
  assert.equal(frameShadow(false), 'none')
  assert.equal(frameShadow(true), `0 0 0 var(--text-anywhere-px, 1px) ${FRAME_COLOR}`)
})

test('Paste settings returns the colors, size and transparency, ignores other scripts\' keys and counts a refused value as skipped', () => {
  const text = JSON.stringify({ [COLORS_KEY]: hexes('#AABBCC'), [WIDTH_KEY]: 2.5, [OPACITY_KEY]: 35, PenColor_colors: hexes('#000000'), unrelated: 1 })
  assert.deepEqual(readPaste(text), { values: { [COLORS_KEY]: hexes('#aabbcc'), [WIDTH_KEY]: 2.5, [OPACITY_KEY]: 35 }, skipped: 0 })
  const bad = readPaste(JSON.stringify({ [COLORS_KEY]: { ...hexes('#aabbcc'), 4: 'red' }, [WIDTH_KEY]: 99, [OPACITY_KEY]: 10 }))
  assert.deepEqual(bad, { values: {}, skipped: 3 })
  assert.deepEqual(readPaste(JSON.stringify({ [COLORS_KEY]: {} })), { values: {}, skipped: 1 }, 'colors with no color in them')
})

test('Paste settings returns the box color and the frame, and an invalid value reads as Page and as off', () => {
  assert.deepEqual(readPaste(JSON.stringify({ [BOX_KEY]: 'yellow', [FRAME_KEY]: true })), { values: { [BOX_KEY]: 'yellow', [FRAME_KEY]: true }, skipped: 0 })
  assert.deepEqual(readPaste(JSON.stringify({ [BOX_KEY]: '#00FF00' })).values, { [BOX_KEY]: '#00ff00' })
  assert.deepEqual(readPaste(JSON.stringify({ [BOX_KEY]: 'plaid', [FRAME_KEY]: 'yes' })), { values: { [BOX_KEY]: 'page', [FRAME_KEY]: false }, skipped: 0 })
})

test('Paste settings returns the outline, and an invalid one reads as Thick without counting as skipped', () => {
  assert.deepEqual(readPaste(JSON.stringify({ [OUTLINE_KEY]: 'none' })), { values: { [OUTLINE_KEY]: 'none' }, skipped: 0 })
  assert.deepEqual(readPaste(JSON.stringify({ [OUTLINE_KEY]: 'huge' })), { values: { [OUTLINE_KEY]: 'medium' }, skipped: 0 })
})

test('Paste settings fills a missing color with SudokuPad\'s and refuses text that is not settings', () => {
  const { values } = readPaste(JSON.stringify({ [COLORS_KEY]: { 1: '#010203' } }))
  assert.deepEqual(values[COLORS_KEY], { ...SUDOKUPAD_PEN_COLORS, 1: '#010203' })
  assert.throws(() => readPaste('hello'), /not JSON/)
  assert.throws(() => readPaste('[1]'), /not a settings object/)
})

test('a text item holds its kind, color number, text size, full opacity, text and its point rounded to a tenth, and a background only when it is made with one', () => {
  assert.deepEqual(textItem([10.04, 20.06], '15', 3, 20), { kind: 'text', color: 3, size: 20, opacity: 100, text: '15', at: [10, 20.1] })
  assert.deepEqual(textItem([10, 20], '15', 3, 20, true), { kind: 'text', color: 3, size: 20, opacity: 100, bg: true, text: '15', at: [10, 20] })
  assert.deepEqual(textItem([10, 20], '15', 3, 20, false), textItem([10, 20], '15', 3, 20))
})

test('notes saved as JSON read back equal, item for item, with or without a background', () => {
  const notes = [sum, textItem([5, 5], 'a b', 9, 24, true)]
  assert.deepEqual(readItems(JSON.parse(JSON.stringify(notes))), notes)
})

test('saved notes with the strokes and shapes of an earlier version read back whole, so a save writes them back untouched', () => {
  const notes = [oldStroke, sum, oldShape]
  assert.deepEqual(readItems(JSON.parse(JSON.stringify(notes))), notes)
  const saved = {}
  saveNotesTo(fakeStore(saved), 'p1', readItems(notes).concat(textItem([1, 1], 'x', 1, 20)))
  assert.deepEqual(saved[NOTES_PREFIX + 'p1'].data.slice(0, 3), notes)
})

test('a note saved before opacity existed reads back as it was, and a saved opacity is kept', () => {
  const old = [{ kind: 'text', color: 3, size: 14, text: '9', at: [1, 1] }, { kind: 'text', color: 3, size: 28, text: '9', at: [1, 1], opacity: 65 }]
  assert.deepEqual(readItems(JSON.parse(JSON.stringify(old))), old)
  assert.equal(itemOpacity(old[0]), DEFAULT_OPACITY)
  assert.equal(itemOpacity(old[1]), 65)
})

// Framework.getData hands back the raw text when it is not JSON.
test('saved data that is not a list throws, and is never read as no notes', () => {
  for (const saved of ['[{"kind":"text"', {}, 'text', 3, true]) assert.throws(() => readNotes(saved), /saved notes/, JSON.stringify(saved))
})

test('a list with one bad note returns the good notes and keeps the bad one, whatever is wrong with it', () => {
  for (const bad of [{ kind: 'blob' }, { ...sum, text: '' }, { ...sum, text: 15 }, { ...sum, at: [1] }, { ...sum, size: 'big' }, { ...sum, size: 20.5 }, { ...sum, size: 0 }, { ...sum, opacity: 0 }, { ...sum, opacity: 101 }, { ...sum, color: null }, { ...sum, color: 42 }, { ...sum, bg: 'yes' }, { ...sum, bg: false }, null, 7, 'x', [], { ...oldStroke, kind: 'line' }]) {
    const good = textItem([5, 5], 'ok', 2, 20)
    assert.deepEqual(readNotes([sum, bad, good]), { items: [sum, good], kept: [bad] }, JSON.stringify(bad))
  }
})

test('a note at a size or opacity outside today\'s sliders still reads', () => {
  const old = [{ ...sum, size: 9 }, { ...sum, size: 41 }, { ...sum, size: 200 }, { ...sum, opacity: 10 }, { ...sum, opacity: 52 }, { ...sum, opacity: 100 }]
  assert.deepEqual(readNotes(JSON.parse(JSON.stringify(old))), { items: old, kept: [] })
})

test('a save writes the kept entries back after the notes, versioned, and keeps them when no note is left', () => {
  const bad = { ...sum, text: 15 }
  const saved = {}
  saveNotesTo(fakeStore(saved), 'p1', [sum], [bad])
  assert.deepEqual(saved[NOTES_PREFIX + 'p1'], { v: 0, data: [sum, bad] })
  saveNotesTo(fakeStore(saved), 'p1', [], [bad])
  assert.deepEqual(saved[NOTES_PREFIX + 'p1'], { v: 0, data: [bad] })
  assert.deepEqual(saved[INDEX_KEY], ['p1'])
})

test('loadNotes reads versioned notes, unversioned ones and none, and reports a whole value that is not a list', () => {
  const bad = { ...sum, text: 15 }
  const key = NOTES_PREFIX + 'p1'
  const saved = {}
  saveNotesTo(fakeStore(saved), 'p1', [sum], [bad])
  assert.deepEqual(loadNotes(fakeStore(saved), 'p1'), { items: [sum], kept: [bad], unreadable: undefined })
  assert.deepEqual(loadNotes(fakeStore({ [key]: [sum, bad] }), 'p1'), { items: [sum], kept: [bad], unreadable: undefined })
  assert.deepEqual(loadNotes(fakeStore({}), 'p1'), { items: [], kept: [], unreadable: undefined })
  const { result, warnings } = quietly(() => loadNotes(fakeStore({ [key]: 'not a list' }), 'p1'))
  assert.deepEqual([result.items, result.kept], [[], []])
  assert.match(result.unreadable, /saved notes/)
  assert.equal(warnings.length, 1)
})

test('the Background setting is on only when it was saved as true', () => {
  assert.equal(readBackground(true), true)
  for (const saved of [false, null, undefined, 'true', 1, {}]) assert.equal(readBackground(saved), false, JSON.stringify(saved))
})

test('a text\'s box starts at its point, as tall as its line and wider with more characters', () => {
  const box = textRect(sum)
  assert.equal(box.left, 100)
  assert.equal(box.top, 50)
  assert.equal(box.bottom - box.top, 23)
  const longer = textRect(textItem([100, 50], '150', 3, 20))
  assert.ok(longer.right - longer.left > box.right - box.left, `'150' is ${longer.right - longer.left} wide, '15' ${box.right - box.left}`)
})

test('a drag across a text touches it, and one that passes clear of it does not', () => {
  const box = textRect(sum)
  assert.equal(touchesBox(grownBox(noteBox(sum), HIT_MARGIN_PX), [110, 0], [110, 100]), true, 'across it')
  assert.equal(touchesBox(grownBox(noteBox(sum), HIT_MARGIN_PX), [0, 0], [200, 100]), true, 'on a slant through it')
  assert.equal(touchesBox(grownBox(noteBox(sum), HIT_MARGIN_PX), [110, 60], [110, 60]), true, 'a press on it')
  assert.equal(touchesBox(grownBox(noteBox(sum), HIT_MARGIN_PX), [box.right + HIT_MARGIN_PX - 0.1, 0], [box.right + HIT_MARGIN_PX - 0.1, 100]), true, 'within the margin')
  assert.equal(touchesBox(grownBox(noteBox(sum), HIT_MARGIN_PX), [box.right + HIT_MARGIN_PX + 0.1, 0], [box.right + HIT_MARGIN_PX + 0.1, 100]), false, 'just past it')
  assert.equal(touchesBox(grownBox(noteBox(sum), HIT_MARGIN_PX), [0, 0], [200, 0]), false, 'above it')
})

// A board drawn at twice its size with its corner at (100, 50) on the screen: board units from (0, 0) to (600, 600).
const toBoard = ([x, y]) => [(x - 100) / 2, (y - 50) / 2]
const toScreen = ([x, y]) => [x * 2 + 100, y * 2 + 50]
const board = { box: { left: 100, top: 50, right: 1300, bottom: 1250 }, toBoard }

test('a note placed on the board is stored in board units, rounded to a hundredth, and keeps the rest of the item', () => {
  const note = textItem([50, 60], 'hi', 3, 20, true)
  assert.deepEqual(placedItem(note, [300.06, 250], board), { ...note, at: [100.03, 100] })
  assert.deepEqual(placedItem(note, [100, 1250], board).at, [0, 600], 'on the board\'s edge')
  assert.deepEqual(note.at, [50, 60])
})

test('a note placed off the board is stored as a fixed screen point in its own key, with no board point an older version could read', () => {
  const note = textItem([50, 60], 'hi', 3, 20, true)
  const off = placedItem(note, [40.044, 700], board)
  assert.deepEqual(off, { kind: 'text', color: 3, size: 20, opacity: 100, bg: true, text: 'hi', fixed: [40.04, 700] })
  assert.equal('at' in off, false)
  assert.deepEqual(placedItem(off, [300, 250], board), { ...note, at: [100, 100] }, 'moved back onto the board, it is pinned again')
})

test('the board view of a note gives an off-board note its board point under the screen point, and leaves an on-board note as it is', () => {
  const on = textItem([50, 60], 'hi', 3, 20)
  const off = placedItem(on, [40, 700], board)
  assert.deepEqual(boardView(on, toBoard), on)
  assert.deepEqual(boardView(off, toBoard).at, [-30, 325])
  const point = toBoard([40, 700])
  assert.deepEqual(notesTouched([on, off].map((item) => boardView(item, toBoard)), point, point), [1])
})

test('a note\'s screen point is its fixed point off the board, and its board point taken to the screen on it', () => {
  const on = textItem([50, 60], 'hi', 3, 20)
  assert.deepEqual(screenPoint(on, toScreen), [200, 170])
  assert.deepEqual(screenPoint(placedItem(on, [40, 700], board), toScreen), [40, 700])
})

test('an off-board note drawn in reach is placed and hit at its drawn point, and at its own point again once that point changes', () => {
  const off = placedItem(textItem([50, 60], 'hi', 3, 20), [40, 700], board)
  const drawn = { ...off, [SHOWN_AT]: { from: off.fixed, point: [60, 650] } }
  assert.deepEqual(screenPoint(drawn, toScreen), [60, 650])
  assert.deepEqual(boardView(drawn, toBoard).at, toBoard([60, 650]))
  const moved = placedItem(drawn, [30, 720], board)
  assert.deepEqual(screenPoint(moved, toScreen), [30, 720], 'a note given a new point is drawn at it')
  assert.deepEqual(boardView(moved, toBoard).at, toBoard([30, 720]))
})

test('saved off-board notes read back, and a note with both a board point and a fixed point, or neither, does not', () => {
  const off = placedItem(sum, [40, 700], board)
  assert.deepEqual(readItems(JSON.parse(JSON.stringify([sum, off]))), [sum, off])
  for (const bad of [{ ...off, at: [1, 1] }, { ...sum, at: undefined }, { ...off, fixed: [1] }]) assert.deepEqual(readNotes([bad]), { items: [], kept: [bad] }, JSON.stringify(bad))
})

test('a note with a background answers to the box drawn behind it: a selection rectangle and an erase just outside its text land on it', () => {
  const plain = textItem([100, 50], '15', 3, 20)
  const boxed = textItem([100, 50], '15', 3, 20, true)
  const edge = [textRect(boxed).right + 3, 50]
  assert.deepEqual(notesTouched([plain], edge, edge), [])
  assert.deepEqual(notesTouched([boxed], edge, edge), [0])
  const past = textRect(boxed).right + 20 * 0.35 + 0.1
  assert.deepEqual(notesTouched([boxed], [past, 50], [past, 50]), [], 'past the box')
  assert.equal(touchesBox(grownBox(noteBox(boxed), HIT_MARGIN_PX), [past + HIT_MARGIN_PX - 0.2, 0], [past + HIT_MARGIN_PX - 0.2, 100]), true, 'an erase within the margin of the box')
  assert.deepEqual(noteBox(plain), textRect(plain))
})

// Three notes near the top left, one far off, and a hidden stroke across them: sum's box is 88 to 112 across and 38.5 to 61.5 down.
const rectNotes = [sum, textItem([30, 30], 'a', 1, 20), oldStroke, textItem([60, 90], 'b', 2, 20), textItem([400, 400], 'far', 3, 20)]

test('a selection rectangle selects every note it touches, whichever way it was dragged, and never a hidden stroke', () => {
  assert.deepEqual(notesTouched(rectNotes, [0, 0], [150, 100]), [0, 1, 3])
  assert.deepEqual(notesTouched(rectNotes, [150, 100], [0, 0]), [0, 1, 3])
  assert.deepEqual(notesTouched(rectNotes, [0, 100], [150, 0]), [0, 1, 3])
})

test('a selection rectangle that only touches the corner of a note\'s box selects it, and one that stops short does not', () => {
  const { right, bottom } = noteBox(sum)
  assert.deepEqual(notesTouched([sum], [right, bottom], [130, 80]), [0], 'a rectangle whose corner is the box\'s corner')
  assert.deepEqual(notesTouched([sum], [125, 0], [140, 80]), [])
  assert.deepEqual(notesTouched([sum], [90, 74], [100, 80]), [])
})

test('a selection rectangle touches a note\'s background box, which reaches past its text', () => {
  const boxed = textItem([100, 50], '15', 3, 20, true)
  const justPast = [textRect(boxed).right + 3, 50]
  assert.deepEqual(notesTouched([sum], justPast, [justPast[0] + 10, 55]), [])
  assert.deepEqual(notesTouched([boxed], justPast, [justPast[0] + 10, 55]), [0])
})

// Size 20 is the slider's 6, and 14 its 3.
const red20 = textItem([0, 0], 'a', 4, 20)
const red14Boxed = textItem([0, 0], 'b', 4, 14, true)
const blue20Boxed = textItem([0, 0], 'c', 6, 20, true)

test('the panel shows a selection that agrees on everything as its color, size, transparency and background', () => {
  assert.deepEqual(panelLooks([red20, { ...red20, text: 'd' }]), { color: 4, width: 6, opacity: 100, bg: false })
  assert.deepEqual(panelLooks([blue20Boxed]), { color: 6, width: 6, opacity: 100, bg: true })
})

test('a mixed selection shows no color or background state where its notes differ, and the first note\'s size and transparency', () => {
  assert.deepEqual(panelLooks([red14Boxed, blue20Boxed]), { color: null, width: 3, opacity: 100, bg: true })
  assert.deepEqual(panelLooks([red20, red14Boxed]), { color: 4, width: 6, opacity: 100, bg: null })
  assert.deepEqual(panelLooks([red20, blue20Boxed]), { color: null, width: 6, opacity: 100, bg: null })
  assert.equal(panelLooks([{ ...red20, opacity: 40 }, red20]).opacity, 40)
  assert.equal(panelLooks([red20, { ...red20, opacity: 40 }]).opacity, 100)
  assert.equal(panelLooks([{ ...red20, size: textSizeFor(7.5) }, red20]).width, 7.5)
})

test('a saved transparency reads back for any slider value, and a missing or bad one reads as the default', () => {
  for (const saved of [MIN_OPACITY, MAX_OPACITY, DEFAULT_OPACITY]) assert.equal(readOpacity(saved), saved)
  assert.equal(readOpacity(55), 55)
  for (const saved of [null, undefined, 0, 19, 101, 57, '60', 'faint', {}, NaN]) assert.equal(readOpacity(saved), DEFAULT_OPACITY, JSON.stringify(saved))
})

test('a new note carries the transparency it is given, and 100 when none is', () => {
  assert.equal(textItem([0, 0], 'a', 1, 20, false, 60).opacity, 60)
  assert.equal(textItem([0, 0], 'a', 1, 20).opacity, 100)
})

test('an outline is none, thin or medium, None, Thin or Thick in the dialog, and anything else reads as medium', () => {
  assert.deepEqual(OUTLINES, ['none', 'thin', 'medium'])
  assert.equal(DEFAULT_OUTLINE, 'medium')
  assert.deepEqual(OUTLINES.map((name) => OUTLINE_LABELS[name]), ['None', 'Thin', 'Thick'])
  for (const saved of [null, undefined, 'huge', 3, {}]) assert.equal(readOutline(saved), 'medium', JSON.stringify(saved))
  for (const saved of OUTLINES) assert.equal(readOutline(saved), saved)
})

test('a note\'s own outline field is ignored: it loads, stays as saved and is not read', () => {
  assert.deepEqual(readItems([{ ...red20, outline: 'none' }]), [{ ...red20, outline: 'none' }])
  assert.deepEqual(readItems([{ ...red20, outline: 'huge' }]), [{ ...red20, outline: 'huge' }])
  const map = { scale: 1, toScreen: (p) => p, toBoard: (p) => p }
  assert.deepEqual(noteScreenBox({ ...red20, outline: 'none' }, map, 'medium'), noteScreenBox(red20, map, 'medium'))
})

test('a halo is a ring of sixteen zero-blur shadows, whose radius is the outline\'s reach and grows from thin to medium; none has no shadow', () => {
  assert.equal(haloShadow('none', 'red'), 'none')
  const radii = OUTLINES.slice(1).map((outline) => {
    const shadows = haloShadow(outline, 'red').split(', ')
    assert.equal(shadows.length, 16)
    const offsets = shadows.map((shadow) => {
      const match = /^(-?[\d.]+)em (-?[\d.]+)em 0 red$/.exec(shadow)
      assert.ok(match, shadow)
      return [Number(match[1]), Number(match[2])]
    })
    // No shadow reaches past the outline's radius, and each is on the ring.
    for (const [x, y] of offsets) assert.ok(Math.abs(Math.hypot(x, y) - OUTLINE_EM[outline]) < 0.002, `${outline} ${x} ${y}`)
    return OUTLINE_EM[outline]
  })
  assert.deepEqual(radii, [...radii].sort((a, b) => a - b))
  assert.equal(OUTLINE_EM.medium, 0.14)
  assert.equal(OUTLINE_EM.none, 0)
})

test('a note\'s padding is its outline\'s reach, none for none', () => {
  const map = { scale: 1, toScreen: (p) => p, toBoard: (p) => p }
  const box = (outline) => noteScreenBox(textItem([100, 50], 'sum', 1, 20), map, outline)
  assert.equal(Math.round((box('thin').right - box('none').right) * 1000) / 1000, Math.round(OUTLINE_EM.thin * 20 * 1000) / 1000)
  assert.equal(Math.round((box('medium').right - box('none').right) * 1000) / 1000, 2.8)
})

// A note's text as styled runs, one list of runs per line; a flag is set only on the runs it applies to.
const runs = (text) => parseMarkdown(text)[0]

test('markdown reads bold, italic (both marks) and strikethrough, with the markers left out of the runs', () => {
  assert.deepEqual(runs('**a** *b* ~~c~~ _d_'), [
    { text: 'a', bold: true }, { text: ' ' }, { text: 'b', italic: true }, { text: ' ' }, { text: 'c', strike: true }, { text: ' ' }, { text: 'd', italic: true }
  ])
})

test('markdown nests where it parses cleanly, in either order', () => {
  assert.deepEqual(runs('**bold *and italic***'), [{ text: 'bold ', bold: true }, { text: 'and italic', bold: true, italic: true }])
  assert.deepEqual(runs('*italic **and bold***'), [{ text: 'italic ', italic: true }, { text: 'and bold', italic: true, bold: true }])
  assert.deepEqual(runs('~~**x**~~'), [{ text: 'x', bold: true, strike: true }])
})

test('an unmatched marker, or one with a space inside it, shows as typed', () => {
  assert.deepEqual(runs('**a'), [{ text: '**a' }])
  assert.deepEqual(runs('a * b * c'), [{ text: 'a * b * c' }])
  assert.deepEqual(runs('5 ** 2'), [{ text: '5 ** 2' }])
  assert.deepEqual(runs('**a *b**'), [{ text: '**a ' }, { text: 'b', italic: true }, { text: '*' }])
  assert.deepEqual(runs('*a *'), [{ text: '*a *' }], 'a closing marker after a space')
  assert.deepEqual(runs('x * a*'), [{ text: 'x * a*' }], 'an opening marker before a space')
  assert.deepEqual(runs('~~~'), [{ text: '~~~' }])
  assert.deepEqual(runs('****'), [{ text: '****' }])
})

test('an underscore inside a word is not italic', () => {
  assert.deepEqual(runs('snake_case_name'), [{ text: 'snake_case_name' }])
  assert.deepEqual(runs('x_a_'), [{ text: 'x_a_' }], 'an opening underscore after a letter')
  assert.deepEqual(runs('_a_b'), [{ text: '_a_b' }], 'a closing underscore before a letter')
})

test('each line is read on its own, so a marker does not reach across a line break', () => {
  assert.deepEqual(parseMarkdown('**a\nb**'), [[{ text: '**a' }], [{ text: 'b**' }]])
  assert.deepEqual(parseMarkdown('x\n*y*'), [[{ text: 'x' }], [{ text: 'y', italic: true }]])
  assert.deepEqual(parseMarkdown(''), [[]])
})

test('a line starting with "- " or "* " is a bullet: a bullet run, then the rest read as markdown', () => {
  assert.deepEqual(parseMarkdown('- one\n- **two**'), [[{ text: '•', bullet: true }, { text: 'one' }], [{ text: '•', bullet: true }, { text: 'two', bold: true }]])
  assert.deepEqual(parseMarkdown('* star'), [[{ text: '•', bullet: true }, { text: 'star' }]])
})

test('a dash that does not start a line, or has no space after it, is not a bullet', () => {
  assert.deepEqual(parseMarkdown('a - b'), [[{ text: 'a - b' }]])
  assert.deepEqual(parseMarkdown('-one'), [[{ text: '-one' }]])
  assert.deepEqual(parseMarkdown(' - one'), [[{ text: ' - one' }]])
})

test('a line that starts with italic markers and no space is italic, not a bullet', () => {
  assert.deepEqual(parseMarkdown('*one* and'), [[{ text: 'one', italic: true }, { text: ' and' }]])
})

test('a line starting "- [ ] " or "- [x] " is a checklist item, a box run with its checked state, then the rest read as markdown', () => {
  assert.deepEqual(parseMarkdown('- [ ] buy'), [[{ text: '☐', bullet: true, checked: false }, { text: 'buy' }]])
  assert.deepEqual(parseMarkdown('- [x] **done**'), [[{ text: '☑', bullet: true, checked: true }, { text: 'done', bold: true }]])
  assert.deepEqual(parseMarkdown('- [X] caps')[0][0].checked, true)
})

test('a checklist item may drop the dash, drop the space inside the brackets, or be empty', () => {
  const box = (checked, ...rest) => [{ text: checked ? '☑' : '☐', bullet: true, checked }, ...rest]
  assert.deepEqual(parseMarkdown('[ ] milk'), [box(false, { text: 'milk' })])
  assert.deepEqual(parseMarkdown('[] milk'), [box(false, { text: 'milk' })])
  assert.deepEqual(parseMarkdown('[x] milk'), [box(true, { text: 'milk' })])
  assert.deepEqual(parseMarkdown('[X] milk'), [box(true, { text: 'milk' })])
  assert.deepEqual(parseMarkdown('- [] milk'), [box(false, { text: 'milk' })])
  assert.deepEqual(parseMarkdown('* [ ] milk'), [box(false, { text: 'milk' })])
  assert.deepEqual(parseMarkdown('* [x] milk'), [box(true, { text: 'milk' })])
})

test('an empty checklist item is a box, and keeps it once the note is closed', () => {
  for (const typed of ['- [ ]', '- [ ] ', '[]', '[ ]', '* [] ', '- [x]']) {
    const [line] = parseMarkdown(closedText(typed))
    assert.equal(line.length, 1, `${JSON.stringify(typed)} is one box run`)
    assert.equal(line[0].bullet, true, `${JSON.stringify(typed)} is a box`)
    assert.equal(typeof line[0].checked, 'boolean')
  }
  assert.equal(closedText('- [ ] '), '- [ ]')
  assert.equal(parseMarkdown('a\n- [ ]\nb')[1][0].text, '☐', 'an empty item among other lines')
})

test('text that is not a checklist item stays text or a bullet', () => {
  assert.deepEqual(parseMarkdown('-[ ] milk'), [[{ text: '-[ ] milk' }]], 'no space after the dash is no bullet')
  assert.deepEqual(parseMarkdown('milk [ ]'), [[{ text: 'milk [ ]' }]], 'a box mid-line')
  assert.deepEqual(parseMarkdown('[ ]milk'), [[{ text: '[ ]milk' }]], 'no space after the box')
  assert.deepEqual(parseMarkdown('[  ] milk'), [[{ text: '[  ] milk' }]], 'two spaces inside')
  assert.deepEqual(parseMarkdown('- [ ]x'), [[{ text: '•', bullet: true }, { text: '[ ]x' }]])
  assert.deepEqual(parseMarkdown(' [ ] milk'), [[{ text: ' [ ] milk' }]], 'an indented box')
  assert.deepEqual(parseMarkdown('- one'), [[{ text: '•', bullet: true }, { text: 'one' }]])
})

test('__text__ underlines, and an underline combines with bold and italic either way round', () => {
  assert.deepEqual(runs('__a__'), [{ text: 'a', underline: true }])
  assert.deepEqual(runs('__**a**__'), [{ text: 'a', underline: true, bold: true }])
  assert.deepEqual(runs('__*a*__'), [{ text: 'a', underline: true, italic: true }])
  assert.deepEqual(runs('__***a***__'), [{ text: 'a', underline: true, bold: true, italic: true }])
  assert.deepEqual(runs('**__a__**'), [{ text: 'a', underline: true, bold: true }])
  assert.deepEqual(runs('x __a__ y'), [{ text: 'x ' }, { text: 'a', underline: true }, { text: ' y' }])
})

test('a single underscore stays italic, and a double underscore with a space inside stays text', () => {
  assert.deepEqual(runs('_a_'), [{ text: 'a', italic: true }])
  assert.deepEqual(runs('__ a __'), [{ text: '__ a __' }])
  assert.deepEqual(runs('__a'), [{ text: '__a' }])
  assert.deepEqual(runs('___a___'), [{ text: 'a', underline: true, italic: true }])
  assert.deepEqual(runs('snake_case_name'), [{ text: 'snake_case_name' }])
})

test('a line starting "# ", "## " or "### " is a header of that level; the rest is read as markdown', () => {
  assert.deepEqual(parseMarkdown('# Title\n## Sub\n### Small'), [[{ text: '', header: 1 }, { text: 'Title' }], [{ text: '', header: 2 }, { text: 'Sub' }], [{ text: '', header: 3 }, { text: 'Small' }]])
  assert.deepEqual(runs('# a **b** __c__'), [{ text: '', header: 1 }, { text: 'a ' }, { text: 'b', bold: true }, { text: ' ' }, { text: 'c', underline: true }])
})

test('a hash without a space, or four of them, is no header', () => {
  assert.deepEqual(runs('#title'), [{ text: '#title' }])
  assert.deepEqual(runs('##title'), [{ text: '##title' }])
  assert.deepEqual(runs('#### four'), [{ text: '#### four' }])
  assert.deepEqual(runs('a # b'), [{ text: 'a # b' }])
  assert.deepEqual(runs(' # a'), [{ text: ' # a' }])
})

test('a line starting "-# " is subtext; "-#x" is text', () => {
  assert.deepEqual(runs('-# small *a*'), [{ text: '', subtext: true }, { text: 'small ' }, { text: 'a', italic: true }])
  assert.deepEqual(runs('-#x'), [{ text: '-#x' }])
  assert.deepEqual(runs('a -# b'), [{ text: 'a -# b' }])
})

test('each 2 spaces before a bullet or a checklist item is one more level', () => {
  assert.deepEqual(parseMarkdown('- a\n  - b\n    * c'), [
    [{ text: '•', bullet: true }, { text: 'a' }],
    [{ text: '•', bullet: true, level: 1 }, { text: 'b' }],
    [{ text: '•', bullet: true, level: 2 }, { text: 'c' }]
  ])
  assert.deepEqual(runs('  - [x] done'), [{ text: '☑', bullet: true, checked: true, level: 1 }, { text: 'done' }])
  assert.deepEqual(runs('  [ ] box'), [{ text: '☐', bullet: true, checked: false, level: 1 }, { text: 'box' }])
})

test('two spaces before italic markers is text then italic, not a bullet', () => {
  assert.deepEqual(runs('  *a*'), [{ text: '  ' }, { text: 'a', italic: true }])
})

test('an odd number of spaces before a dash is text', () => {
  assert.deepEqual(runs('   - a'), [{ text: '   - a' }])
})

test('a line starting with a number, ". " and text is a numbered item showing the number as typed', () => {
  assert.deepEqual(runs('1. one'), [{ text: '1.', bullet: true, numbered: true }, { text: 'one' }])
  assert.deepEqual(runs('7. seven'), [{ text: '7.', bullet: true, numbered: true }, { text: 'seven' }])
  assert.deepEqual(runs('10. **ten**'), [{ text: '10.', bullet: true, numbered: true }, { text: 'ten', bold: true }])
  assert.deepEqual(runs('  2. nested'), [{ text: '2.', bullet: true, numbered: true, level: 1 }, { text: 'nested' }])
})

test('a numbered item and a checklist item below it each keep their own kind', () => {
  assert.deepEqual(parseMarkdown('1. a\n- [ ] b'), [
    [{ text: '1.', bullet: true, numbered: true }, { text: 'a' }],
    [{ text: '☐', bullet: true, checked: false }, { text: 'b' }]
  ])
})

test('"1.x", "1." alone and "a1. b" stay text', () => {
  assert.deepEqual(runs('1.x'), [{ text: '1.x' }])
  assert.deepEqual(runs('1.'), [{ text: '1.' }])
  assert.deepEqual(runs('a1. b'), [{ text: 'a1. b' }])
  assert.deepEqual(runs('.5 x'), [{ text: '.5 x' }])
})

test('headers, subtext, nested and numbered lines, and underline are text inside inline code and a code block', () => {
  assert.deepEqual(runs('`# a`'), [{ text: '# a', code: true }])
  assert.deepEqual(runs('`__a__`'), [{ text: '__a__', code: true }])
  const FENCE_LINE = [{ text: '', fence: true }]
  assert.deepEqual(parseMarkdown('```\n# a\n-# b\n  - c\n1. d\n__e__\n```'), [FENCE_LINE, [{ text: '# a' }], [{ text: '-# b' }], [{ text: '  - c' }], [{ text: '1. d' }], [{ text: '__e__' }], FENCE_LINE])
})

test('toggledCheck ticks an indented item', () => {
  assert.equal(toggledCheck('a\n  - [ ] b', 1), 'a\n  - [x] b')
  assert.equal(toggledCheck('  [x] b', 0), '  [ ] b')
})

test('a note of headers is boxed taller and wider than the same text plain', () => {
  const plain = textRect(textItem([0, 0], 'word word', 1, 20))
  const header = textRect(textItem([0, 0], '# word word', 1, 20))
  assert.ok(header.bottom > plain.bottom, `header ${header.bottom} vs plain ${plain.bottom}`)
  assert.ok(header.right > plain.right, `header ${header.right} vs plain ${plain.right}`)
  const sub = textRect(textItem([0, 0], '-# word word', 1, 20))
  assert.ok(sub.bottom < plain.bottom, `subtext ${sub.bottom} vs plain ${plain.bottom}`)
  const nested = textRect(textItem([0, 0], '  - word', 1, 20))
  const flat = textRect(textItem([0, 0], '- word', 1, 20))
  assert.ok(nested.right > flat.right, 'a nested item is boxed further right')
})

const FENCE = { text: '', fence: true }
const codeLine = (text) => [{ text }]

test('inline code is one run of its own with the backticks left out, and no markup is read inside it', () => {
  assert.deepEqual(parseMarkdown('a `b` c'), [[{ text: 'a ' }, { text: 'b', code: true }, { text: ' c' }]])
  assert.deepEqual(parseMarkdown('`a` and `b`'), [[{ text: 'a', code: true }, { text: ' and ' }, { text: 'b', code: true }]])
  assert.deepEqual(parseMarkdown('`**a** -> _b_`'), [[{ text: '**a** -> _b_', code: true }]])
  assert.deepEqual(parseMarkdown('- `a` b'), [[{ text: '•', bullet: true }, { text: 'a', code: true }, { text: ' b' }]])
  assert.deepEqual(parseMarkdown('**x `y` z**'), [[{ text: 'x ', bold: true }, { text: 'y', bold: true, code: true }, { text: ' z', bold: true }]])
})

test('inline code does not reach across a line break, and a backtick with no partner shows as typed', () => {
  assert.deepEqual(parseMarkdown('a `b'), [[{ text: 'a `b' }]])
  assert.deepEqual(parseMarkdown('`a\nb`'), [[{ text: '`a' }], [{ text: 'b`' }]])
  assert.deepEqual(parseMarkdown('a `` b'), [[{ text: 'a `` b' }]])
  assert.deepEqual(parseMarkdown('`a` `b'), [[{ text: 'a', code: true }, { text: ' `b' }]])
})

test('a fence line opens a code block, whose lines show as typed, and the next fence line closes it', () => {
  const body = ['- [ ] a', '**b**', '  -> c', '', '_d_']
  assert.deepEqual(parseMarkdown('```\n' + body.join('\n') + '\n```'), [[FENCE], ...body.map(codeLine), [FENCE]])
  assert.deepEqual(parseMarkdown('```js\nx `y`\n```'), [[FENCE], codeLine('x `y`'), [FENCE]])
})

test('the forgiving checklist forms stay text inside inline code and a code block', () => {
  assert.deepEqual(parseMarkdown('`[ ] a`'), [[{ text: '[ ] a', code: true }]])
  assert.deepEqual(parseMarkdown('```\n[ ] a\n[]\n* [x] b\n```'), [[FENCE], codeLine('[ ] a'), codeLine('[]'), codeLine('* [x] b'), [FENCE]])
  assert.deepEqual(parseMarkdown('[ ] `a`'), [[{ text: '☐', bullet: true, checked: false }, { text: 'a', code: true }]])
})

test('lines after a code block parse normally, and an unclosed block runs to the end of the note', () => {
  assert.deepEqual(parseMarkdown('```\na\n```\n- **b**'), [[FENCE], codeLine('a'), [FENCE], [{ text: '•', bullet: true }, { text: 'b', bold: true }]])
  assert.deepEqual(parseMarkdown('x\n```\n**a**\n- b'), [[{ text: 'x' }], [FENCE], codeLine('**a**'), codeLine('- b')])
})

test('only a line of exactly three backticks and a language word is a fence', () => {
  assert.deepEqual(parseMarkdown('``` js\na'), [[{ text: '``` js' }], [{ text: 'a' }]])
  assert.deepEqual(parseMarkdown('x ```\na'), [[{ text: 'x ```' }], [{ text: 'a' }]])
  assert.deepEqual(parseMarkdown('```\n```js\n```'), [[FENCE], codeLine('```js'), [FENCE]])
})

test('symbolJustTyped leaves a pair alone inside inline code, inside an unclosed backtick span, and inside a code block', () => {
  assert.deepEqual(symbolJustTyped('`a->', 4), null)
  assert.deepEqual(symbolJustTyped('`a` ->', 6), { start: 4, end: 6, symbol: '→' })
  assert.deepEqual(symbolJustTyped('x ->', 4), { start: 2, end: 4, symbol: '→' })
  assert.equal(symbolJustTyped('```\na ->', 8), null)
  assert.equal(symbolJustTyped('```js\n\n  b <=', 13), null)
  assert.deepEqual(symbolJustTyped('```\na\n```\nb ->', 14), { start: 12, end: 14, symbol: '→' })
  assert.equal(symbolJustTyped('`x sum ', 7), null)
})

test('symbolJustTyped leaves a pair or a word alone inside a closed inline span, including when the closing backtick is what completes "sum"', () => {
  assert.equal(symbolJustTyped('`a->b`', 4), null)
  assert.equal(symbolJustTyped('`a ->`', 5), null)
  assert.equal(symbolJustTyped('`sum`', 5), null)
  assert.deepEqual(symbolJustTyped('`a` sum ', 8), { start: 4, end: 7, symbol: 'Σ' })
})

test('closedSymbols leaves a closing "sum" alone inside a code block', () => {
  assert.equal(closedSymbols('```\nr5 sum'), '```\nr5 sum')
  assert.equal(closedSymbols('`a` sum'), '`a` Σ')
  assert.equal(closedSymbols('it`s a sum'), 'it`s a Σ', 'a backtick with no partner is plain text in a finished note')
})

test('toggledCheck flips one line\'s box and leaves the other lines alone', () => {
  assert.equal(toggledCheck('a\n- [ ] b\n- [ ] c', 1), 'a\n- [x] b\n- [ ] c')
  assert.equal(toggledCheck('- [x] b', 0), '- [ ] b')
  assert.equal(toggledCheck('- [X] b', 0), '- [ ] b')
  assert.equal(toggledCheck('plain', 0), 'plain')
})

test('toggledCheck keeps the form the user typed', () => {
  assert.equal(toggledCheck('[] milk', 0), '[x] milk')
  assert.equal(toggledCheck('[ ] milk', 0), '[x] milk')
  assert.equal(toggledCheck('* [ ] milk', 0), '* [x] milk')
  assert.equal(toggledCheck('- []', 0), '- [x]')
  assert.equal(toggledCheck('- [ ]', 0), '- [x]')
  assert.equal(toggledCheck('[x]', 0), '[ ]')
  assert.equal(toggledCheck('* [X] milk', 0), '* [ ] milk')
  assert.equal(toggledCheck('milk [ ]', 0), 'milk [ ]')
})

test('closedSymbols turns a note\'s last word "sum" into a sigma, since nothing is typed after it', () => {
  assert.equal(closedSymbols('r5 sum'), 'r5 Σ')
  assert.equal(closedSymbols('sum'), 'Σ')
  assert.equal(closedSymbols('sum of 5'), 'sum of 5')
  assert.equal(closedSymbols('summary'), 'summary')
  assert.equal(closedSymbols('subsum'), 'subsum')
  assert.equal(closedSymbols('a->b'), 'a->b')
})

test('symbolJustTyped gives each pair its sign', () => {
  const sign = (pair) => symbolJustTyped(`a${pair}`, 3).symbol
  assert.deepEqual(['->', '<-', '!=', '<=', '>='].map(sign), ['→', '←', '≠', '≤', '≥'])
})

test('symbolJustTyped leaves text without a symbol alone', () => {
  assert.equal(symbolJustTyped('a - b < c = d > e !', 19), null)
  assert.equal(symbolJustTyped('', 0), null)
})

test('symbolJustTyped finds the pair that ends at the caret, with the sign to put there', () => {
  assert.deepEqual(symbolJustTyped('a->', 3), { start: 1, end: 3, symbol: '→' })
  assert.deepEqual(symbolJustTyped('a>=b', 3), { start: 1, end: 3, symbol: '≥' })
  assert.equal(symbolJustTyped('a-', 2), null)
  assert.equal(symbolJustTyped('a->b', 4), null)
})

test('symbolJustTyped replaces "sum" only once the character after it is typed, so "summary" survives', () => {
  assert.equal(symbolJustTyped('sum', 3), null)
  assert.equal(symbolJustTyped('summ', 4), null)
  assert.deepEqual(symbolJustTyped('x sum ', 6), { start: 2, end: 5, symbol: 'Σ' })
})

// The caret a double-click puts in a note's raw text, from the character index it has in the text the closed note shows.
test('a caret on a shown letter is put before the same letter in the raw text, past its markers', () => {
  assert.equal(rawOffset('abcdefgh', 'abcdefgh', 4), 4, 'plain text')
  assert.equal(rawOffset('**ab**cdefgh', 'abcdefgh', 4), 8, 'after a bold run')
  assert.equal(rawOffset('~~ab~~ *cd*', 'ab cd', 3), 8, 'inside an italic run')
  assert.equal(rawOffset('- item', '•item', 1), 2, 'a bullet is shown in place of its dash and space')
  assert.equal(rawOffset('- [ ] task', 'task', 0), 6, 'a checklist box has no shown text')
  assert.equal(rawOffset('**ab**', 'ab', 2), 6, 'past the end is the end')
  assert.equal(rawOffset('a\nb', 'a\nb', 2), 2, 'a line break is the same in both')
})

const width = (item) => textRect(item).right - textRect(item).left
const height = (item) => textRect(item).bottom - textRect(item).top

test('a note\'s box is as wide as its longest line shown, markers left out, and one line taller for each line break', () => {
  assert.equal(width(textItem([100, 50], '**15**', 3, 20)), width(sum))
  const two = textItem([100, 50], '15\n150', 3, 20)
  assert.equal(width(two), width(textItem([100, 50], '150', 3, 20)))
  assert.equal(height(two), 46)
  assert.equal(textRect(two).top, 50)
})

// A note of text size 20 has a line 1.15 x 20 = 23 board units high, so its automatic box is 16 x 20 = 320 wide and 8 x 23 = 184 high.
test('a line longer than the box wraps: the box stops at 16 em wide and is a line taller for each wrap', () => {
  const long = textItem([100, 50], 'x'.repeat(40), 3, 20)
  assert.equal(width(long), 320)
  assert.equal(height(long), 46)
  assert.equal(textRect(long).left, 100)
})

test('a note of more than 8 lines stops growing at 8 lines high', () => {
  assert.equal(height(textItem([100, 50], Array(8).fill('a').join('\n'), 3, 20)), 184)
  assert.equal(height(textItem([100, 50], Array(12).fill('a').join('\n'), 3, 20)), 184)
})

test('a resized note\'s box is its stored size, whatever its text, from its point', () => {
  const resized = { ...textItem([100, 50], 'a', 3, 20), box: [200, 60] }
  assert.deepEqual(textRect(resized), { left: 100, right: 300, top: 50, bottom: 110 })
})

test('a saved size reads back, and a note without one has none', () => {
  const resized = { ...sum, box: [200.5, 60] }
  assert.deepEqual(readItems(JSON.parse(JSON.stringify([resized, sum]))), [resized, sum])
  for (const box of [[1], 'big', [0, 10], [10, -1], [10, 'a'], null]) assert.deepEqual(readNotes([{ ...sum, box }]).kept, [{ ...sum, box }], JSON.stringify(box))
})

// An auto size, in board units, wider than the minimum box, passed for whatever text the test's note holds.
const AUTO = [132, 23]

// A resize keeps the corner opposite the dragged one still: on the board the stub's scale is 2 screen pixels a board unit.
test('dragging a note\'s bottom right corner sets its box in board units and puts its point on the box\'s top left', () => {
  const on = textItem([50, 60], 'hi', 3, 20)
  const resized = resizedItem(on, [200, 170], [600, 290], { ...board, scale: 2 }, CORNERS.bottomRight, AUTO)
  assert.deepEqual(resized, { ...on, box: [200, 60], at: [50, 60] })
})

test('dragging each other corner keeps the opposite corner still and sets the same box', () => {
  const on = textItem([50, 60], 'hi', 3, 20)
  const scaled = { ...board, scale: 2 }
  // The box is 200 x 60 board units, 400 x 120 pixels, with its opposite corner at (600, 290), (200, 290), (600, 170) and (200, 170).
  assert.deepEqual(resizedItem(on, [600, 290], [200, 170], scaled, CORNERS.topLeft, AUTO), { ...on, box: [200, 60], at: [50, 60] })
  assert.deepEqual(resizedItem(on, [200, 290], [600, 170], scaled, CORNERS.topRight, AUTO), { ...on, box: [200, 60], at: [50, 60] })
  assert.deepEqual(resizedItem(on, [600, 170], [200, 290], scaled, CORNERS.bottomLeft, AUTO), { ...on, box: [200, 60], at: [50, 60] })
})

test('dragging a corner past its opposite one still leaves the minimum box on the corner\'s own side', () => {
  const on = textItem([50, 60], 'a longer note', 3, 20)
  // The top left dragged to the right of and below the fixed bottom right: the box is the minimum and ends at the bottom right.
  const resized = resizedItem(on, [600, 290], [900, 500], { ...board, scale: 2 }, CORNERS.topLeft, AUTO)
  assert.deepEqual(resized.box, [60, 23])
  assert.deepEqual(resized.at, [190, 97])
})

test('a note off the board keeps its fixed point\'s kind, and its box is in board units too, as its text is', () => {
  const off = placedItem(textItem([50, 60], 'hi', 3, 20), [40, 700], board)
  assert.deepEqual(resizedItem(off, [0, 680], [400, 800], { ...board, scale: 2 }, CORNERS.bottomRight, AUTO), { ...off, box: [200, 60], fixed: [0, 680] })
})

test('a resize of a note wider than three characters stops at about three characters wide and one line high', () => {
  const on = textItem([50, 60], 'a longer note', 3, 20)
  assert.deepEqual(resizedItem(on, [200, 170], [190, 160], { ...board, scale: 2 }, CORNERS.bottomRight, AUTO).box, [60, 23])
})

test('a note narrower than three characters can be resized back down to its own width and no further than it', () => {
  const short = textItem([50, 60], 'hi', 3, 20)
  // Two characters at 0.6 em each, and one line of 1.15 em, at a text size of 20 board units.
  const own = [24, 23]
  const dragged = (to) => resizedItem(short, [200, 170], to, { ...board, scale: 2 }, CORNERS.bottomRight, own).box
  assert.deepEqual(dragged([200 + own[0] * 2, 170 + own[1] * 2]), own, 'dragged to its own size')
  assert.deepEqual(dragged([190, 160]), own, 'dragged past it, it stops at its own size')
})

test('a resize never leaves a note without a box to grab, even from an auto size of nothing', () => {
  const note = textItem([50, 60], 'x', 3, 20)
  assert.deepEqual(resizedItem(note, [200, 170], [190, 160], { ...board, scale: 2 }, CORNERS.bottomRight, [0, 0]).box, [5, 5])
})

test('a note sent back to auto size loses its box and keeps its point', () => {
  const resized = { ...textItem([50, 60], 'hi', 3, 20), box: [200, 60] }
  assert.deepEqual(autoSized(resized), textItem([50, 60], 'hi', 3, 20))
  assert.equal('box' in autoSized(resized), false)
})

test('once a note is drawn its box is the size drawn, not the guess from its characters, and a resized note keeps its stored box', () => {
  const long = textItem([100, 50], 'x'.repeat(40), 3, 20)
  assert.deepEqual(textRect({ ...long, [DRAWN_SIZE]: [300, 23] }), { left: 100, right: 400, top: 50, bottom: 73 })
  assert.deepEqual(textRect({ ...long, box: [200, 60], [DRAWN_SIZE]: [300, 23] }), { left: 100, right: 300, top: 50, bottom: 110 })
})

const WINDOW = { left: 0, top: 0, right: 1000, bottom: 900 }

test('a note whose box is inside the window stays where it is', () => {
  assert.deepEqual(reachablePoint([500, 400], [100, 40], WINDOW), [500, 400])
})

test('a note whose box is past the window\'s edge is moved to the nearest point, a pixel in, that holds the whole box inside', () => {
  assert.deepEqual(reachablePoint([1143, 800], [100, 40], WINDOW), [949, 800])
  assert.deepEqual(reachablePoint([-20, -5], [100, 40], WINDOW), [51, 21])
})

test('a note too big for the window is centred on it', () => {
  assert.deepEqual(reachablePoint([10, 10], [1200, 40], WINDOW), [500, 21])
})

test('a window with no area leaves a note where it is', () => {
  assert.deepEqual(reachablePoint([900, 60], [100, 40], { left: 0, top: 0, right: 0, bottom: 0 }), [900, 60])
})

test('a note\'s box on the screen is its text\'s box and its padding at the board\'s scale, round its screen point, on the board or off it', () => {
  // A board drawn at twice its units, from (10, 20) on the screen.
  const map = { scale: 2, toScreen: ([x, y]) => [10 + 2 * x, 20 + 2 * y], toBoard: ([x, y]) => [(x - 10) / 2, (y - 20) / 2] }
  const near = (box) => Object.fromEntries(Object.entries(box).map(([side, v]) => [side, Math.round(v * 1e6) / 1e6]))
  const pinned = { ...textItem([100, 50], 'sum', 1, 20), box: [40, 23] }
  // Without a background the padding is the halo's reach, 0.14 of 20 units.
  assert.deepEqual(near(noteScreenBox(pinned, map, 'medium')), { left: 204.4, right: 295.6, top: 114.4, bottom: 171.6 })
  // With one it is the background's, 7 units across and 3 down.
  assert.deepEqual(near(noteScreenBox({ ...pinned, bg: true }, map, 'medium')), { left: 196, right: 304, top: 114, bottom: 172 })
  const { at, ...rest } = pinned
  assert.deepEqual(near(noteScreenBox({ ...rest, fixed: [300, 400] }, map, 'medium')), { left: 294.4, right: 385.6, top: 394.4, bottom: 451.6 })
})

const completeRoots = () => {
  const app = { on () {}, getToolNames () {}, puzzle: { on () {} } }
  const Framework = { getApp () {}, getData () {}, setData () {}, removeData () {}, addTool () {}, addSetting () {}, showDialog () {}, closeDialog () {}, app: { svgRenderer: { getElem () {} }, puzzle: { undoStack: [] }, grid: { rows: 9, cols: 9 }, tools: { colour: {} } } }
  return { Framework, app }
}

test('Text Anywhere declares each SudokuPad internal it calls, and a complete SudokuPad lacks none', () => {
  assert.deepEqual(lackingInternals(FEATURES, completeRoots()), new Map())
})

test('without one internal, only the features that need it are lacking', () => {
  const cases = [
    ['Framework.addTool', ['tool']], ['app.getToolNames', ['tool']],
    ['Framework.showDialog', ['tool', 'settings']],
    ['Framework.getApp', ['notes', 'tool']],
    ['Framework.app.svgRenderer.getElem', ['notes', 'tool']], ['Framework.app.puzzle', ['notes', 'tool', 'undoRestart']],
    ['Framework.app.puzzle.undoStack', ['undoRestart']],
    ['app.puzzle.on', ['notes', 'tool', 'undoRestart']], ['app.on', ['notes', 'tool']],
    ['Framework.getData', ['saved']], ['Framework.setData', ['saved']], ['Framework.removeData', ['saved']],
    ['Framework.addSetting', ['settings']], ['Framework.closeDialog', ['settings']],
    ['Framework.app.grid.rows', ['tool']], ['Framework.app.grid.cols', ['tool']],
    ['Framework.app.tools.colour', ['presets']]
  ]
  for (const [internal, features] of cases) {
    assert.deepEqual(lackingInternals(FEATURES, withoutPath(completeRoots(), internal)), new Map([[internal, features]]), internal)
  }
})

// With the Text tool picked, so a listener reaches its own code past that check.
const textToolPicked = ({ Framework }) => { Framework.app.tool = TOOL_NAME }

test('a window listener of Text Anywhere whose own code throws turns its feature off, and the throw stays in the script', () => {
  const runs = failEachListener(path.join(__dirname, '..', 'draw-tool.user.js'), FEATURES, 'window', textToolPicked)
  assert.ok(runs.length >= 15, runs.map(({ where }) => where).join(', '))
  for (const { where, escaped } of runs) assert.deepEqual(escaped.map(({ error }) => String(error)), [], where)
  // Most listeners act only mid-gesture; the ones that read their event at once show the throw turning the Text tool off.
  const warned = runs.filter(({ warnings }) => warnings.some((warning) => /^draw-tool: Text tool skipped because SudokuPad changed: Error: the listener read event\./.test(warning)))
  assert.ok(warned.length >= 2, warned.map(({ where }) => where).join(', '))
})

test('a held arrow key repeats only after the pause, and its step grows from one nudge to the maximum over the ramp', () => {
  assert.equal(nudgeStep(0, false), 0)
  assert.equal(nudgeStep(NUDGE_REPEAT_MS - 1, false), 0)
  assert.equal(nudgeStep(NUDGE_REPEAT_MS, false), NUDGE_PX)
  assert.equal(nudgeStep(NUDGE_REPEAT_MS, false) < nudgeStep(NUDGE_REPEAT_MS + NUDGE_RAMP_MS / 2, false), true)
  assert.equal(nudgeStep(NUDGE_REPEAT_MS + NUDGE_RAMP_MS / 2, false) < nudgeStep(NUDGE_REPEAT_MS + NUDGE_RAMP_MS, false), true)
  assert.equal(nudgeStep(NUDGE_REPEAT_MS + NUDGE_RAMP_MS, false), NUDGE_MAX_PX)
  assert.equal(nudgeStep(NUDGE_RAMP_MS * 10, false), NUDGE_MAX_PX)
})

test('with Shift the step grows from ten pixels to the Shift maximum', () => {
  assert.equal(nudgeStep(NUDGE_REPEAT_MS - 1, true), 0)
  assert.equal(nudgeStep(NUDGE_REPEAT_MS, true), NUDGE_SHIFT_PX)
  assert.equal(nudgeStep(NUDGE_RAMP_MS * 10, true), NUDGE_SHIFT_MAX_PX)
})

const contains = (text, part, message) => assert.match(text, new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), message)
const pick = (html, role) => [...html.matchAll(new RegExp(`<button[^>]*data-role="${role}"[^>]*>`, 'g'))].map(([tag]) => ({
  value: tag.match(/data-value="([^"]*)"/)[1],
  label: tag.match(/aria-label="([^"]*)"/)[1],
  pressed: tag.match(/aria-pressed="([^"]*)"/)[1]
}))
const samples = (over = {}) => renderSamplePicks({ outline: 'medium', box: 'page', custom: '#ffffff', frame: false, textColor: 'rgb(1, 2, 3)', ...over })

test('the sample rows are three halo buttons, five box buttons and two border buttons', () => {
  const html = samples()
  assert.deepEqual(pick(html, 'outline-pick').map((b) => [b.value, b.label]), [['none', 'None'], ['thin', 'Thin'], ['medium', 'Thick']])
  assert.deepEqual(pick(html, 'box-pick').map((b) => [b.value, b.label]), [['page', 'Page'], ['white', 'White'], ['yellow', 'Yellow'], ['tint', 'Tint'], ['custom', 'Own']])
  assert.deepEqual(pick(html, 'frame-pick').map((b) => [b.value, b.label]), [['off', 'None'], ['on', 'Thin grey']])
})

test('exactly the picked button of each row is pressed', () => {
  const pressed = (html, role) => pick(html, role).filter((b) => b.pressed === 'true').map((b) => b.value)
  const html = samples({ outline: 'thin', box: 'tint', frame: true })
  assert.deepEqual([pressed(html, 'outline-pick'), pressed(html, 'box-pick'), pressed(html, 'frame-pick')], [['thin'], ['tint'], ['on']])
  const own = samples({ box: '#123456' })
  assert.deepEqual(pressed(own, 'box-pick'), ['custom'])
  assert.deepEqual(pressed(samples(), 'frame-pick'), ['off'])
})

test('each halo sample is one letter in the text color with its own reach of halo', () => {
  const html = samples()
  for (const name of OUTLINES) {
    const sample = html.match(new RegExp(`data-role="outline-pick" data-value="${name}"[^>]*>(.*?)</button>`))[1]
    contains(sample, `text-shadow:${haloShadow(name, 'var(--body-bg, #fff)')}`, name)
    contains(sample, 'color:rgb(1, 2, 3)', name)
    assert.match(sample, />A</)
  }
  assert.equal(haloShadow('none', 'x'), 'none')
})

test('each box sample is "A=B" in the text color on its box color, Tint following the text color and Own the custom color', () => {
  const html = samples({ custom: '#abcdef' })
  const sample = (value) => html.match(new RegExp(`data-role="box-pick" data-value="${value}"[^>]*>(.*?)</button>`))[1]
  contains(sample('page'), `background:${boxFill('page', '')}`)
  contains(sample('white'), `background:${boxFill('white', '')}`)
  contains(sample('yellow'), `background:${BOX_YELLOW}`)
  contains(sample('tint'), `background:${boxFill('tint', 'rgb(1, 2, 3)')}`)
  contains(sample('custom'), 'background:#abcdef')
  for (const value of ['page', 'white', 'yellow', 'tint', 'custom']) {
    assert.match(sample(value), />A=B</, value)
    contains(sample(value), 'color:rgb(1, 2, 3)', value)
  }
})

test('the box samples carry the current border, and the border samples show none and thin grey', () => {
  const edge = (html, role, value) => html.match(new RegExp(`data-role="${role}" data-value="${value}"[^>]*>(.*?)</button>`))[1]
  contains(edge(samples({ frame: true }), 'box-pick', 'white'), frameShadow(true))
  contains(edge(samples({ frame: false }), 'box-pick', 'white'), frameShadow(false))
  contains(edge(samples(), 'frame-pick', 'on'), frameShadow(true))
  contains(edge(samples(), 'frame-pick', 'off'), frameShadow(false))
})

test('the Own color input shows under the row only while Own is picked', () => {
  contains(samples({ box: '#123456', custom: '#123456' }), 'data-role="box-custom"')
  contains(samples({ box: '#123456', custom: '#123456' }), 'value="#123456"')
  assert.doesNotMatch(samples({ box: 'white' }), /data-role="box-custom"/)
})

test('each of the three sample rows has its sub-line', () => {
  const html = samples()
  contains(html, 'For notes without a box, so they read over digits and grid lines.')
  contains(html, 'For notes made with the Background button on.')
  contains(html, 'The line round a note with a box.')
})

// Ten column lines 64 px apart from 100: the board's span is 100..676, middles at 132, 196 ... 644.
const lineAt = (k) => 100 + k * 64
const LINES = Array.from({ length: 10 }, (_, k) => lineAt(k))

// The same board with the one implied ring of cells round it: lines from one cell before the first to one cell after the last, 36..740.
const RING_LINES = gridLines(9, lineAt)

test('gridLines runs from one cell before the board to one cell after it, for any grid size', () => {
  assert.deepEqual(gridLines(9, lineAt), [36, 100, 164, 228, 292, 356, 420, 484, 548, 612, 676, 740])
  assert.deepEqual(gridLines(2, (k) => k * 10), [-10, 0, 10, 20, 30])
})

test('snapAxis pulls a note\'s edge onto the line one cell outside the board', () => {
  assert.deepEqual(snapAxis(700, 738, { lines: RING_LINES }), { shift: 2, guide: 740 })
  assert.deepEqual(snapAxis(34, 90, { lines: RING_LINES }), { shift: 2, guide: 36 })
})

test('snapAxis pulls a note\'s middle onto the middle of an outer-ring cell', () => {
  assert.deepEqual(snapAxis(680, 738, { lines: RING_LINES }), { shift: -1, guide: 708 })
  assert.deepEqual(snapAxis(42, 96, { lines: RING_LINES }), { shift: -1, guide: 68 })
})

test('snapAxis does not snap to the lines two cells outside the board (-28 and 804)', () => {
  assert.equal(snapAxis(-40, -26, { lines: RING_LINES }), null)
  assert.equal(snapAxis(790, 802, { lines: RING_LINES }), null)
})

test('snapAxis pulls a note\'s middle onto a cell\'s middle and guides at that middle', () => {
  assert.deepEqual(snapAxis(150, 240, { lines: LINES }), { shift: 1, guide: 196 })
})

test('snapAxis pulls a note\'s near edge onto a cell line', () => {
  assert.deepEqual(snapAxis(166, 200, { lines: LINES }), { shift: -2, guide: 164 })
})

test('snapAxis pulls a note\'s far edge onto a cell line', () => {
  assert.deepEqual(snapAxis(120, 226, { lines: LINES }), { shift: 2, guide: 228 })
})

test('snapAxis reaches exactly SNAP_PX (4) and leaves a note 4.5 px from every target where it is', () => {
  assert.equal(SNAP_PX, 4)
  assert.deepEqual(snapAxis(168, 190, { lines: LINES }), { shift: -4, guide: 164 })
  assert.equal(snapAxis(168.5, 190, { lines: LINES }), null)
})

test('snapAxis does not snap a note wholly outside the board\'s span on that axis', () => {
  assert.equal(snapAxis(10, 99, { lines: LINES }), null)
  assert.equal(snapAxis(677, 700, { lines: LINES }), null)
})

test('snapAxis still snaps a note that overlaps the span by an edge, so a note beside the board lines up with the rows', () => {
  assert.deepEqual(snapAxis(50, 101, { lines: LINES }), { shift: -1, guide: 100 })
})

test('snapAxis picks the nearest target in reach', () => {
  // near edge 2 px and far edge 1 px from a line, middle 0.5 px from a middle: the middle wins
  assert.deepEqual(snapAxis(102, 163, { lines: LINES }), { shift: -0.5, guide: 132 })
  // near edge 3 px from line 164, middle on the middle 196: the middle wins
  assert.deepEqual(snapAxis(167, 225, { lines: LINES }), { shift: 0, guide: 196 })
  // near edge 2 px from line 164, middle 3 px from middle 196: the edge wins
  assert.deepEqual(snapAxis(166, 232, { lines: LINES }), { shift: -2, guide: 164 })
})

// Other notes are targets on the axis: their near edge, far edge and middle, each met by the same part of the dragged note, the guide where the outline (reach 3) lies.
const NOTE = { lo: 300, hi: 340 }
const NO_GRID = [0, 1]
test('snapAxis lines a note\'s near edge up with another note\'s near edge, guiding where the outline lies', () => {
  assert.deepEqual(snapAxis(303, 350, { lines: NO_GRID, others: [NOTE], reach: 3 }), { shift: -3, guide: 297 })
})

test('snapAxis lines a note\'s far edge up with another note\'s far edge, guiding where the outline lies', () => {
  assert.deepEqual(snapAxis(270, 337, { lines: NO_GRID, others: [NOTE], reach: 3 }), { shift: 3, guide: 343 })
})

test('snapAxis lines a note\'s middle up with another note\'s middle', () => {
  assert.deepEqual(snapAxis(290, 354, { lines: NO_GRID, others: [NOTE], reach: 3 }), { shift: -2, guide: 320 })
})

test('snapAxis does not line a note\'s edge up with the far side of another note', () => {
  assert.equal(snapAxis(341, 380, { lines: NO_GRID, others: [NOTE], reach: 3 }), null)
  assert.equal(snapAxis(250, 299, { lines: NO_GRID, others: [NOTE], reach: 3 }), null)
})

test('snapAxis lets the nearer of a cell target and a note target win', () => {
  // outline near edge (box 166 - 3 = 163) is 1 px from line 164; the box edge is 4 px from the note edge 170
  assert.deepEqual(snapAxis(166, 200, { lines: LINES, others: [{ lo: 170, hi: 400 }], reach: 3 }), { shift: 1, guide: 164 })
  // the note edge is on the box edge, the cell line 1 px from the outline
  assert.deepEqual(snapAxis(166, 200, { lines: LINES, others: [{ lo: 166, hi: 400 }], reach: 3 }), { shift: 0, guide: 163 })
  // near edge exactly 0 px from a note edge and 2 px from a cell line
  assert.deepEqual(snapAxis(165, 200, { lines: LINES, others: [{ lo: 165, hi: 400 }], reach: 3 }), { shift: 0, guide: 162 })
})

test('snapAxis snaps to a note beside the board even where the grid has no target', () => {
  assert.deepEqual(snapAxis(800, 830, { lines: LINES, others: [{ lo: 802, hi: 900 }] }), { shift: 2, guide: 802 })
})

test('snapAxis snaps a note whose edge lies exactly on the grid\'s outer line, and not one just short of it', () => {
  assert.deepEqual(snapAxis(10, 100, { lines: LINES }), { shift: 0, guide: 100 })
  assert.equal(snapAxis(10, 99.9, { lines: LINES }), null)
})

test('snapAxis takes the grid\'s span from the outline, which lies reach past the box', () => {
  assert.deepEqual(snapAxis(10, 97, { lines: LINES, reach: 3 }), { shift: 0, guide: 100 })
  assert.equal(snapAxis(10, 96.9, { lines: LINES, reach: 3 }), null)
})

test('a box grown by a margin reaches that far on every side and no further', () => {
  assert.deepEqual(grownBox({ left: 10, right: 30, top: 20, bottom: 40 }, 4), { left: 6, right: 34, top: 16, bottom: 44 })
})

test('the note a point hits is the topmost whose box, grown by the margin, holds it; a point past the margin hits none', () => {
  const boxes = [{ left: 0, right: 100, top: 0, bottom: 20 }, { left: 50, right: 150, top: 0, bottom: 20 }]
  assert.equal(noteAtPoint(boxes, [75, 10], 0), 1, 'where two overlap, the later one is on top')
  assert.equal(noteAtPoint(boxes, [153.9, 10], HIT_MARGIN_PX), 1, 'just inside the margin')
  assert.equal(noteAtPoint(boxes, [154.1, 10], HIT_MARGIN_PX), -1, 'just past the margin')
  assert.equal(noteAtPoint(boxes, [153.9, 10], 0), -1, 'a margin of none is the box itself')
  assert.equal(noteAtPoint(boxes, [-3.9, 24.1], HIT_MARGIN_PX), -1, 'a corner past the margin on one side')
  assert.equal(noteAtPoint(boxes, [-3.9, 23.9], HIT_MARGIN_PX), 0, 'a corner within the margin on both sides')
})

test('pointerSpeed is the distance the pointer covered over the last SPEED_WINDOW_MS in px per ms, counting the time it has stood still', () => {
  assert.equal(pointerSpeed([[0, 0, 900], [30, 40, 950]], 950), 1, '50 px in 50 ms')
  assert.equal(pointerSpeed([[0, 0, 900], [30, 40, 950]], 1000), 0.5, 'the same move 50 ms ago is slower now')
  assert.equal(pointerSpeed([[0, 0, 800], [30, 40, 950]], 950), 0, 'a sample older than the window is not counted, so the pointer has stopped')
})

test('a pointer that has not moved for a window, or has one sample, is not moving', () => {
  assert.equal(pointerSpeed([], 1000), 0)
  assert.equal(pointerSpeed([[5, 5, 1000]], 1000), 0)
  assert.equal(pointerSpeed([[0, 0, 100], [500, 500, 150]], 150 + SPEED_WINDOW_MS + 1), 0, 'both samples are older than the window')
})

test('a drag places a note, so snaps, only below SNAP_MAX_SPEED', () => {
  assert.equal(SNAP_MAX_SPEED, 0.5)
  assert.equal(isPlacing([[0, 0, 900], [24, 0, 950]], 950), true, '0.48 px/ms')
  assert.equal(isPlacing([[0, 0, 900], [25, 0, 950]], 950), false, '0.5 px/ms is the limit and passes freely')
  assert.equal(isPlacing([[0, 0, 900], [80, 0, 950]], 950), false, 'a fast throw')
  assert.equal(isPlacing([], 950), true, 'a press that has not moved')
})

test('a locked move keeps the axis of greater movement and zeroes the other; a tie keeps x', () => {
  assert.deepEqual(axisLocked([30, -12], true), [30, 0])
  assert.deepEqual(axisLocked([5, -12], true), [0, -12])
  assert.deepEqual(axisLocked([-7, 7], true), [-7, 0])
  assert.deepEqual(axisLocked([5, -12], false), [5, -12], 'unlocked moves freely')
})

test('lockedAxis is the axis of lesser movement, and y on a tie, so x keeps moving', () => {
  assert.equal(lockedAxis([30, -12]), 1)
  assert.equal(lockedAxis([5, -12]), 0)
  assert.equal(lockedAxis([7, 7]), 1)
  assert.equal(lockedAxis([0, 0]), 1)
})

const WIN = { left: 0, top: 0, right: 1000, bottom: 800 }

test('viewShift moves a box in from the window edge so it stays WINDOW_PAD_PX inside, and leaves one already inside alone', () => {
  assert.equal(WINDOW_PAD_PX, 20)
  assert.deepEqual(viewShift({ left: 400, top: 300, right: 500, bottom: 330 }, WIN), [0, 0])
  assert.deepEqual(viewShift({ left: 900, top: 300, right: 1010, bottom: 330 }, WIN), [-30, 0], 'past the right edge: right ends at 980')
  assert.deepEqual(viewShift({ left: -10, top: 790, right: 40, bottom: 805 }, WIN), [30, -25], 'left ends at 20 and bottom at 780')
  assert.deepEqual(viewShift({ left: 981, top: 300, right: 990, bottom: 330 }, WIN), [-10, 0], 'inside the window but within the pad of the edge')
})

test('viewShift puts a box too big for the window at the middle', () => {
  const [dx] = viewShift({ left: -50, top: 300, right: 1100, bottom: 330 }, WIN)
  assert.equal((-50 + 1100) / 2 + dx, 500, 'centred on the window')
})

test('the font setting is Proportional by default, Fixed width when saved so, and anything else reads as Proportional', () => {
  assert.equal(DEFAULT_FONT, 'proportional')
  assert.deepEqual(FONTS, { proportional: 'Proportional', fixed: 'Fixed width' })
  assert.deepEqual(['proportional', 'fixed'].map(readFont), ['proportional', 'fixed'])
  for (const bad of [undefined, null, 5, true, {}, 'Fixed', 'monospace', 'toString', '__proto__']) assert.equal(readFont(bad), 'proportional', String(bad))
})

test('Proportional leaves the page\'s font to the notes and Fixed width is a monospace stack', () => {
  assert.equal(noteFontFamily('proportional', 'Roboto, sans-serif'), 'Roboto, sans-serif')
  assert.equal(noteFontFamily('fixed', 'Roboto, sans-serif'), FIXED_FONT_STACK)
  assert.match(FIXED_FONT_STACK, /^ui-monospace, .*monospace$/)
})

test('Paste settings returns the font, and an invalid one reads as Proportional without counting as skipped', () => {
  assert.deepEqual(readPaste(JSON.stringify({ [FONT_KEY]: 'fixed' })), { values: { [FONT_KEY]: 'fixed' }, skipped: 0 })
  assert.deepEqual(readPaste(JSON.stringify({ [FONT_KEY]: 'comic' })), { values: { [FONT_KEY]: 'proportional' }, skipped: 0 })
})

test('the font pulldown lists Proportional then Fixed width and selects the one in force', () => {
  const options = (font) => [...renderFontChoice(font).matchAll(/<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g)].map(([, value, selected, label]) => [value, label, Boolean(selected)])
  assert.deepEqual(options('proportional'), [['proportional', 'Proportional', true], ['fixed', 'Fixed width', false]])
  assert.deepEqual(options('fixed'), [['proportional', 'Proportional', false], ['fixed', 'Fixed width', true]])
  assert.match(renderFontChoice('fixed'), /data-role="font-choice"/)
})

test('lookTarget: the open note, else the selected notes, else the next note', () => {
  assert.equal(lookTarget({ item: red20 }, []), 'open')
  assert.equal(lookTarget({ item: red20 }, [0, 1]), 'open', 'an open note wins over a selection')
  assert.equal(lookTarget(null, [2]), 'selected')
  assert.equal(lookTarget(null, []), 'next')
})

test('indexAfterKeep: deleting a note before the open one moves the open index down, a later one leaves it, and the open note itself going leaves -1', () => {
  const keep = [true, false, true, true]
  assert.equal(indexAfterKeep(0, keep), 0)
  assert.equal(indexAfterKeep(2, keep), 1, 'the open note follows the deletion before it')
  assert.equal(indexAfterKeep(3, keep), 2)
  assert.equal(indexAfterKeep(1, keep), -1, 'a deleted note has no index')
  assert.equal(indexAfterKeep(-1, keep), -1, 'a note not saved yet stays unsaved')
  assert.equal(indexAfterKeep(5, keep), -1, 'an index past the notes has none')
})

test('noteChanged: text, color, size, opacity, background and box each count; an untouched note does not', () => {
  const saved = { ...textItem([0, 0], 'a', 1, 20), box: [10, 4] }
  assert.equal(noteChanged({ ...saved }, 'a', saved), false)
  assert.equal(noteChanged({ ...saved }, 'b', saved), true, 'text')
  assert.equal(noteChanged({ ...saved, color: 2 }, 'a', saved), true, 'color')
  assert.equal(noteChanged({ ...saved, size: 24 }, 'a', saved), true, 'size')
  assert.equal(noteChanged({ ...saved, opacity: 50 }, 'a', saved), true, 'opacity')
  assert.equal(noteChanged({ ...saved, bg: true }, 'a', saved), true, 'background')
  assert.equal(noteChanged({ ...saved, box: [12, 4] }, 'a', saved), true, 'box')
  assert.equal(noteChanged({ ...saved, opacity: undefined }, 'a', saved), false, 'a missing opacity reads as the default')
  assert.equal(noteChanged({ ...saved, bg: false }, 'a', saved), false, 'no background either way')
})

test('noteChanged: a new note changes with any text, and not with none', () => {
  const fresh = textItem([0, 0], '', 1, 20)
  assert.equal(noteChanged(fresh, 'x', null), true)
  assert.equal(noteChanged(fresh, '', null), false)
  assert.equal(noteChanged({ ...fresh, color: 5 }, '', null), false, 'an empty new note is not saved however it looks')
})

// The store's side of a Restart and its Undo, with the script's two calls made here. The script's own restartNotes and Undo are covered live, in
// text-anywhere-saved.live.mjs's 'Undo straight after Restart brings the notes back, and they are saved'.
test('the store over load, edit, Restart and Undo: what Restart keeps reads back as the edited notes', () => {
  const store = fakeStore({ [NOTES_PREFIX + 'p1']: [line, sum], [INDEX_KEY]: ['p1'] })
  const loaded = loadNotes(store, 'p1').items
  assert.deepEqual(loaded, [line, sum])
  const edited = [loaded[0], { ...loaded[1], text: '16' }]
  saveNotesTo(store, 'p1', edited)
  // Restart: the notes are kept, then the saved notes are cleared.
  keepRestartedTo(store, 'p1', edited)
  saveNotesTo(store, 'p1', [])
  assert.equal(store.getData(NOTES_PREFIX + 'p1'), null, 'Restart cleared the saved notes')
  assert.deepEqual(loadNotes(store, 'p1').items, [], 'a reload after Restart draws nothing')
  assert.deepEqual(readItems(store.getData(RESTARTED_PREFIX + 'p1')), edited, 'Undo reads the edited notes back')
  assert.deepEqual(store.getData(INDEX_KEY), ['p1'], 'the puzzle stays indexed while its kept notes wait')
})

// The names "draw tool" and "drawing" stay only where a rename would lose data or installs: the old stored keys a start copies from, the install address and
// the script id that keys its notice dismissal, the old site page that redirects, and docs/research's notes, which record history.
const RETIRED_NAME = /draw.?tool|drawing/i
const KEPT_NAMES = [
  /DrawTool_\w*/g,
  /draw-tool\.user\.js/g,
  /draw-tool\.html/g,
  /\bdraw-tool\b(?![-./])/g,
  // SudokuPad's own markup tool flag.
  /isDrawingMode/g,
  // The glossary says what the script was called, so a reader of the old DrawTool_ keys finds why they say DrawTool.
  /Called Draw Tool before 0\.17\.0/g
]
const BINARY = /\.(png|jpe?g|gif|webp|ico|har)$/
const isResearchNote = (file) => file.startsWith('docs/research/') && !/\.m?js$/.test(file)

test('nothing but the old stored keys, the install address and docs/research\'s notes still says draw tool or drawing', () => {
  const root = path.join(__dirname, '..')
  const self = path.relative(root, __filename)
  const files = require('node:child_process').execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')
    .filter((file) => file && file !== self && file !== 'package-lock.json' && !BINARY.test(file) && !isResearchNote(file) && fs.existsSync(path.join(root, file)))
  const found = files.flatMap((file) => fs.readFileSync(path.join(root, file), 'utf8').split('\n')
    .map((line, i) => [`${file}:${i + 1}`, KEPT_NAMES.reduce((rest, kept) => rest.replace(kept, ''), line)])
    .filter(([, rest]) => RETIRED_NAME.test(rest))
    .map(([where]) => where))
  assert.deepEqual(found, [])
})
