'use strict'
// Spec #687's closing test: Pen Tool Extras' one arrowHeads, pen CSS from COLOR_CHARS and one marksAtPoint, Color by Digit's editState and one chipRun frame,
// the glossary renames and UI Tweaks' typed-out keys, and Auto Rules Resizer's sizing kept per puzzle, driven at the `npm test` seam over each script's pure
// functions and its own source.
// Blind to real SudokuPad: the Framework calls, rendering and undo. The live suites cover them on sudokupad.app: auto-rules-resizer (a resized puzzle reloads with
// its sizing, puzzle B opens at the default after A, Restore defaults), pen-tool-extras-erase and pen-tool-extras-marks (the click and the erase through
// marksAtPoint), pen-tool-extras-arrow-lines (the arrow heads), settings-shell (the Auto Rules Resizer dialog's buttons) and sudokupad-attacks (blocked storage).
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { fakeStore, quietly } = require('../fake-store.js')
const pen = require('../../pen-tool-extras.user.js')
const cbd = require('../../color-by-digit.user.js')
const arr = require('../../auto-rules-resizer.user.js')
const darkPage = require('../../dark-page.user.js')
const uiTweaks = require('../../ui-tweaks.user.js')

const source = (script) => readFileSync(join(__dirname, '..', '..', `${script}.user.js`), 'utf8')
// The body of the script's function `name`, to the closing brace at its own indent.
const body = (text, name) => {
  const match = text.match(new RegExp(`\\n( *)function ${name} \\(.*\\) \\{\\n([\\s\\S]*?)\\n\\1\\}`))
  assert.ok(match, `function ${name} is in the script`)
  return match[2]
}

test('#697: one arrowHeads serves arrowRun and the swatch arrows, and the pen CSS reads COLOR_CHARS', () => {
  const text = source('pen-tool-extras')
  assert.equal(typeof pen.arrowHeads, 'function')
  assert.match(body(text, 'arrowRun'), /arrowHeads\(/, 'arrowRun')
  assert.match(text, /const swatchArrows = \(\) => arrowHeads\(/, 'the swatch arrows')
  assert.doesNotMatch(text, /function arrowCorners|function shrink/, 'the copies are gone')
  assert.equal('GREY_CHROMA' in pen, false, 'GREY_CHROMA is not exported')
  assert.match(text, /const DOT_FILL_CSS = \[\.\.\.COLOR_CHARS\]/)
  assert.match(body(text, 'buildPagesCss'), /COLOR_CHARS\.forEach/)
  assert.match(body(text, 'eraseActs'), /Map\.groupBy\(/)
  assert.doesNotMatch(body(text, 'stepType'), /throw/, 'stepType is one find with no unreachable throw')
  assert.match(body(text, 'stepType'), /\.find\(/)
})

test('#698: the click and the erase find marks through one marksAtPoint, and the plan wrappers are folded in', () => {
  const text = source('pen-tool-extras')
  assert.equal(typeof pen.marksAtPoint, 'function')
  assert.match(body(text, 'wrapClickCell'), /marksAtPointNow\(/, 'the click')
  assert.match(body(text, 'heldMarksAt'), /marksAtPointNow\(/, 'the erase')
  assert.match(body(text, 'marksAtPointNow'), /marksAtPoint\(/)
  for (const name of ['planCornerClick', 'planCellClick']) {
    assert.equal(name in pen, false, name)
    assert.doesNotMatch(text, new RegExp(`function ${name} `), name)
  }
})

test('#699: profile edits name their fields through editState, and renderChips takes the chips in one chipRun frame', () => {
  const text = source('color-by-digit')
  assert.doesNotMatch(text, /withProfiles/)
  assert.match(text, /function editState \(state, changes\)/)
  assert.equal(cbd.installButton.length, 5, 'installButton takes five parameters')
  assert.doesNotMatch(text, /digitProfileGroups/)
  assert.match(body(text, 'renderChips'), /chipRun\(/)
  assert.match(body(text, 'renderBlankChips'), /chipRun\(/)
  const groups = [{ key: 'a', digits: ['1', '2'] }]
  const svg = cbd.renderChips(cbd.shownChips('cell', groups, groups), () => '#c00', { size: 16, style: 'cell' })
  assert.match(svg, /^<svg/, 'chips drawn from the chips given')
})

test('#700: identifiers match the glossary and no stored key changed', () => {
  assert.equal(typeof cbd.setDigitGroup, 'function')
  assert.equal('setDigitColor' in cbd, false)
  assert.equal(typeof darkPage.PAGE, 'string')
  assert.equal('BOARD' in darkPage, false)
  assert.match(source('dark-page'), /const \{ savedPageColor, /, 'the saved color feature is savedPageColor')
  assert.match(source('pen-tool-extras'), /function renderLineModeButton/)
  assert.equal('KEYS' in uiTweaks, false, 'UI Tweaks has no KEYS export')
  const store = fakeStore()
  uiTweaks.saveOptions(store, { tab: false, hideSelect: true, wrapButtons: true })
  assert.deepEqual(Object.keys(store.data).sort(), ['UiTweaks_hideSelect', 'UiTweaks_tab', 'UiTweaks_wrapButtons'], 'UI Tweaks\' stored keys')
  assert.equal(darkPage.DATA_KEY, 'DarkPage_color', 'Dark Page\'s stored key')
  assert.match(source('auto-rules-resizer'), /addStyleOnce\(`\$\{ID\}-style`, STYLE\)/, 'Auto Rules Resizer adds its style through its copied addStyleOnce')
  assert.doesNotMatch(source('auto-rules-resizer'), /function addStyle \(/)
})

test('#701: a resized puzzle keeps its sizing, another puzzle starts at the default, and an unreadable sizing is kept aside', () => {
  const store = fakeStore()
  const sized = { fontOffsetPx: -0.8, box: { w: 120, h: 0, x: 0, y: 0 } }
  arr.saveSizing(store, 'puzzle-a', sized)
  assert.deepEqual(arr.loadSizing(store, 'puzzle-b'), arr.noSizing(), 'B, opened after A, is at the default')
  const reloaded = fakeStore(store.data)
  assert.deepEqual(arr.loadSizing(reloaded, 'puzzle-a'), sized, 'a reload of A keeps its font offset and pane, a fraction of a px included')
  assert.equal(store.data['AutoRulesResizer_sizing_puzzle-b'], undefined, 'a puzzle never resized saves nothing')

  const bad = { v: 0, data: { nudgePx: 'big', box: sized.box } }
  const broken = fakeStore({ 'AutoRulesResizer_sizing_puzzle-c': bad })
  const { result, warnings } = quietly(() => arr.loadSizing(broken, 'puzzle-c'))
  assert.deepEqual(result, arr.noSizing(), 'the puzzle starts at the default')
  assert.deepEqual(broken.data['AutoRulesResizer_sizing_puzzle-c_unreadable'], bad, 'the unreadable value is kept aside')
  assert.equal(warnings.length, 1)

  assert.match(readFileSync(join(__dirname, '..', '..', 'site', 'index.html'), 'utf8'), /kept per puzzle/, 'the site says sizing is kept per puzzle')
})
