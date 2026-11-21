'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
require('./fake-page-storage.js')
const { scriptFiles, guardId } = require('../sync-lib.js')
const { pageStandIn } = require('./page-stand-in.js')
const { startScript } = require('./unit-start.js')
const { headerVersion } = require('./header-version.js')

// The startup promises every script makes, checked once for each file `scriptFiles()` lists. Each script's own test file keeps its table of
// which internal holds back which feature; this file holds what is the same for all of them.
// Starts the script on that page with `framework` (undefined: no Framework at all) and returns what it warned.
const startOnPage = (file, framework) => startScript(path.join(__dirname, '..', file), { ...pageStandIn(), Framework: framework }).warnings

for (const file of scriptFiles()) {
  const id = file.replace(/\.user\.js$/, '')
  const guard = guardId(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'))
  const { VERSION, FEATURES } = require(`../${file}`)

  test(`${id}: VERSION is the @version in the script header`, () => {
    assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, '..', file), 'utf8')))
  })

  test(`${id}: the header has no @require, so the installed script is one file`, () => {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', file), 'utf8').split('// ==/UserScript==')[0], /@require/)
  })

  test(`${id}: a page with no Framework is not SudokuPad, so the script starts without a warning`, () => {
    assert.deepEqual(startOnPage(file, undefined), [])
  })

  test(`${id}: a Framework without getApp gives one warning naming getApp, and every warning is the script's own`, () => {
    const warnings = startOnPage(file, {})
    assert.equal(warnings.filter((warning) => warning.includes('Framework.getApp')).length, 1, warnings.join('\n'))
    for (const warning of warnings) assert.ok(warning.startsWith(`${guard}: `), warning)
  })

  // A feature that needs no internal (`needs: {}`) has none to lack: it turns itself off only when its own work fails.
  test(`${id}: every feature that needs an internal can be lacking, so a Framework with nothing turns each one off`, () => {
    // A warning is `<id>: <label>, <label> skipped because ...`; a label counts only as a whole name in that list, so 'settings' is not found inside 'saved notes and settings'.
    const named = startOnPage(file, {}).flatMap((warning) => warning.slice(guard.length + 2).split(' skipped because ')[0].split(', '))
    for (const [name, { label }] of Object.entries(FEATURES).filter(([, { needs }]) => Object.keys(needs).length > 0)) assert.ok(named.includes(label), `no warning turns ${name} (${label}) off`)
  })
}
