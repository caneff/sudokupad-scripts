'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { withInertTab, ignoreKey } = require('./no-tab-letters.user.js')

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
  const source = fs.readFileSync(path.join(__dirname, 'no-tab-letters.user.js'), 'utf8')
  assert.match(source, /^\/\/ @name\s+SudokuPad No Tab Letters$/m)
  assert.match(source, /^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/caneff\/sudokupad-scripts\/main\/no-tab-letters\.user\.js$/m)
})
