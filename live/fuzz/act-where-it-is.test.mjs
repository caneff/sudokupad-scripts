// `actWhereItIs` on a fake target: a hover or a press that shows nothing is made again where the target now is, and only then.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { actWhereItIs } from './act-where-it-is.mjs'

// `shows[i]` is whether the target shows after the i-th act; `boxes` are what the box reads, in order, the last one repeated.
function fake (shows, boxes) {
  const acts = []
  let reads = 0
  let finalWaits = 0
  const shown = {
    waitFor: async ({ timeout }) => {
      if (timeout === 999) {
        finalWaits++
        if (!shows[acts.length - 1]) throw new Error('never shown')
        return
      }
      if (!shows[acts.length - 1]) throw new Error('not shown yet')
    }
  }
  const boxOf = async () => boxes[Math.min(reads++, boxes.length - 1)]
  return { shown, boxOf, act: async (box) => { acts.push(box) }, acts, finalWaits: () => finalWaits }
}
const run = (t) => actWhereItIs(t.shown, t.boxOf, t.act, { lookMs: 1, finalMs: 999 })

describe('actWhereItIs', () => {
  it('acts once when the target shows', async () => {
    const t = fake([true], [{ x: 1 }])
    assert.equal(await run(t), true)
    assert.equal(t.acts.length, 1)
  })

  it('acts again at the target\'s new box when it moved and showed nothing', async () => {
    // reads: before act 1, after act 1 (moved), before act 2
    const t = fake([false, true], [{ x: 1 }, { x: 2 }, { x: 2 }])
    assert.equal(await run(t), true)
    assert.deepEqual(t.acts, [{ x: 1 }, { x: 2 }])
  })

  it('does not act again when the target stayed where it was, and waits out the full time', async () => {
    const t = fake([false, true], [{ x: 1 }])
    await assert.rejects(run(t), /never shown/)
    assert.equal(t.acts.length, 1)
    assert.equal(t.finalWaits(), 1)
  })

  it('gives up after its tries when the target keeps moving', async () => {
    let n = 0
    const t = fake([false, false, false, false, false], [])
    t.boxOf = async () => ({ x: n++ })
    await assert.rejects(run(t), /never shown/)
    assert.equal(t.acts.length, 4)
  })

  it('does nothing when there is no box to act on', async () => {
    const t = fake([true], [null])
    assert.equal(await run(t), false)
    assert.equal(t.acts.length, 0)
  })
})
