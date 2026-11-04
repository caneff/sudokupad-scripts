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

// The scale of a computed `transform` (a `matrix(s, 0, 0, s, 0, 0)` or `none`): pen-tool-extras grows edge and corner marks
// by a CSS scale, so a mark's width on screen is its stroke width times this.
export const scaleOf = (transform) => transform === 'none' ? 1 : parseFloat(/matrix\(([\d.]+)/.exec(transform)[1])

// The width a stroke draws at on screen, from its computed `strokeWidth` and `transform`, rounded to 4 places.
export const drawnWidth = ({ strokeWidth, transform }) => Math.round(parseFloat(strokeWidth) * scaleOf(transform) * 1e4) / 1e4

// The opacity each element matching `selector` shows at, in document order: its own times every ancestor's, since
// pen-tool-extras puts the slider's value on the pen layer and leaves each stroke solid. Rounded to 3 places.
export const effectiveOpacities = (page, selector) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => {
  let product = 1
  for (let el = e; el && el.nodeType === 1; el = el.parentElement) product *= parseFloat(window.getComputedStyle(el).opacity)
  return Math.round(product * 1000) / 1000
}), selector)
