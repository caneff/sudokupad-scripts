// The pure parts of live/watch.mjs and its decision flow, with the version read, the suite and `gh` injected.
// Network-free, so it runs in `npm test`.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { failedChecks, fileIssue, issueFor, readLastVersion, statePath, watch, writeLastVersion } from './watch.mjs'

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

  it('throws when the file cannot be read, so an unreadable state does not pass for a new version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-'))
    try {
      assert.throws(() => readLastVersion(dir), { code: 'EISDIR' })
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('failedChecks', () => {
  const failure = (indent, name, type) => `${indent}not ok 1 - ${name}\n${indent}  ---\n${indent}  failureType: '${type}'\n${indent}  ...`
  const tap = [
    'TAP version 13',
    '    ok 1 - passes',
    failure('    ', 'breaks "x"', 'testCodeFailure'),
    failure('    ', 'lone failure', 'testCodeFailure'),
    failure('', 'grp', 'subtestsFailed'),
    'ok 2 - live/b.live.mjs'
  ].join('\n')

  it('names each test that ran and failed, not the suites that failed because of it', () => {
    assert.deepEqual(failedChecks(tap), { checks: ['breaks "x"', 'lone failure'], unrun: [] })
  })

  it('counts a test cancelled by a failing before hook as unrun, not as a failure of SudokuPad', () => {
    const hook = [failure('    ', 'a', 'hookFailed'), failure('    ', 'b', 'hookFailed'), failure('', 'live/c.live.mjs', 'subtestsFailed')].join('\n')
    assert.deepEqual(failedChecks(hook), { checks: [], unrun: ['a', 'b'] })
  })

  it('counts a file that failed to load as unrun', () => {
    assert.deepEqual(failedChecks(failure('', 'live/d.live.mjs', 'testCodeFailure')), { checks: [], unrun: ['live/d.live.mjs'] })
  })

  it('ignores a failing TODO test, and drops the escape TAP puts before a # in a name', () => {
    const mixed = [failure('    ', 'later \\# fix # TODO', 'testCodeFailure'), failure('    ', 'issue \\#5', 'testCodeFailure')].join('\n')
    assert.deepEqual(failedChecks(mixed), { checks: ['issue #5'], unrun: [] })
  })

  it('is empty for a green run', () => {
    assert.deepEqual(failedChecks('ok 1 - live/b.live.mjs\n'), { checks: [], unrun: [] })
  })
})

describe('issueFor', () => {
  it('names the version and every failing check', () => {
    const { title, body } = issueFor('0.612.0', { checks: ['one', 'two'], unrun: [] })
    assert.equal(title, 'Live tests fail on SudokuPad 0.612.0')
    assert.match(body, /0\.612\.0/)
    assert.match(body, /- one\n- two/)
  })

  it('names what did not run', () => {
    assert.match(issueFor('0.612.0', { checks: ['one'], unrun: ['live/c.live.mjs'] }).body, /Did not run.*\n\n- live\/c\.live\.mjs/)
  })
})

describe('fileIssue', () => {
  it('passes the title and the body on stdin to gh issue create', async () => {
    let seen
    await fileIssue({ title: 'T', body: 'B' }, async (cmd, args, opts) => { seen = { cmd, args, opts }; return { ok: true } })
    assert.equal(seen.cmd, 'gh')
    assert.deepEqual(seen.args.slice(0, 2), ['issue', 'create'])
    assert.equal(seen.args[seen.args.indexOf('--title') + 1], 'T')
    assert.equal(seen.opts.input, 'B')
  })

  it('throws when gh fails, so the version is not remembered as filed', async () => {
    await assert.rejects(fileIssue({ title: 'T', body: 'B' }, async () => ({ ok: false })), /gh issue create failed/)
  })
})

describe('watch', () => {
  const REAL_FAILURE = "    not ok 1 - the check\n      ---\n      failureType: 'testCodeFailure'\n      ...\n"
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
      runSuite: async () => { calls.push('run'); return { ok: false, output: REAL_FAILURE } }
    })
    assert.equal(await watch(deps), 'red')
    assert.deepEqual(calls, ['run', 'file:Live tests fail on SudokuPad 0.612.0', 'remember:0.612.0'])
  })

  it('does not remember a version whose issue could not be filed', async () => {
    const { calls, deps } = harness({
      runSuite: async () => ({ ok: false, output: REAL_FAILURE }),
      fileIssue: async () => { throw new Error('gh down') }
    })
    await assert.rejects(watch(deps), /gh down/)
    assert.deepEqual(calls, [])
  })

  it('files nothing and remembers nothing for a red run whose tests never ran', async () => {
    const { calls, deps } = harness({ runSuite: async () => ({ ok: false, output: "    not ok 1 - a\n      ---\n      failureType: 'hookFailed'\n      ...\n" }) })
    await assert.rejects(watch(deps), /no failing check/)
    assert.deepEqual(calls, [])
  })

  it('lets a failed version read through and runs nothing', async () => {
    const { calls, deps } = harness({ liveVersion: async () => { throw new Error('offline') } })
    await assert.rejects(watch(deps), /offline/)
    assert.deepEqual(calls, [])
  })
})
