'use strict'
// Spec #835's closing test: each repo fact a test needs is read from the module that owns it, and one contract test checks every script's startup,
// driven at the `npm test` seam. The script list comes from sync-lib's scriptFiles(), a lib block from its one reader, a header's @version from
// test/header-version.js, and the per-script VERSION copies are gone.
// Blind to real SudokuPad: the Framework calls, rendering and undo. The rewritten live tests (Color by Digit, Pen Tool Extras, Text Anywhere, the
// Tampermonkey install) run only under `npm run test:live:files` and `npm run test:tampermonkey`, which this seam does not reach.
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { scriptFiles, libBlockNames, withoutLibBlocks } = require('../../sync-lib.js')
const { headerVersion } = require('../header-version.js')

const ROOT = join(__dirname, '..', '..')
const SYNC_LIB = /require\('(\.\.\/)+sync-lib\.js'\)/
const HEADER_VERSION = /require\('(\.\.\/)*\.?\/?header-version\.js'\)/
const read = (file) => readFileSync(join(ROOT, file), 'utf8')

test('#860: a lib name with a digit reads as a block, and a header with trailing spaces after its version reads the same version', () => {
  const source = 'a\n// <lib:color-math2>\nx\n// </lib:color-math2>\nb\n'
  assert.deepEqual(libBlockNames(source), ['color-math2'])
  assert.equal(withoutLibBlocks(source), 'a\n\nb\n')
  assert.equal(headerVersion('// @version   1.2.3   \n'), headerVersion('// @version 1.2.3\n'))
})

test('#860: the workflows test and the five closing tests read the script list, the lib blocks and @version from their owners, with no regex of their own', () => {
  const readers = {
    'test/workflows.test.js': SYNC_LIB,
    'test/specs/spec-685-closing.test.js': SYNC_LIB,
    'test/specs/spec-449-closing.test.js': SYNC_LIB,
    'test/specs/spec-334-closing.test.js': SYNC_LIB,
    'test/specs/spec-204-closing.test.js': HEADER_VERSION,
    'test/specs/spec-130-closing.test.js': HEADER_VERSION
  }
  for (const [file, owner] of Object.entries(readers)) {
    const source = read(file)
    assert.match(source, owner, `${file} requires its owner`)
    assert.doesNotMatch(source, /<lib:\(|@version\\s|endsWith\('\.user\.js'\)/, `${file} carries no copy of the grammar`)
  }
})

test('#861: one contract test loops every script scriptFiles() lists, and no script\'s own test file compares VERSION with its header', () => {
  assert.match(read('test/script-contract.test.js'), /for \(const \w+ of scriptFiles\(\)\)|scriptFiles\(\)\.(map|forEach|filter)/)
  for (const file of scriptFiles()) {
    const own = read(join('test', file.replace('.user.js', '.test.js')))
    assert.doesNotMatch(own, /\bVERSION\b[^\n]*headerVersion|headerVersion[^\n]*\bVERSION\b/, `${file}'s own test keeps no VERSION copy`)
  }
})
