// The pure parts of live/watch.mjs and its decision flow, with the version read, the suite and `gh` injected.
// Network-free, so it runs in `npm test`.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { failedChecks, issueFor, readLastVersion, statePath, watch, writeLastVersion } from './watch.mjs'

describe('statePath', () => {
  it('sits beside the recording', () => {
    assert.equal(statePath({ XDG_CACHE_HOME: '/x/cache' }, '/home/u'), '/x/cache/sudokupad-scripts/live/last-version')
    assert.equal(statePath({}, '/home/u'), '/home/u/.cache/sudokupad-scripts/live/last-version')
  })
})

describe('the remembered version', () => {
  it('is null before anything is written, then reads back what was written', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-'))
    try {
      const file = join(dir, 'nested', 'last-version')
      assert.equal(readLastVersion(file), null)
      writeLastVersion(file, '0.612.0')
      assert.equal(readFileSync(file, 'utf8'), '0.612.0\n')
      assert.equal(readLastVersion(file), '0.612.0')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('failedChecks', () => {
  const tap = [
    'TAP version 13',
    '# Subtest: live/a.live.mjs',
    '    # Subtest: grp',
    '        ok 1 - passes',
    '        not ok 2 - breaks "x"',
    '          ---',
    '          duration_ms: 1',
    '          ...',
    '    not ok 1 - grp',
    '    not ok 2 - lone failure',
    'not ok 1 - live/a.live.mjs',
    'ok 2 - live/b.live.mjs'
  ].join('\n')

  it('names each failing leaf, not the suites and files that failed because of it', () => {
    assert.deepEqual(failedChecks(tap), ['breaks "x"', 'lone failure'])
  })

  it('names a file that failed with no failing check inside it', () => {
    assert.deepEqual(failedChecks('not ok 1 - live/c.live.mjs\n'), ['live/c.live.mjs'])
  })

  it('is empty for a green run', () => {
    assert.deepEqual(failedChecks('ok 1 - live/b.live.mjs\n'), [])
  })
})

describe('issueFor', () => {
  it('names the version and every failing check', () => {
    const { title, body } = issueFor('0.612.0', ['one', 'two'])
    assert.equal(title, 'Live tests fail on SudokuPad 0.612.0')
    assert.match(body, /0\.612\.0/)
    assert.match(body, /- one\n- two/)
  })
})

describe('watch', () => {
  const harness = (over = {}) => {
    const calls = []
    return {
      calls,
      deps: {
        liveVersion: async () => '0.612.0',
        lastVersion: () => '0.611.0',
        runSuite: async () => { calls.push('run'); return { ok: true, output: '' } },
        fileIssue: async (i) => { calls.push(`file:${i.title}`) },
        remember: (v) => calls.push(`remember:${v}`),
        ...over
      }
    }
  }

  it('does nothing on a version already checked', async () => {
    const { calls, deps } = harness({ lastVersion: () => '0.612.0' })
    assert.equal(await watch(deps), 'unchanged')
    assert.deepEqual(calls, [])
  })

  it('runs the suite on a new version and remembers it when green', async () => {
    const { calls, deps } = harness()
    assert.equal(await watch(deps), 'green')
    assert.deepEqual(calls, ['run', 'remember:0.612.0'])
  })

  it('files one issue naming the failing checks on red, then remembers the version', async () => {
    const { calls, deps } = harness({
      runSuite: async () => { calls.push('run'); return { ok: false, output: 'not ok 1 - the check\n' } }
    })
    assert.equal(await watch(deps), 'red')
    assert.deepEqual(calls, ['run', 'file:Live tests fail on SudokuPad 0.612.0', 'remember:0.612.0'])
  })

  it('does not remember a version whose issue could not be filed, so the next run files it', async () => {
    const { calls, deps } = harness({
      runSuite: async () => ({ ok: false, output: 'not ok 1 - the check\n' }),
      fileIssue: async () => { throw new Error('gh down') }
    })
    await assert.rejects(watch(deps), /gh down/)
    assert.deepEqual(calls, [])
  })

  it('refuses to call a red run with no named failure green or filed', async () => {
    const { calls, deps } = harness({ runSuite: async () => ({ ok: false, output: 'Error: cannot launch chromium' }) })
    await assert.rejects(watch(deps), /no failing check/)
    assert.deepEqual(calls, [])
  })

  it('lets a failed version read through and runs nothing', async () => {
    const { calls, deps } = harness({ liveVersion: async () => { throw new Error('offline') } })
    await assert.rejects(watch(deps), /offline/)
    assert.deepEqual(calls, [])
  })
})
