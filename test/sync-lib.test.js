'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { syncText, readLib, scriptFiles, generatedLine, libNamesOnDisk } = require('../sync-lib.js')

// For a script with no lib module to look a dependency up in.
const syncPlain = (source, readModule) => syncText(source, readModule, [])
const modules = { plain: 'const a = 1\n\nconst b = 2\n' }
const read = (name) => modules[name]
const script = (inner, version = '1.2.3') => `// @version      ${version}\n(function () {\n  const VERSION = '${version}'\n${inner}\n})()\n`
const block = (body) => `  // <lib:plain>\n  ${generatedLine('plain')}\n${body}\n  // </lib:plain>`
const current = block('  const a = 1\n\n  const b = 2')

test('a current block is left alone and the version stays', () => {
  const source = script(current)
  assert.deepEqual(syncPlain(source, read), { text: source, changed: [], problems: [] })
})

test('a stale block is rewritten from its module, indented, and both versions go up by a patch', () => {
  const result = syncPlain(script(block('  const a = 0')), read)
  assert.deepEqual(result.changed, ['plain'])
  assert.equal(result.text, script(current, '1.2.4'))
})

test('a block with no generated line is rewritten', () => {
  const result = syncPlain(script('  // <lib:plain>\n  const a = 1\n\n  const b = 2\n  // </lib:plain>'), read)
  assert.deepEqual(result.changed, ['plain'])
  assert.equal(result.text, script(current, '1.2.4'))
})

test('a module that silences the linter keeps the silence inside its copy, so a script may use part of it', () => {
  const silenced = { plain: '/* eslint-disable no-unused-vars */\nconst a = 1\n' }
  const result = syncPlain(script(block('  const a = 0')), (name) => silenced[name])
  assert.equal(result.text, script(`  // <lib:plain>\n  ${generatedLine('plain')}\n  /* eslint-disable no-unused-vars */\n  const a = 1\n  /* eslint-enable no-unused-vars */\n  // </lib:plain>`, '1.2.4'))
})

test('an unknown module is a problem and the text is untouched', () => {
  const source = script('  // <lib:nope>\n  // </lib:nope>')
  const result = syncPlain(source, read)
  assert.deepEqual(result.problems, ['line 4: no module lib/nope.js'])
  assert.equal(result.text, source)
})

test('an unclosed, mismatched or stray marker is a problem', () => {
  assert.match(syncPlain(script('  // <lib:plain>\n  const a = 1'), read).problems[0], /never closed/)
  assert.match(syncPlain(script('  // <lib:plain>\n  // </lib:other>'), read).problems[0], /never closed/)
  assert.match(syncPlain(script('  // </lib:plain>'), read).problems[0], /no opening marker/)
  assert.match(syncPlain(script('  // <lib:Plain>'), read).problems[0], /malformed/)
})

test('a problem anywhere leaves a stale block in the same script unrewritten', () => {
  const result = syncPlain(script(`${block('  const a = 0')}\n  // <lib:nope>\n  // </lib:nope>`), read)
  assert.equal(result.changed.length, 0)
  assert.equal(result.problems.length, 1)
})

test('a version that is not X.Y.Z is a problem, and the stale block is not rewritten', () => {
  for (const source of [script(block('  const a = 0'), '1.2.3-beta'), script(block('  const a = 0')).replace("VERSION = '1.2.3'", 'VERSION = "1.2.3"')]) {
    const result = syncPlain(source, read)
    assert.deepEqual(result.problems, ['@version or const VERSION is not X.Y.Z, so the version cannot be raised'])
    assert.deepEqual({ text: result.text, changed: result.changed }, { text: source, changed: [] })
  }
})

test('a script with no const VERSION has only its @version raised', () => {
  const result = syncPlain(`// @version      1.2.3\n${block('  const a = 0')}\n`, read)
  assert.equal(result.text, `// @version      1.2.4\n${current}\n`)
})

const dependent = {
  base: 'function helper () {}\n',
  needy: '/* global helper, window */\nconst use = () => helper()\n'
}
const dependentRead = (name) => dependent[name]
const libNames = Object.keys(dependent)
const wrap = (name, body) => `  // <lib:${name}>\n  ${generatedLine(name)}\n${body}\n  // </lib:${name}>`
const baseBlock = wrap('base', '  function helper () {}')
const needyBlock = wrap('needy', '  const use = () => helper()')

test('a block whose module reads a name from a lib module the script does not copy is a problem naming both', () => {
  const source = script(needyBlock)
  const result = syncText(source, dependentRead, libNames)
  assert.deepEqual(result.problems, ['lib:needy reads helper from lib:base, which this script does not copy in'])
  assert.equal(result.text, source)
})

test('a block whose dependency is copied in, before or after it, is fine', () => {
  for (const inner of [`${baseBlock}\n${needyBlock}`, `${needyBlock}\n${baseBlock}`]) {
    assert.deepEqual(syncText(script(inner), dependentRead, libNames).problems, [])
  }
})

test('a name no lib module defines (a browser global, or one the script defines) is not a dependency', () => {
  const unrelated = { base: 'function other () {}\n', needy: '/* global window, helper */\nconst use = 1\n' }
  assert.deepEqual(syncText(script(needyBlock), (name) => unrelated[name], libNames).problems, [])
})

test('the issue\'s case on the real modules: palette without color-math and ready names both', () => {
  const problems = syncText(script(wrap('palette', '  const x = 1')), readLib, libNamesOnDisk()).problems
  assert.deepEqual(problems, [['parseColor', 'color-math'], ['darkenColor', 'color-math'], ['toOklab', 'color-math'], ['whenReady', 'ready']].map(([used, owner]) => `lib:palette reads ${used} from lib:${owner}, which this script does not copy in`))
})

test('every form of the global comment is read, and a name with a regex character is matched', () => {
  const forms = ['/* globals helper */', '/* global helper:writable */', '/* global window */\n/* global helper */']
  for (const comment of forms) {
    const modules = { base: 'function helper () {}\n', needy: `${comment}\nconst use = 1\n` }
    assert.equal(syncText(script(needyBlock), (name) => modules[name], libNames).problems.length, 1, comment)
  }
  const dollar = { base: 'const $el = 1\n', needy: '/* global $el */\nconst use = 1\n' }
  assert.equal(syncText(script(needyBlock), (name) => dollar[name], libNames).problems.length, 1)
})

// The command run on a copy of itself, beside its own lib/ and scripts, so the repo's files are not touched.
function runCommand (scripts, libFiles = { plain: modules.plain }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-lib-'))
  try {
    fs.copyFileSync(path.join(__dirname, '..', 'sync-lib.js'), path.join(dir, 'sync-lib.js'))
    fs.mkdirSync(path.join(dir, 'lib'))
    for (const [name, text] of Object.entries(libFiles)) fs.writeFileSync(path.join(dir, 'lib', `${name}.js`), text)
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

test('node sync-lib.js exits 1 on a missing dependency block and names it', () => {
  const run = runCommand({ 'a.user.js': script(needyBlock) }, dependent)
  assert.equal(run.status, 1)
  assert.match(run.stderr, /^a\.user\.js: lib:needy reads helper from lib:base, which this script does not copy in$/m)
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
    const { changed, problems } = syncText(source, readLib, libNamesOnDisk())
    assert.deepEqual(problems, [], `${file}: fix the markers, then run node sync-lib.js`)
    assert.deepEqual(changed, [], `${file}: block(s) out of date with lib/; run node sync-lib.js`)
  }
})
