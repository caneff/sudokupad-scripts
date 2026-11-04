// The pure parts of live/cache.mjs: where the recording lives, whether a run records or replays it,
// and how a fresh recording is cleaned. Network-free, so it runs in `npm test`; the recording and
// replay themselves are what `npm run test:live` exercises.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanHar, ensureRecording, harPath, MAX_AGE_MS, misses, modeFor, routeSudokuPad } from './cache.mjs'

const HOUR = 60 * 60 * 1000

describe('harPath', () => {
  it('is under XDG_CACHE_HOME when set', () => {
    assert.equal(harPath({ XDG_CACHE_HOME: '/x/cache' }, '/home/u'), '/x/cache/sudokupad-scripts/live/sudokupad.har')
  })

  it('falls back to ~/.cache when XDG_CACHE_HOME is unset or empty', () => {
    assert.equal(harPath({}, '/home/u'), '/home/u/.cache/sudokupad-scripts/live/sudokupad.har')
    assert.equal(harPath({ XDG_CACHE_HOME: '' }, '/home/u'), '/home/u/.cache/sudokupad-scripts/live/sudokupad.har')
  })
})

describe('modeFor', () => {
  const now = 1e12
  const fresh = { exists: true, mtimeMs: now - 23 * HOUR, now }

  it('replays a recording younger than 24 hours', () => {
    assert.equal(modeFor({ env: {}, ...fresh }), 'replay')
  })

  it('records when there is no recording', () => {
    assert.equal(modeFor({ env: {}, exists: false, mtimeMs: 0, now }), 'record')
  })

  it('records a recording older than 24 hours', () => {
    assert.equal(MAX_AGE_MS, 24 * HOUR)
    assert.equal(modeFor({ env: {}, exists: true, mtimeMs: now - 25 * HOUR, now }), 'record')
  })

  it('LIVE_REFRESH=1 records over a fresh recording', () => {
    assert.equal(modeFor({ env: { LIVE_REFRESH: '1' }, ...fresh }), 'record')
  })

  it('LIVE_OFFLINE=1 replays a stale recording', () => {
    assert.equal(modeFor({ env: { LIVE_OFFLINE: '1' }, exists: true, mtimeMs: now - 99 * HOUR, now }), 'replay')
  })

  it('LIVE_REFRESH=1 replays a recording this run already refreshed', () => {
    assert.equal(modeFor({ env: { LIVE_REFRESH: '1' }, ...fresh, refreshedThisRun: true }), 'replay')
  })

  it('LIVE_OFFLINE=1 with no recording is an error naming the variable', () => {
    assert.throws(() => modeFor({ env: { LIVE_OFFLINE: '1' }, exists: false, mtimeMs: 0, now }), /LIVE_OFFLINE=1.*no recording/)
  })

  it('LIVE_OFFLINE=1 together with LIVE_REFRESH=1 is an error', () => {
    assert.throws(() => modeFor({ env: { LIVE_OFFLINE: '1', LIVE_REFRESH: '1' }, ...fresh }), /LIVE_OFFLINE=1.*LIVE_REFRESH=1/)
  })
})

describe('cleanHar', () => {
  const entry = (url, { status = 200, mimeType = 'text/css', text = 'x', encoding, method = 'GET', postData } = {}) => ({
    request: { method, url, ...(postData ? { postData: { text: postData } } : {}) },
    response: { status, content: { mimeType, text, ...(encoding ? { encoding } : {}) } }
  })
  const clean = (entries) => cleanHar({ log: { entries } }).log.entries

  it('drops an aborted request, which Playwright records with status -1', () => {
    assert.deepEqual(clean([entry('https://a/1', { status: -1 }), entry('https://a/2')]).map((e) => e.request.url), ['https://a/2'])
  })

  it('keeps one entry per request, the one that kept its bytes (base64) over the one that did not, in either order', () => {
    const font = 'https://sudokupad.app/assets/fonts/SevenSegment.ttf'
    const lost = entry(font, { mimeType: 'text/html', text: '\ufffd\ufffd' })
    const kept = entry(font, { mimeType: 'application/octet-stream', text: 'AAEAAA==', encoding: 'base64' })
    for (const entries of [[lost, kept], [kept, lost]]) {
      const cleaned = clean(entries)
      assert.equal(cleaned.length, 1)
      assert.equal(cleaned[0].response.content.encoding, 'base64')
    }
  })

  it('keeps the later of two entries for one request when neither kept bytes', () => {
    const kept = clean([entry('https://a/1', { text: 'old' }), entry('https://a/1', { text: 'new' })])
    assert.deepEqual(kept.map((e) => e.response.content.text), ['new'])
  })

  it('keeps a GET and a POST to one URL apart', () => {
    assert.deepEqual(clean([entry('https://a/1'), entry('https://a/1', { method: 'POST' })]).map((e) => e.request.method), ['GET', 'POST'])
  })

  it('keeps two POSTs to one URL apart when their bodies differ', () => {
    const kept = clean([entry('https://a/1', { method: 'POST', postData: 'one' }), entry('https://a/1', { method: 'POST', postData: 'two' })])
    assert.deepEqual(kept.map((e) => e.request.postData.text), ['one', 'two'])
  })

  it('keeps entries for different requests and the HAR around them', () => {
    const har = cleanHar({ log: { version: '1.2', entries: [entry('https://a/1'), entry('https://a/2')] } })
    assert.equal(har.log.version, '1.2')
    assert.equal(har.log.entries.length, 2)
  })
})

describe('ensureRecording', () => {
  const HOUR = 60 * 60 * 1000
  let home, calls
  const recorder = (wait = 0) => async (file) => {
    calls.push(file)
    await new Promise((resolve) => setTimeout(resolve, wait))
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, '{"log":{"entries":[]}}')
  }
  const ensure = (env, { ppid = 4242, record = recorder() } = {}) => ensureRecording({ env, home, ppid, record })
  const file = () => harPath({}, home)
  const age = (hours) => { const t = (Date.now() - hours * HOUR) / 1000; utimesSync(file(), t, t) }

  before(() => { home = mkdtempSync(join(tmpdir(), 'cache-test-')) })
  after(() => rmSync(home, { recursive: true, force: true }))
  const reset = () => { calls = []; rmSync(join(home, '.cache'), { recursive: true, force: true }) }

  it('records when there is no recording, and replays the next call', async () => {
    reset()
    await ensure({})
    await ensure({})
    assert.equal(calls.length, 1)
  })

  it('replays a recording younger than 24 hours without recording', async () => {
    reset()
    await ensure({})
    age(23)
    await ensure({})
    assert.equal(calls.length, 1)
  })

  it('records again when the recording is older than 24 hours', async () => {
    reset()
    await ensure({})
    age(25)
    await ensure({})
    assert.equal(calls.length, 2)
  })

  it('two callers started together record once', async () => {
    reset()
    await Promise.all([ensure({}, { record: recorder(50) }), ensure({}, { record: recorder(50) })])
    assert.equal(calls.length, 1)
  })

  it('LIVE_REFRESH=1 in test files of one runner records once, however much later the others start', async () => {
    reset()
    const env = { LIVE_REFRESH: '1', NODE_TEST_CONTEXT: 'child-v8' }
    await ensure(env)
    age(0.05) // a recording already a few minutes old when the next test file starts
    await ensure(env)
    assert.equal(calls.length, 1)
  })

  it('LIVE_REFRESH=1 under a new runner records again', async () => {
    reset()
    const env = { LIVE_REFRESH: '1', NODE_TEST_CONTEXT: 'child-v8' }
    await ensure(env, { ppid: 1 })
    await ensure(env, { ppid: 2 })
    assert.equal(calls.length, 2)
  })

  it('LIVE_REFRESH=1 outside a test runner records on every call', async () => {
    reset()
    await ensure({ LIVE_REFRESH: '1' })
    await ensure({ LIVE_REFRESH: '1' })
    assert.equal(calls.length, 2)
  })

  it('LIVE_OFFLINE=1 with no recording throws and records nothing', async () => {
    reset()
    await assert.rejects(ensure({ LIVE_OFFLINE: '1' }), /LIVE_OFFLINE=1/)
    assert.equal(calls.length, 0)
    assert.equal(existsSync(file()), false)
  })
})

describe('routeSudokuPad', () => {
  const PUZZLE = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
  const RECORDED = ['https://sudokupad.app/framework.js?v=1', PUZZLE]
  let cache, saved

  // A page whose routes run the way Playwright runs them: the most recently registered match first,
  // `fallback` passing the request (under a new url if given) to the next one.
  const stubTarget = () => {
    const handlers = []
    const matches = (m, url) => m === '**/*' || (m instanceof RegExp ? m.test(url) : m(new URL(url)))
    return {
      async route (matcher, handler) { handlers.push({ matcher, handler }) },
      async routeFromHAR () {
        handlers.push({ matcher: '**/*', handler: (route) => RECORDED.includes(route.request().url()) ? route.fulfill() : route.fallback() })
      },
      async request (url, resourceType = 'script') {
        const outcome = {}
        let i = handlers.length
        const next = async (current) => {
          while (--i >= 0) {
            if (!matches(handlers[i].matcher, current)) continue
            return handlers[i].handler({
              request: () => ({ url: () => current, resourceType: () => resourceType }),
              abort: async () => { outcome.aborted = true },
              fulfill: async () => { outcome.fulfilled = current },
              fallback: async (override) => next(override?.url ?? current)
            })
          }
        }
        await next(url)
        return outcome
      }
    }
  }

  before(() => {
    saved = { XDG: process.env.XDG_CACHE_HOME, OFFLINE: process.env.LIVE_OFFLINE }
    cache = mkdtempSync(join(tmpdir(), 'cache-route-'))
    process.env.XDG_CACHE_HOME = cache
    process.env.LIVE_OFFLINE = '1'
    mkdirSync(join(cache, 'sudokupad-scripts', 'live'), { recursive: true })
    writeFileSync(harPath(process.env, ''), '{"log":{"entries":[]}}')
  })
  after(() => {
    for (const [key, value] of [['XDG_CACHE_HOME', saved.XDG], ['LIVE_OFFLINE', saved.OFFLINE]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
    rmSync(cache, { recursive: true, force: true })
    misses.clear()
  })

  it('serves a recorded request from the recording', async () => {
    const t = stubTarget()
    await routeSudokuPad(t)
    assert.deepEqual(await t.request('https://sudokupad.app/framework.js?v=1'), { fulfilled: 'https://sudokupad.app/framework.js?v=1' })
  })

  it('aborts a request the recording lacks and lists it as a miss', async () => {
    const t = stubTarget()
    await routeSudokuPad(t)
    const url = 'https://sudokupad.app/assets/fonts/Other.ttf'
    assert.deepEqual(await t.request(url, 'font'), { aborted: true })
    assert.deepEqual([...misses], [url])
    misses.clear()
  })

  it('aborts a tracker without listing it as a miss', async () => {
    const t = stubTarget()
    await routeSudokuPad(t)
    assert.deepEqual(await t.request('https://consent.cookiebot.com/uc.js'), { aborted: true })
    assert.deepEqual(await t.request('https://api.sudokupad.com/counter/abc'), { aborted: true })
    assert.deepEqual([...misses], [])
  })

  it('serves the recorded page for a navigation to any other sudokupad.app path', async () => {
    const t = stubTarget()
    await routeSudokuPad(t)
    assert.deepEqual(await t.request('https://sudokupad.app/some-other-puzzle', 'document'), { fulfilled: PUZZLE })
  })
})

describe('a miss fails the run', () => {
  const run = (body) => spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { misses } from ${JSON.stringify(new URL('./cache.mjs', import.meta.url).href)}\n${body}`], { encoding: 'utf8' })

  it('exits 1 naming each missing URL', () => {
    const r = run("misses.add('https://sudokupad.app/a.woff2'); misses.add('https://sudokupad.app/b.png')")
    assert.equal(r.status, 1)
    assert.match(r.stderr, /https:\/\/sudokupad\.app\/a\.woff2/)
    assert.match(r.stderr, /https:\/\/sudokupad\.app\/b\.png/)
  })

  it('exits 0 when nothing was missed', () => {
    assert.equal(run('').status, 0)
  })
})
