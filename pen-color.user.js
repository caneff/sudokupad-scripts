// ==UserScript==
// @name         SudokuPad Pen Color
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.2.0
// @description  Sets the pen tool's nine colors to your current cell color page, darkened, until you save your own in a settings dialog. Drawn strokes, old strokes and the tool's color buttons all change; puzzle state and replays do not.
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
  // How much of its OKLCH lightness a cell color keeps as a pen color. Low enough that the
  // pen reads clearly against the cell colors drawn at 60% opacity, high enough that the
  // lightest cell colors still show as 5px lines on white and the nine stay apart.
  const LIGHTNESS_FACTOR = 0.75
  const COLOR_TOOL_WAIT_MS = 10000
  const COLOR_TOOL_POLL_MS = 100

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

  // Saved data is untrusted: the saved set as { penColor: '#rrggbb' }, or null when nothing
  // usable is saved (not a plain object, or no entry that is a #rrggbb string), which means
  // the derived colors apply.
  function savedColors (data) {
    const set = normalizeColors(data)
    const usable = data && typeof data === 'object' && !Array.isArray(data) &&
      PEN_COLORS.some((n) => typeof data[n] === 'string' && HEX_COLOR.test(data[n]))
    return usable ? set : null
  }

  const clamp255 = (x) => Math.max(0, Math.min(255, x))
  const RGB_TEXT = /^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)$/

  // True for `transparent` and an `rgba()` with alpha 0, the colors a page lists to leave a
  // slot empty (key 0 of each default page). Anything else, readable or not, is false.
  function isTransparent (text) {
    if (typeof text !== 'string') return false
    const value = text.trim().toLowerCase()
    const rgba = RGB_TEXT.exec(value)
    return value === 'transparent' || Boolean(rgba && rgba[4] !== undefined && Number(rgba[4]) <= 0)
  }

  // A color as `#rrggbb` or `rgb(r, g, b)` / `rgba(r, g, b, a)` text -> [r, g, b] whole numbers
  // clamped to 0-255, ignoring alpha; null for a fully transparent or unreadable value.
  // SudokuPad's own cell color 3 is `rgb(-36, -36, -36)`, which clamps to black.
  function parseColor (text) {
    if (typeof text !== 'string' || isTransparent(text)) return null
    const value = text.trim().toLowerCase()
    const hex = /^#([0-9a-f]{6})$/.exec(value)
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16))
    const rgb = RGB_TEXT.exec(value)
    return rgb ? rgb.slice(1, 4).map((x) => Math.round(clamp255(Number(x)))) : null
  }

  const toLinear = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  const fromLinear = (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)

  // sRGB [r, g, b] -> OKLab [L, a, b] and back (Ottosson's published matrices). The way back
  // returns the unclamped linear channels, so a caller can tell an out-of-gamut color.
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

  // [r, g, b] -> '#rrggbb' with its OKLCH lightness multiplied by LIGHTNESS_FACTOR and its
  // hue kept. Lowering lightness at fixed chroma can leave sRGB, so chroma is reduced just
  // far enough to fit (a bisection), which keeps the hue. Channels are clamped to 0-255
  // first, so any number gives a valid color.
  function darkenColor (rgb) {
    const [L, a, b] = toOklab(rgb.map(clamp255))
    const target = L * LIGHTNESS_FACTOR
    let low = 0
    let high = 1
    if (!inGamut(fromOklabLinear([target, a, b]))) {
      for (let i = 0; i < 30; i++) {
        const mid = (low + high) / 2
        if (inGamut(fromOklabLinear([target, a * mid, b * mid]))) low = mid
        else high = mid
      }
    } else {
      low = 1
    }
    const out = fromOklabLinear([target, a * low, b * low])
    return '#' + out.map((x) => Math.round(clamp255(fromLinear(Math.max(0, Math.min(1, x)))))
      .toString(16).padStart(2, '0')).join('')
  }

  // The pen colors a cell color page gives: its colors in order, the transparent ones left out
  // (`isTransparent`), become pen colors 1-9, darkened. A color `parseColor` cannot read keeps
  // its place, so the colors after it do not shift up. A pen color with no color to take, from
  // a page too short or an unreadable entry, keeps SudokuPad's own and is listed in `missing`,
  // by number.
  function penColorsFromPage (keys, readColor) {
    const slots = []
    for (const key of keys) {
      const text = readColor(key)
      if (!isTransparent(text)) slots.push(parseColor(text))
      if (slots.length === PEN_COLORS.length) break
    }
    const colors = {}
    const missing = []
    PEN_COLORS.forEach((n, i) => {
      if (slots[i]) {
        colors[n] = darkenColor(slots[i])
      } else {
        colors[n] = DEFAULT_COLORS[n]
        missing.push(Number(n))
      }
    })
    return { colors, missing }
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
    module.exports = { normalizeColors, savedColors, parseColor, isTransparent, darkenColor, penColorsFromPage, buildCss, DEFAULT_COLORS, LIGHTNESS_FACTOR, COLOR_TOOL_WAIT_MS }
  }
  if (typeof Framework === 'undefined' || !Framework.getApp) return

  // The pen colors in force and the pen colors (by number) that kept SudokuPad's own because
  // the color page had too few usable colors. Until the color tool is read they are
  // SudokuPad's own, which is what the page shows with no override.
  let active = { ...DEFAULT_COLORS }
  let activeMissing = []

  // SudokuPad's color tool, once it holds the palette and current page it read at startup;
  // null before then. `init` assigns the page and sets the `--cell-color-<key>` variables in
  // one synchronous step, so a palette on the tool means the variables are set too (the
  // stylesheet's own values for them exist earlier and say nothing about a custom palette).
  function readyColorTool () {
    const tool = Framework.app && Framework.app.tools && Framework.app.tools.colour
    const palette = tool && tool.palette
    const ready = palette && Array.isArray(palette.pages) && Array.isArray(palette.pages[tool.currentPage])
    return ready ? tool : null
  }

  // Resolves to the ready color tool, or null if it is not ready after COLOR_TOOL_WAIT_MS.
  function waitForColorTool () {
    return new Promise((resolve) => {
      const deadline = Date.now() + COLOR_TOOL_WAIT_MS
      const check = () => {
        const tool = readyColorTool()
        if (tool || Date.now() >= deadline) resolve(tool)
        else setTimeout(check, COLOR_TOOL_POLL_MS)
      }
      check()
    })
  }

  // The darkened colors of the color tool's current page, read now from the raw
  // `--cell-color-<key>` values (not the 60% opacity they show with on the grid). A custom
  // palette can hold any CSS color (`#f00`, `red`, `hsl()`), and the variable reads back as
  // written, so each value goes through the browser to become `rgb()` text first. A value the
  // browser rejects stays as written, and `penColorsFromPage` treats it as unreadable.
  function deriveFromTool (tool) {
    const root = document.documentElement
    const rootStyle = window.getComputedStyle(root)
    const probe = document.createElement('span')
    root.appendChild(probe)
    try {
      return penColorsFromPage(tool.palette.pages[tool.currentPage], (key) => {
        const value = rootStyle.getPropertyValue(`--cell-color-${key}`).trim()
        probe.style.color = ''
        probe.style.color = value
        return probe.style.color ? window.getComputedStyle(probe).color : value
      })
    } finally {
      probe.remove()
    }
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

  function missingNote (missing) {
    if (!missing.length) return ''
    const list = (missing.length === 1 ? 'pen color ' : 'pen colors ') + missing.join(', ')
    return `<div style="margin:6px 0;max-width:20em">The current cell color page has too few usable colors, so ${list} keep${missing.length === 1 ? 's' : ''} SudokuPad's own.</div>`
  }

  function renderEditor (colors, missing) {
    const rows = PEN_COLORS.map((n) =>
      '<div style="margin:3px 0;display:flex;align-items:center;gap:8px">' +
      `<b style="width:1.2em;text-align:right">${n}</b>` +
      `<input type="color" data-pen="${n}" value="${colors[n]}"></div>`
    ).join('')
    return rows + missingNote(missing) +
      '<button type="button" data-act="defaults" style="margin-top:6px">Restore defaults</button>'
  }

  function openDialog () {
    let colors = { ...active }
    let missing = activeMissing
    // True after Restore defaults until a color is edited: Save then clears the saved set.
    let reset = false
    // The pen colors picked by hand since the dialog opened or Restore defaults. Save with none
    // changes nothing, so a derived set is never saved by accident.
    const edited = new Set()
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
                if (reset) {
                  Framework.removeData(DATA_KEY)
                } else if (edited.size) {
                  Framework.setData(DATA_KEY, colors)
                } else {
                  Framework.closeDialog()
                  return
                }
                active = colors
                activeMissing = edited.size ? [] : missing
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
    const draw = () => { box.innerHTML = renderEditor(colors, missing.filter((n) => !edited.has(String(n)))) }
    draw()
    box.addEventListener('click', (event) => {
      const el = event.target.closest('button[data-act]')
      if (!el) return
      event.preventDefault()
      event.stopPropagation()
      // Reads the color tool's current page now; with no color tool, SudokuPad's own colors.
      const tool = readyColorTool()
      const derived = tool ? deriveFromTool(tool) : { colors: { ...DEFAULT_COLORS }, missing: [] }
      colors = derived.colors
      missing = derived.missing
      edited.clear()
      reset = true
      draw()
    })
    // `change` fires when the picker closes; the swatch the user sees is already the new color.
    box.addEventListener('change', (event) => {
      const el = event.target.closest('input[type="color"]')
      if (!el) return
      colors = { ...colors, [el.dataset.pen]: el.value.toLowerCase() }
      edited.add(el.dataset.pen)
      reset = false
      draw()
    })
  }

  Framework.getApp().then(async () => {
    Framework.addSetting({
      tag: 'button',
      name: 'pencolor',
      content: 'Pen color',
      handler: () => {
        Framework.closeDialog()
        setTimeout(openDialog, 0)
      }
    })
    const saved = savedColors(Framework.getData(DATA_KEY))
    if (saved) {
      active = saved
      applyColors(saved)
      return
    }
    // Nothing saved: the pen takes the darkened current color page, read once at load. When
    // the color tool never becomes ready, SudokuPad's own pen colors stay in force.
    const tool = await waitForColorTool()
    // A save made in the dialog while waiting outranks the derived colors.
    if (!tool || savedColors(Framework.getData(DATA_KEY))) return
    const derived = deriveFromTool(tool)
    active = derived.colors
    activeMissing = derived.missing
    applyColors(active)
  })
})()
