// ==UserScript==
// @name         SudokuPad Pen Color
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.1.0
// @description  Changes the pen tool's nine colors, in a settings dialog. Drawn strokes, old strokes and the tool's color buttons all change; puzzle state and replays do not.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/pen-color.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/pen-color.user.js
// ==/UserScript==

(function () {
  'use strict'

  const DATA_KEY = 'PenColor_colors'
  const STYLE_ID = 'pen-color-style'
  const PEN_COLORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  // SudokuPad's own pen colors (tool-pen.css), as #rrggbb. Pen color 9 is written there as
  // rgb(-36, -36, -36), which clamps to black.
  const DEFAULT_COLORS = {
    1: '#1f8020',
    2: '#e87cf1',
    3: '#e49632',
    4: '#f53a37',
    5: '#d2be32',
    6: '#3d99f5',
    7: '#d6d6d6',
    8: '#7c7c7c',
    9: '#000000'
  }
  const HEX_COLOR = /^#[0-9a-f]{6}$/i

  // Saved data is untrusted: returns { penColor: '#rrggbb' } for every pen color, with the
  // default for any entry that is missing or not a #rrggbb string.
  function normalizeColors (data) {
    const saved = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
    const out = {}
    PEN_COLORS.forEach((n) => {
      const value = saved[n]
      out[n] = typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : DEFAULT_COLORS[n]
    })
    return out
  }

  // Overrides SudokuPad's nine pen color variables. Strokes (`.pencolor-N`) and the tool's
  // button swatches both read them; the eraser has its own fixed color and no variable.
  // SudokuPad's `tool-pen.css` loads when the pen tool is enabled, so a plain `:root` rule
  // would lose to it by coming first; `:root:root` outranks it whichever loads last.
  function buildCss (colors) {
    const lines = PEN_COLORS.map((n) => `  --puzzle-pencolor-${n}: ${colors[n]};`)
    return [':root:root {', ...lines, '}'].join('\n')
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeColors, buildCss, DEFAULT_COLORS }
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

  function renderEditor (colors) {
    const rows = PEN_COLORS.map((n) =>
      '<div style="margin:3px 0;display:flex;align-items:center;gap:8px">' +
      `<b style="width:1.2em;text-align:right">${n}</b>` +
      `<input type="color" data-pen="${n}" value="${colors[n]}"></div>`
    ).join('')
    return rows + '<button type="button" data-act="defaults" style="margin-top:6px">Restore defaults</button>'
  }

  function openDialog () {
    let colors = loadColors()
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: '<b>Pen color</b>' },
        { tag: 'text', innerHTML: '<div id="pen-color-editor"></div>' },
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
    const box = document.getElementById('pen-color-editor')
    if (!box) throw new Error('pen-color: the dialog has no editor element')
    const draw = () => { box.innerHTML = renderEditor(colors) }
    draw()
    box.addEventListener('click', (event) => {
      const el = event.target.closest('button[data-act]')
      if (!el) return
      event.preventDefault()
      event.stopPropagation()
      colors = normalizeColors(null)
      draw()
    })
    // `change` fires when the picker closes; the swatch the user sees is already the new color.
    box.addEventListener('change', (event) => {
      const el = event.target.closest('input[type="color"]')
      if (!el) return
      colors = { ...colors, [el.dataset.pen]: el.value.toLowerCase() }
      draw()
    })
  }

  Framework.getApp().then(() => {
    Framework.addSetting({
      tag: 'button',
      name: 'pencolor',
      content: 'Pen color',
      handler: () => {
        Framework.closeDialog()
        setTimeout(openDialog, 0)
      }
    })
    applyColors(loadColors())
  })
})()
