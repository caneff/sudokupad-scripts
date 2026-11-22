/* global Framework */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as extras from './pen-tool-extras-fixtures.mjs'
import { cellCentre, undoAll } from '../board.mjs'
import { penDrawnCount, penEntries, penValuesAt } from '../pen.mjs'
import { stable } from '../settle.mjs'
import { useBrowser } from '../session.mjs'

// #1065: a click on the last shape of a cycle erases it, in the state and on the board, whichever shapes are ticked. The values are the cycle in order, each with the box that turns it on.
const TURNS = 2
const edgeRight = (page) => page.evaluate(() => {
  const e = Framework.app.puzzle.cells.find((x) => x.row === 3 && x.col === 3).elem.getBoundingClientRect()
  return [e.x + e.width - 2, e.y + e.height / 2]
})
// The grid corner at the top left of cell (3, 3), stored on cell (2, 2).
const innerCorner = (page) => page.evaluate(() => {
  const e = Framework.app.puzzle.cells.find((x) => x.row === 3 && x.col === 3).elem.getBoundingClientRect()
  return [e.x, e.y]
})
const TARGETS = {
  'cell centre': { cell: [4, 4], at: (page) => cellCentre(page, 4, 4), cycle: [['cellCircle', '5'], ['cellCross', '6'], ['cellDot', 'z']] },
  'edge right of (4,4)': { cell: [3, 3], at: edgeRight, cycle: [['x', '3'], ['circle', 'j'], ['directions', 'h'], ['directions', 'i']] },
  'inner (4,4)': { cell: [2, 2], at: innerCorner, cycle: [['cornerX', 'u'], ['cornerCircle', 'x']] }
}
const BOXES = [...new Set(Object.values(TARGETS).flatMap(({ cycle }) => cycle.map(([box]) => box)))]
// The boxes each setting unticks, from a cycle's boxes in order.
const UNTICKED = {
  'every box ticked': () => [],
  'the last box off': (boxes) => [boxes.at(-1)],
  'the first box off': (boxes) => [boxes[0]],
  'only the first box ticked': (boxes) => boxes.slice(1)
}

const browser = useBrowser()

describe('a click on the last shape of a cycle erases it', { concurrency: false }, () => {
  let context, p

  before(async () => {
    ;({ context, p } = await extras.open(browser()))
  })
  after(async () => { await context.close() })

  const shown = async (cell) => ({ held: await penValuesAt(p, ...cell), drawn: await penDrawnCount(p) })

  for (const [name, { cell, at, cycle }] of Object.entries(TARGETS)) {
    const ran = new Set()
    for (const [setting, unticked] of Object.entries(UNTICKED)) {
      const off = new Set(unticked(cycle.map(([box]) => box)))
      const steps = cycle.filter(([box]) => !off.has(box)).map(([, value]) => value)
      // Two settings can leave the same shapes ticked; the second is the same case.
      if (steps.length === 0 || ran.has(steps.join())) continue
      ran.add(steps.join())
      it(`${name}, ${setting}: ${steps.join(' ')}, empty, and again`, async () => {
        await p.evaluate(([key, boxes, offBoxes]) => Framework.setData(key, Object.fromEntries(boxes.map((box) => [box, !offBoxes.includes(box)]))), [extras.MARKS_DATA_KEY, BOXES, [...off]])
        await extras.reload(p)
        await undoAll(p)
        assert.deepEqual(await penEntries(p), [], 'the board starts with no mark')
        await p.locator('.tool-pen button[data-key="1"]').click()
        const [x, y] = await at(p)
        for (let click = 1; click <= TURNS * (steps.length + 1); click++) {
          await p.mouse.click(x, y)
          const held = click % (steps.length + 1) === 0 ? [] : [steps[(click - 1) % (steps.length + 1)]]
          assert.deepEqual(await stable(() => shown(cell)), { held, drawn: held.length }, `click ${click}`)
        }
        await p.mouse.move(x + 150, y + 150, { steps: 4 })
        assert.deepEqual(await stable(() => shown(cell)), { held: [], drawn: 0 }, 'after the mouse moves off the erased mark')
      })
    }
  }
})
