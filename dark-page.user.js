// ==UserScript==
// @name         SudokuPad Dark Page
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.1.0
// @description  Makes the page black around the puzzle. A rectangle bounding everything the puzzle draws, and the cells a solver writes in, stays as SudokuPad renders it. Not SudokuPad's dark mode.
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

  const STYLE_ID = 'dark-page-style'
  const RECT_ID = 'dark-page-rect'
  const PAGE_COLOR = '#000000'
  // Page text that sits straight on the page background, which the black would hide.
  const TEXT_COLOR = '#dddddd'
  // White kept beyond the tightest box, in page pixels: covers antialiasing, a text outline filter
  // and a pen line's overhang, none of which the elements' boxes include.
  const PAD = 2
  // What the puzzle draws as leaf elements; anything inside these containers is not drawn directly.
  const DRAWN = 'path, rect, circle, ellipse, line, polyline, polygon, text, image'
  const NOT_DRAWN = 'defs, clipPath, mask, pattern, marker, symbol, filter'

  // The rules never name anything inside the board or declare a variable: SudokuPad's theme
  // variables sit on `:root` and color the grid too, so overriding one would reach it. Each
  // declaration is `!important` so it outranks SudokuPad's own rules, `.setting-darkmode`'s included.
  // The page is black, and the rectangle is a div behind the board that takes `--body-bg`, the value
  // SudokuPad gives `body` itself: the puzzle has no background of its own and shows `body` through
  // it, so the rectangle keeps what the board showed, SudokuPad's dark mode included. Painting the
  // svg itself changes its antialiasing, so the board's own elements are left alone.
  function buildCss () {
    const rule = (selector, ...declarations) => `${selector} { ${declarations.map((d) => `${d} !important`).join('; ')} }`
    return [
      rule('body', `background-color: ${PAGE_COLOR}`),
      rule(`#${RECT_ID}`, 'position: fixed', 'z-index: -1', 'pointer-events: none', 'background-color: var(--body-bg)'),
      rule('.controls-footer, .controls-footer a', `color: ${TEXT_COLOR}`)
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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildCss, unionBoxes, snapOutward, paintAlpha, hasVisiblePaint, halfStroke, PAD }
  }
  if (typeof document === 'undefined') return

  const boxOf = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })

  // The box of everything the puzzle visibly draws, with each element's stroke, joined with the box
  // of every cell, where a solver's digits, marks, colors and selection appear; limited to what the
  // svg shows, which clips what lies outside it. Null when there is no board.
  function measure () {
    const svg = document.querySelector('#svgrenderer')
    if (!svg) return null
    const svgBox = boxOf(svg.getBoundingClientRect())
    const scale = svg.getScreenCTM() ? svg.getScreenCTM().a : 1
    const boxes = []
    svg.querySelectorAll(DRAWN).forEach((el) => {
      if (el.closest(NOT_DRAWN)) return
      if (el.tagName === 'text' && !el.textContent.trim()) return
      const style = window.getComputedStyle(el)
      if (!hasVisiblePaint(style)) return
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return
      const r = el.getBoundingClientRect()
      if (!r.width && !r.height) return
      const s = halfStroke(style, scale)
      boxes.push({ left: r.left - s, top: r.top - s, right: r.right + s, bottom: r.bottom + s })
    })
    document.querySelectorAll('.cells .cell').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width && r.height) boxes.push(boxOf(r))
    })
    const drawn = unionBoxes(boxes)
    if (!drawn) return null
    const clipped = {
      left: Math.max(drawn.left, svgBox.left),
      top: Math.max(drawn.top, svgBox.top),
      right: Math.min(drawn.right, svgBox.right),
      bottom: Math.min(drawn.bottom, svgBox.bottom)
    }
    return snapOutward(clipped, PAD)
  }

  function ensureRect () {
    let rect = document.getElementById(RECT_ID)
    if (!rect) {
      rect = document.createElement('div')
      rect.id = RECT_ID
      document.body.appendChild(rect)
    }
    return rect
  }

  // Writes only what changed, so updating the rectangle never triggers the observer again.
  function setStyle (el, name, value) {
    if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value, 'important')
  }

  function updateRect () {
    const rect = ensureRect()
    const box = measure()
    setStyle(rect, 'display', box ? 'block' : 'none')
    if (!box) return
    setStyle(rect, 'left', `${box.left}px`)
    setStyle(rect, 'top', `${box.top}px`)
    setStyle(rect, 'width', `${box.right - box.left}px`)
    setStyle(rect, 'height', `${box.bottom - box.top}px`)
  }

  // Recomputes before the next paint, once however many changes arrive.
  let queued = false
  function scheduleUpdate () {
    if (queued) return
    queued = true
    window.requestAnimationFrame(() => { queued = false; updateRect() })
  }

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = buildCss()
  document.head.appendChild(style)
  updateRect()
  // SudokuPad swaps the board's elements when a puzzle loads and changes them as a solver plays.
  new window.MutationObserver((records) => {
    if (records.some((r) => (r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest('.game'))) scheduleUpdate()
  }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
  window.addEventListener('resize', scheduleUpdate)
  window.addEventListener('load', scheduleUpdate)
  // Text boxes change size when the page's fonts arrive.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleUpdate)
})()
