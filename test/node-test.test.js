'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { DEFAULT_JOBS, jobsFrom, nodeTestArgs } = require('../node-test.js')
const { scripts } = require('../package.json')

const WRAPPER = path.join(__dirname, '..', 'node-test.js')

describe('node-test.js (#1090): npm test and test:live:files cap how many files run at once', () => {
  it('runs 4 files at once when TESTS_JOBS is unset or empty', () => {
    assert.equal(DEFAULT_JOBS, 4)
    assert.deepEqual(nodeTestArgs({}, ['a.test.js']), ['--test', '--test-concurrency=4', 'a.test.js'])
    assert.equal(jobsFrom({ TESTS_JOBS: '' }), 4)
  })

  it('lets a set TESTS_JOBS win, above the default as well as below it', () => {
    assert.deepEqual(nodeTestArgs({ TESTS_JOBS: '12' }, ['a.test.js']), ['--test', '--test-concurrency=12', 'a.test.js'])
    assert.equal(jobsFrom({ TESTS_JOBS: '1' }), 1)
  })

  it('refuses a TESTS_JOBS that is not a whole number of 1 or more, rather than running at some other width', () => {
    for (const bad of ['0', '-2', '2.5', 'many', ' 3']) assert.throws(() => jobsFrom({ TESTS_JOBS: bad }), /TESTS_JOBS needs a whole number of 1 or more/, bad)
  })

  it('is how package.json runs every node --test script but the Tampermonkey one', () => {
    assert.match(scripts.test, /^node node-test\.js /)
    assert.match(scripts['test:live:files'], /^node node-test\.js /)
    for (const [name, command] of Object.entries(scripts)) {
      if (name !== 'test:tampermonkey' && name !== 'test:fuzz:smoke') assert.doesNotMatch(command, /node --test/, name)
    }
  })

  describe('run as a command', () => {
    // NODE_TEST_CONTEXT, set in a test file run by `node --test`, would make the inner run report to its parent and exit 0 whatever it found.
    const run = (file, env = {}) => spawnSync(process.execPath, [WRAPPER, file], { env: { ...process.env, NODE_TEST_CONTEXT: undefined, ...env }, encoding: 'utf8' })
    const withTest = (body, fn) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-test-'))
      try {
        const file = path.join(dir, 'x.test.js')
        fs.writeFileSync(file, `require('node:test')('x', () => { ${body} })\n`)
        return fn(file)
      } finally { fs.rmSync(dir, { recursive: true, force: true }) }
    }

    it('exits 0 for a passing test and non-zero for a failing one', () => {
      assert.equal(withTest('', (file) => run(file).status), 0)
      assert.notEqual(withTest('throw new Error("red")', (file) => run(file).status), 0)
    })

    it('exits 2 naming TESTS_JOBS, running nothing, when it is not a number', () => {
      const r = withTest('', (file) => run(file, { TESTS_JOBS: 'many' }))
      assert.equal(r.status, 2)
      assert.match(r.stderr, /TESTS_JOBS needs a whole number/)
    })
  })
})
