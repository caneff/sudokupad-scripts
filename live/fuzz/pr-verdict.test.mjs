import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { formatFuzzReport } from './fuzz-report.mjs'
import { COMMENT_MARKER, prVerdict } from './pr-verdict.mjs'

const PASSED = formatFuzzReport({ failed: false, runs: 31, puzzleRuns: { a: 31 }, seed: 5 }, 300).join('\n')
const FAILED = formatFuzzReport({ failed: true, puzzle: 'cages', seed: 77, error: 'page error: boom', sequence: ['click r1c1', 'press Tab'], replayCommand: 'npm run test:fuzz -- --seed 77 --path x', errorLog: [] }, 268).join('\n')
const ZERO = formatFuzzReport({ failed: false, runs: 0, puzzleRuns: {}, seed: 5 }, 300).join('\n')
const SHA = 'abc1234'
const RUN_URL = 'https://example.test/run/1'
const verdict = (output, outcome = 'success') => prVerdict({ output, outcome, sha: SHA, runUrl: RUN_URL })

describe('prVerdict (#1030)', () => {
  it('passes only a verdict of lists run, from a fuzz step that succeeded', () => {
    assert.deepEqual(verdict(PASSED), { ok: true, body: '' })
  })

  it('fails a red fuzz, and its comment names the seed, the failure, the steps and the replay', () => {
    const r = verdict(FAILED, 'failure')
    assert.equal(r.ok, false)
    assert.ok(r.body.startsWith(COMMENT_MARKER))
    for (const part of ['seed 77', 'page error: boom', 'click r1c1', 'press Tab', 'npm run test:fuzz -- --seed 77 --path x', SHA, RUN_URL]) assert.ok(r.body.includes(part), part)
  })

  it('fails a run that printed no verdict: crashed before fuzzing, or ran zero action lists', () => {
    for (const output of ['Error: browserType.launch: Executable doesn\'t exist\n', ZERO, '']) {
      const r = verdict(output, output === ZERO ? 'success' : 'failure')
      assert.equal(r.ok, false, output)
      assert.match(r.body, /no verdict/)
      assert.ok(r.body.startsWith(COMMENT_MARKER))
    }
  })

  it('fails a zero-list pass even though the step exited 0', () => {
    assert.equal(verdict(ZERO, 'success').ok, false)
  })

  it('fails a verdict of passed when the fuzz step itself failed', () => {
    assert.equal(verdict(PASSED, 'failure').ok, false)
  })

  it('fails when there is no output file at all', () => {
    const r = verdict(null, 'skipped')
    assert.equal(r.ok, false)
    assert.match(r.body, /no verdict/)
  })

  it('keeps the comment under GitHub\'s size limit, with the end of a long output', () => {
    const r = verdict('x\n'.repeat(100000) + 'the last line', 'failure')
    assert.ok(r.body.length < 60000)
    assert.match(r.body, /the last line/)
  })
})

describe('pr-verdict.mjs as a command', () => {
  const run = (output, outcome) => {
    const dir = mkdtempSync(join(tmpdir(), 'pr-verdict-'))
    try {
      const out = join(dir, 'fuzz.out')
      const comment = join(dir, 'comment.md')
      if (output !== null) writeFileSync(out, output)
      const r = spawnSync(process.execPath, [new URL('./pr-verdict.mjs', import.meta.url).pathname, out, comment, outcome, SHA, RUN_URL], { encoding: 'utf8' })
      let body = null
      try { body = readFileSync(comment, 'utf8') } catch {}
      return { status: r.status, body }
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  it('exits 0 and writes no comment for a pass', () => {
    assert.deepEqual(run(PASSED, 'success'), { status: 0, body: null })
  })

  it('exits 1 and writes the comment for a failure, a zero-list pass and a missing output', () => {
    for (const [output, outcome] of [[FAILED, 'failure'], [ZERO, 'success'], [null, 'skipped']]) {
      const r = run(output, outcome)
      assert.equal(r.status, 1)
      assert.ok(r.body.startsWith(COMMENT_MARKER))
    }
  })
})
