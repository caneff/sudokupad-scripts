'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')

const { wrapIndex } = loadLib(['wrap-index'], ['wrapIndex'])

test('wrapIndex goes round a list of any length in either direction', () => {
  assert.equal(wrapIndex(0, 1, 2), 1)
  assert.equal(wrapIndex(1, 1, 2), 0)
  assert.equal(wrapIndex(0, -1, 2), 1)
  assert.equal(wrapIndex(1, -1, 3), 0)
  assert.equal(wrapIndex(2, 1, 3), 0)
})
