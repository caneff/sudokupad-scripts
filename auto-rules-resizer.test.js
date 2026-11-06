'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const {
  VERSION, MAX_WIDTH_KEY, MAX_HEIGHT_KEY, normalizeLimit, limitFromBox, readLimits, saveLimits, noLimits, autoPaneFit,
  largestSize, rulesRoom, rulesContainer, rulesWidth, autoFontPx, nudgedFontPx, fitRulesPane, clearFit,
  copiedSettings, pastedSettings, pasteReport, dragRulesBox, clampDrag, draggedPane, draggedBox, noRulesDrag, isLandscape, makeTrailing, watchCornerDrag
} = require('./auto-rules-resizer.user.js')

test('largestSize: the biggest integer in [min, max] the predicate accepts, min when none does', () => {
  assert.equal(largestSize((n) => n <= 37, 8, 200), 37)
  assert.equal(largestSize(() => true, 8, 200), 200)
  assert.equal(largestSize(() => false, 8, 200), 8)
})

test('rulesRoom: from the rules\' top to the container\'s bottom, less its bottom padding', () => {
  assert.equal(rulesRoom({ rulesTop: 100, containerBottom: 700, viewportBottom: 900, paddingBottom: 0 }), 600)
  assert.equal(rulesRoom({ rulesTop: 100, containerBottom: 700, viewportBottom: 900, paddingBottom: 20 }), 580)
})

test('rulesRoom: never past the window', () => {
  assert.equal(rulesRoom({ rulesTop: 100, containerBottom: 2000, viewportBottom: 900, paddingBottom: 0 }), 800)
})

test('rulesRoom: zero for a container that ends above the rules\' top', () => {
  assert.equal(rulesRoom({ rulesTop: 500, containerBottom: 300, viewportBottom: 900, paddingBottom: 0 }), 0)
  assert.equal(rulesRoom({ rulesTop: 300, containerBottom: 300, viewportBottom: 900, paddingBottom: 0 }), 0)
  assert.equal(rulesRoom({ rulesTop: 300, containerBottom: 310, viewportBottom: 900, paddingBottom: 40 }), 0)
})

test('rulesContainer: the nearest ancestor that clips or scrolls, else the parent', () => {
  const node = (tagName, overflowY, parentElement) => ({ tagName, overflowY, parentElement })
  const body = node('BODY', 'visible', null)
  const scroller = node('DIV', 'auto', body)
  const plain = node('DIV', 'visible', scroller)
  const rules = node('DIV', 'visible', plain)
  const style = (el) => ({ overflowY: el.overflowY })
  assert.equal(rulesContainer(rules, style), scroller)
  const loose = node('DIV', 'visible', node('DIV', 'visible', body))
  assert.equal(rulesContainer(loose, style), loose.parentElement, 'no clipping ancestor: the direct parent')
})

test('rulesWidth: to the window\'s right edge less 8 px, in the pane\'s own css px', () => {
  // (2048 - 1050 - 8) / 1.25 = 792
  assert.equal(rulesWidth({ natural: 480, rulesLeft: 1050, scale: 1.25, viewportWidth: 2048 }), 792)
})

test('rulesWidth: a max auto width stops it short of the edge, and never under the natural width', () => {
  assert.equal(rulesWidth({ natural: 480, rulesLeft: 1050, scale: 1.25, viewportWidth: 2048, maxWidth: 700 }), 700)
  assert.equal(rulesWidth({ natural: 480, rulesLeft: 1050, scale: 1.25, viewportWidth: 2048, maxWidth: 9999 }), 792)
  assert.equal(rulesWidth({ natural: 480, rulesLeft: 1050, scale: 1.25, viewportWidth: 2048, maxWidth: 300 }), 480)
  assert.equal(rulesWidth({ natural: 480, rulesLeft: 1050, scale: 1.25, viewportWidth: 2048, maxWidth: null }), 792)
})

test('rulesWidth: never narrower than the natural width, and no widening without a usable scale', () => {
  assert.equal(rulesWidth({ natural: 480, rulesLeft: 1900, scale: 1, viewportWidth: 2048 }), 480)
  assert.equal(rulesWidth({ natural: 480, rulesLeft: 1000, scale: 0, viewportWidth: 2048 }), 480)
  assert.equal(rulesWidth({ natural: 480, rulesLeft: 1000, scale: NaN, viewportWidth: 2048 }), 480)
})

test('autoFontPx: the largest font that fits, never under SudokuPad\'s own size', () => {
  assert.equal(autoFontPx((n) => n <= 31, 17.6), 31)
  assert.equal(autoFontPx(() => false, 17.6), 17.6, 'nothing fits: SudokuPad\'s own size, so long rules still scroll')
  assert.equal(autoFontPx((n) => n <= 17, 17.6), 17.6, 'only sizes under SudokuPad\'s own fit')
  assert.equal(autoFontPx((n) => n <= 18, 18), 18)
})

test('nudgedFontPx: one px per press from the automatic size, below SudokuPad\'s own too, never under 8 px', () => {
  assert.equal(nudgedFontPx(30, 2), 32)
  assert.equal(nudgedFontPx(17.5, -3), 14.5)
  assert.equal(nudgedFontPx(17.6, -40), 8)
})

// A stand-in for SudokuPad's rules pane and its container, modelled on what was measured live: the pane's
// height follows its text at the current font and width, capped at 224 css px; the container wraps the pane;
// SudokuPad's own font is 17.6 px. `scale` is visual px per css px, as SudokuPad scales the controls column.
const VIEWPORT = { width: 2048, height: 1064 }
function fakePane (chars, scale = 1, spareRoom = 0) {
  const style = { fontSize: '', width: '', maxWidth: '', boxSizing: '', maxHeight: '', overflowWrap: '' }
  const font = () => parseFloat(style.fontSize) || 17.6
  const width = () => parseFloat(style.width) || 480
  const scrollHeight = () => Math.ceil((chars * font() * 0.5) / (width() - 32)) * font() * 1.2 + 32
  const height = () => Math.min(parseFloat(style.maxHeight) || 224, scrollHeight())
  const rules = {
    style,
    get offsetWidth () { return width() },
    get scrollHeight () { return scrollHeight() },
    get clientHeight () { return height() },
    getBoundingClientRect: () => ({ left: 1000, top: 300, width: width() * scale, height: height() * scale })
  }
  const container = { getBoundingClientRect: () => ({ bottom: 300 + height() * scale + 8 + spareRoom }) }
  const getStyle = (el) => (el === rules ? { fontSize: `${font()}px`, maxHeight: '224px' } : { paddingBottom: '0' })
  // The controls column holds the pane, from 60 px above it to 400 px below its top.
  const controls = { style: { translate: '' }, getBoundingClientRect: () => ({ top: 240, bottom: 700 }) }
  const fit = (opts = {}) => fitRulesPane({
    rules, container, controls, getStyle, viewport: VIEWPORT, boardRight: 900, nudgePx: 0, box: noRulesDrag(), ...opts
  })
  return { rules, container, controls, fit, height }
}

test('fitRulesPane: rules that fit at SudokuPad\'s width keep that width and take a larger font, and a second fit changes nothing', () => {
  for (const chars of [26, 140]) {
    const { rules, fit } = fakePane(chars)
    assert.deepEqual(fit(), noRulesDrag())
    const first = { ...rules.style }
    assert.equal(first.width, '', `${chars} chars: SudokuPad's own width`)
    assert.ok(parseFloat(first.fontSize) > 17.6, `${chars} chars: font grew to ${first.fontSize}`)
    assert.equal(rules.scrollHeight <= rules.clientHeight, true, `${chars} chars: no scrolling`)
    for (let i = 0; i < 5; i++) fit()
    assert.deepEqual(rules.style, first, `${chars} chars: refits are stable`)
  }
})

test('fitRulesPane: rules too long for SudokuPad\'s size widen just enough to stop scrolling at that size', () => {
  const { rules, fit } = fakePane(800)
  fit()
  const width = parseFloat(rules.style.width)
  assert.equal(rules.style.fontSize, '17.6px')
  assert.ok(width > 480 && width < 1040, `widened to ${width}, short of the right edge`)
  assert.equal(rules.scrollHeight <= rules.clientHeight, true, 'no scrolling')
  rules.style.width = `${width - 1}px`
  assert.equal(rules.scrollHeight > rules.clientHeight, true, 'one px narrower scrolls')
})

test('fitRulesPane: the max auto width stops the widening, and a max under SudokuPad\'s width changes nothing', () => {
  const capped = fakePane(800)
  capped.fit({ limits: { maxWidth: 600, maxHeight: null } })
  assert.equal(capped.rules.style.width, '600px')
  assert.equal(capped.rules.style.fontSize, '17.6px')
  const under = fakePane(800)
  under.fit({ limits: { maxWidth: 300, maxHeight: null } })
  assert.equal(under.rules.style.width, '', 'never narrower than SudokuPad\'s own')
})

test('fitRulesPane: the max auto height caps the room the font is fitted to', () => {
  const { rules, fit } = fakePane(26)
  fit({ limits: { maxWidth: null, maxHeight: 60 } })
  // One line is 1.2 x font + 32: 23 px fits a room of 60, 24 does not.
  assert.equal(rules.style.fontSize, '23px')
  assert.equal(rules.scrollHeight <= 60, true)
})

test('fitRulesPane: a max auto height holds the pane to it, widening only as far as the rules need to fit', () => {
  const { rules, fit } = fakePane(300)
  fit({ limits: { maxWidth: null, maxHeight: 100 } })
  assert.equal(rules.style.maxHeight, '100px')
  assert.equal(rules.scrollHeight <= 100, true, `scroll height ${rules.scrollHeight}`)
  const width = parseFloat(rules.style.width)
  assert.ok(width > 480 && width < 1040, `widened to ${width}, short of the right edge`)
  rules.style.width = `${width - 1}px`
  assert.equal(rules.scrollHeight > 100, true, 'one px narrower overflows the cap')
})

test('fitRulesPane: a max auto height no rules can fit in still holds the pane to it, at SudokuPad\'s font', () => {
  const { rules, fit } = fakePane(26)
  fit({ limits: { maxWidth: null, maxHeight: 40 } })
  assert.equal(rules.style.maxHeight, '40px')
  assert.equal(rules.style.fontSize, '17.6px')
})

test('fitRulesPane: with room below the pane\'s own max-height the pane takes it, and the font fills it', () => {
  const { rules, fit } = fakePane(26, 1, 300)
  fit()
  assert.equal(rules.scrollHeight > 224, true, `scroll height ${rules.scrollHeight}, past SudokuPad's 14rem`)
  assert.equal(rules.scrollHeight <= rules.clientHeight, true, 'shown whole')
})

test('fitRulesPane: f+ widens the pane when the bigger font would scroll, up to the max auto width, then only the font grows', () => {
  const free = fakePane(140)
  free.fit({ nudgePx: 1 })
  const bigger = parseFloat(free.rules.style.fontSize)
  assert.ok(parseFloat(free.rules.style.width) > 480, `widened to ${free.rules.style.width}`)
  assert.equal(free.rules.scrollHeight <= free.rules.clientHeight, true, `no scrolling at ${bigger}px`)
  const capped = fakePane(140)
  capped.fit({ nudgePx: 1, limits: { maxWidth: 520, maxHeight: null } })
  assert.equal(capped.rules.style.width, '520px')
  assert.equal(capped.rules.style.fontSize, `${bigger}px`, 'the font grows as it does without a cap')
  const atNatural = fakePane(140)
  atNatural.fit({ nudgePx: 1, limits: { maxWidth: 480, maxHeight: null } })
  assert.equal(atNatural.rules.style.width, '', 'a max at SudokuPad\'s width: f+ is as it was')
  assert.equal(atNatural.rules.style.fontSize, `${bigger}px`)
})

test('fitRulesPane: f- leaves the width where the fit put it', () => {
  const { rules, fit } = fakePane(800)
  fit()
  const width = rules.style.width
  fit({ nudgePx: -2 })
  assert.equal(rules.style.width, width)
  assert.equal(parseFloat(rules.style.fontSize).toFixed(1), '15.6')
})

test('autoPaneFit: SudokuPad\'s width and the largest font when the rules fit at its own size', () => {
  const fits = (width, font) => font <= 30
  assert.deepEqual(autoPaneFit({ natural: 480, widthLimit: 900, ownPx: 17.6, nudgePx: 0, fits }), { width: 480, fontPx: 30 })
})

test('autoPaneFit: the least width at which SudokuPad\'s own size fits, else the limit', () => {
  const fits = (width, font) => width >= 700 && font <= 17.6
  assert.deepEqual(autoPaneFit({ natural: 480, widthLimit: 900, ownPx: 17.6, nudgePx: 0, fits }), { width: 700, fontPx: 17.6 })
  assert.deepEqual(autoPaneFit({ natural: 480, widthLimit: 650, ownPx: 17.6, nudgePx: 0, fits }), { width: 650, fontPx: 17.6 })
})

test('normalizeLimit: a positive whole number of css px, else no limit', () => {
  assert.equal(normalizeLimit(640), 640)
  assert.equal(normalizeLimit('640'), 640)
  assert.equal(normalizeLimit(' 640.4 '), 640)
  for (const empty of [null, undefined, '', '  ', 0, -5, 'abc', NaN, Infinity, 0.2]) assert.equal(normalizeLimit(empty), null, String(empty))
})

function fakeStore (saved = {}) {
  const data = { ...saved }
  return {
    data,
    getData: (key) => (key in data ? data[key] : null),
    setData: (key, value) => { data[key] = value },
    removeData: (key) => { delete data[key] }
  }
}

test('readLimits: what is saved, and no limit for what is not or is unusable', () => {
  assert.deepEqual(readLimits(fakeStore()), noLimits())
  assert.deepEqual(readLimits(fakeStore({ [MAX_WIDTH_KEY]: 700, [MAX_HEIGHT_KEY]: '500' })), { maxWidth: 700, maxHeight: 500 })
  assert.deepEqual(readLimits(fakeStore({ [MAX_WIDTH_KEY]: 'wide' })), noLimits())
})

test('saveLimits: saves a limit and removes the key of an empty one, so a fresh install saves nothing', () => {
  const store = fakeStore({ [MAX_HEIGHT_KEY]: 500 })
  saveLimits(store, { maxWidth: 700, maxHeight: null })
  assert.deepEqual(store.data, { [MAX_WIDTH_KEY]: 700 })
  saveLimits(store, noLimits())
  assert.deepEqual(store.data, {})
})

test('limitFromBox: blank is no limit, a usable number is the limit, anything else keeps the limit as it was', () => {
  assert.equal(limitFromBox('', 600), null)
  assert.equal(limitFromBox('  ', 600), null)
  assert.equal(limitFromBox('700', 600), 700)
  for (const slip of ['0', '-5', '0.2', 'abc']) assert.equal(limitFromBox(slip, 600), 600, slip)
  assert.equal(limitFromBox('abc', null), null)
})

test('VERSION is the @version in the script header', () => {
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, 'auto-rules-resizer.user.js'), 'utf8')))
})

test('fitRulesPane: rules that scroll even when widened keep SudokuPad\'s own font', () => {
  const { rules, fit } = fakePane(8000)
  fit()
  assert.equal(rules.style.fontSize, '17.6px')
})

test('fitRulesPane: the room is read in the pane\'s own css px, so a scaled pane does not outgrow it', () => {
  const scale = 1.25
  const { rules, fit, height } = fakePane(140, scale)
  const room = height() + 8 / scale
  fit()
  assert.equal(rules.scrollHeight <= room, true, `scroll height ${rules.scrollHeight} in a room of ${room}`)
})

test('fitRulesPane: the nudge moves the font from the automatic size', () => {
  const { rules, fit } = fakePane(140)
  fit()
  const auto = parseFloat(rules.style.fontSize)
  fit({ nudgePx: 2 })
  assert.equal(parseFloat(rules.style.fontSize), auto + 2)
  fit({ nudgePx: -1 })
  assert.equal(parseFloat(rules.style.fontSize), auto - 1)
})

test('fitRulesPane: with no room it puts the last fit back, the controls\' move too, and says so', () => {
  const { rules, container, controls, fit } = fakePane(140)
  const box = { w: 0, h: 30, x: 0, y: -30 }
  fit({ box })
  const fitted = { ...rules.style }
  container.getBoundingClientRect = () => ({ bottom: 0 })
  assert.equal(fit({ box }), null)
  assert.deepEqual(rules.style, fitted)
  assert.equal(controls.style.translate, '0px -30px')
})

test('fitRulesPane: a pane SudokuPad does not show (a puzzle with no rules) gets the fit and the drag taken off', () => {
  const { rules, controls, fit } = fakePane(140)
  fit({ box: { w: 0, h: 30, x: 0, y: -30 } })
  Object.defineProperty(rules, 'offsetWidth', { get: () => 0 })
  assert.equal(fit(), null)
  assert.deepEqual(rules.style, { fontSize: '', width: '', maxWidth: '', boxSizing: '', maxHeight: '', overflowWrap: '' })
  assert.equal(controls.style.translate, '')
})

test('fitRulesPane: a drag moves the controls and caps the pane\'s height', () => {
  const { rules, controls, fit } = fakePane(140)
  const before = rules.getBoundingClientRect().height
  assert.deepEqual(fit({ box: { w: 0, h: 30, x: 0, y: -30 } }), { w: 0, h: 30, x: 0, y: -30 })
  assert.equal(controls.style.translate, '0px -30px')
  assert.equal(rules.style.maxHeight, `${before + 30}px`, 'the pane\'s own height plus the drag, not the room under it')
})

test('fitRulesPane: a drag made in a larger window is cut back to the window it is applied in', () => {
  const { controls, fit } = fakePane(140)
  // The column's top is 240: a drag 300 up from a larger window is cut to 240.
  assert.deepEqual(fit({ box: { w: 0, h: 300, x: 0, y: -300 } }), { w: 0, h: 300, x: 0, y: -240 })
  assert.equal(controls.style.translate, '0px -240px')
})

test('clearFit: takes the fit\'s output off the pane and the controls', () => {
  const { rules, controls, fit } = fakePane(140)
  fit({ box: { w: -20, h: 30, x: 20, y: -30 } })
  assert.notEqual(controls.style.translate, '')
  clearFit(rules, controls)
  assert.deepEqual(rules.style, { fontSize: '', width: '', maxWidth: '', boxSizing: '', maxHeight: '', overflowWrap: '' })
  assert.equal(controls.style.translate, '')
})

const NO_BOX = { w: 0, h: 0, x: 0, y: 0 }
const PANE = { width: 480, height: 200 }
const MIN_PANE = { width: 240, height: 112 } // 15 x 7 rem at 16 px

test('dragRulesBox: the top-right corner grows the pane right and up, moving the controls up', () => {
  assert.deepEqual(dragRulesBox(NO_BOX, 'ur', 40, -30, PANE, MIN_PANE), { w: 40, h: 30, x: 0, y: -30 })
})

test('dragRulesBox: the bottom-left corner grows the pane left and down, moving the controls left', () => {
  assert.deepEqual(dragRulesBox(NO_BOX, 'dl', -50, 20, PANE, MIN_PANE), { w: 50, h: 20, x: -50, y: 0 })
})

test('dragRulesBox: drags add up, and never shrink the pane under 15 x 7 rem', () => {
  const once = dragRulesBox(NO_BOX, 'ur', 40, -30, PANE, MIN_PANE)
  assert.deepEqual(dragRulesBox(once, 'ur', 10, -5, { width: 520, height: 230 }, MIN_PANE), { w: 50, h: 35, x: 0, y: -35 })
  // A drag far past the floor stops at it: 480 - 240 = 240 of width, 200 - 112 = 88 of height.
  assert.deepEqual(dragRulesBox(NO_BOX, 'ur', -900, 900, PANE, MIN_PANE), { w: -240, h: -88, x: 0, y: 88 })
  assert.deepEqual(dragRulesBox(NO_BOX, 'dl', 900, -900, PANE, MIN_PANE), { w: -240, h: -88, x: 240, y: 0 })
})

test('dragRulesBox: a pane already under the floor grows by the drag, not to the floor, and does not shrink', () => {
  const short = { width: 200, height: 80 }
  assert.deepEqual(dragRulesBox(NO_BOX, 'ur', 5, -10, short, MIN_PANE), { w: 5, h: 10, x: 0, y: -10 })
  assert.deepEqual(dragRulesBox(NO_BOX, 'dl', 5, -10, short, MIN_PANE), NO_BOX)
})

// The pane fitted from 1000 to 8 px from the right edge, its column from 300 to 900, the board ending at 900, in a
// 1600 x 1000 window.
const LAYOUT = { pane: { left: 1000, right: 1592 }, column: { top: 300, bottom: 900 }, boardRight: 900, viewport: { width: 1600, height: 1000 } }

test('clampDrag: a drag inside the window and clear of the board is applied as it is', () => {
  for (const box of [NO_BOX, { w: 50, h: 40, x: -50, y: 0 }, { w: 0, h: 100, x: 0, y: -100 }]) assert.deepEqual(clampDrag(box, LAYOUT), box)
})

test('clampDrag: the pane stops at the board, and the controls column at the window\'s top and bottom', () => {
  assert.deepEqual(clampDrag({ w: 400, h: 0, x: -400, y: 0 }, LAYOUT), { w: 100, h: 0, x: -100, y: 0 }, 'left to the board')
  assert.deepEqual(clampDrag({ w: 0, h: 500, x: 0, y: -500 }, LAYOUT), { w: 0, h: 400, x: 0, y: -300 }, 'up to the window\'s top')
  assert.deepEqual(clampDrag({ w: 0, h: 600, x: 0, y: 0 }, LAYOUT), { w: 0, h: 100, x: 0, y: 0 }, 'down to the window\'s bottom')
  const short = { ...LAYOUT, pane: { left: 1000, right: 1500 } }
  assert.deepEqual(clampDrag({ w: 200, h: 0, x: 0, y: 0 }, short), { w: 92, h: 0, x: 0, y: 0 }, 'right to 8 px from the window\'s edge')
})

test('clampDrag: a shrink, which moves the controls right or down by as much, is applied as it is', () => {
  for (const box of [{ w: -60, h: 0, x: 60, y: 0 }, { w: 0, h: -40, x: 0, y: 40 }]) assert.deepEqual(clampDrag(box, LAYOUT), box)
})

test('dragRulesBox: a corner the pane does not have is refused', () => {
  assert.throws(() => dragRulesBox(NO_BOX, 'ul', 1, 1, PANE, MIN_PANE), /no corner "ul"/)
})

test('draggedPane: the drag\'s deltas on the fit\'s answers, in css px, never under the floor', () => {
  const base = { width: 600, room: 200, scale: 1.25 }
  assert.deepEqual(draggedPane({ ...base, box: NO_BOX }), { width: 600, room: 200 })
  assert.deepEqual(draggedPane({ ...base, box: { w: -125, h: 50, x: 0, y: -50 } }), { width: 500, room: 240 }, 'visual px over scale')
  assert.deepEqual(draggedPane({ ...base, box: { w: -9999, h: -9999, x: 0, y: 0 } }), { width: 240, room: 112 }, '15 x 7 rem')
  // A pane under the floor before the drag: the floor stops it shrinking further, and does not grow it.
  assert.deepEqual(draggedPane({ ...base, width: 200, room: 60, box: { w: 10, h: 10, x: 0, y: -10 } }), { width: 208, room: 68 })
  assert.deepEqual(draggedPane({ ...base, width: 200, room: 60, box: { w: -10, h: -10, x: 0, y: 10 } }), { width: 200, room: 60 })
})

test('draggedBox: a drag lasts for the puzzle and resets on a new one', () => {
  draggedBox('puzzle-a').w = 40
  assert.deepEqual(draggedBox('puzzle-a'), { w: 40, h: 0, x: 0, y: 0 })
  assert.deepEqual(draggedBox('puzzle-b'), noRulesDrag())
  assert.deepEqual(draggedBox('puzzle-a'), noRulesDrag(), 'back to the first puzzle is a new puzzle too')
})

test('isLandscape: SudokuPad\'s own rule, the game area wider than it is tall', () => {
  assert.equal(isLandscape({ width: 1200, height: 860 }), true)
  assert.equal(isLandscape({ width: 600, height: 860 }), false)
  assert.equal(isLandscape({ width: 860, height: 860 }), false, 'square is portrait, as SudokuPad has it')
})

test('makeTrailing: runs once, the given time after the last call', () => {
  const pending = []
  let runs = 0
  const schedule = (fn, ms) => { pending.push({ fn, ms, live: true }); return pending.length - 1 }
  const cancel = (n) => { if (n !== null) pending[n].live = false }
  const trailing = makeTrailing(() => runs++, 100, schedule, cancel)
  trailing()
  trailing()
  trailing()
  assert.deepEqual(pending.map((p) => [p.ms, p.live]), [[100, false], [100, false], [100, true]])
  for (const p of pending) if (p.live) p.fn()
  assert.equal(runs, 1)
})

// An event target that keeps its listeners, so a test can fire events at it.
function fakeTarget () {
  const listeners = {}
  return {
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn) },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn) },
    fire: (type, x, y) => { for (const fn of [...(listeners[type] || [])]) fn({ clientX: x, clientY: y, preventDefault () {} }) }
  }
}

test('watchCornerDrag: follows move and release on the window, so a fast drag past the corner holds', () => {
  const corner = fakeTarget()
  const win = fakeTarget()
  const moves = []
  const active = []
  watchCornerDrag(corner, win, (dx, dy) => moves.push([dx, dy]), (on) => active.push(on))
  win.fire('pointermove', 5, 5)
  assert.deepEqual(moves, [], 'no drag before pointerdown')
  corner.fire('pointerdown', 100, 100)
  win.fire('pointermove', 130, 90)
  win.fire('pointermove', 140, 95)
  assert.deepEqual(moves, [[30, -10], [10, 5]])
  win.fire('pointerup', 140, 95)
  win.fire('pointermove', 200, 200)
  assert.equal(moves.length, 2, 'released: later moves are ignored')
  assert.deepEqual(active, [true, false])
})

test('copiedSettings: both limits in force, null for no limit', () => {
  assert.deepEqual(JSON.parse(copiedSettings(fakeStore())), { [MAX_WIDTH_KEY]: null, [MAX_HEIGHT_KEY]: null })
  assert.deepEqual(JSON.parse(copiedSettings(fakeStore({ [MAX_WIDTH_KEY]: 700, [MAX_HEIGHT_KEY]: 500, Other_key: 1 }))), { [MAX_WIDTH_KEY]: 700, [MAX_HEIGHT_KEY]: 500 })
  assert.deepEqual(JSON.parse(copiedSettings(fakeStore({ [MAX_HEIGHT_KEY]: 500 }))), { [MAX_WIDTH_KEY]: null, [MAX_HEIGHT_KEY]: 500 })
})

test('pastedSettings: a whole number of pixels or null is kept, anything else is skipped and counted, other keys are ignored', () => {
  assert.deepEqual(pastedSettings(JSON.stringify({ [MAX_WIDTH_KEY]: 700, [MAX_HEIGHT_KEY]: null, DarkPage_color: '#ffffff' })), { values: { [MAX_WIDTH_KEY]: 700, [MAX_HEIGHT_KEY]: null }, skipped: 0 })
  assert.deepEqual(pastedSettings(JSON.stringify({ [MAX_WIDTH_KEY]: 700.4, [MAX_HEIGHT_KEY]: 'tall' })), { values: {}, skipped: 2 })
  assert.deepEqual(pastedSettings(JSON.stringify({ [MAX_WIDTH_KEY]: true, [MAX_HEIGHT_KEY]: -3 })), { values: {}, skipped: 2 })
})

test('pastedSettings: throws on text that is not a JSON object', () => {
  assert.throws(() => pastedSettings('hello'), /not JSON/)
  assert.throws(() => pastedSettings('[1]'), /not a settings object/)
  assert.throws(() => pastedSettings('null'), /not a settings object/)
})

test('pasteReport: says how many were pasted and how many skipped, and when the text held nothing', () => {
  assert.equal(pasteReport(2, 0), 'Pasted 2 settings.')
  assert.equal(pasteReport(1, 3), 'Pasted 1 setting; skipped 3 that did not check out.')
  assert.equal(pasteReport(0, 1), 'Pasted 0 settings; skipped 1 that did not check out.')
  assert.equal(pasteReport(0, 0), 'Nothing to paste: the text holds none of this script\'s settings.')
})

test('pastedSettings: text with none of this script\'s keys pastes and skips nothing', () => {
  assert.deepEqual(pastedSettings('{}'), { values: {}, skipped: 0 })
  assert.deepEqual(pastedSettings(JSON.stringify({ DarkPage_color: '#ffffff' })), { values: {}, skipped: 0 })
})
