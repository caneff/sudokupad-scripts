const { test } = require('node:test')
const assert = require('node:assert/strict')
const { scripts } = require('../package.json')

// A live file that hangs on an unbounded promise must fail at a limit, not run for hours; a run of some files takes the same limit.
test('test:live runs every live file through test:live:files, which gives every test a time limit', () => {
  assert.match(scripts['test:live:files'], /--test-timeout=\d+/)
  assert.match(scripts['test:live'], /^npm run test:live:files -- /)
})
