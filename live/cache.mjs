// Shared by the live checks: SudokuPad served from a recording (a HAR) instead of sudokupad.app on every
// page load. Test code only; no userscript reads it, and it is not a check, so `live/*.live.mjs` skips it.
//
// `routeSudokuPad(page or context)` replaces the tracker-abort line every live file used to carry. The first
// call of a run with no recording, one older than 24 hours, or `LIVE_REFRESH=1` records SudokuPad's app from
// sudokupad.app, once, under a lock; every other call replays it. The recording is SudokuPad's own code, so it
// lives outside the repo, shared by every worktree: `${XDG_CACHE_HOME:-~/.cache}/sudokupad-scripts/live/`.
//   LIVE_REFRESH=1  record again now, whatever the recording's age
//   LIVE_OFFLINE=1  never touch the network: replay what is there, and fail when there is no recording
// A replayed request the recording lacks is aborted and named on stderr; `LIVE_REFRESH=1` records it.
// Snags this works around are in docs/research/2026-10-04-offline-render-har.md of sudokupad-art, which
// records the same app the same way.

import { chromium } from 'playwright'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

export const MAX_AGE_MS = 24 * 60 * 60 * 1000
const LOCK_STALE_MS = 10 * 60 * 1000
const LOCK_WAIT_MS = 15 * 60 * 1000

const SUDOKUPAD_ORIGIN = 'https://sudokupad.app'
// Hosts and paths the live checks never want: consent and analytics, and the solve counter, whose URL is
// named after the puzzle and so cannot be replayed.
const TRACKERS = /cookiebot|googletagmanager|plausible|api\.sudokupad\.com\/counter/
// SudokuPad serves its fonts as text/html, which Playwright would store as UTF-8 text and so corrupt.
const FONT_FILE = /^https:\/\/sudokupad\.app\/.*\.(ttf|otf|woff2?)(\?|$)/
const START = /Start Puzzle|Continue|Resume/i

const puzzleUrl = () => readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()

export const harPath = (env, home) => join(env.XDG_CACHE_HOME || join(home, '.cache'), 'sudokupad-scripts', 'live', 'sudokupad.har')

// 'record' or 'replay'. LIVE_OFFLINE=1 never records, so it throws when there is nothing to replay.
export function modeFor ({ env, exists, mtimeMs, now }) {
  if (env.LIVE_OFFLINE === '1') {
    if (env.LIVE_REFRESH === '1') throw new Error('LIVE_OFFLINE=1 and LIVE_REFRESH=1 contradict: one never touches the network, the other records from it')
    if (!exists) throw new Error('LIVE_OFFLINE=1 but there is no recording to replay: run once without it to record')
    return 'replay'
  }
  if (env.LIVE_REFRESH === '1' || !exists || now - mtimeMs > MAX_AGE_MS) return 'record'
  return 'replay'
}

// A fresh recording without what a replay must not hold: a request the recorder aborted (status -1), and a
// second entry for one request. Of two entries for a request the one that kept its bytes (base64) wins, else
// the later: the recorder logs a re-served font twice, once as the app was served and once as fetched.
export function cleanHar (har) {
  const byRequest = new Map()
  for (const e of har.log.entries.filter((x) => x.response.status > 0)) {
    const key = `${e.request.method} ${e.request.url}`
    const held = byRequest.get(key)
    const keptBytes = (x) => x.response.content.encoding === 'base64'
    if (!(held && keptBytes(held) && !keptBytes(e))) byRequest.set(key, e)
  }
  return { ...har, log: { ...har.log, entries: [...byRequest.values()] } }
}

const writeAtomic = (file, text) => {
  const tmp = `${file}.${process.pid}.tmp`
  try { writeFileSync(tmp, text); renameSync(tmp, file) } catch (e) { rmSync(tmp, { force: true }); throw e }
}

const recordingState = (file) => {
  try { return { exists: true, mtimeMs: statSync(file).mtimeMs } } catch (e) {
    if (e.code === 'ENOENT') return { exists: false, mtimeMs: 0 }
    throw e
  }
}

const currentMode = (file) => modeFor({ env: process.env, ...recordingState(file), now: Date.now() })

// Holds `<file>.lock` (a directory, since mkdir fails when it exists) while `fn` runs, so test files started
// together record once. A lock older than LOCK_STALE_MS belongs to a recorder that was killed and is taken over.
async function withLock (file, fn) {
  const lock = `${file}.lock`
  const until = Date.now() + LOCK_WAIT_MS
  for (;;) {
    try { mkdirSync(lock); break } catch (e) {
      if (e.code !== 'EEXIST') throw e
      let age
      try { age = Date.now() - statSync(lock).mtimeMs } catch { continue } // released while we looked
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

// Loads the puzzle the way a player does (page, Start Puzzle, the settings dialog) with SudokuPad's own
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
    await p.goto(puzzleUrl(), { waitUntil: 'load', timeout: 60000 })
    const start = p.getByRole('button', { name: START }).first()
    await start.waitFor({ state: 'visible' })
    await start.click()
    await p.locator('#control-undo').waitFor({ state: 'visible' })
    await p.click('#control-settings')
    await p.locator('.dialog .setting-group').first().waitFor({ state: 'visible' })
    await p.waitForLoadState('networkidle')
    await loadEveryWebFont(p, stylesheet)
    await context.close()
    mkdirSync(dirname(file), { recursive: true })
    writeAtomic(file, JSON.stringify(cleanHar(JSON.parse(readFileSync(tmp, 'utf8')))))
  } finally {
    await browser.close()
    rmSync(tmp, { force: true })
  }
}

let ready
// Resolves to the recording's path once it is fit to replay: recorded now, or already recent. One recording
// per process; the lock and the mode re-read after it keep processes from recording twice.
function ensureRecording () {
  const file = harPath(process.env, homedir())
  ready ??= (async () => {
    if (currentMode(file) === 'record') {
      mkdirSync(dirname(file), { recursive: true })
      await withLock(file, async () => {
        const before = recordingState(file)
        const recordedMeanwhile = before.exists && Date.now() - before.mtimeMs < 60 * 1000
        if (!recordedMeanwhile) {
          console.error(`live cache: recording SudokuPad's app from ${SUDOKUPAD_ORIGIN} into ${file}`)
          await record(file)
        }
      })
    }
    return file
  })()
  return ready
}

// Aborts the trackers and serves everything else a page makes from the recording. `target` is a page or a
// context. Playwright runs the most recently registered matching route first, so the order below is the
// reverse of the order a request meets them: trackers, then any sudokupad.app document rewritten to the
// recorded puzzle's URL (one page document serves every path; the page keeps its own location), then the
// recording, then the abort of whatever it lacks.
export async function routeSudokuPad (target) {
  const file = await ensureRecording()
  await target.route('**/*', (route) => {
    console.error(`live cache: not in the recording, aborted: ${route.request().url()} (LIVE_REFRESH=1 records it)`)
    return route.abort()
  })
  await target.routeFromHAR(file, { notFound: 'fallback' })
  await target.route((u) => u.origin === SUDOKUPAD_ORIGIN, (route) => route.request().resourceType() === 'document'
    ? route.fallback({ url: puzzleUrl() })
    : route.fallback())
  await target.route(TRACKERS, (r) => r.abort())
}
