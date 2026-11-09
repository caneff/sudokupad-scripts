// The fuzz from the command line: `npm run test:fuzz`. Random action lists on real SudokuPad with every script installed, for 2 minutes by default;
// a crash signal (a skip line, a page error, a console error, the notice bar) fails the run, which is shrunk to the shortest list that still fails
// and printed with the seed and the command that replays it. Exits 1 on a failure.
//   npm run test:fuzz -- [--seed <n>] [--minutes <m>] [--runs <k>] [--path <printed path>] [--shrink-minutes <m>] [--plant-escape-error] [--plant <id>]
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { numberOption } from './cli-number.mjs'
import { fuzz } from './fuzz.mjs'
import { plantById } from './plants.mjs'

const { values } = parseArgs({
  options: { seed: { type: 'string' }, minutes: { type: 'string' }, runs: { type: 'string' }, path: { type: 'string' }, 'shrink-minutes': { type: 'string' }, 'plant-escape-error': { type: 'boolean' }, plant: { type: 'string' } }
})

const number = (name, fallback, options) => numberOption(values, name, fallback, options)

const seed = number('seed', Math.floor(Math.random() * 2 ** 31), { integer: true })
const started = Date.now()
const browser = await chromium.launch()
try {
  const r = await fuzz({
    browser,
    seed,
    runs: number('runs'),
    minutes: number('minutes'),
    shrinkMinutes: number('shrink-minutes'),
    path: values.path,
    planted: values['plant-escape-error'],
    plant: values.plant && plantById(values.plant)
  })
  const seconds = Math.round((Date.now() - started) / 1000)
  if (!r.failed) {
    console.log(`fuzz passed: ${r.runs} action lists over ${Object.keys(r.puzzleRuns).length} puzzles in ${seconds} s (seed ${r.seed})`)
    console.log(`lists per puzzle: ${Object.entries(r.puzzleRuns).map(([name, count]) => `${name} ${count}`).join(', ')}`)
  } else {
    console.log(`fuzz FAILED on the ${r.puzzle} puzzle (seed ${r.seed}) after ${seconds} s`)
    console.log(`error: ${r.error}`)
    console.log(`shrunk to ${r.sequence.length} ${r.sequence.length === 1 ? 'step' : 'steps'}:`)
    r.sequence.forEach((step, i) => console.log(`  ${i + 1}. ${step}`))
    console.log(`replay: ${r.replayCommand}`)
    if (r.errorLog.length) {
      console.log('shared error log, newest first:')
      r.errorLog.forEach((line) => console.log(`  ${line}`))
    } else {
      console.log('shared error log: empty')
    }
  }
  process.exitCode = r.failed ? 1 : 0
} finally {
  await browser.close()
}
