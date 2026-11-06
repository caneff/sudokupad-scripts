// ==UserScript==
// @name         SudokuPad Auto Rules Resizer
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.3.0
// @description  Fits SudokuPad's rules to the screen in landscape: the rules pane keeps SudokuPad's width and takes the largest font at which all the rules fit in the height, widening only when they would still scroll, never smaller than SudokuPad's own. f+ and f- on the pane change the font a pixel at a time, and two drag corners resize the pane. A Rules resizer entry in SudokuPad's settings caps the automatic width and height.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/auto-rules-resizer.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/auto-rules-resizer.user.js
// ==/UserScript==

(function () {
  'use strict'

  // GM_info is absent without Tampermonkey, so the script cannot read @version; keep this equal to it.
  const VERSION = '0.3.0'
  const SETTINGS_GROUP = 'experimental'
  const MAX_WIDTH_KEY = 'AutoRulesResizer_maxWidth'
  const MAX_HEIGHT_KEY = 'AutoRulesResizer_maxHeight'
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

  const noLimits = () => ({ maxWidth: null, maxHeight: null })

  function normalizeLimit (raw) {
    const px = Math.round(Number(raw))
    return Number.isFinite(px) && px > 0 ? px : null
  }

  // A blank box is no limit; text that is no usable number keeps the limit as it was, so a slip never wipes a saved one.
  function limitFromBox (text, current) {
    return text.trim() === '' ? null : (normalizeLimit(text) ?? current)
  }

  function readLimits (store) {
    return { maxWidth: normalizeLimit(store.getData(MAX_WIDTH_KEY)), maxHeight: normalizeLimit(store.getData(MAX_HEIGHT_KEY)) }
  }

  // No limit is no key, so a fresh install saves nothing.
  function saveLimits (store, limits) {
    for (const [key, px] of [[MAX_WIDTH_KEY, limits.maxWidth], [MAX_HEIGHT_KEY, limits.maxHeight]]) {
      if (px === null) store.removeData(key)
      else store.setData(key, px)
    }
  }

  // A saved limit is a whole number of pixels, or null for none; a string or boolean that `normalizeLimit` would coerce is not one.
  const readPastedLimit = (data) => (data === null || (Number.isInteger(data) && data > 0) ? data : undefined)
  const READERS = { [MAX_WIDTH_KEY]: readPastedLimit, [MAX_HEIGHT_KEY]: readPastedLimit }

  // null is no limit, so a paste can clear one.
  function copiedSettings (store) {
    const { maxWidth, maxHeight } = readLimits(store)
    return JSON.stringify({ [MAX_WIDTH_KEY]: maxWidth, [MAX_HEIGHT_KEY]: maxHeight })
  }

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

  function rulesRoom ({ rulesTop, containerBottom, viewportBottom, paddingBottom }) {
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

  // The widest the automatic fit may make the pane. `scale` is visual px per css px: SudokuPad scales the whole
  // controls column. Nothing sits right of the pane, so the space up to the window's edge is the pane's to take.
  function rulesWidth ({ natural, rulesLeft, scale, viewportWidth, maxWidth = null }) {
    if (!(scale > 0)) return natural
    const edge = Math.floor((viewportWidth - rulesLeft - EDGE_PX) / scale)
    return Math.max(natural, maxWidth === null ? edge : Math.min(edge, maxWidth))
  }

  // Never under SudokuPad's own size, so rules too long to fit still scroll at the size SudokuPad gives them.
  function autoFontPx (fits, ownPx) {
    const px = largestSize(fits, Math.ceil(ownPx), MAX_FONT_PX)
    return px > ownPx && fits(px) ? px : ownPx
  }

  function nudgedFontPx (autoPx, nudgePx) {
    return Math.max(MIN_FONT_PX, autoPx + nudgePx)
  }

  const nudgedAutoFontPx = (fits, ownPx, nudgePx) => nudgedFontPx(autoFontPx(fits, ownPx), nudgePx)

  // The pane's max-height is the room or a drag's, so a size fits when the rules take no more than the room.
  const fitsRoom = (rules, room) => rules.scrollHeight <= Math.min(room, rules.clientHeight)

  function fitRulesFont (rules, room, ownPx, nudgePx) {
    const fits = (n) => {
      rules.style.fontSize = `${n}px`
      return fitsRoom(rules, room)
    }
    rules.style.fontSize = `${nudgedAutoFontPx(fits, ownPx, nudgePx)}px`
  }

  // `fits(width, font)` is true from some width up. f+ widens for the bigger font, which is the nudge on the
  // automatic size at the width before it.
  function autoPaneFit ({ natural, widthLimit: limit, ownPx, nudgePx, fits }) {
    const narrowest = (from, fitsAt) => limit - largestSize((slack) => fitsAt(limit - slack), 0, limit - from)
    let width = fits(natural, ownPx) ? natural : narrowest(natural, (w) => fits(w, ownPx))
    const fontPx = nudgedAutoFontPx((n) => fits(width, n), ownPx, nudgePx)
    if (nudgePx > 0 && !fits(width, fontPx)) width = narrowest(width, (w) => fits(w, fontPx))
    return { width, fontPx }
  }

  function setPaneWidth (rules, width, natural) {
    if (width === natural) Object.assign(rules.style, { boxSizing: '', maxWidth: '', width: '' })
    else Object.assign(rules.style, { boxSizing: 'border-box', maxWidth: 'none', width: `${width}px` })
  }

  // A drag is {w, h, x, y} in visual px: extra width, extra height, and how far the controls column moved. The
  // top-right corner ("ur") grows the pane right and up, moving the controls up; the bottom-left ("dl") grows
  // it left and down, moving them left. The controls move by what the pane grew, not by the pointer, so a
  // stopped corner stays under it. Where the window and the board stop a drag is `clampDrag`'s, at each fit.
  const noRulesDrag = () => ({ w: 0, h: 0, x: 0, y: 0 })
  function dragRulesBox (box, corner, dx, dy, paneSize, minSize) {
    if (!CORNERS.includes(corner)) throw new Error(`the rules pane has no corner "${corner}"`)
    const ur = corner === 'ur'
    // The floor stops a shrink; it never grows a pane that SudokuPad laid out smaller.
    const growW = Math.max(ur ? dx : -dx, Math.min(0, minSize.width - paneSize.width))
    const growH = Math.max(ur ? -dy : dy, Math.min(0, minSize.height - paneSize.height))
    return {
      w: box.w + growW,
      h: box.h + growH,
      x: ur ? box.x : box.x - growW,
      y: ur ? box.y - growH : box.y
    }
  }

  // The drag as far as the layout allows now, which can be less than when it was made (a smaller window, a
  // board that moved): the controls column stays inside the window and the pane clear of the board. `pane` is
  // the undragged pane's visual left and right at its fitted width, `column` the undragged controls column's
  // visual top and bottom.
  function clampDrag (box, { pane, column, boardRight, viewport }) {
    // A move right or down comes only with a shrink of the same size, which keeps the column where it was.
    const x = Math.max(box.x, boardRight - pane.left)
    const y = Math.max(box.y, -column.top)
    return {
      w: Math.min(box.w, Math.max(0, viewport.width - EDGE_PX - pane.right) - x),
      h: Math.min(box.h, Math.max(0, viewport.height - column.bottom - y)),
      x,
      y
    }
  }

  // The dragged pane's width and room in css px: the drag's deltas on the fit's own answers, never under the
  // floor, or the undragged size when that is smaller.
  function draggedPane ({ width, room, box, scale }) {
    return {
      width: box.w ? Math.max(Math.min(RULES_MIN.width, width), width + box.w / scale) : width,
      room: box.h ? Math.max(Math.min(RULES_MIN.height, room), room + box.h / scale) : room
    }
  }

  // The drag for the puzzle it was made on; a new puzzle starts undragged.
  const dragged = { key: null, box: noRulesDrag() }
  function draggedBox (key) {
    if (dragged.key !== key) Object.assign(dragged, { key, box: noRulesDrag() })
    return dragged.box
  }

  // SudokuPad's own rule in App.resize.
  const isLandscape = (gameRect) => gameRect.width > gameRect.height

  // Every style property the fit writes on the pane; it also moves the controls column by its `translate`.
  const FIT_STYLES = ['overflowWrap', 'width', 'maxWidth', 'boxSizing', 'fontSize', 'maxHeight']

  function clearFit (rules, controls) {
    for (const k of FIT_STYLES) rules.style[k] = ''
    controls.style.translate = ''
  }

  // Fits the pane to the room below it at SudokuPad's width, widening only as the rules need, and returns the
  // drag it applied. `limits` cap the automatic fit, never a drag. Returns null when the pane is not shown, with
  // the fit taken off, or has no room yet, with the last fit put back.
  function fitRulesPane ({ rules, container, controls, getStyle, viewport, boardRight, nudgePx, box, limits = noLimits() }) {
    const before = FIT_STYLES.map((k) => rules.style[k])
    const movedBefore = controls.style.translate
    // Measure the pane as SudokuPad laid it out: the container wraps the pane, so a room read under the last
    // fit's larger font or wider box is that fit's own height, and every fit would grow the pane again.
    clearFit(rules, controls)
    rules.style.overflowWrap = 'anywhere' // measure a long unbroken word honestly
    const natural = rules.offsetWidth
    if (!(natural > 0)) { // SudokuPad hides the pane of a puzzle with no rules
      clearFit(rules, controls)
      return null
    }
    const home = rules.getBoundingClientRect()
    const scale = home.width / natural
    const ownPx = parseFloat(getStyle(rules).fontSize)
    const visualRoom = rulesRoom({
      rulesTop: home.top,
      containerBottom: container.getBoundingClientRect().bottom,
      viewportBottom: viewport.height,
      paddingBottom: parseFloat(getStyle(container).paddingBottom) || 0
    })
    if (!(visualRoom > 0)) { // before layout, or a collapsed container: keep the last fit until the next one
      FIT_STYLES.forEach((k, n) => { rules.style[k] = before[n] })
      controls.style.translate = movedBefore
      return null
    }
    const room = visualRoom / scale
    const autoRoom = limits.maxHeight === null ? room : Math.min(room, limits.maxHeight)
    // SudokuPad caps the pane at 14rem: the fit may use the whole room, never less than SudokuPad gives, and a
    // max auto height holds the pane itself.
    const paneMax = Math.max(room, parseFloat(getStyle(rules).maxHeight) || 0)
    rules.style.maxHeight = `${limits.maxHeight === null ? paneMax : Math.min(paneMax, limits.maxHeight)}px`
    const fitsAt = (width, font) => {
      setPaneWidth(rules, width, natural)
      rules.style.fontSize = `${font}px`
      return fitsRoom(rules, autoRoom)
    }
    const { width, fontPx } = autoPaneFit({
      natural,
      widthLimit: rulesWidth({ natural, rulesLeft: home.left, scale, viewportWidth: viewport.width, maxWidth: limits.maxWidth }),
      ownPx,
      nudgePx,
      fits: fitsAt
    })
    const column = controls.getBoundingClientRect()
    const applied = clampDrag(box, {
      pane: { left: home.left, right: home.left + width * scale },
      column,
      boardRight,
      viewport
    })
    // A drag that changes the height starts from the pane's own height, not the room under it, so the pane
    // grows by what the corner moved.
    const fitted = draggedPane({ width, room: applied.h ? home.height / scale : autoRoom, box: applied, scale })
    if (applied.h) rules.style.maxHeight = `${fitted.room}px`
    if (applied.x || applied.y) controls.style.translate = `${applied.x}px ${applied.y}px`
    setPaneWidth(rules, fitted.width, natural)
    if (applied.w || applied.h) fitRulesFont(rules, fitted.room, ownPx, nudgePx)
    else rules.style.fontSize = `${fontPx}px`
    return applied
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

  // Move and release are heard on the window, so a fast drag that outruns the corner holds.
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
      VERSION,
      MAX_WIDTH_KEY,
      copiedSettings,
      pastedSettings,
      pasteReport,
      MAX_HEIGHT_KEY,
      normalizeLimit,
      limitFromBox,
      readLimits,
      saveLimits,
      noLimits,
      autoPaneFit,
      largestSize,
      rulesRoom,
      rulesContainer,
      rulesWidth,
      autoFontPx,
      nudgedFontPx,
      fitRulesPane,
      clearFit,
      dragRulesBox,
      clampDrag,
      draggedPane,
      draggedBox,
      noRulesDrag,
      isLandscape,
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
  const HOVER_CLASS = `${ID}-hover` // on the body while the pointer is over the pane, a corner or the font bar, or a drag is under way: the corners and the bar show
  const MAX_WIDTH_INPUT_ID = `${ID}-max-width`
  const MAX_HEIGHT_INPUT_ID = `${ID}-max-height`
  const CORNER_PX = 28
  const CORNER_CURSOR = { ur: 'ne-resize', dl: 'sw-resize' }
  const cornerId = (corner) => `${ID}-drag-${corner}`

  const STYLE = `
    #${FONT_BAR_ID} { position: fixed; z-index: 99999; display: none; visibility: hidden; gap: 4px; font: 14px monospace; }
    #${FONT_BAR_ID} button { all: revert; padding: 0 6px; border-radius: 8px; opacity: .7; cursor: pointer; font: inherit; }
    .${CORNER_CLASS} { position: fixed; z-index: 99999; display: none; width: ${CORNER_PX}px; height: ${CORNER_PX}px;
      box-sizing: border-box; border-radius: 8px; background: rgba(85, 255, 255, .4); border: 1px dotted rgba(85, 255, 255, .8);
      touch-action: none; }
    body.${SHOWN_CLASS} #${FONT_BAR_ID} { display: flex; }
    body.${SHOWN_CLASS}.${HOVER_CLASS} #${FONT_BAR_ID} { visibility: visible; }
    body.${SHOWN_CLASS}.${HOVER_CLASS} .${CORNER_CLASS} { display: block; }
  `

  let nudgePx = 0
  let fitted = false // whether the fit's output may be on the pane
  let limits = noLimits()
  let hovering = false
  let dragging = false

  const getStyle = (el) => window.getComputedStyle(el)
  const rulesPane = () => document.querySelector('.puzzle-rules')
  const controlsColumn = () => document.getElementById('controls')
  // A puzzle with no id of its own (a replay or a pack) is told apart by its URL.
  const dragKey = () => String(Framework.app?.puzzle?.puzzleId || window.location.href)

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
    el.id = cornerId(corner)
    el.className = CORNER_CLASS
    el.style.cursor = CORNER_CURSOR[corner]
    watchCornerDrag(el, window, (dx, dy) => dragRules(corner, dx, dy), (on) => {
      dragging = on
      showHover()
    })
    document.body.appendChild(el)
  }

  // The corners and the font bar show only while the pointer is over the pane, a corner or the bar, or a drag is
  // under way. The bar sits flush against the pane, so the pointer never leaves them on its way up.
  function watchHover () {
    document.addEventListener('pointerover', (e) => {
      hovering = Boolean(e.target.closest?.(`.puzzle-rules, .${CORNER_CLASS}, #${FONT_BAR_ID}`))
      showHover()
    })
    document.addEventListener('pointerout', (e) => {
      if (e.relatedTarget) return // pointerover on the next element answers
      hovering = false
      showHover()
    })
  }

  // Sizes are passed in: a corner hidden until hover measures 0 x 0.
  function place (el, left, top, width, height) {
    el.style.left = `${Math.max(0, Math.min(left, window.innerWidth - width))}px`
    el.style.top = `${Math.max(0, Math.min(top, window.innerHeight - height))}px`
  }

  // The font bar sits on the pane's top-left corner, which a widening pane leaves where it is, directly above the
  // pane so it covers none of the rules, or directly below it when the pane reaches the window's top.
  function placeControls (rules) {
    const r = rules.getBoundingClientRect()
    const bar = document.getElementById(FONT_BAR_ID)
    const above = r.top - bar.offsetHeight
    place(bar, r.left, above >= 0 ? above : r.bottom, bar.offsetWidth, bar.offsetHeight)
    place(document.getElementById(cornerId('ur')), r.right - CORNER_PX, r.top, CORNER_PX, CORNER_PX)
    place(document.getElementById(cornerId('dl')), r.left, r.bottom - CORNER_PX, CORNER_PX, CORNER_PX)
  }

  function showControls (on) {
    document.body.classList.toggle(SHOWN_CLASS, on)
  }

  function fitPage () {
    try {
      const rules = rulesPane()
      const controls = controlsColumn()
      if (!rules || !controls) return
      const game = document.querySelector('.game')
      if (!game || !isLandscape(game.getBoundingClientRect())) {
        if (fitted) clearFit(rules, controls)
        fitted = false
        showControls(false)
        return
      }
      const board = document.getElementById('board')
      const box = draggedBox(dragKey())
      const applied = fitRulesPane({
        rules,
        container: rulesContainer(rules, getStyle),
        controls,
        getStyle,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        boardRight: board ? board.getBoundingClientRect().right : 0,
        nudgePx,
        box,
        limits
      })
      if (applied) Object.assign(box, applied) // a later drag starts from where this one stopped
      fitted = fitted || Boolean(applied)
      showControls(Boolean(applied))
      if (applied) placeControls(rules)
    } catch (err) {
      console.error('auto-rules-resizer: the rules fit failed', err)
    }
  }

  function openDialog () {
    const row = (id, label, value) => `<label for="${id}">${label}</label>` +
      `<input type="number" id="${id}" min="1" step="1" placeholder="no limit" value="${value ?? ''}" style="width:6em">` +
      '<span>px</span>'
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: `<b>Rules resizer</b> <small style="opacity:.6">v${VERSION}</small>` },
        {
          tag: 'text',
          innerHTML: '<div style="margin:6px 0;display:grid;grid-template-columns:auto auto auto;gap:6px 8px;align-items:center;justify-content:start">' +
            row(MAX_WIDTH_INPUT_ID, 'Max auto width', limits.maxWidth) + row(MAX_HEIGHT_INPUT_ID, 'Max auto height', limits.maxHeight) +
            '</div><div style="opacity:.7;max-width:22em">Empty means no limit. The limits cap only the automatic fit; a corner drag can go past them.</div>' +
            COPY_PASTE_HTML
        },
        {
          tag: 'options',
          options: [
            {
              tag: 'button',
              content: 'Save',
              handler: () => {
                limits = {
                  maxWidth: limitFromBox(document.getElementById(MAX_WIDTH_INPUT_ID).value, limits.maxWidth),
                  maxHeight: limitFromBox(document.getElementById(MAX_HEIGHT_INPUT_ID).value, limits.maxHeight)
                }
                saveLimits(Framework, limits)
                Framework.closeDialog()
                fitPage()
              }
            },
            { tag: 'button', content: 'Cancel', action: 'close' }
          ]
        }
      ]
    })
    const widthInput = document.getElementById(MAX_WIDTH_INPUT_ID)
    const heightInput = document.getElementById(MAX_HEIGHT_INPUT_ID)
    if (!widthInput || !heightInput) throw new Error('auto-rules-resizer: the dialog has no limit inputs')
    wireCopyPaste(widthInput.closest('.dialog'), (values) => {
      limits = { maxWidth: MAX_WIDTH_KEY in values ? values[MAX_WIDTH_KEY] : limits.maxWidth, maxHeight: MAX_HEIGHT_KEY in values ? values[MAX_HEIGHT_KEY] : limits.maxHeight }
      saveLimits(Framework, limits)
      if (MAX_WIDTH_KEY in values) widthInput.value = limits.maxWidth ?? ''
      if (MAX_HEIGHT_KEY in values) heightInput.value = limits.maxHeight ?? ''
      fitPage()
    })
  }

  function dragRules (corner, dx, dy) {
    const rules = rulesPane()
    if (!rules) return
    const paneSize = rules.getBoundingClientRect()
    const natural = rules.offsetWidth
    const scale = natural > 0 ? paneSize.width / natural : 1
    const minSize = { width: RULES_MIN.width * scale, height: RULES_MIN.height * scale }
    const box = draggedBox(dragKey())
    Object.assign(box, dragRulesBox(box, corner, dx, dy, paneSize, minSize))
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
    limits = readLimits(Framework)
    Framework.addSetting({
      tag: 'button',
      name: 'rulesresizer',
      group: SETTINGS_GROUP,
      content: 'Rules resizer',
      handler: () => {
        Framework.closeDialog()
        setTimeout(openDialog, 0)
      }
    })
    addStyle()
    addFontBar()
    for (const corner of CORNERS) addCorner(corner)
    watchHover()
    refitAfterResizeBoard(app)
    window.addEventListener('resize', makeTrailing(fitPage, RESIZE_MS))
    fitPage()
  })
})()
