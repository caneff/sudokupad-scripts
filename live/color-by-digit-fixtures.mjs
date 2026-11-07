// Color by Digit's live fixtures: the board, the saved profiles every session starts with, the storage keys, the
// script's selectors, and the helpers that open a session on that board. Not a check itself, so `live/*.live.mjs` skips it.
// The keys are typed out here, not imported from the script (docs/adr/0001-live-tests-type-storage-keys.md).

import { setTimeout as sleep } from 'node:timers/promises'
import { openPage, startPuzzle } from './page.mjs'
import { POLL_MS } from './settle.mjs'

// The puzzle's givens, row by row, 0 for empty. Must match the board built by puzzle-url.txt; the
// 'the board holds the givens' test in color-by-digit.live.mjs checks it.
export const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'

export const group = (key, digits) => ({ key, digits })
export const ODD_EVEN = [group('1', ['1', '3', '5', '7', '9']), group('2', ['0', '2', '4', '6', '8'])]
export const LOW_FIVE_HIGH = [group('1', ['0', '1', '2', '3', '4']), group('5', ['5']), group('9', ['6', '7', '8', '9'])]

// The saved profiles every session starts with: Odd/Even active, Low/5/High to switch to. The fresh install and the
// migration are checked in color-by-digit-profiles.live.mjs.
export const SEED = { profiles: [{ name: 'Odd/Even', groups: ODD_EVEN }, { name: 'Low/5/High', groups: LOW_FIVE_HIGH }], active: 0 }

// The keys the script saves under, and the ones Framework.setData stores them at (the site's own prefix in front).
const storedAt = (key) => `svencodes_${key}`
export const PROFILES_KEY = 'ColorByDigit_profiles'
export const PROFILES_STORAGE_KEY = storedAt(PROFILES_KEY)
export const LEGACY_STORAGE_KEY = storedAt('ColorByDigit_groups')
export const ADDED_PRELOADS_STORAGE_KEY = storedAt('ColorByDigit_addedPreloads')
// Saved profiles with the one-time Entropic and Modular add already done, so a test sees exactly the profiles it seeded.
export const savedProfiles = (state) => ({ [PROFILES_STORAGE_KEY]: state, [ADDED_PRELOADS_STORAGE_KEY]: true })
export const MODE_KEY = 'ColorByDigit_mode'
export const MODE_STORAGE_KEY = storedAt(MODE_KEY)
// Auto mode's on/off from before the mode existed, read for the starting mode when no mode is saved.
export const AUTO_KEY = 'ColorByDigit_auto'
export const AUTO_STORAGE_KEY = storedAt(AUTO_KEY)
// The mode's value on an untouched board: SEED's profiles with the mode saved Off, so nothing is colored until a test says so.
export const SEEDED_OFF = { ...savedProfiles(SEED), [MODE_STORAGE_KEY]: 'off' }

export const BUTTON = '#control-colorbydigit'
export const EDITOR = '#color-by-digit-editor'

// How long a "nothing happened" check watches. A fixed sleep is correct only here.
const QUIET_MS = 500

// Watches `read` for QUIET_MS and returns every distinct reading.
export async function watch (read) {
  const seen = [JSON.stringify(await read())]
  const deadline = Date.now() + QUIET_MS
  while (Date.now() < deadline) {
    await sleep(POLL_MS)
    const now = JSON.stringify(await read())
    if (now !== seen[seen.length - 1]) seen.push(now)
  }
  return seen.map((s) => JSON.parse(s))
}

// Runs the loaded page through the script's injection time for `mode` (document-idle is already set up by `openSession`)
// and Start Puzzle, and returns once the script's button shows.
export async function startInjected (p, script, mode = 'after-start') {
  await startPuzzle(p, {
    injection: { mode, code: script },
    beforeStart: mode === 'before-start' ? () => p.locator(BUTTON).waitFor({ state: 'attached' }) : undefined
  })
  await p.locator(BUTTON).waitFor({ state: 'visible' })
}

// A page with `script` injected at `mode`. `saved` maps a localStorage key to a JSON value, written before the page's own
// scripts run and only while the key is absent, so a reload keeps what was saved. `force` is written every load.
// With neither, the page starts with SEED saved as the profiles and the mode saved Off.
export async function openSession (browser, script, { saved = SEEDED_OFF, force = {}, contextOptions = {}, mode = 'after-start' } = {}) {
  const entries = (object) => Object.entries(object).map(([key, value]) => [key, JSON.stringify(value)])
  const opened = await openPage(browser, {
    contextOptions,
    injection: { mode, code: script },
    seed: async (page) => {
      await page.addInitScript((list) => {
        list.forEach(([key, value]) => { if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value) })
      }, entries(saved))
      await page.addInitScript((list) => list.forEach(([key, value]) => window.localStorage.setItem(key, value)), entries(force))
    }
  })
  await startInjected(opened.p, script, mode)
  return opened
}
