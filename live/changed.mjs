// `npm run test:live:changed` (#1026): runs the live files a change touches, not the whole suite, which the nightly watch (`live/watch.mjs`) runs on GitHub.
//   node live/changed.mjs [--changed <ref>] [--list]
// `--changed <ref>` (default origin/main) is the base: the paths the branch committed since it, plus what is edited or untracked. `--list` prints the
// selected files, one per line, and runs nothing. Otherwise it runs them with `npm run test:live:files`, so they get the time limit and the width cap.
// What a path selects, and which paths widen the run to every live file: `live/README.md` § The live gate. The last line says `(narrowed: ...)` or
// `(widened: <path> ...)` (on stderr under `--list`); an empty selection says "no live file touched".
import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { posix } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { createRequire } from 'node:module'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SITE_CHECK = 'live/site-slideshow.live.mjs'
// What runs every live file, so a change to it runs one live file through it.
const RUNNER_FILES = ['package.json', 'node-test.js']
const RUNNER_CHECK = 'live/startup.live.mjs'
const NO_LIVE_EFFECT = [/^(docs|test|pictures|\.github|lib)\//, /\.md$/, /^live\//, /^(LICENSE|netlify\.toml|\.gitignore|sync-slides\.js|tag-pictures\.js)$/]
const sorted = (files) => [...new Set(files)].sort()

// Every relative path written as a string, and every bare `*.user.js` name (a suite that injects another script loads it from the repo root by that name).
// A template with `${` is not one: its path is not known.
export const referencesOf = (source) => [...source.matchAll(/['"`](\.{1,2}\/[^'"`\s$]+|[\w-]+\.user\.js)['"`]/g)].map((m) => m[1])

// A new `*.live.mjs` is found by being here, so a new suite needs no edit.
export const liveFilesIn = () => sorted(readdirSync(`${ROOT}live`, { recursive: true }).filter((f) => f.endsWith('.live.mjs')).map((f) => `live/${f}`))

// Only "no such file" is absent. A read that fails any other way (no permission, too many open files) throws: a reference dropped for it would narrow the selection with nothing said.
export const isAbsent = (e) => ['ENOENT', 'ENOTDIR', 'EISDIR'].includes(e.code)
const readOrNull = (path) => {
  try { return readFileSync(`${ROOT}${path}`, 'utf8') } catch (e) {
    if (isAbsent(e)) return null
    throw e
  }
}

// What each live file reaches: itself, the repo files it names by a relative path, and what those files name in turn. Only `.js` and `.mjs` files are read
// further: a `*.user.js` is a leaf (its strings are the script's, not the test's), and so is any other file.
export function reachOf (liveFiles, read = readOrNull) {
  const reach = new Map()
  for (const root of liveFiles) {
    const seen = new Set([root])
    const queue = [root]
    while (queue.length) {
      const file = queue.pop()
      const source = /\.m?js$/.test(file) && !file.endsWith('.user.js') ? read(file) : null
      for (const ref of source === null ? [] : referencesOf(source)) {
        const bare = !ref.includes('/')
        // A bare script name in a file directly under live/ (scripts.mjs, session.mjs, all-scripts.mjs) is a table of every script, reached by nearly every suite: it would select
        // them all for any script. The top-level suites are already selected by every SudokuPad script's own change, so only a file in a script's folder counts.
        if (bare && posix.dirname(file) === 'live') continue
        const target = bare ? ref : posix.normalize(posix.join(posix.dirname(file), ref))
        if (seen.has(target) || target.startsWith('..') || read(target) === null) continue
        seen.add(target)
        queue.push(target)
      }
    }
    reach.set(root, seen)
  }
  return reach
}

// `scripts`: the root `*.user.js` of the scripts that run on SudokuPad (`scriptFiles()` of `sync-lib.js`).
export function selectLiveFiles ({ changed, liveFiles, reach, scripts }) {
  const picked = new Set()
  let widenedBy = null
  for (const path of changed) {
    let placed = NO_LIVE_EFFECT.some((rule) => rule.test(path))
    if (liveFiles.includes(path)) picked.add(path)
    if (RUNNER_FILES.includes(path)) {
      if (liveFiles.includes(RUNNER_CHECK)) picked.add(RUNNER_CHECK)
      placed = true
    }
    if (/^[^/]+\.user\.js$/.test(path)) {
      const folder = `live/${path.replace(/\.user\.js$/, '')}/`
      for (const file of liveFiles) if (file.startsWith(folder) || (scripts.includes(path) && posix.dirname(file) === 'live')) picked.add(file)
      placed = true
    }
    if (path.startsWith('site/')) {
      if (liveFiles.includes(SITE_CHECK)) picked.add(SITE_CHECK)
      placed = true
    }
    for (const [file, reached] of reach) {
      if (reached.has(path)) {
        picked.add(file)
        placed = true
      }
    }
    if (!placed && widenedBy === null) widenedBy = path
  }
  return { files: widenedBy === null ? sorted(picked) : sorted(liveFiles), widenedBy }
}

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean)

// What a worker has changed: committed since `ref`, edited, and untracked. `--no-renames` names a rename's old path too. Throws when git cannot answer (a ref that
// does not exist): an empty list would read as "nothing changed".
export function changedPaths (ref, cwd = ROOT) {
  return sorted([
    ...git(cwd, ['diff', '--name-only', '--no-renames', `${ref}...HEAD`]),
    ...git(cwd, ['diff', '--name-only', '--no-renames', 'HEAD']),
    ...git(cwd, ['ls-files', '--others', '--exclude-standard'])
  ])
}

export function plan ({ changed }) {
  const liveFiles = liveFilesIn()
  const { scriptFiles } = createRequire(import.meta.url)('../sync-lib.js')
  return { ...selectLiveFiles({ changed, liveFiles, reach: reachOf(liveFiles), scripts: scriptFiles() }), total: liveFiles.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { changed: { type: 'string', default: 'origin/main' }, list: { type: 'boolean' } } })
  const { files, widenedBy, total } = plan({ changed: changedPaths(values.changed) })
  const note = widenedBy === null ? `(narrowed: ${files.length} of ${total} live files)` : `(widened: ${widenedBy} is not a path it can place, so every live file)`
  if (values.list) {
    files.forEach((f) => console.log(f))
    console.error(note)
  } else if (files.length === 0) {
    console.log(`no live file touched ${note}`)
  } else {
    console.log(note)
    const r = spawnSync('npm', ['run', 'test:live:files', '--', ...files], { cwd: ROOT, stdio: 'inherit' })
    process.exitCode = r.status ?? 1
  }
}
