// `npm run fuzz:nightly`: the 30-minute fuzz run of the nightly workflow. It runs `live/fuzz/run.mjs` with a fresh
// seed and reads what it prints; `NIGHTLY_HUNTS` of them run at once (#925), each with its own seeds. A failure files one `bug` and `needs-info` issue titled by the failing rule or error signature (the seed, the shrunk steps and the replay
// command in the body); a failure whose title an open issue already has comments on that issue instead, and two hunts failing on one title file or comment once. After a failure that hunt starts again on a new seed
// with the time left, so one failure cannot use the whole night; a failure's title is filed or commented on at most once a night. A run that could not start or print a verdict
// files one "did not run" issue (one, whatever the number of hunts) and ends the night: runs already going finish, and no hunt starts another. Filing is `fileIssue` of live/watch.mjs, not a second copy.
// At the end it prints one never-run list merged over the hunts.
import { pathToFileURL } from 'node:url'
import { BLOCKED_BY, fileIssue, run } from '../watch.mjs'
import { neverRunReport } from './coverage.mjs'

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

// The never-run lists the hunts print after their verdicts (`neverRunReport` of coverage.mjs), as one list in the same format: a function is never-run only if no hunt ran it. A hunt that printed no list
// (killed for hanging) says nothing. A function inside a never-run one is not listed by a hunt (V8 never compiles it), so a function a hunt left out is counted as run: the merged count is a floor, as each hunt's.
export function mergeNeverRun (outputs) {
  const hunts = outputs.map((output) => {
    const scripts = {}
    let file
    for (const line of output.split('\n')) {
      const head = /^(\S+\.user\.js): \d+ of (\d+) functions never ran$/.exec(line)
      if (head) { file = head[1]; scripts[file] = { total: Number(head[2]), never: [] }; continue }
      const fn = /^ {2}(.*) \(line (\d+), column (\d+)\)$/.exec(line)
      if (fn && file) scripts[file].never.push({ name: fn[1], line: Number(fn[2]), column: Number(fn[3]) })
    }
    return scripts
  }).filter((scripts) => Object.keys(scripts).length > 0)
  const key = (f) => `${f.name}:${f.line}:${f.column}`
  const files = [...new Set(hunts.flatMap((scripts) => Object.keys(scripts)))]
  return neverRunReport(Object.fromEntries(files.map((file) => {
    const seen = hunts.map((scripts) => scripts[file]).filter(Boolean)
    return [file, { total: Math.max(...seen.map((x) => x.total)), never: seen[0].never.filter((f) => seen.every((x) => x.never.some((g) => key(g) === key(f)))) }]
  })))
}

// The number of hunts: `FUZZ_HUNTS` when set (the workflow's `hunts` input passes it, blank when not given), else `NIGHTLY_HUNTS`. A value that is not a whole number of 1 or more stops the run, never a quiet other count: a measurement
// with a typo would be recorded as the wrong count, and 0 or -1 would run no hunt and pass.
export function huntCount (env = process.env) {
  const raw = env.FUZZ_HUNTS
  if (raw === undefined || raw === '') return NIGHTLY_HUNTS
  if (!/^[1-9]\d*$/.test(raw)) throw new Error(`FUZZ_HUNTS must be a whole number of 1 or more, not "${raw}"`)
  return Number(raw)
}

// `hunts` loops run at once, each with its own seeds and its own "hunt again after a failure" loop; they share the night's clock, the set of titles reported, and the did-not-run stop.
export async function nightly ({ runFuzz, fileIssue: file, newSeed, now = Date.now, runUrl, hunts = 1, print = console.log }) {
  const start = now()
  const reported = new Set()
  const outputs = []
  let didNotRun = false
  // One issue for the night: the flag is set before the filing is awaited, so a second hunt that has no verdict either (a missing Chromium stops all of them together) files nothing.
  const stopNight = async (why) => {
    if (didNotRun) return
    didNotRun = true
    await file(didNotRunIssue(why))
  }
  const hunt = async () => {
    while (true) {
      if (didNotRun) return
      const minutes = FUZZ_MINUTES - (now() - start) / MINUTE_MS
      if (reported.size > 0 && minutes < MIN_RUN_MINUTES) return
      let result
      try { result = await runFuzz(newSeed(), { minutes, timeoutMs: FUZZ_TIMEOUT_MS - (now() - start) }) } catch (e) {
        await stopNight(`the fuzz could not be started: ${e.message}`)
        return
      }
      outputs.push(result.output)
      const parsed = parseFuzzOutput(result.output)
      if (parsed?.passed && result.ok) return
      if (!parsed?.failed) {
        await stopNight(`it printed no verdict (exit ${result.ok ? 0 : 'non-zero'}); the tail of its output:\n\n\`\`\`\n${result.output.split('\n').slice(-15).join('\n')}\n\`\`\``)
        return
      }
      const issue = fuzzIssue(parsed, { runUrl })
      // Marked before the filing is awaited, so a second hunt failing on the same title while this one files does not file it again.
      if (!reported.has(issue.title)) {
        reported.add(issue.title)
        await file(issue)
      }
    }
  }
  await Promise.all(Array.from({ length: hunts }, hunt))
  const never = mergeNeverRun(outputs)
  if (never.length) ['fuzz:nightly: functions no hunt ran (the lists above are each hunt\'s own):', ...never].forEach((line) => print(line))
  if (didNotRun) return 'did-not-run'
  return reported.size > 0 ? 'red' : 'green'
}

// The nightly also asks for the never-run list (`--coverage`, #729): the measured cost is small (docs/research/fuzz-hit-rate.md), and `parseFuzzOutput` reads only the lines of a verdict, so the list after it is ignored.
// The configuration the nightly hunts with: busy-start caught the most planted bugs, and the fastest, of the four measured
// (docs/research/fuzz-planted-bugs.md, third run). Named on the command line, not made the default, so a replay command printed before keeps replaying.
export const NIGHTLY_CONFIG = 'busy-start'

// How many hunts run at once (#925). `FUZZ_HUNTS` overrides it (`huntCount`), which is how fuzz.yml's `hunts` input measures a count on the runner (docs/research/fuzz-hit-rate.md, § Hunts at once).
export const NIGHTLY_HUNTS = 1

// Each run is told its seed in the log, since a run killed for hanging prints none.
export function fuzzProcess (seed, { minutes, timeoutMs }, runner = run) {
  console.error(`fuzz:nightly: seed ${seed} for ${minutes} minutes`)
  return runner('node', ['live/fuzz/run.mjs', '--seed', String(seed), '--minutes', String(minutes), '--config', NIGHTLY_CONFIG, '--coverage'], { mergeStderr: true, timeout: timeoutMs })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined
  const outcome = await nightly({
    hunts: huntCount(),
    runFuzz: fuzzProcess,
    fileIssue,
    newSeed: () => Math.floor(Math.random() * 2 ** 31),
    runUrl
  })
  console.error(`fuzz:nightly: ${outcome}`)
  process.exitCode = outcome === 'green' ? 0 : 1
}
