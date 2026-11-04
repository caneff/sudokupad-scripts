'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { installButton, planColoring, planAuto, groupKeys, givenIndices, isEntryAction, entrySignature, changedIndices, autoBoxHtml, readCentreMarks, toPlanCell, assignDigit, normalizeGroups, stateFromStored, addProfile, deleteProfile, moveProfile, setActive, setActiveGroups, activeGroups, dropIndex, iconLayout, inkFor, planSwitch, iconHtml, renderProfiles, renderMenu, isVisibleColor, layoutPages, layoutColors, initialPage, renderEditor, PRELOADS, MAX_PROFILES, ICON_TOP, ARROW_START, ICON_MAX_GROUPS, VERSION } = require('./color-by-digit.user.js')

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

const LOW = PRELOADS['Low/5/High']
const ODD = PRELOADS['Odd/Even']
const names = (state) => state.profiles.map((p) => p.name)

test('a fresh install has Low/5/High then Odd/Even, with Low/5/High active', () => {
  const state = stateFromStored(null, null)
  assert.deepEqual(names(state), ['Low/5/High', 'Odd/Even'])
  assert.equal(state.active, 0)
  assert.deepEqual(activeGroups(state), LOW)
})

test('a fresh install returns copies, so editing one never edits the presets', () => {
  const state = stateFromStored(null, null)
  state.profiles[0].groups[0].digits.push('x')
  assert.deepEqual(PRELOADS['Low/5/High'][0].digits, ['0', '1', '2', '3', '4'])
  assert.deepEqual(stateFromStored(null, null).profiles[0].groups, LOW)
})

test('saved groups equal to a preload make that preload the active profile, beside the other preload', () => {
  const state = stateFromStored(null, cloneOf(ODD))
  assert.deepEqual(names(state), ['Low/5/High', 'Odd/Even'])
  assert.equal(state.active, 1)
  assert.deepEqual(activeGroups(stateFromStored(undefined, cloneOf(LOW))), LOW)
  assert.equal(stateFromStored(undefined, cloneOf(LOW)).active, 0)
})

test('saved groups that equal no preload become the active profile named Custom, first, beside both preloads, even when empty', () => {
  const mine = [{ key: '3', digits: ['1', '2'] }]
  assert.deepEqual(stateFromStored(null, mine), { profiles: [{ name: 'Custom', groups: mine }, { name: 'Low/5/High', groups: LOW }, { name: 'Odd/Even', groups: ODD }], active: 0 })
  assert.deepEqual(stateFromStored(null, []).profiles[0], { name: 'Custom', groups: [] })
})

test('saved groups are cleaned on the way in: a digit in two groups stays in the first, a stray digit drops, and an unequal result is Custom', () => {
  const messy = [{ key: '1', digits: ['1', '2', 'x'] }, { key: '2', digits: ['2', '3'] }]
  assert.deepEqual(stateFromStored(null, messy).profiles[0], { name: 'Custom', groups: [{ key: '1', digits: ['1', '2'] }, { key: '2', digits: ['3'] }] })
  assert.deepEqual(stateFromStored(null, [{ key: '1', digits: ['1', '3', '5', '7', '9', 'x'] }, { key: '2', digits: ['0', '2', '4', '6', '8'] }]).active, 1)
})

test('saved groups that are not a list of groups, and no profiles, fall back to a fresh install', () => {
  assert.deepEqual(stateFromStored(null, { key: 'a' }), stateFromStored(null, null))
})

test('saved profiles win over saved groups, keeping their order and active one', () => {
  const saved = { profiles: [{ name: 'A', groups: [] }, { name: 'B', groups: LOW }], active: 1 }
  assert.deepEqual(stateFromStored(saved, cloneOf(ODD)), saved)
})

test('saved profiles are untrusted: with none usable they fall back, and an extra past four drops', () => {
  const fresh = stateFromStored(null, null)
  for (const bad of [{}, { profiles: [] }, { profiles: 'x', active: 0 }, { profiles: [{ name: 3, groups: [] }], active: 0 }, { profiles: [{ name: 'A', groups: 'x' }], active: 0 }, { profiles: [{ name: '  ', groups: [] }], active: 0 }]) {
    assert.deepEqual(stateFromStored(bad, null), fresh)
  }
  const five = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ name, groups: [] }))
  assert.deepEqual(names(stateFromStored({ profiles: five, active: 3 }, null)), ['a', 'b', 'c', 'd'])
})

test('one unusable saved profile drops out and the others are kept, the active one staying the same profile', () => {
  const saved = { profiles: [{ name: 'A', groups: [] }, { name: '', groups: [] }, { name: 'C', groups: LOW }, { name: 'D', groups: 'x' }], active: 2 }
  const state = stateFromStored(saved, cloneOf(ODD))
  assert.deepEqual(names(state), ['A', 'C'])
  assert.equal(state.active, 1)
  assert.equal(stateFromStored({ ...saved, active: 1 }, null).active, 0)
})

test('an active index that is no profile becomes the first: out of range, negative, fractional or missing', () => {
  const two = [{ name: 'A', groups: [] }, { name: 'B', groups: [] }]
  for (const active of [9, -1, 1.5, undefined, '1']) assert.equal(stateFromStored({ profiles: two, active }, null).active, 0, String(active))
  assert.equal(stateFromStored({ profiles: two, active: 1 }, null).active, 1)
})

function cloneOf (value) { return JSON.parse(JSON.stringify(value)) }

const three = { profiles: [{ name: 'A', groups: LOW }, { name: 'B', groups: ODD }, { name: 'C', groups: [] }], active: 1 }

test('addProfile appends a copy of the active profile under the trimmed name, and leaves the active one alone', () => {
  const next = addProfile(three, '  Mine ')
  assert.deepEqual(names(next), ['A', 'B', 'C', 'Mine'])
  assert.deepEqual(next.profiles[3].groups, ODD)
  assert.equal(next.active, 1)
  next.profiles[3].groups[0].digits.push('x')
  assert.deepEqual(next.profiles[1].groups, ODD)
})

test('addProfile does nothing at four profiles or with a blank name', () => {
  const four = addProfile(three, 'D')
  assert.equal(MAX_PROFILES, 4)
  assert.deepEqual(addProfile(four, 'E'), four)
  assert.deepEqual(addProfile(three, '   '), three)
})

test('edits never change the state they are given', () => {
  const before = cloneOf(three)
  addProfile(three, 'D'); deleteProfile(three, 0); moveProfile(three, 0, 2); setActive(three, 0); setActiveGroups(three, [])
  assert.deepEqual(three, before)
})

test('deleteProfile removes a profile, keeps the same one active, and refuses to delete the last', () => {
  assert.deepEqual(names(deleteProfile(three, 0)), ['B', 'C'])
  assert.equal(deleteProfile(three, 0).active, 0)
  assert.equal(deleteProfile(three, 2).active, 1)
  const one = { profiles: [{ name: 'A', groups: [] }], active: 0 }
  assert.deepEqual(deleteProfile(one, 0), one)
})

test('deleting the active profile makes its neighbour active: the next one, or the last when it was last', () => {
  assert.equal(deleteProfile(three, 1).active, 1)
  assert.deepEqual(activeGroups(deleteProfile(three, 1)), [])
  assert.equal(deleteProfile(setActive(three, 2), 2).active, 1)
})

test('moveProfile reorders and the active profile follows its own move', () => {
  assert.deepEqual(names(moveProfile(three, 0, 2)), ['B', 'C', 'A'])
  assert.equal(moveProfile(three, 0, 2).active, 0)
  assert.deepEqual(names(moveProfile(three, 1, 0)), ['B', 'A', 'C'])
  assert.equal(moveProfile(three, 1, 0).active, 0)
  assert.equal(moveProfile(three, 2, 0).active, 2)
  assert.deepEqual(moveProfile(three, 1, 1), three)
})

test('setActive picks one profile; an index outside the list changes nothing', () => {
  assert.equal(setActive(three, 2).active, 2)
  assert.deepEqual(setActive(three, 3), three)
  assert.deepEqual(setActive(three, -1), three)
})

test('setActiveGroups replaces only the active profile\'s groups', () => {
  const next = setActiveGroups(three, [{ key: 'z', digits: ['1'] }])
  assert.deepEqual(next.profiles.map((p) => p.groups), [LOW, [{ key: 'z', digits: ['1'] }], []])
})

test('dropIndex gives the position the dragged row lands in, counting the rows above the pointer', () => {
  const mids = [10, 30, 50]
  assert.equal(dropIndex(mids, 0, 5), 0)
  assert.equal(dropIndex(mids, 0, 35), 1)
  assert.equal(dropIndex(mids, 0, 99), 2)
  assert.equal(dropIndex(mids, 2, 5), 0)
  assert.equal(dropIndex(mids, 2, 20), 1)
  assert.equal(dropIndex(mids, 1, 31), 1)
})

test('iconLayout shows at most four groups: up to three in one row, four as 2 by 2', () => {
  const g = (n) => Array.from({ length: n }, (_, i) => ({ key: 'k' + i, digits: [String(i + 1), '9'] }))
  const rows = (n) => new Set(iconLayout(g(n)).map((c) => c.y)).size
  assert.deepEqual(iconLayout(g(0)), [])
  assert.equal(ICON_MAX_GROUPS, 4)
  for (const n of [1, 2, 3]) assert.equal(rows(n), 1, `${n} groups`)
  assert.equal(rows(4), 2)
  assert.equal(rows(6), 2)
  assert.deepEqual(iconLayout(g(6)).map((c) => c.key), ['k0', 'k1', 'k2', 'k3'])
})

test('iconLayout labels each cell with its group\'s lowest digit, empty for a group with none', () => {
  const layout = iconLayout([{ key: 'a', digits: ['6', '7', '9'] }, { key: 'b', digits: [] }, { key: 'c', digits: ['5', '0'] }])
  assert.deepEqual(layout.map((c) => c.digit), ['6', '', '0'])
})

test('iconLayout puts every cell inside the icon and clear of the corner boxes, whatever the group count', () => {
  for (let n = 1; n <= 6; n++) {
    const cells = iconLayout(Array.from({ length: n }, (_, i) => ({ key: 'k' + i, digits: [String(i)] })))
    cells.forEach((c) => {
      assert.equal(c.x >= 0 && c.y >= ICON_TOP && c.x + c.size <= 100 && c.y + c.size <= 100, true, `cell of ${n} outside the icon: ${JSON.stringify(c)}`)
      assert.equal(c.x + c.size > ARROW_START && c.y + c.size > ARROW_START, false, `a cell of ${n} reaches the arrow box: ${JSON.stringify(c)}`)
    })
  }
})

test('inkFor picks white on a dark color and black on a light one, from rgb, rgba or hex', () => {
  assert.equal(inkFor('rgb(0, 0, 0)'), '#fff')
  assert.equal(inkFor('rgb(255, 255, 255)'), '#000')
  assert.equal(inkFor('rgba(62, 99, 221, 1)'), '#fff')
  assert.equal(inkFor('#e5e5e5'), '#000')
  assert.equal(inkFor('#222'), '#fff')
  assert.equal(inkFor(''), '#000')
  assert.equal(inkFor('not a color'), '#000')
})

const manyCells = [
  { given: '1' }, { value: '5', colours: ['a'] }, { value: '8', colours: ['b', 'z'] }, { centre: ['2'], colours: ['a'] }, { colours: ['a', 'b'] }, {}
]
const oldProfile = [{ key: 'a', digits: ['1', '2'] }, { key: 'b', digits: ['5'] }]
const newProfile = [{ key: 'c', digits: ['1', '8'] }, { key: 'a', digits: ['2'] }]

test('planSwitch takes the old profile\'s colors off every cell and gives every pure cell its new color, removals first', () => {
  const ops = planSwitch(manyCells, oldProfile, newProfile)
  assert.deepEqual(ops.map((o) => o.action), ['remove', 'remove', 'add'])
  // a: off the 5 (not pure now) and off the empty cell; b: off the 8 and the empty cell.
  assert.deepEqual(ops.filter((o) => o.action === 'remove').map((o) => [o.key, o.indices]), [['a', [1, 4]], ['b', [2, 4]]])
  // c: the given 1 and the 8; a: the centre-marked 2, already holding a, is not planned a second time.
  assert.deepEqual(ops.filter((o) => o.action === 'add').map((o) => [o.key, o.indices]), [['c', [0, 2]]])
})

test('planSwitch leaves a color outside both profiles alone, and plans nothing when the profiles are the same', () => {
  const ops = planSwitch(manyCells, oldProfile, newProfile)
  assert.equal(ops.some((o) => o.key === 'z'), false)
  assert.deepEqual(planSwitch([{ given: '1', colours: ['a'] }], oldProfile, oldProfile), [])
})

test('planSwitch to a profile with a key the old one also uses keeps that color on a cell that stays pure', () => {
  const ops = planSwitch([{ given: '2', colours: ['a'] }], oldProfile, newProfile)
  assert.deepEqual(ops, [])
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
const auto = (cells, indices = cells.map((_, i) => i), g = groups, managed) => planAuto(cells, g, indices, managed)

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
  assert.deepEqual(auto([{ value: '1', colours: ['old'] }, { colours: ['old', 'z'] }], undefined, groups, ['a', 'b', 'old']), [
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
  const edit = (type, arg) => isEntryAction({ type, arg })
  assert.equal(edit('value', '4'), true)
  assert.equal(edit('candidates', '4'), true)
  assert.equal(edit('clear', 'normal'), true)
  assert.equal(edit('clear', 'centre'), true)
  assert.equal(edit('pencilmarks', '4'), false)
  assert.equal(edit('colour', '1'), false)
  assert.equal(edit('clear', 'colour'), false)
  assert.equal(edit('clear', 'pen'), false)
  assert.equal(edit('undo'), false)
  assert.equal(isEntryAction('vl:4'), false)
  assert.equal(isEntryAction(undefined), false)
})

test('auto: the edit signature moves with the digit and the centre marks, not their order, and ignores corner marks and colors', () => {
  assert.equal(entrySignature({ centre: ['2', '1'] }), entrySignature({ centre: ['1', '2'] }))
  assert.notEqual(entrySignature({ value: '1' }), entrySignature({ value: '2' }))
  assert.notEqual(entrySignature({ centre: ['1'] }), entrySignature({ centre: ['1', '2'] }))
  assert.equal(entrySignature({ value: '1', colours: ['a'], pencilmarks: ['5'] }), entrySignature({ value: '1' }))
})

test('auto: changedIndices lists the positions whose signature differs', () => {
  assert.deepEqual(changedIndices(['a', 'b', 'c'], ['a', 'x', 'y']), [1, 2])
  assert.deepEqual(changedIndices(['a'], ['a']), [])
})

// A color of each key for the drawn pieces: key `a` is dark, anything else light.
const colorFor = (key) => (key === 'a' ? 'rgb(10, 10, 10)' : 'rgb(240, 240, 240)')

test('auto: the button box shows its state in aria-checked, an X in the box and bold purple, or an empty box and light grey', () => {
  const on = autoBoxHtml(true)
  const off = autoBoxHtml(false)
  assert.match(on, /data-role="auto"[^>]*aria-checked="true"/)
  assert.match(off, /data-role="auto"[^>]*aria-checked="false"/)
  assert.match(on, /<span data-role="auto-mark"[^>]*>X<\/span>/)
  assert.doesNotMatch(off, />X</)
  assert.match(on, /AUTO<\/span>$/)
  assert.match(on, /font:700[^"]*color:#6a1b9a/)
  assert.match(off, /color:#b3acbf/)
  assert.doesNotMatch(on, /&#10003;/)
})

test('auto: installButton draws the box at the value it is given', () => {
  const content = (on) => { let spec; installButton({ addAuxButton: (x) => { spec = x } }, { refreshControls: () => {} }, () => {}, on, ODD, colorFor); return spec.content }
  assert.match(content(true), /aria-checked="true"/)
  assert.match(content(false), /aria-checked="false"/)
})

test('auto: the dialog box opens at the draft it is given', () => {
  assert.match(editor([], [], [], true), /data-role="auto-draft" checked/)
  assert.doesNotMatch(editor([], [], []), /data-role="auto-draft" checked/)
})

test('iconHtml draws one cell per group, at most four, each with its lowest digit in the ink that reads on its color', () => {
  const html = iconHtml(false, [{ key: 'a', digits: ['3', '4'] }, { key: 'b', digits: ['7'] }], colorFor)
  assert.equal(count(html, /<rect data-role="cell"/g), 2)
  assert.match(html, /data-key="a"[^>]*fill="rgb\(10, 10, 10\)"/)
  assert.match(html, /<text[^>]*fill="#fff"[^>]*>3<\/text>/)
  assert.match(html, /<text[^>]*fill="#000"[^>]*>7<\/text>/)
  const six = Array.from({ length: 6 }, (_, i) => ({ key: 'k' + i, digits: [String(i)] }))
  assert.equal(count(iconHtml(true, six, colorFor), /<rect data-role="cell"/g), 4)
})

test('iconHtml draws the AUTO box in the upper left and the menu arrow box in the lower right', () => {
  const html = iconHtml(true, ODD, colorFor)
  assert.match(html, /data-role="auto"[^>]*left:[^;"]*;top:/)
  assert.match(html, /data-role="menu"[^>]*aria-haspopup="menu"[^>]*right:[^;"]*;bottom:/)
  assert.ok(html.indexOf('data-role="auto"') < html.indexOf('data-role="menu"'))
})

test('iconHtml gives a group whose palette color is unreadable a grey cell, so the cell still shows', () => {
  assert.match(iconHtml(false, [{ key: 'q', digits: ['2'] }], () => ''), /data-key="q"[^>]*fill="#ccc"/)
})

const profileState = { profiles: [{ name: 'Low <b>', groups: LOW }, { name: 'Odd/Even', groups: ODD }], active: 1 }

test('renderProfiles lists each profile with its handle, active checkbox, colors with lowest digits, name and delete button', () => {
  const html = renderProfiles(profileState, colorFor, '')
  assert.equal(count(html, /data-role="profile-row"/g), 2)
  assert.equal(count(html, /data-role="handle"/g), 2)
  assert.equal(count(html, /data-act="activate"/g), 2)
  assert.equal(count(html, /data-act="activate"[^>]*checked/g), 1)
  assert.match(html, /data-act="activate" data-index="1" checked/)
  assert.equal(count(html, /data-act="delete"/g), 2)
  assert.match(html, /\(2 of 4\)/)
  assert.match(html, /Low &lt;b&gt;/)
  assert.doesNotMatch(html, /Low <b>/)
  assert.equal(count(html, /data-role="chip"/g), 5)
})

test('renderProfiles disables delete on the last profile and Add at four', () => {
  const one = { profiles: [profileState.profiles[0]], active: 0 }
  assert.equal(count(renderProfiles(one, colorFor, ''), /data-act="delete"[^>]*disabled/g), 1)
  assert.equal(count(renderProfiles(profileState, colorFor, ''), /data-act="delete"[^>]*disabled/g), 0)
  assert.equal(count(renderProfiles(profileState, colorFor, ''), /data-act="add"[^>]*disabled/g), 0)
  const four = { profiles: [...profileState.profiles, ...profileState.profiles], active: 0 }
  assert.match(renderProfiles(four, colorFor, ''), /data-act="add"[^>]*disabled/)
  assert.match(renderProfiles(four, colorFor, ''), /\(4 of 4\)/)
})

test('renderProfiles keeps the typed name in the name field, escaped', () => {
  assert.match(renderProfiles(profileState, colorFor, 'a"b'), /data-role="new-name"[^>]*value="a&quot;b"/)
})

test('renderMenu has the heading, one row per profile in order with the active one marked, then Edit profiles', () => {
  const html = renderMenu(profileState, colorFor)
  assert.match(html, /Color by digit profile/)
  assert.deepEqual([...html.matchAll(/data-act="pick" data-index="(\d)"/g)].map((m) => m[1]), ['0', '1'])
  assert.equal(count(html, /aria-checked="true"/g), 1)
  assert.match(html, /data-index="1"[^>]*aria-checked="true"/)
  assert.match(html, /Low &lt;b&gt;/)
  assert.match(html, /data-act="edit"[^>]*>[^<]*Edit profiles…/)
  assert.ok(html.indexOf('data-act="edit"') > html.lastIndexOf('data-act="pick"'))
})

test('installButton: adds an aux-row icon button titled "Color by digit", then refreshControls so the click handler binds', () => {
  const calls = []
  const click = () => {}
  const framework = {
    addAuxButton: (spec) => calls.push(['add', spec]),
    addAppButton: () => calls.push(['wrong row'])
  }
  const app = { refreshControls: () => calls.push(['refresh']) }
  installButton(framework, app, click, false, ODD, colorFor)
  assert.deepEqual(calls.map((c) => c[0]), ['add', 'refresh'])
  const spec = calls[0][1]
  assert.equal(spec.name, 'colorbydigit')
  assert.equal(spec.title, 'Color by digit')
  assert.match(spec.content, /^<div class="icon"[^>]*>[\s\S]*<svg[\s\S]*<\/svg><span data-role="auto"[\s\S]*<span data-role="menu"[\s\S]*<\/span><\/div>$/)
  assert.equal(spec.onClick, click)
})

// The parts of a page the script reads to draw the button: the palette variables and a probe element
// that resolves a color. Every palette key is the color #3e63dd.
const pageDocument = (extra = {}) => ({
  addEventListener: () => {},
  querySelector: () => null,
  documentElement: {},
  body: { appendChild: () => {} },
  createElement: () => ({ style: {}, remove: () => {} }),
  ...extra
})
const pageWindow = () => ({ getComputedStyle: () => ({ getPropertyValue: () => '#3e63dd', color: 'rgb(62, 99, 221)' }), addEventListener: () => {} })

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
  global.document = pageDocument()
  global.window = pageWindow()
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
    delete global.Framework; delete global.click; delete global.document; delete global.window
    delete require.cache[path]
    if (saved) require.cache[path] = saved
  }
})

// A SudokuPad stand-in for the auto mode wrapper: cells hold a digit and colors, `act` applies
// value/clear/colour/select/deselect/group actions and records every call, and `puzzle.inGroup` follows the group actions.
// `single` mimics SudokuPad with Multi-color off: a color toggle acts on the whole cell, so taking one
// color off a cell that holds two clears both, and adding one replaces what the cell held.
function autoMockApp (cellDefs, { single = false } = {}) {
  const calls = []
  const cells = cellDefs.map((def, i) => {
    const cell = { row: 0, col: i, given: def.given || '', value: def.value || '', colours: [...(def.colours || [])] }
    cell.propVisible = (tool) => (tool === 'normal' ? !def.given : true)
    cell.propGet = () => [...(def.centre || [])]
    return cell
  })
  const puzzle = { cells, selectedCells: [], inGroup: false }
  const app = {
    puzzle,
    calls,
    act (action) {
      calls.push(action.type + (action.arg === undefined ? '' : ':' + action.arg))
      const sel = puzzle.selectedCells
      if (action.type === 'groupstart') puzzle.inGroup = true
      if (action.type === 'groupend') puzzle.inGroup = false
      if (action.type === 'value') sel.forEach((c) => { c.value = c.value === action.arg ? '' : action.arg })
      if (action.type === 'clear') sel.forEach((c) => { c.value = '' })
      if (action.type === 'colour') {
        const all = sel.every((c) => c.colours.includes(action.arg))
        if (single) sel.forEach((c) => { c.colours = all ? [] : [action.arg] })
        else sel.forEach((c) => { c.colours = all ? c.colours.filter((k) => k !== action.arg) : [...c.colours, action.arg] })
      }
    },
    select (list) { puzzle.selectedCells = [...[].concat(list)] },
    deselect () { puzzle.selectedCells = [] },
    on: (name, fn) => { app.handlers[name] = fn },
    handlers: {},
    refreshControls: () => {}
  }
  return app
}

// Runs the script's entry point against `app` with auto mode saved on; `fn` gets the wrapped app.
async function withAutoMode (app, fn) {
  const path = require.resolve('./color-by-digit.user.js')
  const saved = require.cache[path]
  delete require.cache[path]
  global.document = pageDocument()
  global.window = pageWindow()
  global.Framework = {
    getApp: () => Promise.resolve(app),
    getData: (key) => ({ ColorByDigit_auto: true, ColorByDigit_profiles: { profiles: [{ name: 'Odd/Even', groups: ODD }], active: 0 } }[key] ?? null),
    setData: () => {},
    addAuxButton: () => {},
    addSetting: () => {}
  }
  try {
    require(path)
    await new Promise((resolve) => setImmediate(resolve))
    await fn(app)
  } finally {
    delete global.Framework; delete global.document; delete global.window
    delete require.cache[path]
    if (saved) require.cache[path] = saved
  }
}

const select = (app, i) => app.select(app.puzzle.cells[i])
const types = (app) => app.calls.map((c) => c.split(':')[0])

test('auto wrapper: a digit entry is one group with its color change inside it', async () => {
  await withAutoMode(autoMockApp([{}, {}]), async (app) => {
    select(app, 0)
    app.calls.length = 0
    app.act({ type: 'value', arg: '1' })
    assert.deepEqual(types(app), ['groupstart', 'value', 'colour', 'groupend'])
    assert.deepEqual(app.puzzle.cells[0].colours, ['1'])
    assert.equal(app.puzzle.inGroup, false)
  })
})

test('auto wrapper: with Multi-color off, taking a second color off a cell that clears it still leaves the cell its group color', async () => {
  await withAutoMode(autoMockApp([{ colours: ['1', '2'] }], { single: true }), async (app) => {
    select(app, 0)
    app.act({ type: 'value', arg: '3' })
    assert.deepEqual(app.puzzle.cells[0].colours, ['1'])
    assert.equal(app.puzzle.inGroup, false)
  })
})

test('auto wrapper: an entry SudokuPad already runs in a group adds its colors to that group, never opens another', async () => {
  await withAutoMode(autoMockApp([{}]), async (app) => {
    select(app, 0)
    app.act({ type: 'groupstart' })
    app.calls.length = 0
    app.act({ type: 'value', arg: '2' })
    assert.equal(types(app).includes('groupstart'), false)
    assert.equal(types(app).includes('groupend'), false)
    assert.equal(app.puzzle.inGroup, true)
    assert.deepEqual(app.puzzle.cells[0].colours, ['2'])
  })
})

test('auto wrapper: anything that is not a digit or centre mark entry passes straight through', async () => {
  await withAutoMode(autoMockApp([{}]), async (app) => {
    select(app, 0)
    app.calls.length = 0
    app.act({ type: 'colour', arg: '9' })
    app.act({ type: 'pencilmarks', arg: '1' })
    app.act({ type: 'clear', arg: 'colour' })
    assert.deepEqual(app.calls, ['colour:9', 'pencilmarks:1', 'clear:colour'])
  })
})

test('auto wrapper: a clear with nothing to clear, and a digit on a given, open no group', async () => {
  await withAutoMode(autoMockApp([{}, { given: '5' }]), async (app) => {
    select(app, 0)
    app.calls.length = 0
    app.act({ type: 'clear', arg: 'normal' })
    select(app, 1)
    app.act({ type: 'value', arg: '3' })
    assert.deepEqual(app.calls, ['clear:normal', 'value:3'])
  })
})

test('auto wrapper: a restart colors the givens again', async () => {
  await withAutoMode(autoMockApp([{ given: '1' }, { given: '2' }]), async (app) => {
    app.handlers.restarted()
    assert.deepEqual(app.puzzle.cells.map((c) => c.colours), [['1'], ['2']])
    assert.equal(app.puzzle.inGroup, false)
  })
})

// A page is ten keys: the key at index K sits on SudokuPad's button K. Each key's color is its own name here.
// The editor without a profile list.
const editor = (groups, pages, shown, auto = false) => renderEditor(groups, pages, shown, auto, '')
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
  const html = editor([{ key: 'a2', digits: [] }], twoPages(), [0])
  assert.deepEqual(options(html), [['0', true, 'Page 1'], ['1', false, 'Page 2 (current)']])
  assert.equal(count(html, /<select data-act="page" data-group="0"/g), 1)
})

test('renderEditor draws only the shown page of a group, keeping data-act and data-key on every swatch', () => {
  const first = editor([{ key: 'a2', digits: [] }], twoPages(), [0])
  assert.equal(count(first, /data-act="color"/g), 10)
  assert.equal(count(first, /data-act="color"[^>]*data-key="z"/g), 1)
  assert.equal(count(first, /data-key="b1"/g), 0)
  const second = editor([{ key: 'a2', digits: [] }], twoPages(), [1])
  assert.equal(count(second, /data-act="color"/g), 9)
  assert.equal(count(second, /data-key="b1"/g), 1)
  assert.equal(count(second, /data-key="a1"/g), 0)
})

test('renderEditor shows each group on its own page', () => {
  const html = editor([{ key: 'a2', digits: [] }, { key: 'b2', digits: [] }], twoPages(), [0, 1])
  assert.equal(count(html, /data-group="0"[^>]*data-key="a1"/g), 1)
  assert.equal(count(html, /data-group="1"[^>]*data-key="b1"/g), 1)
  assert.equal(count(html, /data-group="0"[^>]*data-key="b1"/g), 0)
})

test('renderEditor shows the group\'s color beside the pulldown even when its page is not shown', () => {
  const html = editor([{ key: 'b2', digits: [] }], twoPages(), [0])
  assert.match(html, /data-role="chosen"[^>]*title="b2"[^>]*background:#b2/)
  assert.equal(count(html, /aria-pressed="true"/g), 0)
})

test('renderEditor draws an empty slot as a spacer with no button, so nothing shifts', () => {
  const pages = layoutPages([keys('clear a1 clear a3 a4 a5 a6 a7 a8 a9')], 0, colorOf)
  const html = editor([{ key: 'a1', digits: [] }], pages, [0])
  assert.equal(count(html, /data-act="color"/g), 8)
  assert.equal(count(html, /data-empty="slot"/g), 1)
})

test('renderEditor marks only the group\'s own color as selected', () => {
  const pages = layoutPages([keys('clear a1 a2 a3 a4 a5 a6 a7 a8 a9')], 0, colorOf)
  const html = editor([{ key: 'a2', digits: [] }], pages, [0])
  assert.equal(count(html, /aria-pressed="true"/g), 1)
  assert.match(html, /data-key="a2"[^>]*aria-pressed="true"/)
})

test('renderEditor keeps the "No palette colors found" note, and draws no pulldown, when no page has a color', () => {
  const html = editor([], layoutPages([], 0, colorOf), [])
  assert.match(html, /No palette colors found/)
  assert.equal(count(html, /data-act="color"/g), 0)
  assert.equal(count(editor([], layoutPages([keys('a b')], 0, colorOf), []), /No palette colors found/g), 0)
  assert.equal(count(editor([{ key: 'a', digits: [] }], layoutPages([], 0, colorOf), [0]), /<select/g), 0)
})

test('the editor has no Preload buttons, keeps a Clear all button, and shows the profile list it is given above the groups', () => {
  const html = renderEditor([{ key: 'a', digits: [] }], layoutPages([], 0, colorOf), [0], false, '<div id="mark-profiles"></div>')
  assert.doesNotMatch(html, /data-act="preload"|Preload/)
  assert.equal(count(html, /data-act="clear"[^>]*>Clear all</g), 1)
  assert.ok(html.indexOf('mark-profiles') < html.indexOf('data-act="clear"'))
})

test('the preloads are the two real profiles a fresh install starts with, each with groups', () => {
  assert.deepEqual(Object.keys(PRELOADS), ['Low/5/High', 'Odd/Even'])
  assert.deepEqual(Object.keys(PRELOADS).filter((name) => PRELOADS[name].length === 0), [])
})

test('VERSION is the @version in the script header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, 'color-by-digit.user.js'), 'utf8')))
})
