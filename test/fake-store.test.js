'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { fakeStore } = require('./fake-store.js')

test('the shared fake store reads null for a missing key, as SudokuPad does, and a saved 0 as 0', () => {
  assert.equal(fakeStore({}).getData('missing'), null)
  assert.equal(fakeStore({ kept: 0 }).getData('kept'), 0)
})
