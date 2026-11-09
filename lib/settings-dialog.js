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
