'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// lib/ files are plain statements that sync-lib.js pastes into a script, so the test evaluates the text.
const { createStep, start } = new Function(`${fs.readFileSync(path.join(__dirname, 'steps.js'), 'utf8')}\nreturn { createStep, start }`)() // eslint-disable-line no-new-func

// The console lines a test makes, as each call's arguments, with `Framework` set for start() to find.
function capture (t, framework) {
  const lines = { warn: [], error: [] }
  const saved = { warn: console.warn, error: console.error }
  console.warn = (...args) => lines.warn.push(args)
  console.error = (...args) => lines.error.push(args)
  if (framework !== undefined) global.Framework = framework
  t.after(() => {
    Object.assign(console, saved)
    delete global.Framework
  })
  return lines
}

const sudokupad = (app = {}) => ({ app, getApp: () => Promise.resolve() })

test('start: a step that throws is skipped with its line, and the steps after it still run', async (t) => {
  const lines = capture(t, sudokupad())
  const skipped = []
  const ran = []
  const boom = new TypeError('x is not a function')
  const one = createStep('demo', 'one', skipped)
  const two = createStep('demo', 'two', skipped)
  const three = createStep('demo', 'three', skipped)
  await start('demo', {
    requires: () => [],
    steps: () => [
      [one, () => ran.push('one')],
      [two, () => { throw boom }],
      [three, () => ran.push('three')]
    ]
  })
  assert.deepEqual(ran, ['one', 'three'])
  assert.deepEqual(skipped, ['two'])
  assert.deepEqual(lines.warn, [['demo: two skipped: SudokuPad changed:', boom]])
  assert.deepEqual(lines.error, [])
})

// A step with its warnings and skipped labels caught.
const newStep = (t, onSkip) => {
  const skipped = []
  const warned = capture(t).warn
  return { step: createStep('pen-tool-extras', 'marks', skipped, onSkip), warned, skipped }
}

test('a throw in a step\'s own code skips it, warns once naming it, and the fallback answers from then on', (t) => {
  const { step, warned, skipped } = newStep(t)
  const boom = new TypeError('x is not a function')
  let runs = 0
  const run = () => { runs++; throw boom }
  assert.equal(step.run(run, () => 'fallback'), 'fallback')
  assert.equal(step.run(run, () => 'again'), 'again')
  assert.equal(runs, 1, 'a skipped step is not run again')
  assert.deepEqual(warned, [['pen-tool-extras: marks skipped: SudokuPad changed:', boom]])
  assert.deepEqual(skipped, ['marks'])
})

test('a step that works runs, keeps its result and warns nothing', (t) => {
  const { step, warned } = newStep(t)
  assert.equal(step.run(() => 42, () => 'fallback'), 42)
  assert.deepEqual(warned, [])
})

test('a wrapper whose own code throws after SudokuPad\'s call answers with that call\'s result, without calling it twice, and is stock from then on', (t) => {
  const { step, warned } = newStep(t)
  const calls = []
  let ownRuns = 0
  const owner = { click (n) { calls.push(n); return n * 10 } }
  step.wrap(owner, 'click', (stock, n) => { ownRuns++; stock(n); throw new Error('own') })
  assert.equal(owner.click(1), 10)
  assert.deepEqual(calls, [1])
  assert.equal(owner.click(2), 20)
  assert.deepEqual(calls, [1, 2])
  assert.equal(ownRuns, 1, 'the wrapper\'s own code does not run once the step is skipped')
  assert.equal(warned.length, 1)
})

test('a wrapper whose own code throws after another SudokuPad function ran for the event does not call the original', (t) => {
  const { step, warned } = newStep(t)
  const sent = []
  const owner = { click () { sent.push('stock click') }, send (act) { sent.push(act) } }
  step.wrap(owner, 'click', function (stock) { stock.sudokupad(() => this.send('mark')); throw new Error('own') })
  assert.equal(owner.click(), undefined)
  assert.deepEqual(sent, ['mark'], 'the click is not sent a second time')
  assert.equal(warned.length, 1)
})

test('a wrapper whose own code throws after a SudokuPad call that sends nothing still calls the original', (t) => {
  const { step } = newStep(t)
  const sent = []
  const owner = { click () { sent.push('stock click') }, peek () { return 'queued' } }
  step.wrap(owner, 'click', function (stock) { stock.sudokupad(() => this.peek(), false); throw new Error('own') })
  owner.click()
  assert.deepEqual(sent, ['stock click'])
})

test('a throw from a SudokuPad function called through stock.sudokupad passes through, is not retried and leaves the step on', (t) => {
  const { step, warned, skipped } = newStep(t)
  const stockError = new TypeError('render failed')
  const sent = []
  const owner = { click () { sent.push('stock click') }, send (act) { sent.push(act); throw stockError } }
  step.wrap(owner, 'click', function (stock) { stock.sudokupad(() => this.send('mark')) })
  assert.throws(() => owner.click(), (error) => error === stockError)
  assert.deepEqual(sent, ['mark'])
  assert.deepEqual([warned, skipped], [[], []])
})

test('a wrapper whose own code throws before SudokuPad\'s call makes that call with the arguments it was given', (t) => {
  const { step } = newStep(t)
  const owner = { name: 'pen', click (n) { return `${this.name} ${n}` } }
  step.wrap(owner, 'click', () => { throw new Error('own') })
  assert.equal(owner.click(3), 'pen 3')
})

test('a throw in SudokuPad\'s own function passes through a wrapper and leaves the step on', (t) => {
  const { step, warned, skipped } = newStep(t)
  const stockError = new TypeError('SudokuPad broke')
  let fail = true
  const owner = { click () { if (fail) throw stockError; return 'stock' } }
  step.wrap(owner, 'click', (stock) => `own ${stock()}`)
  assert.throws(() => owner.click(), (error) => error === stockError)
  fail = false
  assert.equal(owner.click(), 'own stock')
  assert.deepEqual([warned, skipped], [[], []])
})

test('a step skipped puts back what it changed once, and a failure there is warned, not thrown', (t) => {
  let undone = 0
  const { step, warned } = newStep(t, () => { undone++; throw new Error('undo') })
  step.run(() => { throw new Error('own') })
  step.skip(new Error('again'))
  assert.equal(undone, 1)
  assert.equal(warned.length, 2)
  assert.match(warned[1][0], /^pen-tool-extras: could not undo marks/)
})

test('a step that lacks a member is skipped with one line naming it, and puts nothing back: nothing was installed', (t) => {
  let undone = 0
  const { step, warned, skipped } = newStep(t, () => { undone++ })
  step.lack('getInputRc')
  step.lack('getCell')
  assert.equal(step.run(() => 'ran', () => 'fallback'), 'fallback')
  assert.deepEqual([warned, skipped, undone], [[['pen-tool-extras: marks skipped: SudokuPad has no getInputRc']], ['marks'], 0])
})

test('start: a step that lacks a member is skipped with the named line and never installed; the others install', async (t) => {
  const app = { grid: { rows: 9 } }
  const lines = capture(t, sudokupad(app))
  const skipped = []
  const ran = []
  const marks = createStep('demo', 'marks', skipped)
  const pages = createStep('demo', 'pen pages', skipped)
  await start('demo', {
    requires: (seen) => [
      [marks, [['grid.rows', Number.isInteger(seen.grid.rows)], ['grid.getCell', typeof seen.grid.getCell === 'function']]],
      [pages, [['grid.rows', Number.isInteger(seen.grid.rows)]]]
    ],
    steps: () => [[marks, () => ran.push('marks')], [pages, () => ran.push('pages')]]
  })
  assert.deepEqual(ran, ['pages'])
  assert.deepEqual(skipped, ['marks'])
  assert.deepEqual(lines.warn, [['demo: marks skipped: SudokuPad has no grid.getCell']])
})

test('start: steps install in the order listed, each given the app', async (t) => {
  const app = { name: 'app' }
  capture(t, sudokupad(app))
  const ran = []
  const steps = ['c', 'a', 'b'].map((label) => [createStep('demo', label, []), (seen) => ran.push(`${label} ${seen.name}`)])
  await start('demo', { requires: () => [], steps: () => steps })
  assert.deepEqual(ran, ['c app', 'a app', 'b app'])
})

test('start: a throw outside any step is logged as an error naming the script, and no step installs', async (t) => {
  const lines = capture(t, sudokupad())
  const boom = new TypeError('no tool')
  let ran = false
  await start('demo', { requires: () => { throw boom }, steps: () => [[createStep('demo', 'one', []), () => { ran = true }]] })
  assert.equal(ran, false)
  assert.deepEqual(lines.error, [['demo: startup failed:', boom]])
  assert.deepEqual(lines.warn, [])
})

test('start: a getApp that rejects is logged as a startup failure', async (t) => {
  const boom = new Error('no app')
  const lines = capture(t, { getApp: () => Promise.reject(boom) })
  await start('demo', { requires: () => [], steps: () => [] })
  assert.deepEqual(lines.error, [['demo: startup failed:', boom]])
})

test('start: a step whose install rejects later is skipped with its line, and the steps after it do not wait for it', async (t) => {
  const lines = capture(t, sudokupad())
  const skipped = []
  const ran = []
  const boom = new Error('late')
  let fail
  const late = createStep('demo', 'late', skipped)
  const done = start('demo', {
    requires: () => [],
    steps: () => [
      [late, () => new Promise((resolve, reject) => { fail = () => reject(boom) })],
      [createStep('demo', 'next', skipped), () => ran.push('next')]
    ]
  })
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(ran, ['next'], 'the next step ran while the first still waited')
  fail()
  await done
  assert.deepEqual(skipped, ['late'])
  assert.deepEqual(lines.warn, [['demo: late skipped: SudokuPad changed:', boom]])
  assert.deepEqual(lines.error, [])
})

test('start: a Framework with no getApp is reported once, naming the script, and a page with no Framework is left alone', (t) => {
  const lines = capture(t, {})
  assert.equal(start('demo', { requires: () => [], steps: () => [] }), undefined)
  assert.deepEqual(lines.warn, [['demo: SudokuPad\'s Framework has no getApp, so nothing was changed']])
  delete global.Framework
  lines.warn.length = 0
  assert.equal(start('demo', { requires: () => [], steps: () => [] }), undefined)
  assert.deepEqual(lines.warn, [])
})
