'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
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

test('a module that silences the linter keeps the silence inside its copy, so a script may use part of it', () => {
  const silenced = { plain: '/* eslint-disable no-unused-vars */\nconst a = 1\n' }
  const result = syncText(script(block('  const a = 0')), (name) => silenced[name])
  assert.equal(result.text, script(`  // <lib:plain>\n  ${generatedLine('plain')}\n  /* eslint-disable no-unused-vars */\n  const a = 1\n  /* eslint-enable no-unused-vars */\n  // </lib:plain>`, '1.2.4'))
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

test('a version that is not X.Y.Z is a problem, and the stale block is not rewritten', () => {
  for (const source of [script(block('  const a = 0'), '1.2.3-beta'), script(block('  const a = 0')).replace("VERSION = '1.2.3'", 'VERSION = "1.2.3"')]) {
    const result = syncText(source, read)
    assert.deepEqual(result.problems, ['@version or const VERSION is not X.Y.Z, so the version cannot be raised'])
    assert.deepEqual({ text: result.text, changed: result.changed }, { text: source, changed: [] })
  }
})

test('a script with no const VERSION has only its @version raised', () => {
  const result = syncText(`// @version      1.2.3\n${block('  const a = 0')}\n`, read)
  assert.equal(result.text, `// @version      1.2.4\n${current}\n`)
})

// The command run on a copy of itself, beside its own lib/ and scripts, so the repo's files are not touched.
function runCommand (scripts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-lib-'))
  try {
    fs.copyFileSync(path.join(__dirname, '..', 'sync-lib.js'), path.join(dir, 'sync-lib.js'))
    fs.mkdirSync(path.join(dir, 'lib'))
    fs.writeFileSync(path.join(dir, 'lib', 'plain.js'), modules.plain)
    for (const [file, text] of Object.entries(scripts)) fs.writeFileSync(path.join(dir, file), text)
    const run = spawnSync(process.execPath, ['sync-lib.js'], { cwd: dir, encoding: 'utf8' })
    return { status: run.status, stderr: run.stderr, files: Object.fromEntries(Object.keys(scripts).map((file) => [file, fs.readFileSync(path.join(dir, file), 'utf8')])) }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('node sync-lib.js rewrites a stale script and exits 0', () => {
  const run = runCommand({ 'a.user.js': script(block('  const a = 0')) })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.files['a.user.js'], script(current, '1.2.4'))
})

test('node sync-lib.js exits 1 on a marker problem, names it, and still rewrites the other scripts', () => {
  const broken = script('  // <lib:Plain>')
  const run = runCommand({ 'a.user.js': script(block('  const a = 0')), 'b.user.js': broken })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /^b\.user\.js: line 4: malformed lib marker$/m)
  assert.deepEqual(run.files, { 'a.user.js': script(current, '1.2.4'), 'b.user.js': broken })
})

test('every script\'s lib blocks match lib/ (run node sync-lib.js to fix)', () => {
  for (const file of scriptFiles()) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    const { changed, problems } = syncText(source, readLib)
    assert.deepEqual(problems, [], `${file}: fix the markers, then run node sync-lib.js`)
    assert.deepEqual(changed, [], `${file}: block(s) out of date with lib/; run node sync-lib.js`)
  }
})
