/* eslint-disable no-unused-vars */
// A script that copies in store as well has a second `global` naming isPlainObject, which the linter calls a redeclaration.
/* global isPlainObject */ // eslint-disable-line no-redeclare
// A settings table is a list of rows: `name`, `key` (where it is stored), `read` (the one reader, for a saved value and a pasted one: undefined refuses the value),
// `fallback` (what a refused saved value reads as), and optionally `dialog` (the settings dialog sets it) and `envelope`
// (the store module's `{ load, save }`, for a value kept as `{ v, data }`; `read` is then the strict reader of `load`).
// A row that takes any value as a setting, a bad paste included, has a `read` that never refuses.
// A strict reader's name starts `saved`: it gives the value it takes and undefined for one it refuses.
const savedBoolean = (data) => (typeof data === 'boolean' ? data : undefined)

function sameValue (a, b) {
  return a === b || (isPlainObject(a) && isPlainObject(b) && Object.keys(a).every((name) => a[name] === b[name]))
}

const tableKeys = (rows) => rows.map((row) => row.key)

const tableDefaults = (rows) => Object.fromEntries(rows.map((row) => [row.name, row.fallback]))

const readRow = (row, store) => (row.envelope ? row.envelope.load(store, row).value : row.read(store.getData(row.key))) ?? row.fallback

const readByField = (rows, store, by) => Object.fromEntries(rows.map((row) => [row[by], readRow(row, store)]))

const readTable = (rows, store) => readByField(rows, store, 'name')

// The same values by stored key, defaults included, so a paste can put a setting back to its default.
const copiedTable = (rows, store) => readByField(rows, store, 'key')

const pasteReaders = (rows) => Object.fromEntries(rows.map(({ key, read }) => [key, read]))

const changedRows = (rows, draft, now) => rows.filter((row) => !sameValue(draft[row.name], now[row.name]))

// A paste puts the pasted rows' values (`values`, by stored key, as the readers gave them) into the draft and leaves every other row as drafted.
const withPasted = (rows, draft, values) => ({ ...draft, ...Object.fromEntries(rows.filter((row) => row.key in values).map((row) => [row.name, values[row.key]])) })

// A value at its fallback removes its key, so a fallback that changes later reaches everyone who never chose another.
function saveRow (store, row, value) {
  if (sameValue(value, row.fallback)) store.removeData(row.key)
  else if (row.envelope) row.envelope.save(store, row.key, value)
  else store.setData(row.key, value)
}

const saveTable = (store, rows, values) => rows.forEach((row) => saveRow(store, row, values[row.name]))
