/* global Framework */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as extras from './pen-tool-extras-fixtures.mjs'
import { cellCentre, mouseDrag, undoAll } from '../board.mjs'
import { penDrawnCount, penEntries, penValuesAt } from '../pen.mjs'
import { stable } from '../settle.mjs'
import { useBrowser } from '../session.mjs'

// #1065: SudokuPad calls `clickCell` only for a press that moved less than `App.DoubleInputDistance` (6 px), and a pen line needs about 0.7 of a cell, so a press between the two did
// nothing. Pen Tool Extras counts such a press as a click when it drew no line and ended on the target it started on.
const SLIDE = 7
const edgeRight = (page) => page.evaluate(() => {
  const e = Framework.app.puzzle.cells.find((x) => x.row === 3 && x.col === 3).elem.getBoundingClientRect()
  return [e.x + e.width - 2, e.y + e.height / 2]
})
// The grid corner at the top left of cell (3, 3), stored on cell (2, 2).
const innerCorner = (page) => page.evaluate(() => {
  const e = Framework.app.puzzle.cells.find((x) => x.row === 3 && x.col === 3).elem.getBoundingClientRect()
  return [e.x, e.y]
})
// `slide` is the way a slid press moves, along the edge for an edge so it stays on it.
const TARGETS = {
  'cell centre': { cell: [4, 4], at: (page) => cellCentre(page, 4, 4), cycle: ['5', '6', 'z'], slide: [SLIDE, 0] },
  'edge right of (4,4)': { cell: [3, 3], at: edgeRight, cycle: ['3', 'j', 'h', 'i'], slide: [0, SLIDE] },
  'inner corner (4,4)': { cell: [2, 2], at: innerCorner, cycle: ['u', 'x'], slide: [SLIDE, 0] }
}

const browser = useBrowser()

describe('a press that slides past SudokuPad\'s click distance steps the cycle as a click does', { concurrency: false }, () => {
  let context, p

  before(async () => {
    ;({ context, p } = await extras.open(browser()))
  })
  after(async () => { await context.close() })

  const shown = async (cell) => ({ held: await penValuesAt(p, ...cell), drawn: await penDrawnCount(p) })
  async function slide (from, [dx, dy]) {
    await p.mouse.move(...from)
    await p.mouse.down()
    await p.mouse.move(from[0] + dx / 2, from[1] + dy / 2)
    await p.mouse.move(from[0] + dx, from[1] + dy)
    await p.mouse.up()
    await p.mouse.move(5, 5)
  }

  for (const [name, { cell, at, cycle, slide: way }] of Object.entries(TARGETS)) {
    it(`${name}: clicks to the last shape, then a ${SLIDE} px slide erases it, and one undo brings it back`, async () => {
      await undoAll(p)
      await p.locator('.tool-pen button[data-key="1"]').click()
      const from = await at(p)
      for (const value of cycle) {
        await p.mouse.click(...from)
        assert.deepEqual(await stable(() => shown(cell)), { held: [value], drawn: 1 }, `click to ${value}`)
      }
      await slide(from, way)
      assert.deepEqual(await stable(() => shown(cell)), { held: [], drawn: 0 }, 'the slid press erased the last shape')
      await p.click('#control-undo')
      assert.deepEqual(await stable(() => shown(cell)), { held: [cycle.at(-1)], drawn: 1 }, 'one undo brings the shape back')
    })

    it(`${name}: a ${SLIDE} px slide on an empty target places the first shape`, async () => {
      await undoAll(p)
      await slide(await at(p), way)
      assert.deepEqual(await stable(() => shown(cell)), { held: [cycle[0]], drawn: 1 })
    })
  }

  it('a real line drag still draws a line and no mark', async () => {
    await undoAll(p)
    await p.locator('.tool-pen button[data-key="1"]').click()
    await mouseDrag(p, [[4.5, 4.5], [4.5, 5.5]])
    assert.deepEqual((await penEntries(p)).map((entry) => entry.split(':')[1][0]), ['1'], 'one line stroke and no mark')
  })

  it('a slide from a cell centre that ends on the edge beside it changes nothing', async () => {
    await undoAll(p)
    const [x, y, size] = await cellCentre(p, 4, 4)
    await slide([x, y], [size / 2, 0])
    assert.deepEqual(await penEntries(p), [])
  })
})
