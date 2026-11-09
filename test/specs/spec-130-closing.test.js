'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { fakeStore } = require('../fake-store.js')
const { readdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const ROOT = join(__dirname, '..', '..')

const SCRIPT = 'pen-tool-extras.user.js'
const read = (file) => readFileSync(join(ROOT, file), 'utf8')
const source = read(SCRIPT)
const extras = require(join(ROOT, SCRIPT))

// The files the renames reach: the repo's root, `test/`, `live/` and `site/`, so never `docs/research/`, nor the records in dotfiles.
const filesIn = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).filter((entry) => entry.isFile() && !entry.name.startsWith('.')).map((entry) => join(dir, entry.name))
const liveFolders = readdirSync(join(ROOT, 'live'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join('live', entry.name))
const swept = ['.', 'test', 'test/specs', 'live', ...liveFolders, 'site'].flatMap(filesIn)
const ownFiles = swept.filter((file) => /pen-tool-extras/.test(file))

// Spec 130's acceptance as one pass over the script's exports and its text, at `npm test`. This seam is blind to real
// SudokuPad (`npm run test:live` covers the `Framework` calls, rendering and undo there), and to saved settings from an older version.
// `npm run test:tampermonkey` installs each script into a real Tampermonkey.
test('Pen Tool Extras holds spec 130 together', () => {
  const { SETTINGS, settingDefaults, readSettings, saveSetting, changedSettings } = extras
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
  for (const helper of ['edgeMidpoint', 'isEdgeActs', 'arrowLineOf', 'addedMark', 'penValuesOf', 'planActs', 'lineSegmentsOf']) {
    assert.equal(typeof extras[helper], 'function', helper)
  }

  // Missing SudokuPad pieces are named: a page with nothing holds back every feature with a requirement, its seven install steps among them.
  const lacking = [...extras.lackingInternals(extras.FEATURES, {}).values()].flat().sort()
  const required = Object.keys(extras.FEATURES).filter((name) => Object.keys(extras.FEATURES[name].needs).length > 0).sort()
  assert.deepEqual(lacking, required)
  for (const step of ['arrowLines', 'colors', 'dragHint', 'lineErase', 'marks', 'pages', 'penPanel']) assert.ok(lacking.includes(step), step)

  // Saved mark settings under the old names load under the new ones, keeping their values.
  const marks = extras.normalizeMarkSettings({ dot: false, cornerDot: false })
  assert.deepEqual([marks.circle, marks.cornerCircle], [false, false])
  assert.deepEqual(Object.keys(marks).sort(), ['cellCircle', 'cellCross', 'cellDot', 'circle', 'cornerCircle', 'cornerX', 'directions', 'x'])

  // The pen values saved inside puzzles did not change with the names.
  assert.equal(extras.MARK_VALUES.join('').slice(0, 24), '34bc56hijklmnopqrstwuxvy')

  // The glossary's words: the renames this spec lists are gone. Each old name is spelled in pieces, so this file does not
  // hold what it looks for. The circle's old names stay in the reader, which still takes them.
  assert.ok(swept.includes(join('live', 'pen-tool-extras', 'pen-tool-extras.live.mjs')), 'the sweep reaches the live script folders')
  for (const file of swept) assert.equal(new RegExp(['chev', 'ron'].join(''), 'i').test(read(file)), false, file)
  for (const pieces of [['PEN', '_COLORS'], ['DEFAULT', '_COLORS'], ['penColors', 'FromPage'], ['off', 'Labels'], ['step', 'Page']]) {
    const old = new RegExp(`\\b${pieces.join('')}\\b`)
    for (const file of ownFiles) assert.equal(old.test(read(file)), false, `${pieces.join('')} in ${file}`)
  }

  // The version is one number, in both places it is kept.
  assert.equal(source.match(/@version\s+(\S+)/)[1], extras.VERSION)
})
