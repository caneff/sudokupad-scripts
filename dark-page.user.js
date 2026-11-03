// ==UserScript==
// @name         SudokuPad Dark Page
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.2.0
// @description  Makes the page black around the puzzle, or another color chosen in a settings dialog. A rectangle bounding everything the puzzle draws, and the cells a solver writes in, stays as SudokuPad renders it. Not SudokuPad's dark mode.
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

  // Shown in the settings, and the same as @version above. The script cannot read its own header
  // (GM_info is absent when it runs without Tampermonkey), so the number is kept here too.
  const VERSION = '0.2.0'
  // The settings group the entry goes in; SudokuPad declares it, and the dialog starts it collapsed.
  const SETTINGS_GROUP = 'experimental'
  const STYLE_ID = 'dark-page-style'
  const RECT_ID = 'dark-page-rect'
  const DATA_KEY = 'DarkPage_color'
  const DEFAULT_COLOR = '#000000'
  const HEX_COLOR = /^#[0-9a-f]{6}$/i
  // Page text that sits straight on the page background: light on a dark page, dark on a light one.
  const LIGHT_TEXT = '#dddddd'
  const DARK_TEXT = '#222222'
  // White kept beyond the tightest box, in page pixels, before it is rounded outward: covers the
  // antialiasing and a text outline filter, which the elements' boxes leave out.
  const PAD = 1
  // How far a solver's pen mark reaches past the box of the cell it is on: the edge X on an outer
  // edge, measured on sudokupad.app v0.611.0 at 10.07px. The rectangle keeps this much around the
  // cells so the mark sits on white from the moment it is drawn, not from the next measurement.
  const SOLVER_REACH = 11
  // What the puzzle draws as leaf elements. Elements in `defs`, `marker` and the like have no box.
  const DRAWN = 'path, rect, circle, ellipse, line, polyline, polygon, text, image'
  const MARKER_PROPERTIES = ['marker-start', 'marker-mid', 'marker-end']

  // A saved #rrggbb page color, lowercase; null for anything else, which leaves the default.
  function savedColor (data) {
    return typeof data === 'string' && HEX_COLOR.test(data) ? data.toLowerCase() : null
  }

  // The WCAG relative luminance of a #rrggbb color, 0 (black) to 1 (white).
  function luminance (color) {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(color.slice(i, i + 2), 16) / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  // Whichever of the two text colors contrasts more with the page color, so the text stays readable
  // from black to white. The switch falls where the two contrasts are equal.
  function textColorFor (pageColor) {
    const page = luminance(pageColor) + 0.05
    const contrast = (text) => { const t = luminance(text) + 0.05; return Math.max(page, t) / Math.min(page, t) }
    return contrast(LIGHT_TEXT) >= contrast(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
  }

  // The rules never name anything inside the board or declare a variable: SudokuPad's theme
  // variables sit on `:root` and color the grid too, so overriding one would reach it. Each
  // declaration is `!important` so it outranks SudokuPad's own rules, `.setting-darkmode`'s included.
  // The page is the page color, and the rectangle is a div behind the board that takes `--body-bg`, the value
  // SudokuPad gives `body` itself: the puzzle has no background of its own and shows `body` through
  // it, so the rectangle keeps what the board showed, SudokuPad's dark mode included. Painting the
  // svg itself changes its antialiasing, so the board's own elements are left alone. The div's
  // position, stacking and box are set inline, so with this stylesheet off it is a transparent div
  // that changes nothing.
  function buildCss (pageColor = DEFAULT_COLOR) {
    const rule = (selector, ...declarations) => `${selector} { ${declarations.map((d) => `${d} !important`).join('; ')} }`
    return [
      rule('body', `background-color: ${pageColor}`),
      rule(`#${RECT_ID}`, 'background-color: var(--body-bg)'),
      rule('.controls-footer, .controls-footer a', `color: ${textColorFor(pageColor)}`)
    ].join('\n')
  }

  // Boxes are { left, top, right, bottom } in page pixels.
  function unionBoxes (boxes) {
    if (!boxes.length) return null
    return boxes.reduce((u, b) => ({
      left: Math.min(u.left, b.left),
      top: Math.min(u.top, b.top),
      right: Math.max(u.right, b.right),
      bottom: Math.max(u.bottom, b.bottom)
    }))
  }

  // Grows the box by `pad`, then rounds every edge away from it, so a partly covered pixel at the
  // rim is inside the box and not left dark.
  function snapOutward (box, pad) {
    return { left: Math.floor(box.left - pad), top: Math.floor(box.top - pad), right: Math.ceil(box.right + pad), bottom: Math.ceil(box.bottom + pad) }
  }

  // The alpha of a computed color, or of `none`; a paint server such as a url() counts as opaque.
  function paintAlpha (color) {
    const c = String(color).trim()
    if (c === 'none' || c === 'transparent') return 0
    const m = /^rgba\(.*,\s*([\d.]+)\s*\)$/.exec(c)
    return m ? Number(m[1]) : 1
  }

  // `style` holds an element's computed values. A stroke of width 0 paints nothing.
  const strokeShows = (style) => paintAlpha(style.stroke) * Number(style.strokeOpacity) > 0 && parseFloat(style.strokeWidth) > 0

  function hasVisiblePaint (style) {
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return false
    return paintAlpha(style.fill) * Number(style.fillOpacity) > 0 || strokeShows(style)
  }

  // Half the stroke width in page pixels, which an element's box leaves out; `scale` is page pixels
  // per user unit.
  function halfStroke (style, scale) {
    return strokeShows(style) ? parseFloat(style.strokeWidth) * scale / 2 : 0
  }

  // How far a marker's box extends from the point it sits on, in page pixels: the farthest of its
  // four sides from its reference point. `marker` holds the marker element's `markerWidth`,
  // `markerHeight`, `refX`, `refY` and `markerUnits` attribute values, null where absent (the SVG
  // defaults are 3, 3, 0, 0 and `strokeWidth`); `strokeWidth` is the stroke width of the element that
  // uses it, in user units, and `scale` is page pixels per user unit.
  function markerReach (marker, strokeWidth, scale) {
    const number = (value, fallback) => (value === null ? fallback : parseFloat(value))
    const width = number(marker.markerWidth, 3)
    const height = number(marker.markerHeight, 3)
    const refX = number(marker.refX, 0)
    const refY = number(marker.refY, 0)
    const unit = marker.markerUnits === 'userSpaceOnUse' ? 1 : strokeWidth
    return Math.max(refX, width - refX, refY, height - refY) * unit * scale
  }

  // The part of `box` that lies within `limit`.
  const clampBox = (box, limit) => ({
    left: Math.max(box.left, limit.left),
    top: Math.max(box.top, limit.top),
    right: Math.min(box.right, limit.right),
    bottom: Math.min(box.bottom, limit.bottom)
  })

  // Grows a box by `amount` on every side.
  const growBox = (box, amount) => ({ left: box.left - amount, top: box.top - amount, right: box.right + amount, bottom: box.bottom + amount })

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, DEFAULT_COLOR, textColorFor, savedColor, buildCss, unionBoxes, snapOutward, clampBox, growBox, paintAlpha, hasVisiblePaint, halfStroke, markerReach, PAD, SOLVER_REACH, RECT_ID, STYLE_ID }
  }
  if (typeof document === 'undefined') return

  const boxOf = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })

  // How far the markers an element uses extend past its own box, in page pixels.
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

  // The box of everything the puzzle visibly draws, with each element's stroke and markers, joined
  // with every cell's box grown by what a solver's pen marks reach, padded and rounded outward;
  // limited to the svg's own box, which clips what lies outside it. Null when there is no board.
  function measure () {
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

  // The saved color is read before the first paint of the style, so a saved color never shows the
  // default first. Framework.getData works as soon as Framework exists, before the app is ready.
  const hasData = typeof Framework !== 'undefined' && typeof Framework.getData === 'function'
  let pageColor = (hasData && savedColor(Framework.getData(DATA_KEY))) || DEFAULT_COLOR

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

  // With no board on the page (before a puzzle loads, or on a page of the site that is not a
  // puzzle) the page is left as it is: the page color would otherwise hide white the board has not drawn.
  function updateRect () {
    const box = measure()
    style.disabled = !box
    const set = (name, value) => rect.style.setProperty(name, value, 'important')
    if (!box) return set('display', 'none')
    set('display', 'block')
    set('left', `${box.left}px`)
    set('top', `${box.top}px`)
    set('width', `${box.right - box.left}px`)
    set('height', `${box.bottom - box.top}px`)
  }

  // Recomputes before the next paint, once however many changes arrive.
  let queued = false
  function scheduleUpdate () {
    if (queued) return
    queued = true
    window.requestAnimationFrame(() => { queued = false; updateRect() })
  }

  updateRect()
  // SudokuPad swaps the board's elements when a puzzle loads and changes them as a solver plays.
  // The rectangle's own updates and the top bar's clock are not changes to the puzzle.
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
        { tag: 'text', innerHTML: `<b>Dark page</b> <small style="opacity:0.6">v${VERSION}</small>` },
        {
          tag: 'text',
          innerHTML: '<div id="dark-page-editor" style="margin:6px 0;display:flex;align-items:center;gap:8px">' +
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
    // `input` fires while the picker moves; the swatch the user sees is the color Save keeps.
    input.addEventListener('input', () => { picked = input.value.toLowerCase() })
    reset.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      picked = DEFAULT_COLOR
      input.value = DEFAULT_COLOR
    })
  }

  // The page may not be SudokuPad's (the match covers other pages of crackingthecryptic.com), and
  // the darkening above needs no Framework; without it the page keeps the default.
  if (typeof Framework !== 'undefined' && Framework.getApp) {
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
  }
})()
