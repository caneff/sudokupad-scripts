// Not a check itself, so `live/**/*.live.mjs` skips it.
/* global Framework */
import assert from 'node:assert/strict'
import { openPenTool } from './pen.mjs'
import { settle } from './settle.mjs'
import * as draw from './draw-tool/draw-tool-fixtures.mjs'

export const pickTool = async (p, name) => {
  if (name === 'pen') await openPenTool(p)
  else if (name === 'draw') await draw.pickDraw(p)
  else {
    await p.click(`#control-${name}`)
    assert.equal(await settle(() => draw.tool(p), name), name, `${name} is the current tool`)
  }
}

export const emptyCell = (p) => p.evaluate(() => {
  const cell = Framework.app.puzzle.cells.find((c) => !c.given)
  return [cell.row, cell.col]
})

export const cellState = (p, [row, col]) => p.evaluate(([r, c]) => {
  const cell = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c)
  return JSON.stringify({ value: cell.value ?? null, marks: cell.pencilmarks, colours: cell.colours, pen: cell.pen })
}, [row, col])

// The cells' values, marks and colours as one string, without the selection that `cellsState` carries: a Ctrl+A changes the selection and nothing else.
export const boardState = (p) => p.evaluate(() => JSON.stringify(Framework.app.puzzle.cells.map((c) => [c.value ?? null, c.pencilmarks, c.colours])))
