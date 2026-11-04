// ==UserScript==
// @name         SudokuPad Color by Digit
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.3.0
// @description  Adds a button that colors every cell holding a digit, and every empty cell whose centre marks all belong to one group, using groups of palette colors set in a settings dialog. An auto mode box on the button keeps the colors in step as digits and centre marks change.
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
  const VERSION = '0.3.0'
  // The settings group the entry goes in; SudokuPad declares it, and the dialog starts it collapsed.
  const SETTINGS_GROUP = 'experimental'
  const DATA_KEY = 'ColorByDigit_groups'
  // Whether auto mode is on: true or false, absent until first set.
  const AUTO_KEY = 'ColorByDigit_auto'
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
  const DEFAULT_GROUPS = PRELOADS['Odd/Even']

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

  const groupKeys = (groups) => [...new Set(groups.map((g) => g.key))]

  const givenIndices = (cells) => cells.flatMap((cell, index) => (String(cell.given || '') === '' ? [] : [index]))

  // An action by the player that can change a cell's digit or centre marks, as SudokuPad names them:
  // `value` (digit), `candidates` (centre mark) and `clear` of anything but colors and pen marks.
  // Corner marks (`pencilmarks`) and colors never start auto mode.
  function isEditAction (action) {
    if (!action || typeof action !== 'object') return false
    if (action.type === 'value' || action.type === 'candidates') return true
    return action.type === 'clear' && action.arg !== 'colour' && action.arg !== 'pen'
  }

  // What auto mode watches in a plan cell: the entered digit and the centre marks, in any order.
  const editSignature = (cell) => JSON.stringify([String(cell.value || ''), [...(cell.centre || [])].sort()])

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
      if (want !== undefined && !held.includes(want)) push(additions, want, index)
    })
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

  // What the list starts as: the saved groups, or Odd/Even when nothing usable is saved.
  function groupsFromStored (data) {
    return normalizeGroups(data) || cloneGroups(DEFAULT_GROUPS)
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

  // The auto mode checkbox, drawn in the corner of the button. A span with the checkbox role, not an
  // <input>: a form control inside a <button> takes focus from the puzzle and is swallowed by some browsers.
  function autoBoxHtml (on) {
    return '<span data-role="auto" role="checkbox" aria-label="Auto mode" title="Auto mode" ' + `aria-checked="${Boolean(on)}" ` +
      'style="pointer-events:auto;position:absolute;top:-4px;right:-6px;box-sizing:border-box;width:16px;height:16px;border:2px solid #444;' +
      'border-radius:3px;background:#fff;color:#111;font:bold 13px/12px sans-serif;text-align:center">' +
      (on ? '&#10003;' : '') + '</span>'
  }

  // Two cells colored and numbered: reads as "color by digit". SudokuPad's own app
  // buttons put their icon in <div class="icon">. The auto mode box sits in its corner.
  const iconHtml = (autoOn) =>
    '<div class="icon" style="position:relative"><svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="5" y="5" width="43" height="43" fill="#e5484d"/>' +
    '<rect x="52" y="5" width="43" height="43" fill="#3e63dd"/>' +
    '<rect x="5" y="52" width="43" height="43" fill="#3e63dd"/>' +
    '<rect x="52" y="52" width="43" height="43" fill="#e5484d"/>' +
    '<g fill="#fff" font-family="sans-serif" font-size="34" font-weight="bold" text-anchor="middle">' +
    '<text x="26.5" y="39">1</text><text x="73.5" y="86">1</text>' +
    '<text x="73.5" y="39">2</text><text x="26.5" y="86">2</text></g></svg>' + autoBoxHtml(autoOn) + '</div>'

  // The button goes in the bottom row (.controls-aux) beside Undo, Redo, Check and Select, where
  // SudokuPad lays it out and wraps it like theirs. SudokuPad binds button handlers only to
  // buttons present when the controls were built, so a button added later needs refreshControls
  // to get its onClick.
  function installButton (framework, app, onClick, autoOn = false) {
    framework.addAuxButton({ name: 'colorbydigit', title: 'Color by digit', content: iconHtml(autoOn), onClick })
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
      `<select data-act="page" data-group="${groupIndex}" aria-label="Palette page" style="font-size:1em;padding:2px">${options}</select> ${renderChosen(colors, key)}</div>` +
      `<div style="${grid}">${swatches}</div>${zero}`
  }

  // `shown[i]` is the page index group i shows; `auto` is the draft of the auto mode box.
  function renderEditor (groups, pages, shown, auto = false) {
    const colors = layoutColors(pages)
    const rows = groups.map((g, i) => {
      const digits = DIGITS.map((d) =>
        `<button type="button" data-act="digit" data-group="${i}" data-digit="${d}" ` +
        `style="width:1.8em;margin:1px;font-weight:${g.digits.includes(d) ? 'bold' : 'normal'};` +
        `opacity:${g.digits.includes(d) ? 1 : 0.4}">${d}</button>`).join('')
      return '<div style="margin:6px 0;padding:6px;border:1px solid #888;border-radius:4px">' +
        `${renderPalette(pages, colors, i, g.key, shown[i])}<div style="margin-top:8px">${digits} ` +
        `<button type="button" data-act="remove" data-group="${i}">Remove</button></div></div>`
    }).join('')
    const preloads = Object.keys(PRELOADS)
      .map((n) => `<button type="button" data-act="preload" data-name="${esc(n)}">${esc(n)}</button>`).join(' ')
    const note = colors.length === 0 ? '<div style="margin:6px 0">No palette colors found: groups cannot be added.</div>' : ''
    const autoBox = `<label style="display:block;margin:6px 0"><input type="checkbox" data-role="auto-draft"${auto ? ' checked' : ''}> Auto mode: keep colors in step with digits and centre marks</label>`
    return `${autoBox}<div>Preload: ${preloads} <button type="button" data-act="clear">Clear all</button></div>${note}${rows || '<div style="margin:6px 0">No groups.</div>'}` +
      '<button type="button" data-act="add">Add group</button>'
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, installButton, autoBoxHtml, planColoring, planAuto, groupKeys, givenIndices, isEditAction, editSignature, changedIndices, readCentreMarks, toPlanCell, assignDigit, normalizeGroups, groupsFromStored, isVisibleColor, layoutPages, layoutColors, initialPage, renderEditor, PRELOADS, DEFAULT_GROUPS }
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

  const loadGroups = () => groupsFromStored(Framework.getData(DATA_KEY))
  const saveGroups = (groups) => Framework.setData(DATA_KEY, groups)

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
    try {
      ops.forEach(({ key, indices }) => {
        app.deselect()
        app.select(indices.map((i) => cells[i]))
        app.act({ type: 'colour', arg: key })
      })
    } finally {
      app.deselect()
      if (savedSelection.length > 0) app.select(savedSelection)
    }
  }

  // The button: adds each pure cell's group color, never removes one.
  function colorCells (app) {
    const cells = allCells(app)
    const plan = planColoring(cells.map(toPlanCell), loadGroups())
    if (plan.length === 0) return
    const byKey = {}
    plan.forEach(({ index, key }) => (byKey[key] = byKey[key] || []).push(index))
    const ops = Object.entries(byKey).map(([key, indices]) => ({ action: 'add', key, indices }))
    inOneUndoStep(app, () => runColorOps(app, cells, ops))
  }

  // Auto mode over the listed cells (every cell when `indices` is left out): one undo step, nothing when nothing changes.
  function autoColor (app, groups, indices, managedKeys) {
    const cells = allCells(app)
    if (indices === undefined) indices = cells.map((_, i) => i)
    const ops = planAuto(cells.map(toPlanCell), groups, indices, managedKeys)
    if (ops.length > 0) inOneUndoStep(app, () => runColorOps(app, cells, ops))
  }

  const colorGivens = (app) => {
    const plans = allCells(app).map(toPlanCell)
    autoColor(app, loadGroups(), givenIndices(plans))
  }

  let autoMode = false

  // Runs `fn` now if the puzzle's cells exist, else when SudokuPad says the puzzle has loaded.
  function whenPuzzleLoaded (app, fn) {
    if (allCells(app).length > 0) fn()
    else app.puzzle.addEventListener('loaded', fn, { once: true })
  }

  // Puts the saved value in force and redraws the button's box.
  function showAutoMode () {
    const box = document.querySelector('#control-colorbydigit [data-role="auto"]')
    if (box) box.outerHTML = autoBoxHtml(autoMode)
  }

  // Applies a new auto mode value at once and saves it; turning it on colors the givens.
  function setAutoMode (app, on) {
    const turnedOn = on && !autoMode
    autoMode = on
    Framework.setData(AUTO_KEY, on)
    showAutoMode()
    if (turnedOn) colorGivens(app)
  }

  // Wraps app.act so that, with auto mode on, the player's change to a digit or centre marks and the
  // color changes it brings are one group, and so one undo step. Only the player's own actions pass
  // through app.act: undo, redo, replays and the loading of progress run on the puzzle itself, and
  // SudokuPad's own multi-step acts (a restart) are already in a group, which is never nested.
  function installAutoMode (app) {
    const act = app.act
    app.act = function (action) {
      if (!autoMode || app.puzzle.inGroup || !isEditAction(action)) return act.call(this, action)
      const touched = [...app.puzzle.selectedCells]
      const cells = allCells(app)
      const indices = touched.map((cell) => cells.indexOf(cell))
      const before = touched.map((cell) => editSignature(toPlanCell(cell)))
      return inOneUndoStep(app, () => {
        const result = act.call(this, action)
        const changed = changedIndices(before, touched.map((cell) => editSignature(toPlanCell(cell)))).map((i) => indices[i])
        // Already inside the group this function opened: a second one would end it early.
        const edited = allCells(app)
        runColorOps(app, edited, planAuto(edited.map(toPlanCell), loadGroups(), changed))
        return result
      })
    }
    app.on('restarted', () => { if (autoMode) colorGivens(app) })
  }

  // A click on the button's box toggles auto mode and is not a click on the button. The listener runs
  // before SudokuPad's, and the press is stopped from focusing the button so the keyboard stays with the puzzle.
  const BOX = '#control-colorbydigit [data-role="auto"]'
  function listenForBox (app) {
    const onBox = (event) => event.target.closest && event.target.closest(BOX)
    document.addEventListener('mousedown', (event) => { if (onBox(event)) event.preventDefault() }, true)
    document.addEventListener('click', (event) => {
      if (!onBox(event)) return
      event.preventDefault()
      event.stopPropagation()
      setAutoMode(app, !autoMode)
    }, true)
  }

  // Save: stores the groups, then puts the auto mode draft in force. With auto mode already on, changed
  // groups take the old groups' colors off every cell and give every pure cell its new color; turning
  // auto mode on colors the givens (setAutoMode); with auto mode off, nothing is colored.
  function saveDialog (app, oldGroups, groups, auto) {
    saveGroups(groups)
    const changed = JSON.stringify(oldGroups) !== JSON.stringify(groups)
    if (autoMode && auto && changed) autoColor(app, groups, undefined, [...groupKeys(oldGroups), ...groupKeys(groups)])
    setAutoMode(app, auto)
  }

  function openDialog (app) {
    const pages = readPages()
    const colors = layoutColors(pages)
    const savedGroups = loadGroups()
    let groups = savedGroups
    // The draft of the auto mode box: it opens at the value in force and takes effect on Save.
    let auto = autoMode
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: `<b>Color by digit</b> <small style="opacity:.6">v${VERSION}</small>` },
        { tag: 'text', innerHTML: '<div id="color-by-digit-editor"></div>' },
        {
          tag: 'options',
          options: [
            { tag: 'button', content: 'Save', handler: () => { saveDialog(app, savedGroups, groups, auto); Framework.closeDialog() } },
            { tag: 'button', content: 'Cancel', action: 'close' }
          ]
        }
      ]
    })
    const box = document.getElementById('color-by-digit-editor')
    if (!box) return
    // The page each group shows, by group index; a group not yet shown opens on its color's page.
    let shown = []
    const draw = () => {
      groups.forEach((g, i) => { if (shown[i] === undefined) shown[i] = initialPage(pages, g.key) })
      box.innerHTML = renderEditor(groups, pages, shown, auto)
    }
    draw()
    box.addEventListener('change', (event) => {
      const draft = event.target.closest('input[data-role="auto-draft"]')
      if (draft) { auto = draft.checked; return }
      const el = event.target.closest('select[data-act="page"]')
      if (!el) return
      shown[Number(el.dataset.group)] = Number(el.value)
      draw()
    })
    box.addEventListener('click', (event) => {
      const el = event.target.closest('button[data-act]')
      if (!el) return
      event.preventDefault()
      event.stopPropagation()
      const i = Number(el.dataset.group)
      switch (el.dataset.act) {
        case 'color': groups = groups.map((g, j) => (j === i ? { key: el.dataset.key, digits: g.digits } : g)); break
        case 'digit': groups = assignDigit(groups, i, el.dataset.digit); break
        case 'remove': groups = groups.filter((_, j) => j !== i); shown = shown.filter((_, j) => j !== i); break
        case 'clear': groups = []; shown = []; break
        case 'preload': groups = cloneGroups(PRELOADS[el.dataset.name]); shown = []; break
        case 'add': {
          const used = groups.map((g) => g.key)
          const free = colors.find((c) => !used.includes(c.key)) || colors[0]
          if (free) groups = [...groups, { key: free.key, digits: [] }]
          break
        }
      }
      draw()
    })
  }

  Framework.getApp().then((app) => {
    // The settings entry goes first: a failure installing the button must not cost the editor.
    Framework.addSetting({
      tag: 'button',
      name: 'colorbydigit',
      group: SETTINGS_GROUP,
      content: 'Color by digit',
      handler: () => {
        Framework.closeDialog()
        setTimeout(() => openDialog(app), 0)
      }
    })
    autoMode = Framework.getData(AUTO_KEY) === true
    installButton(Framework, app, () => colorCells(app), autoMode)
    installAutoMode(app)
    listenForBox(app)
    if (autoMode) whenPuzzleLoaded(app, () => colorGivens(app))
  })
})()
