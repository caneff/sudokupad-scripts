'use strict'
// Pen Tool Extras' erase sweep taking the cell size as an argument, with a line beating a mark and a fast drag sampled across a line, at the `npm test` seam.
// Blind to real SudokuPad: the eraser's pointer events. `npm run test:live` covers them on sudokupad.app: live/pen-tool-extras/pen-tool-extras-erase.live.mjs.
const test = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('node:path')

const penToolExtras = require(join(__dirname, '..', 'pen-tool-extras.user.js'))

test('Pen Tool Extras\' erase sweep: a line beats a mark at one point, and a long jump across a line takes it', () => {
  const { crossPoint, crossTo } = penToolExtras
  const line = { value: '1', row: 0, col: 0, color: '1' }
  const fresh = (at = { r: 0, c: 0 }) => ({ segments: [line], lines: new Set(), marks: new Map(), at })
  const everywhere = () => ({ cell: 'cell', values: ['x'] })
  const onLine = fresh()
  crossPoint(everywhere, onLine, { r: 0.5, c: 1.0 }, 100)
  assert.deepEqual([onLine.lines.size, onLine.marks.size], [1, 0])
  const jump = fresh({ r: 0.5, c: 0 })
  crossTo(() => null, jump, { r: 0.5, c: 3 }, 100)
  assert.equal(jump.lines.size, 1, 'a fast drag is sampled along its way, so a line between two events is taken')
})
