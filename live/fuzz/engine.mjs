// The fuzz engine: fast-check generates action lists (`actions.mjs`), each list runs on a page of its own, the crash signals and the rules (`rules.mjs`) are
// read after every action and once more 200 ms after the last, and a failing list is shrunk and reported with the numbers that replay it. It knows no browser: the
// page comes from `openTarget(puzzle)` (`fuzz.mjs` opens real SudokuPad, `fake-target.mjs` a fake one for the unit tests); the puzzle is part of each
// generated list (`actions.mjs`, #679). Not a check itself.
import fc from 'fast-check'
import { actionList } from './actions.mjs'
import { ruleViolations } from './rules.mjs'
import { crashSignals } from './signals.mjs'

// fast-check issue #462: errors can land after the last action returns, so the property waits this long and then reads them, inside the same
// property, so a late error still fails and still shrinks.
const ERRORS_LAND_MS = 200
// And after every action, this long before its signals are read, so an error that lands a moment later (a timer, a frame) is blamed on the action that
// caused it. fast-check never removes the last action of a list in a shrink, so an error read only after the list would keep one stray step.
const ACTION_SETTLE_MS = 40
// A list that waits less than this after an action reads the page again after this long before it blames the action for a broken rule or a crash signal (#725): the first read
// came before the page settled, and only what is still wrong after it is the action's.
const RECHECK_SETTLE_MS = 40
// No number of runs: the time limit or `runs` ends the hunt.
const UNBOUNDED = 1000000
const DEFAULT_MINUTES = 2
// A busy start's step in the shape fast-check's own list entries have (`cmd` is the action), so the checks read the two alike.
const asStep = (cmd) => ({ cmd, check: (model) => cmd.check(model), run: (model, real) => cmd.run(model, real), toString: () => String(cmd) })
// A failure is shrunk for at most this long; a list shrunk that far is reported as it stands.
const DEFAULT_SHRINK_MINUTES = 10

const REPLAY_PATH = /\/\*replayPath="([^"]*)"\*\//
// The steps a printed list holds, in order: a busy start's steps (`(start) ...`) and then the actions'. fast-check prints them joined by commas, so no step holds one.
const stepsOf = (shown) => shown.replace(REPLAY_PATH, '').trim().split(',').filter((step) => step.trim() !== '')

function assertClean (snapshot, when) {
  const signals = crashSignals(snapshot)
  if (signals.length) throw new Error(`${signals.length === 1 ? 'crash signal' : 'crash signals'} ${when}: ${signals.join('; ')}`)
}

function assertRules (now, before, action, when, earlier) {
  const broken = ruleViolations({ now, before, action, earlier })
  if (broken.length) throw new Error(`${broken.length === 1 ? 'rule broken' : 'rules broken'} ${when}: ${broken.join('; ')}`)
}

// Runs one generated list on a page of its own. A page is never reused between runs: Restart empties the replay but leaves the earlier digits
// behind Undo, which would make a run depend on the runs before it and break replay (docs/research/ui-fuzz-tools.md).
async function runList (openTarget, actions, landMs, settleMs) {
  const target = await openTarget()
  try {
    let before = await target.snapshot()
    // The step before the current one, for a rule that reads two steps (undo, then redo).
    let earlier = null
    // The snapshot after an action, read again after a short settle when the first read finds fault and the list does not wait for the page.
    const read = async (action, now) => {
      if (settleMs >= RECHECK_SETTLE_MS || (crashSignals(now).length === 0 && ruleViolations({ now, before, action: action.cmd.kind, earlier }).length === 0)) return now
      await target.wait(RECHECK_SETTLE_MS)
      return target.snapshot()
    }
    const checked = (action) => ({
      check: (model) => action.check(model),
      toString: () => action.toString(),
      async run (model, real) {
        await action.run(model, real)
        await target.wait(settleMs)
        const now = await read(action, await target.snapshot())
        assertClean(now, `after "${action}"`)
        assertRules(now, before, action.cmd.kind, `after "${action}"`, earlier)
        earlier = { action: action.cmd.kind, before, earlier: earlier && { action: earlier.action, before: earlier.before } }
        before = now
      }
    })
    await fc.asyncModelRun(() => ({ model: { selected: false }, real: { env: target.env } }), [...actions].map(checked))
    await target.wait(landMs)
    const last = await target.snapshot()
    assertClean(last, 'after the last action')
    assertRules(last, before, 'wait', 'after the last action', earlier)
  } catch (error) {
    // A log that cannot be read is said so: an empty answer would read as a page with nothing logged.
    error.errorLog = await target.errorLog().catch((e) => [`the error log could not be read: ${e.message}`])
    throw error
  } finally {
    await target.close()
  }
}

// Runs a list written by hand (`scriptedList` of `actions.mjs`) on a page of its own for `puzzle`, with the checks of every fuzz run; throws what a failing run throws.
export const runScript = ({ openTarget, puzzle, actions }) => runList(() => openTarget(puzzle), actions, ERRORS_LAND_MS, ACTION_SETTLE_MS)

// Fuzzes with `seed` over `puzzles` (each list picks one): until `minutes` pass or `runs` lists have run, then, on a failure, shrinks it for at
// most `shrinkMinutes`. `path` and `replayPath` replay one failure, with no hunt and no shrink. `focus` (script files, `actionList`) raises those scripts' actions; a replay needs the focus it was found with. `busyStart` (`actionList`) makes some lists begin with steps that build a busy board, printed `(start) ...`; a replay needs it too. `waits` (milliseconds, `actionList`) makes each list draw its own wait after an action, reported as `waitMs`; a replay needs the same set. Returns `{ failed: false, seed, runs, huntMs, puzzleRuns }` (the lists
// each puzzle ran, by name) or the failure: `error`, `puzzle` (its name), `sequence` (readable steps, `huntedSteps` of them before the shrink), `seed`, `path`,
// `replayPath`, `errorLog` (lines) and `huntMs` (the hunt alone, shrink not counted).
export async function runFuzz ({ openTarget, puzzles, seed, runs, minutes = DEFAULT_MINUTES, shrinkMinutes = DEFAULT_SHRINK_MINUTES, path, replayPath, focus, landMs = ERRORS_LAND_MS, settleMs = ACTION_SETTLE_MS, waits, busyStart }) {
  // The puzzle of every list started, in order: the hunt's lists are the first `hunt.numRuns` (a list the time limit cut off, and the shrink's, come after).
  const started = []
  const property = fc.asyncProperty(actionList(puzzles, { replayPath, focus, waits, busyStart }), ({ puzzle, start, commands, waitMs }) => {
    started.push(puzzle.name)
    return runList(() => openTarget(puzzle), [...start.map(asStep), ...commands], landMs, waitMs ?? settleMs)
  })
  const replaying = path != null
  // A path names its run by index, so a run limit one past it replays that run alone and a failure that does not repeat ends there.
  const upTo = (p) => Number(p.split(':')[0]) + 1
  // The hunt stops at the first failure, so the time limit never cuts a shrink short. A time limit that fires before the first list has run is
  // reported by fast-check as a failure with no counterexample: that is a run that did not get to run, not a failure.
  const huntStarted = Date.now()
  const hunt = await fc.check(property, { seed, numRuns: replaying ? upTo(path) : runs ?? UNBOUNDED, path, endOnFailure: true, interruptAfterTimeLimit: replaying ? undefined : minutes * 60000, verbose: 0 })
  const huntMs = Date.now() - huntStarted
  const huntRuns = Object.fromEntries(puzzles.map((p) => [p.name, started.slice(0, hunt.numRuns).filter((n) => n === p.name).length]))
  if (!hunt.failed || hunt.counterexample === null) return { failed: false, seed: hunt.seed, runs: hunt.numRuns, huntMs, puzzleRuns: huntRuns }
  let found = hunt
  if (!replaying) {
    // The same run again, from its index alone, this time shrinking; a failure that does not repeat leaves the hunt's own.
    const shrunk = await fc.check(property, { seed, numRuns: upTo(hunt.counterexamplePath), path: hunt.counterexamplePath.split(':')[0], interruptAfterTimeLimit: shrinkMinutes * 60000, verbose: 0 })
    if (shrunk.failed && shrunk.counterexample !== null) found = shrunk
  }
  // fast-check prints the list as `a,b,c /*replayPath="..."*/`, so no step holds a comma.
  const shown = String(found.counterexample[0])
  return {
    failed: true,
    puzzle: found.counterexample[0].puzzle.name,
    waitMs: found.counterexample[0].waitMs,
    error: String(found.errorInstance?.message ?? found.error),
    sequence: stepsOf(shown),
    seed: found.seed,
    path: found.counterexamplePath,
    replayPath: REPLAY_PATH.exec(shown)[1],
    errorLog: found.errorInstance?.errorLog ?? [],
    runs: hunt.numRuns,
    huntMs,
    puzzleRuns: huntRuns,
    huntedSteps: stepsOf(String(hunt.counterexample[0])).length
  }
}
