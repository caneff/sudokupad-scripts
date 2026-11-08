'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { fakeStore } = require('./fake-store.js')
const { VERSION, OPTIONS, DEFAULT_OPTIONS, KEYS, savedOptions, saveOptions, READERS, copiedSettings, pastedSettings, buildCss, pastedOptions, lackingInternals, FEATURES } = require('../ui-tweaks.user.js')

test('VERSION matches the @version header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, '..', 'ui-tweaks.user.js'), 'utf8')))
})

test('the defaults: Tab never switches to letters is on, the other two are off', () => {
  assert.deepEqual(DEFAULT_OPTIONS, { tab: true, hideSelect: false, wrapButtons: false })
  assert.deepEqual(OPTIONS.map((o) => o.id), ['tab', 'hideSelect', 'wrapButtons'])
})

test('savedOptions: nothing saved reads as the defaults', () => {
  assert.deepEqual(savedOptions(fakeStore()), DEFAULT_OPTIONS)
})

test('savedOptions: each saved boolean wins over its default, the others keep theirs', () => {
  assert.deepEqual(savedOptions(fakeStore({ [KEYS.tab]: false })), { tab: false, hideSelect: false, wrapButtons: false })
  assert.deepEqual(savedOptions(fakeStore({ [KEYS.hideSelect]: true })), { tab: true, hideSelect: true, wrapButtons: false })
  assert.deepEqual(savedOptions(fakeStore({ [KEYS.wrapButtons]: true })), { tab: true, hideSelect: false, wrapButtons: true })
})

test('savedOptions: a saved value that is not a boolean reads as the default', () => {
  const store = fakeStore({ [KEYS.tab]: 'no', [KEYS.hideSelect]: 1, [KEYS.wrapButtons]: null })
  assert.deepEqual(savedOptions(store), DEFAULT_OPTIONS)
})

test('saveOptions keeps every option as a boolean under its own key, and savedOptions reads them back', () => {
  const store = fakeStore()
  const chosen = { tab: false, hideSelect: true, wrapButtons: true }
  saveOptions(store, chosen)
  assert.deepEqual(store.data, { [KEYS.tab]: false, [KEYS.hideSelect]: true, [KEYS.wrapButtons]: true })
  assert.deepEqual(savedOptions(store), chosen)
})

test('the storage keys are UiTweaks_ names', () => {
  assert.deepEqual(KEYS, { tab: 'UiTweaks_tab', hideSelect: 'UiTweaks_hideSelect', wrapButtons: 'UiTweaks_wrapButtons' })
})

test('copiedSettings: the options in force, defaults included', () => {
  assert.deepEqual(JSON.parse(copiedSettings(fakeStore({ [KEYS.hideSelect]: true, Other_key: 1 }))), { [KEYS.tab]: true, [KEYS.hideSelect]: true, [KEYS.wrapButtons]: false })
})

test('a paste keeps booleans under this script\'s keys and skips the rest', () => {
  const pasted = pastedSettings(JSON.stringify({ [KEYS.tab]: false, [KEYS.hideSelect]: 'yes', Other_key: 1 }), READERS)
  assert.deepEqual(pasted, { values: { [KEYS.tab]: false }, skipped: 1 })
})

test('buildCss: the defaults add no rule', () => {
  assert.equal(buildCss(DEFAULT_OPTIONS), '')
})

test('buildCss: Hide the Toggle Selection button hides only that button, in the bottom row', () => {
  assert.equal(buildCss({ ...DEFAULT_OPTIONS, hideSelect: true }), '.controls-aux [data-control="select"] { display: none !important; }')
})

test('buildCss: Wrap buttons caps the bottom row at five buttons', () => {
  assert.equal(buildCss({ ...DEFAULT_OPTIONS, wrapButtons: true }), '.controls-aux { max-width: 21.6rem; }')
})

test('buildCss: both rules together; Tab adds none', () => {
  const css = buildCss({ tab: false, hideSelect: true, wrapButtons: true })
  assert.equal(css.split('\n').length, 2)
  assert.match(css, /display: none/)
  assert.match(css, /max-width: 21\.6rem/)
})

test('pastedOptions changes only the pasted options, whatever else is ticked in the dialog', () => {
  const saved = { tab: true, hideSelect: false, wrapButtons: false }
  assert.deepEqual(pastedOptions(saved, { [KEYS.tab]: false }), { tab: false, hideSelect: false, wrapButtons: false })
  assert.deepEqual(pastedOptions(saved, { [KEYS.hideSelect]: true, [KEYS.wrapButtons]: true }), { tab: true, hideSelect: true, wrapButtons: true })
  assert.deepEqual(pastedOptions(saved, {}), saved)
  assert.deepEqual(saved, { tab: true, hideSelect: false, wrapButtons: false }, 'the options given are left as they were')
})

test('lackingInternals names the internal a feature lacks', () => {
  const roots = { Framework: { getApp: () => {}, app: { tools: {} } }, ToolLetter: { tool: { keyHandlers: [] } } }
  assert.equal(lackingInternals(FEATURES, roots).size > 0, true, 'the other features need Framework.getData and more')
  assert.deepEqual([...lackingInternals({ tab: FEATURES.tab }, roots)], [])
  assert.deepEqual([...lackingInternals({ tab: FEATURES.tab }, { ...roots, ToolLetter: { tool: {} } })], [['ToolLetter.tool.keyHandlers', ['tab']]])
})

test('the header names the script, points updates at its own file and asks for the menu command grant', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'ui-tweaks.user.js'), 'utf8')
  assert.match(source, /^\/\/ @name\s+SudokuPad UI Tweaks$/m)
  assert.match(source, /^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/caneff\/sudokupad-scripts\/main\/ui-tweaks\.user\.js$/m)
  assert.match(source, /^\/\/ @grant\s+GM_registerMenuCommand$/m)
})
