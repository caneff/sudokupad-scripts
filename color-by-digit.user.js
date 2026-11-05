// ==UserScript==
// @name         SudokuPad Color by Digit
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.5.3
// @description  Adds a button that colors every cell holding a digit, and every empty cell whose centre marks all belong to one group, using the groups of palette colors in the active profile. A menu on the button switches profile, an AUTO box on it keeps the colors in step as digits and centre marks change, and a settings dialog edits the profiles.
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

  // Shown in the options dialog, and the same as @version above. The script cannot read its own header
  // (GM_info is absent when it runs without Tampermonkey), so the number is kept here too.
  const VERSION = '0.5.3'
  // The settings group the entry goes in; SudokuPad declares it, and the dialog starts it collapsed.
  const SETTINGS_GROUP = 'experimental'
  // The groups saved before profiles existed. Read when no profiles are saved; never written or removed.
  const LEGACY_GROUPS_KEY = 'ColorByDigit_groups'
  // The profiles: { profiles: [{ name, groups }], active: index }.
  const PROFILES_KEY = 'ColorByDigit_profiles'
  const MAX_PROFILES = 4
  const MAX_NAME_LENGTH = 24
  const CUSTOM_NAME = 'Custom'
  // Whether auto mode is on: true or false, absent until first set.
  const AUTO_KEY = 'ColorByDigit_auto'
  // SudokuPad's numpad order for the digit buttons of the dialog: 1 to 9 in rows of three, then 0 alone
  // in the middle column.
  const NUMPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
  const NUMPAD_KEY = '2.4em'
  const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

  // A group is one palette key plus the digits that get it.
  const PRELOADS = {
    'Low/5/High': [
      { key: '1', digits: ['0', '1', '2', '3', '4'] },
      { key: '5', digits: ['5'] },
      { key: '9', digits: ['6', '7', '8', '9'] }
    ],
    'Odd/Even': [
      { key: '1', digits: ['1', '3', '5', '7', '9'] },
      { key: '2', digits: ['0', '2', '4', '6', '8'] }
    ]
  }

  const cloneGroups = (groups) => groups.map((g) => ({ key: g.key, digits: [...g.digits] }))

  // The key every mark shares, or undefined when there are no marks, a mark is not a digit or
  // has no group, or the marks span two groups.
  function sharedKey (marks, keyOfDigit) {
    const keys = new Set(marks.map((m) => keyOfDigit[String(m)]))
    return keys.size === 1 ? [...keys][0] : undefined
  }

  const keyOfDigitMap = (groups) => {
    const keyOfDigit = Object.create(null)
    groups.forEach((g) => g.digits.filter((d) => DIGITS.includes(d)).forEach((d) => { keyOfDigit[d] = g.key }))
    return keyOfDigit
  }

  // The key of the one group a cell belongs to (a pure cell), or undefined. A given or entered digit
  // decides the key; a cell with neither takes the key its `centre` marks (digit strings) all share.
  function pureKey (cell, keyOfDigit) {
    const placed = String(cell.given || cell.value || '')
    return placed === '' ? sharedKey(cell.centre || [], keyOfDigit) : keyOfDigit[placed]
  }

  // Which cells get which key. Pure: cells in, [{index, key}] out.
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

  const groupKeys = (groups) => [...new Set(groups.map((g) => g.key))]

  const givenIndices = (cells) => cells.flatMap((cell, index) => (String(cell.given || '') === '' ? [] : [index]))

  // An action that can change a cell's digit or centre marks, as SudokuPad names them: `value` (digit),
  // `candidates` (centre mark) and `clear` of anything but colors and pen marks. Corner marks
  // (`pencilmarks`) and colors never start auto mode. Anything that is not an action object is not one.
  function isEntryAction (action) {
    if (!action) return false
    if (action.type === 'value' || action.type === 'candidates') return true
    return action.type === 'clear' && action.arg !== 'colour' && action.arg !== 'pen'
  }

  // What auto mode watches in a plan cell: the entered digit and the centre marks, in any order.
  const entrySignature = (cell) => JSON.stringify([String(cell.value || ''), [...(cell.centre || [])].sort()])

  // The indices whose signature differs between two readings of the same cells.
  const changedIndices = (before, after) => before.flatMap((sig, i) => (sig === after[i] ? [] : [i]))

  // What auto mode does to the listed cells: [{action, key, indices}], removals first. A pure cell
  // gets its group's key and loses every other managed key; a cell that is not pure loses every
  // managed key; a color outside `managedKeys` stays. `managedKeys` defaults to the groups' keys, and
  // is wider when a Save drops an old group whose color must come off too.
  function planAuto (cells, groups, indices, managedKeys = groupKeys(groups)) {
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

  // The centre marks SudokuPad shows on a cell, read as its own solver does
  // (SolverTool.getCellOptions): none when the cell hides them, as a given does.
  function readCentreMarks (cell) {
    return cell.propVisible('centre') ? cell.propGet('centre') : []
  }

  // The fields of a SudokuPad cell that planColoring reads, and only those: corner marks stay out.
  function toPlanCell (cell) {
    return { given: cell.given, value: cell.value, colours: cell.colours, centre: readCentreMarks(cell) }
  }

  // Puts a digit in one group, or takes it out if that group already holds it.
  function assignDigit (groups, groupIndex, digit) {
    const had = groups[groupIndex].digits.includes(digit)
    return groups.map((g, i) => {
      const rest = g.digits.filter((d) => d !== digit)
      if (i !== groupIndex) return { key: g.key, digits: rest }
      const digits = had ? rest : [...rest, digit].sort()
      return { key: g.key, digits }
    })
  }

  // The dialog's edit of the groups for one button: `act` is 'color', 'digit', 'remove', 'clear' or
  // 'add-group', `group` the group index, `key` the chosen palette key, `digit` the chosen digit, and
  // `colors` the visible palette colors ([{ key }]). Returns the new { groups, shown }, `shown` being the page each
  // group shows, which follows a removal; any other act returns both unchanged. A new group takes the
  // first color no group has, else the first color, and none when there are no colors.
  function editGroupsFor (groups, shown, act, { group, key, digit }, colors) {
    switch (act) {
      case 'color': return { groups: groups.map((g, j) => (j === group ? { key, digits: g.digits } : g)), shown }
      case 'digit': return { groups: assignDigit(groups, group, digit), shown }
      case 'remove': return { groups: groups.filter((_, j) => j !== group), shown: shown.filter((_, j) => j !== group) }
      case 'clear': return { groups: [], shown: [] }
      case 'add-group': {
        const used = groups.map((g) => g.key)
        const free = colors.find((c) => !used.includes(c.key)) || colors[0]
        return { groups: free ? [...groups, { key: free.key, digits: [] }] : groups, shown }
      }
      default: return { groups, shown }
    }
  }

  const ARROW_STEP = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }
  // The row a key on a profile row goes to: Enter and Space stay on the row, an arrow moves to the next or
  // previous row and wraps at both ends; any other key gives null.
  function rowAfterKey (key, index, count) {
    if (key === 'Enter' || key === ' ') return index
    if (ARROW_STEP[key]) return (index + ARROW_STEP[key] + count) % count
    return null
  }

  // Saved data is untrusted: returns clean groups, or null when it is not a list of groups.
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

  // A profile as saved data may hold it: a name that is not blank and clean groups, else null.
  function normalizeProfile (data) {
    if (!data || typeof data.name !== 'string' || data.name.trim() === '') return null
    const groups = normalizeGroups(data.groups)
    return groups && { name: data.name.trim().slice(0, MAX_NAME_LENGTH), groups }
  }

  // Saved profiles are untrusted: a clean state, or null when no profile is usable. A profile that is
  // not usable drops out and the rest are kept; more than MAX_PROFILES drop off the end. The active index
  // follows its profile, and is the first when that profile is gone or the index is no profile.
  function normalizeState (data) {
    if (!data || !Array.isArray(data.profiles)) return null
    const kept = data.profiles.slice(0, MAX_PROFILES).map((profile, index) => ({ profile: normalizeProfile(profile), index })).filter((entry) => entry.profile)
    if (kept.length === 0) return null
    const active = kept.findIndex((entry) => entry.index === data.active)
    return { profiles: kept.map((entry) => entry.profile), active: Math.max(active, 0) }
  }

  const sameGroups = (a, b) => JSON.stringify(a) === JSON.stringify(b)

  const cloneProfile = (profile) => ({ name: profile.name, groups: cloneGroups(profile.groups) })

  const preloadProfiles = () => Object.keys(PRELOADS).map((name) => ({ name, groups: cloneGroups(PRELOADS[name]) }))

  // What the profiles start as: the saved profiles; else the preloads with Low/5/High active; else, for
  // groups saved before profiles existed, those groups as the active profile (named after the preload they
  // equal, which they replace in the list, else Custom, first) with the other preloads beside it.
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

  const activeGroups = (state) => state.profiles[state.active].groups

  // A copy of the active profile joins the end under `name`. Nothing at MAX_PROFILES or with a blank name.
  function addProfile (state, name) {
    const trimmed = String(name).trim().slice(0, MAX_NAME_LENGTH)
    if (state.profiles.length >= MAX_PROFILES || trimmed === '') return state
    const copy = { name: trimmed, groups: cloneGroups(activeGroups(state)) }
    return { profiles: [...state.profiles.map(cloneProfile), copy], active: state.active }
  }

  // Drops a profile, never the last. Deleting the active one makes the next one active (the previous
  // when it was last); deleting one before it keeps the same profile active.
  function deleteProfile (state, index) {
    if (state.profiles.length <= 1 || !state.profiles[index]) return state
    const profiles = state.profiles.filter((_, i) => i !== index).map(cloneProfile)
    const active = index < state.active ? state.active - 1 : Math.min(state.active, profiles.length - 1)
    return { profiles, active }
  }

  // Moves the profile at `from` so it ends at index `to`; the active profile stays the same profile.
  function moveProfile (state, from, to) {
    if (from === to) return state
    const order = state.profiles.map((_, i) => i)
    order.splice(to, 0, ...order.splice(from, 1))
    return { profiles: order.map((i) => cloneProfile(state.profiles[i])), active: order.indexOf(state.active) }
  }

  function setActive (state, index) {
    return state.profiles[index] ? { profiles: state.profiles.map(cloneProfile), active: index } : state
  }

  function setActiveGroups (state, groups) {
    return { profiles: state.profiles.map((p, i) => (i === state.active ? { name: p.name, groups: cloneGroups(groups) } : cloneProfile(p))), active: state.active }
  }

  // Where a dragged row ends up: the number of the other rows whose middle (`mids`, top to bottom) is
  // above the pointer at `y`.
  const dropIndex = (mids, from, y) => mids.filter((mid, i) => i !== from && mid < y).length

  // The button's icon is drawn in 100 by 100 units; the AUTO label takes its top ICON_TOP, and the menu
  // arrow box its bottom right corner below ARROW_START.
  const ICON_TOP = 22
  const ARROW_START = 78
  const ICON_MAX_GROUPS = 4

  // The digit that stands for a group on its colored cell, over its digits with 0 left out: the lowest
  // when all are below 5, the highest when all are above 5, else the middle (the lower of the two middle
  // ones on an even count). A group of only 0 shows 0, and a group with no digits shows ''.
  function shownDigit (digits) {
    const sorted = [...digits].sort()
    const nonZero = sorted.filter((d) => d !== '0')
    if (nonZero.length === 0) return sorted[0] || ''
    if (nonZero.every((d) => d < '5')) return nonZero[0]
    if (nonZero.every((d) => d > '5')) return nonZero[nonZero.length - 1]
    return nonZero[Math.ceil(nonZero.length / 2) - 1]
  }

  // The cells of the button's icon for the first ICON_MAX_GROUPS groups: [{ key, digit, x, y, size }] in
  // the icon's units, `digit` the group's shownDigit. Up to three go in a row and four
  // as 2 by 2; none of them reaches the AUTO label or the arrow box.
  function iconLayout (groups) {
    const shown = groups.slice(0, ICON_MAX_GROUPS).map((g) => ({ key: g.key, digit: shownDigit(g.digits) }))
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

  // Black or white, whichever reads on `color` (a `#rgb`, `#rrggbb` or `rgb(a)` value); black when unreadable.
  function inkFor (color) {
    const v = String(color).trim().toLowerCase()
    let channels
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v)
    if (hex) {
      const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
      channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
    } else {
      const fn = /^rgba?\(([^)]*)\)$/.exec(v)
      channels = fn ? fn[1].split(/[,/\s]+/).filter(Boolean).slice(0, 3).map(Number) : []
    }
    if (channels.length !== 3 || channels.some(Number.isNaN)) return '#000'
    const [r, g, b] = channels
    return 0.299 * r + 0.587 * g + 0.114 * b < 140 ? '#fff' : '#000'
  }

  // Switching profile: the old groups' colors come off every cell and every pure cell gets its new
  // group's color. It is planAuto over every cell with both profiles' keys managed.
  function planSwitch (cells, oldGroups, newGroups) {
    return planAuto(cells, newGroups, everyIndex(cells), [...new Set([...groupKeys(oldGroups), ...groupKeys(newGroups)])])
  }

  // A CSS color the user can see: not empty, not `transparent`, not an alpha-0 spelling.
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

  // The AUTO box in the button's upper left: bold purple with an X in the box when on, light grey with an
  // empty box when off. A span with the checkbox role, not an <input>: a form control inside a <button>
  // takes focus from the puzzle and is swallowed by some browsers.
  function autoBoxHtml (on) {
    const color = on ? PURPLE : GREY
    return '<span data-role="auto" role="checkbox" aria-label="Auto mode" title="Auto mode" ' + `aria-checked="${Boolean(on)}" ` +
      'style="pointer-events:auto;position:absolute;left:-3px;top:-2px;display:flex;align-items:center;gap:2px;' +
      `font:${on ? 700 : 400} 9px/1 sans-serif;letter-spacing:.04em;white-space:nowrap;color:${color}">` +
      `<span data-role="auto-mark" style="box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:10px;height:10px;border:1.5px solid ${color};border-radius:2px;` +
      `font:700 8px/1 sans-serif">${on ? 'X' : ''}</span>AUTO</span>`
  }

  // The menu arrow box in the button's lower right.
  const ARROW_BOX_HTML = '<span data-role="menu" role="button" aria-haspopup="menu" aria-label="Color by digit profiles" title="Profiles" ' +
    'style="pointer-events:auto;position:absolute;right:-4px;bottom:-4px;box-sizing:border-box;width:14px;height:14px;' +
    `border:1.5px solid ${PURPLE};border-radius:3px;background:#fff;color:${PURPLE};font:700 7px/11px sans-serif;text-align:center">&#9660;</span>`

  const UNREADABLE_FILL = '#ccc'

  // One cell of the icon: the group's color with its shown digit in the ink that reads on it.
  function iconCellSvg ({ key, digit, x, y, size }, colorOf) {
    const color = colorOf(key)
    const fill = color || UNREADABLE_FILL
    return `<rect data-role="cell" data-key="${esc(key)}" x="${x}" y="${y}" width="${size}" height="${size}" rx="4" fill="${esc(fill)}" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/>` +
      `<text x="${x + size / 2}" y="${y + size * 0.72}" fill="${inkFor(color)}" font-family="sans-serif" font-size="${Math.round(size * 0.7)}" font-weight="bold" text-anchor="middle">${esc(digit)}</text>`
  }

  // The button's icon: one cell per group of the active profile (at most four) with its shown digit,
  // the AUTO box upper left and the menu arrow box lower right. SudokuPad's own app buttons put their
  // icon in <div class="icon">. `colorOf(key)` gives a palette key's CSS color, or '' when unreadable.
  const iconHtml = (autoOn, groups, colorOf) =>
    '<div class="icon" style="position:relative"><svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
    iconLayout(groups).map((cell) => iconCellSvg(cell, colorOf)).join('') +
    '</svg>' + autoBoxHtml(autoOn) + ARROW_BOX_HTML + '</div>'

  // The button goes in the bottom row (.controls-aux) beside Undo, Redo, Check and Select, where
  // SudokuPad lays it out and wraps it like theirs. SudokuPad binds button handlers only to
  // buttons present when the controls were built, so a button added later needs refreshControls
  // to get its onClick. A press on the button proper is handled by listenForButton before SudokuPad's
  // handler sees it, so `onClick` is what SudokuPad would run on a press that does reach it.
  function installButton (framework, app, onClick, autoOn, groups, colorOf) {
    framework.addAuxButton({ name: 'colorbydigit', title: 'Color by digit', content: iconHtml(autoOn, groups, colorOf), onClick })
    app.refreshControls()
  }

  // A cell color page has ten colors, one per SudokuPad color button: index 0, then indices 1-9 in rows of three.
  const PAGE_COLUMNS = 3
  const PAGE_BUTTONS = 10

  // Each cell color page as SudokuPad's color buttons show it: `rows` holds indices 1-9, three to a
  // row, and `zero` index 0. An entry is { key, value }, or null where the key is missing,
  // transparent or unreadable, so the empty space keeps every other color on its index.
  // `readColor(key)` gives the key's CSS color.
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

  // Every visible color of the laid-out pages, page by page, index 0 first.
  function layoutColors (pages) {
    return pages.flatMap((p) => [p.zero, ...p.rows.flat()]).filter(Boolean)
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  const SWATCH_SIZE = '44px'

  // One color of a page: a square button, ringed twice (white inside, black outside) when it
  // is the group's color so it shows on any swatch color. An index with no visible color is a spacer of the same size.
  function renderSwatch (slot, groupIndex, selectedKey) {
    if (!slot) return `<span data-empty="slot" style="display:block;width:${SWATCH_SIZE};height:${SWATCH_SIZE}"></span>`
    const selected = slot.key === selectedKey
    return `<button type="button" data-act="color" data-group="${groupIndex}" data-key="${esc(slot.key)}" ` +
      `title="${esc(slot.key)}" aria-pressed="${selected}" ` +
      `style="box-sizing:border-box;display:block;width:${SWATCH_SIZE};height:${SWATCH_SIZE};margin:0;padding:0;border-radius:3px;` +
      `background:${esc(slot.value)};` +
      (selected ? 'border:2px solid #fff;outline:3px solid #000' : 'border:1px solid #888') + '"></button>'
  }

  const pageLabel = (page) => `Page ${page.page + 1}${page.current ? ' (current)' : ''}`

  // The page a group opens on: the page that holds its color, the current page first when the
  // color is on several; the current page when no page holds it, and the first with none current.
  function initialPage (pages, key) {
    const holds = (p) => [p.zero, ...p.rows.flat()].some((slot) => slot && slot.key === key)
    const found = pages.find((p) => p.current && holds(p)) || pages.find(holds) || pages.find((p) => p.current)
    return found ? found.page : 0
  }

  // The group's color as a small square, so it shows while another page is open; dashed when
  // no page has a visible color for the key.
  function renderChosen (colors, key) {
    const color = colors.find((c) => c.key === key)
    const look = color ? `background:${esc(color.value)};border:1px solid #888` : 'border:1px dashed #888'
    return `<span data-role="chosen" title="${esc(key)}" style="display:inline-block;box-sizing:border-box;width:1.6em;height:1.6em;` +
      `border-radius:3px;vertical-align:middle;${look}"></span>`
  }

  // One group's page pulldown, its chosen color, and the shown page as a 3 by 3 grid with index 0 below.
  function renderPalette (pages, colors, groupIndex, key, shownPage) {
    if (pages.length === 0) return ''
    const page = pages[shownPage] || pages[0]
    const options = pages.map((p) => `<option value="${p.page}"${p === page ? ' selected' : ''}>${pageLabel(p)}</option>`).join('')
    const grid = 'display:grid;gap:6px;grid-template-columns:repeat(' + PAGE_COLUMNS + ',' + SWATCH_SIZE + ')'
    const swatches = page.rows.flat().map((slot) => renderSwatch(slot, groupIndex, key)).join('')
    const zero = page.zero ? `<div style="${grid};margin-top:6px">${renderSwatch(page.zero, groupIndex, key)}</div>` : ''
    return '<div style="margin-bottom:6px">' +
      `<select data-act="page" data-group="${groupIndex}" aria-label="Palette page" style="${PULLDOWN_LOOK}">${options}</select> ${renderChosen(colors, key)}</div>` +
      `<div style="${grid}">${swatches}</div>${zero}`
  }

  // The groups of a profile as small squares in their palette colors, each with its shown digit.
  function renderChips (groups, colorOf, size) {
    return iconLayout(groups).map(({ key, digit }) => {
      const color = colorOf(key)
      return `<span data-role="chip" title="${esc(key)}" style="display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:${size}px;height:${size}px;` +
        `border-radius:4px;background:${esc(color || UNREADABLE_FILL)};color:${inkFor(color)};box-shadow:inset 0 0 0 1px rgba(0,0,0,.25);` +
        `font:600 ${Math.round(size * 0.6)}px/1 sans-serif">${esc(digit)}</span>`
    }).join('')
  }

  // `css` with every declaration important: SudokuPad's own rules for the dialog's selects, buttons and
  // labels size them otherwise.
  const important = (css) => css.split(';').map((d) => `${d} !important`).join(';')
  // The dialog's look: a light grey button with a rounded border, a divider between sections, a purple
  // Save, and a pulldown with a purple arrow.
  const RULE_COLOR = '#e3dff0'
  const DIVIDER = `border-top:1px solid ${RULE_COLOR};margin:12px 0 0;padding-top:10px`
  const BUTTON_LOOK = 'background:#f1eff5;color:#333;border:1px solid #cfc9db;border-radius:8px;font-size:.9rem;font-weight:500;padding:0 14px;height:34px;line-height:32px;margin:0;cursor:pointer'
  // The small × buttons: the profile row's delete and the group box's remove share the 28px square.
  const SMALL_BUTTON_SIZE = 28
  const SMALL_BUTTON_LOOK = `${BUTTON_LOOK};padding:0 10px;height:${SMALL_BUTTON_SIZE}px;line-height:${SMALL_BUTTON_SIZE - 2}px`
  // The red × in a group box's upper right corner. The box keeps REMOVE_ROOM of right padding (the
  // button, its inset and a gap), so the button never sits over the pulldown or the numpad.
  const REMOVE_INSET = 8
  const REMOVE_ROOM = `${SMALL_BUTTON_SIZE + REMOVE_INSET + 4}px`
  const REMOVE_LOOK = `${SMALL_BUTTON_LOOK};position:absolute;top:${REMOVE_INSET}px;right:${REMOVE_INSET}px;width:${SMALL_BUTTON_SIZE}px;padding:0;color:#c0392b;font-size:1.1rem`
  // Percent-encoded, with no quotes, so the value sits inside a style="..." attribute.
  const PULLDOWN_ARROW = 'url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2710%27%20height=%276%27%3E%3Cpath%20d=%27M0%200l5%206%205-6z%27%20fill=%27%236b4fa0%27/%3E%3C/svg%3E)'
  const PULLDOWN_LOOK = important(`font-size:.95rem;padding:4px 28px 4px 10px;border:1px solid #b9b0c9;border-radius:6px;background:#fff ${PULLDOWN_ARROW} no-repeat right 10px center;appearance:none;color:#222`)
  const heading = (text, extra = '') => `<div style="display:flex;align-items:center;justify-content:space-between;font-weight:600;margin:0 0 6px">${text}${extra}</div>`
  const SAVE_LABEL = 'Save'
  const DIALOG_BUTTON_LOOK = 'border-radius:8px;font-size:1rem;padding:0 22px;height:38px;line-height:36px;margin:0;width:auto;min-width:0;flex:none;cursor:pointer'
  const SAVE_BUTTON_LOOK = `${DIALOG_BUTTON_LOOK};background:#6b3fa0;color:#fff;border:1px solid #5a3489;font-weight:600`
  const CANCEL_BUTTON_LOOK = `${DIALOG_BUTTON_LOOK};background:#f1eff5;color:#333;border:1px solid #cfc9db`
  // The bottom row under a divider, Cancel then Save at the right. The dialog builds the row; this styles it.
  function styleDialogButtons (dialog) {
    const row = dialog.querySelector('.dialog-options')
    if (!row) return
    row.style.cssText = important(`display:flex;flex-direction:row;align-items:center;justify-content:flex-end;gap:10px;border-top:1px solid ${RULE_COLOR};padding:14px 4px 2px;margin-top:8px;box-sizing:border-box;width:100%`)
    row.querySelectorAll('button').forEach((b) => {
      b.style.cssText = important(b.textContent.trim() === SAVE_LABEL ? SAVE_BUTTON_LOOK : CANCEL_BUTTON_LOOK)
    })
  }

  const MUTED = '#8a8496'
  // The active profile's row, in the dialog and in the menu, and an idle row's ring.
  const ACTIVE_FILL = '#f1ebfb'
  const ACTIVE_RING = '#b79be0'
  const ACTIVE_INK = '#5b2a9a'
  const IDLE_RING = '#e2dcea'

  // The dialog's profile list, a radio group: per row a drag handle, the colors, the name and a delete
  // button, and a click on the row makes it the active profile; then the name field and Add. `newName`
  // is the text in the name field.
  function renderProfiles (state, colorOf, newName) {
    const only = state.profiles.length <= 1
    const rows = state.profiles.map((profile, i) => {
      const active = i === state.active
      return `<div data-role="profile-row" data-act="activate" data-index="${i}" role="radio" aria-checked="${active}" tabindex="${active ? 0 : -1}" aria-label="${esc(profile.name)}" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:8px;` +
        (active ? `background:${ACTIVE_FILL};box-shadow:inset 0 0 0 1.5px ${ACTIVE_RING}` : `box-shadow:inset 0 0 0 1px ${IDLE_RING}`) + '">' +
        `<span data-role="handle" data-index="${i}" title="Drag to reorder" style="cursor:grab;touch-action:none;user-select:none;color:${MUTED};font-size:18px;line-height:1">&#8942;&#8942;</span>` +
        `<span style="display:flex;gap:3px;width:100px">${renderChips(profile.groups, colorOf, 22)}</span>` +
        `<span style="flex:1;text-align:left;font-weight:${active ? 600 : 400}">${esc(profile.name)}</span>` +
        `<button type="button" data-act="delete" data-index="${i}" style="${SMALL_BUTTON_LOOK}" aria-label="Delete profile ${esc(profile.name)}"${only ? ' disabled' : ''}>&#215;</button></div>`
    }).join('')
    const full = state.profiles.length >= MAX_PROFILES
    return heading('Profiles', `<span style="font-weight:400;font-size:.8rem;color:#666">${state.profiles.length} of ${MAX_PROFILES}</span>`) +
      `<div role="radiogroup" aria-label="Active profile" style="display:flex;flex-direction:column;gap:6px">${rows}</div>` +
      '<div style="display:flex;gap:8px;margin:8px 0">' +
      `<input type="text" data-role="new-name" maxlength="${MAX_NAME_LENGTH}" placeholder="New profile name" value="${esc(newName)}" aria-label="New profile name" style="flex:1;padding:6px 8px">` +
      `<button type="button" data-act="add" style="${BUTTON_LOOK}"${full ? ' disabled' : ''}>+ Add</button></div>`
  }

  // The menu above the button: its heading, a row per profile in the dialog's order (the active one
  // marked and highlighted), then Edit profiles. Rows are not focusable, so the keyboard stays with the puzzle.
  function renderMenu (state, colorOf) {
    const rows = state.profiles.map((profile, i) => {
      const active = i === state.active
      return `<div role="menuitemradio" data-act="pick" data-index="${i}" aria-checked="${active}" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;` +
        `${active ? `background:${ACTIVE_FILL};color:${ACTIVE_INK};font-weight:600` : ''}">` +
        `<span style="display:flex;gap:3px;width:92px">${renderChips(profile.groups, colorOf, 20)}</span><span data-role="name" style="flex:1">${esc(profile.name)}</span></div>`
    }).join('')
    return `<div style="font:600 11px/1 sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};padding:8px 10px 6px">Color by digit profile</div>${rows}` +
      '<div style="height:1px;background:#ece8f2;margin:4px 6px"></div>' +
      '<div role="menuitem" data-act="edit" style="padding:9px 10px;border-radius:8px;cursor:pointer;color:#5d5868">&#9881; Edit profiles…</div>'
  }

  // `shown[i]` is the page index group i shows; `auto` is the draft of the auto mode box; `profilesHtml`
  // is the profile list (renderProfiles), which goes above the groups.
  function renderEditor (groups, pages, shown, auto, profilesHtml) {
    const colors = layoutColors(pages)
    const rows = groups.map((g, i) => {
      const digits = NUMPAD_DIGITS.map((d) =>
        `<button type="button" data-act="digit" data-group="${i}" data-digit="${d}" ` +
        `style="${BUTTON_LOOK};width:${NUMPAD_KEY};padding:0;${d === '0' ? 'grid-column:2;' : ''}font-weight:${g.digits.includes(d) ? 'bold' : 'normal'};` +
        `opacity:${g.digits.includes(d) ? 1 : 0.4}">${d}</button>`).join('')
      return `<div style="position:relative;margin:8px 0;padding:8px ${REMOVE_ROOM} 8px 8px;border:1px solid ${RULE_COLOR};border-radius:8px;display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start">` +
        `<div>${renderPalette(pages, colors, i, g.key, shown[i])}</div>` +
        `<div data-role="numpad" style="display:grid;grid-template-columns:repeat(3,${NUMPAD_KEY});gap:4px">${digits}</div>` +
        `<button type="button" data-act="remove" data-group="${i}" title="Remove group" aria-label="Remove group" style="${REMOVE_LOOK}">&#215;</button></div>`
    }).join('')
    const note = colors.length === 0 ? '<div style="margin:6px 0">No palette colors found: groups cannot be added.</div>' : ''
    const autoBox = '<div style="display:flex;align-items:center;gap:8px;margin:0 0 4px">' +
      `<input type="checkbox" id="color-by-digit-auto-draft" data-role="auto-draft"${auto ? ' checked' : ''} aria-label="Auto mode" style="margin:0">` +
      '<label for="color-by-digit-auto-draft" style="width:auto !important;min-width:0 !important;margin:0 !important;text-align:left !important">Keep colors in step with digits and centre marks</label></div>'
    const clear = `<button type="button" data-act="clear" style="${BUTTON_LOOK}">Clear all</button>`
    return `${heading('Auto mode')}${autoBox}<div style="${DIVIDER}">${profilesHtml}</div>` +
      `<div style="${DIVIDER}">${heading('Groups of the active profile', clear)}${note}${rows || '<div style="margin:6px 0">No groups.</div>'}` +
      `<button type="button" data-act="add-group" style="${BUTTON_LOOK}">Add group</button></div>`
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, installButton, iconHtml, autoBoxHtml, planColoring, planAuto, planSwitch, groupKeys, givenIndices, isEntryAction, entrySignature, changedIndices, readCentreMarks, toPlanCell, assignDigit, editGroupsFor, rowAfterKey, normalizeGroups, stateFromStored, addProfile, deleteProfile, moveProfile, setActive, setActiveGroups, activeGroups, dropIndex, iconLayout, inkFor, isVisibleColor, layoutPages, layoutColors, initialPage, renderEditor, renderProfiles, renderMenu, PRELOADS, MAX_PROFILES, ICON_TOP, ARROW_START, ICON_MAX_GROUPS }
  }
  if (typeof Framework === 'undefined' || !Framework.getApp) return

  // The color tool's pages laid out as SudokuPad's buttons are, read now from the tool and
  // the raw `--cell-color-<key>` values; [] until the tool holds a palette.
  function readPages () {
    const tool = Framework.app && Framework.app.tools && Framework.app.tools.colour
    const palette = tool && tool.palette
    if (!palette || !Array.isArray(palette.pages)) return []
    const style = window.getComputedStyle(document.documentElement)
    return layoutPages(palette.pages, tool.currentPage, (key) => style.getPropertyValue(`--cell-color-${key}`))
  }

  const loadState = () => stateFromStored(Framework.getData(PROFILES_KEY), Framework.getData(LEGACY_GROUPS_KEY))
  const saveState = (state) => Framework.setData(PROFILES_KEY, state)
  const loadGroups = () => activeGroups(loadState())

  // The CSS color of a palette key as the browser draws it (`rgb(...)`), or '' when the key has no
  // visible color. The raw `--cell-color-<key>` value can be any CSS color, so it is resolved on a probe.
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

  // Runs `fn` between groupstart and groupend, so SudokuPad undoes everything it does in one step.
  function inOneUndoStep (app, fn) {
    app.act({ type: 'groupstart' })
    try {
      return fn()
    } finally {
      app.act({ type: 'groupend' })
    }
  }

  // Applies [{action, key, indices}] to `cells` as SudokuPad's color tool does: each op selects its
  // cells and toggles the key, which adds it where every cell lacks it and removes it where every
  // cell holds it (so an op's cells must all lack it, or all hold it). The selection is put back.
  function runColorOps (app, cells, ops) {
    const savedSelection = [...app.puzzle.selectedCells]
    const toggle = (target, key) => {
      app.deselect()
      app.select(target)
      app.act({ type: 'colour', arg: key })
    }
    try {
      ops.forEach(({ action, key, indices }) => {
        const target = indices.map((i) => cells[i])
        toggle(target, key)
        // With Multi-color off, SudokuPad's toggle clears a cell's other colors and then toggles the key
        // back on, so a removal from a cell that held two colors leaves the key: toggle those again.
        const left = action === 'remove' ? target.filter((cell) => (cell.colours || []).includes(key)) : []
        if (left.length > 0) toggle(left, key)
      })
    } finally {
      app.deselect()
      if (savedSelection.length > 0) app.select(savedSelection)
    }
  }

  // Runs the ops `makeOps` plans from the plan cells as one undo step, and nothing when there are none.
  // The plan is made again from the cells as the first ops left them and what it still lists is run too:
  // with Multi-color off, taking one color off a cell that held two clears both, and the cell's own group
  // color, planned as already there, must go back on. Called inside a group, it adds to that group.
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

  // The button: adds each pure cell's group color, never removes one.
  const colorCells = (app) => recolor(app, (plans) => planAuto(plans, loadGroups(), everyIndex(plans), []))

  const colorGivens = (app) => recolor(app, (plans) => planAuto(plans, loadGroups(), givenIndices(plans)))

  let autoMode = false

  const BUTTON = '#control-colorbydigit'
  // The AUTO box and the menu arrow box on the button.
  const BOX = `${BUTTON} [data-role="auto"]`
  const ARROW = `${BUTTON} [data-role="menu"]`
  const MENU = '#color-by-digit-menu'

  // Runs `fn` now if the puzzle's cells exist, else once SudokuPad has loaded the puzzle and its saved
  // progress: loading progress resets the board, so a pass before it would be wiped.
  function whenProgressLoaded (app, fn) {
    if (allCells(app).length > 0) fn()
    else app.puzzle.addEventListener('progressloaded', fn, { once: true })
  }

  // Redraws the button's icon: the active profile's colors and the auto mode value in force.
  function showButton () {
    const icon = document.querySelector(`${BUTTON} .icon`)
    if (icon) icon.outerHTML = iconHtml(autoMode, loadGroups(), readColor)
  }

  // Applies a new auto mode value at once and saves it; turning it on colors the givens.
  function setAutoMode (app, on) {
    const turnedOn = on && !autoMode
    autoMode = on
    Framework.setData(AUTO_KEY, on)
    showButton()
    if (turnedOn) colorGivens(app)
  }

  // Whether `action` could change what auto mode watches in `cell`: a digit goes only on a cell that
  // shows digits, a centre mark on one that shows centre marks, and a clear only where there is a
  // digit or a centre mark to clear. A change SudokuPad would drop is not wrapped in a group, since a
  // group around nothing still empties the redo stack and leaves a dead undo step.
  function mayChange (action, cell) {
    if (action.type === 'value') return cell.propVisible('normal')
    if (action.type === 'candidates') return cell.propVisible('centre')
    const plan = toPlanCell(cell)
    return String(plan.value || '') !== '' || plan.centre.length > 0
  }

  // Wraps app.act so that, with auto mode on, the player's change to a digit or centre marks and the
  // color changes it brings are one undo step. A change SudokuPad already runs inside its own group
  // (a paste) has its color changes added to that group; opening a second would end it early. Undo,
  // redo, replays and the loading of progress run on the puzzle itself, never through app.act.
  function installAutoMode (app) {
    const act = app.act
    app.act = function (action) {
      if (!autoMode || !isEntryAction(action)) return act.call(this, action)
      const touched = [...app.puzzle.selectedCells]
      if (!touched.some((cell) => mayChange(action, cell))) return act.call(this, action)
      const cells = allCells(app)
      const indices = touched.map((cell) => cells.indexOf(cell))
      const before = touched.map((cell) => entrySignature(toPlanCell(cell)))
      const enter = () => {
        const result = act.call(this, action)
        const changed = changedIndices(before, touched.map((cell) => entrySignature(toPlanCell(cell)))).map((i) => indices[i])
        recolor(app, (plans) => planAuto(plans, loadGroups(), changed))
        return result
      }
      return app.puzzle.inGroup ? enter() : inOneUndoStep(app, enter)
    }
    app.on('restarted', () => { if (autoMode) colorGivens(app) })
  }

  // The open menu's element, or null.
  let menu = null

  const closeMenu = () => {
    if (menu) menu.remove()
    menu = null
  }

  // Opens the profile menu above the button, its right edge by the arrow box. The rows take no focus.
  function openMenu () {
    closeMenu()
    // The palette can change after the button was drawn, so the icon is drawn again with the menu.
    showButton()
    const button = document.querySelector(BUTTON)
    if (!button) return
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

  // Makes the profile at `index` the active one, saves it, and recolors the cells as a Save of changed
  // groups does with auto mode on, whether auto mode is on or not: one undo step.
  function switchProfile (app, index) {
    const state = loadState()
    closeMenu()
    if (index === state.active) return
    const next = setActive(state, index)
    saveState(next)
    recolor(app, (plans) => planSwitch(plans, activeGroups(state), activeGroups(next)))
    showButton()
  }

  // How long a press on the button is held before it opens the menu, and how far it may move meanwhile.
  const HOLD_MS = 500
  const HOLD_SLOP = 10

  // The button, its two small controls and its menu. A press on the box or the arrow is not a press on the
  // button: SudokuPad acts on a press of a control by reading `event.target.dataset.control`, which they
  // do not have, and on a touch it cancels the touchstart so the browser sends no click, so these take the
  // touch themselves. A mouse press on either is stopped from focusing the button so the keyboard stays
  // with the puzzle. SudokuPad runs a button's handler the moment it is pressed, which would color the
  // grid under a right click or a hold, so a press on the button proper never reaches SudokuPad: the
  // release of a short press colors the grid, a right click or a hold (HOLD_MS) opens the menu, and the
  // browser's own context menu never shows. A press elsewhere, or Escape, closes the menu.
  function listenForButton (app, openEditor) {
    const within = (event, selector) => event.target.closest && event.target.closest(selector)
    const onBox = (event) => within(event, BOX)
    const onArrow = (event) => within(event, ARROW)
    const onButtonProper = (event) => within(event, BUTTON) && !onBox(event) && !onArrow(event)
    const toggleBox = (event) => {
      event.preventDefault()
      event.stopPropagation()
      setAutoMode(app, !autoMode)
    }
    const toggleMenu = (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (menu) closeMenu()
      else openMenu()
    }
    document.addEventListener('mousedown', (event) => {
      if (onButtonProper(event)) event.stopPropagation()
      if (onBox(event) || onArrow(event) || onButtonProper(event) || within(event, MENU)) event.preventDefault()
    }, true)
    document.addEventListener('click', (event) => {
      if (onBox(event)) return toggleBox(event)
      if (onArrow(event)) return toggleMenu(event)
      const row = within(event, `${MENU} [data-act]`)
      if (!row) return
      event.preventDefault()
      event.stopPropagation()
      if (row.dataset.act === 'edit') {
        closeMenu()
        openEditor()
      } else {
        switchProfile(app, Number(row.dataset.index))
      }
    }, true)
    document.addEventListener('touchstart', (event) => {
      if (onBox(event)) toggleBox(event)
      else if (onArrow(event)) toggleMenu(event)
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
        if (hold !== null && e.type === 'pointerup') colorCells(app)
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

  // Save: stores the profiles, then puts the auto mode draft in force. With auto mode on after the Save,
  // changed active groups take the old groups' colors off every cell and give every pure cell its new color
  // (whether or not it was already on); turning auto mode on also colors the givens (setAutoMode);
  // with auto mode off, nothing is colored.
  function saveDialog (app, oldState, draft, auto) {
    saveState(draft)
    const oldGroups = activeGroups(oldState)
    const groups = activeGroups(draft)
    if (auto && !sameGroups(oldGroups, groups)) recolor(app, (plans) => planSwitch(plans, oldGroups, groups))
    setAutoMode(app, auto)
  }

  function openDialog (app) {
    const pages = readPages()
    const colors = layoutColors(pages)
    const savedState = loadState()
    // The draft of the profiles: every edit lands here and takes effect on Save.
    let draft = savedState
    // The draft of the auto mode box: it opens at the value in force and takes effect on Save.
    let auto = autoMode
    // The text in the new profile's name field.
    let newName = ''
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: `<b>Color by digit</b> <small style="opacity:.6">v${VERSION}</small>` },
        { tag: 'text', innerHTML: '<div id="color-by-digit-editor"></div>' },
        {
          tag: 'options',
          options: [
            { tag: 'button', content: 'Cancel', action: 'close' },
            { tag: 'button', content: SAVE_LABEL, handler: () => { saveDialog(app, savedState, draft, auto); Framework.closeDialog() } }
          ]
        }
      ]
    })
    const box = document.getElementById('color-by-digit-editor')
    if (!box) return
    const dialog = box.closest('.dialog')
    if (dialog) styleDialogButtons(dialog)
    // The page each group of the active profile shows, by group index; a group not yet shown opens on its color's page.
    let shown = []
    const draw = () => {
      const groups = activeGroups(draft)
      groups.forEach((g, i) => { if (shown[i] === undefined) shown[i] = initialPage(pages, g.key) })
      box.innerHTML = renderEditor(groups, pages, shown, auto, renderProfiles(draft, readColor, newName))
    }
    const editGroups = (groups) => { draft = setActiveGroups(draft, groups) }
    // Another profile's groups are showing: its groups open on their own pages.
    const reshow = (next) => { draft = next; shown = [] }
    const addProfileFromField = () => {
      const before = draft
      draft = addProfile(draft, newName)
      const added = draft !== before
      if (added) newName = ''
      draw()
      if (!added && newName.trim() === '') box.querySelector('[data-role="new-name"]').focus()
    }
    draw()
    box.addEventListener('input', (event) => {
      if (event.target.matches('[data-role="new-name"]')) newName = event.target.value
    })
    box.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !event.target.matches('[data-role="new-name"]')) return
      event.preventDefault()
      event.stopPropagation()
      addProfileFromField()
    })
    box.addEventListener('change', (event) => {
      const draftBox = event.target.closest('input[data-role="auto-draft"]')
      if (draftBox) { auto = draftBox.checked; return }
      const el = event.target.closest('select[data-act="page"]')
      if (!el) return
      shown[Number(el.dataset.group)] = Number(el.value)
      draw()
    })
    // A drag of a profile's handle: the row under the pointer's place is outlined while it moves, and the
    // profile lands there on release. Pointer events cover the mouse and a touch alike.
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
        if (e.type === 'pointerup' && to !== from) reshow(moveProfile(draft, from, to))
        draw()
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', finish)
      handle.addEventListener('pointercancel', finish)
    })
    // A click on a profile row, off its handle and its buttons, or a key on the focused row (below),
    // makes that profile the active one; the redrawn row takes the focus back for the keyboard.
    const activateRow = (index, refocus) => {
      reshow(setActive(draft, index))
      draw()
      if (refocus) box.querySelector(`[data-act="activate"][data-index="${index}"]`).focus()
    }
    // Enter and Space activate the focused row; the arrow keys move the choice to the next or previous row,
    // wrapping, as a radio group does. Only the active row is a tab stop.
    box.addEventListener('keydown', (event) => {
      if (!event.target.matches('[data-act="activate"]')) return
      const target = rowAfterKey(event.key, Number(event.target.dataset.index), draft.profiles.length)
      if (target === null) return
      event.preventDefault()
      event.stopPropagation()
      activateRow(target, true)
    })
    box.addEventListener('click', (event) => {
      const row = event.target.closest('[data-act="activate"]')
      if (row && !event.target.closest('[data-role="handle"], button')) {
        event.preventDefault()
        event.stopPropagation()
        activateRow(Number(row.dataset.index), false)
        return
      }
      const el = event.target.closest('button[data-act]')
      if (!el) return
      event.preventDefault()
      event.stopPropagation()
      const act = el.dataset.act
      if (act === 'add') { addProfileFromField(); return }
      if (act === 'delete') {
        reshow(deleteProfile(draft, Number(el.dataset.index)))
      } else {
        const edit = editGroupsFor(activeGroups(draft), shown, act, { group: Number(el.dataset.group), key: el.dataset.key, digit: el.dataset.digit }, colors)
        editGroups(edit.groups)
        shown = edit.shown
      }
      draw()
    })
  }

  Framework.getApp().then((app) => {
    // Closes a dialog already open, then opens the editor once it is gone.
    const openEditor = () => {
      Framework.closeDialog()
      setTimeout(() => openDialog(app), 0)
    }
    // The settings entry goes first: a failure installing the button must not cost the editor.
    Framework.addSetting({
      tag: 'button',
      name: 'colorbydigit',
      group: SETTINGS_GROUP,
      content: 'Color by digit',
      handler: openEditor
    })
    autoMode = Framework.getData(AUTO_KEY) === true
    installButton(Framework, app, () => colorCells(app), autoMode, loadGroups(), readColor)
    installAutoMode(app)
    listenForButton(app, openEditor)
    // The puzzle's own palette is in the page's colors once it has loaded: the icon shows those.
    whenProgressLoaded(app, showButton)
    if (autoMode) whenProgressLoaded(app, () => colorGivens(app))
  })
})()
