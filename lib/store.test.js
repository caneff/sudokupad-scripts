'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')
const { fakeStore, quietly } = require('../test/fake-store.js')

// store.js reads isPlainObject from plain.js.
const NAMES = ['load', 'save', 'unreadableSlots', 'puzzleKey']
const { load, save, unreadableSlots, puzzleKey } =
  loadLib(['plain', 'store'], NAMES)

const KEY = 'Test_count'
const KEPT = 'Test_count_unreadable'
const readCount = (data) => (Number.isInteger(data) && data > 0 ? data : undefined)

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

test('save: a value already saved as it is writes nothing, a changed one writes', () => {
  const inner = fakeStore()
  const writes = []
  const store = { ...inner, setData: (key, value) => { writes.push(key); inner.setData(key, value) } }
  save(store, KEY, { a: [1, 2] })
  save(store, KEY, { a: [1, 2] })
  assert.deepEqual(writes, [KEY])
  save(store, KEY, { a: [1, 3] })
  assert.deepEqual(writes, [KEY, KEY])
  assert.deepEqual(inner.data[KEY], { v: 0, data: { a: [1, 3] } })
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

test('load: the copy of an unreadable value goes through the store\'s keep, so a refusal there is not forgotten', () => {
  const store = fakeStore({ [KEY]: 'garbage' })
  const kept = []
  store.keep = (slot, raw) => kept.push([slot, raw])
  quietly(() => load(store, { key: KEY, read: readCount }))
  assert.deepEqual(kept, [[KEPT, 'garbage']])
  assert.equal(store.getData(KEPT), null, 'setData was not used for the copy')
})

test('load: a copy its keep did not store names no slot and says nothing is kept', () => {
  const store = fakeStore({ [KEY]: 'garbage' })
  store.keep = () => {}
  const { result, warnings } = quietly(() => load(store, { key: KEY, read: readCount }))
  assert.deepEqual(result, { value: undefined, unreadable: 'its reader refused it' })
  assert.deepEqual(warnings, [])
})

test('load: a reader that throws is unreadable too, with the error as the reason', () => {
  const store = fakeStore({ [KEY]: { v: 0, data: 3 } })
  const { result, warnings } = quietly(() => load(store, { key: KEY, read: () => { throw new Error('bad shape') } }))
  assert.deepEqual(result, { value: undefined, unreadable: 'bad shape', slot: KEPT })
  assert.deepEqual(store.getData(KEPT), { v: 0, data: 3 }, 'the raw value, envelope and all, is kept')
  assert.match(warnings[0], /bad shape/)
})

test('an unreadable value is never overwritten by a later save, and a second, different one is kept beside it', () => {
  const store = fakeStore({ [KEY]: 'garbage' })
  quietly(() => load(store, { key: KEY, read: readCount }))
  save(store, KEY, 4)
  assert.equal(store.getData(KEPT), 'garbage')
  assert.deepEqual(load(store, { key: KEY, read: readCount }), { value: 4 })
  store.setData(KEY, 'other garbage')
  const { warnings } = quietly(() => load(store, { key: KEY, read: readCount }))
  save(store, KEY, 5)
  assert.equal(store.getData(KEPT), 'garbage')
  assert.equal(store.getData(`${KEPT}2`), 'other garbage')
  assert.match(warnings[0], /Test_count_unreadable2/)
})

test('load: the same unreadable value read again is copied and logged once', () => {
  const store = fakeStore({ [KEY]: 'garbage' })
  quietly(() => load(store, { key: KEY, read: readCount }))
  const again = quietly(() => load(store, { key: KEY, read: readCount }))
  assert.equal(typeof again.result.unreadable, 'string')
  assert.deepEqual(again.warnings, [])
  assert.equal(`${KEPT}2` in store.data, false)
})

test('load: a value saved by a later version is unreadable, even when its data would read', () => {
  const store = fakeStore({ [KEY]: { v: 1, data: 7 } })
  const { result } = quietly(() => load(store, { key: KEY, read: readCount }))
  assert.equal(result.value, undefined)
  assert.match(result.unreadable, /version 1/)
  assert.deepEqual(store.getData(KEPT), { v: 1, data: 7 })
})

test('load: a reader that throws with no message still reports a reason', () => {
  const store = fakeStore({ [KEY]: 3 })
  const { result } = quietly(() => load(store, { key: KEY, read: () => { throw new Error('') } }))
  assert.equal(result.value, undefined)
  assert.notEqual(result.unreadable, '')
  assert.equal(typeof result.unreadable, 'string')
})

test('load: reports the slot it kept an unreadable value in, the second slot for a second, different one', () => {
  const store = fakeStore({ [KEY]: 'garbage' })
  assert.equal(quietly(() => load(store, { key: KEY, read: readCount })).result.slot, KEPT)
  store.setData(KEY, 'other garbage')
  assert.equal(quietly(() => load(store, { key: KEY, read: readCount })).result.slot, `${KEPT}2`)
  assert.equal(quietly(() => load(store, { key: KEY, read: readCount })).result.slot, `${KEPT}2`, 'the same value read again names the slot already holding it')
})

test('unreadableSlots: every slot holding a copy of an unreadable value for the key, in order', () => {
  const store = fakeStore({ [KEY]: 'garbage' })
  assert.deepEqual(unreadableSlots(store, KEY), [])
  quietly(() => load(store, { key: KEY, read: readCount }))
  assert.deepEqual(unreadableSlots(store, KEY), [KEPT])
  store.setData(KEY, 'other garbage')
  quietly(() => load(store, { key: KEY, read: readCount }))
  assert.deepEqual(unreadableSlots(store, KEY), [KEPT, `${KEPT}2`])
})

test('puzzleKey: the puzzle id, or the page URL for a puzzle with none (a replay or a pack)', () => {
  assert.equal(puzzleKey('scl123abc', 'https://sudokupad.app/scl123abc'), 'scl123abc')
  assert.equal(puzzleKey(undefined, 'https://sudokupad.app/?puzzle=x'), 'https://sudokupad.app/?puzzle=x')
  assert.equal(puzzleKey('', 'https://sudokupad.app/'), 'https://sudokupad.app/')
})
