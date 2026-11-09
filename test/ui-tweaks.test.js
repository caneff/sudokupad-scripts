'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { fakeStore } = require('./fake-store.js')
const { VERSION, OPTIONS, DEFAULT_OPTIONS, savedOptions, saveOptions, READERS, copiedSettings, pastedSettings, buildCss, pastedOptions, withInertTab, ignoreKey, isHeldTabToStop, lackingInternals, FEATURES } = require('../ui-tweaks.user.js')

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
  assert.deepEqual(savedOptions(fakeStore({ UiTweaks_tab: false })), { tab: false, hideSelect: false, wrapButtons: false })
  assert.deepEqual(savedOptions(fakeStore({ UiTweaks_hideSelect: true })), { tab: true, hideSelect: true, wrapButtons: false })
  assert.deepEqual(savedOptions(fakeStore({ UiTweaks_wrapButtons: true })), { tab: true, hideSelect: false, wrapButtons: true })
})

test('savedOptions: a saved value that is not a boolean reads as the default', () => {
  const store = fakeStore({ UiTweaks_tab: 'no', UiTweaks_hideSelect: 1, UiTweaks_wrapButtons: null })
  assert.deepEqual(savedOptions(store), DEFAULT_OPTIONS)
})

test('saveOptions keeps every option as a boolean under its own key, and savedOptions reads them back', () => {
  const store = fakeStore()
  const chosen = { tab: false, hideSelect: true, wrapButtons: true }
  saveOptions(store, chosen)
  assert.deepEqual(store.data, { UiTweaks_tab: false, UiTweaks_hideSelect: true, UiTweaks_wrapButtons: true })
  assert.deepEqual(savedOptions(store), chosen)
})

test('the storage keys are UiTweaks_ names', () => {
  assert.deepEqual(Object.fromEntries(OPTIONS.map((option) => [option.id, option.key])), { tab: 'UiTweaks_tab', hideSelect: 'UiTweaks_hideSelect', wrapButtons: 'UiTweaks_wrapButtons' })
})

test('copiedSettings: the options in force, defaults included', () => {
  assert.deepEqual(JSON.parse(copiedSettings(fakeStore({ UiTweaks_hideSelect: true, Other_key: 1 }))), { UiTweaks_tab: true, UiTweaks_hideSelect: true, UiTweaks_wrapButtons: false })
})

test('a paste keeps booleans under this script\'s keys and skips the rest', () => {
  const pasted = pastedSettings(JSON.stringify({ UiTweaks_tab: false, UiTweaks_hideSelect: 'yes', Other_key: 1 }), READERS)
  assert.deepEqual(pasted, { values: { UiTweaks_tab: false }, skipped: 1 })
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
  assert.deepEqual(pastedOptions(saved, { UiTweaks_tab: false }), { tab: false, hideSelect: false, wrapButtons: false })
  assert.deepEqual(pastedOptions(saved, { UiTweaks_hideSelect: true, UiTweaks_wrapButtons: true }), { tab: true, hideSelect: true, wrapButtons: true })
  assert.deepEqual(pastedOptions(saved, {}), saved)
  assert.deepEqual(saved, { tab: true, hideSelect: false, wrapButtons: false }, 'the options given are left as they were')
})

const toggle = () => {}
const typeLetter = () => {}
const inert = () => {}
const catchAll = () => true
// The three entries tool-letter.js declares, in its order.
const letterHandlers = () => [
  { key: '/', handler: toggle },
  { key: 'Tab', handler: toggle },
  { key: catchAll, handler: typeLetter }
]

test('withInertTab gives the Tab entry the inert handler and keeps "/" and the entry that types letters', () => {
  assert.deepEqual(withInertTab(letterHandlers(), inert), [
    { key: '/', handler: toggle },
    { key: 'Tab', handler: inert },
    { key: catchAll, handler: typeLetter }
  ])
})

test('withInertTab leaves the list it was given as it was, so it can be put back', () => {
  const given = letterHandlers()
  withInertTab(given, inert)
  assert.deepEqual(given, letterHandlers())
})

test('withInertTab keeps a Tab entry bound to some other handler', () => {
  const other = () => {}
  const given = [{ key: '/', handler: toggle }, { key: 'Tab', handler: toggle }, { key: 'Tab', handler: other }]
  assert.deepEqual(withInertTab(given, inert), [{ key: '/', handler: toggle }, { key: 'Tab', handler: inert }, { key: 'Tab', handler: other }])
})

test('withInertTab changes every Tab entry bound to the toggle', () => {
  const given = [{ key: '/', handler: toggle }, { key: 'Tab', handler: toggle }, { key: 'Tab', handler: toggle }]
  assert.deepEqual(withInertTab(given, inert), [{ key: '/', handler: toggle }, { key: 'Tab', handler: inert }, { key: 'Tab', handler: inert }])
})

test('withInertTab returns null when no Tab entry is bound to the toggle', () => {
  assert.equal(withInertTab([{ key: '/', handler: toggle }, { key: catchAll, handler: typeLetter }], inert), null, 'no Tab entry')
  assert.equal(withInertTab([{ key: 'Tab', handler: toggle }], inert), null, 'no "/" entry to name the toggle')
  assert.equal(withInertTab([{ key: '/', handler: toggle }, { key: 'Tab', handler: typeLetter }], inert), null, 'Tab bound to something else')
})

test('withInertTab returns null for no list, an empty list, or something else', () => {
  for (const given of [undefined, null, [], {}, 'Tab']) assert.equal(withInertTab(given, inert), null, String(given))
})

test('ignoreKey stops the key\'s default and nothing else', () => {
  const calls = []
  const result = ignoreKey({ preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation') })
  assert.deepEqual(calls, ['preventDefault'])
  assert.equal(result, undefined, 'a truthy return would tell SudokuPad the key is handled')
})

test('isHeldTabToStop stops only a repeated Tab, while the letter tool is on and no dialog is open', () => {
  const play = { toolOn: true, dialogOpen: false }
  assert.equal(isHeldTabToStop({ key: 'Tab', repeat: true }, play), true, 'held Tab in play')
  assert.equal(isHeldTabToStop({ key: 'Tab', repeat: false }, play), false, 'first Tab is the swapped entry\'s')
  assert.equal(isHeldTabToStop({ key: '/', repeat: true }, play), false, 'another key')
  assert.equal(isHeldTabToStop({ key: 'Tab', repeat: true }, { ...play, dialogOpen: true }), false, 'dialog open')
  assert.equal(isHeldTabToStop({ key: 'Tab', repeat: true }, { ...play, toolOn: false }), false, 'letter tool off')
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
