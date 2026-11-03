// ==UserScript==
// @name         SudokuPad Digit Color
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.3.0
// @description  Colors the digits themselves, one color per digit, starting from default colors and changed in a settings dialog. Entered digits, corner marks and centre marks change; givens keep their color, and a conflicting mark gets a small red circle behind it, keeping its digit color.
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
  const CIRCLES_ID = 'digit-color-circles'
  const SVG_NS = 'http://www.w3.org/2000/svg'
  // A pale, translucent red: the digit colors, magenta digit 1 (#b0125b) included, stay readable on it.
  const CIRCLE_FILL = '#ff6b6b'
  const CIRCLE_OPACITY = 0.4
  // The circle's radius per unit of the mark's width.
  const CIRCLE_RADIUS_PER_WIDTH = 0.8
  // SudokuPad adds this class to the page while it shows conflicting marks in red.
  const CHECK_MARKS_CLASS = '.setting-checkpencilmarks'
  // The marks that can conflict: corner marks are `text`, centre marks are `tspan` inside one `text`.
  const MARK_SELECTORS = ['#cell-pencilmarks .cell-pencilmark', '#cell-candidates tspan']
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

  // One fill rule per target per colored digit. Marks read their digit from `data-val`. A mark in
  // the `conflict` state keeps its digit color, since no rule here names that state; a digit on
  // SudokuPad's own color gets no rule. The `#svgrenderer` prefix outranks SudokuPad's own rule for
  // marks. Givens sit in `#cell-givens`, which no rule names.
  function buildCss (colors) {
    return Object.entries(colors).filter(([, color]) => color !== null).map(([digit, color]) => [
      `#cell-values [${DIGIT_ATTR}="${digit}"] { fill: ${color} }`,
      `#svgrenderer #cell-pencilmarks .cell-pencilmark[data-val="${digit}"] { fill: ${color} }`,
      `#svgrenderer #cell-candidates tspan[data-val="${digit}"] { fill: ${color} }`
    ].join('\n')).join('\n')
  }

  // The group of conflict circles is hidden unless SudokuPad shows conflicts, so the setting alone
  // turns them on and off. The group takes no pointer events, and its circles inherit that, so a
  // click on a circle reaches the board.
  const CIRCLE_CSS = [
    `#${CIRCLES_ID} { display: none; pointer-events: none }`,
    `${CHECK_MARKS_CLASS} #${CIRCLES_ID} { display: inline }`,
    `#${CIRCLES_ID} circle { fill: ${CIRCLE_FILL}; fill-opacity: ${CIRCLE_OPACITY} }`
  ].join('\n')

  // The circle behind a mark, from the mark's middle and width in the board's units.
  function circleFor (mark) {
    return { cx: mark.x, cy: mark.y, r: mark.width * CIRCLE_RADIUS_PER_WIDTH }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeColors, setDigitColor, buildCss, digitOfText, circleFor, CIRCLE_CSS, DEFAULT_COLORS, DIGIT_ATTR }
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
    style.textContent = buildCss(colors) + '\n' + CIRCLE_CSS
  }

  // Marks name their digit in `data-val`; entered digits are stamped here.
  function stampEnteredDigits () {
    document.querySelectorAll('#cell-values .cell-value').forEach((el) => {
      const digit = digitOfText(el.textContent)
      if (digit === null) el.removeAttribute(DIGIT_ATTR)
      else if (el.getAttribute(DIGIT_ATTR) !== digit) el.setAttribute(DIGIT_ATTR, digit)
    })
  }

  // A mark's middle and width in `space`'s units. SudokuPad sets `dominant-baseline: middle` on
  // marks, so a `text`'s `y` is the middle of its digit; a corner mark's `x` is its middle too
  // (`text-anchor: middle`), and a centre mark's `tspan` has no position of its own, so its
  // character's extent gives its middle. A corner mark carries a CSS translate that its own
  // attributes omit, so the point is mapped through the `text`'s transform into `space`, which
  // holds a translation and a scale only.
  function markMiddle (mark, space) {
    const isTspan = mark.localName === 'tspan'
    const text = isTspan ? mark.parentNode : mark
    const extent = isTspan ? mark.getExtentOfChar(0) : mark.getBBox()
    const x = isTspan ? extent.x + extent.width / 2 : Number(text.getAttribute('x'))
    if (!text.hasAttribute('y') || (!isTspan && !text.hasAttribute('x'))) throw new Error('digit-color: a mark has no position to draw its circle at')
    const toSpace = space.getCTM().inverse().multiply(text.getCTM())
    const point = new window.DOMPoint(x, Number(text.getAttribute('y'))).matrixTransform(toSpace)
    return { x: point.x, y: point.y, width: extent.width * toSpace.a }
  }

  // The group of circles sits in the board just before the corner marks, so it paints behind every
  // mark and above the cells' colors.
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

  // Draws one circle per mark in the `conflict` state. The group is rebuilt each time, so a circle
  // never outlives its mark or its conflict.
  function syncCircles () {
    const group = circlesGroup()
    if (!group) return
    const conflicts = document.querySelectorAll(MARK_SELECTORS.map((s) => `${s}.conflict`).join(','))
    group.replaceChildren(...[...conflicts].map((mark) => {
      const { cx, cy, r } = circleFor(markMiddle(mark, group))
      const circle = document.createElementNS(SVG_NS, 'circle')
      circle.setAttribute('cx', cx)
      circle.setAttribute('cy', cy)
      circle.setAttribute('r', r)
      return circle
    }))
  }

  // Whether a change is one the board needs redrawing for: any text or child change outside the
  // circles' own group, or a `class` change on a mark, which is how a mark enters or leaves the
  // `conflict` state. Stamping `DIGIT_ATTR` and drawing the circles trigger nothing.
  function isBoardChange (record) {
    if (record.target.closest && record.target.closest(`#${CIRCLES_ID}`)) return false
    return record.type !== 'attributes' || MARK_SELECTORS.some((s) => record.target.matches(s))
  }

  // Watches the whole page: SudokuPad swaps the board's elements when a puzzle loads.
  function watchBoard () {
    let queued = false
    new window.MutationObserver((records) => {
      if (queued || !records.some(isBoardChange)) return
      queued = true
      window.requestAnimationFrame(() => { queued = false; stampEnteredDigits(); syncCircles() })
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] })
    stampEnteredDigits()
    syncCircles()
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
    if (!box) throw new Error('digit-color: the dialog has no editor element')
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
    watchBoard()
  })
})()
