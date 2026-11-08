// ==UserScript==
// @name         SudokuPad No Tab Letters
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.2.0
// @description  Now UI Tweaks (ui-tweaks.user.js). Stops a stray Tab from switching SudokuPad's number pad to letters, and leaves it to UI Tweaks when that is installed too.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/no-tab-letters.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/no-tab-letters.user.js
// ==/UserScript==

/* global ToolLetter */

(function () {
  'use strict'

  // GM_info is absent without Tampermonkey, so the script cannot read @version; keep this equal to it.
  const VERSION = '0.2.0'
  const TOGGLE_KEY = '/'
  const TAB_KEY = 'Tab'
  // The marker and the event UI Tweaks (ui-tweaks.user.js) sets and fires, so Tab is handled by one script and not two.
  const UI_TWEAKS_ATTRIBUTE = 'data-ui-tweaks'
  const UI_TWEAKS_EVENT = 'ui-tweaks-running'
  const UI_TWEAKS_URL = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/ui-tweaks.user.js'
  const MOVED_KEY = 'no-tab-letters-moved-notice'

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
  // The letter tool is read once `Framework.getApp` says the app is ready.
  const FEATURES = { tab: { label: 'Tab key', needs: { 'Framework.getApp': 'function', 'ToolLetter.tool.keyHandlers': 'array', 'Framework.app.tools': 'object' } } }
  const guard = createGuard({ script: 'no-tab-letters', name: 'No Tab Letters', version: VERSION, features: FEATURES })

  // The notice that this script is now UI Tweaks shows until it is dismissed, and a dismissal is remembered under MOVED_KEY.
  const movedNoticeDismissed = (store) => typeof store.getData === 'function' && store.getData(MOVED_KEY) === true

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, withInertTab, ignoreKey, isHeldTabToStop, lackingInternals, FEATURES, movedNoticeDismissed, MOVED_KEY, UI_TWEAKS_URL }
  }
  if (typeof document === 'undefined') return

  // The match also covers other crackingthecryptic.com pages, which have no Framework.
  if (typeof Framework === 'undefined') return

  const uiTweaksRunning = () => document.documentElement.hasAttribute(UI_TWEAKS_ATTRIBUTE)

  function showMovedNotice () {
    if (movedNoticeDismissed(Framework) || !document.body) return
    let host = document.getElementById(NOTICE_HOST_ID)
    if (!host) {
      host = document.createElement('div')
      host.id = NOTICE_HOST_ID
      host.style.cssText = NOTICE_HOST_CSS
      document.body.append(host)
    }
    const bar = document.createElement('div')
    bar.setAttribute('data-script', 'no-tab-letters-moved')
    bar.style.cssText = NOTICE_BAR_CSS
    const text = document.createElement('span')
    text.textContent = 'No Tab Letters is now UI Tweaks.'
    const link = document.createElement('a')
    link.href = UI_TWEAKS_URL
    link.target = '_blank'
    link.rel = 'noopener'
    link.textContent = 'Install UI Tweaks'
    link.style.cssText = NOTICE_LINK_CSS
    const dismiss = document.createElement('button')
    dismiss.type = 'button'
    dismiss.textContent = '×'
    dismiss.title = 'Dismiss'
    dismiss.setAttribute('aria-label', 'Dismiss')
    dismiss.style.cssText = NOTICE_DISMISS_CSS
    dismiss.addEventListener('click', () => {
      if (typeof Framework.setData === 'function') Framework.setData(MOVED_KEY, true)
      bar.remove()
    })
    bar.append(text, link, dismiss)
    host.append(bar)
  }

  // The "Enable Letter Tool" setting adds and removes ToolLetter's one `tool` object, so a list set
  // on it holds whenever the tool is on. Setting it on the object shadows the shared prototype's list.
  // Without getApp the Tab key is off, and the bar says so.
  const start = () => {
    guard.probe({ roots: { Framework, ToolLetter: typeof ToolLetter === 'undefined' ? undefined : ToolLetter }, store: Framework })
    // UI Tweaks handles Tab, and no notice is owed to a user who has it. One that starts later asks this script to put the list back.
    let standingDown = uiTweaksRunning()
    if (!standingDown) showMovedNotice()
    guard.features.tab.run(() => {
      const tool = ToolLetter.tool
      const original = tool.keyHandlers
      document.addEventListener(UI_TWEAKS_EVENT, () => {
        standingDown = true
        if (tool.keyHandlers !== original) tool.keyHandlers = original
        document.querySelector('[data-script="no-tab-letters-moved"]')?.remove()
      })
      if (standingDown) return
      const changed = withInertTab(tool.keyHandlers, ignoreKey)
      if (!changed) throw new Error('the letter tool has no Tab binding to the toggle')
      tool.keyHandlers = changed
      document.addEventListener('keydown', (event) => {
        if (standingDown) return
        guard.features.tab.run(() => {
          const tools = Framework.app.tools
          const toolOn = Object.values(tools).includes(tool)
          if (isHeldTabToStop(event, { toolOn, dialogOpen: document.querySelector('.dialog') !== null })) event.preventDefault()
        })
      }, true)
    })
  }
  if (typeof Framework.getApp === 'function') Framework.getApp().then(start)
  else start()
})()
