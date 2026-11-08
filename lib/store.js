/* eslint-disable no-unused-vars */
// Reads isPlainObject from plain.
/* global isPlainObject */
// A saved value is `{ v, data }`, so a later change to its shape has a version to migrate from; a value saved before the envelope is
// version 0, and so is every shape saved so far.
const STORE_VERSION = 0
const UNREADABLE_SUFFIX = '_unreadable'

const isEnvelope = (raw) => isPlainObject(raw) && Number.isInteger(raw.v) && Object.hasOwn(raw, 'data') && Object.keys(raw).length === 2

// `read` returns the value, or undefined for one it refuses, as a paste reader does. A refused or throwing read copies the raw value to
// `<key>_unreadable` before anything can save over it; the first copy is kept, since it holds what was there before things went wrong.
function load (store, { key, read }) {
  const raw = store.getData(key)
  if (raw === null) return { value: undefined }
  let unreadable
  try {
    const value = read(isEnvelope(raw) ? raw.data : raw)
    if (value !== undefined) return { value }
    unreadable = 'its reader refused it'
  } catch (error) {
    unreadable = error.message
  }
  const kept = key + UNREADABLE_SUFFIX
  if (store.getData(kept) === null) store.setData(kept, raw)
  console.warn(`${key}: the saved value could not be read (${unreadable}); it is kept under ${kept}`)
  return { value: undefined, unreadable }
}

function save (store, key, data) {
  store.setData(key, { v: STORE_VERSION, data })
}
