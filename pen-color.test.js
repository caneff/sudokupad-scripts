'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeColors, buildCss, DEFAULT_COLORS } = require('./pen-color.user.js')

// SudokuPad's tool-pen.css (v0.611.0) as #rrggbb, typed out here as the independent source.
// Pen color 9 is written there as rgb(-36, -36, -36), which clamps to black.
const TABLE = {
  1: '#1f8020', 2: '#e87cf1', 3: '#e49632', 4: '#f53a37', 5: '#d2be32', 6: '#3d99f5', 7: '#d6d6d6', 8: '#7c7c7c', 9: '#000000'
}

test('the default colors are SudokuPad\'s own nine pen colors', () => {
  assert.deepEqual(DEFAULT_COLORS, TABLE)
})

test('nothing saved is the fresh-install state: every pen color has its default', () => {
  assert.deepEqual(normalizeColors(null), TABLE)
  assert.deepEqual(normalizeColors(undefined), TABLE)
})

test('corrupt saved data falls back to the default colors', () => {
  for (const bad of ['red', 7, true, [], ['#ff0000'], '{"1":"#ff0000"}']) {
    assert.deepEqual(normalizeColors(bad), TABLE, JSON.stringify(bad))
  }
})

test('a saved #rrggbb color is kept, lowercased', () => {
  assert.deepEqual(normalizeColors({ 4: '#FF0000' }), { ...TABLE, 4: '#ff0000' })
})

test('a saved entry that is not a #rrggbb color falls back to that pen color\'s default', () => {
  const saved = { 2: 'red', 3: '#abc', 4: 7, 5: null, 6: undefined, 0: '#00ff00', 10: '#00ff00', x: '#00ff00', 9: '#00ff00;}body{display:none' }
  assert.deepEqual(normalizeColors(saved), TABLE)
})

test('a saved color with junk before it, or a non-string entry, falls back to that pen color\'s default', () => {
  const saved = { 1: 'x;}body{display:none}#ff0000', 2: ['#ff0000'], 3: { toLowerCase: () => '#ff0000' } }
  assert.deepEqual(normalizeColors(saved), TABLE)
})

test('saved data that is an array is not read by index', () => {
  assert.deepEqual(normalizeColors(['x', '#ff0000']), TABLE)
})

test('the result has exactly nine keys, whatever was saved', () => {
  assert.deepEqual(Object.keys(normalizeColors({ 10: '#ff0000', 0: '#ff0000' })), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
})

test('normalizeColors returns a copy, never the saved object or the defaults', () => {
  const saved = { 1: '#ff0000' }
  assert.notEqual(normalizeColors(saved), saved)
  assert.notEqual(normalizeColors(null), DEFAULT_COLORS)
})

test('buildCss writes the nine variables under :root:root, not plain :root', () => {
  const css = buildCss({ ...TABLE, 4: '#112233' })
  const lines = css.split('\n')
  assert.equal(lines[0], ':root:root {')
  assert.equal(lines[lines.length - 1], '}')
  assert.equal(lines.length, 11)
  assert.ok(lines.includes('  --puzzle-pencolor-4: #112233;'))
  assert.ok(lines.includes('  --puzzle-pencolor-9: #000000;'))
  assert.equal(css.includes('pencolor-erase'), false)
})
