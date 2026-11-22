'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLib } = require('./load-lib.js')
const { memoryStorage } = require('./fake-page-storage.js')

// SudokuPad's saved data, as the guard's store reads it by name, holding `saved`; `failOn` is a key whose write throws. A key with nothing
// saved reads null, as in SudokuPad.
const framework = (saved, failOn) => ({
  getData: (key) => (key in saved ? saved[key] : null),
  setData: (key, value) => {
    if (key === failOn) throw new Error(`planted write failure on ${key}`)
    saved[key] = value
  },
  removeData: (key) => { delete saved[key] }
})
const Framework = {}
const lib = loadLib(['plain', 'sudokupad', 'write-style', 'settings-dialog'], ['createGuard', 'snapshotStore', 'showSettingsDialog', 'SUDOKUPAD_PURPLE'], { Framework })

// SudokuPad's dialog as the settings dialog sees it: `showDialog` keeps the buttons, and the dialog holds the status line and the
// title row's click listener. `save()` presses Save, and `paste()` presses Paste settings.
const fakeSudokuPad = () => {
  const status = { textContent: '', dataset: {} }
  const clicks = []
  let options = []
  const dialog = {
    addEventListener: (type, fn) => { if (type === 'click') clicks.push(fn) },
    querySelector: (selector) => (selector === '[data-role="settings-status"]' ? status : selector === '[data-role="off-note"]' ? {} : selector === '[data-role="error-log"]' ? { addEventListener () {} } : null)
  }
  const body = { closest: (selector) => (selector === '.dialog' ? dialog : null), addEventListener () {} }
  const doc = { head: { appendChild () {} }, createElement: () => ({}), getElementById: (id) => (id === 'demo-body' ? body : null) }
  const win = { addEventListener () {}, removeEventListener () {}, get navigator () { return globalThis.navigator } }
  const dialogs = { showDialog: (config) => { options = config.parts.find((part) => part.tag === 'options').options }, closeDialog () {} }
  const press = (act) => Promise.all(clicks.map((fn) => fn({ target: { closest: () => ({ dataset: { act } }) }, preventDefault () {}, stopPropagation () {} })))
  return { status, doc, win, dialogs, save: () => options[0].handler(), paste: () => press('paste-settings') }
}

const withClipboard = async (text, run) => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { readText: async () => text } }, configurable: true })
  try { await run() } finally { if (saved) Object.defineProperty(globalThis, 'navigator', saved); else delete globalThis.navigator }
}

// A script's settings dialog as every script now builds it: a guard feature, the guard's store for it, two keys and their in-memory
// mirror under one snapshot, and Save and Paste writing both keys through the store. The second key's write throws, or with `ownThrow`
// the script's own step after the first write does.
function openDialog ({ ownThrow = false } = {}) {
  globalThis.localStorage = memoryStorage()
  const saved = { A_width: 300 }
  Object.assign(Framework, framework(saved, ownThrow ? null : 'A_height'))
  const guard = lib.createGuard({ script: 'demo', name: 'Demo', version: '1.0.0', features: { settings: { label: 'saved settings', needs: {} } } })
  const feature = guard.features.settings
  const store = guard.storeFor(feature)
  const state = { mirror: { width: 300, height: null } }
  const holdMirror = () => { const was = state.mirror; return () => { state.mirror = was } }
  const write = (values) => {
    state.mirror = { width: values.A_width, height: values.A_height }
    for (const [key, value] of Object.entries(values)) {
      store.setData(key, value)
      if (ownThrow) throw new Error('the script\'s own step failed')
    }
  }
  const sudokupad = fakeSudokuPad()
  lib.showSettingsDialog(sudokupad.dialogs, {
    prefix: 'demo-',
    name: 'Demo',
    version: '1.0.0',
    bodyId: 'demo-body',
    off: guard.off,
    changed: () => true,
    save: () => write({ A_width: 500, A_height: 700 }),
    snapshot: () => lib.snapshotStore(store, ['A_width', 'A_height'], holdMirror),
    feature,
    copyPaste: { copied: () => '{}', readers: { A_width: Number, A_height: Number }, apply: write }
  }, { doc: sudokupad.doc, win: sudokupad.win })
  return { saved, state, guard, feature, store, sudokupad }
}

// A Save or Paste that fails half-way, whether a write through the guard's store (as every script saves) or the script's own step throws, puts every
// key back, says so and leaves the feature on. Blind to
// real SudokuPad: its `Framework` calls, the dialogs it renders, undo, and each script's own in-memory mirror of its settings, which this
// test fakes. `npm run test:live` covers those on sudokupad.app: `live/settings-copy-paste.live.mjs` plants the failing write in each
// script's real dialog (Auto Rules Resizer's height write included), and each script's guard live suite runs its features there. Neither
// run looks at the purple, the gear or Dark Page's page text by eye.
test('a Paste whose second write throws puts every key and its mirror back, keeps the feature on and says the paste failed', async () => {
  const { saved, state, guard, feature, store, sudokupad } = openDialog()
  await withClipboard('{"A_width":500,"A_height":700}', sudokupad.paste)
  assert.deepEqual(saved, { A_width: 300 })
  assert.deepEqual(state.mirror, { width: 300, height: null })
  assert.equal(sudokupad.status.textContent, 'Could not paste: planted write failure on A_height')
  assert.equal(feature.off, false)
  assert.deepEqual(guard.off, [])
  assert.equal(store.getData('A_height'), null)
})

test('a Save whose second write throws puts every key and its mirror back, keeps the feature on and says it did not save', () => {
  const { saved, state, guard, sudokupad } = openDialog()
  sudokupad.save()
  assert.deepEqual(saved, { A_width: 300 })
  assert.deepEqual(state.mirror, { width: 300, height: null })
  assert.equal(sudokupad.status.textContent, 'Not saved: planted write failure on A_height')
  assert.deepEqual(guard.off, [])
})

test('a Save or Paste whose own step throws, not a store write, puts every key and its mirror back, keeps the feature on and says so', async () => {
  const save = openDialog({ ownThrow: true })
  save.sudokupad.save()
  assert.deepEqual(save.saved, { A_width: 300 })
  assert.deepEqual(save.state.mirror, { width: 300, height: null })
  assert.equal(save.sudokupad.status.textContent, 'Not saved: the script\'s own step failed')
  assert.deepEqual(save.guard.off, [])
  const paste = openDialog({ ownThrow: true })
  await withClipboard('{"A_width":500,"A_height":700}', paste.sudokupad.paste)
  assert.deepEqual(paste.saved, { A_width: 300 })
  assert.deepEqual(paste.state.mirror, { width: 300, height: null })
  assert.equal(paste.sudokupad.status.textContent, 'Could not paste: the script\'s own step failed')
  assert.deepEqual(paste.guard.off, [])
})

test('a settings dialog opened with no snapshot throws at once', () => {
  assert.throws(() => lib.showSettingsDialog({}, { name: 'Demo', changed: () => true, save: () => {} }, { doc: {}, win: {} }), /needs a snapshot/)
})
