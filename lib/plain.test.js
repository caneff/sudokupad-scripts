'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text.
const { isPlainObject, rem, typedIntoField } = new Function(`${fs.readFileSync(path.join(__dirname, 'plain.js'), 'utf8')}\nreturn { isPlainObject, rem, typedIntoField }`)() // eslint-disable-line no-new-func

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
