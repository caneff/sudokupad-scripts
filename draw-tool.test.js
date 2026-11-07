'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { VERSION, TOOL_NAME, simplifyPath, strokePath, straightLine, toolNamesFor } = require('./draw-tool.user.js')

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

test('VERSION matches the @version header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, 'draw-tool.user.js'), 'utf8')))
})
