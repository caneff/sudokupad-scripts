// ==UserScript==
// @name         SudokuPad Color by Digit
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.24.1
// @description  Colors cells, or the digits and marks in them, by digit, with colors you give to groups of digits, and keeps the colors in step as you solve.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/color-by-digit.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/color-by-digit.user.js
// ==/UserScript==

(function () {
  'use strict'

  // GM_info is absent without Tampermonkey, so the script cannot read @version; keep this equal to it.
  const VERSION = '0.24.1'
  // The groups saved before profiles existed. Read when no profiles are saved; never written or removed.
  const LEGACY_GROUPS_KEY = 'ColorByDigit_groups'
  // The profiles: { profiles: [{ name, groups }], active: index, digitActive?: index, useDigitColors?: false }.
  // `digitActive` is saved only while digits are not synced with cells, and `useDigitColors` only while off, so a state saved before them reads as synced and on.
  const PROFILES_KEY = 'ColorByDigit_profiles'
  const MAX_PROFILES = 6
  const MAX_NAME_LENGTH = 24
  const CUSTOM_NAME = 'Custom'
  const MODE_KEY = 'ColorByDigit_mode'
  // Auto mode's on/off, saved before the mode existed: read only to choose the starting mode when no mode is saved.
  const AUTO_KEY = 'ColorByDigit_auto'
  const MODES = ['cell', 'digit', 'both', 'off']
  const DIGITLESS_MODES = ['cell', 'off']
  const DIGITLESS_FALLBACK = { digit: 'off', both: 'cell' }
  const MODE_NAMES = { cell: 'Cell', digit: 'Digit', both: 'Both', off: 'Off' }
  // Each key is set once its preloads have been offered to an install that already had profiles, so deleting one keeps it deleted.
  const ADDED_PRELOADS = [
    { key: 'ColorByDigit_addedPreloads', names: ['Entropic', 'Modular'] },
    { key: 'ColorByDigit_addedEachDigit', names: ['Each digit'] }
  ]
  // SudokuPad's numpad order: 1 to 9 in rows of three, then 0.
  const NUMPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
  const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

  const PRELOADS = {
    'Low/5/High': [
      { key: '1', digits: ['0', '1', '2', '3', '4'] },
      { key: '5', digits: ['5'] },
      { key: '9', digits: ['6', '7', '8', '9'] }
    ],
    'Odd/Even': [
      { key: '1', digits: ['1', '3', '5', '7', '9'] },
      { key: '2', digits: ['0', '2', '4', '6', '8'] }
    ],
    Entropic: [
      { key: '7', digits: ['0', '1', '2', '3'] },
      { key: '4', digits: ['4', '5', '6'] },
      { key: '9', digits: ['7', '8', '9'] }
    ],
    Modular: [
      { key: '6', digits: ['1', '4', '7'] },
      { key: '5', digits: ['2', '5', '8'] },
      { key: '8', digits: ['0', '3', '6', '9'] }
    ],
    // Nine colors whose darker shades are all distinct and none black or grey, so an entered digit never looks like a
    // given: 5 to 9 on their own keys of SudokuPad's first palette page, and 1 to 4 (whose first-page keys are grey,
    // black and a green near 8's yellow) on purple, pink and brown from page 2 and green from page 3.
    'Each digit': [['1', 'j'], ['2', 'e'], ['3', 'h'], ['4', 'm'], ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9']].map(([d, key]) => ({ key, digits: [d] }))
  }

  const cloneGroups = (groups) => groups.map((g) => ({ key: g.key, digits: [...g.digits] }))

  function sharedKey (marks, keyOfDigit) {
    const keys = new Set(marks.map((m) => keyOfDigit[String(m)]))
    return keys.size === 1 ? [...keys][0] : undefined
  }

  const keyOfDigitMap = (groups) => {
    const keyOfDigit = Object.create(null)
    groups.forEach((g) => g.digits.filter((d) => DIGITS.includes(d)).forEach((d) => { keyOfDigit[d] = g.key }))
    return keyOfDigit
  }

  function pureKey (cell, keyOfDigit) {
    const placed = String(cell.given || cell.value || '')
    return placed === '' ? sharedKey(cell.centre || [], keyOfDigit) : keyOfDigit[placed]
  }

  function planColoring (cells, groups) {
    const keyOfDigit = keyOfDigitMap(groups)
    const plan = []
    cells.forEach((cell, index) => {
      const key = pureKey(cell, keyOfDigit)
      if (key === undefined) return
      if ((cell.colours || []).includes(key)) return
      plan.push({ index, key })
    })
    return plan
  }

  const everyIndex = (cells) => cells.map((_, i) => i)

  // A cell with no digit and no centre marks is left alone, so a group color painted on it by hand stays.
  const enteredIndices = (cells) => cells.flatMap((cell, index) => (String(cell.given || cell.value || '') === '' && cell.centre.length === 0 ? [] : [index]))

  const groupKeys = (groups) => [...new Set(groups.map((g) => g.key))]

  const modesFor = (useDigitColors) => (useDigitColors ? MODES : DIGITLESS_MODES)
  const nextMode = (mode, useDigitColors) => {
    const modes = modesFor(useDigitColors)
    return modes[(modes.indexOf(mode) + 1) % modes.length]
  }
  const allowedMode = (mode, useDigitColors) => (useDigitColors ? mode : DIGITLESS_FALLBACK[mode] ?? mode)
  const colorsCells = (mode) => mode === 'cell' || mode === 'both'
  const colorsDigits = (mode) => mode === 'digit' || mode === 'both'
  const modeFromAuto = (auto) => (typeof auto === 'boolean' ? (auto ? 'cell' : 'off') : undefined)
  const startingMode = (savedMode, savedAuto) => (MODES.includes(savedMode) ? savedMode : modeFromAuto(savedAuto) ?? 'cell')

  // SudokuPad's action names: `value` (digit), `candidates` (centre mark), `pencilmarks` (corner mark).
  function isEntryAction (action) {
    if (!action) return false
    if (action.type === 'value' || action.type === 'candidates') return true
    return action.type === 'clear' && action.arg !== 'colour' && action.arg !== 'pen'
  }

  const entrySignature = (cell) => JSON.stringify([String(cell.value || ''), [...(cell.centre || [])].sort()])

  const changedIndices = (before, after) => before.flatMap((sig, i) => (sig === after[i] ? [] : [i]))

  // `managedKeys` is wider than the groups' keys when a Save drops an old group whose color must come off too.
  function planCellColors (cells, groups, indices, managedKeys = groupKeys(groups)) {
    const keyOfDigit = keyOfDigitMap(groups)
    const removals = new Map()
    const additions = new Map()
    const push = (map, key, index) => map.set(key, [...(map.get(key) || []), index])
    indices.forEach((index) => {
      const cell = cells[index]
      const want = pureKey(cell, keyOfDigit)
      const held = cell.colours || []
      managedKeys.filter((key) => key !== want && held.includes(key)).forEach((key) => push(removals, key, index))
    })
    planColoring(indices.map((index) => cells[index]), groups).forEach(({ index, key }) => push(additions, key, indices[index]))
    return [
      ...[...removals].map(([key, list]) => ({ action: 'remove', key, indices: list })),
      ...[...additions].map(([key, list]) => ({ action: 'add', key, indices: list }))
    ]
  }

  const planClear = (cells, keys) => planCellColors(cells, [], everyIndex(cells), keys)

  // The SudokuPad actions that carry out `ops` on `cells`, each run on the cells at `indices`. A color toggle with
  // Multi-color off clears a cell that holds another color first (SudokuPad's Cell.toggleColour), so a cell that loses
  // a color is cleared of every color and has the colors it keeps put back: the same actions leave the same cell under
  // either setting, so undo and redo, which run them again, do too. Removals come first, as the plan has them.
  function colorSteps (cells, ops) {
    const removed = new Map()
    ops.filter((op) => op.action === 'remove').forEach(({ key, indices }) => indices.forEach((i) => removed.set(i, [...(removed.get(i) || []), key])))
    const cleared = [...removed.keys()]
    const putBack = new Map()
    cleared.forEach((i) => (cells[i].colours || []).filter((key) => !removed.get(i).includes(key)).forEach((key) => putBack.set(key, [...(putBack.get(key) || []), i])))
    return [
      ...(cleared.length > 0 ? [{ type: 'clear', arg: 'colour', indices: cleared }] : []),
      ...[...putBack].map(([key, indices]) => ({ type: 'colour', arg: key, indices })),
      ...ops.filter((op) => op.action === 'add').map(({ key, indices }) => ({ type: 'colour', arg: key, indices }))
    ]
  }

  // Read as SudokuPad's SolverTool.getCellOptions does: none when the cell hides them, as a given does.
  function readCentreMarks (cell) {
    return cell.propVisible('centre') ? cell.propGet('centre') : []
  }

  function toPlanCell (cell) {
    return { given: cell.given, value: cell.value, colours: cell.colours, centre: readCentreMarks(cell) }
  }

  // A group is the digits that share a color. 0 counts after 9 in the order of groups; a group's own digits are listed 0 first, as the preloads save them.
  const digitRank = (digit) => (digit === '0' ? 10 : Number(digit))
  const lowestRank = (group) => Math.min(...group.digits.map(digitRank))

  // Merges groups of one color, drops groups with no digits, and orders groups by their lowest digit.
  function canonicalGroups (groups) {
    const digitsOfKey = new Map()
    groups.forEach((g) => digitsOfKey.set(g.key, [...(digitsOfKey.get(g.key) || []), ...g.digits]))
    return [...digitsOfKey]
      .map(([key, digits]) => ({ key, digits: [...new Set(digits)].sort() }))
      .filter((g) => g.digits.length > 0)
      .sort((a, b) => lowestRank(a) - lowestRank(b))
  }

  // A null key takes the digit out of every group.
  function setDigitColor (groups, digit, key) {
    const rest = groups.map((g) => ({ key: g.key, digits: g.digits.filter((d) => d !== digit) }))
    if (key === null) return canonicalGroups(rest)
    return canonicalGroups(rest.some((g) => g.key === key) ? rest.map((g) => (g.key === key ? { key, digits: [...g.digits, digit] } : g)) : [...rest, { key, digits: [digit] }])
  }

  // The color a stroke starting on `digit` paints with: null (clear) when that digit already has the brush color.
  const strokeKey = (groups, digit, brush) => (keyOfDigitMap(groups)[digit] === brush ? null : brush)

  const paintDigit = (groups, digit, brush) => setDigitColor(groups, digit, strokeKey(groups, digit, brush))

  const ARROW_STEP = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }
  function rowAfterKey (key, index, count) {
    if (key === 'Enter' || key === ' ') return index
    if (ARROW_STEP[key]) return (index + ARROW_STEP[key] + count) % count
    return null
  }

  // Where an arrow key moves within a grid `columns` wide: along the row or down the column to the next usable slot, null at the edge or for any other key.
  const GRID_STEP = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }
  function gridTarget (key, index, usable, columns) {
    const step = GRID_STEP[key]
    if (!step) return null
    const rows = Math.ceil(usable.length / columns)
    let column = index % columns + step[0]
    let row = Math.floor(index / columns) + step[1]
    while (column >= 0 && column < columns && row >= 0 && row < rows) {
      const next = row * columns + column
      if (usable[next]) return next
      column += step[0]
      row += step[1]
    }
    return null
  }

  function normalizeGroups (data) {
    if (!Array.isArray(data)) return null
    const out = []
    const seen = new Set()
    for (const g of data) {
      if (!g || typeof g.key !== 'string' || !Array.isArray(g.digits)) return null
      const digits = [...new Set(g.digits.filter((d) => DIGITS.includes(d) && !seen.has(d)))].sort()
      digits.forEach((d) => seen.add(d))
      out.push({ key: g.key, digits })
    }
    return canonicalGroups(out)
  }

  const cleanName = (name) => String(name).trim().slice(0, MAX_NAME_LENGTH)

  function normalizeProfile (data) {
    if (!data || typeof data.name !== 'string' || data.name.trim() === '') return null
    const groups = normalizeGroups(data.groups)
    return groups && { name: cleanName(data.name), groups }
  }

  // The one reader of the profiles, saved or pasted: a state that would lose a profile, or holds more than MAX_PROFILES, is refused whole,
  // so nothing saved over it drops a profile unseen. An active or digit pick that is no profile falls back.
  function readProfiles (data) {
    if (!data || !Array.isArray(data.profiles) || data.profiles.length === 0 || data.profiles.length > MAX_PROFILES) return undefined
    const profiles = data.profiles.map(normalizeProfile)
    if (profiles.includes(null)) return undefined
    const isIndex = (index) => Number.isInteger(index) && index >= 0 && index < profiles.length
    return makeState(profiles, isIndex(data.active) ? data.active : 0, isIndex(data.digitActive) ? data.digitActive : undefined, data.useDigitColors !== false)
  }

  const readPastedFlag = (data) => (typeof data === 'boolean' ? data : undefined)
  const readPastedMode = (data) => (MODES.includes(data) ? data : undefined)
  const READERS = { [PROFILES_KEY]: readProfiles, [MODE_KEY]: readPastedMode, ...Object.fromEntries(ADDED_PRELOADS.map(({ key }) => [key, readPastedFlag])) }
  // Settings copied before the mode existed carry auto mode's on/off in its place.
  const withModeFromAuto = (data) => (!Object.hasOwn(data, MODE_KEY) && Object.hasOwn(data, AUTO_KEY) ? { ...data, [MODE_KEY]: modeFromAuto(data[AUTO_KEY]) } : data)
  // The profiles in force, which carry groups saved before profiles existed, and the mode in force, so a paste can switch either.
  function copiedSettings (store) {
    const copied = { [PROFILES_KEY]: stateFromStored(store), [MODE_KEY]: startingMode(store.getData(MODE_KEY), store.getData(AUTO_KEY)) }
    ADDED_PRELOADS.forEach(({ key }) => { if (store.getData(key) === true) copied[key] = true })
    return JSON.stringify(copied)
  }

  const sameGroups = (a, b) => JSON.stringify(a) === JSON.stringify(b)

  const cloneProfile = (profile) => ({ name: profile.name, groups: cloneGroups(profile.groups) })

  // An undefined `digitActive` is synced: the digits take the cell profile.
  function makeState (profiles, active, digitActive, useDigitColors) {
    const state = { profiles, active }
    if (digitActive !== undefined) state.digitActive = digitActive
    if (!useDigitColors) state.useDigitColors = false
    return state
  }

  const isSynced = (state) => state.digitActive === undefined
  const usesDigitColors = (state) => state.useDigitColors !== false
  const withProfiles = (state, profiles, active, digitActive) => makeState(profiles, active, digitActive, usesDigitColors(state))

  const preloadProfiles = () => Object.keys(PRELOADS).map((name) => ({ name, groups: cloneGroups(PRELOADS[name]) }))

  // Groups saved before profiles existed, else the preloads, stand in for profiles not saved or not readable.
  const stateFromStored = (store) => load(store, { key: PROFILES_KEY, read: readProfiles }).value ?? stateFromLegacy(store.getData(LEGACY_GROUPS_KEY))

  const saveProfiles = (store, state) => save(store, PROFILES_KEY, state)

  // Groups saved before profiles existed become the active profile.
  function stateFromLegacy (legacyGroups) {
    const preloads = preloadProfiles()
    const legacy = normalizeGroups(legacyGroups)
    if (!legacy) return { profiles: preloads, active: 0 }
    const equal = preloads.findIndex((profile) => sameGroups(profile.groups, legacy))
    if (equal >= 0) return { profiles: preloads, active: equal }
    return { profiles: [{ name: CUSTOM_NAME, groups: legacy }, ...preloads], active: 0 }
  }

  function withAddedPreloads (state, names) {
    const profiles = state.profiles.map(cloneProfile)
    for (const name of names) {
      const groups = PRELOADS[name]
      if (profiles.length < MAX_PROFILES && !profiles.some((p) => sameGroups(p.groups, groups))) profiles.push({ name, groups: cloneGroups(groups) })
    }
    return withProfiles(state, profiles, state.active, state.digitActive)
  }

  const activeGroups = (state) => state.profiles[state.active].groups
  const digitGroups = (state) => state.profiles[isSynced(state) ? state.active : state.digitActive].groups

  const NEW_PROFILE_SUFFIX = ' copy'

  function copyProfile (state, index) {
    const source = state.profiles[index]
    if (!source || state.profiles.length >= MAX_PROFILES) return state
    const copy = { name: cleanName(source.name + NEW_PROFILE_SUFFIX), groups: cloneGroups(source.groups) }
    return withProfiles(state, [...state.profiles.map(cloneProfile), copy], state.active, state.digitActive)
  }

  // A blank name keeps the old one.
  function renameProfile (state, index, name) {
    const trimmed = cleanName(name)
    if (!state.profiles[index] || trimmed === '') return state
    return withProfiles(state, state.profiles.map((p, i) => (i === index ? { name: trimmed, groups: cloneGroups(p.groups) } : cloneProfile(p))), state.active, state.digitActive)
  }

  // Where a profile index lands when another profile is deleted: a deleted one falls to its neighbour.
  const indexAfterDelete = (index, deleted, count) => (deleted < index ? index - 1 : Math.min(index, count - 2))

  // Where a profile index lands when the profile at `from` is dragged to `to`.
  function indexAfterMove (index, from, to) {
    if (index === from) return to
    if (from < index && index <= to) return index - 1
    if (to <= index && index < from) return index + 1
    return index
  }

  function deleteProfile (state, index) {
    if (state.profiles.length <= 1 || !state.profiles[index]) return state
    const profiles = state.profiles.filter((_, i) => i !== index).map(cloneProfile)
    const active = indexAfterDelete(state.active, index, state.profiles.length)
    // Deleting the digit profile makes the digits follow the cell profile.
    const digitActive = isSynced(state) || index === state.digitActive ? undefined : indexAfterDelete(state.digitActive, index, state.profiles.length)
    return withProfiles(state, profiles, active, digitActive)
  }

  function moveProfile (state, from, to) {
    if (from === to) return state
    const order = state.profiles.map((_, i) => i)
    order.splice(to, 0, ...order.splice(from, 1))
    return withProfiles(state, order.map((i) => cloneProfile(state.profiles[i])), order.indexOf(state.active), isSynced(state) ? undefined : order.indexOf(state.digitActive))
  }

  function setActive (state, index) {
    return state.profiles[index] ? withProfiles(state, state.profiles.map(cloneProfile), index, state.digitActive) : state
  }

  function setDigitActive (state, index) {
    return state.profiles[index] ? withProfiles(state, state.profiles.map(cloneProfile), state.active, index) : state
  }

  // Unticking starts the digit pick at the cell profile, so no color changes until another is picked.
  const setSync = (state, synced) => withProfiles(state, state.profiles.map(cloneProfile), state.active, synced ? undefined : (state.digitActive ?? state.active))

  const setUseDigitColors = (state, on) => makeState(state.profiles.map(cloneProfile), state.active, state.digitActive, on)

  const digitChoice = (state) => (!usesDigitColors(state) ? 'none' : isSynced(state) ? 'same' : String(state.digitActive))

  function chooseDigit (state, choice) {
    if (choice === 'none') return setUseDigitColors(state, false)
    const colored = setUseDigitColors(state, true)
    return choice === 'same' ? setSync(colored, true) : setDigitActive(colored, Number(choice))
  }

  function setProfileGroups (state, index, groups) {
    return withProfiles(state, state.profiles.map((p, i) => (i === index ? { name: p.name, groups: cloneGroups(groups) } : cloneProfile(p))), state.active, state.digitActive)
  }

  const dropIndex = (mids, from, y) => mids.filter((mid, i) => i !== from && mid < y).length

  // The chips stop at three groups, the most any preload but Each digit has.
  const CHIP_MAX_GROUPS = 3

  function shownDigit (digits) {
    const sorted = [...digits].sort()
    const nonZero = sorted.filter((d) => d !== '0')
    if (nonZero.length === 0) return sorted[0] || ''
    if (nonZero.every((d) => d < '5')) return nonZero[0]
    if (nonZero.every((d) => d > '5')) return nonZero[nonZero.length - 1]
    return nonZero[Math.ceil(nonZero.length / 2) - 1]
  }

  const shownGroups = (groups, max) => groups.slice(0, max).map((g) => ({ key: g.key, digit: shownDigit(g.digits) }))

  // The chips a profile pair draws in `mode`: each a digit with the cell group and the digit group it falls in (undefined when a profile does not cover it).
  // Both takes the set of digits that reaches the most groups of the two profiles; see GLOSSARY.md, Cell strip.
  function shownChips (mode, cellGroups, digitGroups) {
    const cellKeyOf = keyOfDigitMap(cellGroups)
    const digitKeyOf = keyOfDigitMap(digitGroups)
    const chipOf = (digit) => ({ digit, cellKey: cellKeyOf[digit], digitKey: digitKeyOf[digit] })
    const strip = shownGroups(cellGroups, CHIP_MAX_GROUPS).map((g) => g.digit)
    if (mode !== 'both') return shownGroups(mode === 'digit' ? digitGroups : cellGroups, CHIP_MAX_GROUPS).map((g) => chipOf(g.digit))
    const count = Math.min(Math.max(cellGroups.length, digitGroups.length), CHIP_MAX_GROUPS)
    // 0 is set aside, as in a group's shown digit, unless a group holds nothing else.
    const zeroAlone = [...cellGroups, ...digitGroups].some((g) => g.digits.length === 1 && g.digits[0] === '0')
    const covered = DIGITS.filter((d) => (d in cellKeyOf || d in digitKeyOf) && (d !== '0' || zeroAlone))
    const reached = (set, keyOf) => new Set(set.map((d) => keyOf[d]).filter((k) => k !== undefined)).size
    // One number: the groups reached outrank the digits shared with the Cell strip, which at most three digits share.
    const rankOf = (set) => (reached(set, cellKeyOf) + reached(set, digitKeyOf)) * 10 + set.filter((d) => strip.includes(d)).length
    let best = null
    let bestRank = -1
    // Sets are visited in ascending order, so a set replaces the best only on a strictly higher rank and the lowest of a tie stays.
    const visit = (set, from) => {
      if (set.length === count) {
        if (rankOf(set) > bestRank) { best = [...set]; bestRank = rankOf(set) }
        return
      }
      for (let i = from; i < covered.length; i++) visit([...set, covered[i]], i + 1)
    }
    visit([], 0)
    // A synced profile keeps the Cell strip's own order, so Both shows the Cell strip.
    return (best && !sameGroups(cellGroups, digitGroups) ? best : strip).map(chipOf)
  }

  // <lib:color-math>
  // Generated from lib/color-math.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  const clamp255 = (x) => Math.max(0, Math.min(255, x))

  // The share of its OKLCH lightness a cell color keeps when darkened: low enough to read against cell colors drawn at 60% opacity, high enough that the lightest still show as 5px lines on white and the nine stay apart.
  const LIGHTNESS_FACTOR = 0.75
  const GAMUT_EDGE = 1e-6
  const LIGHT_TEXT = '#dddddd'
  const DARK_TEXT = '#222222'

  const COLOR_FUNCTION = /^(rgb|hsl)a?\(([^)]*)\)$/
  const HEX_DIGITS = /^#([0-9a-f]{3}|[0-9a-f]{6})$/
  const HEX_ALPHA = /^#[0-9a-f]{3}([0-9a-f])$|^#[0-9a-f]{6}([0-9a-f]{2})$/

  // An alpha written as a number or a percentage, as a number from 0 to 1 (NaN for other text).
  const alphaOf = (text) => text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text)

  // The kind (rgb or hsl), first three arguments and alpha of a color function with comma, space or slash separators, or null for any other text.
  function colorFunction (value) {
    const fn = COLOR_FUNCTION.exec(value)
    if (!fn) return null
    const parts = fn[2].split(/[,/\s]+/).filter(Boolean)
    return { kind: fn[1], args: parts.slice(0, 3), alpha: parts.length > 3 ? alphaOf(parts[3]) : undefined }
  }

  // A page lists `transparent`, or a color with alpha 0, to leave a slot empty (key 0 of each default page).
  function isTransparent (text) {
    if (typeof text !== 'string') return false
    const value = text.trim().toLowerCase()
    if (value === 'transparent') return true
    const hex = HEX_ALPHA.exec(value)
    if (hex) return parseInt(hex[1] ?? hex[2], 16) === 0
    const fn = colorFunction(value)
    return Boolean(fn && fn.alpha <= 0)
  }

  // A color's [r, g, b] channels, from #rgb, #rrggbb, rgb() or rgba() text (its alpha a number or a percentage), or null for a transparent or unreadable one.
  // SudokuPad's own cell color 3 is `rgb(-36, -36, -36)`, which clamps to black.
  function parseColor (text) {
    if (typeof text !== 'string' || isTransparent(text)) return null
    const value = text.trim().toLowerCase()
    const hex = HEX_DIGITS.exec(value)
    if (hex) {
      const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
      return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16))
    }
    const fn = colorFunction(value)
    if (!fn || fn.kind !== 'rgb' || fn.args.length < 3) return null
    const channels = fn.args.map(Number)
    return channels.some(Number.isNaN) ? null : channels.map((x) => Math.round(clamp255(x)))
  }

  const toHex = (rgb) => '#' + rgb.map((x) => Math.round(clamp255(x)).toString(16).padStart(2, '0')).join('')

  const toLinear = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  const fromLinear = (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)

  // Ottosson's published matrices. The way back returns the unclamped linear channels, so a caller can tell an out-of-gamut color.
  function toOklab ([r, g, b]) {
    const [lr, lg, lb] = [r, g, b].map(toLinear)
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    ]
  }

  function fromOklabLinear ([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
    ]
  }

  const inGamut = (linear) => linear.every((x) => x >= -GAMUT_EDGE && x <= 1 + GAMUT_EDGE)

  // Lowering lightness at fixed chroma can leave sRGB, so chroma is reduced just far enough to fit (a bisection), which keeps the hue.
  function darkenColor (rgb) {
    const [L, a, b] = toOklab(rgb.map(clamp255))
    const target = L * LIGHTNESS_FACTOR
    let low = 1
    if (!inGamut(fromOklabLinear([target, a, b]))) {
      low = 0
      let high = 1
      for (let i = 0; i < 30; i++) {
        const mid = (low + high) / 2
        if (inGamut(fromOklabLinear([target, a * mid, b * mid]))) low = mid
        else high = mid
      }
    }
    const out = fromOklabLinear([target, a * low, b * low])
    return toHex(out.map((x) => fromLinear(Math.max(0, Math.min(1, x)))))
  }

  // WCAG relative luminance of [r, g, b] channels.
  function wcagLuminance (rgb) {
    const [r, g, b] = rgb.map((c) => {
      const x = c / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  // LIGHT_TEXT or DARK_TEXT, whichever contrasts more with the background color (any parseColor text).
  function textColorFor (background) {
    const rgb = parseColor(background)
    if (!rgb) throw new RangeError(`color-math: ${background} is not a color`)
    const page = wcagLuminance(rgb) + 0.05
    const contrast = (text) => { const t = wcagLuminance(parseColor(text)) + 0.05; return Math.max(page, t) / Math.min(page, t) }
    return contrast(LIGHT_TEXT) >= contrast(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
  }
  /* eslint-enable no-unused-vars */
  // </lib:color-math>
  // <lib:ready>
  // Generated from lib/ready.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // Resolves with what `check()` first returns that is not null, undefined or false, polling every `pollMs`. Rejects with `<what> not ready after <ms> ms` once `timeoutMs`
  // passes, so a wait for SudokuPad always ends and says what it was waiting for. A `check` that throws rejects with that error.
  function whenReady (check, { timeoutMs, what, pollMs = 100 }) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs
      const poll = () => {
        let value
        try {
          value = check()
        } catch (error) {
          reject(error)
          return
        }
        if (value !== null && value !== undefined && value !== false) resolve(value)
        else if (Date.now() >= deadline) reject(new Error(`${what} not ready after ${timeoutMs} ms`))
        else setTimeout(poll, pollMs)
      }
      poll()
    })
  }
  /* eslint-enable no-unused-vars */
  // </lib:ready>
  // <lib:palette>
  // Generated from lib/palette.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // Reads parseColor, darkenColor and toOklab from color-math, and whenReady from ready.
  /* global parseColor, darkenColor, toOklab, whenReady */
  // SudokuPad's own pen colors (tool-pen.css). Color 9 is rgb(-36, -36, -36) there, which clamps to black.
  const SUDOKUPAD_PEN_COLORS = Object.freeze({
    1: '#1f8020',
    2: '#e87cf1',
    3: '#e49632',
    4: '#f53a37',
    5: '#d2be32',
    6: '#3d99f5',
    7: '#d6d6d6',
    8: '#7c7c7c',
    9: '#000000'
  })
  const PEN_COLOR_NUMBERS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9])
  // The OKLCH chroma under which a darkened color counts as grey: SudokuPad's greys are 0, a tinted dark grey such as rgb(10, 20, 30) is about 0.024, and the
  // least saturated darkened default colors are above 0.08.
  const GREY_CHROMA = 0.04
  // One page preset per cell color page, up to three, then SudokuPad's own colors.
  const PAGE_PRESETS = ['page-1', 'page-2', 'page-3']
  const SUDOKUPAD_PRESET = 'sudokupad'
  const PALETTE_PRESET_LABELS = {
    'page-1': 'Darker page 1',
    'page-2': 'Darker page 2',
    'page-3': 'Darker page 3',
    [SUDOKUPAD_PRESET]: 'SudokuPad colors'
  }
  const COLOR_TOOL_TIMEOUT_MS = 10000

  // A color set is `{ colors, preset, missing }`: the nine colors, the preset they came from, and the pens of that page with no usable color, which keep SudokuPad's own.
  const SUDOKUPAD_SET = Object.freeze({ colors: SUDOKUPAD_PEN_COLORS, preset: SUDOKUPAD_PRESET, missing: Object.freeze([]) })

  // Color N is the color at index N of the page: SudokuPad shows index K on the cell color button with data-key K, so color N lines up with cell color button N.
  // Of the darkened colors, the darkest one under GREY_CHROMA becomes #000000, so the darkest color is black as in SudokuPad's own set.
  function darkerPageColors (keys, readCell) {
    const colors = {}
    const missing = []
    const derived = []
    PEN_COLOR_NUMBERS.forEach((n) => {
      const rgb = n < keys.length ? parseColor(readCell(keys[n])) : null
      if (rgb) {
        colors[n] = darkenColor(rgb)
        derived.push(n)
      } else {
        colors[n] = SUDOKUPAD_PEN_COLORS[n]
        missing.push(n)
      }
    })
    let darkest = null
    let darkestLightness = Infinity
    for (const n of derived) {
      const [lightness, a, b] = toOklab(parseColor(colors[n]))
      if (Math.hypot(a, b) < GREY_CHROMA && lightness < darkestLightness) {
        darkest = n
        darkestLightness = lightness
      }
    }
    if (darkest) colors[darkest] = '#000000'
    return { colors, missing }
  }

  function paletteOptions (pageCount) {
    return [...PAGE_PRESETS.slice(0, pageCount), SUDOKUPAD_PRESET]
  }

  // `pages` is the palette's pages of color keys, and `readCell` reads a key's color as CSS text.
  function paletteColors (preset, pages, readCell) {
    if (preset === SUDOKUPAD_PRESET) return SUDOKUPAD_SET
    const page = paletteOptions(pages.length).indexOf(preset)
    if (page === -1) throw new RangeError(`palette: ${preset} is not a preset of this palette`)
    return { ...darkerPageColors(pages[page], readCell), preset }
  }

  const colorTool = () => Framework.app?.tools?.colour

  // `init` assigns the page and sets the `--cell-color-<key>` variables in one synchronous step, so a palette on the tool means the variables are set too (the stylesheet's own
  // values for them exist earlier and say nothing about a custom palette).
  function readyColorTool () {
    const tool = colorTool()
    const pages = tool?.palette?.pages
    return Array.isArray(pages) && Array.isArray(pages[0]) ? tool : null
  }

  // Rejects once COLOR_TOOL_TIMEOUT_MS passes with no ready color tool, naming it, so the caller can skip its step and keep SudokuPad's own colors.
  function waitForColorTool () {
    return whenReady(readyColorTool, { timeoutMs: COLOR_TOOL_TIMEOUT_MS, what: 'the color tool' })
  }

  // The pages of cell color keys of the palette in force, or none until the color tool has one.
  function palettePages () {
    const palette = colorTool()?.palette
    if (!palette) return []
    if (!Array.isArray(palette.pages) || !palette.pages.every(Array.isArray)) throw new Error('SudokuPad\'s color palette has no pages of color keys, so the Darker page presets are left out')
    return palette.pages
  }

  // A custom palette can hold any CSS color (`#f00`, `red`, `hsl()`) and the variable reads back as written, so the browser turns it into `rgb()` text on a probe.
  // '' for a value it rejects or a variable with none.
  function readRootColor (name) {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    const probe = document.createElement('span')
    probe.style.color = value
    if (!probe.style.color) return ''
    document.body.appendChild(probe)
    try {
      return window.getComputedStyle(probe).color
    } finally {
      probe.remove()
    }
  }

  const readPenColor = (n) => readRootColor(`--puzzle-pencolor-${n}`)
  // The raw `--cell-color-<key>` value, not the 60% opacity it shows with on the grid. SudokuPad sets the variable of every key in the palette, so any page reads.
  const readCellColor = (key) => readRootColor(`--cell-color-${key}`)
  /* eslint-enable no-unused-vars */
  // </lib:palette>
  // <lib:color-picker>
  // Generated from lib/color-picker.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // Reads PEN_COLOR_NUMBERS from palette.
  /* global PEN_COLOR_NUMBERS */
  // SudokuPad's color tool holds its cell color buttons for the same 1000 ms (HoldToEditDelayMs).
  const HOLD_TO_EDIT_MS = 1000
  // One swatch's side and the gap between swatches; a caller lining its own keys up with the grid uses the same two.
  const SWATCH_PX = 34
  const SWATCH_GAP_PX = 4
  // The pickers over the panel's buttons, in the size SudokuPad's color tool uses for the same job.
  const PICKER_INPUT_REM = 2.4
  const PICKER_COLUMNS = 3
  // Percent-encoded; its inner quotes are single, so the url("...") wrapper's double quotes hold it.
  const CHOICE_ARROW = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%236b4fa0\'/%3E%3C/svg%3E")'

  const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  // The dialog's color block: a pulldown above a grid of swatches, three to a row.
  // Free mode (no `picked`) makes each swatch a color input; palette mode makes each a button, `picked` the pressed one, and a null swatch an empty cell.
  // `options` are `{ value, label, selected, disabled }`; `beside` goes in the grid's row, after it.
  function renderColorBlock ({ prefix, label, options, swatches, picked, beside = '' }) {
    const palette = picked !== undefined
    const option = ({ value, label, selected, disabled }) =>
      `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}>${escapeHtml(label)}</option>`
    const named = (swatch) => `aria-label="${escapeHtml(swatch.label)}" title="${escapeHtml(swatch.label)}"`
    const swatch = (s) => {
      const head = `class="${prefix}swatch" data-role="swatch"`
      if (!s) return `<span ${head} data-empty="slot"></span>`
      if (!palette) return `<input type="color" ${head} data-key="${escapeHtml(s.key)}" value="${escapeHtml(s.value)}" ${named(s)}>`
      return `<button type="button" ${head} data-key="${escapeHtml(s.key)}" aria-pressed="${s.key === picked}" ${named(s)} style="background:${escapeHtml(s.value)}"></button>`
    }
    return `<div class="${prefix}color-block">` +
      `<select class="${prefix}color-choice" data-role="color-choice" aria-label="${escapeHtml(label)}">${options.map(option).join('')}</select>` +
      `<div class="${prefix}color-row"><div class="${prefix}swatches">${swatches.map(swatch).join('')}</div>${beside}</div></div>`
  }

  // `scope` is the dialog's own element (`#id`), so SudokuPad's rules for its dialogs' selects and buttons are outranked without !important.
  function colorBlockCss (prefix, scope) {
    const at = (selector) => `${scope} .${prefix}${selector}`
    return [
      `${at('color-block')} { display: grid; justify-items: start; gap: 6px; margin: 6px 0; }`,
      // As wide as the block, whatever its longest option: a select is otherwise as wide as that, and would widen the dialog's column.
      `${at('color-choice')} { box-sizing: border-box; width: 0; min-width: 100%; margin: 0; font-size: 1rem; padding: 4px 28px 4px 10px; border: 1px solid #b9b0c9; border-radius: 6px; appearance: none; color: #222; background: #fff ${CHOICE_ARROW} no-repeat right 10px center; }`,
      `${at('color-row')} { display: flex; align-items: flex-start; gap: 12px; }`,
      `${at('swatches')} { display: grid; grid-template-columns: repeat(${PICKER_COLUMNS}, ${SWATCH_PX}px); gap: ${SWATCH_GAP_PX}px; }`,
      `${at('swatch')} { box-sizing: border-box; display: block; width: ${SWATCH_PX}px; height: ${SWATCH_PX}px; margin: 0; padding: 0; border: 1px solid rgb(0 0 0 / .25); border-radius: 6px; background: none; cursor: pointer; -webkit-appearance: none; appearance: none; }`,
      `${at('swatch')}[data-empty] { border: none; cursor: default; }`,
      `${at('swatch')}[aria-pressed="true"] { border: 2px solid #fff; outline: 3px solid #000; }`,
      `${at('swatch')}::-webkit-color-swatch-wrapper { padding: 0; }`,
      `${at('swatch')}::-webkit-color-swatch { border: none; border-radius: 5px; }`,
      `${at('swatch')}::-moz-color-swatch { border: none; border-radius: 5px; }`
    ].join('\n')
  }

  // Edit mode's looks, for SudokuPad's tool `tool` (its panel carries `tool-<tool>`): each picker fills the grid cell of its button, whose own picture is hidden under it.
  // A picker is out of the flow, so it takes no cell from the buttons the panel places itself.
  function pickerCss (prefix, tool) {
    const panel = `.tool-${tool} .controls-input`
    const picker = (n) => `${panel} .${prefix}picker[data-key="${n}"]`
    const rows = PEN_COLOR_NUMBERS.length / PICKER_COLUMNS
    return [
      `.${prefix}editing .controls-input button[data-key]::after { opacity: 0; }`,
      `.${prefix}editing .${prefix}picker { position: absolute; inset: 0; z-index: 10; }`,
      `.${prefix}editing .${prefix}picker input { position: absolute; inset: 0; margin: auto; width: ${PICKER_INPUT_REM}rem; height: ${PICKER_INPUT_REM}rem; padding: 0; pointer-events: all; }`,
      ...PEN_COLOR_NUMBERS.map((n) => `${picker(n)} { grid-row: ${Math.ceil(n / PICKER_COLUMNS)} / span 1; grid-column: ${(n - 1) % PICKER_COLUMNS + 1} / span 1; }`),
      // SudokuPad's Keypad Flipped swaps the first and third rows of buttons, so each picker follows its button.
      ...[[[1, 2, 3], rows], [[7, 8, 9], 1]].flatMap(([keys, row]) => keys.map((n) => `.setting-flipkeypad ${picker(n)} { grid-row: ${row} / span 1; }`))
    ].join('\n')
  }

  // Every open picker shows the color `colorOf(n)` gives now.
  function refreshPickers (prefix, colorOf) {
    document.querySelectorAll(`.${prefix}picker input`).forEach((input) => { input.value = colorOf(input.dataset.key) })
  }

  // A hold of HOLD_TO_EDIT_MS on one of the tool's nine color buttons, with either mouse button, puts a color picker over each; a picker's input calls `save(n, value)` at once.
  // A second hold, or the panel leaving the tool, ends edit mode. `guard` runs each toggle, so a caller can report a failure its own way.
  function installHoldToEdit ({ prefix, tool, colorOf, save, guard = (toggle) => toggle() }) {
    const toolClass = `tool-${tool}`
    const editing = `${prefix}editing`
    const pickerClass = `${prefix}picker`
    // A right-click hold ends over a picker in edit mode, and Windows opens the context menu on release, so it is suppressed over the pickers as well as the buttons.
    const targets = `.${toolClass} .controls-input button[data-key], .${toolClass} .${pickerClass} input`
    // SudokuPad keeps one panel element and swaps its `tool-<name>` class for the next tool's, so a class watcher ends edit mode when the panel stops being this tool's.
    let leaveWatch = null

    function exit (panel) {
      if (leaveWatch) leaveWatch.disconnect()
      leaveWatch = null
      panel.classList.remove(editing)
      panel.querySelectorAll(`.${pickerClass}`).forEach((el) => el.remove())
    }

    function enter (panel) {
      // Every button is found before anything changes, so a missing one leaves no half edit mode.
      const buttons = PEN_COLOR_NUMBERS.map((n) => {
        const button = panel.querySelector(`.controls-input button[data-key="${n}"]`)
        if (!button) throw new Error(`${prefix}color-picker: the ${tool} tool has no button for color ${n}`)
        return button
      })
      panel.classList.add(editing)
      buttons.forEach((button, i) => {
        const n = PEN_COLOR_NUMBERS[i]
        button.insertAdjacentHTML('beforebegin', `<div class="${pickerClass}" data-key="${n}"><input type="color" data-key="${n}" value="${escapeHtml(colorOf(String(n)))}"></div>`)
      })
      leaveWatch = new window.MutationObserver(() => {
        if (!panel.classList.contains(toolClass)) exit(panel)
      })
      leaveWatch.observe(panel, { attributes: true, attributeFilter: ['class'] })
    }

    let timer
    let holdDone = false
    const cancel = () => { clearTimeout(timer); timer = undefined }
    // Pointer events carry a mouse button of either kind.
    document.addEventListener('pointerdown', (event) => {
      cancel()
      holdDone = false
      const target = event.target.closest(targets)
      if (!target) return
      const panel = target.closest(`.${toolClass}`)
      timer = setTimeout(() => {
        timer = undefined
        holdDone = true
        if (!panel.classList.contains(toolClass)) return
        guard(() => panel.classList.contains(editing) ? exit(panel) : enter(panel))
      }, HOLD_TO_EDIT_MS)
    }, true)
    window.addEventListener('pointerup', cancel, true)
    window.addEventListener('pointercancel', cancel, true)
    // The browser's menu would open over the picker during a right-click hold: when the press is still going (Linux opens it on press),
    // or after the hold has run its course (Windows opens it on release, over the picker that appeared under the pointer).
    // A quick right-click on a button, released before the delay, keeps its menu on Windows.
    document.addEventListener('contextmenu', (event) => {
      if ((timer !== undefined || holdDone) && event.target.closest(targets)) event.preventDefault()
    }, true)
    document.addEventListener('input', (event) => {
      const input = event.target
      if (input.matches(`.${pickerClass} input`)) save(input.dataset.key, input.value)
    })
  }
  /* eslint-enable no-unused-vars */
  // </lib:color-picker>

  // An entered digit's text element carries no digit attribute, so the script adds this one.
  const DIGIT_ATTR = 'data-color-by-digit'
  // Corner marks are `text`; centre marks are `tspan` inside one `text`.
  const MARK_SELECTORS = ['#cell-pencilmarks .cell-pencilmark', '#cell-candidates tspan']

  function digitOfText (text) {
    const t = String(text ?? '').trim()
    return DIGITS.includes(t) ? t : null
  }

  // The `#svgrenderer` prefix outranks SudokuPad's red rule for a conflicting mark. Marks carry their digit in
  // `data-val`; givens sit in `#cell-givens`, which no rule names.
  function buildDigitCss (groups, colorOf) {
    const keyOfDigit = keyOfDigitMap(groups)
    return DIGITS.flatMap((digit) => {
      const rgb = keyOfDigit[digit] === undefined ? null : parseColor(colorOf(keyOfDigit[digit]))
      if (!rgb) return []
      const shade = darkenColor(rgb)
      return [`#cell-values [${DIGIT_ATTR}="${digit}"] { fill: ${shade} }`, ...MARK_SELECTORS.map((selector) => `#svgrenderer ${selector}[data-val="${digit}"] { fill: ${shade} }`)]
    }).join('\n')
  }

  const CIRCLES_ID = 'color-by-digit-circles'
  // Pale enough that every shade stays readable on it.
  const CIRCLE_FILL = '#ff6b6b'
  const CIRCLE_OPACITY = 0.4
  const CIRCLE_RADIUS_PER_WIDTH = 0.8
  // SudokuPad adds this class to the page while it shows conflicting marks in red.
  const CHECK_MARKS_CLASS = '.setting-checkpencilmarks'

  // No pointer events, so a click on a circle reaches the board.
  const CIRCLE_CSS = [
    `#${CIRCLES_ID} { display: none; pointer-events: none }`,
    `${CHECK_MARKS_CLASS} #${CIRCLES_ID} { display: inline }`,
    `#${CIRCLES_ID} circle { fill: ${CIRCLE_FILL}; fill-opacity: ${CIRCLE_OPACITY} }`
  ].join('\n')

  function circleFor (mark) {
    return { cx: mark.x, cy: mark.y, r: mark.width * CIRCLE_RADIUS_PER_WIDTH }
  }

  // The canvas reports `left` positive going left; the character's origin is on the baseline at
  // `extent.x`, its em box starts at `extent.y`.
  function inkMiddle (extent, measure) {
    // A browser that lacks a measure gives `undefined`, which would draw no circle and say nothing.
    for (const key of ['left', 'right', 'ascent', 'descent', 'fontAscent']) {
      if (!Number.isFinite(measure[key])) throw new Error(`color-by-digit: the browser gave no ${key} measure for a mark's digit`)
    }
    const baseline = extent.y + measure.fontAscent
    return {
      x: extent.x + (measure.right - measure.left) / 2,
      y: baseline + (measure.descent - measure.ascent) / 2
    }
  }

  function planSwitch (cells, oldGroups, newGroups) {
    return planCellColors(cells, newGroups, everyIndex(cells), [...new Set([...groupKeys(oldGroups), ...groupKeys(newGroups)])])
  }

  function isVisibleColor (value) {
    const text = String(value)
    return text.trim() !== '' && !isTransparent(text)
  }

  const PURPLE = '#6a1b9a'
  const OFF_WORD_GREY = '#b3acbf'

  // No pointer events, so a press on the label is a press on the button.
  function modeWordHtml (mode) {
    const on = mode !== 'off'
    return '<span data-role="mode" style="pointer-events:none;position:absolute;left:-3px;top:-2px;' +
      `font:${on ? 700 : 400} 9px/1 sans-serif;letter-spacing:.04em;white-space:nowrap;color:${on ? PURPLE : OFF_WORD_GREY}">${MODE_NAMES[mode].toUpperCase()}</span>`
  }

  // WCAG 2.2 SC 2.5.8: a target is at least this many px each way.
  const MIN_TARGET_PX = 24
  const ARROW_BOX_PX = 14
  const ARROW_BOX_HTML = '<span data-role="menu" role="button" aria-haspopup="menu" aria-label="Color by digit profiles" title="Profiles" ' +
    'style="pointer-events:auto;position:absolute;right:-4px;bottom:-4px;box-sizing:border-box;width:' + ARROW_BOX_PX + 'px;height:' + ARROW_BOX_PX + 'px;' +
    `border:1.5px solid ${PURPLE};border-radius:3px;background:#fff;color:${PURPLE};font:700 7px/11px sans-serif;text-align:center">&#9660;</span>`

  const UNREADABLE_FILL = '#ccc'

  // The icon is drawn in 100 by 100 units. A run of three cells reaches a little past its sides, into the button's margin,
  // and stays above the arrow box in the lower right.
  const ICON_CELL = 38
  function iconRun (mode, groups, colorOf, digitProfileGroups) {
    const chips = shownChips(mode, groups, digitProfileGroups ?? groups)
    return renderChips(groups, colorOf, { size: ICON_CELL, style: mode, chips, x: 50 - chips.length * ICON_CELL / 2, y: 50 - ICON_CELL / 2 })
  }

  // SudokuPad's own app buttons put their icon in <div class="icon">.
  const iconHtml = (mode, groups, colorOf, digitProfileGroups) =>
    '<div class="icon" style="position:relative"><svg viewBox="0 0 100 100" overflow="visible" xmlns="http://www.w3.org/2000/svg">' +
    iconRun(mode, groups, colorOf, digitProfileGroups) + '</svg>' + modeWordHtml(mode) + ARROW_BOX_HTML + '</div>'

  // The mode in words for the title and aria-label, which the chips' look alone does not say.
  const buttonLabel = (mode) => `Color by digit: ${MODE_NAMES[mode]}`

  // The button joins the bottom row SudokuPad already wraps; with no such row Framework skips it.
  const BOTTOM_ROW = '.controls-aux'
  // SudokuPad's own rules make this row wrap and size its buttons in rem under a scale transform, so a cap in rem holds five a row at every window size, whichever script added which button.
  const BOTTOM_ROW_CSS = `${BOTTOM_ROW} { max-width: 21.6rem; }`
  const BOTTOM_ROW_STYLE_ID = 'color-by-digit-row'

  // SudokuPad binds button handlers only to buttons present when the controls were built, so a
  // button added later needs refreshControls. Its onClick is left empty: listenForButton takes every
  // press before SudokuPad sees it.
  function installButton (framework, app, mode, groups, colorOf, digitProfileGroups) {
    framework.addControlButton({ parent: BOTTOM_ROW, name: 'colorbydigit', title: buttonLabel(mode), content: iconHtml(mode, groups, colorOf, digitProfileGroups), onClick () {} })
    app.refreshControls()
  }

  // A page has one color per SudokuPad color button: index 0, then indices 1-9 in rows of three.
  const PAGE_COLUMNS = 3
  const PAGE_BUTTONS = 10

  // A null entry keeps the empty space, so every other color stays on its index.
  function layoutPages (pages, currentPage, readColor) {
    return pages.map((keys, page) => {
      const list = Array.isArray(keys) ? keys.slice(0, PAGE_BUTTONS) : []
      const slot = (index) => {
        if (list[index] === undefined) return null
        const key = String(list[index])
        const value = String(readColor(key)).trim()
        return isVisibleColor(value) ? { key, value } : null
      }
      const rows = []
      for (let index = 1; index < PAGE_BUTTONS; index += PAGE_COLUMNS) {
        rows.push(Array.from({ length: PAGE_COLUMNS }, (_, c) => slot(index + c)))
      }
      return { page, current: page === currentPage, rows, zero: slot(0) }
    })
  }

  const pageSlots = (p) => [p.zero, ...p.rows.flat()]

  function layoutColors (pages) {
    return pages.flatMap(pageSlots).filter(Boolean)
  }

  // A digit key is a swatch's size, so each row of the pad lines up with a row of swatches.
  const KEY_SIZE = `${SWATCH_PX}px`
  const CLASS_PREFIX = 'cbd-'
  // SudokuPad's own color for an entered digit, which a painted digit key shows on its group's color.
  const ENTERED_DIGIT_BLUE = 'rgb(29, 106, 229)'

  const pageLabel = (page) => `Page ${page.page + 1}${page.current ? ' (current)' : ''}`

  function initialPage (pages, key) {
    const holds = (p) => pageSlots(p).some((slot) => slot && slot.key === key)
    const found = pages.find((p) => p.current && holds(p)) || pages.find(holds) || pages.find((p) => p.current)
    return found ? found.page : 0
  }

  // The lowest group's color, when some page shows it; else the first visible color of the current page, so the brush is always drawable.
  function startingBrush (groups, pages) {
    if (groups.length > 0 && layoutColors(pages).some((c) => c.key === groups[0].key)) return groups[0].key
    const page = pages.find((p) => p.current) || pages[0]
    const first = page && [...page.rows.flat(), page.zero].find(Boolean)
    return first ? first.key : null
  }

  function showingProfile (draft, state, selected) {
    const groups = state.profiles[selected].groups
    const brush = startingBrush(groups, draft.pages)
    return { ...draft, state, selected, keptName: state.profiles[selected].name, brush, page: initialPage(draft.pages, brush) }
  }
  // The settings dialog's draft: the profiles (`state`) and mode Save would apply, the selected profile, its name when it was selected
  // (an emptied name field keeps it), the brush, the color page shown, and the current stroke's paint key (undefined before its first
  // digit, null for a stroke that clears).
  const openingDraft = (state, mode, pages) => showingProfile({ mode, pages, paintKey: undefined }, state, state.active)

  // Each dialog edit as one event; an edit that changes nothing returns the same draft.
  function reduceDraft (draft, event) {
    const { state, selected, brush } = draft
    const groups = state.profiles[selected].groups
    const withGroups = (next) => (sameGroups(next, groups) ? draft : { ...draft, state: setProfileGroups(state, selected, next) })
    const showing = (next, nextSelected) => (next === state ? draft : showingProfile(draft, next, nextSelected))
    switch (event.type) {
      case 'select': return showingProfile(draft, state, event.index)
      case 'rename': return { ...draft, state: renameProfile(state, selected, event.name.trim() === '' ? draft.keptName : event.name) }
      case 'brush': return { ...draft, brush: event.key }
      case 'page': return { ...draft, page: event.page }
      case 'clear': return withGroups([])
      case 'press': return draft.paintKey === undefined ? draft : { ...draft, paintKey: undefined }
      case 'paint': {
        if (brush === null) return draft
        const paintKey = draft.paintKey === undefined ? strokeKey(groups, event.digit, brush) : draft.paintKey
        const painted = withGroups(setDigitColor(groups, event.digit, paintKey))
        return paintKey === draft.paintKey ? painted : { ...painted, paintKey }
      }
      case 'key-paint': return brush === null ? draft : withGroups(paintDigit(groups, event.digit, brush))
      case 'choose':
        if (event.role === 'mode-draft') return { ...draft, mode: event.value }
        if (event.role === 'cell-profile') return { ...draft, state: setActive(state, Number(event.value)) }
        if (event.role === 'digit-profile') {
          // None moves the draft mode at once, so the Mode pulldown never shows a mode the draft does not hold: a select fires no change
          // for the option it already shows.
          const next = chooseDigit(state, event.value)
          return { ...draft, state: next, mode: allowedMode(draft.mode, usesDigitColors(next)) }
        }
        throw new Error(`reduceDraft: no pulldown ${event.role}`)
      case 'new-profile': {
        const next = copyProfile(state, selected)
        return showing(next, next.profiles.length - 1)
      }
      case 'delete': return showing(deleteProfile(state, event.index), indexAfterDelete(selected, event.index, state.profiles.length))
      case 'move': return event.from === event.to ? draft : showing(moveProfile(state, event.from, event.to), indexAfterMove(selected, event.from, event.to))
      case 'reload': return showingProfile({ ...draft, mode: event.mode }, event.state, event.state.active)
    }
    throw new Error(`reduceDraft: no edit ${event.type}`)
  }

  // A digit key shows its group's color; a color on no page of the palette gets the dashed unset look.
  function renderDigitKey (digit, key, colors) {
    const color = colors.find((c) => c.key === key)
    const look = !key ? '' : color ? ` style="background:${escapeHtml(color.value)}"` : ' class="cbd-unset"'
    return `<button type="button" data-act="digit" data-digit="${digit}" data-key="${escapeHtml(key || '')}"${look}>${digit}</button>`
  }

  // The digit keys in rows of three beside the swatch grid, and a fourth row with the 0 key under 7, where SudokuPad's own pad puts 0.
  function renderPad (groups, colors) {
    const keyOfDigit = keyOfDigitMap(groups)
    const digitKey = (d) => renderDigitKey(d, keyOfDigit[d], colors)
    const pad = '<span data-empty="pad"></span>'
    const rows = Math.floor(NUMPAD_DIGITS.length / PAGE_COLUMNS)
    const zero = NUMPAD_DIGITS[NUMPAD_DIGITS.length - 1]
    const lines = Array.from({ length: rows }, (_, r) => NUMPAD_DIGITS.slice(r * PAGE_COLUMNS, (r + 1) * PAGE_COLUMNS).map(digitKey).join(''))
    lines.push(digitKey(zero) + pad.repeat(PAGE_COLUMNS - 1))
    return `<div data-role="paint">${lines.join('')}</div>`
  }

  // The shown page's swatches in the shared color block, its index 0 color after 1 to 9, so it sits on a fourth row
  // beside the 0 key, which the pad puts under 7.
  function renderPaint (groups, pages, shown, brush, colors) {
    return renderColorBlock({
      prefix: CLASS_PREFIX,
      label: 'Cell color page',
      options: pages.map((p) => ({ value: String(p.page), label: pageLabel(p), selected: p === shown })),
      swatches: [...shown.rows.flat(), ...(shown.zero ? [shown.zero] : [])].map((slot) => slot && { ...slot, label: slot.key }),
      picked: brush,
      beside: renderPad(groups, colors)
    })
  }

  // Each mode draws a cell the way it colors the board: the cell's fill and its digit's ink from the group color, and the run's line.
  // A group color that cannot be read keeps SudokuPad's own digit color, as the board does.
  const shadeOf = (color) => { const rgb = parseColor(color); return rgb ? darkenColor(rgb) : ENTERED_DIGIT_BLUE }
  const CHIP_LOOKS = {
    cell: (color) => ({ fill: color || UNREADABLE_FILL, ink: ENTERED_DIGIT_BLUE, line: '#000' }),
    digit: (color, digitColor) => ({ fill: '#fff', ink: shadeOf(digitColor), line: '#000' }),
    both: (color, digitColor) => ({ fill: color || UNREADABLE_FILL, ink: shadeOf(digitColor), line: '#000' }),
    off: () => ({ fill: '#fff', ink: '#999', line: '#aaa' })
  }
  // One cell of the run, in the run's own units; the strokes stay 1 px at any size.
  const RUN_CELL = 10
  const STROKE = 'stroke-width="1" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"'

  // A run of joined cells, one per shown chip (`chips` when given, else the mode's own pick): fills first, then single dividers and one outline over them, so no line is doubled.
  // `size` is one cell's width, in pixels or in the units of an enclosing SVG, which `x` and `y` place it in.
  function renderChips (groups, colorOf, { size, style = 'cell', x, y, digitProfileGroups = groups, chips = shownChips(style, groups, digitProfileGroups) }) {
    const shown = chips
    const width = shown.length * RUN_CELL
    const { line } = CHIP_LOOKS[style]('')
    const cells = shown.map(({ digit, cellKey, digitKey }, i) => {
      const key = style === 'digit' ? digitKey : cellKey
      const look = CHIP_LOOKS[style](cellKey === undefined ? '' : colorOf(cellKey), digitKey === undefined ? '' : colorOf(digitKey))
      // A digit in no cell group is left uncolored on the board, so its chip is white, not the grey of an unreadable color.
      const fill = cellKey === undefined ? '#fff' : look.fill
      const ink = look.ink
      return `<g data-role="chip" data-key="${escapeHtml(key ?? '')}"><rect x="${i * RUN_CELL}" y="0" width="${RUN_CELL}" height="${RUN_CELL}" fill="${escapeHtml(fill)}"/>` +
        `<text x="${i * RUN_CELL + RUN_CELL / 2}" y="${RUN_CELL * 0.74}" font-family="sans-serif" font-weight="800" font-size="${RUN_CELL * 0.68}" text-anchor="middle" fill="${escapeHtml(ink)}">${escapeHtml(digit)}</text></g>`
    }).join('')
    const dividers = shown.slice(1).map((_, i) => `<line x1="${(i + 1) * RUN_CELL}" y1="0" x2="${(i + 1) * RUN_CELL}" y2="${RUN_CELL}" stroke="${line}" ${STROKE}/>`).join('')
    const place = x === undefined ? '' : ` x="${x}" y="${y}"`
    return `<svg data-role="chips" width="${shown.length * size}" height="${size}"${place} viewBox="0 0 ${width} ${RUN_CELL}" overflow="visible" aria-hidden="true">` +
      `${cells}${dividers}<rect x="0" y="0" width="${width}" height="${RUN_CELL}" fill="none" stroke="${line}" ${STROKE}/></svg>`
  }

  const RULE_COLOR = '#e3dff0'
  // Two columns need this much room each; the dialog's 640 px gives them two, a phone gives one.
  const COLUMN_MIN = 270
  // Wide enough for the longest of Mode, Cell and Digit, so the three pulldowns start at one edge.
  const PULLDOWN_LABEL_WIDTH = 64
  const DIALOG_WIDTH = 640
  // <lib:settings-dialog>
  // Generated from lib/settings-dialog.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // The events that end a press. SudokuPad's pen tool takes its click from `mouseup` (seen live), and
  // a touch ends with `pointerup`, `touchend` and a compatibility `mouseup`, so all four are swallowed.
  const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'mouseup', 'touchend']
  const SETTINGS_GROUP = 'experimental'
  const TITLE_MUTED = '#777'
  const FOCUS_RING = '#6a1b9a'
  const CONTROL_HOVER = '#f3e5f5'
  const SAVE_FILL = '#6b3fa0'
  // An inset layer darkens whatever fill the control has.
  const PRESS_LAYER = 'box-shadow: inset 0 0 0 100vmax rgb(0 0 0 / .1)'
  const STATUS_ATTRIBUTE = 'data-role="settings-status"'
  const STATUS_SELECTOR = `[${STATUS_ATTRIBUTE}]`

  function setDialogStatus (dialog, message) {
    dialog.querySelector(STATUS_SELECTOR).textContent = message
  }
  // A thrown value that is not an Error has no message, so it is shown as itself.
  const errorText = (error) => error?.message ?? String(error)

  // The next press ends the swallowing even when no release came (a close from the keyboard).
  function swallowRelease (win = window) {
    const swallow = (event) => event.stopImmediatePropagation()
    const stop = () => {
      RELEASE_EVENTS.forEach((type) => win.removeEventListener(type, swallow, true))
      win.removeEventListener('pointerdown', stop, true)
    }
    RELEASE_EVENTS.forEach((type) => win.addEventListener(type, swallow, true))
    win.addEventListener('pointerdown', stop, true)
  }

  // SudokuPad runs a dialog button's handler on the press and removes the dialog at once, so the release lands on the grid and the pen tool takes it for a click on the cell under the button.
  function closeDialogKeepingGrid (framework, win = window) {
    framework.closeDialog()
    swallowRelease(win)
  }

  // SudokuPad's showDialog does nothing while its settings dialog is open, so that one closes first; `open` then runs after the close has settled.
  function addSettingsEntry (framework, { name, content, open }, { log = console.error } = {}) {
    framework.addSetting({
      tag: 'button',
      name,
      group: SETTINGS_GROUP,
      content,
      handler: () => {
        closeDialogKeepingGrid(framework)
        setTimeout(() => {
          try { open() } catch (error) { log(`${name}: could not open its settings dialog`, error) }
        }, 0)
      }
    })
  }

  const COPY_PASTE_PICTURES = {
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4"/>'
  }
  const titleIconButton = (act, label, picture) =>
    `<button type="button" data-act="${act}" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${picture}</svg></button>`

  // The dialog's first part: its own title rules, then the name with the version beside it, and Copy settings and Paste settings as icons at the right end,
  // after the status line they report to. The rules travel with the row, so they are in the page exactly while the dialog is.
  function renderDialogTitle ({ prefix, name, version }) {
    return `<style>${dialogTitleCss(prefix)}</style>` +
      `<div class="${prefix}title-row"><span><b>${name}</b> <small class="${prefix}version">v${version}</small></span>` +
      `<span ${STATUS_ATTRIBUTE}></span>` +
      `<span class="${prefix}tools">${titleIconButton('copy-settings', 'Copy settings', COPY_PASTE_PICTURES.copy)}${titleIconButton('paste-settings', 'Paste settings', COPY_PASTE_PICTURES.paste)}</span></div>`
  }

  function dialogTitleCss (prefix) {
    const tools = `.${prefix}tools`
    return [
      `.${prefix}version { opacity: .6; }`,
      `.${prefix}title-row { display: flex; align-items: center; gap: 12px; }`,
      `${tools} { display: flex; align-items: center; gap: 4px; }`,
      // SudokuPad styles a dialog's buttons by tag, so each of these is forced.
      `${tools} button { background: none !important; border: none !important; box-shadow: none !important; padding: 4px !important; margin: 0 !important; width: auto !important; min-width: 0 !important; height: auto !important; line-height: 0 !important; color: ${TITLE_MUTED} !important; cursor: pointer; border-radius: 6px !important; }`,
      `${tools} button:hover { background: #f0edf5 !important; }`,
      `${tools} button:focus-visible { outline: 2px solid ${FOCUS_RING} !important; outline-offset: 0; }`,
      `${tools} svg { width: 20px; height: 20px; }`,
      `${tools} svg * { fill: none !important; }`,
      // A flex item with no intrinsic width: a long message wraps in the room the title leaves and never widens the dialog.
      `.${prefix}title-row ${STATUS_SELECTOR} { flex: 1 1 0; min-width: 0; contain: inline-size; text-align: right; font-size: .8rem; color: ${TITLE_MUTED}; }`
    ].join('\n')
  }

  function addStyleOnce (id, css, doc = document) {
    if (doc.getElementById(id)) return
    const style = doc.createElement('style')
    style.id = id
    style.textContent = css
    doc.head.appendChild(style)
  }

  // SudokuPad styles a dialog's buttons by tag, so each of these is forced. Scoped by the body's id, so SudokuPad's other dialogs are left alone.
  function buttonRowCss (bodyId) {
    const row = `.dialog:has(#${bodyId}) .dialog-options`
    return [
      `${row} { display: flex !important; flex-direction: row !important; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; border-top: 1px solid #e3dff0; padding: 14px 4px 2px; margin-top: 8px; box-sizing: border-box; width: 100%; }`,
      `${row} button { background: #f1eff5 !important; color: #333 !important; border: 1px solid #cfc9db !important; border-radius: 8px !important; font-size: 1rem !important; padding: 0 22px !important; height: 38px !important; line-height: 36px !important; margin: 0 !important; width: auto !important; min-width: 0 !important; flex: none; cursor: pointer; }`,
      `${row} button[data-role="save"] { background: ${SAVE_FILL} !important; color: #fff !important; border: 1px solid #5a3489 !important; font-weight: 600; }`,
      `${row} button:hover { background: ${CONTROL_HOVER} !important; }`,
      `${row} button[data-role="save"]:hover { background: ${CONTROL_HOVER} !important; color: ${SAVE_FILL} !important; }`,
      `${row} button:active { ${PRESS_LAYER} !important; }`,
      `${row} button:focus-visible { outline: 2px solid ${FOCUS_RING}; outline-offset: 2px; }`
    ].join('\n')
  }

  const SAVE_LABEL = 'Save'
  const CANCEL_LABEL = 'Cancel'

  // Escape needs no handler here: SudokuPad's own dialog closes on it.
  // Returns the body container for the script to fill and wire, or null when SudokuPad showed no dialog (it ignores showDialog while another dialog is open).
  function showSettingsDialog (framework, { prefix, name, version, bodyId, styleId, css, centerOverBoard = true, changed, save, extraButtons = [] }, { doc = document, win = window } = {}) {
    addStyleOnce(`settings-dialog-buttons-${bodyId}`, buttonRowCss(bodyId), doc)
    if (css) addStyleOnce(styleId, css, doc)
    const close = () => closeDialogKeepingGrid(framework, win)
    // After a failed save the script's `changed()` may already read false, so a retry saves again whatever it says.
    let failed = false
    const saveAndClose = () => {
      try {
        if (failed || changed()) save()
      } catch (error) {
        failed = true
        // The dialog stays open so the failure is read and the choices are kept.
        setDialogStatus(doc.getElementById(bodyId).closest('.dialog'), `Not saved: ${errorText(error)}`)
        return
      }
      close()
    }
    const buttons = [
      { content: SAVE_LABEL, role: 'save', handler: saveAndClose },
      { content: CANCEL_LABEL, role: 'cancel', handler: close },
      ...extraButtons
    ]
    framework.showDialog({
      centerOverBoard,
      parts: [
        { tag: 'text', innerHTML: renderDialogTitle({ prefix, name, version }) },
        { tag: 'text', innerHTML: `<div id="${bodyId}"></div>` },
        { tag: 'options', options: buttons.map(({ content, handler }) => ({ tag: 'button', content, handler })) }
      ]
    })
    const body = doc.getElementById(bodyId)
    if (!body) return null
    // No selector tells the buttons apart but their text, so the shell marks each with its role for the script's stylesheet.
    const row = body.closest('.dialog')?.querySelector('.dialog-options')
    if (row) row.querySelectorAll('button').forEach((button, index) => { button.dataset.role = buttons[index].role })
    return body
  }
  /* eslint-enable no-unused-vars */
  // </lib:settings-dialog>
  const heading = (text, extra = '') => `<div class="cbd-heading">${text}${extra}</div>`
  const EDITOR_ID = 'color-by-digit-editor'
  const MENU = '#color-by-digit-menu'
  const STYLE_ID = 'color-by-digit-style'

  const MUTED = '#8a8496'
  // One chip's size in pixels, in the dialog's profile list and the profile menu, and the width of a column of three:
  // a pixel more, for the outline's stroke, which straddles the run's edge.
  const CHIP_PX = 16
  const CHIP_COLUMN_PX = CHIP_MAX_GROUPS * CHIP_PX + 1
  const ACTIVE_FILL = '#f1ebfb'
  const ACTIVE_RING = '#b79be0'
  const ACTIVE_INK = '#5b2a9a'
  const HOVER_FILL = '#f6f3f9'
  // The name field's side padding; its border is 1 px.
  const NAME_PAD = 6
  function renderProfiles (state, colorOf, selected) {
    const only = state.profiles.length <= 1
    const rows = state.profiles.map((profile, i) => {
      const chosen = i === selected
      return `<div class="cbd-profile" data-role="profile-row" data-act="select" data-index="${i}" role="radio" aria-checked="${chosen}" tabindex="${chosen ? 0 : -1}" aria-label="${escapeHtml(profile.name)}">` +
        `<span data-role="handle" data-index="${i}" title="Drag to reorder">&#8942;&#8942;</span>` +
        `<span class="cbd-chips">${renderChips(profile.groups, colorOf, { size: CHIP_PX })}</span>` +
        (chosen ? `<input type="text" data-role="profile-name" maxlength="${MAX_NAME_LENGTH}" value="${escapeHtml(profile.name)}" aria-label="Profile name">` : `<span class="cbd-name">${escapeHtml(profile.name)}</span>`) +
        `<button type="button" class="cbd-text-button" data-act="delete" data-index="${i}" aria-label="Delete profile ${escapeHtml(profile.name)}"${only ? ' disabled' : ''}>&#215;</button></div>`
    }).join('')
    const full = state.profiles.length >= MAX_PROFILES
    return heading('Profiles', `<span class="cbd-count">${state.profiles.length} of ${MAX_PROFILES}</span>`) +
      `<div role="radiogroup" aria-label="Profile to edit">${rows}</div>` +
      `<button type="button" class="cbd-text-button" data-act="new-profile"${full ? ' disabled' : ''}>+ New profile</button>`
  }

  // Dense rows: the chips in a column of one width, so the names line up, and unsynced, a Cell dot and a Digit dot.
  const MENU_ROW = 'display:flex;align-items:center;gap:8px;height:26px;padding:0 8px 0 6px;border-radius:6px'
  const MENU_DOT_COLUMN = 44
  const DOT_RING = '#cfc7da'
  const chipColumn = (groups, colorOf) =>
    `<span data-role="chip-column" style="display:flex;flex:none;width:${CHIP_COLUMN_PX}px">${renderChips(groups, colorOf, { size: CHIP_PX })}</span>`
  // A name too long for a narrow window is cut with an ellipsis, so the dots stay on screen.
  const menuName = (name) => `<span data-role="name" title="${escapeHtml(name)}" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(name)}</span>`
  const dotColumn = (role, html, align, attributes = '') => `<span data-role="${role}" style="flex:none;width:${MENU_DOT_COLUMN}px;${align}"${attributes}>${html}</span>`
  const TARGET_NAMES = { cells: 'Cell', digits: 'Digit' }

  function menuDot (target, index, picked, name) {
    const on = index === picked
    // The whole column picks, a target 44 by 26 px; the dot is only what is drawn.
    const picks = ` data-act="pick" data-target="${target}" data-index="${index}" aria-checked="${on}" role="menuitemradio" aria-label="${TARGET_NAMES[target]}: ${escapeHtml(name)}"`
    return dotColumn('dot-column', `<span style="box-sizing:border-box;width:16px;height:16px;border-radius:50%;border:2px solid ${on ? PURPLE : DOT_RING}${on ? `;background:radial-gradient(${PURPLE} 45%, transparent 50%)` : ''}"></span>`,
      'display:flex;justify-content:center;align-self:stretch;align-items:center;cursor:pointer', picks)
  }

  // Rows are not focusable, so the keyboard stays with the puzzle. Synced, a row picks its profile; unsynced, its two dots pick
  // the cell profile and the digit profile, and the row itself picks nothing.
  function renderMenu (state, colorOf) {
    const split = usesDigitColors(state) && !isSynced(state)
    const head = split
      ? `<div style="${MENU_ROW};height:auto;padding-bottom:2px"><span style="flex:1"></span>` +
        Object.values(TARGET_NAMES).map((word) => dotColumn('column-head', word, `text-align:center;font:600 11px/1 sans-serif;color:${MUTED}`)).join('') + '</div>'
      : ''
    const rows = state.profiles.map((profile, i) => {
      const cells = chipColumn(profile.groups, colorOf) + menuName(profile.name)
      const picked = { cells: state.active, digits: state.digitActive }
      if (split) return `<div data-role="menu-row" style="${MENU_ROW}">${cells}${Object.keys(TARGET_NAMES).map((target) => menuDot(target, i, picked[target], profile.name)).join('')}</div>`
      const active = i === state.active
      return `<div data-role="menu-row" data-act="pick" data-target="cells" data-index="${i}" aria-checked="${active}" style="${MENU_ROW};cursor:pointer` +
        `${active ? `;background:${ACTIVE_FILL};color:${ACTIVE_INK};font-weight:600` : ''}" role="menuitemradio">${cells}</div>`
    }).join('')
    return `${head}${rows}` +
      '<div style="height:1px;background:#ece8f2;margin:4px"></div>' +
      '<div role="menuitem" data-act="edit" style="padding:4px 6px;border-radius:6px;cursor:pointer;font-size:13px;color:#5d5868">&#9881; Edit profiles…</div>'
  }

  const optionHtml = (value, label, selected, index) =>
    `<option value="${value}"${index === undefined ? '' : ` data-index="${index}"`}${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`

  function renderPulldowns (state, mode) {
    const shownMode = allowedMode(mode, usesDigitColors(state))
    const digit = digitChoice(state)
    const named = (picked) => state.profiles.map((p, i) => optionHtml(i, p.name, picked === String(i), i)).join('')
    const pulldown = (role, label, options) => `<label class="cbd-pulldown"><span>${label}</span><select data-role="${role}">${options}</select></label>`
    return '<div class="cbd-pulldowns">' +
      pulldown('mode-draft', 'Mode', modesFor(usesDigitColors(state)).map((m) => optionHtml(m, MODE_NAMES[m], m === shownMode)).join('')) +
      pulldown('cell-profile', 'Cell', named(String(state.active))) +
      pulldown('digit-profile', 'Digit', optionHtml('same', 'Same as cell', digit === 'same') + named(digit) + optionHtml('none', 'None', digit === 'none')) +
      '</div>'
  }

  // Matched as text, not by a selector, since a custom palette's key may hold a quote.
  const swatchWithKey = (root, key) => [...root.querySelectorAll('button[data-role="swatch"]')].find((swatch) => swatch.dataset.key === key)

  function renderEditor ({ groups, pages, page, brush, pulldownsHtml = '', profilesHtml = '', unreadable = false }) {
    const colors = layoutColors(pages)
    const shown = pages[page] || pages[0]
    const clear = '<button type="button" class="cbd-button" data-act="clear">Clear all</button>'
    const paint = colors.length === 0
      ? '<div class="cbd-note">No palette colors found: digits cannot be painted.</div>' + renderPad(groups, colors)
      : renderPaint(groups, pages, shown, brush, colors)
    const kept = unreadable ? `<div class="cbd-note" data-role="unreadable">Profiles saved earlier could not be read; they are kept under ${PROFILES_KEY}${UNREADABLE_SUFFIX}.</div>` : ''
    return `${kept}${pulldownsHtml}` +
      `<div class="cbd-columns cbd-divider"><div class="cbd-column">${profilesHtml}</div>` +
      `<div class="cbd-column">${heading('Digits', clear)}${paint}</div></div>`
  }

  // One stylesheet, every rule scoped to the editor, the dialog itself (its width), or the dialog's options row.
  // SudokuPad's own rules for the dialog's selects, buttons and labels size them otherwise; the editor's id inside each `:has` outranks those rules, so none needs !important.
  const EDITOR = `#${EDITOR_ID}`
  const DIALOG = `.dialog:has(${EDITOR})`
  const STYLE_CSS = [
    [`${EDITOR} .cbd-heading`, 'display: flex; align-items: center; justify-content: space-between; font-weight: 600; margin: 0 0 6px'],
    [`${EDITOR} .cbd-count`, 'font-weight: 400; font-size: .8rem; color: #666'],
    [DIALOG, `width: ${DIALOG_WIDTH}px; max-width: calc(100vw - 16px); box-sizing: border-box`],
    [`${EDITOR} .cbd-divider`, `border-top: 1px solid ${RULE_COLOR}; margin: 12px 0 0; padding-top: 10px`],
    [`${EDITOR} .cbd-note`, 'margin: 6px 0'],
    [`${EDITOR} .cbd-pulldowns`, 'display: grid; gap: 8px; margin: 0 0 10px'],
    [`${EDITOR} .cbd-pulldown`, `display: grid; grid-template-columns: ${PULLDOWN_LABEL_WIDTH}px minmax(0, 1fr); align-items: center; gap: 12px; min-width: 0; margin: 0; padding: 0; font-weight: 600; text-align: left`],
    [`${EDITOR} .cbd-columns`, `display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(${COLUMN_MIN}px, 1fr))`],
    [`${EDITOR} .cbd-column`, 'min-width: 0'],
    [`${EDITOR} .cbd-button`, 'background: #f1eff5; color: #333; border: 1px solid #cfc9db; border-radius: 8px; font-size: .9rem; font-weight: 500; padding: 0 14px; height: 34px; line-height: 32px; margin: 0; cursor: pointer'],
    [`${EDITOR} .cbd-pulldown select`, `font-size: .95rem; padding: 4px 28px 4px 10px; border: 1px solid #b9b0c9; border-radius: 6px; background: #fff ${CHOICE_ARROW} no-repeat right 10px center; appearance: none; color: #222`],
    [EDITOR, 'user-select: none; -webkit-user-select: none'],
    // The pad's columns: three digit keys; the 0 key sits under 7.
    [`${EDITOR} [data-role="paint"]`, `display: grid; gap: ${SWATCH_GAP_PX}px; grid-template-columns: repeat(${PAGE_COLUMNS}, ${KEY_SIZE}); touch-action: none`],
    [`${EDITOR} [data-act="digit"]`, `box-sizing: border-box; display: block; width: ${KEY_SIZE}; height: ${KEY_SIZE}; margin: 0; padding: 0; border-radius: 0; border: 1px solid #000; background: #fff; color: #999; font-size: 1rem; font-weight: 700; cursor: pointer`],
    [`${EDITOR} [data-act="digit"]:not([data-key=""])`, `color: ${ENTERED_DIGIT_BLUE}`],
    [`${EDITOR} .cbd-unset`, 'border-style: dashed'],
    [`${EDITOR} [role="radiogroup"]`, 'display: flex; flex-direction: column; gap: 2px'],
    [`${EDITOR} .cbd-profile`, 'cursor: pointer; display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 4px; border-radius: 6px'],
    [`${EDITOR} .cbd-profile:hover`, `background: ${HOVER_FILL}`],
    [`${EDITOR} .cbd-profile[aria-checked="true"]`, `background: ${ACTIVE_FILL}`],
    // Hidden, not removed, so every row keeps its layout.
    [`${EDITOR} .cbd-profile [data-role="handle"], ${EDITOR} .cbd-profile [data-act="delete"]`, 'visibility: hidden'],
    [`${EDITOR} .cbd-profile:hover [data-role="handle"], ${EDITOR} .cbd-profile:hover [data-act="delete"], ${EDITOR} .cbd-profile[aria-checked="true"] [data-role="handle"], ${EDITOR} .cbd-profile[aria-checked="true"] [data-act="delete"]`, 'visibility: visible'],
    [`${EDITOR} [data-role="handle"]`, `cursor: grab; touch-action: none; user-select: none; color: ${MUTED}; font-size: 18px; line-height: 1`],
    // One width for every run, so the names line up.
    [`${EDITOR} .cbd-chips`, `display: flex; flex: none; width: ${CHIP_COLUMN_PX}px`],
    // Its left padding is the name field's padding and border, so a name starts where the selected row's does.
    [`${EDITOR} .cbd-name`, `flex: 1; min-width: 0; padding-left: ${NAME_PAD + 1}px; overflow-wrap: anywhere; text-align: left; font-size: .9rem; font-weight: 400`],
    [`${EDITOR} .cbd-text-button`, `background: none; border: none; box-shadow: none; color: ${MUTED}; font-size: .9rem; font-weight: 500; padding: 2px 6px; margin: 0; width: auto; min-width: 0; height: auto; line-height: 1.4; border-radius: 6px; cursor: pointer`],
    [`${EDITOR} .cbd-text-button:hover:not(:disabled)`, `background: ${HOVER_FILL}; color: #222`],
    [`${EDITOR} .cbd-text-button:disabled`, 'opacity: .4; cursor: default'],
    [`${EDITOR} [data-act="delete"]`, 'flex: none; font-size: 1.1rem; line-height: 1'],
    [`${EDITOR} [data-act="new-profile"]`, 'margin: 4px 0'],
    // Looks like the row's name until focused: no border or fill, then the box shows.
    [`${EDITOR} [data-role="profile-name"]`, `box-sizing: border-box; flex: 1; width: auto; min-width: 0; padding: 4px ${NAME_PAD}px; margin: 0; font-size: .9rem; font-weight: 600; background: transparent; border: 1px solid transparent; border-radius: 6px; box-shadow: none; color: inherit; user-select: text; -webkit-user-select: text`],
    [`${EDITOR} [data-role="profile-name"]:focus`, `background: #fff; border-color: ${ACTIVE_RING}; outline: none`],
    [`${EDITOR} .cbd-profile [data-role="handle"]`, 'flex: none; margin-right: -2px'],
    // SudokuPad's `button:focus { outline: none }` hides the browser's ring, so the dialog draws its own, for the keyboard only.
    [`${EDITOR} button:focus-visible, ${EDITOR} [data-role="swatch"]:focus-visible, ${EDITOR} .cbd-profile:focus-visible`, `outline: 2px solid ${FOCUS_RING}; outline-offset: 2px`],
    // The pressed swatch's own outline takes the property, so its focus ring is drawn beside it.
    [`${EDITOR} [data-role="swatch"][aria-pressed="true"]`, 'position: relative'],
    [`${EDITOR} [data-role="swatch"][aria-pressed="true"]:focus-visible`, 'outline: 3px solid #000; outline-offset: 0'],
    [`${EDITOR} [data-role="swatch"][aria-pressed="true"]:focus-visible::after`, `content: ''; position: absolute; inset: -7px; border: 2px solid ${FOCUS_RING}; border-radius: 9px; pointer-events: none`],
    [`${EDITOR} .cbd-button:hover`, `background: ${CONTROL_HOVER}`],
    [`${EDITOR} [data-act="digit"]:not([style]):hover`, `background: ${CONTROL_HOVER}`],
    [`${EDITOR} [data-act="digit"]:hover`, `box-shadow: inset 0 0 0 2px ${PURPLE}`],
    [`${EDITOR} [data-role="swatch"]:not([data-empty]):hover`, `box-shadow: 0 0 0 2px ${PURPLE}`],
    [`${EDITOR} .cbd-button:active, ${EDITOR} [data-act="digit"]:active, ${EDITOR} [data-role="swatch"]:not([data-empty]):active`, PRESS_LAYER],
    // At least 24 px each way (WCAG 2.2 SC 2.5.8).
    [`${EDITOR} [data-act="delete"], ${EDITOR} [data-role="handle"]`, `display: inline-flex; align-items: center; justify-content: center; min-width: ${MIN_TARGET_PX}px; min-height: ${MIN_TARGET_PX}px; box-sizing: border-box`],
    // The handle holds the pointer capture, so its cursor shows wherever the pointer goes; every element has its own, so it is forced.
    [`${EDITOR}.cbd-dragging *`, 'cursor: grabbing !important']
  ].map(([selector, declarations]) => `${selector} {\n  ${declarations.split('; ').join(';\n  ')};\n}`).join('\n') + '\n' + colorBlockCss(CLASS_PREFIX, EDITOR)

  // <lib:settings-transfer>
  // Generated from lib/settings-transfer.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  /* global setDialogStatus, errorText */ // from settings-dialog.js, which every script carries beside this one
  // A reader returns the value to save, or undefined for one it refuses. Keys of other scripts are ignored, not counted: only a value of the script's own that its reader refuses is skipped. `upgrade` rewrites the parsed object first, for text copied by an older version.
  function pastedSettings (text, readers, upgrade = (data) => data) {
    let data
    try {
      data = JSON.parse(text)
    } catch (error) {
      throw new Error('the clipboard text is not JSON', { cause: error })
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('the clipboard text is not a settings object')
    data = upgrade(data)
    const values = {}
    let skipped = 0
    for (const [key, read] of Object.entries(readers)) {
      if (!Object.hasOwn(data, key)) continue
      const value = read(data[key])
      if (value === undefined) skipped++
      else values[key] = value
    }
    return { values, skipped }
  }

  function pasteReport (applied, skipped) {
    if (applied === 0 && skipped === 0) return 'Nothing to paste: the text holds none of this script\'s settings.'
    return `Pasted ${applied} setting${applied === 1 ? '' : 's'}${skipped ? `; skipped ${skipped} that did not check out` : ''}.`
  }

  // Wires the title row's Copy settings and Paste settings icons: `copied()` is the text to copy, `apply(values)` takes what a paste kept; `readers` and `upgrade` are `pastedSettings`'.
  function wireCopyPaste (root, { copied, readers, upgrade }, apply) {
    const say = (message) => setDialogStatus(root, message)
    root.addEventListener('click', async (event) => {
      const act = event.target.closest('button[data-act]')?.dataset.act
      if (act !== 'copy-settings' && act !== 'paste-settings') return
      event.preventDefault()
      event.stopPropagation()
      try {
        if (act === 'copy-settings') {
          await navigator.clipboard.writeText(copied())
          say('Settings copied.')
        } else {
          const { values, skipped } = pastedSettings(await navigator.clipboard.readText(), readers, upgrade)
          if (Object.keys(values).length > 0) apply(values)
          say(pasteReport(Object.keys(values).length, skipped))
        }
      } catch (error) {
        say(`Could not ${act === 'copy-settings' ? 'copy' : 'paste'}: ${errorText(error)}`)
      }
    })
  }
  /* eslint-enable no-unused-vars */
  // </lib:settings-transfer>
  // <lib:plain>
  // Generated from lib/plain.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  const rem = (value) => Math.round(value * 100) / 100
  /* eslint-enable no-unused-vars */
  // </lib:plain>
  // <lib:store>
  // Generated from lib/store.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // Reads isPlainObject from plain.
  /* global isPlainObject */
  // A saved value is `{ v, data }`, so a later change to its shape has a version to migrate from; a value saved before the envelope is
  // version 0, and so is every shape saved so far. A version above this one was saved by a later script, and is unreadable here.
  const STORE_VERSION = 0
  const UNREADABLE_SUFFIX = '_unreadable'

  const isEnvelope = (raw) => isPlainObject(raw) && Number.isInteger(raw.v) && Object.hasOwn(raw, 'data') && Object.keys(raw).length === 2

  // The first free slot, `<key>_unreadable`, then `<key>_unreadable2` and on, or the one already holding `raw`: no kept copy is ever replaced.
  function keptSlot (store, key, raw) {
    const same = JSON.stringify(raw)
    for (let n = 1; ; n++) {
      const slot = key + UNREADABLE_SUFFIX + (n === 1 ? '' : n)
      const held = store.getData(slot)
      if (held === null || JSON.stringify(held) === same) return { slot, copied: held === null }
    }
  }

  function readSaved (raw, read) {
    if (isEnvelope(raw) && raw.v > STORE_VERSION) throw new Error(`it was saved by a later version (version ${raw.v})`)
    const value = read(isEnvelope(raw) ? raw.data : raw)
    if (value === undefined) throw new Error('its reader refused it')
    return value
  }

  // `read` returns the value, or undefined for one it refuses, as a paste reader does. A value that cannot be read is copied aside before
  // anything can save over it.
  function load (store, { key, read }) {
    const raw = store.getData(key)
    if (raw === null) return { value: undefined }
    try {
      return { value: readSaved(raw, read) }
    } catch (error) {
      const unreadable = error.message || String(error) || 'its reader threw'
      const { slot, copied } = keptSlot(store, key, raw)
      if (copied) {
        store.setData(slot, raw)
        console.warn(`${key}: the saved value could not be read (${unreadable}); it is kept under ${slot}`)
      }
      return { value: undefined, unreadable }
    }
  }

  const hasUnreadable = (store, key) => store.getData(key + UNREADABLE_SUFFIX) !== null

  // A puzzle's saved data is keyed by its id; one with none of its own (a replay or a pack) is told apart by its page URL.
  const puzzleKey = (puzzleId, href) => String(puzzleId || href)

  function save (store, key, data) {
    store.setData(key, { v: STORE_VERSION, data })
  }
  /* eslint-enable no-unused-vars */
  // </lib:store>
  // <lib:pointer-session>
  // Generated from lib/pointer-session.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // One press, from after its `pointerdown` to its release: `move` hears each `pointermove` and `end` the `pointerup` or `pointercancel`.
  // The session listens in the capture phase, so a page handler that stops a release cannot leave it listening, and it is gone before
  // `end` runs. The returned stop ends it with no `end`.
  const PRESS_END_EVENTS = ['pointerup', 'pointercancel']
  // The object form: Node's EventTarget, which the tests use, keeps a listener removed with a bare `true`.
  const CAPTURE = { capture: true }

  function trackPointer (target, { move, end = () => {} }) {
    const finish = (event) => {
      stop()
      end(event)
    }
    const stop = () => {
      target.removeEventListener('pointermove', move, CAPTURE)
      PRESS_END_EVENTS.forEach((type) => target.removeEventListener(type, finish, CAPTURE))
    }
    target.addEventListener('pointermove', move, CAPTURE)
    PRESS_END_EVENTS.forEach((type) => target.addEventListener(type, finish, CAPTURE))
    return stop
  }
  /* eslint-enable no-unused-vars */
  // </lib:pointer-session>
  // <lib:sudokupad>
  // Generated from lib/sudokupad.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // A script's features, each with the SudokuPad internals it needs: one that lacks an internal, or whose own code throws, turns off
  // alone, and a bar at the bottom of the page says so once per SudokuPad version.
  const NOTICE_HOST_ID = 'sudokupad-scripts-notices'
  // Every script's bar is the one purple, Pen Tool Extras' and the site's --accent.
  const NOTICE_COLOR = '#6a1b9a'
  const REPORT_URL = 'https://github.com/caneff/sudokupad-scripts/issues/new'
  // The page's assets carry SudokuPad's version as `?v=` (docs/research/sudokupad-version-signal.md); live/cache.mjs reads it the same way.
  const PAGE_VERSION = /\?v=(\d+(?:\.\d+)+)/
  const INTERNAL_KINDS = {
    function: (value) => typeof value === 'function',
    array: Array.isArray,
    integer: Number.isInteger,
    number: (value) => typeof value === 'number',
    object: (value) => Boolean(value) && typeof value === 'object'
  }

  // A path's first part names a root (`Framework`, `ToolPen`): SudokuPad declares them with `const`, so they are not on `window`.
  function readInternal (roots, path) {
    const [root, ...keys] = path.split('.')
    return keys.reduce((owner, key) => (owner === undefined || owner === null ? undefined : owner[key]), roots[root])
  }

  // Each internal lacking, with the features it holds off; a feature is listed under the first of its `needs` it lacks.
  function lackingInternals (features, roots) {
    const lacking = new Map()
    Object.entries(features).forEach(([name, { needs }]) => {
      const missing = Object.entries(needs).find(([path, kind]) => !INTERNAL_KINDS[kind](readInternal(roots, path)))
      if (missing) lacking.set(missing[0], [...(lacking.get(missing[0]) || []), name])
    })
    return lacking
  }

  function sudokupadVersion (doc) {
    const found = PAGE_VERSION.exec(doc.documentElement.outerHTML)
    return found ? found[1] : null
  }

  // `off` holds each feature's label and why it is off: the internal it lacks, or the error its own code threw.
  function reportUrl ({ name, version, sudokupad, off }) {
    const shownVersion = sudokupad || 'unknown'
    const labels = off.map((feature) => feature.label).join(', ')
    const body = [
      `Script: ${name} ${version}`,
      `SudokuPad version: ${shownVersion}`,
      '',
      ...off.map(({ label, why }) => `- ${label}: ${typeof why === 'string' ? `SudokuPad has no ${why}` : String(why)}`)
    ].join('\n')
    return `${REPORT_URL}?${new URLSearchParams({ title: `${name}: ${labels} off on SudokuPad ${shownVersion}`, body })}`
  }

  const NOTICE_HOST_CSS = 'position: fixed; left: 50%; bottom: 8px; transform: translateX(-50%); z-index: 10000; display: flex; flex-direction: column; gap: 4px; align-items: center;'
  const NOTICE_BAR_CSS = `display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 14px; border-radius: 6px; background: ${NOTICE_COLOR}; color: #fff; font: 14px/1.3 sans-serif; box-shadow: 0 2px 6px rgba(0, 0, 0, .3);`
  const NOTICE_LINK_CSS = 'color: #fff; font-weight: bold; text-decoration: underline;'
  const NOTICE_DISMISS_CSS = 'background: none; border: none; color: #fff; font-size: 18px; line-height: 1; padding: 0 4px; cursor: pointer;'

  // `features` maps a name to `{ label, needs, onSkip }`: `label` is what the bar and the console call it, `needs` maps each internal's
  // path to its kind (a key of INTERNAL_KINDS), and `onSkip` undoes what the feature left on the page. `probe` runs once SudokuPad's app
  // exists; `store` is SudokuPad's Framework, whose saved data remembers a dismissal under `<script>-notice`.
  function createGuard ({ script, name, version, features }) {
    const reasons = []
    let page = null

    const dismissKey = `${script}-notice`
    // A dismissal is saved only under a SudokuPad version read from the page: one saved with none would match every later version that
    // also has none. A store with no getData or setData (a SudokuPad that changed), or one that throws (a frame with storage blocked),
    // cannot save one either. Without a save, a dismissal holds for this page load only.
    const dismissedHere = []
    let storeFailed = false
    const savesDismissals = () => !storeFailed && page.sudokupad !== null && typeof page.store.getData === 'function' && typeof page.store.setData === 'function'
    function useStore (fn) {
      try {
        return fn()
      } catch (error) {
        storeFailed = true
        console.warn(`${script}: a dismissal of the notice bar cannot be saved, so it holds for this page load only:`, error)
        return null
      }
    }
    const dismissed = () => {
      const saved = savesDismissals() ? useStore(() => page.store.getData(dismissKey)) : null
      return [...(saved && saved.version === page.sudokupad && Array.isArray(saved.features) ? saved.features : []), ...dismissedHere]
    }

    let bar = null
    function showNotice () {
      if (bar) bar.remove()
      bar = null
      const gone = dismissed()
      const shown = reasons.filter((reason) => !gone.includes(reason.name))
      if (shown.length === 0 || !page.doc.body) return
      const { doc } = page
      let host = doc.getElementById(NOTICE_HOST_ID)
      if (!host) {
        host = doc.createElement('div')
        host.id = NOTICE_HOST_ID
        host.style.cssText = NOTICE_HOST_CSS
        doc.body.append(host)
      }
      bar = doc.createElement('div')
      bar.setAttribute('data-script', script)
      bar.style.cssText = NOTICE_BAR_CSS
      const text = doc.createElement('span')
      text.textContent = `${name}: ${shown.map((reason) => reason.label).join(', ')} ${shown.length === 1 ? 'is' : 'are'} off — SudokuPad changed.`
      const link = doc.createElement('a')
      link.href = reportUrl({ name, version, sudokupad: page.sudokupad, off: shown })
      link.target = '_blank'
      link.rel = 'noopener'
      link.textContent = 'Report'
      link.style.cssText = NOTICE_LINK_CSS
      const dismiss = doc.createElement('button')
      dismiss.type = 'button'
      dismiss.textContent = '×'
      dismiss.title = 'Dismiss'
      dismiss.setAttribute('aria-label', 'Dismiss')
      dismiss.style.cssText = NOTICE_DISMISS_CSS
      dismiss.addEventListener('click', () => {
        dismissedHere.push(...shown.map((reason) => reason.name))
        if (savesDismissals()) useStore(() => page.store.setData(dismissKey, { version: page.sudokupad, features: dismissed() }))
        showNotice()
      })
      bar.append(text, link, dismiss)
      host.append(bar)
    }

    // A feature stays off once skipped, so its error is warned once and not on every event. `skip(why, false)` is for one never installed.
    function createFeature (featureName, { label, onSkip }) {
      const feature = {
        off: false,
        skip (why, installed = true) {
          if (feature.off) return
          feature.off = true
          reasons.push({ name: featureName, label, why })
          if (installed) {
            console.warn(`${script}: ${label} skipped because SudokuPad changed:`, why)
            try {
              if (onSkip) onSkip()
            } catch (error) {
              // Best effort: the feature is off already, and what it left behind stays until the page reloads.
              console.warn(`${script}: could not undo ${label}:`, error)
            }
          }
          if (page) showNotice()
        },
        run (fn, fallback = () => {}) {
          if (feature.off) return fallback()
          try {
            return fn()
          } catch (error) {
            feature.skip(error)
            return fallback()
          }
        },
        // SudokuPad's code runs only through `stock` or `stock.sudokupad`, so a throw from it passes through as SudokuPad's own. After the
        // body's own throw, the original runs only if nothing was sent for this event: a click half sent must not be sent again. A call
        // that sends nothing (`stock.sudokupad(fn, false)`) leaves the original to run.
        wrap (owner, method, body) {
          const original = owner[method]
          owner[method] = function (...args) {
            if (feature.off) return original.apply(this, args)
            let reached = false
            let result
            let failure = null
            const sudokupad = (fn, sends = true) => {
              if (sends) reached = true
              try {
                return fn()
              } catch (error) {
                failure = { error }
                throw error
              }
            }
            const stock = (...stockArgs) => sudokupad(() => { result = original.apply(this, stockArgs); return result })
            stock.sudokupad = sudokupad
            try {
              return body.call(this, stock, ...args)
            } catch (error) {
              if (failure && failure.error === error) throw error
              feature.skip(error)
              return reached ? result : original.apply(this, args)
            }
          }
        }
      }
      return feature
    }

    const guarded = Object.fromEntries(Object.entries(features).map(([featureName, declared]) => [featureName, createFeature(featureName, declared)]))

    function probe ({ roots, store, doc = document }) {
      lackingInternals(features, roots).forEach((names, missing) => {
        names.forEach((featureName) => guarded[featureName].skip(missing, false))
        console.warn(`${script}: ${names.map((featureName) => features[featureName].label).join(', ')} skipped because SudokuPad has no ${missing}`)
      })
      page = { store, doc, sudokupad: sudokupadVersion(doc) }
      showNotice()
    }

    return { features: guarded, get off () { return reasons.map((reason) => reason.label) }, probe }
  }
  /* eslint-enable no-unused-vars */
  // </lib:sudokupad>
  // Each feature with the SudokuPad internals it cannot work without. A path's first part is a root of `guard.probe`: `Framework`, or `app`, which is
  // what `Framework.getApp` resolves to. Not declared, because a check at startup cannot tell them from "not there yet": the cells of a puzzle not loaded
  // (`app.puzzle.cells` is an empty array until then), and the methods on each cell, which the cell coloring's own `run` covers.
  const FEATURES = {
    // Without these the script starts from its preloads and keeps nothing: the mode steps in memory until the page reloads, and the editor is off too.
    saved: { label: 'saved settings', needs: { 'Framework.getData': 'function', 'Framework.setData': 'function' } },
    cells: {
      label: 'cell coloring',
      needs: {
        'Framework.getApp': 'function',
        'app.act': 'function',
        'app.select': 'function',
        'app.deselect': 'function',
        'app.on': 'function',
        'app.puzzle.cells': 'array',
        'app.puzzle.selectedCells': 'array',
        'app.puzzle.undoStack': 'array',
        'app.puzzle.redoStack': 'array'
      }
    },
    button: {
      label: 'mode button',
      needs: { 'Framework.getApp': 'function', 'Framework.addControlButton': 'function', 'app.refreshControls': 'function' },
      onSkip () {
        closeMenu()
        const button = document.querySelector(BUTTON)
        if (button) button.remove()
      }
    },
    editor: {
      label: 'editor',
      needs: { 'Framework.getData': 'function', 'Framework.setData': 'function', 'Framework.addSetting': 'function', 'Framework.showDialog': 'function', 'Framework.closeDialog': 'function', 'Framework.app.tools.colour': 'object' },
      onSkip () {
        Framework.closeDialog()
      }
    },
    // Only the page's own markup is read and styled, so there is no internal to name; a throw from a changed page still turns it off.
    digits: {
      label: 'digit colors',
      needs: {},
      onSkip () {
        const style = document.getElementById(DIGIT_STYLE_ID)
        if (style) style.remove()
        const circles = document.getElementById(CIRCLES_ID)
        if (circles) circles.remove()
        document.querySelectorAll(`[${DIGIT_ATTR}]`).forEach((el) => el.removeAttribute(DIGIT_ATTR))
      }
    },
    // The mode button's icon, the digit shades and the cell colors wait for the puzzle's progress, which resets the board, to load.
    // Without it they are drawn at once, before the puzzle's own palette is in force.
    loading: {
      label: 'redraw after the puzzle loads',
      needs: { 'Framework.getApp': 'function', 'app.puzzle.cells': 'array', 'app.puzzle.addEventListener': 'function' }
    }
  }
  const BUTTON = '#control-colorbydigit'
  const ARROW = `${BUTTON} [data-role="menu"]`
  const PRESSED_CLASS = 'cbd-pressed'
  const DRAGGING_CLASS = 'cbd-dragging'
  // The digit grid and the swatch grid; a slot that is no button is an empty cell of the layout.
  const PAINT_GRIDS = '[data-role="paint"], .cbd-swatches'
  const FOCUSABLE_SLOT = 'button'
  // The pressed look is a class, set on pointerdown: the button's `mousedown` is cancelled, and an engine may then drop `:active`.
  // The arrow's ::after widens its 14 px box to 24 px, outward over the button's corner (WCAG 2.2 SC 2.5.8).
  const BUTTON_CSS = [
    `${BUTTON}.${PRESSED_CLASS} { ${PRESS_LAYER} !important; }`,
    `${ARROW}::after { content: ''; position: absolute; inset: -${(MIN_TARGET_PX - ARROW_BOX_PX) / 2}px; }`
  ].join('\n')
  const BUTTON_STYLE_ID = 'color-by-digit-button'
  const guard = createGuard({ script: 'color-by-digit', name: 'Color by Digit', version: VERSION, features: FEATURES })
  const { saved: storage, cells: coloring, button: modeButton, editor, digits: digitColors, loading } = guard.features
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, createModeHistory, openingDraft, reduceDraft, READERS, withModeFromAuto, buttonLabel, parseColor, darkenColor, buildDigitCss, digitOfText, circleFor, inkMiddle, CIRCLE_CSS, DIGIT_ATTR, copiedSettings, pastedSettings, pasteReport, installButton, lackingInternals, FEATURES, BOTTOM_ROW_CSS, iconHtml, nextMode, startingMode, planClear, colorSteps, planColoring, planCellColors, planSwitch, groupKeys, isEntryAction, entrySignature, changedIndices, readCentreMarks, toPlanCell, setDigitColor, strokeKey, paintDigit, canonicalGroups, startingBrush, rowAfterKey, gridTarget, BUTTON_CSS, normalizeGroups, stateFromStored, saveProfiles, withAddedPreloads, copyProfile, renameProfile, deleteProfile, moveProfile, indexAfterDelete, indexAfterMove, setActive, setProfileGroups, activeGroups, digitGroups, isSynced, usesDigitColors, setSync, setDigitActive, setUseDigitColors, digitChoice, chooseDigit, allowedMode, dropIndex, isVisibleColor, layoutPages, layoutColors, initialPage, renderEditor, swatchWithKey, renderPulldowns, renderProfiles, renderMenu, renderChips, shownChips, STYLE_CSS, PRELOADS, MAX_PROFILES, MAX_NAME_LENGTH }
  }
  // The match also covers other crackingthecryptic.com pages, which have no Framework.
  if (typeof Framework === 'undefined') return

  // The saved data is read and written only here: with no getData or setData nothing is read, so the preloads and the starting mode show, and nothing is kept.
  const readData = (key) => storage.run(() => Framework.getData(key), () => null)
  const writeData = (key, value) => storage.run(() => Framework.setData(key, value))
  // What the shared store reads and writes through: the saved settings feature's guarded calls, never Framework itself.
  const savedData = { getData: readData, setData: writeData }
  // What the settings entry and the editor are handed in place of Framework: the editor's close runs under the editor when a button is pressed.
  const dialogs = {
    addSetting: (setting) => Framework.addSetting(setting),
    showDialog: (options) => Framework.showDialog(options),
    closeDialog: () => editor.run(() => Framework.closeDialog())
  }

  function readPages () {
    const tool = readyColorTool()
    return tool ? layoutPages(tool.palette.pages, tool.currentPage, readColor) : []
  }

  const saveState = (state) => saveProfiles(savedData, state)
  const loadState = () => stateFromStored(savedData)

  function addPreloadsOnce () {
    for (const { key, names } of ADDED_PRELOADS) {
      if (readData(key) === true) continue
      const state = loadState()
      const added = withAddedPreloads(state, names)
      if (added.profiles.length !== state.profiles.length) saveState(added)
      writeData(key, true)
    }
  }
  const loadGroups = () => activeGroups(loadState())

  // A key with no visible color reads as ''.
  function readColor (key) {
    const resolved = readCellColor(key)
    return isVisibleColor(resolved) ? resolved : ''
  }

  const allCells = (app) => [].concat(app.puzzle.cells).flat(Infinity)

  // SudokuPad undoes everything between groupstart and groupend in one step.
  function inOneUndoStep (app, fn) {
    app.act({ type: 'groupstart' })
    try {
      return fn()
    } finally {
      app.act({ type: 'groupend' })
    }
  }

  // SudokuPad's color tool toggles: it adds the key where every selected cell lacks it and removes it
  // where every cell holds it; colorSteps only ever adds a key to cells that all lack it.
  function runColorOps (app, cells, ops) {
    const savedSelection = [...app.puzzle.selectedCells]
    try {
      colorSteps(cells, ops).forEach(({ type, arg, indices }) => {
        app.deselect()
        app.select(indices.map((i) => cells[i]))
        app.act({ type, arg })
      })
    } finally {
      app.deselect()
      if (savedSelection.length > 0) app.select(savedSelection)
    }
  }

  // Planned a second time after the first ops: with Multi-color off a cell holds one color, so putting back a
  // cell's other colors can take off the group color planned as already there, which must go back on.
  function recolor (app, makeOps) {
    coloring.run(() => {
      const first = allCells(app)
      const ops = makeOps(first.map(toPlanCell))
      if (ops.length === 0) return
      const run = () => {
        runColorOps(app, first, ops)
        const second = allCells(app)
        runColorOps(app, second, makeOps(second.map(toPlanCell)))
      }
      if (app.puzzle.inGroup) run()
      else inOneUndoStep(app, run)
    })
  }

  const colorEnteredCells = (app) => recolor(app, (plans) => planCellColors(plans, loadGroups(), enteredIndices(plans)))

  // The mode steps that left an undo step, each `at` the undo stack's length after it, so Undo and Redo can move the mode along.
  function createModeHistory () {
    const done = []
    let undone = []
    let beforeRestart = null
    return {
      record (at, from, to) {
        done.push({ at, from, to })
        undone = []
      },
      // The mode before the earliest step an Undo down to `stackLength` took back.
      undo (stackLength) {
        const first = done.findIndex((step) => step.at > stackLength)
        if (first < 0) return undefined
        const taken = done.splice(first)
        undone.push(...taken.reverse())
        return taken[taken.length - 1].from
      },
      // The mode after the latest step a Redo up to `stackLength` put back.
      redo (stackLength) {
        const put = []
        while (undone.length > 0 && undone[undone.length - 1].at <= stackLength) put.push(undone.pop())
        if (put.length === 0) return undefined
        done.push(...put)
        return put[put.length - 1].to
      },
      forgetRedo () { undone = [] },
      // A Restart empties the undo stack, but SudokuPad's next Undo on the empty stack brings back the board from before it, stack included.
      restart () {
        if (done.length > 0 || undone.length > 0) beforeRestart = { done: [...done], undone }
        done.length = 0
        undone = []
      },
      restoreBeforeRestart () {
        if (!beforeRestart) return
        done.splice(0, done.length, ...beforeRestart.done)
        undone = beforeRestart.undone
        beforeRestart = null
      }
    }
  }

  let mode = 'off'

  // Loading progress resets the board, so a pass before it would be wiped.
  // With the wait off there is nothing to wait for, so `fn` runs at once.
  function whenProgressLoaded (app, fn) {
    if (loading.run(() => allCells(app).length > 0, () => true)) fn()
    else loading.run(() => app.puzzle.addEventListener('progressloaded', fn, { once: true }), fn)
  }

  const DIGIT_STYLE_ID = 'color-by-digit-digits'
  const SVG_NS = 'http://www.w3.org/2000/svg'

  // An entered digit's text element has no digit attribute; marks have `data-val`.
  function stampEnteredDigits () {
    document.querySelectorAll('#cell-values .cell-value').forEach((el) => {
      const digit = digitOfText(el.textContent)
      if (digit === null) el.removeAttribute(DIGIT_ATTR)
      else if (el.getAttribute(DIGIT_ATTR) !== digit) el.setAttribute(DIGIT_ATTR, digit)
    })
  }

  let measuring = null

  // SudokuPad sizes its fonts in the board's units, which a canvas takes as pixels.
  function measureInk (mark) {
    if (!measuring) measuring = document.createElement('canvas').getContext('2d')
    const style = window.getComputedStyle(mark)
    measuring.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const m = measuring.measureText(mark.textContent)
    return { left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent, fontAscent: m.fontBoundingBoxAscent }
  }

  // The ink is centred, not the advance box or the `dominant-baseline: middle` point, which sit off
  // the digit's shape. A corner mark carries a CSS translate its attributes omit, so the point goes
  // through the `text`'s CTM; `space` holds a translation and a scale only.
  function markMiddle (mark, space) {
    const text = mark.localName === 'tspan' ? mark.parentNode : mark
    const extent = mark.getExtentOfChar(0)
    const ink = inkMiddle(extent, measureInk(mark))
    const toSpace = space.getCTM().inverse().multiply(text.getCTM())
    const point = new window.DOMPoint(ink.x, ink.y).matrixTransform(toSpace)
    return { x: point.x, y: point.y, width: extent.width * toSpace.a }
  }

  // Just before the corner marks: behind every mark, above the cells' colors.
  function circlesGroup () {
    let group = document.getElementById(CIRCLES_ID)
    const anchor = document.getElementById('cell-pencilmarks')
    if (!anchor) return null
    if (!group || group.nextSibling !== anchor) {
      if (group) group.remove()
      group = document.createElementNS(SVG_NS, 'g')
      group.id = CIRCLES_ID
      anchor.parentNode.insertBefore(group, anchor)
    }
    return group
  }

  // Each conflicting mark keeps its own circle, so a change touches only the circles that came or went.
  const circleOf = new WeakMap()

  function setAttributes (element, values) {
    Object.entries(values).forEach(([name, value]) => {
      if (element.getAttribute(name) !== String(value)) element.setAttribute(name, value)
    })
  }

  // A circle never outlives its mark, its conflict or a mode that colors digits.
  function syncCircles () {
    const group = circlesGroup()
    if (!group) return
    const conflicts = colorsDigits(mode) ? document.querySelectorAll(MARK_SELECTORS.map((s) => `${s}.conflict`).join(',')) : []
    const wanted = new Set()
    conflicts.forEach((mark) => {
      let circle = circleOf.get(mark)
      if (!circle || circle.parentNode !== group) {
        circle = document.createElementNS(SVG_NS, 'circle')
        circleOf.set(mark, circle)
        group.appendChild(circle)
      }
      setAttributes(circle, circleFor(markMiddle(mark, group)))
      wanted.add(circle)
    })
    ;[...group.children].filter((circle) => !wanted.has(circle)).forEach((circle) => circle.remove())
  }

  function syncDigits () {
    stampEnteredDigits()
    syncCircles()
  }

  // A mark's `class` change is how it enters or leaves `conflict`. Stamping `DIGIT_ATTR` and drawing
  // circles must trigger nothing.
  function isBoardChange (record) {
    if (record.target.closest && record.target.closest(`#${CIRCLES_ID}`)) return false
    return record.type !== 'attributes' || MARK_SELECTORS.some((s) => record.target.matches(s))
  }

  // The whole page: SudokuPad swaps the board's elements when a puzzle loads.
  function watchBoard () {
    let queued = false
    new window.MutationObserver((records) => {
      if (queued || !colorsDigits(mode) || !records.some(isBoardChange)) return
      queued = true
      window.requestAnimationFrame(() => { queued = false; digitColors.run(syncDigits) })
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] })
  }

  // Digit colors are a stylesheet, not SudokuPad state, so they are never an undo step.
  function showDigitColors () {
    let style = document.getElementById(DIGIT_STYLE_ID)
    if (!style) {
      style = document.createElement('style')
      style.id = DIGIT_STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = colorsDigits(mode) ? `${buildDigitCss(digitGroups(loadState()), readColor)}\n${CIRCLE_CSS}` : ''
    syncDigits()
  }

  // SudokuPad gives the button the title it was added with and no aria-label.
  function labelButton () {
    const button = document.querySelector(BUTTON)
    if (!button) return
    button.title = buttonLabel(mode)
    button.setAttribute('aria-label', buttonLabel(mode))
  }

  // The palette can change after the button was drawn, so the icon and the digit shades are drawn from it again.
  function redraw () {
    modeButton.run(() => {
      const icon = document.querySelector(`${BUTTON} .icon`)
      const state = loadState()
      if (icon) icon.outerHTML = iconHtml(mode, activeGroups(state), readColor, digitGroups(state))
      labelButton()
    })
    digitColors.run(showDigitColors)
  }

  function showMode (next) {
    mode = next
    writeData(MODE_KEY, next)
    redraw()
  }

  const modeHistory = createModeHistory()

  // Runs `step`, which may color or clear cells, and records it as a mode step from `from` when it left an undo step.
  function recordingModeStep (app, from, to, step) {
    coloring.run(() => {
      const before = app.puzzle.undoStack.length
      step()
      const after = app.puzzle.undoStack.length
      if (after > before) modeHistory.record(after, from, to)
    })
  }

  // Leaving cell coloring takes the colors of `keys`, the group keys to take off, off every cell.
  function setMode (app, next, keys = groupKeys(loadGroups())) {
    const was = mode
    showMode(next)
    recordingModeStep(app, was, next, () => {
      if (colorsCells(next) && !colorsCells(was)) colorEnteredCells(app)
      if (!colorsCells(next) && colorsCells(was)) recolor(app, (plans) => planClear(plans, keys))
    })
  }

  // Undo and Redo move the mode with the board: a mode step that colored or cleared cells is an undo step, so taking it back or putting it again changes the mode too.
  function followUndo (app, type) {
    const stackLength = app.puzzle.undoStack.length
    const target = type === 'undo' ? modeHistory.undo(stackLength) : modeHistory.redo(stackLength)
    if (target !== undefined) showMode(allowedMode(target, usesDigitColors(loadState())))
  }

  // A change SudokuPad would drop is not wrapped in a group: an empty group still empties the redo
  // stack and leaves a dead undo step.
  function mayChange (action, cell) {
    if (action.type === 'value') return cell.propVisible('normal')
    if (action.type === 'candidates') return cell.propVisible('centre')
    const plan = toPlanCell(cell)
    return String(plan.value || '') !== '' || plan.centre.length > 0
  }

  // A change SudokuPad already runs inside its own group (a paste) has its color changes added to that
  // group; opening a second would end it early. Replays and loading progress bypass app.act; Undo and Redo go through it.
  function installCellColoring (app) {
    coloring.run(() => {
      const coloredEntry = (stock, action) => {
        if (!colorsCells(mode) || !isEntryAction(action)) return stock(action)
        const touched = [...app.puzzle.selectedCells]
        if (!touched.some((cell) => mayChange(action, cell))) return stock(action)
        const all = allCells(app)
        const indices = touched.map((cell) => all.indexOf(cell))
        const before = touched.map((cell) => entrySignature(toPlanCell(cell)))
        const enter = () => {
          const result = stock(action)
          const changed = changedIndices(before, touched.map((cell) => entrySignature(toPlanCell(cell)))).map((i) => indices[i])
          recolor(app, (plans) => planCellColors(plans, loadGroups(), changed))
          return result
        }
        return app.puzzle.inGroup ? enter() : inOneUndoStep(app, enter)
      }
      coloring.wrap(app, 'act', function (stock, action) {
        if (action?.type === 'undo' || action?.type === 'redo') {
          // SudokuPad keeps the board from before a Restart in `preRestartSavedProgress`, and an Undo on the empty stack loads it.
          const loadsBeforeRestart = action.type === 'undo' && app.puzzle.undoStack.length === 0 && app.preRestartSavedProgress !== undefined
          const result = stock(action)
          if (loadsBeforeRestart) modeHistory.restoreBeforeRestart()
          else followUndo(app, action.type)
          return result
        }
        // A new action empties SudokuPad's redo stack, and the mode steps that could have been redone go with it.
        const hadRedo = app.puzzle.redoStack.length > 0
        const result = coloredEntry(stock, action)
        if (hadRedo && app.puzzle.redoStack.length === 0) modeHistory.forgetRedo()
        return result
      })
      app.on('restarted', () => {
        modeHistory.restart()
        // The restart's own coloring is an undo step too; taking it back leaves the cells as the mode before it colored them.
        if (colorsCells(mode)) recordingModeStep(app, mode === 'cell' ? 'off' : 'digit', mode, () => colorEnteredCells(app))
      })
    })
  }

  let menu = null

  const addStyle = (id = STYLE_ID, css = STYLE_CSS) => addStyleOnce(id, css)

  const closeMenu = () => {
    if (menu) menu.remove()
    menu = null
  }

  function openMenu () {
    closeMenu()
    redraw()
    const button = document.querySelector(BUTTON)
    if (!button) return
    addStyle()
    menu = document.createElement('div')
    menu.id = MENU.slice(1)
    menu.setAttribute('role', 'menu')
    menu.style.cssText = 'position:fixed;z-index:10000;width:max-content;max-width:calc(100vw - 8px);box-sizing:border-box;padding:6px;border-radius:10px;background:#fff;color:#1d1b26;' +
      'box-shadow:0 10px 30px rgba(30,20,60,.28),0 0 0 1px rgba(0,0,0,.08);font:14px/1.2 sans-serif;text-align:left;user-select:none'
    menu.innerHTML = renderMenu(loadState(), readColor)
    document.body.appendChild(menu)
    const rect = button.getBoundingClientRect()
    const left = Math.min(Math.max(rect.right - menu.offsetWidth + 8, 4), window.innerWidth - menu.offsetWidth - 4)
    menu.style.left = `${Math.max(left, 0)}px`
    menu.style.top = `${Math.max(rect.top - menu.offsetHeight - 12, 4)}px`
  }

  // A digit pick changes only the digit stylesheet: it touches no cell and is never an undo step.
  function switchProfile (app, index, target) {
    const state = loadState()
    closeMenu()
    const digits = target === 'digits'
    if (index === (digits ? state.digitActive : state.active)) return
    const next = digits ? setDigitActive(state, index) : setActive(state, index)
    saveState(next)
    if (!digits && colorsCells(mode)) recolor(app, (plans) => planSwitch(plans, activeGroups(state), activeGroups(next)))
    redraw()
  }

  const HOLD_MS = 500
  const HOLD_SLOP = 10

  // SudokuPad reads `event.target.dataset.control` on a control press, which the arrow lacks, and on
  // a touch cancels the touchstart so no click follows: the arrow takes the touch itself. SudokuPad
  // runs a button's handler on press, which would step the mode under a right click or a hold, so a
  // press on the button proper never reaches it. A mouse press on the button or arrow must not focus
  // the button, so the keyboard stays with the puzzle.
  function listenForButton (app, openEditor) {
    const within = (event, selector) => event.target.closest && event.target.closest(selector)
    const onArrow = (event) => within(event, ARROW)
    const onButtonProper = (event) => within(event, BUTTON) && !onArrow(event)
    const toggleMenu = (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (menu) closeMenu()
      else openMenu()
    }
    // A handler that throws turns the button off, and an off button's handlers do nothing.
    const listen = (type, handler, options) => document.addEventListener(type, (event) => modeButton.run(() => handler(event)), options)
    listen('mousedown', (event) => {
      if (onButtonProper(event)) event.stopPropagation()
      if (onArrow(event) || onButtonProper(event) || within(event, MENU)) event.preventDefault()
    }, true)
    listen('click', (event) => {
      if (onArrow(event)) return toggleMenu(event)
      const row = within(event, `${MENU} [data-act]`)
      if (!row) return
      event.preventDefault()
      event.stopPropagation()
      if (row.dataset.act === 'edit') {
        closeMenu()
        openEditor()
      } else {
        switchProfile(app, Number(row.dataset.index), row.dataset.target)
      }
    }, true)
    listen('touchstart', (event) => {
      if (onArrow(event)) toggleMenu(event)
      else if (onButtonProper(event)) { event.preventDefault(); event.stopPropagation() }
    }, { capture: true, passive: false })
    listen('contextmenu', (event) => {
      if (!within(event, BUTTON)) return
      event.preventDefault()
      if (!menu) openMenu()
    }, true)
    let hold = null
    const endHold = () => {
      clearTimeout(hold)
      hold = null
    }
    const setPressed = (on) => document.querySelector(BUTTON)?.classList.toggle(PRESSED_CLASS, on)
    listen('pointerdown', (event) => {
      if (menu && !within(event, MENU) && !onArrow(event)) closeMenu()
      endHold()
      if (!onButtonProper(event) || (event.pointerType === 'mouse' && event.button !== 0)) return
      const { clientX, clientY } = event
      const moved = (e) => Math.hypot(e.clientX - clientX, e.clientY - clientY) > HOLD_SLOP
      setPressed(true)
      hold = setTimeout(() => {
        hold = null
        modeButton.run(openMenu)
      }, HOLD_MS)
      trackPointer(document, {
        move: (e) => { if (moved(e)) { endHold(); setPressed(false) } },
        end: (e) => {
          setPressed(false)
          modeButton.run(() => { if (hold !== null && e.type === 'pointerup') setMode(app, nextMode(mode, usesDigitColors(loadState()))) })
          endHold()
        }
      })
    }, true)
    listen('keydown', (event) => {
      if (event.key !== 'Escape' || !menu) return
      event.preventDefault()
      event.stopPropagation()
      closeMenu()
    }, true)
    window.addEventListener('resize', closeMenu)
  }

  function saveDialog (app, oldState, draft, draftMode) {
    saveState(draft)
    const next = allowedMode(draftMode, usesDigitColors(draft))
    const oldGroups = activeGroups(oldState)
    const groups = activeGroups(draft)
    if (colorsCells(next) && !sameGroups(oldGroups, groups)) recolor(app, (plans) => planSwitch(plans, oldGroups, groups))
    setMode(app, next, groupKeys([...oldGroups, ...groups]))
  }

  function openDialog (app) {
    let savedState = loadState()
    const unreadable = hasUnreadable(savedData, PROFILES_KEY)
    let draft = openingDraft(savedState, mode, readPages())
    const box = showSettingsDialog(dialogs, {
      prefix: CLASS_PREFIX,
      name: 'Color by Digit',
      version: VERSION,
      bodyId: EDITOR_ID,
      styleId: STYLE_ID,
      css: STYLE_CSS,
      changed: () => draft.mode !== mode || JSON.stringify(draft.state) !== JSON.stringify(savedState),
      save: () => editor.run(() => saveDialog(app, savedState, draft.state, draft.mode))
    })
    if (!box) return
    const draw = () => {
      const { state, mode: draftMode, selected, pages, page, brush } = draft
      box.innerHTML = renderEditor({ groups: state.profiles[selected].groups, pages, page, brush, pulldownsHtml: renderPulldowns(state, draftMode), profilesHtml: renderProfiles(state, readColor, selected), unreadable })
    }
    const edit = (event) => {
      const before = draft
      draft = reduceDraft(draft, event)
      return draft !== before
    }
    // A stroke's paint redraws only when it changed a color: a redraw under the pointer is needed for nothing else.
    const paint = (digit) => {
      const groups = draft.state.profiles[draft.selected].groups
      edit({ type: 'paint', digit })
      if (draft.state.profiles[draft.selected].groups !== groups) draw()
    }
    draw()
    wireCopyPaste(box.closest('.dialog'), { copied: () => copiedSettings({ getData: readData }), readers: READERS, upgrade: withModeFromAuto }, (values) => {
      ADDED_PRELOADS.forEach(({ key }) => { if (key in values) writeData(key, values[key]) })
      saveDialog(app, savedState, values[PROFILES_KEY] ?? savedState, values[MODE_KEY] ?? mode)
      savedState = loadState()
      edit({ type: 'reload', state: savedState, mode })
      draw()
    })
    // Typing renames the draft, its row and the pulldowns' options in place, so the name field keeps the focus.
    box.addEventListener('input', (event) => {
      if (!event.target.matches('[data-role="profile-name"]')) return
      edit({ type: 'rename', name: event.target.value })
      const { state, selected } = draft
      const name = state.profiles[selected].name
      box.querySelector(`[data-role="profile-row"][data-index="${selected}"]`).setAttribute('aria-label', name)
      box.querySelectorAll(`.cbd-pulldown option[data-index="${selected}"]`).forEach((option) => { option.textContent = name })
    })
    // Enter, or leaving the box, shows the name the draft holds: a blank box shows the kept name again.
    const settleName = (nameBox) => { nameBox.value = draft.state.profiles[draft.selected].name }
    box.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !event.target.matches('[data-role="profile-name"]')) return
      event.preventDefault()
      event.stopPropagation()
      settleName(event.target)
    })
    box.addEventListener('change', (event) => {
      if (event.target.matches('[data-role="profile-name"]')) { settleName(event.target); return }
      const pulldown = event.target.closest('select[data-role]')
      if (!pulldown) return
      const role = pulldown.dataset.role
      edit(role === 'color-choice' ? { type: 'page', page: Number(pulldown.value) } : { type: 'choose', role, value: pulldown.value })
      draw()
      box.querySelector(`select[data-role="${role}"]`).focus()
    })
    // A press on a digit paints it, and a drag paints each digit the pointer then passes over; the first digit decides paint or clear.
    // A press in a gap (not on a control) paints from the first digit the drag reaches, so a slightly early press selects no text and drags no page.
    box.addEventListener('pointerdown', (event) => {
      const target = event.target
      if (target.closest('select, input, [data-role="handle"]') || (event.pointerType === 'mouse' && event.button !== 0)) return
      event.preventDefault()
      if (target.hasPointerCapture && target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
      const pressed = target.closest('[data-act="digit"]')
      if (!pressed && target.closest('[data-act], [data-role="swatch"]')) return
      edit({ type: 'press' })
      if (pressed) paint(pressed.dataset.digit)
      const stop = trackPointer(document, {
        move: (e) => {
          if (e.buttons === 0) { stop(); return }
          const under = document.elementFromPoint(e.clientX, e.clientY)
          const digit = under && box.contains(under) && under.closest('[data-act="digit"]')
          if (digit) paint(digit.dataset.digit)
        }
      })
    })
    box.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest('[data-role="handle"]')
      if (!handle || (event.pointerType === 'mouse' && event.button !== 0)) return
      event.preventDefault()
      const from = Number(handle.dataset.index)
      const rows = [...box.querySelectorAll('[data-role="profile-row"]')]
      const mids = rows.map((row) => { const r = row.getBoundingClientRect(); return r.top + r.height / 2 })
      let to = from
      rows[from].style.opacity = '0.5'
      box.classList.add(DRAGGING_CLASS)
      handle.setPointerCapture(event.pointerId)
      trackPointer(handle, {
        move: (e) => {
          to = dropIndex(mids, from, e.clientY)
          rows.forEach((row, i) => { row.style.outline = i === to && to !== from ? `2px solid ${PURPLE}` : '' })
        },
        end: (e) => {
          box.classList.remove(DRAGGING_CLASS)
          if (e.type === 'pointerup') edit({ type: 'move', from, to })
          draw()
        }
      })
    })
    const selectRow = (index, refocus) => {
      edit({ type: 'select', index })
      draw()
      if (refocus) box.querySelector(`[data-act="select"][data-index="${index}"]`).focus()
    }
    const focusDigitKey = (digit) => box.querySelector(`[data-act="digit"][data-digit="${digit}"]`)?.focus()
    // The arrow keys move the focus within the swatch grid or the digit grid, and a typed digit paints that digit.
    box.addEventListener('keydown', (event) => {
      const grid = event.target.closest(PAINT_GRIDS)
      if (!grid || event.ctrlKey || event.altKey || event.metaKey) return
      const slots = [...grid.children]
      const index = slots.indexOf(event.target)
      const to = index < 0 ? null : gridTarget(event.key, index, slots.map((slot) => slot.matches(FOCUSABLE_SLOT)), PAGE_COLUMNS)
      if (to !== null) {
        event.preventDefault()
        event.stopPropagation()
        slots[to].focus()
      } else if (/^[0-9]$/.test(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        // A held key repeats, and each repeat would toggle the paint again.
        if (event.repeat) return
        edit({ type: 'key-paint', digit: event.key })
        draw()
        focusDigitKey(event.key)
      }
    })
    box.addEventListener('keydown', (event) => {
      if (!event.target.matches('[data-act="select"]')) return
      const target = rowAfterKey(event.key, Number(event.target.dataset.index), draft.state.profiles.length)
      if (target === null) return
      event.preventDefault()
      event.stopPropagation()
      selectRow(target, true)
    })
    box.addEventListener('click', (event) => {
      const row = event.target.closest('[data-act="select"]')
      if (row && !event.target.closest('[data-role="handle"], [data-role="profile-name"], button')) {
        event.preventDefault()
        event.stopPropagation()
        selectRow(Number(row.dataset.index), false)
        return
      }
      const swatch = event.target.closest('button[data-role="swatch"]')
      if (swatch) {
        event.preventDefault()
        event.stopPropagation()
        edit({ type: 'brush', key: swatch.dataset.key })
        draw()
        // The redraw replaced the swatch; a keyboard user keeps the focus on its successor.
        if (event.detail === 0) swatchWithKey(box, draft.brush)?.focus()
        return
      }
      const el = event.target.closest('button[data-act]')
      if (!el) return
      event.preventDefault()
      event.stopPropagation()
      const act = el.dataset.act
      if (act === 'new-profile') {
        if (!edit({ type: 'new-profile' })) return
        draw()
        const nameBox = box.querySelector('[data-role="profile-name"]')
        nameBox.focus()
        nameBox.select()
        return
      }
      if (act === 'delete') {
        if (!edit({ type: 'delete', index: Number(el.dataset.index) })) return
      } else if (act === 'clear') {
        edit({ type: 'clear' })
      } else if (act === 'digit' && event.detail === 0) {
        // A mouse or touch press has already painted on pointerdown; only a keyboard click, which has no pointer, lands here.
        edit({ type: 'key-paint', digit: el.dataset.digit })
      }
      draw()
      // The redraw replaced the button; a keyboard user keeps the focus on its successor.
      if (event.detail === 0 && act === 'digit') focusDigitKey(el.dataset.digit)
    })
  }

  // Without getApp there is no app: the features that need one are off, and the rest start without it.
  const start = (app) => {
    guard.probe({ roots: { Framework, app }, store: Framework })
    const openEditor = () => editor.run(() => {
      Framework.closeDialog()
      setTimeout(() => editor.run(() => openDialog(app)), 0)
    })
    // The features are independent: one that fails to install costs the others nothing.
    editor.run(() => addSettingsEntry(dialogs, { name: 'colorbydigit', content: 'Color by Digit', open: () => editor.run(() => openDialog(app)) }))
    addPreloadsOnce()
    const state = loadState()
    mode = allowedMode(startingMode(readData(MODE_KEY), readData(AUTO_KEY)), usesDigitColors(state))
    addStyle(BOTTOM_ROW_STYLE_ID, BOTTOM_ROW_CSS)
    addStyle(BUTTON_STYLE_ID, BUTTON_CSS)
    modeButton.run(() => {
      installButton(Framework, app, mode, activeGroups(state), readColor, digitGroups(state))
      labelButton()
    })
    installCellColoring(app)
    modeButton.run(() => listenForButton(app, openEditor))
    digitColors.run(watchBoard)
    // The puzzle's own palette is in the page's colors once it has loaded: the icon and the digit shades show those.
    whenProgressLoaded(app, redraw)
    if (colorsCells(mode)) whenProgressLoaded(app, () => colorEnteredCells(app))
  }
  if (typeof Framework.getApp === 'function') Framework.getApp().then(start)
  else start(undefined)
})()
