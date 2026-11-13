'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('../test/load-lib.js')
const { fakeStore, quietly } = require('../test/fake-store.js')

const { load, save, sameValue, tableKeys, tableDefaults, readTable, copiedTable, pasteReaders, changedRows, withPasted, saveRow } =
  loadLib(['plain', 'settings-table', 'store'], ['load', 'save', 'sameValue', 'tableKeys', 'tableDefaults', 'readTable', 'copiedTable', 'pasteReaders', 'changedRows', 'withPasted', 'saveRow'])

const readSize = (saved) => (Number.isInteger(saved) && saved > 0 ? saved : 3)
const readSide = (saved) => (saved === 'left' ? 'left' : 'none')
const readFlags = (saved) => ({ a: saved?.a !== false, b: saved?.b !== false })
const SIZE = { name: 'size', key: 'T_size', read: readSize, fallback: 3, paste: (data) => (Number.isInteger(data) && data > 0 ? data : undefined) }
const SIDE = { name: 'side', key: 'T_side', read: readSide, fallback: 'none', dialog: true }
const FLAGS = { name: 'flags', key: 'T_flags', read: readFlags, fallback: { a: true, b: true }, dialog: true }
const ROWS = [SIZE, SIDE, FLAGS]

test('sameValue compares a primitive by value and a plain object by its entries', () => {
  assert.equal(sameValue(3, 3), true)
  assert.equal(sameValue(3, 4), false)
  assert.equal(sameValue({ a: true, b: false }, { a: true, b: false }), true)
  assert.equal(sameValue({ a: true, b: false }, { a: true, b: true }), false)
})

test('tableKeys lists each row\'s stored key in order', () => {
  assert.deepEqual(tableKeys(ROWS), ['T_size', 'T_side', 'T_flags'])
})

test('tableDefaults holds each row\'s default under its name', () => {
  assert.deepEqual(tableDefaults(ROWS), { size: 3, side: 'none', flags: { a: true, b: true } })
})

test('readTable reads what is saved under each key by name, and the default for what is not', () => {
  assert.deepEqual(readTable(ROWS, fakeStore({ T_size: 7, T_flags: { a: false } })), { size: 7, side: 'none', flags: { a: false, b: true } })
})

test('copiedTable reads the same values under each row\'s stored key, defaults included', () => {
  assert.deepEqual(copiedTable(ROWS, fakeStore({ T_side: 'left' })), { T_size: 3, T_side: 'left', T_flags: { a: true, b: true } })
})

test('pasteReaders gives each key its row\'s paste reader, or its read when it has none', () => {
  const readers = pasteReaders(ROWS)
  assert.deepEqual(Object.keys(readers), ['T_size', 'T_side', 'T_flags'])
  assert.equal(readers.T_size(5), 5)
  assert.equal(readers.T_size('x'), undefined, 'a value its paste reader refuses is undefined')
  assert.equal(readers.T_side('sideways'), 'none', 'a row with no paste reader reads an invalid value as its default')
})

test('changedRows lists the rows whose draft differs from the value in force, a flag set by its entries', () => {
  const now = readTable(ROWS, fakeStore({}))
  assert.deepEqual(changedRows(ROWS, { ...now }, now), [])
  assert.deepEqual(changedRows(ROWS, { ...now, flags: { a: true, b: true } }, now), [])
  assert.deepEqual(changedRows(ROWS, { ...now, size: 9, flags: { a: false, b: true } }, now).map((row) => row.name), ['size', 'flags'])
})

test('withPasted puts the pasted rows\' values from now into the draft and leaves every other row as drafted', () => {
  const draft = { size: 4, side: 'left', flags: { a: false, b: true } }
  const now = { size: 9, side: 'none', flags: { a: true, b: true } }
  assert.deepEqual(withPasted(ROWS, draft, now, { T_size: 9, T_side: 'none' }), { size: 9, side: 'none', flags: { a: false, b: true } })
  assert.deepEqual(withPasted(ROWS, draft, now, {}), draft)
})

test('saveRow writes a value off its default and removes the key for a value at it', () => {
  const store = fakeStore({})
  saveRow(store, SIZE, 6)
  assert.equal(store.getData('T_size'), 6)
  saveRow(store, SIZE, 3)
  assert.equal(store.getData('T_size'), null)
  saveRow(store, FLAGS, { a: false, b: true })
  assert.deepEqual(store.getData('T_flags'), { a: false, b: true })
  saveRow(store, FLAGS, { a: true, b: true })
  assert.equal(store.getData('T_flags'), null, 'a flag set at its defaults is removed')
})

test('a row added to the table reaches every helper with no other edit', () => {
  const SPIN = { name: 'spin', key: 'T_spin', read: (saved) => (saved === 'left' ? 'left' : 'none'), fallback: 'none', dialog: true }
  const rows = [...ROWS, SPIN]
  const store = fakeStore({ T_spin: 'left' })
  assert.equal(copiedTable(rows, store).T_spin, 'left')
  assert.equal(copiedTable(rows, fakeStore({})).T_spin, 'none')
  assert.equal(pasteReaders(rows).T_spin('left'), 'left')
  assert.equal(readTable(rows, store).spin, 'left')
  assert.equal(tableDefaults(rows).spin, 'none')
  assert.ok(tableKeys(rows).includes('T_spin'), 'the snapshot\'s keys hold the added row\'s key')
  const now = readTable(rows, fakeStore({}))
  assert.deepEqual(changedRows(rows, { ...now, spin: 'left' }, now).map((row) => row.name), ['spin'])
  assert.equal(withPasted(rows, now, readTable(rows, store), { T_spin: 'left' }).spin, 'left')
  saveRow(store, SPIN, 'none')
  assert.equal(store.getData('T_spin'), null)
})

const readLimit = (data) => (data === null || (Number.isInteger(data) && data > 0) ? data : undefined)
const LIMIT = { name: 'limit', key: 'T_limit', read: readLimit, fallback: null, envelope: { load, save } }

test('an enveloped row reads through the envelope, from before it too, and its fallback stands for none saved', () => {
  assert.equal(readTable([LIMIT], fakeStore({ T_limit: { v: 0, data: 700 } })).limit, 700)
  assert.equal(readTable([LIMIT], fakeStore({ T_limit: 500 })).limit, 500)
  assert.equal(readTable([LIMIT], fakeStore({})).limit, null)
  assert.equal(copiedTable([LIMIT], fakeStore({ T_limit: { v: 0, data: 700 } })).T_limit, 700)
})

test('an enveloped row whose saved value cannot be read reads as its fallback and the value is kept aside', () => {
  const store = fakeStore({ T_limit: 'tall' })
  const { result, warnings } = quietly(() => readTable([LIMIT], store))
  assert.equal(result.limit, null)
  assert.equal(store.getData('T_limit_unreadable'), 'tall')
  assert.equal(warnings.length, 1)
})

test('saveRow saves an enveloped row in its envelope, and removes the key at its fallback', () => {
  const store = fakeStore({})
  saveRow(store, LIMIT, 640)
  assert.deepEqual(store.getData('T_limit'), { v: 0, data: 640 })
  saveRow(store, LIMIT, null)
  assert.equal(store.getData('T_limit'), null)
})
