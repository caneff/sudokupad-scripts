// The pure parts of live/watch.mjs and its decision flow, with the version read, the suite and `gh` injected.
// Network-free, so it runs in `npm test`.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { didNotRunIssue, failedChecks, FULL_RUN_MS, fileIssue, fullRunDue, fullRunPath, issueFor, readLastFullRun, readState, statePath, watch, writeState } from './watch.mjs'

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
      assert.equal(readState(file), null)
      writeState(file, '0.612.0')
      assert.equal(readFileSync(file, 'utf8'), '0.612.0\n')
      assert.equal(readState(file), '0.612.0')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('throws when the file cannot be read, so an unreadable state does not pass for a new version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-'))
    try {
      assert.throws(() => readState(dir), { code: 'EISDIR' })
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

  it('a test that hit the time limit is a failed check that names it, not an unrun suite', () => {
    assert.deepEqual(failedChecks(failure('    ', 'stuck on a promise', 'testTimeoutFailure')), { checks: ['stuck on a promise'], unrun: [] })
  })

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

  it('files the issue as bug and needs-info, so triage diagnoses it before an agent builds it (#805)', async () => {
    let seen
    await fileIssue({ title: 'T', body: 'B' }, async (cmd, args) => { seen = args; return { ok: true } })
    assert.equal(seen[seen.indexOf('--label') + 1], 'bug,needs-info')
  })

  it('throws when gh fails, so the version is not remembered as filed', async () => {
    await assert.rejects(fileIssue({ title: 'T', body: 'B' }, async () => ({ ok: false })), /gh issue create failed/)
  })
})

describe('watch', () => {
  const NOW = Date.UTC(2026, 10, 7)
  const REAL_FAILURE = "    not ok 1 - the check\n      ---\n      failureType: 'testCodeFailure'\n      ...\n"
  const harness = (over = {}) => {
    const calls = []
    const issues = []
    return {
      calls,
      issues,
      deps: {
        liveVersion: async () => '0.612.0',
        lastVersion: () => '0.611.0',
        lastFullRun: () => NOW,
        now: () => NOW,
        runSuite: async () => { calls.push('run'); return { ok: true, output: '' } },
        fileIssue: async (i) => { calls.push(`file:${i.title}`); issues.push(i) },
        remember: (v) => calls.push(`remember:${v}`),
        rememberFullRun: (t) => calls.push(`full:${t}`),
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
    assert.deepEqual(calls, ['run', 'remember:0.612.0', `full:${NOW}`])
  })

  it('files one issue naming the failing checks on red, then remembers the version', async () => {
    const { calls, issues, deps } = harness({
      runSuite: async () => { calls.push('run'); return { ok: false, output: REAL_FAILURE } }
    })
    assert.equal(await watch(deps), 'red')
    assert.deepEqual(calls, ['run', 'file:Live tests fail on SudokuPad 0.612.0', 'remember:0.612.0', `full:${NOW}`])
    assert.doesNotMatch(issues[0].body, /weekly/, 'a new version is not the weekly run')
  })

  it('does not remember a version whose issue could not be filed', async () => {
    const { calls, deps } = harness({
      runSuite: async () => ({ ok: false, output: REAL_FAILURE }),
      fileIssue: async () => { throw new Error('gh down') }
    })
    await assert.rejects(watch(deps), /gh down/)
    assert.deepEqual(calls, [])
  })

  it('files the did-not-run issue, remembers nothing and reports it when the tests never ran', async () => {
    const { calls, issues, deps } = harness({ runSuite: async () => { calls.push('run'); return { ok: false, output: "    not ok 1 - a\n      ---\n      failureType: 'hookFailed'\n      ...\n" } } })
    assert.equal(await watch(deps), 'did-not-run')
    assert.equal(issues[0].once, true, 'filed once, not every night')
    assert.deepEqual(calls, ['run', `file:${didNotRunIssue('0.612.0', 'x').title}`])
  })

  it('files the did-not-run issue when the suite process itself could not start', async () => {
    const { calls, deps } = harness({ runSuite: async () => { throw new Error('spawn npm ENOENT') } })
    assert.equal(await watch(deps), 'did-not-run')
    assert.deepEqual(calls, [`file:${didNotRunIssue('0.612.0', 'x').title}`])
  })

  it('files the did-not-run issue when the version cannot be read, and runs nothing', async () => {
    const { calls, deps } = harness({ liveVersion: async () => { throw new Error('offline') } })
    assert.equal(await watch(deps), 'did-not-run')
    assert.deepEqual(calls, [`file:${didNotRunIssue('unknown', 'x').title}`])
  })

  it('remembers nothing when the did-not-run issue could not be filed', async () => {
    const { calls, deps } = harness({ liveVersion: async () => { throw new Error('offline') }, fileIssue: async () => { throw new Error('gh down') } })
    await assert.rejects(watch(deps), /gh down/)
    assert.deepEqual(calls, [])
  })

  describe('the weekly forced run', () => {
    it('runs the suite on an unchanged version once the last full run is a week old, and records the run', async () => {
      const { calls, deps } = harness({ lastVersion: () => '0.612.0', lastFullRun: () => NOW - FULL_RUN_MS })
      assert.equal(await watch(deps), 'green')
      assert.deepEqual(calls, ['run', 'remember:0.612.0', `full:${NOW}`])
    })

    it('runs the suite on an unchanged version when no full run was ever recorded', async () => {
      const { calls, deps } = harness({ lastVersion: () => '0.612.0', lastFullRun: () => null })
      assert.equal(await watch(deps), 'green')
      assert.deepEqual(calls.slice(0, 1), ['run'])
    })

    it('does nothing on an unchanged version whose last full run is under a week old', async () => {
      const { calls, deps } = harness({ lastVersion: () => '0.612.0', lastFullRun: () => NOW - FULL_RUN_MS + 1 })
      assert.equal(await watch(deps), 'unchanged')
      assert.deepEqual(calls, [])
    })

    it('files the red issue saying it was the weekly run, and records the run', async () => {
      const { calls, deps } = harness({
        lastVersion: () => '0.612.0',
        lastFullRun: () => 0,
        runSuite: async () => ({ ok: false, output: REAL_FAILURE }),
        fileIssue: async (i) => { calls.push(`file:${i.body.includes('weekly') ? 'weekly' : 'new-version'}:${i.once}`) }
      })
      assert.equal(await watch(deps), 'red')
      assert.deepEqual(calls, ['file:weekly:true', 'remember:0.612.0', `full:${NOW}`])
    })
  })
})

describe('fullRunDue', () => {
  it('is due with no record, at exactly a week, and not before', () => {
    assert.equal(fullRunDue({ lastFullRun: null, now: 1000 }), true)
    assert.equal(fullRunDue({ lastFullRun: 1000, now: 1000 + FULL_RUN_MS }), true)
    assert.equal(fullRunDue({ lastFullRun: 1000, now: 1000 + FULL_RUN_MS - 1 }), false)
    assert.equal(fullRunDue({ lastFullRun: 5000, now: 1000 }), true, 'a record in the future is none')
  })
})

describe('the remembered full run', () => {
  it('sits beside the recording, is null before it is written, and reads back the time', () => {
    assert.equal(fullRunPath({}, '/home/u'), '/home/u/.cache/sudokupad-scripts/live/last-full-run')
    const dir = mkdtempSync(join(tmpdir(), 'watch-'))
    try {
      const file = join(dir, 'last-full-run')
      assert.equal(readLastFullRun(file), null)
      writeState(file, '1762473600000')
      assert.equal(readLastFullRun(file), 1762473600000)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('reads as no record when the file holds no number, so a damaged file forces a run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-'))
    try {
      const file = join(dir, 'last-full-run')
      writeState(file, 'garbage')
      assert.equal(readLastFullRun(file), null)
      writeState(file, 'Infinity')
      assert.equal(readLastFullRun(file), null)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('the did-not-run title in the workflow', () => {
  it('is the same text watch.yml files under, so the open-issue check matches across the two', () => {
    const yml = readFileSync(new URL('../.github/workflows/watch.yml', import.meta.url), 'utf8')
    assert.ok(yml.includes(`title: '${didNotRunIssue('x', 'y').title}'`))
  })
})

describe('every issue body the watch files ends with its Blocked by section (#805)', () => {
  const end = '\n\n## Blocked by\n\n- None — can start immediately.'
  it('ends the failing-checks issue and the did-not-run issue with it', () => {
    assert.ok(issueFor('0.612.0', { checks: ['one'], unrun: ['a'] }).body.endsWith(end))
    assert.ok(issueFor('0.612.0', { checks: ['one'], unrun: [] }, { weekly: true }).body.endsWith(end))
    assert.ok(didNotRunIssue('0.612.0', 'no Chromium').body.endsWith(end))
  })
})

describe('didNotRunIssue', () => {
  it('has a title that does not blame SudokuPad and is the same every night, so one open issue is enough', () => {
    const a = didNotRunIssue('0.612.0', 'no Chromium')
    const b = didNotRunIssue('0.613.0', 'other')
    assert.equal(a.title, b.title)
    assert.match(a.title, /did not run/i)
    assert.equal(a.once, true)
    assert.match(a.body, /no Chromium/)
    assert.match(a.body, /0\.612\.0/)
  })
})

describe('fileIssue once', () => {
  it('files nothing when an open issue already has the title', async () => {
    const seen = []
    await fileIssue({ title: 'T', body: 'B', once: true }, async (cmd, args) => { seen.push(args.slice(0, 2).join(' ')); return { ok: true, output: '4\tother\n7\tT\n' } })
    assert.deepEqual(seen, ['issue list'])
  })

  it('files it when no open issue has the title', async () => {
    const seen = []
    await fileIssue({ title: 'T', body: 'B', once: true }, async (cmd, args) => { seen.push(args.slice(0, 2).join(' ')); return { ok: true, output: '4\tother\n' } })
    assert.deepEqual(seen, ['issue list', 'issue create'])
  })

  it('throws when the list fails, rather than filing a possible duplicate blind', async () => {
    await assert.rejects(fileIssue({ title: 'T', body: 'B', once: true }, async () => ({ ok: false, output: '' })), /gh issue list failed/)
  })
})
