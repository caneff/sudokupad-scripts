/* eslint-disable no-unused-vars */
// Reads isPlainObject from plain. A script that copies in store as well has a second `global` naming it, which the linter calls a redeclaration.
/* global isPlainObject */ // eslint-disable-line no-redeclare
// A settings table is a list of rows: `name`, `key` (where it is stored), `read` (a saved value as the setting, the fallback for anything invalid),
// `fallback`, and optionally `paste` (the reader a pasted value goes through, `read` when absent), `dialog` (the settings dialog sets it) and `envelope`
// (the store module's `{ load, save }`, for a value kept as `{ v, data }`; `read` is then the strict reader of `load`, undefined for a value it refuses).
function sameValue (a, b) {
  return a === b || (isPlainObject(a) && isPlainObject(b) && Object.keys(a).every((name) => a[name] === b[name]))
}

const tableKeys = (rows) => rows.map((row) => row.key)

const tableDefaults = (rows) => Object.fromEntries(rows.map((row) => [row.name, row.fallback]))

const readRow = (row, store) => (row.envelope ? (row.envelope.load(store, row).value ?? row.fallback) : row.read(store.getData(row.key)))

const readByField = (rows, store, by) => Object.fromEntries(rows.map((row) => [row[by], readRow(row, store)]))

// Every row as `store` holds it, by name.
const readTable = (rows, store) => readByField(rows, store, 'name')

// The same values by stored key, defaults included, so a paste can put a setting back to its default.
const copiedTable = (rows, store) => readByField(rows, store, 'key')

const pasteReaders = (rows) => Object.fromEntries(rows.map(({ key, read, paste = read }) => [key, paste]))

// The rows whose draft differs from the value in force.
const changedRows = (rows, draft, now) => rows.filter((row) => !sameValue(draft[row.name], now[row.name]))

// The pasted values by row name, each as its key holds it in `values`: what withPasted takes as `now` when nothing has been saved to read it from.
const pastedByName = (rows, values) => Object.fromEntries(rows.map((row) => [row.name, values[row.key]]))

// A paste puts the pasted rows' values (from `now`: read once saved, or pastedByName's) into the draft and leaves every other row as drafted.
const withPasted = (rows, draft, now, values) => ({ ...draft, ...Object.fromEntries(rows.filter((row) => row.key in values).map((row) => [row.name, now[row.name]])) })

// A value at its fallback removes its key, so a fallback that changes later reaches everyone who never chose another.
function saveRow (store, row, value) {
  if (sameValue(value, row.fallback)) store.removeData(row.key)
  else if (row.envelope) row.envelope.save(store, row.key, value)
  else store.setData(row.key, value)
}
