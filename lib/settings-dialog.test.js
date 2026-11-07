'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text.
const NAMES = ['RELEASE_EVENTS', 'SETTINGS_GROUP', 'swallowRelease', 'closeDialogKeepingGrid', 'addSettingsEntry', 'renderDialogTitle', 'dialogTitleCss']
const { RELEASE_EVENTS, SETTINGS_GROUP, swallowRelease, closeDialogKeepingGrid, addSettingsEntry, renderDialogTitle, dialogTitleCss } =
  new Function(`${fs.readFileSync(path.join(__dirname, 'settings-dialog.js'), 'utf8')}\nreturn { ${NAMES.join(', ')} }`)() // eslint-disable-line no-new-func

// A window that records which listeners are attached and lets a test dispatch to them.
const fakeWindow = () => {
  const listeners = []
  return {
    listeners,
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
    removeEventListener: (type, fn, capture) => {
      const at = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture)
      if (at >= 0) listeners.splice(at, 1)
    },
    fire: (type) => {
      const event = { type, stopped: false, stopImmediatePropagation () { this.stopped = true } }
      listeners.filter((l) => l.type === type).forEach((l) => l.fn(event))
      return event
    }
  }
}

test('the entry sits in the experimental group', () => {
  assert.equal(SETTINGS_GROUP, 'experimental')
})

test('closing keeping the grid closes the dialog and swallows every release event', () => {
  const win = fakeWindow()
  let closed = 0
  closeDialogKeepingGrid({ closeDialog: () => { closed++ } }, win)
  assert.equal(closed, 1)
  for (const type of RELEASE_EVENTS) assert.equal(win.fire(type).stopped, true, type)
})

test('the next press ends the swallowing, so a release after it reaches the page', () => {
  const win = fakeWindow()
  swallowRelease(win)
  win.fire('pointerdown')
  assert.deepEqual(win.listeners, [])
  assert.equal(win.fire('mouseup').stopped, false)
})

test('the entry closes the settings dialog with the swallow on, then opens the script\'s dialog after the close', async () => {
  const win = fakeWindow()
  const calls = []
  let setting = null
  const framework = { closeDialog: () => calls.push('close'), addSetting: (s) => { setting = s } }
  addSettingsEntry(framework, { name: 'demo', content: 'Demo', open: () => calls.push('open') })
  assert.deepEqual({ ...setting, handler: undefined }, { tag: 'button', name: 'demo', group: 'experimental', content: 'Demo', handler: undefined })
  global.window = win
  try { setting.handler() } finally { delete global.window }
  assert.deepEqual(calls, ['close'], 'the dialog opens only after the close has settled')
  assert.equal(win.fire('mouseup').stopped, true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(calls, ['close', 'open'])
})

test('the title row is the name, the version beside it, then the status and the icons at the right end, after its own rules', () => {
  const html = renderDialogTitle({ prefix: 'x-', name: 'Demo', version: '1.2.3' })
  assert.equal(html.slice(0, html.indexOf('<div')), `<style>${dialogTitleCss('x-')}</style>`)
  assert.match(html.slice(html.indexOf('<div')), /^<div class="x-title-row"><span><b>Demo<\/b> <small class="x-version">v1\.2\.3<\/small><\/span><span data-role="settings-status"><\/span><span class="x-tools"><button[\s\S]*<\/button><\/span><\/div>$/)
})

test('Copy settings and Paste settings are two icon buttons with the status before them, each with a title and label and no words', () => {
  const html = renderDialogTitle({ prefix: 'x-', name: 'Demo', version: '1.2.3' })
  assert.match(html, /<span data-role="settings-status"><\/span><span class="x-tools"><button type="button" data-act="copy-settings" title="Copy settings" aria-label="Copy settings"><svg[^>]*>[\s\S]*<\/svg><\/button><button type="button" data-act="paste-settings" title="Paste settings" aria-label="Paste settings"><svg/)
  assert.doesNotMatch(html.replace(/<svg[\s\S]*?<\/svg>/g, ''), />(Copy|Paste) settings</)
})

test('the title rules dim the version, lay the row out, and let the status wrap in the room the title leaves', () => {
  const css = dialogTitleCss('x-').replace(/\s+/g, ' ')
  assert.match(css, /\.x-version \{ opacity: \.6; \}/)
  assert.match(css, /\.x-title-row \{ display: flex; align-items: center;/)
  assert.match(css, /\.x-title-row \[data-role="settings-status"\] \{[^}]*flex: 1 1 0;[^}]*min-width: 0;[^}]*contain: inline-size;/)
})
