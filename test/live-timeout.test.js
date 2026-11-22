const { test } = require('node:test')
const assert = require('node:assert/strict')
const { scripts } = require('../package.json')

// A live file that hangs on an unbounded promise must fail at a limit, not run for hours; a run of some files takes the same limit.
test('test:live runs every live file through test:live:files, which gives every test a time limit', () => {
  assert.match(scripts['test:live:files'], /--test-timeout=\d+/)
  assert.match(scripts['test:live'], /^npm run test:live:files -- /)
})

// Every npm script that runs a test file in a browser gives each test a limit, so a hang fails at the limit and not at the job's: a script added later is found by its command.
test('every npm script that runs a live test file through node --test or node-test.js has a test timeout', () => {
  const browserScripts = Object.entries(scripts).filter(([name, command]) => name !== 'test' && /node --test|node-test\.js/.test(command))
  const names = browserScripts.map(([name]) => name)
  for (const expected of ['test:live:files', 'test:fuzz:smoke', 'test:tampermonkey']) assert.ok(names.includes(expected), `${expected} is found as a browser test script`)
  for (const [name, command] of browserScripts) assert.match(command, /--test-timeout=\d+/, name)
})
