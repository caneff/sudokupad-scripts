'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')

const { isPlainObject, rem, typedIntoField, hasChord, escapeHtml } = loadLib(['plain'], ['isPlainObject', 'rem', 'typedIntoField', 'hasChord', 'escapeHtml'])

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

test('escapeHtml replaces the four markup characters and stringifies a non-string', () => {
  assert.equal(escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
  assert.equal(escapeHtml(7), '7')
})

test('the mouse-button constants are the DOM\'s: `button` numbers the button, `buttons` has one bit per button held', () => {
  const buttons = loadLib(['plain'], ['PRIMARY_BUTTON', 'SECONDARY_BUTTON', 'PRIMARY_HELD', 'SECONDARY_HELD'])
  assert.deepEqual(buttons, { PRIMARY_BUTTON: 0, SECONDARY_BUTTON: 2, PRIMARY_HELD: 1, SECONDARY_HELD: 2 })
})
