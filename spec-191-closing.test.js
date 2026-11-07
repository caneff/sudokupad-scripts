'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const read = (file) => readFileSync(join(__dirname, file), 'utf8')
const extras = require('./pen-tool-extras.user.js')

// Each script's line count and @version at 159d79f, the commit spec 191 measured, typed out as the independent source. Digit Color,
// also measured, was deleted by spec 279.
const BEFORE = {
  'no-tab-letters.user.js': [72, '0.1.0'],
  'dark-page.user.js': [342, '0.3.7'],
  'color-by-digit.user.js': [1036, '0.5.6'],
  'pen-tool-extras.user.js': [2406, '1.14.10']
}
// The scripts that gained features after spec 191 closed: their line counts passed its ceiling and their versions changed.
const GREW_AFTER_SPEC = ['dark-page.user.js', 'color-by-digit.user.js', 'pen-tool-extras.user.js']
const lineCount = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
const versionOf = (text) => /^\/\/ @version\s+(\S+)$/m.exec(text)[1]

// Spec 191's acceptance at `npm test`: the comment rule, the shorter scripts, the per-step failsafe, the one-line exports, the dialog rows
// drawn from the settings table and the saved keys left alone. This seam is blind to real SudokuPad (`npm run test:live` covers the
// failsafe's planted throws and the dialog there), and to a real Tampermonkey install with settings saved by 1.14.10 and to
// crackingthecryptic.com, which no automated run reaches.
test('spec 191 cuts the scripts without losing a feature or a saved setting', () => {
  // One comment rule, in the repo's own standards.
  assert.match(read('CODING_STANDARDS.md'), /^6\. \*\*A comment states only what the code cannot show: a fact about SudokuPad's\s+internals, or the reason for a choice\./m)

  // The scripts that did not grow since keep spec 191's line ceiling and version; the others only had to change their version.
  for (const [file, [lines, version]] of Object.entries(BEFORE)) {
    const text = read(file)
    if (GREW_AFTER_SPEC.includes(file)) {
      assert.notEqual(versionOf(text), version, file)
    } else {
      assert.ok(lineCount(text) < lines, `${file} has ${lineCount(text)} lines, ${lines} before`)
      assert.equal(versionOf(text), version, file)
    }
    // The test exports are one statement on one line.
    assert.match(text, /^ {4}module\.exports = \{[^\n]*\}$/m, file)
  }

  // The per-feature failsafe is gone; every step has a requirement, so a missing internal skips a named step.
  const pen = read('pen-tool-extras.user.js')
  for (const gone of ['createFeatures', 'FEATURE_NEEDS', 'StockFailure', 'inStock']) assert.doesNotMatch(pen, new RegExp(`\\b${gone}\\b`), gone)
  const held = [...extras.lackingInternals({}, undefined).values()].flat().sort()
  assert.deepEqual(held, Object.keys(extras.STEP_LABELS).sort())

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
  const darkLive = read('live/dark-page.live.mjs')
  assert.doesNotMatch(darkLive, /\{[^}]*\bDATA_KEY\b[^}]*\} = createRequire/)
  assert.match(darkLive, /'DarkPage_color'/)
})
