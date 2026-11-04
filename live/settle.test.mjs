// The shared `settle` of the live checks, run against a fake read so no browser is needed. Each bound on elapsed time has
// room for a loaded box: the lower one is the rule, the upper one only tells a stop at the rule from a wait for the backstop.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { FLOOR_MS, STABLE_MS, settle } from './settle.mjs'

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
    assert.equal(ms < FLOOR_MS, true, `took ${ms} ms`)
  })

  it('compares as JSON, so a fresh array or object each read still matches without waiting out the floor', async () => {
    const { value, ms } = await timed(() => settle(async () => ['1', '5'], ['1', '5']))
    assert.deepEqual(value, ['1', '5'])
    assert.equal(ms < FLOOR_MS, true, `took ${ms} ms`)
  })

  it('waits for a value that arrives late', async () => {
    const read = scripted([{ at: 0, value: 0 }, { at: 700, value: 1 }])
    assert.equal(await settle(read, 1), 1)
  })

  it('waits for a value that arrives after a pause shorter than the quiet window', async () => {
    const read = scripted([{ at: 0, value: 0 }, { at: 100, value: 1 }, { at: 100 + STABLE_MS - 100, value: 2 }])
    assert.equal(await settle(read, 2), 2)
  })

  it('returns the wrong value once a page that never changes has been read for the floor', async () => {
    const { value, ms } = await timed(() => settle(async () => 'old', 'new'))
    assert.equal(value, 'old')
    assert.equal(ms >= FLOOR_MS && ms < 5000, true, `took ${ms} ms`)
  })

  it('returns the wrong value one quiet window after a page that changed and stopped', async () => {
    const read = scripted([{ at: 0, value: 'a' }, { at: 100, value: 'b' }])
    const { value, ms } = await timed(() => settle(read, 'new'))
    assert.equal(value, 'b')
    assert.equal(ms >= 100 + STABLE_MS && ms < 5000, true, `took ${ms} ms`)
  })

  it('keeps waiting while the value keeps changing, up to the timeout', async () => {
    let n = 0
    const { value, ms } = await timed(() => settle(async () => n++, 'never', 700))
    assert.equal(typeof value, 'number')
    assert.equal(ms >= 700, true, `took ${ms} ms`)
  })

  it('with an infinite quiet window waits out the timeout', async () => {
    const { value, ms } = await timed(() => settle(async () => 'old', 'new', FLOOR_MS + 800, Infinity))
    assert.equal(value, 'old')
    assert.equal(ms >= FLOOR_MS + 800, true, `took ${ms} ms`)
  })
})
