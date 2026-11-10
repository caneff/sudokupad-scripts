'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readdirSync, readFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const { loadLib } = require('../load-lib.js')
const { memoryStorage } = require('../fake-page-storage.js')
const { syncText, readLib, libNamesOnDisk, scriptFiles } = require('../../sync-lib.js')
const ROOT = join(__dirname, '..', '..')

const read = (file) => readFileSync(join(ROOT, file), 'utf8')
const SCRIPTS = scriptFiles()
const LIB_BLOCK = /\/\/ <lib:([a-z-]+)>[\s\S]*?\/\/ <\/lib:\1>/g
// A script's own code: its text with every block sync-lib.js pastes in taken out.
const ownCode = (file) => read(file).replace(LIB_BLOCK, '')
// The lib modules a script carries.
const carried = (file) => [...read(file).matchAll(LIB_BLOCK)].map((match) => match[1])

// The files a stray copy could hide in: the repo's root, `lib/`, `test/` and `live/`, so never `docs/research/` or `site/`.
const filesIn = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).filter((entry) => entry.isFile() && /\.m?js$/.test(entry.name)).map((entry) => join(dir, entry.name))
const liveFolders = readdirSync(join(ROOT, 'live'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join('live', entry.name))
const swept = ['.', 'lib', 'test', 'test/specs', 'live', ...liveFolders].flatMap(filesIn)

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
const lib = loadLib(['sudokupad', 'settings-dialog', 'settings-transfer'], ['createGuard', 'snapshotStore', 'showSettingsDialog', 'SUDOKUPAD_PURPLE'], { Framework })

// SudokuPad's dialog as the settings dialog sees it: `showDialog` keeps the buttons, and the dialog holds the status line and the
// title row's click listener. `save()` presses Save, and `paste()` presses Paste settings.
const fakeSudokuPad = () => {
  const status = { textContent: '' }
  const clicks = []
  let options = []
  const dialog = {
    addEventListener: (type, fn) => { if (type === 'click') clicks.push(fn) },
    querySelector: (selector) => (selector === '[data-role="settings-status"]' ? status : selector === '[data-role="off-note"]' ? {} : selector === '[data-role="error-log"]' ? { addEventListener () {} } : null)
  }
  const body = { closest: (selector) => (selector === '.dialog' ? dialog : null) }
  const doc = { head: { appendChild () {} }, createElement: () => ({}), getElementById: (id) => (id === 'demo-body' ? body : null) }
  const win = { addEventListener () {}, removeEventListener () {} }
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

// Spec 685's acceptance at `npm test`: a Save or Paste that fails half-way, whether a write through the guard's store (as every script now
// saves) or the script's own step throws, puts every key back, says so and leaves the feature on; the cross-script copies are in `lib/` once; and each script carries only the lib code it runs. This seam is blind to
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
  // A missing key reads as null through the store.
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

test('every script\'s settings go through the shared guard, its dialog takes a snapshot, and no script keeps its own copy of a shared piece', () => {
  assert.equal(SCRIPTS.length, 6, SCRIPTS.join(', '))
  for (const file of SCRIPTS) {
    const own = ownCode(file)
    assert.ok(/guard\.storeFor\(/.test(own), `${file} saves through the guard's store`)
    assert.ok(/guard\.dialogsFor\(/.test(own), `${file} opens its dialogs through the guard`)
    // The dialog's options, up to its Copy and Paste.
    const options = /showSettingsDialog\(dialogs, \{([\s\S]*?)\bcopyPaste: \{/.exec(own)?.[1] ?? ''
    for (const option of ['snapshot', 'feature', 'off']) assert.ok(new RegExp(`\\b${option}: `).test(options), `${file} hands its dialog a ${option} and its Copy and Paste`)
    for (const copy of [/const dialogs = \{/, /const savedData = \{/, /\b(offNow|settingsOff)\b/, /\bPURPLE\s*=/, /#6a1b9a/i, /M12\.22 2h-\.44/, /function (writeOrRestore|snapshotStore|wrapIndex|writeStyle)\b/]) {
      assert.equal(copy.test(own), false, `${file} keeps its own ${copy}`)
    }
  }
  // SudokuPad's purple is defined once, in the guard's module.
  const purple = filesIn('lib').filter((file) => !file.endsWith('.test.js') && /#6a1b9a/i.test(read(file)))
  assert.deepEqual(purple, [join('lib', 'sudokupad.js')])
  assert.equal(lib.SUDOKUPAD_PURPLE.toLowerCase(), '#6a1b9a')
})

test('each script carries only the lib code it runs: Pen Tool Extras alone has the ready poller, and the moved helpers ship only where they are called', () => {
  assert.equal(existsSync(join(ROOT, 'lib', 'ready.js')), false)
  // Spelled in pieces, so this file does not hold what it looks for.
  const poller = new RegExp(`\\b${['when', 'Ready'].join('')}\\b`)
  const naming = swept.filter((file) => poller.test(read(file))).sort()
  assert.deepEqual(naming, [join('test', 'pen-tool-extras.test.js'), 'pen-tool-extras.user.js'].sort())
  for (const file of SCRIPTS) {
    const source = read(file)
    const own = ownCode(file)
    for (const helper of ['wrapIndex', 'writeStyle']) {
      if (new RegExp(`(?:function|const) ${helper}\\b`).test(source)) assert.ok(new RegExp(`\\b${helper}\\(`).test(own), `${file} carries ${helper} and never calls it`)
    }
  }
})

test('every lib test loads its module through the one loader, and every script\'s lib blocks match lib/', () => {
  const libTests = readdirSync(join(ROOT, 'lib')).filter((file) => file.endsWith('.test.js'))
  for (const file of libTests) {
    const text = read(join('lib', file))
    assert.doesNotMatch(text, /new Function/, file)
    assert.match(text, /require\('\.\.\/test\/load-lib\.js'\)/, file)
  }
  for (const file of SCRIPTS) {
    const { changed, problems } = syncText(read(file), readLib, libNamesOnDisk())
    assert.deepEqual({ changed, problems }, { changed: [], problems: [] }, `${file} (${carried(file).join(', ')})`)
  }
})

test('Dark Page\'s page text is white up to #757575 and black from #767676, on every grey', () => {
  const { buildCss } = require(join(ROOT, 'dark-page.user.js'))
  const footer = (color) => /\.controls-footer a \{ color: (#\w+) !important \}/.exec(buildCss(color))[1]
  for (let level = 0; level < 256; level++) {
    const grey = `#${level.toString(16).padStart(2, '0').repeat(3)}`
    assert.equal(footer(grey), level <= 0x75 ? '#ffffff' : '#000000', grey)
  }
})
