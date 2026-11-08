'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { fakeStore, quietly } = require('../test/fake-store.js')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text. store.js reads isPlainObject from plain.js.
const NAMES = ['load', 'save', 'UNREADABLE_SUFFIX']
const { load, save, UNREADABLE_SUFFIX } =
  new Function(`${['plain', 'store'].map((name) => fs.readFileSync(path.join(__dirname, `${name}.js`), 'utf8')).join('\n')}\nreturn { ${NAMES.join(', ')} }`)() // eslint-disable-line no-new-func

const KEY = 'Test_count'
const KEPT = 'Test_count_unreadable'
const readCount = (data) => (Number.isInteger(data) && data > 0 ? data : undefined)
test('the kept copy sits under the key with _unreadable added', () => {
  assert.equal(UNREADABLE_SUFFIX, '_unreadable')
})

test('load: a missing key is no value and nothing unreadable', () => {
  const store = fakeStore()
  assert.deepEqual(load(store, { key: KEY, read: readCount }), { value: undefined })
  assert.equal(KEPT in store.data, false)
})

test('save then load round-trips through the envelope', () => {
  const store = fakeStore()
  save(store, KEY, 7)
  assert.deepEqual(store.data[KEY], { v: 0, data: 7 })
  assert.deepEqual(load(store, { key: KEY, read: readCount }), { value: 7 })
})

test('load: a value saved before the envelope reads as version 0', () => {
  assert.deepEqual(load(fakeStore({ [KEY]: 5 }), { key: KEY, read: readCount }), { value: 5 })
  const state = { profiles: [{ name: 'a' }], active: 0 }
  assert.deepEqual(load(fakeStore({ [KEY]: state }), { key: KEY, read: (data) => data }), { value: state })
})

test('load: a value its reader refuses is copied aside, logged, and reported unreadable', () => {
  const store = fakeStore({ [KEY]: 'garbage' })
  const { result, warnings } = quietly(() => load(store, { key: KEY, read: readCount }))
  assert.equal(result.value, undefined)
  assert.equal(typeof result.unreadable, 'string')
  assert.equal(store.getData(KEPT), 'garbage')
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /Test_count_unreadable/)
})

test('load: a reader that throws is unreadable too, with the error as the reason', () => {
  const store = fakeStore({ [KEY]: { v: 0, data: 3 } })
  const { result, warnings } = quietly(() => load(store, { key: KEY, read: () => { throw new Error('bad shape') } }))
  assert.deepEqual(result, { value: undefined, unreadable: 'bad shape' })
  assert.deepEqual(store.getData(KEPT), { v: 0, data: 3 }, 'the raw value, envelope and all, is kept')
  assert.match(warnings[0], /bad shape/)
})

test('an unreadable value is never overwritten by a later save, nor by a later unreadable one', () => {
  const store = fakeStore({ [KEY]: 'garbage' })
  quietly(() => load(store, { key: KEY, read: readCount }))
  save(store, KEY, 4)
  assert.equal(store.getData(KEPT), 'garbage')
  assert.deepEqual(load(store, { key: KEY, read: readCount }), { value: 4 })
  store.setData(KEY, 'other garbage')
  quietly(() => load(store, { key: KEY, read: readCount }))
  assert.equal(store.getData(KEPT), 'garbage')
})
