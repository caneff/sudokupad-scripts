// Shared by the live checks: waits for a page to show an expected value (`settle`), to stop changing (`stable`) or to give a reading that passes a test (`readUntil`), and clicks until a click takes (`clickUntil`). Not a check itself, so
// `live/*.live.mjs` skips it.

import { setTimeout as sleep } from 'node:timers/promises'

// How often `settle` and `stable` read, and the backstop for a page that never settles.
export const POLL_MS = 50
export const SETTLE_MS = 10000
// The value must hold this long after its last change before `settle` gives up on it, and before `stable` returns it: long enough for
// SudokuPad's own redraws to land one after another, short enough that a wrong expectation fails at once.
export const STABLE_MS = 300
// A value that never changes at all is read this long first, since the page may only start moving late.
export const FLOOR_MS = 1000
// How long one click gets to show its effect before `clickUntil` clicks again. The throttle it absorbs is a few hundred ms.
export const CLICK_TAKES_MS = 300

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

// Reads until the value has held for STABLE_MS and returns it: for a value with no expected answer, such as a
// button's point while its dialog lays out. Two values are the same when `equal` says so (default: equal as
// JSON); a value JSON cannot compare well, such as a screenshot's Buffer, passes its own. The hold is the time
// from the end of the read that first returned the value to the start of a later read that returned it again,
// so a read that itself takes long on a loaded box cannot make two nearby samples pass for a held value.
// Throws, naming the first 200 characters of the last value as JSON, when it is still changing at `timeoutMs`.
export async function stable (read, timeoutMs = SETTLE_MS, equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)) {
  const deadline = Date.now() + timeoutMs
  let value = await read()
  let changedAt = Date.now()
  for (;;) {
    await sleep(POLL_MS)
    const startedAt = Date.now()
    if (startedAt > deadline) throw new Error(`the value did not stop changing in ${timeoutMs} ms; last ${JSON.stringify(value).slice(0, 200)}`)
    const next = await read()
    if (!equal(value, next)) {
      value = next
      changedAt = Date.now()
    } else if (startedAt - changedAt >= STABLE_MS) {
      return next
    }
  }
}

// Reads until `holds(reading)` and returns that reading: for a read that checks itself, such as a region taken before
// and after a slow capture. The deadline is looked at only after a reading fails, so a slow read that holds is
// returned however long it took, and a read with deadlines of its own cannot use up this one on a still page.
// Throws, naming the first 200 characters of the last reading as JSON, when a reading fails past `timeoutMs`.
export async function readUntil (read, holds, timeoutMs = SETTLE_MS) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const reading = await read()
    if (holds(reading)) return reading
    if (Date.now() > deadline) throw new Error(`no reading held in ${timeoutMs} ms; last ${JSON.stringify(reading).slice(0, 200)}`)
    await sleep(POLL_MS)
  }
}

// SudokuPad throttles refreshControls, which binds a new button's click handler, so a click in the first moments after a script is
// injected is dead. Clicks (`click` is an async function) until `read` shows `expected` (compared as JSON), giving each click
// `clickTakesMs`, and stops clicking once `deadlineMs` has passed; returns the last reading. A handler that never binds ends at
// the deadline with the wrong value, so the caller's assert fails. A button that toggles passes a `clickTakesMs` longer than its
// effect takes, since a second click undoes the first. `settle`'s FLOOR_MS caps it for a value that does not change.
export async function clickUntil (click, read, expected, deadlineMs, clickTakesMs = CLICK_TAKES_MS) {
  const deadline = Date.now() + deadlineMs
  let value
  do {
    await click()
    value = await settle(read, expected, clickTakesMs)
  } while (JSON.stringify(value) !== JSON.stringify(expected) && Date.now() < deadline)
  return value
}
