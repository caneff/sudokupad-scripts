import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { didNotRunIssue, exitCodeFor, failedChecks, issueFor, MISSED_NIGHT_MS, previousRunAt, suiteEnv, suiteRunEnv, testsRan, watch } from './watch.mjs'

describe('suiteEnv', () => {
  it('pins Playwright to its default browser folder when XDG_CACHE_HOME moves the harness cache', () => {
    assert.equal(suiteEnv({ XDG_CACHE_HOME: '/x/cache' }, '/home/u', 'linux').PLAYWRIGHT_BROWSERS_PATH, '/home/u/.cache/ms-playwright')
  })

  it('keeps a PLAYWRIGHT_BROWSERS_PATH already set, and leaves the rest of the env alone', () => {
    const env = { XDG_CACHE_HOME: '/x/cache', PLAYWRIGHT_BROWSERS_PATH: '/mine', OTHER: '1' }
    assert.deepEqual(suiteEnv(env, '/home/u', 'linux'), env)
  })

  it('keeps a browser path npm passes from an .npmrc', () => {
    const env = { XDG_CACHE_HOME: '/x/cache', npm_config_playwright_browsers_path: '/rc' }
    assert.deepEqual(suiteEnv(env, '/home/u', 'linux'), env)
  })

  it('is what the suite runs with, beside its refresh, timing-gate and reporter settings', () => {
    assert.deepEqual(suiteRunEnv({ XDG_CACHE_HOME: '/x/cache' }, '/home/u', 'linux'), {
      XDG_CACHE_HOME: '/x/cache', PLAYWRIGHT_BROWSERS_PATH: '/home/u/.cache/ms-playwright', LIVE_REFRESH: '1', LIVE_TIMING: '1', NODE_OPTIONS: '--test-reporter=tap'
    })
  })

  it('adds nothing when XDG_CACHE_HOME is unset or empty, or off Linux', () => {
    assert.equal('PLAYWRIGHT_BROWSERS_PATH' in suiteEnv({}, '/home/u', 'linux'), false)
    assert.equal('PLAYWRIGHT_BROWSERS_PATH' in suiteEnv({ XDG_CACHE_HOME: '' }, '/home/u', 'linux'), false)
    assert.equal('PLAYWRIGHT_BROWSERS_PATH' in suiteEnv({ XDG_CACHE_HOME: '/x/cache' }, '/home/u', 'darwin'), false)
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
    assert.equal(title, 'Live tests fail: the nightly full suite is red')
    assert.equal(issueFor('0.613.0', { checks: ['one'], unrun: [] }).title, title, 'one issue, whatever the version')
    assert.match(body, /0\.612\.0/)
    assert.match(body, /- one\n- two/)
  })

  it('has a comment for a later red night, naming the date and every failing check, which fileIssue posts on the open issue instead of filing another', () => {
    const { comment } = issueFor('0.612.0', { checks: ['one', 'two'], unrun: [] }, { now: Date.UTC(2026, 10, 22, 6, 30) })
    assert.match(comment, /^Red again on 2026-11-22, on SudokuPad 0\.612\.0\./)
    assert.match(comment, /- one\n- two/)
  })

  it('names what did not run', () => {
    assert.match(issueFor('0.612.0', { checks: ['one'], unrun: ['live/c.live.mjs'] }).body, /Did not run.*\n\n- live\/c\.live\.mjs/)
  })
})

describe('watch', () => {
  const NOW = Date.UTC(2026, 10, 7, 6, 17)
  const REAL_FAILURE = "    not ok 1 - the check\n      ---\n      failureType: 'testCodeFailure'\n      ...\n"
  const GREEN = '# tests 1678\n# pass 1678\n# fail 0\n'
  const harness = (over = {}) => {
    const calls = []
    const issues = []
    return {
      calls,
      issues,
      deps: {
        liveVersion: async () => '0.612.0',
        now: () => NOW,
        previousRunAt: async () => NOW - 24 * 60 * 60 * 1000,
        runSuite: async () => { calls.push('run'); return { ok: true, output: GREEN } },
        fileIssue: async (i) => { calls.push(`file:${i.title}`); issues.push(i) },
        ...over
      }
    }
  }

  it('runs the full suite every night, whatever the version, and is green when it passes', async () => {
    const { calls, deps } = harness()
    assert.equal(await watch(deps), 'green')
    assert.deepEqual(calls, ['run'])
  })

  it('files one issue naming the failing checks on red, with a comment for the nights after', async () => {
    const { calls, issues, deps } = harness({
      runSuite: async () => { calls.push('run'); return { ok: false, output: REAL_FAILURE } }
    })
    assert.equal(await watch(deps), 'red')
    assert.deepEqual(calls, ['run', 'file:Live tests fail: the nightly full suite is red'])
    assert.equal(issues[0].once, true)
    assert.match(issues[0].comment, /Red again on 2026-11-07/)
  })

  it('throws when the red issue could not be filed, so the night is red in Actions as well', async () => {
    const { deps } = harness({
      runSuite: async () => ({ ok: false, output: REAL_FAILURE }),
      fileIssue: async () => { throw new Error('gh down') }
    })
    await assert.rejects(watch(deps), /gh down/)
  })

  it('files the did-not-run issue and reports it when the tests never ran', async () => {
    const { calls, issues, deps } = harness({ runSuite: async () => { calls.push('run'); return { ok: false, output: "    not ok 1 - a\n      ---\n      failureType: 'hookFailed'\n      ...\n" } } })
    assert.equal(await watch(deps), 'did-not-run')
    assert.equal(issues[0].once, true, 'filed once, not every night')
    assert.deepEqual(calls, ['run', `file:${didNotRunIssue('0.612.0', 'x').title}`])
  })

  it('reports a suite that exited 0 having run no tests as did-not-run, never as green (#1026)', async () => {
    for (const output of ['', '# tests 0\n# pass 0\n# fail 0\n', 'Could not find \'live/x.live.mjs\'\n']) {
      const { calls, issues, deps } = harness({ runSuite: async () => { calls.push('run'); return { ok: true, output } } })
      assert.equal(await watch(deps), 'did-not-run', JSON.stringify(output))
      assert.match(issues[0].body, /ran no tests/)
    }
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

  describe('a night the workflow did not run (#1026)', () => {
    it('is reported when the run before this one is more than 36 hours old, and the suite still runs', async () => {
      const { calls, issues, deps } = harness({ previousRunAt: async () => NOW - MISSED_NIGHT_MS - 1 })
      assert.equal(await watch(deps), 'missed-night')
      assert.deepEqual(calls, [`file:${didNotRunIssue('0.612.0', 'x').title}`, 'run'])
      assert.match(issues[0].body, /no run of the watch between 2026-11-05/)
    })

    it('is not reported at exactly 36 hours, or when there is no earlier run to compare with', async () => {
      for (const previous of [NOW - MISSED_NIGHT_MS, null]) {
        const { calls, deps } = harness({ previousRunAt: async () => previous })
        assert.equal(await watch(deps), 'green')
        assert.deepEqual(calls, ['run'])
      }
    })

    it('stays red when the suite is red as well, with both issues filed', async () => {
      const { calls, deps } = harness({ previousRunAt: async () => 0, runSuite: async () => { calls.push('run'); return { ok: false, output: REAL_FAILURE } } })
      assert.equal(await watch(deps), 'red')
      assert.deepEqual(calls, [`file:${didNotRunIssue('0.612.0', 'x').title}`, 'run', 'file:Live tests fail: the nightly full suite is red'])
    })

    it('carries a second failure of the same night as a comment on the issue the gap filed, so its cause is not lost (C3)', async () => {
      const { issues, deps } = harness({ previousRunAt: async () => 0, runSuite: async () => { throw new Error('spawn npm ENOENT') } })
      assert.equal(await watch(deps), 'did-not-run')
      assert.equal(issues.length, 2)
      assert.equal(issues[0].title, issues[1].title)
      assert.match(issues[1].comment, /spawn npm ENOENT/)
    })

    it('still runs the suite when the earlier run cannot be read, files the did-not-run issue and is not green (C5)', async () => {
      const { calls, issues, deps } = harness({ previousRunAt: async () => { throw new Error('gh run list failed') } })
      assert.equal(await watch(deps), 'did-not-run')
      assert.deepEqual(calls, [`file:${didNotRunIssue('0.612.0', 'x').title}`, 'run'])
      assert.match(issues[0].body, /gh run list failed/)
    })
  })
})

describe('exitCodeFor', () => {
  it('is 0 for a green night only: a red night, a night that did not run and a skipped night all exit 1', () => {
    assert.equal(exitCodeFor('green'), 0)
    for (const outcome of ['red', 'did-not-run', 'missed-night']) assert.equal(exitCodeFor(outcome), 1, outcome)
  })
})

describe('testsRan', () => {
  it('reads the count of the TAP summary, and is 0 for output with none', () => {
    assert.equal(testsRan('x\n# tests 1678\n# pass 1678\n'), 1678)
    assert.equal(testsRan('# tests 0\n'), 0)
    assert.equal(testsRan('Could not find x'), 0)
    assert.equal(testsRan('    # tests 9\n'), 0, 'a nested line is not the summary')
  })
})

describe('previousRunAt', () => {
  const ENV = { GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '300' }
  const list = (rows) => async (cmd, args) => ({ ok: true, output: rows.map(([id, at]) => `${id}\t${at}`).join('\n'), args })

  it('is the newest run other than this one', async () => {
    assert.equal(await previousRunAt(ENV, list([[300, '2026-11-07T06:17:00Z'], [299, '2026-11-06T06:20:00Z'], [298, '2026-11-05T06:19:00Z']])), Date.parse('2026-11-06T06:20:00Z'))
  })

  it('is null with no other run, and off Actions, where nothing is asked', async () => {
    assert.equal(await previousRunAt(ENV, list([[300, '2026-11-07T06:17:00Z']])), null)
    assert.equal(await previousRunAt({}, async () => { throw new Error('asked') }), null)
  })

  it('throws when gh fails, and when a time does not parse, rather than reading either as no gap', async () => {
    await assert.rejects(previousRunAt(ENV, async () => ({ ok: false, output: '' })), /gh run list failed/)
    await assert.rejects(previousRunAt(ENV, list([[299, 'not a time']])), /does not parse/)
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
  const tail = (body) => body.slice(-end.length)
  it('ends the failing-checks issue and the did-not-run issue with it', () => {
    assert.equal(tail(issueFor('0.612.0', { checks: ['one'], unrun: ['a'] }).body), end)
    assert.equal(tail(didNotRunIssue('0.612.0', 'no Chromium').body), end)
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

  it('does not blame the machine or SudokuPad, and has a comment naming the cause for a later night that finds the issue open', () => {
    const { body, comment } = didNotRunIssue('0.612.0', 'no run of the watch since Tuesday', { now: Date.UTC(2026, 10, 22) })
    assert.match(body, /GitHub not starting a scheduled run/)
    assert.match(comment, /^Again on 2026-11-22: no run of the watch since Tuesday/)
  })
})
