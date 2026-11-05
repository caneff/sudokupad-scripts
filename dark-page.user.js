// ==UserScript==
// @name         SudokuPad Dark Page
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.3.7
// @description  Makes the page black around the puzzle, or another color chosen in a settings dialog, with dark control buttons on a dark page. A rectangle bounding everything the puzzle draws, and the cells a solver writes in, stays as SudokuPad renders it. Not SudokuPad's dark mode.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/dark-page.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/dark-page.user.js
// ==/UserScript==

(function () {
  'use strict'

  // GM_info is absent without Tampermonkey, so the script cannot read @version; keep this equal to it.
  const VERSION = '0.3.7'
  const SETTINGS_GROUP = 'experimental'
  const STYLE_ID = 'dark-page-style'
  const RECT_ID = 'dark-page-rect'
  const DATA_KEY = 'DarkPage_color'
  const DEFAULT_COLOR = '#000000'
  const HEX_COLOR = /^#[0-9a-f]{6}$/i
  const LIGHT_TEXT = '#dddddd'
  const DARK_TEXT = '#222222'
  // SudokuPad's own buttons are light `#eee`, which glare on a dark page. An on button (`.selected`,
  // or `.selectedperm` on Select) keeps SudokuPad's fill and gets BUTTON_ACCENT as its border.
  const BUTTON_BG = '#2a2a2a'
  const BUTTON_ACCENT = '#d2a8f0'
  const BUTTON_BORDER = '#4a4a4a'
  const BUTTON_GROUPS = ['.controls-app', '.controls-tool', '.controls-aux']
  // Covers antialiasing and a text outline filter, which the elements' boxes leave out.
  const PAD = 1
  // How far a solver's pen mark reaches past its cell, at Pen Tool Extras' largest thickness (16).
  // Measured on sudokupad.app v0.611.0: the edge X on an outer edge reaches 18.53px in a 1200x900
  // window, and an arrow on a page 3 line along an outer edge 24 cell units (a cell is 64), 21.4px at
  // a cell 57px wide. 28 covers both up to cells about 73px wide; 32 leaves room for Pen Tool Extras'
  // White outline. Only cells wider than 128px put the puzzle's own edge farther out than this.
  const SOLVER_REACH = 32
  // Elements in `defs`, `marker` and the like have no box.
  const DRAWN = 'path, rect, circle, ellipse, line, polyline, polygon, text, image'
  const MARKER_PROPERTIES = ['marker-start', 'marker-mid', 'marker-end']

  function savedColor (data) {
    return typeof data === 'string' && HEX_COLOR.test(data) ? data.toLowerCase() : null
  }

  // Storage can throw (a frame with storage blocked); the page still gets the default darkening,
  // which needs no Framework.
  function readSavedColor (framework) {
    if (!framework || typeof framework.getData !== 'function') return null
    try {
      return savedColor(framework.getData(DATA_KEY))
    } catch (error) {
      console.error('dark-page: could not read the saved color, using the default', error)
      return null
    }
  }

  // WCAG relative luminance.
  function luminance (color) {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(color.slice(i, i + 2), 16) / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  function textColorFor (pageColor) {
    const page = luminance(pageColor) + 0.05
    const contrast = (text) => { const t = luminance(text) + 0.05; return Math.max(page, t) / Math.min(page, t) }
    return contrast(LIGHT_TEXT) >= contrast(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
  }

  // Nothing inside the board is named and no variable is declared: SudokuPad's theme variables sit on
  // `:root` and color the grid too. `!important` outranks SudokuPad's rules, `.setting-darkmode`'s
  // included. The rectangle takes `--body-bg`, what SudokuPad gives `body`: the puzzle has no
  // background and shows `body` through it. Painting the svg itself changes its antialiasing. The
  // div's position and box are inline, so with this stylesheet off it is a transparent div. The
  // replay readout is the `::after` of `.controls-input`, drawn on the page. Svg-painted icons and
  // color swatch fills keep their colors.
  function buildCss (pageColor) {
    const rule = (selector, ...declarations) => `${selector} { ${declarations.map((d) => `${d} !important`).join('; ')} }`
    const textColor = textColorFor(pageColor)
    const darkButtons = [
      rule(BUTTON_GROUPS.map((group) => `${group} button:not(.selected):not(.selectedperm)`).join(', '), `background-color: ${BUTTON_BG}`, `color: ${BUTTON_ACCENT}`, `border-color: ${BUTTON_BORDER}`),
      rule(BUTTON_GROUPS.flatMap((group) => [`${group} button.selected`, `${group} button.selectedperm`]).join(', '), `border-color: ${BUTTON_ACCENT}`),
      rule('.button-row button', `border-color: ${BUTTON_BORDER}`)
    ]
    return [
      rule('body', `background-color: ${pageColor}`),
      rule(`#${RECT_ID}`, 'background-color: var(--body-bg)'),
      rule('.controls-footer, .controls-footer a', `color: ${textColor}`),
      rule('.controls-input::after', `color: ${textColor}`),
      ...(textColor === LIGHT_TEXT ? darkButtons : [])
    ].join('\n')
  }

  function unionBoxes (boxes) {
    if (!boxes.length) return null
    return boxes.reduce((u, b) => ({
      left: Math.min(u.left, b.left),
      top: Math.min(u.top, b.top),
      right: Math.max(u.right, b.right),
      bottom: Math.max(u.bottom, b.bottom)
    }))
  }

  const growBox = (box, amount) => ({ left: box.left - amount, top: box.top - amount, right: box.right + amount, bottom: box.bottom + amount })

  // Rounds outward so a partly covered pixel at the rim is not left dark.
  function snapOutward (box, pad) {
    const grown = growBox(box, pad)
    return { left: Math.floor(grown.left), top: Math.floor(grown.top), right: Math.ceil(grown.right), bottom: Math.ceil(grown.bottom) }
  }

  // A paint server such as a url() counts as opaque.
  function paintAlpha (color) {
    const c = String(color).trim()
    if (c === 'none' || c === 'transparent') return 0
    const m = /^rgba\(.*,\s*([\d.]+)\s*\)$/.exec(c)
    return m ? Number(m[1]) : 1
  }

  const strokeShows = (style) => paintAlpha(style.stroke) * Number(style.strokeOpacity) > 0 && parseFloat(style.strokeWidth) > 0

  function hasVisiblePaint (style) {
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return false
    return paintAlpha(style.fill) * Number(style.fillOpacity) > 0 || strokeShows(style)
  }

  // An element's box leaves out half its stroke. `scale` is page pixels per user unit.
  function halfStroke (style, scale) {
    return strokeShows(style) ? parseFloat(style.strokeWidth) * scale / 2 : 0
  }

  // The SVG defaults for an absent attribute are 3, 3, 0, 0 and `strokeWidth` (null here).
  function markerReach (marker, strokeWidth, scale) {
    const number = (value, fallback) => (value === null ? fallback : parseFloat(value))
    const width = number(marker.markerWidth, 3)
    const height = number(marker.markerHeight, 3)
    const refX = number(marker.refX, 0)
    const refY = number(marker.refY, 0)
    const unit = marker.markerUnits === 'userSpaceOnUse' ? 1 : strokeWidth
    return Math.max(refX, width - refX, refY, height - refY) * unit * scale
  }

  const clampBox = (box, limit) => ({
    left: Math.max(box.left, limit.left),
    top: Math.max(box.top, limit.top),
    right: Math.min(box.right, limit.right),
    bottom: Math.min(box.bottom, limit.bottom)
  })

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, DATA_KEY, DEFAULT_COLOR, readSavedColor, textColorFor, savedColor, buildCss, unionBoxes, snapOutward, clampBox, growBox, paintAlpha, hasVisiblePaint, halfStroke, markerReach, PAD, SOLVER_REACH, RECT_ID, STYLE_ID }
  }
  if (typeof document === 'undefined') return

  const boxOf = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })

  function markersReach (el, style, scale) {
    const strokeWidth = parseFloat(style.strokeWidth) || 0
    return MARKER_PROPERTIES.reduce((reach, property) => {
      const id = /url\(["']?#([^"')]+)["']?\)/.exec(style.getPropertyValue(property))
      const marker = id && el.ownerSVGElement.getElementById(id[1])
      if (!marker) return reach
      const attr = (name) => marker.getAttribute(name)
      return Math.max(reach, markerReach({ markerWidth: attr('markerWidth'), markerHeight: attr('markerHeight'), refX: attr('refX'), refY: attr('refY'), markerUnits: attr('markerUnits') }, strokeWidth, scale))
    }, 0)
  }

  // Limited to the svg's own box, which clips what lies outside it.
  function keptRectangle () {
    const svg = document.querySelector('#svgrenderer')
    const ctm = svg && svg.getScreenCTM()
    if (!ctm) return null
    const svgBox = boxOf(svg.getBoundingClientRect())
    const boxes = []
    svg.querySelectorAll(DRAWN).forEach((el) => {
      if (el.tagName === 'text' && !el.textContent.trim()) return
      const style = window.getComputedStyle(el)
      if (!hasVisiblePaint(style)) return
      const r = el.getBoundingClientRect()
      if (!r.width && !r.height) return
      boxes.push(growBox(boxOf(r), halfStroke(style, ctm.a) + markersReach(el, style, ctm.a)))
    })
    document.querySelectorAll('.cells .cell').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width && r.height) boxes.push(growBox(boxOf(r), SOLVER_REACH))
    })
    const drawn = unionBoxes(boxes)
    return drawn && clampBox(snapOutward(drawn, PAD), snapOutward(svgBox, 0))
  }

  // Read before the first paint so a saved color never shows the default first; Framework.getData
  // works as soon as Framework exists, before the app is ready.
  let pageColor = readSavedColor(typeof Framework === 'undefined' ? null : Framework) || DEFAULT_COLOR

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = buildCss(pageColor)
  document.head.appendChild(style)

  const rect = document.createElement('div')
  rect.id = RECT_ID
  rect.style.setProperty('position', 'fixed', 'important')
  rect.style.setProperty('z-index', '-1', 'important')
  rect.style.setProperty('pointer-events', 'none', 'important')
  document.body.appendChild(rect)

  // With no board the page is left as it is: the page color would hide white the board has not drawn.
  function updateRect () {
    const kept = keptRectangle()
    style.disabled = !kept
    const set = (name, value) => rect.style.setProperty(name, value, 'important')
    if (!kept) return set('display', 'none')
    set('display', 'block')
    set('left', `${kept.left}px`)
    set('top', `${kept.top}px`)
    set('width', `${kept.right - kept.left}px`)
    set('height', `${kept.bottom - kept.top}px`)
  }

  let queued = false
  function scheduleUpdate () {
    if (queued) return
    queued = true
    window.requestAnimationFrame(() => { queued = false; updateRect() })
  }

  updateRect()
  // SudokuPad swaps the board's elements when a puzzle loads. The rectangle's own updates and the top
  // bar's clock are not puzzle changes.
  new window.MutationObserver((records) => {
    const target = (r) => (r.target.nodeType === 1 ? r.target : r.target.parentElement)
    if (records.some((r) => target(r) !== rect && !target(r)?.closest('.topbar'))) scheduleUpdate()
  }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
  window.addEventListener('resize', scheduleUpdate)
  window.addEventListener('load', scheduleUpdate)
  // Text boxes change size when the page's fonts arrive.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleUpdate)

  function openDialog () {
    let picked = pageColor
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: `<b>Dark page</b> <small style="opacity:.6">v${VERSION}</small>` },
        {
          tag: 'text',
          innerHTML: '<div style="margin:6px 0;display:flex;align-items:center;gap:8px">' +
            `<input type="color" id="dark-page-input" value="${picked}">` +
            '<button type="button" id="dark-page-reset">Black</button></div>'
        },
        {
          tag: 'options',
          options: [
            {
              tag: 'button',
              content: 'Save',
              handler: () => {
                // The default is kept as nothing saved, so it follows any later change of the default.
                if (picked === DEFAULT_COLOR) Framework.removeData(DATA_KEY)
                else Framework.setData(DATA_KEY, picked)
                pageColor = picked
                style.textContent = buildCss(pageColor)
                Framework.closeDialog()
              }
            },
            { tag: 'button', content: 'Cancel', action: 'close' }
          ]
        }
      ]
    })
    const input = document.getElementById('dark-page-input')
    const reset = document.getElementById('dark-page-reset')
    if (!input || !reset) throw new Error('dark-page: the dialog has no color input')
    // `input` fires while the picker moves.
    input.addEventListener('input', () => { picked = input.value.toLowerCase() })
    reset.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      picked = DEFAULT_COLOR
      input.value = DEFAULT_COLOR
    })
  }

  // The match also covers other crackingthecryptic.com pages, which have no Framework and keep the
  // default color.
  if (typeof Framework === 'undefined') return
  if (!Framework.getApp) {
    console.warn('dark-page: SudokuPad\'s Framework has no getApp, so the settings entry was skipped')
    return
  }
  Framework.getApp().then(() => {
    Framework.addSetting({
      tag: 'button',
      name: 'darkpage',
      group: SETTINGS_GROUP,
      content: 'Dark page',
      handler: () => {
        Framework.closeDialog()
        setTimeout(openDialog, 0)
      }
    })
  })
})()
