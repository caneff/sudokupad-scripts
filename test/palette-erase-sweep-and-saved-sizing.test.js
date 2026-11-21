'use strict'
// Color by Digit reading SudokuPad's palette through the lib (a bad page reported, its pulldowns on the lib's select rule, its swatch grid on the lib's columns)
// and building one plan-cell shape; Pen Tool Extras' erase sweep taking the cell size as an argument, with a line beating a mark and a fast drag sampled across
// a line; Auto Rules Resizer saving only what its fit applied, at the `npm test` seam.
// Blind to real SudokuPad: the Framework calls (the color tool's palette, the eraser's pointer events, the rules pane's fit and the f+/f-
// buttons), rendering (the dialog's pulldowns, the swatch grid) and a reload of a saved sizing. `npm run test:live` covers them on
// sudokupad.app: live/color-by-digit/, live/pen-tool-extras/pen-tool-extras-erase.live.mjs and live/auto-rules-resizer/ (an f+ while the
// fit bails saves nothing).
const test = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { fakeStore } = require('./fake-store.js')

const ROOT = join(__dirname, '..')
const colorByDigit = require(join(ROOT, 'color-by-digit.user.js'))
const penToolExtras = require(join(ROOT, 'pen-tool-extras.user.js'))
const autoRulesResizer = require(join(ROOT, 'auto-rules-resizer.user.js'))

const withFramework = (Framework, run) => {
  const was = global.Framework
  const warn = console.warn
  const warnings = []
  global.Framework = Framework
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    return run(warnings)
  } finally {
    global.Framework = was
    console.warn = warn
  }
}

test('Color by Digit reports a bad palette page and shows no colors, and reads a good one onto the lib\'s columns', () => {
  const red = () => 'rgb(255, 0, 0)'
  withFramework({ app: { tools: { colour: { palette: { pages: [['a'], 'oops'] }, currentPage: 0 } } } }, (warnings) => {
    assert.deepEqual(colorByDigit.readPalette(red), [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /^color-by-digit: .*no pages of color keys/)
  })
  withFramework({ app: { tools: { colour: { palette: { pages: [['0', '1', '2', '3', '4']] }, currentPage: 0 } } } }, (warnings) => {
    const [page] = colorByDigit.readPalette(red)
    const libColumns = Number(colorByDigit.STYLE_CSS.match(/\.cbd-swatches \{[^}]*grid-template-columns: repeat\((\d+), /)[1])
    assert.equal(page.rows[0].length, libColumns)
    assert.deepEqual(page.rows[0].map((slot) => slot.key), ['1', '2', '3'])
    assert.deepEqual(warnings, [])
  })
})

test('Color by Digit\'s pulldowns take the lib\'s select rule and the editor holds no copy of it', () => {
  const state = colorByDigit.stateFromStored(fakeStore())
  const selects = colorByDigit.renderPulldowns(state, 'cell').match(/<select [^>]*>/g)
  assert.equal(selects.length, 3)
  for (const select of selects) assert.match(select, /class="cbd-color-choice"/)
  assert.doesNotMatch(colorByDigit.STYLE_CSS, /\.cbd-pulldown select/)
})

test('Color by Digit builds one plan-cell shape, and a given beats an entered value', () => {
  const raw = { given: '1', value: '3', colours: null, pencilmarks: [], propVisible: () => true, propGet: () => null }
  const cell = colorByDigit.toPlanCell(raw)
  assert.deepEqual(Object.keys(cell).sort(), ['centre', 'colours', 'fogged', 'given', 'value'])
  assert.deepEqual(colorByDigit.planColoring([cell], [{ key: 'a', digits: ['1'] }, { key: 'b', digits: ['3'] }]), [{ index: 0, key: 'a' }])
  assert.equal('saveProfiles' in colorByDigit, false)
})

test('Pen Tool Extras\' erase sweep: a line beats a mark at one point, and a long jump across a line takes it', () => {
  const { crossPoint, crossTo } = penToolExtras
  const line = { value: '1', row: 0, col: 0, color: '1' }
  const fresh = (at = { r: 0, c: 0 }) => ({ segments: [line], lines: new Set(), marks: new Map(), at })
  const everywhere = () => ({ cell: 'cell', values: ['x'] })
  const onLine = fresh()
  crossPoint(everywhere, onLine, { r: 0.5, c: 1.0 }, 100)
  assert.deepEqual([onLine.lines.size, onLine.marks.size], [1, 0])
  const jump = fresh({ r: 0.5, c: 0 })
  crossTo(() => null, jump, { r: 0.5, c: 3 }, 100)
  assert.equal(jump.lines.size, 1, 'a fast drag is sampled along its way, so a line between two events is taken')
})

test('Auto Rules Resizer saves a capped step as capped, and a fit that bails saves nothing', () => {
  const { stepSizing, loadSizing, noRulesDrag } = autoRulesResizer
  const saved = { fontOffsetPx: 1, box: noRulesDrag() }
  const store = fakeStore()
  const capped = { puzzle: 'p', wanted: saved, applied: saved }
  stepSizing(store, capped, 'fontOffsetPx', (px) => px + 2, () => { capped.applied = { ...saved, fontOffsetPx: 2 }; return capped.applied })
  assert.equal(loadSizing(store, 'p').fontOffsetPx, 2)
  const bailed = { puzzle: 'q', wanted: saved, applied: saved }
  stepSizing(store, bailed, 'fontOffsetPx', (px) => px + 2, () => null)
  assert.equal(store.getData(`${autoRulesResizer.SIZING_KEY_PREFIX}q`), null)
  assert.deepEqual(bailed.wanted, saved)
})
