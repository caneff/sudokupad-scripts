'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const ROOT = join(__dirname, '..', '..')

const read = (file) => readFileSync(join(ROOT, file), 'utf8')
const extras = require('../../pen-tool-extras.user.js')

// Spec 191's acceptance at `npm test`: the per-step failsafe, the one-line exports, the dialog rows drawn from the settings table and
// the saved keys left alone. This seam is blind to real SudokuPad (`npm run test:live` covers the failsafe's planted throws and the
// dialog there), and to settings saved by 1.14.10 in a real Tampermonkey install, which `npm run test:tampermonkey` does not set up.
test('spec 191 cuts the scripts without losing a feature or a saved setting', () => {
  // The test exports are one statement on one line, in the scripts spec 191 cut.
  for (const file of ['dark-page.user.js', 'color-by-digit.user.js', 'pen-tool-extras.user.js']) {
    assert.match(read(file), /^ {4}module\.exports = \{[^\n]*\}$/m, file)
  }

  // The per-feature failsafe is gone; every step has a requirement, so a missing internal skips a named step.
  const pen = read('pen-tool-extras.user.js')
  for (const gone of ['createFeatures', 'FEATURE_NEEDS', 'StockFailure', 'inStock']) assert.doesNotMatch(pen, new RegExp(`\\b${gone}\\b`), gone)
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

  // Saved data: the storage keys are the ones 1.14.10 wrote.
  assert.deepEqual(Object.values(SETTINGS).map((row) => row.key), [
    'PenColor_thickness', 'PenColor_opacity', 'PenColor_dash', 'PenColor_arrowspacing', 'PenColor_outlinewidth',
    'PenColor_outline', 'PenColor_middleerase', 'PenColor_linestyles', 'PenColor_sliders', 'EdgeMarks_marks'
  ])

  // #190: the Dark Page live test types its storage key out rather than importing it (ADR 0001).
  const darkLive = read('live/dark-page/dark-page.live.mjs')
  assert.doesNotMatch(darkLive, /\{[^}]*\bDATA_KEY\b[^}]*\} = createRequire/)
  assert.match(darkLive, /'DarkPage_color'/)
})
