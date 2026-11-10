const { test } = require('node:test')
const assert = require('node:assert/strict')
const { scripts } = require('../package.json')

// A live file that hangs on an unbounded promise must fail at a limit, not run for hours.
test('test:live gives every test a time limit', () => {
  assert.match(scripts['test:live'], /--test-timeout=\d+/)
})

test('the time limit is a number of minutes a slow suite still fits in', () => {
  const ms = Number(/--test-timeout=(\d+)/.exec(scripts['test:live'])[1])
  assert.ok(ms >= 10 * 60 * 1000 && ms <= 30 * 60 * 1000, `got ${ms} ms`)
})
