// Shared by `live/attacks-*.live.mjs` on top of `attacks.mjs`: making a tool current, finding an empty cell, reading it, typing a note. Not a
// check itself, so `live/**/*.live.mjs` skips it.
/* global Framework */
import assert from 'node:assert/strict'
import { gridPoint, openPenTool } from './pen.mjs'
import { settle } from './settle.mjs'
import * as draw from './draw-tool/draw-tool-fixtures.mjs'

// SudokuPad's tool `name` made current with its own button.
export const pickTool = async (p, name) => {
  if (name === 'pen') await openPenTool(p)
  else if (name === 'draw') await draw.pickDraw(p)
  else {
    await p.click(`#control-${name}`)
    assert.equal(await settle(() => draw.tool(p), name), name, `${name} is the current tool`)
  }
}

// The first cell with no given, as [row, column]: an entry made in it shows in its own value, marks, colours or pen.
export const emptyCell = (p) => p.evaluate(() => {
  const cell = Framework.app.puzzle.cells.find((c) => !c.given)
  return [cell.row, cell.col]
})

// What the board holds in cell [row, col], as one string.
export const cellState = (p, [row, col]) => p.evaluate(([r, c]) => {
  const cell = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c)
  return JSON.stringify({ value: cell.value ?? null, marks: cell.pencilmarks, colours: cell.colours, pen: cell.pen })
}, [row, col])

// A note typed at [row, col] (in cells from the grid's top left) with Text Anywhere current, and finished.
export async function makeNote (p, at, text) {
  await p.mouse.click(...await gridPoint(p, at))
  await p.keyboard.type(text)
  await draw.finishNote(p)
}

// The cells' values, marks and colours as one string, without the selection that `cellsState` carries: a Ctrl+A changes the selection and nothing else.
export const boardState = (p) => p.evaluate(() => JSON.stringify(Framework.app.puzzle.cells.map((c) => [c.value ?? null, c.pencilmarks, c.colours])))
