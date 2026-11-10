// ==UserScript==
// @name         SudokuPad UI Tweaks
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.1.10
// @description  Small changes to SudokuPad's buttons, each switched on or off in a settings dialog: Tab never switches the number pad to letters, hide the Toggle Selection button, and wrap the bottom row of buttons after five.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        GM_registerMenuCommand
// @sandbox      raw
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/ui-tweaks.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/ui-tweaks.user.js
// ==/UserScript==

/* global ToolLetter, GM_registerMenuCommand */

(function () {
  'use strict'

  // GM_info is absent without Tampermonkey, so the script cannot read @version; keep this equal to it.
  const VERSION = '0.1.10'
  const STYLE_ID = 'ui-tweaks-style'
  // Each option's saved boolean is kept under its own key, which is also its name in Copy settings.
  const OPTIONS = [
    { id: 'tab', key: 'UiTweaks_tab', label: 'Tab never switches to letters', hint: 'The letter button and the / key still switch.', default: true },
    { id: 'hideSelect', key: 'UiTweaks_hideSelect', label: 'Hide the Toggle Selection button', hint: 'The other buttons in the row close up.', default: false },
    { id: 'wrapButtons', key: 'UiTweaks_wrapButtons', label: 'Wrap buttons', hint: 'The bottom row of tool buttons wraps onto a second line after 5.', default: false }
  ]
  const DEFAULT_OPTIONS = Object.fromEntries(OPTIONS.map((option) => [option.id, option.default]))

  const savedBoolean = (data) => (typeof data === 'boolean' ? data : undefined)

  const savedOptions = (store) => Object.fromEntries(OPTIONS.map((option) => [option.id, savedBoolean(store.getData(option.key)) ?? option.default]))

  function saveOptions (store, options) {
    OPTIONS.forEach((option) => store.setData(option.key, options[option.id]))
  }

  const READERS = Object.fromEntries(OPTIONS.map((option) => [option.key, savedBoolean]))

  const copiedSettings = (store) => JSON.stringify(Object.fromEntries(OPTIONS.map((option) => [option.key, savedOptions(store)[option.id]])))

  // What a paste leaves in force: the options now saved, with only the pasted ones changed, so a box ticked in the dialog and not saved is not saved by it.
  const pastedOptions = (current, values) => ({ ...current, ...Object.fromEntries(OPTIONS.filter((option) => option.key in values).map((option) => [option.id, values[option.key]])) })

  // <lib:bottom-row>
  // Generated from lib/bottom-row.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // SudokuPad's bottom row of tool buttons.
  const BOTTOM_ROW = '.controls-aux'
  // SudokuPad's own rules make this row wrap and size its buttons in rem under a scale transform, so a cap in rem holds five a row at every window size, whichever script added which button. !important because something on Chris's page gave the row an inline max-width of 482px, which beats a stylesheet cap.
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
  const HIDE_SELECT_CSS = `${BOTTOM_ROW} [data-control="select"] { display: none !important; }`

  // Tab adds no rule: it works on the letter tool's key list.
  function buildCss (options) {
    return [options.hideSelect && HIDE_SELECT_CSS, options.wrapButtons && BOTTOM_ROW_CSS].filter(Boolean).join('\n')
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
  const FEATURES = {
    saved: { label: 'saved options', needs: { 'Framework.getData': 'function' } },
    tab: { label: 'Tab key', needs: { 'Framework.getApp': 'function', 'ToolLetter.tool.keyHandlers': 'array', 'Framework.app.tools': 'object' } },
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
  const guard = createGuard({ script: 'ui-tweaks', name: 'UI Tweaks', version: VERSION, features: FEATURES })
  const { saved, tab, settings: settingsEntry } = guard.features

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, OPTIONS, DEFAULT_OPTIONS, savedOptions, saveOptions, pastedOptions, READERS, copiedSettings, pastedSettings, buildCss, withInertTab, ignoreKey, isHeldTabToStop, lackingInternals, FEATURES }
  }
  if (typeof document === 'undefined') return

  // The match also covers other crackingthecryptic.com pages, which have no Framework.
  if (typeof Framework === 'undefined') return

  const style = document.createElement('style')
  style.id = STYLE_ID
  document.head.appendChild(style)

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

  function applyOptions (next) {
    options = next
    style.textContent = buildCss(next)
    applyTab(next.tab)
  }

  const CLASS_PREFIX = 'ui-tweaks-'
  const DIALOG_ID = 'ui-tweaks-dialog'
  // SudokuPad styles a dialog's labels and inputs by tag, so these are forced.
  const DIALOG_CSS = [
    `#${DIALOG_ID} .${CLASS_PREFIX}option { display: flex !important; align-items: flex-start; gap: 10px; margin: 10px 0; cursor: pointer; }`,
    `#${DIALOG_ID} .${CLASS_PREFIX}option input { position: static !important; margin: 3px 0 0 !important; flex: none; width: 18px !important; height: 18px !important; cursor: pointer; }`,
    `#${DIALOG_ID} .${CLASS_PREFIX}option small { display: block; opacity: .65; }`
  ].join('\n')
  const dialogs = guard.dialogsFor(settingsEntry)
  // The options are written only from the dialog, so a write that fails reaches its status line with the settings entry still on.
  const savedSettings = guard.storeFor(settingsEntry)
  // Every option's key and the options in force, as a function that puts them back after a Save or Paste that failed half-way.
  const snapshotOptions = () => snapshotStore(savedSettings, OPTIONS.map((option) => option.key), () => {
    const was = options
    return () => applyOptions(was)
  })

  const optionRow = (option) =>
    `<label class="${CLASS_PREFIX}option"><input type="checkbox" data-option="${option.id}"><span>${option.label}<small>${option.hint}</small></span></label>`

  function openDialog () {
    const draft = { ...options }
    const body = showSettingsDialog(dialogs, {
      prefix: CLASS_PREFIX,
      name: 'UI Tweaks',
      version: VERSION,
      bodyId: DIALOG_ID,
      styleId: 'ui-tweaks-dialog-style',
      css: DIALOG_CSS,
      changed: () => OPTIONS.some((option) => draft[option.id] !== options[option.id]),
      snapshot: snapshotOptions,
      feature: settingsEntry,
      save: () => {
        saveOptions(savedSettings, draft)
        applyOptions({ ...draft })
      },
      copyPaste: {
        copied: () => saved.runInDialog(() => copiedSettings(Framework)),
        readers: READERS,
        apply: (values) => {
          const next = pastedOptions(options, values)
          saveOptions(savedSettings, next)
          applyOptions(next)
          OPTIONS.filter((option) => option.key in values).forEach((option) => {
            draft[option.id] = next[option.id]
            box(option.id).checked = next[option.id]
          })
        }
      }
    })
    if (!body) return
    body.innerHTML = OPTIONS.map(optionRow).join('')
    const box = (id) => body.querySelector(`input[data-option="${id}"]`)
    OPTIONS.forEach((option) => {
      box(option.id).checked = draft[option.id]
      box(option.id).addEventListener('change', (event) => { draft[option.id] = event.target.checked })
    })
  }

  // The letter tool's own list holds whenever the tool is on, so a swapped list is not undone by the setting.
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
    guard.probe({ roots: { Framework, ToolLetter: typeof ToolLetter === 'undefined' ? undefined : ToolLetter }, store: Framework })
    applyOptions(saved.run(() => savedOptions(Framework), () => DEFAULT_OPTIONS))
    listenForHeldTab()
    settingsEntry.run(() => addSettingsEntry(dialogs, { name: 'uitweaks', content: 'UI Tweaks', open: () => settingsEntry.run(openDialog) }))
    // Absent without Tampermonkey, where the settings entry is the way in.
    if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('UI Tweaks settings', () => settingsEntry.run(openDialog))
  }
  if (typeof Framework.getApp === 'function') Framework.getApp().then(start)
  else start()
})()
