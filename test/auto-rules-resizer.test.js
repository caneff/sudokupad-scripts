'use strict'
require('./fake-page-storage.js')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { headerVersion } = require('./header-version.js')
const { fakeStore, quietly } = require('./fake-store.js')
const {
  VERSION, MAX_WIDTH_KEY, MAX_HEIGHT_KEY, normalizeLimit, limitFromBox, readLimits, saveLimits, noLimits, autoPaneFit,
  largestSize, rulesRoom, rulesContainer, rulesWidth, autoFontPx, offsetFontPx, fitRulesPane, clearFit,
  copiedSettings, pastedSettings, READERS, dragRulesBox, clampDrag, draggedPane, loadSizing, saveSizing, noSizing, SIZING_KEY_PREFIX, noRulesDrag, isLandscape, makeTrailing, watchCornerDrag, lackingInternals, FEATURES
} = require('../auto-rules-resizer.user.js')
const readPaste = (text) => pastedSettings(text, READERS)

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

// The font bounds as the fit states them: 70% and 150% of SudokuPad's size.
const FLOOR_17_6 = 17.6 * 0.7
const fitOf = (options) => {
  const { width, fontPx } = autoPaneFit(options)
  return { width, fontPx }
}

test('autoFontPx: grows to at most 150% of SudokuPad\'s size, shrinks to at most 70% of it', () => {
  assert.equal(autoFontPx((n) => n <= 31, 17.6), 26, 'spare room: capped at 150%')
  assert.equal(autoFontPx((n) => n <= 20, 17.6), 20)
  assert.equal(autoFontPx((n) => n <= 18, 18), 18)
  assert.equal(autoFontPx((n) => n <= 15, 17.6), 15, 'too long at its own size: the largest smaller font that fits')
  assert.equal(autoFontPx(() => false, 20), 14, 'nothing fits: 70% and the rules scroll')
  assert.equal(autoFontPx((n) => n <= 10, 20), 14, 'only sizes under 70% fit: still 70%')
})

test('offsetFontPx: one px per press from the automatic size, inside 70% to 150% of SudokuPad\'s size', () => {
  assert.equal(offsetFontPx(20, 2, 20), 22)
  assert.equal(offsetFontPx(17.5, -3, 20), 14.5)
  assert.equal(offsetFontPx(17.6, -40, 20), 14)
  assert.equal(offsetFontPx(29, 5, 20), 30)
})

// A stand-in for SudokuPad's rules pane and its container, modelled on what was measured live: the pane's
// height follows its text at the current font and width, capped at 224 css px; the container wraps the pane;
// SudokuPad's own font is 17.6 px. `scale` is visual px per css px, as SudokuPad scales the controls column.
const VIEWPORT = { width: 2048, height: 1064 }
function fakePane (chars, scale = 1, spareRoom = 0, pageSpare = 0) {
  const style = { fontSize: '', width: '', maxWidth: '', boxSizing: '', maxHeight: '', minHeight: '', overflowWrap: '', overflowY: '' }
  const font = () => parseFloat(style.fontSize) || 17.6
  const width = () => parseFloat(style.width) || 480
  const scrollHeight = () => Math.ceil((chars * font() * 0.5) / (width() - 32)) * font() * 1.2 + 32
  const height = () => Math.min(parseFloat(style.maxHeight) || 224, scrollHeight())
  const rules = {
    style,
    get offsetWidth () { return width() },
    get scrollHeight () { return scrollHeight() },
    get clientHeight () { return height() },
    get offsetHeight () { return height() },
    getBoundingClientRect: () => ({ left: 1000, top: 300, width: width() * scale, height: height() * scale })
  }
  const container = { getBoundingClientRect: () => ({ bottom: 300 + height() * scale + 8 + spareRoom }) }
  const getStyle = (el) => (el === rules ? { fontSize: `${font()}px`, maxHeight: '224px' } : { paddingBottom: '0' })
  // The controls column holds the pane. SudokuPad lays it out from 240 px down to `pageSpare` px above the window's bottom, with the
  // pane at its own height; a taller pane pushes the column's bottom down, and the column's `translate` moves it.
  const ownHeight = height()
  const moved = () => parseFloat(controls.style.translate.split(' ')[1]) || 0
  const controls = {
    style: { translate: '' },
    getBoundingClientRect: () => ({ top: 240 + moved(), bottom: VIEWPORT.height - pageSpare + (height() - ownHeight) * scale + moved() })
  }
  const fit = (opts = {}) => fitRulesPane({
    rules, container, controls, getStyle, viewport: VIEWPORT, pageTop: 240, useSpare: true, boardRight: 900, fontOffsetPx: 0, box: noRulesDrag(), ...opts
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
  assert.equal(capped.rules.scrollHeight <= capped.rules.clientHeight, true, 'the text shrank at the capped width until the rules fit')
  assert.equal(parseFloat(capped.rules.style.fontSize) < 17.6, true, capped.rules.style.fontSize)
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

test('fitRulesPane: a max auto height no rules can fit in still holds the pane to it, at 70% of SudokuPad\'s font', () => {
  const { rules, fit } = fakePane(26)
  fit({ limits: { maxWidth: null, maxHeight: 40 } })
  assert.equal(rules.style.maxHeight, '40px')
  assert.equal(rules.style.fontSize, `${FLOOR_17_6}px`)
})

test('fitRulesPane: with room below the pane\'s own max-height the pane takes it, and the font fills it', () => {
  const { rules, fit } = fakePane(230, 1, 300)
  fit()
  assert.equal(rules.scrollHeight > 224, true, `scroll height ${rules.scrollHeight}, past SudokuPad's 14rem`)
  assert.equal(rules.scrollHeight <= rules.clientHeight, true, 'shown whole')
})

test('fitRulesPane: f+ widens the pane when the bigger font would scroll, up to the max auto width, then only the font grows', () => {
  const free = fakePane(140)
  free.fit({ fontOffsetPx: 1 })
  const bigger = parseFloat(free.rules.style.fontSize)
  assert.ok(parseFloat(free.rules.style.width) > 480, `widened to ${free.rules.style.width}`)
  assert.equal(free.rules.scrollHeight <= free.rules.clientHeight, true, `no scrolling at ${bigger}px`)
  const capped = fakePane(140)
  capped.fit({ fontOffsetPx: 1, limits: { maxWidth: 520, maxHeight: null } })
  assert.equal(capped.rules.style.width, '520px')
  assert.equal(capped.rules.style.fontSize, `${bigger}px`, 'the font grows as it does without a cap')
  const atNatural = fakePane(140)
  atNatural.fit({ fontOffsetPx: 1, limits: { maxWidth: 480, maxHeight: null } })
  assert.equal(atNatural.rules.style.width, '', 'a max at SudokuPad\'s width: f+ is as it was')
  assert.equal(atNatural.rules.style.fontSize, `${bigger}px`)
})

test('fitRulesPane: f- leaves the width where the fit put it', () => {
  const { rules, fit } = fakePane(800)
  fit()
  const width = rules.style.width
  fit({ fontOffsetPx: -2 })
  assert.equal(rules.style.width, width)
  assert.equal(parseFloat(rules.style.fontSize).toFixed(1), '15.6')
})

test('autoPaneFit: rules that fit at SudokuPad\'s width keep it; the font grows to 150% at most', () => {
  const fits = (width, font) => font <= 30
  assert.deepEqual(fitOf({ natural: 480, widthLimit: 900, ownPx: 20, fontOffsetPx: 0, fits }), { width: 480, fontPx: 30 })
  assert.deepEqual(fitOf({ natural: 480, widthLimit: 900, ownPx: 17.6, fontOffsetPx: 0, fits }), { width: 480, fontPx: 26 }, 'capped at 150%')
})

test('autoPaneFit: rules that need width get the narrowest fitting width at SudokuPad\'s font', () => {
  const fits = (width, font) => width >= 700 && font <= 17.6
  assert.deepEqual(fitOf({ natural: 480, widthLimit: 900, ownPx: 17.6, fontOffsetPx: 0, fits }), { width: 700, fontPx: 17.6 })
  const readable = (px) => Math.round(600 + (px - 17.6) * 50)
  assert.deepEqual(fitOf({ natural: 480, widthLimit: 900, ownPx: 17.6, fontOffsetPx: 0, fits, readable }), { width: 700, fontPx: 17.6 }, 'a width fits: widened past the readable width')
})

test('autoPaneFit: the text shrinks only at the full width, and never under 70%', () => {
  const fits = (width, font) => width >= 650 && font <= 14
  assert.deepEqual(fitOf({ natural: 480, widthLimit: 650, ownPx: 20, fontOffsetPx: 0, fits }), { width: 650, fontPx: 14 }, 'at the limit and 70%')
  const half = (width, font) => width >= 500 && font <= 16 // fits narrower than the limit too, so the full width is the rule's doing
  assert.deepEqual(fitOf({ natural: 480, widthLimit: 650, ownPx: 20, fontOffsetPx: 0, fits: half, readable: () => 500 }), { width: 650, fontPx: 16 }, 'smaller text at the widest pane, not the readable width')
  const never = (width, font) => font <= 10
  const readable = (px) => Math.round(px * 40)
  assert.deepEqual(fitOf({ natural: 480, widthLimit: 650, ownPx: 20, fontOffsetPx: 0, fits: never, readable }), { width: 560, fontPx: 14 }, 'too long at 70%: the readable width, and it scrolls')
  assert.deepEqual(fitOf({ natural: 480, widthLimit: 650, ownPx: 20, fontOffsetPx: 0, fits: never, readable: () => 300 }), { width: 480, fontPx: 14 }, 'never under SudokuPad\'s width')
})

test('autoPaneFit: the font offset applies on top, inside the floor and cap', () => {
  const fits = (width, font) => width >= 650 && font <= 16
  assert.deepEqual(fitOf({ natural: 480, widthLimit: 650, ownPx: 20, fontOffsetPx: -1, fits }), { width: 650, fontPx: 15 })
  assert.deepEqual(fitOf({ natural: 480, widthLimit: 650, ownPx: 20, fontOffsetPx: -9, fits }), { width: 650, fontPx: 14 })
})

test('autoPaneFit: the font offset that took effect comes back, so a press the floor or cap cancelled is not kept', () => {
  const fits = (width, font) => width >= 650 && font <= 16
  assert.equal(autoPaneFit({ natural: 480, widthLimit: 650, ownPx: 20, fontOffsetPx: -1, fits }).fontOffsetPx, -1)
  assert.equal(autoPaneFit({ natural: 480, widthLimit: 650, ownPx: 20, fontOffsetPx: -9, fits }).fontOffsetPx, -2, '16 - 2 = 14, the floor')
  const short = (width, font) => font <= 30
  assert.equal(autoPaneFit({ natural: 480, widthLimit: 650, ownPx: 20, fontOffsetPx: 5, fits: short }).fontOffsetPx, 0, 'the cap is 30')
})

test('normalizeLimit: a positive whole number of css px, else no limit', () => {
  assert.equal(normalizeLimit(640), 640)
  assert.equal(normalizeLimit('640'), 640)
  assert.equal(normalizeLimit(' 640.4 '), 640)
  for (const empty of [null, undefined, '', '  ', 0, -5, 'abc', NaN, Infinity, 0.2]) assert.equal(normalizeLimit(empty), null, String(empty))
})

test('readLimits: what is saved, in its envelope or from before it, and no limit for what is not', () => {
  assert.deepEqual(readLimits(fakeStore()), noLimits())
  assert.deepEqual(readLimits(fakeStore({ [MAX_WIDTH_KEY]: { v: 0, data: 700 }, [MAX_HEIGHT_KEY]: 500 })), { maxWidth: 700, maxHeight: 500 })
})

test('readLimits: a saved limit that cannot be read is no limit, and is kept under _unreadable through a later save', () => {
  const store = fakeStore({ [MAX_WIDTH_KEY]: 'wide' })
  const { result, warnings } = quietly(() => readLimits(store))
  assert.deepEqual(result, noLimits())
  assert.equal(warnings.length, 1)
  saveLimits(store, { maxWidth: 640, maxHeight: null })
  assert.equal(store.data[`${MAX_WIDTH_KEY}_unreadable`], 'wide')
})

test('one reader per key: a saved limit loads exactly when the same value pastes', () => {
  for (const value of [700, 1, '500', 'wide', 0, -5, 640.5, true, [700], { px: 700 }]) {
    const loaded = quietly(() => readLimits(fakeStore({ [MAX_WIDTH_KEY]: value }))).result.maxWidth
    const pasted = readPaste(JSON.stringify({ [MAX_WIDTH_KEY]: value })).values[MAX_WIDTH_KEY]
    assert.deepEqual(loaded, pasted ?? null, JSON.stringify(value))
  }
})

test('saveLimits: saves a limit in its envelope and removes the key of an empty one, so a fresh install saves nothing', () => {
  const store = fakeStore({ [MAX_HEIGHT_KEY]: 500 })
  saveLimits(store, { maxWidth: 700, maxHeight: null })
  assert.deepEqual(store.data, { [MAX_WIDTH_KEY]: { v: 0, data: 700 } })
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
  assert.equal(VERSION, headerVersion(fs.readFileSync(path.join(__dirname, '..', 'auto-rules-resizer.user.js'), 'utf8')))
})

test('fitRulesPane: rules that scroll even when widened and shrunk end at 70% of SudokuPad\'s font', () => {
  const { rules, fit } = fakePane(8000)
  fit()
  assert.equal(rules.style.fontSize, `${FLOOR_17_6}px`)
})

test('fitRulesPane: reports the font offset that took effect, which f- cannot take under 70% of SudokuPad\'s font', () => {
  const reported = []
  const { rules, fit } = fakePane(8000)
  fit({ fontOffsetPx: -5, onFontOffset: (px) => reported.push(px) })
  assert.equal(rules.style.fontSize, `${FLOOR_17_6}px`)
  assert.deepEqual(reported, [0], 'the rules already sit at the floor, so five presses down changed nothing')
})

test('fitRulesPane: a dragged pane\'s font stays between 70% and 150% of SudokuPad\'s', () => {
  const short = fakePane(26)
  short.fit({ box: { w: 0, h: 300, x: 0, y: -300 } })
  assert.equal(parseFloat(short.rules.style.fontSize) <= 17.6 * 1.5, true, short.rules.style.fontSize)
  const long = fakePane(8000)
  long.fit({ box: { w: 0, h: 20, x: 0, y: -20 } })
  assert.equal(long.rules.style.fontSize, `${FLOOR_17_6}px`)
})

test('fitRulesPane: the room is read in the pane\'s own css px, so a scaled pane does not outgrow it', () => {
  const scale = 1.25
  const { rules, fit, height } = fakePane(140, scale)
  const room = height() + 8 / scale
  fit()
  assert.equal(rules.scrollHeight <= room, true, `scroll height ${rules.scrollHeight} in a room of ${room}`)
})

test('fitRulesPane: the font offset moves the font from the automatic size', () => {
  const { rules, fit } = fakePane(140)
  fit()
  const auto = parseFloat(rules.style.fontSize)
  fit({ fontOffsetPx: 2 })
  assert.equal(parseFloat(rules.style.fontSize), auto + 2)
  fit({ fontOffsetPx: -1 })
  assert.equal(parseFloat(rules.style.fontSize), auto - 1)
})

test('fitRulesPane: with no room it puts the last fit back, the controls\' move too, and says so', () => {
  const { rules, container, controls, fit } = fakePane(140, 1, 0, 364)
  const box = { w: 0, h: 30, x: 0, y: -30 }
  fit({ box })
  const fitted = { ...rules.style }
  container.getBoundingClientRect = () => ({ bottom: 0 })
  assert.equal(fit({ box }), null)
  assert.deepEqual(rules.style, fitted)
  assert.equal(controls.style.translate, '0px -30px')
})

test('fitRulesPane: rules that fit lose SudokuPad\'s empty scrollbar track, rules that still scroll keep it, and a clear gives it back', () => {
  const short = fakePane(140)
  short.fit()
  assert.equal(short.rules.style.overflowY, 'auto')
  clearFit(short.rules, short.controls)
  assert.equal(short.rules.style.overflowY, '')
  const long = fakePane(20000)
  long.fit()
  assert.equal(long.rules.style.overflowY, '', 'rules that scroll even when widened and shrunk keep SudokuPad\'s scroll')
})

test('fitRulesPane: a pane SudokuPad does not show (a puzzle with no rules) gets the fit and the drag taken off', () => {
  const { rules, controls, fit } = fakePane(140)
  fit({ box: { w: 0, h: 30, x: 0, y: -30 } })
  Object.defineProperty(rules, 'offsetWidth', { get: () => 0 })
  assert.equal(fit(), null)
  assert.deepEqual(rules.style, { fontSize: '', width: '', maxWidth: '', boxSizing: '', maxHeight: '', minHeight: '', overflowWrap: '', overflowY: '' })
  assert.equal(controls.style.translate, '')
})

test('fitRulesPane: a drag moves the controls and caps the pane\'s height', () => {
  const { rules, controls, fit } = fakePane(140, 1, 0, 364)
  fit()
  const fitted = rules.offsetHeight
  assert.deepEqual(fit({ box: { w: 0, h: 30, x: 0, y: -30 } }), { w: 0, h: 30, x: 0, y: -30 })
  assert.equal(controls.style.translate, '0px -30px')
  assert.equal(rules.style.maxHeight, `${fitted + 30}px`, 'the fitted pane\'s height plus the drag, not the room under it')
})

test('fitRulesPane: a drag made in a larger window is cut back to the window it is applied in', () => {
  const { controls, fit } = fakePane(140, 1, 0, 364)
  // The column's top is 240: a drag 300 up from a larger window is cut to 240.
  assert.deepEqual(fit({ box: { w: 0, h: 300, x: 0, y: -300 } }), { w: 0, h: 300, x: 0, y: -240 })
  assert.equal(controls.style.translate, '0px -240px')
})

test('fitRulesPane: the pane takes the page\'s spare height below the column and lifts the column only as far as the page needs', () => {
  // 230 chars need about 26 px more than SudokuPad's 224; 10 px are spare below the column and 240 above it.
  const { rules, controls, fit } = fakePane(230, 1, 0, 10)
  assert.deepEqual(fit({ pageTop: 0 }), noRulesDrag(), 'the lift is the fit\'s, not a drag')
  assert.equal(rules.scrollHeight <= rules.clientHeight, true, 'shown whole')
  assert.equal(rules.clientHeight > 224 + 10, true, `pane ${rules.clientHeight} px, more than the spare below`)
  const lift = parseFloat(controls.style.translate.split(' ')[1])
  assert.equal(Math.abs(controls.getBoundingClientRect().bottom - VIEWPORT.height) < 1, true, 'the column ends at the window\'s bottom')
  assert.equal(lift < 0, true, `lifted ${lift}`)
})

test('fitRulesPane: rules that need less than the spare below lift nothing', () => {
  const { controls, fit } = fakePane(230, 1, 0, 300)
  fit()
  assert.equal(controls.style.translate, '')
})

test('fitRulesPane: the pane never grows past the page\'s spare height: the column stays between the page\'s top and the window\'s bottom', () => {
  const { rules, controls, fit } = fakePane(5000, 1, 0, 50)
  fit({ pageTop: 200 }) // 40 px above the column and 50 below: 90 spare
  const column = controls.getBoundingClientRect()
  assert.equal(column.bottom <= VIEWPORT.height, true, `column bottom ${column.bottom}`)
  assert.equal(column.top >= 200, true, `column top ${column.top}`)
  assert.equal(rules.clientHeight, 224 + 90, 'all the spare, no more')
})

test('fitRulesPane: a max auto height holds the pane under the spare height too', () => {
  const { rules, fit } = fakePane(5000, 1, 0, 300)
  fit({ limits: { maxWidth: null, maxHeight: 250 } })
  assert.equal(rules.clientHeight, 250)
})

test('fitRulesPane: a sideways drag keeps the pane\'s grown height and the lift that keeps the column on the page', () => {
  const { rules, controls, fit } = fakePane(5000, 1, 0, 50)
  fit({ pageTop: 0, box: { w: 40, h: 0, x: -40, y: 0 } })
  assert.equal(rules.clientHeight > 224 + 50, true, `pane ${rules.clientHeight} px`)
  assert.equal(controls.getBoundingClientRect().bottom <= VIEWPORT.height, true)
  assert.match(controls.style.translate, /^-40px -/)
})

test('fitRulesPane: a height drag adds to the grown pane, so it never shrinks it, and to the column\'s lift', () => {
  const { rules, controls, fit } = fakePane(5000, 1, 0, 50)
  fit({ pageTop: 0 })
  const grown = rules.offsetHeight
  const lift = parseFloat(controls.style.translate.split(' ')[1])
  assert.equal(grown > 224, true)
  assert.deepEqual(fit({ pageTop: 0, box: { w: 0, h: 20, x: 0, y: -20 } }), { w: 0, h: 20, x: 0, y: -20 })
  assert.equal(rules.style.maxHeight, `${grown + 20}px`)
  assert.equal(controls.style.translate, `0px ${-20 + lift}px`)
})

test('fitRulesPane: the lift is measured with the width and font the fit chose, for any font offset', () => {
  for (const chars of [230, 400, 1500, 5000]) {
    for (const fontOffsetPx of [-3, 0, 3]) {
      const { rules, controls, fit } = fakePane(chars, 1, 0, 10)
      fit({ pageTop: 0, fontOffsetPx })
      const bottom = controls.getBoundingClientRect().bottom
      const grown = rules.offsetHeight > 224 + 1
      assert.equal(bottom <= VIEWPORT.height, true, `${chars} chars, offset ${fontOffsetPx}: column bottom ${bottom} runs off the window`)
      if (grown) assert.equal(bottom >= VIEWPORT.height - 1, true, `${chars} chars, offset ${fontOffsetPx}: column bottom ${bottom} short of the window's bottom, pane ${rules.offsetHeight}`)
    }
  }
})

test('fitRulesPane: without the spare height (the refit is off) the pane keeps the room it had and the column stays put', () => {
  const { rules, controls, fit } = fakePane(5000, 1, 0, 300)
  fit({ pageTop: 0, useSpare: false })
  assert.equal(rules.clientHeight <= 224 + 8, true, `pane ${rules.clientHeight} px`)
  assert.equal(controls.style.translate, '')
})

test('clearFit: takes the fit\'s output off the pane and the controls', () => {
  const { rules, controls, fit } = fakePane(140)
  fit({ box: { w: -20, h: 30, x: 20, y: -30 } })
  assert.notEqual(controls.style.translate, '')
  clearFit(rules, controls)
  assert.deepEqual(rules.style, { fontSize: '', width: '', maxWidth: '', boxSizing: '', maxHeight: '', minHeight: '', overflowWrap: '', overflowY: '' })
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

// A store that counts its writes, so a test can tell a skipped write from one that wrote the same value.
function countingStore (saved) {
  const store = fakeStore(saved)
  const writes = []
  return {
    ...store,
    writes,
    setData: (key, value) => { writes.push(['setData', key]); store.setData(key, value) },
    removeData: (key) => { writes.push(['removeData', key]); store.removeData(key) }
  }
}

test('saveSizing and loadSizing: a puzzle never resized starts at the default, and another puzzle does not inherit a resized one', () => {
  const store = fakeStore()
  assert.deepEqual(loadSizing(store, 'puzzle-a'), noSizing())
  saveSizing(store, 'puzzle-a', { fontOffsetPx: 2, box: { w: 40, h: 0, x: 0, y: 0 } })
  assert.deepEqual(loadSizing(store, 'puzzle-b'), noSizing())
  saveSizing(store, 'puzzle-b', noSizing())
  assert.deepEqual(Object.keys(store.data), [`${SIZING_KEY_PREFIX}puzzle-a`], 'the untouched puzzle saves nothing')
})

test('saveSizing: the stored shape is { nudgePx, box } in its envelope, so a sizing saved by 0.7.0 still reads', () => {
  const store = fakeStore()
  saveSizing(store, 'puzzle-a', { fontOffsetPx: -3, box: { w: 0, h: 25, x: 0, y: -25 } })
  assert.deepEqual(store.data, { [`${SIZING_KEY_PREFIX}puzzle-a`]: { v: 0, data: { nudgePx: -3, box: { w: 0, h: 25, x: 0, y: -25 } } } })
  const reloaded = fakeStore(JSON.parse(JSON.stringify(store.data)))
  assert.deepEqual(loadSizing(reloaded, 'puzzle-a'), { fontOffsetPx: -3, box: { w: 0, h: 25, x: 0, y: -25 } }, 'a fresh store over the same data, as after a reload')
})

test('saveSizing: a sizing already saved as it is, or a default with no key, writes nothing', () => {
  const store = countingStore()
  const sizing = { fontOffsetPx: 1, box: { w: 10, h: 0, x: 0, y: 0 } }
  saveSizing(store, 'puzzle-a', sizing)
  saveSizing(store, 'puzzle-a', { ...sizing, box: { ...sizing.box } })
  saveSizing(store, 'puzzle-b', noSizing())
  assert.deepEqual(store.writes, [['setData', `${SIZING_KEY_PREFIX}puzzle-a`]])
  saveSizing(store, 'puzzle-a', noSizing())
  assert.deepEqual(store.writes.at(-1), ['removeData', `${SIZING_KEY_PREFIX}puzzle-a`], 'back to the default removes the key')
})

test('saveSizing and loadSizing: a font offset stopped at the floor or cap, a fraction of a px, survives a reload', () => {
  // Rules that fit at 12 px and below, at SudokuPad's 16 px, at any width: the floor is 11.2, so one f- from 12 takes 0.8 px.
  const fit = autoPaneFit({ natural: 300, widthLimit: 300, ownPx: 16, fontOffsetPx: -1, fits: (w, f) => f <= 12 })
  assert.equal(Number.isInteger(fit.fontOffsetPx), false, `offset ${fit.fontOffsetPx}`)
  const store = fakeStore()
  saveSizing(store, 'puzzle-a', { fontOffsetPx: fit.fontOffsetPx, box: noRulesDrag() })
  const reloaded = fakeStore(JSON.parse(JSON.stringify(store.data)))
  const { result, warnings } = quietly(() => loadSizing(reloaded, 'puzzle-a'))
  assert.deepEqual(warnings, [])
  assert.deepEqual(result, { fontOffsetPx: fit.fontOffsetPx, box: noRulesDrag() })
})

test('loadSizing: an unreadable saved sizing is kept aside and the puzzle starts at the default', () => {
  const box = { w: 10, h: 0, x: 0, y: 0 }
  const unreadable = [
    ['an offset that is no number', { nudgePx: '1', box }],
    ['an offset that is null', { nudgePx: null, box }],
    ['no box', { nudgePx: 1 }],
    ['a box side that is no number', { nudgePx: 1, box: { ...box, h: '2' } }]
  ]
  for (const [why, data] of unreadable) {
    const bad = { v: 0, data }
    const store = fakeStore({ [`${SIZING_KEY_PREFIX}puzzle-x`]: bad })
    const { result, warnings } = quietly(() => loadSizing(store, 'puzzle-x'))
    assert.deepEqual(result, noSizing(), why)
    assert.deepEqual(store.data[`${SIZING_KEY_PREFIX}puzzle-x_unreadable`], bad, why)
    assert.equal(warnings.length, 1, why)
  }
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

test('watchCornerDrag: vertical drift under 4 px from the press is ignored, and past it all of the vertical movement counts', () => {
  const corner = fakeTarget()
  const win = fakeTarget()
  const moves = []
  watchCornerDrag(corner, win, (dx, dy) => moves.push([dx, dy]), () => {})
  corner.fire('pointerdown', 100, 100)
  win.fire('pointermove', 110, 102)
  win.fire('pointermove', 120, 103)
  assert.deepEqual(moves, [[10, 0], [10, 0]], 'drift of 3 px')
  win.fire('pointermove', 130, 104)
  win.fire('pointermove', 130, 110)
  assert.deepEqual(moves.slice(2), [[10, 4], [0, 6]], 'at 4 px the whole 4 px counts, then each move')
})

test('copiedSettings: both limits in force, null for no limit', () => {
  assert.deepEqual(JSON.parse(copiedSettings(fakeStore())), { [MAX_WIDTH_KEY]: null, [MAX_HEIGHT_KEY]: null })
  assert.deepEqual(JSON.parse(copiedSettings(fakeStore({ [MAX_WIDTH_KEY]: 700, [MAX_HEIGHT_KEY]: 500, Other_key: 1 }))), { [MAX_WIDTH_KEY]: 700, [MAX_HEIGHT_KEY]: 500 })
  assert.deepEqual(JSON.parse(copiedSettings(fakeStore({ [MAX_HEIGHT_KEY]: 500 }))), { [MAX_WIDTH_KEY]: null, [MAX_HEIGHT_KEY]: 500 })
})

test('pastedSettings: a whole number of pixels or null is kept, anything else is skipped and counted, other keys are ignored', () => {
  assert.deepEqual(readPaste(JSON.stringify({ [MAX_WIDTH_KEY]: 700, [MAX_HEIGHT_KEY]: null, DarkPage_color: '#ffffff' })), { values: { [MAX_WIDTH_KEY]: 700, [MAX_HEIGHT_KEY]: null }, skipped: 0 })
  assert.deepEqual(readPaste(JSON.stringify({ [MAX_WIDTH_KEY]: 700.4, [MAX_HEIGHT_KEY]: 'tall' })), { values: {}, skipped: 2 })
  assert.deepEqual(readPaste(JSON.stringify({ [MAX_WIDTH_KEY]: true, [MAX_HEIGHT_KEY]: -3 })), { values: {}, skipped: 2 })
})

test('the script has no pointerover or pointerout listener', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'auto-rules-resizer.user.js'), 'utf8')
  assert.doesNotMatch(source, /pointerover|pointerout/)
})

// A SudokuPad with every internal Auto Rules Resizer needs.
const completeSudokuPad = () => ({
  Framework: { getApp () {}, app: { puzzle: {}, resize () {} }, addSetting () {}, showDialog () {}, closeDialog () {}, getData () {}, setData () {}, removeData () {} }
})

test('Auto Rules Resizer declares each SudokuPad internal it calls, and a complete SudokuPad lacks none', () => {
  assert.deepEqual(lackingInternals(FEATURES, completeSudokuPad()), new Map())
})

test('without one internal, only the features that need it are lacking: getApp holds off the fit and the refit', () => {
  const removals = [
    ['Framework.app.puzzle', (r) => { delete r.Framework.app.puzzle }, ['fit']],
    ['Framework.app.resize', (r) => { delete r.Framework.app.resize }, ['refit']],
    ...['addSetting', 'showDialog', 'closeDialog'].map((name) => [`Framework.${name}`, (r) => { delete r.Framework[name] }, ['settings']]),
    ...['getData', 'setData', 'removeData'].map((name) => [`Framework.${name}`, (r) => { delete r.Framework[name] }, ['sizing', 'settings']])
  ]
  for (const [internal, remove, feature] of removals) {
    const roots = completeSudokuPad()
    remove(roots)
    assert.deepEqual(lackingInternals(FEATURES, roots), new Map([[internal, feature]]), internal)
  }
  const roots = completeSudokuPad()
  delete roots.Framework.getApp
  assert.deepEqual(lackingInternals(FEATURES, roots), new Map([['Framework.getApp', ['fit', 'refit']]]))
})

// Starts the script on a page with `framework` as its Framework; returns the warnings and the notice bar's text, or null for none.
function startWith (framework) {
  const file = require.resolve('../auto-rules-resizer.user.js')
  const inBody = []
  const element = () => {
    const el = { style: {}, children: [], textContent: '', attributes: {}, classList: { toggle () {} }, setAttribute (name, value) { el.attributes[name] = value }, addEventListener () {}, append (...kids) { el.children.push(...kids) }, appendChild (kid) { el.children.push(kid) }, remove () { el.removed = true } }
    return el
  }
  const textOf = (el) => el.textContent + el.children.map(textOf).join('')
  const saved = { document: global.document, window: global.window, Framework: global.Framework }
  global.document = {
    createElement: element,
    head: { appendChild () {} },
    body: { append: (el) => inBody.push(el), appendChild () {}, classList: { toggle () {} } },
    documentElement: { outerHTML: '' },
    getElementById: () => null,
    querySelector: () => null
  }
  global.window = { addEventListener () {} }
  global.Framework = framework
  const warnings = []
  const realWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  delete require.cache[file]
  try {
    require(file)
  } finally {
    console.warn = realWarn
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete global[name]
      else global[name] = value
    }
    delete require.cache[file]
  }
  const [bar] = inBody.flatMap((host) => host.children).filter((el) => el.attributes['data-script'] === 'auto-rules-resizer' && !el.removed)
  return { warnings, bar: bar ? textOf(bar) : null }
}

test('a Framework without getApp turns the fit and the refit off with one warning naming getApp, the bar names them, and the settings entry is still added', () => {
  const entries = []
  const framework = { addSetting: (setting) => entries.push(setting.name), showDialog () {}, closeDialog () {}, getData: () => null, setData () {}, removeData () {} }
  const page = startWith(framework)
  assert.deepEqual(page.warnings, ['auto-rules-resizer: rules fit, rules refit skipped because SudokuPad has no Framework.getApp'])
  assert.match(page.bar, /^Auto Rules Resizer: rules fit, rules refit are off — SudokuPad changed\.Report/)
  assert.deepEqual(entries, ['rulesresizer'])
})
