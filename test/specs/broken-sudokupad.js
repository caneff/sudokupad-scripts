'use strict'
// A stand-in page for one script, run in its own realm: SudokuPad first has every internal the script declares and answers every
// call, and then it changes, so every call into it throws and every member it did not declare is gone. The script starts on the
// working page; then every way back into it is taken on the changed one: each listener it added to the page, each timer and observer,
// and each callback it handed SudokuPad. A throw that leaves the script reached the page, and is counted. `failEachListener` keeps
// SudokuPad working and makes each listener's own code fail instead.
// Blind to a path behind a state the stand-in page never takes (an open dialog, a drag under way, a menu row picked), and to the methods
// the script puts on SudokuPad's objects with `wrap`, whose throw from SudokuPad's own method the guard passes through as SudokuPad's.
const vm = require('node:vm')
const { readFileSync } = require('node:fs')

class SudokuPadChanged extends Error {}
// What the event `failEachListener` hands a listener throws on any read: the listener's own code failing.
class OwnCodeFailed extends Error {}

// Members run out a few levels down, so a walk up the page (`parentNode` after `parentNode`) ends.
const DEPTH = 8

// The page around SudokuPad: every member is there and answers, with what was set on it or another such member; nothing it does throws.
// `on` names where a listener was added: `window`, `document`, or an element below them.
function pageStandIn (record) {
  const make = (on, depth = 0) => {
    const stored = new Map()
    return new Proxy(function () {}, {
      get (target, key) {
        if (stored.has(key)) return stored.get(key)
        if (key === 'then') return undefined
        if (key === Symbol.toPrimitive) return () => ''
        if (key === Symbol.iterator) return function * () {}
        if (key === 'length') return 0
        if (key === 'addEventListener') return (type, fn) => { if (typeof fn === 'function') record.add({ where: `${on} ${type} listener`, on, fn, listener: true }) }
        if (depth >= DEPTH) return undefined
        const child = make('element', depth + 1)
        stored.set(key, child)
        return child
      },
      set (target, key, value) { stored.set(key, value); return true },
      apply: () => make('element', depth + 1),
      construct (target, args) {
        args.filter((arg) => typeof arg === 'function').forEach((fn) => record.add({ where: 'observer', on: 'observer', fn }))
        return make('element', depth + 1)
      }
    })
  }
  return make
}

const throwingEvent = () => new Proxy({}, { get (target, key) { throw new OwnCodeFailed(`the listener read event.${String(key)}`) } })

// SudokuPad's roots, built from a script's FEATURES. Before `broken.now` a call answers with another member and keeps each function it
// is handed, or that sits in an object it is handed, as a callback; after it, every call throws and only the declared paths remain.
function sudokupadStandIn (features, record, broken) {
  // `app` is what `Framework.getApp` resolves to, which SudokuPad also keeps as `Framework.app`.
  const fromPage = (path) => (path.startsWith('app.') ? `Framework.${path}` : path)
  const declared = new Map()
  for (const { needs } of Object.values(features)) {
    for (const [path, kind] of Object.entries(needs)) declared.set(fromPage(path), kind)
  }
  const leadsToDeclared = (path) => [...declared.keys()].some((full) => full === path || full.startsWith(`${path}.`))
  const handedOver = (where, value, depth = 0) => {
    if (typeof value === 'function') record.add({ where, on: 'sudokupad', fn: value })
    else if (value && typeof value === 'object' && !Array.isArray(value) && depth < 2) {
      Object.entries(value).forEach(([key, inner]) => handedOver(`${where}.${key}`, inner, depth + 1))
    }
  }

  const nodes = new Map()
  function node (path) {
    if (nodes.has(path)) return nodes.get(path)
    const kind = declared.get(path)
    if (kind === 'integer' || kind === 'number') return 9
    const stored = new Map()
    const proxy = new Proxy(kind === 'array' ? [] : kind === 'object' ? {} : function () {}, {
      get (target, key) {
        if (typeof key === 'symbol') {
          if (broken.now) throw new SudokuPadChanged(`SudokuPad changed: ${path}[${String(key)}]`)
          if (key === Symbol.toPrimitive) return () => ''
          if (key === Symbol.iterator) return function * () {}
          return undefined
        }
        // A method the script put on this object (a `wrap`) stays, and is not taken as a callback: see the head of this file.
        if (stored.has(key)) return stored.get(key)
        const child = `${path}.${key}`
        if (key === 'then' || child.split('.').length > DEPTH * 2) return undefined
        if (!leadsToDeclared(child) && (broken.now || kind === 'array')) return broken.now ? undefined : Reflect.get(target, key)
        return node(child)
      },
      set (target, key, value) { stored.set(key, value); return true },
      apply (target, self, args) {
        if (broken.now) throw new SudokuPadChanged(`SudokuPad changed: ${path}()`)
        if (path === 'Framework.getApp') return thenable(node('Framework.app'))
        args.forEach((arg) => handedOver(`${path}()`, arg))
        return node(`${path}()`)
      }
    })
    nodes.set(path, proxy)
    return proxy
  }
  // `Framework.getApp()` resolves on a later turn; the stand-in runs its callback itself, at startup, so a throw from it is counted.
  function thenable (value) {
    return {
      then (fn) {
        if (typeof fn === 'function') record.add({ where: 'Framework.getApp().then', on: 'startup', fn: () => fn(value) })
        return thenable(undefined)
      },
      catch () { return thenable(undefined) }
    }
  }
  const rootNames = new Set([...declared.keys()].map((path) => path.split('.')[0]))
  return Object.fromEntries([...rootNames].map((name) => [name, node(name)]))
}

// Starts `file` (a script) on the working stand-in page. Returns `escaped`, each throw that left the script so far, as
// `{ where, on, error }`; `added`, every way back into the script not yet taken, as `{ where, on, fn, listener }`; `take`, which takes one
// of them with the event given and counts its throw; `warnings`, what the script warned in the console from then on; `broken`, whose
// `now` changes SudokuPad; and `roots`, SudokuPad's roots the script declares (`Framework`, `ToolPen`), on which a test may set a member.
function startOnStandInPage (file, features) {
  const broken = { now: false }
  const added = []
  const record = { add: (entry) => added.push(entry) }
  const page = pageStandIn(record)
  const warnings = []
  const escaped = []
  const roots = sudokupadStandIn(features, record, broken)
  const sandbox = {
    window: page('window'),
    document: page('document'),
    navigator: page('element'),
    localStorage: { getItem: () => null, setItem () {}, removeItem () {} },
    location: { href: 'https://sudokupad.app/test' },
    ...roots,
    console: { log () {}, info () {}, error () {}, warn: (...args) => warnings.push(args.map(String).join(' ')) },
    setTimeout: (fn) => { record.add({ where: 'setTimeout', on: 'timer', fn }); return 1 },
    clearTimeout () {},
    setInterval: (fn) => { record.add({ where: 'setInterval', on: 'timer', fn }); return 1 },
    clearInterval () {},
    requestAnimationFrame: (fn) => { record.add({ where: 'requestAnimationFrame', on: 'timer', fn }); return 1 },
    cancelAnimationFrame () {},
    URLSearchParams,
    URL,
    // A page's `new Event(type)`, which the stand-in page's `dispatchEvent` takes.
    Event: class Event { constructor (type) { this.type = type } }
  }
  for (const name of ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage']) sandbox.window[name] = sandbox[name]
  const take = ({ where, on, fn }, event = page('element')) => {
    try {
      fn(event, page('element'))
    } catch (error) {
      escaped.push({ where, on, error })
    }
  }
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox, { filename: file })
  // The script's getApp callback, then the timers it set.
  const takeAll = (on) => {
    const now = added.filter((entry) => entry.on === on)
    added.splice(0, added.length, ...added.filter((entry) => entry.on !== on))
    now.forEach((entry) => take(entry))
  }
  takeAll('startup')
  takeAll('timer')
  warnings.splice(0)
  return { escaped, added, take, warnings, broken, roots }
}

// Starts `file` and then changes SudokuPad, and takes every way back into the script, and what each one adds, a few rounds deep.
// Returns `startupEscaped` and `escaped`, each throw that left the script before and after the change, as `{ where, on, error }`;
// `taken`, how many ways back in were taken; and `warnings`, what the script warned in the console after the change.
function runOnBrokenSudokuPad (file, features) {
  const { escaped, added, take, warnings, broken } = startOnStandInPage(file, features)
  const startupEscaped = escaped.splice(0)
  broken.now = true
  let taken = 0
  for (let round = 0; round < 4 && added.length > 0; round++) {
    const now = added.splice(0)
    taken += now.length
    now.forEach((entry) => take(entry))
  }
  return { startupEscaped, escaped, taken, warnings }
}

// Starts `file`, and hands the listeners it added to `on` (`window` or `document`) at startup, each on a fresh start, an event that
// throws on any read: SudokuPad keeps working, and it is the listener's own code that fails. `setUp` is handed SudokuPad's roots after
// startup, to put SudokuPad in the state a listener acts in. Returns, for each one, its `where`, the throws that left the script
// (`escaped`) and the script's warnings after it.
function failEachListener (file, features, on, setUp = () => {}) {
  const count = startOnStandInPage(file, features).added.filter((entry) => entry.listener && entry.on === on).length
  return Array.from({ length: count }, (_, index) => {
    const { escaped, added, take, warnings, roots } = startOnStandInPage(file, features)
    setUp(roots)
    const listener = added.filter((entry) => entry.listener && entry.on === on)[index]
    escaped.splice(0)
    take(listener, throwingEvent())
    return { where: listener.where, escaped, warnings }
  })
}

module.exports = { runOnBrokenSudokuPad, failEachListener, SudokuPadChanged }
