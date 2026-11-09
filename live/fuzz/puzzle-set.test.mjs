// Unit tests of the fuzz's puzzle set (#679): what each puzzle is, with no browser.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { FUZZ_PUZZLES, insideGrid, puzzleByName as byName, RULES_TEXT, rulesTextFor } from './puzzle-set.mjs'

describe('the fuzz puzzle set', () => {
  it('holds the two puzzles the fuzz began with and about ten more, with distinct names and distinct ids', () => {
    assert.ok(FUZZ_PUZZLES.length >= 12, `${FUZZ_PUZZLES.length} puzzles`)
    assert.equal(new Set(FUZZ_PUZZLES.map((p) => p.name)).size, FUZZ_PUZZLES.length)
    const ids = FUZZ_PUZZLES.filter((p) => p.data).map((p) => p.data.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  it('covers the shapes the ticket names', () => {
    const sizes = FUZZ_PUZZLES.map((p) => `${p.rows}x${p.cols}`)
    for (const size of ['4x4', '9x9', '12x12', '16x16', '6x8']) assert.ok(sizes.includes(size), size)
    assert.ok(FUZZ_PUZZLES.some((p) => p.data?.cages?.length && p.data.arrows?.length && p.data.lines?.length), 'cages, arrows and lines in one 9x9')
    assert.ok(byName('jigsaw 9x9').data.regions.some((region) => new Set(region.map(([row]) => row)).size > 3), 'a 9x9 with a region that is not a 3x3 box')
    assert.ok(FUZZ_PUZZLES.some((p) => p.data?.overlays?.length && p.margin), 'clues outside the grid, with targets out there')
    assert.ok(FUZZ_PUZZLES.some((p) => p.rules === 'none'), 'no rules text')
    assert.ok(FUZZ_PUZZLES.some((p) => p.rules === 'long'), 'the long rules')
    assert.ok(FUZZ_PUZZLES.some((p) => p.data?.metadata?.solution && p.free.length <= 3), 'nearly solved, with its solution')
  })

  it('a free cell is a cell with no given, and the targets are the free cells (and the margin when the puzzle has clues out there)', () => {
    for (const p of FUZZ_PUZZLES) {
      assert.ok(p.free.length > 0, p.name)
      assert.ok(p.free.every((cell) => insideGrid(p, cell)), `${p.name}: free cells are inside the grid`)
      if (p.data) {
        const withValue = p.data.cells.flatMap((row, r) => row.flatMap((c, i) => (c.value ? [`${r},${i}`] : [])))
        assert.equal(p.free.length + withValue.length, p.rows * p.cols, `${p.name}: every cell is a given or free`)
        assert.ok(p.free.every(([r, c]) => !withValue.includes(`${r},${c}`)), `${p.name}: no free cell holds a given`)
      }
      if (!p.margin) assert.deepEqual(p.cells, p.free, p.name)
      else assert.ok(p.cells.length > p.free.length && p.cells.slice(0, p.free.length).every((cell, i) => cell === p.free[i]), `${p.name}: the margin follows the free cells`)
    }
    const sandwich = FUZZ_PUZZLES.find((p) => p.margin)
    assert.ok(sandwich.cells.slice(sandwich.free.length).every((cell) => !insideGrid(sandwich, cell)), 'every margin target is outside the grid')
  })

  it('a digit key is one SudokuPad takes: 1 to the size up to 9, and 0 past 9', () => {
    assert.deepEqual(byName('4x4').keys, ['1', '2', '3', '4'])
    assert.deepEqual(byName('recorded 9x9').keys, ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    assert.deepEqual(byName('12x12').keys, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'])
    assert.deepEqual(byName('6x8').keys, ['1', '2', '3', '4', '5', '6', '7', '8'])
  })

  it('a jigsaw puzzle\'s regions partition the grid into connected regions of 9', () => {
    const jigsaw = byName('jigsaw 9x9')
    const seen = jigsaw.data.regions.flat().map(([r, c]) => `${r},${c}`)
    assert.equal(new Set(seen).size, 81)
    for (const region of jigsaw.data.regions) {
      assert.equal(region.length, 9)
      const keys = new Set(region.map(([r, c]) => `${r},${c}`))
      const reached = new Set([`${region[0][0]},${region[0][1]}`])
      for (const key of reached) {
        const [r, c] = key.split(',').map(Number)
        for (const next of [`${r + 1},${c}`, `${r - 1},${c}`, `${r},${c + 1}`, `${r},${c - 1}`]) if (keys.has(next)) reached.add(next)
      }
      assert.equal(reached.size, 9, 'connected')
    }
  })

  it('the rules text of a puzzle is the long text, a short one, or none', () => {
    const share = (kind) => FUZZ_PUZZLES.filter((p) => p.rules === kind).length / FUZZ_PUZZLES.length
    assert.ok(share('long') >= 0.4 && share('none') > 0, 'the long rules are on most of the set, and one puzzle has none')
    assert.equal(rulesTextFor(byName('recorded 9x9')), RULES_TEXT)
    assert.equal(rulesTextFor(byName('4x4')), null)
    const short = rulesTextFor(FUZZ_PUZZLES.find((p) => p.rules === 'short'))
    assert.ok(short.length > 0 && short.length < RULES_TEXT.length / 4)
  })
})
