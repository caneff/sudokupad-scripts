// A minimal fuzz runner: fast-check drives random click / type / undo sequences on real SudokuPad (the recorded page of
// `live/page.mjs`, all six scripts injected after Start Puzzle), shrinks a failing sequence and replays it from the
// numbers it prints. Not a check itself, so `live/**/*.live.mjs` skips it; `fuzz.live.mjs` is the proof and `run.mjs`
// the replay's command line. What worked and what did not is in docs/research/ui-fuzz-tools.md.
import { readdirSync, readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import fc from 'fast-check'
import { captureConsoleErrors, openPage, startPuzzle } from '../page.mjs'
import { cellCentre } from '../pen.mjs'

// fast-check issue #462: errors can land after the last command returns, so the property waits this long and then reads them.
const ERRORS_LAND_MS = 200
const RUNS = 25
const MAX_COMMANDS = 20
const ROOT = new URL('../../', import.meta.url)

const scriptSources = () => readdirSync(ROOT).filter((f) => f.endsWith('.user.js')).sort().map((f) => readFileSync(new URL(f, ROOT), 'utf8'))

// A page of its own for one run: SudokuPad past Start Puzzle with every script in, and the cells a digit can go in. A page
// is never reused between runs: `restartPuzzle` empties the replay but leaves the earlier digits behind Undo (the second
// Undo after it brings them back), which would make a run depend on the runs before it and break replay.
async function openFuzzPage (browser) {
  const { context, p, errors } = await openPage(browser, { seed: captureConsoleErrors })
  await startPuzzle(p)
  for (const content of scriptSources()) await p.addScriptTag({ content })
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

// Runs one generated sequence on a page of its own. After every command the planted rule (when there is one) is read from the page.
async function runSequence ({ browser, plantedLimit, target }, cmds) {
  const { context, p, errors } = await openFuzzPage(browser)
  target.p = p
  try {
    await runOn({ p, errors, plantedLimit }, cmds)
  } finally {
    await context.close()
  }
}

async function runOn ({ p, errors, plantedLimit }, cmds) {
  const plant = (command) => ({
    check: (m) => command.check(m),
    toString: () => command.toString(),
    async run (model, real) {
      await command.run(model, real)
      if (plantedLimit == null) return
      const n = await enteredCount(p)
      if (n > plantedLimit) throw new Error(`planted rule broken: ${n} digits entered, no more than ${plantedLimit} allowed`)
    }
  })
  await fc.asyncModelRun(() => ({ model: { selected: false }, real: {} }), [...cmds].map(plant))
  await sleep(ERRORS_LAND_MS)
  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`)
}

const REPLAY_PATH = /\/\*replayPath="([^"]*)"\*\//

// The report of a run: `failed`, then on a failure the shrunk `sequence` (command names), `seed`, `path`,
// `replayPath` and the `replayCommand` that reproduces it.
// Options: `seed`; `plantedLimit` (the planted rule, none when absent); `path` and `replayPath` to replay a failure.
export async function fuzz ({ browser, seed, plantedLimit, path, replayPath }) {
  const first = await openFuzzPage(browser)
  const cells = first.cells
  await first.context.close()
  const target = { p: null }
  const commands = fc.commands(commandsFor({ target, cells }), { maxCommands: MAX_COMMANDS, size: 'max', replayPath })
  const details = await fc.check(fc.asyncProperty(commands, (cmds) => runSequence({ browser, plantedLimit, target }, cmds)), {
    seed, numRuns: RUNS, path, endOnFailure: path != null, verbose: 0
  })
  if (!details.failed) return { failed: false, seed: details.seed }
  const shown = String(details.counterexample[0])
  const replay = REPLAY_PATH.exec(shown)[1]
  const flags = [plantedLimit != null ? `--planted ${plantedLimit}` : '', `--seed ${details.seed}`, `--path ${details.counterexamplePath}`, `--replay-path ${replay}`]
  return {
    failed: true,
    error: String(details.errorInstance?.message ?? details.error),
    sequence: shown.replace(REPLAY_PATH, '').replace(/^\[|\]$/g, '').split(','),
    seed: details.seed,
    path: details.counterexamplePath,
    replayPath: replay,
    replayCommand: `node live/fuzz/run.mjs ${flags.filter(Boolean).join(' ')}`
  }
}
