'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text.
const NAMES = ['createGuard', 'lackingInternals', 'sudokupadVersion', 'reportUrl', 'ERROR_LOG_KEY', 'ERROR_LOG_LIMIT', 'readErrorLog', 'formatErrorLog']
// The guard reads the page's localStorage by name; each test puts the storage it needs on globalThis.
const { memoryStorage } = require('../test/fake-page-storage.js')
const { createGuard, lackingInternals, sudokupadVersion, reportUrl, ERROR_LOG_KEY, ERROR_LOG_LIMIT, readErrorLog, formatErrorLog } =
  new Function(`${fs.readFileSync(path.join(__dirname, 'sudokupad.js'), 'utf8')}\nreturn { ${NAMES.join(', ')} }`)() // eslint-disable-line no-new-func

const blockedStorage = () => ({
  getItem () { throw new Error('storage blocked') },
  setItem () { throw new Error('storage blocked') }
})
const useStorage = (storage) => { globalThis.localStorage = storage; return storage }

// A page: enough of the DOM for the notice bar, and the HTML SudokuPad's version is read from.
function fakeDocument (html = '<script src="/script.js?v=0.611.0"></script><link href="/style.css?v=0.500.0">') {
  const element = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      attributes: {},
      listeners: {},
      style: {},
      textContent: '',
      parent: null,
      append (...kids) {
        kids.forEach((kid) => {
          const child = typeof kid === 'string' ? { textContent: kid, children: [] } : kid
          child.parent = el
          el.children.push(child)
        })
      },
      remove () {
        if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el)
        el.parent = null
      },
      setAttribute (name, value) { el.attributes[name] = String(value) },
      addEventListener (type, fn) { (el.listeners[type] = el.listeners[type] || []).push(fn) },
      click () { (el.listeners.click || []).forEach((fn) => fn({ preventDefault () {}, stopPropagation () {} })) }
    }
    return el
  }
  const body = element('body')
  const all = (el) => [el, ...el.children.flatMap((c) => c.tagName ? all(c) : [])]
  return {
    body,
    documentElement: { outerHTML: `<html><head>${html}</head></html>` },
    createElement: element,
    getElementById: (id) => all(body).find((el) => el.id === id) || null,
    all: () => all(body)
  }
}

const textOf = (el) => el.textContent + el.children.map(textOf).join('')
const bars = (doc) => doc.all().filter((el) => el.attributes['data-script'])
const linkOf = (bar) => bar.children.find((el) => el.tagName === 'A')
const dismissOf = (bar) => bar.children.find((el) => el.tagName === 'BUTTON')

const fakeStore = (saved = {}) => ({
  data: { ...saved },
  getData (key) { return key in this.data ? JSON.parse(JSON.stringify(this.data[key])) : null },
  setData (key, value) { this.data[key] = JSON.parse(JSON.stringify(value)) }
})

// SudokuPad's app with every internal the features below need.
const fakeRoots = () => ({
  Framework: { app: { xyToRCExact () {}, grid: { rows: 9 }, puzzle: { cells: [] } } },
  ToolPen: { tool: { actSend () {} } }
})

const FEATURES = {
  arrowLines: { label: 'arrow lines', needs: { 'ToolPen.tool.actSend': 'function', 'Framework.app.puzzle.cells': 'array' } },
  lineErase: { label: 'line erase', needs: { 'Framework.app.xyToRCExact': 'function', 'Framework.app.grid.rows': 'integer' } },
  colors: { label: 'colors', needs: { 'Framework.app.tools.colour': 'object' } }
}

// A guard with its console warnings caught, probed against `roots` on `doc`.
function started ({ roots = fakeRoots(), store = fakeStore(), doc = fakeDocument(), features = FEATURES } = {}) {
  const warned = []
  const warn = console.warn
  console.warn = (...args) => warned.push(args)
  try {
    const guard = createGuard({ script: 'pen-tool-extras', name: 'Pen Tool Extras', version: '1.2.3', features })
    guard.probe({ roots, store, doc })
    return { guard, warned, store, doc, restore: () => { console.warn = warn } }
  } catch (error) {
    console.warn = warn
    throw error
  }
}

const withColors = () => {
  const roots = fakeRoots()
  roots.Framework.app.tools = { colour: {} }
  return roots
}

test('a page with every internal leaves every feature on, warns nothing and shows no bar', (t) => {
  const { guard, warned, doc, restore } = started({ roots: withColors() })
  t.after(restore)
  assert.deepEqual(Object.values(guard.features).map((f) => f.off), [false, false, false])
  assert.deepEqual(guard.off, [])
  assert.deepEqual(warned, [])
  assert.equal(bars(doc).length, 0)
})

test('a missing internal turns off only the feature that needs it, and one warning names the feature and the internal', (t) => {
  const roots = withColors()
  delete roots.Framework.app.xyToRCExact
  const { guard, warned, restore } = started({ roots })
  t.after(restore)
  assert.deepEqual(Object.fromEntries(Object.entries(guard.features).map(([k, f]) => [k, f.off])), { arrowLines: false, lineErase: true, colors: false })
  assert.deepEqual(guard.off, ['line erase'])
  assert.deepEqual(warned, [['pen-tool-extras: line erase skipped because SudokuPad has no Framework.app.xyToRCExact']])
})

test('an internal of the wrong kind counts as missing', (t) => {
  const roots = withColors()
  roots.Framework.app.grid.rows = '9'
  const { guard, restore } = started({ roots })
  t.after(restore)
  assert.deepEqual(guard.off, ['line erase'])
})

test('features lacking the same internal are warned together, each under the first internal it lacks', () => {
  const roots = fakeRoots()
  delete roots.Framework.app.puzzle
  delete roots.Framework.app.grid
  assert.deepEqual(lackingInternals({ ...FEATURES, alsoCells: { label: 'x', needs: { 'Framework.app.puzzle.cells': 'array' } } }, roots), new Map([
    ['Framework.app.puzzle.cells', ['arrowLines', 'alsoCells']],
    ['Framework.app.grid.rows', ['lineErase']],
    ['Framework.app.tools.colour', ['colors']]
  ]))
})

test('a run of a feature switched off by the probe answers with its fallback and never runs', (t) => {
  const roots = withColors()
  delete roots.ToolPen.tool
  const { guard, restore } = started({ roots })
  t.after(restore)
  let ran = false
  assert.equal(guard.features.arrowLines.run(() => { ran = true }, () => 'stock'), 'stock')
  assert.equal(ran, false)
})

// A feature with its warnings caught, probed on a complete page.
const newFeature = (onSkip) => {
  const { guard, warned, store, doc, restore } = started({ roots: withColors(), features: { marks: { label: 'marks', needs: {}, onSkip } } })
  return { step: guard.features.marks, guard, warned, store, doc, restore }
}

test('a throw in a feature\'s own code turns it off, warns once naming it, and the fallback answers from then on', (t) => {
  const { step, guard, warned, restore } = newFeature()
  t.after(restore)
  const boom = new TypeError('x is not a function')
  let runs = 0
  const run = () => { runs++; throw boom }
  assert.equal(step.run(run, () => 'fallback'), 'fallback')
  assert.equal(step.run(run, () => 'again'), 'again')
  assert.equal(runs, 1, 'a feature turned off is not run again')
  assert.deepEqual(warned, [['pen-tool-extras: marks skipped because SudokuPad changed:', boom]])
  assert.deepEqual(guard.off, ['marks'])
})

test('a feature turned off puts back what it changed once, and a failure there is warned, not thrown', (t) => {
  let undone = 0
  const { step, warned, restore } = newFeature(() => { undone++; throw new Error('undo') })
  t.after(restore)
  step.run(() => { throw new Error('own') })
  step.skip(new Error('again'))
  assert.equal(undone, 1)
  assert.equal(warned.length, 2)
  assert.match(warned[1][0], /^pen-tool-extras: could not undo marks/)
})

test('a feature off for a missing internal puts nothing back, since nothing was installed', (t) => {
  const roots = withColors()
  delete roots.Framework.app.xyToRCExact
  let undone = 0
  const { guard, restore } = started({ roots, features: { lineErase: { ...FEATURES.lineErase, onSkip: () => { undone++ } } } })
  t.after(restore)
  assert.deepEqual([guard.off, undone], [['line erase'], 0])
})

test('a feature that works runs, keeps its result and warns nothing', (t) => {
  const { step, warned, restore } = newFeature()
  t.after(restore)
  assert.equal(step.run(() => 42, () => 'fallback'), 42)
  assert.deepEqual(warned, [])
})

test('a wrapper whose own code throws after SudokuPad\'s call answers with that call\'s result, without calling it twice, and is stock from then on', (t) => {
  const { step, warned, restore } = newFeature()
  t.after(restore)
  const calls = []
  let ownRuns = 0
  const owner = { click (n) { calls.push(n); return n * 10 } }
  step.wrap(owner, 'click', (stock, n) => { ownRuns++; stock(n); throw new Error('own') })
  assert.equal(owner.click(1), 10)
  assert.deepEqual(calls, [1])
  assert.equal(owner.click(2), 20)
  assert.deepEqual(calls, [1, 2])
  assert.equal(ownRuns, 1, 'the wrapper\'s own code does not run once the feature is off')
  assert.equal(warned.length, 1)
})

test('a wrapper whose own code throws after another SudokuPad function ran for the event does not call the original', (t) => {
  const { step, warned, restore } = newFeature()
  t.after(restore)
  const sent = []
  const owner = { click () { sent.push('stock click') }, send (act) { sent.push(act) } }
  step.wrap(owner, 'click', function (stock) { stock.sudokupad(() => this.send('mark')); throw new Error('own') })
  assert.equal(owner.click(), undefined)
  assert.deepEqual(sent, ['mark'], 'the click is not sent a second time')
  assert.equal(warned.length, 1)
})

test('a wrapper whose own code throws after a SudokuPad call that sends nothing still calls the original', (t) => {
  const { step, restore } = newFeature()
  t.after(restore)
  const sent = []
  const owner = { click () { sent.push('stock click') }, peek () { return 'queued' } }
  step.wrap(owner, 'click', function (stock) { stock.sudokupad(() => this.peek(), false); throw new Error('own') })
  owner.click()
  assert.deepEqual(sent, ['stock click'])
})

test('a throw from a SudokuPad function called through stock.sudokupad passes through, is not retried and leaves the feature on', (t) => {
  const { step, guard, warned, restore } = newFeature()
  t.after(restore)
  const stockError = new TypeError('render failed')
  const sent = []
  const owner = { click () { sent.push('stock click') }, send (act) { sent.push(act); throw stockError } }
  step.wrap(owner, 'click', function (stock) { stock.sudokupad(() => this.send('mark')) })
  assert.throws(() => owner.click(), (error) => error === stockError)
  assert.deepEqual(sent, ['mark'])
  assert.deepEqual([warned, guard.off], [[], []])
})

test('a wrapper whose own code throws before SudokuPad\'s call makes that call with the arguments it was given', (t) => {
  const { step, restore } = newFeature()
  t.after(restore)
  const owner = { name: 'pen', click (n) { return `${this.name} ${n}` } }
  step.wrap(owner, 'click', () => { throw new Error('own') })
  assert.equal(owner.click(3), 'pen 3')
})

test('a throw in SudokuPad\'s own function passes through a wrapper and leaves the feature on', (t) => {
  const { step, guard, warned, restore } = newFeature()
  t.after(restore)
  const stockError = new TypeError('SudokuPad broke')
  let fail = true
  const owner = { click () { if (fail) throw stockError; return 'stock' } }
  step.wrap(owner, 'click', (stock) => `own ${stock()}`)
  assert.throws(() => owner.click(), (error) => error === stockError)
  fail = false
  assert.equal(owner.click(), 'own stock')
  assert.deepEqual([warned, guard.off], [[], []])
})

// The notice bar.
const missingErase = () => {
  const roots = withColors()
  delete roots.Framework.app.xyToRCExact
  return roots
}

test('SudokuPad\'s version is the first ?v= in the page, and null on a page with none', () => {
  assert.equal(sudokupadVersion(fakeDocument()), '0.611.0')
  assert.equal(sudokupadVersion(fakeDocument('<script src="/script.js"></script>')), null)
})

test('a feature off shows one bar naming the script and the feature, with a Report link', (t) => {
  const { doc, restore } = started({ roots: missingErase() })
  t.after(restore)
  const [bar] = bars(doc)
  assert.equal(bars(doc).length, 1)
  assert.match(textOf(bar), /^Pen Tool Extras: line erase is off — SudokuPad changed\.Report/)
  assert.equal(linkOf(bar).textContent, 'Report')
})

test('several features off share one bar', (t) => {
  const roots = missingErase()
  delete roots.ToolPen
  const { doc, restore } = started({ roots })
  t.after(restore)
  assert.equal(bars(doc).length, 1)
  assert.match(textOf(bars(doc)[0]), /^Pen Tool Extras: arrow lines, line erase are off — SudokuPad changed\./)
})

test('a feature that throws later joins the bar', (t) => {
  const { guard, doc, restore } = started({ roots: missingErase() })
  t.after(restore)
  guard.features.colors.run(() => { throw new Error('own') })
  assert.equal(bars(doc).length, 1)
  assert.match(textOf(bars(doc)[0]), /^Pen Tool Extras: line erase, colors are off/)
})

test('a dismissed bar goes, and is not shown again under the same SudokuPad version', (t) => {
  const first = started({ roots: missingErase() })
  t.after(first.restore)
  dismissOf(bars(first.doc)[0]).click()
  assert.equal(bars(first.doc).length, 0)
  const again = started({ roots: missingErase(), store: first.store })
  assert.equal(bars(again.doc).length, 0)
})

test('a Framework with no getData or setData still shows the bar and warns, and a dismissal holds for the page load', (t) => {
  const first = started({ roots: missingErase(), store: {} })
  t.after(first.restore)
  assert.equal(bars(first.doc).length, 1)
  assert.equal(first.warned.length > 0, true)
  dismissOf(bars(first.doc)[0]).click()
  assert.equal(bars(first.doc).length, 0)
  first.guard.features.colors.run(() => { throw new Error('own') })
  assert.match(textOf(bars(first.doc)[0]), /^Pen Tool Extras: colors is off/)
})

test('a store that throws still shows the bar, warns once, keeps every feature\'s fallback, and a dismissal holds for the page load', (t) => {
  const blocked = new Error('storage blocked')
  const store = { getData () { throw blocked }, setData () { throw blocked } }
  const first = started({ roots: missingErase(), store })
  t.after(first.restore)
  assert.equal(bars(first.doc).length, 1)
  assert.equal(first.guard.features.colors.run(() => { throw new Error('own') }, () => 'fallback'), 'fallback')
  assert.match(textOf(bars(first.doc)[0]), /^Pen Tool Extras: line erase, colors are off/)
  dismissOf(bars(first.doc)[0]).click()
  assert.equal(bars(first.doc).length, 0)
  assert.deepEqual(first.warned.filter(([text]) => /dismissal/.test(text)), [['pen-tool-extras: a dismissal of the notice bar cannot be saved, so it holds for this page load only:', blocked]])
})

test('a page with no SudokuPad version saves no dismissal, so the next page with none shows the bar again', (t) => {
  const noVersion = () => fakeDocument('<script src="/script.js"></script>')
  const first = started({ roots: missingErase(), doc: noVersion() })
  t.after(first.restore)
  dismissOf(bars(first.doc)[0]).click()
  assert.equal(bars(first.doc).length, 0)
  const next = started({ roots: missingErase(), store: first.store, doc: noVersion() })
  assert.equal(bars(next.doc).length, 1)
})

test('a dismissal covers only the features it was shown for', (t) => {
  const first = started({ roots: missingErase() })
  t.after(first.restore)
  dismissOf(bars(first.doc)[0]).click()
  first.guard.features.colors.run(() => { throw new Error('own') })
  assert.match(textOf(bars(first.doc)[0]), /^Pen Tool Extras: colors is off/)
})

test('a new SudokuPad version shows a dismissed feature again', (t) => {
  const first = started({ roots: missingErase() })
  t.after(first.restore)
  dismissOf(bars(first.doc)[0]).click()
  const next = started({ roots: missingErase(), store: first.store, doc: fakeDocument('<script src="/script.js?v=0.612.0"></script>') })
  assert.equal(bars(next.doc).length, 1)
})

test('the Report link opens a new issue filled in with the script, the feature, the internal and SudokuPad\'s version', (t) => {
  const { doc, restore } = started({ roots: missingErase() })
  t.after(restore)
  const url = new URL(linkOf(bars(doc)[0]).href)
  assert.equal(url.origin + url.pathname, 'https://github.com/caneff/sudokupad-scripts/issues/new')
  assert.equal(url.searchParams.get('title'), 'Pen Tool Extras: line erase off on SudokuPad 0.611.0')
  assert.equal(url.searchParams.get('body'), [
    'Script: Pen Tool Extras 1.2.3',
    'SudokuPad version: 0.611.0',
    '',
    '- line erase: SudokuPad has no Framework.app.xyToRCExact'
  ].join('\n'))
})

test('a report names the error of a feature turned off by a throw, and "unknown" for a page with no version', () => {
  const url = new URL(reportUrl({ name: 'Pen Tool Extras', version: '1.2.3', sudokupad: null, off: [{ label: 'marks', why: new TypeError('x is not a function') }] }))
  assert.equal(url.searchParams.get('title'), 'Pen Tool Extras: marks off on SudokuPad unknown')
  assert.match(url.searchParams.get('body'), /\n- marks: TypeError: x is not a function\n/)
})

// The error log: one record each time a feature is turned off, whether or not the bar shows.
const loggedBy = (storage) => JSON.parse(storage.getItem(ERROR_LOG_KEY))

test('a throw in a guarded feature appends one record with the message and the stack', (t) => {
  const pageStorage = useStorage(memoryStorage())
  const { guard, restore } = started({ roots: withColors() })
  t.after(restore)
  const boom = new TypeError('x is not a function')
  guard.features.arrowLines.run(() => { throw boom })
  guard.features.arrowLines.run(() => { throw boom })
  const [record, ...rest] = loggedBy(pageStorage)
  assert.deepEqual(rest, [])
  assert.match(record.time, /^\d{4}-\d\d-\d\dT[\d:.]+Z$/)
  assert.deepEqual({ ...record, time: undefined }, {
    time: undefined,
    script: 'pen-tool-extras',
    version: '1.2.3',
    sudokupad: '0.611.0',
    feature: 'arrow lines',
    url: 'https://sudokupad.app/test',
    name: 'TypeError',
    message: 'x is not a function',
    stack: boom.stack
  })
})

test('a missing internal appends one record naming it, and a feature the bar no longer shows still logs', (t) => {
  const pageStorage = useStorage(memoryStorage())
  const roots = withColors()
  delete roots.Framework.app.xyToRCExact
  const doc = fakeDocument()
  const store = fakeStore({ 'pen-tool-extras-notice': { version: '0.611.0', features: ['lineErase'] } })
  const { restore } = started({ roots, doc, store })
  t.after(restore)
  assert.equal(bars(doc).length, 0)
  const [record, ...rest] = loggedBy(pageStorage)
  assert.deepEqual(rest, [])
  assert.deepEqual({ feature: record.feature, missing: record.missing, sudokupad: record.sudokupad, message: record.message }, { feature: 'line erase', missing: 'Framework.app.xyToRCExact', sudokupad: '0.611.0', message: undefined })
})

test('the log keeps the newest 50 records', (t) => {
  const pageStorage = useStorage(memoryStorage())
  const old = Array.from({ length: ERROR_LOG_LIMIT }, (_, n) => ({ feature: `old ${n}` }))
  pageStorage.setItem(ERROR_LOG_KEY, JSON.stringify(old))
  const { guard, restore } = started({ roots: withColors() })
  t.after(restore)
  guard.features.colors.run(() => { throw new Error('new') })
  const kept = loggedBy(pageStorage)
  assert.equal(kept.length, ERROR_LOG_LIMIT)
  assert.deepEqual([kept[0].feature, kept[ERROR_LOG_LIMIT - 2].feature, kept[ERROR_LOG_LIMIT - 1].feature], ['old 1', 'old 49', 'colors'])
})

test('blocked storage does not throw; the feature still goes off and the failure is warned', (t) => {
  useStorage(blockedStorage())
  const { guard, warned, restore } = started({ roots: withColors() })
  t.after(restore)
  assert.doesNotThrow(() => guard.features.colors.run(() => { throw new Error('new') }))
  assert.deepEqual(guard.off, ['colors'])
  assert.equal(warned.filter(([text]) => /error log cannot be saved/.test(text)).length, 1)
})

test('an unreadable log is left as it is, not written over', (t) => {
  const pageStorage = useStorage(memoryStorage())
  pageStorage.setItem(ERROR_LOG_KEY, '{not json')
  const { guard, restore } = started({ roots: withColors() })
  t.after(restore)
  guard.features.colors.run(() => { throw new Error('new') })
  assert.equal(pageStorage.getItem(ERROR_LOG_KEY), '{not json')
  assert.throws(() => readErrorLog(pageStorage))
})

test('the log has one key for every script, and a storage with no log reads as an empty one', () => {
  assert.equal(ERROR_LOG_KEY, 'sudokupad-scripts-error-log')
  assert.deepEqual(readErrorLog(memoryStorage()), [])
})

test('a saved log that is valid JSON but not a list is refused, not read as empty', () => {
  for (const saved of ['{"a":1}', 'null', '"text"']) {
    const storage = memoryStorage()
    storage.setItem(ERROR_LOG_KEY, saved)
    assert.throws(() => readErrorLog(storage), /not a list/, saved)
  }
})

test('a missing internal already logged for this script version and SudokuPad version is not logged again on the next load', (t) => {
  const pageStorage = useStorage(memoryStorage())
  const roots = withColors()
  delete roots.Framework.app.xyToRCExact
  for (let load = 0; load < 3; load++) {
    const { restore } = started({ roots })
    restore()
  }
  assert.equal(loggedBy(pageStorage).length, 1)
  const { guard, restore } = started({ roots, doc: fakeDocument('<script src="/script.js?v=0.612.0"></script>') })
  t.after(restore)
  assert.equal(loggedBy(pageStorage).length, 2, 'a new SudokuPad version is a new record')
  guard.features.colors.run(() => { throw new Error('one') })
  assert.equal(loggedBy(pageStorage).length, 3)
})

test('a throw is logged every time it happens, since each is a new fact', () => {
  const pageStorage = useStorage(memoryStorage())
  for (let load = 0; load < 2; load++) {
    const { guard, restore } = started({ roots: withColors() })
    restore()
    guard.features.colors.run(() => { throw new Error('same') })
  }
  assert.equal(loggedBy(pageStorage).length, 2)
})

test('blocked storage is warned once, however many features go off after it', (t) => {
  useStorage(blockedStorage())
  const { guard, warned, restore } = started({ roots: withColors() })
  t.after(restore)
  guard.features.colors.run(() => { throw new Error('one') })
  guard.features.arrowLines.run(() => { throw new Error('two') })
  assert.deepEqual(guard.off, ['colors', 'arrow lines'])
  assert.equal(warned.filter(([text]) => /error log cannot be saved/.test(text)).length, 1)
})

test('a stack with only frames (Firefox) gets the error line above it, even when the message appears in a frame', () => {
  const text = formatErrorLog([{ time: 't', script: 's', version: '1', sudokupad: '2', feature: 'f', url: 'u', name: 'TypeError', message: 'draw', stack: 'draw@https://sudokupad.app/x.js:1:1' }])
  assert.match(text, /\n {2}TypeError: draw\n {2}draw@https:\/\/sudokupad\.app\/x\.js:1:1$/)
})

test('the formatted log lists the newest record first, with its stack, and says so when empty', () => {
  assert.equal(formatErrorLog([]), 'The error log is empty.')
  const text = formatErrorLog([
    { time: '2026-11-08T10:00:00.000Z', script: 'draw-tool', version: '1.0.0', sudokupad: '0.37.2', feature: 'older', url: 'https://u/1', missing: 'Framework.app.x' },
    { time: '2026-11-08T11:00:00.000Z', script: 'dark-page', version: '2.0.1', sudokupad: null, feature: 'newer', url: 'https://u/2', name: 'Error', message: 'boom', stack: 'Error: boom\n    at f (x.js:1:1)' }
  ])
  assert.match(text, /dark-page@2\.0\.1 on SudokuPad unknown: newer[\s\S]*draw-tool@1\.0\.0 on SudokuPad 0\.37\.2: older/)
  assert.match(text, /2026-11-08T11:00:00.000Z dark-page@2.0.1 on SudokuPad unknown: newer\n {2}https:\/\/u\/2\n {2}Error: boom\n {6}at f \(x.js:1:1\)/)
  assert.match(text, /draw-tool@1.0.0 on SudokuPad 0.37.2: older\n {2}https:\/\/u\/1\n {2}SudokuPad has no Framework.app.x/)
})

test('the Report body carries the stack under the error', () => {
  const error = new TypeError('x is not a function')
  const body = new URL(reportUrl({ name: 'Pen Tool Extras', version: '1.2.3', sudokupad: '0.611.0', off: [{ label: 'marks', why: error }] })).searchParams.get('body')
  assert.match(body, /\n- marks: TypeError: x is not a function\n {4}at /)
  assert.equal(body.split('TypeError: x is not a function').length, 2, 'the message is not repeated by the stack')
})

test('a long stack is cut in the Report body, so the link stays short', () => {
  const error = new Error('deep')
  error.stack = `Error: deep\n${'    at frame (x.js:1:1)\n'.repeat(500)}`
  const body = new URL(reportUrl({ name: 'Pen Tool Extras', version: '1.2.3', sudokupad: '0.611.0', off: [{ label: 'marks', why: error }] })).searchParams.get('body')
  assert.match(body, /\n- marks: Error: deep\n {4}at frame/)
  assert.equal(body.length < 1400, true, `the body is ${body.length} characters`)
})
