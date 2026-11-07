'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { syncText, readLib, scriptFiles, generatedLine } = require('../sync-lib.js')

const modules = { plain: 'const a = 1\n\nconst b = 2\n' }
const read = (name) => modules[name]
const script = (inner, version = '1.2.3') => `// @version      ${version}\n(function () {\n  const VERSION = '${version}'\n${inner}\n})()\n`
const block = (body) => `  // <lib:plain>\n  ${generatedLine('plain')}\n${body}\n  // </lib:plain>`
const current = block('  const a = 1\n\n  const b = 2')

test('a current block is left alone and the version stays', () => {
  const source = script(current)
  assert.deepEqual(syncText(source, read), { text: source, changed: [], problems: [] })
})

test('a stale block is rewritten from its module, indented, and both versions go up by a patch', () => {
  const result = syncText(script(block('  const a = 0')), read)
  assert.deepEqual(result.changed, ['plain'])
  assert.equal(result.text, script(current, '1.2.4'))
})

test('a block with no generated line is rewritten', () => {
  const result = syncText(script('  // <lib:plain>\n  const a = 1\n\n  const b = 2\n  // </lib:plain>'), read)
  assert.deepEqual(result.changed, ['plain'])
  assert.equal(result.text, script(current, '1.2.4'))
})

test('an unknown module is a problem and the text is untouched', () => {
  const source = script('  // <lib:nope>\n  // </lib:nope>')
  const result = syncText(source, read)
  assert.deepEqual(result.problems, ['line 4: no module lib/nope.js'])
  assert.equal(result.text, source)
})

test('an unclosed, mismatched or stray marker is a problem', () => {
  assert.match(syncText(script('  // <lib:plain>\n  const a = 1'), read).problems[0], /never closed/)
  assert.match(syncText(script('  // <lib:plain>\n  // </lib:other>'), read).problems[0], /never closed/)
  assert.match(syncText(script('  // </lib:plain>'), read).problems[0], /no opening marker/)
  assert.match(syncText(script('  // <lib:Plain>'), read).problems[0], /malformed/)
})

test('a problem anywhere leaves a stale block in the same script unrewritten', () => {
  const result = syncText(script(`${block('  const a = 0')}\n  // <lib:nope>\n  // </lib:nope>`), read)
  assert.equal(result.changed.length, 0)
  assert.equal(result.problems.length, 1)
})

test('every script\'s lib blocks match lib/ (run node sync-lib.js to fix)', () => {
  for (const file of scriptFiles()) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    const { changed, problems } = syncText(source, readLib)
    assert.deepEqual(problems, [], `${file}: fix the markers, then run node sync-lib.js`)
    assert.deepEqual(changed, [], `${file}: block(s) out of date with lib/; run node sync-lib.js`)
  }
})
