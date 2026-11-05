'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const SCRIPT = './pen-tool-extras.user.js'
const source = readFileSync(join(__dirname, SCRIPT), 'utf8')
const extras = require(SCRIPT)

// A store with SudokuPad's three calls that holds `saved`, a map of key to value.
const storeOf = (saved) => ({
  getData: (key) => saved[key],
  setData: (key, value) => { saved[key] = value },
  removeData: (key) => { delete saved[key] }
})

// Spec 130's acceptance as one pass over the script's exports and its text, at `npm test`. This seam is blind to real
// SudokuPad (`npm run test:live` covers the `Framework` calls, rendering and undo there), and to a real Tampermonkey
// install and crackingthecryptic.com, which no automated run reaches.
test('Pen Tool Extras holds spec 130 together', () => {
  const { SETTINGS, settingDefaults, readSettings, saveSetting, changedSettings } = extras
  const saved = {}
  const store = storeOf(saved)

  // One table: nothing saved reads as every default, and a saved value out of its range reads as its default.
  const defaults = settingDefaults()
  assert.deepEqual(Object.keys(defaults), Object.keys(SETTINGS))
  assert.deepEqual(readSettings(store), defaults)
  assert.deepEqual(changedSettings(readSettings(storeOf({ [SETTINGS.thickness.key]: 1e9 })), defaults), [])

  // One save rule: for every row, a changed value saves its key and the default removes it.
  for (const [name, row] of Object.entries(SETTINGS)) {
    const changed = typeof row.fallback === 'number'
      ? [row.fallback + 1, row.fallback - 5].find((value) => row.normalize(value) === value)
      : typeof row.fallback === 'boolean'
        ? !row.fallback
        : Object.fromEntries(Object.keys(row.fallback).map((flag) => [flag, !row.fallback[flag]]))
    saveSetting(store, row, changed)
    assert.deepEqual(readSettings(store)[name], changed, `${name} reads back as saved`)
    saveSetting(store, row, row.fallback)
    assert.equal(row.key in saved, false, `${name} at its default has no key`)
  }

  // The pure helpers are reachable with no Framework on the page.
  for (const helper of ['edgeMidpoint', 'isEdgeActs', 'arrowLineOf', 'addedMark', 'penValuesOf', 'planActs', 'lineSegmentsOf', 'wrapIndex']) {
    assert.equal(typeof extras[helper], 'function', helper)
  }

  // Missing SudokuPad pieces are named: an app with nothing turns off every feature with a requirement.
  const lacking = [...extras.lackingInternals({}, undefined).values()].flat().sort()
  assert.deepEqual(lacking, ['arrowLines', 'colors', 'lineErase', 'lineMode', 'marks', 'outline', 'pages', 'sliders'])

  // Saved mark settings under the old names load under the new ones, keeping their values.
  const marks = extras.normalizeMarkSettings({ dot: false, cornerDot: false })
  assert.deepEqual([marks.circle, marks.cornerCircle], [false, false])
  assert.deepEqual(Object.keys(marks).sort(), ['circle', 'cornerCircle', 'cornerX', 'directions', 'x'])

  // The glossary's words: none of the old names is left in the script.
  for (const old of [/chevron/i, /\bPEN_COLORS\b/, /\bDEFAULT_COLORS\b/, /penColorsFromPage/, /offLabels/, /stepPage/]) {
    assert.equal(old.test(source), false, String(old))
  }

  // Every change raised the version, in both places it is kept.
  assert.equal(source.match(/@version\s+(\S+)/)[1], extras.VERSION)
})

test('a Framework with no getApp is reported, and no Framework is not', () => {
  const file = require.resolve(SCRIPT)
  const load = (framework) => {
    const warnings = []
    const warn = console.warn
    console.warn = (...args) => warnings.push(args.join(' '))
    if (framework) global.Framework = framework
    delete require.cache[file]
    try {
      require(SCRIPT)
    } finally {
      console.warn = warn
      delete global.Framework
      delete require.cache[file]
    }
    return warnings
  }
  assert.deepEqual(load(), [])
  assert.deepEqual(load({}), ['pen-tool-extras: SudokuPad\'s Framework has no getApp, so nothing was changed'])
})
