'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  largestSize, rulesRoom, rulesContainer, rulesWidth, autoFontPx, nudgedFontPx, fitRulesPane, clearFit,
  dragRulesBox, draggedPane, draggedBox, noRulesDrag, isLandscape, streamScriptActive, makeTrailing, watchCornerDrag
} = require('./auto-rules-resizer.user.js')

test('largestSize: the biggest integer in [min, max] the predicate accepts, min when none does', () => {
  assert.equal(largestSize((n) => n <= 37, 8, 200), 37)
  assert.equal(largestSize(() => true, 8, 200), 200)
  assert.equal(largestSize(() => false, 8, 200), 8)
})

test('rulesRoom: from the rules\' top to the container\'s bottom, less its bottom padding', () => {
  assert.equal(rulesRoom({ rulesTop: 100, containerBottom: 700 }), 600)
  assert.equal(rulesRoom({ rulesTop: 100, containerBottom: 700, paddingBottom: 20 }), 580)
})

test('rulesRoom: never past the window', () => {
  assert.equal(rulesRoom({ rulesTop: 100, containerBottom: 2000, viewportBottom: 900 }), 800)
})

test('rulesRoom: zero for a container that ends above the rules\' top', () => {
  assert.equal(rulesRoom({ rulesTop: 500, containerBottom: 300 }), 0)
  assert.equal(rulesRoom({ rulesTop: 300, containerBottom: 300 }), 0)
  assert.equal(rulesRoom({ rulesTop: 300, containerBottom: 310, paddingBottom: 40 }), 0)
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
function fakePane (chars, scale = 1) {
  const style = { fontSize: '', width: '', maxWidth: '', boxSizing: '', maxHeight: '', overflowWrap: '' }
  const font = () => parseFloat(style.fontSize) || 17.6
  const width = () => parseFloat(style.width) || 480
  const scrollHeight = () => Math.ceil((chars * font() * 0.5) / (width() - 32)) * font() * 1.2 + 32
  const height = () => Math.min(224, scrollHeight())
  const rules = {
    style,
    get offsetWidth () { return width() },
    get scrollHeight () { return scrollHeight() },
    get clientHeight () { return height() },
    getBoundingClientRect: () => ({ left: 1000, top: 300, width: width() * scale, height: height() * scale })
  }
  const container = { getBoundingClientRect: () => ({ bottom: 300 + height() * scale + 8 }) }
  const getStyle = (el) => (el === rules ? { fontSize: `${font()}px` } : { paddingBottom: '0' })
  const controls = { style: { translate: '' } }
  const fit = (opts = {}) => fitRulesPane({ rules, container, getStyle, viewport: { width: 2048, height: 1064 }, nudgePx: 0, controls, ...opts })
  return { rules, container, controls, fit, height }
}

test('fitRulesPane: widens the pane and grows the font of rules that fit, and a second fit changes nothing', () => {
  for (const chars of [26, 140, 420]) {
    const { rules, fit } = fakePane(chars)
    assert.equal(fit(), true)
    const first = { ...rules.style }
    assert.ok(parseFloat(first.width) > 480, `${chars} chars: widened to ${first.width}`)
    assert.ok(parseFloat(first.fontSize) > 17.6, `${chars} chars: font grew to ${first.fontSize}`)
    assert.equal(rules.scrollHeight <= rules.clientHeight, true, `${chars} chars: no scrolling`)
    for (let i = 0; i < 5; i++) fit()
    assert.deepEqual(rules.style, first, `${chars} chars: refits are stable`)
  }
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

test('fitRulesPane: with no room it puts the last fit back, and says so', () => {
  const { rules, container, fit } = fakePane(140)
  fit()
  const fitted = { ...rules.style }
  container.getBoundingClientRect = () => ({ bottom: 0 })
  assert.equal(fit(), false)
  assert.deepEqual(rules.style, fitted)
})

test('fitRulesPane: a pane SudokuPad does not show (a puzzle with no rules) is left as it is', () => {
  const { rules, fit } = fakePane(140)
  Object.defineProperty(rules, 'offsetWidth', { get: () => 0 })
  assert.equal(fit(), false)
  assert.equal(rules.style.fontSize, '')
  assert.equal(rules.style.width, '')
})

test('fitRulesPane: a drag moves the controls and caps the pane\'s height', () => {
  const { rules, controls, fit } = fakePane(140)
  fit({ box: { w: 0, h: 30, x: 0, y: -30 } })
  assert.equal(controls.style.translate, '0px -30px')
  assert.notEqual(rules.style.maxHeight, '')
})

test('clearFit: takes the fit\'s output off the pane and the controls', () => {
  const { rules, controls, fit } = fakePane(140)
  fit({ box: { w: -20, h: 30, x: 20, y: -30 } })
  clearFit(rules, controls)
  assert.deepEqual(rules.style, { fontSize: '', width: '', maxWidth: '', boxSizing: '', maxHeight: '', overflowWrap: '' })
  assert.equal(controls.style.translate, '')
})

const NO_BOX = { w: 0, h: 0, x: 0, y: 0 }
const PANE = { width: 480, height: 200 }
const MIN_PANE = { width: 240, height: 112 } // 15 x 7 rem at 16 px
const ROOMY = { right: 500, up: 500, left: 500, down: 500 }

test('dragRulesBox: the top-right corner grows the pane right and up, moving the controls up', () => {
  assert.deepEqual(dragRulesBox(NO_BOX, 'ur', 40, -30, PANE, MIN_PANE, ROOMY), { w: 40, h: 30, x: 0, y: -30 })
})

test('dragRulesBox: the bottom-left corner grows the pane left and down, moving the controls left', () => {
  assert.deepEqual(dragRulesBox(NO_BOX, 'dl', -50, 20, PANE, MIN_PANE, ROOMY), { w: 50, h: 20, x: -50, y: 0 })
})

test('dragRulesBox: drags add up, and never shrink the pane under 15 x 7 rem', () => {
  const once = dragRulesBox(NO_BOX, 'ur', 40, -30, PANE, MIN_PANE, ROOMY)
  assert.deepEqual(dragRulesBox(once, 'ur', 10, -5, { width: 520, height: 230 }, MIN_PANE, ROOMY), { w: 50, h: 35, x: 0, y: -35 })
  // A drag far past the floor stops at it: 480 - 240 = 240 of width, 200 - 112 = 88 of height.
  assert.deepEqual(dragRulesBox(NO_BOX, 'ur', -900, 900, PANE, MIN_PANE, ROOMY), { w: -240, h: -88, x: 0, y: 88 })
  assert.deepEqual(dragRulesBox(NO_BOX, 'dl', 900, -900, PANE, MIN_PANE, ROOMY), { w: -240, h: -88, x: 240, y: 0 })
})

test('dragRulesBox: a pane already under the floor grows by the drag, not to the floor, and does not shrink', () => {
  const short = { width: 200, height: 80 }
  assert.deepEqual(dragRulesBox(NO_BOX, 'ur', 5, -10, short, MIN_PANE, ROOMY), { w: 5, h: 10, x: 0, y: -10 })
  assert.deepEqual(dragRulesBox(NO_BOX, 'dl', 5, -10, short, MIN_PANE, ROOMY), NO_BOX)
})

test('dragRulesBox: a corner stops where the pane would leave the free space, the board\'s edge included', () => {
  const free = { right: 8, up: 60, left: 100, down: 30 }
  assert.deepEqual(dragRulesBox(NO_BOX, 'ur', 900, -900, PANE, MIN_PANE, free), { w: 8, h: 60, x: 0, y: -60 })
  assert.deepEqual(dragRulesBox(NO_BOX, 'dl', -3000, 900, PANE, MIN_PANE, free), { w: 100, h: 30, x: -100, y: 0 })
  // Already past the window (a resize): only shrinking is left.
  assert.deepEqual(dragRulesBox(NO_BOX, 'ur', 50, 0, PANE, MIN_PANE, { ...free, right: -40 }), NO_BOX)
})

test('dragRulesBox: a corner the pane does not have is refused', () => {
  assert.throws(() => dragRulesBox(NO_BOX, 'ul', 1, 1, PANE, MIN_PANE, ROOMY), /no corner "ul"/)
})

test('draggedPane: the drag\'s deltas on the fit\'s answers, in css px, never under the floor nor past the window', () => {
  const base = { width: 600, room: 200, scale: 1.25, left: 1000, top: 300, viewport: { width: 2048, height: 1064 } }
  assert.deepEqual(draggedPane({ ...base, box: NO_BOX }), { width: 600, room: 200 })
  assert.deepEqual(draggedPane({ ...base, box: { w: -125, h: 50, x: 0, y: -50 } }), { width: 500, room: 240 }, 'visual px over scale')
  assert.deepEqual(draggedPane({ ...base, box: { w: -9999, h: -9999, x: 0, y: 0 } }), { width: 240, room: 112 }, '15 x 7 rem')
  // Right edge: (2048 - 8 - 1000 - 0) / 1.25 = 832 css px at most; bottom: (1064 - 300 + 50) / 1.25 = 651.
  assert.deepEqual(draggedPane({ ...base, box: { w: 9999, h: 9999, x: 0, y: -50 } }), { width: 832, room: 651 })
  assert.deepEqual(draggedPane({ ...base, scale: 0, box: { w: 50, h: 50, x: 0, y: 0 } }), { width: 600, room: 200 }, 'no usable scale, no drag')
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

// A document holding elements with the given ids, answering the two lookups a page script uses.
function fakeDocument (ids) {
  return {
    getElementById: (id) => (ids.includes(id) ? { id } : null),
    querySelector: (selector) => {
      const prefix = /^\[id\^="([^"]+)"\]$/.exec(selector)
      if (!prefix) throw new Error(`the fake document does not answer ${selector}`)
      const id = ids.find((i) => i.startsWith(prefix[1]))
      return id ? { id } : null
    }
  }
}

test('streamScriptActive: true when the stream script\'s nudge bar or a drag corner of its is on the page', () => {
  assert.equal(streamScriptActive(fakeDocument(['sudokupad-sync-nudge'])), true)
  assert.equal(streamScriptActive(fakeDocument(['sudokupad-sync-drag-rules-ur'])), true)
  assert.equal(streamScriptActive(fakeDocument(['sudokupad-sync-drag-rules-dl'])), true)
  assert.equal(streamScriptActive(fakeDocument(['controls', 'board', 'sudokupad-sync-badge'])), false)
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
