// Shared by the three Color by Digit live files: the board, the saved profiles every session starts with, the storage
// keys, and the helpers that open a session on that board. Not a check itself, so `live/*.live.mjs` skips it.
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
export const PROFILES_KEY = 'ColorByDigit_profiles'
export const PROFILES_STORAGE_KEY = 'svencodes_ColorByDigit_profiles'
export const LEGACY_STORAGE_KEY = 'svencodes_ColorByDigit_groups'
export const AUTO_KEY = 'ColorByDigit_auto'
export const AUTO_STORAGE_KEY = 'svencodes_ColorByDigit_auto'

// How long a "nothing happened" check watches. A fixed sleep is correct only here.
export const QUIET_MS = 500

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

const BUTTON = '#control-colorbydigit'

// Runs the loaded page through the script's injection time for `mode` (document-idle is already set up by `openSession`)
// and Start Puzzle, and returns once the script's button shows.
export async function startInjected (p, script, mode = 'after-start') {
  await startPuzzle(p, {
    injection: { mode, code: script },
    beforeStart: mode === 'before-start' ? () => p.locator(BUTTON).waitFor({ state: 'attached' }) : undefined
  })
  await p.locator(BUTTON).waitFor({ state: 'visible' })
}

// A page with `script` injected at `mode`. `seed` maps a localStorage key to a JSON value, written before the page's own
// scripts run and only while the key is absent, so a reload keeps what was saved. `force` is written every load.
// With neither, the page starts with SEED saved as the profiles.
export async function openSession (browser, script, { seed = { [PROFILES_STORAGE_KEY]: SEED }, force = {}, contextOptions = {}, mode = 'after-start' } = {}) {
  const entries = (object) => Object.entries(object).map(([key, value]) => [key, JSON.stringify(value)])
  const opened = await openPage(browser, {
    contextOptions,
    injection: { mode, code: script },
    seed: async (page) => {
      await page.addInitScript((list) => {
        list.forEach(([key, value]) => { if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value) })
      }, entries(seed))
      await page.addInitScript((list) => list.forEach(([key, value]) => window.localStorage.setItem(key, value)), entries(force))
    }
  })
  await startInjected(opened.p, script, mode)
  return opened
}
