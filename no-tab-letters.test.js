'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { withoutTabToggle } = require('./no-tab-letters.user.js')

const toggle = () => {}
const typeLetter = () => {}
const catchAll = () => true
// The three entries tool-letter.js declares, in its order.
const letterHandlers = () => [
  { key: '/', handler: toggle },
  { key: 'Tab', handler: toggle },
  { key: catchAll, handler: typeLetter }
]

test('withoutTabToggle drops the Tab entry and keeps "/" and the entry that types letters', () => {
  assert.deepEqual(withoutTabToggle(letterHandlers()), [
    { key: '/', handler: toggle },
    { key: catchAll, handler: typeLetter }
  ])
})

test('withoutTabToggle leaves the list it was given as it was', () => {
  const given = letterHandlers()
  withoutTabToggle(given)
  assert.deepEqual(given, letterHandlers())
})

test('withoutTabToggle keeps a Tab entry bound to some other handler', () => {
  const other = () => {}
  const given = [{ key: '/', handler: toggle }, { key: 'Tab', handler: toggle }, { key: 'Tab', handler: other }]
  assert.deepEqual(withoutTabToggle(given), [{ key: '/', handler: toggle }, { key: 'Tab', handler: other }])
})

test('withoutTabToggle drops every Tab entry bound to the toggle', () => {
  const given = [{ key: '/', handler: toggle }, { key: 'Tab', handler: toggle }, { key: 'Tab', handler: toggle }]
  assert.deepEqual(withoutTabToggle(given), [{ key: '/', handler: toggle }])
})

test('withoutTabToggle returns null when no Tab entry is bound to the toggle', () => {
  assert.equal(withoutTabToggle([{ key: '/', handler: toggle }, { key: catchAll, handler: typeLetter }]), null, 'no Tab entry')
  assert.equal(withoutTabToggle([{ key: 'Tab', handler: toggle }]), null, 'no "/" entry to name the toggle')
  assert.equal(withoutTabToggle([{ key: '/', handler: toggle }, { key: 'Tab', handler: typeLetter }]), null, 'Tab bound to something else')
})

test('withoutTabToggle returns null for no list, an empty list, or something else', () => {
  for (const given of [undefined, null, [], {}, 'Tab']) assert.equal(withoutTabToggle(given), null, String(given))
})

test('the header names the script and points updates at its own file', () => {
  const source = fs.readFileSync(path.join(__dirname, 'no-tab-letters.user.js'), 'utf8')
  assert.match(source, /^\/\/ @name\s+SudokuPad No Tab Letters$/m)
  assert.match(source, /^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/caneff\/sudokupad-scripts\/main\/no-tab-letters\.user\.js$/m)
})
