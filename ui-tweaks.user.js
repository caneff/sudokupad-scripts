// ==UserScript==
// @name         SudokuPad UI Tweaks
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.1.48
// @author       ChinStrap
// @description  Small changes to SudokuPad's buttons, each chosen in a settings dialog: Tab never switches to letters, hide the Select button, wrap the bottom row of buttons after five, and make the digit buttons smaller or larger, and pan the board on a right-drag only when it is zoomed in.
// @homepageURL  https://chinstrap45.github.io/sudokupad-scripts/
// @supportURL   https://github.com/chinstrap45/sudokupad-scripts/issues
// @license      MIT
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/ui-tweaks.user.js
// @downloadURL  https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/ui-tweaks.user.js
// ==/UserScript==

/* global ToolLetter */

(function () {
  'use strict'

  // GM_info is absent without Tampermonkey, so the script cannot read @version; keep this equal to it.
  const VERSION = '0.1.48'
  // The script's id, which its notices, error log and palette warnings carry. sync-lib.js reads it from this line as written.
  const SCRIPT_ID = 'ui-tweaks'
  const SCRIPT_NAME = 'UI Tweaks'
  // Every class and id the script makes starts with this.
  const CLASS_PREFIX = 'ui-tweaks-'
  const STYLE_ID = `${CLASS_PREFIX}style`
  // Each option's saved boolean is kept under its own key, which is also its name in Copy settings.
  const OPTIONS = [
    { id: 'tab', key: 'UiTweaks_tab', label: 'Tab never switches to letters', hint: 'The letter button and the / key still switch.', default: true },
    { id: 'hideSelect', key: 'UiTweaks_hideSelect', label: 'Hide the Select button', hint: 'The other buttons in the row close up.', default: false },
    { id: 'wrapButtons', key: 'UiTweaks_wrapButtons', label: 'Wrap buttons', hint: 'The bottom row of tool buttons wraps onto a second line after five. It has no effect with Color by Digit installed, which already wraps it.', default: false },
    { id: 'rightDrag', key: 'UiTweaks_rightDrag', label: 'Right-drag pans only when zoomed in', hint: 'With SudokuPad\'s Test Large Puzzle UI on, a right-drag pans the board only after you zoom in, and zooming back out centres it again.', default: true }
  ]
  // The digit pad's step, saved under its own key as the percent of SudokuPad's own size its rule uses.
  const DIGIT_PAD = 'digitPad'
  const DIGIT_PAD_STEPS = [{ label: 'Smaller', percent: 80 }, { label: 'Normal', percent: 100 }, { label: 'Larger', percent: 125 }, { label: 'Largest', percent: 150 }]
  const DIGIT_PAD_SIZES = DIGIT_PAD_STEPS.map((step) => step.percent)
  const DIGIT_PAD_DEFAULT = 100
  const DIGIT_PAD_KEY = 'UiTweaks_digitPad'
  // The eight percentages an earlier build offered; a saved one reads as the nearest step, a tie going to the one nearer Normal.
  const OLD_DIGIT_PAD_PERCENTS = [80, 90, 100, 110, 120, 130, 140, 150]
  const nearestStep = (percent) => DIGIT_PAD_SIZES.reduce((best, size) => {
    const [gap, bestGap] = [Math.abs(size - percent), Math.abs(best - percent)]
    return gap < bestGap || (gap === bestGap && Math.abs(size - DIGIT_PAD_DEFAULT) < Math.abs(best - DIGIT_PAD_DEFAULT)) ? size : best
  })
  const savedDigitPad = (data) => (DIGIT_PAD_SIZES.includes(data) || OLD_DIGIT_PAD_PERCENTS.includes(data) ? nearestStep(data) : undefined)

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

  const OPTION_ROWS = [
    ...OPTIONS.map((option) => ({ name: option.id, key: option.key, fallback: option.default, read: savedBoolean })),
    { name: DIGIT_PAD, key: DIGIT_PAD_KEY, fallback: DIGIT_PAD_DEFAULT, read: savedDigitPad }
  ]
  const DEFAULT_OPTIONS = tableDefaults(OPTION_ROWS)

  const readOptions = (store) => readTable(OPTION_ROWS, store)

  // An option at its default leaves no key, so a default that changes later reaches everyone who never chose another.
  const saveOptions = (store, options) => saveTable(store, OPTION_ROWS, options)

  const READERS = pasteReaders(OPTION_ROWS)

  const copiedSettings = (store) => JSON.stringify(copiedTable(OPTION_ROWS, store))

  // What a paste leaves in force: the options now saved, with only the pasted ones changed, so a box ticked in the dialog and not saved is not saved by it.
  const pastedOptions = (current, values) => withPasted(OPTION_ROWS, current, values)

  // <lib:bottom-row>
  // Generated from lib/bottom-row.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  const BOTTOM_ROW = '.controls-aux'
  // SudokuPad's own rules make this row wrap and size its buttons in rem under a scale transform, so a cap in rem holds five a row at every window size, whichever script added which button. !important because an inline max-width on the row beats a stylesheet cap.
  const BOTTOM_ROW_CSS = `${BOTTOM_ROW} { max-width: 21.6rem !important; }`
  /* eslint-enable no-unused-vars */
  // </lib:bottom-row>
  const TOGGLE_KEY = '/'
  const TAB_KEY = 'Tab'

  // SudokuPad's toggle handler also stops Tab's default, so focus stays on the puzzle; keep that.
  function ignoreKey (event) {
    event.preventDefault()
  }

  // The Tab entry is found by sharing the "/" entry's handler, the letter toggle.
  function withInertTab (handlers, inert) {
    if (!Array.isArray(handlers)) return null
    const toggle = handlers.find((entry) => entry.key === TOGGLE_KEY)
    if (!toggle) return null
    const isTabToggle = (entry) => entry.key === TAB_KEY && entry.handler === toggle.handler
    if (!handlers.some(isTabToggle)) return null
    return handlers.map((entry) => (isTabToggle(entry) ? { ...entry, handler: inert } : entry))
  }

  // SudokuPad's keydown handler returns early on an auto-repeat, so the swapped Tab entry never sees a held Tab. A repeated Tab is stopped
  // here instead, so a dialog keeps its normal Tab.
  function isHeldTabToStop (event, { toolOn, dialogOpen }) {
    return event.key === TAB_KEY && event.repeat === true && toolOn && !dialogOpen
  }
  // SudokuPad sizes every controls button 4rem square and the digit font 2rem (1.4rem in the corner and centre tools), and refits #controls to its box on each resize, so a size in rem is refitted with the rest of the column.
  const DIGIT_BUTTON_REM = 4
  const DIGIT_FONT_REM = 2
  const DELETE_EXTRA_REM = 0.3
  const DIGIT_FONT_SMALL_REM = 1.4
  function digitPadCss (percent) {
    if (percent === DIGIT_PAD_DEFAULT) return false
    const scaled = (value) => rem(value * percent / 100)
    const side = `${scaled(DIGIT_BUTTON_REM)}rem`
    const deleteWidth = `${rem(2 * scaled(DIGIT_BUTTON_REM) + DELETE_EXTRA_REM)}rem`
    return [
      // SudokuPad puts the pen line-mode box at 13rem, over the Delete row of 4rem rows: three rows and a 1rem gap.
      `.penlinemode { top: ${rem(3 * scaled(DIGIT_BUTTON_REM) + 1)}rem !important; height: ${side} !important; }`,
      `.controls-input button.digit { flex: 0 0 ${side} !important; width: ${side} !important; height: ${side} !important; font-size: ${scaled(DIGIT_FONT_REM)}rem !important; }`,
      // SudokuPad's own 8.3rem: two digit columns of 4rem and their 0.3rem of margin, less the Delete key's own margin.
      `.controls-input button[data-control="delete"] { flex: 0 0 ${deleteWidth} !important; width: ${deleteWidth} !important; height: ${side} !important; }`,
      `.tool-corner .controls-input button.digit, .tool-centre .controls-input button.digit { font-size: ${scaled(DIGIT_FONT_SMALL_REM)}rem !important; }`
    ].join('\n')
  }
  const HIDE_SELECT_CSS = `${BOTTOM_ROW} [data-control="select"] { display: none !important; }`

  // Tab adds no rule: it works on the letter tool's key list.
  function buildCss (options) {
    return [options.hideSelect && HIDE_SELECT_CSS, options.wrapButtons && BOTTOM_ROW_CSS, digitPadCss(options[DIGIT_PAD])].filter(Boolean).join('\n')
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

  // `features` maps a name to `{ label, needs, onSkip }`: `label` is what the bar and the console call it, `needs` maps each internal's
  // path to its kind (a key of INTERNAL_KINDS), and `onSkip` undoes what the feature left on the page. `probe` runs once SudokuPad's app
  // exists; `store`, SudokuPad's Framework unless given, holds a dismissal under `<script>-notice`.
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

    // Runs `begin` with SudokuPad's app once `Framework.getApp` resolves, after the probe; with no getApp, at once and with no app, so the
    // features that need one are off and the rest start. `roots` gives the probe's roots beyond Framework and the app, read at that time.
    function start (begin, { roots = () => ({}) } = {}) {
      const run = catchStartup((app) => {
        probe({ roots: { Framework, app, ...roots() } })
        return begin(app)
      })
      return typeof Framework.getApp === 'function' ? Framework.getApp().then(run, startupFailed) : run(undefined)
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
  // SudokuPad's Large Puzzle UI pans on a right-drag at every zoom, because its size guard compares with a limit that is never reached
  // (docs/research/large-puzzle-ui-right-drag.md). The feature binds its handlers as properties of itself and reads them off `this` each time
  // it adds or removes one, so a wrapper put there before any pan starts is the one both calls see. Wrapping `handleMousemove` rather than
  // listening on `window` leaves `mousedown` and `mouseup` alone, so a right click still reaches the scripts, and stops nothing on its way:
  // at zoom 1 the move simply goes unpanned. `isOn` is read at each call, so the wrapper stays in place when the option is turned off.
  const wrappedLargePuzzles = new WeakSet()
  function limitRightDrag (feature, isOn) {
    if (wrappedLargePuzzles.has(feature)) return
    wrappedLargePuzzles.add(feature)
    const { handleMousemove, handleZoomInOut } = feature
    const limiting = () => isOn() && feature.zoomLevel <= 1
    feature.handleMousemove = function (...args) {
      if (!limiting()) return handleMousemove.apply(this, args)
    }
    // A zoom back to 1 puts the board at the centre, so a pan made while zoomed in never stays at zoom 1.
    feature.handleZoomInOut = function (...args) {
      const result = handleZoomInOut.apply(this, args)
      if (limiting()) {
        feature.panPos = [0, 0]
        feature.updateTransform()
      }
      return result
    }
  }

  const FEATURES = {
    saved: { label: 'saved options', needs: { 'Framework.getData': 'function' } },
    tab: { label: 'Tab key', needs: { 'Framework.getApp': 'function', 'ToolLetter.tool.keyHandlers': 'array', 'Framework.app.tools': 'object' } },
    rightDrag: {
      label: 'right-drag limit',
      needs: {
        'Framework.features.largepuzzle.handleMousemove': 'function',
        'Framework.features.largepuzzle.handleZoomInOut': 'function',
        'Framework.features.largepuzzle.updateTransform': 'function'
      }
    },
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
  const { saved, tab, rightDrag, settings: settingsEntry } = guard.features

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, OPTIONS, DIGIT_PAD_STEPS, DEFAULT_OPTIONS, readOptions, saveOptions, pastedOptions, READERS, copiedSettings, pastedSettings, buildCss, withInertTab, ignoreKey, isHeldTabToStop, lackingInternals, FEATURES, limitRightDrag }
  }
  if (typeof document === 'undefined') return

  // The match also covers other crackingthecryptic.com pages, which have no Framework.
  if (typeof Framework === 'undefined') return

  let options = DEFAULT_OPTIONS
  // The letter tool and its key list as they were before the Tab option swapped the list; null while the option is off.
  let swapped = null

  function applyTab (on) {
    tab.run(() => {
      if (!on) {
        if (swapped) swapped.tool.keyHandlers = swapped.original
        swapped = null
        return
      }
      if (swapped) return
      const tool = ToolLetter.tool
      const changed = withInertTab(tool.keyHandlers, ignoreKey)
      if (!changed) throw new Error('the letter tool has no Tab binding to the toggle')
      swapped = { tool, original: tool.keyHandlers }
      tool.keyHandlers = changed
    })
  }

  const applyRightDrag = () => rightDrag.run(() => limitRightDrag(Framework.features.largepuzzle, () => options.rightDrag))

  function applyOptions (next) {
    const padChanged = next[DIGIT_PAD] !== options[DIGIT_PAD]
    options = next
    writeStyle(STYLE_ID, buildCss(next))
    applyTab(next.tab)
    if (padChanged) window.dispatchEvent(new Event('resize'))
  }

  const DIALOG_ID = `${CLASS_PREFIX}dialog`
  const DIALOG_STYLE_ID = `${DIALOG_ID}-style`
  // SudokuPad styles a dialog's labels and inputs by tag, so these are forced.
  const DIALOG_CSS = [
    `#${DIALOG_ID} .${CLASS_PREFIX}option { display: flex !important; align-items: flex-start; gap: 10px; margin: 10px 0; cursor: pointer; }`,
    `#${DIALOG_ID} .${CLASS_PREFIX}option input { position: static !important; margin: 3px 0 0 !important; flex: none; width: 18px !important; height: 18px !important; cursor: pointer; }`,
    `#${DIALOG_ID} .${CLASS_PREFIX}option select { position: static !important; margin: 0 !important; flex: none; width: auto !important; height: auto !important; cursor: pointer; }`,
    `#${DIALOG_ID} .${CLASS_PREFIX}option small { display: block; opacity: .65; }`
  ].join('\n')
  const dialogs = guard.dialogsFor(settingsEntry)
  // Save and Copy go through the store of the feature that reads the options at startup (lib/settings-dialog.js).
  const savedOptionsStore = guard.storeFor(saved)
  const snapshotSave = () => snapshotStore(savedOptionsStore, tableKeys(OPTION_ROWS), () => {
    const was = options
    return () => applyOptions(was)
  })

  const optionRow = (option) =>
    `<label class="${CLASS_PREFIX}option"><input type="checkbox" data-option="${option.id}"><span>${option.label}<small>${option.hint}</small></span></label>`

  // SudokuPad fits #controls to its box only on a resize, so a size change is not seen until one.
  const DIGIT_PAD_ROW = `<label class="${CLASS_PREFIX}option"><select data-option="${DIGIT_PAD}">${DIGIT_PAD_STEPS.map((step) => `<option value="${step.percent}">${step.label}</option>`).join('')}</select><span>Digit pad size<small>Smaller or larger digit buttons. SudokuPad fits the whole controls column to the window, so the digits grow most on a large screen, and on a laptop the other buttons shrink to make room.</small></span></label>`

  function openDialog () {
    const draft = { ...options }
    const body = showSettingsDialog(dialogs, {
      prefix: CLASS_PREFIX,
      name: SCRIPT_NAME,
      version: VERSION,
      off: guard.off,
      bodyId: DIALOG_ID,
      styleId: DIALOG_STYLE_ID,
      css: DIALOG_CSS,
      changed: () => changedRows(OPTION_ROWS, draft, options).length > 0,
      snapshot: snapshotSave,
      feature: settingsEntry,
      save: () => {
        saveOptions(savedOptionsStore, draft)
        applyOptions({ ...draft })
      },
      copyPaste: {
        copied: () => saved.runInDialog(() => copiedSettings(savedOptionsStore)),
        readers: READERS,
        apply: (values) => {
          const next = pastedOptions(options, values)
          saveOptions(savedOptionsStore, next)
          applyOptions(next)
          OPTION_ROWS.filter((row) => row.key in values).forEach((row) => {
            draft[row.name] = next[row.name]
            showDraft(row.name)
          })
        }
      },
      restore: () => restoreDefaults()
    })
    if (!body) return
    const field = (name) => body.querySelector(`[data-option="${name}"]`)
    const showDraft = (name) => {
      if (name === DIGIT_PAD) field(name).value = String(draft[name])
      else field(name).checked = draft[name]
    }
    const restoreDefaults = () => OPTION_ROWS.forEach((row) => {
      draft[row.name] = DEFAULT_OPTIONS[row.name]
      showDraft(row.name)
    })
    body.innerHTML = OPTIONS.map(optionRow).join('') + DIGIT_PAD_ROW
    OPTION_ROWS.forEach((row) => {
      showDraft(row.name)
      field(row.name).addEventListener('change', (event) => {
        draft[row.name] = row.name === DIGIT_PAD ? Number(event.target.value) : event.target.checked
      })
    })
  }

  function listenForHeldTab () {
    document.addEventListener('keydown', (event) => {
      tab.run(() => {
        if (!swapped) return
        const toolOn = Object.values(Framework.app.tools).includes(swapped.tool)
        if (isHeldTabToStop(event, { toolOn, dialogOpen: document.querySelector('.dialog') !== null })) event.preventDefault()
      })
    }, true)
  }

  const start = () => {
    applyOptions(saved.run(() => readOptions(Framework), () => DEFAULT_OPTIONS))
    applyRightDrag()
    listenForHeldTab()
    addSettingsEntry(dialogs, settingsEntry, { name: 'uitweaks', content: SCRIPT_NAME, open: openDialog })
  }
  guard.start(start, { roots: () => ({ ToolLetter: typeof ToolLetter === 'undefined' ? undefined : ToolLetter }) })
})()
