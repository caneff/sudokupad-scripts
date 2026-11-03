// ==UserScript==
// @name         SudokuPad Color by Digit
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.1.2
// @description  Adds a button that colors every cell holding a digit, using groups of palette colors set in a settings dialog.
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

  // Shown in the settings, and the same as @version above. The script cannot read its own header
  // (GM_info is absent when it runs without Tampermonkey), so the number is kept here too.
  const VERSION = '0.1.2'
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
    ],
    Custom: []
  }
  const DEFAULT_GROUPS = PRELOADS['Odd/Even']

  const cloneGroups = (groups) => groups.map((g) => ({ key: g.key, digits: [...g.digits] }))

  // Which cells get which key. Pure: cells in, [{index, key}] out.
  function planColoring (cells, groups) {
    const keyOfDigit = {}
    groups.forEach((g) => g.digits.forEach((d) => { keyOfDigit[d] = g.key }))
    const plan = []
    cells.forEach((cell, index) => {
      const digit = String(cell.given || cell.value || '')
      if (!DIGITS.includes(digit)) return
      const key = keyOfDigit[digit]
      if (key === undefined) return
      if ((cell.colours || []).includes(key)) return
      plan.push({ index, key })
    })
    return plan
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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, installButton, planColoring, assignDigit, normalizeGroups, groupsFromStored, isVisibleColor, PRELOADS, DEFAULT_GROUPS }
  }
  if (typeof Framework === 'undefined' || !Framework.getApp) return

  // SudokuPad's default palette keys, in its page order. Keys outside them are not read.
  const PALETTE_KEYS = '0123456789abcdefghijklmnopqrst'.split('')

  // The visible colors of the user's current palette, read from the CSS variables
  // SudokuPad sets for each key. Transparent and unset slots are skipped.
  function paletteColors () {
    const style = window.getComputedStyle(document.documentElement)
    const colors = []
    PALETTE_KEYS.forEach((key) => {
      const value = style.getPropertyValue(`--cell-color-${key}`).trim()
      if (isVisibleColor(value)) colors.push({ key, value })
    })
    return colors
  }

  const loadGroups = () => groupsFromStored(Framework.getData(DATA_KEY))
  const saveGroups = (groups) => Framework.setData(DATA_KEY, groups)

  function colorCells (app) {
    const groups = loadGroups()
    const puzzle = app.puzzle
    const cells = [].concat(puzzle.cells).flat(Infinity)
    const plan = planColoring(cells, groups)
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

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  function renderEditor (groups, colors) {
    const rows = groups.map((g, i) => {
      const swatches = colors.map((c) =>
        `<button type="button" data-act="color" data-group="${i}" data-key="${esc(c.key)}" title="${esc(c.key)}" ` +
        `style="width:1.4em;height:1.4em;margin:1px;border-radius:50%;background:${esc(c.value)};` +
        `border:${c.key === g.key ? '3px solid #000' : '1px solid #888'}"></button>`).join('')
      const digits = DIGITS.map((d) =>
        `<button type="button" data-act="digit" data-group="${i}" data-digit="${d}" ` +
        `style="width:1.8em;margin:1px;font-weight:${g.digits.includes(d) ? 'bold' : 'normal'};` +
        `opacity:${g.digits.includes(d) ? 1 : 0.4}">${d}</button>`).join('')
      return '<div style="margin:6px 0;padding:4px;border:1px solid #888;border-radius:4px">' +
        `<div>${swatches}</div><div>${digits} ` +
        `<button type="button" data-act="remove" data-group="${i}">Remove</button></div></div>`
    }).join('')
    const preloads = Object.keys(PRELOADS)
      .map((n) => `<button type="button" data-act="preload" data-name="${esc(n)}">${esc(n)}</button>`).join(' ')
    const note = colors.length === 0 ? '<div style="margin:6px 0">No palette colors found: groups cannot be added.</div>' : ''
    return `<div>Preload: ${preloads}</div>${note}${rows || '<div style="margin:6px 0">No groups.</div>'}` +
      '<button type="button" data-act="add">Add group</button>'
  }

  function openDialog () {
    const colors = paletteColors()
    let groups = loadGroups()
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: `<b>Color by digit v${VERSION}</b>` },
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
    const draw = () => { box.innerHTML = renderEditor(groups, colors) }
    draw()
    box.addEventListener('click', (event) => {
      const el = event.target.closest('button[data-act]')
      if (!el) return
      event.preventDefault()
      event.stopPropagation()
      const i = Number(el.dataset.group)
      switch (el.dataset.act) {
        case 'color': groups = groups.map((g, j) => (j === i ? { key: el.dataset.key, digits: g.digits } : g)); break
        case 'digit': groups = assignDigit(groups, i, el.dataset.digit); break
        case 'remove': groups = groups.filter((_, j) => j !== i); break
        case 'preload': groups = cloneGroups(PRELOADS[el.dataset.name]); break
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
      content: `Color by digit v${VERSION}`,
      handler: () => {
        Framework.closeDialog()
        setTimeout(openDialog, 0)
      }
    })
    installButton(Framework, app, () => colorCells(app))
  })
})()
