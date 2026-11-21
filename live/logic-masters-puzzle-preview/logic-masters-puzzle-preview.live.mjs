// Every request the browser makes is answered by this file's own routes, or aborted: nothing reaches logic-masters.de, whose pages
// and pictures are other authors' work. The pages and the PNG are synthetic.
import { after, afterEach, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchPersistent } from '../session.mjs'

const SOURCE = readFileSync(new URL('../../logic-masters-puzzle-preview.user.js', import.meta.url), 'utf8')
const HOST = 'logic-masters.de'
const PORTAL = `https://${HOST}/Raetselportal/`
const LINK_COUNT = 40
const ROW_HEIGHT = 150
const VIEWPORT = { width: 1200, height: 768 }
const NEAR_MARGIN = 400 // the script's NEAR_SCREEN_PX
const BUSY_DELAY_MS = 100 // each answer is held this long, so a request is still in flight when the next one is due
const ANSWER_MS = 300 // long enough that two requests in flight would overlap
const QUIET_MS = 2000 // "nothing more is fetched" window
const REQUEST_GAP_MS = 200 // the script's REQUEST_GAP_MS: from the end of one request to the start of the next
const BUSY_PAUSE_MS = 1500 // stands in for the script's 30 s pause so a run takes seconds; the script's own value is asserted below
const CLOCK_SLACK_MS = 30 // the page's resource-timing clock and the server's Date.now() can differ by a few ms
const BUSY_TEXT = 'Busy, try later'
// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

// The script with its 30 s pause shortened, so a run that waits out a busy answer takes seconds.
const PAUSE_LINE = 'const BUSY_PAUSE_MS = 30 * 1000'
const SCRIPT = SOURCE.replace(PAUSE_LINE, `const BUSY_PAUSE_MS = ${BUSY_PAUSE_MS}`)

const portalHtml = () => `<!doctype html><meta charset="utf-8"><body style="margin:0">${
  Array.from({ length: LINK_COUNT }, (_, i) => `<div style="height:${ROW_HEIGHT}px"><a href="Raetsel/zeigen.php?id=${i + 1}">Puzzle ${i + 1}</a></div>`).join('')
}</body>`
const puzzleHtml = (id) => `<!doctype html><meta charset="utf-8"><body><img src="bild.php?data=synthetic-${id}"></body>`

// Every context a test opens, closed after it whether the test passed or not: an open Chromium keeps the process alive.
const open = []

// One browser session on `profile`, with the script injected at DOMContentLoaded as a userscript manager does.
// `busyPages` and `busyImages` are the ids whose puzzle page or image the site answers 503 (the string 'all' for every one);
// `delay` holds each answer that long; `scrollTo` scrolls the page before the script runs.
async function session (profile, { busyPages = [], busyImages = [], delay = 0, scrollTo = 0 } = {}) {
  const context = await launchPersistent(profile, { headless: true, viewport: VIEWPORT })
  open.push(context)
  // `log` holds each puzzle page and image request in the order the site saw them, with its start and end on this process's clock.
  const hits = { pages: [], images: [], aborted: [], log: [], inFlight: 0, maxInFlight: 0 }
  const isBusy = (ids, id) => ids === 'all' || ids.includes(id)
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname !== HOST) { hits.aborted.push(url.href); return route.abort() }
    if (url.pathname === '/Raetselportal/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: portalHtml() })
    const isPage = url.pathname.endsWith('/zeigen.php')
    const entry = { kind: isPage ? 'page' : 'image', id: (isPage ? url.searchParams.get('id') : url.searchParams.get('data') || '').replace('synthetic-', ''), start: Date.now(), end: 0 }
    hits.log.push(entry)
    hits.inFlight++
    hits.maxInFlight = Math.max(hits.maxInFlight, hits.inFlight)
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    hits.inFlight--
    entry.end = Date.now()
    if (entry.kind === 'page') {
      const id = url.searchParams.get('id')
      hits.pages.push(id)
      if (isBusy(busyPages, id)) return route.fulfill({ status: 503, body: 'busy' })
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: puzzleHtml(id) })
    }
    if (url.pathname.endsWith('/bild.php')) {
      const id = url.searchParams.get('data').replace('synthetic-', '')
      hits.images.push(id)
      if (isBusy(busyImages, id)) return route.fulfill({ status: 503, body: 'busy' })
      return route.fulfill({ contentType: 'image/png', body: PNG, headers: { pragma: 'no-cache', 'cache-control': 'no-cache', expires: '0' } })
    }
    return route.fulfill({ status: 404, body: '' })
  })
  await context.addInitScript({ content: `document.addEventListener('DOMContentLoaded', () => { window.scrollTo(0, ${scrollTo}); ${SCRIPT} })` })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(PORTAL, { waitUntil: 'domcontentloaded' })
  return { context, page, hits, errors }
}

// The ids of the links the script puts first: those within the margin of the viewport, in page order.
const nearIds = (page) => page.evaluate(({ margin }) => [...document.querySelectorAll('a[href*="zeigen.php"]')]
  .filter((a) => { const r = a.getBoundingClientRect(); return r.bottom > -margin && r.top < window.innerHeight + margin })
  .map((a) => new URL(a.href).searchParams.get('id')), { margin: NEAR_MARGIN })

const shown = (page) => page.$$eval('.puzzle-preview img', (imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length)
// Resolves once at least `count` previews show a loaded picture.
const waitForShown = (page, count, timeout) => page.waitForFunction((n) => [...document.querySelectorAll('.puzzle-preview img')].filter((i) => i.complete && i.naturalWidth > 0).length >= n, count, { timeout })
// Resolves once `count` boxes carry this label text.
const waitForLabels = (page, text, count, timeout) => page.waitForFunction(({ text, count }) => [...document.querySelectorAll('.puzzle-preview div')].filter((d) => d.textContent === text).length === count, { text, count }, { timeout })
// The link ids, in page order, whose box carries this label text.
const idsLabelled = (page, text) => page.evaluate((text) => [...document.querySelectorAll('.puzzle-preview')]
  .filter((box) => box.querySelector('div') && box.querySelector('div').textContent === text)
  .map((box) => new URL(box.parentElement.querySelector('a[href*="zeigen.php"]').href).searchParams.get('id')), text)

// A pause that proves a negative: nothing more was fetched in this time.
const quiet = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Logic Masters Puzzle Preview', { timeout: 300000 }, () => {
  let dir
  before(() => { dir = mkdtempSync(join(tmpdir(), 'lm-preview-')) })
  afterEach(async () => { await Promise.all(open.splice(0).map((context) => context.close())) })
  after(() => { rmSync(dir, { recursive: true, force: true }) })

  it('the script pauses 30 s after a busy answer and 200 ms between requests', () => {
    assert.ok(SOURCE.includes(PAUSE_LINE), `${PAUSE_LINE} is not in the script`)
    assert.ok(SOURCE.includes(`const REQUEST_GAP_MS = ${REQUEST_GAP_MS}`), 'REQUEST_GAP_MS is not 200 in the script')
  })

  it('a second load in the same profile fetches no puzzle page and no image', async () => {
    const profile = join(dir, 'cache-profile')
    const first = await session(profile)
    await waitForShown(first.page, LINK_COUNT, 120000)
    assert.equal(first.hits.pages.length, LINK_COUNT)
    assert.equal(first.hits.images.length, LINK_COUNT)
    assert.deepEqual(first.errors, [])
    await first.context.close()

    const second = await session(profile)
    await waitForShown(second.page, LINK_COUNT, 60000)
    await quiet(QUIET_MS)
    assert.equal(await shown(second.page), LINK_COUNT)
    assert.deepEqual(second.hits.pages, [])
    assert.deepEqual(second.hits.images, [])
    assert.deepEqual([...first.hits.aborted, ...second.hits.aborted], [])
    assert.deepEqual(second.errors, [])
  })

  it('every link has a box saying Loading... at once, and every puzzle is fetched with no scroll', async () => {
    const { page, hits, errors } = await session(join(dir, 'all-profile'), { delay: BUSY_DELAY_MS })
    await page.waitForFunction((n) => document.querySelectorAll('.puzzle-preview').length === n, LINK_COUNT, { timeout: 5000 })
    assert.ok(await page.$$eval('.puzzle-preview div', (labels) => labels.some((d) => d.textContent === 'Loading...')))
    await waitForShown(page, LINK_COUNT, 120000)
    assert.equal(await page.evaluate(() => window.scrollY), 0)
    assert.deepEqual([...hits.pages].sort((a, b) => a - b), Array.from({ length: LINK_COUNT }, (_, i) => String(i + 1)))
    assert.deepEqual(errors, [])
  })

  it('links on or near the screen go first, then the rest in page order', async () => {
    const { page, hits } = await session(join(dir, 'order-profile'), { scrollTo: 3000 })
    const near = await nearIds(page)
    assert.ok(near.length > 0 && near.length < LINK_COUNT && near[0] !== '1', `near links: ${near}`)
    await waitForShown(page, LINK_COUNT, 120000)
    const rest = Array.from({ length: LINK_COUNT }, (_, i) => String(i + 1)).filter((id) => !near.includes(id))
    assert.deepEqual(hits.pages, [...near, ...rest])
  })

  it('a 503 gives only its own link "Busy, try later", the queue waits, and the next load tries that link again', async () => {
    const profile = join(dir, 'busy-profile')
    const first = await session(profile, { busyPages: ['5', '13'], busyImages: ['9'] })
    await waitForShown(first.page, LINK_COUNT - 3, 120000)
    await waitForLabels(first.page, BUSY_TEXT, 3, 5000)
    assert.deepEqual(await idsLabelled(first.page, BUSY_TEXT), ['5', '9', '13'])
    assert.equal(first.hits.pages.length, LINK_COUNT)
    assert.equal(await first.page.evaluate(() => window.localStorage.length), 0)
    // The request after a busy answer starts a whole pause after it ended.
    const { log } = first.hits
    const at = log.findIndex((e) => e.kind === 'page' && e.id === '5')
    assert.ok(log[at + 1].start - log[at].end >= BUSY_PAUSE_MS - CLOCK_SLACK_MS, `pause ${log[at + 1].start - log[at].end} ms`)
    await first.context.close()

    const second = await session(profile)
    await waitForShown(second.page, LINK_COUNT, 60000)
    assert.deepEqual(second.hits.pages.sort((a, b) => a - b), ['5', '13'])
    assert.deepEqual(second.hits.images.sort((a, b) => a - b), ['5', '9', '13'])
  })

  it('three 503s in a row stop the run, and every link still waiting says "Busy, try later"', async () => {
    const { page, hits } = await session(join(dir, 'stop-profile'), { busyPages: ['1', '2', '3'] })
    await waitForLabels(page, BUSY_TEXT, LINK_COUNT, 60000)
    await quiet(QUIET_MS)
    assert.deepEqual(hits.pages, ['1', '2', '3'])
    assert.deepEqual(hits.images, [])
    assert.equal(await page.evaluate(() => window.localStorage.length), 0)
  })

  it('requests go one at a time, each starting at least 200 ms after the one before ended', async () => {
    const { page, hits } = await session(join(dir, 'pace-profile'), { delay: ANSWER_MS })
    await waitForShown(page, 5, 60000)
    assert.equal(hits.maxInFlight, 1)
    const gaps = hits.log.slice(1).map((e, i) => e.start - hits.log[i].end)
    assert.ok(gaps.length >= 9, `${gaps.length} gaps`)
    assert.ok(Math.min(...gaps) >= REQUEST_GAP_MS - CLOCK_SLACK_MS, `gaps ${gaps}`)
  })
})
