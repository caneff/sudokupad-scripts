// `npm run watch:live`: runs the live suite once for each new SudokuPad version and files a bug when it is red.
// Meant for a daily schedule. A version already checked is a no-op, so a run on an unchanged SudokuPad makes one
// plain request and nothing else.
//
// The version is read the way live/cache.mjs reads it (docs/research/sudokupad-version-signal.md). A new version
// records SudokuPad again (LIVE_REFRESH=1) and runs the full suite. The last version checked is remembered in
// `last-version`, beside the recording, after a green run and after the bug is filed, never before: a run that
// dies midway or cannot file is repeated rather than lost.

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { harPath, liveVersion } from './cache.mjs'

const REPO = 'caneff/sudokupad-scripts'
const ROOT = fileURLToPath(new URL('..', import.meta.url))

export const statePath = (env, home) => join(dirname(harPath(env, home)), 'last-version')

export function readLastVersion (file) {
  try { return readFileSync(file, 'utf8').trim() || null } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

export function writeLastVersion (file, version) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${version}\n`)
}

// What failed in `node --test --test-reporter=tap` output. `checks` are tests that ran and failed. `unrun` are
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
    else if (type === 'testCodeFailure') checks.push(name)
  })
  return { checks, unrun }
}

export const issueFor = (version, { checks, unrun }) => ({
  title: `Live tests fail on SudokuPad ${version}`,
  body: [
    `\`npm run test:live\` is red against SudokuPad ${version}, recorded again for the run. Failing checks:`,
    '',
    ...checks.map((c) => `- ${c}`),
    ...(unrun.length ? ['', 'Did not run (a file that failed to load, or a failed `before` hook):', '', ...unrun.map((c) => `- ${c}`)] : []),
    '',
    'Filed by `npm run watch:live` (`live/watch.mjs`).'
  ].join('\n')
})

// A suite that fails with no failing check did not run, and a bug for it would blame SudokuPad: that throws.
export async function watch ({ liveVersion, lastVersion, runSuite, fileIssue, remember }) {
  const version = await liveVersion()
  if (lastVersion() === version) return 'unchanged'
  const { ok, output } = await runSuite()
  if (ok) {
    remember(version)
    return 'green'
  }
  const failed = failedChecks(output)
  if (failed.checks.length === 0) throw new Error(`the live suite failed on SudokuPad ${version} with no failing check; it did not run (${failed.unrun.length} unrun)`)
  await fileIssue(issueFor(version, failed))
  remember(version)
  return 'red'
}

const run = (command, args, { env = process.env, input } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: ROOT, env, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit'] })
  let output = ''
  child.stdout.on('data', (d) => { output += d; process.stdout.write(d) })
  child.on('error', reject)
  child.on('close', (code) => resolve({ ok: code === 0, output }))
  if (input !== undefined) child.stdin.end(input)
})

export async function fileIssue ({ title, body }, runGh = run) {
  const { ok } = await runGh('gh', ['issue', 'create', '--repo', REPO, '--label', 'bug', '--title', title, '--body-file', '-'], { input: body })
  if (!ok) throw new Error('gh issue create failed')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = statePath(process.env, homedir())
  const outcome = await watch({
    liveVersion,
    lastVersion: () => readLastVersion(file),
    runSuite: () => run('npm', ['run', 'test:live'], { env: { ...process.env, LIVE_REFRESH: '1', NODE_OPTIONS: '--test-reporter=tap' } }),
    fileIssue,
    remember: (v) => writeLastVersion(file, v)
  })
  console.error(`watch:live: ${outcome}`)
  process.exitCode = outcome === 'red' ? 1 : 0
}
