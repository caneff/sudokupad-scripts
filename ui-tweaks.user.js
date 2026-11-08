// ==UserScript==
// @name         SudokuPad UI Tweaks
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.1.0
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
  const VERSION = '0.1.0'
  const STYLE_ID = 'ui-tweaks-style'
  const TOGGLE_KEY = '/'
  const TAB_KEY = 'Tab'
  // The marker and the event No Tab Letters (no-tab-letters.user.js) waits for, so that script leaves Tab to this one.
  const RUNNING_ATTRIBUTE = 'data-ui-tweaks'
  const RUNNING_EVENT = 'ui-tweaks-running'

  // Each option's saved boolean is kept under its own key, which is also its name in Copy settings.
  const OPTIONS = [
    { id: 'tab', key: 'UiTweaks_tab', label: 'Tab never switches to letters', hint: 'The letter button and the / key still switch.', default: true },
    { id: 'hideSelect', key: 'UiTweaks_hideSelect', label: 'Hide the Toggle Selection button', hint: 'The other buttons in the row close up.', default: false },
    { id: 'wrapButtons', key: 'UiTweaks_wrapButtons', label: 'Wrap buttons', hint: 'The bottom row of tool buttons wraps onto a second line after 5.', default: false }
  ]
  const DEFAULT_OPTIONS = Object.fromEntries(OPTIONS.map((option) => [option.id, option.default]))
  const KEYS = Object.fromEntries(OPTIONS.map((option) => [option.id, option.key]))

  const savedBoolean = (data) => (typeof data === 'boolean' ? data : undefined)

  // A value that is not a boolean reads as the option's default.
  const savedOptions = (store) => Object.fromEntries(OPTIONS.map((option) => [option.id, savedBoolean(store.getData(option.key)) ?? option.default]))

  function saveOptions (store, options) {
    OPTIONS.forEach((option) => store.setData(option.key, options[option.id]))
  }

  const READERS = Object.fromEntries(OPTIONS.map((option) => [option.key, savedBoolean]))

  const copiedSettings = (store) => JSON.stringify(Object.fromEntries(OPTIONS.map((option) => [option.key, savedOptions(store)[option.id]])))

  // <lib:bottom-row>
  // Generated from lib/bottom-row.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // The bottom row of tool buttons; Color by Digit adds a button to it and UI Tweaks wraps it.
  const BOTTOM_ROW = '.controls-aux'
  // SudokuPad's own rules make this row wrap and size its buttons in rem under a scale transform, so a cap in rem holds five a row at every window size, whichever script added which button.
  const BOTTOM_ROW_CSS = `${BOTTOM_ROW} { max-width: 21.6rem; }`
  /* eslint-enable no-unused-vars */
  // </lib:bottom-row>
  const HIDE_SELECT_CSS = `${BOTTOM_ROW} [data-control="select"] { display: none !important; }`

  // Tab adds no rule: it works on the letter tool's key list.
  function buildCss (options) {
    return [options.hideSelect && HIDE_SELECT_CSS, options.wrapButtons && BOTTOM_ROW_CSS].filter(Boolean).join('\n')
  }

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

  // <lib:settings-dialog>
  // Generated from lib/settings-dialog.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // The events that end a press. SudokuPad's pen tool takes its click from `mouseup` (seen live), and
  // a touch ends with `pointerup`, `touchend` and a compatibility `mouseup`, so all four are swallowed.
  const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'mouseup', 'touchend']
  const SETTINGS_GROUP = 'experimental'
  const TITLE_MUTED = '#777'
  const FOCUS_RING = '#6a1b9a'
  const CONTROL_HOVER = '#f3e5f5'
  const SAVE_FILL = '#6b3fa0'
  // An inset layer darkens whatever fill the control has.
  const PRESS_LAYER = 'box-shadow: inset 0 0 0 100vmax rgb(0 0 0 / .1)'
  const STATUS_ATTRIBUTE = 'data-role="settings-status"'
  const STATUS_SELECTOR = `[${STATUS_ATTRIBUTE}]`

  function setDialogStatus (dialog, message) {
    dialog.querySelector(STATUS_SELECTOR).textContent = message
  }
  // What `keys` hold now, as a function that puts them back; a key that held nothing (null, or undefined when the script's store is off) is removed again. The stored values are held by reference, so a script's save must replace a value and never edit one in place.
  function snapshotStore (store, keys) {
    const before = keys.map((key) => [key, store.getData(key)])
    return () => before.forEach(([key, value]) => (value == null ? store.removeData(key) : store.setData(key, value)))
  }

  // A thrown value that is not an Error has no message, so it is shown as itself.
  const errorText = (error) => error?.message ?? String(error)

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

  function dialogTitleCss (prefix) {
    const tools = `.${prefix}tools`
    return [
      `.${prefix}version { opacity: .6; }`,
      `.${prefix}title-row { display: flex; align-items: center; gap: 12px; }`,
      `${tools} { display: flex; align-items: center; gap: 4px; }`,
      // SudokuPad styles a dialog's buttons by tag, so each of these is forced.
      `${tools} button { background: none !important; border: none !important; box-shadow: none !important; padding: 4px !important; margin: 0 !important; width: auto !important; min-width: 0 !important; height: auto !important; line-height: 0 !important; color: ${TITLE_MUTED} !important; cursor: pointer; border-radius: 6px !important; }`,
      `${tools} button:hover { background: #f0edf5 !important; }`,
      `${tools} button:focus-visible { outline: 2px solid ${FOCUS_RING} !important; outline-offset: 0; }`,
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
      `${row} button:focus-visible { outline: 2px solid ${FOCUS_RING}; outline-offset: 2px; }`
    ].join('\n')
  }

  const SAVE_LABEL = 'Save'
  const CANCEL_LABEL = 'Cancel'

  // Escape needs no handler here: SudokuPad's own dialog closes on it.
  // Returns the body container for the script to fill and wire, or null when SudokuPad showed no dialog (it ignores showDialog while another dialog is open).
  function showSettingsDialog (framework, { prefix, name, version, bodyId, styleId, css, centerOverBoard = true, changed, save, snapshot, extraButtons = [] }, { doc = document, win = window } = {}) {
    addStyleOnce(`settings-dialog-buttons-${bodyId}`, buttonRowCss(bodyId), doc)
    if (css) addStyleOnce(styleId, css, doc)
    const close = () => closeDialogKeepingGrid(framework, win)
    // After a failed save the script's `changed()` may already read false, so a retry saves again whatever it says.
    let failed = false
    // `snapshot()` runs before `save` and returns the function that puts back everything the save can change, so a save that fails half-way leaves the stored values as they were; a restore that itself throws is named beside the save's failure.
    const saveAndClose = () => {
      let restore = null
      try {
        if (failed || changed()) {
          restore = snapshot ? snapshot() : null
          save()
        }
      } catch (error) {
        failed = true
        let message = `Not saved: ${errorText(error)}`
        try {
          if (restore) restore()
        } catch (restoreError) {
          message += `; the earlier values could not be put back: ${errorText(restoreError)}`
        }
        // The dialog stays open so the failure is read and the choices are kept.
        setDialogStatus(doc.getElementById(bodyId).closest('.dialog'), message)
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
        { tag: 'options', options: buttons.map(({ content, handler }) => ({ tag: 'button', content, handler })) }
      ]
    })
    const body = doc.getElementById(bodyId)
    if (!body) return null
    // No selector tells the buttons apart but their text, so the shell marks each with its role for the script's stylesheet.
    const row = body.closest('.dialog')?.querySelector('.dialog-options')
    if (row) row.querySelectorAll('button').forEach((button, index) => { button.dataset.role = buttons[index].role })
    return body
  }
  /* eslint-enable no-unused-vars */
  // </lib:settings-dialog>
  // <lib:settings-transfer>
  // Generated from lib/settings-transfer.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  /* global setDialogStatus, errorText */ // from settings-dialog.js, which every script carries beside this one
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
          if (Object.keys(values).length > 0) apply(values)
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
  // A script's features, each with the SudokuPad internals it needs: one that lacks an internal, or whose own code throws, turns off
  // alone, and a bar at the bottom of the page says so once per SudokuPad version.
  const NOTICE_HOST_ID = 'sudokupad-scripts-notices'
  // Every script's bar is the one purple, Pen Tool Extras' and the site's --accent.
  const NOTICE_COLOR = '#6a1b9a'
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

  // `off` holds each feature's label and why it is off: the internal it lacks, or the error its own code threw.
  function reportUrl ({ name, version, sudokupad, off }) {
    const shownVersion = sudokupad || 'unknown'
    const labels = off.map((feature) => feature.label).join(', ')
    const body = [
      `Script: ${name} ${version}`,
      `SudokuPad version: ${shownVersion}`,
      '',
      ...off.map(({ label, why }) => `- ${label}: ${typeof why === 'string' ? `SudokuPad has no ${why}` : String(why)}`)
    ].join('\n')
    return `${REPORT_URL}?${new URLSearchParams({ title: `${name}: ${labels} off on SudokuPad ${shownVersion}`, body })}`
  }

  const NOTICE_HOST_CSS = 'position: fixed; left: 50%; bottom: 8px; transform: translateX(-50%); z-index: 10000; display: flex; flex-direction: column; gap: 4px; align-items: center;'
  const NOTICE_BAR_CSS = `display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 14px; border-radius: 6px; background: ${NOTICE_COLOR}; color: #fff; font: 14px/1.3 sans-serif; box-shadow: 0 2px 6px rgba(0, 0, 0, .3);`
  const NOTICE_LINK_CSS = 'color: #fff; font-weight: bold; text-decoration: underline;'
  const NOTICE_DISMISS_CSS = 'background: none; border: none; color: #fff; font-size: 18px; line-height: 1; padding: 0 4px; cursor: pointer;'

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

    let bar = null
    function showNotice () {
      if (bar) bar.remove()
      bar = null
      const gone = dismissed()
      const shown = reasons.filter((reason) => !gone.includes(reason.name))
      if (shown.length === 0 || !page.doc.body) return
      const { doc } = page
      let host = doc.getElementById(NOTICE_HOST_ID)
      if (!host) {
        host = doc.createElement('div')
        host.id = NOTICE_HOST_ID
        host.style.cssText = NOTICE_HOST_CSS
        doc.body.append(host)
      }
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
      const dismiss = doc.createElement('button')
      dismiss.type = 'button'
      dismiss.textContent = '×'
      dismiss.title = 'Dismiss'
      dismiss.setAttribute('aria-label', 'Dismiss')
      dismiss.style.cssText = NOTICE_DISMISS_CSS
      dismiss.addEventListener('click', () => {
        dismissedHere.push(...shown.map((reason) => reason.name))
        if (savesDismissals()) useStore(() => page.store.setData(dismissKey, { version: page.sudokupad, features: dismissed() }))
        showNotice()
      })
      bar.append(text, link, dismiss)
      host.append(bar)
    }

    // A feature stays off once skipped, so its error is warned once and not on every event. `skip(why, false)` is for one never installed.
    function createFeature (featureName, { label, onSkip }) {
      const feature = {
        off: false,
        skip (why, installed = true) {
          if (feature.off) return
          feature.off = true
          reasons.push({ name: featureName, label, why })
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
            feature.skip(error)
            return fallback()
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
      lackingInternals(features, roots).forEach((names, missing) => {
        names.forEach((featureName) => guarded[featureName].skip(missing, false))
        console.warn(`${script}: ${names.map((featureName) => features[featureName].label).join(', ')} skipped because SudokuPad has no ${missing}`)
      })
      page = { store, doc, sudokupad: sudokupadVersion(doc) }
      showNotice()
    }

    return { features: guarded, get off () { return reasons.map((reason) => reason.label) }, probe }
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
    module.exports = { VERSION, OPTIONS, DEFAULT_OPTIONS, KEYS, savedOptions, saveOptions, READERS, copiedSettings, pastedSettings, pasteReport, buildCss, STYLE_ID, withInertTab, ignoreKey, isHeldTabToStop, lackingInternals, FEATURES }
  }
  if (typeof document === 'undefined') return

  // The match also covers other crackingthecryptic.com pages, which have no Framework.
  if (typeof Framework === 'undefined') return

  // Set before anything waits, so No Tab Letters sees it whichever script loads first.
  document.documentElement.setAttribute(RUNNING_ATTRIBUTE, VERSION)

  const style = document.createElement('style')
  style.id = STYLE_ID
  document.head.appendChild(style)

  let options = DEFAULT_OPTIONS
  // The letter tool and its key list as they were before the Tab option swapped the list; null while the option is off.
  let swapped = null

  // The Tab option puts SudokuPad's own list back when it is switched off.
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
  // What the settings entry and dialog are handed in place of Framework: the dialog's close runs under the settings entry when a button is pressed.
  const dialogs = {
    addSetting: (setting) => Framework.addSetting(setting),
    showDialog: (config) => Framework.showDialog(config),
    closeDialog: () => settingsEntry.run(() => Framework.closeDialog())
  }
  // A copy or paste with its feature off says so in the dialog's status line.
  const offNow = (feature) => () => { throw new Error(`the ${FEATURES[feature].label} is off`) }

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
      snapshot: () => snapshotStore(Framework, OPTIONS.map((option) => option.key)),
      save: () => settingsEntry.run(() => {
        saveOptions(Framework, draft)
        applyOptions({ ...draft })
      })
    })
    if (!body) return
    body.innerHTML = OPTIONS.map(optionRow).join('')
    const box = (id) => body.querySelector(`input[data-option="${id}"]`)
    OPTIONS.forEach((option) => {
      box(option.id).checked = draft[option.id]
      box(option.id).addEventListener('change', (event) => { draft[option.id] = event.target.checked })
    })
    const copied = () => saved.run(() => copiedSettings(Framework), offNow('saved'))
    wireCopyPaste(body.closest('.dialog'), { copied, readers: READERS }, (values) => settingsEntry.run(() => {
      OPTIONS.filter((option) => option.key in values).forEach((option) => {
        draft[option.id] = values[option.key]
        box(option.id).checked = draft[option.id]
      })
      saveOptions(Framework, draft)
      applyOptions({ ...draft })
    }, offNow('settings')))
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
    options = saved.run(() => savedOptions(Framework), () => DEFAULT_OPTIONS)
    // No Tab Letters puts SudokuPad's list back before the Tab option reads it.
    document.dispatchEvent(new Event(RUNNING_EVENT))
    style.textContent = buildCss(options)
    applyTab(options.tab)
    listenForHeldTab()
    settingsEntry.run(() => addSettingsEntry(dialogs, { name: 'uitweaks', content: 'UI Tweaks', open: () => settingsEntry.run(openDialog) }))
    // Absent without Tampermonkey, where the settings entry is the way in.
    if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('UI Tweaks settings', () => settingsEntry.run(openDialog))
  }
  if (typeof Framework.getApp === 'function') Framework.getApp().then(start)
  else start()
})()
