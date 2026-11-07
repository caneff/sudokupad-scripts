'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { VERSION, TOOL_NAME, hasArea, shapeBox, shapeItem, nextShapeMode, readShapeMode, simplifyPath, strokePath, straightLine, toolNamesFor, strokeItem, readDrawing, puzzleKey, touchIndex, readIndex, saveDrawingTo, DRAWING_PREFIX, INDEX_KEY, DEFAULT_COLOR, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH, DEFAULT_OPACITY, drawColor, readColor, readWidth, readOpacity, textSizeFor, itemOpacity, drawnLine, touchesStroke, ERASE_TOLERANCE, textItem, textBox, textAt, touchesItem, isClick, CLICK_SLOP, SUDOKUPAD_PEN_COLORS, hexColor, readDrawColors, copiedPenColors, editedColor, colorsCss, presetOptions, presetColors, darkerPageColors, copiedSettings, pastedSettings, pasteReport, PRESET_LABELS, COLORS_KEY, WIDTH_KEY, OPACITY_KEY } = require('./draw-tool.user.js')

// A mouse path as the browser reports it: a point every pixel or so along a quarter circle of radius 100.
const denseArc = () => Array.from({ length: 160 }, (_, i) => {
  const a = (Math.PI / 2) * (i / 159)
  return [100 * Math.cos(a), 100 * Math.sin(a)]
})

test('simplifyPath keeps the first and the last point', () => {
  const points = denseArc()
  const simple = simplifyPath(points)
  assert.deepEqual(simple[0], points[0])
  assert.deepEqual(simple[simple.length - 1], points[points.length - 1])
})

test('simplifyPath leaves fewer points than a dense mouse path, and more than its two ends on a curve', () => {
  const simple = simplifyPath(denseArc())
  assert.equal(simple.length < 40, true, `${simple.length} points left of 160`)
  assert.equal(simple.length > 2, true, `${simple.length} points left of 160`)
})

test('simplifyPath leaves a straight run as its two ends', () => {
  const points = Array.from({ length: 50 }, (_, i) => [i * 2, i])
  assert.deepEqual(simplifyPath(points), [[0, 0], [98, 49]])
})

test('simplifyPath leaves a path of one or two points as it is', () => {
  assert.deepEqual(simplifyPath([[3, 4]]), [[3, 4]])
  assert.deepEqual(simplifyPath([[3, 4], [5, 6]]), [[3, 4], [5, 6]])
})

test('strokePath gives a curved path through the points, starting and ending on the ends', () => {
  const d = strokePath([[0, 0], [10, 0], [10, 10], [20, 10]])
  assert.match(d, /^M0 0 /)
  assert.match(d, /Q/, 'the path has curves')
  assert.match(d, / L20 10$/)
})

test('strokePath draws two points as a straight segment and one point as a dot', () => {
  assert.equal(strokePath([[0, 0], [10, 5]]), 'M0 0 L10 5')
  assert.equal(strokePath([[4, 4]]), 'M4 4 L4 4')
})

test('strokePath rounds each number to a tenth of a board unit', () => {
  assert.equal(strokePath([[0.123, 1.06], [10.55, 5.04]]), 'M0.1 1.1 L10.6 5')
})

test('straightLine keeps only the press point and the release point', () => {
  assert.deepEqual(straightLine([[1, 2], [5, 9], [7, 3], [20, 4]]), [[1, 2], [20, 4]])
  assert.deepEqual(straightLine([[1, 2]]), [[1, 2]])
})

// The parts of an Event toolNamesFor reads: eventPhase is 0 once the browser has finished dispatching it.
const keydown = (eventPhase) => ({ type: 'keydown', eventPhase })
const NAMES = ['normal', 'corner', 'centre', 'colour', TOOL_NAME, 'pen']

test('toolNamesFor leaves Draw out while a keydown is being dispatched, so no tool key lands on it', () => {
  assert.deepEqual(toolNamesFor(NAMES, keydown(1)), ['normal', 'corner', 'centre', 'colour', 'pen'])
})

test('toolNamesFor keeps Draw for anything else: a keydown already dispatched, a mouse event, or none', () => {
  assert.deepEqual(toolNamesFor(NAMES, keydown(0)), NAMES)
  assert.deepEqual(toolNamesFor(NAMES, { type: 'mousedown', eventPhase: 3 }), NAMES)
  assert.deepEqual(toolNamesFor(NAMES, undefined), NAMES)
})

test('a drawing saved as JSON reads back equal, stroke for stroke', () => {
  const drawing = [strokeItem([[1, 2], [30.5, 40.25], [64, 128]], 1, 6, 100), strokeItem([[0, 0], [5, 5]], 3, 7.5, 35)]
  assert.deepEqual(readDrawing(JSON.parse(JSON.stringify(drawing))), drawing)
})

test('a stroke item holds its kind, draw color number, width, opacity and its points rounded to a tenth of a board unit', () => {
  assert.deepEqual(strokeItem([[0.123, 1.06], [10.55, 5.04]], 1, 6, 50), { kind: 'stroke', color: 1, width: 6, opacity: 50, points: [[0.1, 1.1], [10.6, 5]] })
})

test('a puzzle with no saved drawing starts empty', () => {
  assert.deepEqual(readDrawing(null), [])
})

// Framework.getData hands back the raw text when it is not JSON.
test('saved data that is not a drawing throws, and is never read as an empty drawing', () => {
  const stroke = { kind: 'stroke', color: 1, width: 6, points: [[0, 0]] }
  assert.deepEqual(readDrawing([stroke]), [stroke])
  for (const saved of ['[{"kind":"stroke"', {}, 'text', [{ ...stroke, points: [] }], [{ kind: 'blob' }], [{ ...stroke, color: 42 }], [{ ...stroke, color: 0 }], [{ ...stroke, width: -1 }], [{ ...stroke, width: 0.5 }], [{ ...stroke, width: 17 }], [{ ...stroke, width: 6.25 }], [{ ...stroke, opacity: 0 }], [{ ...stroke, opacity: 15 }], [{ ...stroke, opacity: 101 }], [{ ...stroke, opacity: 52 }], [{ ...stroke, opacity: '50' }]]) {
    assert.throws(() => readDrawing(saved), /saved drawing/, JSON.stringify(saved))
  }
})

test('the key is the puzzle id, or the page URL for a puzzle with none', () => {
  assert.equal(puzzleKey('scl123abc', 'https://sudokupad.app/scl123abc'), 'scl123abc')
  assert.equal(puzzleKey(undefined, 'https://sudokupad.app/?puzzle=x'), 'https://sudokupad.app/?puzzle=x')
  assert.equal(puzzleKey('', 'https://sudokupad.app/'), 'https://sudokupad.app/')
})

// Framework's saved-data calls over a plain object, as spec-204-closing.test.js has them.
const storeOf = (saved) => ({
  getData: (key) => saved[key],
  setData: (key, value) => { saved[key] = value },
  removeData: (key) => { delete saved[key] }
})
const line = strokeItem([[0, 0], [64, 64]], 1, 6)
const puzzles = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

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

test('the size slider runs 1 to 16 and starts at 6, the opacity slider 20 to 100 and starts at 100, and draw color 1 is the default', () => {
  assert.deepEqual([MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH], [1, 16, 6])
  assert.equal(DEFAULT_OPACITY, 100)
  assert.equal(DEFAULT_COLOR, 1)
})

test('a text is 2 x the width + 8 tall: 10 to 40, and 20 at the default width', () => {
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

test('a saved opacity reads back for any slider value, and a missing or bad one reads as the default opacity', () => {
  for (const opacity of [20, 25, 75, 100]) assert.equal(readOpacity(opacity), opacity)
  for (const saved of [null, undefined, 0, 15, 22, 105, '50', 'faint', {}, NaN]) assert.equal(readOpacity(saved), DEFAULT_OPACITY, JSON.stringify(saved))
})

test('an item with no opacity reads as the default opacity, and one with an opacity as its own', () => {
  assert.equal(itemOpacity({ kind: 'stroke', color: 1, width: 6, points: [[0, 0]] }), DEFAULT_OPACITY)
  assert.equal(itemOpacity(strokeItem([[0, 0]], 1, 6, 40)), 40)
  assert.equal(itemOpacity(textItem([0, 0], '1', 1, 20, 65)), 65)
})

test('an old drawing, with the three old widths and text sizes and no opacity, reads back as it was', () => {
  const old = [
    { kind: 'stroke', color: 1, width: 3, points: [[0, 0], [5, 5]] },
    { kind: 'stroke', color: 2, width: 10, points: [[0, 0], [5, 5]] },
    { kind: 'text', color: 3, size: 14, text: '9', at: [1, 1] },
    { kind: 'text', color: 3, size: 28, text: '9', at: [1, 1] }
  ]
  assert.deepEqual(readDrawing(JSON.parse(JSON.stringify(old))), old)
})

// Board units: a cell is 64 wide. A stroke of width 6 along row 1's middle, from x 0 to x 192.
const flat = strokeItem([[0, 32], [192, 32]], 1, 6)
// How far a drag may pass from the line's middle and still erase it: the tolerance plus half the line's width.
const reach = ERASE_TOLERANCE + 6 / 2

test('a drag across a stroke touches it, wherever it crosses', () => {
  assert.equal(touchesStroke(flat, [96, 0], [96, 64]), true)
  assert.equal(touchesStroke(flat, [10, 64], [180, 0]), true)
})

test('a drag that passes within the tolerance of a stroke touches it, and one just past it does not', () => {
  assert.equal(touchesStroke(flat, [50, 32 + reach - 0.1], [150, 32 + reach - 0.1]), true)
  assert.equal(touchesStroke(flat, [50, 32 + reach + 0.1], [150, 32 + reach + 0.1]), false)
  assert.equal(touchesStroke(flat, [192 + reach + 0.1, 0], [192 + reach + 0.1, 64]), false, 'past the end')
})

test('a thicker stroke is touched from farther away', () => {
  const thick = strokeItem([[0, 32], [192, 32]], 1, 10)
  const y = 32 + reach + 1
  assert.equal(touchesStroke(flat, [50, y], [150, y]), false)
  assert.equal(touchesStroke(thick, [50, y], [150, y]), true)
})

test('a press with no move, a drag of one point, touches a stroke under it', () => {
  assert.equal(touchesStroke(flat, [100, 33], [100, 33]), true)
  assert.equal(touchesStroke(flat, [100, 60], [100, 60]), false)
})

test('a stroke of one point is touched near that point only', () => {
  const dot = strokeItem([[64, 64]], 1, 6)
  assert.equal(touchesStroke(dot, [60, 0], [60, 128]), true)
  assert.equal(touchesStroke(dot, [0, 0], [0, 128]), false)
})

// strokePath cuts each corner with a curve, so a sharp V is drawn well inside its corner point.
const vee = strokeItem([[0, 0], [100, 200], [200, 0]], 1, 6)

test('the drawn line of a curved stroke follows the curve the board shows, not the corner points', () => {
  const line = drawnLine(vee.points)
  assert.deepEqual(line[0], [0, 0])
  assert.deepEqual(line[line.length - 1], [200, 0])
  const lowest = Math.max(...line.map(([, y]) => y))
  assert.equal(lowest, 100, 'the curve from (0, 0) round (100, 200) to (200, 0) reaches y 100 at its middle')
})

test('a drag across the curve, inside the stroke\'s corner point, touches it; one across the bare corner does not', () => {
  assert.equal(touchesStroke(vee, [90, 100], [110, 100]), true, 'across the curve\'s bottom')
  assert.equal(touchesStroke(vee, [90, 180], [110, 180]), false, 'below the curve, near the corner point')
})

test('the drawn line of a two-point stroke is its two points', () => {
  assert.deepEqual(drawnLine([[0, 0], [10, 5]]), [[0, 0], [10, 5]])
  assert.deepEqual(drawnLine([[4, 4]]), [[4, 4]])
})

// A cage sum "15" at size 20, centred on (100, 50) in board units.
const sum = textItem([100, 50], '15', 3, 20, 100)

test('a text item holds its kind, draw color number, text size, opacity, text and its point rounded to a tenth of a board unit', () => {
  assert.deepEqual(textItem([10.04, 20.06], '15', 3, 20, 55), { kind: 'text', color: 3, size: 20, opacity: 55, text: '15', at: [10, 20.1] })
})

test('a drawing of strokes and text saved as JSON reads back equal, item for item', () => {
  const drawing = [strokeItem([[1, 2], [64, 128]], 1, 6, 100), sum, textItem([5, 5], 'a b', 9, 23, 20)]
  assert.deepEqual(readDrawing(JSON.parse(JSON.stringify(drawing))), drawing)
})

test('saved text that is not a text item throws', () => {
  for (const item of [{ ...sum, text: '' }, { ...sum, text: 15 }, { ...sum, at: [1] }, { ...sum, size: 'big' }, { ...sum, size: 1e6 }, { ...sum, size: 9 }, { ...sum, size: 41 }, { ...sum, size: 20.5 }, { ...sum, opacity: 10 }, { ...sum, color: null }, { ...sum, color: 42 }]) {
    assert.throws(() => readDrawing([item]), /saved drawing/, JSON.stringify(item))
  }
})

test('a text\'s box is centred on its point, as tall as its size and wider with more characters', () => {
  const box = textBox(sum)
  assert.equal((box.left + box.right) / 2, 100)
  assert.equal((box.top + box.bottom) / 2, 50)
  assert.equal(box.bottom - box.top, 20)
  const longer = textBox(textItem([100, 50], '150', 3, 20))
  assert.ok(longer.right - longer.left > box.right - box.left, `'150' is ${longer.right - longer.left} wide, '15' ${box.right - box.left}`)
})

test('a click on a text lands on it, and a click beside it on none', () => {
  const drawing = [strokeItem([[0, 50], [200, 50]], 1, 6), sum]
  assert.equal(textAt(drawing, [100, 50]), 1)
  assert.equal(textAt(drawing, [textBox(sum).right - 1, textBox(sum).top + 1]), 1)
  assert.equal(textAt(drawing, [100, 80]), -1)
  assert.equal(textAt(drawing, [textBox(sum).right + 3, 50]), -1)
  assert.equal(textAt([], [100, 50]), -1)
})

test('a click on two texts that overlap lands on the one drawn last', () => {
  assert.equal(textAt([sum, textItem([104, 52], '7', 1, 20)], [102, 51]), 1)
})

test('a drag across a text touches it, and one that passes clear of it does not', () => {
  const box = textBox(sum)
  assert.equal(touchesItem(sum, [100, 0], [100, 100]), true, 'across its middle')
  assert.equal(touchesItem(sum, [0, 0], [200, 100]), true, 'on a slant through it')
  assert.equal(touchesItem(sum, [100, 50], [100, 50]), true, 'a press on it')
  assert.equal(touchesItem(sum, [box.right + ERASE_TOLERANCE - 0.1, 0], [box.right + ERASE_TOLERANCE - 0.1, 100]), true, 'within the tolerance')
  assert.equal(touchesItem(sum, [box.right + ERASE_TOLERANCE + 0.1, 0], [box.right + ERASE_TOLERANCE + 0.1, 100]), false, 'just past it')
  assert.equal(touchesItem(sum, [0, 0], [200, 0]), false, 'above it')
})

test('touchesItem tests a stroke as touchesStroke does', () => {
  assert.equal(touchesItem(flat, [96, 0], [96, 64]), true)
  assert.equal(touchesItem(flat, [96, 50], [96, 64]), false)
})

test('a press and release with the mouse still, or moved no more than the slop, is a click; a drag is not', () => {
  assert.equal(isClick([[10, 10]]), true)
  assert.equal(isClick([[10, 10], [10 + CLICK_SLOP, 10], [10, 10 - CLICK_SLOP]]), true)
  assert.equal(isClick([[10, 10], [10 + CLICK_SLOP + 0.1, 10]]), false)
  assert.equal(isClick([[10, 10], [40, 10], [10, 10]]), false, 'a drag that comes back to its start')
})

test('VERSION matches the @version header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, 'draw-tool.user.js'), 'utf8')))
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
  assert.deepEqual(darkerPageColors(['0', '1'], (key) => PAGE[Number(key)])[2], SUDOKUPAD_PEN_COLORS[2], 'a slot past the page keeps SudokuPad\'s color')
})

test('a Darker page preset the palette lacks, or an unknown one, throws', () => {
  assert.throws(() => presetColors('page-2', [['0']], () => undefined, () => undefined), /not a preset/)
  assert.throws(() => presetColors('nope', [], () => undefined, () => undefined), /not a preset/)
})

test('Copy settings holds the colors and both slider values, defaults included, and no drawing or color pick', () => {
  const copied = JSON.parse(copiedSettings(storeOf({ [COLORS_KEY]: hexes('#112233'), [WIDTH_KEY]: 3, DrawTool_color: 4, DrawTool_drawing_x: [] })))
  assert.deepEqual(copied, { [COLORS_KEY]: hexes('#112233'), [WIDTH_KEY]: 3, [OPACITY_KEY]: DEFAULT_OPACITY })
})

test('Copy settings leaves the colors out until they are saved', () => {
  assert.deepEqual(JSON.parse(copiedSettings(storeOf({}))), { [WIDTH_KEY]: DEFAULT_WIDTH, [OPACITY_KEY]: DEFAULT_OPACITY })
})

test('Paste settings returns the colors and sliders, ignores other scripts\' keys and counts a refused value as skipped', () => {
  const text = JSON.stringify({ [COLORS_KEY]: hexes('#AABBCC'), [WIDTH_KEY]: 2.5, [OPACITY_KEY]: 35, PenColor_colors: hexes('#000000'), unrelated: 1 })
  assert.deepEqual(pastedSettings(text), { values: { [COLORS_KEY]: hexes('#aabbcc'), [WIDTH_KEY]: 2.5, [OPACITY_KEY]: 35 }, skipped: 0 })
  const bad = pastedSettings(JSON.stringify({ [COLORS_KEY]: { ...hexes('#aabbcc'), 4: 'red' }, [WIDTH_KEY]: 99, [OPACITY_KEY]: 50 }))
  assert.deepEqual(bad, { values: { [OPACITY_KEY]: 50 }, skipped: 2 })
  assert.deepEqual(pastedSettings(JSON.stringify({ [COLORS_KEY]: {} })), { values: {}, skipped: 1 }, 'colors with no color in them')
})

test('Paste settings fills a missing color with SudokuPad\'s and refuses text that is not settings', () => {
  const { values } = pastedSettings(JSON.stringify({ [COLORS_KEY]: { 1: '#010203' } }))
  assert.deepEqual(values[COLORS_KEY], { ...SUDOKUPAD_PEN_COLORS, 1: '#010203' })
  assert.throws(() => pastedSettings('hello'), /not JSON/)
  assert.throws(() => pastedSettings('[1]'), /not a settings object/)
})

test('the paste report counts applied and skipped values, and says when the text held none', () => {
  assert.equal(pasteReport(0, 0), 'Nothing to paste: the text holds none of this script\'s settings.')
  assert.equal(pasteReport(1, 0), 'Pasted 1 setting.')
  assert.equal(pasteReport(3, 2), 'Pasted 3 settings; skipped 2 that did not check out.')
})

test('a shape drag snaps each corner to the nearest quarter-cell line, whichever way it runs', () => {
  // Board units: a cell is 64 wide from (0, 0), so a quarter is 16. Near-corner points box whole cells (r2c2 to r3c4).
  assert.deepEqual(shapeBox([66, 62], [250, 195], false), [64, 64, 256, 192])
  assert.deepEqual(shapeBox([250, 195], [66, 62], false), [64, 64, 256, 192])
  // Cell centre to cell centre, and to quarters, give offset boxes.
  assert.deepEqual(shapeBox([96, 96], [224, 160], false), [96, 96, 224, 160])
  assert.deepEqual(shapeBox([75, 70], [117, 150], false), [80, 64, 112, 144])
})

test('a shape drag rounds a corner halfway between two quarter lines up', () => {
  assert.deepEqual(shapeBox([8, 24], [72, 40], false), [16, 32, 80, 48])
})

test('a shape drag within one quarter of a cell snaps to no width, which has no area', () => {
  assert.deepEqual(shapeBox([10, 20], [14, 50], false), [16, 16, 16, 48])
  assert.equal(hasArea(shapeBox([10, 20], [14, 50], false)), false)
})

test('a shape drag with Alt held follows the drag exactly, to a tenth of a board unit', () => {
  assert.deepEqual(shapeBox([250.04, 140], [70.06, 100.12], true), [70.1, 100.1, 250, 140])
})

test('a shape item holds its kind, its shape, draw color number, width, opacity and its box', () => {
  assert.deepEqual(shapeItem('ellipse', [64, 0, 192, 128], 2, 4.5, 60), { kind: 'shape', shape: 'ellipse', color: 2, width: 4.5, opacity: 60, box: [64, 0, 192, 128] })
})

test('a drawing of strokes, texts and shapes saved as JSON reads back equal, item for item', () => {
  const drawing = [strokeItem([[1, 2], [64, 128]], 1, 6, 100), shapeItem('rect', [0, 0, 64, 64], 4, 6, 100), textItem([5, 5], 'a', 9, 20, 20), shapeItem('ellipse', [70.1, 100.1, 250, 140], 9, 16, 20)]
  assert.deepEqual(readDrawing(JSON.parse(JSON.stringify(drawing))), drawing)
})

test('a saved shape that is not a shape item, or has no opacity, throws', () => {
  const box = shapeItem('rect', [0, 0, 64, 64], 1, 6, 100)
  const { opacity, ...noOpacity } = box
  for (const item of [{ ...box, shape: 'star' }, { ...box, shape: undefined }, { ...box, box: [0, 0, 64] }, { ...box, box: [0, 0, 64, '64'] }, { ...box, box: [64, 0, 0, 64] }, { ...box, box: [0, 64, 64, 0] }, { ...box, box: 'big' }, { ...box, color: 0 }, { ...box, width: 0.5 }, { ...box, opacity: 15 }, noOpacity]) {
    assert.throws(() => readDrawing([item]), /saved drawing/, JSON.stringify(item))
  }
})

test('a saved shape with no width or no height, which SVG never draws, throws', () => {
  for (const box of [[100, 10, 100, 150], [10, 100, 150, 100], [5, 5, 5, 5]]) {
    assert.throws(() => readDrawing([shapeItem('ellipse', box, 1, 6, 100)]), /saved drawing/, JSON.stringify(box))
  }
})

test('a drag across a shape\'s outline touches it, and one inside it that comes nowhere near the outline does not', () => {
  for (const shape of ['rect', 'ellipse']) {
    const item = shapeItem(shape, [0, 0, 256, 256], 1, 6, 100)
    assert.equal(touchesItem(item, [128, -20], [128, 20]), true, `${shape}: across the top`)
    assert.equal(touchesItem(item, [128, 4], [128, 4]), true, `${shape}: a press on the outline`)
    assert.equal(touchesItem(item, [100, 100], [156, 156]), false, `${shape}: inside, clear of the outline`)
    assert.equal(touchesItem(item, [-20, 128 + 300], [300, 128 + 300]), false, `${shape}: well outside`)
  }
})

test('a shape is touched within the tolerance of its outline\'s edge, and not just past it', () => {
  const item = shapeItem('rect', [0, 0, 256, 256], 1, 6, 100)
  const reach = ERASE_TOLERANCE + 3
  assert.equal(touchesItem(item, [128, -reach + 0.1], [140, -reach + 0.1]), true)
  assert.equal(touchesItem(item, [128, -reach - 0.1], [140, -reach - 0.1]), false)
})

test('an ellipse is touched along its curve, not at the corners of its box', () => {
  const ellipse = shapeItem('ellipse', [0, 0, 256, 256], 1, 6, 100)
  const rect = shapeItem('rect', [0, 0, 256, 256], 1, 6, 100)
  assert.equal(touchesItem(ellipse, [5, 5], [15, 15]), false, 'the ellipse is far from its box\'s corner')
  assert.equal(touchesItem(rect, [5, 5], [15, 15]), true, 'the rectangle has its corner there')
  // The circle's outline at 45 degrees, from the centre (128, 128) at radius 128.
  const onCurve = 128 - 128 / Math.SQRT2
  assert.equal(touchesItem(ellipse, [onCurve - 2, onCurve - 2], [onCurve - 2, onCurve - 2]), true)
})

test('the Shape button steps Off, Rectangle, Ellipse and back to Off', () => {
  assert.deepEqual([nextShapeMode('off'), nextShapeMode('rect'), nextShapeMode('ellipse')], ['rect', 'ellipse', 'off'])
})

test('a saved Shape mode reads back, and a missing or bad one reads as Off', () => {
  assert.deepEqual(['off', 'rect', 'ellipse', null, undefined, 'star', 3].map(readShapeMode), ['off', 'rect', 'ellipse', 'off', 'off', 'off', 'off'])
})
