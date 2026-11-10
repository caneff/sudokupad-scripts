// `npm run fuzz:nightly`: the 30-minute fuzz run of the nightly workflow. It runs `live/fuzz/run.mjs` with a fresh
// seed and reads what it prints. A failure files one `bug` and `needs-info` issue titled by the failing rule or error signature (the seed, the shrunk steps and the replay
// command in the body); a failure whose title an open issue already has comments on that issue instead. After a failure the hunt starts again on a new seed
// with the time left, so one failure cannot use the whole night; a failure's title is filed or commented on at most once a night. A run that could not start or print a verdict
// files one "did not run" issue and ends the night, as the daily watch does. Filing is `fileIssue` of live/watch.mjs, not a second copy.
import { pathToFileURL } from 'node:url'
import { BLOCKED_BY, fileIssue, run } from '../watch.mjs'

export const FUZZ_MINUTES = 30
export const MINUTE_MS = 60000
const TITLE_MAX = 110
// Less time than this left is not worth a page start.
const MIN_RUN_MINUTES = 1
// The whole night: the hunts, a shrink of up to 10 minutes, and the page starts; a fuzz still running after this has hung and is killed.
export const FUZZ_TIMEOUT_MS = (FUZZ_MINUTES + 20) * MINUTE_MS

// A short, stable name for what failed, from the error line the fuzz prints (engine.mjs): the broken rules' names, or the first crash signal with its
// numbers folded, so the same failure on another seed or step still has the same title.
export function failureTitle (error) {
  const rules = /^rules? broken after (?:".*?"|the last action): (.*)$/s.exec(error)
  if (rules) {
    const names = [...new Set(rules[1].split('; ').map((v) => /^([\w-]+): /.exec(v)?.[1]).filter(Boolean))]
    if (names.length) return `Fuzz: rule broken: ${names.join(', ')}`
  }
  const signal = /^crash signals? after (?:".*?"|the last action): (.*)$/s.exec(error)
  const text = (signal ? signal[1].split('; ')[0] : error).split('\n')[0].replace(/\d+/g, 'N').trim()
  return `Fuzz: ${signal ? 'crash' : 'error'}: ${text}`.slice(0, TITLE_MAX).trimEnd()
}

// A pass that ran no action list (the time limit fired before the first) is no verdict.
export function parseFuzzOutput (output) {
  const passed = /^fuzz passed: (\d+) action lists/m.exec(output)
  if (passed) return Number(passed[1]) > 0 ? { passed: true } : null
  const head = /^fuzz FAILED on the (.+) puzzle \(seed (\d+)\)/m.exec(output)
  const error = /^error: (.*(?:\n(?!shrunk to ).*)*)$/m.exec(output)?.[1]
  const replay = /^replay: (.*)$/m.exec(output)?.[1]
  if (!head || error == null || !replay) return null
  const steps = /^shrunk to \d+ steps?:\n((?: {2}\d+\. .*\n?)*)/m.exec(output)?.[1].trimEnd().split('\n').map((l) => l.replace(/^ {2}\d+\. /, '')) ?? []
  const log = /^shared error log.*\n?((?: {2}.*\n?)*)/m.exec(output)?.[1].trimEnd().split('\n').map((l) => l.trim()).filter(Boolean) ?? []
  return { failed: true, puzzle: head[1], seed: Number(head[2]), error: error.trim(), steps, replay, log }
}

function fuzzIssue (f, { runUrl } = {}) {
  const details = [
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
    ...(runUrl ? [`Run: ${runUrl}`, ''] : [])
  ].join('\n')
  const intro = `The nightly fuzz run (\`npm run fuzz:nightly\`) failed on the ${f.puzzle} puzzle, seed ${f.seed}.`
  return {
    title: failureTitle(f.error),
    once: true,
    body: `${intro}\n\n${details}\nFiled by \`npm run fuzz:nightly\` (\`live/fuzz/nightly.mjs\`).\n\n${BLOCKED_BY}`,
    comment: `The same failure again, seed ${f.seed} on the ${f.puzzle} puzzle.\n\n${details}`
  }
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
    'Filed by `npm run fuzz:nightly` (`live/fuzz/nightly.mjs`).',
    '',
    BLOCKED_BY
  ].join('\n')
})

export async function nightly ({ runFuzz, fileIssue: file, newSeed, now = Date.now, runUrl }) {
  const start = now()
  const reported = new Set()
  while (true) {
    const minutes = FUZZ_MINUTES - (now() - start) / MINUTE_MS
    if (reported.size > 0 && minutes < MIN_RUN_MINUTES) break
    let result
    try { result = await runFuzz(newSeed(), { minutes, timeoutMs: FUZZ_TIMEOUT_MS - (now() - start) }) } catch (e) {
      await file(didNotRunIssue(`the fuzz could not be started: ${e.message}`))
      return 'did-not-run'
    }
    const parsed = parseFuzzOutput(result.output)
    if (parsed?.passed && result.ok) break
    if (!parsed?.failed) {
      await file(didNotRunIssue(`it printed no verdict (exit ${result.ok ? 0 : 'non-zero'}); the tail of its output:\n\n\`\`\`\n${result.output.split('\n').slice(-15).join('\n')}\n\`\`\``))
      return 'did-not-run'
    }
    const issue = fuzzIssue(parsed, { runUrl })
    if (!reported.has(issue.title)) await file(issue)
    reported.add(issue.title)
  }
  return reported.size > 0 ? 'red' : 'green'
}

// Each run is told its seed in the log, since a run killed for hanging prints none.
export function fuzzProcess (seed, { minutes, timeoutMs }, runner = run) {
  console.error(`fuzz:nightly: seed ${seed} for ${minutes} minutes`)
  return runner('node', ['live/fuzz/run.mjs', '--seed', String(seed), '--minutes', String(minutes)], { mergeStderr: true, timeout: timeoutMs })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined
  const outcome = await nightly({
    runFuzz: fuzzProcess,
    fileIssue,
    newSeed: () => Math.floor(Math.random() * 2 ** 31),
    runUrl
  })
  console.error(`fuzz:nightly: ${outcome}`)
  process.exitCode = outcome === 'green' ? 0 : 1
}
