'use strict'
// Spec #1072's closing check, at the `npm test` seam: the six scripts read as siblings. Blind to real SudokuPad (the Framework calls,
// rendering, undo); the live suite and the Tampermonkey test cover those. This file is removed once its run is recorded on the spec.
require('./fake-page-storage.js')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { syncText, readLib, libNamesOnDisk, scriptFiles } = require('../sync-lib.js')
const { loadLib } = require('./load-lib.js')
const { fakeStore } = require('./fake-store.js')

const ROOT = path.join(__dirname, '..')
const SIX = ['auto-rules-resizer', 'color-by-digit', 'dark-page', 'pen-tool-extras', 'text-anywhere', 'ui-tweaks']
const source = (name) => fs.readFileSync(path.join(ROOT, `${name}.user.js`), 'utf8')

test('the six are every SudokuPad script sync-lib knows', () => {
  assert.deepEqual(scriptFiles().map((file) => path.basename(file, '.user.js')).filter((name) => SIX.includes(name)).sort(), SIX)
})

test('five scripts start through the guard\'s one startup helper, and Dark Page catches its own start through the same guard', () => {
  for (const name of SIX.filter((n) => n !== 'dark-page')) assert.match(source(name), /^ {2}guard\.start\(start\b/m, name)
  assert.match(source('dark-page'), /guard\.catchStartup\(start\)/)
  for (const name of SIX) assert.doesNotMatch(source(name), /Framework\.getApp\(\)\.then\(start\)/, name)
})

test('every script copies its shared modules in an order the sync tool accepts', () => {
  for (const name of SIX) assert.deepEqual(syncText(source(name), readLib, libNamesOnDisk()).problems, [], name)
})

test('a Text Anywhere look put back at its fallback leaves no saved key, as the other scripts\' rows do', () => {
  const { saveLook, DEFAULT_WIDTH, WIDTH_KEY } = require('../text-anywhere.user.js')
  const saved = { [WIDTH_KEY]: 3.5 }
  saveLook(fakeStore(saved), 'width', DEFAULT_WIDTH)
  assert.deepEqual(saved, {})
})

test('the shared strict readers take only what they name', () => {
  const { savedBoolean } = loadLib(['settings-table'], ['savedBoolean'])
  assert.deepEqual([true, false, 'true', 1, null].map(savedBoolean), [true, false, undefined, undefined, undefined])
})

test('the names one script reads from another match what the other exports', () => {
  const darkPage = require('../dark-page.user.js')
  assert.equal(darkPage.PEN_TOOL_EXTRAS_TRAY_CLASS, require('../pen-tool-extras.user.js').TRAY_CLASS)
  assert.equal(darkPage.TEXT_ANYWHERE_TRAY_CLASS, require('../text-anywhere.user.js').TRAY_CLASS)
  assert.equal(darkPage.RULES_FONT_BAR_ID, require('../auto-rules-resizer.user.js').FONT_BAR_ID)
  assert.equal(require('../text-anywhere.user.js').DARK_PAGE_COLOR_VAR, darkPage.PAGE_COLOR_VAR)
})
