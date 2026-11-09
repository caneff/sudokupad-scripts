// ==UserScript==
// @name         SudokuPad Auto Rules Resizer
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.6.7
// @description  Fits SudokuPad's rules to the screen in landscape: the rules pane takes all the height the page has to spare, with the controls beside it kept at SudokuPad's size, widens only when the rules would still scroll, and only then shrinks the text, to 70% of SudokuPad's size at the least. Spare room grows the text to 150% at most. f+ and f- on the pane change the font a pixel at a time, and two drag corners resize the pane. A Rules Resizer entry in SudokuPad's settings caps the automatic width and height.
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
  const VERSION = '0.6.7'
  const MAX_WIDTH_KEY = 'AutoRulesResizer_maxWidth'
  const MAX_HEIGHT_KEY = 'AutoRulesResizer_maxHeight'
  const EDGE_PX = 8 // the gap the pane keeps to the window's right edge
  const MIN_FONT_RATIO = 0.7 // the smallest font, as a share of SudokuPad's own
  const MAX_FONT_RATIO = 1.5 // the largest font, as a share of SudokuPad's own
  const READABLE_CHARS = 90 // characters a line, on average, that rules too long to fit are widened to
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

  // The one reader of a limit, saved or pasted: a whole number of pixels, or null for none; a string or boolean that `normalizeLimit`
  // would coerce is not one.
  const readLimit = (data) => (data === null || (Number.isInteger(data) && data > 0) ? data : undefined)

  function readLimits (store) {
    const limit = (key) => load(store, { key, read: readLimit }).value ?? null
    return { maxWidth: limit(MAX_WIDTH_KEY), maxHeight: limit(MAX_HEIGHT_KEY) }
  }

  // No limit is no key, so a fresh install saves nothing.
  function saveLimits (store, limits) {
    for (const [key, px] of [[MAX_WIDTH_KEY, limits.maxWidth], [MAX_HEIGHT_KEY, limits.maxHeight]]) {
      if (px === null) store.removeData(key)
      else save(store, key, px)
    }
  }

  const READERS = { [MAX_WIDTH_KEY]: readLimit, [MAX_HEIGHT_KEY]: readLimit }

  // null is no limit, so a paste can clear one.
  function copiedSettings (store) {
    const { maxWidth, maxHeight } = readLimits(store)
    return JSON.stringify({ [MAX_WIDTH_KEY]: maxWidth, [MAX_HEIGHT_KEY]: maxHeight })
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

  // The largest font that fits, from 70% to 150% of SudokuPad's own size. Where none fits it is 70%, and the rules scroll.
  function autoFontPx (fits, ownPx) {
    const floor = ownPx * MIN_FONT_RATIO
    if (fits(ownPx)) {
      const px = largestSize(fits, Math.ceil(ownPx), Math.floor(ownPx * MAX_FONT_RATIO))
      return px > ownPx && fits(px) ? px : ownPx
    }
    const px = largestSize(fits, Math.ceil(floor), Math.floor(ownPx))
    return px < ownPx && fits(px) ? px : floor
  }

  function nudgedFontPx (autoPx, nudgePx, ownPx) {
    return Math.min(ownPx * MAX_FONT_RATIO, Math.max(ownPx * MIN_FONT_RATIO, autoPx + nudgePx))
  }

  const nudgedAutoFontPx = (fits, ownPx, nudgePx) => nudgedFontPx(autoFontPx(fits, ownPx), nudgePx, ownPx)

  // The pane's max-height is the room or a drag's, so a size fits when the rules take no more than the room.
  const fitsRoom = (rules, room) => rules.scrollHeight <= Math.min(room, rules.clientHeight)

  function fitRulesFont (rules, room, ownPx, nudgePx) {
    const fits = (n) => {
      rules.style.fontSize = `${n}px`
      return fitsRoom(rules, room)
    }
    rules.style.fontSize = `${nudgedAutoFontPx(fits, ownPx, nudgePx)}px`
  }

  // The pane has all the height already; `fits(width, font)` is true from some width up. The order is width first, at
  // SudokuPad's font, then a smaller font at the widest width, then the scroll. Rules that fit at SudokuPad's font may
  // grow it, and f+ then widens for the bigger font. Rules that scroll even at 70% get only the `readable(font)` width,
  // because a wider pane would shorten the scroll and lengthen every line.
  function autoPaneFit ({ natural, widthLimit: limit, ownPx, nudgePx, fits, readable = () => Infinity }) {
    const narrowest = (from, fitsAt) => limit - largestSize((slack) => fitsAt(limit - slack), 0, limit - from)
    // `nudgePx` comes back as the nudge that took effect, so a press the floor or cap cancelled is not kept.
    const nudged = (autoPx) => {
      const fontPx = nudgedFontPx(autoPx, nudgePx, ownPx)
      return { fontPx, nudgePx: fontPx - autoPx }
    }
    if (!fits(limit, ownPx)) {
      const autoPx = autoFontPx((n) => fits(limit, n), ownPx)
      const font = nudged(autoPx)
      return { width: fits(limit, autoPx) ? limit : Math.max(natural, Math.min(limit, readable(font.fontPx))), ...font }
    }
    let width = fits(natural, ownPx) ? natural : narrowest(natural, (w) => fits(w, ownPx))
    const font = nudged(autoFontPx((n) => fits(width, n), ownPx))
    if (font.nudgePx > 0 && !fits(width, font.fontPx)) width = narrowest(width, (w) => fits(w, font.fontPx))
    return { width, ...font }
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
  const FIT_STYLES = ['overflowWrap', 'width', 'maxWidth', 'boxSizing', 'fontSize', 'maxHeight', 'minHeight', 'overflowY']

  function clearFit (rules, controls) {
    for (const k of FIT_STYLES) rules.style[k] = ''
    controls.style.translate = ''
  }

  // Fits the pane to the room below it and the page's spare height, at SudokuPad's width, widening only as the rules need,
  // and returns the drag it applied. The spare height is what the controls column, as SudokuPad laid it out, has above it
  // down to `pageTop` and below it to the window's bottom: a taller pane lifts the column by what would run off the window.
  // Without `useSpare` (the refit is off, so SudokuPad would measure the taller pane) the pane keeps its room. `limits` cap the automatic fit, never a drag. Returns null when the pane is not shown, with the fit taken off, or has no
  // room yet, with the last fit put back.
  function fitRulesPane ({ rules, container, controls, getStyle, viewport, pageTop, useSpare, boardRight, nudgePx, onNudge = () => {}, box, limits = noLimits(), readable }) {
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
    const column = controls.getBoundingClientRect()
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
    // The container's own slack below the pane is part of the column already, so the spare height adds only what is left of it.
    const spare = useSpare ? Math.max(0, column.top - pageTop + viewport.height - column.bottom - Math.max(0, visualRoom - home.height)) : 0
    const room = (visualRoom + spare) / scale
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
    const { width, fontPx, nudgePx: appliedNudge } = autoPaneFit({
      natural,
      widthLimit: rulesWidth({ natural, rulesLeft: home.left, scale, viewportWidth: viewport.width, maxWidth: limits.maxWidth }),
      ownPx,
      nudgePx,
      fits: fitsAt,
      readable
    })
    onNudge(appliedNudge)
    fitsAt(width, fontPx) // the search left the pane at its last try, and the lift is measured on the chosen size
    // A pane taller than SudokuPad's runs the column off the window's bottom: it is lifted by that much, and a drag adds to the lift.
    const lift = Math.max(0, Math.ceil(controls.getBoundingClientRect().bottom - viewport.height))
    if (lift) controls.style.translate = `0px ${-lift}px`
    const applied = clampDrag(box, {
      pane: { left: home.left, right: home.left + width * scale },
      column: controls.getBoundingClientRect(),
      boardRight,
      viewport
    })
    // A drag adds to the fitted pane's height: a drag that started from SudokuPad's own height would shrink a pane the fit had grown.
    const dragging = Boolean(applied.w || applied.h)
    const sideways = Boolean(applied.w && !applied.h)
    let startRoom = autoRoom
    if (dragging) startRoom = rules.offsetHeight
    const fitted = draggedPane({ width, room: startRoom, box: applied, scale })
    if (dragging) rules.style.maxHeight = `${fitted.room}px`
    if (applied.x || applied.y || lift) controls.style.translate = `${applied.x}px ${applied.y - lift}px`
    setPaneWidth(rules, fitted.width, natural)
    if (dragging) fitRulesFont(rules, fitted.room, ownPx, nudgePx)
    else rules.style.fontSize = `${fontPx}px`
    // The text may shrink to the held height, never grow into it.
    if (sideways) {
      if (parseFloat(rules.style.fontSize) > fontPx) rules.style.fontSize = `${fontPx}px`
      // A wider pane reflows to fewer lines; the height stays, with blank space below the text (Chris, 2026-11-08).
      rules.style.minHeight = `${startRoom}px`
      rules.style.minHeight = `${startRoom - (rules.offsetHeight - startRoom)}px`
    }
    // SudokuPad sets `overflow-y: scroll`, which draws an empty track beside rules that fit.
    if (rules.scrollHeight <= rules.clientHeight) rules.style.overflowY = 'auto'
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

  // A hand dragging sideways drifts a few px up or down.
  const VERTICAL_DEAD_PX = 4

  // Move and release are heard on the window, so a fast drag that outruns the corner holds.
  function watchCornerDrag (corner, win, onMove, onActive) {
    corner.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      let x = e.clientX
      let y = e.clientY
      let inDeadZone = true
      trackPointer(win, {
        move: (m) => {
          const dx = m.clientX - x
          x = m.clientX
          if (Math.abs(m.clientY - e.clientY) >= VERTICAL_DEAD_PX) inDeadZone = false
          const dy = inDeadZone ? 0 : m.clientY - y
          if (!inDeadZone) y = m.clientY
          if (dx || dy) onMove(dx, dy)
        },
        end: () => onActive(false)
      })
      onActive(true)
    })
  }

  // <lib:settings-dialog>
  // Generated from lib/settings-dialog.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // Reads ERROR_LOG_KEY, readErrorLog, formatErrorLog and SUDOKUPAD_PURPLE from sudokupad.
  /* global ERROR_LOG_KEY, readErrorLog, formatErrorLog, SUDOKUPAD_PURPLE */ // eslint-disable-line no-redeclare
  // The events that end a press. SudokuPad's pen tool takes its click from `mouseup` (seen live), and
  // a touch ends with `pointerup`, `touchend` and a compatibility `mouseup`, so all four are swallowed.
  const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'mouseup', 'touchend']
  const SETTINGS_GROUP = 'experimental'
  const TITLE_MUTED = '#777'
  const CONTROL_HOVER = '#f3e5f5'
  const SAVE_FILL = '#6b3fa0'
  // An inset layer darkens whatever fill the control has.
  const PRESS_LAYER = 'box-shadow: inset 0 0 0 100vmax rgb(0 0 0 / .1)'
  const STATUS_ATTRIBUTE = 'data-role="settings-status"'
  const STATUS_SELECTOR = `[${STATUS_ATTRIBUTE}]`

  function setDialogStatus (dialog, message) {
    dialog.querySelector(STATUS_SELECTOR).textContent = message
  }
  // What `keys` hold now, as a function that puts them back; a key that held nothing is removed again. The stored values are held by reference, so a script's save must replace a value and never edit one in place.
  function snapshotStore (store, keys) {
    const before = keys.map((key) => [key, store.getData(key)])
    return () => before.forEach(([key, value]) => (value == null ? store.removeData(key) : store.setData(key, value)))
  }

  // A thrown value that is not an Error has no message, so it is shown as itself.
  const errorText = (error) => error?.message ?? String(error)

  // `snapshot()` runs first and returns the function that puts back everything `write` can change, so a write that fails half-way leaves
  // the stored values and their mirrors as they were. The write's throw is rethrown; a restore that itself throws is named beside it.
  function writeOrRestore (snapshot, write) {
    const restore = snapshot()
    try {
      write()
    } catch (error) {
      try {
        restore()
      } catch (restoreError) {
        throw new Error(`${errorText(error)}; the earlier values could not be put back: ${errorText(restoreError)}`, { cause: error })
      }
      throw error
    }
  }

  // The next press ends the swallowing even when no release came (a close from the keyboard).
  function swallowRelease (win = window) {
    const swallow = (event) => event.stopImmediatePropagation()
    const stop = () => {
      RELEASE_EVENTS.forEach((type) => win.removeEventListener(type, swallow, true))
      win.removeEventListener('pointerdown', stop, true)
    }
    RELEASE_EVENTS.forEach((type) => win.addEventListener(type, swallow, true))
    win.addEventListener('pointerdown', stop, true)
  }

  // SudokuPad runs a dialog button's handler on the press and removes the dialog at once, so the release lands on the grid and the pen tool takes it for a click on the cell under the button.
  function closeDialogKeepingGrid (framework, win = window) {
    framework.closeDialog()
    swallowRelease(win)
  }

  // SudokuPad's showDialog does nothing while its settings dialog is open, so that one closes first; `open` then runs after the close has settled.
  function addSettingsEntry (framework, { name, content, open }, { log = console.error } = {}) {
    framework.addSetting({
      tag: 'button',
      name,
      group: SETTINGS_GROUP,
      content,
      handler: () => {
        closeDialogKeepingGrid(framework)
        setTimeout(() => {
          try { open() } catch (error) { log(`${name}: could not open its settings dialog`, error) }
        }, 0)
      }
    })
  }

  const COPY_PASTE_PICTURES = {
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4"/>'
  }
  const titleIconButton = (act, label, picture) =>
    `<button type="button" data-act="${act}" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${picture}</svg></button>`

  // The dialog's first part: its own title rules, then the name with the version beside it, and Copy settings and Paste settings as icons at the right end,
  // after the status line they report to. The rules travel with the row, so they are in the page exactly while the dialog is.
  function renderDialogTitle ({ prefix, name, version }) {
    return `<style>${dialogTitleCss(prefix)}</style>` +
      `<div class="${prefix}title-row"><span><b>${name}</b> <small class="${prefix}version">v${version}</small></span>` +
      `<span ${STATUS_ATTRIBUTE}></span>` +
      `<span class="${prefix}tools">${titleIconButton('copy-settings', 'Copy settings', COPY_PASTE_PICTURES.copy)}${titleIconButton('paste-settings', 'Paste settings', COPY_PASTE_PICTURES.paste)}</span></div>`
  }

  // SudokuPad styles a dialog's buttons by tag, so a button that is to look like bare text or a bare icon has each of these forced.
  const BARE_BUTTON = 'background: none !important; border: none !important; box-shadow: none !important; margin: 0 !important; width: auto !important; min-width: 0 !important; height: auto !important; cursor: pointer;'
  const ERROR_LOG_ATTRIBUTE = 'data-role="error-log"'
  const ERROR_LOG_SELECTOR = `[${ERROR_LOG_ATTRIBUTE}]`

  function errorLogCss (prefix) {
    return [
      `.${prefix}error-log { display: flex; gap: 12px; margin-top: 10px; }`,
      `.${prefix}error-log button { ${BARE_BUTTON} padding: 2px 0 !important; font-size: .8rem !important; color: ${TITLE_MUTED} !important; text-decoration: underline; }`,
      `.${prefix}error-log button:focus-visible { outline: 2px solid ${SUDOKUPAD_PURPLE} !important; outline-offset: 2px; }`
    ].join('\n')
  }

  // Under the footer buttons: the log every script's guard writes (lib/sudokupad.js), read and cleared from any one of them.
  function renderErrorLogRow (prefix) {
    return `<style>${errorLogCss(prefix)}</style><div class="${prefix}error-log" ${ERROR_LOG_ATTRIBUTE}><button type="button" data-act="copy-error-log">Copy error log</button><button type="button" data-act="clear-error-log">Clear</button></div>`
  }

  // The title row's Copy settings and Paste settings are wired by wireCopyPaste; this row is wired here, since every script has it.
  function wireErrorLog (dialog, win) {
    const say = (message) => setDialogStatus(dialog, message)
    dialog.querySelector(ERROR_LOG_SELECTOR).addEventListener('click', async (event) => {
      const act = event.target.closest('button[data-act]')?.dataset.act
      if (act !== 'copy-error-log' && act !== 'clear-error-log') return
      event.preventDefault()
      event.stopPropagation()
      try {
        if (act === 'clear-error-log') {
          win.localStorage.removeItem(ERROR_LOG_KEY)
          say('Error log cleared.')
          return
        }
        const log = readErrorLog(win.localStorage)
        if (log.length === 0) {
          say(formatErrorLog(log))
          return
        }
        await win.navigator.clipboard.writeText(formatErrorLog(log))
        say('Error log copied.')
      } catch (error) {
        say(`Could not ${act === 'copy-error-log' ? 'copy' : 'clear'} the error log: ${errorText(error)}`)
      }
    })
  }

  function dialogTitleCss (prefix) {
    const tools = `.${prefix}tools`
    return [
      `.${prefix}version { opacity: .6; }`,
      `.${prefix}title-row { display: flex; align-items: center; gap: 12px; }`,
      `${tools} { display: flex; align-items: center; gap: 4px; }`,
      // SudokuPad styles a dialog's buttons by tag, so each of these is forced.
      `${tools} button { ${BARE_BUTTON} padding: 4px !important; line-height: 0 !important; color: ${TITLE_MUTED} !important; border-radius: 6px !important; }`,
      `${tools} button:hover { background: #f0edf5 !important; }`,
      `${tools} button:focus-visible { outline: 2px solid ${SUDOKUPAD_PURPLE} !important; outline-offset: 0; }`,
      `${tools} svg { width: 20px; height: 20px; }`,
      `${tools} svg * { fill: none !important; }`,
      // A flex item with no intrinsic width: a long message wraps in the room the title leaves and never widens the dialog.
      `.${prefix}title-row ${STATUS_SELECTOR} { flex: 1 1 0; min-width: 0; contain: inline-size; text-align: right; font-size: .8rem; color: ${TITLE_MUTED}; }`
    ].join('\n')
  }

  function addStyleOnce (id, css, doc = document) {
    if (doc.getElementById(id)) return
    const style = doc.createElement('style')
    style.id = id
    style.textContent = css
    doc.head.appendChild(style)
  }

  // SudokuPad styles a dialog's buttons by tag, so each of these is forced. Scoped by the body's id, so SudokuPad's other dialogs are left alone.
  function buttonRowCss (bodyId) {
    const row = `.dialog:has(#${bodyId}) .dialog-options`
    return [
      `${row} { display: flex !important; flex-direction: row !important; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; border-top: 1px solid #e3dff0; padding: 14px 4px 2px; margin-top: 8px; box-sizing: border-box; width: 100%; }`,
      `${row} button { background: #f1eff5 !important; color: #333 !important; border: 1px solid #cfc9db !important; border-radius: 8px !important; font-size: 1rem !important; padding: 0 22px !important; height: 38px !important; line-height: 36px !important; margin: 0 !important; width: auto !important; min-width: 0 !important; flex: none; cursor: pointer; }`,
      `${row} button[data-role="save"] { background: ${SAVE_FILL} !important; color: #fff !important; border: 1px solid #5a3489 !important; font-weight: 600; }`,
      `${row} button:hover { background: ${CONTROL_HOVER} !important; }`,
      `${row} button[data-role="save"]:hover { background: ${CONTROL_HOVER} !important; color: ${SAVE_FILL} !important; }`,
      `${row} button:active { ${PRESS_LAYER} !important; }`,
      `${row} button:focus-visible { outline: 2px solid ${SUDOKUPAD_PURPLE}; outline-offset: 2px; }`
    ].join('\n')
  }

  const SAVE_LABEL = 'Save'
  const CANCEL_LABEL = 'Cancel'

  // Escape needs no handler here: SudokuPad's own dialog closes on it.
  // Returns the body container for the script to fill and wire, or null when SudokuPad showed no dialog (it ignores showDialog while another dialog is open).
  // `snapshot` is `writeOrRestore`'s, and Save writes under it; the script hands the same one to `wireCopyPaste`.
  function showSettingsDialog (framework, { prefix, name, version, bodyId, styleId, css, centerOverBoard = true, changed, save, snapshot, extraButtons = [] }, { doc = document, win = window } = {}) {
    if (typeof snapshot !== 'function') throw new Error(`${name}: a settings dialog needs a snapshot`)
    addStyleOnce(`settings-dialog-buttons-${bodyId}`, buttonRowCss(bodyId), doc)
    if (css) addStyleOnce(styleId, css, doc)
    const close = () => closeDialogKeepingGrid(framework, win)
    // After a failed save the script's `changed()` may already read false, so a retry saves again whatever it says.
    let failed = false
    const saveAndClose = () => {
      try {
        if (failed || changed()) writeOrRestore(snapshot, save)
      } catch (error) {
        failed = true
        // The dialog stays open so the failure is read and the choices are kept.
        setDialogStatus(doc.getElementById(bodyId).closest('.dialog'), `Not saved: ${errorText(error)}`)
        return
      }
      close()
    }
    const buttons = [
      { content: SAVE_LABEL, role: 'save', handler: saveAndClose },
      { content: CANCEL_LABEL, role: 'cancel', handler: close },
      ...extraButtons
    ]
    framework.showDialog({
      centerOverBoard,
      parts: [
        { tag: 'text', innerHTML: renderDialogTitle({ prefix, name, version }) },
        { tag: 'text', innerHTML: `<div id="${bodyId}"></div>` },
        { tag: 'options', options: buttons.map(({ content, handler }) => ({ tag: 'button', content, handler })) },
        // Below the footer, so the script's own layout still runs down to the footer line.
        { tag: 'text', innerHTML: renderErrorLogRow(prefix) }
      ]
    })
    const body = doc.getElementById(bodyId)
    if (!body) return null
    // No selector tells the buttons apart but their text, so the shell marks each with its role for the script's stylesheet.
    wireErrorLog(body.closest('.dialog'), win)
    const row = body.closest('.dialog')?.querySelector('.dialog-options')
    if (row) row.querySelectorAll('button').forEach((button, index) => { button.dataset.role = buttons[index].role })
    return body
  }
  /* eslint-enable no-unused-vars */
  // </lib:settings-dialog>
  // <lib:settings-transfer>
  // Generated from lib/settings-transfer.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  /* global setDialogStatus, errorText, writeOrRestore */ // from settings-dialog.js, which every script carries beside this one
  // A reader returns the value to save, or undefined for one it refuses. Keys of other scripts are ignored, not counted: only a value of the script's own that its reader refuses is skipped. `upgrade` rewrites the parsed object first, for text copied by an older version.
  function pastedSettings (text, readers, upgrade = (data) => data) {
    let data
    try {
      data = JSON.parse(text)
    } catch (error) {
      throw new Error('the clipboard text is not JSON', { cause: error })
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('the clipboard text is not a settings object')
    data = upgrade(data)
    const values = {}
    let skipped = 0
    for (const [key, read] of Object.entries(readers)) {
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

  // Wires the title row's Copy settings and Paste settings icons: `copied()` is the text to copy, `apply(values)` takes what a paste kept, under the
  // dialog's own `snapshot` (`writeOrRestore`'s), so a paste that fails half-way puts every key back; `readers` and `upgrade` are `pastedSettings`'.
  function wireCopyPaste (root, { copied, readers, upgrade, snapshot }, apply) {
    if (typeof snapshot !== 'function') throw new Error('Paste settings needs a snapshot')
    const say = (message) => setDialogStatus(root, message)
    root.addEventListener('click', async (event) => {
      const act = event.target.closest('button[data-act]')?.dataset.act
      if (act !== 'copy-settings' && act !== 'paste-settings') return
      event.preventDefault()
      event.stopPropagation()
      try {
        if (act === 'copy-settings') {
          await navigator.clipboard.writeText(copied())
          say('Settings copied.')
        } else {
          const { values, skipped } = pastedSettings(await navigator.clipboard.readText(), readers, upgrade)
          if (Object.keys(values).length > 0) writeOrRestore(snapshot, () => apply(values))
          say(pasteReport(Object.keys(values).length, skipped))
        }
      } catch (error) {
        say(`Could not ${act === 'copy-settings' ? 'copy' : 'paste'}: ${errorText(error)}`)
      }
    })
  }
  /* eslint-enable no-unused-vars */
  // </lib:settings-transfer>
  // <lib:plain>
  // Generated from lib/plain.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  const rem = (value) => Math.round(value * 100) / 100

  // SudokuPad hands every tool the keys typed into a page field too, so a key typed into a field is left to it.
  const typedIntoField = (event) => Boolean(event.target && event.target.closest && event.target.closest('input, textarea, select, [contenteditable]'))

  // The index `delta` steps from `index` in a list of `count`, going round past either end.
  const wrapIndex = (index, delta, count) => (((index + delta) % count) + count) % count

  // The page's style element `id`, added on the first call, holds `css`.
  function writeStyle (id, css, doc = document) {
    let style = doc.getElementById(id)
    if (!style) {
      style = doc.createElement('style')
      style.id = id
      doc.head.appendChild(style)
    }
    style.textContent = css
  }
  /* eslint-enable no-unused-vars */
  // </lib:plain>
  // <lib:pointer-session>
  // Generated from lib/pointer-session.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // One press, from after its `pointerdown` to its release: `move` hears each `pointermove` and `end` the `pointerup` or `pointercancel`.
  // The session listens in the capture phase, so a page handler that stops a release cannot leave it listening, and it is gone before
  // `end` runs. The returned stop ends it with no `end`.
  const PRESS_END_EVENTS = ['pointerup', 'pointercancel']
  // The object form: Node's EventTarget, which the tests use, keeps a listener removed with a bare `true`.
  const CAPTURE = { capture: true }

  function trackPointer (target, { move, end = () => {} }) {
    const finish = (event) => {
      stop()
      end(event)
    }
    const stop = () => {
      target.removeEventListener('pointermove', move, CAPTURE)
      PRESS_END_EVENTS.forEach((type) => target.removeEventListener(type, finish, CAPTURE))
    }
    target.addEventListener('pointermove', move, CAPTURE)
    PRESS_END_EVENTS.forEach((type) => target.addEventListener(type, finish, CAPTURE))
    return stop
  }
  /* eslint-enable no-unused-vars */
  // </lib:pointer-session>
  // <lib:store>
  // Generated from lib/store.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // Reads isPlainObject from plain.
  /* global isPlainObject */
  // A saved value is `{ v, data }`, so a later change to its shape has a version to migrate from; a value saved before the envelope is
  // version 0, and so is every shape saved so far. A version above this one was saved by a later script, and is unreadable here.
  const STORE_VERSION = 0
  const UNREADABLE_SUFFIX = '_unreadable'

  const isEnvelope = (raw) => isPlainObject(raw) && Number.isInteger(raw.v) && Object.hasOwn(raw, 'data') && Object.keys(raw).length === 2

  // The first free slot, `<key>_unreadable`, then `<key>_unreadable2` and on, or the one already holding `raw`: no kept copy is ever replaced.
  function keptSlot (store, key, raw) {
    const same = JSON.stringify(raw)
    for (let n = 1; ; n++) {
      const slot = key + UNREADABLE_SUFFIX + (n === 1 ? '' : n)
      const held = store.getData(slot)
      if (held === null || JSON.stringify(held) === same) return { slot, copied: held === null }
    }
  }

  function readSaved (raw, read) {
    if (isEnvelope(raw) && raw.v > STORE_VERSION) throw new Error(`it was saved by a later version (version ${raw.v})`)
    const value = read(isEnvelope(raw) ? raw.data : raw)
    if (value === undefined) throw new Error('its reader refused it')
    return value
  }

  // `read` returns the value, or undefined for one it refuses, as a paste reader does. A value that cannot be read is copied aside before
  // anything can save over it, through the store's `keep` when it has one: a copy the browser refuses must stop saving, not be forgotten.
  function load (store, { key, read }) {
    const raw = store.getData(key)
    if (raw === null) return { value: undefined }
    try {
      return { value: readSaved(raw, read) }
    } catch (error) {
      const unreadable = error.message || String(error) || 'its reader threw'
      const { slot, copied } = keptSlot(store, key, raw)
      if (copied) {
        if (store.keep) store.keep(slot, raw)
        else store.setData(slot, raw)
        console.warn(`${key}: the saved value could not be read (${unreadable}); it is kept under ${slot}`)
      }
      return { value: undefined, unreadable }
    }
  }

  const hasUnreadable = (store, key) => store.getData(key + UNREADABLE_SUFFIX) !== null

  // A puzzle's saved data is keyed by its id; one with none of its own (a replay or a pack) is told apart by its page URL.
  const puzzleKey = (puzzleId, href) => String(puzzleId || href)

  function save (store, key, data) {
    store.setData(key, { v: STORE_VERSION, data })
  }
  /* eslint-enable no-unused-vars */
  // </lib:store>
  // <lib:sudokupad>
  // Generated from lib/sudokupad.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  /* global Framework */
  // A script's features, each with the SudokuPad internals it needs: one that lacks an internal, or whose own code throws, turns off
  // alone, and a bar at the bottom of the page says so once per SudokuPad version.
  const NOTICE_HOST_ID = 'sudokupad-scripts-notices'
  // SudokuPad's own button purple, as its icons draw it: the one purple of every script's bar, panel and focus ring, and the site's --accent.
  const SUDOKUPAD_PURPLE = '#6a1b9a'
  const REPORT_URL = 'https://github.com/caneff/sudokupad-scripts/issues/new'
  // The page's assets carry SudokuPad's version as `?v=` (docs/research/sudokupad-version-signal.md); live/cache.mjs reads it the same way.
  const PAGE_VERSION = /\?v=(\d+(?:\.\d+)+)/
  const INTERNAL_KINDS = {
    function: (value) => typeof value === 'function',
    array: Array.isArray,
    integer: Number.isInteger,
    number: (value) => typeof value === 'number',
    object: (value) => Boolean(value) && typeof value === 'object'
  }

  // A path's first part names a root (`Framework`, `ToolPen`): SudokuPad declares them with `const`, so they are not on `window`.
  function readInternal (roots, path) {
    const [root, ...keys] = path.split('.')
    return keys.reduce((owner, key) => (owner === undefined || owner === null ? undefined : owner[key]), roots[root])
  }

  // Each internal lacking, with the features it holds off; a feature is listed under the first of its `needs` it lacks.
  function lackingInternals (features, roots) {
    const lacking = new Map()
    Object.entries(features).forEach(([name, { needs }]) => {
      const missing = Object.entries(needs).find(([path, kind]) => !INTERNAL_KINDS[kind](readInternal(roots, path)))
      if (missing) lacking.set(missing[0], [...(lacking.get(missing[0]) || []), name])
    })
    return lacking
  }

  function sudokupadVersion (doc) {
    const found = PAGE_VERSION.exec(doc.documentElement.outerHTML)
    return found ? found[1] : null
  }

  // One key for every script, so a reader finds every feature any script turned off.
  const ERROR_LOG_KEY = 'sudokupad-scripts-error-log'
  const ERROR_LOG_LIMIT = 50
  // A write the browser refuses (a full localStorage) is the browser's doing, not a SudokuPad change.
  const isRefusedWrite = (error) => Boolean(error) && error.name === 'QuotaExceededError'

  // A report is a URL, and GitHub refuses a long one.
  const REPORT_STACK_LIMIT = 1200

  // Oldest first. Throws when the storage is blocked or the saved text is not a list, so a caller never mistakes either for an empty log.
  function readErrorLog (storage) {
    const saved = storage.getItem(ERROR_LOG_KEY)
    if (saved === null) return []
    const log = JSON.parse(saved)
    if (!Array.isArray(log)) throw new Error('the saved error log is not a list')
    return log
  }

  // V8's stack opens with the error's own line (`TypeError: message`); Firefox's holds only frames.
  const withStack = (headline, stack) => (typeof stack !== 'string' || stack === '' ? headline : stack.startsWith(headline) ? stack : `${headline}\n${stack}`)

  function formatErrorLog (log) {
    if (log.length === 0) return 'The error log is empty.'
    return [...log].reverse().map((record) => [
      `${record.time} ${record.script}@${record.version} on SudokuPad ${record.sudokupad || 'unknown'}: ${record.feature}`,
      `  ${record.url}`,
      record.missing
        ? `  SudokuPad has no ${record.missing}`
        : withStack(record.name ? `${record.name}: ${record.message}` : record.message, record.stack).split('\n').map((line) => `  ${line}`).join('\n')
    ].join('\n')).join('\n\n')
  }

  // `off` holds each feature's label and why it is off: the internal it lacks, or the error its own code threw.
  function reportUrl ({ name, version, sudokupad, off }) {
    const shownVersion = sudokupad || 'unknown'
    const labels = off.map((feature) => feature.label).join(', ')
    const body = [
      `Script: ${name} ${version}`,
      `SudokuPad version: ${shownVersion}`,
      '',
      ...off.map(({ label, why }) => `- ${label}: ${typeof why === 'string' ? `SudokuPad has no ${why}` : withStack(String(why), why && why.stack).slice(0, REPORT_STACK_LIMIT)}`)
    ].join('\n')
    return `${REPORT_URL}?${new URLSearchParams({ title: `${name}: ${labels} off on SudokuPad ${shownVersion}`, body })}`
  }

  const NOTICE_HOST_CSS = 'position: fixed; left: 50%; bottom: 8px; transform: translateX(-50%); z-index: 10000; display: flex; flex-direction: column; gap: 4px; align-items: center;'
  const NOTICE_BAR_CSS = `display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 14px; border-radius: 6px; background: ${SUDOKUPAD_PURPLE}; color: #fff; font: 14px/1.3 sans-serif; box-shadow: 0 2px 6px rgba(0, 0, 0, .3);`
  const NOTICE_LINK_CSS = 'color: #fff; font-weight: bold; text-decoration: underline;'
  const NOTICE_DISMISS_CSS = 'background: none; border: none; color: #fff; font-size: 18px; line-height: 1; padding: 0 4px; cursor: pointer;'

  function noticeHost (doc) {
    let host = doc.getElementById(NOTICE_HOST_ID)
    if (!host) {
      host = doc.createElement('div')
      host.id = NOTICE_HOST_ID
      host.style.cssText = NOTICE_HOST_CSS
      doc.body.append(host)
    }
    return host
  }

  function dismissButton (doc) {
    const dismiss = doc.createElement('button')
    dismiss.type = 'button'
    dismiss.textContent = '×'
    dismiss.title = 'Dismiss'
    dismiss.setAttribute('aria-label', 'Dismiss')
    dismiss.style.cssText = NOTICE_DISMISS_CSS
    return dismiss
  }

  // `features` maps a name to `{ label, needs, onSkip }`: `label` is what the bar and the console call it, `needs` maps each internal's
  // path to its kind (a key of INTERNAL_KINDS), and `onSkip` undoes what the feature left on the page. `probe` runs once SudokuPad's app
  // exists; `store` is SudokuPad's Framework, whose saved data remembers a dismissal under `<script>-notice`.
  function createGuard ({ script, name, version, features }) {
    const reasons = []
    let page = null

    const dismissKey = `${script}-notice`
    // A dismissal is saved only under a SudokuPad version read from the page: one saved with none would match every later version that
    // also has none. A store with no getData or setData (a SudokuPad that changed), or one that throws (a frame with storage blocked),
    // cannot save one either. Without a save, a dismissal holds for this page load only.
    const dismissedHere = []
    let storeFailed = false
    const savesDismissals = () => !storeFailed && page.sudokupad !== null && typeof page.store.getData === 'function' && typeof page.store.setData === 'function'
    function useStore (fn) {
      try {
        return fn()
      } catch (error) {
        storeFailed = true
        console.warn(`${script}: a dismissal of the notice bar cannot be saved, so it holds for this page load only:`, error)
        return null
      }
    }
    const dismissed = () => {
      const saved = savesDismissals() ? useStore(() => page.store.getData(dismissKey)) : null
      return [...(saved && saved.version === page.sudokupad && Array.isArray(saved.features) ? saved.features : []), ...dismissedHere]
    }

    // Every feature turned off is kept, shown or not. A blocked or unreadable storage costs the record, never the page. A missing internal
    // is the same fact on every load, so one already recorded for this script version and SudokuPad version is not recorded again: it
    // would push the one-off throw out of the newest 50.
    let sudokupad = null
    let logFailed = false
    function recordFeatureOff (label, why) {
      if (logFailed) return
      const fields = typeof why === 'string' ? { missing: why } : { name: why && why.name, message: String(why && why.message !== undefined ? why.message : why), stack: why && why.stack }
      try {
        const log = readErrorLog(globalThis.localStorage)
        const same = (record) => record.script === script && record.version === version && record.sudokupad === sudokupad && record.feature === label && record.missing === fields.missing
        if (fields.missing && log.some(same)) return
        log.push({ time: new Date().toISOString(), script, version, sudokupad, feature: label, url: globalThis.location.href, ...fields })
        globalThis.localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(log.slice(-ERROR_LOG_LIMIT)))
      } catch (error) {
        logFailed = true
        console.warn(`${script}: the error log cannot be saved, so ${label} and later features turned off are not recorded:`, error)
      }
    }

    let bar = null
    function showNotice () {
      if (bar) bar.remove()
      bar = null
      const gone = dismissed()
      const shown = reasons.filter((reason) => !gone.includes(reason.name))
      if (shown.length === 0 || !page.doc.body) return
      const { doc } = page
      const host = noticeHost(doc)
      bar = doc.createElement('div')
      bar.setAttribute('data-script', script)
      bar.style.cssText = NOTICE_BAR_CSS
      const text = doc.createElement('span')
      text.textContent = `${name}: ${shown.map((reason) => reason.label).join(', ')} ${shown.length === 1 ? 'is' : 'are'} off — SudokuPad changed.`
      const link = doc.createElement('a')
      link.href = reportUrl({ name, version, sudokupad: page.sudokupad, off: shown })
      link.target = '_blank'
      link.rel = 'noopener'
      link.textContent = 'Report'
      link.style.cssText = NOTICE_LINK_CSS
      const dismiss = dismissButton(doc)
      dismiss.addEventListener('click', () => {
        dismissedHere.push(...shown.map((reason) => reason.name))
        if (savesDismissals()) useStore(() => page.store.setData(dismissKey, { version: page.sudokupad, features: dismissed() }))
        showNotice()
      })
      bar.append(text, link, dismiss)
      host.append(bar)
    }

    // A bar of plain words, one per text and page load; the same host as the SudokuPad-changed bar, with no report link.
    const told = new Set()
    function tell (text) {
      if (told.has(text) || !page || !page.doc.body) return
      told.add(text)
      const { doc } = page
      const host = noticeHost(doc)
      const message = doc.createElement('div')
      message.setAttribute('data-script', script)
      message.style.cssText = NOTICE_BAR_CSS
      const span = doc.createElement('span')
      span.textContent = text
      const dismiss = dismissButton(doc)
      dismiss.addEventListener('click', () => message.remove())
      message.append(span, dismiss)
      host.append(message)
    }

    // A store write's throw, with the feature whose store threw it: whichever feature's code it reaches, that store's feature is the one
    // that fails. A write the browser refuses (a full localStorage) is told to the user and leaves the feature on, so it saves again once
    // space frees.
    const storeFailures = new WeakMap()
    function failStore (owner, error) {
      if (!isRefusedWrite(error)) return owner.skip(error)
      console.warn(`${script}: ${owner.label} could not save, the browser refused the write:`, error)
      tell(`${name}: the browser has no room left, so ${owner.label} could not be saved.`)
    }

    // A feature stays off once skipped, so its error is warned once and not on every event. `skip(why, false)` is for one never installed.
    function createFeature (featureName, { label, onSkip }) {
      const fail = (error) => {
        const owner = storeFailures.get(error)
        if (owner) failStore(owner, error)
        else feature.skip(error)
      }
      const feature = {
        label,
        off: false,
        skip (why, installed = true) {
          if (feature.off) return
          feature.off = true
          reasons.push({ name: featureName, label, why })
          recordFeatureOff(label, why)
          if (installed) {
            console.warn(`${script}: ${label} skipped because SudokuPad changed:`, why)
            try {
              if (onSkip) onSkip()
            } catch (error) {
              // Best effort: the feature is off already, and what it left behind stays until the page reloads.
              console.warn(`${script}: could not undo ${label}:`, error)
            }
          }
          if (page) showNotice()
        },
        run (fn, fallback = () => {}) {
          if (feature.off) return fallback()
          try {
            return fn()
          } catch (error) {
            fail(error)
            return fallback()
          }
        },
        // A save, copy or paste in a settings dialog: its throw goes on to the dialog's status line, and one with the feature off says so.
        // A store failure passes with every feature still on, so the dialog's `writeOrRestore` can put the earlier keys back through it.
        runOrThrow (fn) {
          if (feature.off) throw new Error(`${name} turned off its ${label}`)
          try {
            return fn()
          } catch (error) {
            if (!storeFailures.has(error)) feature.skip(error)
            throw error
          }
        },
        // SudokuPad's code runs only through `stock` or `stock.sudokupad`, so a throw from it passes through as SudokuPad's own. After the
        // body's own throw, the original runs only if nothing was sent for this event: a click half sent must not be sent again. A call
        // that sends nothing (`stock.sudokupad(fn, false)`) leaves the original to run.
        wrap (owner, method, body) {
          const original = owner[method]
          owner[method] = function (...args) {
            if (feature.off) return original.apply(this, args)
            let reached = false
            let result
            let failure = null
            const sudokupad = (fn, sends = true) => {
              if (sends) reached = true
              try {
                return fn()
              } catch (error) {
                failure = { error }
                throw error
              }
            }
            const stock = (...stockArgs) => sudokupad(() => { result = original.apply(this, stockArgs); return result })
            stock.sudokupad = sudokupad
            try {
              return body.call(this, stock, ...args)
            } catch (error) {
              if (failure && failure.error === error) throw error
              fail(error)
              return reached ? result : original.apply(this, args)
            }
          }
        }
      }
      return feature
    }

    const guarded = Object.fromEntries(Object.entries(features).map(([featureName, declared]) => [featureName, createFeature(featureName, declared)]))

    function probe ({ roots, store, doc = document }) {
      sudokupad = sudokupadVersion(doc)
      lackingInternals(features, roots).forEach((names, missing) => {
        names.forEach((featureName) => guarded[featureName].skip(missing, false))
        console.warn(`${script}: ${names.map((featureName) => features[featureName].label).join(', ')} skipped because SudokuPad has no ${missing}`)
      })
      page = { store, doc, sudokupad }
      showNotice()
    }

    // A feature's saved data in SudokuPad. A read with the feature off is null, as for a key with nothing saved, and a write is dropped.
    // A write that throws goes on to its caller with the feature still on, so a dialog's `writeOrRestore` can put back the keys written
    // before it; the feature fails only where a feature's own `run` catches the throw. `keep`, the copy of an unreadable value, turns the
    // feature off on any throw, a refusal included, so nothing can save over the original.
    function storeFor (feature) {
      const write = (fn) => {
        if (feature.off) return
        try {
          fn()
        } catch (error) {
          if (Object(error) === error) storeFailures.set(error, feature)
          throw error
        }
      }
      return {
        getData: (key) => feature.run(() => Framework.getData(key), () => null),
        setData: (key, value) => write(() => Framework.setData(key, value)),
        removeData: (key) => write(() => Framework.removeData(key)),
        keep: (key, value) => feature.run(() => Framework.setData(key, value))
      }
    }

    // What a settings entry and dialog are handed in place of Framework: the close a dialog button runs goes under `feature`.
    const dialogsFor = (feature) => ({
      addSetting: (setting) => Framework.addSetting(setting),
      showDialog: (options) => Framework.showDialog(options),
      closeDialog: () => feature.run(() => Framework.closeDialog())
    })

    return { features: guarded, get off () { return reasons.map((reason) => reason.label) }, probe, storeFor, dialogsFor }
  }
  /* eslint-enable no-unused-vars */
  // </lib:sudokupad>
  // The fit reads the puzzle's id; SudokuPad calls resize on every layout; the limits dialog and their saved values are SudokuPad's settings entry, dialog and storage.
  // The fit and the refit start once `Framework.getApp` says the app is ready, so without it they are off and the settings start alone.
  const FEATURES = {
    fit: {
      label: 'rules fit',
      needs: { 'Framework.getApp': 'function', 'Framework.app.puzzle': 'object' },
      onSkip () {
        const rules = rulesPane()
        const controls = controlsColumn()
        if (rules && controls) takeOffFit(rules, controls)
        fitted = false
        showControls(false)
      }
    },
    refit: { label: 'rules refit', needs: { 'Framework.getApp': 'function', 'Framework.app.resize': 'function' } },
    settings: {
      label: 'max size settings',
      needs: {
        'Framework.addSetting': 'function',
        'Framework.showDialog': 'function',
        'Framework.closeDialog': 'function',
        'Framework.getData': 'function',
        'Framework.setData': 'function',
        'Framework.removeData': 'function'
      }
    }
  }
  const guard = createGuard({ script: 'auto-rules-resizer', name: 'Auto Rules Resizer', version: VERSION, features: FEATURES })
  const { fit: rulesFit, refit: rulesRefit, settings: maxSizeSettings } = guard.features

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      READERS,
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
      watchCornerDrag,
      lackingInternals,
      FEATURES
    }
  }
  if (typeof document === 'undefined') return

  // The match also covers other crackingthecryptic.com pages, which have no Framework.
  if (typeof Framework === 'undefined') return

  const ID = 'auto-rules-resizer'
  const FONT_BAR_ID = `${ID}-font`
  const CORNER_CLASS = `${ID}-corner`
  const SHOWN_CLASS = `${ID}-shown` // on the body while the pane is fitted: the font bar shows
  const DRAG_CLASS = `${ID}-dragging` // on the body while a corner drag is under way: the corners and the bar stay shown
  const MAX_WIDTH_INPUT_ID = `${ID}-max-width`
  const MAX_HEIGHT_INPUT_ID = `${ID}-max-height`
  const CORNER_PX = 28
  const CORNER_CURSOR = { ur: 'ne-resize', dl: 'sw-resize' }
  const cornerId = (corner) => `${ID}-drag-${corner}`

  const COPY_ICON = '.rules-copy' // SudokuPad's copy-rules icon
  // On the pane while it is fitted, so the fit measures the text as it will be set. A stylesheet rule, not inline, leaves a
  // reader's own text-spacing override the last word.
  const TEXT_CLASS = `${ID}-text`

  // The corners and the font bar show while the pointer is over the pane, a corner or the bar, or a drag is under
  // way. The bar sits flush against the pane, so the pointer never leaves them on its way up.
  const SHOW_WHEN = `body.${SHOWN_CLASS}:is(.${DRAG_CLASS}, :has(.puzzle-rules:hover, .${CORNER_CLASS}:hover, #${FONT_BAR_ID}:hover))`

  const STYLE = `
    #${FONT_BAR_ID} { position: fixed; z-index: 99999; display: none; visibility: hidden; gap: 4px; font: 14px monospace; }
    #${FONT_BAR_ID} button { all: revert; padding: 0 6px; border-radius: 8px; opacity: .7; cursor: pointer; font: inherit; }
    .${CORNER_CLASS} { position: fixed; z-index: 99999; display: none; width: ${CORNER_PX}px; height: ${CORNER_PX}px;
      box-sizing: border-box; border-radius: 8px; background: rgba(85, 255, 255, .4); border: 1px dotted rgba(85, 255, 255, .8);
      touch-action: none; }
    body.${SHOWN_CLASS} #${FONT_BAR_ID} { display: flex; }
    ${SHOW_WHEN} #${FONT_BAR_ID} { visibility: visible; }
    ${SHOW_WHEN} .${CORNER_CLASS} { display: block; }
    .puzzle-rules.${TEXT_CLASS} { line-height: 1.3; text-wrap: pretty; hyphens: auto; }
  `

  let nudgePx = 0
  let fitted = false // whether the fit's output may be on the pane
  let limits = noLimits()

  let textWatch = null // a MutationObserver on the pane, made in `start`
  let watchedPane = null

  const getStyle = (el) => window.getComputedStyle(el)
  const rulesPane = () => document.querySelector('.puzzle-rules')
  const controlsColumn = () => document.getElementById('controls')
  const dragKey = () => puzzleKey(Framework.app.puzzle.puzzleId, window.location.href)

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
    // SudokuPad stops `mousedown` on the buttons it knew at startup; this bar comes later and sits within a cell of the grid, so a press would reach its board.
    bar.addEventListener('mousedown', (event) => event.stopPropagation())
    document.body.appendChild(bar)
  }

  function addCorner (corner) {
    const el = document.createElement('div')
    el.id = cornerId(corner)
    el.className = CORNER_CLASS
    el.style.cursor = CORNER_CURSOR[corner]
    watchCornerDrag(el, window, (dx, dy) => dragRules(corner, dx, dy), (on) => {
      document.body.classList.toggle(DRAG_CLASS, on)
    })
    document.body.appendChild(el)
  }

  // Sizes are passed in: a corner hidden until hover measures 0 x 0.
  function place (el, left, top, width, height) {
    el.style.left = `${Math.max(0, Math.min(left, window.innerWidth - width))}px`
    el.style.top = `${Math.max(0, Math.min(top, window.innerHeight - height))}px`
  }

  // The font bar sits at the pane's top-left corner, which a widening pane leaves where it is, directly above the
  // pane so it covers none of the rules, or directly below it when the pane reaches the window's top. It starts
  // right of SudokuPad's copy-rules icon, which hangs over that corner.
  function placeControls (rules) {
    const r = rules.getBoundingClientRect()
    const bar = document.getElementById(FONT_BAR_ID)
    const above = r.top - bar.offsetHeight
    const copyIcon = document.querySelector(COPY_ICON)
    place(bar, r.left + (copyIcon ? copyIcon.getBoundingClientRect().width : 0), above >= 0 ? above : r.bottom, bar.offsetWidth, bar.offsetHeight)
    place(document.getElementById(cornerId('ur')), r.right - CORNER_PX, r.top, CORNER_PX, CORNER_PX)
    place(document.getElementById(cornerId('dl')), r.left, r.bottom - CORNER_PX, CORNER_PX, CORNER_PX)
  }

  function showControls (on) {
    document.body.classList.toggle(SHOWN_CLASS, on)
  }

  // Other SudokuPad features write into the pane after it is shown, some without a layout pass (a support link, emoji images).
  // The observer follows the pane if SudokuPad replaces it. Not the attributes: the fit's own writes are styles.
  function watchText (rules) {
    if (!textWatch || rules === watchedPane) return
    textWatch.disconnect()
    textWatch.observe(rules, { childList: true, subtree: true, characterData: true })
    watchedPane = rules
  }

  // The position under the pane's top-left content corner and how far its line sits above that corner, in visual px, or null
  // when there is nothing to keep (the pane is at the top, or the browser cannot say).
  function readingPlace (rules) {
    if (rules.scrollTop === 0) return null
    const r = rules.getBoundingClientRect()
    const style = getStyle(rules)
    const caret = document.caretPositionFromPoint?.(r.left + (parseFloat(style.paddingLeft) || 0) + 2, contentTop(rules) + 2)
    const at = caret && rules.contains(caret.offsetNode) ? { node: caret.offsetNode, offset: caret.offset } : null
    const line = at ? lineTop(at) : null
    return line === null ? null : { ...at, above: contentTop(rules) - line }
  }

  function contentTop (rules) {
    return rules.getBoundingClientRect().top + (parseFloat(getStyle(rules).paddingTop) || 0)
  }

  // The top of the line holding a position: the character after it in a text node, else the element at it, which is the
  // break of a blank line. Null where the position has no box.
  function lineTop ({ node, offset }) {
    let box
    if (node.nodeType === window.Node.TEXT_NODE) {
      const range = document.createRange()
      range.setStart(node, offset)
      range.setEnd(node, offset < node.length ? offset + 1 : offset)
      box = range.getBoundingClientRect()
    } else {
      const child = node.childNodes[offset]
      if (child?.nodeType !== window.Node.ELEMENT_NODE) return null
      box = child.getBoundingClientRect()
    }
    return box.height > 0 ? box.top : null
  }

  // After a refit, scrolls the pane so the line that was at its top is there again.
  function keepReadingPlace (rules, place) {
    if (!place) return
    const line = lineTop(place)
    if (line === null) return
    rules.scrollTop += (line - (contentTop(rules) - place.above)) / paneScale(rules)
  }

  // Visual px per css px of the pane: SudokuPad scales the whole controls column.
  const paneScale = (rules) => (rules.offsetWidth > 0 ? rules.getBoundingClientRect().width / rules.offsetWidth : 1)

  // The pane's width in css px that sets the rules' average character READABLE_CHARS wide at `fontPx`. The average is the
  // rules' own, measured as a canvas sets them, so it holds for any font and any text.
  function readableWidth (rules, fontPx) {
    const style = getStyle(rules)
    const context = document.createElement('canvas').getContext('2d')
    context.font = `${style.fontStyle} ${style.fontWeight} ${fontPx}px ${style.fontFamily}`
    const text = rules.textContent
    const average = text.length > 0 ? context.measureText(text).width / text.length : 0
    const sides = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
    return Math.ceil(READABLE_CHARS * average + sides.reduce((sum, k) => sum + (parseFloat(style[k]) || 0), 0))
  }

  // The fit and the text style it measures with, both off.
  function takeOffFit (rules, controls) {
    clearFit(rules, controls)
    rules.classList.remove(TEXT_CLASS)
  }

  // `given` is the reading place kept from before the fit came off: null is nothing to keep, and undefined reads the pane's current place.
  function fitPage (given) {
    rulesFit.run(() => {
      const rules = rulesPane()
      const controls = controlsColumn()
      if (!rules || !controls) return
      const game = document.querySelector('.game')
      if (!game || !isLandscape(game.getBoundingClientRect())) {
        takeOffFit(rules, controls)
        fitted = false
        showControls(false)
        return
      }
      const board = document.getElementById('board')
      const box = draggedBox(dragKey())
      const place = given === undefined ? readingPlace(rules) : given // before the text class and the fit change the layout
      rules.classList.add(TEXT_CLASS)
      const applied = fitRulesPane({
        rules,
        container: rulesContainer(rules, getStyle),
        controls,
        getStyle,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        pageTop: game.getBoundingClientRect().top,
        useSpare: !rulesRefit.off,
        boardRight: board ? board.getBoundingClientRect().right : 0,
        nudgePx,
        onNudge: (px) => { nudgePx = px },
        box,
        limits,
        readable: (fontPx) => readableWidth(rules, fontPx)
      })
      if (applied) Object.assign(box, applied) // a later drag starts from where this one stopped
      keepReadingPlace(rules, place)
      rulesRefit.run(() => watchText(rules))
      fitted = fitted || Boolean(applied)
      showControls(Boolean(applied))
      if (applied) placeControls(rules)
    })
  }

  const CLASS_PREFIX = 'rules-resizer-'
  const DIALOG_ID = 'rules-resizer-dialog'
  const dialogs = guard.dialogsFor(maxSizeSettings)
  // Both Max Size keys and the limits mirroring them, as a function that puts them back after a Save or Paste that failed half-way.
  function snapshotLimits () {
    const restoreStored = snapshotStore(Framework, [MAX_WIDTH_KEY, MAX_HEIGHT_KEY])
    const was = limits
    return () => {
      try {
        restoreStored()
      } finally {
        limits = was
      }
    }
  }

  function openDialog () {
    const row = (id, label, value) => `<label for="${id}">${label}</label>` +
      `<input type="number" id="${id}" min="1" step="1" placeholder="no limit" value="${value ?? ''}" style="width:6em">` +
      '<span>px</span>'
    const typedLimits = () => ({
      maxWidth: limitFromBox(document.getElementById(MAX_WIDTH_INPUT_ID).value, limits.maxWidth),
      maxHeight: limitFromBox(document.getElementById(MAX_HEIGHT_INPUT_ID).value, limits.maxHeight)
    })
    const body = showSettingsDialog(dialogs, {
      prefix: CLASS_PREFIX,
      name: 'Rules Resizer',
      version: VERSION,
      bodyId: DIALOG_ID,
      changed: () => {
        const typed = typedLimits()
        return typed.maxWidth !== limits.maxWidth || typed.maxHeight !== limits.maxHeight
      },
      snapshot: snapshotLimits,
      save: () => maxSizeSettings.runOrThrow(() => {
        limits = typedLimits()
        saveLimits(Framework, limits)
        fitPage()
      })
    })
    if (!body) return
    body.innerHTML = '<div style="margin:6px 0;display:grid;grid-template-columns:auto auto auto;gap:6px 8px;align-items:center;justify-content:start">' +
      row(MAX_WIDTH_INPUT_ID, 'Max auto width', limits.maxWidth) + row(MAX_HEIGHT_INPUT_ID, 'Max auto height', limits.maxHeight) +
      '</div><div style="opacity:.7;max-width:22em">Empty means no limit. The limits cap only the automatic fit; a corner drag can go past them.</div>'
    const widthInput = document.getElementById(MAX_WIDTH_INPUT_ID)
    const heightInput = document.getElementById(MAX_HEIGHT_INPUT_ID)
    const copied = () => maxSizeSettings.runOrThrow(() => copiedSettings(Framework))
    wireCopyPaste(body.closest('.dialog'), { copied, readers: READERS, snapshot: snapshotLimits }, (values) => maxSizeSettings.runOrThrow(() => {
      limits = { maxWidth: MAX_WIDTH_KEY in values ? values[MAX_WIDTH_KEY] : limits.maxWidth, maxHeight: MAX_HEIGHT_KEY in values ? values[MAX_HEIGHT_KEY] : limits.maxHeight }
      saveLimits(Framework, limits)
      if (MAX_WIDTH_KEY in values) widthInput.value = limits.maxWidth ?? ''
      if (MAX_HEIGHT_KEY in values) heightInput.value = limits.maxHeight ?? ''
      fitPage()
    }))
  }

  // The drag reads the puzzle's id, so it is the fit's.
  function dragRules (corner, dx, dy) {
    rulesFit.run(() => {
      const rules = rulesPane()
      if (!rules) return
      const paneSize = rules.getBoundingClientRect()
      const scale = paneScale(rules)
      const minSize = { width: RULES_MIN.width * scale, height: RULES_MIN.height * scale }
      const box = draggedBox(dragKey())
      Object.assign(box, dragRulesBox(box, corner, dx, dy, paneSize, minSize))
      fitPage()
    })
  }

  // Without getApp there is no app: the fit and the refit are off, and the settings start without it.
  const start = (app) => {
    guard.probe({ roots: { Framework }, store: Framework })
    maxSizeSettings.run(() => {
      limits = readLimits(Framework)
      addSettingsEntry(dialogs, { name: 'rulesresizer', content: 'Rules Resizer', open: () => maxSizeSettings.run(openDialog) })
    })
    addStyle()
    addFontBar()
    for (const corner of CORNERS) addCorner(corner)
    // SudokuPad calls resize on every layout: a new puzzle, a resize, a turn of the device. It scales the controls column to fit the
    // page as it measures it, so it measures with the fit off, or the taller pane would shrink the whole column.
    rulesRefit.run(() => rulesRefit.wrap(app, 'resize', (stock, ...args) => {
      const rules = rulesPane()
      const controls = controlsColumn()
      const place = rules ? readingPlace(rules) : null
      if (rules && controls) takeOffFit(rules, controls)
      try {
        return stock(...args)
      } finally {
        fitPage(place)
      }
    }))
    const refitSoon = makeTrailing(fitPage, RESIZE_MS)
    window.addEventListener('resize', refitSoon)
    rulesRefit.run(() => { textWatch = new window.MutationObserver(refitSoon) })
    fitPage()
  }
  if (typeof Framework.getApp === 'function') Framework.getApp().then(start)
  else start(undefined)
})()
