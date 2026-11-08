'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { VERSION, lackingInternals, FEATURES, movedNoticeDismissed, MOVED_KEY, UI_TWEAKS_URL } = require('../no-tab-letters.user.js')

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
