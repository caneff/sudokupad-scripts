// Unit tests of the fuzz engine on a fake page: a planted page error during an interruption is caught, blamed on its action, shrunk to the one step that
// causes it and replayed from the numbers it prints; a clean page passes and runs the lists asked for; a run that never got to run is not a failure.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runFuzz } from './engine.mjs'
import { fakeTargets } from './fake-target.mjs'

const CELLS = Array.from({ length: 12 }, (_, i) => [Math.floor(i / 4), i % 4])
const SEED = 7
// The fake waits for nothing, and its planted error lands on the first wait of more than 0 ms.
const WAITS = { landMs: 1, settleMs: 1 }

describe('the fuzz engine on a fake page', () => {
  it('a clean page passes, and runs the number of lists asked for, each on a page of its own that is closed after', async () => {
    const { openTarget, targets } = fakeTargets()
    const result = await runFuzz({ openTarget, cells: CELLS, seed: SEED, runs: 5, ...WAITS })
    assert.deepEqual({ failed: result.failed, seed: result.seed, runs: result.runs }, { failed: false, seed: SEED, runs: 5 })
    assert.equal(targets.length, 5)
    assert.ok(targets.every((t) => t.closed))
  })

  it('stops at its time limit', async () => {
    const { openTarget } = fakeTargets()
    const started = Date.now()
    const result = await runFuzz({ openTarget, cells: CELLS, seed: SEED, minutes: 0.02, ...WAITS })
    assert.equal(result.failed, false)
    assert.ok(result.runs > 1, 'ran more than one list')
    assert.ok(Date.now() - started < 10000, 'stopped within seconds')
  })

  it('a time limit that fires before the first list has run is a run that did not get to run, not a failure', async () => {
    const { openTarget } = fakeTargets()
    const slow = async () => { await new Promise((resolve) => setTimeout(resolve, 150)); return openTarget() }
    const result = await runFuzz({ openTarget: slow, cells: CELLS, seed: SEED, minutes: 0.001, ...WAITS })
    assert.equal(result.failed, false)
  })

  describe('a page error planted on Escape during a drag', () => {
    let found

    it('is caught, with the step that caused it and the page\'s error log', async () => {
      const { openTarget } = fakeTargets({ plantEscapeError: true })
      found = await runFuzz({ openTarget, cells: CELLS, seed: SEED, runs: 200, ...WAITS })
      assert.equal(found.failed, true)
      assert.match(found.error, /crash signal after ".*Escape.*": page error or console error: Error: planted page error/)
      assert.deepEqual(found.errorLog, ['dark-page@1.0.0: saved color: TypeError: planted'])
    })

    it('is shrunk to that one step, from a longer list the hunt found', () => {
      assert.equal(found.sequence.length, 1, found.sequence.join(' | '))
      assert.match(found.sequence[0], /^(pen drag|right-click erase held|note drag).* then Escape then release$/)
      assert.ok(found.huntedSteps > 1, `the hunt found ${found.huntedSteps} steps, so the shrink had work to do`)
    })

    it('is replayed from its seed, path and replay path: the same step and error, from one page', async () => {
      const { openTarget, targets } = fakeTargets({ plantEscapeError: true })
      const again = await runFuzz({ openTarget, cells: CELLS, seed: found.seed, path: found.path, replayPath: found.replayPath, ...WAITS })
      assert.equal(again.failed, true)
      assert.deepEqual(again.sequence, found.sequence)
      assert.equal(again.error, found.error)
      assert.equal(targets.length, 1)
    })

    it('a replay of a failure that does not repeat ends after the lists its path names, and does not hunt', async () => {
      const { openTarget, targets } = fakeTargets()
      const again = await runFuzz({ openTarget, cells: CELLS, seed: found.seed, path: found.path, replayPath: found.replayPath, ...WAITS })
      assert.equal(again.failed, false)
      assert.ok(targets.length <= 5, `${targets.length} pages opened`)
    })

    it('the same seed without the planted error passes', async () => {
      const { openTarget } = fakeTargets()
      assert.equal((await runFuzz({ openTarget, cells: CELLS, seed: found.seed, runs: 40, ...WAITS })).failed, false)
    })
  })

  describe('a rule broken by a blur', () => {
    it('fails the run naming the rule and the step, and is shrunk to the one blur', async () => {
      const { openTarget } = fakeTargets({ whitenOnBlur: true })
      const found = await runFuzz({ openTarget, cells: CELLS, seed: SEED, runs: 200, ...WAITS })
      assert.equal(found.failed, true)
      assert.match(found.error, /rule broken after ".*blur.*": page-stays-dark: the page color rgb\(255, 255, 255\) is not dark/)
      assert.equal(found.sequence.length, 1, found.sequence.join(' | '))
      assert.match(found.sequence[0], /blur/)
    })

    it('the same seed with the page left dark passes', async () => {
      const { openTarget } = fakeTargets()
      assert.equal((await runFuzz({ openTarget, cells: CELLS, seed: SEED, runs: 100, ...WAITS })).failed, false)
    })
  })

  describe('a rule that depends on the kind of action', () => {
    it('is told the kind: a Tab that turns the pad to letters fails the run, shrunk to the one Tab', async () => {
      const { openTarget } = fakeTargets({ lettersOnTab: true })
      const found = await runFuzz({ openTarget, cells: CELLS, seed: SEED, runs: 300, ...WAITS })
      assert.equal(found.failed, true)
      assert.match(found.error, /rule broken after "press Tab": tab-not-letters: Tab switched the number pad to letters/)
      assert.deepEqual(found.sequence, ['press Tab'])
    })
  })

  describe('where a late error is read', () => {
    it('with no wait after an action, the wait after the last action still catches it', async () => {
      const { openTarget } = fakeTargets({ plantEscapeError: true })
      const result = await runFuzz({ openTarget, cells: CELLS, seed: SEED, runs: 200, landMs: 1, settleMs: 0 })
      assert.equal(result.failed, true)
      assert.match(result.error, /crash signal after the last action: /)
    })

    it('with no wait at all, the late error is never read', async () => {
      const { openTarget } = fakeTargets({ plantEscapeError: true })
      const result = await runFuzz({ openTarget, cells: CELLS, seed: SEED, runs: 100, landMs: 0, settleMs: 0 })
      assert.equal(result.failed, false)
    })
  })

  it('a log that cannot be read is said so, never reported as empty', async () => {
    const { openTarget } = fakeTargets({ plantEscapeError: true })
    const unreadable = async () => ({ ...await openTarget(), errorLog: async () => { throw new Error('storage blocked') } })
    const result = await runFuzz({ openTarget: unreadable, cells: CELLS, seed: SEED, runs: 200, ...WAITS })
    assert.deepEqual(result.errorLog, ['the error log could not be read: storage blocked'])
  })
})
