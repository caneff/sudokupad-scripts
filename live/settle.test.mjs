// The shared `settle` of the live checks, run against a fake read so no browser is needed.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { FLOOR_MS, QUIET_MS, SETTLE_MS, settle } from './settle.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const timed = async (fn) => { const t = Date.now(); const value = await fn(); return { value, ms: Date.now() - t } }
// A read whose value is `steps[i].value` from `steps[i].at` milliseconds after the first call.
const scripted = (steps) => {
  const t0 = Date.now()
  return async () => steps.filter((s) => Date.now() - t0 >= s.at).at(-1).value
}

describe('settle', () => {
  it('returns at once when the first read is the expected value', async () => {
    const { value, ms } = await timed(() => settle(async () => ({ a: 1 }), { a: 1 }))
    assert.deepEqual(value, { a: 1 })
    assert.equal(ms < 40, true, `took ${ms} ms`)
  })

  it('waits for a value that arrives late', async () => {
    const read = scripted([{ at: 0, value: 0 }, { at: 700, value: 1 }])
    assert.equal(await settle(read, 1), 1)
  })

  it('waits for a value that arrives after a pause shorter than the quiet window', async () => {
    const read = scripted([{ at: 0, value: 0 }, { at: 100, value: 1 }, { at: 100 + QUIET_MS - 100, value: 2 }])
    assert.equal(await settle(read, 2), 2)
  })

  it('returns the wrong value once a page that never changes has been read for the floor', async () => {
    const { value, ms } = await timed(() => settle(async () => 'old', 'new'))
    assert.equal(value, 'old')
    assert.equal(ms >= FLOOR_MS && ms < FLOOR_MS + 400, true, `took ${ms} ms`)
  })

  it('returns the wrong value one quiet window after a page that changed and stopped', async () => {
    const read = scripted([{ at: 0, value: 'a' }, { at: 100, value: 'b' }])
    const { value, ms } = await timed(() => settle(read, 'new'))
    assert.equal(value, 'b')
    assert.equal(ms >= 100 + QUIET_MS && ms < 100 + QUIET_MS + 400, true, `took ${ms} ms`)
  })

  it('keeps waiting while the value keeps changing, up to the timeout', async () => {
    let n = 0
    const { value, ms } = await timed(() => settle(async () => n++, 'never', 700))
    assert.equal(typeof value, 'number')
    assert.equal(ms >= 700 && ms < 900, true, `took ${ms} ms`)
  })

  it('with an infinite quiet window waits out the timeout like the old settle', async () => {
    const { value, ms } = await timed(() => settle(async () => 'old', 'new', FLOOR_MS + 800, Infinity))
    assert.equal(value, 'old')
    assert.equal(ms >= FLOOR_MS + 800, true, `took ${ms} ms`)
  })

  it('the backstop is the old ten seconds', () => {
    assert.equal(SETTLE_MS, 10000)
  })

  it('compares as JSON, so an equal array or object matches', async () => {
    await sleep(0)
    assert.deepEqual(await settle(async () => ['1', '5'], ['1', '5']), ['1', '5'])
  })
})
