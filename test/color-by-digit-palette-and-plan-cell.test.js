'use strict'
// Color by Digit reading SudokuPad's palette through the lib (a bad page reported, its pulldowns on the lib's select rule, its swatch grid on the lib's columns)
// and building one plan-cell shape, at the `npm test` seam.
// Blind to real SudokuPad: the Framework calls (the color tool's palette) and rendering (the dialog's pulldowns, the swatch grid). `npm run test:live`
// covers them on sudokupad.app: live/color-by-digit/.
const test = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { fakeStore } = require('./fake-store.js')

const colorByDigit = require(join(__dirname, '..', 'color-by-digit.user.js'))

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

test('Color by Digit and Text Anywhere report a bad palette the same way: one warning, under each script\'s id, with the same text, and no pages', () => {
  const textAnywhere = require('../text-anywhere.user.js')
  const bad = { app: { tools: { colour: { palette: { pages: [['a'], 'oops'] }, currentPage: 0 } } } }
  const byScript = {}
  withFramework(bad, (warnings) => {
    assert.deepEqual(colorByDigit.readPalette(() => 'rgb(255, 0, 0)'), [])
    byScript['color-by-digit'] = [...warnings]
  })
  withFramework(bad, (warnings) => {
    const { pages, note } = textAnywhere.dialogPalette(false)
    assert.deepEqual(pages, [])
    assert.equal(warnings[0], `text-anywhere: ${note}`)
    byScript['text-anywhere'] = [...warnings]
  })
  const unprefixed = (script) => byScript[script].map((line) => line.slice(`${script}: `.length))
  assert.equal(byScript['color-by-digit'].length, 1)
  assert.deepEqual(unprefixed('text-anywhere'), unprefixed('color-by-digit'))
  assert.match(byScript['color-by-digit'][0], /^color-by-digit: /)
  assert.match(byScript['text-anywhere'][0], /^text-anywhere: /)
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
