// A minimal fuzz runner: fast-check drives random click / type / undo sequences on real SudokuPad (the recorded page of
// `live/page.mjs`, all six scripts injected after Start Puzzle), shrinks a failing sequence and replays it from the
// numbers it prints. Not a check itself. What worked and what did not is in docs/research/ui-fuzz-tools.md.
import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import fc from 'fast-check'
import { captureConsoleErrors, openPage, startPuzzle } from '../page.mjs'
import { cellCentre } from '../pen.mjs'
import { SCRIPTS } from '../scripts.mjs'

// fast-check issue #462: errors can land after the last command returns, so the property waits this long and then reads them.
const ERRORS_LAND_MS = 200
// A planted late error is thrown on a timer this far after the command, inside the wait above.
const LATE_ERROR_MS = 50
const RUNS = 25
const MAX_COMMANDS = 20

// A page of its own for one run: SudokuPad past Start Puzzle with every script in, and the cells a digit can go in. A page
// is never reused between runs: `restartPuzzle` empties the replay but leaves the earlier digits behind Undo (the second
// Undo after it brings them back), which would make a run depend on the runs before it and break replay.
async function openFuzzPage (browser) {
  const { context, p, errors } = await openPage(browser, { seed: captureConsoleErrors })
  await startPuzzle(p)
  for (const { file } of SCRIPTS) await p.addScriptTag({ content: readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8') })
  await p.locator('#control-colorbydigit').waitFor({ state: 'attached' })
  await p.locator('#control-draw').waitFor({ state: 'attached' })
  const cells = await p.evaluate(() => Framework.app.puzzle.cells.filter((c) => !c.given).map((c) => [c.row, c.col]))
  return { context, p, errors, cells }
}

// The digits the player has entered: cells that are not givens and hold a value.
const enteredCount = (p) => p.evaluate(() => Framework.app.puzzle.cells.filter((c) => !c.given && c.value).length)

// The commands, each a precondition on the model (`check`) and an action on the page (`run`). The model only knows
// whether a cell is selected; what the page holds is read from the page.
const commandsFor = ({ target, cells }) => {
  const click = (i) => ({
    check: () => true,
    toString: () => `click r${cells[i][0] + 1}c${cells[i][1] + 1}`,
    async run (model) {
      const [x, y] = await cellCentre(target.p, ...cells[i])
      await target.p.mouse.click(x, y)
      model.selected = true
    }
  })
  const type = (d) => ({
    check: (model) => model.selected,
    toString: () => `type ${d}`,
    run: () => target.p.keyboard.press(String(d))
  })
  const undo = () => ({
    check: () => true,
    toString: () => 'undo',
    run: () => target.p.click('#control-undo')
  })
  return [
    fc.nat(cells.length - 1).map(click),
    fc.integer({ min: 1, max: 9 }).map(type),
    fc.constant(undo())
  ]
}

// Runs one generated sequence on a page of its own. After every command the planted rule is read from the page, and
// a planted late error is thrown on a timer.
async function runSequence ({ browser, plantedLimit, lateError, target }, cmds) {
  const { context, p, errors } = await openFuzzPage(browser)
  target.p = p
  try {
    const plant = (command) => ({
      check: (m) => command.check(m),
      toString: () => command.toString(),
      async run (model, real) {
        await command.run(model, real)
        if (lateError) await p.evaluate((ms) => setTimeout(() => { throw new Error('planted late error') }, ms), LATE_ERROR_MS)
        if (plantedLimit == null) return
        const n = await enteredCount(p)
        if (n > plantedLimit) throw new Error(`planted rule broken: ${n} digits entered, no more than ${plantedLimit} allowed`)
      }
    })
    await fc.asyncModelRun(() => ({ model: { selected: false }, real: {} }), [...cmds].map(plant))
    await sleep(ERRORS_LAND_MS)
    if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`)
  } finally {
    await context.close()
  }
}

const REPLAY_PATH = /\/\*replayPath="([^"]*)"\*\//

// Fuzzes with `seed`. `plantedLimit` plants the rule "no more than that many digits entered", `lateError` a page error
// thrown after each command returns; `path` and `replayPath` replay a failure.
export async function fuzz ({ browser, seed, plantedLimit, lateError, path, replayPath }) {
  const first = await openFuzzPage(browser)
  const cells = first.cells
  await first.context.close()
  const target = { p: null }
  const commands = fc.commands(commandsFor({ target, cells }), { maxCommands: MAX_COMMANDS, size: 'max', replayPath })
  const details = await fc.check(fc.asyncProperty(commands, (cmds) => runSequence({ browser, plantedLimit, lateError, target }, cmds)), {
    seed, numRuns: RUNS, path, endOnFailure: path != null, verbose: 0
  })
  if (!details.failed) return { failed: false, seed: details.seed }
  // fast-check prints the commands as `a,b,c /*replayPath="..."*/`, so command names hold no comma.
  const shown = String(details.counterexample[0])
  const replay = REPLAY_PATH.exec(shown)[1]
  const flags = [plantedLimit != null ? `--planted ${plantedLimit}` : '', lateError ? '--late-error' : '', `--seed ${details.seed}`, `--path ${details.counterexamplePath}`, `--replay-path ${replay}`]
  return {
    failed: true,
    error: String(details.errorInstance?.message ?? details.error),
    sequence: shown.replace(REPLAY_PATH, '').trim().split(','),
    seed: details.seed,
    path: details.counterexamplePath,
    replayPath: replay,
    replayCommand: `node live/fuzz/run.mjs ${flags.filter(Boolean).join(' ')}`
  }
}
