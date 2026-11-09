// live/fuzz/nightly.mjs through the real `fileIssue` of live/watch.mjs, with the fuzz run and `gh` faked. Network-free, so it runs in `npm test`.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileIssue, run } from '../watch.mjs'
import { didNotRunIssue, failureTitle, nightly, parseFuzzOutput } from './nightly.mjs'

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
const night = (gh, output, ok = false) => nightly({ runFuzz: async () => ({ ok, output }), fileIssue: gh.file, seed: 1, runUrl: 'https://example/run/1' })
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
    const outcome = await nightly({ runFuzz: async () => { throw new Error('spawn node ENOENT') }, fileIssue: gh.file, seed: 1 })
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
