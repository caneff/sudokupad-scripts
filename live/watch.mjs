// `npm run watch:live`: runs the live suite once for each new SudokuPad version and files a bug when it is red.
// Meant for a daily schedule. A version already checked is a no-op, so a run on an unchanged SudokuPad makes one
// plain request and nothing else.
//
// The version is read the way live/cache.mjs reads it (docs/research/sudokupad-version-signal.md). A new version
// records SudokuPad again (LIVE_REFRESH=1) and runs the full suite. The last version checked is remembered in
// `last-version`, beside the recording. It is remembered after a green run and after the bug is filed, never
// before, so a run that dies midway or cannot file is repeated rather than lost.

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fetchPuzzlePage, harPath, pageVersion } from './cache.mjs'

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

// The failing checks in `node --test --test-reporter=tap` output: each failing leaf, since a suite and a file
// fail only because something inside them did. TAP prints a parent after its children, so a failure right after a
// deeper one is that one's parent.
export function failedChecks (tap) {
  const failures = [...tap.matchAll(/^( *)not ok \d+ - (.*)$/gm)].map((m) => ({ depth: m[1].length, name: m[2] }))
  return failures.filter((f, i) => !(failures[i - 1]?.depth > f.depth)).map((f) => f.name)
}

export const issueFor = (version, checks) => ({
  title: `Live tests fail on SudokuPad ${version}`,
  body: [
    `\`npm run test:live\` is red against SudokuPad ${version}, recorded again for the run. Failing checks:`,
    '',
    ...checks.map((c) => `- ${c}`),
    '',
    'Filed by `npm run watch:live` (`live/watch.mjs`).'
  ].join('\n')
})

// 'unchanged' (this version was checked before), 'green' or 'red'. Throws, and remembers nothing, when the live
// version cannot be read, when the suite fails with no failing check to name (it did not run: a bug filed for it
// would blame SudokuPad), or when the bug cannot be filed.
export async function watch ({ liveVersion, lastVersion, runSuite, fileIssue, remember }) {
  const version = await liveVersion()
  if (lastVersion() === version) return 'unchanged'
  const { ok, output } = await runSuite()
  if (ok) {
    remember(version)
    return 'green'
  }
  const checks = failedChecks(output)
  if (checks.length === 0) throw new Error(`the live suite failed on SudokuPad ${version} with no failing check in its output; it did not run`)
  await fileIssue(issueFor(version, checks))
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

const liveVersion = async () => {
  const version = pageVersion(await fetchPuzzlePage())
  if (version === null) throw new Error('the live puzzle page names no version')
  return version
}

const fileIssue = async ({ title, body }) => {
  const { ok } = await run('gh', ['issue', 'create', '--repo', REPO, '--label', 'bug', '--title', title, '--body-file', '-'], { input: body })
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
