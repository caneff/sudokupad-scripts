// ==UserScript==
// @name         SudokuPad Digit Color
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.4.0
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

  // GM_info is absent without Tampermonkey, so the script cannot read @version; keep this equal to it.
  const VERSION = '0.4.0'
  const SETTINGS_GROUP = 'experimental'
  const DATA_KEY = 'DigitColor_colors'
  const STYLE_ID = 'digit-color-style'
  // An entered digit's text element carries no digit attribute, so the script adds this one.
  const DIGIT_ATTR = 'data-digit-color'
  const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
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
  // SudokuPad's own fill for entered digits and marks.
  const SUDOKUPAD_BLUE = '#1d6ae5'
  const CIRCLES_ID = 'digit-color-circles'
  const SVG_NS = 'http://www.w3.org/2000/svg'
  // Pale enough that every digit color, magenta 1 (#b0125b) included, stays readable on it.
  const CIRCLE_FILL = '#ff6b6b'
  const CIRCLE_OPACITY = 0.4
  const CIRCLE_RADIUS_PER_WIDTH = 0.8
  // SudokuPad adds this class to the page while it shows conflicting marks in red.
  const CHECK_MARKS_CLASS = '.setting-checkpencilmarks'
  // Corner marks are `text`; centre marks are `tspan` inside one `text`.
  const MARK_SELECTORS = ['#cell-pencilmarks .cell-pencilmark', '#cell-candidates tspan']
  const HEX_COLOR = /^#[0-9a-f]{6}$/i

  // A saved null means SudokuPad's own color; any other bad value falls back to the default.
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

  function setDigitColor (colors, digit, color) {
    return { ...colors, [digit]: color }
  }

  function digitOfText (text) {
    const t = String(text ?? '').trim()
    return DIGITS.includes(t) ? t : null
  }

  // The `#svgrenderer` prefix outranks SudokuPad's own rule for marks. Marks carry their digit in
  // `data-val`; givens sit in `#cell-givens`, which no rule names.
  function buildCss (colors) {
    return Object.entries(colors).filter(([, color]) => color !== null).map(([digit, color]) => [
      `#cell-values [${DIGIT_ATTR}="${digit}"] { fill: ${color} }`,
      ...MARK_SELECTORS.map((selector) => `#svgrenderer ${selector}[data-val="${digit}"] { fill: ${color} }`)
    ].join('\n')).join('\n')
  }

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
      if (!Number.isFinite(measure[key])) throw new Error(`digit-color: the browser gave no ${key} measure for a mark's digit`)
    }
    const baseline = extent.y + measure.fontAscent
    return {
      x: extent.x + (measure.right - measure.left) / 2,
      y: baseline + (measure.descent - measure.ascent) / 2
    }
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

  // A table passes when it holds a digit and every digit it holds is a color or null: `normalizeColors` would turn a bad entry into the default.
  const readPastedColors = (data) => {
    const digits = data && typeof data === 'object' && !Array.isArray(data) ? DIGITS.filter((d) => Object.hasOwn(data, d)) : []
    return digits.length > 0 && digits.every((d) => data[d] === null || (typeof data[d] === 'string' && HEX_COLOR.test(data[d]))) ? normalizeColors(data) : undefined
  }
  const READERS = { [DATA_KEY]: readPastedColors }

  // The table in force, defaults included, so a paste carries a color that is the default here and not there.
  const copiedSettings = (store) => JSON.stringify({ [DATA_KEY]: normalizeColors(store.getData(DATA_KEY)) })

  // A reader returns the value to save, or undefined for one it refuses. Keys of other scripts are ignored, not counted: only a value of this script's own that its reader refuses is skipped.
  function pastedSettings (text) {
    let data
    try {
      data = JSON.parse(text)
    } catch (error) {
      throw new Error('the clipboard text is not JSON', { cause: error })
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('the clipboard text is not a settings object')
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

  const COPY_PASTE_HTML = '<div style="margin:6px 0;display:flex;align-items:center;gap:8px">' +
    '<button type="button" data-act="copy-settings">Copy settings</button>' +
    '<button type="button" data-act="paste-settings">Paste settings</button></div>' +
    '<div data-role="settings-status" style="opacity:.7;min-height:1.2em"></div>'

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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, DATA_KEY, copiedSettings, pastedSettings, pasteReport, normalizeColors, setDigitColor, buildCss, digitOfText, circleFor, inkMiddle, esc, renderEditor, CIRCLE_CSS, DEFAULT_COLORS, DIGIT_ATTR }
  }
  // The match also covers other crackingthecryptic.com pages, which have no Framework.
  if (typeof Framework === 'undefined') return
  if (!Framework.getApp) {
    console.warn('digit-color: SudokuPad\'s Framework has no getApp, so nothing was changed')
    return
  }

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

  // Rebuilt each time, so a circle never outlives its mark or its conflict.
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
      if (queued || !records.some(isBoardChange)) return
      queued = true
      window.requestAnimationFrame(() => { queued = false; stampEnteredDigits(); syncCircles() })
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] })
    stampEnteredDigits()
    syncCircles()
  }

  function openDialog () {
    let colors = loadColors()
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: `<b>Digit color</b> <small style="opacity:.6">v${VERSION}</small>` },
        { tag: 'text', innerHTML: '<div id="digit-color-editor"></div>' },
        { tag: 'text', innerHTML: COPY_PASTE_HTML },
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
    wireCopyPaste(box.closest('.dialog'), (values) => {
      if (!(DATA_KEY in values)) return
      colors = values[DATA_KEY]
      Framework.setData(DATA_KEY, colors)
      applyColors(colors)
      draw()
    })
    box.addEventListener('click', (event) => {
      const el = event.target.closest('button[data-act]')
      if (!el) return
      event.preventDefault()
      event.stopPropagation()
      colors = el.dataset.act === 'own' ? setDigitColor(colors, el.dataset.digit, null) : normalizeColors(null)
      draw()
    })
    // `change` fires when the picker closes.
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
      group: SETTINGS_GROUP,
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
