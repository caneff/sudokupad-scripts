'use strict'
// Spec #688's closing test: the live harness and the unit-test stores, read as text at the `npm test` seam over the tree. No live suite sets a phone-size
// viewport or SudokuPad's own dark mode (both unsupported), none launches Chromium itself (`live/session.mjs` does), no unit test builds a store that reads
// undefined for a missing key, and the helpers the suites used to retype are each defined once.
// Blind to real SudokuPad: whether a live suite still passes through the harness, and the Framework calls, rendering and undo, are `npm run test:live`'s.
const test = require('node:test')
const assert = require('node:assert/strict')
const { readdirSync, readFileSync } = require('node:fs')
const { join, relative } = require('node:path')
const { fakeStore } = require('../fake-store.js')
const ROOT = join(__dirname, '..', '..')

const filesUnder = (dir) => readdirSync(join(ROOT, dir), { recursive: true }).filter((file) => /\.m?js$/.test(file)).map((file) => join(dir, file))
const read = (file) => readFileSync(join(ROOT, file), 'utf8')
const live = filesUnder('live').filter((file) => !file.includes('node_modules'))
const liveSuites = live.filter((file) => file.endsWith('.live.mjs'))
// A line naming `pattern` in `file`, as `file:line`.
const hits = (files, pattern) => files.flatMap((file) => read(file).split('\n').flatMap((text, index) => (pattern.test(text) ? [`${file}:${index + 1}`] : [])))
// Where `name` is defined at the top level of a live file, which is how the shared modules declare it: a suite's indented wrapper that fixes its page is not a second definition.
const definedIn = (name) => live.filter((file) => new RegExp(`^(export )?(async )?(function|const) ${name}\\b`, 'm').test(read(file)))

test('no live suite sets a phone-size viewport or SudokuPad\'s own dark mode', () => {
  assert.ok(liveSuites.length > 30, `${liveSuites.length} live suites are read`)
  assert.deepEqual(hits(liveSuites, /\b390\b/), [])
  assert.deepEqual(hits(liveSuites, /setting-darkmode/), [])
})

test('no live suite launches Chromium itself: live/session.mjs does', () => {
  assert.deepEqual(hits(liveSuites, /\bchromium\s*\.\s*launch/), [])
  assert.ok(hits(['live/session.mjs'], /\bchromium\s*\.\s*launch/).length > 0, 'session.mjs launches it')
})

test('no unit test builds a store that reads undefined for a missing key, and the shared fake store reads null', () => {
  const tests = filesUnder('test').filter((file) => relative(ROOT, join(ROOT, file)) !== join('test', 'specs', 'spec-688-closing.test.js'))
  assert.ok(tests.length > 30, `${tests.length} test files are read`)
  // `getData: (key) => saved[key]`, a lookup with nothing after it to turn a missing key into null.
  assert.deepEqual(hits(tests, /getData\s*:\s*\(?\w+\)?\s*=>\s*[\w.]+\[\w+\]\s*(,|\}|$)/), [])
  assert.equal(fakeStore({}).getData('missing'), null)
  assert.equal(fakeStore({ kept: 0 }).getData('kept'), 0)
})

test('placeNote, typeText, restart, boxOpen and pickDraw are each defined once under live/', () => {
  for (const [name, owner] of [['placeNote', 'board.mjs'], ['typeText', 'board.mjs'], ['restart', 'board.mjs'], ['boxOpen', 'board.mjs'], ['pickDraw', 'draw-tool/draw-tool-fixtures.mjs']]) {
    assert.deepEqual(definedIn(name), [join('live', owner)], name)
  }
})
