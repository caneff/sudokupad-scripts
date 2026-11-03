'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeColors, setDigitColor, buildCss, digitOfText, circleFor, CIRCLE_CSS, DEFAULT_COLORS, DIGIT_ATTR } = require('./digit-color.user.js')

// Chris's table from issue #7, typed out here as the independent source for the constant.
const TABLE = {
  0: '#4b5563', 1: '#b0125b', 2: '#b04a00', 3: '#7a6200', 4: '#1b7a2f', 5: '#00736f', 6: '#0059c9', 7: '#3d2bb8', 8: '#8a1fa8', 9: '#5e3a1a'
}

test('the default colors are the ruled table', () => {
  assert.deepEqual(DEFAULT_COLORS, TABLE)
})

test('nothing saved is the fresh-install state: every digit has its default color', () => {
  assert.deepEqual(normalizeColors(null), TABLE)
  assert.deepEqual(normalizeColors(undefined), TABLE)
})

test('corrupt saved data falls back to the default colors', () => {
  for (const bad of ['red', 7, true, [], ['#ff0000'], [['1', '#ff0000']], '{"1":"#ff0000"}']) {
    assert.deepEqual(normalizeColors(bad), TABLE, JSON.stringify(bad))
  }
})

test('a saved color is kept for a digit 0-9 with a #rrggbb color, lowercased', () => {
  assert.deepEqual(normalizeColors({ 1: '#FF0000' }), { ...TABLE, 1: '#ff0000' })
})

test('a saved entry that is not a #rrggbb color falls back to that digit\'s default', () => {
  const saved = { 2: 'red', 3: '#abc', 4: 7, 5: undefined, x: '#00ff00', 12: '#00ff00', 9: '#00ff00;}body{display:none' }
  assert.deepEqual(normalizeColors(saved), TABLE)
})

test('a saved null keeps that digit on SudokuPad\'s own color', () => {
  assert.deepEqual(normalizeColors({ 6: null }), { ...TABLE, 6: null })
})

test('normalizeColors returns a copy, never the saved object or the defaults', () => {
  const saved = { 1: '#ff0000' }
  assert.notEqual(normalizeColors(saved), saved)
  assert.notEqual(normalizeColors(null), DEFAULT_COLORS)
})

test('setDigitColor sets one digit and leaves the others', () => {
  assert.deepEqual(setDigitColor({ 1: '#ff0000' }, '2', '#00ff00'), { 1: '#ff0000', 2: '#00ff00' })
})

test('setDigitColor with null sets the digit to SudokuPad\'s own color and keeps the key', () => {
  assert.deepEqual(setDigitColor({ 1: '#ff0000', 2: '#00ff00' }, '1', null), { 1: null, 2: '#00ff00' })
})

test('setDigitColor does not change the object it is given', () => {
  const colors = { 1: '#ff0000' }
  setDigitColor(colors, '1', null)
  assert.deepEqual(colors, { 1: '#ff0000' })
})

test('a digit set to SudokuPad\'s own color gets no rule at all', () => {
  assert.equal(buildCss({ 7: null }), '')
})

test('no colors builds no CSS', () => {
  assert.equal(buildCss({}), '')
})

test('a digit with a color gets a rule for entered digits, corner marks and centre marks', () => {
  const css = buildCss({ 7: '#123456' })
  assert.match(css, new RegExp(`#cell-values \\[${DIGIT_ATTR}="7"\\]\\s*{[^}]*fill:\\s*#123456`))
  assert.match(css, /#cell-pencilmarks [^{]*\[data-val="7"\][^{]*{[^}]*fill:\s*#123456/)
  assert.match(css, /#cell-candidates [^{]*\[data-val="7"\][^{]*{[^}]*fill:\s*#123456/)
})

test('a mark in the conflict state keeps the digit color: no rule outlines it or names the conflict state or the givens', () => {
  const css = buildCss({ 7: '#123456' })
  const rules = css.split('}').filter((r) => r.includes('data-val'))
  assert.equal(rules.length, 2)
  rules.forEach((r) => assert.match(r, /fill:\s*#123456/))
  assert.doesNotMatch(css, /stroke|conflict|cell-given/)
})

test('the circle CSS shows the circles only while SudokuPad shows conflicts, never takes a pointer event, and fills with a translucent red', () => {
  assert.match(CIRCLE_CSS, /#digit-color-circles\s*{[^}]*display:\s*none/)
  assert.match(CIRCLE_CSS, /\.setting-checkpencilmarks #digit-color-circles\s*{[^}]*display:\s*inline/)
  assert.match(CIRCLE_CSS, /#digit-color-circles\s*{[^}]*pointer-events:\s*none/)
  assert.match(CIRCLE_CSS, /#digit-color-circles circle\s*{[^}]*fill-opacity:\s*0?\.\d/)
})

test('circleFor centres on the mark\'s middle and is sized by its width', () => {
  // A corner mark measured on sudokupad.app: a digit 10 units wide, middle at (352, 35.8).
  const c = circleFor({ x: 352, y: 35.8, width: 10 })
  assert.equal(c.cx, 352)
  assert.equal(c.cy, 35.8)
  assert.ok(c.r >= 7 && c.r <= 10, `r ${c.r}`)
})

test('digitOfText reads a single digit and nothing else', () => {
  assert.equal(digitOfText('5'), '5')
  assert.equal(digitOfText(' 5 '), '5')
  for (const bad of ['', '12', 'x', '-1', null, undefined]) assert.equal(digitOfText(bad), null, String(bad))
})
