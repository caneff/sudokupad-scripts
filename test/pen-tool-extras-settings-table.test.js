'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { fakeStore } = require('./fake-store.js')
const extras = require('../pen-tool-extras.user.js')

// Blind to real SudokuPad (`npm run test:live` covers the `Framework` calls, rendering and undo there), and to saved settings from an older version.
test('Pen Tool Extras\' settings table is the one source of its defaults, its save rule and its saved mark names', () => {
  const { SETTINGS, settingDefaults, readSettings, saveRow, changedSettings } = extras
  const store = fakeStore()
  const saved = store.data

  // One table: nothing saved reads as every default, and a saved value out of its range reads as its default.
  const defaults = settingDefaults()
  assert.deepEqual(Object.keys(defaults), Object.keys(SETTINGS))
  assert.deepEqual(readSettings(store), defaults)
  assert.deepEqual(changedSettings(readSettings(fakeStore({ [SETTINGS.thickness.key]: 1e9 })), defaults), [])

  // One save rule: for every row, a changed value saves its key and the default removes it.
  for (const [name, row] of Object.entries(SETTINGS)) {
    const changed = typeof row.fallback === 'number'
      ? [row.fallback + 1, row.fallback - 5].find((value) => row.read(value) === value)
      : typeof row.fallback === 'boolean'
        ? !row.fallback
        : Object.fromEntries(Object.keys(row.fallback).map((flag) => [flag, !row.fallback[flag]]))
    saveRow(store, row, changed)
    assert.deepEqual(readSettings(store)[name], changed, `${name} reads back as saved`)
    saveRow(store, row, row.fallback)
    assert.equal(row.key in saved, false, `${name} at its default has no key`)
  }

  // Saved mark settings under the old names load under the new ones, keeping their values.
  const marks = extras.normalizeMarkSettings({ dot: false, cornerDot: false })
  assert.deepEqual([marks.circle, marks.cornerCircle], [false, false])
  assert.deepEqual(Object.keys(marks).sort(), ['cellCircle', 'cellCross', 'cellDot', 'circle', 'cornerCircle', 'cornerX', 'directions', 'x'])
})

test('Pen Tool Extras\' install color save needs Framework.getApp like every other install step', () => {
  assert.equal(extras.FEATURES.colorSave.needs['Framework.getApp'], 'function')
})
