// `npm run test:live:changed`: the live files a change touches (#1026). The full live suite is no merge gate; the nightly watch runs it on GitHub
// (`live/watch.mjs`). A worker and the controller run these files instead.
//   node live/changed.mjs [--changed <ref>] [--list]
// `--changed <ref>` (default origin/main) is the base: the paths the branch committed since it, plus what is edited or untracked. `--list` prints the
// selected files, one per line, and runs nothing. Otherwise it runs them with `npm run test:live:files`, so they get the time limit and the width cap.
//
// Which live files a path touches:
//   - a `*.live.mjs`: itself;
//   - a root `*.user.js`: `live/<its name>/*.live.mjs`, and for a SudokuPad script every top-level `live/*.live.mjs` too, since most of them load every
//     script (the files the old merge rerun always took);
//   - `site/`: `live/site-slideshow.live.mjs`, which serves the page from the checkout;
//   - anything a live file reaches by a relative path written as a string, through the files it loads in turn (the closure: `./x.mjs`, `../sync-lib.js`,
//     `createRequire(...)('../../x.user.js')`, `new URL('./y.txt', import.meta.url)`), so a helper selects every file that loads it.
// A path nothing above places is `NO_LIVE_EFFECT` (docs, tests, workflows, `package.json`, a `live/` file no live file loads, `lib/`: the scripts that embed a
// `lib/` file change in the same diff) or it widens the run to every live file: `package-lock.json` (a new Playwright is a new Chromium), `.nvmrc`, a new top-level
// directory. The line after the list says `(narrowed: ...)` or `(widened: <path>)` (on stderr under `--list`).
// An empty selection is said, not silent: "no live file touched".
import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { posix } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { createRequire } from 'node:module'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SITE_CHECK = 'live/site-slideshow.live.mjs'
const NO_LIVE_EFFECT = [/^(docs|test|\.github|lib)\//, /\.md$/, /^live\//, /^(LICENSE|netlify\.toml|\.gitignore|package\.json|node-test\.js|sync-slides\.js|tag-pictures\.js)$/]
const sorted = (files) => [...new Set(files)].sort()

// Every relative path written as a string. A template with `${` is not one: its path is not known.
export const referencesOf = (source) => [...source.matchAll(/['"`](\.{1,2}\/[^'"`\s$]+)['"`]/g)].map((m) => m[1])

// A new `*.live.mjs` is found by being here, so a new suite needs no edit.
export const liveFilesIn = (dir = ROOT) => sorted(readdirSync(`${dir}live`, { recursive: true }).filter((f) => f.endsWith('.live.mjs')).map((f) => `live/${f}`))

const readOrNull = (path, dir = ROOT) => { try { return readFileSync(`${dir}${path}`, 'utf8') } catch { return null } }

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
        const target = posix.normalize(posix.join(posix.dirname(file), ref))
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
    const before = picked.size
    let placed = false
    if (liveFiles.includes(path)) { picked.add(path); placed = true }
    if (path.endsWith('.live.mjs')) placed = true // a deleted suite selects nothing
    if (/^[^/]+\.user\.js$/.test(path)) {
      const folder = `live/${path.replace(/\.user\.js$/, '')}/`
      for (const file of liveFiles) if (file.startsWith(folder) || (scripts.includes(path) && posix.dirname(file) === 'live')) picked.add(file)
      placed = true
    }
    if (path.startsWith('site/')) { if (liveFiles.includes(SITE_CHECK)) picked.add(SITE_CHECK); placed = true }
    for (const [file, reached] of reach) if (reached.has(path)) picked.add(file)
    if (picked.size > before || NO_LIVE_EFFECT.some((rule) => rule.test(path)) || [...reach.values()].some((reached) => reached.has(path))) placed = true
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
