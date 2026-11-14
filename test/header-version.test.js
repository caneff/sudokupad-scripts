'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { headerField, headerVersion } = require('./header-version.js')

const header = (version) => `// ==UserScript==\n// @name         Demo\n// @version      ${version}\n// @match        https://sudokupad.app/*\n// ==/UserScript==\n`

test('a header with trailing spaces after the version reads the same as one without', () => {
  assert.equal(headerVersion(header('1.2.3   ')), '1.2.3')
  assert.equal(headerVersion(header('1.2.3 \t ')), headerVersion(header('1.2.3')))
  assert.equal(headerField(header('1.2.3  ').replace('Demo', 'Demo  '), 'name'), 'Demo')
})

test('a script with no such header throws', () => {
  assert.throws(() => headerVersion('// @name Demo\n'), /no @version header/)
})
