// The pure parts of live/cache.mjs: where the recording lives, whether a run records or replays it,
// and how a fresh recording is cleaned. Network-free, so it runs in `npm test`; the recording and
// replay themselves are what `npm run test:live` exercises.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cleanHar, harPath, MAX_AGE_MS, modeFor } from './cache.mjs'

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

  it('LIVE_OFFLINE=1 with no recording is an error naming the variable, never a network load', () => {
    assert.throws(() => modeFor({ env: { LIVE_OFFLINE: '1' }, exists: false, mtimeMs: 0, now }), /LIVE_OFFLINE=1.*no recording/)
  })

  it('LIVE_OFFLINE=1 together with LIVE_REFRESH=1 is an error', () => {
    assert.throws(() => modeFor({ env: { LIVE_OFFLINE: '1', LIVE_REFRESH: '1' }, ...fresh }), /LIVE_OFFLINE=1.*LIVE_REFRESH=1/)
  })
})

describe('cleanHar', () => {
  const entry = (url, { status = 200, mimeType = 'text/css', text = 'x', encoding } = {}) => ({
    request: { method: 'GET', url },
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

  it('keeps entries for different requests and the HAR around them', () => {
    const har = cleanHar({ log: { version: '1.2', entries: [entry('https://a/1'), entry('https://a/2')] } })
    assert.equal(har.log.version, '1.2')
    assert.equal(har.log.entries.length, 2)
  })
})
