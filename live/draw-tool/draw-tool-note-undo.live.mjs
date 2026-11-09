// Live check of draw-tool.user.js's undo inside an open note on sudokupad.app: Ctrl+Z and Ctrl+Y (Ctrl+Shift+Z) undo and redo the typing,
// never reach SudokuPad, and last only while the note is open. Real keyboard input throughout.
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'

const { TEXT_BOX } = draw
const SPOT = [3.5, 3.5]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s undo inside an open note', { concurrency: false }, () => {
  let context, p, errors

  const boxText = () => p.locator(TEXT_BOX).textContent()
  const replay = () => p.evaluate(() => Framework.app.getReplay())
  const cellState = () => p.evaluate(() => JSON.stringify(Framework.app.puzzle.cells.map((c) => [c.propGet('normal'), c.propGet('corner'), c.propGet('centre'), c.propGet('colour')])))
  const openNote = async () => p.mouse.click(...await gridPoint(p, SPOT))

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }))
    await draw.boot(p)
  })
  after(async () => { await context.close() })
  beforeEach(async () => {
    await draw.forgetDrawings(p)
    await draw.reload(p)
    await draw.pickDraw(p)
  })

  it('Ctrl+Z twice after typing abc leaves a, Ctrl+Y gives ab, and SudokuPad\'s undo stack and cells are unchanged', async () => {
    const before = [await replay(), await cellState()]
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
    assert.deepEqual([await replay(), await cellState()], before)
    assert.equal(await p.evaluate(() => window.__undoKeys), 0, 'no undo or redo key reached the page')
    await draw.finishNote(p)
  })

  it('Ctrl+Shift+Z redoes as Ctrl+Y does', async () => {
    await openNote()
    await p.keyboard.type('abc')
    await p.keyboard.press('Control+z')
    await p.keyboard.press('Control+Shift+z')
    assert.equal(await boxText(), 'abc')
    await draw.finishNote(p)
  })

  it('-> becomes →, Ctrl+Z gives -> back in one step and Ctrl+Y gives → again', async () => {
    await openNote()
    await p.keyboard.type('->')
    assert.equal(await boxText(), '→')
    await p.keyboard.press('Control+z')
    assert.equal(await boxText(), '->')
    await p.keyboard.press('Control+y')
    assert.equal(await boxText(), '→')
    await draw.finishNote(p)
  })

  it('Ctrl+Z after a paste removes the whole paste', async () => {
    await openNote()
    await p.keyboard.type('x')
    await p.evaluate(() => navigator.clipboard.writeText('pasted\ntext'))
    await p.keyboard.press('Control+v')
    assert.equal(await boxText(), 'xpasted\ntext')
    await p.keyboard.press('Control+z')
    assert.equal(await boxText(), 'x')
    await draw.finishNote(p)
  })

  it('Ctrl+Z after a deletion and after a line break brings them back', async () => {
    await openNote()
    await p.keyboard.type('ab')
    await p.keyboard.press('Enter')
    await p.keyboard.type('cd')
    await p.keyboard.press('Backspace')
    await p.keyboard.press('Control+z')
    assert.equal(await boxText(), 'ab\ncd')
    await draw.finishNote(p)
  })

  it('a reopened note has a fresh history: Ctrl+Z does nothing to its text', async () => {
    await openNote()
    await p.keyboard.type('abc')
    await draw.finishNote(p)
    await draw.reopen(p, await gridPoint(p, SPOT))
    assert.equal(await boxText(), 'abc')
    await p.keyboard.press('Control+z')
    assert.equal(await boxText(), 'abc')
    await draw.finishNote(p)
  })

  it('leaves no page error', () => assert.deepEqual(errors, []))
})
