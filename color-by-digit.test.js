'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { installButton, planColoring, assignDigit, normalizeGroups, groupsFromStored, isVisibleColor, PRELOADS, DEFAULT_GROUPS, VERSION } = require('./color-by-digit.user.js')

const groups = [{ key: 'a', digits: ['1', '2'] }, { key: 'b', digits: ['3'] }]
const plan = (cells, g = groups) => planColoring(cells, g)

test('givens and entered digits both get their group key', () => {
  assert.deepEqual(plan([{ given: '1' }, { value: '3' }]), [
    { index: 0, key: 'a' },
    { index: 1, key: 'b' }
  ])
})

test('pencil marks and empty cells are never touched', () => {
  const cells = [{ pencilMarks: ['1', '2'] }, {}, { value: '' }, { centre: ['3'] }]
  assert.deepEqual(plan(cells), [])
})

test('digits in no group are skipped', () => {
  assert.deepEqual(plan([{ value: '7' }, { given: '9' }]), [])
})

test('values other than digits 0 to 9 are ignored even when a group lists them', () => {
  const g = [{ key: 'a', digits: ['1', '2', '12', 'x', '-1'] }]
  assert.deepEqual(plan([{ value: '12' }, { value: 'x' }, { value: '-1' }, { value: 12 }], g), [])
})

test('a numeric value that is a single digit counts as that digit', () => {
  assert.deepEqual(plan([{ value: 1 }]), [{ index: 0, key: 'a' }])
})

test('a cell already holding its key is skipped', () => {
  assert.deepEqual(plan([{ value: '1', colours: ['a'] }, { value: '1', colours: ['b', 'a'] }]), [])
})

test('a cell holding another color still gets its key', () => {
  assert.deepEqual(plan([{ value: '1', colours: ['b'] }]), [{ index: 0, key: 'a' }])
})

test('an empty list of groups plans nothing', () => {
  assert.deepEqual(plan([{ value: '1' }], []), [])
})

const allDigits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => ({ value: String(d) }))
const byDigit = (g) => plan(allDigits, g).map((p) => p.key).join('')

test('Low/5/High maps 0-4 to slot 9, 5 to slot 1, 6-9 to slot 6', () => {
  assert.equal(byDigit(PRELOADS['Low/5/High']), '9999916666')
})

test('Odd/Even maps odd to slot 6, even and 0 to slot 9', () => {
  assert.equal(byDigit(PRELOADS['Odd/Even']), '9696969696')
})

test('nothing saved yet starts with Odd/Even', () => {
  assert.deepEqual(groupsFromStored(null), PRELOADS['Odd/Even'])
  assert.notEqual(groupsFromStored(null), DEFAULT_GROUPS)
})

test('a saved empty list stays empty, not reset to the default', () => {
  assert.deepEqual(groupsFromStored([]), [])
})

test('malformed saved data falls back to Odd/Even', () => {
  assert.deepEqual(groupsFromStored({ key: 'a' }), PRELOADS['Odd/Even'])
})

test('isVisibleColor rejects every transparent spelling and accepts real colors', () => {
  ['', 'transparent', 'rgba(0, 0, 0, 0)', 'rgba(10,20,30,0)', '#0000', '#00000000', 'hsla(0, 0%, 0%, 0)']
    .forEach((c) => assert.equal(isVisibleColor(c), false, c));
  ['rgb(214, 214, 214)', 'rgba(1,2,3,0.5)', '#fff', '#ffffff', 'red'].forEach((c) => assert.equal(isVisibleColor(c), true, c))
})

test('assigning a digit to a group takes it out of the other group', () => {
  const g = [{ key: 'a', digits: ['1', '2'] }, { key: 'b', digits: ['3'] }]
  assert.deepEqual(assignDigit(g, 1, '2'), [
    { key: 'a', digits: ['1'] },
    { key: 'b', digits: ['2', '3'] }
  ])
})

test('assigning a digit its group already holds removes it', () => {
  const g = [{ key: 'a', digits: ['1', '2'] }]
  assert.deepEqual(assignDigit(g, 0, '1'), [{ key: 'a', digits: ['2'] }])
})

test('assignDigit does not change the list it was given', () => {
  const g = [{ key: 'a', digits: ['1'] }, { key: 'b', digits: [] }]
  assignDigit(g, 1, '1')
  assert.deepEqual(g, [{ key: 'a', digits: ['1'] }, { key: 'b', digits: [] }])
})

test('normalizeGroups rejects malformed saved data and keeps an empty list', () => {
  assert.equal(normalizeGroups(null), null)
  assert.equal(normalizeGroups({}), null)
  assert.equal(normalizeGroups([{ key: 1, digits: [] }]), null)
  assert.deepEqual(normalizeGroups([]), [])
  assert.deepEqual(normalizeGroups([{ key: 'a', digits: ['1', '1', 'x', '2'] }]), [{ key: 'a', digits: ['1', '2'] }])
})

test('normalizeGroups keeps a digit in only its first group', () => {
  assert.deepEqual(
    normalizeGroups([{ key: 'a', digits: ['1', '2'] }, { key: 'b', digits: ['2', '3'] }]),
    [{ key: 'a', digits: ['1', '2'] }, { key: 'b', digits: ['3'] }]
  )
})

test('installButton: adds an icon button titled "Color by digit", then refreshControls so the click handler binds', () => {
  const calls = []
  const click = () => {}
  const framework = { addAppButton: (spec) => calls.push(['add', spec]) }
  const app = { refreshControls: () => calls.push(['refresh']) }
  installButton(framework, app, click)
  assert.deepEqual(calls.map((c) => c[0]), ['add', 'refresh'])
  const spec = calls[0][1]
  assert.equal(spec.name, 'colorbydigit')
  assert.equal(spec.title, 'Color by digit')
  assert.match(spec.content, /^<div class="icon">[\s\S]*<svg[\s\S]*<\/svg><\/div>$/)
  assert.equal(spec.onClick, click)
})

test('entry point: wires the settings entry, the button, refreshControls, and routes a click to coloring', async () => {
  const path = require.resolve('./color-by-digit.user.js')
  const saved = require.cache[path]
  delete require.cache[path]
  const calls = []
  const app = {
    puzzle: { cells: [{ given: '1', colours: [] }], selectedCells: [] },
    act: (a) => calls.push(['act', a.type]),
    deselect: () => {},
    select: () => {},
    refreshControls: () => calls.push(['refresh'])
  }
  global.Framework = {
    getApp: () => Promise.resolve(app),
    getData: () => null,
    setData: () => {},
    addAppButton: (spec) => { calls.push(['button']); global.click = spec.onClick },
    addSetting: () => calls.push(['setting'])
  }
  try {
    require(path)
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(calls.map((c) => c[0]), ['setting', 'button', 'refresh'])
    global.click()
    assert.ok(calls.some((c) => c[0] === 'act' && c[1] === 'colour'))
  } finally {
    delete global.Framework; delete global.click
    delete require.cache[path]
    if (saved) require.cache[path] = saved
  }
})

test('VERSION is the @version in the script header', () => {
  const header = /^\/\/ @version\s+(\S+)\s*$/m.exec(fs.readFileSync(path.join(__dirname, 'color-by-digit.user.js'), 'utf8'))
  assert.notEqual(header, null, 'the script has no @version header')
  assert.equal(VERSION, header[1])
})
