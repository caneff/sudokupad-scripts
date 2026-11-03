// Shared by the live checks: opening SudokuPad's settings dialog the way a user finds a script's
// entry, and the version in a script's header. Not a check itself, so `live/*.live.mjs` skips it.

import { createRequire } from 'node:module'

// The label of the group every script's settings entry is in.
const GROUP_LABEL = 'Experimental'

export const { headerVersion } = createRequire(import.meta.url)('../header-version.js')

// Opens the settings dialog, expands the Experimental group (SudokuPad starts it collapsed) and
// returns the group's locator.
export async function openSettings (p) {
  await p.click('#control-settings')
  const labelled = p.locator('.dialog .setting-group').filter({ has: p.locator('label', { hasText: GROUP_LABEL }) })
  await labelled.waitFor({ state: 'visible' })
  const open = p.locator('.dialog .setting-group:not(.closed)').filter({ has: p.locator('label', { hasText: GROUP_LABEL }) })
  if (await open.count() === 0) await labelled.locator('label').first().click()
  await open.waitFor({ state: 'visible' })
  return open
}
