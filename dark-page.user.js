// ==UserScript==
// @name         SudokuPad Dark Page
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.7.55
// @author       ChinStrap
// @description  Makes the page black around the puzzle, or another color chosen in a settings dialog. The control buttons, the two tool panels and the dialog's dimmed background go dark too, and puzzle colors stay as intended, unlike SudokuPad's dark mode.
// @homepageURL  https://chinstrap45.github.io/sudokupad-scripts/
// @supportURL   https://github.com/chinstrap45/sudokupad-scripts/issues
// @license      MIT
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/dark-page.user.js
// @downloadURL  https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/dark-page.user.js
// ==/UserScript==

(function () {
  'use strict'

  // GM_info is absent without Tampermonkey, so the script cannot read @version; keep this equal to it.
  const VERSION = '0.7.55'
  // The script's id, which its notices, error log and palette warnings carry. sync-lib.js reads it from this line as written.
  const SCRIPT_ID = 'dark-page'
  const SCRIPT_NAME = 'Dark Page'
  // Every class and id the script makes starts with this.
  const CLASS_PREFIX = 'dark-page-'
  const STYLE_ID = `${CLASS_PREFIX}style`
  const BOARD_ID = 'svgrenderer'
  // The page color and every other rule apply only while a board is on the page; a page with none keeps its own colors.
  const PAGE = `body:has(#${BOARD_ID})`
  const DATA_KEY = 'DarkPage_color'
  const DEFAULT_COLOR = '#000000'
  // SudokuPad's own buttons are light `#eee`, which glare on a dark page. An on button (`.selected`,
  // or `.selectedperm` on Select) keeps SudokuPad's fill and gets BUTTON_ACCENT as its border.
  const BUTTON_BG = '#2a2a2a'
  const BUTTON_ACCENT = '#d2a8f0'
  const BUTTON_BORDER = '#4a4a4a'
  const BUTTON_GROUPS = ['.controls-app', '.controls-tool', '.controls-aux']
  // Pen Tool Extras' and Text Anywhere's trays, light purple boxes behind their panels' control buttons. Each panel's color buttons carry a `data-key`; every other button in it sits on the tray.
  // These names are the other scripts'; test/cross-script-names.test.js holds them equal.
  const PEN_TOOL_EXTRAS_TRAY_CLASS = 'pen-tool-extras-tray'
  const TEXT_ANYWHERE_TRAY_CLASS = 'text-anywhere-tray'
  const TRAYS = [PEN_TOOL_EXTRAS_TRAY_CLASS, TEXT_ANYWHERE_TRAY_CLASS].map((tray) => `.${tray}`)
  const TRAY_PANELS = TRAYS.map((tray) => `.controls-input:has(${tray})`)
  const TRAY_BUTTON = 'button:not([data-key])'
  // Auto Rules Resizer's f+ and f- bar, on the page's body beside the rules pane, wears SudokuPad's button face, so it goes dark with SudokuPad's buttons.
  const RULES_FONT_BAR_ID = 'auto-rules-resizer-font'
  const SCRIPT_BUTTONS = [`#${RULES_FONT_BAR_ID} button`]
  // A step above a black page and below BUTTON_BG, as the light tray sits between SudokuPad's white page and its white buttons.
  const TRAY_BG = '#1d1a20'
  // SudokuPad's own overlay is rgba(60, 60, 60, .7), which lightens any page darker than #3c3c3c.
  const OVERLAY_BG = 'rgb(0 0 0 / 0.6)'
  // The page color in force, on the body for a script that draws on the page: Text Anywhere's notes off the board take it.
  const PAGE_COLOR_VAR = '--dark-page-color'
  // Material 3 state layers: BUTTON_ACCENT at 8% (hover) and 10% (press) over BUTTON_BG, worked out by hand; recompute both when either of those changes.
  const BUTTON_HOVER_BG = '#37343a'
  const BUTTON_PRESS_BG = '#3b373e'
  // The page's own text pair. Pure white or black never falls below about 4.58:1 on any page color, where the
  // shared LIGHT_TEXT and DARK_TEXT (#ddd, #222) fall to 3.5:1 on a mid gray.
  const PAGE_LIGHT_TEXT = '#ffffff'
  const PAGE_DARK_TEXT = '#000000'
  // <lib:plain>
  // Generated from lib/plain.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  const rem = (value) => Math.round(value * 100) / 100

  // SudokuPad hands every tool the keys typed into a page field too, so a key typed into a field is left to it.
  const typedIntoField = (event) => Boolean(event.target && event.target.closest && event.target.closest('input, textarea, select, [contenteditable]'))

  // Ctrl, Alt and Cmd start the browser's and SudokuPad's own chords; Shift alone is a key's own case.
  const hasChord = (event) => Boolean(event.ctrlKey || event.altKey || event.metaKey)

  // Text into HTML markup or an attribute value: the four characters that would end one or open another.
  const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  // A mouse event's `button` numbers the button that changed; its `buttons` has one bit per button held.
  const PRIMARY_BUTTON = 0
  const SECONDARY_BUTTON = 2
  const PRIMARY_HELD = 1
  const SECONDARY_HELD = 2

  // The settings dialog's one purple: the Save fill and the color pulldown's arrow. It is a shade lighter than SUDOKUPAD_PURPLE, which the focus rings keep.
  const DIALOG_PURPLE = '#6b3fa0'
  /* eslint-enable no-unused-vars */
  // </lib:plain>
  // <lib:settings-table>
  // Generated from lib/settings-table.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // A script that copies in store as well has a second `global` naming isPlainObject, which the linter calls a redeclaration.
  /* global isPlainObject */ // eslint-disable-line no-redeclare
  // A settings table is a list of rows: `name`, `key` (where it is stored), `read` (the one reader, for a saved value and a pasted one: undefined refuses the value),
  // `fallback` (what a refused saved value reads as), and optionally `dialog` (the settings dialog sets it) and `envelope`
  // (the store module's `{ load: loadEnveloped, save: saveEnveloped }`, for a value kept as `{ v, data }`; `read` is then the strict reader of `loadEnveloped`).
  // A row that takes any value as a setting, a bad paste included, has a `read` that never refuses.
  // A strict reader's name starts `saved`: it gives the value it takes and undefined for one it refuses.
  const savedBoolean = (data) => (typeof data === 'boolean' ? data : undefined)

  function sameValue (a, b) {
    return a === b || (isPlainObject(a) && isPlainObject(b) && Object.keys(a).every((name) => a[name] === b[name]))
  }

  const tableKeys = (rows) => rows.map((row) => row.key)

  const tableDefaults = (rows) => Object.fromEntries(rows.map((row) => [row.name, row.fallback]))

  const readRow = (row, store) => (row.envelope ? row.envelope.load(store, row).value : row.read(store.getData(row.key))) ?? row.fallback

  const readByField = (rows, store, by) => Object.fromEntries(rows.map((row) => [row[by], readRow(row, store)]))

  const readTable = (rows, store) => readByField(rows, store, 'name')

  // The same values by stored key, defaults included, so a paste can put a setting back to its default.
  const copiedTable = (rows, store) => readByField(rows, store, 'key')

  const pasteReaders = (rows) => Object.fromEntries(rows.map(({ key, read }) => [key, read]))

  const changedRows = (rows, draft, now) => rows.filter((row) => !sameValue(draft[row.name], now[row.name]))

  // A paste puts the pasted rows' values (`values`, by stored key, as the readers gave them) into the draft and leaves every other row as drafted.
  const withPasted = (rows, draft, values) => ({ ...draft, ...Object.fromEntries(rows.filter((row) => row.key in values).map((row) => [row.name, values[row.key]])) })

  // A value at its fallback removes its key, so a fallback that changes later reaches everyone who never chose another.
  function saveRow (store, row, value) {
    if (sameValue(value, row.fallback)) store.removeData(row.key)
    else if (row.envelope) row.envelope.save(store, row.key, value)
    else store.setData(row.key, value)
  }

  const saveTable = (store, rows, values) => rows.forEach((row) => saveRow(store, row, values[row.name]))
  /* eslint-enable no-unused-vars */
  // </lib:settings-table>

  const SETTING_ROWS = [{ name: 'color', key: DATA_KEY, fallback: DEFAULT_COLOR, read: (data) => savedHex(data) }]

  // Throws when storage cannot be read.
  const readSaved = (store) => readTable(SETTING_ROWS, store).color

  // Framework keeps its saved data in localStorage under `<Framework.LocalDataPrefix>_<name>` (`makeDataKey`), a color as
  // the plain string: the live checks in the `at document-start` block of `live/dark-page/dark-page.live.mjs` fail if SudokuPad changes either.
  const LOCAL_DATA_KEY = `svencodes_${DATA_KEY}`
  // The saved color read straight from storage, for when Framework does not exist yet. Throws when storage is blocked.
  const earlyColor = (storage) => savedHex(storage.getItem(LOCAL_DATA_KEY)) ?? null

  const READERS = pasteReaders(SETTING_ROWS)

  // The color in force, the default included, so a paste can put a page back to the default.
  const copiedSettings = (store) => JSON.stringify(copiedTable(SETTING_ROWS, store))

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

  const SAVED_HEX = /^#[0-9a-f]{6}$/i

  const savedHex = (value) => typeof value === 'string' && SAVED_HEX.test(value) ? value.toLowerCase() : undefined

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

  // WCAG's contrast ratio of two [r, g, b] colors, from 1 (the same) to 21 (black on white); the order does not matter.
  function contrastRatio (one, other) {
    const a = wcagLuminance(one) + 0.05
    const b = wcagLuminance(other) + 0.05
    return Math.max(a, b) / Math.min(a, b)
  }

  function textColorFor (background, light = LIGHT_TEXT, dark = DARK_TEXT) {
    const rgb = parseColor(background)
    if (!rgb) throw new RangeError(`color-math: ${background} is not a color`)
    return contrastRatio(rgb, parseColor(light)) >= contrastRatio(rgb, parseColor(dark)) ? light : dark
  }
  /* eslint-enable no-unused-vars */
  // </lib:color-math>

  // No SudokuPad variable is declared: its theme variables sit on `:root` and color the grid too. PAGE_COLOR_VAR is Dark Page's own.
  // `!important` outranks SudokuPad's rules, `.setting-darkmode`'s included. The board's own box
  // (`#svgrenderer`) takes `--body-bg`, what SudokuPad gives `body`: the puzzle has no background and
  // shows `body` through it, and the svg's box clips everything the puzzle draws, so no drawn pixel
  // lies on the page color. The replay readout is the `::after` of `.controls-input`, drawn on the
  // page. Svg-painted icons and color swatch fills keep their colors.
  function buildCss (pageColor) {
    const rule = (selector, ...declarations) => `${selector} { ${declarations.map((d) => `${d} !important`).join('; ')} }`
    const pageRule = (selectors, ...declarations) => rule(selectors.map((selector) => `${PAGE} ${selector}`).join(', '), ...declarations)
    const textColor = textColorFor(pageColor, PAGE_LIGHT_TEXT, PAGE_DARK_TEXT)
    const trayButtons = (state) => TRAY_PANELS.map((panel) => `${panel} ${TRAY_BUTTON}${state}`)
    // A tray button that is on (`aria-pressed`) keeps the tray's fill under its outline, as it does on a light page.
    const offTrayButton = ':not([aria-pressed="true"])'
    const scriptButtons = (state) => SCRIPT_BUTTONS.map((button) => `${button}${state}`)
    const darkRules = [
      pageRule([...BUTTON_GROUPS.map((group) => `${group} button:not(.selected):not(.selectedperm)`), ...trayButtons(offTrayButton), ...scriptButtons('')], `background-color: ${BUTTON_BG}`, `color: ${BUTTON_ACCENT}`, `border-color: ${BUTTON_BORDER}`),
      pageRule(BUTTON_GROUPS.flatMap((group) => [`${group} button.selected`, `${group} button.selectedperm`]), `border-color: ${BUTTON_ACCENT}`),
      // SudokuPad's keypad keeps its own fill under the softer border; the two script panels' white color buttons keep their own border.
      pageRule(['.controls-main:not(.tool-pen):not(.tool-textanywhere) .button-row button'], `border-color: ${BUTTON_BORDER}`),
      // SudokuPad's own focus shadow cannot be seen on BUTTON_BG.
      pageRule(BUTTON_GROUPS.map((group) => `${group} button:focus-visible`), `outline: 2px solid ${BUTTON_ACCENT}`, 'outline-offset: 2px'),
      pageRule([...BUTTON_GROUPS.map((group) => `${group} button:not(.selected):not(.selectedperm):hover`), ...trayButtons(`${offTrayButton}:hover`), ...scriptButtons(':hover')], `background-color: ${BUTTON_HOVER_BG}`),
      pageRule([...BUTTON_GROUPS.map((group) => `${group} button:not(.selected):not(.selectedperm):active`), ...trayButtons(`${offTrayButton}:active`), ...scriptButtons(':active')], `background-color: ${BUTTON_PRESS_BG}`),
      pageRule(['true', 'mixed'].flatMap((state) => trayButtons(`[aria-pressed="${state}"]`)), `outline-color: ${BUTTON_ACCENT}`),
      pageRule(TRAY_PANELS.map((panel) => `${panel} button[aria-pressed="true"]`), `background-color: ${TRAY_BG}`),
      pageRule(TRAYS, `background-color: ${TRAY_BG}`),
      pageRule(['.dialog-overlay'], `background-color: ${OVERLAY_BG}`),
      pageRule(['.controls-input::after'], `border-color: ${BUTTON_BORDER}`)
    ]
    return [
      rule(PAGE, `background-color: ${pageColor}`, `${PAGE_COLOR_VAR}: ${pageColor}`),
      pageRule([`#${BOARD_ID}`], 'background-color: var(--body-bg)'),
      pageRule(['.controls-footer', '.controls-footer a'], `color: ${textColor}`),
      pageRule(['.controls-input::after'], `color: ${textColor}`),
      // The buttons go dark on the shared light-text test, not on Dark Page's own text pair.
      ...(textColorFor(pageColor) === LIGHT_TEXT ? darkRules : [])
    ].join('\n')
  }

  // <lib:write-style>
  // Generated from lib/write-style.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
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
  // </lib:write-style>
  // <lib:settings-dialog>
  // Generated from lib/settings-dialog.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // A script that copies in panel as well has a second `global` naming SUDOKUPAD_PURPLE, which the linter calls a redeclaration.
  /* global readErrorLog, clearErrorLog, formatErrorLog, SUDOKUPAD_PURPLE, writeStyle, DIALOG_PURPLE */ // eslint-disable-line no-redeclare
  // The events that end a press. SudokuPad's pen tool takes its click from `mouseup` (seen live), and
  // a touch ends with `pointerup`, `touchend` and a compatibility `mouseup`, so all four are swallowed.
  const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'mouseup', 'touchend']
  const SETTINGS_GROUP = 'experimental'
  const TITLE_MUTED = '#777'
  const CONTROL_HOVER = '#f3e5f5'
  // The options row's rule, the buttons' face, ink and border, the Save button's border, and the title tools' hover.
  const DIALOG_RULE = '#e3dff0'
  const DIALOG_BUTTON_FACE = '#f1eff5'
  const DIALOG_BUTTON_INK = '#333'
  const DIALOG_BUTTON_BORDER = '#cfc9db'
  const DIALOG_SAVE_BORDER = '#5a3489'
  const DIALOG_TOOLS_HOVER = '#f0edf5'
  // 6.6:1 on the dialog's white, so an error reads apart from the muted gray of a plain message.
  const STATUS_ERROR_COLOR = '#b3261e'
  // SudokuPad pads each text part of a dialog 0 16px, which sets the content column's edges.
  const CONTENT_INSET = '16px'
  // An inset layer darkens whatever fill the control has.
  const PRESS_LAYER = 'box-shadow: inset 0 0 0 100vmax rgb(0 0 0 / .1)'
  const STATUS_ATTRIBUTE = 'data-role="settings-status"'
  const STATUS_SELECTOR = `[${STATUS_ATTRIBUTE}]`

  function setDialogStatus (dialog, message, { error = false } = {}) {
    const status = dialog.querySelector(STATUS_SELECTOR)
    status.textContent = message
    if (error) status.dataset.tone = 'error'
    else delete status.dataset.tone
  }

  // The next edit takes an error down, so it never stands beside choices made after it; a plain message stays.
  // An edit is a field's `input` (not `change`, which a field fires as it loses focus to Save), a press on one of the script's own buttons in the body (a swatch, a digit key), or Restore defaults.
  // A click elsewhere in the body, and an extra button that edits no field (Reset puzzle size), leave it up.
  function clearDialogError (dialog) {
    if (dialog.querySelector(STATUS_SELECTOR).dataset.tone === 'error') setDialogStatus(dialog, '')
  }
  // Every key is written back even when one throws, and only the first throw goes on; the rest are dropped. The stored values are
  // held by reference, so a script's save must replace a value and never edit one in place.
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

  const errorText = (error) => error?.message ?? String(error)

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

  // The SudokuPad internals this module calls, for a script to spread into the needs of the feature its settings entry and dialog run under.
  // `Framework.getApp` is not among them, so a SudokuPad without it still gets the entry.
  const SETTINGS_DIALOG_NEEDS = { 'Framework.addSetting': 'function', 'Framework.showDialog': 'function', 'Framework.closeDialog': 'function' }

  // SudokuPad's showDialog does nothing while its settings dialog is open, so that one closes first; `open` then runs after the close has settled.
  // The entry is added, and `open` runs, under `feature` (a guard feature), so a throw from either turns that feature off.
  function addSettingsEntry (framework, feature, { name, content, open }) {
    feature.run(() => framework.addSetting({
      tag: 'button',
      name,
      group: SETTINGS_GROUP,
      content,
      handler: () => {
        closeDialogKeepingGrid(framework)
        setTimeout(() => feature.run(open), 0)
      }
    }))
  }

  const COPY_PASTE_PICTURES = {
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4"/>'
  }
  const titleIconButton = (act, label, picture) =>
    `<button type="button" data-act="${act}" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${picture}</svg></button>`

  // As each script's @author header says.
  const AUTHOR = 'ChinStrap'

  // The title rules travel with the row, so they are in the page exactly while the dialog is.
  function renderDialogTitle ({ prefix, name, version }) {
    return `<style>${dialogTitleCss(prefix)}</style>` +
      `<div class="${prefix}title-row"><span><b>${name}</b> <small class="${prefix}version">v${version} by ${AUTHOR}</small></span>` +
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

  // One click handler for the four title-row buttons: Copy and Paste settings, and the error log's Copy and Clear. `copied`, `readers`, `upgrade`
  // and `apply` are the script's `copyPaste`; a paste writes under `snapshot`, in a dialog action of `feature`.
  function wireActs (root, { copied, readers, upgrade, apply, snapshot, feature }, win) {
    const say = (message, options) => setDialogStatus(root, message, options)
    const acts = {
      'copy-settings': {
        verb: 'copy',
        run: async () => {
          await win.navigator.clipboard.writeText(copied())
          say('Settings copied.')
        }
      },
      'paste-settings': {
        verb: 'paste',
        run: async () => {
          const { values, skipped } = pastedSettings(await win.navigator.clipboard.readText(), readers, upgrade)
          if (Object.keys(values).length > 0) feature.runInDialog(() => writeOrRestore(snapshot, () => apply(values)))
          say(pasteReport(Object.keys(values).length, skipped))
        }
      },
      'copy-error-log': {
        verb: 'copy the error log',
        run: async () => {
          const log = readErrorLog(win.localStorage)
          if (log.length === 0) {
            say(formatErrorLog(log))
            return
          }
          await win.navigator.clipboard.writeText(formatErrorLog(log))
          say('Error log copied.')
        }
      },
      'clear-error-log': {
        verb: 'clear the error log',
        run: async () => {
          // A log that cannot be read is the one Clear is there for, so it is cleared all the same, and said to be.
          let wasEmpty = false
          try { wasEmpty = readErrorLog(win.localStorage).length === 0 } catch {}
          clearErrorLog(win.localStorage)
          say(wasEmpty ? 'The error log was already empty.' : 'Error log cleared.')
        }
      }
    }
    root.addEventListener('click', async (event) => {
      const act = event.target.closest('button[data-act]')?.dataset.act
      if (!Object.hasOwn(acts, act)) return
      event.preventDefault()
      event.stopPropagation()
      try {
        await acts[act].run()
      } catch (error) {
        say(`Could not ${acts[act].verb}: ${errorText(error)}`, { error: true })
      }
    })
  }

  function dialogTitleCss (prefix) {
    const tools = `.${prefix}tools`
    return [
      `.${prefix}version { opacity: .6; }`,
      `.${prefix}title-row { display: flex; align-items: center; gap: 12px; }`,
      `${tools} { display: flex; align-items: center; gap: 4px; }`,
      `.${prefix}off-note { margin: 6px 0; font-size: .85rem; color: ${TITLE_MUTED}; }`,
      `.${prefix}off-note:empty { display: none; }`,
      // SudokuPad styles a dialog's buttons by tag, so each of these is forced.
      `${tools} button { ${BARE_BUTTON} padding: 4px !important; line-height: 0 !important; color: ${TITLE_MUTED} !important; border-radius: 6px !important; }`,
      `${tools} button:hover { background: ${DIALOG_TOOLS_HOVER} !important; }`,
      `${tools} button:focus-visible { outline: 2px solid ${SUDOKUPAD_PURPLE} !important; outline-offset: 0; }`,
      `${tools} svg { width: 20px; height: 20px; }`,
      `${tools} svg * { fill: none !important; }`,
      // A flex item with no intrinsic width: a long message wraps in the room the title leaves and never widens the dialog.
      `.${prefix}title-row ${STATUS_SELECTOR} { flex: 1 1 0; min-width: 0; contain: inline-size; text-align: right; font-size: .8rem; color: ${TITLE_MUTED}; }`,
      `.${prefix}title-row ${STATUS_SELECTOR}[data-tone="error"] { color: ${STATUS_ERROR_COLOR}; font-weight: 600; }`
    ].join('\n')
  }

  // Scoped by the body's id, so SudokuPad's other dialogs are left alone. SudokuPad styles a dialog's buttons by tag, so each of those is forced.
  function dialogShellCss (bodyId) {
    const dialog = `.dialog:has(#${bodyId})`
    const row = `${dialog} .dialog-options`
    return [
      // Inherited by every checkbox, slider and other form control in the dialog, in place of the browser's blue.
      `${dialog} { accent-color: ${SUDOKUPAD_PURPLE}; }`,
      // The row sits on the text parts' box, so their side padding as its margin puts its edges, the top line's included, on the content column's.
      `${row} { display: flex !important; flex-direction: row !important; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; border-top: 1px solid ${DIALOG_RULE}; margin: 8px ${CONTENT_INSET} 0; padding: 14px 0 2px; box-sizing: border-box; }`,
      `${row} button { background: ${DIALOG_BUTTON_FACE} !important; color: ${DIALOG_BUTTON_INK} !important; border: 1px solid ${DIALOG_BUTTON_BORDER} !important; border-radius: 8px !important; font-size: 1rem !important; padding: 0 22px !important; height: 38px !important; line-height: 36px !important; margin: 0 !important; width: auto !important; min-width: 0 !important; flex: none; cursor: pointer; }`,
      `${row} button[data-role="save"] { background: ${DIALOG_PURPLE} !important; color: #fff !important; border: 1px solid ${DIALOG_SAVE_BORDER} !important; font-weight: 600; }`,
      `${row} button:hover { background: ${CONTROL_HOVER} !important; }`,
      `${row} button[data-role="save"]:hover { background: ${CONTROL_HOVER} !important; color: ${DIALOG_PURPLE} !important; }`,
      `${row} button:active { ${PRESS_LAYER} !important; }`,
      `${row} button:focus-visible { outline: 2px solid ${SUDOKUPAD_PURPLE}; outline-offset: 2px; }`
    ].join('\n')
  }

  const SAVE_LABEL = 'Save'
  const CANCEL_LABEL = 'Cancel'
  const RESTORE_LABEL = 'Restore defaults'

  const OFF_NOTE_ATTRIBUTE = 'data-role="off-note"'

  // A script whose dialog can turn a feature off while it is open calls this again after the change.
  function setOffNote (dialog, off) {
    dialog.querySelector(`[${OFF_NOTE_ATTRIBUTE}]`).textContent = off.length > 0 ? `Off because SudokuPad changed: ${off.join(', ')}` : ''
  }

  // Escape needs no handler here: SudokuPad's own dialog closes on it.
  // Returns the body container for the script to fill and wire, or null when SudokuPad showed no dialog (it ignores showDialog while another dialog is open).
  function showSettingsDialog (framework, { prefix, name, version, bodyId, styleId, css, centerOverBoard = true, off, changed, save, snapshot, feature, copyPaste, restore, extraButtons = [] }, { doc = document, win = window } = {}) {
    if (typeof snapshot !== 'function') throw new Error(`${name}: a settings dialog needs a snapshot`)
    if (!Array.isArray(off)) throw new Error(`${name}: a settings dialog needs the guard's off list`)
    writeStyle(`settings-dialog-shell-${bodyId}`, dialogShellCss(bodyId), doc)
    if (css) writeStyle(styleId, css, doc)
    const close = () => closeDialogKeepingGrid(framework, win)
    // After a failed save the script's `changed()` may already read false, so a retry saves again whatever it says.
    let failed = false
    const saveAndClose = () => {
      try {
        if (failed || changed()) feature.runInDialog(() => writeOrRestore(snapshot, save))
      } catch (error) {
        failed = true
        // The dialog stays open so the failure is read and the choices are kept.
        setDialogStatus(doc.getElementById(bodyId).closest('.dialog'), `Not saved: ${errorText(error)}`, { error: true })
        return
      }
      close()
    }
    const clearError = () => clearDialogError(doc.getElementById(bodyId).closest('.dialog'))
    const buttons = [
      { content: SAVE_LABEL, role: 'save', handler: saveAndClose },
      { content: CANCEL_LABEL, role: 'cancel', handler: close },
      // Restore defaults edits the draft, so it clears an error first. An extra button edits no field (Reset puzzle size) and leaves it.
      ...(restore ? [{ content: RESTORE_LABEL, role: 'restore', handler: () => { clearError(); restore() } }] : []),
      ...extraButtons
    ]
    framework.showDialog({
      centerOverBoard,
      parts: [
        { tag: 'text', innerHTML: renderDialogTitle({ prefix, name, version }) },
        { tag: 'text', innerHTML: `<div class="${prefix}off-note" ${OFF_NOTE_ATTRIBUTE}></div>` },
        { tag: 'text', innerHTML: `<div id="${bodyId}"></div>` },
        { tag: 'options', options: buttons.map(({ content, handler }) => ({ tag: 'button', content, handler })) },
        // Below the footer, so the script's own layout still runs down to the footer line.
        { tag: 'text', innerHTML: renderErrorLogRow(prefix) }
      ]
    })
    const body = doc.getElementById(bodyId)
    if (!body) return null
    const dialog = body.closest('.dialog')
    setOffNote(dialog, off)
    // A press on a button as well as a field's input, since some scripts' controls are buttons (a swatch, a digit key).
    const clearOnEdit = (event) => { if (event.type !== 'click' || event.target?.closest?.('button')) clearError() }
    for (const type of ['input', 'click']) body.addEventListener(type, clearOnEdit)
    wireActs(dialog, { ...copyPaste, snapshot, feature }, win)
    // No selector tells the buttons apart but their text, so the shell marks each with its role for the script's stylesheet.
    const row = dialog?.querySelector('.dialog-options')
    if (row) row.querySelectorAll('button').forEach((button, index) => { button.dataset.role = buttons[index].role })
    return body
  }
  /* eslint-enable no-unused-vars */
  // </lib:settings-dialog>
  // <lib:sudokupad>
  // Generated from lib/sudokupad.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  /* global Framework */
  const NOTICE_HOST_ID = 'sudokupad-scripts-notices'
  // SudokuPad's own button purple, as its icons draw it: the one purple of every script's bar, panel and focus ring.
  const SUDOKUPAD_PURPLE = '#6a1b9a'
  const REPORT_URL = 'https://github.com/chinstrap45/sudokupad-scripts/issues/new'
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

  // Throws when the storage is blocked, so a caller never reports a clear that did not happen.
  function clearErrorLog (storage) {
    storage.removeItem(ERROR_LOG_KEY)
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

  // SudokuPad loads some features (`Framework.features.largepuzzle`) as separate files, which may arrive after `Framework.getApp` resolves.
  const LATE_WAIT_MS = 5000
  const LATE_POLL_MS = 50

  // `features` maps a name to `{ label, needs, onSkip, late }`: `label` is what the bar and the console call it, `needs` maps each
  // internal's path to its kind (a key of INTERNAL_KINDS), `onSkip` undoes what the feature left on the page, and `late` makes `start`
  // wait up to LATE_WAIT_MS for its internals before the probe. `probe` runs once SudokuPad's app exists; `store`, SudokuPad's
  // Framework unless given, holds a dismissal under `<script>-notice`.
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
      text.textContent = `${name}: ${shown.map((reason) => reason.label).join(', ')} ${shown.length === 1 ? 'is' : 'are'} off because SudokuPad changed.`
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
        // The handler as a function that runs under `run`, for an event listener or a callback.
        bind (handler, fallback) {
          return (...args) => feature.run(() => handler(...args), fallback)
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

    function probe ({ roots, store = Framework, doc = document }) {
      sudokupad = sudokupadVersion(doc)
      lackingInternals(features, roots).forEach((names, missing) => {
        names.forEach((featureName) => guarded[featureName].skip(missing, false))
        console.warn(`${script}: ${names.map((featureName) => features[featureName].label).join(', ')} skipped because SudokuPad has no ${missing}`)
      })
      page = { store, doc, sudokupad }
      showNotice()
    }

    // A failure outside every feature turns off this one, named for the script, instead of an unhandled rejection naming nothing.
    const startup = createFeature('startup', { label: 'startup' })
    const startupFailed = (error) => startup.skip(error)
    // `fn` as a function whose throw, or the rejection of the promise it returns, is reported as the startup's. A throw is reported at once.
    const catchStartup = (fn) => (...args) => {
      try {
        return Promise.resolve(fn(...args)).catch(startupFailed)
      } catch (error) {
        startupFailed(error)
        return Promise.resolve()
      }
    }

    // Runs `begin` with SudokuPad's app once `Framework.getApp` resolves, after the probe and after any `late` feature's internals have
    // arrived or LATE_WAIT_MS has passed; with no getApp, at once and with no app, so the features that need one are off and the rest start. `roots` gives the probe's roots beyond Framework and the app, read at that time.
    function start (begin, { roots = () => ({}) } = {}) {
      const allRoots = (app) => ({ Framework, app, ...roots() })
      const lateFeatures = Object.fromEntries(Object.entries(features).filter(([, { late }]) => late))
      const lateLacking = (app) => lackingInternals(lateFeatures, allRoots(app)).size > 0
      // Polls on a timer: SudokuPad announces no event when a feature file has loaded.
      async function untilLateInternals (app) {
        for (let waited = 0; lateLacking(app) && waited < LATE_WAIT_MS; waited += LATE_POLL_MS) {
          await new Promise((resolve) => setTimeout(resolve, LATE_POLL_MS))
        }
      }
      const runAfter = (waitForLate) => catchStartup((app) => {
        const begun = () => {
          probe({ roots: allRoots(app) })
          return begin(app)
        }
        return waitForLate && lateLacking(app) ? untilLateInternals(app).then(begun) : begun()
      })
      return typeof Framework.getApp === 'function' ? Framework.getApp().then(runAfter(true), startupFailed) : runAfter(false)(undefined)
    }

    // A feature's saved data in SudokuPad. A read with the feature off is null, as for a key with nothing saved, and a write is dropped.
    // A write or read that throws turns the feature off and its caller goes on, except in a dialog action, where it throws on (`runInDialog`). A
    // write the browser refuses (a full localStorage) is the browser's doing: it is told to the user and leaves the feature on, so it saves
    // again once space frees. `keep`, the copy of an unreadable value, turns the feature off on any throw, a refusal included, so nothing
    // can save over the original.
    function storeFor (feature) {
      const throwMarked = (error) => {
        if (Object(error) === error) storeFailures.add(error)
        throw error
      }
      const write = (fn) => {
        if (feature.off) return
        try {
          fn()
        } catch (error) {
          if (dialogActions > 0) throwMarked(error)
          if (!isRefusedWrite(error)) return feature.skip(error)
          console.warn(`${script}: ${feature.label} could not save, the browser refused the write:`, error)
          tell(`${name}: the browser has no room left, so ${feature.label} could not be saved.`)
        }
      }
      // In a dialog action a read that throws goes on to the caller, as a write does, so Copy says why it could not read.
      const read = (key) => {
        if (feature.off) return null
        try {
          return Framework.getData(key)
        } catch (error) {
          throwMarked(error)
        }
      }
      return {
        getData: (key) => (dialogActions > 0 ? read(key) : feature.run(() => Framework.getData(key), () => null)),
        setData: (key, value) => write(() => Framework.setData(key, value)),
        removeData: (key) => write(() => Framework.removeData(key)),
        keep: (key, value) => feature.run(() => Framework.setData(key, value))
      }
    }

    const dialogsFor = (feature) => ({
      addSetting: (setting) => Framework.addSetting(setting),
      showDialog: (options) => Framework.showDialog(options),
      closeDialog: () => feature.run(() => Framework.closeDialog())
    })

    return { features: guarded, get off () { return reasons.map((reason) => reason.label) }, probe, start, catchStartup, storeFor, dialogsFor }
  }

  // Which Undo SudokuPad gives to a Restart. Its Undo on an empty undo stack loads the board kept from before the last Restart,
  // `app.preRestartSavedProgress`, which it keeps only when something was entered (docs/research/sudokupad-custom-tool.md § Saving the notes).
  // A script may act in its own 'restarted' handler, so the stack the Restart leaves is read once every handler has run, and an Undo that finds
  // no more than that on it is the Restart's. A reset or a load starts the count again. `wrap` is the caller's guard for the listeners.
  function trackRestartUndo (app, wrap) {
    let restartLength = 0
    const atRestart = () => app.puzzle.undoStack.length <= restartLength
    // SudokuPad triggers `act` after the action, so what the stack was before an Undo is read off the event before it.
    let wasAtRestart = false
    const read = () => { wasAtRestart = atRestart() }
    const callbacks = []
    app.on('restarted', wrap(() => queueMicrotask(() => { restartLength = app.puzzle.undoStack.length; read() })))
    const forgetRestart = wrap(() => { restartLength = 0; read() })
    for (const event of ['reset', 'progressloaded']) app.puzzle.on(event, forgetRestart)
    app.puzzle.on('act', wrap((_, action) => {
      const was = wasAtRestart
      read()
      if (action?.type === 'undo' && was) callbacks.forEach((fn) => fn())
    }))
    return {
      loadsBoard: () => atRestart() && app.preRestartSavedProgress !== undefined,
      // `fn` runs after the Undo that found the stack where the Restart left it, whether or not that Undo loaded a board.
      onRestartUndo: (fn) => { callbacks.push(fn) }
    }
  }
  /* eslint-enable no-unused-vars */
  // </lib:sudokupad>
  const FEATURES = {
    savedPageColor: { label: 'saved color', needs: { 'Framework.getData': 'function' } },
    settings: {
      label: 'settings',
      needs: {
        ...SETTINGS_DIALOG_NEEDS,
        'Framework.setData': 'function',
        'Framework.removeData': 'function'
      }
    }
  }
  const guard = createGuard({ script: SCRIPT_ID, name: SCRIPT_NAME, version: VERSION, features: FEATURES })
  const { savedPageColor, settings: settingsEntry } = guard.features

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, READERS, DATA_KEY, copiedSettings, pastedSettings, DEFAULT_COLOR, readSaved, earlyColor, LOCAL_DATA_KEY, buildCss, PAGE, BOARD_ID, STYLE_ID, PAGE_COLOR_VAR, PEN_TOOL_EXTRAS_TRAY_CLASS, TEXT_ANYWHERE_TRAY_CLASS, RULES_FONT_BAR_ID, lackingInternals, FEATURES }
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

  // Save and Copy go through the store of the feature that reads the color at startup (lib/settings-dialog.js).
  const savedColorStore = guard.storeFor(savedPageColor)

  function saveColor (color) {
    saveTable(savedColorStore, SETTING_ROWS, { color })
    pageColor = color
    style.textContent = buildCss(pageColor)
  }

  const DIALOG_ID = `${CLASS_PREFIX}dialog`
  const DIALOG_STYLE_ID = `${DIALOG_ID}-style`
  const INPUT_ID = `${CLASS_PREFIX}input`
  const SWATCH_ID = `${CLASS_PREFIX}swatch`
  // SudokuPad's overlay covers the page while the dialog is open, so the swatch shows the picked color: the page around a white square for the board.
  const DIALOG_CSS = [
    `.${CLASS_PREFIX}color-row { display: flex; align-items: center; gap: 12px; margin: 6px 0; }`,
    `#${SWATCH_ID} { display: flex; align-items: center; justify-content: center; height: 64px; margin: 6px 0; border: 1px solid ${DIALOG_BUTTON_BORDER}; border-radius: 8px; }`,
    `#${SWATCH_ID}::after { content: ""; width: 32px; height: 32px; background: #fff; }`
  ].join('\n')
  const dialogs = guard.dialogsFor(settingsEntry)
  // `pageColor` is set only after the write, so the stored color is all a failed Save or Paste can leave changed.
  const snapshotSave = () => snapshotStore(savedColorStore, tableKeys(SETTING_ROWS))

  function openDialog () {
    let picked = pageColor
    const body = showSettingsDialog(dialogs, {
      prefix: CLASS_PREFIX,
      name: SCRIPT_NAME,
      version: VERSION,
      off: guard.off,
      bodyId: DIALOG_ID,
      styleId: DIALOG_STYLE_ID,
      css: DIALOG_CSS,
      changed: () => picked !== pageColor,
      snapshot: snapshotSave,
      feature: settingsEntry,
      save: () => saveColor(picked),
      copyPaste: {
        copied: () => savedPageColor.runInDialog(() => copiedSettings(savedColorStore)),
        readers: READERS,
        // The draft takes the paste only once it is saved, so a paste that failed leaves the dialog showing what it showed.
        apply: (values) => {
          if (!(DATA_KEY in values)) return
          saveColor(values[DATA_KEY])
          show(pageColor)
        }
      },
      restore: () => show(DEFAULT_COLOR)
    })
    if (!body) return
    body.innerHTML = `<label class="${CLASS_PREFIX}color-row">Page color <input type="color" id="${INPUT_ID}" value="${picked}"></label><div id="${SWATCH_ID}" style="background-color: ${picked}"></div>`
    const input = document.getElementById(INPUT_ID)
    const swatch = document.getElementById(SWATCH_ID)
    const preview = () => {
      swatch.style.backgroundColor = picked
      style.textContent = buildCss(picked)
    }
    const show = (color) => {
      picked = color
      input.value = color
      preview()
    }
    // However the dialog closes (Save, Cancel, Escape), the page goes back to the saved color; a Save has already made it the saved one.
    const closed = new window.MutationObserver(() => {
      if (body.isConnected) return
      closed.disconnect()
      style.textContent = buildCss(pageColor)
    })
    closed.observe(document.body, { childList: true, subtree: true })
    // `input` fires while the picker moves.
    input.addEventListener('input', () => { picked = input.value.toLowerCase(); preview() })
  }

  // At DOMContentLoaded Framework exists (before the app is ready). What it reads is the saved color, and the early
  // read is corrected to it, "nothing saved" included; a read that fails keeps the color already painted.
  function start () {
    // The match also covers other crackingthecryptic.com pages, which have no Framework and keep the default color.
    if (typeof Framework === 'undefined') return
    guard.probe({ roots: { Framework } })
    const saved = savedPageColor.run(() => readSaved(Framework), () => pageColor)
    if (saved !== pageColor) {
      pageColor = saved
      style.textContent = buildCss(pageColor)
    }
    // The entry waits for the app, as every other script's does; with no getApp it goes in now, as theirs do.
    const addEntry = () => addSettingsEntry(dialogs, settingsEntry, { name: 'darkpage', content: SCRIPT_NAME, open: openDialog })
    if (typeof Framework.getApp !== 'function') return addEntry()
    return Framework.getApp().then(addEntry)
  }
  const startPage = guard.catchStartup(start)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startPage)
  else startPage()
})()
