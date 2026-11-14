// Shared by the live checks: opening SudokuPad's settings dialog the way a user finds a script's
// entry, the version in a script's header, and the Copy settings and Paste settings buttons of the scripts with a dialog. Not a check itself, so `live/**/*.live.mjs` skips it.

import { createRequire } from 'node:module'

const GROUP_LABEL = 'Experimental'

export const { headerVersion } = createRequire(import.meta.url)('../test/header-version.js')

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
// its editor, the element matching `editorSel`, to come to rest: SudokuPad slides a dialog in with CSS animations on it and its
// overlay, so a point read before they end is off by up to the dialog's height.
export async function openScriptDialog (p, entryText, editorSel) {
  await openSettings(p)
  await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: entryText }).first().click()
  const editor = p.locator(editorSel)
  await editor.waitFor({ state: 'visible' })
  await animationsDone(editor)
}

export const animationsDone = (locator) => locator.evaluate((el) => Promise.all([el.closest('.dialog'), el.closest('.dialog-overlay')]
  .flatMap((e) => e.getAnimations()).map((a) => a.finished)))

export const dialogButton = (p, text) => p.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()

export async function closeDialogWith (p, text, editorSel) {
  await dialogButton(p, text).click()
  await p.locator(editorSel).waitFor({ state: 'detached' })
}

export const EXTRAS_EDITOR = '#pen-tool-extras-editor'
export const openExtrasEditor = (p) => openScriptDialog(p, 'Pen Tool Extras', EXTRAS_EDITOR)
export const closeExtrasEditorWith = (p, text) => closeDialogWith(p, text, EXTRAS_EDITOR)

export const STATUS = '.dialog [data-role="settings-status"]'
// Every script's two buttons are icons, so each pair is found by its act, not its words.
export const actButton = (p, act) => p.locator(`.dialog button[data-act="${act}"]`)
export const ownedSettings = (p, script) => p.evaluate((pattern) => Object.fromEntries(Object.keys(window.localStorage)
  .filter((k) => new RegExp(pattern).test(k.replace(/^svencodes_/, ''))).sort().map((k) => [k, window.localStorage.getItem(k)])), script.owns.source)

export async function paste (p, text) {
  await p.evaluate(([selector, t]) => { document.querySelector(selector).textContent = ''; return navigator.clipboard.writeText(t) }, [STATUS, text])
  await actButton(p, 'paste-settings').click()
  const status = p.locator(STATUS).filter({ hasText: /\S/ })
  await status.waitFor()
  return status.textContent()
}
