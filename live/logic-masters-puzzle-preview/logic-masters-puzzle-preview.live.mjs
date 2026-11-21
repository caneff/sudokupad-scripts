// Every request the browser makes is answered by this file's own routes, or aborted: nothing reaches logic-masters.de, whose pages
// and pictures are other authors' work. The pages and the PNG are synthetic.
import { after, afterEach, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchPersistent } from '../session.mjs'

const SCRIPT = readFileSync(new URL('../../logic-masters-puzzle-preview.user.js', import.meta.url), 'utf8')
const HOST = 'logic-masters.de'
const PORTAL = `https://${HOST}/Raetselportal/`
const LINK_COUNT = 40
const ROW_HEIGHT = 150
const VIEWPORT = { width: 1200, height: 768 }
const NEAR_MARGIN = 400 // the script's NEAR_SCREEN_PX
const BUSY_KEY = 'lm-puzzle-preview-busy-until' // the script's BUSY_KEY, in localStorage
const BUSY_DELAY_MS = 100 // shorter than the gap, so the second request is still waiting when the 503 lands
const ANSWER_MS = 700 // longer than three gaps, so a third slot would show as 3 in flight
const QUIET_MS = 2000 // "nothing more is fetched" window; the script starts a request at most every 250 ms
const START_GAP_MS = 250 // the script's START_GAP_MS
const MAX_IN_FLIGHT = 2 // the script's MAX_IN_FLIGHT
const OLD_GAP_MS = 500 // one request at a time with this gap after each was the script before two slots
// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const portalHtml = () => `<!doctype html><meta charset="utf-8"><body style="margin:0">${
  Array.from({ length: LINK_COUNT }, (_, i) => `<div style="height:${ROW_HEIGHT}px"><a href="Raetsel/zeigen.php?id=${i + 1}">Puzzle ${i + 1}</a></div>`).join('')
}</body>`
const puzzleHtml = (id) => `<!doctype html><meta charset="utf-8"><body><img src="bild.php?data=synthetic-${id}"></body>`

// Every context a test opens, closed after it whether the test passed or not: an open Chromium keeps the process alive.
const open = []

// One browser session on `profile`, with the script injected at DOMContentLoaded as a userscript manager does. `mode` is what the site answers: 'ok', 'busy' (503 on puzzle pages) or 'busy-image' (503 on images).
// `delay` holds each answer that long, so requests overlap and a busy answer lands while the next one waits its turn.
async function session (profile, mode, delay = 0) {
  const context = await launchPersistent(profile, { headless: true, viewport: VIEWPORT })
  open.push(context)
  const hits = { pages: [], images: [], aborted: [], inFlight: 0, maxInFlight: 0 }
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname !== HOST) { hits.aborted.push(url.href); return route.abort() }
    if (url.pathname === '/Raetselportal/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: portalHtml() })
    hits.inFlight++
    hits.maxInFlight = Math.max(hits.maxInFlight, hits.inFlight)
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    hits.inFlight--
    if (url.pathname.endsWith('/zeigen.php')) {
      hits.pages.push(url.searchParams.get('id'))
      if (mode === 'busy') return route.fulfill({ status: 503, body: 'busy' })
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: puzzleHtml(url.searchParams.get('id')) })
    }
    if (url.pathname.endsWith('/bild.php')) {
      hits.images.push(url.searchParams.get('data'))
      if (mode === 'busy-image') return route.fulfill({ status: 503, body: 'busy' })
      return route.fulfill({ contentType: 'image/png', body: PNG, headers: { pragma: 'no-cache', 'cache-control': 'no-cache', expires: '0' } })
    }
    return route.fulfill({ status: 404, body: '' })
  })
  await context.addInitScript({ content: `document.addEventListener('DOMContentLoaded', () => { ${SCRIPT} })` })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(PORTAL, { waitUntil: 'domcontentloaded' })
  return { context, page, hits, errors }
}

// The ids of the links the script may look up before any scroll: those whose top is above the viewport's bottom plus the margin.
const nearIds = (page) => page.evaluate(({ margin }) => [...document.querySelectorAll('a[href*="zeigen.php"]')]
  .filter((a) => a.getBoundingClientRect().top < window.innerHeight + margin)
  .map((a) => new URL(a.href).searchParams.get('id')), { margin: NEAR_MARGIN })

// Start times, in ms on the page's clock, of every puzzle page and image request, in order.
const startTimes = (page) => page.evaluate(() => performance.getEntriesByType('resource')
  .filter((e) => /zeigen\.php|bild\.php/.test(e.name)).map((e) => e.startTime).sort((a, b) => a - b))

const shown = (page) => page.$$eval('.puzzle-preview img', (imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length)
// Resolves once at least `count` previews show a loaded picture.
const waitForShown = (page, count, timeout) => page.waitForFunction((n) => [...document.querySelectorAll('.puzzle-preview img')].filter((i) => i.complete && i.naturalWidth > 0).length >= n, count, { timeout })

// Scrolls down a screen at a time, so every link is on screen once, and waits for every preview to show.
async function scrollThrough (page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += VIEWPORT.height / 2) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    await page.evaluate(() => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))))
  }
  await waitForShown(page, LINK_COUNT, 120000)
}

// A pause that proves a negative: nothing more was fetched in this time.
const quiet = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Logic Masters Puzzle Preview', { timeout: 300000 }, () => {
  let dir
  before(() => { dir = mkdtempSync(join(tmpdir(), 'lm-preview-')) })
  afterEach(async () => { await Promise.all(open.splice(0).map((context) => context.close())) })
  after(() => { rmSync(dir, { recursive: true, force: true }) })

  it('a second load in the same profile fetches no puzzle page and no image', async () => {
    const profile = join(dir, 'cache-profile')
    const first = await session(profile, 'ok')
    await scrollThrough(first.page)
    assert.equal(first.hits.pages.length, LINK_COUNT)
    assert.equal(first.hits.images.length, LINK_COUNT)
    assert.deepEqual(first.errors, [])
    await first.context.close()

    const second = await session(profile, 'ok')
    await scrollThrough(second.page)
    assert.equal(await shown(second.page), LINK_COUNT)
    assert.deepEqual(second.hits.pages, [])
    assert.deepEqual(second.hits.images, [])
    assert.deepEqual([...first.hits.aborted, ...second.hits.aborted], [])
    assert.deepEqual(second.errors, [])
    await second.context.close()
  })

  it('before any scroll, only links within the viewport plus 400 px are fetched', async () => {
    const { page, hits } = await session(join(dir, 'near-profile'), 'ok')
    const near = await nearIds(page)
    assert.ok(near.length > 0 && near.length < LINK_COUNT, `${near.length} near links of ${LINK_COUNT}`)
    await waitForShown(page, near.length, 60000)
    await quiet(QUIET_MS)
    assert.deepEqual([...hits.pages].sort(), [...near].sort())
    assert.equal(hits.images.length, near.length)
  })

  it('after a 503 on a puzzle page, the next load in the same profile fetches nothing', async () => {
    const profile = join(dir, 'busy-profile')
    const first = await session(profile, 'busy', BUSY_DELAY_MS)
    await first.page.waitForFunction((key) => window.localStorage.getItem(key) !== null, BUSY_KEY, { timeout: 60000 })
    await quiet(QUIET_MS)
    assert.equal(first.hits.pages.length, 1)
    assert.deepEqual(first.hits.images, [])
    await first.context.close()

    const second = await session(profile, 'ok')
    await quiet(QUIET_MS)
    assert.deepEqual(second.hits.pages, [])
    assert.deepEqual(second.hits.images, [])
    assert.deepEqual([...first.hits.aborted, ...second.hits.aborted], [])
  })

  it('after a 503 on an image, no further image is asked for, now or on the next load', async () => {
    const profile = join(dir, 'busy-image-profile')
    const first = await session(profile, 'busy-image', BUSY_DELAY_MS)
    await first.page.waitForFunction((key) => window.localStorage.getItem(key) !== null, BUSY_KEY, { timeout: 60000 })
    await quiet(QUIET_MS)
    assert.equal(first.hits.images.length, 1)
    await first.context.close()

    const second = await session(profile, 'ok')
    await quiet(QUIET_MS)
    assert.deepEqual(second.hits.images, [])
  })

  it('a first visit has at most 2 requests in flight, starts them at least 250 ms apart, and shows the near pictures faster than one at a time', async () => {
    const t0 = Date.now()
    const { page, hits } = await session(join(dir, 'pace-profile'), 'ok', ANSWER_MS)
    const near = await nearIds(page)
    await waitForShown(page, near.length, 60000)
    const elapsed = Date.now() - t0
    console.log(`first visit, ${near.length} on-screen pictures shown after ${elapsed} ms`)
    const starts = await startTimes(page)
    assert.equal(starts.length, near.length * 2)
    assert.equal(hits.maxInFlight, MAX_IN_FLIGHT)
    const gaps = starts.slice(1).map((t, i) => t - starts[i])
    assert.ok(Math.min(...gaps) >= START_GAP_MS - 20, `gaps ${gaps.map(Math.round)}`)
    // One at a time, with 500 ms after each answer, took at least this long for the same requests.
    assert.ok(elapsed < starts.length * (ANSWER_MS + OLD_GAP_MS), `${elapsed} ms for ${near.length} pictures`)
  })
})
