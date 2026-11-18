import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatFuzzReport, parseFuzzOutput } from './fuzz-report.mjs'

const failure = (over = {}) => ({
  failed: true,
  puzzle: '9x9',
  seed: 77,
  error: 'rule broken after "digit 5": pen-lines-drawn: drawn but not in the state: r1c1-r1c2',
  sequence: ['click cell 3', 'digit 5'],
  replayCommand: 'npm run test:fuzz -- --seed 77 --path 12:0@3',
  errorLog: [],
  ...over
})
const pass = (over = {}) => ({ failed: false, runs: 9, puzzleRuns: { '9x9': 5, killer: 4 }, seed: 3, ...over })
const print = (r, seconds = 41) => formatFuzzReport(r, seconds).join('\n') + '\n'

describe('the fuzz report round trip', () => {
  it('parses a failure back into the fields it was printed from', () => {
    const f = failure({ errorLog: ['first line', 'second line'] })
    assert.deepEqual(parseFuzzOutput(print(f)), {
      failed: true, puzzle: f.puzzle, seed: f.seed, error: f.error, steps: f.sequence, replay: f.replayCommand, log: f.errorLog
    })
  })

  it('round-trips a one-step failure, an empty log and a multi-line error', () => {
    const f = failure({ sequence: ['reload'], error: 'crash signal after "reload": a\nb' })
    const parsed = parseFuzzOutput(print(f))
    assert.deepEqual([parsed.steps, parsed.log, parsed.error], [['reload'], [], f.error])
  })

  it('reads a pass that ran action lists, and no pass that ran none', () => {
    assert.deepEqual(parseFuzzOutput(print(pass())), { passed: true })
    assert.equal(parseFuzzOutput(print(pass({ runs: 0, puzzleRuns: {} }))), null)
  })

  it('ignores lines printed after the verdict', () => {
    const tail = 'ui-tweaks.user.js: 2 of 9 functions never ran\n  saveOptions (line 4, column 3)\n'
    assert.deepEqual(parseFuzzOutput(print(failure()) + tail), parseFuzzOutput(print(failure())))
    assert.deepEqual(parseFuzzOutput(print(pass()) + tail), { passed: true })
  })

  it('is null for output with no verdict', () => assert.equal(parseFuzzOutput('boom'), null))
})
