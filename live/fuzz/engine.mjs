// The fuzz engine: fast-check generates action lists (`actions.mjs`), each list runs on a page of its own, the crash signals are read after every
// action and once more 200 ms after the last, and a failing list is shrunk and reported with the numbers that replay it. It knows no browser: the
// page comes from `openTarget` (`fuzz.mjs` opens real SudokuPad, `fake-target.mjs` a fake one for the unit tests). Not a check itself.
import { setTimeout as sleep } from 'node:timers/promises'
import fc from 'fast-check'
import { actionList } from './actions.mjs'
import { crashSignals } from './signals.mjs'

// fast-check issue #462: errors can land after the last action returns, so the property waits this long and then reads them, inside the same
// property, so a late error still fails and still shrinks.
export const ERRORS_LAND_MS = 200
// And after every action, this long before its signals are read, so an error that lands a moment later (a timer, a frame) is blamed on the action that
// caused it. fast-check never removes the last action of a list in a shrink, so an error read only after the list would keep one stray step.
export const ACTION_SETTLE_MS = 40
// No number of runs: the time limit or `runs` ends the hunt.
const UNBOUNDED = 1000000
export const DEFAULT_MINUTES = 2
// A failure is shrunk for at most this long; a list shrunk that far is reported as it stands.
export const DEFAULT_SHRINK_MINUTES = 10

const REPLAY_PATH = /\/\*replayPath="([^"]*)"\*\//

// Throws when the snapshot holds a crash signal; `when` says after which action.
function assertClean (snapshot, when) {
  const signals = crashSignals(snapshot)
  if (signals.length) throw new Error(`${signals.length === 1 ? 'crash signal' : 'crash signals'} ${when}: ${signals.join('; ')}`)
}

// Runs one generated list on a page of its own. A page is never reused between runs: Restart empties the replay but leaves the earlier digits
// behind Undo, which would make a run depend on the runs before it and break replay (docs/research/ui-fuzz-tools.md).
async function runList (openTarget, actions, landMs, settleMs) {
  const target = await openTarget()
  try {
    const checked = (action) => ({
      check: (model) => action.check(model),
      toString: () => action.toString(),
      async run (model, real) {
        await action.run(model, real)
        await sleep(settleMs)
        assertClean(await target.snapshot(), `after "${action}"`)
      }
    })
    await fc.asyncModelRun(() => ({ model: { selected: false }, real: { env: target.env } }), [...actions].map(checked))
    await sleep(landMs)
    assertClean(await target.snapshot(), 'after the last action')
  } catch (error) {
    error.errorLog = await target.errorLog?.().catch(() => []) ?? []
    throw error
  } finally {
    await target.close()
  }
}

// Fuzzes with `seed` over a puzzle whose free cells are `cells`: until `minutes` pass or `runs` lists have run, then, on a failure, shrinks it for at
// most `shrinkMinutes`. `path` and `replayPath` replay one failure, with no hunt and no shrink. Returns `{ failed: false, seed, runs }` or the
// failure: `error`, `sequence` (readable steps), `seed`, `path`, `replayPath` and `errorLog` (the newest shared error log records of the failing page).
export async function runFuzz ({ openTarget, cells, seed, runs, minutes = DEFAULT_MINUTES, shrinkMinutes = DEFAULT_SHRINK_MINUTES, path, replayPath, maxCommands, landMs = ERRORS_LAND_MS, settleMs = ACTION_SETTLE_MS }) {
  const property = fc.asyncProperty(actionList(cells, { maxCommands, replayPath }), (actions) => runList(openTarget, actions, landMs, settleMs))
  const replaying = path != null
  // The hunt stops at the first failure, so the time limit never cuts a shrink short.
  const hunt = await fc.check(property, { seed, numRuns: runs ?? UNBOUNDED, path, endOnFailure: true, interruptAfterTimeLimit: replaying ? undefined : minutes * 60000, verbose: 0 })
  if (!hunt.failed) return { failed: false, seed: hunt.seed, runs: hunt.numRuns }
  let found = hunt
  if (!replaying) {
    // The same run again, from its index alone, this time shrinking; a failure that does not repeat leaves the hunt's own.
    const shrunk = await fc.check(property, { seed, numRuns: UNBOUNDED, path: hunt.counterexamplePath.split(':')[0], interruptAfterTimeLimit: shrinkMinutes * 60000, verbose: 0 })
    if (shrunk.failed) found = shrunk
  }
  // fast-check prints the list as `a,b,c /*replayPath="..."*/`, so no step holds a comma.
  const shown = String(found.counterexample[0])
  return {
    failed: true,
    error: String(found.errorInstance?.message ?? found.error),
    sequence: shown.replace(REPLAY_PATH, '').trim().split(','),
    seed: found.seed,
    path: found.counterexamplePath,
    replayPath: REPLAY_PATH.exec(shown)[1],
    errorLog: found.errorInstance?.errorLog ?? [],
    runs: hunt.numRuns
  }
}
