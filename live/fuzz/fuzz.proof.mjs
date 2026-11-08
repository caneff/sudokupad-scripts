// Proof that fast-check can drive real SudokuPad (docs/research/ui-fuzz-tools.md, #590): with all six scripts injected,
// a deliberately planted rule ("no more than 2 digits entered") is found by a random click / type / undo sequence,
// shrunk to the shortest sequence that still fails, and replayed exactly from the numbers the run prints. A planted
// page error thrown after the last command is found and shrunk the same way. It takes about five minutes, nearly all of it
// shrinking, so `npm run test:fuzz` runs it and `npm run test:live` does not.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
import { fuzz } from './fuzz.mjs'

const run = promisify(execFile)

const PLANTED_LIMIT = 2
const SEED = 1
// Three digits in three different cells, each needing its own click: the least that breaks "no more than 2".
const MINIMUM = 2 * (PLANTED_LIMIT + 1)
const PLANTED_RULE = /^planted rule broken: 3 digits entered/

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// Runs a printed replay command and returns what it printed; exit 1 is the failure it replays.
const replay = async (command) => {
  const [bin, ...args] = command.split(' ')
  const { stdout } = await run(bin, args, { cwd: new URL('../../', import.meta.url), timeout: 120000 }).catch((e) => e.code === 1 ? e : Promise.reject(e))
  return stdout
}
const printed = (stdout, name) => new RegExp(`^${name}: (.*)$`, 'm').exec(stdout)?.[1]

describe('fast-check on SudokuPad', { concurrency: false }, () => {
  let found

  it('finds the planted failure and shrinks it to the shortest sequence, with seed, path and a replay command', async () => {
    found = await fuzz({ browser, seed: SEED, plantedLimit: PLANTED_LIMIT })
    assert.equal(found.failed, true, 'the planted rule failed')
    assert.match(found.error, PLANTED_RULE)
    assert.equal(found.sequence.length, MINIMUM, `shrunk to ${MINIMUM} steps: ${found.sequence.join(' | ')}`)
    assert.ok(!found.sequence.some((s) => /^undo/.test(s)), 'no undo is needed to break the rule')
    assert.equal(found.sequence.at(-1), 'type 1', 'the last step has no stray text')
    assert.equal(found.seed, SEED)
    assert.match(found.path, /^[\d:]+$/)
    assert.match(found.replayCommand, /node live\/fuzz\/run\.mjs .*--seed 1 .*--path /)
  })

  it('the printed replay command reproduces the same sequence and failure', async () => {
    const stdout = await replay(found.replayCommand)
    assert.equal(printed(stdout, 'failed'), 'true')
    assert.equal(printed(stdout, 'sequence'), found.sequence.join(' | '))
    assert.equal(printed(stdout, 'error'), found.error)
  })

  it('without the planted rule the same seed passes', async () => {
    const clean = await fuzz({ browser, seed: SEED })
    assert.equal(clean.failed, false, clean.error)
  })

  it('finds a page error that lands after the last command, and shrinks it', async () => {
    const late = await fuzz({ browser, seed: SEED, lateError: true })
    assert.equal(late.failed, true, 'the late error failed the property')
    assert.match(late.error, /^page errors: .*planted late error/)
    assert.ok(late.sequence.length <= 2, `shrunk to at most two steps: ${late.sequence.join(' | ')}`)
  })
})
