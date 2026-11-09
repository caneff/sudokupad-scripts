'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')

const { writeStyle } = loadLib(['write-style'], ['writeStyle'])

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
