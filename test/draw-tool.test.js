'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { quietly } = require('./fake-store.js')
const { failEachListener } = require('./specs/broken-sudokupad.js')
const { snapAxis, SNAP_PX, nudgeStep, NUDGE_PX, NUDGE_SHIFT_PX, NUDGE_REPEAT_MS, NUDGE_RAMP_MS, NUDGE_MAX_PX, NUDGE_SHIFT_MAX_PX, VERSION, lackingInternals, FEATURES, TOOL_NAME, toolNamesFor, readDrawing, loadDrawing, touchIndex, readIndex, saveDrawingTo, keepRestartedTo, DRAWING_PREFIX, RESTARTED_PREFIX, INDEX_KEY, DEFAULT_COLOR, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH, DEFAULT_OPACITY, drawColor, readColor, readWidth, readBackground, textSizeFor, itemOpacity, ERASE_TOLERANCE, textItem, textBox, noteBox, parseMarkdown, closedSymbols, closedText, isSmallRectangle, RECTANGLE_CLICK_PX, symbolJustTyped, toggledCheck, notesTouched, panelLooks, touchesText, placedItem, boardView, screenPoint, SHOWN_AT, resizedItem, autoSized, CORNERS, reachablePoint, noteScreenBox, DRAWN_SIZE, isClick, CLICK_SLOP, SUDOKUPAD_PEN_COLORS, hexColor, readDrawColors, copiedPenColors, editedColor, colorsCss, presetOptions, presetColors, copiedSettings, pastedSettings, READERS, PRESET_LABELS, COLORS_KEY, WIDTH_KEY, OPACITY_KEY, OUTLINE_KEY, MIN_OPACITY, MAX_OPACITY, readOpacity, OUTLINES, DEFAULT_OUTLINE, OUTLINE_LABELS, readOutline, haloShadow, OUTLINE_EM, BOX_KEY, FRAME_KEY, BOX_PRESETS, DEFAULT_BOX, readBox, boxChoice, boxFill, readFrame, frameShadow, renderSamplePicks, FRAME_COLOR, BOX_YELLOW } = require('../draw-tool.user.js')
const readPaste = (text) => pastedSettings(text, READERS)

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

test('a puzzle with no saved drawing starts empty', () => {
  assert.deepEqual(readDrawing(null), { items: [], kept: [] })
})

// Framework's saved-data calls over a plain object, as test/specs/spec-204-closing.test.js has them.
const storeOf = (saved) => ({
  getData: (key) => (key in saved ? saved[key] : null),
  setData: (key, value) => { saved[key] = value },
  removeData: (key) => { delete saved[key] }
})
const line = textItem([0, 0], 'a', 1, 20)
const puzzles = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

// A cage sum "15" at size 20, centred on (100, 50) in board units.
const sum = textItem([100, 50], '15', 3, 20)
// The notes a saved list reads as; the entries it keeps are `readDrawing(saved).kept`.
const readItems = (saved) => readDrawing(saved).items
// What an earlier version saved: neither is drawn, and both stay in storage.
const oldStroke = { kind: 'stroke', color: 1, width: 6, opacity: 100, points: [[0, 50], [200, 50]] }
const oldShape = { kind: 'shape', shape: 'rect', color: 2, width: 6, opacity: 100, box: [0, 0, 100, 100] }

test('saving a drawing for a 51st puzzle drops the oldest puzzle and keeps the other 50', () => {
  const { index, dropped } = touchIndex(puzzles(50), 'p51')
  assert.deepEqual(dropped, ['p1'])
  assert.deepEqual(index, puzzles(51).slice(1))
})

test('saving a drawing for a 51st puzzle keeps the drawings of the 50 newest and removes the oldest one', () => {
  const saved = { [INDEX_KEY]: puzzles(50) }
  for (const key of puzzles(50)) saved[DRAWING_PREFIX + key] = [line]
  saveDrawingTo(storeOf(saved), 'p51', [line])
  assert.deepEqual(saved[INDEX_KEY], puzzles(51).slice(1))
  assert.deepEqual(Object.keys(saved).filter((k) => k !== INDEX_KEY).sort(), puzzles(51).slice(1).map((key) => DRAWING_PREFIX + key).sort())
})

test('a save whose write throws loses no saved drawing and leaves the index as it was', () => {
  const saved = { [INDEX_KEY]: puzzles(50) }
  for (const key of puzzles(50)) saved[DRAWING_PREFIX + key] = [line]
  const before = structuredClone(saved)
  const full = { ...storeOf(saved), setData: () => { throw new Error('QuotaExceededError') } }
  assert.throws(() => saveDrawingTo(full, 'p51', [line]), /QuotaExceededError/)
  assert.deepEqual(saved, before)
})

test('an index that cannot be read refuses the save, and nothing is written', () => {
  const saved = { [INDEX_KEY]: 'oops', [DRAWING_PREFIX + 'p1']: [line] }
  assert.throws(() => saveDrawingTo(storeOf(saved), 'p1', []), /saved index/)
  assert.throws(() => saveDrawingTo(storeOf(saved), 'p2', [line]), /saved index/)
  assert.deepEqual(saved, { [INDEX_KEY]: 'oops', [DRAWING_PREFIX + 'p1']: [line] })
})

test('saving an empty drawing removes the puzzle\'s drawing and takes it out of the index', () => {
  const saved = { [INDEX_KEY]: ['p1', 'p2'], [DRAWING_PREFIX + 'p1']: [line], [DRAWING_PREFIX + 'p2']: [line] }
  saveDrawingTo(storeOf(saved), 'p1', [])
  assert.deepEqual(saved, { [INDEX_KEY]: ['p2'], [DRAWING_PREFIX + 'p2']: [line] })
})

test('keeping a Restart\'s notes for a 51st puzzle removes the oldest puzzle\'s drawing and kept notes', () => {
  const saved = { [INDEX_KEY]: puzzles(50) }
  for (const key of puzzles(50)) {
    saved[DRAWING_PREFIX + key] = [line]
    saved[RESTARTED_PREFIX + key] = [line]
  }
  keepRestartedTo(storeOf(saved), 'p51', [sum])
  assert.deepEqual(saved[INDEX_KEY], puzzles(51).slice(1))
  assert.equal(saved[DRAWING_PREFIX + 'p1'], undefined)
  assert.equal(saved[RESTARTED_PREFIX + 'p1'], undefined)
  assert.deepEqual(saved[RESTARTED_PREFIX + 'p51'], [sum])
  assert.deepEqual(saved[RESTARTED_PREFIX + 'p2'], [line])
})

test('a drawing for a 51st puzzle removes the oldest puzzle\'s kept notes with its drawing', () => {
  const saved = { [INDEX_KEY]: puzzles(50), [DRAWING_PREFIX + 'p1']: [line], [RESTARTED_PREFIX + 'p1']: [line] }
  saveDrawingTo(storeOf(saved), 'p51', [line])
  assert.equal(saved[DRAWING_PREFIX + 'p1'], undefined)
  assert.equal(saved[RESTARTED_PREFIX + 'p1'], undefined)
})

test('Restart\'s empty drawing keeps the puzzle in the index while its kept notes are saved, so they drop out with it', () => {
  const saved = { [INDEX_KEY]: ['p1', 'p2'], [DRAWING_PREFIX + 'p1']: [sum] }
  keepRestartedTo(storeOf(saved), 'p1', [sum])
  saveDrawingTo(storeOf(saved), 'p1', [])
  assert.deepEqual(saved, { [INDEX_KEY]: ['p2', 'p1'], [RESTARTED_PREFIX + 'p1']: [sum] })
})

test('a Restart that clears no notes drops the notes an earlier Restart kept', () => {
  const saved = { [INDEX_KEY]: ['p1'], [RESTARTED_PREFIX + 'p1']: [sum] }
  keepRestartedTo(storeOf(saved), 'p1', [])
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
test('drawColor reads 1 to 9, as text or a number, and nothing else', () => {
  for (let n = 1; n <= 9; n++) {
    assert.equal(drawColor(String(n)), n)
    assert.equal(drawColor(n), n)
  }
  for (const value of ['0', 0, 10, '10', 'a', '1.5', 1.5, '', null, undefined, {}, [3]]) assert.equal(drawColor(value), undefined, JSON.stringify(value))
})

test('a saved color reads back, and a missing or bad one reads as draw color 1', () => {
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

test('nothing saved reads as no draw colors, so the pen colors are copied', () => {
  for (const saved of [null, undefined]) assert.equal(readDrawColors(saved), null, String(saved))
})

test('a saved value with no usable color still reads as saved, so the copy never writes over it, and shows SudokuPad\'s own colors', () => {
  for (const saved of ['red', [], ['#000000'], {}, { 1: 'red', 2: 5 }]) assert.deepEqual(readDrawColors(saved), SUDOKUPAD_PEN_COLORS, JSON.stringify(saved))
})

test('saved draw colors read back as the nine #rrggbb colors, a bad entry beside a usable one reading as SudokuPad\'s own pen color', () => {
  const nine = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, `#00000${n}`]))
  assert.deepEqual(readDrawColors(JSON.parse(JSON.stringify(nine))), nine)
  const partial = readDrawColors({ 1: '#ABCDEF', 2: 'pink' })
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
  assert.deepEqual(readDrawColors(JSON.parse(JSON.stringify(copied))), copied, 'the copy saved reads back as it is')
})

test('editing a draw color changes that color only, and refuses a color number or a color it cannot take', () => {
  const colors = { ...SUDOKUPAD_PEN_COLORS }
  const edited = editedColor(colors, 4, '#ABCDEF')
  assert.deepEqual(edited, { ...colors, 4: '#abcdef' })
  assert.equal(colors[4], SUDOKUPAD_PEN_COLORS[4], 'the colors given are left as they were')
  assert.throws(() => editedColor(colors, 10, '#000000'), RangeError)
  assert.throws(() => editedColor(colors, 4, 'red'), RangeError)
})

test('the colors\' CSS sets one variable per draw color', () => {
  const css = colorsCss({ ...SUDOKUPAD_PEN_COLORS, 3: '#123456' })
  assert.match(css, /--draw-tool-color-3: #123456;/)
  for (let n = 1; n <= 9; n++) assert.match(css, new RegExp(`--draw-tool-color-${n}: #[0-9a-f]{6};`))
})

test('a saved width reads back for any slider value, and a missing or bad one reads as the default width', () => {
  for (const width of [1, 3, 6, 6.5, 10, 15.5, 16]) assert.equal(readWidth(width), width)
  for (const saved of [null, undefined, 0, 0.5, 16.5, 17, 6.25, '6', 'wide', {}, NaN]) assert.equal(readWidth(saved), DEFAULT_WIDTH, JSON.stringify(saved))
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

const hexes = (value) => Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, value]))
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

test('Copy settings holds the colors, size, transparency, outline, box color and frame, defaults included, and no notes, color pick or background', () => {
  const copied = JSON.parse(copiedSettings(storeOf({ [COLORS_KEY]: hexes('#112233'), [WIDTH_KEY]: 3.5, [OPACITY_KEY]: 55, [OUTLINE_KEY]: 'thin', [BOX_KEY]: 'tint', [FRAME_KEY]: true, DrawTool_color: 4, DrawTool_drawing_x: [] })))
  assert.deepEqual(copied, { [COLORS_KEY]: hexes('#112233'), [WIDTH_KEY]: 3.5, [OPACITY_KEY]: 55, [OUTLINE_KEY]: 'thin', [BOX_KEY]: 'tint', [FRAME_KEY]: true })
})

test('Copy settings leaves the colors out until they are saved', () => {
  assert.deepEqual(JSON.parse(copiedSettings(storeOf({}))), { [WIDTH_KEY]: DEFAULT_WIDTH, [OPACITY_KEY]: DEFAULT_OPACITY, [OUTLINE_KEY]: 'medium', [BOX_KEY]: 'page', [FRAME_KEY]: false })
})

test('the box color setting reads a preset or a #rrggbb color and anything else as Page', () => {
  assert.equal(DEFAULT_BOX, 'page')
  for (const preset of ['page', 'white', 'yellow', 'tint']) assert.equal(readBox(preset), preset)
  assert.equal(readBox('#A1b2C3'), '#a1b2c3')
  for (const bad of [undefined, null, 5, true, {}, 'red', '#abc', '#12345g', 'custom', 'Tint']) assert.equal(readBox(bad), 'page', String(bad))
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
  assert.equal(frameShadow(true), `0 0 0 var(--draw-tool-px, 1px) ${FRAME_COLOR}`)
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

test('a drawing of texts saved as JSON reads back equal, item for item, with or without a background', () => {
  const drawing = [sum, textItem([5, 5], 'a b', 9, 24, true)]
  assert.deepEqual(readItems(JSON.parse(JSON.stringify(drawing))), drawing)
})

test('a drawing with strokes and shapes saved by an earlier version reads back whole, so a save writes them back untouched', () => {
  const drawing = [oldStroke, sum, oldShape]
  assert.deepEqual(readItems(JSON.parse(JSON.stringify(drawing))), drawing)
  const saved = {}
  saveDrawingTo(storeOf(saved), 'p1', readItems(drawing).concat(textItem([1, 1], 'x', 1, 20)))
  assert.deepEqual(saved[DRAWING_PREFIX + 'p1'].data.slice(0, 3), drawing)
})

test('a note saved before opacity existed reads back as it was, and a saved opacity is kept', () => {
  const old = [{ kind: 'text', color: 3, size: 14, text: '9', at: [1, 1] }, { kind: 'text', color: 3, size: 28, text: '9', at: [1, 1], opacity: 65 }]
  assert.deepEqual(readItems(JSON.parse(JSON.stringify(old))), old)
  assert.equal(itemOpacity(old[0]), DEFAULT_OPACITY)
  assert.equal(itemOpacity(old[1]), 65)
})

// Framework.getData hands back the raw text when it is not JSON.
test('saved data that is not a list throws, and is never read as an empty drawing', () => {
  for (const saved of ['[{"kind":"text"', {}, 'text', 3, true]) assert.throws(() => readDrawing(saved), /saved drawing/, JSON.stringify(saved))
})

test('a list with one bad note returns the good notes and keeps the bad one, whatever is wrong with it', () => {
  for (const bad of [{ kind: 'blob' }, { ...sum, text: '' }, { ...sum, text: 15 }, { ...sum, at: [1] }, { ...sum, size: 'big' }, { ...sum, size: 20.5 }, { ...sum, size: 0 }, { ...sum, opacity: 0 }, { ...sum, opacity: 101 }, { ...sum, color: null }, { ...sum, color: 42 }, { ...sum, bg: 'yes' }, { ...sum, bg: false }, null, 7, 'x', [], { ...oldStroke, kind: 'line' }]) {
    const good = textItem([5, 5], 'ok', 2, 20)
    assert.deepEqual(readDrawing([sum, bad, good]), { items: [sum, good], kept: [bad] }, JSON.stringify(bad))
  }
})

test('a note at a size or opacity outside today\'s sliders still reads', () => {
  const old = [{ ...sum, size: 9 }, { ...sum, size: 41 }, { ...sum, size: 200 }, { ...sum, opacity: 10 }, { ...sum, opacity: 52 }, { ...sum, opacity: 100 }]
  assert.deepEqual(readDrawing(JSON.parse(JSON.stringify(old))), { items: old, kept: [] })
})

test('a save writes the kept entries back after the notes, versioned, and keeps them when no note is left', () => {
  const bad = { ...sum, text: 15 }
  const saved = {}
  saveDrawingTo(storeOf(saved), 'p1', [sum], [bad])
  assert.deepEqual(saved[DRAWING_PREFIX + 'p1'], { v: 0, data: [sum, bad] })
  saveDrawingTo(storeOf(saved), 'p1', [], [bad])
  assert.deepEqual(saved[DRAWING_PREFIX + 'p1'], { v: 0, data: [bad] })
  assert.deepEqual(saved[INDEX_KEY], ['p1'])
})

test('loadDrawing reads a versioned drawing, an unversioned one and none, and reports a whole value that is not a list', () => {
  const bad = { ...sum, text: 15 }
  const key = DRAWING_PREFIX + 'p1'
  const saved = {}
  saveDrawingTo(storeOf(saved), 'p1', [sum], [bad])
  assert.deepEqual(loadDrawing(storeOf(saved), 'p1'), { items: [sum], kept: [bad], unreadable: undefined })
  assert.deepEqual(loadDrawing(storeOf({ [key]: [sum, bad] }), 'p1'), { items: [sum], kept: [bad], unreadable: undefined })
  assert.deepEqual(loadDrawing(storeOf({}), 'p1'), { items: [], kept: [], unreadable: undefined })
  const { result, warnings } = quietly(() => loadDrawing(storeOf({ [key]: 'not a drawing' }), 'p1'))
  assert.deepEqual([result.items, result.kept], [[], []])
  assert.match(result.unreadable, /saved drawing/)
  assert.equal(warnings.length, 1)
})

test('the Background setting is on only when it was saved as true', () => {
  assert.equal(readBackground(true), true)
  for (const saved of [false, null, undefined, 'true', 1, {}]) assert.equal(readBackground(saved), false, JSON.stringify(saved))
})

test('a text\'s box is centred on its point, as tall as its line and wider with more characters', () => {
  const box = textBox(sum)
  assert.equal((box.left + box.right) / 2, 100)
  assert.equal((box.top + box.bottom) / 2, 50)
  assert.equal(box.bottom - box.top, 23)
  const longer = textBox(textItem([100, 50], '150', 3, 20))
  assert.ok(longer.right - longer.left > box.right - box.left, `'150' is ${longer.right - longer.left} wide, '15' ${box.right - box.left}`)
})

test('a drag across a text touches it, and one that passes clear of it does not', () => {
  const box = textBox(sum)
  assert.equal(touchesText(sum, [100, 0], [100, 100]), true, 'across its middle')
  assert.equal(touchesText(sum, [0, 0], [200, 100]), true, 'on a slant through it')
  assert.equal(touchesText(sum, [100, 50], [100, 50]), true, 'a press on it')
  assert.equal(touchesText(sum, [box.right + ERASE_TOLERANCE - 0.1, 0], [box.right + ERASE_TOLERANCE - 0.1, 100]), true, 'within the tolerance')
  assert.equal(touchesText(sum, [box.right + ERASE_TOLERANCE + 0.1, 0], [box.right + ERASE_TOLERANCE + 0.1, 100]), false, 'just past it')
  assert.equal(touchesText(sum, [0, 0], [200, 0]), false, 'above it')
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
  for (const bad of [{ ...off, at: [1, 1] }, { ...sum, at: undefined }, { ...off, fixed: [1] }]) assert.deepEqual(readDrawing([bad]), { items: [], kept: [bad] }, JSON.stringify(bad))
})

test('a note with a background answers to the box drawn behind it: a selection rectangle and an erase just outside its text land on it', () => {
  const plain = textItem([100, 50], '15', 3, 20)
  const boxed = textItem([100, 50], '15', 3, 20, true)
  const edge = [textBox(boxed).right + 3, 50]
  assert.deepEqual(notesTouched([plain], edge, edge), [])
  assert.deepEqual(notesTouched([boxed], edge, edge), [0])
  const past = textBox(boxed).right + 20 * 0.35 + 0.1
  assert.deepEqual(notesTouched([boxed], [past, 50], [past, 50]), [], 'past the box')
  assert.equal(touchesText(boxed, [past + ERASE_TOLERANCE - 0.2, 0], [past + ERASE_TOLERANCE - 0.2, 100]), true, 'an erase within the tolerance of the box')
  assert.deepEqual(noteBox(plain), textBox(plain))
})

// Three notes near the top left, one far off, and a hidden stroke across them: sum's box is 88 to 112 across and 38.5 to 61.5 down.
const rectDrawing = [sum, textItem([30, 30], 'a', 1, 20), oldStroke, textItem([60, 90], 'b', 2, 20), textItem([400, 400], 'far', 3, 20)]

test('a selection rectangle selects every note it touches, whichever way it was dragged, and never a hidden stroke', () => {
  assert.deepEqual(notesTouched(rectDrawing, [0, 0], [150, 100]), [0, 1, 3])
  assert.deepEqual(notesTouched(rectDrawing, [150, 100], [0, 0]), [0, 1, 3])
  assert.deepEqual(notesTouched(rectDrawing, [0, 100], [150, 0]), [0, 1, 3])
})

test('a selection rectangle that only touches the corner of a note\'s box selects it, and one that stops short does not', () => {
  const { right, bottom } = noteBox(sum)
  assert.deepEqual(notesTouched([sum], [right, bottom], [130, 80]), [0], 'a rectangle whose corner is the box\'s corner')
  assert.deepEqual(notesTouched([sum], [113, 0], [130, 80]), [])
  assert.deepEqual(notesTouched([sum], [90, 62], [100, 80]), [])
})

test('a selection rectangle touches a note\'s background box, which reaches past its text', () => {
  const boxed = textItem([100, 50], '15', 3, 20, true)
  const justPast = [textBox(boxed).right + 3, 50]
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

test('a "- [" line without the box shape, or a plain "- " line, stays a bullet', () => {
  assert.deepEqual(parseMarkdown('- [] x'), [[{ text: '•', bullet: true }, { text: '[] x' }]])
  assert.deepEqual(parseMarkdown('- [ ]x'), [[{ text: '•', bullet: true }, { text: '[ ]x' }]])
  assert.deepEqual(parseMarkdown('- one'), [[{ text: '•', bullet: true }, { text: 'one' }]])
})

test('toggledCheck flips one line\'s box and leaves the other lines alone', () => {
  assert.equal(toggledCheck('a\n- [ ] b\n- [ ] c', 1), 'a\n- [x] b\n- [ ] c')
  assert.equal(toggledCheck('- [x] b', 0), '- [ ] b')
  assert.equal(toggledCheck('- [X] b', 0), '- [ ] b')
  assert.equal(toggledCheck('plain', 0), 'plain')
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

const width = (item) => textBox(item).right - textBox(item).left
const height = (item) => textBox(item).bottom - textBox(item).top

test('a note\'s box is as wide as its longest line shown, markers left out, and one line taller for each line break', () => {
  assert.equal(width(textItem([100, 50], '**15**', 3, 20)), width(sum))
  const two = textItem([100, 50], '15\n150', 3, 20)
  assert.equal(width(two), width(textItem([100, 50], '150', 3, 20)))
  assert.equal(height(two), 46)
  assert.equal((textBox(two).top + textBox(two).bottom) / 2, 50)
})

// A note of text size 20 has a line 1.15 x 20 = 23 board units high, so its automatic box is 16 x 20 = 320 wide and 8 x 23 = 184 high.
test('a line longer than the box wraps: the box stops at 16 em wide and is a line taller for each wrap', () => {
  const long = textItem([100, 50], 'x'.repeat(40), 3, 20)
  assert.equal(width(long), 320)
  assert.equal(height(long), 46)
  assert.equal((textBox(long).left + textBox(long).right) / 2, 100)
})

test('a note of more than 8 lines stops growing at 8 lines high', () => {
  assert.equal(height(textItem([100, 50], Array(8).fill('a').join('\n'), 3, 20)), 184)
  assert.equal(height(textItem([100, 50], Array(12).fill('a').join('\n'), 3, 20)), 184)
})

test('a resized note\'s box is its stored size, whatever its text, centred on its point', () => {
  const resized = { ...textItem([100, 50], 'a', 3, 20), box: [200, 60] }
  assert.deepEqual(textBox(resized), { left: 0, right: 200, top: 20, bottom: 80 })
})

test('a saved size reads back, and a note without one has none', () => {
  const resized = { ...sum, box: [200.5, 60] }
  assert.deepEqual(readItems(JSON.parse(JSON.stringify([resized, sum]))), [resized, sum])
  for (const box of [[1], 'big', [0, 10], [10, -1], [10, 'a'], null]) assert.deepEqual(readDrawing([{ ...sum, box }]).kept, [{ ...sum, box }], JSON.stringify(box))
})

// An auto size, in board units, wider than the minimum box, passed for whatever text the test's note holds.
const AUTO = [132, 23]

// A resize keeps the corner opposite the dragged one still: on the board the stub's scale is 2 screen pixels a board unit.
test('dragging a note\'s bottom right corner sets its box in board units and moves its point so its top left stays put', () => {
  const on = textItem([50, 60], 'hi', 3, 20)
  const resized = resizedItem(on, [200, 170], [600, 290], { ...board, scale: 2 }, CORNERS.bottomRight, AUTO)
  assert.deepEqual(resized, { ...on, box: [200, 60], at: [150, 90] })
})

test('dragging each other corner keeps the opposite corner still and sets the same box', () => {
  const on = textItem([50, 60], 'hi', 3, 20)
  const scaled = { ...board, scale: 2 }
  // The box is 200 x 60 board units, 400 x 120 pixels, with its opposite corner at (600, 290), (200, 290), (600, 170) and (200, 170).
  assert.deepEqual(resizedItem(on, [600, 290], [200, 170], scaled, CORNERS.topLeft, AUTO), { ...on, box: [200, 60], at: [150, 90] })
  assert.deepEqual(resizedItem(on, [200, 290], [600, 170], scaled, CORNERS.topRight, AUTO), { ...on, box: [200, 60], at: [150, 90] })
  assert.deepEqual(resizedItem(on, [600, 170], [200, 290], scaled, CORNERS.bottomLeft, AUTO), { ...on, box: [200, 60], at: [150, 90] })
})

test('dragging a corner past its opposite one still leaves the minimum box on the corner\'s own side', () => {
  const on = textItem([50, 60], 'a longer note', 3, 20)
  // The top left dragged to the right of and below the fixed bottom right: the box is the minimum and ends at the bottom right.
  const resized = resizedItem(on, [600, 290], [900, 500], { ...board, scale: 2 }, CORNERS.topLeft, AUTO)
  assert.deepEqual(resized.box, [60, 23])
  assert.deepEqual(resized.at, [220, 108.5])
})

test('a note off the board keeps its fixed point\'s kind, and its box is in board units too, as its text is', () => {
  const off = placedItem(textItem([50, 60], 'hi', 3, 20), [40, 700], board)
  assert.deepEqual(resizedItem(off, [0, 680], [400, 800], { ...board, scale: 2 }, CORNERS.bottomRight, AUTO), { ...off, box: [200, 60], fixed: [200, 740] })
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
  assert.deepEqual(textBox({ ...long, [DRAWN_SIZE]: [300, 23] }), { left: -50, right: 250, top: 38.5, bottom: 61.5 })
  assert.deepEqual(textBox({ ...long, box: [200, 60], [DRAWN_SIZE]: [300, 23] }), { left: 0, right: 200, top: 20, bottom: 80 })
})

// A 1000x900 window with a panel down its right side from x=800.
const WINDOW = { left: 0, top: 0, right: 1000, bottom: 900 }
const PANEL = { left: 800, top: 100, right: 1000, bottom: 700 }

test('a note whose box is inside the window and clear of the controls stays where it is', () => {
  assert.deepEqual(reachablePoint([500, 400], [100, 40], WINDOW, [PANEL]), [500, 400])
})

test('a note whose box is past the window\'s edge is moved to the nearest point, a pixel in, that holds the whole box inside', () => {
  assert.deepEqual(reachablePoint([1143, 800], [100, 40], WINDOW, []), [949, 800])
  assert.deepEqual(reachablePoint([-20, -5], [100, 40], WINDOW, []), [51, 21])
})

test('a note under a control is moved to the nearest point a pixel clear of it, on the side it is nearest', () => {
  assert.deepEqual(reachablePoint([850, 400], [100, 40], WINDOW, [PANEL]), [749, 400])
  assert.deepEqual(reachablePoint([900, 120], [100, 40], WINDOW, [PANEL]), [900, 79])
})

test('a note too big for the window is centred on it, and a control that leaves no free point leaves the note inside the window', () => {
  assert.deepEqual(reachablePoint([10, 10], [1200, 40], WINDOW, []), [500, 21])
  assert.deepEqual(reachablePoint([1500, 400], [100, 40], WINDOW, [WINDOW]), [949, 400])
})

test('a note under two controls that meet at a corner is moved to the nearest point clear of both', () => {
  const topbar = { left: 0, top: 0, right: 1000, bottom: 50 }
  assert.deepEqual(reachablePoint([900, 60], [100, 40], WINDOW, [topbar, { ...PANEL, top: 50 }]), [749, 71])
})

test('a window with no area leaves a note where it is', () => {
  assert.deepEqual(reachablePoint([900, 60], [100, 40], { left: 0, top: 0, right: 0, bottom: 0 }, [PANEL]), [900, 60])
})

test('a note\'s box on the screen is its text\'s box and its padding at the board\'s scale, round its screen point, on the board or off it', () => {
  // A board drawn at twice its units, from (10, 20) on the screen.
  const map = { scale: 2, toScreen: ([x, y]) => [10 + 2 * x, 20 + 2 * y], toBoard: ([x, y]) => [(x - 10) / 2, (y - 20) / 2] }
  const near = (box) => Object.fromEntries(Object.entries(box).map(([side, v]) => [side, Math.round(v * 1e6) / 1e6]))
  const pinned = { ...textItem([100, 50], 'sum', 1, 20), box: [40, 23] }
  // Without a background the padding is the halo's reach, 0.14 of 20 units.
  assert.deepEqual(near(noteScreenBox(pinned, map, 'medium')), { left: 164.4, right: 255.6, top: 91.4, bottom: 148.6 })
  // With one it is the background's, 7 units across and 3 down.
  assert.deepEqual(near(noteScreenBox({ ...pinned, bg: true }, map, 'medium')), { left: 156, right: 264, top: 91, bottom: 149 })
  const { at, ...rest } = pinned
  assert.deepEqual(near(noteScreenBox({ ...rest, fixed: [300, 400] }, map, 'medium')), { left: 254.4, right: 345.6, top: 371.4, bottom: 428.6 })
})

// A SudokuPad with every internal the features declare, and the helpers that take one away.
const completeRoots = () => {
  const app = { on () {}, getToolNames () {}, puzzle: { on () {} } }
  const Framework = { getApp () {}, getData () {}, setData () {}, removeData () {}, addTool () {}, addSetting () {}, showDialog () {}, closeDialog () {}, app: { svgRenderer: { getElem () {} }, puzzle: { undoStack: [] }, grid: { rows: 9, cols: 9 }, tools: { colour: {} } } }
  return { Framework, app }
}
const withoutPath = (roots, internal) => {
  const [root, ...keys] = internal.split('.')
  const last = keys.pop()
  delete keys.reduce((owner, key) => owner[key], roots[root])[last]
  return roots
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
// The dialog's three sample rows: the buttons of one row, in order, each as { role, value, label, pressed, style }.
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
const LINES = Array.from({ length: 10 }, (_, k) => 100 + k * 64)

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
