'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runOnBrokenSudokuPad, SudokuPadChanged } = require('./broken-sudokupad.js')
const { guardId, scriptFiles } = require('../sync-lib.js')
const ROOT = join(__dirname, '..')

const SCRIPTS = scriptFiles()

// The second test is run, not read: each script starts on a stand-in page, SudokuPad then changes so that every call into it throws, and every
// way back into the script is taken (broken-sudokupad.js). Blind to what that file's head names (a path behind a state the stand-in never takes,
// and the methods a script wraps), and to real SudokuPad: the bar, the console and each script's other features after a missing internal are
// `npm run test:live`'s (`live/*/*-guard.live.mjs` and the rest).
test('every script names each of its features and holds back every feature that needs SudokuPad on a page with none', () => {
  for (const file of SCRIPTS) {
    const { FEATURES, lackingInternals } = require(join(ROOT, file))
    for (const [name, { label }] of Object.entries(FEATURES)) assert.equal(typeof label, 'string', `${file} ${name}`)
    // A page with no SudokuPad holds back every feature that names an internal.
    const required = Object.keys(FEATURES).filter((name) => Object.keys(FEATURES[name].needs).length > 0).sort()
    assert.deepEqual([...lackingInternals(FEATURES, {}).values()].flat().sort(), required, file)
  }
})

test('no script calls SudokuPad outside a feature\'s guard: when SudokuPad changes, no throw from it reaches the page', () => {
  let taken = 0
  for (const file of SCRIPTS) {
    const { FEATURES } = require(join(ROOT, file))
    // The id the script hands its guard, which starts each of its warnings.
    const script = guardId(readFileSync(join(ROOT, file), 'utf8'))
    const run = runOnBrokenSudokuPad(join(ROOT, file), FEATURES)
    assert.deepEqual(run.startupEscaped.map(({ where, error }) => `${where}: ${error}`), [], `${file} on a working SudokuPad`)
    // A SudokuPad call outside a guard throws SudokuPad's own error, or a TypeError on a member that is gone; a stand-in value no real
    // page would hand a listener (an empty color input) can make a script's own code throw, which is not what this counts.
    const fromSudokuPad = run.escaped.filter(({ error }) => error instanceof SudokuPadChanged || error.name === 'TypeError')
    assert.deepEqual(fromSudokuPad.map(({ where, error }) => `${where}: ${error}`), [], file)
    for (const warning of run.warnings) assert.ok(warning.startsWith(`${script}: `), warning)
    taken += run.taken
  }
  // The scripts were reached after the change: their listeners, timers and the callbacks they handed SudokuPad.
  assert.ok(taken >= 100, `${taken} ways back in`)
})
