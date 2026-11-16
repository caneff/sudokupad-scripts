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

  it('keeps the middle when no place on the page clears the button', () => {
    assert.deepEqual(noteDrop([600, 450], { size: [1200, 900], reach: 0, at: [600, 450] }, PAGE), [600, 450])
  })

  it('counts a handle\'s reach as part of what covers the button', () => {
    const bare = { size: [100, 50], reach: 0, at: [500, 483] }
    assert.deepEqual(noteDrop([427, 544], bare, PAGE), [427, 544])
    assert.notDeepEqual(noteDrop([427, 544], { ...bare, reach: 120 }, PAGE), [427, 544])
  })
})
