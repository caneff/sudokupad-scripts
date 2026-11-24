import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { useBrowser } from '../session.mjs'
import { boxOpen, clickAt, currentTool, finishNote, gridPoint, pickTool, placeNote, SELECTED, typeText } from '../board.mjs'

const NOTE_CELL = [4.5, 4.5]
const SAME_DIGIT_CELLS = [[4.5, 1.5], [4.5, 7.5], [4.5, 4.5]]
const BARE_CELL = [1.5, 1.5]
const OTHER_NOTE_CELL = [7.5, 1.5]

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
    await typeText(p, OTHER_NOTE_CELL, 'cd')
    await pickTool(p, 'normal')
    await clickAt(p, [8.5, 8.5])
  })
  after(async () => { await context.close() })

  it('a double click on the note in Normal opens it in the tool, with only its own cell selected', async () => {
    const at = await textAnywhere.middleAt(p, await gridPoint(p, NOTE_CELL))
    await p.mouse.click(...at, { clickCount: 2, delay: 0 })
    assert.equal(await boxOpen(p), true, 'the note is open')
    assert.equal(await currentTool(p), 'textanywhere')
    assert.deepEqual(await selectedCells(), ['4,4'], 'SudokuPad selected only the first click\'s cell, not every cell with that digit')
  })

  it('closing it goes back to Normal, with no note left selected', async () => {
    await p.keyboard.press('Escape')
    assert.equal(await boxOpen(p), false)
    assert.equal(await currentTool(p), 'normal')
    assert.equal(await p.locator(SELECTED).count(), 0, 'no note is selected in Normal')
    assert.deepEqual(await textAnywhere.texts(p), ['ab', 'cd'])
  })

  it('a double click on a cell with no note still selects every cell with its digit', async () => {
    await p.mouse.click(...await gridPoint(p, BARE_CELL), { clickCount: 2, delay: 0 })
    assert.equal(await boxOpen(p), false)
    assert.equal(await currentTool(p), 'normal')
    const selected = await selectedCells()
    for (const cell of ['1,1', '4,1', '4,7', '4,4']) assert.ok(selected.includes(cell), `${cell} is selected with its digit: ${selected}`)
  })

  it('a press on another note while the box is open stays in the tool and selects that note', async () => {
    await pickTool(p, 'normal')
    await p.mouse.click(...await textAnywhere.middleAt(p, await gridPoint(p, NOTE_CELL)), { clickCount: 2, delay: 0 })
    assert.equal(await boxOpen(p), true)
    await p.mouse.click(...await textAnywhere.middleAt(p, await gridPoint(p, OTHER_NOTE_CELL)))
    assert.equal(await boxOpen(p), false)
    assert.equal(await currentTool(p), 'textanywhere', 'the press went on in the tool')
    assert.equal(await p.locator(SELECTED).count(), 1, 'the other note is selected')
    await finishNote(p)
  })

  it('a double click on a note under an open dialog opens nothing', async () => {
    await pickTool(p, 'normal')
    await p.evaluate(() => Framework.showDialog({ parts: [{ tag: 'text', content: 'x' }, { tag: 'options', options: [{ tag: 'button', content: 'OK' }] }], centerOverBoard: true }))
    await p.mouse.click(...await textAnywhere.middleAt(p, await gridPoint(p, NOTE_CELL)), { clickCount: 2, delay: 0 })
    assert.equal(await boxOpen(p), false)
    assert.equal(await currentTool(p), 'normal')
    await p.evaluate(() => Framework.closeDialog())
  })

  it('a note opened by hand in the tool goes back to no other tool', async () => {
    await pickTool(p, 'textanywhere')
    await p.mouse.click(...await textAnywhere.middleAt(p, await gridPoint(p, NOTE_CELL)), { clickCount: 2, delay: 0 })
    assert.equal(await boxOpen(p), true)
    await finishNote(p)
    assert.equal(await currentTool(p), 'textanywhere')
    await typeText(p, [1.5, 7.5], 'x')
    assert.equal(await currentTool(p), 'textanywhere')
  })
})
