// live/fuzz/nightly.mjs through the real `fileIssue` of live/watch.mjs, with the fuzz run and `gh` faked. Network-free, so it runs in `npm test`.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileIssue, run } from '../watch.mjs'
import { FUZZ_MINUTES, FUZZ_TIMEOUT_MS, didNotRunIssue, failureTitle, nightly, parseFuzzOutput } from './nightly.mjs'

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

// A fake `gh`: open issues are kept, and every call is recorded.
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
  const share = Math.ceil(FUZZ_MINUTES * 60000 / list.length)
  const outcome = nightly({
    runFuzz: async (s, limits) => {
      runs.push({ seed: s, ...limits })
      clock += share
      return { ok, output: list[runs.length - 1] }
    },
    fileIssue: gh.file,
    newSeed: () => ++seed,
    now: () => clock,
    runUrl: 'https://example/run/1'
  })
  return Object.assign(outcome, { runs })
}
const verbs = (gh) => gh.calls.map((c) => c.verb).filter((v) => v !== 'issue list')

describe('a failing fuzz run', () => {
  it('files one bug issue with the seed, the shrunk steps and the replay command', async () => {
    const gh = fakeGh()
    assert.equal(await night(gh, failedOutput(77, RULE)), 'red')
    assert.deepEqual(verbs(gh), ['issue create'])
    const create = gh.calls.find((c) => c.verb === 'issue create')
    assert.equal(create.args[create.args.indexOf('--title') + 1], 'Fuzz: rule broken: pen-lines-drawn')
    assert.equal(create.args[create.args.indexOf('--label') + 1], 'bug')
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
    const night2 = night(gh, [failedOutput(1, RULE), failedOutput(2, CRASH)])
    assert.equal(await night2, 'red')
    assert.deepEqual(verbs(gh), ['issue create', 'issue create'])
    assert.deepEqual(gh.open.map((i) => i.title), ['Fuzz: rule broken: pen-lines-drawn', 'Fuzz: crash: page error or console error: TypeError: x is null at N'])
    assert.equal(night2.runs.length, 2)
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
    assert.deepEqual(n.runs.map((r) => r.timeoutMs), [FUZZ_TIMEOUT_MS, FUZZ_TIMEOUT_MS - FUZZ_MINUTES * 30000])
  })

  it('stops hunting when the failure and its shrink used the 30 minutes', async () => {
    const gh = fakeGh()
    const n = night(gh, failedOutput(1, RULE))
    assert.equal(await n, 'red')
    assert.equal(n.runs.length, 1)
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
    for (let n = 100; n < 125; n++) {
      const title = failureTitle(`crash signal after "s": ${'a'.repeat(n - 30)} ${'b'.repeat(40)}`)
      assert.equal(title, title.trimEnd())
    }
  })
  it('folds numbers in a crash signal, so another seed has the same title', () => {
    assert.equal(failureTitle('crash signal after "s": page error or console error: boom 12'), failureTitle('crash signal after "t": page error or console error: boom 99'))
  })
})

describe('parseFuzzOutput', () => {
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
