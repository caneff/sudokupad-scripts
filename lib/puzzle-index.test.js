'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')
const { fakeStore } = require('../test/fake-store.js')

const { KEPT_PUZZLES, readIndex, touchIndex, writeIndexed } =
  loadLib(['plain', 'store', 'puzzle-index'], ['KEPT_PUZZLES', 'readIndex', 'touchIndex', 'writeIndexed'])

const puzzles = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`)
const INDEX_KEY = 'Test_index'
const dataKey = (key) => `Test_data_${key}`
const kept = { indexKey: INDEX_KEY, forget: (store, key) => store.removeData(dataKey(key)) }

test('KEPT_PUZZLES is 50', () => assert.equal(KEPT_PUZZLES, 50))

test('readIndex: nothing saved is an empty list, a list of keys is itself, anything else throws', () => {
  assert.deepEqual(readIndex(null), [])
  assert.deepEqual(readIndex(['a', 'b']), ['a', 'b'])
  assert.throws(() => readIndex('oops'), /not a list of puzzle keys/)
  assert.throws(() => readIndex([1]), /not a list of puzzle keys/)
})

test('touchIndex: the 51st puzzle drops the oldest; an old puzzle moves to the newest end', () => {
  assert.deepEqual(touchIndex(puzzles(50), 'p51'), { index: puzzles(51).slice(1), dropped: ['p1'] })
  const moved = touchIndex(puzzles(50), 'p1')
  assert.deepEqual(moved.dropped, [])
  assert.equal(moved.index.at(-1), 'p1')
  assert.equal(moved.index.length, 50)
})

test('writeIndexed: writes the value, then the index, then removes the dropped puzzles\' data', () => {
  const saved = { [INDEX_KEY]: puzzles(50) }
  for (const key of puzzles(50)) saved[dataKey(key)] = [key]
  writeIndexed(fakeStore(saved), kept, puzzles(50), 'p51', dataKey('p51'), ['x'])
  assert.deepEqual(saved[INDEX_KEY], puzzles(51).slice(1))
  assert.equal(dataKey('p1') in saved, false)
  assert.deepEqual(saved[dataKey('p51')], ['x'])
})

test('writeIndexed: a value the store dropped leaves the index and every other puzzle as they were', () => {
  const saved = { [INDEX_KEY]: puzzles(50) }
  for (const key of puzzles(50)) saved[dataKey(key)] = [key]
  const before = structuredClone(saved)
  const store = { ...fakeStore(saved), setData: () => {} }
  writeIndexed(store, kept, puzzles(50), 'p51', dataKey('p51'), ['x'])
  assert.deepEqual(saved, before)
})

test('writeIndexed: a value that landed but an index the store dropped removes no other puzzle\'s data', () => {
  const saved = { [INDEX_KEY]: puzzles(50) }
  for (const key of puzzles(50)) saved[dataKey(key)] = [key]
  const store = { ...fakeStore(saved), setData: (k, v) => { if (k !== INDEX_KEY) saved[k] = v } }
  writeIndexed(store, kept, puzzles(50), 'p51', dataKey('p51'), ['x'])
  assert.deepEqual(saved[INDEX_KEY], puzzles(50))
  assert.deepEqual(saved[dataKey('p1')], ['p1'])
})

test('writeIndexed: an index already in this order is not written again', () => {
  const saved = { [INDEX_KEY]: ['a', 'b'], [dataKey('b')]: ['b'] }
  const writes = []
  const store = { ...fakeStore(saved), setData: (k, v) => { writes.push(k); saved[k] = v } }
  writeIndexed(store, kept, ['a', 'b'], 'b', dataKey('b'), ['b'])
  assert.deepEqual(writes, [dataKey('b')])
})
