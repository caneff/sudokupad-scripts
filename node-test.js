'use strict'
// `node node-test.js <node --test arguments>`: what `npm test` and `npm run test:live:files` run (#1090). A bare `node --test` starts about
// one file per core (31 on the dev box), so a worker's plain `npm test` loaded the shared machine; this caps it at DEFAULT_JOBS files at once.
// TESTS_JOBS, a whole number of 1 or more, sets the width instead, above the default as well as below it: a worker raises it only after
// recording a parallel job. Unset or empty is the default; any other value stops the run with exit 2 rather than running at some other width.
const { spawnSync } = require('node:child_process')

const DEFAULT_JOBS = 4

function jobsFrom (env) {
  const raw = env.TESTS_JOBS
  if (raw === undefined || raw === '') return DEFAULT_JOBS
  if (!/^[1-9]\d*$/.test(raw)) throw new Error(`TESTS_JOBS needs a whole number of 1 or more, got "${raw}"`)
  return Number(raw)
}

const nodeTestArgs = (env, args) => ['--test', `--test-concurrency=${jobsFrom(env)}`, ...args]

module.exports = { DEFAULT_JOBS, jobsFrom, nodeTestArgs }

if (require.main === module) {
  let args
  try { args = nodeTestArgs(process.env, process.argv.slice(2)) } catch (e) {
    console.error(`node-test.js: ${e.message}`)
    process.exit(2)
  }
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (r.error) {
    console.error(`node-test.js: ${r.error.message}`)
    process.exit(2)
  }
  // A child killed by a signal has no status: that is a failure, never a pass.
  process.exit(r.status ?? 1)
}
