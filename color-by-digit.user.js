// ==UserScript==
// @name         SudokuPad Color by Digit
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.2.0
// @description  Adds a button that colors every cell holding a digit, and every empty cell whose centre marks all belong to one group, using groups of palette colors set in a settings dialog.
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
  const VERSION = '0.2.0'
  // The settings group the entry goes in; SudokuPad declares it, and the dialog starts it collapsed.
  const SETTINGS_GROUP = 'experimental'
  const DATA_KEY = 'ColorByDigit_groups'
  const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

  // A group is one palette key plus the digits that get it.
  const PRELOADS = {
    'Low/5/High': [
      { key: '9', digits: ['0', '1', '2', '3', '4'] },
      { key: '1', digits: ['5'] },
      { key: '6', digits: ['6', '7', '8', '9'] }
    ],
    'Odd/Even': [
      { key: '6', digits: ['1', '3', '5', '7', '9'] },
      { key: '9', digits: ['0', '2', '4', '6', '8'] }
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

  // Which cells get which key. Pure: cells in, [{index, key}] out. A placed or given digit
  // decides the key; a cell with neither takes the key its `centre` marks (digit strings) all share.
  function planColoring (cells, groups) {
    const keyOfDigit = Object.create(null)
    groups.forEach((g) => g.digits.filter((d) => DIGITS.includes(d)).forEach((d) => { keyOfDigit[d] = g.key }))
    const plan = []
    cells.forEach((cell, index) => {
      const placed = String(cell.given || cell.value || '')
      const key = placed === '' ? sharedKey(cell.centre || [], keyOfDigit) : keyOfDigit[placed]
      if (key === undefined) return
      if ((cell.colours || []).includes(key)) return
      plan.push({ index, key })
    })
    return plan
  }

  // The centre marks SudokuPad shows on a cell, read as its own solver does
  // (SolverTool.getCellOptions): none when the cell hides them, as a given does.
  function readCentreMarks (cell) {
    if (typeof cell.propVisible !== 'function' || !cell.propVisible('centre')) return []
    return cell.propGet('centre') || []
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

  // Two cells colored and numbered: reads as "color by digit". SudokuPad's own app
  // buttons put their icon in <div class="icon">.
  const ICON =
    '<div class="icon"><svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="5" y="5" width="43" height="43" fill="#e5484d"/>' +
    '<rect x="52" y="5" width="43" height="43" fill="#3e63dd"/>' +
    '<rect x="5" y="52" width="43" height="43" fill="#3e63dd"/>' +
    '<rect x="52" y="52" width="43" height="43" fill="#e5484d"/>' +
    '<g fill="#fff" font-family="sans-serif" font-size="34" font-weight="bold" text-anchor="middle">' +
    '<text x="26.5" y="39">1</text><text x="73.5" y="86">1</text>' +
    '<text x="73.5" y="39">2</text><text x="26.5" y="86">2</text></g></svg></div>'

  // SudokuPad binds button handlers only to buttons present when the controls were
  // built, so a button added later needs refreshControls to get its onClick.
  function installButton (framework, app, onClick) {
    framework.addAppButton({ name: 'colorbydigit', title: 'Color by digit', content: ICON, onClick })
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

  // `shown[i]` is the page index group i shows.
  function renderEditor (groups, pages, shown) {
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
    return `<div>Preload: ${preloads} <button type="button" data-act="clear">Clear all</button></div>${note}${rows || '<div style="margin:6px 0">No groups.</div>'}` +
      '<button type="button" data-act="add">Add group</button>'
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, installButton, planColoring, readCentreMarks, assignDigit, normalizeGroups, groupsFromStored, isVisibleColor, layoutPages, layoutColors, initialPage, renderEditor, PRELOADS, DEFAULT_GROUPS }
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

  function colorCells (app) {
    const groups = loadGroups()
    const puzzle = app.puzzle
    const cells = [].concat(puzzle.cells).flat(Infinity)
    const plan = planColoring(cells.map((c) => ({ given: c.given, value: c.value, colours: c.colours, centre: readCentreMarks(c) })), groups)
    if (plan.length === 0) return
    const byKey = {}
    plan.forEach(({ index, key }) => (byKey[key] = byKey[key] || []).push(cells[index]))
    const savedSelection = [...puzzle.selectedCells]
    app.act({ type: 'groupstart' })
    try {
      Object.entries(byKey).forEach(([key, keyCells]) => {
        app.deselect()
        app.select(keyCells)
        app.act({ type: 'colour', arg: key })
      })
    } finally {
      app.deselect()
      if (savedSelection.length > 0) app.select(savedSelection)
      app.act({ type: 'groupend' })
    }
  }

  function openDialog () {
    const pages = readPages()
    const colors = layoutColors(pages)
    let groups = loadGroups()
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: `<b>Color by digit</b> <small style="opacity:.6">v${VERSION}</small>` },
        { tag: 'text', innerHTML: '<div id="color-by-digit-editor"></div>' },
        {
          tag: 'options',
          options: [
            { tag: 'button', content: 'Save', handler: () => { saveGroups(groups); Framework.closeDialog() } },
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
      box.innerHTML = renderEditor(groups, pages, shown)
    }
    draw()
    box.addEventListener('change', (event) => {
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
        setTimeout(openDialog, 0)
      }
    })
    installButton(Framework, app, () => colorCells(app))
  })
})()
