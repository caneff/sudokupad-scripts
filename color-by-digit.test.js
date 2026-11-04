'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { installButton, planColoring, planAuto, groupKeys, givenIndices, isEditAction, editSignature, changedIndices, autoBoxHtml, readCentreMarks, toPlanCell, assignDigit, normalizeGroups, groupsFromStored, isVisibleColor, layoutPages, layoutColors, initialPage, renderEditor, PRELOADS, DEFAULT_GROUPS, VERSION } = require('./color-by-digit.user.js')

const groups = [{ key: 'a', digits: ['1', '2'] }, { key: 'b', digits: ['3'] }]
const plan = (cells, g = groups) => planColoring(cells, g)

test('givens and entered digits both get their group key', () => {
  assert.deepEqual(plan([{ given: '1' }, { value: '3' }]), [
    { index: 0, key: 'a' },
    { index: 1, key: 'b' }
  ])
})

test('empty cells are never touched', () => {
  const cells = [{}, { value: '' }, { value: '', centre: [] }]
  assert.deepEqual(plan(cells), [])
})

const centreGroups = [{ key: 'a', digits: ['1', '2'] }, { key: 'b', digits: ['3', '4'] }]
const centre = (marks, extra = {}) => plan([{ centre: marks, ...extra }], centreGroups)

test('an empty cell whose centre marks all sit in one group gets that group\'s key', () => {
  assert.deepEqual(centre(['1', '2']), [{ index: 0, key: 'a' }])
  assert.deepEqual(centre(['4', '3']), [{ index: 0, key: 'b' }])
})

test('one centre mark counts', () => {
  assert.deepEqual(centre(['3']), [{ index: 0, key: 'b' }])
})

test('centre marks spanning two groups leave the cell alone', () => {
  assert.deepEqual(centre(['1', '3']), [])
})

test('a centre mark in no group leaves the cell alone, even beside marks of one group', () => {
  assert.deepEqual(centre(['1', '7']), [])
  assert.deepEqual(centre(['7']), [])
})

test('a non-digit centre mark leaves the cell alone', () => {
  const g = [{ key: 'a', digits: ['1', 'x'] }]
  assert.deepEqual(plan([{ centre: ['1', 'x'] }, { centre: ['1', '12'] }], g), [])
})

test('a given or entered digit decides the color and its centre marks are ignored', () => {
  assert.deepEqual(centre(['1', '2'], { value: '3' }), [{ index: 0, key: 'b' }])
  assert.deepEqual(centre(['3'], { given: '1' }), [{ index: 0, key: 'a' }])
  assert.deepEqual(centre(['1'], { given: '7' }), [])
})

test('a cell with centre marks that already holds the key is skipped, and one holding another color still gets it', () => {
  assert.deepEqual(centre(['1'], { colours: ['a'] }), [])
  assert.deepEqual(centre(['1'], { colours: ['b'] }), [{ index: 0, key: 'a' }])
})

test('readCentreMarks gives the visible centre marks, and none for a cell whose centre marks are hidden', () => {
  const cell = (visible, marks) => ({ propVisible: (p) => p === 'centre' && visible, propGet: (p) => (p === 'centre' ? marks : []) })
  assert.deepEqual(readCentreMarks(cell(true, ['6', '7', '9'])), ['6', '7', '9'])
  assert.deepEqual(readCentreMarks(cell(false, ['6'])), [])
})

test('toPlanCell keeps the digit, colors and visible centre marks, and drops corner marks', () => {
  const cell = { given: null, value: '', colours: ['a'], pencilmarks: ['1', '2'], propVisible: () => true, propGet: () => ['3'] }
  assert.deepEqual(toPlanCell(cell), { given: null, value: '', colours: ['a'], centre: ['3'] })
  assert.deepEqual(plan([toPlanCell({ ...cell, colours: [], propGet: () => [] })]), [])
})

test('toPlanCell gives no centre marks for a cell that hides them, so its hidden marks color nothing', () => {
  const hidden = { value: '', colours: [], propVisible: () => false, propGet: () => ['1'] }
  assert.deepEqual(plan([toPlanCell(hidden)], centreGroups), [])
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

test('Low/5/High maps 0-4 to key 1, 5 to key 5, 6-9 to key 9', () => {
  assert.equal(byDigit(PRELOADS['Low/5/High']), '1111159999')
})

test('Odd/Even maps odd to key 1, even and 0 to key 2', () => {
  assert.equal(byDigit(PRELOADS['Odd/Even']), '2121212121')
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

// Auto mode: which colors come off and go on when cells change. Cells are plan cells.
const autoGroups = [{ key: 'a', digits: ['1', '2'] }, { key: 'b', digits: ['3'] }]
const auto = (cells, indices = cells.map((_, i) => i), g = autoGroups, managed) => planAuto(cells, g, indices, managed)

test('auto: a pure cell gets its group color', () => {
  assert.deepEqual(auto([{ value: '1' }, { centre: ['3'] }]), [
    { action: 'add', key: 'a', indices: [0] },
    { action: 'add', key: 'b', indices: [1] }
  ])
})

test('auto: a pure cell loses another group\'s color and gets its own, removals first', () => {
  assert.deepEqual(auto([{ value: '1', colours: ['b'] }]), [
    { action: 'remove', key: 'b', indices: [0] },
    { action: 'add', key: 'a', indices: [0] }
  ])
})

test('auto: a pure cell that already holds its color and no other group color changes nothing', () => {
  assert.deepEqual(auto([{ value: '1', colours: ['a'] }]), [])
})

test('auto: a cell that is not pure loses every group color, whoever painted it', () => {
  assert.deepEqual(auto([{ colours: ['a', 'b'] }, { value: '7', colours: ['a'] }, { centre: ['1', '3'], colours: ['b'] }]), [
    { action: 'remove', key: 'a', indices: [0, 1] },
    { action: 'remove', key: 'b', indices: [0, 2] }
  ])
})

test('auto: a color in no group stays, on a pure cell and on one that is not', () => {
  assert.deepEqual(auto([{ value: '1', colours: ['z'] }, { colours: ['z'] }]), [{ action: 'add', key: 'a', indices: [0] }])
})

test('auto: corner marks are not part of a plan cell, so they never decide', () => {
  assert.deepEqual(auto([{ value: '1', pencilmarks: ['3'] }]), [{ action: 'add', key: 'a', indices: [0] }])
})

test('auto: only the listed cells are planned', () => {
  assert.deepEqual(auto([{ value: '1' }, { value: '1' }], [1]), [{ action: 'add', key: 'a', indices: [1] }])
})

test('auto: managed keys beyond the groups (an old group\'s) come off every listed cell', () => {
  assert.deepEqual(auto([{ value: '1', colours: ['old'] }, { colours: ['old', 'z'] }], undefined, autoGroups, ['a', 'b', 'old']), [
    { action: 'remove', key: 'old', indices: [0, 1] },
    { action: 'add', key: 'a', indices: [0] }
  ])
})

test('auto: groupKeys lists each group\'s key once', () => {
  assert.deepEqual(groupKeys([{ key: 'a', digits: [] }, { key: 'b', digits: [] }, { key: 'a', digits: [] }]), ['a', 'b'])
})

test('auto: givenIndices lists the cells with a given digit', () => {
  assert.deepEqual(givenIndices([{ given: '5' }, { value: '3' }, { given: '' }, { given: 7 }]), [0, 3])
})

test('auto: digits, centre marks and clears of them are edits; corner marks, colors, pen and undo are not', () => {
  const edit = (type, arg) => isEditAction({ type, arg })
  assert.equal(edit('value', '4'), true)
  assert.equal(edit('candidates', '4'), true)
  assert.equal(edit('clear', 'normal'), true)
  assert.equal(edit('clear', 'centre'), true)
  assert.equal(edit('pencilmarks', '4'), false)
  assert.equal(edit('colour', '1'), false)
  assert.equal(edit('clear', 'colour'), false)
  assert.equal(edit('clear', 'pen'), false)
  assert.equal(edit('undo'), false)
  assert.equal(isEditAction('vl:4'), false)
  assert.equal(isEditAction(undefined), false)
})

test('auto: the edit signature moves with the digit and the centre marks, not their order, and ignores corner marks and colors', () => {
  const sig = editSignature
  assert.equal(sig({ centre: ['2', '1'] }), sig({ centre: ['1', '2'] }))
  assert.notEqual(sig({ value: '1' }), sig({ value: '2' }))
  assert.notEqual(sig({ centre: ['1'] }), sig({ centre: ['1', '2'] }))
  assert.equal(sig({ value: '1', colours: ['a'], pencilmarks: ['5'] }), sig({ value: '1' }))
})

test('auto: changedIndices lists the positions whose signature differs', () => {
  assert.deepEqual(changedIndices(['a', 'b', 'c'], ['a', 'x', 'y']), [1, 2])
  assert.deepEqual(changedIndices(['a'], ['a']), [])
})

test('auto: the button box shows its state in aria-checked and a check mark', () => {
  assert.match(autoBoxHtml(true), /aria-checked="true"[\s\S]*&#10003;/)
  assert.match(autoBoxHtml(false), /aria-checked="false"/)
  assert.doesNotMatch(autoBoxHtml(false), /&#10003;/)
})

test('auto: installButton draws the box at the value it is given', () => {
  const content = (on) => { let spec; installButton({ addAuxButton: (x) => { spec = x } }, { refreshControls: () => {} }, () => {}, on); return spec.content }
  assert.match(content(true), /aria-checked="true"/)
  assert.match(content(false), /aria-checked="false"/)
})

test('auto: the dialog box opens at the draft it is given', () => {
  assert.match(renderEditor([], [], [], true), /data-role="auto-draft" checked/)
  assert.doesNotMatch(renderEditor([], [], []), /data-role="auto-draft" checked/)
})

test('installButton: adds an aux-row icon button titled "Color by digit", then refreshControls so the click handler binds', () => {
  const calls = []
  const click = () => {}
  const framework = {
    addAuxButton: (spec) => calls.push(['add', spec]),
    addAppButton: () => calls.push(['wrong row'])
  }
  const app = { refreshControls: () => calls.push(['refresh']) }
  installButton(framework, app, click)
  assert.deepEqual(calls.map((c) => c[0]), ['add', 'refresh'])
  const spec = calls[0][1]
  assert.equal(spec.name, 'colorbydigit')
  assert.equal(spec.title, 'Color by digit')
  assert.match(spec.content, /^<div class="icon"[^>]*>[\s\S]*<svg[\s\S]*<\/svg><span data-role="auto"[\s\S]*<\/span><\/div>$/)
  assert.equal(spec.onClick, click)
})

test('entry point: wires the settings entry, the button, refreshControls, and routes a click to coloring', async () => {
  const path = require.resolve('./color-by-digit.user.js')
  const saved = require.cache[path]
  delete require.cache[path]
  const calls = []
  const app = {
    puzzle: { cells: [{ given: '1', colours: [], propVisible: () => false, propGet: () => [] }], selectedCells: [] },
    act: (a) => calls.push(['act', a.type]),
    deselect: () => {},
    select: () => {},
    on: () => {},
    refreshControls: () => calls.push(['refresh'])
  }
  global.document = { addEventListener: () => {} }
  global.Framework = {
    getApp: () => Promise.resolve(app),
    getData: () => null,
    setData: () => {},
    addAuxButton: (spec) => { calls.push(['button']); global.click = spec.onClick },
    addSetting: () => calls.push(['setting'])
  }
  try {
    require(path)
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(calls.map((c) => c[0]), ['setting', 'button', 'refresh'])
    global.click()
    assert.ok(calls.some((c) => c[0] === 'act' && c[1] === 'colour'))
  } finally {
    delete global.Framework; delete global.click; delete global.document
    delete require.cache[path]
    if (saved) require.cache[path] = saved
  }
})

// A page is ten keys: the key at index K sits on SudokuPad's button K. Each key's color is its own name here.
const colorOf = (key) => (key === 'clear' ? 'transparent' : `#${key}`)
const keys = (names) => names.split(' ')
const slotKeys = (slots) => slots.map((s) => (s ? s.key : null))

test('layoutPages puts indices 1-9 in rows of three, in the order of SudokuPad\'s buttons', () => {
  const [page] = layoutPages([keys('clear a1 a2 a3 a4 a5 a6 a7 a8 a9')], 0, colorOf)
  assert.deepEqual(page.rows.map(slotKeys), [['a1', 'a2', 'a3'], ['a4', 'a5', 'a6'], ['a7', 'a8', 'a9']])
})

test('layoutPages keeps a visible color at index 0 on its own, and null when index 0 is transparent', () => {
  const [lit, dark] = layoutPages([keys('z a1 a2 a3 a4 a5 a6 a7 a8 a9'), keys('clear a1 a2 a3 a4 a5 a6 a7 a8 a9')], 0, colorOf)
  assert.deepEqual(lit.zero, { key: 'z', value: '#z' })
  assert.equal(lit.rows[0][0].key, 'a1')
  assert.equal(dark.zero, null)
})

test('layoutPages leaves a transparent slot empty and every other color where it was', () => {
  const [page] = layoutPages([keys('clear a1 clear a3 a4 a5 a6 a7 a8 a9')], 0, colorOf)
  assert.deepEqual(slotKeys(page.rows[0]), ['a1', null, 'a3'])
  assert.deepEqual(slotKeys(page.rows[1]), ['a4', 'a5', 'a6'])
})

test('layoutPages leaves a slot empty when the page is short or the key is unreadable', () => {
  const unreadable = (key) => (key === 'bad' ? '' : `#${key}`)
  const [page] = layoutPages([keys('a0 a1 bad')], 0, unreadable)
  assert.deepEqual(page.rows.map(slotKeys), [['a1', null, null], [null, null, null], [null, null, null]])
  assert.deepEqual(page.zero, { key: 'a0', value: '#a0' })
})

test('layoutPages reads any number of pages, numbering them from 0 and marking the current one', () => {
  const pages = [0, 1, 2, 3].map((p) => keys(`p${p}z p${p}a p${p}b p${p}c p${p}d p${p}e p${p}f p${p}g p${p}h p${p}i`))
  const out = layoutPages(pages, 2, colorOf)
  assert.deepEqual(out.map((p) => p.page), [0, 1, 2, 3])
  assert.deepEqual(out.map((p) => p.current), [false, false, true, false])
  assert.equal(out[3].rows[2][2].key, 'p3i')
})

test('layoutPages of no pages is empty', () => {
  assert.deepEqual(layoutPages([], 0, colorOf), [])
})

test('layoutColors lists the visible colors page by page, index 0 first', () => {
  const pages = layoutPages([keys('z a1 clear a3 a4 a5 a6 a7 a8 a9'), keys('clear b1 b2')], 0, colorOf)
  assert.deepEqual(layoutColors(pages).map((c) => c.key), ['z', 'a1', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'b1', 'b2'])
})

const count = (html, re) => (html.match(re) || []).length

const twoPages = () => layoutPages([keys('z a1 a2 a3 a4 a5 a6 a7 a8 a9'), keys('clear b1 b2 b3 b4 b5 b6 b7 b8 b9')], 1, colorOf)

test('initialPage opens on the page that holds the key', () => {
  assert.equal(initialPage(twoPages(), 'a4'), 0)
  assert.equal(initialPage(twoPages(), 'b4'), 1)
  assert.equal(initialPage(twoPages(), 'z'), 0)
})

test('initialPage tries the current page first when the key is on several pages', () => {
  const pages = layoutPages([keys('clear a1 shared'), keys('clear b1 shared'), keys('clear c1 shared')], 1, colorOf)
  assert.equal(initialPage(pages, 'shared'), 1)
  const other = layoutPages([keys('clear a1 shared'), keys('clear b1'), keys('clear c1 shared')], 1, colorOf)
  assert.equal(initialPage(other, 'shared'), 0)
})

test('initialPage opens on the current page when no page holds the key, and on the first page with none current', () => {
  assert.equal(initialPage(twoPages(), 'nope'), 1)
  assert.equal(initialPage(layoutPages([keys('clear a1'), keys('clear b1')], 5, colorOf), 'nope'), 0)
  assert.equal(initialPage([], 'a'), 0)
})

const options = (html) => [...html.matchAll(/<option value="(\d+)"( selected)?>([^<]*)<\/option>/g)].map((m) => [m[1], Boolean(m[2]), m[3]])

test('renderEditor gives each group a page pulldown labelled Page 1, Page 2 (current), with the shown page selected', () => {
  const html = renderEditor([{ key: 'a2', digits: [] }], twoPages(), [0])
  assert.deepEqual(options(html), [['0', true, 'Page 1'], ['1', false, 'Page 2 (current)']])
  assert.equal(count(html, /<select data-act="page" data-group="0"/g), 1)
})

test('renderEditor draws only the shown page of a group, keeping data-act and data-key on every swatch', () => {
  const first = renderEditor([{ key: 'a2', digits: [] }], twoPages(), [0])
  assert.equal(count(first, /data-act="color"/g), 10)
  assert.equal(count(first, /data-act="color"[^>]*data-key="z"/g), 1)
  assert.equal(count(first, /data-key="b1"/g), 0)
  const second = renderEditor([{ key: 'a2', digits: [] }], twoPages(), [1])
  assert.equal(count(second, /data-act="color"/g), 9)
  assert.equal(count(second, /data-key="b1"/g), 1)
  assert.equal(count(second, /data-key="a1"/g), 0)
})

test('renderEditor shows each group on its own page', () => {
  const html = renderEditor([{ key: 'a2', digits: [] }, { key: 'b2', digits: [] }], twoPages(), [0, 1])
  assert.equal(count(html, /data-group="0"[^>]*data-key="a1"/g), 1)
  assert.equal(count(html, /data-group="1"[^>]*data-key="b1"/g), 1)
  assert.equal(count(html, /data-group="0"[^>]*data-key="b1"/g), 0)
})

test('renderEditor shows the group\'s color beside the pulldown even when its page is not shown', () => {
  const html = renderEditor([{ key: 'b2', digits: [] }], twoPages(), [0])
  assert.match(html, /data-role="chosen"[^>]*title="b2"[^>]*background:#b2/)
  assert.equal(count(html, /aria-pressed="true"/g), 0)
})

test('renderEditor draws an empty slot as a spacer with no button, so nothing shifts', () => {
  const pages = layoutPages([keys('clear a1 clear a3 a4 a5 a6 a7 a8 a9')], 0, colorOf)
  const html = renderEditor([{ key: 'a1', digits: [] }], pages, [0])
  assert.equal(count(html, /data-act="color"/g), 8)
  assert.equal(count(html, /data-empty="slot"/g), 1)
})

test('renderEditor marks only the group\'s own color as selected', () => {
  const pages = layoutPages([keys('clear a1 a2 a3 a4 a5 a6 a7 a8 a9')], 0, colorOf)
  const html = renderEditor([{ key: 'a2', digits: [] }], pages, [0])
  assert.equal(count(html, /aria-pressed="true"/g), 1)
  assert.match(html, /data-key="a2"[^>]*aria-pressed="true"/)
})

test('renderEditor keeps the "No palette colors found" note, and draws no pulldown, when no page has a color', () => {
  const html = renderEditor([], layoutPages([], 0, colorOf), [])
  assert.match(html, /No palette colors found/)
  assert.equal(count(html, /data-act="color"/g), 0)
  assert.equal(count(renderEditor([], layoutPages([keys('a b')], 0, colorOf), []), /No palette colors found/g), 0)
  assert.equal(count(renderEditor([{ key: 'a', digits: [] }], layoutPages([], 0, colorOf), [0]), /<select/g), 0)
})

test('the Preload row lists only real presets, and a Clear all button sits beside it', () => {
  assert.deepEqual(Object.keys(PRELOADS), ['Low/5/High', 'Odd/Even'])
  assert.deepEqual(Object.keys(PRELOADS).filter((name) => PRELOADS[name].length === 0), [])
  const html = renderEditor([], layoutPages([], 0, colorOf), [])
  assert.equal(count(html, /data-act="preload"/g), 2)
  assert.doesNotMatch(html, /data-name="Custom"/)
  assert.equal(count(html, /data-act="clear"[^>]*>Clear all</g), 1)
})

test('VERSION is the @version in the script header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, 'color-by-digit.user.js'), 'utf8')))
})
