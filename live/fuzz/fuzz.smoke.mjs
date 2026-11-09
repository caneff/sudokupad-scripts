// The fuzz's live test (`npm run test:fuzz:smoke`, #593): on real SudokuPad with every script installed, every puzzle of the set opens once and passes a few steps (#679),
// a short run with a fixed seed passes, and a page error planted to fire when Escape interrupts a drag is caught, shrunk to the one interrupted step and replayed
// from the command it prints. Not a
// `*.live.mjs`, so `npm run test:live` skips it, and not in `npm test`: the random run itself is `npm run test:fuzz`.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { useBrowser } from '../session.mjs'
import { fuzz, fuzzScripted, openTarget } from './fuzz.mjs'
import { readPageState } from './page-state.mjs'
import { plantById } from './plants.mjs'
import { FUZZ_PUZZLES, puzzleByName } from './puzzle-set.mjs'

const run = promisify(execFile)
const PASSING_SEEDS = [2, 3]
const PLANTED_SEED = 3
// The seed the planted Tab bug is caught on.
const TAB_PLANT_SEED = 4
const ROOT = new URL('../../', import.meta.url)
const INTERRUPTED_BY_ESCAPE = /^(?:pen drag|right-click erase held|note drag).* then Escape then release$/

const browser = useBrowser()

describe('the fuzz on SudokuPad', { concurrency: false }, () => {
  // Every puzzle opens once, on the page the fuzz uses, with the puzzle set's free cells matching the page's, and takes a click, a digit and an undo with no rule
  // broken and no crash signal.
  for (const puzzle of FUZZ_PUZZLES) {
    it(`the ${puzzle.name} puzzle opens and takes a click, a digit key and an undo`, async () => {
      await fuzzScripted({ browser: browser(), puzzle, steps: [['click cell', 0], ['type digit', puzzle.keys[0]], ['undo', null]] })
    })
  }

  it('a click on every cell around the outside-clues grid stays on the page, though SudokuPad\'s own links sit over a corner of it', async () => {
    const puzzle = puzzleByName('outside clues 9x9')
    const steps = puzzle.cells.flatMap(([r, c], i) => (r < 0 || c < 0 || r >= puzzle.rows || c >= puzzle.cols ? [['enter digit', [i, '1']]] : []))
    assert.ok(steps.length > 30, `${steps.length} margin targets`)
    await fuzzScripted({ browser: browser(), puzzle, steps })
  })

  it('a page that does not show the puzzle set\'s free cells is refused, not fuzzed on the wrong cells', async () => {
    const wrong = { ...puzzleByName('4x4'), free: [[0, 1]] }
    await assert.rejects(openTarget(browser(), wrong, {}), /opened with \d+ free cells that are not the 1 of puzzle-set\.mjs/)
  })

  it('a puzzle that has rules text but shows no pane is a failure, and one with no rules text is read with no pane', async () => {
    const target = await openTarget(browser(), puzzleByName('4x4'), {})
    try {
      await assert.rejects(readPageState(target.env.page, { expectRules: true }), /rules pane is not shown/)
      assert.equal((await readPageState(target.env.page, { expectRules: false })).rulesPane, null)
    } finally {
      await target.close()
    }
  })

  for (const seed of PASSING_SEEDS) {
    it(`a short run with seed ${seed} passes, each list on the puzzle it names`, async () => {
      const result = await fuzz({ browser: browser(), seed, runs: 6 })
      assert.equal(result.failed, false, `${result.error}\n${result.sequence?.join('\n')}`)
      assert.equal(result.runs, 6)
      assert.equal(Object.values(result.puzzleRuns).reduce((a, b) => a + b, 0), 6)
    })
  }

  it('a bug planted in a script is injected in its place: caught, shrunk to the Tab and printed with the plant to replay', async () => {
    const plant = plantById('tab-turns-pad-to-letters')
    const result = await fuzz({ browser: browser(), seed: TAB_PLANT_SEED, runs: 150, plant, shrinkMinutes: 5 })
    assert.equal(result.failed, true, 'the planted bug failed the run')
    assert.match(result.error, plant.expect)
    assert.deepEqual(result.sequence, ['press Tab'])
    assert.match(result.replayCommand, / --plant tab-turns-pad-to-letters$/)
    assert.equal((await fuzz({ browser: browser(), seed: TAB_PLANT_SEED, runs: 20 })).failed, false, 'the same seed on the shipped script passes')
  })

  it('a note open for typing at a reload is kept (#668): the recorded failing list passes', async () => {
    // note "15" at r1c3, click r1c4, type 1, reload: the note typed in is open when the page reloads, and save-as-you-type brings it back.
    const puzzle = puzzleByName('recorded 9x9')
    const at = (row, col) => puzzle.cells.findIndex(([r, c]) => r === row && c === col)
    await fuzzScripted({ browser: browser(), puzzle, steps: [['place note', [0, at(0, 2)]], ['click cell', at(0, 3)], ['type digit', '1'], ['reload', null]] })
  })

  describe('a page error planted on Escape during a drag', () => {
    let found

    it('is caught, shrunk to the one interrupted step, and printed with the seed and a replay command', async () => {
      found = await fuzz({ browser: browser(), seed: PLANTED_SEED, runs: 150, planted: true, shrinkMinutes: 5 })
      assert.equal(found.failed, true, 'the planted error failed the run')
      assert.match(found.error, /crash signal after .*Escape.*: page error or console error: .*planted page error/)
      assert.equal(found.sequence.length, 1, found.sequence.join(' | '))
      assert.match(found.sequence[0], INTERRUPTED_BY_ESCAPE)
      assert.equal(found.seed, PLANTED_SEED)
      assert.match(found.replayCommand, new RegExp(`^npm run test:fuzz -- --seed ${PLANTED_SEED} --path \\S+ --plant-escape-error$`))
    })

    it('the printed replay command reproduces the same step and error', async () => {
      const [bin, ...args] = found.replayCommand.split(' ')
      const { stdout } = await run(bin, args, { cwd: ROOT, timeout: 120000 }).catch((e) => e.code === 1 ? e : Promise.reject(e))
      assert.match(stdout, /^fuzz FAILED /m)
      assert.ok(stdout.includes(`error: ${found.error}`), stdout)
      assert.ok(stdout.includes(`  1. ${found.sequence[0]}\n`), stdout)
    })

    it('the exact shrunk list, replayed without the planted error, passes', async () => {
      const replayed = await fuzz({ browser: browser(), seed: found.seed, path: found.path })
      assert.equal(replayed.failed, false, `${replayed.error}\n${replayed.sequence?.join('\n')}`)
    })
  })
})
