// ==UserScript==
// @name         SudokuPad Color by Digit
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.14.0
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
  const VERSION = '0.14.0'
  const SETTINGS_GROUP = 'experimental'
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
  // SudokuPad's numpad order: 1 to 9 in rows of three, then 0 alone in the middle column.
  const NUMPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
  const NUMPAD_KEY = '2.4em'
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

  function assignDigit (groups, groupIndex, digit) {
    const had = groups[groupIndex].digits.includes(digit)
    return groups.map((g, i) => {
      const rest = g.digits.filter((d) => d !== digit)
      if (i !== groupIndex) return { key: g.key, digits: rest }
      const digits = had ? rest : [...rest, digit].sort()
      return { key: g.key, digits }
    })
  }

  function editGroupsFor (groups, shown, act, { group, key, digit }, colors) {
    switch (act) {
      case 'color': return { groups: groups.map((g, j) => (j === group ? { key, digits: g.digits } : g)), shown }
      case 'digit': return { groups: assignDigit(groups, group, digit), shown }
      case 'open': return { groups, shown }
      case 'remove': return { groups: groups.filter((_, j) => j !== group), shown: shown.filter((_, j) => j !== group) }
      case 'clear': return { groups: [], shown: [] }
      case 'add-group': {
        const used = groups.map((g) => g.key)
        const free = colors.find((c) => !used.includes(c.key)) || colors[0]
        return { groups: free ? [...groups, { key: free.key, digits: [] }] : groups, shown }
      }
    }
  }

  // The one group whose pickers show, as an index or null. A group Add group made opens; one before a removed group keeps its place.
  function openGroupAfter (open, act, group, countBefore, countAfter) {
    switch (act) {
      case 'open': return open === group ? null : group
      case 'add-group': return countAfter > countBefore ? countAfter - 1 : open
      case 'remove': return open === group || open === null ? null : (open > group ? open - 1 : open)
      case 'clear': return null
      default: return open
    }
  }

  const ARROW_STEP = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }
  function rowAfterKey (key, index, count) {
    if (key === 'Enter' || key === ' ') return index
    if (ARROW_STEP[key]) return (index + ARROW_STEP[key] + count) % count
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
    return out
  }

  const cleanName = (name) => String(name).trim().slice(0, MAX_NAME_LENGTH)

  function normalizeProfile (data) {
    if (!data || typeof data.name !== 'string' || data.name.trim() === '') return null
    const groups = normalizeGroups(data.groups)
    return groups && { name: cleanName(data.name), groups }
  }

  function normalizeState (data) {
    if (!data || !Array.isArray(data.profiles)) return null
    const kept = data.profiles.slice(0, MAX_PROFILES).map((profile, index) => ({ profile: normalizeProfile(profile), index })).filter((entry) => entry.profile)
    if (kept.length === 0) return null
    const keptIndex = (index) => kept.findIndex((entry) => entry.index === index)
    const digitActive = keptIndex(data.digitActive)
    return makeState(kept.map((entry) => entry.profile), Math.max(keptIndex(data.active), 0), digitActive >= 0 ? digitActive : undefined, data.useDigitColors !== false)
  }

  const readPastedFlag = (data) => (typeof data === 'boolean' ? data : undefined)
  // `normalizeState` drops a malformed profile, so a state passes only when it kept every profile it held.
  const readPastedProfiles = (data) => {
    const state = normalizeState(data)
    return state && state.profiles.length === data.profiles.length ? state : undefined
  }
  const readPastedMode = (data) => (MODES.includes(data) ? data : undefined)
  const READERS = { [PROFILES_KEY]: readPastedProfiles, [MODE_KEY]: readPastedMode, ...Object.fromEntries(ADDED_PRELOADS.map(({ key }) => [key, readPastedFlag])) }
  // The profiles in force, which carry groups saved before profiles existed, and the mode in force, so a paste can switch either.
  function copiedSettings (store) {
    const copied = { [PROFILES_KEY]: stateFromStored(store.getData(PROFILES_KEY), store.getData(LEGACY_GROUPS_KEY)), [MODE_KEY]: startingMode(store.getData(MODE_KEY), store.getData(AUTO_KEY)) }
    ADDED_PRELOADS.forEach(({ key }) => { if (store.getData(key) === true) copied[key] = true })
    return JSON.stringify(copied)
  }

  // A reader returns the value to save, or undefined for one it refuses. Keys of other scripts are ignored, not counted: only a value of this script's own that its reader refuses is skipped.
  function pastedSettings (text) {
    let data
    try {
      data = JSON.parse(text)
    } catch (error) {
      throw new Error('the clipboard text is not JSON', { cause: error })
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('the clipboard text is not a settings object')
    // Settings copied before the mode existed carry auto mode's on/off in its place.
    if (!Object.hasOwn(data, MODE_KEY) && Object.hasOwn(data, AUTO_KEY)) data = { ...data, [MODE_KEY]: modeFromAuto(data[AUTO_KEY]) }
    const values = {}
    let skipped = 0
    for (const [key, read] of Object.entries(READERS)) {
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

  // The icons are Pen Tool Extras' copy and paste pictures; the scripts share no code.
  const ICON_PICTURES = {
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4"/>'
  }
  const iconButton = (act, label, picture) =>
    `<button type="button" data-act="${act}" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${picture}</svg></button>`

  const renderTitle = (version) => '<div class="cbd-title-row">' +
    `<span><b>Color by Digit</b> <small class="cbd-version">v${version}</small></span>` +
    '<span data-role="settings-status"></span>' +
    `<span class="cbd-tools">${iconButton('copy-settings', 'Copy settings', ICON_PICTURES.copy)}${iconButton('paste-settings', 'Paste settings', ICON_PICTURES.paste)}</span></div>`

  function wireCopyPaste (root, apply) {
    const say = (message) => { root.querySelector('[data-role="settings-status"]').textContent = message }
    root.addEventListener('click', async (event) => {
      const act = event.target.closest('button[data-act]')?.dataset.act
      if (act !== 'copy-settings' && act !== 'paste-settings') return
      event.preventDefault()
      event.stopPropagation()
      try {
        if (act === 'copy-settings') {
          await navigator.clipboard.writeText(copiedSettings(Framework))
          say('Settings copied.')
        } else {
          const { values, skipped } = pastedSettings(await navigator.clipboard.readText())
          if (Object.keys(values).length > 0) apply(values)
          say(pasteReport(Object.keys(values).length, skipped))
        }
      } catch (error) {
        say(`Could not ${act === 'copy-settings' ? 'copy' : 'paste'}: ${error.message}`)
      }
    })
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

  // Groups saved before profiles existed become the active profile.
  function stateFromStored (data, legacyGroups) {
    const saved = normalizeState(data)
    if (saved) return saved
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
  const iconGroups = (state, mode) => (mode === 'digit' ? digitGroups(state) : activeGroups(state))

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

  // The icon is drawn in 100 by 100 units; the mode label takes its top ICON_TOP, the arrow box everything below ARROW_START.
  const ICON_TOP = 22
  const ARROW_START = 78
  const ICON_MAX_GROUPS = 4
  // The profile menu's and dialog's chips stop at three groups, the most any preload but Each digit has.
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

  function iconLayout (groups) {
    const shown = shownGroups(groups, ICON_MAX_GROUPS)
    const gap = 3
    if (shown.length === ICON_MAX_GROUPS) {
      const top = ICON_TOP + 5
      const size = Math.min(22, (ARROW_START - top - gap) / 2)
      const start = (100 - 2 * size - gap) / 2
      return shown.map((c, i) => ({ ...c, x: start + (i % 2) * (size + gap), y: top + Math.floor(i / 2) * (size + gap), size }))
    }
    const size = 30
    const start = (100 - shown.length * size - (shown.length - 1) * gap) / 2
    return shown.map((c, i) => ({ ...c, x: start + i * (size + gap), y: ICON_TOP + 10, size }))
  }

  const clamp255 = (x) => Math.max(0, Math.min(255, x))

  // SudokuPad's own cell color 3 is `rgb(-36, -36, -36)`, which clamps to black.
  function parseColor (color) {
    const v = String(color ?? '').trim().toLowerCase()
    if (!isVisibleColor(v)) return null
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v)
    if (hex) {
      const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
    }
    const fn = /^rgba?\(([^)]*)\)$/.exec(v)
    const channels = fn ? fn[1].split(/[,/\s]+/).filter(Boolean).slice(0, 3).map(Number) : []
    return channels.length === 3 && !channels.some(Number.isNaN) ? channels.map((x) => Math.round(clamp255(x))) : null
  }

  function inkFor (color) {
    const channels = parseColor(color)
    if (!channels) return '#000'
    const [r, g, b] = channels
    return 0.299 * r + 0.587 * g + 0.114 * b < 140 ? '#fff' : '#000'
  }

  // The digit shade is Pen Tool Extras' pen color from a cell color, copied since the scripts share no code: the share of its OKLCH lightness a cell color keeps.
  const LIGHTNESS_FACTOR = 0.75
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

  const EDGE = 1e-6
  const inGamut = (linear) => linear.every((x) => x >= -EDGE && x <= 1 + EDGE)

  // Lowering lightness at fixed chroma can leave sRGB, so chroma is reduced just far enough to fit (a bisection), which keeps the hue.
  function darkenColor (rgb) {
    const [L, a, b] = toOklab(rgb.map(clamp255))
    const target = L * LIGHTNESS_FACTOR
    let low = inGamut(fromOklabLinear([target, a, b])) ? 1 : 0
    let high = 1
    if (low === 0) {
      for (let i = 0; i < 30; i++) {
        const mid = (low + high) / 2
        if (inGamut(fromOklabLinear([target, a * mid, b * mid]))) low = mid
        else high = mid
      }
    }
    const out = fromOklabLinear([target, a * low, b * low])
    return '#' + out.map((x) => Math.round(clamp255(fromLinear(Math.max(0, Math.min(1, x)))))
      .toString(16).padStart(2, '0')).join('')
  }

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
    const v = String(value).trim().toLowerCase()
    if (v === '' || v === 'transparent') return false
    if (/^#[0-9a-f]{4}$/.test(v)) return v[3] !== '0'
    if (/^#[0-9a-f]{8}$/.test(v)) return v.slice(7) !== '00'
    const fn = /^(?:rgba|hsla)\(([^)]*)\)$/.exec(v)
    if (fn) {
      const parts = fn[1].split(/[,/\s]+/).filter(Boolean)
      if (parts.length === 4 && Number(parts[3]) === 0) return false
    }
    return true
  }

  const PURPLE = '#6a1b9a'
  const GREY = '#b3acbf'

  // No pointer events, so a press on the label is a press on the button.
  function modeLabelHtml (mode) {
    const on = mode !== 'off'
    return '<span data-role="mode" style="pointer-events:none;position:absolute;left:-3px;top:-2px;' +
      `font:${on ? 700 : 400} 9px/1 sans-serif;letter-spacing:.04em;white-space:nowrap;color:${on ? PURPLE : GREY}">${MODE_NAMES[mode].toUpperCase()}</span>`
  }

  const ARROW_BOX_HTML = '<span data-role="menu" role="button" aria-haspopup="menu" aria-label="Color by digit profiles" title="Profiles" ' +
    'style="pointer-events:auto;position:absolute;right:-4px;bottom:-4px;box-sizing:border-box;width:14px;height:14px;' +
    `border:1.5px solid ${PURPLE};border-radius:3px;background:#fff;color:${PURPLE};font:700 7px/11px sans-serif;text-align:center">&#9660;</span>`

  const UNREADABLE_FILL = '#ccc'

  function iconCellSvg ({ key, digit, x, y, size }, colorOf) {
    const color = colorOf(key)
    const fill = color || UNREADABLE_FILL
    return `<rect data-role="cell" data-key="${esc(key)}" x="${x}" y="${y}" width="${size}" height="${size}" rx="4" fill="${esc(fill)}" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/>` +
      `<text x="${x + size / 2}" y="${y + size * 0.72}" fill="${inkFor(color)}" font-family="sans-serif" font-size="${Math.round(size * 0.7)}" font-weight="bold" text-anchor="middle">${esc(digit)}</text>`
  }

  // SudokuPad's own app buttons put their icon in <div class="icon">.
  const iconHtml = (mode, groups, colorOf) =>
    '<div class="icon" style="position:relative"><svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
    iconLayout(groups).map((cell) => iconCellSvg(cell, colorOf)).join('') +
    '</svg>' + modeLabelHtml(mode) + ARROW_BOX_HTML + '</div>'

  // SudokuPad binds button handlers only to buttons present when the controls were built, so a
  // button added later needs refreshControls. Its onClick is left empty: listenForButton takes every
  // press before SudokuPad sees it.
  function installButton (framework, app, mode, groups, colorOf) {
    framework.addAuxButton({ name: 'colorbydigit', title: 'Color by digit', content: iconHtml(mode, groups, colorOf), onClick () {} })
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

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  const SWATCH_SIZE = '44px'

  // The group's color is ringed twice (white inside, black outside) so it shows on any swatch color.
  function renderSwatch (slot, groupIndex, selectedKey) {
    if (!slot) return '<span data-empty="slot"></span>'
    return `<button type="button" data-act="color" data-group="${groupIndex}" data-key="${esc(slot.key)}" ` +
      `title="${esc(slot.key)}" aria-pressed="${slot.key === selectedKey}" style="background:${esc(slot.value)}"></button>`
  }

  const pageLabel = (page) => `Page ${page.page + 1}${page.current ? ' (current)' : ''}`

  function initialPage (pages, key) {
    const holds = (p) => pageSlots(p).some((slot) => slot && slot.key === key)
    const found = pages.find((p) => p.current && holds(p)) || pages.find(holds) || pages.find((p) => p.current)
    return found ? found.page : 0
  }

  function renderChosen (colors, key, role = 'chosen') {
    const color = colors.find((c) => c.key === key)
    return color ? `<span data-role="${role}" title="${esc(key)}" style="background:${esc(color.value)}"></span>` : `<span data-role="${role}" class="cbd-unset" title="${esc(key)}"></span>`
  }

  function renderPalette (pages, colors, groupIndex, key, shownPage) {
    if (pages.length === 0) return ''
    const page = pages[shownPage] || pages[0]
    const options = pages.map((p) => `<option value="${p.page}"${p === page ? ' selected' : ''}>${pageLabel(p)}</option>`).join('')
    const swatches = page.rows.flat().map((slot) => renderSwatch(slot, groupIndex, key)).join('')
    const zero = page.zero ? `<div class="cbd-swatches cbd-zero">${renderSwatch(page.zero, groupIndex, key)}</div>` : ''
    return '<div class="cbd-palette-head">' +
      `<select data-act="page" data-group="${groupIndex}" aria-label="Cell color page">${options}</select> ${renderChosen(colors, key)}</div>` +
      `<div class="cbd-swatches">${swatches}</div>${zero}`
  }

  function renderChips (groups, colorOf, size) {
    return shownGroups(groups, CHIP_MAX_GROUPS).map(({ key, digit }) => {
      const color = colorOf(key)
      return `<span data-role="chip" title="${esc(key)}" class="cbd-chip" style="width:${size}px;height:${size}px;` +
        `background:${esc(color || UNREADABLE_FILL)};color:${inkFor(color)};font-size:${Math.round(size * 0.6)}px">${esc(digit)}</span>`
    }).join('')
  }

  const RULE_COLOR = '#e3dff0'
  const SMALL_BUTTON_SIZE = 28
  // Two columns need this much room each; the dialog's 640 px gives them two, a phone gives one.
  const COLUMN_MIN = 270
  // Three pulldowns fit one row of the 640 px dialog; at phone width they stack.
  const PULLDOWN_MIN = 180
  const DIALOG_WIDTH = 640
  const heading = (text, extra = '') => `<div class="cbd-heading">${text}${extra}</div>`
  const SAVE_LABEL = 'Save'
  const EDITOR_ID = 'color-by-digit-editor'
  const MENU = '#color-by-digit-menu'
  const DIALOG_CLASS = 'color-by-digit-dialog'
  const STYLE_ID = 'color-by-digit-style'

  const MUTED = '#8a8496'
  const ACTIVE_FILL = '#f1ebfb'
  const ACTIVE_RING = '#b79be0'
  const ACTIVE_INK = '#5b2a9a'
  const IDLE_RING = '#e2dcea'
  function renderProfiles (state, colorOf, selected) {
    const only = state.profiles.length <= 1
    const rows = state.profiles.map((profile, i) => {
      const chosen = i === selected
      return `<div class="cbd-profile" data-role="profile-row" data-act="select" data-index="${i}" role="radio" aria-checked="${chosen}" tabindex="${chosen ? 0 : -1}" aria-label="${esc(profile.name)}">` +
        `<span data-role="handle" data-index="${i}" title="Drag to reorder">&#8942;&#8942;</span>` +
        `<span class="cbd-chips">${renderChips(profile.groups, colorOf, 20)}</span>` +
        (chosen ? `<input type="text" data-role="profile-name" maxlength="${MAX_NAME_LENGTH}" value="${esc(profile.name)}" aria-label="Profile name">` : `<span class="cbd-name">${esc(profile.name)}</span>`) +
        `<button type="button" class="cbd-button cbd-small" data-act="delete" data-index="${i}" aria-label="Delete profile ${esc(profile.name)}"${only ? ' disabled' : ''}>&#215;</button></div>`
    }).join('')
    const full = state.profiles.length >= MAX_PROFILES
    return heading('Profiles', `<span class="cbd-count">${state.profiles.length} of ${MAX_PROFILES}</span>`) +
      `<div role="radiogroup" aria-label="Profile to edit">${rows}</div>` +
      `<button type="button" class="cbd-button cbd-new" data-act="new-profile"${full ? ' disabled' : ''}>+ New profile</button>`
  }

  const MENU_HEADING_STYLE = `font:600 11px/1 sans-serif;text-transform:uppercase;color:${MUTED};padding:8px 10px 6px`
  const menuHeading = (text) => `<div style="${MENU_HEADING_STYLE};letter-spacing:.08em">${text}</div>`
  // The Cells and Digits sections' headings, set tighter than the menu's own.
  const sectionHeading = (text) => `<div style="${MENU_HEADING_STYLE};letter-spacing:.04em">${text}</div>`

  // Rows are not focusable, so the keyboard stays with the puzzle. A row's target says which pick it sets.
  function renderMenuRows (profiles, picked, target, colorOf) {
    return profiles.map((profile, i) => {
      const active = i === picked
      return `<div role="menuitemradio" data-act="pick" data-target="${target}" data-index="${i}" aria-checked="${active}" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;` +
        `${active ? `background:${ACTIVE_FILL};color:${ACTIVE_INK};font-weight:600` : ''}">` +
        `<span style="display:flex;gap:3px;width:92px">${renderChips(profile.groups, colorOf, 20)}</span><span data-role="name" style="flex:1">${esc(profile.name)}</span></div>`
    }).join('')
  }

  function renderMenu (state, colorOf) {
    const cells = renderMenuRows(state.profiles, state.active, 'cells', colorOf)
    const rows = usesDigitColors(state) && !isSynced(state)
      ? `${sectionHeading('Cells')}${cells}${sectionHeading('Digits')}${renderMenuRows(state.profiles, state.digitActive, 'digits', colorOf)}`
      : cells
    return `${menuHeading('Color by digit profile')}${rows}` +
      '<div style="height:1px;background:#ece8f2;margin:4px 6px"></div>' +
      '<div role="menuitem" data-act="edit" style="padding:9px 10px;border-radius:8px;cursor:pointer;color:#5d5868">&#9881; Edit profiles…</div>'
  }

  // A digit another group holds shows that group's color as a dot; a click on it moves the digit here.
  function renderNumpad (groups, colors, groupIndex) {
    const holderOf = (d) => groups.findIndex((g, i) => i !== groupIndex && g.digits.includes(d))
    return NUMPAD_DIGITS.map((d) => {
      const own = groups[groupIndex].digits.includes(d)
      const holder = holderOf(d)
      const dot = holder < 0 ? '' : renderChosen(colors, groups[holder].key, 'holder')
      return `<button type="button" class="cbd-button" data-act="digit" data-group="${groupIndex}" data-digit="${d}" ` +
        `style="font-weight:${own ? 'bold' : 'normal'};opacity:${own ? 1 : 0.4}">${d}${dot}</button>`
    }).join('')
  }

  function renderGroup (groups, colors, pages, shown, groupIndex, isOpen) {
    const g = groups[groupIndex]
    const chips = g.digits.map((d) => `<span data-role="digit-chip" class="cbd-digit-chip">${esc(d)}</span>`).join('') || '<span class="cbd-note">no digits</span>'
    const head = '<div class="cbd-group-head">' +
      `<button type="button" class="cbd-row" data-act="open" data-group="${groupIndex}" aria-expanded="${isOpen}">` +
      `${renderChosen(colors, g.key, 'swatch')}<span class="cbd-digit-chips">${chips}</span></button>` +
      `<button type="button" class="cbd-button cbd-small" data-act="remove" data-group="${groupIndex}" title="Remove group" aria-label="Remove group">&#215;</button></div>`
    const body = isOpen
      ? `<div class="cbd-group-body"><div>${renderPalette(pages, colors, groupIndex, g.key, shown[groupIndex])}</div>` +
        `<div data-role="numpad">${renderNumpad(groups, colors, groupIndex)}</div></div>`
      : ''
    return `<div class="cbd-group">${head}${body}</div>`
  }

  const optionHtml = (value, label, selected, index) =>
    `<option value="${value}"${index === undefined ? '' : ` data-index="${index}"`}${selected ? ' selected' : ''}>${esc(label)}</option>`

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

  function renderEditor ({ groups, pages, shown, pulldownsHtml = '', profilesHtml = '', open = null }) {
    const colors = layoutColors(pages)
    const rows = groups.map((_, i) => renderGroup(groups, colors, pages, shown, i, i === open)).join('')
    const note = colors.length === 0 ? '<div class="cbd-note">No palette colors found: groups cannot be added.</div>' : ''
    const clear = '<button type="button" class="cbd-button" data-act="clear">Clear all</button>'
    return `${pulldownsHtml}` +
      `<div class="cbd-columns cbd-divider"><div class="cbd-column">${profilesHtml}</div>` +
      '<div class="cbd-column">' +
      `${heading('Groups', clear)}${note}${rows || '<div class="cbd-note">No groups.</div>'}` +
      '<button type="button" class="cbd-button" data-act="add-group">Add group</button></div></div>'
  }

  // One stylesheet, every rule scoped to the editor, the profile menu (for the chips), the dialog itself (its width), or the dialog's options row.
  // SudokuPad's own rules for the dialog's selects, buttons and labels size them otherwise; the editor's id and the options row's two classes outrank those rules, so none needs !important.
  const EDITOR = `#${EDITOR_ID}`
  const OPTIONS = `.dialog-options.${DIALOG_CLASS}`
  const TITLE = `.dialog.${DIALOG_CLASS} .cbd-title-row`
  // Percent-encoded; its inner quotes are single, so the url("...") wrapper's double quotes hold it.
  const PULLDOWN_ARROW = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%236b4fa0\'/%3E%3C/svg%3E")'
  const STYLE_CSS = [
    ['.cbd-version', 'opacity: .6'],
    [TITLE, 'display: flex; align-items: center; gap: 12px'],
    [`${TITLE} .cbd-tools`, 'display: flex; align-items: center; gap: 4px'],
    [`${TITLE} .cbd-tools button`, `background: none; border: none; box-shadow: none; padding: 4px; margin: 0; width: auto; min-width: 0; height: auto; line-height: 0; color: ${MUTED}; cursor: pointer; border-radius: 6px`],
    [`${TITLE} .cbd-tools button:hover`, 'background: #f0edf5'],
    [`${TITLE} .cbd-tools svg`, 'width: 20px; height: 20px'],
    [`${TITLE} .cbd-tools svg *`, 'fill: none'],
    // A flex item with no intrinsic width: a long message wraps in the room the title leaves and never widens the dialog.
    [`${TITLE} [data-role="settings-status"]`, `flex: 1 1 0; min-width: 0; contain: inline-size; text-align: right; font-size: .8rem; color: ${MUTED}`],
    [`${EDITOR} .cbd-heading`, 'display: flex; align-items: center; justify-content: space-between; font-weight: 600; margin: 0 0 6px'],
    [`${EDITOR} .cbd-count`, 'font-weight: 400; font-size: .8rem; color: #666'],
    [`.dialog.${DIALOG_CLASS}`, `width: ${DIALOG_WIDTH}px; max-width: calc(100vw - 16px); box-sizing: border-box`],
    [`${EDITOR} .cbd-divider`, `border-top: 1px solid ${RULE_COLOR}; margin: 12px 0 0; padding-top: 10px`],
    [`${EDITOR} .cbd-note`, 'margin: 6px 0'],
    [`${EDITOR} .cbd-pulldowns`, `display: grid; gap: 8px 12px; grid-template-columns: repeat(auto-fit, minmax(${PULLDOWN_MIN}px, 1fr)); margin: 0 0 10px`],
    [`${EDITOR} .cbd-pulldown`, 'display: flex; flex-direction: column; gap: 4px; min-width: 0; margin: 0; padding: 0; font-weight: 600; text-align: left'],
    [`${EDITOR} .cbd-columns`, `display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(${COLUMN_MIN}px, 1fr))`],
    [`${EDITOR} .cbd-column`, 'min-width: 0'],
    [`${EDITOR} .cbd-button`, 'background: #f1eff5; color: #333; border: 1px solid #cfc9db; border-radius: 8px; font-size: .9rem; font-weight: 500; padding: 0 14px; height: 34px; line-height: 32px; margin: 0; cursor: pointer'],
    [`${EDITOR} .cbd-small`, `padding: 0 10px; height: ${SMALL_BUTTON_SIZE}px; line-height: ${SMALL_BUTTON_SIZE - 2}px`],
    [`${EDITOR} [data-act="remove"]`, `flex: none; width: ${SMALL_BUTTON_SIZE}px; padding: 0; color: #c0392b; font-size: 1.1rem`],
    [`${EDITOR} [data-digit="0"]`, 'grid-column: 2'],
    [`${EDITOR} .cbd-group`, `margin: 6px 0; padding: 4px 8px; border: 1px solid ${RULE_COLOR}; border-radius: 8px`],
    [`${EDITOR} .cbd-group-head`, 'display: flex; align-items: center; gap: 8px'],
    [`${EDITOR} .cbd-row`, 'flex: 1; min-width: 0; display: flex; align-items: center; justify-content: flex-start; gap: 8px; background: none; border: 0; margin: 0; padding: 2px 0; height: auto; width: auto; font-size: .9rem; cursor: pointer; text-align: left'],
    [`${EDITOR} [data-role="swatch"]`, 'flex: none; display: inline-block; box-sizing: border-box; width: 24px; height: 24px; border-radius: 3px; border: 1px solid #888'],
    [`${EDITOR} .cbd-digit-chips`, 'display: flex; flex-wrap: wrap; gap: 3px; min-width: 0'],
    [`${EDITOR} .cbd-digit-chip`, 'display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; width: 20px; height: 20px; border-radius: 4px; background: #f1eff5; box-shadow: inset 0 0 0 1px #cfc9db; font-size: 12px; font-weight: 600; line-height: 1; color: #333'],
    [`${EDITOR} .cbd-group-body`, 'display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; padding: 8px 0 4px'],
    [`${EDITOR} [data-act="digit"]`, `position: relative; width: ${NUMPAD_KEY}; padding: 0`],
    [`${EDITOR} [data-role="holder"]`, 'position: absolute; top: 2px; right: 2px; width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 0 1px #fff, 0 0 0 2px #000'],
    [`${EDITOR} [data-role="numpad"]`, `display: grid; grid-template-columns: repeat(3, ${NUMPAD_KEY}); gap: 4px`],
    [`${EDITOR} .cbd-palette-head`, 'margin-bottom: 6px'],
    [`${EDITOR} select[data-act="page"], ${EDITOR} .cbd-pulldown select`, `font-size: .95rem; padding: 4px 28px 4px 10px; border: 1px solid #b9b0c9; border-radius: 6px; background: #fff ${PULLDOWN_ARROW} no-repeat right 10px center; appearance: none; color: #222`],
    [`${EDITOR} .cbd-swatches`, `display: grid; gap: 6px; grid-template-columns: repeat(${PAGE_COLUMNS}, ${SWATCH_SIZE})`],
    [`${EDITOR} .cbd-zero`, 'margin-top: 6px'],
    [`${EDITOR} [data-empty="slot"]`, `display: block; width: ${SWATCH_SIZE}; height: ${SWATCH_SIZE}`],
    [`${EDITOR} [data-act="color"]`, `box-sizing: border-box; display: block; width: ${SWATCH_SIZE}; height: ${SWATCH_SIZE}; margin: 0; padding: 0; border-radius: 3px; border: 1px solid #888`],
    [`${EDITOR} [data-act="color"][aria-pressed="true"]`, 'border: 2px solid #fff; outline: 3px solid #000'],
    [`${EDITOR} [data-role="chosen"]`, 'display: inline-block; box-sizing: border-box; width: 1.6em; height: 1.6em; border-radius: 3px; vertical-align: middle; border: 1px solid #888'],
    [`${EDITOR} .cbd-unset`, 'border-style: dashed'],
    [`${EDITOR} [role="radiogroup"]`, 'display: flex; flex-direction: column; gap: 6px'],
    [`${EDITOR} .cbd-profile`, `cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 8px; box-shadow: inset 0 0 0 1px ${IDLE_RING}`],
    [`${EDITOR} .cbd-profile[aria-checked="true"]`, `background: ${ACTIVE_FILL}; box-shadow: inset 0 0 0 1.5px ${ACTIVE_RING}`],
    [`${EDITOR} [data-role="handle"]`, `cursor: grab; touch-action: none; user-select: none; color: ${MUTED}; font-size: 18px; line-height: 1`],
    [`${EDITOR} .cbd-chips`, 'display: flex; gap: 3px; flex: none'],
    [`${EDITOR} .cbd-name`, 'flex: 1; min-width: 0; overflow-wrap: anywhere; text-align: left; font-size: .9rem; font-weight: 400'],
    [`${EDITOR} .cbd-new`, 'margin: 8px 0'],
    // Looks like the row's name until focused: no border or fill, then the box shows.
    [`${EDITOR} [data-role="profile-name"]`, 'box-sizing: border-box; flex: 1; width: auto; min-width: 0; padding: 4px 6px; margin: 0; font-size: .9rem; font-weight: 600; background: transparent; border: 1px solid transparent; border-radius: 6px; box-shadow: none; color: inherit'],
    [`${EDITOR} [data-role="profile-name"]:focus`, `background: #fff; border-color: ${ACTIVE_RING}; outline: none`],
    [`${EDITOR} .cbd-profile .cbd-small`, 'flex: none; padding: 0 8px'], [`${EDITOR} .cbd-profile [data-role="handle"]`, 'flex: none; margin-right: -2px'],
    [`${EDITOR} .cbd-chip, ${MENU} .cbd-chip`, 'display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.25); font-family: sans-serif; font-weight: 600; line-height: 1'],
    [OPTIONS, `display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; border-top: 1px solid ${RULE_COLOR}; padding: 14px 4px 2px; margin-top: 8px; box-sizing: border-box; width: 100%`],
    [`${OPTIONS} button`, 'background: #f1eff5; color: #333; border: 1px solid #cfc9db; border-radius: 8px; font-size: 1rem; padding: 0 22px; height: 38px; line-height: 36px; margin: 0; width: auto; min-width: 0; flex: none; cursor: pointer'],
    [`${OPTIONS} button[data-role="save"]`, 'background: #6b3fa0; color: #fff; border: 1px solid #5a3489; font-weight: 600']
  ].map(([selector, declarations]) => `${selector} {\n  ${declarations.split('; ').join(';\n  ')};\n}`).join('\n')

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, parseColor, darkenColor, buildDigitCss, digitOfText, circleFor, inkMiddle, CIRCLE_CSS, DIGIT_ATTR, LIGHTNESS_FACTOR, copiedSettings, pastedSettings, pasteReport, installButton, iconHtml, modeLabelHtml, nextMode, startingMode, planClear, colorSteps, planColoring, planCellColors, planSwitch, groupKeys, isEntryAction, entrySignature, changedIndices, readCentreMarks, toPlanCell, assignDigit, editGroupsFor, openGroupAfter, rowAfterKey, normalizeGroups, stateFromStored, withAddedPreloads, copyProfile, renameProfile, deleteProfile, moveProfile, indexAfterDelete, indexAfterMove, setActive, setProfileGroups, activeGroups, digitGroups, iconGroups, isSynced, usesDigitColors, setSync, setDigitActive, setUseDigitColors, digitChoice, chooseDigit, allowedMode, dropIndex, iconLayout, inkFor, isVisibleColor, layoutPages, layoutColors, initialPage, renderEditor, renderPulldowns, renderTitle, renderProfiles, renderMenu, STYLE_CSS, PRELOADS, MAX_PROFILES, MAX_NAME_LENGTH, ICON_TOP, ARROW_START, ICON_MAX_GROUPS, CHIP_MAX_GROUPS }
  }
  // The match also covers other crackingthecryptic.com pages, which have no Framework.
  if (typeof Framework === 'undefined') return
  if (!Framework.getApp) {
    console.warn('color-by-digit: SudokuPad\'s Framework has no getApp, so nothing was changed')
    return
  }

  function readPages () {
    const tool = Framework.app && Framework.app.tools && Framework.app.tools.colour
    const palette = tool && tool.palette
    if (!palette || !Array.isArray(palette.pages)) return []
    return layoutPages(palette.pages, tool.currentPage, readColor)
  }

  const saveState = (state) => Framework.setData(PROFILES_KEY, state)
  const loadState = () => stateFromStored(Framework.getData(PROFILES_KEY), Framework.getData(LEGACY_GROUPS_KEY))

  function addPreloadsOnce () {
    for (const { key, names } of ADDED_PRELOADS) {
      if (Framework.getData(key) === true) continue
      const state = loadState()
      const added = withAddedPreloads(state, names)
      if (added.profiles.length !== state.profiles.length) saveState(added)
      Framework.setData(key, true)
    }
  }
  const loadGroups = () => activeGroups(loadState())

  // The raw `--cell-color-<key>` value can be any CSS color, so it is resolved on a probe.
  function readColor (key) {
    const raw = window.getComputedStyle(document.documentElement).getPropertyValue(`--cell-color-${key}`).trim()
    if (!isVisibleColor(raw)) return ''
    const probe = document.createElement('span')
    probe.style.color = raw
    if (probe.style.color === '') return ''
    document.body.appendChild(probe)
    const resolved = window.getComputedStyle(probe).color
    probe.remove()
    return resolved
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
    const first = allCells(app)
    const ops = makeOps(first.map(toPlanCell))
    if (ops.length === 0) return
    const run = () => {
      runColorOps(app, first, ops)
      const cells = allCells(app)
      runColorOps(app, cells, makeOps(cells.map(toPlanCell)))
    }
    if (app.puzzle.inGroup) run()
    else inOneUndoStep(app, run)
  }

  const colorEnteredCells = (app) => recolor(app, (plans) => planCellColors(plans, loadGroups(), enteredIndices(plans)))

  let mode = 'off'

  const BUTTON = '#control-colorbydigit'
  const ARROW = `${BUTTON} [data-role="menu"]`
  // Loading progress resets the board, so a pass before it would be wiped.
  function whenProgressLoaded (app, fn) {
    if (allCells(app).length > 0) fn()
    else app.puzzle.addEventListener('progressloaded', fn, { once: true })
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

  // Rebuilt each time, so a circle never outlives its mark, its conflict or a mode that colors digits.
  function syncCircles () {
    const group = circlesGroup()
    if (!group) return
    const conflicts = colorsDigits(mode) ? document.querySelectorAll(MARK_SELECTORS.map((s) => `${s}.conflict`).join(',')) : []
    group.replaceChildren(...[...conflicts].map((mark) => {
      const { cx, cy, r } = circleFor(markMiddle(mark, group))
      const circle = document.createElementNS(SVG_NS, 'circle')
      circle.setAttribute('cx', cx)
      circle.setAttribute('cy', cy)
      circle.setAttribute('r', r)
      return circle
    }))
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
      window.requestAnimationFrame(() => { queued = false; syncDigits() })
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

  // The palette can change after the button was drawn, so the icon and the digit shades are drawn from it again.
  function redraw () {
    const icon = document.querySelector(`${BUTTON} .icon`)
    if (icon) icon.outerHTML = iconHtml(mode, iconGroups(loadState(), mode), readColor)
    showDigitColors()
  }

  // Leaving cell coloring takes the colors of `keys`, the group keys to take off, off every cell.
  function setMode (app, next, keys = groupKeys(loadGroups())) {
    const was = mode
    mode = next
    Framework.setData(MODE_KEY, next)
    redraw()
    if (colorsCells(next) && !colorsCells(was)) colorEnteredCells(app)
    if (!colorsCells(next) && colorsCells(was)) recolor(app, (plans) => planClear(plans, keys))
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
  // group; opening a second would end it early. Undo, redo, replays and loading progress bypass app.act.
  function installCellColoring (app) {
    const act = app.act
    app.act = function (action) {
      if (!colorsCells(mode) || !isEntryAction(action)) return act.call(this, action)
      const touched = [...app.puzzle.selectedCells]
      if (!touched.some((cell) => mayChange(action, cell))) return act.call(this, action)
      const cells = allCells(app)
      const indices = touched.map((cell) => cells.indexOf(cell))
      const before = touched.map((cell) => entrySignature(toPlanCell(cell)))
      const enter = () => {
        const result = act.call(this, action)
        const changed = changedIndices(before, touched.map((cell) => entrySignature(toPlanCell(cell)))).map((i) => indices[i])
        recolor(app, (plans) => planCellColors(plans, loadGroups(), changed))
        return result
      }
      return app.puzzle.inGroup ? enter() : inOneUndoStep(app, enter)
    }
    app.on('restarted', () => { if (colorsCells(mode)) colorEnteredCells(app) })
  }

  let menu = null

  function addStyle () {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLE_CSS
    document.head.appendChild(style)
  }

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
    menu.style.cssText = 'position:fixed;z-index:10000;width:250px;box-sizing:border-box;padding:6px;border-radius:12px;background:#fff;color:#1d1b26;' +
      'box-shadow:0 10px 30px rgba(30,20,60,.28),0 0 0 1px rgba(0,0,0,.08);font:15px/1.2 sans-serif;text-align:left;user-select:none'
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
    document.addEventListener('mousedown', (event) => {
      if (onButtonProper(event)) event.stopPropagation()
      if (onArrow(event) || onButtonProper(event) || within(event, MENU)) event.preventDefault()
    }, true)
    document.addEventListener('click', (event) => {
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
    document.addEventListener('touchstart', (event) => {
      if (onArrow(event)) toggleMenu(event)
      else if (onButtonProper(event)) { event.preventDefault(); event.stopPropagation() }
    }, { capture: true, passive: false })
    document.addEventListener('contextmenu', (event) => {
      if (!within(event, BUTTON)) return
      event.preventDefault()
      if (!menu) openMenu()
    }, true)
    let hold = null
    const endHold = () => {
      clearTimeout(hold)
      hold = null
    }
    document.addEventListener('pointerdown', (event) => {
      if (menu && !within(event, MENU) && !onArrow(event)) closeMenu()
      endHold()
      if (!onButtonProper(event) || (event.pointerType === 'mouse' && event.button !== 0)) return
      const { clientX, clientY } = event
      const moved = (e) => Math.hypot(e.clientX - clientX, e.clientY - clientY) > HOLD_SLOP
      const watch = (e) => { if (moved(e)) endHold() }
      document.addEventListener('pointermove', watch)
      hold = setTimeout(() => {
        hold = null
        openMenu()
      }, HOLD_MS)
      const stop = (e) => {
        if (hold !== null && e.type === 'pointerup') setMode(app, nextMode(mode, usesDigitColors(loadState())))
        endHold()
        document.removeEventListener('pointermove', watch)
        document.removeEventListener('pointerup', stop, true)
        document.removeEventListener('pointercancel', stop, true)
      }
      document.addEventListener('pointerup', stop, true)
      document.addEventListener('pointercancel', stop, true)
    }, true)
    document.addEventListener('keydown', (event) => {
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
    const pages = readPages()
    const colors = layoutColors(pages)
    let savedState = loadState()
    let draft = savedState
    let draftMode = mode
    let selected = draft.active
    // The selected profile's name when it was selected: an emptied name field keeps it.
    let keptName = draft.profiles[selected].name
    addStyle()
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: renderTitle(VERSION) },
        { tag: 'text', innerHTML: `<div id="${EDITOR_ID}"></div>` },
        {
          tag: 'options',
          options: [
            { tag: 'button', content: 'Cancel', action: 'close' },
            { tag: 'button', content: SAVE_LABEL, handler: () => { saveDialog(app, savedState, draft, draftMode); Framework.closeDialog() } }
          ]
        }
      ]
    })
    const box = document.getElementById(EDITOR_ID)
    if (!box) return
    const dialog = box.closest('.dialog')
    if (dialog) dialog.classList.add(DIALOG_CLASS)
    const row = dialog && dialog.querySelector('.dialog-options')
    if (row) {
      row.classList.add(DIALOG_CLASS)
      row.querySelectorAll('button').forEach((b) => { if (b.textContent.trim() === SAVE_LABEL) b.dataset.role = 'save' })
    }
    let shown = []
    let open = null
    const draw = () => {
      const { groups } = draft.profiles[selected]
      groups.forEach((g, i) => { if (shown[i] === undefined) shown[i] = initialPage(pages, g.key) })
      box.innerHTML = renderEditor({ groups, pages, shown, pulldownsHtml: renderPulldowns(draft, draftMode), profilesHtml: renderProfiles(draft, readColor, selected), open })
    }
    const reshow = (next, nextSelected = selected) => { draft = next; selected = nextSelected; keptName = draft.profiles[selected].name; shown = []; open = null }
    const newProfile = () => {
      const next = copyProfile(draft, selected)
      if (next === draft) return
      reshow(next, next.profiles.length - 1)
      draw()
      const nameBox = box.querySelector('[data-role="profile-name"]')
      nameBox.focus()
      nameBox.select()
    }
    draw()
    wireCopyPaste(box.closest('.dialog'), (values) => {
      ADDED_PRELOADS.forEach(({ key }) => { if (key in values) Framework.setData(key, values[key]) })
      saveDialog(app, savedState, values[PROFILES_KEY] ?? savedState, values[MODE_KEY] ?? mode)
      savedState = loadState()
      reshow(savedState, savedState.active)
      draftMode = mode
      draw()
    })
    // Typing renames the draft, its row and the pulldowns' options in place, so the name field keeps the focus.
    box.addEventListener('input', (event) => {
      if (!event.target.matches('[data-role="profile-name"]')) return
      draft = renameProfile(draft, selected, event.target.value.trim() === '' ? keptName : event.target.value)
      const name = draft.profiles[selected].name
      box.querySelector(`[data-role="profile-row"][data-index="${selected}"]`).setAttribute('aria-label', name)
      box.querySelectorAll(`.cbd-pulldown option[data-index="${selected}"]`).forEach((option) => { option.textContent = name })
    })
    // Enter, or leaving the box, shows the name the draft holds: a blank box shows the kept name again.
    const settleName = (nameBox) => { nameBox.value = draft.profiles[selected].name }
    box.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !event.target.matches('[data-role="profile-name"]')) return
      event.preventDefault()
      event.stopPropagation()
      settleName(event.target)
    })
    box.addEventListener('change', (event) => {
      if (event.target.matches('[data-role="profile-name"]')) { settleName(event.target); return }
      const pulldown = event.target.closest('select[data-role]')
      if (pulldown) { choose(pulldown.dataset.role, pulldown.value); return }
      const el = event.target.closest('select[data-act="page"]')
      if (!el) return
      shown[Number(el.dataset.group)] = Number(el.value)
      draw()
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
      handle.setPointerCapture(event.pointerId)
      const move = (e) => {
        to = dropIndex(mids, from, e.clientY)
        rows.forEach((row, i) => { row.style.outline = i === to && to !== from ? `2px solid ${PURPLE}` : '' })
      }
      const finish = (e) => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', finish)
        handle.removeEventListener('pointercancel', finish)
        if (e.type === 'pointerup' && to !== from) reshow(moveProfile(draft, from, to), indexAfterMove(selected, from, to))
        draw()
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', finish)
      handle.addEventListener('pointercancel', finish)
    })
    const selectRow = (index, refocus) => {
      reshow(draft, index)
      draw()
      if (refocus) box.querySelector(`[data-act="select"][data-index="${index}"]`).focus()
    }
    // None moves the draft mode at once, so the Mode pulldown never shows a mode the draft does not hold: a select fires no change for the option it already shows.
    const choose = (role, value) => {
      if (role === 'mode-draft') draftMode = value
      else if (role === 'cell-profile') draft = setActive(draft, Number(value))
      else {
        draft = chooseDigit(draft, value)
        draftMode = allowedMode(draftMode, usesDigitColors(draft))
      }
      draw()
      box.querySelector(`select[data-role="${role}"]`).focus()
    }
    box.addEventListener('keydown', (event) => {
      if (!event.target.matches('[data-act="select"]')) return
      const target = rowAfterKey(event.key, Number(event.target.dataset.index), draft.profiles.length)
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
      const el = event.target.closest('button[data-act]')
      if (!el) return
      event.preventDefault()
      event.stopPropagation()
      const act = el.dataset.act
      if (act === 'new-profile') { newProfile(); return }
      if (act === 'delete') {
        const index = Number(el.dataset.index)
        const next = deleteProfile(draft, index)
        if (next === draft) return
        reshow(next, indexAfterDelete(selected, index, draft.profiles.length))
      } else {
        const before = draft.profiles[selected].groups
        const group = Number(el.dataset.group)
        const edit = editGroupsFor(before, shown, act, { group, key: el.dataset.key, digit: el.dataset.digit }, colors)
        draft = setProfileGroups(draft, selected, edit.groups)
        shown = edit.shown
        open = openGroupAfter(open, act, group, before.length, edit.groups.length)
      }
      draw()
    })
  }

  Framework.getApp().then((app) => {
    const openEditor = () => {
      Framework.closeDialog()
      setTimeout(() => openDialog(app), 0)
    }
    // The settings entry goes first: a failure installing the button must not cost the editor.
    Framework.addSetting({
      tag: 'button',
      name: 'colorbydigit',
      group: SETTINGS_GROUP,
      content: 'Color by Digit',
      handler: openEditor
    })
    addPreloadsOnce()
    const state = loadState()
    mode = allowedMode(startingMode(Framework.getData(MODE_KEY), Framework.getData(AUTO_KEY)), usesDigitColors(state))
    installButton(Framework, app, mode, iconGroups(state, mode), readColor)
    installCellColoring(app)
    listenForButton(app, openEditor)
    watchBoard()
    // The puzzle's own palette is in the page's colors once it has loaded: the icon and the digit shades show those.
    whenProgressLoaded(app, redraw)
    if (colorsCells(mode)) whenProgressLoaded(app, () => colorEnteredCells(app))
  })
})()
