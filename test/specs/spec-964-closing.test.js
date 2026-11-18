'use strict'
// Spec #964's closing test: one color set for Pen Tool Extras and Text Anywhere, a store read that throws in a dialog action going on to
// Copy in all six scripts, the one title-row click handler with Clear through clearErrorLog, the one row-read contract, the store naming
// every slot it kept an unreadable value in, and escapeHtml in the shared basics, driven at the `npm test` seam.
// Blind to real SudokuPad: the Framework calls (each script's Copy wired through `runInDialog` and a blocked storage on the page),
// rendering (the dialogs, the missing-color note, Color by Digit's unreadable note) and hold-to-edit. `npm run test:live` covers them on
// sudokupad.app: attack 76 in live/attacks-storage.live.mjs, and the settings and profiles suites of each script.
const test = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { loadLib } = require('../load-lib.js')
const { fakeStore, quietly } = require('../fake-store.js')
const { memoryStorage } = require('../fake-page-storage.js')

const ROOT = join(__dirname, '..', '..')
const script = (file) => require(join(ROOT, file))
const penToolExtras = script('pen-tool-extras.user.js')
const textAnywhere = script('text-anywhere.user.js')
const colorByDigit = script('color-by-digit.user.js')
const COPYING_SCRIPTS = ['auto-rules-resizer.user.js', 'color-by-digit.user.js', 'dark-page.user.js', 'pen-tool-extras.user.js', 'text-anywhere.user.js', 'ui-tweaks.user.js']

const Framework = {}
const { createGuard, ERROR_LOG_KEY, wireActs } = loadLib(['sudokupad', 'write-style', 'settings-dialog'], ['createGuard', 'ERROR_LOG_KEY', 'wireActs'], { Framework })
const { editedColorSet } = loadLib(['color-math', 'plain', 'palette', 'color-set'], ['editedColorSet'])
const { load, unreadableSlots } = loadLib(['plain', 'store'], ['load', 'unreadableSlots'])
const { escapeHtml } = loadLib(['plain'], ['escapeHtml'])

const NINE = { 1: '#010101', 2: '#020202', 3: '#030303', 4: '#040404', 5: '#050505', 6: '#060606', 7: '#070707', 8: '#080808', 9: '#090909' }

test('#964: both scripts read one saved color set the same way: Custom is the string custom, and nothing usable saved is no set', () => {
  for (const saved of [NINE, { ...NINE, preset: 'page-2' }, { ...NINE, 4: 'red' }]) {
    assert.deepEqual(penToolExtras.readPenColors(saved), textAnywhere.readNoteColorSet(saved), JSON.stringify(saved))
  }
  assert.equal(penToolExtras.readPenColors(NINE).preset, 'custom')
  assert.equal(textAnywhere.readNoteColorSet(NINE).preset, 'custom')
  for (const unusable of ['garbage', {}, { 1: 'red' }]) {
    assert.equal(penToolExtras.readPenColors(unusable), null)
    assert.equal(textAnywhere.readNoteColorSet(unusable), null)
  }
})

test('#964: a preset set carries the page its missing pens came from, and an edit drops only the edited pen from them', () => {
  const pages = [['k0', 'k1', 'k2', 'k3']]
  const readCell = (key) => (key === 'k1' ? 'rgb(200, 0, 0)' : 'transparent')
  const picked = penToolExtras.presetColorSet('page-1', pages, readCell)
  assert.deepEqual([picked.fromPreset, picked.missing], ['page-1', [2, 3, 4, 5, 6, 7, 8, 9]])
  assert.equal(penToolExtras.startupPenColors(null, false).save.fromPreset, 'sudokupad')
  const edited = editedColorSet(picked, 4, 'rgb(1, 2, 3)')
  assert.deepEqual([edited.colors[4], edited.preset, edited.missing, edited.fromPreset], ['#010203', 'custom', [2, 3, 5, 6, 7, 8, 9], 'page-1'])
})

test('#964: in each of the six scripts, Copy\'s read of a blocked storage in a dialog action throws on and leaves the feature on', () => {
  const guard = createGuard({ script: 'demo', name: 'Demo', version: '1.0.0', features: { saved: { label: 'saved settings', needs: {} } } })
  const feature = guard.features.saved
  const store = guard.storeFor(feature)
  Framework.getData = () => { throw new Error('storage blocked') }
  try {
    for (const file of COPYING_SCRIPTS) {
      assert.throws(() => feature.runInDialog(() => script(file).copiedSettings(store)), /storage blocked/, file)
      assert.deepEqual(guard.off, [], `${file}: the feature is still on`)
    }
  } finally {
    delete Framework.getData
  }
})

test('#964: the one title-row handler says Copy could not read, and Clear empties the log through clearErrorLog', async () => {
  const status = { textContent: '', dataset: {} }
  let click
  const root = { querySelector: () => status, addEventListener: (type, fn) => { click = fn } }
  const press = (act) => click({ target: { closest: () => ({ dataset: { act } }) }, preventDefault () {}, stopPropagation () {} })
  const localStorage = memoryStorage()
  localStorage.setItem(ERROR_LOG_KEY, '[]')
  const win = { localStorage, navigator: { clipboard: { writeText: async () => assert.fail('nothing is copied') } } }
  wireActs(root, { copied: () => { throw new Error('storage blocked') }, readers: {}, apply () {}, snapshot: () => () => {}, feature: { runInDialog: (fn) => fn() } }, win)
  await press('copy-settings')
  assert.deepEqual([status.textContent, status.dataset.tone], ['Could not copy: storage blocked', 'error'])
  await press('clear-error-log')
  assert.equal(localStorage.getItem(ERROR_LOG_KEY), null)
  assert.equal(status.textContent, 'The error log was already empty.')
})

test('#964: a refused saved row reads as its fallback, and a refused pasted one is skipped', () => {
  const store = fakeStore({ TextAnywhere_width: 0.3, TextAnywhere_opacity: 55 })
  const looks = textAnywhere.readLooks(store)
  assert.deepEqual([looks.width, looks.opacity], [textAnywhere.DEFAULT_WIDTH, 55])
  const { values, skipped } = textAnywhere.pastedSettings(JSON.stringify({ TextAnywhere_width: 0.3, TextAnywhere_opacity: 55 }), textAnywhere.READERS, textAnywhere.withNewKeys)
  assert.deepEqual([values, skipped], [{ TextAnywhere_opacity: 55 }, 1])
})

test('#964: the store names the slot it kept an unreadable value in, the next slot for a second one, and Color by Digit\'s note names every slot', () => {
  const key = 'ColorByDigit_profiles'
  const store = fakeStore({ [key]: { profiles: 'later', active: 0 } })
  const read = () => undefined
  assert.equal(quietly(() => load(store, { key, read })).result.slot, `${key}_unreadable`)
  store.setData(key, { profiles: 'later still', active: 0 })
  assert.equal(quietly(() => load(store, { key, read })).result.slot, `${key}_unreadable2`)
  const slots = unreadableSlots(store, key)
  assert.deepEqual(slots, [`${key}_unreadable`, `${key}_unreadable2`])
  const html = colorByDigit.renderEditor({ groups: [], pages: [], page: 0, brush: null, unreadableSlots: slots })
  assert.match(html, new RegExp(`kept under ${key}_unreadable and ${key}_unreadable2\\.`))
})

test('#964: escapeHtml is in the shared basics, and Pen Tool Extras\' line-mode label goes through it', () => {
  assert.equal(escapeHtml('a & <b> "c"'), 'a &amp; &lt;b&gt; &quot;c&quot;')
  assert.match(penToolExtras.renderLineModeButton('both'), /title="Center &amp; Edge" aria-label="Center &amp; Edge"/)
})
