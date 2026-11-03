// ==UserScript==
// @name         SudokuPad Pen Color
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.5.0
// @description  Sets the pen tool's nine colors to your current cell color page, darkened, each pen on the same button number as its cell color; the darkest grey turns black. Your own colors, saved in a settings dialog or by holding a pen color button, replace them, and the dialog sets how thick the pen's lines are. Drawn strokes, old strokes and the tool's color buttons all change; puzzle state and replays do not.
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

  // Shown in the options dialog, and the same as @version above. The script cannot read its own header
  // (GM_info is absent when it runs without Tampermonkey), so the number is kept here too.
  const VERSION = '0.5.0'
  // The settings group the entry goes in; SudokuPad declares it, and the dialog starts it collapsed.
  const SETTINGS_GROUP = 'experimental'
  const DATA_KEY = 'PenColor_colors'
  const THICKNESS_KEY = 'PenColor_thickness'
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
  // The OKLCH chroma under which a darkened color counts as grey. SudokuPad's own greys are 0;
  // a tinted dark grey such as rgb(10, 20, 30) is about 0.024; the least saturated hued colors
  // of the default pages, darkened, are above 0.08.
  const GREY_CHROMA = 0.04
  // SudokuPad's own `.cell-pen` stroke width, and the range the dialog's slider offers.
  const DEFAULT_THICKNESS = 5
  const MIN_THICKNESS = 1
  const MAX_THICKNESS = 12
  // The pen values (the `pen-<value>` class of a stroke) drawn as free lines, from
  // `docs/research/sudokupad-pen-edge-marks.md`. Left out on purpose: 3, 4, b and c (the edge X
  // marks, 2.5 wide in SudokuPad), 5 and 6 (the cell circle and cross), and every value Edge
  // Marks draws, which sets its own width.
  const LINE_VALUES = ['1', '2', '7', '8', '9', 'a', 'd', 'e', 'f', 'g']
  const COLOR_TOOL_WAIT_MS = 10000
  const COLOR_TOOL_POLL_MS = 100
  // How long a pen color button is held to open the pickers: SudokuPad's color tool uses the
  // same 1000 ms (HoldToEditDelayMs) for its cell color buttons.
  const HOLD_TO_EDIT_MS = 1000

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

  // The whole current set with pen color `pen` set to `value` (a #rrggbb string), lowercased.
  // The set is what gets saved, so a pen color or value that is not valid throws rather than
  // saving a set with a wrong entry.
  function editedColors (colors, pen, value) {
    if (!PEN_COLORS.includes(pen)) throw new RangeError(`pen-color: ${pen} is not a pen color`)
    if (typeof value !== 'string' || !HEX_COLOR.test(value)) throw new RangeError(`pen-color: ${value} is not a #rrggbb color`)
    return { ...colors, [pen]: value.toLowerCase() }
  }

  // Saved data is untrusted: the saved thickness when it is a whole number from MIN_THICKNESS
  // to MAX_THICKNESS, else DEFAULT_THICKNESS.
  function normalizeThickness (data) {
    const ok = Number.isInteger(data) && data >= MIN_THICKNESS && data <= MAX_THICKNESS
    return ok ? data : DEFAULT_THICKNESS
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

  // The pen colors a cell color page gives: pen color N is the color at index N of the page
  // (SudokuPad shows index K on the cell color button with data-key K, so the pen buttons line
  // up with the cell buttons), darkened, for N 1-9; index 0 is never used. A transparent or
  // unreadable entry, or an index past the page's end, keeps SudokuPad's own pen color in that
  // same place and is listed in `missing`, by number, with nothing moving up. Of the darkened
  // colors, the darkest one whose OKLCH chroma is under GREY_CHROMA becomes #000000; a page with
  // no such color changes nothing, and a kept SudokuPad color is not considered.
  function penColorsFromPage (keys, readColor) {
    const colors = {}
    const missing = []
    const derived = []
    PEN_COLORS.forEach((n) => {
      const rgb = n < keys.length ? parseColor(readColor(keys[n])) : null
      if (rgb) {
        colors[n] = darkenColor(rgb)
        derived.push(n)
      } else {
        colors[n] = DEFAULT_COLORS[n]
        missing.push(Number(n))
      }
    })
    let darkest = null
    let darkestLightness = Infinity
    for (const n of derived) {
      const [lightness, a, b] = toOklab(parseColor(colors[n]))
      if (Math.hypot(a, b) < GREY_CHROMA && lightness < darkestLightness) {
        darkest = n
        darkestLightness = lightness
      }
    }
    if (darkest) colors[darkest] = '#000000'
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

  // Sets the stroke width of the free lines, drawn already or not. `.cell-pen.pen-X` is what Edge
  // Marks' own width rules use, so these selectors name only LINE_VALUES (never an edge X mark or
  // an Edge Marks value), and `:root:root` outranks SudokuPad's `.cell-pen` whichever loads last.
  function buildThicknessCss (thickness) {
    if (normalizeThickness(thickness) !== thickness) throw new RangeError(`pen-color: ${thickness} is not a thickness from ${MIN_THICKNESS} to ${MAX_THICKNESS}`)
    return `${LINE_VALUES.map((v) => `:root:root .cell-pen.pen-${v}`).join(', ')} { stroke-width: ${thickness}; }`
  }

  // Edit mode (the class is on the pen tool's panel): each color picker sits over its button
  // and the button's swatch is hidden under it. The sizes are those SudokuPad's color tool
  // uses for the same job.
  const EDITING = 'pen-color-editing'
  const PICKER = 'pen-color-picker'
  const EDIT_CSS = [
    `.${EDITING} button[data-value]::after { opacity: 0; }`,
    `.${EDITING} .${PICKER} { width: 0; height: 0; overflow: visible; }`,
    `.${EDITING} .${PICKER} input { position: absolute; width: 2.4rem; height: 2.4rem; margin-left: 0.95rem; margin-top: 0.95rem; z-index: 10; pointer-events: all; }`
  ].join('\n')
  // The elements a hold starts on, and the ones the context menu is suppressed over: the pen
  // tool's color buttons and, in edit mode, the pickers standing in for them (a right-click
  // hold ends over a picker, and Windows opens the menu on release).
  const HOLD_TARGETS = `.tool-pen button[data-value], .tool-pen .${PICKER} input`

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, normalizeColors, savedColors, editedColors, parseColor, isTransparent, darkenColor, penColorsFromPage, buildCss, normalizeThickness, buildThicknessCss, DEFAULT_COLORS, DEFAULT_THICKNESS, MIN_THICKNESS, MAX_THICKNESS, LINE_VALUES, LIGHTNESS_FACTOR, GREY_CHROMA, COLOR_TOOL_WAIT_MS, HOLD_TO_EDIT_MS }
  }
  if (typeof Framework === 'undefined' || !Framework.getApp) return

  // The pen colors in force and the pen colors (by number) that kept SudokuPad's own because
  // the color page had no usable color at their index. Until the color tool is read they are
  // SudokuPad's own, which is what the page shows with no override.
  let active = { ...DEFAULT_COLORS }
  let activeMissing = []
  // The line thickness in force; the dialog previews another without changing it.
  let activeThickness = DEFAULT_THICKNESS

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

  function applyStyle (colors, thickness) {
    let style = document.getElementById(STYLE_ID)
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = [buildCss(colors), buildThicknessCss(thickness), EDIT_CSS].join('\n')
  }

  function missingNote (missing) {
    if (!missing.length) return ''
    const list = (missing.length === 1 ? 'pen color ' : 'pen colors ') + missing.join(', ')
    return `<div style="margin:6px 0;max-width:20em">The current cell color page has no usable color at the matching button, so ${list} keep${missing.length === 1 ? 's' : ''} SudokuPad's own.</div>`
  }

  function renderEditor (colors, missing, thickness) {
    const rows = PEN_COLORS.map((n) =>
      '<div style="margin:3px 0;display:flex;align-items:center;gap:8px">' +
      `<b style="width:1.2em;text-align:right">${n}</b>` +
      `<input type="color" data-pen="${n}" value="${colors[n]}"></div>`
    ).join('')
    const slider = '<div style="margin:8px 0;display:flex;align-items:center;gap:8px">' +
      '<label for="pen-color-thickness">Line thickness</label>' +
      `<input type="range" id="pen-color-thickness" min="${MIN_THICKNESS}" max="${MAX_THICKNESS}" step="1" value="${thickness}">` +
      `<output for="pen-color-thickness">${thickness}</output></div>`
    return rows + slider + missingNote(missing) +
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
    // The thickness shown in the slider, and whether Restore defaults set it and no slider move
    // since: Save then clears the saved thickness.
    let thickness = activeThickness
    let thicknessReset = false
    let committed = false
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: `<b>Pen color</b> <small style="opacity:.6">v${VERSION}</small>` },
        { tag: 'text', innerHTML: '<div id="pen-color-editor"></div>' },
        {
          tag: 'options',
          options: [
            {
              tag: 'button',
              content: 'Save',
              handler: () => {
                committed = true
                if (reset || edited.size) {
                  if (reset) Framework.removeData(DATA_KEY)
                  else Framework.setData(DATA_KEY, colors)
                  adoptColors(colors, edited.size ? [] : missing)
                }
                if (thicknessReset) Framework.removeData(THICKNESS_KEY)
                else if (thickness !== activeThickness) Framework.setData(THICKNESS_KEY, thickness)
                adoptThickness(thickness)
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
    const draw = () => { box.innerHTML = renderEditor(colors, missing.filter((n) => !edited.has(String(n))), thickness) }
    draw()
    // Any way of closing the dialog but Save ends the preview: the thickness in force comes back.
    const closeWatch = new window.MutationObserver(() => {
      if (box.isConnected) return
      closeWatch.disconnect()
      if (!committed) applyStyle(active, activeThickness)
    })
    closeWatch.observe(document.body, { childList: true, subtree: true })
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
      thickness = DEFAULT_THICKNESS
      thicknessReset = true
      applyStyle(active, thickness)
      draw()
    })
    // `input` fires as the slider moves: the lines change live, and Cancel undoes it.
    box.addEventListener('input', (event) => {
      const el = event.target.closest('input[type="range"]')
      if (!el) return
      thickness = Number(el.value)
      thicknessReset = false
      applyStyle(active, thickness)
      el.nextElementSibling.textContent = thickness
    })
    // `change` fires when the picker closes; the swatch the user sees is already the new color.
    box.addEventListener('change', (event) => {
      const el = event.target.closest('input[type="color"]')
      if (!el) return
      colors = editedColors(colors, el.dataset.pen, el.value)
      edited.add(el.dataset.pen)
      reset = false
      draw()
    })
  }

  // Makes `colors` the set in force: the style, the dialog's starting point and any pickers
  // already open, so every place that shows a pen color shows the same one.
  function adoptColors (colors, missing) {
    active = colors
    activeMissing = missing
    applyStyle(colors, activeThickness)
    document.querySelectorAll(`.${PICKER} input`).forEach((el) => { el.value = colors[el.dataset.pen] })
  }

  // Makes `thickness` the line thickness in force.
  function adoptThickness (thickness) {
    activeThickness = thickness
    applyStyle(active, thickness)
  }

  // Sets pen color `pen` live and saves the whole current set, the same as Save in the dialog:
  // from then on the set no longer follows the cell color page.
  function savePenColor (pen, value) {
    const colors = editedColors(active, pen, value)
    Framework.setData(DATA_KEY, colors)
    adoptColors(colors, [])
  }

  // Holding a pen color button for HOLD_TO_EDIT_MS, with either mouse button or a finger, puts
  // a color picker over each of the nine colors; a second hold, or leaving the pen tool, takes
  // them away. SudokuPad keeps one panel element and swaps its `tool-pen` class for the next
  // tool's, so the pickers would stay behind on their own: a class watcher ends edit mode when
  // the panel stops being the pen's.
  let leaveWatch = null

  function exitEditMode (panel) {
    if (leaveWatch) leaveWatch.disconnect()
    leaveWatch = null
    panel.classList.remove(EDITING)
    panel.querySelectorAll(`.${PICKER}`).forEach((el) => el.remove())
  }

  function enterEditMode (panel) {
    // Every button is found before anything changes, so a missing one leaves no half edit mode.
    const buttons = PEN_COLORS.map((n) => {
      const button = panel.querySelector(`button[data-value="${n}"]`)
      if (!button) throw new Error(`pen-color: the pen tool has no button for pen color ${n}`)
      return button
    })
    panel.classList.add(EDITING)
    buttons.forEach((button, i) => {
      button.insertAdjacentHTML('beforebegin',
        `<div class="${PICKER}"><input type="color" data-pen="${PEN_COLORS[i]}" value="${active[PEN_COLORS[i]]}"></div>`)
    })
    leaveWatch = new window.MutationObserver(() => {
      if (!panel.classList.contains('tool-pen')) exitEditMode(panel)
    })
    leaveWatch.observe(panel, { attributes: true, attributeFilter: ['class'] })
  }

  function toggleEditMode (panel) {
    if (panel.classList.contains(EDITING)) exitEditMode(panel)
    else enterEditMode(panel)
  }

  function installHoldToEdit () {
    let timer
    // True from the moment a hold opens or closes edit mode until the next press anywhere.
    let holdDone = false
    const cancel = () => { clearTimeout(timer); timer = undefined }
    // Pointer events carry a mouse button of either kind, and touch too (touch is not tested).
    document.addEventListener('pointerdown', (event) => {
      cancel()
      holdDone = false
      const target = event.target.closest(HOLD_TARGETS)
      if (!target) return
      const panel = target.closest('.tool-pen')
      timer = setTimeout(() => { holdDone = true; toggleEditMode(panel) }, HOLD_TO_EDIT_MS)
    }, true)
    window.addEventListener('pointerup', cancel, true)
    window.addEventListener('pointercancel', cancel, true)
    // The browser's menu would open over the picker during a right-click hold or a long touch:
    // when the press is still going (Linux opens it on press), or after the hold has run its
    // course (Windows opens it on release, over the picker that appeared under the pointer).
    // A quick right-click on a button, released before the delay, keeps its menu on Windows.
    document.addEventListener('contextmenu', (event) => {
      if ((timer !== undefined || holdDone) && event.target.closest(HOLD_TARGETS)) event.preventDefault()
    }, true)
    // `input` fires as the picker moves, so the color changes live.
    document.addEventListener('input', (event) => {
      const el = event.target
      if (el.matches(`.${PICKER} input`)) savePenColor(el.dataset.pen, el.value)
    })
  }

  Framework.getApp().then(async () => {
    installHoldToEdit()
    adoptThickness(normalizeThickness(Framework.getData(THICKNESS_KEY)))
    Framework.addSetting({
      tag: 'button',
      name: 'pencolor',
      group: SETTINGS_GROUP,
      content: 'Pen color',
      handler: () => {
        Framework.closeDialog()
        setTimeout(openDialog, 0)
      }
    })
    const saved = savedColors(Framework.getData(DATA_KEY))
    if (saved) {
      adoptColors(saved, [])
      return
    }
    // Nothing saved: the pen takes the darkened current color page, read once at load. When
    // the color tool never becomes ready, SudokuPad's own pen colors stay in force.
    const tool = await waitForColorTool()
    // A save made in the dialog while waiting outranks the derived colors.
    if (!tool || savedColors(Framework.getData(DATA_KEY))) return
    const derived = deriveFromTool(tool)
    adoptColors(derived.colors, derived.missing)
  })
})()
