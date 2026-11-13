import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCoverage, neverRunReport, tagSource, trackClosing } from './coverage.mjs'

const source = 'function a () {}\nfunction b () {\n  if (x) y()\n}\nconst c = () => 1\n'
const fn = (functionName, startOffset, endOffset, count, ...blocks) => ({ functionName, ranges: [{ startOffset, endOffset, count }, ...blocks.map(([s, e, n]) => ({ startOffset: s, endOffset: e, count: n }))] })
const top = fn('', 0, source.length, 1)
const entry = (functions, url = 'one.user.js') => ({ url, source, functions: [top, ...functions] })

test('tagSource names the script and leaves the offsets of its own text alone', () => {
  const tagged = tagSource('one.user.js', 'let a = 1')
  assert.ok(tagged.startsWith('let a = 1\n'))
  assert.match(tagged, /\n\/\/# sourceURL=one\.user\.js\n$/)
})

const FILES = ['one.user.js', 'two.user.js']

test('neverRun lists the functions with a count of 0, with their line and column', () => {
  const coverage = createCoverage(FILES)
  coverage.add([entry([fn('a', 1, 16, 3), fn('b', 17, 47, 0), fn('', 58, 65, 0)])])
  assert.deepEqual(coverage.neverRun(), { 'one.user.js': { total: 3, never: [{ name: 'b', line: 2, column: 1 }, { name: '(anonymous)', line: 5, column: 11 }] } })
})

test('a function that ran on any page ran, and the same function of two pages counts once', () => {
  const coverage = createCoverage(FILES)
  coverage.add([entry([fn('a', 1, 16, 0), fn('b', 17, 47, 2)])])
  coverage.add([entry([fn('a', 1, 16, 1), fn('b', 17, 47, 0)])])
  assert.deepEqual(coverage.neverRun(), { 'one.user.js': { total: 2, never: [] } })
})

test('the script\'s own top level is no function, and scripts not named are left out', () => {
  const coverage = createCoverage(FILES)
  coverage.add([{ ...entry([]), functions: [fn('', 0, source.length, 0)] }, entry([fn('x', 1, 2, 0)], 'sudokupad.js')])
  assert.deepEqual(coverage.neverRun(), { 'one.user.js': { total: 0, never: [] } })
})

test('ranAt reads the count of the smallest range around the offset', () => {
  const coverage = createCoverage(FILES)
  coverage.add([entry([fn('b', 17, 47, 4, [37, 45, 0])])])
  assert.equal(coverage.ranAt('one.user.js', 20), true)
  assert.equal(coverage.ranAt('one.user.js', 40), false)
  assert.equal(coverage.ranAt('one.user.js', 2), true)
  assert.equal(coverage.ranAt('one.user.js', 46), true)
})

test('ranAt is null for a script no page was heard of', () => {
  const coverage = createCoverage(FILES)
  coverage.add([entry([fn('b', 17, 47, 4)])])
  assert.equal(coverage.ranAt('two.user.js', 20), null)
})

test('ranAt is true when any page ran the offset', () => {
  const coverage = createCoverage(FILES)
  coverage.add([entry([fn('b', 17, 47, 0)])])
  assert.equal(coverage.ranAt('one.user.js', 20), false)
  coverage.add([entry([fn('b', 17, 47, 1)])])
  assert.equal(coverage.ranAt('one.user.js', 20), true)
})

test('a branch one page ran stays run when another page ran the function and skipped it', () => {
  const coverage = createCoverage(FILES)
  // V8 leaves a block out when its count equals its function's: this page ran the branch, so it reports none.
  coverage.add([entry([fn('b', 17, 47, 3)])])
  coverage.add([entry([fn('b', 17, 47, 2, [37, 45, 0])])])
  assert.equal(coverage.ranAt('one.user.js', 40), true)
})

test('neverRunReport prints a count line per script and a line per function', () => {
  assert.deepEqual(neverRunReport({ 'one.user.js': { total: 4, never: [{ name: 'b', line: 2, column: 1 }] } }), ['one.user.js: 1 of 4 functions never ran', '  b (line 2, column 1)'])
})

test('trackClosing resolves allClosed only once every target it opened has finished closing', async () => {
  const events = []
  let finishClose
  const targets = [{ close: async () => { events.push('closed first') } }, { close: () => new Promise((resolve) => { finishClose = () => { events.push('closed second'); resolve() } }) }]
  const tracked = trackClosing(async () => targets.shift())
  const first = await tracked.open()
  const second = await tracked.open()
  const settled = tracked.allClosed().then(() => events.push('all closed'))
  await first.close()
  const closing = second.close()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(events, ['closed first'])
  finishClose()
  await closing
  await settled
  assert.deepEqual(events, ['closed first', 'closed second', 'all closed'])
})
