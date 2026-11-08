// ==UserScript==
// @name         SudokuPad No Tab Letters
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.1.2
// @description  Stops a stray Tab from switching SudokuPad's number pad to letters. The letter button and the / key still switch it.
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
  const VERSION = '0.1.2'
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

  // <lib:sudokupad>
  // Generated from lib/sudokupad.js; edit that file and run node sync-lib.js.
  /* eslint-disable no-unused-vars */
  // A script's features, each with the SudokuPad internals it needs: one that lacks an internal, or whose own code throws, turns off
  // alone, and a bar at the bottom of the page says so once per SudokuPad version.
  const NOTICE_HOST_ID = 'sudokupad-scripts-notices'
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
  const noticeBarCss = (color) => `display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 14px; border-radius: 6px; background: ${color}; color: #fff; font: 14px/1.3 sans-serif; box-shadow: 0 2px 6px rgba(0, 0, 0, .3);`
  const NOTICE_LINK_CSS = 'color: #fff; font-weight: bold; text-decoration: underline;'
  const NOTICE_DISMISS_CSS = 'background: none; border: none; color: #fff; font-size: 18px; line-height: 1; padding: 0 4px; cursor: pointer;'

  // `features` maps a name to `{ label, needs, onSkip }`: `label` is what the bar and the console call it, `needs` maps each internal's
  // path to its kind (a key of INTERNAL_KINDS), and `onSkip` undoes what the feature left on the page. `probe` runs once SudokuPad's app
  // exists; `store` is SudokuPad's Framework, whose saved data remembers a dismissal under `<script>-notice`.
  function createGuard ({ script, name, version, color, features }) {
    const off = []
    const reasons = []
    let page = null

    const dismissKey = `${script}-notice`
    const dismissed = () => {
      const saved = page.store.getData(dismissKey)
      return saved && saved.version === page.sudokupad && Array.isArray(saved.features) ? saved.features : []
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
      bar.style.cssText = noticeBarCss(color)
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
        page.store.setData(dismissKey, { version: page.sudokupad, features: [...gone, ...shown.map((reason) => reason.name)] })
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
          off.push(label)
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

    return { features: guarded, off, probe }
  }
  /* eslint-enable no-unused-vars */
  // </lib:sudokupad>
  const FEATURES = { tab: { label: 'Tab key', needs: { 'ToolLetter.tool.keyHandlers': 'array' } } }
  const guard = createGuard({ script: 'no-tab-letters', name: 'No Tab Letters', version: VERSION, color: '#37474f', features: FEATURES })

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VERSION, withInertTab, ignoreKey, lackingInternals, FEATURES }
  }
  if (typeof document === 'undefined') return

  // The match also covers other crackingthecryptic.com pages, which have no Framework.
  if (typeof Framework === 'undefined') return
  if (!Framework.getApp) {
    console.warn('no-tab-letters: SudokuPad\'s Framework has no getApp, so nothing was changed')
    return
  }

  // The "Enable Letter Tool" setting adds and removes ToolLetter's one `tool` object, so a list set
  // on it holds whenever the tool is on. Setting it on the object shadows the shared prototype's list.
  Framework.getApp().then(() => {
    guard.probe({ roots: { Framework, ToolLetter: typeof ToolLetter === 'undefined' ? undefined : ToolLetter }, store: Framework })
    guard.features.tab.run(() => {
      const tool = ToolLetter.tool
      const changed = withInertTab(tool.keyHandlers, ignoreKey)
      if (!changed) throw new Error('the letter tool has no Tab binding to the toggle')
      tool.keyHandlers = changed
    })
  })
})()
