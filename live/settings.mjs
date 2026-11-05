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

// Opens a script's settings dialog the way a user finds it (its entry, named `entryText`, in the Experimental group) and waits for
// its editor, the element matching `editorSel`.
export async function openScriptDialog (p, entryText, editorSel) {
  await openSettings(p)
  await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: entryText }).first().click()
  await p.locator(editorSel).waitFor({ state: 'visible' })
}

// The open dialog's button whose whole label is `text`.
export const dialogButton = (p, text) => p.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()

// Presses the dialog button named `text` (Save or Cancel) and waits for the editor matching `editorSel` to go.
export async function closeDialogWith (p, text, editorSel) {
  await dialogButton(p, text).click()
  await p.locator(editorSel).waitFor({ state: 'detached' })
}

const EXTRAS_EDITOR = '#pen-tool-extras-editor'
export const openExtrasEditor = (p) => openScriptDialog(p, 'Pen tool extras', EXTRAS_EDITOR)
export const closeExtrasEditorWith = (p, text) => closeDialogWith(p, text, EXTRAS_EDITOR)

// The opacity each element matching `selector` shows at, in document order: its own times every ancestor's, since
// pen-tool-extras puts the slider's value on the pen layer and leaves each stroke solid. Rounded to 3 places.
export const effectiveOpacities = (page, selector) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => {
  let product = 1
  for (let el = e; el && el.nodeType === 1; el = el.parentElement) product *= parseFloat(window.getComputedStyle(el).opacity)
  return Math.round(product * 1000) / 1000
}), selector)
