'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const SCRIPT = './pen-tool-extras.user.js'
const read = (file) => readFileSync(join(__dirname, file), 'utf8')
const source = read(SCRIPT)
const extras = require(SCRIPT)

// A store with SudokuPad's three calls that holds `saved`, a map of key to value.
const storeOf = (saved) => ({
  getData: (key) => saved[key],
  setData: (key, value) => { saved[key] = value },
  removeData: (key) => { delete saved[key] }
})

// The files the renames reach: the repo's root, `live/` and `site/`, so never `docs/research/`, nor the records in dotfiles.
const filesIn = (dir) => readdirSync(join(__dirname, dir), { withFileTypes: true }).filter((entry) => entry.isFile() && !entry.name.startsWith('.')).map((entry) => join(dir, entry.name))
const swept = [...filesIn('.'), ...filesIn('live'), ...filesIn('site')]
const ownFiles = swept.filter((file) => /pen-tool-extras/.test(file))

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

  // Missing SudokuPad pieces are named: an app with nothing holds back every step with a requirement.
  const lacking = [...extras.lackingInternals({}, undefined).values()].flat().sort()
  assert.deepEqual(lacking, ['arrowLines', 'colors', 'dragHint', 'lineErase', 'lineMode', 'marks', 'pages'])

  // Saved mark settings under the old names load under the new ones, keeping their values.
  const marks = extras.normalizeMarkSettings({ dot: false, cornerDot: false })
  assert.deepEqual([marks.circle, marks.cornerCircle], [false, false])
  assert.deepEqual(Object.keys(marks).sort(), ['circle', 'cornerCircle', 'cornerX', 'directions', 'x'])

  // The pen values saved inside puzzles did not change with the names.
  assert.equal(extras.MARK_VALUES.join(''), '34bc56hijklmnopqrstwuxvy')

  // The glossary's words: the renames this spec lists are gone. Each old name is spelled in pieces, so this file does not
  // hold what it looks for. The circle's old names stay in the reader, which still takes them.
  for (const file of swept) assert.equal(new RegExp(['chev', 'ron'].join(''), 'i').test(read(file)), false, file)
  for (const pieces of [['PEN', '_COLORS'], ['DEFAULT', '_COLORS'], ['penColors', 'FromPage'], ['off', 'Labels'], ['step', 'Page']]) {
    const old = new RegExp(`\\b${pieces.join('')}\\b`)
    for (const file of ownFiles) assert.equal(old.test(read(file)), false, `${pieces.join('')} in ${file}`)
  }

  // The version is one number, in both places it is kept.
  assert.equal(source.match(/@version\s+(\S+)/)[1], extras.VERSION)
})
