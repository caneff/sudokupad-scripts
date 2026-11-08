// Runs the fuzz from the command line and prints its report; the replay command a failure prints is this file with the
// failure's numbers. Exits 1 on a failure.
//   node live/fuzz/run.mjs [--planted <limit>] [--late-error] [--seed <n>] [--path <p> --replay-path <r>]
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { fuzz } from './fuzz.mjs'

const { values } = parseArgs({ options: { planted: { type: 'string' }, 'late-error': { type: 'boolean' }, seed: { type: 'string' }, path: { type: 'string' }, 'replay-path': { type: 'string' } } })

// A number option, or undefined when absent; a value that is not a number stops the run, since NaN would switch the rule off.
const number = (name) => {
  if (values[name] == null) return undefined
  const n = Number(values[name])
  if (Number.isNaN(n)) throw new Error(`--${name} needs a number, got "${values[name]}"`)
  return n
}

const browser = await chromium.launch()
try {
  const r = await fuzz({
    browser,
    seed: number('seed'),
    plantedLimit: number('planted'),
    lateError: values['late-error'],
    path: values.path,
    replayPath: values['replay-path']
  })
  console.log(`failed: ${r.failed}`)
  console.log(`seed: ${r.seed}`)
  if (r.failed) {
    console.log(`error: ${r.error}`)
    console.log(`sequence: ${r.sequence.join(' | ')}`)
    console.log(`path: ${r.path}`)
    console.log(`replayPath: ${r.replayPath}`)
    console.log(`replay: ${r.replayCommand}`)
  }
  process.exitCode = r.failed ? 1 : 0
} finally {
  await browser.close()
}
