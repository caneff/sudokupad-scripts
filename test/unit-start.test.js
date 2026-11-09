'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { startScript, withScript, withoutPath } = require('./unit-start.js')

// A throwaway script that records the Framework it saw and warns once, so a test can watch the helper start it and clean up.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-start-'))
const file = path.join(dir, 'probe.user.js')
fs.writeFileSync(file, "globalThis.probeSaw = (globalThis.probeSaw || []).concat(String(globalThis.Framework && globalThis.Framework.name)); console.warn('probe: hello')\n")
test.after(() => fs.rmSync(dir, { recursive: true, force: true }))

test('startScript runs the script against the given globals, returns what it warned, and puts the globals back', () => {
  global.Framework = { name: 'before' }
  delete global.probeSaw
  const warn = console.warn
  const { warnings } = startScript(file, { Framework: { name: 'during' }, window: {} })
  assert.deepEqual(global.probeSaw, ['during'])
  assert.deepEqual(warnings, ['probe: hello'])
  assert.equal(global.Framework.name, 'before', 'the Framework that was there is back')
  assert.equal('window' in global, false, 'a global that was absent is absent again')
  assert.equal(console.warn, warn)
  delete global.Framework
  delete global.probeSaw
})

test('a global given as undefined is absent while the script runs', () => {
  global.Framework = { name: 'before' }
  startScript(file, { Framework: undefined })
  assert.deepEqual(global.probeSaw, ['undefined'])
  assert.equal(global.Framework.name, 'before')
  delete global.Framework
  delete global.probeSaw
})

test('the script starts fresh each time, so a second start runs it again', () => {
  delete global.probeSaw
  startScript(file, {})
  startScript(file, {})
  assert.equal(global.probeSaw.length, 2)
  delete global.probeSaw
})

test('withScript keeps the globals up while the callback runs, then restores them even when it throws', async () => {
  delete global.probeSaw
  await assert.rejects(withScript(file, { Framework: { name: 'during' } }, async () => {
    assert.equal(global.Framework.name, 'during')
    throw new Error('stop')
  }), /stop/)
  assert.equal('Framework' in global, false)
  delete global.probeSaw
})

test('withoutPath deletes a dotted path from the named root and returns the roots', () => {
  const roots = { Framework: { app: { puzzle: {}, resize () {} }, getApp () {} } }
  assert.equal(withoutPath(roots, 'Framework.app.resize'), roots)
  assert.deepEqual(Object.keys(roots.Framework.app), ['puzzle'])
  withoutPath(roots, 'Framework.getApp')
  assert.deepEqual(Object.keys(roots.Framework), ['app'])
})
