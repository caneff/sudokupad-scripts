'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
require('./fake-page-storage.js')
const { scriptFiles } = require('../sync-lib.js')
const { startScript } = require('./unit-start.js')
const { headerVersion } = require('./header-version.js')

// The startup promises every script makes, checked once for each file `scriptFiles()` lists. Each script's own test file keeps its table of
// which internal holds back which feature; this file holds what is the same for all of them. A page the script starts on: a document and a
// window that take every call the startup makes and find none of SudokuPad's own elements.
function pageStandIn () {
  const element = () => new Proxy({ style: {}, classList: { add () {}, remove () {}, toggle () {}, contains: () => false }, dataset: {}, children: [] }, {
    get: (target, key) => key in target ? target[key] : (key === 'then' ? undefined : () => element())
  })
  const document = {
    createElement: element,
    createElementNS: element,
    head: element(),
    body: element(),
    documentElement: { outerHTML: '' },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener () {}
  }
  const window = { addEventListener () {}, MutationObserver: class { observe () {} }, getComputedStyle: () => ({}), WheelEvent: { DOM_DELTA_LINE: 1, DOM_DELTA_PAGE: 2 } }
  return { document, window }
}

// Starts the script on that page with `framework` (undefined: no Framework at all) and returns what it warned.
const startOnPage = (file, framework) => startScript(path.join(__dirname, '..', file), { ...pageStandIn(), Framework: framework }).warnings

for (const file of scriptFiles()) {
  const id = file.replace(/\.user\.js$/, '')
  const { VERSION, FEATURES } = require(`../${file}`)

  test(`${id}: VERSION is the @version in the script header`, () => {
    assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, '..', file), 'utf8')))
  })

  test(`${id}: a page with no Framework is not SudokuPad, so the script starts without a warning`, () => {
    assert.deepEqual(startOnPage(file, undefined), [])
  })

  test(`${id}: a Framework without getApp gives one warning naming getApp, and every warning is the script's own`, () => {
    const warnings = startOnPage(file, {})
    assert.equal(warnings.filter((warning) => warning.includes('Framework.getApp')).length, 1, warnings.join('\n'))
    for (const warning of warnings) assert.ok(warning.startsWith(`${id}: `), warning)
  })

  // A feature that needs no internal (`needs: {}`) has none to lack: it turns itself off only when its own work fails.
  test(`${id}: every feature that needs an internal can be lacking, so a Framework with nothing turns each one off`, () => {
    const said = startOnPage(file, {}).join('\n')
    for (const [name, { label }] of Object.entries(FEATURES).filter(([, { needs }]) => Object.keys(needs).length > 0)) assert.ok(said.includes(label), `no warning turns ${name} (${label}) off`)
  })
}
