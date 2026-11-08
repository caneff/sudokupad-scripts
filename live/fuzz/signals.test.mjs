// Unit tests of the fuzz's crash signals and error-log lines, on hand-built snapshots.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { crashSignals, newestErrorRecords } from './signals.mjs'

describe('crashSignals', () => {
  it('a clean snapshot has none', () => {
    assert.deepEqual(crashSignals({ errors: [], notices: [] }), [])
  })

  it('a page error, a console error and a skip line each count, as the lines the page collected', () => {
    const errors = ['Error: boom', 'console.error: bad', 'console.warn: draw-tool: x skipped because SudokuPad changed: y']
    assert.equal(crashSignals({ errors, notices: [] }).length, 3)
    assert.match(crashSignals({ errors, notices: [] })[2], /skipped because SudokuPad changed/)
  })

  it('a snapshot missing a field is refused, not read as clean', () => {
    assert.throws(() => crashSignals({ errors: [] }))
  })

  it('the notice bar counts, with the script\'s own words', () => {
    assert.deepEqual(crashSignals({ errors: [], notices: ['Text Anywhere: note editing is off — SudokuPad changed.'] }), ['notice bar: Text Anywhere: note editing is off — SudokuPad changed.'])
  })
})

describe('newestErrorRecords', () => {
  const log = JSON.stringify([1, 2, 3].map((n) => ({ script: 'draw-tool', version: '1.0.' + n, feature: 'f' + n, name: 'TypeError', message: 'm' + n })))

  it('lists the newest first, at most the limit', () => {
    assert.deepEqual(newestErrorRecords(log, 2), ['draw-tool@1.0.3: f3: TypeError: m3', 'draw-tool@1.0.2: f2: TypeError: m2'])
  })

  it('an empty log is empty, and an unreadable one is said so', () => {
    assert.deepEqual(newestErrorRecords(null), [])
    assert.match(newestErrorRecords('{oops')[0], /^unreadable error log: /)
    assert.match(newestErrorRecords('{"a":1}')[0], /^unreadable error log: /)
  })
})
