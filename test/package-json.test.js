'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { engines } = require('../package.json')
const lock = require('../package-lock.json')

const ROOT = path.join(__dirname, '..')

test('engines names the Node major version .nvmrc names, as a floor', () => {
  const major = fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim()
  assert.equal(engines?.node, `>=${major}`)
})

test('the lockfile records the same engines, so npm ci accepts the pair', () => {
  assert.deepEqual(lock.packages[''].engines, engines)
})
