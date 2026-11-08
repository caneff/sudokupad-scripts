'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text.
const NAMES = ['createGuard', 'lackingInternals', 'sudokupadVersion', 'reportUrl']
const { createGuard, lackingInternals, sudokupadVersion, reportUrl } =
  new Function(`${fs.readFileSync(path.join(__dirname, 'sudokupad.js'), 'utf8')}\nreturn { ${NAMES.join(', ')} }`)() // eslint-disable-line no-new-func

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
    const guard = createGuard({ script: 'pen-tool-extras', name: 'Pen Tool Extras', version: '1.2.3', color: '#6a1b9a', features })
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
  assert.match(url.searchParams.get('body'), /\n- marks: TypeError: x is not a function$/)
})
