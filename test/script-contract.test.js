'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
require('./fake-page-storage.js')
const { scriptFiles, publishedScriptFiles, guardId } = require('../sync-lib.js')
const { pageStandIn } = require('./page-stand-in.js')
const { startScript, withScript } = require('./unit-start.js')
const { headerVersion, headerField } = require('../userscript-header.js')

// The startup promises every script makes, checked once for each file `scriptFiles()` lists. Each script's own test file keeps its table of
// which internal holds back which feature; this file holds what is the same for all of them.
// Starts the script on that page with `framework` (undefined: no Framework at all) and returns what it warned.
const startOnPage = (file, framework) => startScript(path.join(__dirname, '..', file), { ...pageStandIn(), Framework: framework }).warnings

// A literal, not tag-pictures.js's RAW, so the headers and RAW are each checked against it rather than against each other.
const LIVE_RAW = 'https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/'

test('RAW, the address the site and tests build on, is the chinstrap45 repo\'s', () => {
  assert.equal(require('../tag-pictures.js').RAW, LIVE_RAW)
})

for (const file of publishedScriptFiles()) {
  test(`${file}: the header updates from its own file in the chinstrap45 repo`, () => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    for (const field of ['updateURL', 'downloadURL']) assert.equal(headerField(source, field), LIVE_RAW + file, field)
  })
}

// @namespace is half of Tampermonkey's script identity, and the frozen handover (draw-tool.user.js) carries this one,
// which Text Anywhere must share; the other scripts keep it too, so no installed copy is matched on a new one.
for (const file of scriptFiles()) {
  test(`${file}: @namespace is the one installed copies were given`, () => {
    assert.equal(headerField(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), 'namespace'), 'https://github.com/caneff/sudokupad-scripts')
  })
}

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

  test(`${id}: the header gives a home page, the repo's issues as the support link and the MIT license, and no @sandbox`, () => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    assert.match(headerField(source, 'homepageURL'), /^https:\/\/chinstrap45\.github\.io\/sudokupad-scripts\/(?:[a-z-]+\.html)?$/)
    assert.equal(headerField(source, 'supportURL'), 'https://github.com/chinstrap45/sudokupad-scripts/issues')
    assert.equal(headerField(source, 'license'), 'MIT')
    assert.doesNotMatch(source.split('// ==/UserScript==')[0], /@sandbox/)
  })

  test(`${id}: the settings feature's label is "settings", and every label is plain lowercase`, () => {
    // Tab is a key's name, Restart a button's and Text Anywhere the script's own, so only those keep a capital.
    for (const [name, { label }] of Object.entries(FEATURES)) assert.match(label.replace(/\b(?:Tab|Restart|Text Anywhere)\b/g, ''), /^[a-z ]+$/, `${name}: ${label}`)
    const settings = FEATURES.settings || FEATURES.editor
    assert.ok(settings, `${id} has no settings feature (keyed settings or editor)`)
    assert.equal(settings.label, 'settings')
  })

  test(`${id}: a page with no Framework is not SudokuPad, so the script starts without a warning`, () => {
    assert.deepEqual(startOnPage(file, undefined), [])
  })

  test(`${id}: a Framework without getApp names getApp in one warning when a feature needs it, and every warning is the script's own`, () => {
    const warnings = startOnPage(file, {})
    const needsGetApp = Object.values(FEATURES).some(({ needs }) => 'Framework.getApp' in needs)
    assert.equal(warnings.filter((warning) => warning.includes('Framework.getApp')).length, needsGetApp ? 1 : 0, warnings.join('\n'))
    for (const warning of warnings) assert.ok(warning.startsWith(`${guard}: `), warning)
  })

  // The settings wiring rule (lib/settings-dialog.js): the settings feature never needs getApp.
  test(`${id}: a Framework without getApp but with every settings call still gets the settings entry`, () => {
    const added = []
    const framework = {
      addSetting: (setting) => added.push(setting.name),
      showDialog () {},
      closeDialog () {},
      getData: () => null,
      setData () {},
      removeData () {},
      app: { tools: { colour: {} } }
    }
    const warnings = startOnPage(file, framework)
    assert.equal(added.length, 1, warnings.join('\n'))
    assert.deepEqual(warnings.filter((warning) => warning.includes(' startup ')), [])
  })

  test(`${id}: a start that throws is reported once under the script's name`, async () => {
    const framework = {
      getApp: () => Promise.resolve({}),
      // Every script's probe reads it, so the throw comes from inside the script's start.
      get getData () { throw new Error('planted') }
    }
    await withScript(path.join(__dirname, '..', file), { ...pageStandIn(), Framework: framework }, async ({ warnings }) => {
      await new Promise((resolve) => setImmediate(resolve))
      assert.deepEqual(warnings.filter((warning) => warning.includes('startup')), [`${guard}: startup skipped because SudokuPad changed: Error: planted`])
    })
  })

  // A feature that needs no internal (`needs: {}`) has none to lack: it turns itself off only when its own work fails.
  test(`${id}: every feature that needs an internal can be lacking, so a Framework with nothing turns each one off`, () => {
    // A warning is `<id>: <label>, <label> skipped because ...`; a label counts only as a whole name in that list, so 'settings' is not found inside 'saved notes and settings'.
    const named = startOnPage(file, {}).flatMap((warning) => warning.slice(guard.length + 2).split(' skipped because ')[0].split(', '))
    for (const [name, { label }] of Object.entries(FEATURES).filter(([, { needs }]) => Object.keys(needs).length > 0)) assert.ok(named.includes(label), `no warning turns ${name} (${label}) off`)
  })
}
