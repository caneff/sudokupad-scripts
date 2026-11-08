'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { startOnStandInPage, failEachListener } = require('./specs/broken-sudokupad.js')
const { fakeStore, quietly } = require('./fake-store.js')
const { openingDraft, reduceDraft, lackingInternals, FEATURES, copiedSettings, pastedSettings, READERS, withModeFromAuto, installButton, BOTTOM_ROW_CSS, buttonLabel, colorSteps, planColoring, planCellColors, groupKeys, isEntryAction, entrySignature, changedIndices, nextMode, startingMode, planClear, readCentreMarks, toPlanCell, setDigitColor, strokeKey, paintDigit, canonicalGroups, startingBrush, rowAfterKey, normalizeGroups, stateFromStored, saveProfiles, withAddedPreloads, copyProfile, renameProfile, deleteProfile, moveProfile, indexAfterDelete, indexAfterMove, setActive, setProfileGroups, activeGroups, digitGroups, isSynced, usesDigitColors, setSync, setDigitActive, setUseDigitColors, digitChoice, chooseDigit, renderPulldowns, allowedMode, dropIndex, planSwitch, iconHtml, renderChips, shownChips, renderProfiles, renderMenu, isVisibleColor, layoutPages, layoutColors, initialPage, renderEditor, swatchWithKey, STYLE_CSS, PRELOADS, darkenColor, parseColor, buildDigitCss, digitOfText, circleFor, inkMiddle, CIRCLE_CSS, DIGIT_ATTR, MAX_PROFILES, MAX_NAME_LENGTH, VERSION } = require('../color-by-digit.user.js')
const readPaste = (text) => pastedSettings(text, READERS, withModeFromAuto)

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

const PROFILES = 'ColorByDigit_profiles'
const LEGACY = 'ColorByDigit_groups'
// The state in force with `profiles` and `legacy` saved; null or undefined is a key not saved.
const fromStored = (profiles, legacy) => quietly(() => stateFromStored(fakeStore({ ...(profiles != null && { [PROFILES]: profiles }), ...(legacy != null && { [LEGACY]: legacy }) }))).result

test('garbage under the profiles key gives the preloads, and is still in _unreadable after the preloads are saved', () => {
  const store = fakeStore({ [PROFILES]: 'garbage from a newer version' })
  const { result: state } = quietly(() => stateFromStored(store))
  assert.deepEqual(names(state), ALL_PRELOAD_NAMES)
  saveProfiles(store, state)
  assert.equal(store.data[`${PROFILES}_unreadable`], 'garbage from a newer version')
  assert.deepEqual(stateFromStored(store), state)
})

test('a fresh install has the five preloads, with Low/5/High active', () => {
  const state = fromStored(null, null)
  assert.deepEqual(names(state), ALL_PRELOAD_NAMES)
  assert.equal(state.active, 0)
  assert.deepEqual(activeGroups(state), LOW)
})

test('a fresh install returns copies, so editing one never edits the preloads', () => {
  const state = fromStored(null, null)
  state.profiles[0].groups[0].digits.push('x')
  assert.deepEqual(PRELOADS['Low/5/High'][0].digits, ['0', '1', '2', '3', '4'])
  assert.deepEqual(fromStored(null, null).profiles[0].groups, LOW)
})

test('saved groups equal to a preload make that preload the active profile, beside the other preloads', () => {
  const state = fromStored(null, cloneOf(ODD))
  assert.deepEqual(names(state), ALL_PRELOAD_NAMES)
  assert.equal(state.active, 1)
  assert.deepEqual(activeGroups(fromStored(undefined, cloneOf(LOW))), LOW)
  assert.equal(fromStored(undefined, cloneOf(LOW)).active, 0)
})

test('saved groups that equal no preload become the active profile named Custom, first, beside the five preloads, even when empty', () => {
  const mine = [{ key: '3', digits: ['1', '2'] }]
  assert.deepEqual(fromStored(null, mine), { profiles: [{ name: 'Custom', groups: mine }, { name: 'Low/5/High', groups: LOW }, { name: 'Odd/Even', groups: ODD }, { name: 'Entropic', groups: ENTROPIC }, { name: 'Modular', groups: MODULAR }, { name: 'Each digit', groups: EACH_DIGIT }], active: 0 })
  assert.deepEqual(fromStored(null, []).profiles[0], { name: 'Custom', groups: [] })
})

test('saved groups are cleaned on the way in: a digit in two groups stays in the first, a stray digit drops, and an unequal result is Custom', () => {
  const messy = [{ key: '1', digits: ['1', '2', 'x'] }, { key: '2', digits: ['2', '3'] }]
  assert.deepEqual(fromStored(null, messy).profiles[0], { name: 'Custom', groups: [{ key: '1', digits: ['1', '2'] }, { key: '2', digits: ['3'] }] })
  assert.deepEqual(fromStored(null, [{ key: '1', digits: ['1', '3', '5', '7', '9', 'x'] }, { key: '2', digits: ['0', '2', '4', '6', '8'] }]).active, 1)
})

test('saved groups that are not a list of groups, and no profiles, fall back to a fresh install', () => {
  assert.deepEqual(fromStored(null, { key: 'a' }), fromStored(null, null))
})

test('saved profiles win over saved groups, keeping their order and active one', () => {
  const saved = { profiles: [{ name: 'A', groups: [] }, { name: 'B', groups: LOW }], active: 1 }
  assert.deepEqual(fromStored(saved, cloneOf(ODD)), saved)
})

test('saved profiles are untrusted: any unusable profile, or more than six, falls back to a fresh install', () => {
  const fresh = fromStored(null, null)
  const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name) => ({ name, groups: [] }))
  for (const bad of [{}, { profiles: [] }, { profiles: 'x', active: 0 }, { profiles: [{ name: 3, groups: [] }], active: 0 }, { profiles: [{ name: 'A', groups: 'x' }], active: 0 }, { profiles: [{ name: '  ', groups: [] }], active: 0 }, { profiles: seven, active: 3 }]) {
    assert.deepEqual(fromStored(bad, null), fresh)
  }
})

test('one unusable saved profile refuses the whole state, as a paste of it is refused: the groups saved before profiles stand in, and the state is kept under _unreadable', () => {
  const saved = { profiles: [{ name: 'A', groups: [] }, { name: '', groups: [] }, { name: 'C', groups: LOW }], active: 2 }
  const store = fakeStore({ [PROFILES]: saved, [LEGACY]: cloneOf(ODD) })
  const { result } = quietly(() => stateFromStored(store))
  assert.deepEqual(result, fromStored(null, cloneOf(ODD)))
  assert.deepEqual(store.data[`${PROFILES}_unreadable`], saved)
  assert.deepEqual(readPaste(JSON.stringify({ [PROFILES]: saved })), { values: {}, skipped: 1 })
})

test('an active index that is no profile becomes the first: out of range, negative, fractional or missing', () => {
  const two = [{ name: 'A', groups: [] }, { name: 'B', groups: [] }]
  for (const active of [9, -1, 1.5, undefined, '1']) assert.equal(fromStored({ profiles: two, active }, null).active, 0, String(active))
  assert.equal(fromStored({ profiles: two, active: 1 }, null).active, 1)
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
  assert.equal(fromStored({ profiles: [{ name: long, groups: [] }], active: 0 }).profiles[0].name, cut)
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

// The digit profile: following the cell profile ("synced"), on a profile of its own, and the digit colors on or off.
const synced = { profiles: [{ name: 'A', groups: LOW }, { name: 'B', groups: ODD }, { name: 'C', groups: ENTROPIC }], active: 1 }
const apart = setDigitActive(setSync(synced, false), 2)

test('sync: a state saved before the digit profile is synced and uses digit colors, and digits take the cell profile', () => {
  const state = fromStored(synced, null)
  assert.deepEqual(state, synced)
  assert.equal(isSynced(state), true)
  assert.equal(usesDigitColors(state), true)
  assert.deepEqual(digitGroups(state), ODD)
  assert.equal(isSynced(fromStored(null, null)), true)
  assert.equal(usesDigitColors(fromStored(null, null)), true)
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

test("sync: the cell profile is the profile the button's numbers come from", () => {
  assert.deepEqual(activeGroups(apart), ODD)
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
  assert.deepEqual(digitGroups(fromStored(saved, null)), LOW)
  for (const digitActive of [1, 9, -1, 1.5, '2', null]) assert.equal(isSynced(fromStored({ ...saved, digitActive }, null)), true, String(digitActive))
})

test('use digit colors: off is saved as false and kept through every edit; anything but false reads as on', () => {
  const off = setUseDigitColors(apart, false)
  assert.equal(usesDigitColors(off), false)
  assert.equal(off.useDigitColors, false)
  for (const next of [setActive(off, 0), setSync(off, true), deleteProfile(off, 0), moveProfile(off, 0, 1), copyProfile(off, 0), renameProfile(off, 0, 'Z'), setProfileGroups(off, 0, []), setDigitActive(off, 0), withAddedPreloads(off, ['Modular'])]) {
    assert.equal(usesDigitColors(next), false)
  }
  assert.equal(usesDigitColors(fromStored(off, null)), false)
  assert.equal(usesDigitColors(fromStored({ ...synced, useDigitColors: 'no' }, null)), true)
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

test('the right column has no name box: the digit keys come straight after the Digits heading', () => {
  const html = renderEditor({ groups: [], pages: [], page: 0, brush: null })
  assert.doesNotMatch(html, /profile-name/)
  assert.match(html, /<div class="cbd-column"><div class="cbd-heading">Digits/)
})

test('renderEditor shows one line, first, saying saved profiles could not be read and are kept, only while a copy is kept', () => {
  const editor = (unreadable) => renderEditor({ groups: [], pages: [], page: 0, brush: null, unreadable })
  assert.match(editor(true), /^<div class="cbd-note" data-role="unreadable">[^<]*could not be read[^<]*kept under ColorByDigit_profiles_unreadable[^<]*<\/div>/)
  assert.doesNotMatch(editor(false), /data-role="unreadable"/)
})

// `synced` with a first name that needs escaping, and the same with the digits on that first profile.
const hostile = renameProfile(synced, 0, 'Low <b>')
const hostileApart = setDigitActive(setSync(hostile, false), 0)
const selectOf = (html, role) => html.match(new RegExp(`<select data-role="${role}">(.*?)</select>`, 's'))[1]
const optionsOf = (html, role) => [...selectOf(html, role).matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g)].map((m) => `${m[1]}|${m[3]}${m[2].includes(' selected') ? '*' : ''}`)

test('digitChoice reads the digit pulldown off the state: same as cell, a profile index, or none', () => {
  assert.equal(digitChoice(hostile), 'same')
  assert.equal(digitChoice(hostileApart), '0')
  assert.equal(digitChoice({ ...hostileApart, useDigitColors: false }), 'none')
  assert.equal(digitChoice({ ...hostile, useDigitColors: false }), 'none')
})

test('chooseDigit: Same as cell makes the digits follow the cells, a name makes them follow that profile, None turns digit colors off', () => {
  assert.deepEqual(chooseDigit(hostileApart, 'same'), hostile)
  assert.deepEqual(chooseDigit(hostile, '2'), setDigitActive(setUseDigitColors(hostile, true), 2))
  assert.equal(chooseDigit(hostile, '2').digitActive, 2)
  assert.equal('useDigitColors' in chooseDigit(hostile, '2'), false)
  assert.deepEqual(chooseDigit(hostileApart, 'none'), setUseDigitColors(hostileApart, false))
  assert.equal(chooseDigit(hostileApart, 'none').useDigitColors, false)
  assert.equal(chooseDigit(chooseDigit(hostile, 'none'), '2').digitActive, 2)
  assert.equal(usesDigitColors(chooseDigit(chooseDigit(hostile, 'none'), '2')), true)
  assert.equal(isSynced(chooseDigit(chooseDigit(hostileApart, 'none'), 'same')), true)
  assert.equal(usesDigitColors(chooseDigit(chooseDigit(hostileApart, 'none'), 'same')), true)
})

test('the three pulldowns: Mode, Cell and Digit, in that order, with no checkbox and no mode button', () => {
  const html = renderPulldowns(hostile, 'both')
  assert.deepEqual([...html.matchAll(/<select data-role="([\w-]+)"/g)].map((m) => m[1]), ['mode-draft', 'cell-profile', 'digit-profile'])
  assert.deepEqual([...html.matchAll(/<label class="cbd-pulldown"><span>(\w+)<\/span>/g)].map((m) => m[1]), ['Mode', 'Cell', 'Digit'])
  assert.doesNotMatch(html, /type="checkbox"|<button|data-mode=/)
})

test('the Mode pulldown offers Cell, Digit, Both, Off, selects the draft mode, and offers only Cell and Off while Digit is None', () => {
  assert.deepEqual(optionsOf(renderPulldowns(hostile, 'both'), 'mode-draft'), ['cell|Cell', 'digit|Digit', 'both|Both*', 'off|Off'])
  const none = renderPulldowns({ ...hostile, useDigitColors: false }, 'digit')
  assert.deepEqual(optionsOf(none, 'mode-draft'), ['cell|Cell', 'off|Off*'])
  assert.deepEqual(optionsOf(renderPulldowns({ ...hostile, useDigitColors: false }, 'both'), 'mode-draft'), ['cell|Cell*', 'off|Off'])
})

test('the Cell pulldown lists every profile by name, escaped, selecting the cell profile', () => {
  assert.deepEqual(optionsOf(renderPulldowns(hostile, 'cell'), 'cell-profile'), ['0|Low &lt;b&gt;', '1|B*', '2|C'])
})

test('the Digit pulldown lists Same as cell, every profile, then None, and selects what the state says', () => {
  const names = ['0|Low &lt;b&gt;', '1|B', '2|C']
  const all = (selected) => ['same|Same as cell', ...names, 'none|None'].map((o, i) => (i === selected ? `${o}*` : o))
  assert.deepEqual(optionsOf(renderPulldowns(hostile, 'cell'), 'digit-profile'), all(0))
  assert.deepEqual(optionsOf(renderPulldowns(hostileApart, 'cell'), 'digit-profile'), all(1))
  assert.deepEqual(optionsOf(renderPulldowns({ ...hostileApart, useDigitColors: false }, 'cell'), 'digit-profile'), all(4))
})

test('each pulldown option that names a profile carries its index, so a rename can update the text in place', () => {
  assert.equal(count(renderPulldowns(hostile, 'cell'), /<option value="\d" data-index="\d"/g), 6)
})

test('the pulldowns sit above the profile list and the paint editor, one per row, each label in a fixed-width column left of its select', () => {
  const html = renderEditor({ groups: [], pages: [], page: 0, brush: null, pulldownsHtml: '<div id="pulldowns"></div>', profilesHtml: '<div id="mark-profiles"></div>' })
  assert.equal(html.indexOf('id="pulldowns"') < html.indexOf('mark-profiles'), true)
  const css = STYLE_CSS.replace(/\s+/g, ' ')
  assert.match(css, /\.cbd-pulldowns \{ display: grid; gap: \d+px; margin: 0 0 10px; \}/)
  assert.match(css, /\.cbd-pulldown \{ display: grid; grid-template-columns: \d+px minmax\(0, 1fr\); align-items: center;/)
})

test('the dialog has the profile list and the paint editor as two columns of one grid, the list first', () => {
  const html = renderEditor({ groups: [], pages: [], page: 0, brush: null, profilesHtml: '<div id="mark-profiles"></div>' })
  assert.match(html, /<div class="cbd-columns cbd-divider"><div class="cbd-column"><div id="mark-profiles"><\/div><\/div><div class="cbd-column">.*Digits</s)
  const css = STYLE_CSS.replace(/\s+/g, ' ')
  assert.match(css, /#color-by-digit-editor \.cbd-columns \{ display: grid; gap: \d+px; grid-template-columns: repeat\(auto-fit, minmax\(\d+px, 1fr\)\)/)
})

test('the dialog is 640 px wide on a desktop and never wider than the window', () => {
  const css = STYLE_CSS.replace(/\s+/g, ' ')
  assert.match(css, /\.dialog:has\(#color-by-digit-editor\) \{ width: 640px; max-width: calc\(100vw - \d+px\)/)
})

test('the bottom row keeps no style rule for the copy and paste buttons', () => {
  assert.doesNotMatch(STYLE_CSS, /paste-settings/)
})

const menuPicks = (html) => [...html.matchAll(/data-act="pick" data-target="(\w+)" data-index="(\d)" aria-checked="(\w+)"/g)].map((m) => `${m[1]}${m[2]}${m[3] === 'true' ? '*' : ''}`)

// Each row of the menu, in order: its name, and the attributes of the elements in it that pick.
const menuRows = (html) => html.split('data-role="menu-row"').slice(1).map((row) => ({
  name: /data-role="name"[^>]*>([^<]*)</.exec(row)[1],
  picks: menuPicks(row),
  chipWidth: /<span data-role="chip-column" style="([^"]*)"/.exec(row)[1]
}))

test('sync: unsynced, the menu is one list whose rows each end in a Cell dot and a Digit dot, under the words Cell and Digit, each pick marked in its own column', () => {
  const html = renderMenu(apart, colorFor)
  assert.deepEqual(menuRows(html).map((r) => r.picks), [['cells0', 'digits0'], ['cells1*', 'digits1'], ['cells2', 'digits2*']])
  assert.deepEqual(menuRows(html).map((r) => r.name), ['A', 'B', 'C'])
  const head = html.slice(0, html.indexOf('data-role="menu-row"'))
  assert.match(head, /data-role="column-head"[^>]*>Cell<\/span><span data-role="column-head"[^>]*>Digit</)
  assert.equal(count(html, />Cells?<|>Digits?</g), 2)
  assert.doesNotMatch(html, /data-role="menu-row"[^>]*data-act=/)
  assert.ok(html.indexOf('data-act="edit"') > html.lastIndexOf('data-act="pick"'))
})

test('sync: the menu\'s dot columns and their heads have one width, so each head sits centred over its dots', () => {
  const html = renderMenu(apart, colorFor)
  const widths = [...html.matchAll(/data-role="(?:column-head|dot-column)" style="[^"]*width:(\d+)px/g)].map((m) => m[1])
  assert.equal(widths.length, 2 + 2 * 3)
  assert.equal(new Set(widths).size, 1)
  assert.match(html, /data-role="column-head" style="[^"]*text-align:center/)
  assert.match(html, /data-role="dot-column" style="[^"]*justify-content:center/)
})

test('sync: synced, or unsynced without digit colors, the menu is one list of rows that each pick the profile, with no dots and no column heads', () => {
  for (const state of [synced, setUseDigitColors(apart, false)]) {
    const html = renderMenu(state, colorFor)
    assert.deepEqual(menuPicks(html), ['cells0', 'cells1*', 'cells2'])
    assert.equal(count(html, /data-role="menu-row" data-act="pick"/g), 3)
    assert.doesNotMatch(html, />Cells?<|>Digits?<|data-role="column-head"|data-role="dot-column"/)
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

test('renderChips labels each cell with its group\'s shown digit: the lowest if all are below 5, the highest if all are above 5, else the middle', () => {
  const digitOf = (digits) => runCells(renderChips([{ key: 'a', digits }], colorFor, { size: 16 }))[0].digit
  assert.equal(digitOf(['0', '1', '2', '3', '4']), '1')
  assert.equal(digitOf(['5']), '5')
  assert.equal(digitOf(['6', '7', '8', '9']), '9')
  assert.equal(digitOf(['1', '3', '5', '7', '9']), '5')
  assert.equal(digitOf(['0', '2', '4', '6', '8']), '4')
  assert.equal(digitOf(['4', '5']), '4')
  assert.equal(digitOf(['6', '7', '9']), '9')
})

test('renderChips labels a group of only 0 with 0 and a group with no digits with none', () => {
  const cells = runCells(renderChips([{ key: 'a', digits: ['0'] }, { key: 'b', digits: [] }, { key: 'c', digits: ['5', '0'] }], colorFor, { size: 16 }))
  assert.deepEqual(cells.map((c) => c.digit), ['0', '', '5'])
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

test('swatchWithKey finds the swatch of a key holding a quote or a backslash, and none for a key not shown', () => {
  const swatches = ['a', '"q"', 'b\\'].map((key) => ({ dataset: { key } }))
  const root = { querySelectorAll: (selector) => selector === 'button[data-role="swatch"]' ? swatches : [] }
  assert.equal(swatchWithKey(root, '"q"'), swatches[1])
  assert.equal(swatchWithKey(root, 'b\\'), swatches[2])
  assert.equal(swatchWithKey(root, 'z'), undefined)
})

test('isVisibleColor rejects every transparent spelling and accepts real colors', () => {
  ['', ' ', 'transparent', 'rgba(0, 0, 0, 0)', 'rgba(10,20,30,0)', 'rgba(1 2 3 / 0%)', '#0000', '#00000000', 'hsla(0, 0%, 0%, 0)']
    .forEach((c) => assert.equal(isVisibleColor(c), false, c));
  ['rgb(214, 214, 214)', 'rgba(1,2,3,0.5)', '#fff', '#ffffff', 'red'].forEach((c) => assert.equal(isVisibleColor(c), true, c))
})

test('normalizeGroups puts what it keeps in canonical form: shared colors merged, empty groups dropped, ordered by lowest digit', () => {
  assert.deepEqual(normalizeGroups([g('b', ['5']), g('a', []), g('c', ['2']), g('b', ['3'])]), [g('c', ['2']), g('b', ['3', '5'])])
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

test('mode: the Mode pulldown offers all four modes and selects the draft mode it is given', () => {
  const html = renderPulldowns(hostile, 'off')
  assert.deepEqual(optionsOf(html, 'mode-draft'), ['cell|Cell', 'digit|Digit', 'both|Both', 'off|Off*'])
  assert.doesNotMatch(html, /auto-draft/)
})

const profileState = { profiles: [{ name: 'Low <b>', groups: LOW }, { name: 'Odd/Even', groups: ODD }], active: 1 }

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
  assert.doesNotMatch(html, /#f1ebfb|font-weight:/)
  assert.match(STYLE_CSS, /\[aria-checked="true"\] \{[^}]*background: #f1ebfb/)
})

test('renderProfiles rows have no Cells, Digits or Active tags, whatever the state', () => {
  for (const state of [profileState, { ...profileState, digitActive: 0 }, { ...profileState, digitActive: 0, useDigitColors: false }]) {
    const html = renderProfiles(state, colorFor, 0)
    assert.doesNotMatch(html, /tag-cells|tag-digits|cbd-tag|aria-pressed|cbd-two-tags/)
    assert.doesNotMatch(html, />(Cells|Digits|Active)</)
  }
})

test('renderProfiles puts the name of the selected row in an editable box in place, cut to the longest name allowed, and the other rows keep the name as text', () => {
  const html = renderProfiles({ ...profileState, profiles: [{ name: 'Mine "x"', groups: LOW }, profileState.profiles[1]] }, colorFor, 0)
  assert.match(html, new RegExp(`<input type="text" data-role="profile-name" maxlength="${MAX_NAME_LENGTH}" value="Mine &quot;x&quot;" aria-label="Profile name">`))
  assert.equal(count(html, /data-role="profile-name"/g), 1)
  assert.equal(count(html, /class="cbd-name"/g), 1)
  assert.match(html, /<span class="cbd-name">Odd\/Even<\/span>/)
  assert.equal(html.indexOf('data-role="profile-row"') < html.indexOf('data-role="profile-name"'), true)
  assert.equal(html.indexOf('data-role="profile-name"') < html.indexOf('data-index="1" role="radio"'), true)
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

test('renderProfiles has no Add button', () => {
  assert.doesNotMatch(renderProfiles(profileState, colorFor, 0), /new-name|data-act="add"/)
})

test('the button, renderProfiles and renderMenu all show a profile of six groups as a run of three cells', () => {
  const each = { profiles: [{ name: 'Each', groups: Array.from({ length: 6 }, (_, i) => ({ key: 'k' + i, digits: [String(i + 1)] })) }], active: 0 }
  for (const html of [renderProfiles(each, colorFor, 0), renderMenu(each, colorFor), iconHtml('cell', each.profiles[0].groups, colorFor)]) {
    assert.equal(count(html, /data-role="chip"/g), 3)
    assert.equal(count(html, /<line /g), 2)
  }
})

test('renderMenu has no heading: one dense row per profile in order with the active one marked and highlighted, then Edit profiles', () => {
  const html = renderMenu(profileState, colorFor)
  assert.doesNotMatch(html, /Color by digit profile/i)
  assert.equal(html.indexOf('data-role="menu-row"') < html.indexOf('>'), true)
  assert.match(html, /data-index="1" aria-checked="true" style="[^"]*height:26px[^"]*background:#f1ebfb/)
  assert.match(html, /data-index="0" aria-checked="false" style="[^"]*height:26px/)
  assert.doesNotMatch(html, /data-index="0" aria-checked="false" style="[^"]*background/)
  assert.deepEqual([...html.matchAll(/data-act="pick" data-target="cells" data-index="(\d)"/g)].map((m) => m[1]), ['0', '1'])
  assert.equal(count(html, /aria-checked="true"/g), 1)
  assert.match(html, /data-index="1"[^>]*aria-checked="true"/)
  assert.match(html, /Low &lt;b&gt;/)
  assert.match(html, /data-act="edit"[^>]*>[^<]*Edit profiles…/)
  assert.ok(html.indexOf('data-act="edit"') > html.lastIndexOf('data-act="pick"'))
})

test('installButton: adds an icon button titled "Color by digit" in the bottom row, then refreshControls so the click handler binds', () => {
  const calls = []
  const framework = {
    addControlButton: (spec) => calls.push(['add', spec]),
    addAppButton: () => calls.push(['wrong row'])
  }
  const app = { refreshControls: () => calls.push(['refresh']) }
  installButton(framework, app, 'off', ODD, colorFor, ODD)
  assert.deepEqual(calls.map((c) => c[0]), ['add', 'refresh'])
  const spec = calls[0][1]
  assert.equal(spec.name, 'colorbydigit')
  assert.equal(spec.parent, '.controls-aux')
  assert.equal(spec.title, 'Color by digit: Off')
  assert.match(spec.content, /^<div class="icon"[^>]*>[\s\S]*<svg[\s\S]*<\/svg><span data-role="mode"[\s\S]*<\/span><span data-role="menu"[\s\S]*<\/span><\/div>$/)
  assert.equal(typeof spec.onClick, 'function')
})

// The parts of a page the script reads to draw the button: the palette variables and a probe element
// that resolves a color. Every palette key is the color #3e63dd. The bottom row holds SudokuPad's four buttons.
// Its listeners are kept by event type, so a test can fire the button's own press.
const pageDocument = (extra = {}) => ({
  listeners: {},
  addEventListener (type, fn) { (this.listeners[type] ||= []).push(fn) },
  removeEventListener (type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn) },
  querySelector: (selector) => (selector === '.controls-aux' ? { querySelectorAll: () => [{}, {}, {}, {}] } : null),
  querySelectorAll: () => [],
  getElementById: () => null,
  documentElement: {},
  head: { appendChild: () => {} },
  body: { appendChild: () => {}, append: () => {} },
  createElement: () => ({ style: {}, remove: () => {}, setAttribute: () => {}, append: () => {}, addEventListener: () => {} }),
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
const pickRow = (target, index) => {
  const row = { dataset: { act: 'pick', target, index: String(index) }, style: {}, closest: () => row }
  return fire('click', { '#color-by-digit-menu [data-act]': row })
}

const pageWindow = () => ({ getComputedStyle: () => ({ getPropertyValue: () => '#3e63dd', color: 'rgb(62, 99, 221)' }), addEventListener: () => {}, MutationObserver: class { observe () {} } })

test('entry point: wires the settings entry, the button, refreshControls, and a press on the button steps the mode', async () => {
  const path = require.resolve('../color-by-digit.user.js')
  const saved = require.cache[path]
  delete require.cache[path]
  const calls = []
  const app = {
    puzzle: { cells: [{ given: '1', colours: [], propVisible: () => false, propGet: () => [] }], selectedCells: [], addEventListener: () => {} },
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
    addControlButton: () => calls.push(['button']),
    addSetting: () => calls.push(['setting']),
    showDialog: () => {},
    closeDialog: () => {},
    app: { tools: { colour: {} } }
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

test('entry point: a Framework without getApp turns off the features that need an app, each named once, and starts the rest', async () => {
  const path = require.resolve('../color-by-digit.user.js')
  const saved = require.cache[path]
  delete require.cache[path]
  const warnings = []
  const warn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  const calls = []
  global.document = pageDocument()
  global.window = pageWindow()
  global.Framework = { getData: () => null, setData () {}, addSetting: () => calls.push('setting'), showDialog () {}, closeDialog () {}, app: { tools: { colour: {} } } }
  try {
    require(path)
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(warnings, ['color-by-digit: cell coloring, mode button, redraw after the puzzle loads skipped because SudokuPad has no Framework.getApp'])
    assert.deepEqual(calls, ['setting'])
  } finally {
    console.warn = warn
    delete global.Framework; delete global.document; delete global.window
    delete require.cache[path]
    if (saved) require.cache[path] = saved
  }
})

test('entry point: no Framework at all is left alone without a warning', () => {
  const path = require.resolve('../color-by-digit.user.js')
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
  const puzzle = { cells, selectedCells: [], inGroup: false, addEventListener: () => {} }
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
  const path = require.resolve('../color-by-digit.user.js')
  const saved = require.cache[path]
  delete require.cache[path]
  app.stored = { ColorByDigit_profiles: { profiles: [{ name: 'Odd/Even', groups: ODD }], active: 0 }, ...stored }
  global.document = pageDocument()
  global.window = pageWindow()
  global.Framework = {
    getApp: () => Promise.resolve(app),
    getData: (key) => app.stored[key] ?? null,
    setData: (key, value) => { app.stored[key] = value },
    addControlButton: (spec) => { app.buttonTitle = spec.title },
    addSetting: () => {},
    showDialog: () => {},
    closeDialog: () => {},
    app: { tools: { colour: {} } }
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
  for (const [savedMode, label, colours] of [['both', 'Cell', [['1'], ['2']]], ['digit', 'Off', [[], []]]]) {
    await withScript(mockApp([{ given: '1' }, { given: '2' }]), async (app) => {
      assert.equal(app.buttonTitle, `Color by digit: ${label}`, savedMode)
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
    assert.equal(app.stored.ColorByDigit_profiles.data.digitActive, 1)
    assert.deepEqual(app.calls, [])
    assert.deepEqual(app.puzzle.cells.map((c) => c.colours), [['1'], []])
  }, UNSYNCED_BOTH)
})

test('sync: unsynced in Both, a Cells pick recolors the cells: a 6 goes from Odd/Even\'s even color to Low/5/High\'s high one', async () => {
  await withScript(mockApp([{ value: '6' }]), async (app) => {
    assert.deepEqual(app.puzzle.cells[0].colours, ['2'])
    pickRow('cells', 1)
    assert.equal(app.stored.ColorByDigit_profiles.data.active, 1)
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
const editor = (groups, pages, page = 0, brush = null) => renderEditor({ groups, pages, page, brush })
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

const g = (key, digits) => ({ key, digits })

test('painting a digit moves it out of its group and into the brush color\'s group', () => {
  assert.deepEqual(paintDigit([g('a', ['1', '2']), g('b', ['3'])], '2', 'b'), [g('a', ['1']), g('b', ['2', '3'])])
})

test('painting a digit that has no group starts a group when the brush color has none, and joins it when it has one', () => {
  assert.deepEqual(paintDigit([g('a', ['1'])], '5', 'z'), [g('a', ['1']), g('z', ['5'])])
  assert.deepEqual(paintDigit([g('a', ['1'])], '5', 'a'), [g('a', ['1', '5'])])
})

test('a click in the brush color clears the digit', () => {
  assert.deepEqual(paintDigit([g('a', ['1', '2']), g('b', ['3'])], '3', 'b').map((x) => x.key), ['a'])
  assert.deepEqual(paintDigit([g('a', ['1', '2'])], '2', 'a'), [g('a', ['1'])])
})

test('a group that loses its last digit disappears, to a paint over it or a clear', () => {
  assert.deepEqual(paintDigit([g('a', ['1']), g('b', ['2'])], '1', 'b'), [g('b', ['1', '2'])])
  assert.deepEqual(paintDigit([g('a', ['1'])], '1', 'a'), [])
})

test('groups follow their lowest digit, with 0 counting after 9, and a group lists its digits 0 first', () => {
  assert.deepEqual(paintDigit([g('b', ['5', '6']), g('c', ['0', '8'])], '2', 'z'), [g('z', ['2']), g('b', ['5', '6']), g('c', ['0', '8'])])
  assert.deepEqual(paintDigit([g('b', ['5', '6']), g('c', ['0', '8'])], '1', 'c'), [g('c', ['0', '1', '8']), g('b', ['5', '6'])])
  assert.deepEqual(paintDigit([g('a', ['0']), g('b', ['9'])], '4', 'b'), [g('b', ['4', '9']), g('a', ['0'])])
})

test('groups that share a color merge into one, then the groups are ordered by lowest digit', () => {
  assert.deepEqual(canonicalGroups([g('a', ['4']), g('b', ['1']), g('a', ['2'])]), [g('b', ['1']), g('a', ['2', '4'])])
  assert.deepEqual(canonicalGroups([g('a', ['5']), g('a', ['3'])]), [g('a', ['3', '5'])])
})

test('a saved group with no digits is no group', () => {
  assert.deepEqual(canonicalGroups([g('a', []), g('b', ['1'])]), [g('b', ['1'])])
})

test('every preload comes out of canonicalGroups unchanged', () => {
  Object.entries(PRELOADS).forEach(([name, groups]) => assert.deepEqual(canonicalGroups(groups), groups, name))
})

test('canonicalGroups and the paint operations do not change the list they were given', () => {
  const before = [g('a', ['2']), g('b', ['1']), g('a', ['3'])]
  const copy = JSON.parse(JSON.stringify(before))
  canonicalGroups(before)
  paintDigit(before, '2', 'b')
  setDigitColor(before, '1', null)
  assert.deepEqual(before, copy)
})

test('setDigitColor sets a digit\'s color or, given null, clears it', () => {
  assert.deepEqual(setDigitColor([g('a', ['1', '2'])], '2', 'b'), [g('a', ['1']), g('b', ['2'])])
  assert.deepEqual(setDigitColor([g('a', ['1', '2'])], '2', null), [g('a', ['1'])])
  assert.deepEqual(setDigitColor([g('a', ['1', '2'])], '2', 'a'), [g('a', ['1', '2'])])
})

test('strokeKey is the brush color to paint with, or null to clear, from the digit a stroke starts on', () => {
  const groups = [g('a', ['1']), g('b', ['2'])]
  assert.equal(strokeKey(groups, '1', 'a'), null)
  assert.equal(strokeKey(groups, '2', 'a'), 'a')
  assert.equal(strokeKey(groups, '3', 'a'), 'a')
})

test('startingBrush is the lowest group\'s color, else the first visible color of the current page, else null', () => {
  const pages = twoPages()
  assert.equal(startingBrush(canonicalGroups([g('b3', ['2']), g('a2', ['1'])]), pages), 'a2')
  assert.equal(startingBrush([], pages), 'b1')
  assert.equal(startingBrush([], layoutPages([keys('z a1')], 0, colorOf)), 'a1')
  assert.equal(startingBrush([], layoutPages([keys('z')], 0, colorOf)), 'z')
  assert.equal(startingBrush(canonicalGroups([g('gone', ['1'])]), pages), 'b1')
  assert.equal(startingBrush([], []), null)
  assert.equal(startingBrush([], layoutPages([keys('clear')], 0, colorOf)), null)
})

test('renderEditor draws one page pulldown, labelled Page 1, Page 2 (current), with the shown page selected', () => {
  const html = editor([], twoPages(), 1)
  assert.deepEqual(options(html), [['0', false, 'Page 1'], ['1', true, 'Page 2 (current)']])
  assert.equal(count(html, /<select/g), 1)
})

test('renderEditor draws only the shown page\'s swatches, as the shared color block\'s palette buttons, index 0 after 9', () => {
  const first = editor([], twoPages(), 0)
  const swatchKeys = (html) => [...html.matchAll(/<button [^>]*data-role="swatch" data-key="([^"]*)"/g)].map((m) => m[1])
  assert.deepEqual(swatchKeys(first), ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'z'])
  assert.equal(count(first, /data-key="b1"/g), 0)
  const second = editor([], twoPages(), 1)
  assert.equal(swatchKeys(second).length, 9)
  assert.equal(count(second, /data-key="a1"/g), 0)
})

test('renderEditor draws an empty slot as a spacer with no button, so nothing shifts', () => {
  const pages = layoutPages([keys('clear a1 clear a3 a4 a5 a6 a7 a8 a9')], 0, colorOf)
  const html = editor([], pages, 0, 'a1')
  assert.equal(count(html, /<button [^>]*data-role="swatch"/g), 8)
  assert.match(html, /data-key="a1"[^>]*><\/button><span [^>]*data-empty="slot"><\/span><button [^>]*data-key="a3"/)
})

test('renderEditor marks only the brush as selected', () => {
  const html = editor([], twoPages(), 0, 'a2')
  assert.equal(count(html, /aria-pressed="true"/g), 1)
  assert.match(html, /data-key="a2"[^>]*aria-pressed="true"/)
  assert.equal(count(editor([], twoPages(), 0, 'b2'), /aria-pressed="true"/g), 0)
  assert.equal(count(editor([], twoPages(), 0, null), /aria-pressed="true"/g), 0)
})

test('renderEditor puts the digit pad beside the swatch grid, in rows of three keys the swatches\' size, with 0 under 7', () => {
  const html = editor([], twoPages(), 0, 'a1')
  assert.deepEqual(padCells(html), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'pad', 'pad'])
  const css = STYLE_CSS.replace(/\s+/g, ' ')
  assert.match(css, /\[data-role="paint"\] \{ display: grid; gap: 4px; grid-template-columns: repeat\(3, 34px\);/)
  assert.match(css, /\.cbd-swatches \{[^}]*grid-template-columns: repeat\(3, 34px\); gap: 4px;/)
})

// The swatch grid's cells and the digit pad's cells, left to right and row by row: a swatch by its key, a digit key by its digit, an empty cell by its kind.
function paintBlock (html) {
  const block = /<div class="cbd-swatches">(.*?)<\/div><div data-role="paint">(.*?)<\/div>/.exec(html)
  assert.ok(block, 'the pad follows the swatch grid in its row')
  const swatches = [...block[1].matchAll(/<(?:button|span)[^>]*?(?:data-key="([a-z0-9]+)"|data-empty="(\w+)")[^>]*>/g)].map((m) => m[1] || m[2])
  const pad = [...block[2].matchAll(/<(?:button|span)[^>]*?(?:data-digit="(\d)"|data-empty="(\w+)")[^>]*>/g)].map((m) => m[1] || m[2])
  return { swatches, pad }
}
const padCells = (html) => paintBlock(html).pad

test('renderEditor puts 0 on a fourth row under 7, beside the page\'s 0 swatch', () => {
  const [lit] = layoutPages([keys('z a1 a2 a3 a4 a5 a6 a7 a8 a9')], 0, colorOf)
  const { swatches, pad } = paintBlock(editor([], [lit]))
  assert.deepEqual(swatches, ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'z'])
  assert.deepEqual(pad.slice(9), ['0', 'pad', 'pad'])
})

test('renderEditor puts 0 on a fourth row under 7 when the page has no 0 swatch', () => {
  const [dark] = layoutPages([keys('clear a1 a2 a3 a4 a5 a6 a7 a8 a9')], 0, colorOf)
  const { swatches, pad } = paintBlock(editor([], [dark]))
  assert.equal(swatches.length, 9)
  assert.deepEqual(pad.slice(9), ['0', 'pad', 'pad'])
})

test('renderEditor draws a digit key as a cell filled with its group\'s color at 60%, and a digit in no group blank', () => {
  const html = editor([g('a2', ['1', '3']), g('b2', ['0'])], twoPages(), 0, 'a2')
  const key = (d) => html.match(new RegExp(`<button[^>]*data-digit="${d}"[^>]*>`))[0]
  assert.match(key('1'), /data-key="a2" style="background:color-mix\(in srgb, #a2 60%, transparent\)"/)
  assert.match(key('0'), /data-key="b2" style="background:color-mix\(in srgb, #b2 60%, transparent\)"/)
  assert.match(key('2'), /data-key=""/)
  assert.doesNotMatch(key('2'), /style=/)
})

test('a digit key is a square-cornered cell with a black outline: a painted digit in SudokuPad\'s entered-digit blue, an unpainted one white with a grey digit', () => {
  const css = STYLE_CSS.replace(/\s+/g, ' ')
  assert.match(css, /\[data-act="digit"\] \{[^}]*border-radius: 0;[^}]*border: 1px solid #000;[^}]*background: #fff; color: #999;/)
  assert.match(css, /\[data-act="digit"\]:not\(\[data-key=""\]\) \{ color: rgb\(29, 106, 229\);/)
})

test('renderEditor draws a digit whose color is on no page with the unset look', () => {
  const html = editor([g('gone', ['5'])], twoPages(), 0, 'a1')
  assert.match(html.match(/<button[^>]*data-digit="5"[^>]*>/)[0], /data-key="gone" class="cbd-unset"/)
})

test('renderEditor has no group rows, no Add group and no ×, and keeps a Clear all button after the profile list', () => {
  const html = renderEditor({ groups: [g('a', ['1'])], pages: twoPages(), page: 0, brush: 'a', profilesHtml: '<div id="mark-profiles"></div>' })
  assert.doesNotMatch(html, /data-act="(open|remove|add-group)"|Add group|Remove group|cbd-group/)
  assert.equal(count(html, /data-act="clear"[^>]*>Clear all</g), 1)
  assert.ok(html.indexOf('mark-profiles') < html.indexOf('data-act="clear"'))
})

test('renderEditor keeps the "No palette colors found" note, and draws no pulldown or swatch, when no page has a color', () => {
  const html = editor([], layoutPages([], 0, colorOf), 0)
  assert.match(html, /No palette colors found/)
  assert.equal(count(html, /data-role="swatch"|<select/g), 0)
  assert.equal(count(editor([], twoPages(), 0), /No palette colors found/g), 0)
})

test('the paint area stops touch scrolling and text selection, and the name box stays selectable', () => {
  assert.match(STYLE_CSS, /#color-by-digit-editor \[data-role="paint"\] \{[^}]*touch-action: none/)
  assert.match(STYLE_CSS, /#color-by-digit-editor \{[^}]*user-select: none/)
  assert.match(STYLE_CSS, /\[data-role="profile-name"\] \{[^}]*user-select: text/)
})

test('VERSION is the @version in the script header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, '..', 'color-by-digit.user.js'), 'utf8')))
})

// What stays inline is what depends on a value: a swatch's, digit key's or chip's color, and a chip's size.
const VALUE_PROPERTIES = ['background', 'color', 'width', 'height', 'font-size']

test('the editor and the profile list carry inline only the styles that depend on a value', () => {
  const profiles = renderProfiles(profileState, colorFor, 0)
  const html = editor([{ key: 'a2', digits: ['1', '3'] }, { key: 'zz', digits: ['5'] }], twoPages(), 0, 'a2')
  const properties = [...(profiles + html).matchAll(/ style="([^"]*)"/g)].flatMap((m) => m[1].split(';').filter(Boolean).map((d) => d.split(':')[0].trim()))
  assert.ok(properties.length > 0)
  assert.deepEqual([...new Set(properties)].filter((p) => !VALUE_PROPERTIES.includes(p)), [])
})

test('the stylesheet scopes every rule to the editor, the dialog and its options row, or Color by Digit\'s own classes', () => {
  const selectors = [...STYLE_CSS.matchAll(/^ *([^{}@\n]+) \{/gm)].flatMap((m) => m[1].split(', '))
  assert.ok(selectors.length > 20)
  const scope = /^(#color-by-digit-editor|#color-by-digit-menu|\.dialog:has\(#color-by-digit-editor\)|\.cbd-)/
  assert.deepEqual(selectors.filter((s) => !scope.test(s)), [])
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
  assert.deepEqual(copied.ColorByDigit_profiles, JSON.parse(JSON.stringify(fromStored(null, legacyOnly.ColorByDigit_groups))))
  assert.equal(copied.ColorByDigit_profiles.profiles[copied.ColorByDigit_profiles.active].groups[0].key, '3')
  assert.equal(copied.ColorByDigit_mode, 'cell')
  assert.equal('ColorByDigit_auto' in copied, false)
  assert.equal('ColorByDigit_addedPreloads' in copied, false)
  assert.equal('ColorByDigit_addedEachDigit' in copied, false)
  assert.equal(JSON.parse(copiedSettings({ getData: (key) => ({ ColorByDigit_auto: false }[key] ?? null) })).ColorByDigit_mode, 'off')
})

test('pastedSettings: a state that keeps every profile is kept, one that loses a profile is skipped and counted, other keys are ignored', () => {
  const profiles = { profiles: [{ name: ' Odd/Even ', groups }], active: 0 }
  const pasted = readPaste(JSON.stringify({ ColorByDigit_profiles: profiles, ColorByDigit_mode: 'sideways', ColorByDigit_addedPreloads: true, ColorByDigit_addedEachDigit: true, DarkPage_color: '#ffffff' }))
  assert.deepEqual(pasted.values, { ColorByDigit_profiles: fromStored(profiles), ColorByDigit_addedPreloads: true, ColorByDigit_addedEachDigit: true })
  assert.equal(pasted.skipped, 1)
  const oneBad = { profiles: [{ name: 'Odd/Even', groups }, { name: 'bad' }], active: 0 }
  assert.deepEqual(readPaste(JSON.stringify({ ColorByDigit_profiles: oneBad, ColorByDigit_mode: 'both' })), { values: { ColorByDigit_mode: 'both' }, skipped: 1 })
  assert.deepEqual(readPaste(JSON.stringify({ ColorByDigit_profiles: { profiles: [] } })), { values: {}, skipped: 1 })
})

test('pastedSettings: settings copied before the mode, with auto mode and no mode, give Cell for on and Off for off', () => {
  assert.deepEqual(readPaste(JSON.stringify({ ColorByDigit_auto: true })), { values: { ColorByDigit_mode: 'cell' }, skipped: 0 })
  assert.deepEqual(readPaste(JSON.stringify({ ColorByDigit_auto: false })), { values: { ColorByDigit_mode: 'off' }, skipped: 0 })
  assert.deepEqual(readPaste(JSON.stringify({ ColorByDigit_auto: 'yes' })), { values: {}, skipped: 1 })
  assert.deepEqual(readPaste(JSON.stringify({ ColorByDigit_mode: 'cell', ColorByDigit_auto: false })), { values: { ColorByDigit_mode: 'cell' }, skipped: 0 })
})

test('copiedSettings and pastedSettings carry the digit pick and "Use digit colors", and settings without them paste as synced and on', () => {
  const saved = { ColorByDigit_profiles: { profiles: [{ name: 'A', groups }, { name: 'B', groups: [] }], active: 0, digitActive: 1, useDigitColors: false } }
  const copied = copiedSettings({ getData: (key) => saved[key] ?? null })
  assert.deepEqual(JSON.parse(copied).ColorByDigit_profiles, saved.ColorByDigit_profiles)
  const pasted = readPaste(copied).values.ColorByDigit_profiles
  assert.equal(pasted.digitActive, 1)
  assert.equal(usesDigitColors(pasted), false)
  const old = readPaste(JSON.stringify({ ColorByDigit_profiles: { profiles: [{ name: 'A', groups }], active: 0 } })).values.ColorByDigit_profiles
  assert.equal(isSynced(old), true)
  assert.equal(usesDigitColors(old), true)
})

test('pastedSettings: text with none of this script\'s keys pastes and skips nothing', () => {
  assert.deepEqual(readPaste('{}'), { values: {}, skipped: 0 })
  assert.deepEqual(readPaste(JSON.stringify({ DarkPage_color: '#ffffff' })), { values: {}, skipped: 0 })
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

// Each cell of a run of chips, in order: its key, place, fill, digit color and digit.
const runCells = (svg) => [...svg.matchAll(/<g data-role="chip" data-key="([^"]*)"><rect x="([\d.]+)" y="0" width="([\d.]+)" height="[\d.]+" fill="([^"]*)"(?: fill-opacity="([\d.]+)")?\/><text[^>]*fill="([^"]*)"[^>]*>([^<]*)<\/text><\/g>/g)]
  .map((m) => ({ key: m[1], x: Number(m[2]), width: Number(m[3]), fill: m[4], opacity: m[5], ink: m[6], digit: m[7] }))

test('renderChips draws a joined run of square cells: one outer outline, n-1 single dividers, no rounded corners and no gaps', () => {
  for (const n of [1, 2, 3]) {
    const groups = Array.from({ length: n }, (_, i) => ({ key: 'k' + i, digits: [String(i + 1)] }))
    const svg = renderChips(groups, colorFor, { size: 16 })
    assert.equal(count(svg, /<rect [^>]*fill="none"/g), 1, `${n} cells: ${svg}`)
    assert.equal(count(svg, /<line /g), n - 1)
    assert.doesNotMatch(svg, /rx=/)
    const cells = runCells(svg)
    assert.deepEqual(cells.map((c) => c.digit), groups.map((g) => g.digits[0]))
    cells.forEach((c, i) => assert.equal(c.x, i === 0 ? 0 : cells[i - 1].x + cells[i - 1].width, `cell ${i} of ${n} leaves a gap`))
    assert.match(svg, new RegExp(`^<svg data-role="chips" width="${16 * n}" height="16" `))
  }
})

test('renderChips shows at most three cells, so a profile of six groups draws three cells and two dividers', () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ key: 'k' + i, digits: [String(i + 1)] }))
  const svg = renderChips(six, colorFor, { size: 16 })
  assert.deepEqual(runCells(svg).map((c) => c.key), ['k0', 'k1', 'k2'])
  assert.equal(count(svg, /<line /g), 2)
})

test('renderChips draws each mode the way it colors the board: Cell fills with blue digits, Digit white with shades, Both fills with shades, Off white and grey', () => {
  const groups = [{ key: 'a', digits: ['3'] }, { key: 'b', digits: ['7'] }]
  const shadeA = darkenColor([10, 10, 10])
  const shadeB = darkenColor([240, 240, 240])
  const look = (style) => {
    const svg = renderChips(groups, colorFor, { size: 16, style })
    const outline = /<rect [^>]*fill="none" stroke="([^"]*)"/.exec(svg)[1]
    const dividers = [...svg.matchAll(/<line [^>]*stroke="([^"]*)"/g)].map((m) => m[1])
    return { cells: runCells(svg).map((c) => [c.fill, c.ink]), outline, dividers }
  }
  assert.deepEqual(look('cell'), { cells: [['rgb(10, 10, 10)', 'rgb(29, 106, 229)'], ['rgb(240, 240, 240)', 'rgb(29, 106, 229)']], outline: '#000', dividers: ['#000'] })
  assert.deepEqual(look('digit'), { cells: [['#fff', shadeA], ['#fff', shadeB]], outline: '#000', dividers: ['#000'] })
  assert.deepEqual(look('both'), { cells: [['rgb(10, 10, 10)', shadeA], ['rgb(240, 240, 240)', shadeB]], outline: '#000', dividers: ['#000'] })
  assert.deepEqual(look('off'), { cells: [['#fff', '#999'], ['#fff', '#999']], outline: '#aaa', dividers: ['#aaa'] })
})

test('renderChips gives a group whose palette color is unreadable a grey cell, and in Digit and Both SudokuPad\'s own digit color, as the board keeps it', () => {
  const look = (style) => runCells(renderChips([{ key: 'q', digits: ['2'] }], () => '', { size: 16, style })).map((c) => [c.fill, c.ink])
  assert.deepEqual(look('cell'), [['#ccc', 'rgb(29, 106, 229)']])
  assert.deepEqual(look('digit'), [['#fff', 'rgb(29, 106, 229)']])
  assert.deepEqual(look('both'), [['#ccc', 'rgb(29, 106, 229)']])
})

test('renderChips draws a group color at SudokuPad\'s 60% cell opacity, and a white cell whole', () => {
  const groups = [{ key: 'a', digits: ['3'] }]
  const opacities = (style) => runCells(renderChips(groups, colorFor, { size: 16, style })).map((c) => c.opacity)
  assert.deepEqual(opacities('cell'), ['0.6'])
  assert.deepEqual(opacities('both'), ['0.6'])
  assert.deepEqual(opacities('digit'), [undefined])
  assert.deepEqual(opacities('off'), [undefined])
  // A digit in no cell group is a white chip, not a grey tinted one.
  const uncovered = runCells(renderChips([{ key: 'a', digits: ['3'] }], colorFor, { size: 16, chips: [{ digit: '8', cellKey: undefined, digitKey: undefined }] }))
  assert.deepEqual(uncovered.map((c) => [c.fill, c.opacity]), [['#fff', undefined]])
})

test('renderChips draws three blank dashed cells for a profile with no groups, in a run as wide as three chips', () => {
  const svg = renderChips([], colorFor, { size: 16 })
  assert.match(svg, /^<svg data-role="chips" width="48" height="16" /)
  assert.equal(count(svg, /<rect data-role="blank-chip"[^>]*fill="#fff"/g), 3)
  assert.equal(count(svg, /<line [^>]*stroke-dasharray=/g), 2)
  assert.match(svg, /<rect [^>]*fill="none" stroke="#aaa" [^>]*stroke-dasharray=/)
  assert.deepEqual(runCells(svg), [])
})

test('iconHtml centres the three blank cells of a profile with no groups', () => {
  const svg = /<svg data-role="chips"[\s\S]*?<\/svg>/.exec(iconHtml('cell', [], colorFor))[0]
  assert.match(svg, /width="114" height="38" x="-7" y="31"/)
  assert.equal(count(svg, /data-role="blank-chip"/g), 3)
})

test('a painted digit key and a palette swatch are drawn at 60%, an unpainted key white', () => {
  const html = editor([{ key: 'a1', digits: ['1'] }], [{ page: 0, rows: [[{ key: 'a1', value: '#a1' }]], zero: null }], 0, 'a1')
  assert.match(html, /data-act="digit" data-digit="1" data-key="a1" style="background:color-mix\(in srgb, #a1 60%, transparent\)"/)
  assert.match(html, /data-key="a1" aria-pressed="true"[^>]*style="background:color-mix\(in srgb, #a1 60%, transparent\)"/)
  assert.doesNotMatch(/<button[^>]*data-digit="2"[^>]*>/.exec(html)[0], /style=/)
})

test('iconHtml draws the run of cells in the mode\'s look with the mode word, and keeps the menu arrow box', () => {
  const groups = [{ key: 'a', digits: ['3'] }, { key: 'b', digits: ['7'] }]
  for (const mode of ['cell', 'digit', 'both', 'off']) {
    const html = iconHtml(mode, groups, colorFor)
    const run = /<svg data-role="chips"[\s\S]*?<\/svg>/.exec(html)[0]
    assert.deepEqual(runCells(run), runCells(renderChips(groups, colorFor, { size: 1, style: mode })), mode)
    const word = /<span data-role="mode" style="([^"]*)">([^<]*)<\/span>/.exec(html)
    assert.equal(word[2], mode.toUpperCase())
    assert.match(word[1], /pointer-events:none/)
    assert.match(word[1], mode === 'off' ? /color:#b3acbf/ : /color:#6a1b9a/)
    assert.match(html, /data-role="menu"[^>]*aria-haspopup="menu"[^>]*right:[^;"]*;bottom:/)
  }
})

test('the button is titled and labelled with its mode in words', () => {
  assert.deepEqual(['cell', 'digit', 'both', 'off'].map(buttonLabel), ['Color by digit: Cell', 'Color by digit: Digit', 'Color by digit: Both', 'Color by digit: Off'])
  let spec
  installButton({ addControlButton: (x) => { spec = x } }, { refreshControls: () => {} }, 'both', ODD, colorFor, ODD)
  assert.equal(spec.title, 'Color by digit: Both')
})

test('renderMenu puts every row\'s chips, a run of cells in the Cell look, in a column of one fixed width, so the names line up', () => {
  for (const state of [synced, apart]) {
    const rows = menuRows(renderMenu(state, colorFor))
    assert.equal(new Set(rows.map((r) => r.chipWidth)).size, 1)
    assert.match(rows[0].chipWidth, /width:\d+px/)
  }
  const html = renderMenu(profileState, colorFor)
  assert.deepEqual(runCells(/<svg data-role="chips"[\s\S]*?<\/svg>/.exec(html)[0]), runCells(renderChips(LOW, colorFor, { size: 16 })))
})

// The declarations of every STYLE_CSS rule whose selector list holds `selector`, joined.
const declarationsOf = (selector) => [...STYLE_CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .filter((m) => m[1].split(',').map((x) => x.trim()).includes(selector)).map((m) => m[2].replace(/\s+/g, ' ').trim()).join(' ')

test('the bottom row is capped at 21.6rem, which live/color-by-digit-rows.live.mjs shows wraps it at five buttons a row', () => {
  assert.match(BOTTOM_ROW_CSS, /^\.controls-aux \{ max-width: 21\.6rem; \}$/)
})

test('renderProfiles draws each row\'s chips as a run of cells in the Cell look', () => {
  const html = renderProfiles(profileState, colorFor, 0)
  const runs = [...html.matchAll(/<svg data-role="chips"[\s\S]*?<\/svg>/g)].map((m) => runCells(m[0]))
  assert.deepEqual(runs, [runCells(renderChips(LOW, colorFor, { size: 16 })), runCells(renderChips(ODD, colorFor, { size: 16 }))])
})

test('the profile list is dense one-line rows of 30 px with no ring, the selected row filled', () => {
  const row = declarationsOf('#color-by-digit-editor .cbd-profile')
  assert.match(row, /height: 30px/)
  assert.doesNotMatch(row, /box-shadow|border:/)
  assert.match(declarationsOf('#color-by-digit-editor .cbd-profile[aria-checked="true"]'), /background: #f1ebfb/)
  assert.doesNotMatch(declarationsOf('#color-by-digit-editor .cbd-profile[aria-checked="true"]'), /box-shadow/)
})

test('the profile list shows a row\'s drag handle and delete button only on hover or on the selected row', () => {
  for (const part of ['[data-role="handle"]', '[data-act="delete"]']) {
    assert.match(declarationsOf(`#color-by-digit-editor .cbd-profile ${part}`), /visibility: hidden/, part)
    assert.match(declarationsOf(`#color-by-digit-editor .cbd-profile:hover ${part}`), /visibility: visible/, part)
    assert.match(declarationsOf(`#color-by-digit-editor .cbd-profile[aria-checked="true"] ${part}`), /visibility: visible/, part)
  }
})

test('the profile list\'s delete and + New profile are plain text buttons, not boxed ones', () => {
  const html = renderProfiles(profileState, colorFor, 0)
  assert.match(html, /<button type="button" class="cbd-text-button" data-act="delete"/)
  assert.match(html, /<button type="button" class="cbd-text-button" data-act="new-profile"[^>]*>\+ New profile</)
  assert.doesNotMatch(html, /cbd-button/)
  const plain = declarationsOf('#color-by-digit-editor .cbd-text-button')
  assert.match(plain, /background: none/)
  assert.match(plain, /border: none/)
})

// shownChips: the digits the button's chips show, per mode (#389). Each chip names the cell group and digit group its digit falls in.
const digitsOf = (chips) => chips.map((c) => c.digit)

test('shownChips: Cell and Off pick one digit per cell-profile group, Digit one per digit-profile group', () => {
  for (const mode of ['cell', 'off']) assert.deepEqual(digitsOf(shownChips(mode, LOW, ODD)), ['1', '5', '9'], mode)
  assert.deepEqual(digitsOf(shownChips('digit', LOW, ODD)), ['5', '4'])
})

test('shownChips: Both with Low/5/High cells and Odd/Even digits shows 1 5 6, the lowest of the tied sets covering three cell and two digit groups', () => {
  assert.deepEqual(digitsOf(shownChips('both', LOW, ODD)), ['1', '5', '6'])
})

test('shownChips: Both names each chip\'s cell group and digit group', () => {
  assert.deepEqual(shownChips('both', LOW, ODD), [
    { digit: '1', cellKey: '1', digitKey: '1' }, { digit: '5', cellKey: '5', digitKey: '1' }, { digit: '6', cellKey: '9', digitKey: '2' }])
})

test('shownChips: Both with a synced profile shows the Cell strip', () => {
  for (const groups of [LOW, ODD, ENTROPIC, MODULAR, EACH_DIGIT]) {
    assert.deepEqual(digitsOf(shownChips('both', groups, groups)), digitsOf(shownChips('cell', groups, groups)))
  }
})

test('shownChips: Both with a one-group digit profile takes k from the larger profile and still covers every cell group', () => {
  const one = [{ key: 'z', digits: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] }]
  assert.deepEqual(digitsOf(shownChips('both', LOW, one)), ['1', '5', '9'])
  // the one cell group shows 5; with k = 2 the set needs an even digit too, and {2,5} is the lowest to keep the 5
  assert.deepEqual(digitsOf(shownChips('both', one, ODD)), ['2', '5'])
})

test('shownChips: Both breaks a tie by the most digits shared with the Cell strip before the lowest digits', () => {
  // Cell strip is 1 5. Every one-from-each pair scores 4; {1,4} is the lowest, {1,5} shares two digits with the strip.
  const cells = [{ key: 'a', digits: ['1', '2', '3'] }, { key: 'b', digits: ['4', '5', '6'] }]
  const digits = [{ key: 'c', digits: ['1', '2', '3'] }, { key: 'd', digits: ['4', '5', '6'] }]
  assert.deepEqual(digitsOf(shownChips('cell', cells, digits)), ['1', '5'])
  assert.deepEqual(digitsOf(shownChips('both', cells, digits)), ['1', '5'])
})

test('shownChips: Both takes the lowest sorted set when the tied sets share equally with the Cell strip', () => {
  // Cell strip is 1 7. {1,8} and {2,7} both score 4 and share one digit with it; {1,7} scores 3.
  const cells = [{ key: 'a', digits: ['1', '2', '3', '4'] }, { key: 'b', digits: ['5', '6', '7', '8', '9'] }]
  const digits = [{ key: 'c', digits: ['1', '7'] }, { key: 'd', digits: ['2', '8'] }]
  assert.deepEqual(digitsOf(shownChips('cell', cells, digits)), ['1', '7'])
  assert.deepEqual(digitsOf(shownChips('both', cells, digits)), ['1', '8'])
})

test('shownChips caps at three chips', () => {
  assert.equal(shownChips('cell', EACH_DIGIT, EACH_DIGIT).length, 3)
  assert.equal(shownChips('both', EACH_DIGIT, EACH_DIGIT).length, 3)
})

test('iconHtml with separate profiles shows each mode\'s own digits: Cell and Off the cell profile, Digit the digit profile, Both the most variety', () => {
  const cells = (mode) => runCells(/<svg data-role="chips"[\s\S]*?<\/svg>/.exec(iconHtml(mode, LOW, colorFor, ODD))[0]).map((c) => c.digit)
  assert.deepEqual(['cell', 'off', 'digit', 'both'].map(cells), [['1', '5', '9'], ['1', '5', '9'], ['5', '4'], ['1', '5', '6']])
})

test('iconHtml draws a Both chip for a digit in no cell group white, and centres a run of two chips differently from three', () => {
  const palette = { 1: 'rgb(200, 0, 0)', 9: 'rgb(0, 0, 200)' }
  const cells = [{ key: '1', digits: ['1'] }]
  const run = (mode, g, d) => /<svg data-role="chips"[^>]*>/.exec(iconHtml(mode, g, (k) => palette[k], d))[0]
  assert.deepEqual(runCells(/<svg data-role="chips"[\s\S]*?<\/svg>/.exec(iconHtml('both', cells, (k) => palette[k], [{ key: '1', digits: ['1'] }, { key: '9', digits: ['2'] }]))[0]).map((c) => c.fill), [palette[1], '#fff'])
  assert.match(run('digit', LOW, ODD), /x="12"/)
  assert.match(run('both', LOW, ODD), /x="-7"/)
})

test('shownChips: Both with unsynced profiles lists its chips in ascending digit order, and may pick 0', () => {
  const cells = [{ key: 'a', digits: ['7', '8', '9'] }, { key: 'b', digits: ['1', '2', '3'] }]
  const digits = [{ key: 'c', digits: ['1', '2', '3', '4', '5'] }, { key: 'd', digits: ['6', '7', '8', '9'] }]
  assert.deepEqual(digitsOf(shownChips('cell', cells, digits)), ['9', '1'])
  assert.deepEqual(digitsOf(shownChips('both', cells, digits)), ['1', '9'])
  // A cell group of only 0 is reached: k is 2, and 0 is the one digit of the group a.
  assert.deepEqual(digitsOf(shownChips('both', [{ key: 'a', digits: ['0'] }, { key: 'b', digits: ['1', '2'] }], ODD)), ['0', '1'])
})

// A SudokuPad with every internal Color by Digit needs.
const completeRoots = () => {
  const app = { act () {}, select () {}, deselect () {}, on () {}, refreshControls () {}, puzzle: { cells: [], selectedCells: [], addEventListener () {} } }
  return { Framework: { getApp () {}, getData () {}, setData () {}, addControlButton () {}, addSetting () {}, showDialog () {}, closeDialog () {}, app: { tools: { colour: {} } } }, app }
}
const withoutPath = (roots, internal) => {
  const [root, ...keys] = internal.split('.')
  const last = keys.pop()
  delete keys.reduce((owner, key) => owner[key], roots[root])[last]
  return roots
}

test('Color by Digit declares each SudokuPad internal it calls, and a complete SudokuPad lacks none', () => {
  assert.deepEqual(lackingInternals(FEATURES, completeRoots()), new Map())
})

test('without one internal, only the features that need it are lacking', () => {
  const cases = [
    ['app.act', ['cells']], ['app.select', ['cells']], ['app.deselect', ['cells']], ['app.on', ['cells']],
    ['app.puzzle.cells', ['cells', 'loading']], ['app.puzzle.selectedCells', ['cells']], ['app.puzzle.addEventListener', ['loading']],
    ['app.refreshControls', ['button']], ['Framework.addControlButton', ['button']],
    ['Framework.getApp', ['cells', 'button', 'loading']],
    ['Framework.getData', ['saved', 'editor']], ['Framework.setData', ['saved', 'editor']],
    ['Framework.addSetting', ['editor']], ['Framework.showDialog', ['editor']], ['Framework.closeDialog', ['editor']], ['Framework.app.tools.colour', ['editor']]
  ]
  for (const [internal, features] of cases) {
    assert.deepEqual(lackingInternals(FEATURES, withoutPath(completeRoots(), internal)), new Map([[internal, features]]), internal)
  }
})

const SCRIPT = path.join(__dirname, '..', 'color-by-digit.user.js')

test('a document listener of the mode button whose own code throws turns the button off, and the throw stays in the script', () => {
  const runs = failEachListener(SCRIPT, FEATURES, 'document')
  assert.equal(runs.length, 6, runs.map(({ where }) => where).join(', '))
  for (const { where, escaped, warnings } of runs) {
    assert.deepEqual(escaped.map(({ error }) => String(error)), [], where)
    assert.match(warnings.join('\n'), /^color-by-digit: mode button skipped because SudokuPad changed: Error: the listener read event\./, where)
  }
})

test('with cell coloring off, the icon and the digit shades still wait for the puzzle to load', () => {
  const { added } = startOnStandInPage(SCRIPT, FEATURES, { missing: ['app.act'] })
  assert.ok(added.some(({ where }) => where === 'Framework.app.puzzle.addEventListener()'), added.map(({ where }) => where).join(', '))
})

// The settings dialog's draft: three profiles over twoPages' colors, the second one active.
const dialogState = () => ({ profiles: [{ name: 'A', groups: [g('a2', ['1'])] }, { name: 'B', groups: [g('b3', ['2'])] }, { name: 'C', groups: [] }], active: 1 })
const opened = (state = dialogState(), mode = 'cell') => openingDraft(state, mode, twoPages())
const run = (draft, ...events) => events.reduce(reduceDraft, draft)
const shownGroups = (draft) => draft.state.profiles[draft.selected].groups

test('openingDraft selects the active profile, keeps its name, and starts the brush on its lowest group\'s color and page', () => {
  const draft = opened(dialogState(), 'both')
  assert.deepEqual({ selected: draft.selected, keptName: draft.keptName, brush: draft.brush, page: draft.page, mode: draft.mode }, { selected: 1, keptName: 'B', brush: 'b3', page: 1, mode: 'both' })
  assert.deepEqual(draft.state, dialogState())
})

test('reduceDraft select: the row\'s profile is selected, its name kept, and the brush and page restart from its groups', () => {
  const draft = run(opened(), { type: 'select', index: 0 })
  assert.deepEqual({ selected: draft.selected, keptName: draft.keptName, brush: draft.brush, page: draft.page }, { selected: 0, keptName: 'A', brush: 'a2', page: 0 })
  assert.equal(draft.state.active, 1, 'selecting picks no profile')
  assert.deepEqual(run(opened(), { type: 'select', index: 2 }).brush, 'b1', 'a profile with no groups starts on the current page\'s first color')
})

test('reduceDraft paint: the stroke\'s first digit decides paint or clear, and every digit after follows it', () => {
  const painting = run(opened(), { type: 'press' }, { type: 'paint', digit: '5' }, { type: 'paint', digit: '2' })
  assert.deepEqual(shownGroups(painting), [g('b3', ['2', '5'])], 'a stroke that started by painting never clears')
  const clearing = run(painting, { type: 'press' }, { type: 'paint', digit: '2' }, { type: 'paint', digit: '5' }, { type: 'paint', digit: '7' })
  assert.deepEqual(shownGroups(clearing), [], 'a stroke that started on a brush-colored digit clears each digit it passes')
})

test('reduceDraft paint: with no brush, or a digit already as the stroke leaves it, the draft is the same draft', () => {
  const noBrush = { ...opened(), brush: null }
  assert.equal(run(noBrush, { type: 'press' }, { type: 'paint', digit: '5' }), noBrush)
  const painted = run(opened(), { type: 'press' }, { type: 'paint', digit: '5' })
  assert.equal(reduceDraft(painted, { type: 'paint', digit: '5' }), painted)
})

test('reduceDraft key-paint: a keyboard click on a digit toggles it in the brush\'s color, with no stroke', () => {
  const painted = run(opened(), { type: 'key-paint', digit: '5' })
  assert.deepEqual(shownGroups(painted), [g('b3', ['2', '5'])])
  assert.deepEqual(shownGroups(run(painted, { type: 'key-paint', digit: '5' })), [g('b3', ['2'])])
  const noBrush = { ...opened(), brush: null }
  assert.equal(reduceDraft(noBrush, { type: 'key-paint', digit: '2' }), noBrush, 'with no brush a keyboard click leaves the digit\'s color alone')
})

test('reduceDraft brush, page and clear: a swatch sets the brush, the page choice the page, and Clear empties the selected profile', () => {
  const draft = run(opened(), { type: 'brush', key: 'a7' }, { type: 'page', page: 0 }, { type: 'clear' })
  assert.deepEqual({ brush: draft.brush, page: draft.page, groups: shownGroups(draft) }, { brush: 'a7', page: 0, groups: [] })
  assert.deepEqual(draft.state.profiles[0].groups, [g('a2', ['1'])], 'only the selected profile is cleared')
})

test('reduceDraft rename: the typed name renames the selected profile, and a blank one restores the name it had when selected', () => {
  const typed = run(opened(), { type: 'rename', name: 'Bee' })
  assert.equal(typed.state.profiles[1].name, 'Bee')
  assert.equal(run(typed, { type: 'rename', name: '   ' }).state.profiles[1].name, 'B')
})

test('reduceDraft choose: Mode sets the draft mode, Cell the active profile, and Digit None moves a digit mode to one without digit colors', () => {
  assert.equal(run(opened(), { type: 'choose', role: 'mode-draft', value: 'both' }).mode, 'both')
  assert.equal(run(opened(), { type: 'choose', role: 'cell-profile', value: '2' }).state.active, 2)
  const none = run(opened(dialogState(), 'both'), { type: 'choose', role: 'digit-profile', value: 'none' })
  assert.equal(none.mode, 'cell')
  assert.equal(usesDigitColors(none.state), false)
  assert.throws(() => reduceDraft(opened(), { type: 'choose', role: 'color-choice', value: '0' }), /no pulldown color-choice/)
})

test('reduceDraft new-profile: the selected profile is copied to the end and the copy selected; at the limit the draft is the same draft', () => {
  const copied = run(opened(), { type: 'new-profile' })
  assert.deepEqual({ count: copied.state.profiles.length, selected: copied.selected, groups: shownGroups(copied) }, { count: 4, selected: 3, groups: [g('b3', ['2'])] })
  const full = opened({ profiles: Array.from({ length: MAX_PROFILES }, (_, i) => ({ name: `P${i}`, groups: [] })), active: 0 })
  assert.equal(reduceDraft(full, { type: 'new-profile' }), full)
})

test('reduceDraft delete: the row goes and the selection stays on the same profile; a refused delete is the same draft', () => {
  const deleted = run(opened(), { type: 'delete', index: 0 })
  assert.deepEqual(deleted.state.profiles.map((p) => p.name), ['B', 'C'])
  assert.equal(deleted.state.profiles[deleted.selected].name, 'B')
  const one = opened({ profiles: [{ name: 'Only', groups: [] }], active: 0 })
  assert.equal(reduceDraft(one, { type: 'delete', index: 0 }), one)
})

test('reduceDraft move: a dragged row moves, the selection follows its profile, and a drop on its own place is the same draft', () => {
  const moved = run(opened(), { type: 'move', from: 0, to: 2 })
  assert.deepEqual(moved.state.profiles.map((p) => p.name), ['B', 'C', 'A'])
  assert.equal(moved.state.profiles[moved.selected].name, 'B')
  const draft = opened()
  assert.equal(reduceDraft(draft, { type: 'move', from: 1, to: 1 }), draft)
})

test('reduceDraft reload: pasted settings replace the draft, selecting their active profile, in their mode', () => {
  const pasted = { profiles: [{ name: 'X', groups: [g('a5', ['9'])] }, { name: 'Y', groups: [] }], active: 0 }
  const draft = run(opened(), { type: 'brush', key: 'b9' }, { type: 'reload', state: pasted, mode: 'off' })
  assert.deepEqual({ state: draft.state, mode: draft.mode, selected: draft.selected, keptName: draft.keptName, brush: draft.brush, page: draft.page }, { state: pasted, mode: 'off', selected: 0, keptName: 'X', brush: 'a5', page: 0 })
})
