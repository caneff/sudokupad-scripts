'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')

const { BOTTOM_ROW, BOTTOM_ROW_CSS } = loadLib(['bottom-row'], ['BOTTOM_ROW', 'BOTTOM_ROW_CSS'])

test('the bottom row is SudokuPad\'s .controls-aux', () => {
  assert.equal(BOTTOM_ROW, '.controls-aux')
})

test('the cap is 21.6rem on that row, five buttons wide, and beats an inline max-width', () => {
  assert.equal(BOTTOM_ROW_CSS, '.controls-aux { max-width: 21.6rem !important; }')
})
