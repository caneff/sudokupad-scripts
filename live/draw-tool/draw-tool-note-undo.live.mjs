// Live check of draw-tool.user.js's undo inside an open note on sudokupad.app: Ctrl+Z and Ctrl+Y (Ctrl+Shift+Z) undo and redo the typing,
// never reach SudokuPad, and last only while the note is open. Real keyboard input throughout.
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as draw from './draw-tool-fixtures.mjs'
import { useBrowser } from '../session.mjs'
import { finishNote, gridPoint } from '../board.mjs'

const { TEXT_BOX } = draw
const SPOT = [3.5, 3.5]

const browser = useBrowser()

describe('Text Anywhere\'s undo inside an open note', { concurrency: false }, () => {
  let context, p, errors

  const boxText = () => p.locator(TEXT_BOX).textContent()
  const undoSteps = () => p.evaluate(() => Framework.app.puzzle.undoStack.length)
  const openNote = async () => p.mouse.click(...await gridPoint(p, SPOT))

  before(async () => {
    ;({ context, p, errors } = await draw.open(browser(), { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }))
  })
  after(async () => { await context.close() })
  beforeEach(async () => {
    await draw.forgetDrawings(p)
    await draw.reloadOnDraw(p)
  })

  it('Ctrl+Z twice after typing abc leaves a, Ctrl+Y gives ab, and SudokuPad\'s undo stack', async () => {
    // A digit in a cell gives SudokuPad's undo something to lose.
    await p.click(draw.DIGIT_BUTTON)
    await p.mouse.click(...await gridPoint(p, [0.5, 0.5]))
    await p.keyboard.press('5')
    await draw.pickDraw(p)
    const before = await undoSteps()
    assert.equal(before > 0, true, 'SudokuPad has a step to lose')
    // SudokuPad's key listeners are on the document and window; none may see an undo or redo key.
    await p.evaluate(() => {
      window.__undoKeys = 0
      for (const target of [document, window]) target.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key)) window.__undoKeys++ })
    })
    await openNote()
    await p.keyboard.type('abc')
    await p.keyboard.press('Control+z')
    await p.keyboard.press('Control+z')
    assert.equal(await boxText(), 'a')
    await p.keyboard.press('Control+y')
    assert.equal(await boxText(), 'ab')
    assert.equal(await undoSteps(), before, 'SudokuPad\'s undo stack is unchanged')
    assert.equal(await p.evaluate(() => window.__undoKeys), 0, 'no undo or redo key reached the page')
    await finishNote(p)
  })

  it('Ctrl+Shift+Z redoes as Ctrl+Y does', async () => {
    await openNote()
    await p.keyboard.type('abc')
    await p.keyboard.press('Control+z')
    await p.keyboard.press('Control+Shift+z')
    assert.equal(await boxText(), 'abc')
    await finishNote(p)
  })

  it('a character typed right after a symbol is its own undo step', async () => {
    await openNote()
    await p.keyboard.type('->x')
    await p.keyboard.press('Control+z')
    assert.equal(await boxText(), '→')
    await p.keyboard.press('Control+z')
    assert.equal(await boxText(), '->')
    await finishNote(p)
  })

  it('Ctrl+Z after a paste removes the whole paste', async () => {
    await openNote()
    await p.keyboard.type('x')
    await p.evaluate(() => navigator.clipboard.writeText('pasted\ntext'))
    await p.keyboard.press('Control+v')
    assert.equal(await boxText(), 'xpasted\ntext')
    await p.keyboard.press('Control+z')
    assert.equal(await boxText(), 'x')
    await finishNote(p)
  })

  it('Ctrl+Z brings back a deletion and takes out typing after a line break', async () => {
    await openNote()
    await p.keyboard.type('ab')
    await p.keyboard.press('Enter')
    await p.keyboard.type('cd')
    await p.keyboard.press('Backspace')
    await p.keyboard.press('Control+z')
    assert.equal(await boxText(), 'ab\ncd')
    await p.keyboard.press('Control+z')
    await p.keyboard.press('Control+z')
    assert.equal(await boxText(), 'ab', 'both letters after the line break are undone')
    await p.keyboard.press('Control+y')
    await p.keyboard.press('Control+y')
    assert.equal(await boxText(), 'ab\ncd', 'redo brings the line break back with them')
    await finishNote(p)
  })

  it('a reopened note has a fresh history: Ctrl+Z does nothing to its text', async () => {
    await openNote()
    await p.keyboard.type('abc')
    await finishNote(p)
    await draw.reopen(p, await gridPoint(p, SPOT))
    assert.equal(await boxText(), 'abc')
    await p.keyboard.press('Control+z')
    assert.equal(await boxText(), 'abc')
    await finishNote(p)
  })

  it('leaves no page error', () => assert.deepEqual(errors, []))
})
