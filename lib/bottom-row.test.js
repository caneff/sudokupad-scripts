'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text.
const { BOTTOM_ROW, BOTTOM_ROW_CSS } = new Function(`${fs.readFileSync(path.join(__dirname, 'bottom-row.js'), 'utf8')}\nreturn { BOTTOM_ROW, BOTTOM_ROW_CSS }`)() // eslint-disable-line no-new-func

test('the bottom row is SudokuPad\'s .controls-aux', () => {
  assert.equal(BOTTOM_ROW, '.controls-aux')
})

test('the cap is 21.6rem on that row, five buttons wide', () => {
  assert.equal(BOTTOM_ROW_CSS, '.controls-aux { max-width: 21.6rem; }')
})
