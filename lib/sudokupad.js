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

// `off` holds each feature's label and why it is off: the internal it lacks, or the error its own code threw.
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
const NOTICE_BAR_CSS = `display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 14px; border-radius: 6px; background: ${NOTICE_COLOR}; color: #fff; font: 14px/1.3 sans-serif; box-shadow: 0 2px 6px rgba(0, 0, 0, .3);`
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

  // A bar of plain words, one per text and page load; the same host as the SudokuPad-changed bar, with no report link.
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

  // A feature stays off once skipped, so its error is warned once and not on every event. `skip(why, false)` is for one never installed.
  function createFeature (featureName, { label, onSkip }) {
    const feature = {
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
          feature.skip(error)
          return fallback()
        }
      },
      // A write the browser refuses (a full localStorage) is told to the user and leaves the feature on, so it saves again once space
      // frees. Any other throw skips the feature as `run` does.
      write (fn) {
        return feature.run(() => {
          try {
            return fn()
          } catch (error) {
            if (!isRefusedWrite(error)) throw error
            console.warn(`${script}: ${label} could not save, the browser refused the write:`, error)
            tell(`${name}: the browser has no room left, so ${label} could not be saved.`)
          }
        })
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

  return { features: guarded, get off () { return reasons.map((reason) => reason.label) }, probe }
}
