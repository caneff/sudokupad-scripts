// ==UserScript==
// @name         SudokuPad Dark Page
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.7.14
// @description  Makes the page black around the puzzle, or another color chosen in a settings dialog, with dark control buttons on a dark page. Puzzle colors stay as intended, unlike SudokuPad's dark mode.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/dark-page.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/dark-page.user.js
// ==/UserScript==

(function () {
  'use strict'

  // GM_info is absent without Tampermonkey, so the script cannot read @version; keep this equal to it.
  const VERSION = '0.7.14'
  const STYLE_ID = 'dark-page-style'
  const BOARD_ID = 'svgrenderer'
  // The page color and every other rule apply only while a board is on the page; a page with none keeps its own colors.
  const PAGE = `body:has(#${BOARD_ID})`
  const DATA_KEY = 'DarkPage_color'
  const DEFAULT_COLOR = '#000000'
  const HEX_COLOR = /^#[0-9a-f]{6}$/i
  // SudokuPad's own buttons are light `#eee`, which glare on a dark page. An on button (`.selected`,
  // or `.selectedperm` on Select) keeps SudokuPad's fill and gets BUTTON_ACCENT as its border.
  const BUTTON_BG = '#2a2a2a'
  const BUTTON_ACCENT = '#d2a8f0'
  const BUTTON_BORDER = '#4a4a4a'
  const BUTTON_GROUPS = ['.controls-app', '.controls-tool', '.controls-aux']
  // Material 3 state layers: BUTTON_ACCENT at 8% (hover) and 10% (press) over BUTTON_BG, worked out by hand; recompute both when either of those changes.
  const BUTTON_HOVER_BG = '#37343a'
  const BUTTON_PRESS_BG = '#3b373e'
  // The page's own text pair. Pure white or black never falls below about 4.58:1 on any page color, where the
  // shared LIGHT_TEXT and DARK_TEXT (#ddd, #222) fall to 3.5:1 on a mid grey.
  const PAGE_LIGHT_TEXT = '#ffffff'
  const PAGE_DARK_TEXT = '#000000'
  function pageColorOf (data) {
    return typeof data === 'string' && HEX_COLOR.test(data) ? data.toLowerCase() : null
  }

  // Throws when storage cannot be read.
  const readSaved = (store) => pageColorOf(store.getData(DATA_KEY))

  // Framework keeps its saved data in localStorage under `<Framework.LocalDataPrefix>_<name>` (`makeDataKey`), a color as
  // the plain string: the live checks in § at document-start fail if SudokuPad changes either.
  const LOCAL_DATA_KEY = `svencodes_${DATA_KEY}`
  // The saved color read straight from storage, for when Framework does not exist yet. Throws when storage is blocked.
  const earlyColor = (storage) => pageColorOf(storage.getItem(LOCAL_DATA_KEY))

  const READERS = { [DATA_KEY]: (data) => pageColorOf(data) ?? undefined }

  // The color in force, the default included, so a paste can put a page back to the default.
  const copiedSettings = (store) => JSON.stringify({ [DATA_KEY]: readSaved(store) ?? DEFAULT_COLOR })

  // <lib:color-math>
  // Generated from lib/color-math.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  const clamp255 = (x) => Math.max(0, Math.min(255, x))

  // The share of its OKLCH lightness a cell color keeps when darkened: low enough to read against cell colors drawn at 60% opacity, high enough that the lightest still show as 5px lines on white and the nine stay apart.
  const LIGHTNESS_FACTOR = 0.75
  const GAMUT_EDGE = 1e-6
  const LIGHT_TEXT = '#dddddd'
  const DARK_TEXT = '#222222'

  const COLOR_FUNCTION = /^(rgb|hsl)a?\(([^)]*)\)$/
  const HEX_DIGITS = /^#([0-9a-f]{3}|[0-9a-f]{6})$/
  const HEX_ALPHA = /^#[0-9a-f]{3}([0-9a-f])$|^#[0-9a-f]{6}([0-9a-f]{2})$/

  const alphaOf = (text) => text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text)

  function colorFunction (value) {
    const fn = COLOR_FUNCTION.exec(value)
    if (!fn) return null
    const parts = fn[2].split(/[,/\s]+/).filter(Boolean)
    return { kind: fn[1], args: parts.slice(0, 3), alpha: parts.length > 3 ? alphaOf(parts[3]) : undefined }
  }

  // A page lists `transparent`, or a color with alpha 0, to leave a slot empty (key 0 of each default page).
  function isTransparent (text) {
    if (typeof text !== 'string') return false
    const value = text.trim().toLowerCase()
    if (value === 'transparent') return true
    const hex = HEX_ALPHA.exec(value)
    if (hex) return parseInt(hex[1] ?? hex[2], 16) === 0
    const fn = colorFunction(value)
    return Boolean(fn && fn.alpha <= 0)
  }

  // SudokuPad's own cell color 3 is `rgb(-36, -36, -36)`, which clamps to black.
  function parseColor (text) {
    if (typeof text !== 'string' || isTransparent(text)) return null
    const value = text.trim().toLowerCase()
    const hex = HEX_DIGITS.exec(value)
    if (hex) {
      const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
      return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16))
    }
    const fn = colorFunction(value)
    if (!fn || fn.kind !== 'rgb' || fn.args.length < 3) return null
    const channels = fn.args.map(Number)
    return channels.some(Number.isNaN) ? null : channels.map((x) => Math.round(clamp255(x)))
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

  function wcagLuminance (rgb) {
    const [r, g, b] = rgb.map((c) => {
      const x = c / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  // `light` or `dark` (LIGHT_TEXT and DARK_TEXT unless given), whichever contrasts more with the background color (any parseColor text).
  function textColorFor (background, light = LIGHT_TEXT, dark = DARK_TEXT) {
    const rgb = parseColor(background)
    if (!rgb) throw new RangeError(`color-math: ${background} is not a color`)
    const page = wcagLuminance(rgb) + 0.05
    const contrast = (text) => { const t = wcagLuminance(parseColor(text)) + 0.05; return Math.max(page, t) / Math.min(page, t) }
    return contrast(light) >= contrast(dark) ? light : dark
  }
  /* eslint-enable no-unused-vars */
  // </lib:color-math>

  // No variable is declared: SudokuPad's theme variables sit on `:root` and color the grid too.
  // `!important` outranks SudokuPad's rules, `.setting-darkmode`'s included. The board's own box
  // (`#svgrenderer`) takes `--body-bg`, what SudokuPad gives `body`: the puzzle has no background and
  // shows `body` through it, and the svg's box clips everything the puzzle draws, so no drawn pixel
  // lies on the page color. The replay readout is the `::after` of `.controls-input`, drawn on the
  // page. Svg-painted icons and color swatch fills keep their colors.
  function buildCss (pageColor) {
    const rule = (selector, ...declarations) => `${selector} { ${declarations.map((d) => `${d} !important`).join('; ')} }`
    const pageRule = (selectors, ...declarations) => rule(selectors.map((selector) => `${PAGE} ${selector}`).join(', '), ...declarations)
    const textColor = textColorFor(pageColor, PAGE_LIGHT_TEXT, PAGE_DARK_TEXT)
    const darkButtons = [
      pageRule(BUTTON_GROUPS.map((group) => `${group} button:not(.selected):not(.selectedperm)`), `background-color: ${BUTTON_BG}`, `color: ${BUTTON_ACCENT}`, `border-color: ${BUTTON_BORDER}`),
      pageRule(BUTTON_GROUPS.flatMap((group) => [`${group} button.selected`, `${group} button.selectedperm`]), `border-color: ${BUTTON_ACCENT}`),
      pageRule(['.button-row button'], `border-color: ${BUTTON_BORDER}`),
      // SudokuPad's own focus shadow cannot be seen on BUTTON_BG.
      pageRule(BUTTON_GROUPS.map((group) => `${group} button:focus-visible`), `outline: 2px solid ${BUTTON_ACCENT}`, 'outline-offset: 2px'),
      pageRule(BUTTON_GROUPS.map((group) => `${group} button:not(.selected):not(.selectedperm):hover`), `background-color: ${BUTTON_HOVER_BG}`),
      pageRule(BUTTON_GROUPS.map((group) => `${group} button:not(.selected):not(.selectedperm):active`), `background-color: ${BUTTON_PRESS_BG}`)
    ]
    return [
      rule(PAGE, `background-color: ${pageColor}`),
      pageRule([`#${BOARD_ID}`], 'background-color: var(--body-bg)'),
      pageRule(['.controls-footer', '.controls-footer a'], `color: ${textColor}`),
      pageRule(['.controls-input::after'], `color: ${textColor}`),
      // The buttons go dark on the shared light-text test, not on Dark Page's own text pair.
      ...(textColorFor(pageColor) === LIGHT_TEXT ? darkButtons : [])
    ].join('\n')
  }

  // <lib:settings-dialog>
  // Generated from lib/settings-dialog.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // Reads ERROR_LOG_KEY, readErrorLog, formatErrorLog and SUDOKUPAD_PURPLE from sudokupad, and wireCopyPaste from settings-transfer. A script
  // that copies in panel as well has a second `global` naming SUDOKUPAD_PURPLE, which the linter calls a redeclaration.
  /* global ERROR_LOG_KEY, readErrorLog, formatErrorLog, SUDOKUPAD_PURPLE, wireCopyPaste */ // eslint-disable-line no-redeclare
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
  // What `keys` hold now, and the script's in-memory copy of them, as a function that puts both back; a key that held nothing is removed
  // again. `holdMirror()` runs now and returns what puts the copy back. Every key is written back even when one throws, and the copy is
  // put back after them; the first throw then goes on. The stored values are held by reference, so a script's save must replace a value
  // and never edit one in place.
  function snapshotStore (store, keys, holdMirror = () => () => {}) {
    const before = keys.map((key) => [key, store.getData(key)])
    const putMirrorBack = holdMirror()
    return () => {
      const failures = []
      before.forEach(([key, value]) => {
        try {
          if (value == null) store.removeData(key)
          else store.setData(key, value)
        } catch (error) {
          failures.push(error)
        }
      })
      putMirrorBack()
      if (failures.length > 0) throw failures[0]
    }
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

  // The title rules travel with the row, so they are in the page exactly while the dialog is.
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

  function renderErrorLogRow (prefix) {
    return `<style>${errorLogCss(prefix)}</style><div class="${prefix}error-log" ${ERROR_LOG_ATTRIBUTE}><button type="button" data-act="copy-error-log">Copy error log</button><button type="button" data-act="clear-error-log">Clear</button></div>`
  }

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
  // Save and Paste each write under `snapshot` (`writeOrRestore`'s), in a dialog action of the guard feature `feature` (`runInDialog`).
  // `copyPaste` holds the rest of `wireCopyPaste`'s options: `copied`, `readers`, `upgrade` and `apply`.
  function showSettingsDialog (framework, { prefix, name, version, bodyId, styleId, css, centerOverBoard = true, changed, save, snapshot, feature, copyPaste, extraButtons = [] }, { doc = document, win = window } = {}) {
    if (typeof snapshot !== 'function') throw new Error(`${name}: a settings dialog needs a snapshot`)
    addStyleOnce(`settings-dialog-buttons-${bodyId}`, buttonRowCss(bodyId), doc)
    if (css) addStyleOnce(styleId, css, doc)
    const close = () => closeDialogKeepingGrid(framework, win)
    // After a failed save the script's `changed()` may already read false, so a retry saves again whatever it says.
    let failed = false
    const saveAndClose = () => {
      try {
        if (failed || changed()) feature.runInDialog(() => writeOrRestore(snapshot, save))
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
    const dialog = body.closest('.dialog')
    wireErrorLog(dialog, win)
    wireCopyPaste(dialog, { ...copyPaste, snapshot, feature })
    // No selector tells the buttons apart but their text, so the shell marks each with its role for the script's stylesheet.
    const row = dialog?.querySelector('.dialog-options')
    if (row) row.querySelectorAll('button').forEach((button, index) => { button.dataset.role = buttons[index].role })
    return body
  }
  /* eslint-enable no-unused-vars */
  // </lib:settings-dialog>
  // <lib:settings-transfer>
  // Generated from lib/settings-transfer.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  /* global setDialogStatus, errorText, writeOrRestore */
  // A reader returns the value to save, or undefined to refuse it. `upgrade` rewrites the parsed object first, for text copied by an older version.
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

  function wireCopyPaste (root, { copied, readers, upgrade, apply, snapshot, feature }) {
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
          if (Object.keys(values).length > 0) feature.runInDialog(() => writeOrRestore(snapshot, () => apply(values)))
          say(pasteReport(Object.keys(values).length, skipped))
        }
      } catch (error) {
        say(`Could not ${act === 'copy-settings' ? 'copy' : 'paste'}: ${errorText(error)}`)
      }
    })
  }
  /* eslint-enable no-unused-vars */
  // </lib:settings-transfer>
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

    // While a dialog action (`runInDialog`) runs, a store write that throws goes on, marked here, through every `run` to the caller.
    let dialogActions = 0
    const storeFailures = new WeakSet()

    function createFeature (featureName, { label, onSkip }) {
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
            if (storeFailures.has(error)) throw error
            feature.skip(error)
            return fallback()
          }
        },
        // An action the user asked for in a dialog: its throw goes on to the caller and leaves the feature on, so the caller can write the
        // earlier values back and say why; one with the feature off throws saying so. A store write that fails in it throws on too.
        runInDialog (fn) {
          if (feature.off) throw new Error(`${name} turned off its ${label}`)
          dialogActions++
          try {
            return fn()
          } finally {
            dialogActions--
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
              feature.skip(error)
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
    // A write that throws turns the feature off and its caller goes on, except in a dialog action, where it throws on (`runInDialog`). A
    // write the browser refuses (a full localStorage) is the browser's doing: it is told to the user and leaves the feature on, so it saves
    // again once space frees. `keep`, the copy of an unreadable value, turns the feature off on any throw, a refusal included, so nothing
    // can save over the original.
    function storeFor (feature) {
      const write = (fn) => {
        if (feature.off) return
        try {
          fn()
        } catch (error) {
          if (dialogActions > 0) {
            if (Object(error) === error) storeFailures.add(error)
            throw error
          }
          if (!isRefusedWrite(error)) return feature.skip(error)
          console.warn(`${script}: ${feature.label} could not save, the browser refused the write:`, error)
          tell(`${name}: the browser has no room left, so ${feature.label} could not be saved.`)
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
  // The saved color is read through Framework with no need of the app; the settings entry is added once `Framework.getApp` says the app is ready.
  const FEATURES = {
    savedPageColor: { label: 'saved color', needs: { 'Framework.getData': 'function' } },
    settings: {
      label: 'settings entry',
      needs: {
        'Framework.getApp': 'function',
        'Framework.addSetting': 'function',
        'Framework.showDialog': 'function',
        'Framework.closeDialog': 'function',
        'Framework.setData': 'function',
        'Framework.removeData': 'function'
      }
    }
  }
  const guard = createGuard({ script: 'dark-page', name: 'Dark Page', version: VERSION, features: FEATURES })
  const { savedPageColor, settings: settingsEntry } = guard.features

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, READERS, DATA_KEY, copiedSettings, pastedSettings, pasteReport, DEFAULT_COLOR, readSaved, textColorFor, pageColorOf, earlyColor, LOCAL_DATA_KEY, buildCss, PAGE, BOARD_ID, STYLE_ID, lackingInternals, FEATURES }
  }
  if (typeof document === 'undefined') return

  // The page color goes in before the first paint, so the page is never SudokuPad's white first. The board's `#svgrenderer`
  // is in the page's own HTML, so `PAGE` matches as soon as the parser reaches it. A page whose storage cannot be read gets the default.
  let pageColor = DEFAULT_COLOR
  try {
    pageColor = earlyColor(window.localStorage) || DEFAULT_COLOR
  } catch (e) {
    // Best effort: `start` reads the color through Framework, which reports a storage it cannot read.
  }

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = buildCss(pageColor)
  // Neither `document.head` nor, in some injectors, `document.documentElement` exists yet: the style goes in as the parser creates one.
  const attach = () => (document.head || document.documentElement).appendChild(style)
  if (document.documentElement) attach()
  else {
    new window.MutationObserver((records, observer) => {
      if (!document.documentElement) return
      observer.disconnect()
      attach()
    }).observe(document, { childList: true })
  }

  // The color is written only from the dialog, so a write that fails reaches its status line with the settings entry still on.
  const savedSettings = guard.storeFor(settingsEntry)

  function saveColor (color) {
    // The default is kept as nothing saved, so it follows any later change of the default.
    if (color === DEFAULT_COLOR) savedSettings.removeData(DATA_KEY)
    else savedSettings.setData(DATA_KEY, color)
    pageColor = color
    style.textContent = buildCss(pageColor)
  }

  const CLASS_PREFIX = 'dark-page-'
  const DIALOG_ID = 'dark-page-dialog'
  const dialogs = guard.dialogsFor(settingsEntry)
  // `pageColor` is set only after the write, so the stored color is all a failed Save or Paste can leave changed.
  const snapshotColor = () => snapshotStore(savedSettings, [DATA_KEY])

  function openDialog () {
    let picked = pageColor
    const body = showSettingsDialog(dialogs, {
      prefix: CLASS_PREFIX,
      name: 'Dark Page',
      version: VERSION,
      bodyId: DIALOG_ID,
      changed: () => picked !== pageColor,
      snapshot: snapshotColor,
      feature: settingsEntry,
      save: () => saveColor(picked),
      copyPaste: {
        copied: () => savedPageColor.runInDialog(() => copiedSettings(Framework)),
        readers: READERS,
        // The draft takes the paste only once it is saved, so a paste that failed leaves the dialog showing what it showed.
        apply: (values) => {
          if (!(DATA_KEY in values)) return
          saveColor(values[DATA_KEY])
          picked = pageColor
          input.value = picked
        }
      }
    })
    if (!body) return
    body.innerHTML = '<div style="margin:6px 0;display:flex;align-items:center;gap:8px">' +
      `<input type="color" id="dark-page-input" value="${picked}">` +
      '<button type="button" id="dark-page-reset">Black</button></div>'
    const input = document.getElementById('dark-page-input')
    const preview = () => { style.textContent = buildCss(picked) }
    // However the dialog closes (Save, Cancel, Escape), the page goes back to the saved color; a Save has already made it the saved one.
    const closed = new window.MutationObserver(() => {
      if (body.isConnected) return
      closed.disconnect()
      style.textContent = buildCss(pageColor)
    })
    closed.observe(document.body, { childList: true, subtree: true })
    const reset = document.getElementById('dark-page-reset')
    // `input` fires while the picker moves.
    input.addEventListener('input', () => { picked = input.value.toLowerCase(); preview() })
    reset.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      picked = DEFAULT_COLOR
      input.value = DEFAULT_COLOR
      preview()
    })
  }

  // At DOMContentLoaded Framework exists (before the app is ready). What it reads is the saved color, and the early
  // read is corrected to it, "nothing saved" included; a read that fails keeps the color already painted.
  function start () {
    // The match also covers other crackingthecryptic.com pages, which have no Framework and keep the default color.
    if (typeof Framework === 'undefined') return
    guard.probe({ roots: { Framework }, store: Framework })
    const read = savedPageColor.run(() => ({ color: readSaved(Framework) }), () => null)
    const saved = read ? read.color || DEFAULT_COLOR : pageColor
    if (saved !== pageColor) {
      pageColor = saved
      style.textContent = buildCss(pageColor)
    }
    settingsEntry.run(() => Framework.getApp().then(() => {
      settingsEntry.run(() => addSettingsEntry(dialogs, { name: 'darkpage', content: 'Dark Page', open: () => settingsEntry.run(openDialog) }))
    }))
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
