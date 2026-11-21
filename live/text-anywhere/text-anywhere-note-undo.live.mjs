import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { useBrowser } from '../session.mjs'
import { finishNote, gridPoint, undoDepth } from '../board.mjs'

const SPOT = [3.5, 3.5]

const browser = useBrowser()

describe('Text Anywhere\'s undo inside an open note', { concurrency: false }, () => {
  let context, p, errors, boxText

  const openNote = async () => p.mouse.click(...await gridPoint(p, SPOT))

  before(async () => {
    ;({ context, p, errors } = await textAnywhere.open(browser(), { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }))
    ;({ boxText } = textAnywhere.tools(p))
  })
  after(async () => { await context.close() })
  beforeEach(async () => {
    await textAnywhere.forgetNotes(p)
    await textAnywhere.reloadOnTextAnywhere(p)
  })

  it('Ctrl+Z twice after typing abc leaves a, Ctrl+Y gives ab, and SudokuPad\'s undo stack', async () => {
    // A digit in a cell gives SudokuPad's undo something to lose.
    await p.click(textAnywhere.DIGIT_BUTTON)
    await p.mouse.click(...await gridPoint(p, [0.5, 0.5]))
    await p.keyboard.press('5')
    await textAnywhere.pickTextAnywhere(p)
    const before = await undoDepth(p)
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
    assert.equal(await undoDepth(p), before, 'SudokuPad\'s undo stack is unchanged')
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

  it('the first Backspace right after each symbol swap undoes it', async () => {
    await openNote()
    for (const [typed, swapped, undone] of [['->', '→', '->'], ['a<-', 'a←', 'a<-'], ['!=', '≠', '!='], ['<=', '≤', '<='], ['>=', '≥', '>='], ['sum ', 'Σ ', 'sum ']]) {
      await p.keyboard.type(typed)
      assert.equal(await boxText(), swapped)
      await p.keyboard.press('Backspace')
      assert.equal(await boxText(), undone, `Backspace after ${typed}`)
      await p.keyboard.press('Control+a')
      await p.keyboard.press('Delete')
    }
    await finishNote(p)
  })

  it('after the undo the caret is collapsed, so the next Backspace deletes one character and typing keeps the restored text', async () => {
    await openNote()
    await p.keyboard.type('ab->')
    await p.keyboard.press('Backspace')
    await p.keyboard.type('x')
    assert.equal(await boxText(), 'ab->x')
    await p.keyboard.press('Control+a')
    await p.keyboard.press('Delete')
    await p.keyboard.type('ab->')
    await p.keyboard.press('Backspace')
    await p.keyboard.press('Backspace')
    assert.equal(await boxText(), 'ab-')
    await finishNote(p)
  })

  it('a character typed after the swap, an arrow key or Ctrl+Backspace makes Backspace an ordinary delete', async () => {
    await openNote()
    const cases = [
      ['a typed character', ['x', 'Backspace'], '→'],
      ['an arrow key', ['ArrowLeft', 'ArrowRight', 'Backspace'], ''],
      ['Ctrl+Backspace', ['Control+Backspace'], '']
    ]
    for (const [name, keys, expected] of cases) {
      await p.keyboard.type('->')
      for (const key of keys) await (key.length === 1 ? p.keyboard.type(key) : p.keyboard.press(key))
      assert.equal(await boxText(), expected, name)
      await p.keyboard.press('Control+a')
      await p.keyboard.press('Delete')
    }
    await finishNote(p)
  })

  it('a click that moves the caret makes Backspace an ordinary delete', async () => {
    await openNote()
    await p.keyboard.type('->')
    const box = await p.locator('#text-anywhere-layer .text-anywhere-textbox').boundingBox()
    await p.mouse.click(box.x + 2, box.y + box.height / 2)
    await p.keyboard.press('Backspace')
    assert.equal(await boxText(), '→', 'Backspace at the start of the note deletes nothing, and does not undo')
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
    await textAnywhere.reopen(p, await gridPoint(p, SPOT))
    assert.equal(await boxText(), 'abc')
    await p.keyboard.press('Control+z')
    assert.equal(await boxText(), 'abc')
    await finishNote(p)
  })

  it('leaves no page error', () => assert.deepEqual(errors, []))
})
