import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { useBrowser } from '../session.mjs'
import { boxOpen, clickAt, currentTool, finishNote, gridPoint, pickTool, placeNote, typeText } from '../board.mjs'

const NOTE_CELL = [4.5, 4.5]
const SAME_DIGIT_CELLS = [[4.5, 1.5], [4.5, 7.5], [4.5, 4.5]]
const BARE_CELL = [1.5, 1.5]

const browser = useBrowser()

describe('Text Anywhere: a double click on a note opens it from any mode', { concurrency: false }, () => {
  let context, p

  const selectedCells = () => p.evaluate(() => Framework.app.puzzle.selectedCells.map((c) => `${c.row},${c.col}`))

  before(async () => {
    ;({ context, p } = await textAnywhere.open(browser()))
    await textAnywhere.forgetNotes(p)
    await textAnywhere.reloadOnTextAnywhere(p)
    await pickTool(p, 'normal')
    // The same digit in three cells of one row, one under the note and one with no note.
    for (const at of [...SAME_DIGIT_CELLS, BARE_CELL]) {
      await clickAt(p, at)
      await p.keyboard.press('5')
    }
    await placeNote(p, NOTE_CELL, 'ab')
    await pickTool(p, 'normal')
    await clickAt(p, [8.5, 8.5])
  })
  after(async () => { await context.close() })

  it('a double click on the note in Normal opens it in the tool and selects no digits', async () => {
    const at = await textAnywhere.middleAt(p, await gridPoint(p, NOTE_CELL))
    await p.mouse.click(...at, { clickCount: 2, delay: 0 })
    assert.equal(await boxOpen(p), true, 'the note is open')
    assert.equal(await currentTool(p), 'textanywhere')
    assert.deepEqual(await selectedCells(), ['4,4'], 'SudokuPad selected only the first click\'s cell, not every cell with that digit')
  })

  it('closing it goes back to Normal', async () => {
    await finishNote(p)
    assert.equal(await boxOpen(p), false)
    assert.equal(await currentTool(p), 'normal')
    assert.deepEqual(await textAnywhere.texts(p), ['ab'])
  })

  it('a double click on a cell with no note still selects every cell with its digit', async () => {
    await p.mouse.click(...await gridPoint(p, BARE_CELL), { clickCount: 2, delay: 0 })
    assert.equal(await boxOpen(p), false)
    assert.equal(await currentTool(p), 'normal')
    const selected = await selectedCells()
    for (const cell of ['1,1', '4,1', '4,7', '4,4']) assert.ok(selected.includes(cell), `${cell} is selected with its digit`)
  })

  it('a note opened by hand in the tool goes back to no other tool', async () => {
    await pickTool(p, 'textanywhere')
    await p.mouse.click(...await textAnywhere.middleAt(p, await gridPoint(p, NOTE_CELL)), { clickCount: 2, delay: 0 })
    assert.equal(await boxOpen(p), true)
    await finishNote(p)
    assert.equal(await currentTool(p), 'textanywhere')
    await typeText(p, [7.5, 1.5], 'x')
    assert.equal(await currentTool(p), 'textanywhere')
  })
})
