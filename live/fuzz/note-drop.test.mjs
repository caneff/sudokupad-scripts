import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { noteDrop } from './note-drop.mjs'

const PAGE = [1200, 900]
// The 4x4 repro of #944: a 697 x 191 note, the covered digit button's centre at (759, 483), the board's middle at (427, 544).
const WIDE = { size: [697, 191], reach: 0, at: [759, 483] }
const MIDDLE = [427, 544]

// Whether a note of `size` centred at `c` covers none of `points`.
const clears = (c, [w, h], points, reach = 0) => points.every(([bx, by]) => Math.abs(c[0] - bx) >= w / 2 + reach || Math.abs(c[1] - by) >= h / 2 + reach)
const wholeOnPage = ([cx, cy], [w, h]) => cx - w / 2 >= 0 && cy - h / 2 >= 0 && cx + w / 2 <= PAGE[0] && cy + h / 2 <= PAGE[1]

describe('noteDrop', () => {
  it('drops on the board\'s middle when a note there leaves the button uncovered', () => {
    assert.deepEqual(noteDrop(MIDDLE, { size: [100, 50], reach: 0, at: [759, 483] }, PAGE), MIDDLE)
  })

  it('drops where the button is clear, the whole note on the page, when the middle still covers it', () => {
    const drop = noteDrop(MIDDLE, WIDE, PAGE)
    assert.notDeepEqual(drop, MIDDLE)
    assert.ok(clears(drop, WIDE.size, [WIDE.at]) && wholeOnPage(drop, WIDE.size), `dropped at ${drop}`)
  })

  it('lets the note hang off the page, its middle still on it, when no place holds all of it', () => {
    // 1100 x 1000 on a 1200 x 900 page: any whole-on-page place is over the button, and a place clear of it is half off the page.
    const note = { size: [1100, 1000], reach: 0, at: [600, 450] }
    const drop = noteDrop([600, 450], note, PAGE)
    assert.ok(clears(drop, note.size, [note.at]) && !wholeOnPage(drop, note.size), `dropped at ${drop}`)
    assert.ok(drop[0] > 0 && drop[0] < PAGE[0] && drop[1] > 0 && drop[1] < PAGE[1], `dropped at ${drop}`)
  })

  it('keeps the middle when no place clears the button', () => {
    assert.deepEqual(noteDrop([600, 450], { size: [4000, 3000], reach: 0, at: [600, 450] }, PAGE), [600, 450])
  })

  it('counts a handle\'s reach as part of what covers the button', () => {
    const bare = { size: [100, 50], reach: 0, at: [500, 483] }
    assert.deepEqual(noteDrop(MIDDLE, bare, PAGE), MIDDLE)
    const drop = noteDrop(MIDDLE, { ...bare, reach: 120 }, PAGE)
    assert.ok(clears(drop, bare.size, [bare.at], 120), `dropped at ${drop}`)
  })

  // #1060: a 765 x 212 note over the settings button (751, 369) and a digit button (746, 440) at once. Clearing only the first put it back over the second, and the tries ran out.
  describe('with several buttons to keep clear (#1060)', () => {
    const covered = { size: [765, 212], reach: 0, at: [751, 369], avoid: [[751, 369], [746, 440], [746, 520], [746, 600]] }

    it('drops where none of the buttons is covered', () => {
      const drop = noteDrop(MIDDLE, covered, PAGE)
      assert.ok(clears(drop, covered.size, covered.avoid), `dropped at ${drop}`)
    })

    it('falls back to clearing the one button it was told about when nothing clears them all', () => {
      // A 100 x 4000 note is taller than the page, and buttons every 50 px across it leave it always over one of them.
      const avoid = Array.from({ length: 24 }, (_, i) => [i * 50, 450])
      const drop = noteDrop([600, 450], { size: [100, 4000], reach: 0, at: [600, 450], avoid }, PAGE)
      assert.ok(clears(drop, [100, 4000], [[600, 450]]), `dropped at ${drop}`)
    })
  })

  it('prefers a place that holds the whole note over a nearer one that hangs off the page', () => {
    // From a middle at the page's left side: straight up clears the button nearest but leaves the note's left edge off the page.
    const note = { size: [200, 180], reach: 0, at: [60, 450] }
    const drop = noteDrop([60, 450], note, PAGE)
    assert.ok(clears(drop, note.size, [note.at]) && wholeOnPage(drop, note.size), `dropped at ${drop}`)
  })

  it('keeps a dropped note\'s middle off the page edge, the middle kept when only the edge clears the button', () => {
    // 1200 wide: only a centre at x = 0 or 1200 clears a button at x = 600.
    assert.deepEqual(noteDrop([600, 450], { size: [1200, 4000], reach: 0, at: [600, 450] }, PAGE), [600, 450])
  })
})
