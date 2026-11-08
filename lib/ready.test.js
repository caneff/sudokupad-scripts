'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text.
const { whenReady } = new Function(`${fs.readFileSync(path.join(__dirname, 'ready.js'), 'utf8')}\nreturn { whenReady }`)() // eslint-disable-line no-new-func

test('whenReady resolves with the value check() first gives that is not false, null or undefined, at once when it is ready already', async () => {
  assert.equal(await whenReady(() => 'tool', { timeoutMs: 1000, what: 'the tool' }), 'tool')
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
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(calls, seen)
})

test('whenReady rejects with what check() throws, named, rather than leaving the promise pending', async () => {
  await assert.rejects(
    whenReady(() => { throw new TypeError('boom') }, { timeoutMs: 1000, what: 'the tool' }),
    /boom/)
})
