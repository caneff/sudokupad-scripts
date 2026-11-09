// Shared by the live checks: opening SudokuPad's settings dialog the way a user finds a script's
// entry, the version in a script's header, and the Copy settings and Paste settings buttons of the scripts with a dialog. Not a check itself, so `live/**/*.live.mjs` skips it.

import { createRequire } from 'node:module'

// The label of the group every script's settings entry is in.
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

// Waits for the animations on the dialog around `locator`'s element and on its overlay to end.
export const animationsDone = (locator) => locator.evaluate((el) => Promise.all([el.closest('.dialog'), el.closest('.dialog-overlay')]
  .flatMap((e) => e.getAnimations()).map((a) => a.finished)))

// The open dialog's button whose whole label is `text`.
export const dialogButton = (p, text) => p.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()

// Presses the dialog button named `text` (Save or Cancel) and waits for the editor matching `editorSel` to go.
export async function closeDialogWith (p, text, editorSel) {
  await dialogButton(p, text).click()
  await p.locator(editorSel).waitFor({ state: 'detached' })
}

export const EXTRAS_EDITOR = '#pen-tool-extras-editor'
export const openExtrasEditor = (p) => openScriptDialog(p, 'Pen Tool Extras', EXTRAS_EDITOR)
export const closeExtrasEditorWith = (p, text) => closeDialogWith(p, text, EXTRAS_EDITOR)

// The opacity each element matching `selector` shows at, in document order: its own times every ancestor's, since
// pen-tool-extras puts the slider's value on the pen layer and leaves each stroke solid. Rounded to 3 places.
export const effectiveOpacities = (page, selector) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => {
  let product = 1
  for (let el = e; el && el.nodeType === 1; el = el.parentElement) product *= parseFloat(window.getComputedStyle(el).opacity)
  return Math.round(product * 1000) / 1000
}), selector)

export const STATUS = '.dialog [data-role="settings-status"]'
// Every script's two buttons are icons, so each pair is found by its act, not its words.
export const actButton = (p, act) => p.locator(`.dialog button[data-act="${act}"]`)
const ODD_EVEN = [{ key: '1', digits: ['1', '3', '5', '7', '9'] }, { key: '2', digits: ['0', '2', '4', '6', '8'] }]

// `asDefault`, where there is one, is the value that Copy writes for a setting at its default and that the script saves as no key.
// `saved` is a value the script saves under `key`, inside a `{ v, data }` envelope where `enveloped` is set; `badKey` and `bad` are a value the script's reader refuses.
export const SETTINGS_SCRIPTS = [
  { file: 'dark-page.user.js', owns: /^DarkPage_/, entry: 'Dark Page', editor: '#dark-page-input', key: 'DarkPage_color', saved: '#336699', asDefault: '#000000', badKey: 'DarkPage_color', bad: 'blue' },
  { file: 'auto-rules-resizer.user.js', owns: /^AutoRulesResizer_/, entry: 'Rules Resizer', editor: '#auto-rules-resizer-max-width', key: 'AutoRulesResizer_maxWidth', saved: 640, enveloped: true, asDefault: null, badKey: 'AutoRulesResizer_maxHeight', bad: 'tall' },
  { file: 'color-by-digit.user.js', owns: /^ColorByDigit_/, entry: 'Color by Digit', editor: '#color-by-digit-editor', key: 'ColorByDigit_profiles', saved: { profiles: [{ name: 'Mine', groups: ODD_EVEN }], active: 0 }, enveloped: true, badKey: 'ColorByDigit_mode', bad: 'sideways' },
  { file: 'draw-tool.user.js', owns: /^TextAnywhere_/, entry: 'Text Anywhere', editor: '#text-anywhere-dialog', key: 'TextAnywhere_width', saved: 3.5, badKey: 'TextAnywhere_width', bad: 500 },
  { file: 'pen-tool-extras.user.js', owns: /^(PenColor_|EdgeMarks_)/, entry: 'Pen Tool Extras', editor: '#pen-tool-extras-editor', key: 'PenColor_thickness', saved: 9, asDefault: 5, badKey: 'PenColor_opacity', bad: 7 }
]

// Every key `script` (one of SETTINGS_SCRIPTS) owns, as it is in localStorage, by key in order: what a check that nothing was saved compares.
export const ownedSettings = (p, script) => p.evaluate((pattern) => Object.fromEntries(Object.keys(window.localStorage)
  .filter((k) => new RegExp(pattern).test(k.replace(/^svencodes_/, ''))).sort().map((k) => [k, window.localStorage.getItem(k)])), script.owns.source)

// Puts `text` on the clipboard, clears the last status, presses Paste settings and returns the status it shows.
export async function paste (p, text) {
  await p.evaluate(([selector, t]) => { document.querySelector(selector).textContent = ''; return navigator.clipboard.writeText(t) }, [STATUS, text])
  await actButton(p, 'paste-settings').click()
  const status = p.locator(STATUS).filter({ hasText: /\S/ })
  await status.waitFor()
  return status.textContent()
}
