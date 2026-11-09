'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runOnBrokenSudokuPad, SudokuPadChanged } = require('./broken-sudokupad.js')
const { scriptFiles } = require('../../sync-lib.js')
const ROOT = join(__dirname, '..', '..')

const SCRIPTS = scriptFiles()

// Spec 449's acceptance at `npm test`: every script declares its features through the shared guard (lib/sudokupad.js), and none calls
// SudokuPad outside a feature's guard. The second is run, not read: each script starts on a stand-in page, SudokuPad then changes so
// that every call into it throws, and every way back into the script is taken (broken-sudokupad.js). This seam is blind to what that
// file's head names (a path behind a state the stand-in never takes, and the methods a script wraps), and to real SudokuPad: the bar,
// the console and each script's other features after a missing internal are `npm run test:live`'s (`live/*/*-guard.live.mjs` and the
// rest), and a real Tampermonkey install is `npm run test:tampermonkey`'s.
test('every script declares its features through the shared guard', () => {
  assert.equal(SCRIPTS.length, 6, SCRIPTS.join(', '))
  for (const file of SCRIPTS) {
    const source = readFileSync(join(ROOT, file), 'utf8')
    const own = source.replace(/\/\/ <lib:[a-z-]+>[\s\S]*?\/\/ <\/lib:[a-z-]+>/g, '')
    assert.match(source, /\/\/ <lib:sudokupad>/, file)
    assert.match(own, /createGuard\(\{ script: '[a-z-]+', [^\n]*features: FEATURES \}\)/, file)
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
    const script = /createGuard\(\{ script: '([a-z-]+)'/.exec(readFileSync(join(ROOT, file), 'utf8'))[1]
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
