// ==UserScript==
// @name         SudokuPad Dark Page
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.4.5
// @description  Makes the page black around the puzzle, or another color chosen in a settings dialog, with dark control buttons on a dark page. Puzzle colors stay as intended, unlike SudokuPad's dark mode.
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
  const VERSION = '0.4.5'
  const STYLE_ID = 'dark-page-style'
  const RECT_ID = 'dark-page-rect'
  const DATA_KEY = 'DarkPage_color'
  const DEFAULT_COLOR = '#000000'
  const HEX_COLOR = /^#[0-9a-f]{6}$/i
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
  // window. An arrow on a page 3 line along an outer edge reaches 2.125 x 16 = 34 cell units (a cell is
  // 64), 30.3px at a cell 57px wide. 34 plus 2 for Pen Tool Extras' White outline is 36, which covers the
  // arrow up to cells about 64px wide and the X well past that. Only cells wider than 128px put the
  // puzzle's own edge farther out than this.
  const SOLVER_REACH = 36
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

  const READERS = { [DATA_KEY]: (data) => savedColor(data) ?? undefined }

  // The color in force, the default included, so a paste can put a page back to the default.
  const copiedSettings = (store) => JSON.stringify({ [DATA_KEY]: readSavedColor(store) ?? DEFAULT_COLOR })

  // <lib:color-math>
  // Generated from lib/color-math.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  const clamp255 = (x) => Math.max(0, Math.min(255, x))

  // The share of its OKLCH lightness a cell color keeps when darkened: low enough to read against cell colors drawn at 60% opacity, high enough that the lightest still show as 5px lines on white and the nine stay apart.
  const LIGHTNESS_FACTOR = 0.75
  const GAMUT_EDGE = 1e-6
  const LIGHT_TEXT = '#dddddd'
  const DARK_TEXT = '#222222'

  const RGB_FUNCTION = /^rgba?\(([^)]*)\)$/
  const HEX_DIGITS = /^#([0-9a-f]{3}|[0-9a-f]{6})$/

  // The channels and alpha of an rgb() or rgba() text with comma, space or slash separators, or null for any other text.
  function rgbFunction (value) {
    const fn = RGB_FUNCTION.exec(value)
    if (!fn) return null
    const parts = fn[1].split(/[,/\s]+/).filter(Boolean)
    const numbers = parts.map(Number)
    if (parts.length < 3 || numbers.some(Number.isNaN)) return null
    return { channels: numbers.slice(0, 3), alpha: numbers[3] }
  }

  // A page lists `transparent` or an rgba() with alpha 0 to leave a slot empty (key 0 of each default page).
  function isTransparent (text) {
    if (typeof text !== 'string') return false
    const value = text.trim().toLowerCase()
    const fn = rgbFunction(value)
    return value === 'transparent' || Boolean(fn && fn.alpha !== undefined && fn.alpha <= 0)
  }

  // A color's [r, g, b] channels, from #rgb, #rrggbb, rgb() or rgba() text, or null for a transparent or unreadable one.
  // SudokuPad's own cell color 3 is `rgb(-36, -36, -36)`, which clamps to black.
  function parseColor (text) {
    if (typeof text !== 'string' || isTransparent(text)) return null
    const value = text.trim().toLowerCase()
    const hex = HEX_DIGITS.exec(value)
    if (hex) {
      const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
      return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16))
    }
    const fn = rgbFunction(value)
    return fn ? fn.channels.map((x) => Math.round(clamp255(x))) : null
  }

  const toHex = (rgb) => '#' + rgb.map((x) => Math.round(clamp255(x)).toString(16).padStart(2, '0')).join('')

  const toLinear = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  const fromLinear = (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)

  // Ottosson's published matrices. The way back returns the unclamped linear channels, so a caller can tell an out-of-gamut color.
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

  const inGamut = (linear) => linear.every((x) => x >= -GAMUT_EDGE && x <= 1 + GAMUT_EDGE)

  // Lowering lightness at fixed chroma can leave sRGB, so chroma is reduced just far enough to fit (a bisection), which keeps the hue.
  function darkenColor (rgb) {
    const [L, a, b] = toOklab(rgb.map(clamp255))
    const target = L * LIGHTNESS_FACTOR
    let low = 1
    if (!inGamut(fromOklabLinear([target, a, b]))) {
      low = 0
      let high = 1
      for (let i = 0; i < 30; i++) {
        const mid = (low + high) / 2
        if (inGamut(fromOklabLinear([target, a * mid, b * mid]))) low = mid
        else high = mid
      }
    }
    const out = fromOklabLinear([target, a * low, b * low])
    return toHex(out.map((x) => fromLinear(Math.max(0, Math.min(1, x)))))
  }

  // WCAG relative luminance of [r, g, b] channels.
  function wcagLuminance (rgb) {
    const [r, g, b] = rgb.map((c) => {
      const x = c / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  // LIGHT_TEXT or DARK_TEXT, whichever contrasts more with the background color (any parseColor text).
  function textColorFor (background) {
    const rgb = parseColor(background)
    if (!rgb) throw new RangeError(`color-math: ${background} is not a color`)
    const page = wcagLuminance(rgb) + 0.05
    const contrast = (text) => { const t = wcagLuminance(parseColor(text)) + 0.05; return Math.max(page, t) / Math.min(page, t) }
    return contrast(LIGHT_TEXT) >= contrast(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
  }
  /* eslint-enable no-unused-vars */
  // </lib:color-math>

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

  // <lib:settings-dialog>
  // Generated from lib/settings-dialog.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // The events that end a press. SudokuPad's pen tool takes its click from `mouseup` (seen live), and
  // a touch ends with `pointerup`, `touchend` and a compatibility `mouseup`, so all four are swallowed.
  const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'mouseup', 'touchend']
  const SETTINGS_GROUP = 'experimental'
  const TITLE_MUTED = '#777'

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
  function addSettingsEntry (framework, { name, content, open }) {
    framework.addSetting({
      tag: 'button',
      name,
      group: SETTINGS_GROUP,
      content,
      handler: () => {
        closeDialogKeepingGrid(framework)
        setTimeout(open, 0)
      }
    })
  }

  const COPY_PASTE_PICTURES = {
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4"/>'
  }
  const titleIconButton = (act, label, picture) =>
    `<button type="button" data-act="${act}" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${picture}</svg></button>`

  // The title row's icon slot, filled with the Copy settings and Paste settings buttons and the status line they report to.
  function renderCopyPasteIcons (prefix) {
    return '<span data-role="settings-status"></span>' +
      `<span class="${prefix}tools">${titleIconButton('copy-settings', 'Copy settings', COPY_PASTE_PICTURES.copy)}${titleIconButton('paste-settings', 'Paste settings', COPY_PASTE_PICTURES.paste)}</span>`
  }

  // The dialog's first part: the name, the version beside it, and `icons` (HTML) at the right end.
  function renderDialogTitle ({ prefix, name, version, icons = '' }) {
    return `<div class="${prefix}title-row"><span><b>${name}</b> <small class="${prefix}version">v${version}</small></span>${icons}</div>`
  }

  function dialogTitleCss (prefix) {
    const tools = `.${prefix}tools`
    return [
      `.${prefix}version { opacity: .6; }`,
      `.${prefix}title-row { display: flex; align-items: center; gap: 12px; }`,
      `${tools} { display: flex; align-items: center; gap: 4px; }`,
      // SudokuPad styles a dialog's buttons by tag, so each of these is forced.
      `${tools} button { background: none !important; border: none !important; box-shadow: none !important; padding: 4px !important; margin: 0 !important; width: auto !important; min-width: 0 !important; height: auto !important; line-height: 0 !important; color: ${TITLE_MUTED} !important; cursor: pointer; border-radius: 6px !important; }`,
      `${tools} button:hover { background: #f0edf5 !important; }`,
      `${tools} svg { width: 20px; height: 20px; }`,
      `${tools} svg * { fill: none !important; }`,
      // A flex item with no intrinsic width: a long message wraps in the room the title leaves and never widens the dialog.
      `.${prefix}title-row [data-role="settings-status"] { flex: 1 1 0; min-width: 0; contain: inline-size; text-align: right; font-size: .8rem; color: ${TITLE_MUTED}; }`
    ].join('\n')
  }

  // Puts the title rules in the page once, for a dialog whose script has no stylesheet of its own to hold them.
  function installDialogTitleStyle (prefix, doc = document) {
    const id = `${prefix}title-style`
    if (doc.getElementById(id)) return
    const style = doc.createElement('style')
    style.id = id
    style.textContent = dialogTitleCss(prefix)
    doc.head.appendChild(style)
  }
  /* eslint-enable no-unused-vars */
  // </lib:settings-dialog>
  // <lib:settings-transfer>
  // Generated from lib/settings-transfer.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
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

  // Wires the title row's Copy settings and Paste settings icons: `copied()` is the text to copy, `apply(values)` takes what a paste kept; `readers` and `upgrade` are `pastedSettings`'.
  function wireCopyPaste (root, { copied, readers, upgrade }, apply) {
    const say = (message) => { root.querySelector('[data-role="settings-status"]').textContent = message }
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
          if (Object.keys(values).length > 0) apply(values)
          say(pasteReport(Object.keys(values).length, skipped))
        }
      } catch (error) {
        say(`Could not ${act === 'copy-settings' ? 'copy' : 'paste'}: ${error.message}`)
      }
    })
  }
  /* eslint-enable no-unused-vars */
  // </lib:settings-transfer>
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, READERS, DATA_KEY, copiedSettings, pastedSettings, pasteReport, DEFAULT_COLOR, readSavedColor, textColorFor, savedColor, buildCss, unionBoxes, snapOutward, clampBox, growBox, paintAlpha, hasVisiblePaint, halfStroke, markerReach, PAD, SOLVER_REACH, RECT_ID, STYLE_ID }
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

  function saveColor (color) {
    // The default is kept as nothing saved, so it follows any later change of the default.
    if (color === DEFAULT_COLOR) Framework.removeData(DATA_KEY)
    else Framework.setData(DATA_KEY, color)
    pageColor = color
    style.textContent = buildCss(pageColor)
  }

  const TITLE_PREFIX = 'dark-page-'

  function openDialog () {
    let picked = pageColor
    installDialogTitleStyle(TITLE_PREFIX)
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: renderDialogTitle({ prefix: TITLE_PREFIX, name: 'Dark Page', version: VERSION, icons: renderCopyPasteIcons(TITLE_PREFIX) }) },
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
                saveColor(picked)
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
    wireCopyPaste(input.closest('.dialog'), { copied: () => copiedSettings(Framework), readers: READERS }, (values) => {
      if (!(DATA_KEY in values)) return
      picked = values[DATA_KEY]
      input.value = picked
      saveColor(picked)
    })
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
    addSettingsEntry(Framework, { name: 'darkpage', content: 'Dark Page', open: openDialog })
  })
})()
