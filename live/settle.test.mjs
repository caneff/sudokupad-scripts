// The shared `settle`, `stable`, `readUntil` and `clickUntil` of the live checks, run against a fake read so no browser is needed. Each bound on elapsed time has
// room for a loaded box: the lower one is the rule, the upper one only tells a stop at the rule from a wait for the backstop.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CLICK_TAKES_MS, FLOOR_MS, STABLE_MS, clickUntil, readUntil, settle, stable } from './settle.mjs'

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

describe('stable', () => {
  it('returns a value that has not changed for the quiet window', async () => {
    const { value, ms } = await timed(() => stable(async () => 'still'))
    assert.equal(value, 'still')
    assert.equal(ms >= STABLE_MS && ms < 5000, true, `took ${ms} ms`)
  })

  it('does not return a value that paused for less than the quiet window and then moved', async () => {
    const read = scripted([{ at: 0, value: 'a' }, { at: STABLE_MS - 100, value: 'b' }])
    const { value, ms } = await timed(() => stable(read))
    assert.equal(value, 'b')
    assert.equal(ms >= STABLE_MS - 100 + STABLE_MS, true, `took ${ms} ms`)
  })

  it('does not count slow reads as a held value: two samples a poll apart that each took longer than the quiet window', async () => {
    const t0 = Date.now()
    // samples at its start, then takes longer than the quiet window to return; the value flips while the second read is out
    const read = async () => {
      const sampled = Date.now() - t0 >= 500 ? 'b' : 'a'
      await new Promise((resolve) => setTimeout(resolve, STABLE_MS + 100))
      return sampled
    }
    assert.equal(await stable(read), 'b')
  })

  it('compares as JSON, so a fresh array each read counts as the same value', async () => {
    assert.deepEqual(await stable(async () => [1, 2]), [1, 2])
  })

  it('takes its own equality: it asks the given function whether two Buffers are the same value', async () => {
    const compared = []
    const equal = (a, b) => { compared.push(Buffer.isBuffer(a) && Buffer.isBuffer(b)); return a.equals(b) }
    const { value, ms } = await timed(() => stable(async () => Buffer.from([1, 2, 3]), undefined, equal))
    assert.deepEqual(value, Buffer.from([1, 2, 3]))
    assert.equal(compared.length > 0 && compared.every(Boolean), true, `compared ${JSON.stringify(compared)}`)
    assert.equal(ms >= STABLE_MS && ms < 5000, true, `took ${ms} ms`)
  })

  it('with its own equality, waits while the compared part moves and ignores a part the equality skips', async () => {
    const t0 = Date.now()
    // `noise` changes every read; `n` flips once. The equality compares `n` only.
    const read = async () => ({ n: Date.now() - t0 >= 150 ? 2 : 1, noise: Math.random() })
    const { value, ms } = await timed(() => stable(read, undefined, (a, b) => a.n === b.n))
    assert.equal(value.n, 2)
    assert.equal(ms >= 150 + STABLE_MS, true, `took ${ms} ms`)
  })

  it('throws, naming the last value, when the value keeps moving until the timeout', async () => {
    let n = 0
    await assert.rejects(() => stable(async () => ({ n: n++ }), 700), /did not stop changing in 700 ms; last \{"n":\d+\}/)
  })
})

describe('readUntil', () => {
  const agrees = (r) => r.region === r.regionAfter

  it('returns the first reading that holds, with no second read', async () => {
    let reads = 0
    const reading = await readUntil(async () => { reads++; return { region: 1, regionAfter: 1 } }, agrees)
    assert.deepEqual(reading, { region: 1, regionAfter: 1 })
    assert.equal(reads, 1)
  })

  it('reads again until a reading holds', async () => {
    let reads = 0
    const reading = await readUntil(async () => { reads++; return { region: reads, regionAfter: reads < 3 ? 0 : reads } }, agrees)
    assert.deepEqual(reading, { region: 3, regionAfter: 3 })
    assert.equal(reads, 3)
  })

  it('returns a reading that holds even when reading it took past the deadline', async () => {
    const slow = async () => {
      await new Promise((resolve) => setTimeout(resolve, 150))
      return { region: 1, regionAfter: 1 }
    }
    assert.deepEqual(await readUntil(slow, agrees, 50), { region: 1, regionAfter: 1 })
  })

  it('reads again after a failed reading inside the deadline, and returns the next one that holds past it', async () => {
    let reads = 0
    const read = async () => {
      reads++
      await new Promise((resolve) => setTimeout(resolve, reads === 2 ? 600 : 0))
      return { region: 1, regionAfter: reads === 1 ? 2 : 1 }
    }
    assert.deepEqual(await readUntil(read, agrees, 300), { region: 1, regionAfter: 1 })
    assert.equal(reads, 2)
  })

  it('throws at the deadline, naming the last reading, when the region moves during the final capture', async () => {
    let reads = 0
    const moving = async () => { reads++; return { region: reads, regionAfter: reads + 1 } }
    await assert.rejects(() => readUntil(moving, agrees, 200), /no reading held in 200 ms; last \{"region":\d+,"regionAfter":\d+\}/)
    assert.equal(reads >= 2, true, `${reads} reads`)
  })

  it('does not return a reading that moved during a capture that ran past the deadline', async () => {
    const moved = async () => {
      await new Promise((resolve) => setTimeout(resolve, 150))
      return { region: 1, regionAfter: 2 }
    }
    await assert.rejects(() => readUntil(moved, agrees, 50), /last \{"region":1,"regionAfter":2\}/)
  })
})

describe('clickUntil', () => {
  it('clicks once when the first click takes', async () => {
    let clicks = 0
    let value = 0
    const click = async () => { clicks++; value = 1 }
    assert.equal(await clickUntil(click, async () => value, 1, 5000), 1)
    assert.equal(clicks, 1)
  })

  it('clicks again until a click takes: the first two are dead', async () => {
    let clicks = 0
    const click = async () => { clicks++ }
    assert.equal(await clickUntil(click, async () => (clicks >= 3 ? 'on' : 'off'), 'on', 5000), 'on')
    assert.equal(clicks, 3)
  })

  it('compares as JSON, so a fresh array each read matches', async () => {
    assert.deepEqual(await clickUntil(async () => {}, async () => [1, 2], [1, 2], 5000), [1, 2])
  })

  it('stops clicking at the deadline and returns the last reading when no click ever takes', async () => {
    let clicks = 0
    const deadlineMs = 2 * CLICK_TAKES_MS
    const { value, ms } = await timed(() => clickUntil(async () => { clicks++ }, async () => 'off', 'on', deadlineMs))
    assert.equal(value, 'off')
    assert.equal(clicks >= 2, true, `${clicks} clicks`)
    assert.equal(ms >= deadlineMs && ms < deadlineMs + 5000, true, `took ${ms} ms`)
  })

  it('takes the deadline from its parameter: one already over by the first click\'s end clicks once, a longer one again', async () => {
    const clicksWithin = async (deadlineMs) => {
      let clicks = 0
      await clickUntil(async () => { clicks++ }, async () => 'off', 'on', deadlineMs)
      return clicks
    }
    assert.equal(await clicksWithin(1), 1)
    const clicks = await clicksWithin(5 * CLICK_TAKES_MS)
    assert.equal(clicks >= 2, true, `${clicks} clicks`)
  })

  describe('with an effect that shows 2 click-waits after the first click, as a toggle on a loaded box can', () => {
    const SHOWS_AFTER_MS = 2 * CLICK_TAKES_MS
    const run = async (clickTakesMs) => {
      let clicks = 0
      let firstClick
      const click = async () => { clicks++; firstClick ??= Date.now() }
      const read = async () => Date.now() - firstClick >= SHOWS_AFTER_MS ? 'on' : 'off'
      await clickUntil(click, read, 'on', 5000, clickTakesMs)
      return clicks
    }

    it('clicks again by default', async () => {
      const clicks = await run()
      assert.equal(clicks >= 2, true, `${clicks} clicks`)
    })

    it('clicks once when each click is given longer than the effect takes', async () => {
      assert.equal(await run(SHOWS_AFTER_MS + CLICK_TAKES_MS), 1)
    })
  })
})
