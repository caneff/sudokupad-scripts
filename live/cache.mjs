// Shared by the live checks: SudokuPad served from a recording (a HAR) instead of sudokupad.app on every
// page load. Test code only; no userscript reads it, and it is not a check, so `live/**/*.live.mjs` skips it.
//
// `routeSudokuPad(page or context)` aborts the trackers and serves everything else from a recording of
// SudokuPad's app. The first call with no recording or with `LIVE_REFRESH=1` records it from sudokupad.app,
// once per run, under a lock; every other call replays it. A recording older than 24 hours is checked first:
// one plain request for the puzzle page reads SudokuPad's version (`?v=` on its assets, see
// docs/research/sudokupad-version-signal.md). The same version keeps the recording and restamps its time, so
// the next check is a day later; a new version records; a failed check replays the recording and warns, once
// per run.
// The recording is SudokuPad's own code, so it lives outside the repo, shared by every worktree:
// `${XDG_CACHE_HOME:-~/.cache}/sudokupad-scripts/live/`.
//   LIVE_REFRESH=1  record again now, whatever the recording's age
//   LIVE_OFFLINE=1  never touch the network: replay what is there, and fail when there is no recording
// A replayed request the recording lacks is aborted, and the process then exits 1 naming each such URL, so a
// recording with gaps cannot pass; `LIVE_REFRESH=1` records again.
// A recording must hold fabric.js (Test Markup loads it on demand, and Text Anywhere's live check needs it): a fresh
// one without it is not written and the run fails, and an existing one without it is recorded again at once, whatever
// its age or version.
// Snags this works around are in docs/research/2026-10-04-offline-render-har.md of sudokupad-art, which
// records the same app the same way.

import { chromium } from 'playwright'
import { mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { openSettings } from './settings.mjs'

export const MAX_AGE_MS = 24 * 60 * 60 * 1000
export const LOCK_STALE_MS = 10 * 60 * 1000
const LOCK_WAIT_MS = 15 * 60 * 1000
// How long a run marker (below) names its runner: a full run takes minutes, so an older one is another run's.
const RUN_MARKER_MAX_AGE_MS = 60 * 60 * 1000
export const LOAD_MS = 60000

const SUDOKUPAD_ORIGIN = 'https://sudokupad.app'
// Hosts and paths the live checks never want: consent and analytics, and the solve counter, whose URL is
// named after the puzzle and so cannot be replayed.
const TRACKERS = /cookiebot|googletagmanager|plausible|api\.sudokupad\.com\/counter/
// SudokuPad serves its fonts as text/html, which Playwright would store as UTF-8 text and so corrupt.
const FONT_FILE = /^https:\/\/sudokupad\.app\/.*\.(ttf|otf|woff2?)(\?|$)/
export const START = /Start Puzzle|Continue|Resume/i

export const puzzleUrl = () => readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()

export const harPath = (env, home) => join(env.XDG_CACHE_HOME || join(home, '.cache'), 'sudokupad-scripts', 'live', 'sudokupad.har')

// `incomplete` is a recording that lacks a file a check needs (see `hasFabric`): it records at once, once per run,
// whatever its age or version, since a restamp or a replay would keep the gap.
// 'record', 'replay', 'restamp' (replay, after stamping the recording with the time now) or 'needs-check' (the
// recording is stale and `versionCheck`, the version check's outcome, is not known yet). `versionCheck` is
// 'same', 'changed' or 'failed'. LIVE_REFRESH=1 records once per run, so a run that has already refreshed replays.
// LIVE_OFFLINE=1 never records and never checks, so it throws when there is nothing to replay.
export function modeFor ({ env, exists, mtimeMs, now, refreshedThisRun, versionCheck, incomplete = false }) {
  if (env.LIVE_OFFLINE === '1') {
    if (env.LIVE_REFRESH === '1') throw new Error('LIVE_OFFLINE=1 and LIVE_REFRESH=1 contradict: one never touches the network, the other records from it')
    if (!exists) throw new Error('LIVE_OFFLINE=1 but there is no recording to replay: run once without it to record')
    return 'replay'
  }
  if (((env.LIVE_REFRESH === '1' || incomplete) && !refreshedThisRun) || !exists) return 'record'
  if (now - mtimeMs <= MAX_AGE_MS) return 'replay'
  if (versionCheck === undefined) return 'needs-check'
  return { same: 'restamp', changed: 'record', failed: 'replay' }[versionCheck]
}

const VERSION = /\?v=(\d+(?:\.\d+)+)/

export const pageVersion = (html) => VERSION.exec(html)?.[1] ?? null

const fetchPuzzlePage = async () => {
  const response = await fetch(puzzleUrl(), { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`${puzzleUrl()} answered ${response.status}`)
  return response.text()
}

// The version in the recording's copy of the puzzle page, or null when the recording has no such page, names no
// version or cannot be read. Null is an answer here and not a swallowed failure: a recording that cannot say
// what it holds is one to replace, and recording again replaces it.
const recordedVersion = (file) => {
  try {
    const document = JSON.parse(readFileSync(file, 'utf8')).log.entries
      .find((e) => e.request.url === puzzleUrl() && e.response.content.text)
    return document ? pageVersion(document.response.content.text) : null
  } catch {
    return null
  }
}

// The version of the live puzzle page `fetchHtml` returns. Throws when the page cannot be fetched or names no
// version, so the caller sees a failed read and not a guess.
export async function liveVersion (fetchHtml = fetchPuzzlePage) {
  const version = pageVersion(await fetchHtml())
  if (version === null) throw new Error('the live puzzle page names no version')
  return version
}

// 'same' or 'changed': the live version against the version in the recording's copy of the puzzle page. A
// recording that names none or cannot be read counts as changed.
export async function checkVersion (file, fetchHtml = fetchPuzzlePage) {
  return recordedVersion(file) === await liveVersion(fetchHtml) ? 'same' : 'changed'
}

// A fresh recording without what a replay must not hold: a request the recorder aborted (status -1), and a
// second entry for one request. Of two entries for a request the one that kept its bytes (base64) wins, else
// the later: the recorder logs a re-served font twice, once as the app was served and once as fetched.
export function cleanHar (har) {
  const byRequest = new Map()
  for (const e of har.log.entries.filter((x) => x.response.status > 0)) {
    const key = `${e.request.method} ${e.request.url} ${e.request.postData?.text ?? ''}`
    const held = byRequest.get(key)
    const keptBytes = (x) => x.response.content.encoding === 'base64'
    if (!(held && keptBytes(held) && !keptBytes(e))) byRequest.set(key, e)
  }
  return { ...har, log: { ...har.log, entries: [...byRequest.values()] } }
}

// fabric.js, which SudokuPad loads only when Test Markup is turned on, so a plain visit does not fetch it and
// `record` turns Test Markup on. Text Anywhere's live check needs it, and a replay that lacks it leaves that check
// unrun with no failing assertion.
const FABRIC = /^https:\/\/sudokupad\.app\/fabric[^/?]*\.js(\?|$)/
// What Test Markup builds once fabric.js has loaded.
export const MARKUP_CANVAS = '.fabcan canvas'

export const hasFabric = (har) => har.log.entries.some((e) => FABRIC.test(e.request.url))

const writeAtomic = (file, text) => {
  const tmp = `${file}.${process.pid}.tmp`
  try { writeFileSync(tmp, text); renameSync(tmp, file) } catch (e) { rmSync(tmp, { force: true }); throw e }
}

// Cleans the fresh recording at `tmp` and writes it to `file`, but only when it holds fabric.js: a recording
// without it is refused and `file` is left as it was, so the next run records again.
export function writeRecording (tmp, file) {
  const har = cleanHar(JSON.parse(readFileSync(tmp, 'utf8')))
  if (!hasFabric(har)) throw new Error('the recording lacks fabric.js, which Text Anywhere\'s live check needs; nothing was written')
  mkdirSync(dirname(file), { recursive: true })
  writeAtomic(file, JSON.stringify(har))
}

// Whether the recording at `file` can be replayed whole. One that cannot be read counts as not.
const isComplete = (file) => {
  try { return hasFabric(JSON.parse(readFileSync(file, 'utf8'))) } catch { return false }
}

const recordingState = (file) => {
  try { return { exists: true, mtimeMs: statSync(file).mtimeMs } } catch (e) {
    if (e.code === 'ENOENT') return { exists: false, mtimeMs: 0 }
    throw e
  }
}

// Holds `<file>.lock` (a directory, since mkdir fails when it exists) while `fn` runs, so test files started
// together record once. A lock older than LOCK_STALE_MS belongs to a recorder that was killed and is taken over.
async function withLock (file, fn) {
  const lock = `${file}.lock`
  const until = Date.now() + LOCK_WAIT_MS
  for (;;) {
    try { mkdirSync(lock); break } catch (e) {
      if (e.code !== 'EEXIST') throw e
      let age
      try { age = Date.now() - statSync(lock).mtimeMs } catch (err) {
        if (err.code === 'ENOENT') continue // released while we looked
        throw err
      }
      if (age > LOCK_STALE_MS) { rmSync(lock, { recursive: true, force: true }); continue }
      if (Date.now() > until) throw new Error(`${lock} is held by another recorder; delete it if none is running`)
      await sleep(250)
    }
  }
  try { return await fn() } finally { rmSync(lock, { recursive: true, force: true }) }
}

// Loads every font file a Google Fonts stylesheet names, given the response the page got for it. Each is
// split by unicode range and loads only when the page draws a glyph in its range, so a visit records the
// subsets it happened to draw and a replay would lack the rest. The stylesheet is the page's own response:
// a request made outside the page is answered in another format, with other font URLs.
async function loadEveryWebFont (p, stylesheet) {
  const css = await (await stylesheet).text()
  const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1])
  await p.evaluate((list) => Promise.all(list.map((u) => new window.FontFace('recorded', `url(${u})`).load())), urls)
}

// Loads the puzzle the way a player does (page, Start Puzzle, the settings dialog, Test Markup on) with SudokuPad's own
// requests recorded, then writes the cleaned recording over `file`. The recording is written when the
// context closes.
async function record (file) {
  const tmp = `${file}.${process.pid}.recording`
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext()
    await context.routeFromHAR(tmp, { update: true, updateContent: 'embed', notFound: 'fallback' })
    await context.route(FONT_FILE, async (route) => {
      const response = await route.fetch()
      await route.fulfill({ response, headers: { ...response.headers(), 'content-type': 'application/octet-stream' } })
    })
    await context.route(TRACKERS, (r) => r.abort())
    const p = await context.newPage()
    const stylesheet = p.waitForResponse(/fonts\.googleapis\.com\/css/)
    await p.goto(puzzleUrl(), { waitUntil: 'load', timeout: LOAD_MS })
    const start = p.getByRole('button', { name: START }).first()
    await start.waitFor({ state: 'visible' })
    await start.click()
    await p.locator('#control-undo').waitFor({ state: 'visible' })
    await openSettings(p)
    // Test Markup loads fabric.js only once it is turned on, and Text Anywhere's live check turns it on.
    await p.evaluate(() => Framework.setSetting('markup', true))
    // Idle can come before the load has started, so wait for what the loaded file builds.
    await p.locator(MARKUP_CANVAS).first().waitFor({ state: 'attached', timeout: LOAD_MS })
    await p.waitForLoadState('networkidle')
    await loadEveryWebFont(p, stylesheet)
    await context.close()
    writeRecording(tmp, file)
  } finally {
    await browser.close()
    rmSync(tmp, { force: true })
  }
}

// The runner a test file belongs to, or null outside `node --test`: its files run as children of one runner
// process, which is what makes them one run.
const runnerKey = (env, ppid) => env.NODE_TEST_CONTEXT ? String(ppid) : null

// Whether the run marker file `marker` names this runner. It is ignored once it is too old to be the same run.
function markedBy (marker, key) {
  if (key === null) return false
  try {
    return Date.now() - statSync(marker).mtimeMs < RUN_MARKER_MAX_AGE_MS && readFileSync(marker, 'utf8') === key
  } catch (e) {
    if (e.code === 'ENOENT') return false
    throw e
  }
}

// The recording's path once it is fit to replay. When the mode says record, it records under the lock and
// first re-reads the mode there, since another process may have recorded or restamped while this one waited.
// `record` is handed the path and writes the recording there. `checkVersion(file)` resolves to 'same' or 'changed'
// and rejects when it cannot tell; a rejection replays the recording and goes to `warn`. Two run markers name the
// runner that did something a later test file of its run must not repeat: `<file>.refresh-run` that it recorded,
// `<file>.check-failed-run` that its check failed, so the run makes one failed request and gives one warning.
export async function ensureRecording ({ env, home, ppid, record, checkVersion, warn }) {
  const file = harPath(env, home)
  const key = runnerKey(env, ppid)
  const refreshMarker = `${file}.refresh-run`
  const failedCheckMarker = `${file}.check-failed-run`
  const mode = (versionCheck = markedBy(failedCheckMarker, key) ? 'failed' : undefined) => {
    const state = recordingState(file)
    return modeFor({ env, ...state, incomplete: state.exists && !isComplete(file), now: Date.now(), refreshedThisRun: markedBy(refreshMarker, key), versionCheck })
  }
  if (mode() === 'replay') return file
  mkdirSync(dirname(file), { recursive: true })
  await withLock(file, async () => {
    let next = mode()
    if (next === 'needs-check') {
      let outcome
      try { outcome = await checkVersion(file) } catch (e) {
        outcome = 'failed'
        warn(`live cache: could not check SudokuPad's version (${e.message}); replaying the recording in ${file}`)
        if (key !== null) writeFileSync(failedCheckMarker, key)
      }
      next = mode(outcome)
    }
    if (next === 'restamp') {
      const t = new Date()
      utimesSync(file, t, t)
      return
    }
    if (next === 'replay') return
    console.error(`live cache: recording SudokuPad's app from ${SUDOKUPAD_ORIGIN} into ${file}`)
    await record(file)
    if (key !== null) writeFileSync(refreshMarker, key)
  })
  return file
}

// Every URL a replay aborted for want of a recording. The process exits 1 naming them, so a recording with
// gaps fails the run instead of showing a page with a font or an image missing.
export const misses = new Set()
process.on('exit', () => {
  if (misses.size === 0) return
  console.error(`live cache: ${misses.size} request(s) not in the recording; LIVE_REFRESH=1 records again:\n  ${[...misses].join('\n  ')}`)
  process.exitCode = 1
})

let ready
// Aborts the trackers and serves everything else a page makes from the recording. `target` is a page or a
// context. Playwright runs the most recently registered matching route first, so the order below is the
// reverse of the order a request meets them: trackers, then any sudokupad.app document rewritten to the
// recorded puzzle's URL (one page document serves every path; the page keeps its own location), then the
// recording, then the abort of whatever it lacks.
export async function routeSudokuPad (target) {
  ready ??= ensureRecording({ env: process.env, home: homedir(), ppid: process.ppid, record, checkVersion, warn: console.error })
  const file = await ready
  await target.route('**/*', (route) => {
    misses.add(route.request().url())
    return route.abort()
  })
  await target.routeFromHAR(file, { notFound: 'fallback' })
  await target.route((u) => u.origin === SUDOKUPAD_ORIGIN, (route) => route.request().resourceType() === 'document'
    ? route.fallback({ url: puzzleUrl() })
    : route.fallback())
  await target.route(TRACKERS, (r) => r.abort())
}
