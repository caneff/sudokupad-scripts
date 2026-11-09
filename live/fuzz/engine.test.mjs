// Unit tests of the fuzz engine on a fake page: a planted page error during an interruption is caught, blamed on its action, shrunk to the one step that
// causes it and replayed from the numbers it prints; a clean page passes and runs the lists asked for; a run that never got to run is not a failure.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runFuzz } from './engine.mjs'
import { fakeTargets } from './fake-target.mjs'
import { FUZZ_PUZZLES } from './puzzle-set.mjs'

// A small fake puzzle for most tests, and the real set where the puzzle is the point.
const CELLS = Array.from({ length: 12 }, (_, i) => [Math.floor(i / 4), i % 4])
const PUZZLES = [{ name: 'fake', rows: 3, cols: 4, keys: ['1', '2', '3', '4'], free: CELLS, cells: CELLS }]
const SEED = 7
// The fake waits for nothing, and its planted error lands on the first wait of more than 0 ms.
const WAITS = { landMs: 1, settleMs: 1 }

describe('the fuzz engine on a fake page', () => {
  it('a clean page passes, and runs the number of lists asked for, each on a page of its own that is closed after', async () => {
    const { openTarget, targets } = fakeTargets()
    const result = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 5, ...WAITS })
    assert.deepEqual({ failed: result.failed, seed: result.seed, runs: result.runs }, { failed: false, seed: SEED, runs: 5 })
    assert.equal(targets.length, 5)
    assert.ok(targets.every((t) => t.closed))
  })

  it('times the hunt: huntMs covers the lists it ran, on a pass and on a failure', async () => {
    const slowTargets = (options) => {
      const { openTarget } = fakeTargets(options)
      return async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return openTarget() }
    }
    const passed = await runFuzz({ openTarget: slowTargets(), puzzles: PUZZLES, seed: SEED, runs: 5, ...WAITS })
    assert.ok(passed.huntMs >= 40, `5 lists of 10 ms each took ${passed.huntMs} ms`)
    const failed = await runFuzz({ openTarget: slowTargets({ plantEscapeError: true }), puzzles: PUZZLES, seed: SEED, runs: 200, ...WAITS })
    assert.equal(failed.failed, true)
    assert.ok(failed.huntMs >= 10, `the hunt of a failure took ${failed.huntMs} ms`)
  })

  describe('the puzzle is part of each list', () => {
    it('every puzzle of the set is run, each list on a page opened for its puzzle', async () => {
      const { openTarget, targets } = fakeTargets()
      const result = await runFuzz({ openTarget, puzzles: FUZZ_PUZZLES, seed: SEED, runs: 150, ...WAITS })
      assert.deepEqual(Object.keys(result.puzzleRuns), FUZZ_PUZZLES.map((p) => p.name))
      assert.deepEqual(Object.entries(result.puzzleRuns).filter(([, count]) => count === 0), [], 'every puzzle ran')
      assert.equal(Object.values(result.puzzleRuns).reduce((a, b) => a + b, 0), 150)
      assert.deepEqual(targets.map((t) => t.puzzle.name).sort(), Object.entries(result.puzzleRuns).flatMap(([name, count]) => Array(count).fill(name)).sort())
    })

    it('the lists counted per puzzle are the lists the run reports, also when the time limit cuts the last one off', async () => {
      const { openTarget } = fakeTargets()
      const slow = async (puzzle) => { await new Promise((resolve) => setTimeout(resolve, 5)); return openTarget(puzzle) }
      const result = await runFuzz({ openTarget: slow, puzzles: FUZZ_PUZZLES, seed: SEED, minutes: 0.01, ...WAITS })
      assert.equal(Object.values(result.puzzleRuns).reduce((a, b) => a + b, 0), result.runs)
    })

    it('a failure names its puzzle, and its path replays on that puzzle, not the first', async () => {
      const name = FUZZ_PUZZLES[4].name
      const { openTarget } = fakeTargets({ plantEscapeError: name })
      const found = await runFuzz({ openTarget, puzzles: FUZZ_PUZZLES, seed: SEED, runs: 400, ...WAITS })
      assert.equal(found.failed, true)
      assert.equal(found.puzzle, name, 'the failure happens on this puzzle only, so the shrink keeps it')
      const replay = fakeTargets({ plantEscapeError: name })
      const again = await runFuzz({ openTarget: replay.openTarget, puzzles: FUZZ_PUZZLES, seed: found.seed, path: found.path, replayPath: found.replayPath, ...WAITS })
      assert.equal(again.failed, true)
      assert.equal(again.puzzle, name)
      assert.deepEqual(again.sequence, found.sequence)
      assert.deepEqual(replay.targets.map((t) => t.puzzle.name), [name])
    })
  })

  it('stops at its time limit', async () => {
    const { openTarget } = fakeTargets()
    const started = Date.now()
    const result = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, minutes: 0.02, ...WAITS })
    assert.equal(result.failed, false)
    assert.ok(result.runs > 1, 'ran more than one list')
    assert.ok(Date.now() - started < 10000, 'stopped within seconds')
  })

  it('a time limit that fires before the first list has run is a run that did not get to run, not a failure', async () => {
    const { openTarget } = fakeTargets()
    const slow = async () => { await new Promise((resolve) => setTimeout(resolve, 150)); return openTarget() }
    const result = await runFuzz({ openTarget: slow, puzzles: PUZZLES, seed: SEED, minutes: 0.001, ...WAITS })
    assert.equal(result.failed, false)
  })

  describe('a page error planted on Escape during a drag', () => {
    let found

    it('is caught, with the step that caused it and the page\'s error log', async () => {
      const { openTarget } = fakeTargets({ plantEscapeError: true })
      found = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 200, ...WAITS })
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
      const again = await runFuzz({ openTarget, puzzles: PUZZLES, seed: found.seed, path: found.path, replayPath: found.replayPath, ...WAITS })
      assert.equal(again.failed, true)
      assert.deepEqual(again.sequence, found.sequence)
      assert.equal(again.error, found.error)
      assert.equal(targets.length, 1)
    })

    it('a replay of a failure that does not repeat ends after the lists its path names, and does not hunt', async () => {
      const { openTarget, targets } = fakeTargets()
      const again = await runFuzz({ openTarget, puzzles: PUZZLES, seed: found.seed, path: found.path, replayPath: found.replayPath, ...WAITS })
      assert.equal(again.failed, false)
      assert.ok(targets.length <= 5, `${targets.length} pages opened`)
    })
  })

  describe('a rule broken by a blur', () => {
    it('fails the run naming the rule and the step, and is shrunk to the one blur', async () => {
      const { openTarget } = fakeTargets({ whitenOnBlur: true })
      const found = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 200, ...WAITS })
      assert.equal(found.failed, true)
      assert.match(found.error, /rule broken after ".*blur.*": page-stays-dark: the page color rgb\(255, 255, 255\) is not dark/)
      assert.equal(found.sequence.length, 1, found.sequence.join(' | '))
      assert.match(found.sequence[0], /blur/)
    })

    it('the same seed with the page left dark passes', async () => {
      const { openTarget } = fakeTargets()
      assert.equal((await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 100, ...WAITS })).failed, false)
    })
  })

  describe('a rule that depends on the kind of action', () => {
    it('is told the kind: a Tab that turns the pad to letters fails the run, shrunk to the one Tab', async () => {
      const { openTarget } = fakeTargets({ lettersOnTab: true })
      const found = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 300, ...WAITS })
      assert.equal(found.failed, true)
      assert.match(found.error, /rule broken after "press Tab": tab-not-letters: Tab switched the number pad to letters/)
      assert.deepEqual(found.sequence, ['press Tab'])
    })
  })

  describe('a rule that reads the step before', () => {
    it('is told it: a redo that does not restore the page after an undo fails the run, shrunk to the undo and the redo', async () => {
      const { openTarget } = fakeTargets({ lettersOnRedo: true })
      const found = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 600, ...WAITS })
      assert.equal(found.failed, true)
      assert.match(found.error, /rule broken after "redo": undo-redo-restores: letterMode was false and is now true/)
      assert.deepEqual(found.sequence, ['undo', 'redo'])
    })
  })

  describe('where a broken rule is read', () => {
    it('a rule broken only after a wait is caught by the read after the last action', async () => {
      const { openTarget } = fakeTargets({ whitenOnWait: true })
      const found = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 200, landMs: 1, settleMs: 0 })
      assert.equal(found.failed, true)
      assert.match(found.error, /rule broken after the last action: page-stays-dark/)
    })

    it('each rule compares an action with the snapshot just before it, not the one at the start of the list', async () => {
      // Letters from a blur on are no Tab's doing: a Tab after it sees letters before and after.
      const { openTarget, targets } = fakeTargets({ lettersOnBlur: true })
      const result = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 300, ...WAITS })
      assert.equal(result.failed, false, result.error)
      // The case the title names was built: some list has a blur followed later by a Tab.
      assert.ok(targets.some((t) => { const i = t.log.findIndex(([n]) => n === 'blurFocus'); return i >= 0 && t.log.slice(i).some(([n, k]) => n === 'keyboard.press' && k === 'Tab') }), 'a list with a blur and a later Tab was run')
    })
  })

  describe('where a late error is read', () => {
    it('with no wait after an action, the wait after the last action still catches it', async () => {
      const { openTarget } = fakeTargets({ plantEscapeError: true })
      const result = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 200, landMs: 1, settleMs: 0 })
      assert.equal(result.failed, true)
      assert.match(result.error, /crash signal after the last action: /)
    })

    it('with no wait at all, the late error is never read', async () => {
      const { openTarget } = fakeTargets({ plantEscapeError: true })
      const result = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 100, landMs: 0, settleMs: 0 })
      assert.equal(result.failed, false)
    })
  })

  it('a log that cannot be read is said so, never reported as empty', async () => {
    const { openTarget } = fakeTargets({ plantEscapeError: true })
    const unreadable = async () => ({ ...await openTarget(), errorLog: async () => { throw new Error('storage blocked') } })
    const result = await runFuzz({ openTarget: unreadable, puzzles: PUZZLES, seed: SEED, runs: 200, ...WAITS })
    assert.deepEqual(result.errorLog, ['the error log could not be read: storage blocked'])
  })
})
