'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { normalizeColors, setDigitColor, buildCss, digitOfText, circleFor, inkMiddle, esc, renderEditor, CIRCLE_CSS, DEFAULT_COLORS, DIGIT_ATTR, VERSION, DATA_KEY, copiedSettings, pastedSettings, pasteReport } = require('./digit-color.user.js')

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

test('the circle CSS shows the circles only while SudokuPad shows conflicts, never takes a pointer event, and fills with a translucent color', () => {
  assert.match(CIRCLE_CSS, /#digit-color-circles\s*{[^}]*display:\s*none/)
  assert.match(CIRCLE_CSS, /\.setting-checkpencilmarks #digit-color-circles\s*{[^}]*display:\s*inline/)
  assert.match(CIRCLE_CSS, /#digit-color-circles\s*{[^}]*pointer-events:\s*none/)
  assert.match(CIRCLE_CSS, /#digit-color-circles circle\s*{[^}]*fill:\s*#[0-9a-f]{6}/i)
  assert.match(CIRCLE_CSS, /#digit-color-circles circle\s*{[^}]*fill-opacity:\s*0?\.\d/)
})

test('circleFor centres on the mark\'s middle and is sized by its width', () => {
  // A corner mark measured on sudokupad.app: a digit 10 units wide, middle at (352, 35.8).
  const c = circleFor({ x: 352, y: 35.8, width: 10 })
  assert.equal(c.cx, 352)
  assert.equal(c.cy, 35.8)
  assert.ok(c.r >= 7 && c.r <= 10, `r ${c.r}`)
  assert.equal(circleFor({ x: 352, y: 35.8, width: 20 }).r, 2 * c.r)
})

test('inkMiddle centres on the digit\'s ink, not on its advance box or its font\'s em box', () => {
  // A character whose advance box starts at x 100 and whose em box starts at y 20, with a font
  // ascent of 10: the baseline is at y 30. The ink starts 1 right of the origin and reaches 5 right of it, and 7
  // above and 0 below the baseline.
  const middle = inkMiddle({ x: 100, y: 20 }, { left: -1, right: 5, ascent: 7, descent: 0, fontAscent: 10 })
  assert.equal(middle.x, 103)
  assert.equal(middle.y, 26.5)
  // Ink that dips below the baseline, like a descender or an overshoot, moves the middle down.
  assert.equal(inkMiddle({ x: 100, y: 20 }, { left: -1, right: 5, ascent: 7, descent: 1, fontAscent: 10 }).y, 27)
  // Ink reaching left of the origin moves the middle left.
  assert.equal(inkMiddle({ x: 100, y: 20 }, { left: 1, right: 5, ascent: 7, descent: 0, fontAscent: 10 }).x, 102)
})

test('inkMiddle throws when the browser lacks a measure, instead of giving NaN', () => {
  const whole = { left: -1, right: 5, ascent: 7, descent: 0, fontAscent: 10 }
  for (const key of Object.keys(whole)) {
    assert.throws(() => inkMiddle({ x: 100, y: 20 }, { ...whole, [key]: undefined }), new RegExp(`no ${key} measure`), key)
  }
})

test('digitOfText reads a single digit and nothing else', () => {
  assert.equal(digitOfText('5'), '5')
  assert.equal(digitOfText(' 5 '), '5')
  for (const bad of ['', '12', 'x', '-1', null, undefined]) assert.equal(digitOfText(bad), null, String(bad))
})

test('VERSION is the @version in the script header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, 'digit-color.user.js'), 'utf8')))
})

test('a digit set to null renders SudokuPad blue at opacity 0.4 with a disabled "SudokuPad color" button', () => {
  const html = renderEditor({ ...TABLE, 3: null })
  const row = html.split('<div ').find((r) => r.includes('data-digit="3"'))
  assert.match(row, /<input type="color" data-digit="3" value="#1d6ae5" style="opacity:0.4">/)
  assert.match(row, /<button type="button" data-act="own" data-digit="3" disabled>SudokuPad color<\/button>/)
  const other = html.split('<div ').find((r) => r.includes('data-digit="4"'))
  assert.match(other, /value="#1b7a2f" style="opacity:1"/)
  assert.doesNotMatch(other, /disabled/)
})

test('a color containing a double quote is escaped in the editor', () => {
  const html = renderEditor({ ...TABLE, 5: '#fff" onfocus="x' })
  assert.equal(esc('a"b<c>&'), 'a&quot;b&lt;c&gt;&amp;')
  assert.ok(html.includes('value="#fff&quot; onfocus=&quot;x"'), html)
  assert.ok(!html.includes('onfocus="x"'), html)
})

// The warnings the script prints starting on a page whose Framework is `framework`, or with none at all.
function startupWarnings (framework) {
  const file = require.resolve('./digit-color.user.js')
  const warnings = []
  const realWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  if (framework) global.Framework = framework
  delete require.cache[file]
  try {
    require(file)
  } finally {
    console.warn = realWarn
    delete global.Framework
    delete require.cache[file]
  }
  return warnings
}

test('a Framework without getApp makes the script warn and change nothing', () => {
  const warnings = startupWarnings({})
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /^digit-color: .*getApp/)
})

test('no Framework at all is left alone without a warning', () => {
  assert.deepEqual(startupWarnings(), [])
})

test('copiedSettings: the saved colors under their key, nothing when none are saved', () => {
  assert.equal(copiedSettings({ getData: () => null }), '{}')
  const saved = { 1: '#112233', 2: null }
  assert.deepEqual(JSON.parse(copiedSettings({ getData: (key) => ({ [DATA_KEY]: saved, Other_key: 1 }[key]) })), { [DATA_KEY]: saved })
})

test('pastedSettings: colors are normalized, a value that is no color table is skipped and counted, other keys are ignored', () => {
  const pasted = pastedSettings(JSON.stringify({ [DATA_KEY]: { 1: '#ABCDEF', 2: null, 3: 'nope' }, DarkPage_color: '#ffffff' }))
  assert.deepEqual(pasted.values, { [DATA_KEY]: normalizeColors({ 1: '#abcdef', 2: null }) })
  assert.equal(pasted.skipped, 0)
  assert.deepEqual(pastedSettings(JSON.stringify({ [DATA_KEY]: ['#ffffff'] })), { values: {}, skipped: 1 })
})

test('pastedSettings: throws on text that is not a JSON object', () => {
  assert.throws(() => pastedSettings('nope'), /not JSON/)
  assert.throws(() => pastedSettings('3'), /not a settings object/)
})

test('pasteReport: says how many were pasted and how many skipped, and when the text held nothing', () => {
  assert.equal(pasteReport(2, 0), 'Pasted 2 settings.')
  assert.equal(pasteReport(1, 3), 'Pasted 1 setting; skipped 3 that did not check out.')
  assert.equal(pasteReport(0, 1), 'Pasted 0 settings; skipped 1 that did not check out.')
  assert.equal(pasteReport(0, 0), 'Nothing to paste: the text holds none of this script\'s settings.')
})
