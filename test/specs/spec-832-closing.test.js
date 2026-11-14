'use strict'
// Spec #832's closing test: one rule, one home in lib/, driven at the `npm test` seam. The settings table's derived helpers across the six scripts, UI Tweaks saving
// an option at its default by removing its key, the settings dialog's declared needs in every script's settings feature, writeStyle's one element by id, savedHex,
// the store's same-value skip, and the slider step rule and slider row.
// Blind to real SudokuPad: the Framework calls, rendering and undo. The live suites cover them on sudokupad.app: settings-copy-paste and settings-shell (Copy, Paste and
// the dialog shell once per migrated script) and each script's own dialog suite.
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { loadLib } = require('../load-lib.js')
const { fakeStore } = require('../fake-store.js')

const ROOT = join(__dirname, '..', '..')
const SCRIPTS = ['auto-rules-resizer', 'color-by-digit', 'dark-page', 'pen-tool-extras', 'text-anywhere', 'ui-tweaks']
const scripts = Object.fromEntries(SCRIPTS.map((name) => [name, require(join(ROOT, `${name}.user.js`))]))
const lib = loadLib(
  ['plain', 'sudokupad', 'color-math', 'slider-keys', 'panel', 'write-style', 'store', 'settings-table'],
  ['savedHex', 'onSliderStep', 'sliderRowMarkup', 'writeStyle', 'save', 'sameValue', 'pastedByName', 'withPasted']
)

test('#832: each of the six scripts copies its settings through its table, and every key it copies has a paste reader that takes the copied value', () => {
  for (const [name, script] of Object.entries(scripts)) {
    const copied = JSON.parse(script.copiedSettings(fakeStore({})))
    assert.ok(Object.keys(copied).length > 0, `${name} copies something`)
    for (const [key, value] of Object.entries(copied)) assert.notEqual(script.READERS[key]?.(value), undefined, `${name}: ${key}`)
  }
})

test('#832: UI Tweaks saves an option at its default by removing its key, so a later change of the default reaches it', () => {
  const { OPTIONS, DEFAULT_OPTIONS, saveOptions, savedOptions } = scripts['ui-tweaks']
  const option = OPTIONS[0]
  const store = fakeStore({ [option.key]: !option.default })
  saveOptions(store, { ...DEFAULT_OPTIONS, [option.id]: !option.default })
  assert.equal(store.getData(option.key), !option.default, 'a value off its default is kept')
  saveOptions(store, DEFAULT_OPTIONS)
  assert.equal(store.getData(option.key), null, 'a value at its default leaves no key')
  assert.deepEqual(savedOptions(store), DEFAULT_OPTIONS)
})

test('#832: a paste puts only the pasted rows into a draft, reading a value not yet saved through pastedByName', () => {
  const { OPTIONS, DEFAULT_OPTIONS, pastedOptions } = scripts['ui-tweaks']
  const [first, second] = OPTIONS
  const draft = { ...DEFAULT_OPTIONS, [second.id]: !second.default }
  assert.deepEqual(pastedOptions(draft, { [first.key]: !first.default }), { ...draft, [first.id]: !first.default })
  const rows = [{ name: 'a', key: 'K_a' }, { name: 'b', key: 'K_b' }]
  assert.deepEqual(lib.pastedByName(rows, { K_a: 1 }), { a: 1, b: undefined })
})

test('#832: every script\'s settings feature declares the three dialog calls, and a SudokuPad lacking one turns the feature off', () => {
  const NEEDED = ['Framework.addSetting', 'Framework.showDialog', 'Framework.closeDialog']
  for (const [name, { FEATURES }] of Object.entries(scripts)) {
    const feature = Object.entries(FEATURES).find(([, { needs }]) => NEEDED.every((path) => path in needs))
    assert.ok(feature, `${name} has a feature declaring ${NEEDED.join(', ')}`)
  }
})

test('#832: writeStyle keeps one style element under an id, and the dialog shell writes through it', () => {
  const head = []
  const doc = { getElementById: (id) => head.find((el) => el.id === id) ?? null, createElement: (tag) => ({ tag }), head: { appendChild: (el) => head.push(el) } }
  lib.writeStyle('x', 'a {}', doc)
  lib.writeStyle('x', 'b {}', doc)
  assert.deepEqual(head, [{ tag: 'style', id: 'x', textContent: 'b {}' }])
  assert.match(readFileSync(join(ROOT, 'ui-tweaks.user.js'), 'utf8'), /writeStyle\(/)
})

test('#832: savedHex reads a saved #rrggbb in any case, lowercased, and anything else as nothing saved', () => {
  assert.equal(lib.savedHex('#ABCDEF'), '#abcdef')
  assert.equal(lib.savedHex('#abc'), undefined)
  assert.equal(lib.savedHex(null), undefined)
})

test('#832: the store writes nothing for a value already saved as it is', () => {
  const writes = []
  const base = fakeStore({})
  const store = { ...base, getData: (key) => base.getData(key), setData: (key, value) => { writes.push(key); base.setData(key, value) } }
  lib.save(store, 'K', { a: 1 })
  lib.save(store, 'K', { a: 1 })
  assert.deepEqual(writes, ['K'])
  lib.save(store, 'K', { a: 2 })
  assert.deepEqual(writes, ['K', 'K'])
})

test('#832: the slider rule takes a value on the range\'s step grid, and the slider row is one range input, or an empty placeholder when hidden', () => {
  const range = { min: 20, max: 100, step: 5 }
  assert.equal(lib.onSliderStep(range, 35), true)
  assert.equal(lib.onSliderStep(range, 36), false)
  assert.equal(lib.onSliderStep(range, 105), false)
  assert.match(lib.sliderRowMarkup('row', true, { id: 'i', label: 'Opacity', range, value: 35 }), /<input type="range" id="i"[^>]* min="20" max="100" step="5" value="35">/)
  assert.equal(lib.sliderRowMarkup('row', false, { id: 'i', label: 'Opacity', range, value: 35 }), '<div class="row" data-empty></div>')
})
