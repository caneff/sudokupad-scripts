/* eslint-disable no-unused-vars */
/* global isPlainObject */
// A saved value is `{ v, data }`, so a later change to its shape has a version to migrate from; a value saved before the envelope is
// version 0, and so is every shape saved so far. A version above this one was saved by a later script, and is unreadable here.
const STORE_VERSION = 0
const UNREADABLE_SUFFIX = '_unreadable'

const isEnvelope = (raw) => isPlainObject(raw) && Number.isInteger(raw.v) && Object.hasOwn(raw, 'data') && Object.keys(raw).length === 2

// The first free slot, `<key>_unreadable`, then `<key>_unreadable2` and on, or the one already holding `raw`: no kept copy is ever replaced.
function keptSlot (store, key, raw) {
  const same = JSON.stringify(raw)
  for (let n = 1; ; n++) {
    const slot = key + UNREADABLE_SUFFIX + (n === 1 ? '' : n)
    const held = store.getData(slot)
    if (held === null || JSON.stringify(held) === same) return { slot, copied: held === null }
  }
}

function readSaved (raw, read) {
  if (isEnvelope(raw) && raw.v > STORE_VERSION) throw new Error(`it was saved by a later version (version ${raw.v})`)
  const value = read(isEnvelope(raw) ? raw.data : raw)
  if (value === undefined) throw new Error('its reader refused it')
  return value
}

// `read` returns the value, or undefined for one it refuses, as a paste reader does. A value that cannot be read is copied aside before
// anything can save over it, through the store's `keep` when it has one: a copy the browser refuses must stop saving, not be forgotten.
function load (store, { key, read }) {
  const raw = store.getData(key)
  if (raw === null) return { value: undefined }
  try {
    return { value: readSaved(raw, read) }
  } catch (error) {
    const unreadable = error.message || String(error) || 'its reader threw'
    const { slot, copied } = keptSlot(store, key, raw)
    if (copied) {
      if (store.keep) store.keep(slot, raw)
      else store.setData(slot, raw)
      console.warn(`${key}: the saved value could not be read (${unreadable}); it is kept under ${slot}`)
    }
    return { value: undefined, unreadable }
  }
}

const hasUnreadable = (store, key) => store.getData(key + UNREADABLE_SUFFIX) !== null

// A puzzle's saved data is keyed by its id; one with none of its own (a replay or a pack) is told apart by its page URL.
const puzzleKey = (puzzleId, href) => String(puzzleId || href)

// A value already saved as it is writes nothing: a write is a storage round trip, and a drag or a note edit repeats the same value.
function save (store, key, data) {
  const envelope = { v: STORE_VERSION, data }
  if (JSON.stringify(store.getData(key)) === JSON.stringify(envelope)) return
  store.setData(key, envelope)
}
