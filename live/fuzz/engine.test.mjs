// Unit tests of the fuzz engine on a fake page: a planted page error during an interruption is caught, shrunk to the one step that causes it and
// replayed from the numbers it prints; a clean page passes and runs the lists asked for.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runFuzz } from './engine.mjs'
import { fakeTargets } from './fake-target.mjs'

const CELLS = Array.from({ length: 12 }, (_, i) => [Math.floor(i / 4), i % 4])
const SEED = 11

describe('the fuzz engine on a fake page', () => {
  it('a clean page passes, and runs the number of lists asked for, each on a page of its own that is closed after', async () => {
    const { openTarget, targets } = fakeTargets()
    const result = await runFuzz({ openTarget, cells: CELLS, seed: SEED, runs: 5, landMs: 10, settleMs: 10 })
    assert.deepEqual({ failed: result.failed, seed: result.seed, runs: result.runs }, { failed: false, seed: SEED, runs: 5 })
    assert.equal(targets.length, 5)
    assert.ok(targets.every((t) => t.closed))
  })

  it('stops at its time limit', async () => {
    const { openTarget } = fakeTargets()
    const started = Date.now()
    const result = await runFuzz({ openTarget, cells: CELLS, seed: SEED, minutes: 0.02, landMs: 10, settleMs: 10 })
    assert.equal(result.failed, false)
    assert.ok(result.runs > 1, 'ran more than one list')
    assert.ok(Date.now() - started < 10000, 'stopped within seconds')
  })

  describe('a page error planted on Escape during a drag', () => {
    let found
    it('is caught, with the step that caused it and the page\'s error log', async () => {
      const { openTarget } = fakeTargets({ plantEscapeError: true })
      found = await runFuzz({ openTarget, cells: CELLS, seed: SEED, runs: 200, landMs: 10, settleMs: 10 })
      assert.equal(found.failed, true)
      assert.match(found.error, /crash signal after "[^"]*Escape[^"]*": page error or console error: Error: planted page error/)
      assert.deepEqual(found.errorLog, ['dark-page@1.0.0: saved color: TypeError: planted'])
    })

    it('is shrunk to that one step', () => {
      assert.equal(found.sequence.length, 1, found.sequence.join(' | '))
      assert.match(found.sequence[0], /^(pen drag|right-click erase held|note drag).* Escape /)
    })

    it('is replayed from its seed, path and replay path: the same step and error, from one page', async () => {
      const { openTarget, targets } = fakeTargets({ plantEscapeError: true })
      const again = await runFuzz({ openTarget, cells: CELLS, seed: found.seed, path: found.path, replayPath: found.replayPath, landMs: 10, settleMs: 10 })
      assert.equal(again.failed, true)
      assert.deepEqual(again.sequence, found.sequence)
      assert.equal(again.error, found.error)
      assert.equal(targets.length, 1)
    })

    it('the same seed without the planted error passes', async () => {
      const { openTarget } = fakeTargets()
      assert.equal((await runFuzz({ openTarget, cells: CELLS, seed: found.seed, runs: 40, landMs: 10, settleMs: 10 })).failed, false)
    })
  })
})
