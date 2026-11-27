/* eslint-disable no-unused-vars */
/* global readSaved */
const KEPT_PUZZLES = 50

// The index lists puzzle keys least recently used first: the one a script last wrote or opened is at the end.
function readIndex (saved) {
  if (saved === null || saved === undefined) return []
  if (!Array.isArray(saved) || !saved.every((key) => typeof key === 'string')) throw new Error(`the saved index is not a list of puzzle keys: ${JSON.stringify(saved).slice(0, 200)}`)
  return saved
}

function touchIndex (index, key) {
  const next = index.filter((k) => k !== key).concat(key)
  return { index: next.slice(-KEPT_PUZZLES), dropped: next.slice(0, Math.max(0, next.length - KEPT_PUZZLES)) }
}

// Whether `key` holds `value`, saved in an envelope or not: the guarded store drops a write the browser refuses (a full localStorage) instead of throwing.
const landed = (store, key, value) => {
  const saved = store.getData(key)
  return saved !== null && JSON.stringify(readSaved(saved, (data) => data)) === JSON.stringify(value)
}

// `store` has Framework's getData, setData and removeData; `kept` is `{ indexKey, forget(store, puzzleKey) }`. Writes `value` under `dataKey` and makes puzzle `key`
// the newest in `index`. The value is written before the index, and the dropped puzzles' data is removed last, each step only once the one before it landed,
// so a write that throws or is dropped loses nothing already saved.
function writeIndexed (store, kept, index, key, dataKey, value, write = (k, v) => store.setData(k, v)) {
  const touched = touchIndex(index, key)
  write(dataKey, value)
  if (!landed(store, dataKey, value)) return
  // An index already in this order writes nothing: a write is a storage round trip.
  if (JSON.stringify(touched.index) !== JSON.stringify(index)) store.setData(kept.indexKey, touched.index)
  if (!landed(store, kept.indexKey, touched.index)) return
  for (const dropped of touched.dropped) kept.forget(store, dropped)
}
