import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { visiblePoint } from './visible-point.mjs'

const WINDOW = [1200, 900]

describe('visiblePoint', () => {
  it('is the middle of a box wholly inside the window', () => {
    assert.deepEqual(visiblePoint({ x: 100, y: 200, width: 10, height: 20 }, WINDOW), [105, 210])
  })

  it('is the middle of the part still in the window for a box straddling the bottom edge (seed 84191676 of #1002: y 895 to 906)', () => {
    assert.deepEqual(visiblePoint({ x: 121, y: 895, width: 10, height: 11 }, WINDOW), [126, 897.5])
  })

  it('is the middle of the part still in the window for a box straddling the right or the top-left edge', () => {
    assert.deepEqual(visiblePoint({ x: 1195, y: 50, width: 10, height: 10 }, WINDOW), [1197.5, 55])
    assert.deepEqual(visiblePoint({ x: -4, y: -6, width: 10, height: 10 }, WINDOW), [3, 2])
  })

  it('is null for a box wholly past an edge (seed 621857433 of #1002: y 931 to 942), or one that only touches it', () => {
    assert.equal(visiblePoint({ x: 500, y: 931, width: 10, height: 11 }, WINDOW), null)
    assert.equal(visiblePoint({ x: 500, y: 900, width: 10, height: 11 }, WINDOW), null)
    assert.equal(visiblePoint({ x: 1200, y: 50, width: 10, height: 10 }, WINDOW), null)
  })
})
