// Shared by the live checks: waits for a page to show an expected value. Not a check itself, so
// `live/*.live.mjs` skips it.

import { setTimeout as sleep } from 'node:timers/promises'

// How often `settle` reads, and the backstop for a page that never settles.
export const POLL_MS = 50
export const SETTLE_MS = 10000
// The value must hold this long after its last change before `settle` gives up on it: long enough for
// SudokuPad's own redraws to land one after another, short enough that a wrong expectation fails at once.
export const STABLE_MS = 300
// A value that never changes at all is read this long first, since the page may only start moving late.
export const FLOOR_MS = 1000

// Reads until the value equals `expected` (compared as JSON) and returns it. Otherwise it returns the last value
// as soon as that value has stayed the same for `quietMs` after its last change, or for FLOOR_MS from the start
// when it never changed, so the caller's assert fails on a page that has stopped, not after `timeoutMs`.
// `timeoutMs` still ends the wait for a page that keeps moving. A caller that waits for something SudokuPad
// does late on purpose gives a longer `quietMs`, or `Infinity` to wait out `timeoutMs` whatever the value does.
export async function settle (read, expected, timeoutMs = SETTLE_MS, quietMs = STABLE_MS) {
  const want = JSON.stringify(expected)
  const start = Date.now()
  const deadline = start + timeoutMs
  let value = await read()
  let seen = JSON.stringify(value)
  let changedAt = start
  let changed = false
  while (seen !== want && Date.now() < deadline) {
    await sleep(POLL_MS)
    value = await read()
    const now = Date.now()
    if (JSON.stringify(value) !== seen) {
      seen = JSON.stringify(value)
      changedAt = now
      changed = true
    } else if (seen !== want && now - changedAt >= quietMs && (changed || now - start >= FLOOR_MS)) {
      break
    }
  }
  return value
}
