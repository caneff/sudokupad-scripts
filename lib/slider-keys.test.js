'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')

const { SLIDER_STEP_KEYS, steppedSlider, onSliderStep } = loadLib(['slider-keys'], ['SLIDER_STEP_KEYS', 'steppedSlider', 'onSliderStep'])

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

test('onSliderStep takes a number on the step grid counted from min, within the ends, and nothing else', () => {
  const range = { min: 20, max: 100, step: 5 }
  for (const ok of [20, 25, 80, 100]) assert.equal(onSliderStep(range, ok), true, String(ok))
  for (const bad of [15, 105, 22, 20.5, '20', null, undefined, NaN, Infinity, true, [20]]) assert.equal(onSliderStep(range, bad), false, String(bad))
})

test('onSliderStep counts a fractional step from min, and a whole-number range stays whole', () => {
  assert.equal(onSliderStep({ min: 1, max: 16, step: 0.5 }, 2.5), true)
  assert.equal(onSliderStep({ min: 1, max: 16, step: 0.5 }, 2.25), false)
  assert.equal(onSliderStep({ min: 1, max: 16, step: 1 }, 2.5), false)
})
