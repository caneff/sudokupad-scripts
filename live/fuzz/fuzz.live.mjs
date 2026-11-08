// Live proof that fast-check can drive real SudokuPad (docs/research/ui-fuzz-tools.md, #590): with all six scripts
// injected, a deliberately planted rule ("no more than 2 digits entered") is found by a random click / type / undo
// sequence, shrunk to the shortest sequence that still fails, and replayed exactly from the numbers the run prints.
// The runner is `fuzz.mjs`; `run.mjs` is the command line it prints as the replay.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
import { fuzz } from './fuzz.mjs'

const run = promisify(execFile)

const PLANTED_LIMIT = 2
const SEED = 1
// Four digits in four different cells, each needing its own click: the least that breaks "no more than 2".
const MINIMUM = 2 * (PLANTED_LIMIT + 1)

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('fast-check on SudokuPad', { concurrency: false }, () => {
  let found

  it('finds the planted failure and shrinks it to the shortest sequence, with seed, path and a replay command', async () => {
    found = await fuzz({ browser, seed: SEED, plantedLimit: PLANTED_LIMIT })
    assert.equal(found.failed, true, 'the planted rule failed')
    assert.equal(found.sequence.length, MINIMUM, `shrunk to ${MINIMUM} steps: ${found.sequence.join(' | ')}`)
    assert.ok(!found.sequence.some((s) => /^undo/.test(s)), 'no undo is needed to break the rule')
    assert.equal(found.seed, SEED)
    assert.match(found.path, /^[\d:]+$/)
    assert.match(found.replayCommand, /node live\/fuzz\/run\.mjs .*--seed 1 .*--path /)
  })

  it('the printed replay command reproduces the same sequence and failure', async () => {
    const [bin, ...args] = found.replayCommand.split(' ')
    const { stdout } = await run(bin, args, { cwd: new URL('../../', import.meta.url), timeout: 120000 }).catch((e) => e.code === 1 ? e : Promise.reject(e))
    assert.match(stdout, /^failed: true$/m)
    assert.equal(/^sequence: (.*)$/m.exec(stdout)[1], found.sequence.join(' | '))
  })

  it('without the planted rule the same seed passes', async () => {
    const clean = await fuzz({ browser, seed: SEED })
    assert.equal(clean.failed, false, clean.error)
  })
})
