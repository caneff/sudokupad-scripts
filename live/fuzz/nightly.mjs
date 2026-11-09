// `npm run fuzz:nightly`: the 30-minute fuzz run of the nightly workflow (.github/workflows/fuzz.yml, #595). It runs `live/fuzz/run.mjs` with a fresh
// seed and reads what it prints. A failure files one `bug` issue titled by the failing rule or error signature (the seed, the shrunk steps and the replay
// command in the body); a failure whose title an open issue already has comments on that issue instead. A run that could not start or print a verdict
// files one "did not run" issue, as the daily watch does. Filing is `fileIssue` of live/watch.mjs, not a second copy.
import { pathToFileURL } from 'node:url'
import { fileIssue, run } from '../watch.mjs'

export const FUZZ_MINUTES = 30
const TITLE_MAX = 110

// A short, stable name for what failed, from the error line the fuzz prints (engine.mjs): the broken rules' names, or the first crash signal with its
// numbers folded, so the same failure on another seed or step still has the same title.
export function failureTitle (error) {
  const rules = /^rules? broken after ".*?": (.*)$/s.exec(error)
  if (rules) {
    const names = [...new Set(rules[1].split('; ').map((v) => /^([\w-]+): /.exec(v)?.[1]).filter(Boolean))]
    if (names.length) return `Fuzz: rule broken: ${names.join(', ')}`
  }
  const signal = /^crash signals? after ".*?": (.*)$/s.exec(error)
  const text = (signal ? signal[1].split('; ')[0] : error).split('\n')[0].replace(/\d+/g, 'N').trim()
  return `Fuzz: ${signal ? 'crash' : 'error'}: ${text}`.slice(0, TITLE_MAX)
}

// What `run.mjs` printed: { passed } for a green run, { failed, ... } for a failure, null when it printed neither verdict.
export function parseFuzzOutput (output) {
  if (/^fuzz passed: /m.test(output)) return { passed: true }
  const head = /^fuzz FAILED on the (.+) puzzle \(seed (\d+)\)/m.exec(output)
  const error = /^error: (.*(?:\n(?!shrunk to ).*)*)$/m.exec(output)?.[1]
  const replay = /^replay: (.*)$/m.exec(output)?.[1]
  if (!head || error == null || !replay) return null
  const steps = /^shrunk to \d+ steps?:\n((?: {2}\d+\. .*\n?)*)/m.exec(output)?.[1].trimEnd().split('\n').map((l) => l.replace(/^ {2}\d+\. /, '')) ?? []
  const log = /^shared error log.*\n?((?: {2}.*\n?)*)/m.exec(output)?.[1].trimEnd().split('\n').map((l) => l.trim()).filter(Boolean) ?? []
  return { failed: true, puzzle: head[1], seed: Number(head[2]), error: error.trim(), steps, replay, log }
}

export function fuzzIssue (f, { runUrl } = {}) {
  const lines = [
    `The nightly fuzz run (\`npm run test:fuzz -- --minutes ${FUZZ_MINUTES}\`) failed on the ${f.puzzle} puzzle, seed ${f.seed}.`,
    '',
    `Error: ${f.error}`,
    '',
    `Shrunk to ${f.steps.length} ${f.steps.length === 1 ? 'step' : 'steps'}:`,
    '',
    ...f.steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    'Replay:',
    '',
    '```',
    f.replay,
    '```',
    '',
    ...(f.log.length ? ['Shared error log, newest first:', '', ...f.log.map((l) => `- ${l}`), ''] : []),
    ...(runUrl ? [`Run: ${runUrl}`, ''] : []),
    'Filed by `npm run fuzz:nightly` (`live/fuzz/nightly.mjs`).'
  ].join('\n')
  const title = failureTitle(f.error)
  return { title, once: true, body: lines, comment: `The same failure again, seed ${f.seed} on the ${f.puzzle} puzzle.\n\n${lines.split('\n').slice(2).join('\n')}` }
}

// The fixed title is the dedupe key, as in the watch's.
export const didNotRunIssue = (why) => ({
  title: 'Fuzz did not run: the nightly fuzz could not be checked',
  once: true,
  body: [
    '`npm run fuzz:nightly` ended without a verdict. The cause may be this machine (no Chromium, no network) or a SudokuPad change that stopped the fuzz starting; what stopped it:',
    '',
    why,
    '',
    'Filed by `npm run fuzz:nightly` (`live/fuzz/nightly.mjs`).'
  ].join('\n')
})

// 'green', 'red' (a failure filed or commented) or 'did-not-run'.
export async function nightly ({ runFuzz, fileIssue: file, seed, runUrl }) {
  let result
  try { result = await runFuzz(seed) } catch (e) {
    await file(didNotRunIssue(`the fuzz could not be started: ${e.message}`))
    return 'did-not-run'
  }
  const parsed = parseFuzzOutput(result.output)
  if (parsed?.passed && result.ok) return 'green'
  if (parsed?.failed) {
    await file(fuzzIssue(parsed, { runUrl }))
    return 'red'
  }
  await file(didNotRunIssue(`it printed no verdict (exit ${result.ok ? 0 : 'non-zero'}); the tail of its output:\n\n\`\`\`\n${result.output.split('\n').slice(-15).join('\n')}\n\`\`\``))
  return 'did-not-run'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seed = Math.floor(Math.random() * 2 ** 31)
  const runUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined
  const outcome = await nightly({
    runFuzz: (s) => run('node', ['live/fuzz/run.mjs', '--seed', String(s), '--minutes', String(FUZZ_MINUTES)]),
    fileIssue,
    seed,
    runUrl
  })
  console.error(`fuzz:nightly: ${outcome} (seed ${seed})`)
  process.exitCode = outcome === 'green' ? 0 : 1
}
