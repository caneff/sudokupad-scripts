'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { copiedSettings, pastedSettings, pasteReport, installButton, colorSteps, planColoring, planCellColors, groupKeys, isEntryAction, entrySignature, changedIndices, modeLabelHtml, nextMode, startingMode, planClear, readCentreMarks, toPlanCell, assignDigit, editGroupsFor, rowAfterKey, normalizeGroups, stateFromStored, withAddedPreloads, copyProfile, renameProfile, deleteProfile, moveProfile, indexAfterDelete, indexAfterMove, setActive, setProfileGroups, activeGroups, digitGroups, iconGroups, isSynced, usesDigitColors, setSync, setDigitActive, setUseDigitColors, allowedMode, dropIndex, iconLayout, inkFor, planSwitch, iconHtml, renderProfiles, renderMenu, isVisibleColor, layoutPages, layoutColors, initialPage, renderEditor, COPY_PASTE_BUTTONS_HTML, STYLE_CSS, PRELOADS, darkenColor, parseColor, buildDigitCss, digitOfText, circleFor, inkMiddle, CIRCLE_CSS, DIGIT_ATTR, LIGHTNESS_FACTOR, MAX_PROFILES, MAX_NAME_LENGTH, ICON_TOP, ARROW_START, ICON_MAX_GROUPS, CHIP_MAX_GROUPS, VERSION } = require('./color-by-digit.user.js')

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

test('Entropic maps 0-3 to key 7, 4-6 to key 4, 7-9 to key 9', () => {
  assert.equal(byDigit(PRELOADS.Entropic), '7777444999')
})

test('Modular maps 1, 4, 7 to key 6, 2, 5, 8 to key 5, 0, 3, 6, 9 to key 8', () => {
  assert.equal(byDigit(PRELOADS.Modular), '8658658658')
})

// SudokuPad's default palette, its visible keys (tool-color.css, read 2026-11-07), typed out as the independent source.
const DEFAULT_PALETTE = Object.fromEntries([
  ['1', 'rgb(214, 214, 214)'], ['2', 'rgb(124, 124, 124)'], ['3', 'rgb(-36, -36, -36)'], ['4', 'rgb(179, 229, 106)'], ['5', 'rgb(232, 124, 241)'],
  ['6', 'rgb(228, 150, 50)'], ['7', 'rgb(245, 58, 55)'], ['8', 'rgb(252, 235, 63)'], ['9', 'rgb(61, 153, 245)'], ['b', 'rgb(204, 51, 17)'],
  ['c', 'rgb(17, 119, 51)'], ['d', 'rgb(0, 68, 196)'], ['e', 'rgb(238, 153, 170)'], ['f', 'rgb(255, 255, 25)'], ['g', 'rgb(240, 70, 240)'],
  ['h', 'rgb(160, 90, 30)'], ['i', 'rgb(51, 187, 238)'], ['j', 'rgb(145, 30, 180)'], ['l', 'rgb(245, 58, 55)'], ['m', 'rgb(76, 175, 80)'],
  ['n', 'rgb(61, 153, 245)'], ['o', 'rgb(249, 136, 134)'], ['p', 'rgb(149, 208, 151)'], ['q', 'rgb(158, 204, 250)'], ['r', 'rgb(170, 12, 9)'],
  ['s', 'rgb(47, 106, 49)'], ['t', 'rgb(9, 89, 170)']
])

test('Each digit puts each of 1 to 9 alone in a group, 5 to 9 on their own first-page keys and 1 to 4 on keys of pages 2 and 3, and 0 in no group', () => {
  assert.deepEqual(PRELOADS['Each digit'], [['1', 'j'], ['2', 'e'], ['3', 'h'], ['4', 'm'], ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9']].map(([d, key]) => ({ key, digits: [d] })))
  assert.deepEqual(plan(allDigits, PRELOADS['Each digit']).map((p) => p.index), [1, 2, 3, 4, 5, 6, 7, 8, 9])
})

test('Each digit\'s nine shades are colors, none black or grey, and no two alike, so an entered digit never looks like a given', () => {
  const shades = PRELOADS['Each digit'].map((g) => oklch(darkenColor(parseColor(DEFAULT_PALETTE[g.key]))))
  for (const { L, C } of shades) {
    assert.ok(L >= 0.35, `lightness ${L}`)
    assert.ok(C >= 0.09, `chroma ${C}`)
  }
  const lab = ({ L, C, h }) => [L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)]
  for (let i = 0; i < 9; i++) {
    for (let j = i + 1; j < 9; j++) assert.ok(Math.hypot(...lab(shades[i]).map((x, k) => x - lab(shades[j])[k])) >= 0.1, `digits ${i + 1} and ${j + 1}`)
  }
})

const LOW = PRELOADS['Low/5/High']
const ODD = PRELOADS['Odd/Even']
const ENTROPIC = PRELOADS.Entropic
const MODULAR = PRELOADS.Modular
const EACH_DIGIT = PRELOADS['Each digit']
const ALL_PRELOAD_NAMES = ['Low/5/High', 'Odd/Even', 'Entropic', 'Modular', 'Each digit']
const names = (state) => state.profiles.map((p) => p.name)

test('a fresh install has the five preloads, with Low/5/High active', () => {
  const state = stateFromStored(null, null)
  assert.deepEqual(names(state), ALL_PRELOAD_NAMES)
  assert.equal(state.active, 0)
  assert.deepEqual(activeGroups(state), LOW)
})

test('a fresh install returns copies, so editing one never edits the preloads', () => {
  const state = stateFromStored(null, null)
  state.profiles[0].groups[0].digits.push('x')
  assert.deepEqual(PRELOADS['Low/5/High'][0].digits, ['0', '1', '2', '3', '4'])
  assert.deepEqual(stateFromStored(null, null).profiles[0].groups, LOW)
})

test('saved groups equal to a preload make that preload the active profile, beside the other preloads', () => {
  const state = stateFromStored(null, cloneOf(ODD))
  assert.deepEqual(names(state), ALL_PRELOAD_NAMES)
  assert.equal(state.active, 1)
  assert.deepEqual(activeGroups(stateFromStored(undefined, cloneOf(LOW))), LOW)
  assert.equal(stateFromStored(undefined, cloneOf(LOW)).active, 0)
})

test('saved groups that equal no preload become the active profile named Custom, first, beside the five preloads, even when empty', () => {
  const mine = [{ key: '3', digits: ['1', '2'] }]
  assert.deepEqual(stateFromStored(null, mine), { profiles: [{ name: 'Custom', groups: mine }, { name: 'Low/5/High', groups: LOW }, { name: 'Odd/Even', groups: ODD }, { name: 'Entropic', groups: ENTROPIC }, { name: 'Modular', groups: MODULAR }, { name: 'Each digit', groups: EACH_DIGIT }], active: 0 })
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

test('saved profiles are untrusted: with none usable they fall back, and an extra past six drops', () => {
  const fresh = stateFromStored(null, null)
  for (const bad of [{}, { profiles: [] }, { profiles: 'x', active: 0 }, { profiles: [{ name: 3, groups: [] }], active: 0 }, { profiles: [{ name: 'A', groups: 'x' }], active: 0 }, { profiles: [{ name: '  ', groups: [] }], active: 0 }]) {
    assert.deepEqual(stateFromStored(bad, null), fresh)
  }
  const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name) => ({ name, groups: [] }))
  assert.deepEqual(names(stateFromStored({ profiles: seven, active: 3 }, null)), ['a', 'b', 'c', 'd', 'e', 'f'])
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

test('withAddedPreloads appends the named preloads after the saved profiles and leaves the active profile alone', () => {
  const saved = { profiles: [{ name: 'Low/5/High', groups: LOW }, { name: 'Odd/Even', groups: ODD }], active: 1 }
  const next = withAddedPreloads(saved, ['Entropic', 'Modular'])
  assert.deepEqual(names(next), ['Low/5/High', 'Odd/Even', 'Entropic', 'Modular'])
  assert.deepEqual(next.profiles[2].groups, ENTROPIC)
  assert.deepEqual(next.profiles[3].groups, MODULAR)
  assert.equal(next.active, 1)
  assert.deepEqual(withAddedPreloads(next, ['Each digit']), { profiles: [...next.profiles, { name: 'Each digit', groups: EACH_DIGIT }], active: 1 })
})

test('withAddedPreloads skips a preload whose groups a profile already has, whatever its name', () => {
  const saved = { profiles: [{ name: 'Mine', groups: cloneOf(MODULAR) }, { name: 'Custom', groups: [] }, { name: 'Odd/Even', groups: ODD }, { name: 'Z', groups: [] }], active: 3 }
  const next = withAddedPreloads(saved, ['Entropic', 'Modular'])
  assert.deepEqual(names(next), ['Mine', 'Custom', 'Odd/Even', 'Z', 'Entropic'])
  assert.equal(next.active, 3)
  assert.deepEqual(withAddedPreloads(next, ['Entropic', 'Modular']), next)
  const digits = { profiles: [{ name: 'Nine', groups: cloneOf(EACH_DIGIT) }], active: 0 }
  assert.deepEqual(withAddedPreloads(digits, ['Each digit']), digits)
})

test('withAddedPreloads stops at the profile limit and never changes the state it is given', () => {
  const full = { profiles: ['a', 'b', 'c', 'd', 'e'].map((name) => ({ name, groups: [] })), active: 0 }
  const before = cloneOf(full)
  assert.deepEqual(names(withAddedPreloads(full, ['Entropic', 'Modular'])), ['a', 'b', 'c', 'd', 'e', 'Entropic'])
  assert.deepEqual(full, before)
  const next = withAddedPreloads(full, ['Entropic', 'Modular'])
  next.profiles[5].groups[0].digits.push('x')
  assert.deepEqual(PRELOADS.Entropic[0].digits, ['0', '1', '2', '3'])
})

function cloneOf (value) { return JSON.parse(JSON.stringify(value)) }

const three = { profiles: [{ name: 'A', groups: LOW }, { name: 'B', groups: ODD }, { name: 'C', groups: [] }], active: 1 }

test('copyProfile appends a copy of the chosen profile named "<name> copy", and leaves the chosen one alone', () => {
  const next = copyProfile(three, 1)
  assert.deepEqual(names(next), ['A', 'B', 'C', 'B copy'])
  assert.deepEqual(next.profiles[3].groups, ODD)
  assert.equal(next.active, 1)
  next.profiles[3].groups[0].digits.push('x')
  assert.deepEqual(next.profiles[1].groups, ODD)
  assert.deepEqual(copyProfile(three, 0).profiles[3].groups, LOW)
})

test('copyProfile does nothing at six profiles or for an index outside the list', () => {
  const six = copyProfile(copyProfile(copyProfile(three, 0), 0), 0)
  assert.equal(MAX_PROFILES, 6)
  assert.equal(six.profiles.length, 6)
  assert.deepEqual(copyProfile(six, 0), six)
  assert.deepEqual(copyProfile(three, 3), three)
})

test('a profile name is cut to the longest name allowed, copied, renamed or saved', () => {
  const long = 'x'.repeat(MAX_NAME_LENGTH + 5)
  const cut = 'x'.repeat(MAX_NAME_LENGTH)
  assert.equal(copyProfile(renameProfile(three, 0, 'y'.repeat(MAX_NAME_LENGTH)), 0).profiles[3].name, 'y'.repeat(MAX_NAME_LENGTH))
  assert.equal(renameProfile(three, 0, long).profiles[0].name, cut)
  assert.equal(stateFromStored({ profiles: [{ name: long, groups: [] }], active: 0 }).profiles[0].name, cut)
})

test('renameProfile trims the new name, and a blank one keeps the old name', () => {
  assert.deepEqual(names(renameProfile(three, 1, '  Mine ')), ['A', 'Mine', 'C'])
  assert.deepEqual(renameProfile(three, 1, '   '), three)
  assert.deepEqual(renameProfile(three, 1, ''), three)
  assert.deepEqual(renameProfile(three, 5, 'x'), three)
  assert.deepEqual(renameProfile(three, 1, 'Mine').profiles[1].groups, ODD)
})

test('indexAfterDelete and indexAfterMove: a chosen index follows its own profile, and a deleted one falls to its neighbour', () => {
  assert.equal(indexAfterDelete(2, 0, 3), 1)
  assert.equal(indexAfterDelete(0, 2, 3), 0)
  assert.equal(indexAfterDelete(1, 1, 3), 1)
  assert.equal(indexAfterDelete(2, 2, 3), 1)
  assert.equal(indexAfterMove(0, 0, 2), 2)
  assert.equal(indexAfterMove(1, 0, 2), 0)
  assert.equal(indexAfterMove(2, 2, 0), 0)
  assert.equal(indexAfterMove(0, 2, 0), 1)
  assert.equal(indexAfterMove(1, 1, 1), 1)
})

test('edits never change the state they are given', () => {
  const before = cloneOf(three)
  copyProfile(three, 0); renameProfile(three, 0, 'Z'); deleteProfile(three, 0); moveProfile(three, 0, 2); setActive(three, 0); setProfileGroups(three, 0, [])
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

test('setProfileGroups replaces only the chosen profile\'s groups', () => {
  const next = setProfileGroups(three, 2, [{ key: 'z', digits: ['1'] }])
  assert.deepEqual(next.profiles.map((p) => p.groups), [LOW, ODD, [{ key: 'z', digits: ['1'] }]])
  assert.equal(next.active, 1)
})

// The digit profile: "Sync digit profile with cell profile" and "Use digit colors".
const synced = { profiles: [{ name: 'A', groups: LOW }, { name: 'B', groups: ODD }, { name: 'C', groups: ENTROPIC }], active: 1 }
const apart = setDigitActive(setSync(synced, false), 2)

test('sync: a state saved before the digit profile is synced and uses digit colors, and digits take the cell profile', () => {
  const state = stateFromStored(synced, null)
  assert.deepEqual(state, synced)
  assert.equal(isSynced(state), true)
  assert.equal(usesDigitColors(state), true)
  assert.deepEqual(digitGroups(state), ODD)
  assert.equal(isSynced(stateFromStored(null, null)), true)
  assert.equal(usesDigitColors(stateFromStored(null, null)), true)
})

test('sync: unticking starts the digit pick at the cell profile, so the digits keep their groups', () => {
  const unticked = setSync(synced, false)
  assert.equal(isSynced(unticked), false)
  assert.equal(unticked.digitActive, 1)
  assert.deepEqual(digitGroups(unticked), ODD)
  assert.deepEqual(activeGroups(unticked), ODD)
})

test('sync: unsynced, a cell pick moves only the cells and a digit pick moves only the digits', () => {
  assert.deepEqual(activeGroups(apart), ODD)
  assert.deepEqual(digitGroups(apart), ENTROPIC)
  const cells = setActive(apart, 0)
  assert.deepEqual(activeGroups(cells), LOW)
  assert.deepEqual(digitGroups(cells), ENTROPIC)
  assert.deepEqual(setDigitActive(apart, 9), apart)
})

test('sync: synced, a cell pick moves the digits with it', () => {
  assert.deepEqual(digitGroups(setActive(synced, 2)), ENTROPIC)
})

test('sync: ticking again makes the digits take the cell profile', () => {
  const ticked = setSync(apart, true)
  assert.equal(isSynced(ticked), true)
  assert.deepEqual(digitGroups(ticked), ODD)
  assert.equal('digitActive' in ticked, false)
})

test('sync: the button icon shows the cell profile in Cell, Both and Off, and the digit profile in Digit', () => {
  assert.deepEqual(iconGroups(apart, 'cell'), ODD)
  assert.deepEqual(iconGroups(apart, 'both'), ODD)
  assert.deepEqual(iconGroups(apart, 'off'), ODD)
  assert.deepEqual(iconGroups(apart, 'digit'), ENTROPIC)
})

test('sync: deleting the digit profile makes digits follow the cell profile; deleting another keeps the digit pick on its profile', () => {
  const gone = deleteProfile(apart, 2)
  assert.equal(isSynced(gone), true)
  assert.deepEqual(digitGroups(gone), activeGroups(gone))
  const earlier = deleteProfile(apart, 0)
  assert.deepEqual(digitGroups(earlier), ENTROPIC)
  assert.deepEqual(activeGroups(earlier), ODD)
  const cellGone = deleteProfile(apart, 1)
  assert.deepEqual(digitGroups(cellGone), ENTROPIC)
})

test('sync: the digit pick follows its own profile through a move, an add, a groups edit and an added preload', () => {
  assert.deepEqual(digitGroups(moveProfile(apart, 2, 0)), ENTROPIC)
  assert.deepEqual(digitGroups(moveProfile(apart, 0, 2)), ENTROPIC)
  assert.deepEqual(digitGroups(copyProfile(apart, 0)), ENTROPIC)
  assert.deepEqual(digitGroups(setProfileGroups(apart, 0, [])), ENTROPIC)
  assert.deepEqual(digitGroups(withAddedPreloads(apart, ['Modular'])), ENTROPIC)
  assert.equal(isSynced(moveProfile(synced, 0, 2)), true)
})

test('sync: a saved digit pick is read like the active one, and a pick that is no profile reads as synced', () => {
  const saved = { profiles: [{ name: 'A', groups: [] }, { name: '', groups: [] }, { name: 'C', groups: LOW }], active: 0, digitActive: 2 }
  assert.deepEqual(digitGroups(stateFromStored(saved, null)), LOW)
  for (const digitActive of [1, 9, -1, 1.5, '2', null]) assert.equal(isSynced(stateFromStored({ ...saved, digitActive }, null)), true, String(digitActive))
})

test('use digit colors: off is saved as false and kept through every edit; anything but false reads as on', () => {
  const off = setUseDigitColors(apart, false)
  assert.equal(usesDigitColors(off), false)
  assert.equal(off.useDigitColors, false)
  for (const next of [setActive(off, 0), setSync(off, true), deleteProfile(off, 0), moveProfile(off, 0, 1), copyProfile(off, 0), renameProfile(off, 0, 'Z'), setProfileGroups(off, 0, []), setDigitActive(off, 0), withAddedPreloads(off, ['Modular'])]) {
    assert.equal(usesDigitColors(next), false)
  }
  assert.equal(usesDigitColors(stateFromStored(off, null)), false)
  assert.equal(usesDigitColors(stateFromStored({ ...synced, useDigitColors: 'no' }, null)), true)
  const on = setUseDigitColors(off, true)
  assert.equal('useDigitColors' in on, false)
  assert.deepEqual(on, apart)
})

test('use digit colors: off, a press steps Cell and Off only; Digit falls back to Off and Both to Cell', () => {
  assert.equal(nextMode('cell', false), 'off')
  assert.equal(nextMode('off', false), 'cell')
  assert.deepEqual(['cell', 'digit', 'both', 'off'].map((m) => allowedMode(m, false)), ['cell', 'off', 'cell', 'off'])
  assert.deepEqual(['cell', 'digit', 'both', 'off'].map((m) => allowedMode(m, true)), ['cell', 'digit', 'both', 'off'])
})

test('the right column starts with the selected profile\'s name in an editable box, cut to the longest name allowed', () => {
  const html = renderEditor([], [], [], 'cell', '', true, true, 'Mine "x"')
  assert.match(html, new RegExp(`<input type="text" data-role="profile-name" maxlength="${MAX_NAME_LENGTH}" value="Mine &quot;x&quot;"`))
  assert.equal(html.indexOf('data-role="profile-name"') < html.indexOf('data-act="add-group"'), true)
  assert.doesNotMatch(html, /active profile/)
})

const checkbox = (html, role) => new RegExp(`<input type="checkbox" data-role="${role}"`).test(html)
const checked = (html, role) => new RegExp(`<input type="checkbox" data-role="${role}"[^>]* checked`).test(html)

const modeButtons = (html) => [...html.matchAll(/<button[^>]*data-role="mode-draft" data-mode="(\w+)"[^>]*>/g)].map((m) => m[1])
const checkedMode = (html) => [...html.matchAll(/<button[^>]*aria-checked="true"[^>]*data-role="mode-draft" data-mode="(\w+)"/g)].map((m) => m[1])

test('use digit colors: the dialog has the checkbox in the top row, above the mode, ticked as the draft is, and offers only Cell and Off when it is off', () => {
  const on = renderEditor([], [], [], 'digit', '', true, true)
  assert.equal(checked(on, 'use-digit-colors'), true)
  assert.match(on, /data-role="use-digit-colors"[^>]*> Use digit colors</)
  assert.equal(on.indexOf('data-role="use-digit-colors"') < on.indexOf('data-role="mode-draft"'), true)
  const off = renderEditor([], [], [], 'digit', '', false, true)
  assert.equal(checkbox(off, 'use-digit-colors'), true)
  assert.equal(checked(off, 'use-digit-colors'), false)
  assert.deepEqual(modeButtons(off), ['cell', 'off'])
  assert.deepEqual(checkedMode(off), ['off'])
})

test('sync: the top row has the sync checkbox beside Use digit colors, ticked while synced, and hides it without digit colors', () => {
  const synced = renderEditor([], [], [], 'cell', '', true, true)
  assert.equal(checked(synced, 'sync'), true)
  assert.match(synced, /data-role="sync"[^>]*> Sync digit profile with cell profile</)
  assert.equal(synced.indexOf('data-role="sync"') < synced.indexOf('data-role="mode-draft"'), true)
  assert.equal(checked(renderEditor([], [], [], 'cell', '', true, false), 'sync'), false)
  assert.equal(checkbox(renderEditor([], [], [], 'cell', '', true, false), 'sync'), true)
  assert.equal(checkbox(renderEditor([], [], [], 'cell', '', false, true), 'sync'), false)
  assert.equal(checkbox(renderProfiles(apart, colorFor, 0), 'sync'), false)
})

test('the mode is one row of buttons, none of them a radio input, and a button group announces the draft mode', () => {
  const html = renderEditor([], [], [], 'both', '', true, true)
  assert.doesNotMatch(html, /type="radio"/)
  assert.match(html, /<div class="cbd-mode" role="radiogroup" aria-label="Mode">(<button[^>]*>[^<]*<\/button>){4}<\/div>/)
})

test('the dialog has the profile list and the groups editor as two columns of one grid, the list first', () => {
  const html = renderEditor([], [], [], 'cell', '<div id="mark-profiles"></div>', true, true)
  assert.match(html, /<div class="cbd-columns cbd-divider"><div class="cbd-column"><div id="mark-profiles"><\/div><\/div><div class="cbd-column">.*profile-name.*Groups</s)
  const css = STYLE_CSS.replace(/\s+/g, ' ')
  assert.match(css, /#color-by-digit-editor \.cbd-columns \{ display: grid; gap: \d+px; grid-template-columns: repeat\(auto-fit, minmax\(\d+px, 1fr\)\)/)
})

test('the dialog is 640 px wide on a desktop and never wider than the window', () => {
  const css = STYLE_CSS.replace(/\s+/g, ' ')
  assert.match(css, /\.dialog\.color-by-digit-dialog \{ width: 640px; max-width: calc\(100vw - \d+px\)/)
})

test('Copy settings and Paste settings are options-row buttons, sized by the row\'s button rule', () => {
  assert.match(COPY_PASTE_BUTTONS_HTML, /data-act="copy-settings">Copy settings<\/button><button[^>]*data-act="paste-settings">Paste settings</)
  assert.doesNotMatch(COPY_PASTE_BUTTONS_HTML, /style=/)
  assert.match(STYLE_CSS, /\.dialog-options\.color-by-digit-dialog button \{/)
})

const menuPicks = (html) => [...html.matchAll(/data-act="pick" data-target="(\w+)" data-index="(\d)" aria-checked="(\w+)"/g)].map((m) => `${m[1]}${m[2]}${m[3] === 'true' ? '*' : ''}`)

test('sync: unsynced, the menu has a Cells section and a Digits section, each listing every profile with its own pick marked', () => {
  const html = renderMenu(apart, colorFor)
  assert.deepEqual(menuPicks(html), ['cells0', 'cells1*', 'cells2', 'digits0', 'digits1', 'digits2*'])
  assert.equal(html.indexOf('>Cells<') < html.indexOf('data-target="cells"'), true)
  assert.equal(html.indexOf('>Digits<') > html.lastIndexOf('data-target="cells"'), true)
  assert.equal(html.indexOf('>Digits<') < html.indexOf('data-target="digits"'), true)
  assert.ok(html.indexOf('data-act="edit"') > html.lastIndexOf('data-act="pick"'))
})

test('sync: synced, or unsynced without digit colors, the menu is one list with no sections', () => {
  for (const state of [synced, setUseDigitColors(apart, false)]) {
    const html = renderMenu(state, colorFor)
    assert.deepEqual(menuPicks(html), ['cells0', 'cells1*', 'cells2'])
    assert.doesNotMatch(html, />Cells<|>Digits</)
  }
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
  assert.equal(CHIP_MAX_GROUPS, 3)
  for (const n of [1, 2, 3]) assert.equal(rows(n), 1, `${n} groups`)
  assert.equal(rows(4), 2)
  assert.equal(rows(6), 2)
  assert.deepEqual(iconLayout(g(6)).map((c) => c.key), ['k0', 'k1', 'k2', 'k3'])
})

test('iconLayout labels each cell with its group\'s shown digit: the lowest if all are below 5, the highest if all are above 5, else the middle', () => {
  const digitOf = (digits) => iconLayout([{ key: 'a', digits }])[0].digit
  assert.equal(digitOf(['0', '1', '2', '3', '4']), '1')
  assert.equal(digitOf(['5']), '5')
  assert.equal(digitOf(['6', '7', '8', '9']), '9')
  assert.equal(digitOf(['1', '3', '5', '7', '9']), '5')
  assert.equal(digitOf(['0', '2', '4', '6', '8']), '4')
  assert.equal(digitOf(['4', '5']), '4')
  assert.equal(digitOf(['6', '7', '9']), '9')
})

test('iconLayout labels a group of only 0 with 0 and a group with no digits with none', () => {
  const layout = iconLayout([{ key: 'a', digits: ['0'] }, { key: 'b', digits: [] }, { key: 'c', digits: ['5', '0'] }])
  assert.deepEqual(layout.map((c) => c.digit), ['0', '', '5'])
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

const cellPlan = (cells, indices = cells.map((_, i) => i), g = groups, managed) => planCellColors(cells, g, indices, managed)

test('cell coloring: a pure cell gets its group color', () => {
  assert.deepEqual(cellPlan([{ value: '1' }, { centre: ['3'] }]), [
    { action: 'add', key: 'a', indices: [0] },
    { action: 'add', key: 'b', indices: [1] }
  ])
})

test('cell coloring: a pure cell loses another group\'s color and gets its own, removals first', () => {
  assert.deepEqual(cellPlan([{ value: '1', colours: ['b'] }]), [
    { action: 'remove', key: 'b', indices: [0] },
    { action: 'add', key: 'a', indices: [0] }
  ])
})

test('cell coloring: a pure cell that already holds its color and no other group color changes nothing', () => {
  assert.deepEqual(cellPlan([{ value: '1', colours: ['a'] }]), [])
})

test('cell coloring: a cell that is not pure loses every group color, whoever painted it', () => {
  assert.deepEqual(cellPlan([{ colours: ['a', 'b'] }, { value: '7', colours: ['a'] }, { centre: ['1', '3'], colours: ['b'] }]), [
    { action: 'remove', key: 'a', indices: [0, 1] },
    { action: 'remove', key: 'b', indices: [0, 2] }
  ])
})

test('cell coloring: a color in no group stays, on a pure cell and on one that is not', () => {
  assert.deepEqual(cellPlan([{ value: '1', colours: ['z'] }, { colours: ['z'] }]), [{ action: 'add', key: 'a', indices: [0] }])
})

test('cell coloring: corner marks are not part of a plan cell, so they never decide', () => {
  assert.deepEqual(cellPlan([{ value: '1', pencilmarks: ['3'] }]), [{ action: 'add', key: 'a', indices: [0] }])
  assert.deepEqual(cellPlan([{ pencilmarks: ['3'] }]), [])
})

test('cell coloring: only the listed cells are planned', () => {
  assert.deepEqual(cellPlan([{ value: '1' }, { value: '1' }], [1]), [{ action: 'add', key: 'a', indices: [1] }])
})

test('cell coloring: managed keys beyond the groups (an old group\'s) come off every listed cell', () => {
  assert.deepEqual(cellPlan([{ value: '1', colours: ['old'] }, { colours: ['old', 'z'] }], undefined, groups, ['a', 'b', 'old']), [
    { action: 'remove', key: 'old', indices: [0, 1] },
    { action: 'add', key: 'a', indices: [0] }
  ])
})

test('cell coloring: groupKeys lists each group\'s key once', () => {
  assert.deepEqual(groupKeys([{ key: 'a', digits: [] }, { key: 'b', digits: [] }, { key: 'a', digits: [] }]), ['a', 'b'])
})

test('cell coloring: digits, centre marks and clears of them are edits; corner marks, colors, pen and undo are not', () => {
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

test('cell coloring: the edit signature moves with the digit and the centre marks, not their order, and ignores corner marks and colors', () => {
  assert.equal(entrySignature({ centre: ['2', '1'] }), entrySignature({ centre: ['1', '2'] }))
  assert.notEqual(entrySignature({ value: '1' }), entrySignature({ value: '2' }))
  assert.notEqual(entrySignature({ centre: ['1'] }), entrySignature({ centre: ['1', '2'] }))
  assert.equal(entrySignature({ value: '1', colours: ['a'], pencilmarks: ['5'] }), entrySignature({ value: '1' }))
})

test('cell coloring: changedIndices lists the positions whose signature differs', () => {
  assert.deepEqual(changedIndices(['a', 'b', 'c'], ['a', 'x', 'y']), [1, 2])
  assert.deepEqual(changedIndices(['a'], ['a']), [])
})

const colorFor = (key) => (key === 'a' ? 'rgb(10, 10, 10)' : 'rgb(240, 240, 240)')

test('mode: a press steps Cell to Digit to Both to Off and back to Cell', () => {
  assert.equal(nextMode('cell', true), 'digit')
  assert.equal(nextMode('digit', true), 'both')
  assert.equal(nextMode('both', true), 'off')
  assert.equal(nextMode('off', true), 'cell')
})

test('mode: the starting mode is the saved mode, else Cell unless auto mode was saved off', () => {
  assert.equal(startingMode(null, null), 'cell')
  assert.equal(startingMode(null, true), 'cell')
  assert.equal(startingMode(null, false), 'off')
  assert.equal(startingMode('off', true), 'off')
  assert.equal(startingMode('cell', false), 'cell')
  assert.equal(startingMode('digit', false), 'digit')
  assert.equal(startingMode('both', false), 'both')
  assert.equal(startingMode('sideways', false), 'off')
  assert.equal(startingMode(null, 'yes'), 'cell')
})

test('mode: the button label reads CELL, DIGIT or BOTH in bold purple, or OFF in light grey, and lets a press through to the button', () => {
  for (const [mode, label] of [['cell', 'CELL'], ['digit', 'DIGIT'], ['both', 'BOTH']]) {
    const html = modeLabelHtml(mode)
    assert.match(html, new RegExp(`^<span data-role="mode"[^>]*>${label}</span>$`))
    assert.match(html, /font:700[^"]*color:#6a1b9a/)
    assert.match(html, /pointer-events:none/)
  }
  const off = modeLabelHtml('off')
  assert.match(off, /^<span data-role="mode"[^>]*>OFF<\/span>$/)
  assert.match(off, /font:400[^"]*color:#b3acbf/)
})

test('mode: installButton draws the label of the mode it is given, and no AUTO box', () => {
  const content = (mode) => { let spec; installButton({ addAuxButton: (x) => { spec = x } }, { refreshControls: () => {} }, mode, ODD, colorFor); return spec.content }
  assert.match(content('cell'), />CELL</)
  assert.match(content('off'), />OFF</)
  assert.doesNotMatch(content('cell'), /AUTO|data-role="auto"|role="checkbox"/)
})

test('mode: planClear takes every listed group color off every cell, digit or not, and leaves colors in no group', () => {
  assert.deepEqual(planClear([{ value: '1', colours: ['a'] }, { colours: ['a', 'z'] }, { value: '3', colours: ['b'] }, { colours: ['z'] }, {}], groupKeys(groups)), [
    { action: 'remove', key: 'a', indices: [0, 1] },
    { action: 'remove', key: 'b', indices: [2] }
  ])
})

test('colorSteps clears a cell that loses a color and puts back the colors it keeps, then adds; a cell that loses nothing is only added to', () => {
  const cells = [{ colours: ['a', 'z'] }, { colours: ['a'] }, { colours: ['b', 'y', 'z'] }, { colours: [] }]
  const ops = [{ action: 'remove', key: 'a', indices: [0, 1] }, { action: 'remove', key: 'b', indices: [2] }, { action: 'add', key: 'c', indices: [1, 3] }]
  assert.deepEqual(colorSteps(cells, ops), [
    { type: 'clear', arg: 'colour', indices: [0, 1, 2] },
    { type: 'colour', arg: 'z', indices: [0, 2] },
    { type: 'colour', arg: 'y', indices: [2] },
    { type: 'colour', arg: 'c', indices: [1, 3] }
  ])
  assert.deepEqual(colorSteps(cells, []), [])
})

test('mode: the dialog opens with the mode choice at the top, on the draft it is given', () => {
  const html = renderEditor([], [], [], 'off', '<div id="mark-profiles"></div>', true)
  assert.equal(html.indexOf('data-role="mode-draft"') < html.indexOf('mark-profiles'), true)
  assert.deepEqual(checkedMode(html), ['off'])
  assert.deepEqual(checkedMode(editor([], [], [], 'cell')), ['cell'])
  assert.deepEqual(modeButtons(html), ['cell', 'digit', 'both', 'off'])
  assert.match(html, /data-mode="digit"[^>]*>Digit</)
  assert.doesNotMatch(html, /auto-draft/)
})

test('iconHtml draws one cell per group, at most four, each with its shown digit in the ink that reads on its color', () => {
  const html = iconHtml('off', [{ key: 'a', digits: ['3', '4'] }, { key: 'b', digits: ['7'] }], colorFor)
  assert.equal(count(html, /<rect data-role="cell"/g), 2)
  assert.match(html, /data-key="a"[^>]*fill="rgb\(10, 10, 10\)"/)
  assert.match(html, /<text[^>]*fill="#fff"[^>]*>3<\/text>/)
  assert.match(html, /<text[^>]*fill="#000"[^>]*>7<\/text>/)
  const six = Array.from({ length: 6 }, (_, i) => ({ key: 'k' + i, digits: [String(i)] }))
  assert.equal(count(iconHtml('cell', six, colorFor), /<rect data-role="cell"/g), 4)
})

test('iconHtml draws the mode label in the upper left and the menu arrow box in the lower right', () => {
  const html = iconHtml('cell', ODD, colorFor)
  assert.match(html, /data-role="mode"[^>]*left:[^;"]*;top:/)
  assert.match(html, /data-role="menu"[^>]*aria-haspopup="menu"[^>]*right:[^;"]*;bottom:/)
  assert.equal(html.indexOf('data-role="mode"') < html.indexOf('data-role="menu"'), true)
})

test('iconHtml gives a group whose palette color is unreadable a grey cell, so the cell still shows', () => {
  assert.match(iconHtml('off', [{ key: 'q', digits: ['2'] }], () => ''), /data-key="q"[^>]*fill="#ccc"/)
})

const profileState = { profiles: [{ name: 'Low <b>', groups: LOW }, { name: 'Odd/Even', groups: ODD }], active: 1 }

const tagsOf = (html, i) => [...html.matchAll(new RegExp(`<button[^>]*data-act="(tag-\\w+)" data-index="${i}"[^>]*aria-pressed="(\\w+)"[^>]*>([^<]*)<`, 'g'))].map((m) => [m[1], m[2], m[3]])

test('renderProfiles lists each profile as a radio row with its handle, colors with shown digits, name and delete button', () => {
  const html = renderProfiles(profileState, colorFor, 0)
  assert.equal(count(html, /data-role="profile-row"/g), 2)
  assert.equal(count(html, /data-role="handle"/g), 2)
  assert.match(html, /role="radiogroup"/)
  assert.equal(count(html, /role="radio"/g), 2)
  assert.equal(count(html, /role="radio"[^>]*aria-checked="true"/g), 1)
  assert.match(html, /data-act="select" data-index="0"[^>]*aria-checked="true"/)
  assert.match(html, /data-act="select" data-index="1"[^>]*aria-checked="false"/)
  assert.match(html, /data-index="0"[^>]*tabindex="0"/)
  assert.match(html, /data-index="1"[^>]*tabindex="-1"/)
  assert.equal(count(html, /data-act="delete"/g), 2)
  assert.match(html, />2 of 6</)
  assert.match(html, /Low &lt;b&gt;/)
  assert.doesNotMatch(html, /Low <b>/)
  assert.equal(count(html, /data-role="chip"/g), 5)
})

test('renderProfiles marks the selected row by aria-checked, not the active one, and the stylesheet gives that row the highlight and a bold name', () => {
  assert.match(renderProfiles(profileState, colorFor, 0), /data-act="select" data-index="0"[^>]*aria-checked="true"/)
  const html = renderProfiles(profileState, colorFor, 0)
  assert.doesNotMatch(html, /#f1ebfb|font-weight/)
  assert.match(STYLE_CSS, /\[aria-checked="true"\] \{[^}]*background: #f1ebfb/)
  assert.match(STYLE_CSS, /\[aria-checked="true"\] \.cbd-name \{[^}]*font-weight: 600/)
})

test('renderProfiles with sync on gives each row one Active tag, pressed on the active profile', () => {
  const html = renderProfiles(profileState, colorFor, 0)
  assert.deepEqual(tagsOf(html, 0), [['tag-cells', 'false', 'Active']])
  assert.deepEqual(tagsOf(html, 1), [['tag-cells', 'true', 'Active']])
})

test('renderProfiles with sync off gives each row a Cells tag and a Digits tag, each pressed on its own profile', () => {
  const split = { ...profileState, digitActive: 0 }
  const html = renderProfiles(split, colorFor, 1)
  assert.deepEqual(tagsOf(html, 0), [['tag-cells', 'false', 'Cells'], ['tag-digits', 'true', 'Digits']])
  assert.deepEqual(tagsOf(html, 1), [['tag-cells', 'true', 'Cells'], ['tag-digits', 'false', 'Digits']])
})

test('renderProfiles drops the two tags to a second line only when sync is off', () => {
  assert.equal(count(renderProfiles({ ...profileState, digitActive: 0 }, colorFor, 0), /class="cbd-profile cbd-two-tags"/g), 2)
  assert.equal(count(renderProfiles(profileState, colorFor, 0), /cbd-two-tags/g), 0)
  assert.match(STYLE_CSS, /\.cbd-two-tags \.cbd-tags \{[^}]*flex-basis: 100%/)
})

test('renderProfiles with digit colors off gives each row one Active tag, since no digit profile is in use', () => {
  const html = renderProfiles({ ...profileState, digitActive: 0, useDigitColors: false }, colorFor, 0)
  assert.deepEqual(tagsOf(html, 0), [['tag-cells', 'false', 'Active']])
})

test('renderProfiles disables delete on the last profile and + New profile at six', () => {
  const one = { profiles: [profileState.profiles[0]], active: 0 }
  assert.equal(count(renderProfiles(one, colorFor, 0), /data-act="delete"[^>]*disabled/g), 1)
  assert.equal(count(renderProfiles(profileState, colorFor, 0), /data-act="delete"[^>]*disabled/g), 0)
  assert.match(renderProfiles(profileState, colorFor, 0), /data-act="new-profile"[^>]*>\+ New profile</)
  assert.equal(count(renderProfiles(profileState, colorFor, 0), /data-act="new-profile"[^>]*disabled/g), 0)
  const six = { profiles: [...profileState.profiles, ...profileState.profiles, ...profileState.profiles], active: 0 }
  assert.match(renderProfiles(six, colorFor, 0), /data-act="new-profile"[^>]*disabled/)
  assert.match(renderProfiles(six, colorFor, 0), />6 of 6</)
})

test('renderProfiles has no name box and no Add button: the name is edited on the right', () => {
  assert.doesNotMatch(renderProfiles(profileState, colorFor, 0), /new-name|data-act="add"/)
})

test('renderProfiles and renderMenu show at most three chips for a profile of six groups, while the icon keeps four', () => {
  const each = { profiles: [{ name: 'Each', groups: Array.from({ length: 6 }, (_, i) => ({ key: 'k' + i, digits: [String(i + 1)] })) }], active: 0 }
  assert.equal(count(renderProfiles(each, colorFor, 0), /data-role="chip"/g), 3)
  assert.equal(count(renderMenu(each, colorFor), /data-role="chip"/g), 3)
  assert.equal(iconLayout(each.profiles[0].groups).length, 4)
})

test('renderMenu has the heading, one row per profile in order with the active one marked, then Edit profiles', () => {
  const html = renderMenu(profileState, colorFor)
  assert.match(html, /Color by digit profile/)
  assert.deepEqual([...html.matchAll(/data-act="pick" data-target="cells" data-index="(\d)"/g)].map((m) => m[1]), ['0', '1'])
  assert.equal(count(html, /aria-checked="true"/g), 1)
  assert.match(html, /data-index="1"[^>]*aria-checked="true"/)
  assert.match(html, /Low &lt;b&gt;/)
  assert.match(html, /data-act="edit"[^>]*>[^<]*Edit profiles…/)
  assert.ok(html.indexOf('data-act="edit"') > html.lastIndexOf('data-act="pick"'))
})

test('installButton: adds an aux-row icon button titled "Color by digit", then refreshControls so the click handler binds', () => {
  const calls = []
  const framework = {
    addAuxButton: (spec) => calls.push(['add', spec]),
    addAppButton: () => calls.push(['wrong row'])
  }
  const app = { refreshControls: () => calls.push(['refresh']) }
  installButton(framework, app, 'off', ODD, colorFor)
  assert.deepEqual(calls.map((c) => c[0]), ['add', 'refresh'])
  const spec = calls[0][1]
  assert.equal(spec.name, 'colorbydigit')
  assert.equal(spec.title, 'Color by digit')
  assert.match(spec.content, /^<div class="icon"[^>]*>[\s\S]*<svg[\s\S]*<\/svg><span data-role="mode"[\s\S]*<span data-role="menu"[\s\S]*<\/span><\/div>$/)
  assert.equal(typeof spec.onClick, 'function')
})

// The parts of a page the script reads to draw the button: the palette variables and a probe element
// that resolves a color. Every palette key is the color #3e63dd.
// Its listeners are kept by event type, so a test can fire the button's own press.
const pageDocument = (extra = {}) => ({
  listeners: {},
  addEventListener (type, fn) { (this.listeners[type] ||= []).push(fn) },
  removeEventListener (type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn) },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  documentElement: {},
  head: { appendChild: () => {} },
  body: { appendChild: () => {} },
  createElement: () => ({ style: {}, remove: () => {} }),
  ...extra
})
// Fires one event at the page's listeners, from a target inside the elements `inside` names (selector to element).
function fire (type, inside = {}, extra = {}) {
  const target = { closest: (selector) => inside[selector] ?? null }
  ;[...(global.document.listeners[type] || [])].forEach((fn) => fn({ type, target, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0, preventDefault () {}, stopPropagation () {}, ...extra }))
}
// A short press on the button proper, away from its arrow box, as listenForButton reads one.
const BUTTON_SELECTOR = '#control-colorbydigit'
const press = () => { fire('pointerdown', { [BUTTON_SELECTOR]: {} }); fire('pointerup', { [BUTTON_SELECTOR]: {} }) }
// A click on a profile menu row: `target` is 'cells' or 'digits'.
const pickRow = (target, index) => fire('click', { '#color-by-digit-menu [data-act]': { dataset: { act: 'pick', target, index: String(index) } } })

const pageWindow = () => ({ getComputedStyle: () => ({ getPropertyValue: () => '#3e63dd', color: 'rgb(62, 99, 221)' }), addEventListener: () => {}, MutationObserver: class { observe () {} } })

test('entry point: wires the settings entry, the button, refreshControls, and a press on the button steps the mode', async () => {
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
    setData: (key, value) => calls.push(['save', key, value]),
    addAuxButton: () => calls.push(['button']),
    addSetting: () => calls.push(['setting'])
  }
  try {
    require(path)
    await new Promise((resolve) => setImmediate(resolve))
    const order = calls.map((c) => c[0])
    assert.ok(order.includes('setting'), `no setting in ${order}`)
    assert.ok(order.indexOf('refresh') > order.indexOf('button'), `refresh before button in ${order}`)
    const savedModes = () => calls.filter((c) => c[0] === 'save' && c[1] === 'ColorByDigit_mode').map((c) => c[2])
    assert.deepEqual(savedModes(), [])
    press()
    assert.deepEqual(savedModes(), ['digit'])
  } finally {
    delete global.Framework; delete global.document; delete global.window
    delete require.cache[path]
    if (saved) require.cache[path] = saved
  }
})

test('entry point: a Framework without getApp warns and changes nothing', () => {
  const path = require.resolve('./color-by-digit.user.js')
  const saved = require.cache[path]
  delete require.cache[path]
  const warnings = []
  const warn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  global.Framework = {}
  try {
    require(path)
    assert.deepEqual(warnings, ['color-by-digit: SudokuPad\'s Framework has no getApp, so nothing was changed'])
  } finally {
    console.warn = warn
    delete global.Framework
    delete require.cache[path]
    if (saved) require.cache[path] = saved
  }
})

test('entry point: no Framework at all is left alone without a warning', () => {
  const path = require.resolve('./color-by-digit.user.js')
  const saved = require.cache[path]
  delete require.cache[path]
  const warnings = []
  const warn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    require(path)
    assert.deepEqual(warnings, [])
  } finally {
    console.warn = warn
    delete require.cache[path]
    if (saved) require.cache[path] = saved
  }
})

// A SudokuPad stand-in for the cell coloring wrapper: cells hold a digit and colors, `act` applies
// value/clear/colour/select/deselect/group actions and records every call, and `puzzle.inGroup` follows the group actions.
// The color toggle is SudokuPad's: it adds the key to the cells that lack it unless every cell holds it, and then
// takes it off them. `single` mimics SudokuPad with Multi-color off (Cell.toggleColour): a cell that holds two colors,
// or not the key, is cleared first, so adding a key replaces what the cell held, and taking one off a cell that held
// two leaves just that key. A clear of `colour` takes every color off.
function mockApp (cellDefs, { single = false } = {}) {
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
      if (action.type === 'clear') sel.forEach((c) => { if (action.arg === 'colour') c.colours = []; else c.value = '' })
      if (action.type === 'colour') {
        const key = action.arg
        const all = sel.every((c) => c.colours.includes(key))
        sel.filter((c) => all || !c.colours.includes(key)).forEach((c) => {
          if (single && (c.colours.length > 1 || !c.colours.includes(key))) c.colours = []
          c.colours = c.colours.includes(key) ? c.colours.filter((k) => k !== key) : [...c.colours, key]
        })
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

// `stored` is what Framework.getData answers besides the Odd/Even profile; nothing stored starts the mode at Cell.
// Framework.setData writes to the same store, which the test reads as `app.stored`.
async function withScript (app, fn, stored = {}) {
  const path = require.resolve('./color-by-digit.user.js')
  const saved = require.cache[path]
  delete require.cache[path]
  app.stored = { ColorByDigit_profiles: { profiles: [{ name: 'Odd/Even', groups: ODD }], active: 0 }, ...stored }
  global.document = pageDocument()
  global.window = pageWindow()
  global.Framework = {
    getApp: () => Promise.resolve(app),
    getData: (key) => app.stored[key] ?? null,
    setData: (key, value) => { app.stored[key] = value },
    addAuxButton: (spec) => { app.buttonContent = spec.content },
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

test('cell coloring: a digit entry is one group with its color change inside it', async () => {
  await withScript(mockApp([{}, {}]), async (app) => {
    select(app, 0)
    app.calls.length = 0
    app.act({ type: 'value', arg: '1' })
    assert.deepEqual(types(app), ['groupstart', 'value', 'colour', 'groupend'])
    assert.deepEqual(app.puzzle.cells[0].colours, ['1'])
    assert.equal(app.puzzle.inGroup, false)
  })
})

test('cell coloring: with Multi-color off, taking a second color off a cell that clears it still leaves the cell its group color', async () => {
  await withScript(mockApp([{ colours: ['1', '2'] }], { single: true }), async (app) => {
    select(app, 0)
    app.act({ type: 'value', arg: '3' })
    assert.deepEqual(app.puzzle.cells[0].colours, ['1'])
    assert.equal(app.puzzle.inGroup, false)
  })
})

test('cell coloring: an entry SudokuPad already runs in a group adds its colors to that group, never opens another', async () => {
  await withScript(mockApp([{}]), async (app) => {
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

test('cell coloring: anything that is not a digit or centre mark entry passes straight through', async () => {
  await withScript(mockApp([{}]), async (app) => {
    select(app, 0)
    app.calls.length = 0
    app.act({ type: 'colour', arg: '9' })
    app.act({ type: 'pencilmarks', arg: '1' })
    app.act({ type: 'clear', arg: 'colour' })
    assert.deepEqual(app.calls, ['colour:9', 'pencilmarks:1', 'clear:colour'])
  })
})

test('cell coloring: a clear with nothing to clear, and a digit on a given, open no group', async () => {
  await withScript(mockApp([{}, { given: '5' }]), async (app) => {
    select(app, 0)
    app.calls.length = 0
    app.act({ type: 'clear', arg: 'normal' })
    select(app, 1)
    app.act({ type: 'value', arg: '3' })
    assert.deepEqual(app.calls, ['clear:normal', 'value:3'])
  })
})

test('mode: in Off, saved or from auto mode saved off, a digit entry passes straight through and loading colors nothing', async () => {
  for (const saved of [{ ColorByDigit_mode: 'off' }, { ColorByDigit_auto: false }]) {
    await withScript(mockApp([{}, { given: '1' }]), async (app) => {
      assert.deepEqual(app.puzzle.cells.map((c) => c.colours), [[], []])
      select(app, 0)
      app.calls.length = 0
      app.act({ type: 'value', arg: '1' })
      assert.deepEqual(app.calls, ['value:1'])
      app.handlers.restarted()
      assert.deepEqual(app.puzzle.cells.map((c) => c.colours), [[], []])
    }, saved)
  }
})

test('mode: in Cell, nothing saved or auto mode saved on, loading colors the givens', async () => {
  for (const saved of [{}, { ColorByDigit_auto: true }, { ColorByDigit_mode: 'cell', ColorByDigit_auto: false }]) {
    await withScript(mockApp([{ given: '1' }, { given: '2' }]), async (app) => {
      assert.deepEqual(app.puzzle.cells.map((c) => c.colours), [['1'], ['2']])
    }, saved)
  }
})

test('use digit colors: saved off, a saved Both loads as Cell and colors the givens, and a saved Digit loads as Off and colors nothing', async () => {
  const profiles = { profiles: [{ name: 'Odd/Even', groups: ODD }], active: 0, useDigitColors: false }
  for (const [savedMode, label, colours] of [['both', 'CELL', [['1'], ['2']]], ['digit', 'OFF', [[], []]]]) {
    await withScript(mockApp([{ given: '1' }, { given: '2' }]), async (app) => {
      assert.match(app.buttonContent, new RegExp(`>${label}<`), savedMode)
      assert.deepEqual(app.puzzle.cells.map((c) => c.colours), colours, savedMode)
    }, { ColorByDigit_profiles: profiles, ColorByDigit_mode: savedMode })
  }
})

test('cell coloring: a restart colors the givens again', async () => {
  await withScript(mockApp([{ given: '1' }, { given: '2' }]), async (app) => {
    app.handlers.restarted()
    assert.deepEqual(app.puzzle.cells.map((c) => c.colours), [['1'], ['2']])
    assert.equal(app.puzzle.inGroup, false)
  })
})

const UNSYNCED_BOTH = { ColorByDigit_mode: 'both', ColorByDigit_profiles: { profiles: [{ name: 'Odd/Even', groups: ODD }, { name: 'Low/5/High', groups: LOW }], active: 0, digitActive: 0 } }

test('sync: unsynced in Both, a Digits pick saves the digit profile and leaves every cell alone, hand-altered ones included, with no action', async () => {
  // Cell 0 is empty with a group color painted by hand; cell 1's group color, given at load, is then taken off by hand.
  await withScript(mockApp([{ colours: ['1'] }, { value: '3' }]), async (app) => {
    app.puzzle.cells[1].colours = []
    app.calls.length = 0
    pickRow('digits', 1)
    assert.equal(app.stored.ColorByDigit_profiles.digitActive, 1)
    assert.deepEqual(app.calls, [])
    assert.deepEqual(app.puzzle.cells.map((c) => c.colours), [['1'], []])
  }, UNSYNCED_BOTH)
})

test('sync: unsynced in Both, a Cells pick recolors the cells: a 6 goes from Odd/Even\'s even color to Low/5/High\'s high one', async () => {
  await withScript(mockApp([{ value: '6' }]), async (app) => {
    assert.deepEqual(app.puzzle.cells[0].colours, ['2'])
    pickRow('cells', 1)
    assert.equal(app.stored.ColorByDigit_profiles.active, 1)
    assert.deepEqual(app.puzzle.cells[0].colours, ['9'])
  }, UNSYNCED_BOTH)
})

test('mode: leaving cell coloring keeps a hand color in no group on a cell that held a group color too, Multi-color on or off, in one undo step', async () => {
  for (const single of [false, true]) {
    await withScript(mockApp([{ value: '1' }, { value: '4' }], { single }), async (app) => {
      assert.deepEqual(app.puzzle.cells.map((c) => c.colours), [['1'], ['2']])
      // A hand color in no group of Odd/Even, painted while Multi-color was on.
      app.puzzle.cells[0].colours = ['1', '9']
      app.calls.length = 0
      press()
      assert.equal(app.stored.ColorByDigit_mode, 'off')
      assert.deepEqual(app.puzzle.cells.map((c) => c.colours), [['9'], []], `single ${single}`)
      assert.deepEqual(types(app).filter((t) => t.startsWith('group')), ['groupstart', 'groupend'], `single ${single}`)
      assert.equal(app.puzzle.inGroup, false)
    }, { ColorByDigit_mode: 'both' })
  }
})

test('Each digit: an install already offered it keeps the Each digit it has, on the first page\'s keys, and gets no second one', async () => {
  const oldEachDigit = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => ({ key: d, digits: [d] }))
  const saved = { profiles: [{ name: 'Odd/Even', groups: ODD }, { name: 'Each digit', groups: oldEachDigit }], active: 0 }
  await withScript(mockApp([{}]), async (app) => {
    assert.deepEqual(app.stored.ColorByDigit_profiles, saved)
  }, { ColorByDigit_profiles: saved, ColorByDigit_addedPreloads: true, ColorByDigit_addedEachDigit: true })
})

// A page is ten keys: the key at index K sits on SudokuPad's button K. Each key's color is its own name here.
// The editor without a profile list.
const editor = (groups, pages, shown, mode = 'cell') => renderEditor(groups, pages, shown, mode, '', true)
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
  const html = renderEditor([{ key: 'a', digits: [] }], layoutPages([], 0, colorOf), [0], 'cell', '<div id="mark-profiles"></div>', true)
  assert.doesNotMatch(html, /data-act="preload"|Preload/)
  assert.equal(count(html, /data-act="clear"[^>]*>Clear all</g), 1)
  assert.ok(html.indexOf('mark-profiles') < html.indexOf('data-act="clear"'))
})

test('VERSION is the @version in the script header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, 'color-by-digit.user.js'), 'utf8')))
})

test('renderEditor lays each group\'s digits out as a numpad: 1 to 9 in SudokuPad\'s order with 0 alone under 8', () => {
  const html = editor([{ key: 'a', digits: ['1', '0'] }], [], [0])
  assert.deepEqual([...html.matchAll(/data-act="digit"[^>]*data-digit="(\d)"/g)].map((m) => m[1]), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'])
  assert.doesNotMatch(html, /grid-column|grid-template-columns/)
  assert.match(STYLE_CSS, /\[data-role="numpad"\] \{[^}]*grid-template-columns: repeat\(3,/)
  assert.match(STYLE_CSS, /\[data-digit="0"\] \{[^}]*grid-column: 2/)
  assert.doesNotMatch(STYLE_CSS, /\[data-digit="[1-9]"\]/)
})

test('renderEditor keeps the in-group digits bold and full opacity and the others dimmed', () => {
  const html = editor([{ key: 'a', digits: ['3'] }], [], [0])
  assert.match(html, /data-digit="3"[^>]*font-weight:bold/)
  assert.match(html, /data-digit="3"[^>]*opacity:1/)
  assert.match(html, /data-digit="4"[^>]*font-weight:normal/)
  assert.match(html, /data-digit="4"[^>]*opacity:0.4/)
})

test('renderEditor gives each group a red × in its box\'s upper right corner, named "Remove group", and no Remove text button', () => {
  const html = editor([{ key: 'a', digits: [] }, { key: 'b', digits: [] }], [], [0, 0])
  assert.doesNotMatch(html, />Remove</)
  const buttons = [...html.matchAll(/<button[^>]*data-act="remove"[^>]*>(.*?)<\/button>/g)]
  assert.equal(buttons.length, 2)
  assert.deepEqual(buttons.map((m) => m[1]), ['&#215;', '&#215;'])
  assert.deepEqual([...html.matchAll(/data-act="remove" data-group="(\d)"/g)].map((m) => m[1]), ['0', '1'])
  const tag = buttons[0][0]
  assert.match(tag, /aria-label="Remove group"/)
  assert.match(tag, /title="Remove group"/)
  assert.match(STYLE_CSS, /\[data-act="remove"\] \{[^}]*position: absolute;\s+top: \d+px;\s+right: \d+px/)
  assert.match(STYLE_CSS, /\[data-act="remove"\] \{[^}]*color: #c0392b/)
})

// What stays inline is what depends on a value: a swatch's or chip's color, a chip's size, a digit's weight and dimming.
const VALUE_PROPERTIES = ['background', 'color', 'width', 'height', 'font-size', 'font-weight', 'opacity']

test('the editor and the profile list carry inline only the styles that depend on a value', () => {
  const profiles = renderProfiles(profileState, colorFor, 0)
  const html = editor([{ key: 'a2', digits: ['1', '3'] }, { key: 'zz', digits: [] }], twoPages(), [0, 0])
  const properties = [...(profiles + html).matchAll(/ style="([^"]*)"/g)].flatMap((m) => m[1].split(';').filter(Boolean).map((d) => d.split(':')[0].trim()))
  assert.ok(properties.length > 0)
  assert.deepEqual([...new Set(properties)].filter((p) => !VALUE_PROPERTIES.includes(p)), [])
})

test('the stylesheet scopes every rule to the editor, the dialog and its options row, or Color by Digit\'s own classes', () => {
  const selectors = [...STYLE_CSS.matchAll(/^([^{}\n]+) \{/gm)].flatMap((m) => m[1].split(', '))
  assert.ok(selectors.length > 20)
  const scope = /^(#color-by-digit-editor|#color-by-digit-menu|\.dialog\.color-by-digit-dialog|\.dialog-options\.color-by-digit-dialog|\.cbd-)/
  assert.deepEqual(selectors.filter((s) => !scope.test(s)), [])
})

const THREE_GROUPS = [{ key: 'a', digits: ['1'] }, { key: 'b', digits: ['2'] }, { key: 'c', digits: [] }]
const COLORS = [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }]

test('editGroupsFor color changes that group\'s key and keeps its digits and the shown pages', () => {
  assert.deepEqual(editGroupsFor(THREE_GROUPS, [0, 1, 2], 'color', { group: 1, key: 'z' }, COLORS), {
    groups: [THREE_GROUPS[0], { key: 'z', digits: ['2'] }, THREE_GROUPS[2]], shown: [0, 1, 2]
  })
})

test('editGroupsFor digit moves the digit into the chosen group', () => {
  assert.deepEqual(editGroupsFor(THREE_GROUPS, [0, 1, 2], 'digit', { group: 2, digit: '1' }, COLORS).groups, [
    { key: 'a', digits: [] }, { key: 'b', digits: ['2'] }, { key: 'c', digits: ['1'] }
  ])
})

test('editGroupsFor add-group picks the first unused color', () => {
  assert.deepEqual(editGroupsFor(THREE_GROUPS, [0, 1, 2], 'add-group', {}, COLORS), {
    groups: [...THREE_GROUPS, { key: 'd', digits: [] }], shown: [0, 1, 2]
  })
})

test('editGroupsFor add-group falls back to the first color when all are used', () => {
  const all = COLORS.slice(0, 3)
  assert.deepEqual(editGroupsFor(THREE_GROUPS, [], 'add-group', {}, all).groups[3], { key: 'a', digits: [] })
})

test('editGroupsFor add-group adds nothing with no colors', () => {
  assert.deepEqual(editGroupsFor(THREE_GROUPS, [0, 1, 2], 'add-group', {}, []), { groups: THREE_GROUPS, shown: [0, 1, 2] })
})

test('editGroupsFor remove drops that group and its shown entry and shifts the rest', () => {
  assert.deepEqual(editGroupsFor(THREE_GROUPS, [5, 6, 7], 'remove', { group: 1 }, COLORS), { groups: [THREE_GROUPS[0], THREE_GROUPS[2]], shown: [5, 7] })
})

test('editGroupsFor clear empties groups and shown', () => {
  assert.deepEqual(editGroupsFor(THREE_GROUPS, [5, 6, 7], 'clear', {}, COLORS), { groups: [], shown: [] })
})

test('rowAfterKey: Enter and Space stay, the arrows step and wrap at both ends, other keys give null', () => {
  assert.equal(rowAfterKey('Enter', 1, 3), 1)
  assert.equal(rowAfterKey(' ', 2, 3), 2)
  assert.equal(rowAfterKey('ArrowDown', 1, 3), 2)
  assert.equal(rowAfterKey('ArrowRight', 2, 3), 0)
  assert.equal(rowAfterKey('ArrowUp', 1, 3), 0)
  assert.equal(rowAfterKey('ArrowLeft', 0, 3), 2)
  assert.equal(rowAfterKey('a', 1, 3), null)
  assert.equal(rowAfterKey('Tab', 1, 3), null)
})

test('copiedSettings: the profiles and the mode in force, groups saved before profiles included, and no auto mode', () => {
  const saved = { ColorByDigit_profiles: { profiles: [{ name: 'Odd/Even', groups }], active: 0 }, ColorByDigit_mode: 'digit', ColorByDigit_addedPreloads: true, ColorByDigit_addedEachDigit: true, ColorByDigit_groups: [{ key: 'z', digits: ['1'] }], ColorByDigit_auto: true, Other_key: 1 }
  const { ColorByDigit_groups: _legacy, ColorByDigit_auto: _auto, Other_key: _other, ...ours } = saved
  assert.deepEqual(JSON.parse(copiedSettings({ getData: (key) => saved[key] ?? null })), JSON.parse(JSON.stringify(ours)))
  const legacyOnly = { ColorByDigit_groups: [{ key: '3', digits: ['1', '2'] }] }
  const copied = JSON.parse(copiedSettings({ getData: (key) => legacyOnly[key] ?? null }))
  assert.deepEqual(copied.ColorByDigit_profiles, JSON.parse(JSON.stringify(stateFromStored(null, legacyOnly.ColorByDigit_groups))))
  assert.equal(copied.ColorByDigit_profiles.profiles[copied.ColorByDigit_profiles.active].groups[0].key, '3')
  assert.equal(copied.ColorByDigit_mode, 'cell')
  assert.equal('ColorByDigit_auto' in copied, false)
  assert.equal('ColorByDigit_addedPreloads' in copied, false)
  assert.equal('ColorByDigit_addedEachDigit' in copied, false)
  assert.equal(JSON.parse(copiedSettings({ getData: (key) => ({ ColorByDigit_auto: false }[key] ?? null) })).ColorByDigit_mode, 'off')
})

test('pastedSettings: a state that keeps every profile is kept, one that loses a profile is skipped and counted, other keys are ignored', () => {
  const profiles = { profiles: [{ name: ' Odd/Even ', groups }], active: 0 }
  const pasted = pastedSettings(JSON.stringify({ ColorByDigit_profiles: profiles, ColorByDigit_mode: 'sideways', ColorByDigit_addedPreloads: true, ColorByDigit_addedEachDigit: true, DarkPage_color: '#ffffff' }))
  assert.deepEqual(pasted.values, { ColorByDigit_profiles: stateFromStored(profiles), ColorByDigit_addedPreloads: true, ColorByDigit_addedEachDigit: true })
  assert.equal(pasted.skipped, 1)
  const oneBad = { profiles: [{ name: 'Odd/Even', groups }, { name: 'bad' }], active: 0 }
  assert.deepEqual(pastedSettings(JSON.stringify({ ColorByDigit_profiles: oneBad, ColorByDigit_mode: 'both' })), { values: { ColorByDigit_mode: 'both' }, skipped: 1 })
  assert.deepEqual(pastedSettings(JSON.stringify({ ColorByDigit_profiles: { profiles: [] } })), { values: {}, skipped: 1 })
})

test('pastedSettings: settings copied before the mode, with auto mode and no mode, give Cell for on and Off for off', () => {
  assert.deepEqual(pastedSettings(JSON.stringify({ ColorByDigit_auto: true })), { values: { ColorByDigit_mode: 'cell' }, skipped: 0 })
  assert.deepEqual(pastedSettings(JSON.stringify({ ColorByDigit_auto: false })), { values: { ColorByDigit_mode: 'off' }, skipped: 0 })
  assert.deepEqual(pastedSettings(JSON.stringify({ ColorByDigit_auto: 'yes' })), { values: {}, skipped: 1 })
  assert.deepEqual(pastedSettings(JSON.stringify({ ColorByDigit_mode: 'cell', ColorByDigit_auto: false })), { values: { ColorByDigit_mode: 'cell' }, skipped: 0 })
})

test('copiedSettings and pastedSettings carry the digit pick and "Use digit colors", and settings without them paste as synced and on', () => {
  const saved = { ColorByDigit_profiles: { profiles: [{ name: 'A', groups }, { name: 'B', groups: [] }], active: 0, digitActive: 1, useDigitColors: false } }
  const copied = copiedSettings({ getData: (key) => saved[key] ?? null })
  assert.deepEqual(JSON.parse(copied).ColorByDigit_profiles, saved.ColorByDigit_profiles)
  const pasted = pastedSettings(copied).values.ColorByDigit_profiles
  assert.equal(pasted.digitActive, 1)
  assert.equal(usesDigitColors(pasted), false)
  const old = pastedSettings(JSON.stringify({ ColorByDigit_profiles: { profiles: [{ name: 'A', groups }], active: 0 } })).values.ColorByDigit_profiles
  assert.equal(isSynced(old), true)
  assert.equal(usesDigitColors(old), true)
})

test('pastedSettings: throws on text that is not a JSON object', () => {
  assert.throws(() => pastedSettings('x'), /not JSON/)
  assert.throws(() => pastedSettings('true'), /not a settings object/)
})

test('pasteReport: says how many were pasted and how many skipped, and when the text held nothing', () => {
  assert.equal(pasteReport(2, 0), 'Pasted 2 settings.')
  assert.equal(pasteReport(1, 3), 'Pasted 1 setting; skipped 3 that did not check out.')
  assert.equal(pasteReport(0, 1), 'Pasted 0 settings; skipped 1 that did not check out.')
  assert.equal(pasteReport(0, 0), 'Nothing to paste: the text holds none of this script\'s settings.')
})

test('pastedSettings: text with none of this script\'s keys pastes and skips nothing', () => {
  assert.deepEqual(pastedSettings('{}'), { values: {}, skipped: 0 })
  assert.deepEqual(pastedSettings(JSON.stringify({ DarkPage_color: '#ffffff' })), { values: {}, skipped: 0 })
})

// An independent sRGB -> OKLCH (Ottosson's published matrices), so the tests do not lean on
// the script's own conversion. Returns { L, C, h } with h in degrees.
function oklch (hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, C: Math.hypot(A, B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 }
}
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

test('parseColor reads rgb(), rgba() and #rrggbb, clamping out-of-range channels, and gives null for transparent or unreadable values', () => {
  assert.deepEqual(parseColor('rgb(61, 153, 245)'), [61, 153, 245])
  assert.deepEqual(parseColor('rgba(0, 0, 255, 0.5)'), [0, 0, 255])
  assert.deepEqual(parseColor('#3d99f5'), [61, 153, 245])
  assert.deepEqual(parseColor('#fff'), [255, 255, 255])
  assert.deepEqual(parseColor('rgb(-36, -36, -36)'), [0, 0, 0])
  for (const bad of ['transparent', '', 'banana', 'rgb(1, 2)', undefined, null, 'rgba(0, 0, 0, 0)', 'red']) assert.equal(parseColor(bad), null, String(bad))
})

test('darkenColor keeps the hue, lowers OKLCH lightness by the named factor, and gives #rrggbb', () => {
  for (const rgb of [[61, 153, 245], [245, 58, 55], [232, 124, 241], [228, 150, 50], [179, 229, 106]]) {
    const hex = '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('')
    const out = darkenColor(rgb)
    assert.match(out, /^#[0-9a-f]{6}$/)
    assert.ok(hueGap(oklch(hex).h, oklch(out).h) < 3, `${hex} -> ${out}`)
    assert.ok(Math.abs(oklch(out).L - oklch(hex).L * LIGHTNESS_FACTOR) < 0.02, `${hex} -> ${out}`)
  }
  assert.equal(darkenColor([0, 0, 0]), '#000000')
  for (const rgb of [[255, 255, 255], [-36, -36, -36], [999, -5, 40]]) assert.match(darkenColor(rgb), /^#[0-9a-f]{6}$/, JSON.stringify(rgb))
})

// The palette the puzzle shows, as readColor resolves it: key b unreadable.
const SHOWN = { a: 'rgb(61, 153, 245)', c: 'rgb(245, 58, 55)', b: '' }
const shownColor = (key) => SHOWN[key] ?? ''
const digitsNamed = (css) => [...new Set([...css.matchAll(/="(\d)"/g)].map((m) => m[1]))]
const fillOf = (css, selector) => (new RegExp(`${selector.replace(/[[\]().*]/g, '\\$&')}\\s*{\\s*fill:\\s*(#[0-9a-f]{6})`).exec(css) || [])[1]

test('buildDigitCss gives each grouped digit the darker shade of its group\'s shown color, on entered digits, corner marks and centre marks', () => {
  const css = buildDigitCss([{ key: 'a', digits: ['1', '7'] }, { key: 'c', digits: ['2'] }], shownColor)
  for (const [digit, color] of [['1', 'rgb(61, 153, 245)'], ['7', 'rgb(61, 153, 245)'], ['2', 'rgb(245, 58, 55)']]) {
    const shade = darkenColor(parseColor(color))
    assert.equal(fillOf(css, `#cell-values [${DIGIT_ATTR}="${digit}"]`), shade, digit)
    assert.equal(fillOf(css, `#svgrenderer #cell-pencilmarks .cell-pencilmark[data-val="${digit}"]`), shade, digit)
    assert.equal(fillOf(css, `#svgrenderer #cell-candidates tspan[data-val="${digit}"]`), shade, digit)
  }
})

test('buildDigitCss reads the palette it is given, so a puzzle\'s own palette gets its own shades', () => {
  const own = buildDigitCss([{ key: 'a', digits: ['1'] }], () => 'rgb(232, 124, 241)')
  assert.equal(fillOf(own, `#cell-values [${DIGIT_ATTR}="1"]`), darkenColor([232, 124, 241]))
})

test('buildDigitCss leaves out a group whose color is unreadable, so its digits keep SudokuPad\'s color, and never names givens', () => {
  const css = buildDigitCss([{ key: 'a', digits: ['1'] }, { key: 'b', digits: ['3'] }], shownColor)
  assert.match(css, /"1"/)
  assert.doesNotMatch(css, /"3"/)
  assert.doesNotMatch(css, /cell-given/)
})

test('buildDigitCss leaves out a digit in no group, even where every key, an absent one included, reads as a color', () => {
  const css = buildDigitCss([{ key: 'a', digits: ['1'] }], () => 'rgb(61, 153, 245)')
  assert.deepEqual(digitsNamed(css), ['1'])
  assert.equal(buildDigitCss([], () => 'rgb(61, 153, 245)'), '')
})

test('buildDigitCss keeps a conflicting mark on its shade: no rule outlines it or names the conflict state', () => {
  const css = buildDigitCss([{ key: 'a', digits: ['7'] }], shownColor)
  assert.equal(css.split('}').filter((r) => r.includes('data-val')).length, 2)
  assert.doesNotMatch(css, /stroke|conflict/)
})

test('the circle CSS shows the circles only while SudokuPad shows conflicts, never takes a pointer event, and fills with a translucent color', () => {
  assert.match(CIRCLE_CSS, /#color-by-digit-circles\s*{[^}]*display:\s*none/)
  assert.match(CIRCLE_CSS, /\.setting-checkpencilmarks #color-by-digit-circles\s*{[^}]*display:\s*inline/)
  assert.match(CIRCLE_CSS, /#color-by-digit-circles\s*{[^}]*pointer-events:\s*none/)
  assert.match(CIRCLE_CSS, /#color-by-digit-circles circle\s*{[^}]*fill:\s*#[0-9a-f]{6}/i)
  assert.match(CIRCLE_CSS, /#color-by-digit-circles circle\s*{[^}]*fill-opacity:\s*0?\.\d/)
})

test('circleFor centres on the mark\'s middle and is sized by its width', () => {
  // A corner mark measured on sudokupad.app: a digit 10 units wide, middle at (352, 35.8).
  const c = circleFor({ x: 352, y: 35.8, width: 10 })
  assert.equal(c.cx, 352)
  assert.equal(c.cy, 35.8)
  assert.ok(c.r >= 7 && c.r <= 10, `r ${c.r}`)
  assert.equal(circleFor({ x: 352, y: 35.8, width: 20 }).r, 2 * c.r)
})

test('inkMiddle centres on the digit\'s ink, not on its advance box or its font\'s em box', () => {
  // A character whose advance box starts at x 100 and whose em box starts at y 20, with a font
  // ascent of 10: the baseline is at y 30. The ink starts 1 right of the origin and reaches 5 right of it, and 7
  // above and 0 below the baseline.
  const middle = inkMiddle({ x: 100, y: 20 }, { left: -1, right: 5, ascent: 7, descent: 0, fontAscent: 10 })
  assert.equal(middle.x, 103)
  assert.equal(middle.y, 26.5)
  assert.equal(inkMiddle({ x: 100, y: 20 }, { left: -1, right: 5, ascent: 7, descent: 1, fontAscent: 10 }).y, 27)
  assert.equal(inkMiddle({ x: 100, y: 20 }, { left: 1, right: 5, ascent: 7, descent: 0, fontAscent: 10 }).x, 102)
})

test('inkMiddle throws when the browser lacks a measure, instead of giving NaN', () => {
  const whole = { left: -1, right: 5, ascent: 7, descent: 0, fontAscent: 10 }
  for (const key of Object.keys(whole)) {
    assert.throws(() => inkMiddle({ x: 100, y: 20 }, { ...whole, [key]: undefined }), new RegExp(`no ${key} measure`), key)
  }
})

test('digitOfText reads a single digit and nothing else', () => {
  assert.equal(digitOfText('5'), '5')
  assert.equal(digitOfText(' 5 '), '5')
  for (const bad of ['', '12', 'x', '-1', null, undefined]) assert.equal(digitOfText(bad), null, String(bad))
})

test('the mode row outranks the profile list\'s column rule, so the four buttons stay in a row', () => {
  const css = STYLE_CSS.replace(/\s+/g, ' ')
  assert.match(css, /#color-by-digit-editor \.cbd-mode\[role="radiogroup"\] \{ display: flex; flex-direction: row;/)
})
