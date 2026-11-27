'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')

const { savedSliderValue, SLIDER_STEP_KEYS, steppedSlider, onSliderStep, HELD_REPEAT_MS, HELD_RAMP_MS, HELD_SLIDER_MAX_STEPS, heldRamp, heldSliderSteps, sliderKeyHold, HELD_TICK_MS } = loadLib(['slider-keys'], ['savedSliderValue', 'SLIDER_STEP_KEYS', 'steppedSlider', 'onSliderStep', 'HELD_REPEAT_MS', 'HELD_RAMP_MS', 'HELD_SLIDER_MAX_STEPS', 'heldRamp', 'heldSliderSteps', 'sliderKeyHold', 'HELD_TICK_MS'])

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

test('heldRamp does nothing before the pause, then starts at `from` and reaches `to` after the ramp, and stays there', () => {
  assert.equal(heldRamp(0, 2, 10), 0)
  assert.equal(heldRamp(HELD_REPEAT_MS - 1, 2, 10), 0)
  assert.equal(heldRamp(HELD_REPEAT_MS, 2, 10), 2)
  assert.equal(heldRamp(HELD_REPEAT_MS + HELD_RAMP_MS / 2, 2, 10), 6)
  assert.equal(heldRamp(HELD_REPEAT_MS + HELD_RAMP_MS, 2, 10), 10)
  assert.equal(heldRamp(HELD_RAMP_MS * 10, 2, 10), 10)
})

test('a held + or - waits out the pause, then steps once a tick and ramps to the most steps a tick', () => {
  assert.equal(heldSliderSteps(HELD_REPEAT_MS - 1), 0)
  assert.equal(heldSliderSteps(HELD_REPEAT_MS), 1)
  assert.equal(heldSliderSteps(HELD_REPEAT_MS + HELD_RAMP_MS / 2) > 1, true)
  assert.equal(heldSliderSteps(HELD_RAMP_MS * 10), HELD_SLIDER_MAX_STEPS)
  assert.equal(HELD_SLIDER_MAX_STEPS > 1, true)
})

test('savedSliderValue takes a value on one of the slider\'s steps and refuses one off a step, out of range or not a number', () => {
  const range = { min: 1, max: 3, step: 0.5 }
  for (const on of [1, 1.5, 3]) assert.equal(savedSliderValue(range, on), on)
  for (const off of [1.25, 0.5, 3.5, '2', null, undefined, NaN]) assert.equal(savedSliderValue(range, off), undefined, String(off))
})

// Resolves with the next tick's direction; the hold ticks every HELD_TICK_MS, and no verdict waits on a sleep.
const nextTick = (ticks) => new Promise((resolve) => ticks.push(resolve))

test('sliderKeyHold: a new + or - press takes the hold over, so the ramp steps the new direction, and only the new key\'s release ends it', async () => {
  const waiting = []
  const seen = []
  const hold = sliderKeyHold((current) => {
    seen.push(current.direction)
    waiting.splice(0).forEach((resolve) => resolve())
  })
  try {
    hold.press('Equal', 1)
    hold.press('Minus', -1)
    hold.release('Equal')
    await nextTick(waiting)
    await nextTick(waiting)
    assert.deepEqual(seen.filter((d) => d !== -1), [], 'every tick steps down, and the first key\'s release does not end the new hold')
    hold.release('Minus')
    const ticks = seen.length
    await new Promise((resolve) => setTimeout(resolve, 3 * HELD_TICK_MS)) // nothing happened: no tick after the release
    assert.equal(seen.length, ticks)
  } finally {
    hold.stop()
  }
})

test('sliderKeyHold: stop ends a hold, and a release of another key leaves it', async () => {
  const waiting = []
  let ticks = 0
  const hold = sliderKeyHold(() => {
    ticks++
    waiting.splice(0).forEach((resolve) => resolve())
  })
  try {
    hold.press('Minus', -1)
    hold.release('Equal')
    await nextTick(waiting)
    hold.stop()
    const stopped = ticks
    await new Promise((resolve) => setTimeout(resolve, 3 * HELD_TICK_MS)) // nothing happened: no tick after stop
    assert.equal(ticks, stopped)
  } finally {
    hold.stop()
  }
})
