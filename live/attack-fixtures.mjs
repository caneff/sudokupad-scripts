// Not a check itself, so `live/**/*.live.mjs` skips it.
/* global Framework */
import { pickTool as pickToolByButton } from './board.mjs'
import { openPenTool } from './pen.mjs'

export const pickTool = async (p, name) => {
  if (name === 'pen') await openPenTool(p)
  else await pickToolByButton(p, name)
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
