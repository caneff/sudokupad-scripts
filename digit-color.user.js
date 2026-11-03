// ==UserScript==
// @name         SudokuPad Digit Color
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.1.0
// @description  Colors the digits themselves, one color per digit, starting from a default palette and changed in a settings dialog. Entered digits, corner marks and centre marks change; givens and conflicting marks keep their color.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/digit-color.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/digit-color.user.js
// ==/UserScript==

(function () {
  'use strict'

  const DATA_KEY = 'DigitColor_colors'
  const STYLE_ID = 'digit-color-style'
  // An entered digit's text element carries no digit attribute, so the script adds this one.
  const DIGIT_ATTR = 'data-digit-color'
  const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  // The color of each digit on a fresh install and after "Restore defaults".
  const DEFAULT_COLORS = {
    0: '#4b5563',
    1: '#b0125b',
    2: '#b04a00',
    3: '#7a6200',
    4: '#1b7a2f',
    5: '#00736f',
    6: '#0059c9',
    7: '#3d2bb8',
    8: '#8a1fa8',
    9: '#5e3a1a'
  }
  // SudokuPad's own fill for entered digits and marks, shown by the dialog for a digit set to it.
  const SUDOKUPAD_BLUE = '#1d6ae5'
  const HEX_COLOR = /^#[0-9a-f]{6}$/i

  // Saved data is untrusted: returns { digit: '#rrggbb' | null } for every digit. A saved null
  // is a digit set to SudokuPad's own color; a digit with anything else saved gets its default.
  function normalizeColors (data) {
    const saved = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
    const out = {}
    DIGITS.forEach((d) => {
      const value = saved[d]
      if (value === null) out[d] = null
      else if (typeof value === 'string' && HEX_COLOR.test(value)) out[d] = value.toLowerCase()
      else out[d] = DEFAULT_COLORS[d]
    })
    return out
  }

  // Sets one digit's color, or with null sets it to SudokuPad's own.
  function setDigitColor (colors, digit, color) {
    return { ...colors, [digit]: color }
  }

  // The digit a text element shows, or null when it shows anything else.
  function digitOfText (text) {
    const t = String(text ?? '').trim()
    return DIGITS.includes(t) ? t : null
  }

  // One rule per target per colored digit. Marks read their digit from `data-val`; a mark
  // in the `conflict` state keeps SudokuPad's red. Givens sit in `#cell-givens`, which no
  // rule names.
  function buildCss (colors) {
    return Object.entries(colors).filter(([, color]) => color !== null).map(([digit, color]) => [
      `#cell-values [${DIGIT_ATTR}="${digit}"] { fill: ${color} }`,
      `#cell-pencilmarks .cell-pencilmark[data-val="${digit}"]:not(.conflict) { fill: ${color} }`,
      `#cell-candidates tspan[data-val="${digit}"]:not(.conflict) { fill: ${color} }`
    ].join('\n')).join('\n')
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeColors, setDigitColor, buildCss, digitOfText, DEFAULT_COLORS, DIGIT_ATTR, DIGITS }
  }
  if (typeof Framework === 'undefined' || !Framework.getApp) return

  function loadColors () {
    return normalizeColors(Framework.getData(DATA_KEY))
  }

  function applyColors (colors) {
    let style = document.getElementById(STYLE_ID)
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = buildCss(colors)
  }

  // Marks name their digit in `data-val`; entered digits are stamped here.
  function stampEnteredDigits () {
    document.querySelectorAll('#cell-values .cell-value').forEach((el) => {
      const digit = digitOfText(el.textContent)
      if (digit === null) el.removeAttribute(DIGIT_ATTR)
      else if (el.getAttribute(DIGIT_ATTR) !== digit) el.setAttribute(DIGIT_ATTR, digit)
    })
  }

  // Watches the whole page: SudokuPad swaps the board's elements when a puzzle loads.
  // Only text and child changes are watched, so stamping an attribute does not retrigger it.
  function watchEnteredDigits () {
    let queued = false
    new window.MutationObserver(() => {
      if (queued) return
      queued = true
      window.requestAnimationFrame(() => { queued = false; stampEnteredDigits() })
    }).observe(document.body, { subtree: true, childList: true, characterData: true })
    stampEnteredDigits()
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  function renderEditor (colors) {
    const rows = DIGITS.map((d) => {
      const own = colors[d] === null
      return '<div style="margin:3px 0;display:flex;align-items:center;gap:8px">' +
        `<b style="width:1.2em;text-align:right">${d}</b>` +
        `<input type="color" data-digit="${d}" value="${esc(own ? SUDOKUPAD_BLUE : colors[d])}" style="opacity:${own ? 0.4 : 1}">` +
        `<button type="button" data-act="own" data-digit="${d}"${own ? ' disabled' : ''}>SudokuPad color</button></div>`
    }).join('')
    return rows + '<button type="button" data-act="defaults" style="margin-top:6px">Restore defaults</button>'
  }

  function openDialog () {
    let colors = loadColors()
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: '<b>Digit color</b>' },
        { tag: 'text', innerHTML: '<div id="digit-color-editor"></div>' },
        {
          tag: 'options',
          options: [
            {
              tag: 'button',
              content: 'Save',
              handler: () => {
                Framework.setData(DATA_KEY, colors)
                applyColors(colors)
                Framework.closeDialog()
              }
            },
            { tag: 'button', content: 'Cancel', action: 'close' }
          ]
        }
      ]
    })
    const box = document.getElementById('digit-color-editor')
    if (!box) return
    const draw = () => { box.innerHTML = renderEditor(colors) }
    draw()
    box.addEventListener('click', (event) => {
      const el = event.target.closest('button[data-act]')
      if (!el) return
      event.preventDefault()
      event.stopPropagation()
      colors = el.dataset.act === 'own' ? setDigitColor(colors, el.dataset.digit, null) : normalizeColors(null)
      draw()
    })
    // `change` fires when the picker closes; the swatch the user sees is already the new color.
    box.addEventListener('change', (event) => {
      const el = event.target.closest('input[type="color"]')
      if (!el) return
      colors = setDigitColor(colors, el.dataset.digit, el.value.toLowerCase())
      draw()
    })
  }

  Framework.getApp().then(() => {
    Framework.addSetting({
      tag: 'button',
      name: 'digitcolor',
      content: 'Digit color',
      handler: () => {
        Framework.closeDialog()
        setTimeout(openDialog, 0)
      }
    })
    applyColors(loadColors())
    watchEnteredDigits()
  })
})()
