// ==UserScript==
// @name         SudokuPad Auto Rules Resizer
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.1.0
// @description  Fits SudokuPad's rules to the screen in landscape: the rules pane widens to the window's right edge and takes the largest font at which all the rules fit, never smaller than SudokuPad's own. f+ and f- on the pane change the font a pixel at a time, and two drag corners resize the pane. Nothing is saved.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/auto-rules-resizer.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/auto-rules-resizer.user.js
// ==/UserScript==

// Ported from the rules-pane fit of twitch-rules-scroller's sudokupad-sync.user.js, after Nell Gwynn's
// original resizing scripts.
(function () {
  'use strict'

  const EDGE_PX = 8 // the gap the pane keeps to the window's right edge
  const MIN_FONT_PX = 8 // the smallest font f- goes to
  const MAX_FONT_PX = 200
  const REM_PX = 16
  const RULES_MIN = { width: 15 * REM_PX, height: 7 * REM_PX } // the pane's floor under a drag, css px
  const RESIZE_MS = 100
  const CORNERS = ['ur', 'dl']

  // Largest integer in [min, max] that `fits` accepts, min when none does; `fits` is true up to some size and
  // false past it.
  function largestSize (fits, min, max) {
    let lo = min
    let hi = max
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (fits(mid)) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  // The room the pane has to grow into: from its top to its container's bottom, never past the window, less
  // the container's bottom padding.
  function rulesRoom ({ rulesTop, containerBottom, viewportBottom = Infinity, paddingBottom = 0 }) {
    return Math.max(0, Math.min(containerBottom, viewportBottom) - paddingBottom - rulesTop)
  }

  // The nearest ancestor that clips or scrolls its overflow, else the direct parent, so no selector chain of
  // SudokuPad's is hard-coded.
  function rulesContainer (rules, getStyle) {
    for (let el = rules.parentElement; el && el.tagName !== 'BODY'; el = el.parentElement) {
      if (/auto|scroll|hidden|clip/.test(getStyle(el).overflowY)) return el
    }
    return rules.parentElement
  }

  // `scale` is visual px per css px: SudokuPad scales the whole controls column. Nothing sits right of the
  // pane, so the space up to the window's edge is the pane's to take.
  function rulesWidth ({ natural, rulesLeft, scale, viewportWidth }) {
    if (!(scale > 0)) return natural
    return Math.max(natural, Math.floor((viewportWidth - rulesLeft - EDGE_PX) / scale))
  }

  // Never under SudokuPad's own size, so rules too long to fit still scroll at the size SudokuPad gives them.
  function autoFontPx (fits, ownPx) {
    const px = largestSize(fits, Math.ceil(ownPx), MAX_FONT_PX)
    return px > ownPx && fits(px) ? px : ownPx
  }

  function nudgedFontPx (autoPx, nudgePx) {
    return Math.max(MIN_FONT_PX, autoPx + nudgePx)
  }

  // A size fits when the rules take no more than the room and do not overflow the pane: the room can reach
  // below the pane's own max-height, into its container's margin.
  function fitRulesFont (rules, room, ownPx, nudgePx) {
    const fits = (n) => {
      rules.style.fontSize = `${n}px`
      return rules.scrollHeight <= Math.min(room, rules.clientHeight)
    }
    rules.style.fontSize = `${nudgedFontPx(autoFontPx(fits, ownPx), nudgePx)}px`
  }

  // A drag's box is {w, h, x, y} in visual px: extra width, extra height, and how far the controls column
  // moved. The top-right corner ("ur") grows the pane right and up, moving the controls up; the bottom-left
  // ("dl") grows it left and down, moving them left. `size` is the pane's visual size, `min` its floor and
  // `free` the visual px it may still grow into each way. The controls move by what the pane grew, not by the
  // pointer, so a clamped corner stays under it.
  const noRulesDrag = () => ({ w: 0, h: 0, x: 0, y: 0 })
  function dragRulesBox (box, corner, dx, dy, size, min, free) {
    if (!CORNERS.includes(corner)) throw new Error(`the rules pane has no corner "${corner}"`)
    const ur = corner === 'ur'
    // The floor stops a shrink; it never grows a pane that SudokuPad laid out smaller.
    const growW = Math.max(Math.min(ur ? dx : -dx, Math.max(0, ur ? free.right : free.left)), Math.min(0, min.width - size.width))
    const growH = Math.max(Math.min(ur ? -dy : dy, Math.max(0, ur ? free.up : free.down)), Math.min(0, min.height - size.height))
    return {
      w: box.w + growW,
      h: box.h + growH,
      x: ur ? box.x : box.x - growW,
      y: ur ? box.y - growH : box.y
    }
  }

  // The dragged pane's width and room in css px: the drag's deltas on the fit's own answers, never under the
  // floor (or the undragged size, when that is smaller) and never past the window (`left`/`top` are the pane's undragged visual corner).
  function draggedPane ({ width, room, box, scale, left, top, viewport }) {
    if (!(scale > 0)) return { width, room }
    const out = { width, room }
    if (box.w) {
      const most = Math.floor((viewport.width - EDGE_PX - left - box.x) / scale)
      out.width = Math.max(Math.min(RULES_MIN.width, width), Math.min(width + box.w / scale, most))
    }
    if (box.h) {
      const most = Math.floor((viewport.height - top - box.y) / scale)
      out.room = Math.max(Math.min(RULES_MIN.height, room), Math.min(room + box.h / scale, most))
    }
    return out
  }

  // The drag for the puzzle it was made on; a new puzzle starts undragged.
  const dragged = { key: null, box: noRulesDrag() }
  function draggedBox (key) {
    if (dragged.key !== key) Object.assign(dragged, { key, box: noRulesDrag() })
    return dragged.box
  }

  // SudokuPad's own rule in App.resize.
  const isLandscape = (gameRect) => gameRect.width > gameRect.height

  // twitch-rules-scroller's sync script sizes the same pane: on a page where it runs, this script leaves the
  // pane to it.
  const streamScriptActive = (doc) => Boolean(doc.getElementById('sudokupad-sync-nudge') || doc.querySelector('[id^="sudokupad-sync-drag-"]'))

  // The style properties the fit writes on the pane.
  const FIT_STYLES = ['width', 'maxWidth', 'boxSizing', 'fontSize', 'maxHeight']

  // Widens the pane into the free space at its right, then takes the largest font that fits. Returns false,
  // putting the last fit back, when the pane is not shown or has no room yet.
  function fitRulesPane ({ rules, container, getStyle, viewport, nudgePx, box = noRulesDrag(), controls = null }) {
    rules.style.overflowWrap = 'anywhere' // measure a long unbroken word honestly
    const before = FIT_STYLES.map((k) => rules.style[k])
    const movedBefore = controls?.style.translate
    const putBack = () => {
      FIT_STYLES.forEach((k, n) => { rules.style[k] = before[n] })
      if (controls) controls.style.translate = movedBefore ?? ''
      return false
    }
    // Measure the pane as SudokuPad laid it out: the container wraps the pane, so a room read under the last
    // fit's larger font or wider box is that fit's own height, and every fit would grow the pane again.
    for (const k of FIT_STYLES) rules.style[k] = ''
    if (controls) controls.style.translate = ''
    const natural = rules.offsetWidth
    if (!(natural > 0)) return putBack() // SudokuPad hides the pane of a puzzle with no rules
    const home = rules.getBoundingClientRect()
    const scale = home.width / natural
    const ownPx = parseFloat(getStyle(rules).fontSize)
    const visualRoom = rulesRoom({
      rulesTop: home.top,
      containerBottom: container.getBoundingClientRect().bottom,
      viewportBottom: viewport.height,
      paddingBottom: parseFloat(getStyle(container).paddingBottom) || 0
    })
    if (!(visualRoom > 0)) return putBack()
    const fitted = draggedPane({
      width: rulesWidth({ natural, rulesLeft: home.left, scale, viewportWidth: viewport.width }),
      room: visualRoom / scale,
      box,
      scale,
      left: home.left,
      top: home.top,
      viewport
    })
    if (box.h) rules.style.maxHeight = `${fitted.room}px`
    if (controls && (box.x || box.y)) controls.style.translate = `${box.x}px ${box.y}px`
    if (fitted.width > natural || box.w) Object.assign(rules.style, { boxSizing: 'border-box', maxWidth: 'none', width: `${fitted.width}px` })
    fitRulesFont(rules, fitted.room, ownPx, nudgePx)
    return true
  }

  function clearFit (rules, controls) {
    for (const k of [...FIT_STYLES, 'overflowWrap']) rules.style[k] = ''
    if (controls) controls.style.translate = ''
  }

  function makeTrailing (fn, ms, schedule = setTimeout, cancel = clearTimeout) {
    let timer = null
    return () => {
      cancel(timer)
      timer = schedule(() => {
        timer = null
        fn()
      }, ms)
    }
  }

  // Calls onMove(dx, dy) with each pointer step of a drag that began on `corner`, and onActive(true|false) as
  // it starts and ends. Move and release are heard on the window, so a fast drag that outruns the corner holds.
  function watchCornerDrag (corner, win, onMove, onActive) {
    corner.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      let x = e.clientX
      let y = e.clientY
      const move = (m) => {
        const dx = m.clientX - x
        const dy = m.clientY - y
        x = m.clientX
        y = m.clientY
        if (dx || dy) onMove(dx, dy)
      }
      const stop = () => {
        win.removeEventListener('pointermove', move)
        win.removeEventListener('pointerup', stop)
        win.removeEventListener('pointercancel', stop)
        onActive(false)
      }
      win.addEventListener('pointermove', move)
      win.addEventListener('pointerup', stop)
      win.addEventListener('pointercancel', stop)
      onActive(true)
    })
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      largestSize,
      rulesRoom,
      rulesContainer,
      rulesWidth,
      autoFontPx,
      nudgedFontPx,
      fitRulesPane,
      clearFit,
      dragRulesBox,
      draggedPane,
      draggedBox,
      noRulesDrag,
      isLandscape,
      streamScriptActive,
      makeTrailing,
      watchCornerDrag
    }
  }
  if (typeof document === 'undefined') return

  // The match also covers other crackingthecryptic.com pages, which have no Framework.
  if (typeof Framework === 'undefined') return
  if (!Framework.getApp) {
    console.warn('auto-rules-resizer: SudokuPad\'s Framework has no getApp, so nothing was changed')
    return
  }

  const ID = 'auto-rules-resizer'
  const FONT_BAR_ID = `${ID}-font`
  const CORNER_CLASS = `${ID}-corner`
  const SHOWN_CLASS = `${ID}-shown` // on the body while the pane is fitted: the font bar shows
  const HOVER_CLASS = `${ID}-hover` // on the body while the pointer is over the pane or a corner: the corners show
  const CORNER_PX = 28
  const BAR_GAP_PX = 2
  const CORNER_CURSOR = { ur: 'ne-resize', dl: 'sw-resize' }

  const STYLE = `
    #${FONT_BAR_ID} { position: fixed; z-index: 99999; display: none; gap: 4px; font: 14px monospace; }
    #${FONT_BAR_ID} button { all: revert; padding: 0 6px; border-radius: 8px; opacity: .7; cursor: pointer; font: inherit; }
    .${CORNER_CLASS} { position: fixed; z-index: 99999; display: none; width: ${CORNER_PX}px; height: ${CORNER_PX}px;
      box-sizing: border-box; border-radius: 8px; background: rgba(85, 255, 255, .4); border: 1px dotted rgba(85, 255, 255, .8);
      touch-action: none; }
    body.${SHOWN_CLASS} #${FONT_BAR_ID} { display: flex; }
    body.${SHOWN_CLASS}.${HOVER_CLASS} .${CORNER_CLASS} { display: block; }
  `

  let nudgePx = 0
  let fitted = false // whether the fit's output may be on the pane
  let hovering = false
  let dragging = false

  const getStyle = (el) => window.getComputedStyle(el)
  const rulesPane = () => document.querySelector('.puzzle-rules')
  const controlsColumn = () => document.getElementById('controls')
  // A puzzle with no id of its own (a replay or a pack) is told apart by its URL.
  const dragKey = () => String(Framework.app?.puzzle?.puzzleId || window.location.href)
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight })

  const showHover = () => document.body.classList.toggle(HOVER_CLASS, hovering || dragging)

  function addStyle () {
    const style = document.createElement('style')
    style.id = `${ID}-style`
    style.textContent = STYLE
    document.head.appendChild(style)
  }

  function addFontBar () {
    const bar = document.createElement('div')
    bar.id = FONT_BAR_ID
    for (const [label, step] of [['f+', 1], ['f-', -1]]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.title = step > 0 ? 'Larger rules font' : 'Smaller rules font'
      button.addEventListener('click', () => {
        nudgePx += step
        fitPage()
      })
      bar.appendChild(button)
    }
    document.body.appendChild(bar)
  }

  function addCorner (corner) {
    const el = document.createElement('div')
    el.id = `${ID}-drag-${corner}`
    el.className = CORNER_CLASS
    el.style.cursor = CORNER_CURSOR[corner]
    watchCornerDrag(el, window, (dx, dy) => dragRules(corner, dx, dy), (on) => {
      dragging = on
      showHover()
    })
    document.body.appendChild(el)
  }

  // The corners show only while the pointer is over the pane or a corner, or a drag is under way.
  function watchHover () {
    document.addEventListener('pointerover', (e) => {
      hovering = Boolean(e.target.closest?.(`.puzzle-rules, .${CORNER_CLASS}`))
      showHover()
    })
    document.addEventListener('pointerout', (e) => {
      if (e.relatedTarget) return // pointerover on the next element answers
      hovering = false
      showHover()
    })
  }

  const clampTo = (value, most) => `${Math.max(0, Math.min(value, most))}px`
  function place (el, left, top) {
    el.style.left = clampTo(left, window.innerWidth - el.offsetWidth)
    el.style.top = clampTo(top, window.innerHeight - el.offsetHeight)
  }

  // The font bar sits on the pane's top-right corner, just above the pane, so it covers none of the rules.
  function placeControls (rules) {
    const r = rules.getBoundingClientRect()
    const bar = document.getElementById(FONT_BAR_ID)
    place(bar, r.right - bar.offsetWidth, r.top - bar.offsetHeight - BAR_GAP_PX)
    const at = { ur: [r.right - CORNER_PX, r.top], dl: [r.left, r.bottom - CORNER_PX] }
    for (const corner of CORNERS) {
      const el = document.getElementById(`${ID}-drag-${corner}`)
      el.style.left = clampTo(at[corner][0], window.innerWidth - CORNER_PX)
      el.style.top = clampTo(at[corner][1], window.innerHeight - CORNER_PX)
    }
  }

  function showControls (on) {
    document.body.classList.toggle(SHOWN_CLASS, on)
  }

  function fitPage () {
    try {
      const rules = rulesPane()
      if (!rules) return
      const controls = controlsColumn()
      if (streamScriptActive(document)) {
        // The stream script's own fit clears and rewrites the same styles, so they are left to it.
        showControls(false)
        return
      }
      const game = document.querySelector('.game')
      if (!game || !isLandscape(game.getBoundingClientRect())) {
        if (fitted) clearFit(rules, controls)
        fitted = false
        showControls(false)
        return
      }
      const done = fitRulesPane({
        rules,
        container: rulesContainer(rules, getStyle),
        getStyle,
        viewport: viewport(),
        nudgePx,
        box: draggedBox(dragKey()),
        controls
      })
      fitted = fitted || done
      showControls(done)
      if (done) placeControls(rules)
    } catch (err) {
      console.error('auto-rules-resizer: the rules fit failed', err)
    }
  }

  function dragRules (corner, dx, dy) {
    const rules = rulesPane()
    if (!rules) return
    const size = rules.getBoundingClientRect()
    const natural = rules.offsetWidth
    const scale = natural > 0 ? size.width / natural : 1
    // The board's right edge is where the pane stops growing left.
    const board = document.getElementById('board')
    const boardRight = board ? board.getBoundingClientRect().right : 0
    const free = {
      right: window.innerWidth - EDGE_PX - size.right,
      up: size.top,
      left: size.left - boardRight,
      down: window.innerHeight - size.bottom
    }
    const min = { width: RULES_MIN.width * scale, height: RULES_MIN.height * scale }
    const box = draggedBox(dragKey())
    Object.assign(box, dragRulesBox(box, corner, dx, dy, size, min, free))
    fitPage()
  }

  // SudokuPad calls resizeBoard on every layout: a new puzzle, a resize, a turn of the device.
  function refitAfterResizeBoard (app) {
    if (typeof app.resizeBoard !== 'function') {
      console.warn('auto-rules-resizer: SudokuPad\'s app has no resizeBoard, so the rules refit only on a window resize')
      return
    }
    const original = app.resizeBoard
    app.resizeBoard = function (...args) {
      const out = original.apply(this, args)
      fitPage()
      return out
    }
  }

  Framework.getApp().then((app) => {
    addStyle()
    addFontBar()
    for (const corner of CORNERS) addCorner(corner)
    watchHover()
    refitAfterResizeBoard(app)
    window.addEventListener('resize', makeTrailing(fitPage, RESIZE_MS))
    fitPage()
  })
})()
