'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { compareVersions, headerField, headerVersion, VERSION_LINE } = require('../userscript-header.js')

const header = (version) => `// ==UserScript==\n// @name         Demo\n// @version      ${version}\n// @match        https://sudokupad.app/*\n// ==/UserScript==\n`

test('a header with trailing spaces after the version reads the same as one without', () => {
  assert.equal(headerVersion(header('1.2.3   ')), '1.2.3')
  assert.equal(headerVersion(header('1.2.3 \t ')), headerVersion(header('1.2.3')))
  assert.equal(headerField(header('1.2.3  ').replace('Demo', 'Demo  '), 'name'), 'Demo')
})

test('a script with no such header throws', () => {
  assert.throws(() => headerVersion('// @name Demo\n'), /no @version header/)
})

test('compareVersions reads X.Y.Z as three numbers and throws on any other shape', () => {
  assert.equal(compareVersions('0.10.2', '0.10.2'), 0)
  for (const bad of ['1.2', '1.2.3.4', 'v1.2.3', '1.2.x', '']) {
    assert.throws(() => compareVersions(bad, '1.0.0'), /is not X\.Y\.Z/, bad)
    assert.throws(() => compareVersions('1.0.0', bad), /is not X\.Y\.Z/, bad)
  }
})

test('compareVersions compares numerically, part by part', () => {
  assert.ok(compareVersions('0.10.0', '0.9.0') > 0)
  assert.ok(compareVersions('1.0.0', '1.0.1') < 0)
  assert.equal(compareVersions('2.3.4', '2.3.4'), 0)
})

test('VERSION_LINE matches only an X.Y.Z @version line, and its parts rebuild the line', () => {
  const [line, head, major, minor, patch, tail] = VERSION_LINE.exec(header('1.2.3  '))
  assert.equal(`${head}${major}.${minor}.${patch}${tail}`, line)
  assert.deepEqual([major, minor, patch], ['1', '2', '3'])
  assert.equal(VERSION_LINE.test(header('1.2')), false)
})

test('sync-lib.js and the tests read @version through this module, not a pattern of their own', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const ROOT = path.join(__dirname, '..')
  const files = ['sync-lib.js', ...fs.readdirSync(__dirname).map((f) => `test/${f}`)].filter((f) => /\.m?js$/.test(f) && f !== 'test/userscript-header.test.js')
  const own = files.filter((f) => /@version\\s|function parseVersion|function compareVersions|localeCompare\([^)]*numeric/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')))
  assert.deepEqual(own, [])
})
