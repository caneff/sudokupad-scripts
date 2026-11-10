'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')

const { SLIDER_STEP_KEYS, steppedSlider } = loadLib(['slider-keys'], ['SLIDER_STEP_KEYS', 'steppedSlider'])

test('SLIDER_STEP_KEYS: + and = step up, - steps down, and no other key steps', () => {
  assert.deepEqual(SLIDER_STEP_KEYS, { '+': 1, '=': 1, '-': -1 })
})

test('steppedSlider moves by the range\'s step in the direction and stops at the ends', () => {
  const range = { min: 1, max: 16, step: 0.5 }
  assert.equal(steppedSlider(range, 5, 1), 5.5)
  assert.equal(steppedSlider(range, 5, -1), 4.5)
  assert.equal(steppedSlider(range, 16, 1), 16)
  assert.equal(steppedSlider(range, 1, -1), 1)
})
