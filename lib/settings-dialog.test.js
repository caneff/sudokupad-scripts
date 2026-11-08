'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text.
const NAMES = ['ERROR_LOG_KEY', 'RELEASE_EVENTS', 'SETTINGS_GROUP', 'swallowRelease', 'closeDialogKeepingGrid', 'addSettingsEntry', 'renderDialogTitle', 'dialogTitleCss', 'showSettingsDialog', 'buttonRowCss', 'setDialogStatus', 'errorText', 'snapshotStore']
const { ERROR_LOG_KEY, RELEASE_EVENTS, SETTINGS_GROUP, swallowRelease, closeDialogKeepingGrid, addSettingsEntry, renderDialogTitle, dialogTitleCss, showSettingsDialog, buttonRowCss, setDialogStatus, errorText, snapshotStore } =
  new Function(`${fs.readFileSync(path.join(__dirname, 'sudokupad.js'), 'utf8')}\n${fs.readFileSync(path.join(__dirname, 'settings-dialog.js'), 'utf8')}\nreturn { ${NAMES.join(', ')} }`)() // eslint-disable-line no-new-func

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

test('the entry logs a throw from open with the script name instead of leaving it uncaught', async () => {
  const win = fakeWindow()
  const logged = []
  const framework = { closeDialog: () => {}, addSetting: (s) => { setting = s } }
  let setting = null
  addSettingsEntry(framework, { name: 'demo', content: 'Demo', open: () => { throw new Error('no board') } }, { log: (...args) => logged.push(args) })
  global.window = win
  try { setting.handler() } finally { delete global.window }
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(logged.map(([message, error]) => [message, error.message]), [['demo: could not open its settings dialog', 'no board']])
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

// A SudokuPad whose showDialog records the parts and, like the real one, puts a button for each option in the dialog's `.dialog-options`.
const fakeShell = ({ withBody = true } = {}) => {
  const log = []
  let buttons = []
  const status = { textContent: '' }
  const errorLogRow = { listeners: [], addEventListener (type, fn) { this.listeners.push(fn) } }
  const body = { closest: (sel) => sel === '.dialog' ? { querySelector: (s) => s === '.dialog-options' ? { querySelectorAll: () => buttons } : s === '[data-role="settings-status"]' ? status : s === '[data-role="error-log"]' ? errorLogRow : null } : null }
  const styles = []
  const doc = {
    head: { appendChild: (el) => styles.push(el) },
    createElement: () => ({}),
    getElementById: (id) => id === 'demo-body' ? (withBody ? body : null) : styles.find((el) => el.id === id) ?? null
  }
  const framework = {
    showDialog: (config) => {
      log.push(['show', config])
      const options = config.parts.find((part) => part.tag === 'options').options
      buttons = options.map(() => ({ dataset: {} }))
    },
    closeDialog: () => log.push(['close'])
  }
  const win = fakeWindow()
  return { log, framework, doc, win, styles, status, errorLogRow, buttons: () => buttons }
}
const shellOptions = (over = {}) => ({ prefix: 'x-', name: 'Demo', version: '1.2.3', bodyId: 'demo-body', changed: () => true, save: () => {}, ...over })
const shown = (shell) => shell.log.find(([what]) => what === 'show')[1]
const optionsOf = (shell) => shown(shell).parts.find((part) => part.tag === 'options').options

test('the shell shows the title, then an empty body container the script fills, then the buttons, centered over the board', () => {
  const shell = fakeShell()
  showSettingsDialog(shell.framework, shellOptions(), { doc: shell.doc, win: shell.win })
  const config = shown(shell)
  assert.equal(config.centerOverBoard, true)
  assert.deepEqual(config.parts.map((part) => part.tag), ['text', 'text', 'text', 'options'])
  assert.equal(config.parts[0].innerHTML, renderDialogTitle({ prefix: 'x-', name: 'Demo', version: '1.2.3' }))
  assert.equal(config.parts[1].innerHTML, '<div id="demo-body"></div>')
})

test('the buttons are Save, then Cancel, then the extra buttons in the order given', () => {
  const shell = fakeShell()
  const extraButtons = [{ content: 'Restore defaults', role: 'restore', handler: () => {} }, { content: 'More', role: 'more', handler: () => {} }]
  showSettingsDialog(shell.framework, shellOptions({ extraButtons }), { doc: shell.doc, win: shell.win })
  assert.deepEqual(optionsOf(shell).map((option) => option.content), ['Save', 'Cancel', 'Restore defaults', 'More'])
  assert.deepEqual(shell.buttons().map((button) => button.dataset.role), ['save', 'cancel', 'restore', 'more'])
})

test('Save writes when something changed, then closes the dialog with the grid kept', () => {
  const shell = fakeShell()
  const saved = []
  showSettingsDialog(shell.framework, shellOptions({ changed: () => true, save: () => saved.push('save') }), { doc: shell.doc, win: shell.win })
  optionsOf(shell)[0].handler()
  assert.deepEqual(saved, ['save'])
  assert.deepEqual(shell.log.slice(1), [['close']])
  assert.equal(shell.win.fire('mouseup').stopped, true)
})

test('a Save that throws says "Not saved: <message>" in the status line and keeps the dialog open', () => {
  const shell = fakeShell()
  showSettingsDialog(shell.framework, shellOptions({ save: () => { throw new Error('storage is full') } }), { doc: shell.doc, win: shell.win })
  optionsOf(shell)[0].handler()
  assert.equal(shell.status.textContent, 'Not saved: storage is full')
  assert.deepEqual(shell.log.slice(1), [])
})

test('a Save retried after a failure saves again even when changed() now reads false, then closes', () => {
  const shell = fakeShell()
  let fail = true
  let dirty = true
  const stored = []
  const save = () => { dirty = false; if (fail) throw new Error('storage is full'); stored.push('saved') }
  showSettingsDialog(shell.framework, shellOptions({ changed: () => dirty, save }), { doc: shell.doc, win: shell.win })
  optionsOf(shell)[0].handler()
  fail = false
  optionsOf(shell)[0].handler()
  assert.deepEqual(stored, ['saved'])
  assert.deepEqual(shell.log.slice(1), [['close']])
})

test('a Save that throws something that is not an Error shows it as itself', () => {
  const shell = fakeShell()
  showSettingsDialog(shell.framework, shellOptions({ save: () => { throw 'quota' } }), { doc: shell.doc, win: shell.win }) // eslint-disable-line no-throw-literal
  optionsOf(shell)[0].handler()
  assert.equal(shell.status.textContent, 'Not saved: quota')
})

test('errorText gives an Error its message and anything else as text, null included', () => {
  assert.equal(errorText(new Error('boom')), 'boom')
  assert.equal(errorText('quota'), 'quota')
  assert.equal(errorText(null), 'null')
})

test('setDialogStatus writes the status line inside the dialog it is given', () => {
  const status = { textContent: '' }
  setDialogStatus({ querySelector: (selector) => selector === '[data-role="settings-status"]' ? status : null }, 'hello')
  assert.equal(status.textContent, 'hello')
})

test('Save writes nothing when nothing changed, and still closes the dialog', () => {
  const shell = fakeShell()
  const saved = []
  showSettingsDialog(shell.framework, shellOptions({ changed: () => false, save: () => saved.push('save') }), { doc: shell.doc, win: shell.win })
  optionsOf(shell)[0].handler()
  assert.deepEqual(saved, [])
  assert.deepEqual(shell.log.slice(1), [['close']])
})

test('Cancel closes the dialog and never asks whether anything changed or saves', () => {
  const shell = fakeShell()
  const calls = []
  showSettingsDialog(shell.framework, shellOptions({ changed: () => { calls.push('changed'); return true }, save: () => calls.push('save') }), { doc: shell.doc, win: shell.win })
  optionsOf(shell)[1].handler()
  assert.deepEqual(calls, [])
  assert.deepEqual(shell.log.slice(1), [['close']])
})

test('an extra button runs its own handler and leaves the dialog open', () => {
  const shell = fakeShell()
  const calls = []
  showSettingsDialog(shell.framework, shellOptions({ extraButtons: [{ content: 'Restore defaults', role: 'restore', handler: () => calls.push('restore') }] }), { doc: shell.doc, win: shell.win })
  optionsOf(shell)[2].handler()
  assert.deepEqual(calls, ['restore'])
  assert.deepEqual(shell.log.slice(1), [])
})

test('the shell returns the body for the script to fill, and injects the script\'s dialog style once', () => {
  const shell = fakeShell()
  const options = shellOptions({ styleId: 'demo-style', css: '.x { color: red; }' })
  const first = showSettingsDialog(shell.framework, options, { doc: shell.doc, win: shell.win })
  showSettingsDialog(shell.framework, options, { doc: shell.doc, win: shell.win })
  assert.equal(first, shell.doc.getElementById('demo-body'))
  assert.deepEqual(shell.styles.map((el) => [el.id, el.textContent]).filter(([id]) => id === 'demo-style'), [['demo-style', '.x { color: red; }']])
})

test('the shell injects the button row rules once per dialog, keyed on its body', () => {
  const shell = fakeShell()
  showSettingsDialog(shell.framework, shellOptions(), { doc: shell.doc, win: shell.win })
  showSettingsDialog(shell.framework, shellOptions(), { doc: shell.doc, win: shell.win })
  assert.deepEqual(shell.styles.map((el) => [el.id, el.textContent]), [['settings-dialog-buttons-demo-body', buttonRowCss('demo-body')]])
})

test('the button row is one right-aligned row; Save is filled purple and Cancel and every extra button are plain', () => {
  const css = buttonRowCss('demo-body').replace(/\s+/g, ' ')
  const rule = (selector) => css.match(new RegExp(`${selector.replace(/[.[\]()^$*+?{}|]/g, '\\$&')} \\{([^}]*)\\}`))[1]
  const row = rule('.dialog:has(#demo-body) .dialog-options')
  assert.match(row, /display: flex !important/)
  assert.match(row, /flex-direction: row !important/)
  assert.match(row, /justify-content: flex-end/)
  const plain = rule('.dialog:has(#demo-body) .dialog-options button')
  assert.match(plain, /background: #f1eff5 !important/)
  const save = rule('.dialog:has(#demo-body) .dialog-options button[data-role="save"]')
  assert.match(save, /background: #6b3fa0 !important/)
  assert.match(save, /color: #fff !important/)
  assert.doesNotMatch(css, /data-role="(cancel|restore)"/)
})

test('when SudokuPad shows no dialog (another is open) the shell returns null', () => {
  const shell = fakeShell({ withBody: false })
  assert.equal(showSettingsDialog(shell.framework, shellOptions(), { doc: shell.doc, win: shell.win }), null)
})

test('the button row lightens Save and Cancel to #f3e5f5 on hover, darkens a press 10% and rings keyboard focus', () => {
  const css = buttonRowCss('demo-body').replace(/\s+/g, ' ')
  const rule = (selector) => css.match(new RegExp(`${selector.replace(/[.[\]()^$*+?{}|]/g, '\\$&')} \\{([^}]*)\\}`))[1]
  const row = '.dialog:has(#demo-body) .dialog-options'
  assert.match(rule(`${row} button:hover`), /background: #f3e5f5 !important/)
  assert.match(rule(`${row} button[data-role="save"]:hover`), /background: #f3e5f5 !important; color: #6b3fa0 !important/)
  assert.match(rule(`${row} button:active`), /box-shadow: inset 0 0 0 100vmax rgb\(0 0 0 \/ \.1\) !important/)
  assert.match(rule(`${row} button:focus-visible`), /outline: 2px solid #6a1b9a/)
})

test('the title\'s icon buttons ring keyboard focus', () => {
  assert.match(dialogTitleCss('demo-').replace(/\s+/g, ' '), /\.demo-tools button:focus-visible \{ outline: 2px solid #6a1b9a !important;/)
})

test('a Save that throws puts back what its snapshot took, before the status line says Not saved', () => {
  const shell = fakeShell()
  const seen = []
  const stored = { a: 1 }
  const snapshot = () => { const copy = { ...stored }; return () => { Object.assign(stored, copy); seen.push('restored') } }
  const save = () => { stored.a = 2; throw new Error('second step failed') }
  showSettingsDialog(shell.framework, shellOptions({ snapshot, save }), { doc: shell.doc, win: shell.win })
  optionsOf(shell)[0].handler()
  assert.deepEqual(stored, { a: 1 })
  assert.deepEqual(seen, ['restored'])
  assert.equal(shell.status.textContent, 'Not saved: second step failed')
})

test('a Save that succeeds never restores, and a Save with nothing changed takes no snapshot', () => {
  const shell = fakeShell()
  let snapshots = 0
  let restores = 0
  const snapshot = () => { snapshots++; return () => { restores++ } }
  showSettingsDialog(shell.framework, shellOptions({ changed: () => true, snapshot, save: () => {} }), { doc: shell.doc, win: shell.win })
  optionsOf(shell)[0].handler()
  assert.deepEqual([snapshots, restores], [1, 0])
  const idle = fakeShell()
  showSettingsDialog(idle.framework, shellOptions({ changed: () => false, snapshot, save: () => {} }), { doc: idle.doc, win: idle.win })
  optionsOf(idle)[0].handler()
  assert.equal(snapshots, 1)
})

test('a restore that throws is named in the status line beside the save failure', () => {
  const shell = fakeShell()
  const snapshot = () => () => { throw new Error('disk gone') }
  showSettingsDialog(shell.framework, shellOptions({ snapshot, save: () => { throw new Error('quota') } }), { doc: shell.doc, win: shell.win })
  optionsOf(shell)[0].handler()
  assert.equal(shell.status.textContent, 'Not saved: quota; the earlier values could not be put back: disk gone')
})

test('snapshotStore puts each key back to its value, and a key that was absent back to absent', () => {
  const data = { kept: { n: 1 }, changed: 'old' }
  const store = {
    getData: (key) => (key in data ? data[key] : null),
    setData: (key, value) => { data[key] = value },
    removeData: (key) => { delete data[key] }
  }
  const restore = snapshotStore(store, ['kept', 'changed', 'fresh'])
  data.changed = 'new'
  data.fresh = 'written'
  data.kept = { n: 2 }
  restore()
  assert.deepEqual(data, { kept: { n: 1 }, changed: 'old' })
})

// The error log row: Copy error log and Clear, under the script's body.
const errorLogShell = ({ stored = null, copyFails = false } = {}) => {
  const shell = fakeShell()
  const held = new Map(stored === null ? [] : [[ERROR_LOG_KEY, stored]])
  const copied = []
  shell.win.localStorage = { getItem: (key) => (held.has(key) ? held.get(key) : null), removeItem: (key) => held.delete(key) }
  shell.win.navigator = { clipboard: { writeText: async (text) => { if (copyFails) throw new Error('denied'); copied.push(text) } } }
  showSettingsDialog(shell.framework, shellOptions(), { doc: shell.doc, win: shell.win })
  const press = async (act) => {
    const event = { prevented: false, target: { closest: () => ({ dataset: { act } }) }, preventDefault () { this.prevented = true }, stopPropagation () {} }
    await Promise.all(shell.errorLogRow.listeners.map((fn) => fn(event)))
  }
  return { shell, held, copied, press }
}
const RECORD = { time: '2026-11-08T11:00:00.000Z', script: 'draw-tool', version: '1.0.0', sudokupad: '0.37.2', feature: 'text', url: 'https://u/1', message: 'boom', stack: 'Error: boom\n    at f (x.js:1:1)' }

test('the dialog has a Copy error log button and a Clear button in a row of their own', () => {
  const { shell } = errorLogShell()
  const html = shown(shell).parts[2].innerHTML
  assert.match(html, /data-role="error-log"/)
  assert.match(html, /<button type="button" data-act="copy-error-log">Copy error log<\/button>/)
  assert.match(html, /<button type="button" data-act="clear-error-log">Clear<\/button>/)
})

test('Copy error log puts the whole log, newest first, on the clipboard and says so', async () => {
  const older = { ...RECORD, feature: 'older' }
  const { shell, copied, press } = errorLogShell({ stored: JSON.stringify([older, RECORD]) })
  await press('copy-error-log')
  assert.equal(copied.length, 1)
  assert.ok(copied[0].indexOf('draw-tool@1.0.0 on SudokuPad 0.37.2: text') < copied[0].indexOf('older'))
  assert.equal(shell.status.textContent, 'Error log copied.')
})

test('with an empty log Copy error log copies nothing and says the log is empty', async () => {
  const { shell, copied, press } = errorLogShell()
  await press('copy-error-log')
  assert.deepEqual(copied, [])
  assert.equal(shell.status.textContent, 'The error log is empty.')
})

test('Clear removes the log and says so', async () => {
  const { shell, held, press } = errorLogShell({ stored: JSON.stringify([RECORD]) })
  await press('clear-error-log')
  assert.equal(held.has(ERROR_LOG_KEY), false)
  assert.equal(shell.status.textContent, 'Error log cleared.')
})

test('a copy that fails, or a log that cannot be read, is said in the status line, not swallowed', async () => {
  const denied = errorLogShell({ stored: JSON.stringify([RECORD]), copyFails: true })
  await denied.press('copy-error-log')
  assert.equal(denied.shell.status.textContent, 'Could not copy the error log: denied')
  const unreadable = errorLogShell({ stored: '{not json' })
  await unreadable.press('copy-error-log')
  assert.match(unreadable.shell.status.textContent, /^Could not copy the error log: /)
})
