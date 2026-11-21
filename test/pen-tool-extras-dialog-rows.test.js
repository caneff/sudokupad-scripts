'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const extras = require('../pen-tool-extras.user.js')

// Blind to real SudokuPad (`npm run test:live` covers the planted throws and the dialog there), and to settings saved by an older version in a
// real Tampermonkey install, which `npm run test:tampermonkey` does not set up.
test('every Pen Tool Extras step names a requirement, the dialog draws each slider row from the settings table, and the saved keys stay as shipped', () => {
  // Every step has a requirement, so a missing internal skips a named step.
  const held = [...extras.lackingInternals(extras.FEATURES, {}).values()].flat().sort()
  assert.deepEqual(held, Object.keys(extras.FEATURES).sort())

  // The dialog's slider rows come from the table: each slider's own label is drawn in its row, and a label changed in the table is
  // the label drawn.
  const { SETTINGS, renderEditor } = extras
  const state = { colors: extras.SUDOKUPAD_PEN_COLORS, preset: 'sudokupad', presets: ['sudokupad'], missing: [], ...extras.settingDefaults(), off: [] }
  const html = renderEditor(state)
  const sliders = Object.keys(SETTINGS).filter((name) => SETTINGS[name].range)
  assert.deepEqual(sliders, ['thickness', 'opacity', 'dash', 'arrowSpacing', 'outlineWidth'])
  for (const name of sliders) {
    assert.match(html, new RegExp(`<div data-row="${name}"[^>]*><label [^>]*>${SETTINGS[name].dialog.label.replace(/[()]/g, '\\$&')}</label>`), name)
  }
  const label = SETTINGS.dash.dialog.label
  SETTINGS.dash.dialog.label = 'Renamed in the table'
  try {
    assert.match(renderEditor(state), />Renamed in the table</)
  } finally {
    SETTINGS.dash.dialog.label = label
  }

  // Saved data: the storage keys are the ones shipped installs wrote.
  assert.deepEqual(Object.values(SETTINGS).map((row) => row.key), [
    'PenColor_thickness', 'PenColor_opacity', 'PenColor_dash', 'PenColor_arrowspacing', 'PenColor_outlinewidth',
    'PenColor_outline', 'PenColor_middleerase', 'PenColor_linestyles', 'PenColor_sliders', 'EdgeMarks_marks'
  ])
})
