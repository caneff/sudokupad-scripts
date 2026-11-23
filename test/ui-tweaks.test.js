'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { fakeStore } = require('./fake-store.js')
const { OPTIONS, DIGIT_PAD_STEPS, DEFAULT_OPTIONS, readOptions, saveOptions, READERS, copiedSettings, pastedSettings, buildCss, pastedOptions, withInertTab, ignoreKey, isHeldTabToStop, lackingInternals, FEATURES, limitRightDrag, WHEEL_NOTCH, wheelDelta, accumulateWheel, steppedIndex } = require('../ui-tweaks.user.js')

test('the defaults: Tab never switches to letters and Right-drag pans only when zoomed in are on, the other three are off, the digit pad is Normal', () => {
  assert.deepEqual(DEFAULT_OPTIONS, { tab: true, hideSelect: false, wrapButtons: false, rightDrag: true, wheelMode: false, digitPad: 100 })
  assert.deepEqual(OPTIONS.map((o) => o.id), ['tab', 'hideSelect', 'wrapButtons', 'rightDrag', 'wheelMode'])
})

test('readOptions: nothing saved reads as the defaults', () => {
  assert.deepEqual(readOptions(fakeStore()), DEFAULT_OPTIONS)
})

test('readOptions: each saved boolean wins over its default, the others keep theirs', () => {
  assert.deepEqual(readOptions(fakeStore({ UiTweaks_tab: false })), { ...DEFAULT_OPTIONS, tab: false })
  assert.deepEqual(readOptions(fakeStore({ UiTweaks_hideSelect: true })), { ...DEFAULT_OPTIONS, hideSelect: true })
  assert.deepEqual(readOptions(fakeStore({ UiTweaks_wrapButtons: true })), { ...DEFAULT_OPTIONS, wrapButtons: true })
  assert.deepEqual(readOptions(fakeStore({ UiTweaks_rightDrag: false })), { ...DEFAULT_OPTIONS, rightDrag: false })
  assert.deepEqual(readOptions(fakeStore({ UiTweaks_wheelMode: true })), { ...DEFAULT_OPTIONS, wheelMode: true })
})

test('readOptions: a saved value that is not a boolean reads as the default', () => {
  const store = fakeStore({ UiTweaks_tab: 'no', UiTweaks_hideSelect: 1, UiTweaks_wrapButtons: null, UiTweaks_wheelMode: 'on' })
  assert.deepEqual(readOptions(store), DEFAULT_OPTIONS)
})

test('saveOptions keeps every option under its own key, and readOptions reads them back', () => {
  const store = fakeStore()
  const chosen = { tab: false, hideSelect: true, wrapButtons: true, rightDrag: false, wheelMode: true, digitPad: 125 }
  saveOptions(store, chosen)
  assert.deepEqual(store.data, { UiTweaks_tab: false, UiTweaks_hideSelect: true, UiTweaks_wrapButtons: true, UiTweaks_rightDrag: false, UiTweaks_wheelMode: true, UiTweaks_digitPad: 125 })
  assert.deepEqual(readOptions(store), chosen)
})

test('saveOptions leaves no key for an option at its default, and removes one saved earlier', () => {
  const store = fakeStore({ UiTweaks_tab: false, UiTweaks_hideSelect: true })
  saveOptions(store, { ...DEFAULT_OPTIONS, hideSelect: true })
  assert.deepEqual(store.data, { UiTweaks_hideSelect: true })
})

test('readOptions reads a key saved at its default without removing it', () => {
  const store = fakeStore({ UiTweaks_tab: true })
  assert.deepEqual(readOptions(store), DEFAULT_OPTIONS)
  assert.deepEqual(store.data, { UiTweaks_tab: true })
})

test('the storage keys are UiTweaks_ names', () => {
  assert.deepEqual(Object.fromEntries(OPTIONS.map((option) => [option.id, option.key])), { tab: 'UiTweaks_tab', hideSelect: 'UiTweaks_hideSelect', wrapButtons: 'UiTweaks_wrapButtons', rightDrag: 'UiTweaks_rightDrag', wheelMode: 'UiTweaks_wheelMode' })
})

test('copiedSettings: the options in force, defaults included', () => {
  assert.deepEqual(JSON.parse(copiedSettings(fakeStore({ UiTweaks_hideSelect: true, Other_key: 1 }))), { UiTweaks_tab: true, UiTweaks_hideSelect: true, UiTweaks_wrapButtons: false, UiTweaks_rightDrag: true, UiTweaks_wheelMode: false, UiTweaks_digitPad: 100 })
})

test('a paste keeps booleans under this script\'s keys and skips the rest', () => {
  const pasted = pastedSettings(JSON.stringify({ UiTweaks_tab: false, UiTweaks_hideSelect: 'yes', Other_key: 1 }), READERS)
  assert.deepEqual(pasted, { values: { UiTweaks_tab: false }, skipped: 1 })
})

test('buildCss: the defaults add no rule', () => {
  assert.equal(buildCss(DEFAULT_OPTIONS), '')
})

test('buildCss: Hide the Select button hides only that button, in the bottom row', () => {
  assert.equal(buildCss({ ...DEFAULT_OPTIONS, hideSelect: true }), '.controls-aux [data-control="select"] { display: none !important; }')
})

test('buildCss: Wrap buttons caps the bottom row at five buttons', () => {
  assert.equal(buildCss({ ...DEFAULT_OPTIONS, wrapButtons: true }), '.controls-aux { max-width: 21.6rem !important; }')
})

test('buildCss: both rules together; Tab adds none', () => {
  const css = buildCss({ ...DEFAULT_OPTIONS, tab: false, hideSelect: true, wrapButtons: true })
  assert.equal(css.split('\n').length, 2)
  assert.match(css, /display: none/)
  assert.match(css, /max-width: 21\.6rem/)
})

test('pastedOptions changes only the pasted options, whatever else is ticked in the dialog', () => {
  const saved = { ...DEFAULT_OPTIONS }
  assert.deepEqual(pastedOptions(saved, { UiTweaks_tab: false }), { ...saved, tab: false })
  assert.deepEqual(pastedOptions(saved, { UiTweaks_hideSelect: true, UiTweaks_wrapButtons: true, UiTweaks_digitPad: 80 }), { ...saved, hideSelect: true, wrapButtons: true, digitPad: 80 })
  assert.deepEqual(pastedOptions(saved, {}), saved)
  assert.deepEqual(saved, DEFAULT_OPTIONS, 'the options given are left as they were')
})

const toggle = () => {}
const typeLetter = () => {}
const inert = () => {}
const catchAll = () => true
// The three entries tool-letter.js declares, in its order.
const letterHandlers = () => [
  { key: '/', handler: toggle },
  { key: 'Tab', handler: toggle },
  { key: catchAll, handler: typeLetter }
]

test('withInertTab gives the Tab entry the inert handler and keeps "/" and the entry that types letters', () => {
  assert.deepEqual(withInertTab(letterHandlers(), inert), [
    { key: '/', handler: toggle },
    { key: 'Tab', handler: inert },
    { key: catchAll, handler: typeLetter }
  ])
})

test('withInertTab leaves the list it was given as it was, so it can be put back', () => {
  const given = letterHandlers()
  withInertTab(given, inert)
  assert.deepEqual(given, letterHandlers())
})

test('withInertTab keeps a Tab entry bound to some other handler', () => {
  const other = () => {}
  const given = [{ key: '/', handler: toggle }, { key: 'Tab', handler: toggle }, { key: 'Tab', handler: other }]
  assert.deepEqual(withInertTab(given, inert), [{ key: '/', handler: toggle }, { key: 'Tab', handler: inert }, { key: 'Tab', handler: other }])
})

test('withInertTab changes every Tab entry bound to the toggle', () => {
  const given = [{ key: '/', handler: toggle }, { key: 'Tab', handler: toggle }, { key: 'Tab', handler: toggle }]
  assert.deepEqual(withInertTab(given, inert), [{ key: '/', handler: toggle }, { key: 'Tab', handler: inert }, { key: 'Tab', handler: inert }])
})

test('withInertTab returns null when no Tab entry is bound to the toggle', () => {
  assert.equal(withInertTab([{ key: '/', handler: toggle }, { key: catchAll, handler: typeLetter }], inert), null, 'no Tab entry')
  assert.equal(withInertTab([{ key: 'Tab', handler: toggle }], inert), null, 'no "/" entry to name the toggle')
  assert.equal(withInertTab([{ key: '/', handler: toggle }, { key: 'Tab', handler: typeLetter }], inert), null, 'Tab bound to something else')
})

test('withInertTab returns null for no list, an empty list, or something else', () => {
  for (const given of [undefined, null, [], {}, 'Tab']) assert.equal(withInertTab(given, inert), null, String(given))
})

test('ignoreKey stops the key\'s default and nothing else', () => {
  const calls = []
  const result = ignoreKey({ preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation') })
  assert.deepEqual(calls, ['preventDefault'])
  assert.equal(result, undefined, 'a truthy return would tell SudokuPad the key is handled')
})

test('isHeldTabToStop stops only a repeated Tab, while the letter tool is on and no dialog is open', () => {
  const play = { toolOn: true, dialogOpen: false }
  assert.equal(isHeldTabToStop({ key: 'Tab', repeat: true }, play), true, 'held Tab in play')
  assert.equal(isHeldTabToStop({ key: 'Tab', repeat: false }, play), false, 'first Tab is the swapped entry\'s')
  assert.equal(isHeldTabToStop({ key: '/', repeat: true }, play), false, 'another key')
  assert.equal(isHeldTabToStop({ key: 'Tab', repeat: true }, { ...play, dialogOpen: true }), false, 'dialog open')
  assert.equal(isHeldTabToStop({ key: 'Tab', repeat: true }, { ...play, toolOn: false }), false, 'letter tool off')
})

const completeSudokuPad = () => ({
  Framework: { getApp () {}, app: { tools: {} }, features: { largepuzzle: { handleMousemove () {}, handleZoomInOut () {}, updateTransform () {} } }, addSetting () {}, showDialog () {}, closeDialog () {}, getData () {}, setData () {}, removeData () {} },
  ToolLetter: { tool: { keyHandlers: [] } }
})

test('a complete SudokuPad lacks nothing, and without one internal only the features that need it are lacking', () => {
  assert.deepEqual(lackingInternals(FEATURES, completeSudokuPad()), new Map())
  const removals = [
    ...['addSetting', 'showDialog', 'closeDialog', 'setData', 'removeData'].map((name) => [`Framework.${name}`, (r) => { delete r.Framework[name] }, ['settings']]),
    ['Framework.getData', (r) => { delete r.Framework.getData }, ['saved']],
    ['ToolLetter.tool.keyHandlers', (r) => { delete r.ToolLetter.tool.keyHandlers }, ['tab']],
    ['Framework.app.tools', (r) => { delete r.Framework.app.tools }, ['tab', 'wheel']],
    ...['handleMousemove', 'handleZoomInOut', 'updateTransform'].map((name) => [`Framework.features.largepuzzle.${name}`, (r) => { delete r.Framework.features.largepuzzle[name] }, ['rightDrag']])
  ]
  for (const [internal, remove, features] of removals) {
    const roots = completeSudokuPad()
    remove(roots)
    assert.deepEqual(lackingInternals(FEATURES, roots), new Map([[internal, features]]), internal)
  }
  const roots = completeSudokuPad()
  delete roots.Framework.getApp
  assert.deepEqual(lackingInternals(FEATURES, roots), new Map([['Framework.getApp', ['tab']]]))
})

test('the header names the script and asks for no grant, so the settings entry is its one way in', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'ui-tweaks.user.js'), 'utf8')
  assert.match(source, /^\/\/ @name\s+SudokuPad UI Tweaks$/m)
  assert.match(source, /^\/\/ @grant\s+none$/m)
  assert.doesNotMatch(source, /GM_registerMenuCommand/)
})

test('the hints: the Select button is named as its tooltip names it, and Wrap buttons says Color by Digit makes it do nothing', () => {
  const byId = Object.fromEntries(OPTIONS.map((o) => [o.id, o]))
  assert.equal(byId.hideSelect.label, 'Hide the Select button')
  assert.doesNotMatch(byId.hideSelect.label + byId.hideSelect.hint, /Toggle Selection/)
  assert.match(byId.wrapButtons.hint, /no effect with Color by Digit installed/)
})

test('the digit pad has four steps, Smaller, Normal, Larger and Largest, at 80, 100, 125 and 150, and Normal is the default', () => {
  assert.deepEqual(DIGIT_PAD_STEPS, [{ label: 'Smaller', percent: 80 }, { label: 'Normal', percent: 100 }, { label: 'Larger', percent: 125 }, { label: 'Largest', percent: 150 }])
  assert.equal(DEFAULT_OPTIONS.digitPad, 100)
})

test('readOptions: each of the four saved steps is read back', () => {
  for (const { percent } of DIGIT_PAD_STEPS) assert.equal(readOptions(fakeStore({ UiTweaks_digitPad: percent })).digitPad, percent, String(percent))
})

test('readOptions: a percentage an earlier build offered reads as the nearest step, a tie going to the one nearer Normal', () => {
  const read = (saved) => readOptions(fakeStore({ UiTweaks_digitPad: saved })).digitPad
  assert.deepEqual([80, 90, 100, 110, 120, 130, 140, 150].map(read), [80, 100, 100, 100, 125, 125, 150, 150])
})

test('readOptions: a missing or unreadable digit pad size reads as Normal', () => {
  for (const bad of [undefined, null, 'big', '120', 95, 0, -100, 160, 100.5, NaN, true, {}, [120], 'Larger']) {
    assert.equal(readOptions(fakeStore({ UiTweaks_digitPad: bad })).digitPad, 100, String(bad))
  }
  assert.equal(readOptions(fakeStore()).digitPad, 100)
})

test('a paste takes the four steps and the old percentages (as the nearest step) for the digit pad, and skips the rest', () => {
  assert.deepEqual(pastedSettings(JSON.stringify({ UiTweaks_digitPad: 150 }), READERS), { values: { UiTweaks_digitPad: 150 }, skipped: 0 })
  assert.deepEqual(pastedSettings(JSON.stringify({ UiTweaks_digitPad: 130 }), READERS), { values: { UiTweaks_digitPad: 125 }, skipped: 0 })
  assert.deepEqual(pastedSettings(JSON.stringify({ UiTweaks_digitPad: 155 }), READERS), { values: {}, skipped: 1 })
})

test('saveOptions keeps a chosen digit pad step under UiTweaks_digitPad, and Normal leaves no key', () => {
  const store = fakeStore()
  saveOptions(store, { ...DEFAULT_OPTIONS, digitPad: 80 })
  assert.deepEqual(store.data, { UiTweaks_digitPad: 80 })
  saveOptions(store, DEFAULT_OPTIONS)
  assert.deepEqual(store.data, {})
})

test('buildCss: Normal adds no rule; any other step sizes the digit buttons in rem from SudokuPad\'s own 4rem', () => {
  assert.equal(buildCss({ ...DEFAULT_OPTIONS, digitPad: 100 }), '')
  const css = buildCss({ ...DEFAULT_OPTIONS, digitPad: 150 })
  assert.match(css, /width: 6rem !important/)
  assert.match(css, /height: 6rem !important/)
  assert.doesNotMatch(css, /px|scale/)
  assert.match(buildCss({ ...DEFAULT_OPTIONS, digitPad: 80 }), /width: 3\.2rem !important/)
  assert.match(buildCss({ ...DEFAULT_OPTIONS, digitPad: 125 }), /width: 5rem !important/)
})

test('buildCss: the corner and centre tools get the digit font scaled from 1.4rem, and the pen line-mode box follows the digit rows', () => {
  const css = buildCss({ ...DEFAULT_OPTIONS, digitPad: 150 })
  assert.match(css, /\.tool-corner \.controls-input button\.digit, \.tool-centre \.controls-input button\.digit \{ font-size: 2\.1rem !important; \}/)
  assert.match(css, /button\.digit \{[^}]*font-size: 3rem !important/)
  assert.match(css, /\.penlinemode \{ top: 19rem !important; height: 6rem !important; \}/)
})

test('buildCss: the Delete key is as tall as a digit and spans two digit columns, as SudokuPad\'s 8.3rem does at 4rem', () => {
  assert.match(buildCss({ ...DEFAULT_OPTIONS, digitPad: 150 }), /button\[data-control="delete"\] \{ flex: 0 0 12\.3rem !important; width: 12\.3rem !important; height: 6rem !important; \}/)
  assert.match(buildCss({ ...DEFAULT_OPTIONS, digitPad: 80 }), /button\[data-control="delete"\] \{ flex: 0 0 6\.7rem !important; width: 6\.7rem !important; height: 3\.2rem !important; \}/)
})

// SudokuPad's Large Puzzle UI feature as far as the wrap reads it: its bound handlers are own properties, `zoomLevel` and `panPos` its state.
function fakeLargePuzzle (zoomLevel, zoomsTo = zoomLevel) {
  const calls = []
  const feature = {
    zoomLevel,
    panPos: [30, -20],
    handleMousemove (event) { calls.push(['pan', event]) },
    handleZoomInOut (inOut) { feature.zoomLevel = zoomsTo; calls.push(['zoom', inOut]) },
    updateTransform () { calls.push(['transform', [...feature.panPos]]) }
  }
  return { feature, calls }
}

test('limitRightDrag: with the option on, a mousemove at zoom 1 never reaches the feature, so a right-drag does not pan', () => {
  const { feature, calls } = fakeLargePuzzle(1)
  limitRightDrag(feature, () => true)
  feature.handleMousemove({ buttons: 2 })
  assert.deepEqual(calls, [])
})

test('limitRightDrag: with the option on, a mousemove zoomed in reaches the feature, which pans', () => {
  const { feature, calls } = fakeLargePuzzle(1.4)
  const event = { buttons: 2 }
  limitRightDrag(feature, () => true)
  feature.handleMousemove(event)
  assert.deepEqual(calls, [['pan', event]])
})

test('limitRightDrag: with the option off, a mousemove at zoom 1 still reaches the feature, and the option is read at each move', () => {
  const { feature, calls } = fakeLargePuzzle(1)
  let on = false
  limitRightDrag(feature, () => on)
  feature.handleMousemove({})
  on = true
  feature.handleMousemove({})
  assert.deepEqual(calls.map(([name]) => name), ['pan'])
})

test('limitRightDrag: a zoom that ends at 1 puts the board back to the centre, after the feature has zoomed', () => {
  const { feature, calls } = fakeLargePuzzle(1.4, 1)
  limitRightDrag(feature, () => true)
  feature.handleZoomInOut(-1)
  assert.deepEqual(feature.panPos, [0, 0])
  assert.deepEqual(calls, [['zoom', -1], ['transform', [0, 0]]])
})

test('limitRightDrag: a zoom that stays above 1 leaves the pan, and with the option off a zoom to 1 leaves it too', () => {
  const zoomed = fakeLargePuzzle(1.4)
  limitRightDrag(zoomed.feature, () => true)
  zoomed.feature.handleZoomInOut(1)
  assert.deepEqual(zoomed.feature.panPos, [30, -20])
  assert.deepEqual(zoomed.calls, [['zoom', 1]])
  const off = fakeLargePuzzle(1.4, 1)
  limitRightDrag(off.feature, () => false)
  off.feature.handleZoomInOut(-1)
  assert.deepEqual(off.feature.panPos, [30, -20])
  assert.deepEqual(off.calls, [['zoom', -1]])
})

test('limitRightDrag returns a recentre that puts a board panned at zoom 1 back at the centre, only while the option is on', () => {
  const on = fakeLargePuzzle(1)
  limitRightDrag(on.feature, () => true)()
  assert.deepEqual(on.feature.panPos, [0, 0])
  assert.deepEqual(on.calls, [['transform', [0, 0]]])
  const off = fakeLargePuzzle(1)
  limitRightDrag(off.feature, () => false)()
  assert.deepEqual(off.feature.panPos, [30, -20])
  const zoomed = fakeLargePuzzle(1.4)
  limitRightDrag(zoomed.feature, () => true)()
  assert.deepEqual(zoomed.feature.panPos, [30, -20], 'a board zoomed in is left where it is')
})

test('limitRightDrag\'s recentre leaves a feature that was never turned on alone: it has no pan yet', () => {
  const { feature, calls } = fakeLargePuzzle(1)
  delete feature.panPos
  limitRightDrag(feature, () => true)()
  assert.deepEqual(calls, [])
})

test('the mouse wheel option is off at first, and its hint says Shift+wheel zooms', () => {
  const option = OPTIONS.find((o) => o.id === 'wheelMode')
  assert.equal(option.label, 'Mouse wheel changes mode')
  assert.equal(option.default, false)
  assert.match(option.hint, /Shift\+wheel/)
})

test('wheelDelta reads a notch as 100 in pixels, lines (3 to a notch) and pages, and a Shift+wheel from whichever delta is set, a sideways swipe without Shift as none', () => {
  assert.equal(WHEEL_NOTCH, 100)
  assert.equal(wheelDelta({ deltaY: 100, deltaX: 0, deltaMode: 0 }), 100)
  assert.equal(wheelDelta({ deltaY: -3, deltaX: 0, deltaMode: 1 }), -100)
  assert.equal(wheelDelta({ deltaY: 1, deltaX: 0, deltaMode: 2 }), 100)
  assert.equal(wheelDelta({ deltaY: 3, deltaX: 0, deltaMode: 2 }), 100, 'a page is one notch however many it reports')
  assert.equal(wheelDelta({ deltaY: -2, deltaX: 0, deltaMode: 2 }), -100)
  assert.equal(wheelDelta({ deltaY: 0, deltaX: 100, deltaMode: 0, shiftKey: true }), 100)
  assert.equal(wheelDelta({ deltaY: 0, deltaX: 100, deltaMode: 0, shiftKey: false }), 0, 'a sideways swipe is not a step')
  assert.equal(wheelDelta({ deltaY: 0, deltaX: 0, deltaMode: 0 }), 0)
})

test('accumulateWheel: one notch is one step, a trackpad stream steps once per 100 and keeps the remainder', () => {
  assert.deepEqual(accumulateWheel({ rest: 0, at: 0 }, 100, 0), { steps: 1, state: { rest: 0, at: 0 } })
  assert.deepEqual(accumulateWheel({ rest: 0, at: 0 }, -100, 0).steps, -1)
  let state = { rest: 0, at: 0 }
  const steps = []
  for (let i = 1; i <= 25; i++) {
    const result = accumulateWheel(state, 12, i * 10)
    steps.push(result.steps)
    state = result.state
  }
  assert.equal(steps.reduce((a, b) => a + b, 0), 3, '25 events of 12 is 300')
  assert.deepEqual(accumulateWheel({ rest: 0, at: 0 }, 40, 10).steps, 0)
})

test('accumulateWheel: a turn of direction or a pause drops what was left over', () => {
  assert.equal(accumulateWheel({ rest: 60, at: 0 }, -100, 10).steps, -1, 'a reversal starts from nothing, so a whole notch back steps')
  assert.equal(accumulateWheel({ rest: 60, at: 0 }, 60, 10).steps, 1, 'the same direction adds up')
  assert.equal(accumulateWheel({ rest: 60, at: 0 }, 60, 10000).steps, 0, 'a pause of seconds drops the 60')
  assert.equal(accumulateWheel({ rest: -60, at: 0 }, -60, 10).steps, -1, 'and the same holds going up')
})

test('steppedIndex steps through the buttons and wraps past either end', () => {
  assert.equal(steppedIndex(0, 5, 1), 1)
  assert.equal(steppedIndex(4, 5, 1), 0)
  assert.equal(steppedIndex(0, 5, -1), 4)
  assert.equal(steppedIndex(2, 5, 7), 4)
  assert.equal(steppedIndex(2, 5, -8), 4)
})

test('steppedIndex with the current tool on no button: down goes to the first, up to the last', () => {
  assert.equal(steppedIndex(-1, 5, 1), 0)
  assert.equal(steppedIndex(-1, 5, -1), 4)
})
