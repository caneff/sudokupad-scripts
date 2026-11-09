// The fuzz's live test (`npm run test:fuzz:smoke`, #593): on real SudokuPad with every script installed, a short run with a fixed seed passes, and a page
// error planted to fire when Escape interrupts a drag is caught, shrunk to the one interrupted step and replayed from the command it prints. Not a
// `*.live.mjs`, so `npm run test:live` skips it, and not in `npm test`: the random run itself is `npm run test:fuzz`.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
import { fuzz, PUZZLES, puzzleFor } from './fuzz.mjs'

const run = promisify(execFile)
// Seeds 2 and 3 pick the 9x9 and the 6x6 (the seed picks the puzzle).
const PASSING_SEEDS = [2, 3]
const PLANTED_SEED = 3
const ROOT = new URL('../../', import.meta.url)
const INTERRUPTED_BY_ESCAPE = /^(?:pen drag|right-click erase held|note drag).* then Escape then release$/

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('the fuzz on SudokuPad', { concurrency: false }, () => {
  it('the seed picks the puzzle, and both puzzles are in use', () => {
    assert.deepEqual(PASSING_SEEDS.map((s) => puzzleFor(s).name), PUZZLES.map((p) => p.name))
  })

  for (const seed of PASSING_SEEDS) {
    it(`a short run with seed ${seed} passes on the ${puzzleFor(seed).name} puzzle`, async () => {
      const result = await fuzz({ browser, seed, runs: 6 })
      assert.equal(result.failed, false, `${result.error}\n${result.sequence?.join('\n')}`)
      assert.equal(result.runs, 6)
    })
  }

  it('a note open for typing at a reload is kept (#668): the recorded failing list passes', async () => {
    // note "15" at r1c3, click r1c4, type 1, reload: the note typed in is open when the page reloads, and save-as-you-type brings it back.
    const result = await fuzz({ browser, seed: 99196424, path: '424:2:2:4:5:5:6:5:5:5:5:5:6@KBy:F' })
    assert.equal(result.failed, false, `${result.error}\n${result.sequence?.join('\n')}`)
  })

  describe('a page error planted on Escape during a drag', () => {
    let found

    it('is caught, shrunk to the one interrupted step, and printed with the seed and a replay command', async () => {
      found = await fuzz({ browser, seed: PLANTED_SEED, runs: 150, planted: true, shrinkMinutes: 5 })
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

    it('the same seed without the planted error passes', async () => {
      assert.equal((await fuzz({ browser, seed: PLANTED_SEED, runs: 20 })).failed, false)
    })
  })
})
