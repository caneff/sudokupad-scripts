'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { VERSION, withInertTab, ignoreKey, isHeldTabToStop, lackingInternals, FEATURES, movedNoticeDismissed, MOVED_KEY, UI_TWEAKS_URL } = require('../no-tab-letters.user.js')

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

test('withInertTab leaves the list it was given as it was', () => {
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

test('the header names the script and points updates at its own file', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'no-tab-letters.user.js'), 'utf8')
  assert.match(source, /^\/\/ @name\s+SudokuPad No Tab Letters$/m)
  assert.match(source, /^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/caneff\/sudokupad-scripts\/main\/no-tab-letters\.user\.js$/m)
})

test('without getApp or the letter tool\'s key list, the Tab feature is lacking, and a SudokuPad that has both lacks nothing', () => {
  const roots = () => ({ Framework: { getApp () {}, app: { tools: {} } }, ToolLetter: { tool: { keyHandlers: [] } } })
  assert.deepEqual(lackingInternals(FEATURES, roots()), new Map())
  for (const remove of [(r) => { delete r.ToolLetter.tool.keyHandlers }, (r) => { delete r.ToolLetter.tool }, (r) => { r.ToolLetter = undefined }]) {
    const broken = roots()
    remove(broken)
    assert.deepEqual(lackingInternals(FEATURES, broken), new Map([['ToolLetter.tool.keyHandlers', ['tab']]]))
  }
  const noApp = roots()
  delete noApp.Framework.getApp
  assert.deepEqual(lackingInternals(FEATURES, noApp), new Map([['Framework.getApp', ['tab']]]))
  const noTools = roots()
  delete noTools.Framework.app.tools
  assert.deepEqual(lackingInternals(FEATURES, noTools), new Map([['Framework.app.tools', ['tab']]]))
})

// Starts the script on a page with `framework` as its Framework; returns the warnings and the notice bar's text, or null for none.
function startWith (framework, { uiTweaks = false } = {}) {
  const file = require.resolve('../no-tab-letters.user.js')
  const inBody = []
  const element = () => {
    const el = { style: {}, children: [], textContent: '', attributes: {}, setAttribute (name, value) { el.attributes[name] = value }, addEventListener () {}, append (...kids) { el.children.push(...kids) }, remove () { el.removed = true } }
    return el
  }
  const textOf = (el) => el.textContent + el.children.map(textOf).join('')
  const saved = { document: global.document, Framework: global.Framework }
  global.document = { createElement: element, body: { append: (el) => inBody.push(el) }, documentElement: { outerHTML: '', hasAttribute: (name) => uiTweaks && name === 'data-ui-tweaks' }, getElementById: () => null }
  global.Framework = framework
  const warnings = []
  const realWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  delete require.cache[file]
  try {
    require(file)
  } finally {
    console.warn = realWarn
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete global[name]
      else global[name] = value
    }
    delete require.cache[file]
  }
  const [bar] = inBody.flatMap((host) => host.children).filter((el) => el.attributes['data-script'] === 'no-tab-letters' && !el.removed)
  const [moved] = inBody.flatMap((host) => host.children).filter((el) => el.attributes['data-script'] === 'no-tab-letters-moved' && !el.removed)
  return { warnings, bar: bar ? textOf(bar) : null, moved: moved ? { text: textOf(moved), href: moved.children.find((kid) => kid.href)?.href } : null }
}

test('a Framework without getApp turns the Tab key off with one warning naming getApp, and the bar names it', () => {
  const page = startWith({})
  assert.deepEqual(page.warnings, ['no-tab-letters: Tab key skipped because SudokuPad has no Framework.getApp'])
  assert.match(page.bar, /^No Tab Letters: Tab key is off — SudokuPad changed\.Report/)
})

test('VERSION is the @version in the script header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, '..', 'no-tab-letters.user.js'), 'utf8')))
})

test('isHeldTabToStop stops only a repeated Tab, while the letter tool is on and no dialog is open', () => {
  const play = { toolOn: true, dialogOpen: false }
  assert.equal(isHeldTabToStop({ key: 'Tab', repeat: true }, play), true, 'held Tab in play')
  assert.equal(isHeldTabToStop({ key: 'Tab', repeat: false }, play), false, 'first Tab is the swapped entry\'s')
  assert.equal(isHeldTabToStop({ key: '/', repeat: true }, play), false, 'another key')
  assert.equal(isHeldTabToStop({ key: 'Tab', repeat: true }, { ...play, dialogOpen: true }), false, 'dialog open')
  assert.equal(isHeldTabToStop({ key: 'Tab', repeat: true }, { ...play, toolOn: false }), false, 'letter tool off')
})

test('the notice that this script is now UI Tweaks shows with an install link, and not once it is dismissed', () => {
  const page = startWith({})
  assert.deepEqual(page.moved, { text: 'No Tab Letters is now UI Tweaks.Install UI Tweaks×', href: UI_TWEAKS_URL })
  assert.equal(UI_TWEAKS_URL, 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/ui-tweaks.user.js')
  assert.equal(startWith({ getData: (key) => (key === MOVED_KEY ? true : null) }).moved, null)
})

test('with UI Tweaks running, no notice shows', () => {
  assert.equal(startWith({}, { uiTweaks: true }).moved, null)
})

test('movedNoticeDismissed: only a saved true counts, and a store with no getData has none', () => {
  assert.equal(movedNoticeDismissed({ getData: () => true }), true)
  for (const value of [null, false, 'true', 1]) assert.equal(movedNoticeDismissed({ getData: () => value }), false, String(value))
  assert.equal(movedNoticeDismissed({}), false)
})
