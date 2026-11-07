'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { VERSION, TOOL_NAME, toolNamesFor, readDrawing, puzzleKey, touchIndex, readIndex, saveDrawingTo, DRAWING_PREFIX, INDEX_KEY, DEFAULT_COLOR, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH, DEFAULT_OPACITY, drawColor, readColor, readWidth, readBackground, textSizeFor, itemOpacity, ERASE_TOLERANCE, textItem, textBox, noteBox, parseMarkdown, textAt, notesTouched, panelLooks, touchesText, placedItem, boardView, screenPoint, resizedItem, reachablePoint, DRAWN_SIZE, isClick, CLICK_SLOP, SUDOKUPAD_PEN_COLORS, hexColor, readDrawColors, copiedPenColors, editedColor, colorsCss, presetOptions, presetColors, copiedSettings, pastedSettings, READERS, PRESET_LABELS, COLORS_KEY, WIDTH_KEY } = require('../draw-tool.user.js')
const readPaste = (text) => pastedSettings(text, READERS)

// The parts of an Event toolNamesFor reads: eventPhase is 0 once the browser has finished dispatching it.
const keydown = (eventPhase) => ({ type: 'keydown', eventPhase })
const NAMES = ['normal', 'corner', 'centre', 'colour', TOOL_NAME, 'pen']

test('toolNamesFor leaves Text Annotation out while a keydown is being dispatched, so no tool key lands on it', () => {
  assert.deepEqual(toolNamesFor(NAMES, keydown(1)), ['normal', 'corner', 'centre', 'colour', 'pen'])
})

test('toolNamesFor keeps Text Annotation for anything else: a keydown already dispatched, a mouse event, or none', () => {
  assert.deepEqual(toolNamesFor(NAMES, keydown(0)), NAMES)
  assert.deepEqual(toolNamesFor(NAMES, { type: 'mousedown', eventPhase: 3 }), NAMES)
  assert.deepEqual(toolNamesFor(NAMES, undefined), NAMES)
})

test('a puzzle with no saved drawing starts empty', () => {
  assert.deepEqual(readDrawing(null), [])
})

// Framework's saved-data calls over a plain object, as test/specs/spec-204-closing.test.js has them.
const storeOf = (saved) => ({
  getData: (key) => saved[key],
  setData: (key, value) => { saved[key] = value },
  removeData: (key) => { delete saved[key] }
})
const line = textItem([0, 0], 'a', 1, 20)
const puzzles = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

// A cage sum "15" at size 20, centred on (100, 50) in board units.
const sum = textItem([100, 50], '15', 3, 20)
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

test('Copy settings holds the colors and the size, default included, and no notes, color pick or background', () => {
  const copied = JSON.parse(copiedSettings(storeOf({ [COLORS_KEY]: hexes('#112233'), [WIDTH_KEY]: 3, DrawTool_color: 4, DrawTool_drawing_x: [] })))
  assert.deepEqual(copied, { [COLORS_KEY]: hexes('#112233'), [WIDTH_KEY]: 3 })
})

test('Copy settings leaves the colors out until they are saved', () => {
  assert.deepEqual(JSON.parse(copiedSettings(storeOf({}))), { [WIDTH_KEY]: DEFAULT_WIDTH })
})

test('Paste settings returns the colors and size, ignores other scripts\' keys, the old opacity and counts a refused value as skipped', () => {
  const text = JSON.stringify({ [COLORS_KEY]: hexes('#AABBCC'), [WIDTH_KEY]: 2.5, DrawTool_opacity: 35, PenColor_colors: hexes('#000000'), unrelated: 1 })
  assert.deepEqual(readPaste(text), { values: { [COLORS_KEY]: hexes('#aabbcc'), [WIDTH_KEY]: 2.5 }, skipped: 0 })
  const bad = readPaste(JSON.stringify({ [COLORS_KEY]: { ...hexes('#aabbcc'), 4: 'red' }, [WIDTH_KEY]: 99 }))
  assert.deepEqual(bad, { values: {}, skipped: 2 })
  assert.deepEqual(readPaste(JSON.stringify({ [COLORS_KEY]: {} })), { values: {}, skipped: 1 }, 'colors with no color in them')
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
  assert.deepEqual(readDrawing(JSON.parse(JSON.stringify(drawing))), drawing)
})

test('a drawing with strokes and shapes saved by an earlier version reads back whole, so a save writes them back untouched', () => {
  const drawing = [oldStroke, sum, oldShape]
  assert.deepEqual(readDrawing(JSON.parse(JSON.stringify(drawing))), drawing)
  const saved = {}
  saveDrawingTo(storeOf(saved), 'p1', readDrawing(drawing).concat(textItem([1, 1], 'x', 1, 20)))
  assert.deepEqual(saved[DRAWING_PREFIX + 'p1'].slice(0, 3), drawing)
})

test('a note saved before opacity existed reads back as it was, and a saved opacity is kept', () => {
  const old = [{ kind: 'text', color: 3, size: 14, text: '9', at: [1, 1] }, { kind: 'text', color: 3, size: 28, text: '9', at: [1, 1], opacity: 65 }]
  assert.deepEqual(readDrawing(JSON.parse(JSON.stringify(old))), old)
  assert.equal(itemOpacity(old[0]), DEFAULT_OPACITY)
  assert.equal(itemOpacity(old[1]), 65)
})

// Framework.getData hands back the raw text when it is not JSON.
test('saved data that is not a drawing throws, and is never read as an empty drawing', () => {
  for (const saved of ['[{"kind":"text"', {}, 'text', [{ kind: 'blob' }], [{ ...sum, text: '' }], [{ ...sum, text: 15 }], [{ ...sum, at: [1] }], [{ ...sum, size: 'big' }], [{ ...sum, size: 9 }], [{ ...sum, size: 41 }], [{ ...sum, size: 20.5 }], [{ ...sum, opacity: 10 }], [{ ...sum, opacity: 52 }], [{ ...sum, color: null }], [{ ...sum, color: 42 }], [{ ...sum, bg: 'yes' }], [{ ...sum, bg: false }], [null], [{ ...oldStroke, kind: 'line' }]]) {
    assert.throws(() => readDrawing(saved), /saved drawing/, JSON.stringify(saved))
  }
})

test('the key is the puzzle id, or the page URL for a puzzle with none', () => {
  assert.equal(puzzleKey('scl123abc', 'https://sudokupad.app/scl123abc'), 'scl123abc')
  assert.equal(puzzleKey(undefined, 'https://sudokupad.app/?puzzle=x'), 'https://sudokupad.app/?puzzle=x')
  assert.equal(puzzleKey('', 'https://sudokupad.app/'), 'https://sudokupad.app/')
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

test('a click on a text lands on it, and a click beside it, or on a stroke or shape, on none', () => {
  const drawing = [oldStroke, sum, oldShape]
  assert.equal(textAt(drawing, [100, 50]), 1)
  assert.equal(textAt(drawing, [textBox(sum).right - 1, textBox(sum).top + 1]), 1)
  assert.equal(textAt(drawing, [100, 80]), -1)
  assert.equal(textAt(drawing, [textBox(sum).right + 3, 50]), -1)
  assert.equal(textAt(drawing, [10, 50]), -1, 'on the hidden stroke')
  assert.equal(textAt([], [100, 50]), -1)
})

test('a click on two texts that overlap lands on the one drawn last', () => {
  assert.equal(textAt([sum, textItem([104, 52], '7', 1, 20)], [102, 51]), 1)
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

test('a note placed on the board is stored in board units, rounded to a tenth, and keeps the rest of the item', () => {
  const note = textItem([50, 60], 'hi', 3, 20, true)
  assert.deepEqual(placedItem(note, [300.06, 250], board), { ...note, at: [100, 100] })
  assert.deepEqual(placedItem(note, [100, 1250], board).at, [0, 600], 'on the board\'s edge')
  assert.deepEqual(note.at, [50, 60])
})

test('a note placed off the board is stored as a fixed screen point in its own key, with no board point an older version could read', () => {
  const note = textItem([50, 60], 'hi', 3, 20, true)
  const off = placedItem(note, [40.04, 700], board)
  assert.deepEqual(off, { kind: 'text', color: 3, size: 20, opacity: 100, bg: true, text: 'hi', fixed: [40, 700] })
  assert.equal('at' in off, false)
  assert.deepEqual(placedItem(off, [300, 250], board), { ...note, at: [100, 100] }, 'moved back onto the board, it is pinned again')
})

test('the board view of a note gives an off-board note its board point under the screen point, and leaves an on-board note as it is', () => {
  const on = textItem([50, 60], 'hi', 3, 20)
  const off = placedItem(on, [40, 700], board)
  assert.deepEqual(boardView(on, toBoard), on)
  assert.deepEqual(boardView(off, toBoard).at, [-30, 325])
  assert.equal(textAt([on, off].map((item) => boardView(item, toBoard)), toBoard([40, 700])), 1)
})

test('a note\'s screen point is its fixed point off the board, and its board point taken to the screen on it', () => {
  const on = textItem([50, 60], 'hi', 3, 20)
  assert.deepEqual(screenPoint(on, toScreen), [200, 170])
  assert.deepEqual(screenPoint(placedItem(on, [40, 700], board), toScreen), [40, 700])
})

test('saved off-board notes read back, and a note with both a board point and a fixed point, or neither, does not', () => {
  const off = placedItem(sum, [40, 700], board)
  assert.deepEqual(readDrawing(JSON.parse(JSON.stringify([sum, off]))), [sum, off])
  for (const saved of [[{ ...off, at: [1, 1] }], [{ ...sum, at: undefined }], [{ ...off, fixed: [1] }]]) assert.throws(() => readDrawing(saved), /saved drawing/, JSON.stringify(saved))
})

test('a note with a background answers to the box drawn behind it: a click and an erase just outside its text land on it', () => {
  const plain = textItem([100, 50], '15', 3, 20)
  const boxed = textItem([100, 50], '15', 3, 20, true)
  const edge = [textBox(boxed).right + 3, 50]
  assert.equal(textAt([plain], edge), -1)
  assert.equal(textAt([boxed], edge), 0)
  const past = textBox(boxed).right + 20 * 0.35 + 0.1
  assert.equal(textAt([boxed], [past, 50]), -1, 'past the box')
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

test('the panel shows a selection that agrees on everything as its color, size and background', () => {
  assert.deepEqual(panelLooks([red20, { ...red20, text: 'd' }]), { color: 4, width: 6, bg: false })
  assert.deepEqual(panelLooks([blue20Boxed]), { color: 6, width: 6, bg: true })
})

test('a mixed selection shows no color and no background state, and the size of its first note', () => {
  assert.deepEqual(panelLooks([red14Boxed, blue20Boxed]), { color: null, width: 3, bg: true })
  assert.deepEqual(panelLooks([red20, red14Boxed]), { color: 4, width: 6, bg: null })
  assert.deepEqual(panelLooks([red20, blue20Boxed]), { color: null, width: 6, bg: null })
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
  assert.deepEqual(runs('* a*'), [{ text: '* a*' }], 'an opening marker before a space')
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
  assert.deepEqual(readDrawing(JSON.parse(JSON.stringify([resized, sum]))), [resized, sum])
  for (const box of [[1], 'big', [0, 10], [10, -1], [10, 'a'], null]) assert.throws(() => readDrawing([{ ...sum, box }]), /saved drawing/, JSON.stringify(box))
})

// The resize keeps the box's top left still: on the board the stub's scale is 2 screen pixels a board unit.
test('dragging a note\'s corner sets its box in board units and moves its point so its top left stays put', () => {
  const on = textItem([50, 60], 'hi', 3, 20)
  const resized = resizedItem(on, [200, 170], [600, 290], { ...board, scale: 2 })
  assert.deepEqual(resized, { ...on, box: [200, 60], at: [150, 90] })
})

test('a note off the board keeps its fixed point\'s kind, and its box is in board units too, as its text is', () => {
  const off = placedItem(textItem([50, 60], 'hi', 3, 20), [40, 700], board)
  assert.deepEqual(resizedItem(off, [0, 680], [400, 800], { ...board, scale: 2 }), { ...off, box: [200, 60], fixed: [200, 740] })
})

test('a resize stops at about three characters wide and one line high', () => {
  const on = textItem([50, 60], 'hi', 3, 20)
  assert.deepEqual(resizedItem(on, [200, 170], [190, 160], { ...board, scale: 2 }).box, [60, 23])
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
