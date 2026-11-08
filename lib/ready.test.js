'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text.
const { whenReady } = new Function(`${fs.readFileSync(path.join(__dirname, 'ready.js'), 'utf8')}\nreturn { whenReady }`)() // eslint-disable-line no-new-func

test('whenReady resolves with the value check() gives', async () => {
  assert.equal(await whenReady(() => 'tool', { timeoutMs: 1000, what: 'the tool' }), 'tool')
})

test('whenReady calls check() before it returns, so a tool that is ready already costs no poll', () => {
  let calls = 0
  whenReady(() => { calls++; return 'tool' }, { timeoutMs: 1000, what: 'the tool' })
  assert.equal(calls, 1)
})

test('whenReady takes 0 and an empty string as ready; only null, undefined and false are not', async () => {
  assert.equal(await whenReady(() => 0, { timeoutMs: 1000, what: 'the tool' }), 0)
  assert.equal(await whenReady(() => '', { timeoutMs: 1000, what: 'the tool' }), '')
  await assert.rejects(whenReady(() => false, { timeoutMs: 20, what: 'x', pollMs: 5 }), /x not ready after 20 ms/)
  await assert.rejects(whenReady(() => undefined, { timeoutMs: 20, what: 'x', pollMs: 5 }), /x not ready after 20 ms/)
})

test('whenReady keeps polling until check() is ready', async () => {
  let calls = 0
  const value = await whenReady(() => (++calls < 4 ? null : calls), { timeoutMs: 2000, what: 'the tool', pollMs: 5 })
  assert.equal(value, 4)
})

test('whenReady rejects with "<what> not ready after <ms> ms" when check() never is', async () => {
  await assert.rejects(
    whenReady(() => null, { timeoutMs: 40, what: 'the color tool', pollMs: 5 }),
    (error) => error instanceof Error && error.message === 'the color tool not ready after 40 ms')
})

test('whenReady stops polling after it rejects', async () => {
  let calls = 0
  await assert.rejects(whenReady(() => { calls++; return null }, { timeoutMs: 30, what: 'x', pollMs: 5 }))
  const seen = calls
  // A quiet window longer than the poll: a timer left running would call check() again in it.
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(calls, seen)
})

test('whenReady rejects with the error check() throws, rather than leaving the promise pending', async () => {
  await assert.rejects(
    whenReady(() => { throw new TypeError('boom') }, { timeoutMs: 1000, what: 'the tool' }),
    /boom/)
})
