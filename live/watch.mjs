// `npm run watch:live`: runs the live suite for each new SudokuPad version, and once a week whatever the version, and
// files a bug when it is red. Meant for a daily schedule. A version already checked, with a full run under a week old,
// is a no-op: one plain request and nothing else.
//
// The version is read the way live/cache.mjs reads it (docs/research/sudokupad-version-signal.md). A new version, or a
// week since the last full run, records SudokuPad again (LIVE_REFRESH=1) and runs the full suite; the weekly run
// catches a release that changed assets without changing the version. The last version checked is remembered in
// `last-version`, and the time of the last full run in `last-full-run`, beside the recording, after a green run and
// after the bug is filed, never before: a run that dies midway or cannot file is repeated rather than lost.
// A run that could not get as far as the checks (no Chromium, a failed recording, no version read) files one "did not
// run" issue instead, remembers nothing and exits 1, so it is retried the next night.

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { harPath, liveVersion } from './cache.mjs'

const REPO = 'caneff/sudokupad-scripts'
const ROOT = fileURLToPath(new URL('..', import.meta.url))

export const statePath = (env, home) => join(dirname(harPath(env, home)), 'last-version')

export const FULL_RUN_MS = 7 * 24 * 60 * 60 * 1000
export const fullRunPath = (env, home) => join(dirname(harPath(env, home)), 'last-full-run')

// Due with no usable record: a damaged file forces a run rather than skipping one.
// A record in the future (a skewed clock, a corrupted number) would make the run never due, so it counts as none.
export const fullRunDue = ({ lastFullRun, now }) => lastFullRun === null || lastFullRun > now || now - lastFullRun >= FULL_RUN_MS

export function readState (file) {
  try { return readFileSync(file, 'utf8').trim() || null } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

export function writeState (file, version) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${version}\n`)
}

export function readLastFullRun (file) {
  const ms = Number(readState(file))
  return Number.isFinite(ms) && ms > 0 ? ms : null
}

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

// `once`: a weekly run on a version that is still red must not file the same bug again while one is open.
export const issueFor = (version, { checks, unrun }, { weekly = false } = {}) => ({
  title: `Live tests fail on SudokuPad ${version}`,
  once: true,
  body: [
    `\`npm run test:live\` is red against SudokuPad ${version}, recorded again for the run${weekly ? ' (the weekly run: the version had not changed)' : ''}. Failing checks:`,
    '',
    ...checks.map((c) => `- ${c}`),
    ...(unrun.length ? ['', 'Did not run (a file that failed to load, or a failed `before` hook):', '', ...unrun.map((c) => `- ${c}`)] : []),
    '',
    'Filed by `npm run watch:live` (`live/watch.mjs`).'
  ].join('\n')
})

// The fixed title is the dedupe key: `fileIssue` files an `once` issue only when no open issue has its title.
export const didNotRunIssue = (version, why) => ({
  title: 'Watch did not run: the live suite could not be checked',
  once: true,
  body: [
    `\`npm run watch:live\` could not check SudokuPad ${version}. Nothing was remembered, so the next run tries again. The cause may be this machine (no Chromium, no network) or a SudokuPad change that stopped the suite starting (the version tag gone, a control renamed); what stopped it:`,
    '',
    why,
    '',
    'Filed by `npm run watch:live` (`live/watch.mjs`).'
  ].join('\n')
})

// A suite that could not get to its checks (or a version that could not be read) files the did-not-run issue and
// remembers nothing: a bug for it would blame SudokuPad, which may or may not be at fault.
export async function watch ({ liveVersion, lastVersion, lastFullRun, now, runSuite, fileIssue, remember, rememberFullRun }) {
  let version = 'unknown'
  const didNotRun = async (why) => {
    await fileIssue(didNotRunIssue(version, why))
    return 'did-not-run'
  }
  try { version = await liveVersion() } catch (e) { return didNotRun(`the version could not be read: ${e.message}`) }
  const weekly = lastVersion() === version
  if (weekly && !fullRunDue({ lastFullRun: lastFullRun(), now: now() })) return 'unchanged'
  let result
  try { result = await runSuite() } catch (e) { return didNotRun(`the suite could not be started: ${e.message}`) }
  const { ok, output } = result
  if (!ok) {
    const failed = failedChecks(output)
    if (failed.checks.length === 0) return didNotRun(`the suite failed with no failing check (${failed.unrun.length} unrun): ${failed.unrun.join(', ') || 'see the workflow log'}`)
    await fileIssue(issueFor(version, failed, { weekly }))
  }
  remember(version)
  rememberFullRun(now())
  return ok ? 'green' : 'red'
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
  const { ok } = await runGh('gh', ['issue', 'create', '--repo', REPO, '--label', 'bug', '--title', title, '--body-file', '-'], { input: body })
  if (!ok) throw new Error('gh issue create failed')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = statePath(process.env, homedir())
  const fullFile = fullRunPath(process.env, homedir())
  const outcome = await watch({
    liveVersion,
    lastVersion: () => readState(file),
    lastFullRun: () => readLastFullRun(fullFile),
    now: () => Date.now(),
    runSuite: () => run('npm', ['run', 'test:live'], { env: { ...process.env, LIVE_REFRESH: '1', NODE_OPTIONS: '--test-reporter=tap' } }),
    fileIssue,
    remember: (v) => writeState(file, v),
    rememberFullRun: (ms) => writeState(fullFile, String(ms))
  })
  console.error(`watch:live: ${outcome}`)
  process.exitCode = outcome === 'red' || outcome === 'did-not-run' ? 1 : 0
}
