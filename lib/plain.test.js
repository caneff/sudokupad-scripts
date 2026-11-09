'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')

const { isPlainObject, rem, typedIntoField, wrapIndex, writeStyle } = loadLib(['plain'], ['isPlainObject', 'rem', 'typedIntoField', 'wrapIndex', 'writeStyle'])

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

test('wrapIndex goes round a list of any length in either direction', () => {
  assert.equal(wrapIndex(0, 1, 2), 1)
  assert.equal(wrapIndex(1, 1, 2), 0)
  assert.equal(wrapIndex(0, -1, 2), 1)
  assert.equal(wrapIndex(1, -1, 3), 0)
  assert.equal(wrapIndex(2, 1, 3), 0)
})

test('writeStyle adds one style element under its id and rewrites that one on every later call', () => {
  const head = []
  const doc = {
    getElementById: (id) => head.find((el) => el.id === id) ?? null,
    createElement: (tag) => ({ tag }),
    head: { appendChild: (el) => head.push(el) }
  }
  writeStyle('one', 'a {}', doc)
  writeStyle('one', 'b {}', doc)
  writeStyle('two', 'c {}', doc)
  assert.deepEqual(head, [{ tag: 'style', id: 'one', textContent: 'b {}' }, { tag: 'style', id: 'two', textContent: 'c {}' }])
})
