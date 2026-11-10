import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fc from 'fast-check'
import { actionList, MAX_START_STEPS, START_KINDS } from './actions.mjs'
import { runFuzz, strokeSinceReload } from './engine.mjs'
import { fakeTargets } from './fake-target.mjs'
import { FUZZ_PUZZLES } from './puzzle-set.mjs'

// A small fake puzzle for most tests, and the real set where the puzzle is the point.
const CELLS = Array.from({ length: 12 }, (_, i) => [Math.floor(i / 4), i % 4])
const PUZZLES = [{ name: 'fake', rows: 3, cols: 4, keys: ['1', '2', '3', '4'], free: CELLS, cells: CELLS }]
const SEED = 7
// The fake waits for nothing, and its planted error lands on the first wait of more than 0 ms.
const WAITS = { landMs: 1, settleMs: 1 }

describe('strokeSinceReload (#743)', () => {
  it('carries a stroke across key presses and any other action up to the reload, which clears it', () => {
    const afterStroke = { strokeSinceReload: strokeSinceReload('pen line', null) }
    assert.equal(afterStroke.strokeSinceReload, true)
    const afterKey = { strokeSinceReload: strokeSinceReload('tool key', afterStroke) }
    assert.equal(afterKey.strokeSinceReload, true)
    assert.equal(strokeSinceReload('reload', afterKey), false)
    assert.equal(strokeSinceReload('tool key', { strokeSinceReload: false }), false)
  })
  it('counts every action that draws or erases a stroke, and no action that draws none', () => {
    for (const kind of ['pen line', 'pen erase', 'pen drag, blur', 'pen drag, leave window', 'arrow line']) assert.equal(strokeSinceReload(kind, null), true, kind)
    for (const kind of ['pen settings', 'pen settings values', 'pen page', 'place note', 'click cell']) assert.equal(strokeSinceReload(kind, null), false, kind)
  })
})

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

  it('a focused failure replays, with the same focus, as the same list (#724)', async () => {
    const focus = ['pen-tool-extras.user.js']
    const found = await runFuzz({ openTarget: fakeTargets({ plantEscapeError: true }).openTarget, puzzles: PUZZLES, seed: SEED, runs: 200, focus, ...WAITS })
    assert.equal(found.failed, true)
    const replay = (withFocus) => runFuzz({ openTarget: fakeTargets({ plantEscapeError: true }).openTarget, puzzles: PUZZLES, seed: found.seed, path: found.path, replayPath: found.replayPath, focus: withFocus, ...WAITS })
    assert.deepEqual((await replay(focus)).sequence, found.sequence)
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

  describe('the wait between actions is part of each list (#725)', () => {
    // The wait the engine drew for a list is one of these, 40 first so a shrink that does not need the timing ends on the old fixed wait.
    const VARIED = { waits: [40, 0, 300], landMs: 1 }

    it('a planted error that needs two Tabs within 10 ms is never caught at the fixed wait', async () => {
      const { openTarget } = fakeTargets({ raceOnFastTabs: true })
      const result = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 600, landMs: 1, settleMs: 40 })
      assert.equal(result.failed, false)
    })

    describe('with the wait drawn per list', () => {
      let found

      it('catches it, blaming the Tab, and reports the 0 ms wait that exposed it', async () => {
        const { openTarget } = fakeTargets({ raceOnFastTabs: true })
        found = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 600, ...VARIED })
        assert.equal(found.failed, true)
        assert.match(found.error, /crash signal after .*: page error or console error: Error: planted race/)
        assert.equal(found.waitMs, 0)
      })

      it('shrinks to the two Tabs', () => {
        assert.deepEqual(found.sequence, ['press Tab', 'press Tab'])
      })

      it('replays from its path with the same wait, steps and error', async () => {
        const { openTarget } = fakeTargets({ raceOnFastTabs: true })
        const again = await runFuzz({ openTarget, puzzles: PUZZLES, seed: found.seed, path: found.path, replayPath: found.replayPath, ...VARIED })
        assert.equal(again.failed, true)
        assert.equal(again.waitMs, 0)
        assert.deepEqual(again.sequence, found.sequence)
        assert.equal(again.error, found.error)
      })
    })

    it('a failure that does not need the timing shrinks to the old fixed wait', async () => {
      const { openTarget } = fakeTargets({ plantEscapeError: true })
      const found = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 300, ...VARIED })
      assert.equal(found.failed, true)
      assert.equal(found.waitMs, 40)
    })

    it('every wait of the set is drawn, by lists of their own', async () => {
      const { openTarget, targets } = fakeTargets()
      await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 120, ...VARIED })
      // The wait after the first action of each list that has one, leaving out the last wait of the list, which is the landing read.
      const drawn = new Set(targets.flatMap((t) => t.waited.slice(0, -1).slice(0, 1)))
      assert.deepEqual([...drawn].sort((a, b) => a - b), [0, 40, 300])
    })

    it('a set of one wait is the fixed wait: the same lists as before, and no wait reported', async () => {
      const one = await runFuzz({ openTarget: fakeTargets({ plantEscapeError: true }).openTarget, puzzles: PUZZLES, seed: SEED, runs: 200, waits: [1], landMs: 1 })
      const fixed = await runFuzz({ openTarget: fakeTargets({ plantEscapeError: true }).openTarget, puzzles: PUZZLES, seed: SEED, runs: 200, landMs: 1, settleMs: 1 })
      assert.equal(one.waitMs, undefined)
      assert.deepEqual({ path: one.path, sequence: one.sequence }, { path: fixed.path, sequence: fixed.sequence })
    })

    it('a page that has not settled at 0 ms is read again after a short settle before a rule is blamed', async () => {
      const { openTarget } = fakeTargets({ whiteUntilWait: true })
      const result = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 100, landMs: 1, settleMs: 0 })
      assert.equal(result.failed, false, result.error)
    })

    it('a rule broken for good at 0 ms is still blamed, on the action that broke it', async () => {
      const { openTarget } = fakeTargets({ whitenOnBlur: true })
      const result = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 200, landMs: 1, settleMs: 0 })
      assert.equal(result.failed, true)
      assert.match(result.error, /rule broken after ".*blur.*": page-stays-dark/)
    })
  })

  describe('some lists start from a busy board (#726)', () => {
    const BUSY = { busyStart: true, ...WAITS }

    it('a start is drawn for some lists and none for others, printed ahead of the actions', () => {
      const lists = fc.sample(actionList(PUZZLES, { busyStart: true }), { numRuns: 200, seed: SEED })
      assert.ok(lists.some((l) => l.start.length >= 10), 'a list starts with 10 or more steps')
      assert.ok(lists.some((l) => l.start.length === 0), 'a list starts on the empty board')
      assert.ok(lists.every((l) => l.start.length <= MAX_START_STEPS))
      assert.ok(lists.every((l) => l.start.every((c) => START_KINDS.includes(c.kind))), 'a start builds, and never undoes, reloads or holds a gesture open')
      assert.ok(lists.find((l) => l.start.length > 0).toString().startsWith('(start) '))
    })

    it('with no busyStart, no list has a start', () => {
      const lists = fc.sample(actionList(PUZZLES), { numRuns: 100, seed: SEED })
      assert.ok(lists.every((l) => l.start.length === 0))
    })

    describe('a failure that needs the busy board', () => {
      let found
      it('is caught, with the start steps it needs among the shrunk steps', async () => {
        // 16 clicks do not come from the 20 actions of one list alone (none was found in 1500 lists without a start).
        const { openTarget } = fakeTargets({ errorAtClicks: 16 })
        found = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 1500, ...BUSY })
        assert.equal(found.failed, true)
        assert.ok(found.sequence.some((s) => s.startsWith('(start) ')), found.sequence.join(' | '))
      })

      it('replays from its path: the same steps, start included', async () => {
        const { openTarget } = fakeTargets({ errorAtClicks: 16 })
        const again = await runFuzz({ openTarget, puzzles: PUZZLES, seed: found.seed, path: found.path, replayPath: found.replayPath, ...BUSY })
        assert.equal(again.failed, true)
        assert.deepEqual(again.sequence, found.sequence)
      })
    })

    it('the same lists without a start never reach that failure, so the start is what finds it', async () => {
      const { openTarget } = fakeTargets({ errorAtClicks: 16 })
      assert.equal((await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 1500, ...WAITS })).failed, false)
    })

    it('a failure that does not need it shrinks to no start at all', async () => {
      const { openTarget } = fakeTargets({ plantEscapeError: true })
      const found = await runFuzz({ openTarget, puzzles: PUZZLES, seed: SEED, runs: 300, ...BUSY })
      assert.equal(found.failed, true)
      assert.deepEqual(found.sequence.filter((s) => s.startsWith('(start) ')), [])
      assert.equal(found.sequence.length, 1)
    })
  })

  it('a log that cannot be read is said so, never reported as empty', async () => {
    const { openTarget } = fakeTargets({ plantEscapeError: true })
    const unreadable = async () => ({ ...await openTarget(), errorLog: async () => { throw new Error('storage blocked') } })
    const result = await runFuzz({ openTarget: unreadable, puzzles: PUZZLES, seed: SEED, runs: 200, ...WAITS })
    assert.deepEqual(result.errorLog, ['the error log could not be read: storage blocked'])
  })
})
