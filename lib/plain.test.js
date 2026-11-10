'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')

const { isPlainObject, rem, typedIntoField, hasChord } = loadLib(['plain'], ['isPlainObject', 'rem', 'typedIntoField', 'hasChord'])

test('isPlainObject accepts objects and refuses null, arrays and primitives', () => {
  assert.equal(isPlainObject({ a: 1 }), true)
  assert.equal(isPlainObject({}), true)
  assert.equal(isPlainObject(null), false)
  assert.equal(isPlainObject([]), false)
  assert.equal(isPlainObject('text'), false)
  assert.equal(isPlainObject(undefined), false)
})

test('rem rounds to two decimals', () => {
  assert.equal(rem(0.1 + 0.2), 0.3)
  assert.equal(rem(2.5), 2.5)
  assert.equal(rem(1.234), 1.23)
})

test('typedIntoField is true for a key typed in a field and false for the page or a target with no closest', () => {
  const inside = (selector) => ({ target: { closest: (wanted) => wanted.includes(selector) ? {} : null } })
  for (const field of ['input', 'textarea', 'select', '[contenteditable]']) assert.equal(typedIntoField(inside(field)), true, field)
  assert.equal(typedIntoField(inside('div')), false)
  assert.equal(typedIntoField({ target: {} }), false)
  assert.equal(typedIntoField({}), false)
})

test('hasChord is true with Ctrl, Alt or Meta held and false with none or Shift alone', () => {
  for (const key of ['ctrlKey', 'altKey', 'metaKey']) assert.equal(hasChord({ [key]: true }), true, key)
  assert.equal(hasChord({}), false)
  assert.equal(hasChord({ shiftKey: true }), false)
})
