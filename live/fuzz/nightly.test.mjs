import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileIssue, issueTrailer, run } from '../watch.mjs'
import { FUZZ_MINUTES, FUZZ_TIMEOUT_MS, MINUTE_MS, NIGHTLY_CONFIG, NIGHTLY_HUNTS, didNotRunIssue, failureTitle, fuzzProcess, huntCount, mergeNeverRun, nightly, parseFuzzOutput } from './nightly.mjs'
import { CONFIGS } from './configs.mjs'

const failedOutput = (seed, error, steps = ['click cell 3', 'digit 5']) => [
  `fuzz FAILED on the 9x9 puzzle (seed ${seed}) after 41 s`,
  `error: ${error}`,
  `shrunk to ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}:`,
  ...steps.map((s, i) => `  ${i + 1}. ${s}`),
  `replay: npm run test:fuzz -- --seed ${seed} --path 12:0@3`,
  'shared error log: empty',
  ''
].join('\n')
const RULE = 'rule broken after "digit 5": pen-lines-drawn: drawn but not in the state: r1c1-r1c2'
const CRASH = 'crash signal after "reload": page error or console error: TypeError: x is null at 123'

const fakeGh = () => {
  const open = []
  const calls = []
  const runGh = async (cmd, args, { input } = {}) => {
    calls.push({ verb: args.slice(0, 2).join(' '), args, input })
    if (args[1] === 'list') return { ok: true, output: open.map((i) => `${i.number}\t${i.title}`).join('\n') }
    if (args[1] === 'create') { open.push({ number: open.length + 1, title: args[args.indexOf('--title') + 1] }); return { ok: true, output: '' } }
    return { ok: true, output: '' }
  }
  return { open, calls, file: (issue) => fileIssue(issue, runGh) }
}
// The fake clock moves only when a fuzz run ends: `outputs` are the runs' outputs in turn, and each takes an equal share of the 30 minutes, so the last one
// ends the night. `runs` records what each run was told.
const night = (gh, outputs, ok = false) => {
  const list = [].concat(outputs)
  const runs = []
  let clock = 0
  let seed = 0
  const share = Math.ceil(FUZZ_MINUTES * MINUTE_MS / list.length)
  const outcome = nightly({
    runFuzz: async (s, limits) => {
      runs.push({ seed: s, ...limits })
      clock += share
      return { ok, output: list[runs.length - 1] ?? 'a run started after the night was over\n' }
    },
    fileIssue: gh.file,
    newSeed: () => ++seed,
    now: () => clock,
    runUrl: 'https://example/run/1'
  })
  return Object.assign(outcome, { runs })
}
const BLOCKED = '\n\n' + issueTrailer('npm run fuzz:nightly', 'live/fuzz/nightly.mjs')
const verbs = (gh) => gh.calls.map((c) => c.verb).filter((v) => v !== 'issue list')

describe('the fuzz did-not-run issue (#805)', () => {
  it('ends with the Blocked by section', () => {
    assert.equal(didNotRunIssue('x').body.slice(-BLOCKED.length), BLOCKED)
  })
})

describe('a failing fuzz run', () => {
  it('files one bug issue with the seed, the shrunk steps and the replay command', async () => {
    const gh = fakeGh()
    assert.equal(await night(gh, failedOutput(77, RULE)), 'red')
    assert.deepEqual(verbs(gh), ['issue create'])
    const create = gh.calls.find((c) => c.verb === 'issue create')
    assert.equal(create.args[create.args.indexOf('--title') + 1], 'Fuzz: rule broken: pen-lines-drawn')
    assert.equal(create.args[create.args.indexOf('--label') + 1], 'bug,needs-info')
    assert.equal(create.input.slice(-BLOCKED.length), BLOCKED, 'the Blocked by section is last')
    assert.match(create.input, /seed 77/)
    assert.match(create.input, /1\. click cell 3\n2\. digit 5/)
    assert.match(create.input, /npm run test:fuzz -- --seed 77 --path 12:0@3/)
  })

  it('comments on the open issue when a second identical failure comes, filing nothing', async () => {
    const gh = fakeGh()
    await night(gh, failedOutput(76, CRASH))
    await night(gh, failedOutput(77, RULE))
    await night(gh, failedOutput(78, RULE.replace('r1c1-r1c2', 'r2c2-r2c3')))
    assert.deepEqual(verbs(gh), ['issue create', 'issue create', 'issue comment'])
    const comment = gh.calls.find((c) => c.verb === 'issue comment')
    assert.equal(comment.args[2], '2')
    assert.match(comment.input, /^The same failure again, seed 78/)
    assert.doesNotMatch(comment.input, /Filed by/)
    assert.match(comment.input, /r2c2-r2c3/)
  })

  it('files a second issue for a different failure', async () => {
    const gh = fakeGh()
    await night(gh, failedOutput(77, RULE))
    await night(gh, failedOutput(78, CRASH))
    assert.deepEqual(verbs(gh), ['issue create', 'issue create'])
    assert.deepEqual(gh.open.map((i) => i.title), ['Fuzz: rule broken: pen-lines-drawn', 'Fuzz: crash: page error or console error: TypeError: x is null at N'])
  })
})

describe('a night with several failures', () => {
  it('files each distinct failure and keeps hunting after the first', async () => {
    const gh = fakeGh()
    const hunt = night(gh, [failedOutput(1, RULE), failedOutput(2, CRASH)])
    assert.equal(await hunt, 'red')
    assert.deepEqual(verbs(gh), ['issue create', 'issue create'])
    assert.deepEqual(gh.open.map((i) => i.title), ['Fuzz: rule broken: pen-lines-drawn', 'Fuzz: crash: page error or console error: TypeError: x is null at N'])
    assert.equal(hunt.runs.length, 2)
  })

  it('comments on an open issue for a failure it already has, and the hunt goes on to the next', async () => {
    const gh = fakeGh()
    gh.open.push({ number: 9, title: 'Fuzz: rule broken: pen-lines-drawn' })
    assert.equal(await night(gh, [failedOutput(1, RULE), failedOutput(2, CRASH)]), 'red')
    assert.deepEqual(verbs(gh), ['issue comment', 'issue create'])
    assert.equal(gh.calls.find((c) => c.verb === 'issue comment').args[2], '9')
  })

  it('files or comments on a failure at most once in a night, even when it comes on two seeds', async () => {
    const gh = fakeGh()
    assert.equal(await night(gh, [failedOutput(1, RULE), failedOutput(2, RULE.replace('r1c1-r1c2', 'r2c2-r2c3')), failedOutput(3, CRASH)]), 'red')
    assert.deepEqual(verbs(gh), ['issue create', 'issue create'])
  })

  it('does not comment again in one night on an open issue it already commented on', async () => {
    const gh = fakeGh()
    gh.open.push({ number: 9, title: 'Fuzz: rule broken: pen-lines-drawn' })
    await night(gh, [failedOutput(1, RULE), failedOutput(2, RULE)])
    assert.deepEqual(verbs(gh), ['issue comment'])
  })

  it('starts each run on a fresh seed and gives it only the time left, bounded by the night\'s timeout', async () => {
    const gh = fakeGh()
    const n = night(gh, [failedOutput(1, RULE), failedOutput(2, CRASH)])
    await n
    assert.deepEqual(n.runs.map((r) => r.seed), [1, 2])
    assert.deepEqual(n.runs.map((r) => r.minutes), [FUZZ_MINUTES, FUZZ_MINUTES / 2])
    assert.deepEqual(n.runs.map((r) => r.timeoutMs), [FUZZ_TIMEOUT_MS, FUZZ_TIMEOUT_MS - FUZZ_MINUTES * MINUTE_MS / 2])
  })

  it('stops hunting when the failure and its shrink used the 30 minutes', async () => {
    const gh = fakeGh()
    const n = night(gh, failedOutput(1, RULE))
    assert.equal(await n, 'red')
    assert.equal(n.runs.length, 1)
  })

  it('starts no run with under a minute left, and one with a minute left', async () => {
    const after = async (minutesUsed) => {
      const runs = []
      let clock = 0
      await nightly({ runFuzz: async (seed, limits) => { runs.push(limits.minutes); clock += minutesUsed * MINUTE_MS; return { ok: false, output: failedOutput(runs.length, runs.length === 1 ? RULE : CRASH) } }, fileIssue: fakeGh().file, newSeed: () => 1, now: () => clock })
      return runs.length
    }
    assert.equal(await after(29.5), 1)
    assert.equal(await after(29), 2)
  })

  it('stays red when a later run passes', async () => {
    const gh = fakeGh()
    assert.equal(await night(gh, [failedOutput(1, RULE), 'fuzz passed: 90 action lists on the 9x9 puzzle in 900 s (seed 2)\n'], true), 'red')
  })

  it('files the did-not-run issue and stops when a later run has no verdict', async () => {
    const gh = fakeGh()
    const n = night(gh, [failedOutput(1, RULE), 'browserType.launch: Executable does not exist\n', failedOutput(3, CRASH)])
    assert.equal(await n, 'did-not-run')
    assert.equal(n.runs.length, 2)
    assert.deepEqual(gh.open.map((i) => i.title), ['Fuzz: rule broken: pen-lines-drawn', didNotRunIssue('x').title])
  })
})

// Hunts that run at once: `outputs[k]` is what the k-th run started prints. Every run yields once before it returns, so the hunts are all in flight when the first one ends. The first run to end uses `usedMinutes` of the night (all of it by default).
const PASS = (seed) => `fuzz passed: 9 action lists over 2 puzzles in 5 s (seed ${seed})\n`
const concurrent = (gh, hunts, outputs, { ok = false, print = () => {}, usedMinutes = FUZZ_MINUTES } = {}) => {
  const runs = []
  let clock = 0
  let seed = 0
  const outcome = nightly({
    hunts,
    runFuzz: async (s, limits) => {
      const k = runs.length
      runs.push({ seed: s, ...limits })
      await new Promise((resolve) => setImmediate(resolve))
      clock = usedMinutes * MINUTE_MS
      return { ok, output: outputs[k] ?? 'a run started after the night was over\n' }
    },
    // Filing takes real time on GitHub: yield a macrotask, so a second hunt reaches its own failure while the first is still filing.
    fileIssue: async (issue) => { await new Promise((resolve) => setImmediate(resolve)); return gh.file(issue) },
    newSeed: () => ++seed,
    now: () => clock,
    print
  })
  return Object.assign(outcome, { runs })
}

describe('hunts at once', () => {
  it('starts every hunt at the same time, each on its own seed', async () => {
    const n = concurrent(fakeGh(), 3, [PASS(1), PASS(2), PASS(3)], { ok: true })
    assert.equal(await n, 'green')
    assert.deepEqual(n.runs.map((r) => r.seed), [1, 2, 3])
    assert.deepEqual(n.runs.map((r) => r.minutes), [FUZZ_MINUTES, FUZZ_MINUTES, FUZZ_MINUTES])
    assert.deepEqual(n.runs.map((r) => r.timeoutMs), [FUZZ_TIMEOUT_MS, FUZZ_TIMEOUT_MS, FUZZ_TIMEOUT_MS])
  })

  it('files one issue when two hunts fail on the same title at once', async () => {
    const gh = fakeGh()
    const n = concurrent(gh, 2, [failedOutput(1, RULE), failedOutput(2, RULE.replace('r1c1-r1c2', 'r2c2-r2c3'))])
    assert.equal(await n, 'red')
    assert.deepEqual(verbs(gh), ['issue create'])
  })

  it('files one issue each when two hunts fail on two titles at once', async () => {
    const gh = fakeGh()
    assert.equal(await concurrent(gh, 2, [failedOutput(1, RULE), failedOutput(2, CRASH)]), 'red')
    assert.deepEqual(gh.open.map((i) => i.title).sort(), ['Fuzz: crash: page error or console error: TypeError: x is null at N', 'Fuzz: rule broken: pen-lines-drawn'])
  })

  it('comments once, not twice, when two hunts fail at once on a title an open issue has', async () => {
    const gh = fakeGh()
    gh.open.push({ number: 9, title: 'Fuzz: rule broken: pen-lines-drawn' })
    await concurrent(gh, 2, [failedOutput(1, RULE), failedOutput(2, RULE)])
    assert.deepEqual(verbs(gh), ['issue comment'])
  })

  it('hunts again in the hunt that failed, on a new seed with the time left, while the others go on', async () => {
    const gh = fakeGh()
    const runs = []
    let clock = 0
    const outputs = { 1: failedOutput(1, RULE), 2: PASS(2), 3: PASS(3) }
    const outcome = await nightly({
      hunts: 2,
      runFuzz: async (seed, limits) => { runs.push({ seed, ...limits }); await new Promise((resolve) => setImmediate(resolve)); clock += 10 * MINUTE_MS; return { ok: seed !== 1, output: outputs[seed] } },
      fileIssue: gh.file,
      newSeed: () => runs.length + 1,
      now: () => clock,
      print: () => {}
    })
    assert.equal(outcome, 'red')
    assert.deepEqual(runs.map((r) => r.seed), [1, 2, 3])
    assert.equal(runs[2].minutes, FUZZ_MINUTES - 10)
  })

  it('files one did-not-run issue when every hunt has no verdict at once, as a missing Chromium gives', async () => {
    const gh = fakeGh()
    const n = concurrent(gh, 3, ['browserType.launch: Executable does not exist\n', 'browserType.launch: Executable does not exist\n', 'browserType.launch: Executable does not exist\n'], { usedMinutes: 1 })
    assert.equal(await n, 'did-not-run')
    assert.deepEqual(verbs(gh), ['issue create'])
  })

  it('files one did-not-run issue when every hunt fails to start at once', async () => {
    const gh = fakeGh()
    const outcome = await nightly({ hunts: 2, runFuzz: async () => { throw new Error('spawn node ENOENT') }, fileIssue: gh.file, newSeed: () => 1, now: () => 0, print: () => {} })
    assert.equal(outcome, 'did-not-run')
    assert.deepEqual(verbs(gh), ['issue create'])
  })

  it('starts no new run in a hunt that failed after another hunt had no verdict, with time left', async () => {
    const gh = fakeGh()
    const n = concurrent(gh, 2, ['browserType.launch: Executable does not exist\n', failedOutput(2, RULE)], { usedMinutes: 1 })
    assert.equal(await n, 'did-not-run')
    assert.equal(n.runs.length, 2)
    assert.deepEqual(gh.open.map((i) => i.title).sort(), [didNotRunIssue('x').title, 'Fuzz: rule broken: pen-lines-drawn'].sort())
  })

  it('prints one never-run list, of the functions no hunt ran, under a label', async () => {
    const list = (...names) => ['a.user.js: ' + names.length + ' of 9 functions never ran', ...names.map((n, i) => `  ${n} (line ${i + 1}, column 3)`)].join('\n') + '\n'
    const printed = []
    await concurrent(fakeGh(), 2, [PASS(1) + list('f', 'g'), PASS(2) + list('f')], { ok: true, print: (line) => printed.push(line) })
    assert.deepEqual(printed, ["fuzz:nightly: functions no hunt ran (the lists above are each hunt's own):", 'a.user.js: 1 of 9 functions never ran', '  f (line 1, column 3)'])
  })
})

describe('huntCount', () => {
  it('is the default when FUZZ_HUNTS is unset or blank, and the number when it is a whole number', () => {
    assert.equal(huntCount({}), NIGHTLY_HUNTS)
    assert.equal(huntCount({ FUZZ_HUNTS: '' }), NIGHTLY_HUNTS)
    assert.equal(huntCount({ FUZZ_HUNTS: '3' }), 3)
  })
  it('refuses anything else, so a typo is never a quiet other count', () => {
    for (const bad of ['0', '-1', '2.5', 'three', ' 3', '03']) assert.throws(() => huntCount({ FUZZ_HUNTS: bad }), /FUZZ_HUNTS/, bad)
  })
})

describe('mergeNeverRun', () => {
  const run = (...lines) => lines.join('\n') + '\n'
  it('keeps a function only when every run left it out, and counts the largest total', () => {
    const a = run('fuzz passed: 1 action lists over 1 puzzles in 1 s (seed 1)', 'x.user.js: 2 of 8 functions never ran', '  f (line 1, column 1)', '  g (line 2, column 1)')
    const b = run('fuzz passed: 1 action lists over 1 puzzles in 1 s (seed 2)', 'x.user.js: 2 of 10 functions never ran', '  g (line 2, column 1)', '  h (line 3, column 1)')
    assert.deepEqual(mergeNeverRun([a, b]), ['x.user.js: 1 of 10 functions never ran', '  g (line 2, column 1)'])
  })
  it('ignores a run that printed no list, as a killed one does', () => {
    const a = run('x.user.js: 1 of 4 functions never ran', '  f (line 1, column 1)')
    assert.deepEqual(mergeNeverRun([a, 'boom\n']), ['x.user.js: 1 of 4 functions never ran', '  f (line 1, column 1)'])
  })
  it('is empty when no run printed a list', () => assert.deepEqual(mergeNeverRun(['boom\n']), []))
})

describe('a run with no failure', () => {
  it('files nothing when the fuzz passed', async () => {
    const gh = fakeGh()
    assert.equal(await night(gh, 'fuzz passed: 900 action lists on the 9x9 puzzle in 1800 s (seed 5)\n', true), 'green')
    assert.deepEqual(gh.calls, [])
  })

  it('files the did-not-run issue when the exit is non-zero even though "fuzz passed" was printed', async () => {
    const gh = fakeGh()
    assert.equal(await night(gh, 'fuzz passed: 900 action lists on the 9x9 puzzle in 1800 s (seed 5)\n', false), 'did-not-run')
  })

  it('files the did-not-run issue when no action list ran, which is not a pass', async () => {
    const gh = fakeGh()
    assert.equal(await night(gh, 'fuzz passed: 0 action lists on the 9x9 puzzle in 1 s (seed 5)\n', true), 'did-not-run')
  })

  it('files one did-not-run issue, and no second while it is open, when the fuzz printed no verdict', async () => {
    const gh = fakeGh()
    assert.equal(await night(gh, 'browserType.launch: Executable does not exist\n'), 'did-not-run')
    assert.equal(await night(gh, 'browserType.launch: Executable does not exist\n'), 'did-not-run')
    assert.deepEqual(verbs(gh), ['issue create'])
    assert.equal(gh.open[0].title, didNotRunIssue('x').title)
  })

  it('files the did-not-run issue when the fuzz process could not start', async () => {
    const gh = fakeGh()
    const outcome = await nightly({ runFuzz: async () => { throw new Error('spawn node ENOENT') }, fileIssue: gh.file, newSeed: () => 1, now: () => 0 })
    assert.equal(outcome, 'did-not-run')
    assert.match(gh.calls.find((c) => c.verb === 'issue create').input, /spawn node ENOENT/)
  })
})

describe('failureTitle', () => {
  it('names the broken rules once each, whatever the step and detail', () => {
    assert.equal(failureTitle('rules broken after "a": undo-to-start: x; pen-lines-drawn: y; undo-to-start: z'), 'Fuzz: rule broken: undo-to-start, pen-lines-drawn')
  })
  it('gives an error caught after the last action the same title as one caught after a named action', () => {
    const detail = 'page-stays-dark: the page color rgb(255, 255, 255) is not dark'
    assert.equal(failureTitle(`rule broken after the last action: ${detail}`), failureTitle(`rule broken after "blur": ${detail}`))
    assert.match(failureTitle('crash signal after the last action: page error or console error: boom'), /^Fuzz: crash: /)
  })
  it('never ends in a space, which a stored title would lose', () => {
    // The space lands at index 109, the last character the title keeps.
    assert.equal(failureTitle(`crash signal after "s": ${'a'.repeat(96)} ${'b'.repeat(40)}`), `Fuzz: crash: ${'a'.repeat(96)}`)
  })
  it('folds numbers in a crash signal, so another seed has the same title', () => {
    assert.equal(failureTitle('crash signal after "s": page error or console error: boom 12'), failureTitle('crash signal after "t": page error or console error: boom 99'))
  })
})

describe('parseFuzzOutput', () => {
  it('reads a verdict the same with a never-run list printed after it', () => {
    const list = 'ui-tweaks.user.js: 2 of 9 functions never ran\n  saveOptions (line 4, column 3)\n  (anonymous) (line 9, column 7)\n'
    assert.deepEqual(parseFuzzOutput(failedOutput(9, RULE) + list), parseFuzzOutput(failedOutput(9, RULE)))
    assert.deepEqual(parseFuzzOutput('fuzz passed: 3 action lists over 2 puzzles in 4 s (seed 1)\n' + list), { passed: true })
  })

  it('reads the failure the run prints', () => {
    const f = parseFuzzOutput(failedOutput(9, RULE))
    assert.deepEqual([f.seed, f.puzzle, f.steps, f.error], [9, '9x9', ['click cell 3', 'digit 5'], RULE])
  })
  it('is null for output with no verdict', () => assert.equal(parseFuzzOutput('boom'), null))
})

describe('the did-not-run title in the workflow', () => {
  it('is the same text fuzz.yml files under, so the open-issue check matches across the two', () => {
    const yml = readFileSync(new URL('../../.github/workflows/fuzz.yml', import.meta.url), 'utf8')
    assert.match(yml, new RegExp(`title: '${didNotRunIssue('x').title}'`))
  })
})

describe('the fuzz process', () => {
  it('is started with the run\'s seed and minutes, and killed at the timeout it is given', async () => {
    const calls = []
    await fuzzProcess(7, { minutes: 12.5, timeoutMs: 99 }, async (...a) => { calls.push(a); return { ok: true, output: '' } })
    assert.deepEqual(calls, [['node', ['live/fuzz/run.mjs', '--seed', '7', '--minutes', '12.5', '--config', 'busy-start', '--coverage'], { mergeStderr: true, timeout: 99 }]])
  })
})

describe('the real run', () => {
  it('captures what a crashing child prints on stderr, so a did-not-run issue holds the cause', async () => {
    const r = await run('node', ['-e', 'console.error("no chromium here"); process.exit(1)'], { mergeStderr: true })
    assert.equal(r.ok, false)
    assert.match(r.output, /no chromium here/)
  })

  it('kills a child still running after the timeout, which then has no verdict', async () => {
    const r = await run('node', ['-e', 'setTimeout(() => {}, 60000)'], { timeout: 200 })
    assert.equal(r.ok, false)
    assert.equal(parseFuzzOutput(r.output), null)
  })
})

it('the nightly runs a whole number of hunts, at least one', () => {
  assert.ok(Number.isInteger(NIGHTLY_HUNTS) && NIGHTLY_HUNTS >= 1)
})

it('the nightly hunts with a configuration the fuzz knows, so a renamed one fails here and not at 07:47', () => {
  assert.ok(Object.keys(CONFIGS).includes(NIGHTLY_CONFIG), `no configuration "${NIGHTLY_CONFIG}"`)
})
