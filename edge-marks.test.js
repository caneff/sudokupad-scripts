'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { nextKind, planClick, normalizeSettings, shapeOf, shapePath, DEFAULT_SETTINGS } = require('./edge-marks.user.js')

const ALL = { x: true, directions: true, dot: true }
const NONE = { x: false, directions: false, dot: false }

test('fresh install has every mark ticked', () => {
  assert.deepEqual(DEFAULT_SETTINGS, ALL)
  assert.deepEqual(normalizeSettings(null), ALL)
  assert.deepEqual(normalizeSettings(undefined), ALL)
})

test('corrupt saved settings fall back to every mark ticked', () => {
  for (const bad of ['x', 7, true, [], [false], '{"x":false}']) {
    assert.deepEqual(normalizeSettings(bad), ALL, JSON.stringify(bad))
  }
})

test('a saved boolean is kept and a non-boolean entry takes its default', () => {
  assert.deepEqual(normalizeSettings({ x: false, directions: 'no', dot: false }), { x: false, directions: true, dot: false })
})

test('with everything ticked the cycle is X, direction, other direction, dot, empty', () => {
  const seen = []
  let kind = 'empty'
  for (let i = 0; i < 5; i++) {
    kind = nextKind(kind, ALL)
    seen.push(kind)
  }
  assert.deepEqual(seen, ['x', 'dirA', 'dirB', 'dot', 'empty'])
})

test('an unticked type is skipped', () => {
  assert.equal(nextKind('empty', { x: false, directions: true, dot: true }), 'dirA')
  assert.equal(nextKind('dirB', { x: true, directions: true, dot: false }), 'empty')
  assert.equal(nextKind('x', { x: true, directions: false, dot: true }), 'dot')
  assert.equal(nextKind('empty', { x: false, directions: false, dot: true }), 'dot')
  assert.equal(nextKind('dot', { x: false, directions: false, dot: true }), 'empty')
})

test('Directions is one box: both directions or neither', () => {
  const only = { x: false, directions: true, dot: false }
  assert.equal(nextKind('empty', only), 'dirA')
  assert.equal(nextKind('dirA', only), 'dirB')
  assert.equal(nextKind('dirB', only), 'empty')
})

test('a mark whose type is unticked moves to the next ticked mark, or to empty', () => {
  assert.equal(nextKind('x', { x: false, directions: false, dot: true }), 'dot')
  assert.equal(nextKind('x', { x: false, directions: false, dot: false }), 'empty')
  assert.equal(nextKind('dot', { x: true, directions: false, dot: false }), 'empty')
})

test('a click on an empty right edge adds the X, which is the character 3', () => {
  assert.deepEqual(planClick('3', [], ALL), { remove: [], add: '3' })
})

test('the cycle on a right edge uses 3, h, i, j then clears', () => {
  assert.deepEqual(planClick('3', ['3'], ALL), { remove: ['3'], add: 'h' })
  assert.deepEqual(planClick('3', ['h'], ALL), { remove: ['h'], add: 'i' })
  assert.deepEqual(planClick('3', ['i'], ALL), { remove: ['i'], add: 'j' })
  assert.deepEqual(planClick('3', ['j'], ALL), { remove: ['j'], add: null })
})

test('each edge has its own characters, none shared with another edge or with SudokuPad\'s lines', () => {
  const used = new Set()
  for (const edge of ['3', '4', 'b', 'c']) {
    let present = []
    for (let i = 0; i < 4; i++) {
      const plan = planClick(edge, present, ALL)
      assert.notEqual(plan.add, null)
      assert.equal(used.has(plan.add), false, plan.add)
      used.add(plan.add)
      present = [plan.add]
    }
  }
  assert.deepEqual([...used].sort(), ['3', '4', 'b', 'c', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's'])
})

test('a mark on another edge of the same cell is left alone', () => {
  // the cell has the right-edge X and the bottom-edge dot; a click on the right edge sees only its own
  assert.deepEqual(planClick('3', ['3', 'm', '5'], ALL), { remove: ['3'], add: 'h' })
})

test('with nothing ticked the click does nothing, and an existing mark stays', () => {
  assert.equal(planClick('3', [], NONE), null)
  assert.equal(planClick('3', ['3'], NONE), null)
  assert.equal(planClick('4', ['k'], NONE), null)
})

test('an unticked mark already on the grid moves to the next ticked mark', () => {
  assert.deepEqual(planClick('3', ['3'], { x: false, directions: false, dot: true }), { remove: ['3'], add: 'j' })
})

test('two marks on one edge, as a replay can hold, both go on the next click', () => {
  assert.deepEqual(planClick('3', ['3', 'j'], ALL), { remove: ['3', 'j'], add: 'h' })
})

test('shapeOf names the arrow each character draws, per edge', () => {
  assert.deepEqual(['h', 'i', 'j'].map(shapeOf), ['>', '<', '.'])
  assert.deepEqual(['k', 'l', 'm'].map(shapeOf), ['^', 'v', '.'])
  assert.deepEqual(['n', 'o', 'p'].map(shapeOf), ['>', '<', '.'])
  assert.deepEqual(['q', 'r', 's'].map(shapeOf), ['^', 'v', '.'])
  for (const other of ['3', '4', 'b', 'c', '0', '5', 'a', 'g', 't', 'z']) {
    assert.equal(shapeOf(other), null, other)
  }
})

test('the dot is a zero-length segment, which a round cap draws and fill: none does not hide', () => {
  assert.match(shapePath('.', 8), /^ l0 0$/)
})

test('an arrow is a two-segment chevron pointing the way it names', () => {
  // relative to the edge midpoint: the tip is the middle vertex
  const tip = (d) => {
    const [, mx, my, l1x, l1y] = d.match(/m ?(-?[\d.]+),(-?[\d.]+) l ?(-?[\d.]+),(-?[\d.]+)/)
    return [Number(mx) + Number(l1x), Number(my) + Number(l1y)]
  }
  const [rx] = tip(shapePath('>', 8))
  const [lx] = tip(shapePath('<', 8))
  const [, uy] = tip(shapePath('^', 8))
  const [, dy] = tip(shapePath('v', 8))
  assert.equal(rx > 0, true)
  assert.equal(lx < 0, true)
  assert.equal(uy < 0, true)
  assert.equal(dy > 0, true)
})
