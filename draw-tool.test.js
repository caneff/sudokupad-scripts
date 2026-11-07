'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { VERSION, TOOL_NAME, simplifyPath, strokePath, straightLine, toolNamesFor, strokeItem, readDrawing, puzzleKey, touchIndex, readIndex, KEPT_PUZZLES, WIDTHS, DEFAULT_COLOR, DEFAULT_WIDTH, penColor, readColor, readWidth, drawnLine, touchesStroke, ERASE_TOLERANCE } = require('./draw-tool.user.js')

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
  const drawing = [strokeItem([[1, 2], [30.5, 40.25], [64, 128]], 1, 6), strokeItem([[0, 0], [5, 5]], 3, 6)]
  assert.deepEqual(readDrawing(JSON.parse(JSON.stringify(drawing))), drawing)
})

test('a stroke item holds its kind, pen color number, width and its points rounded to a tenth of a board unit', () => {
  assert.deepEqual(strokeItem([[0.123, 1.06], [10.55, 5.04]], 1, 6), { kind: 'stroke', color: 1, width: 6, points: [[0.1, 1.1], [10.6, 5]] })
})

test('a puzzle with no saved drawing starts empty', () => {
  assert.deepEqual(readDrawing(null), [])
})

// Framework.getData hands back the raw text when it is not JSON.
test('saved data that is not a drawing throws, and is never read as an empty drawing', () => {
  for (const saved of ['[{"kind":"stroke"', {}, 'text', [{ kind: 'stroke', color: 1, width: 6, points: [] }], [{ kind: 'blob' }]]) {
    assert.throws(() => readDrawing(saved), /saved drawing/, JSON.stringify(saved))
  }
})

test('the key is the puzzle id, or the page URL for a puzzle with none', () => {
  assert.equal(puzzleKey('scl123abc', 'https://sudokupad.app/scl123abc'), 'scl123abc')
  assert.equal(puzzleKey(undefined, 'https://sudokupad.app/?puzzle=x'), 'https://sudokupad.app/?puzzle=x')
  assert.equal(puzzleKey('', 'https://sudokupad.app/'), 'https://sudokupad.app/')
})

const puzzles = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

test('drawings are kept for 50 puzzles', () => {
  assert.equal(KEPT_PUZZLES, 50)
})

test('saving a drawing for a 51st puzzle drops the oldest puzzle and keeps the other 50', () => {
  const { index, dropped } = touchIndex(puzzles(50), 'p51')
  assert.deepEqual(dropped, ['p1'])
  assert.deepEqual(index, puzzles(51).slice(1))
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

test('the three widths, middle first by default, and pen color 1 by default', () => {
  assert.equal(WIDTHS.length, 3)
  assert.deepEqual([...WIDTHS].sort((a, b) => a - b), WIDTHS)
  assert.equal(DEFAULT_WIDTH, WIDTHS[1])
  assert.equal(DEFAULT_WIDTH, 6, 'the width strokes had before the panel')
  assert.equal(DEFAULT_COLOR, 1)
})

// A keypad button's data-value is text; Framework.getData parses a saved 3 back as the number 3.
test('penColor reads 1 to 9, as text or a number, and nothing else', () => {
  for (let n = 1; n <= 9; n++) {
    assert.equal(penColor(String(n)), n)
    assert.equal(penColor(n), n)
  }
  for (const value of ['0', 0, 10, '10', 'a', '1.5', 1.5, '', null, undefined, {}, [3]]) assert.equal(penColor(value), undefined, JSON.stringify(value))
})

test('a saved color reads back, and a missing or bad one reads as pen color 1', () => {
  assert.equal(readColor(4), 4)
  for (const saved of [null, undefined, 0, 12, 'red', '', {}]) assert.equal(readColor(saved), DEFAULT_COLOR, JSON.stringify(saved))
})

test('a saved width reads back, and a missing or bad one reads as the middle width', () => {
  for (const width of WIDTHS) assert.equal(readWidth(width), width)
  for (const saved of [null, undefined, 0, 5, 7, '6', 'wide', {}]) assert.equal(readWidth(saved), DEFAULT_WIDTH, JSON.stringify(saved))
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

test('VERSION matches the @version header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, 'draw-tool.user.js'), 'utf8')))
})
