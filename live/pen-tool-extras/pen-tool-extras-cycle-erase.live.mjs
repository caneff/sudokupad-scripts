/* global Framework */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as extras from './pen-tool-extras-fixtures.mjs'
import { penValuesAt } from '../pen.mjs'
import { settle } from '../settle.mjs'
import { useBrowser } from '../session.mjs'

// #1065: a click on the last shape of a cycle erases it, in the state and on the board, whichever types are ticked. A tester saw the last cell mark stay shown;
// no case here reproduced it, so these are the cycle's steps, checked in both places, for the cell centre, an edge and a corner.
const DATA_KEY = 'EdgeMarks_marks'
const ALL_TICKED = { x: true, directions: true, circle: true, cornerX: true, cornerCircle: true, cellCircle: true, cellCross: true, cellDot: true }
const TURNS = 2

// Each target: where to click, the cell that stores the marks, and each value of the cycle with the box that turns it on, in cycle order.
const TARGETS = {
  'cell centre': { cell: [4, 4], boxes: [['cellCircle', '5'], ['cellCross', '6'], ['cellDot', 'z']] },
  'edge right of (4,4)': { cell: [3, 3], boxes: [['x', '3'], ['circle', 'j'], ['directions', 'h'], ['directions', 'i']] },
  'corner (3,3)': { cell: [2, 2], boxes: [['cornerX', 'u'], ['cornerCircle', 'x']] }
}
const OFF = { 'every box ticked': [], 'the last type off': 'last', 'the first type off': 'first', 'only the first ticked': 'rest' }

const browser = useBrowser()

describe('a click on the last shape of a cycle erases it', { concurrency: false }, () => {
  let context, p, read

  before(async () => {
    ;({ context, p } = await extras.open(browser()))
    ;({ read } = extras.tools(p))
  })
  after(async () => { await context.close() })

  const drawn = () => read(() => document.querySelectorAll('.cell-pen').length)
  const point = (name) => read(([target]) => {
    const rect = (r, c) => Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).elem.getBoundingClientRect()
    if (target === 'cell centre') { const e = rect(4, 4); return [e.x + e.width / 2, e.y + e.height / 2] }
    if (target === 'edge right of (4,4)') { const e = rect(3, 3); return [e.x + e.width - 2, e.y + e.height / 2] }
    const e = rect(3, 3)
    return [e.x, e.y]
  }, [name])

  for (const [name, { cell, boxes }] of Object.entries(TARGETS)) {
    for (const [offName, off] of Object.entries(OFF)) {
      // Which boxes of this cycle are unticked: by cycle position, so every target loses a different shape.
      const unticked = off === 'last' ? [boxes.length - 1] : off === 'first' ? [0] : off === 'rest' ? boxes.slice(1).map((_, i) => i + 1) : []
      const names = new Set(unticked.map((i) => boxes[i][0]))
      // A box shared by two values (the edge's two arrow heads) is unticked for both.
      const steps = boxes.filter(([box]) => !names.has(box)).map(([, value]) => value)
      if (steps.length === 0) continue
      it(`${name}, ${offName}: ${steps.join(' ')}, empty, and again`, async () => {
        await read(([key, boxesOff]) => { Framework.setData(key, boxesOff) }, [DATA_KEY, Object.fromEntries(Object.keys(ALL_TICKED).map((box) => [box, !names.has(box)]))])
        await extras.reload(p)
        await p.locator('.tool-pen button[data-key="1"]').click()
        const [x, y] = await point(name)
        const expected = Array.from({ length: TURNS * (steps.length + 1) }, (_, i) => (i % (steps.length + 1) === steps.length ? [] : [steps[i % (steps.length + 1)]]))
        for (const [i, want] of expected.entries()) {
          await p.mouse.click(x, y)
          assert.deepEqual(await settle(() => penValuesAt(p, ...cell), want), want, `click ${i + 1}: the cell holds ${JSON.stringify(want)}`)
          assert.equal(await settle(drawn, want.length), want.length, `click ${i + 1}: ${want.length} drawn`)
        }
        await p.mouse.move(x + 150, y + 150, { steps: 4 })
        assert.equal(await drawn(), 0, 'nothing is drawn after the mouse moves off the erased mark')
      })
    }
  }
})
