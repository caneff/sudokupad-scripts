import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { noteDrop } from './note-drop.mjs'

const PAGE = [1200, 900]
// The 4x4 repro of #944: a 697 x 191 note, the covered digit button's centre at (759, 483), the board's middle at (427, 544).
const WIDE = { size: [697, 191], reach: 0, at: [759, 483] }

describe('noteDrop', () => {
  it('drops on the board\'s middle when a note there leaves the button uncovered', () => {
    assert.deepEqual(noteDrop([427, 544], { size: [100, 50], reach: 0, at: [759, 483] }, PAGE), [427, 544])
  })

  it('goes just left of the button when the note would still cover it on the middle and fits there', () => {
    const [x, y] = noteDrop([427, 544], WIDE, PAGE)
    assert.equal(x, 759 - 4 - 697 / 2)
    assert.equal(y, 544)
  })

  it('goes just above the button when left leaves the page', () => {
    const [x, y] = noteDrop([427, 544], { size: [697, 191], reach: 0, at: [500, 483] }, PAGE)
    assert.equal(x, 427)
    assert.equal(y, 483 - 4 - 191 / 2)
  })

  it('skips an above that leaves the page for the right of the button', () => {
    const [x, y] = noteDrop([150, 544], { size: [300, 600], reach: 0, at: [100, 300] }, PAGE)
    assert.equal(x, 100 + 4 + 150)
    assert.equal(y, 544)
  })

  it('keeps the middle when no place clears the button', () => {
    assert.deepEqual(noteDrop([600, 450], { size: [4000, 3000], reach: 0, at: [600, 450] }, PAGE), [600, 450])
  })

  it('counts a handle\'s reach as part of what covers the button', () => {
    const bare = { size: [100, 50], reach: 0, at: [500, 483] }
    assert.deepEqual(noteDrop([427, 544], bare, PAGE), [427, 544])
    assert.notDeepEqual(noteDrop([427, 544], { ...bare, reach: 120 }, PAGE), [427, 544])
  })

  // #1060: a 765 x 191-wide note over the settings button (751, 369) and a digit button (746, 440) at once. Clearing only the first put it back over the second, and the tries ran out.
  describe('with several buttons to keep clear (#1060)', () => {
    const covered = { size: [765, 212], reach: 0, at: [751, 369], avoid: [[751, 369], [746, 440], [746, 520], [746, 600]] }
    const clears = ([cx, cy], { size: [w, h], avoid }) => avoid.every(([bx, by]) => Math.abs(cx - bx) >= w / 2 || Math.abs(cy - by) >= h / 2)

    it('drops where none of the buttons is covered', () => {
      assert.ok(clears(noteDrop([427, 544], covered, PAGE), covered))
    })

    it('falls back to clearing the one button it was told about when nothing clears them all', () => {
      // A 100 x 4000 note is taller than the page, and buttons every 50 px across it leave it always over one of them.
      const avoid = Array.from({ length: 24 }, (_, i) => [i * 50, 450])
      const [x] = noteDrop([600, 450], { size: [100, 4000], reach: 0, at: [600, 450], avoid }, PAGE)
      assert.ok(Math.abs(x - 600) >= 50)
    })
  })
})
