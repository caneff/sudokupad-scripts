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

// The dialog's first part: its own title rules, then the name with the version beside it, and Copy settings and Paste settings as icons at the right end,
// after the status line they report to. The rules travel with the row, so they are in the page exactly while the dialog is.
function renderDialogTitle ({ prefix, name, version }) {
  return `<style>${dialogTitleCss(prefix)}</style>` +
    `<div class="${prefix}title-row"><span><b>${name}</b> <small class="${prefix}version">v${version}</small></span>` +
    '<span data-role="settings-status"></span>' +
    `<span class="${prefix}tools">${titleIconButton('copy-settings', 'Copy settings', COPY_PASTE_PICTURES.copy)}${titleIconButton('paste-settings', 'Paste settings', COPY_PASTE_PICTURES.paste)}</span></div>`
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
