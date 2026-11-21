// `npm run watch:live`: runs the full live suite every night (#1026), and files a `bug` and `needs-info` issue when it is red, naming the failing tests. The full
// suite is no merge gate: a worker runs only the live files a change touches (`live/changed.mjs`), and this run is the backstop for the rest. Meant for a daily schedule.
// SudokuPad is recorded again for every run (LIVE_REFRESH=1), since `?v=` may not move when its assets do (docs/research/sudokupad-version-signal.md).
//
// A red night that finds its issue still open (the title names the SudokuPad version) comments on it instead of filing another. A night that cannot be called
// green files one "did not run" issue, which stays open until read and is filed once: the suite could not get as far as the checks (no Chromium, a failed
// recording, no version read), it exited 0 having run no tests, or the run before this one is over 36 hours old, which means GitHub skipped a night (the next
// night's run says so, since a run that never started cannot). Exit 1 for all of those, so the night is red in Actions too.

import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cacheHome, liveVersion } from './cache.mjs'

const REPO = 'caneff/sudokupad-scripts'
const ROOT = fileURLToPath(new URL('..', import.meta.url))

// Playwright looks for its browsers in `<cache home>/ms-playwright` on Linux, so moving the harness cache with
// XDG_CACHE_HOME (live/cache.mjs) would move that lookup too. The pin is the folder it would use with XDG_CACHE_HOME unset.
export const suiteEnv = (env, home, platform = process.platform) => platform === 'linux' && env.XDG_CACHE_HOME && !env.PLAYWRIGHT_BROWSERS_PATH && !env.npm_config_playwright_browsers_path
  ? { ...env, PLAYWRIGHT_BROWSERS_PATH: join(cacheHome({}, home), 'ms-playwright') }
  : env

// What `npm run test:live` runs with under the watch. LIVE_TIMING=1 makes attack 78's time budget count (live/timing.mjs).
export const suiteRunEnv = (env, home, platform) => ({ ...suiteEnv(env, home, platform), LIVE_REFRESH: '1', LIVE_TIMING: '1', NODE_OPTIONS: '--test-reporter=tap' })

// GitHub starts a scheduled run late, sometimes by hours: 36 hours between two runs of a nightly schedule means one was skipped.
export const MISSED_NIGHT_MS = 36 * 60 * 60 * 1000

// The summary line of `node --test --test-reporter=tap`, 0 when there is none: a run that crashed before any test, or was given no file, prints no summary.
export const testsRan = (tap) => Number(/^# tests (\d+)$/m.exec(tap)?.[1] ?? 0)

// What failed in `node --test --test-reporter=tap` output. `checks` are tests that ran and failed or hit the test time limit. `unrun` are
// what never got to run: a file that failed to load (a failure at the top level) and a test cancelled by a
// failing `before` hook, which is how a missing Chromium or a failed recording shows. A parent suite fails only
// because something inside it did, so it is neither. A failing `# TODO` test does not fail the run.
export function failedChecks (tap) {
  const lines = tap.split('\n')
  const checks = []
  const unrun = []
  lines.forEach((line, i) => {
    const m = /^( *)not ok \d+ - (.*)$/.exec(line)
    if (!m || / # TODO\b/.test(m[2])) return
    const next = lines.slice(i + 1).findIndex((l) => /^ *(not )?ok \d+ /.test(l))
    const block = lines.slice(i + 1, next === -1 ? undefined : i + 1 + next).join('\n')
    const type = /failureType: '(\w+)'/.exec(block)?.[1]
    const name = m[2].replace(/\\([#\\])/g, '$1')
    if (type === 'hookFailed' || (type === 'testCodeFailure' && m[1] === '')) unrun.push(name)
    else if (type === 'testCodeFailure' || type === 'testTimeoutFailure') checks.push(name)
  })
  return { checks, unrun }
}

// The end of an issue body a check files: the command and file that filed it, then the Blocked by section that drain and triage read
// (a finding is never blocked by another ticket). One builder, so every filer's issues end alike.
export const issueTrailer = (command, file) => `Filed by \`${command}\` (\`${file}\`).\n\n## Blocked by\n\n- None — can start immediately.`
const TRAILER = issueTrailer('npm run watch:live', 'live/watch.mjs')

const failingList = ({ checks, unrun }) => [
  ...checks.map((c) => `- ${c}`),
  ...(unrun.length ? ['', 'Did not run (a file that failed to load, or a failed `before` hook):', '', ...unrun.map((c) => `- ${c}`)] : [])
]

// `once`: a night that is still red on a version whose issue is open must not file the same bug again; it posts `comment` on that issue, so the one issue names
// the failing tests of every night it stayed open.
export const issueFor = (version, failed, { now = Date.now() } = {}) => ({
  title: `Live tests fail on SudokuPad ${version}`,
  once: true,
  body: [
    `\`npm run test:live\` is red against SudokuPad ${version}, recorded again for the run. Failing checks:`,
    '',
    ...failingList(failed),
    '',
    TRAILER
  ].join('\n'),
  comment: [`Red again on ${new Date(now).toISOString().slice(0, 10)}. Failing checks:`, '', ...failingList(failed)].join('\n')
})

// The fixed title is the dedupe key: `fileIssue` files an `once` issue only when no open issue has its title.
export const didNotRunIssue = (version, why) => ({
  title: 'Watch did not run: the live suite could not be checked',
  once: true,
  body: [
    `\`npm run watch:live\` could not check SudokuPad ${version}, so the next run tries again. The cause may be this machine (no Chromium, no network) or a SudokuPad change that stopped the suite starting (the version tag gone, a control renamed); what stopped it:`,
    '',
    why,
    '',
    TRAILER
  ].join('\n')
})

// A suite that could not get to its checks (or a version that could not be read) files the did-not-run issue: a bug for it would blame SudokuPad, which may or may
// not be at fault. A suite that exited 0 having run no tests is the same, never a green night. A missed night files the same issue and still runs the suite.
export async function watch ({ liveVersion, now, previousRunAt, runSuite, fileIssue }) {
  let version = 'unknown'
  const didNotRun = async (why) => {
    await fileIssue(didNotRunIssue(version, why))
    return 'did-not-run'
  }
  try { version = await liveVersion() } catch (e) { return didNotRun(`the version could not be read: ${e.message}`) }
  const previous = await previousRunAt()
  const missed = previous !== null && now() - previous > MISSED_NIGHT_MS
  if (missed) await fileIssue(didNotRunIssue(version, `no run of the watch between ${new Date(previous).toISOString()} and ${new Date(now()).toISOString()}: GitHub skipped a night, or the workflow was off.`))
  let result
  try { result = await runSuite() } catch (e) { return didNotRun(`the suite could not be started: ${e.message}`) }
  const { ok, output } = result
  if (!ok) {
    const failed = failedChecks(output)
    if (failed.checks.length === 0) return didNotRun(`the suite failed with no failing check (${failed.unrun.length} unrun): ${failed.unrun.join(', ') || 'see the workflow log'}`)
    await fileIssue(issueFor(version, failed, { now: now() }))
    return 'red'
  }
  if (testsRan(output) === 0) return didNotRun('the suite exited 0 but ran no tests')
  return missed ? 'missed-night' : 'green'
}

// `mergeStderr` also captures stderr into the output (a crash before any verdict prints only there); `timeout` kills a child still running after that many ms.
export const run = (command, args, { env = process.env, input, mergeStderr = false, timeout } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: ROOT, env, timeout, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', mergeStderr ? 'pipe' : 'inherit'] })
  let output = ''
  child.stdout.on('data', (d) => { output += d; process.stdout.write(d) })
  child.stderr?.on('data', (d) => { output += d; process.stderr.write(d) })
  child.on('error', reject)
  child.on('close', (code) => resolve({ ok: code === 0, output }))
  if (input !== undefined) child.stdin.end(input)
})

// `comment`, with `once`: the text to comment on the open issue that has the title, instead of doing nothing.
export async function fileIssue ({ title, body, once, comment }, runGh = run) {
  if (once) {
    const list = await runGh('gh', ['issue', 'list', '--repo', REPO, '--state', 'open', '--limit', '200', '--json', 'number,title', '--jq', '.[] | "\\(.number)\t\\(.title)"'])
    if (!list.ok) throw new Error('gh issue list failed')
    const open = list.output.split('\n').map((l) => l.split('\t')).find(([, t]) => t === title)
    if (open) {
      if (!comment) return
      const { ok } = await runGh('gh', ['issue', 'comment', open[0], '--repo', REPO, '--body-file', '-'], { input: comment })
      if (!ok) throw new Error('gh issue comment failed')
      return
    }
  }
  const { ok } = await runGh('gh', ['issue', 'create', '--repo', REPO, '--label', 'bug,needs-info', '--title', title, '--body-file', '-'], { input: body })
  if (!ok) throw new Error('gh issue create failed')
}

// When the run of the watch before this one started, or null when there is none or this is not a GitHub Actions run (a hand run has nothing to compare with).
// A run that GitHub never started leaves no record, so the gap between two records is how a skipped night shows. gh failing is an error, not "no earlier run".
export async function previousRunAt (env, runGh = run) {
  if (env.GITHUB_ACTIONS !== 'true') return null
  const list = await runGh('gh', ['run', 'list', '--repo', REPO, '--workflow', 'watch.yml', '--limit', '20', '--json', 'databaseId,createdAt', '--jq', '.[] | "\\(.databaseId)\t\\(.createdAt)"'])
  if (!list.ok) throw new Error('gh run list failed')
  const earlier = list.output.split('\n').filter(Boolean).map((l) => l.split('\t')).filter(([id]) => id !== env.GITHUB_RUN_ID)
  return earlier.length === 0 ? null : Math.max(...earlier.map(([, at]) => Date.parse(at)))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outcome = await watch({
    liveVersion,
    now: () => Date.now(),
    previousRunAt: () => previousRunAt(process.env),
    runSuite: () => run('npm', ['run', 'test:live'], { env: suiteRunEnv(process.env, homedir()) }),
    fileIssue
  })
  console.error(`watch:live: ${outcome}`)
  process.exitCode = outcome === 'green' ? 0 : 1
}
