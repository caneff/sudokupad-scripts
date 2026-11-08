// Runs the fuzz from the command line and prints its report; the replay command a failure prints is this file with the
// failure's numbers. Exits 1 on a failure.
//   node live/fuzz/run.mjs [--planted <limit>] [--seed <n>] [--path <p> --replay-path <r>]
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { fuzz } from './fuzz.mjs'

const { values } = parseArgs({ options: { planted: { type: 'string' }, seed: { type: 'string' }, path: { type: 'string' }, 'replay-path': { type: 'string' } } })

const browser = await chromium.launch()
try {
  const r = await fuzz({
    browser,
    seed: values.seed == null ? undefined : Number(values.seed),
    plantedLimit: values.planted == null ? undefined : Number(values.planted),
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
