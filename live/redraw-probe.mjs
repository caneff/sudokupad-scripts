// Measures what a userscript's handlers cost per event on a live page: the time each spends in a handler it registered
// and the DOM nodes added or removed under it. Not a check itself, so `live/**/*.live.mjs` skips it.
// A handler is the callback of a MutationObserver, a `requestAnimationFrame` or an event listener that was registered
// from code carrying PROBE_TAG, so the script under test is injected with `tagged(code)`.

export const PROBE_TAG = 'redraw-probe-script.js'

// The script's code, named so a stack trace can tell its calls from SudokuPad's.
export const tagged = (code) => `${code}\n//# sourceURL=${PROBE_TAG}`

// Runs before the page's own scripts. Records into `window.__probe`: `handlerMs` (one entry per timed handler call),
// `mutations` (one entry per record of a native observer on the page: type, added, removed, and the target's tag and its
// closest ancestor with an id).
export const PROBE_INIT = (tag) => {
  const probe = { handlerMs: [], mutations: [], on: false }
  window.__probe = probe
  const mine = () => new Error().stack.includes(tag)
  const timed = (fn, kind) => function (...args) {
    const start = performance.now()
    try { return fn.apply(this, args) } finally { if (probe.on) probe.handlerMs.push({ kind, ms: performance.now() - start }) }
  }

  const NativeObserver = window.MutationObserver
  window.MutationObserver = class extends NativeObserver {
    constructor (callback) { super(mine() ? timed(callback, 'observer') : callback) }
  }
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback) => raf(mine() ? timed(callback, 'frame') : callback)
  const add = EventTarget.prototype.addEventListener
  const handlers = new WeakMap()
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (typeof listener === 'function' && mine()) {
      if (!handlers.has(listener)) handlers.set(listener, timed(listener, `event:${type}`))
      return add.call(this, type, handlers.get(listener), options)
    }
    return add.call(this, type, listener, options)
  }

  const where = (node) => {
    const el = node.nodeType === 1 ? node : node.parentElement
    const anchor = el && el.closest('[id]')
    return `${el ? el.localName : '?'}${el && el.id ? '#' + el.id : ''} in ${anchor ? '#' + anchor.id : 'no id'}`
  }
  new NativeObserver((records) => {
    if (!probe.on) return
    for (const r of records) {
      probe.mutations.push({ type: r.type, added: r.addedNodes.length, removed: r.removedNodes.length, where: where(r.target) })
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true })
}

// Starts a fresh recording after two animation frames, so mutations already queued are not counted.
export const startProbe = (page) => page.evaluate(async () => {
  await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
  window.__probe.handlerMs.length = 0
  window.__probe.mutations.length = 0
  window.__probe.on = true
})

// Stops recording, after two frames so a handler queued by the last event has run, and returns what was recorded.
export const stopProbe = (page) => page.evaluate(async () => {
  await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
  window.__probe.on = false
  return { handlerMs: window.__probe.handlerMs.slice(), mutations: window.__probe.mutations.slice() }
})

export const sum = (list) => list.reduce((a, b) => a + b, 0)
const percentile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
export const round = (n) => Math.round(n * 1000) / 1000

// One summary row for a recording over `events` events: handler calls and time, the worst call, and the nodes added and
// removed in total and under each region (`where` ends in `in #<id>`).
export function summarize ({ handlerMs, mutations }, events) {
  const byKind = {}
  for (const { kind, ms } of handlerMs) (byKind[kind] ||= []).push(ms)
  const handlers = Object.fromEntries(Object.entries(byKind).map(([kind, list]) => {
    const sorted = list.slice().sort((a, b) => a - b)
    return [kind, { calls: list.length, totalMs: round(sum(list)), meanMs: round(sum(list) / list.length), p95Ms: round(percentile(sorted, 0.95)), maxMs: round(sorted[sorted.length - 1]) }]
  }))
  const regions = {}
  for (const m of mutations) {
    const r = (regions[m.where.replace(/^.* in /, '')] ||= { records: 0, added: 0, removed: 0 })
    r.records++
    r.added += m.added
    r.removed += m.removed
  }
  return {
    events,
    handlers,
    handlerMsPerEvent: round(sum(handlerMs.map((h) => h.ms)) / events),
    nodesAddedPerEvent: round(sum(mutations.map((m) => m.added)) / events),
    nodesRemovedPerEvent: round(sum(mutations.map((m) => m.removed)) / events),
    regions
  }
}

// The recordings of several events as one, and the most handler time any one of them spent.
export const combine = (recordings) => ({ handlerMs: recordings.flatMap((r) => r.handlerMs), mutations: recordings.flatMap((r) => r.mutations) })
export const worstEventMs = (recordings) => round(Math.max(...recordings.map((r) => sum(r.handlerMs.map((h) => h.ms)))))
