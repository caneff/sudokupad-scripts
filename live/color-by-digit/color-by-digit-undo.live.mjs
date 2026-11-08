// Live check of Color by Digit's mode against SudokuPad's Undo and Redo on sudokupad.app, in headless Chromium:
// the button and the board must agree after either.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { coloredCountOn, givensColoredOn, labelOn, MODE_KEY, openSession, pressTo } from './color-by-digit-fixtures.mjs'
import { settle } from '../settle.mjs'
import * as draw from '../draw-tool/draw-tool-fixtures.mjs'
import { gridPoint } from '../pen.mjs'

const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Undo and Redo after a mode change', { concurrency: false }, () => {
  let context, p

  const undo = () => p.click('#control-undo')
  const redo = () => p.click('#control-redo')
  const coloredCount = () => coloredCountOn(p)
  const label = () => labelOn(p)

  before(async () => {
    ({ context, p } = await openSession(browser, script))
  })
  after(async () => { await context.close() })

  it('Off to Cell colors the board; one Undo uncolors it and the button follows to Off, one Redo back to Cell', async () => {
    await pressTo(p, 'Cell')
    assert.equal(await settle(async () => (await coloredCount()) > 0, true), true)
    const count = await coloredCount()
    await undo()
    assert.equal(await settle(coloredCount, 0), 0)
    assert.equal(await settle(label, 'Off'), 'Off')
    await redo()
    assert.equal(await settle(coloredCount, count), count)
    assert.equal(await settle(label, 'Cell'), 'Cell')
  })

  it('Cell to Digit clears the board; Undo returns to Cell, a second Undo to Off, and Redo twice to Digit', async () => {
    const count = await coloredCount()
    await pressTo(p, 'Digit')
    assert.equal(await settle(coloredCount, 0), 0)
    await undo()
    assert.equal(await settle(coloredCount, count), count)
    assert.equal(await settle(label, 'Cell'), 'Cell')
    await undo()
    assert.equal(await settle(coloredCount, 0), 0)
    assert.equal(await settle(label, 'Off'), 'Off')
    await redo()
    assert.equal(await settle(label, 'Cell'), 'Cell')
    await redo()
    assert.equal(await settle(coloredCount, 0), 0)
    assert.equal(await settle(label, 'Digit'), 'Digit')
  })

  it('Digit to Both fills the board; Undo empties it and the button returns to Digit', async () => {
    await pressTo(p, 'Both')
    assert.equal(await settle(async () => (await coloredCount()) > 0, true), true)
    await undo()
    assert.equal(await settle(coloredCount, 0), 0)
    assert.equal(await settle(label, 'Digit'), 'Digit')
  })

  it('a new action after an Undo ends the Redo: a later Undo and Redo do not move the mode', async () => {
    // Back to Off with the board empty, then step to Cell (one step), Undo it, and enter a digit instead of redoing.
    await undo()
    assert.equal(await settle(label, 'Cell'), 'Cell')
    await undo()
    assert.equal(await settle(label, 'Off'), 'Off')
    await pressTo(p, 'Cell')
    assert.equal(await settle(async () => (await coloredCount()) > 0, true), true)
    await undo()
    assert.equal(await settle(label, 'Off'), 'Off')
    // Enough entries to push the undo stack past the dropped Cell step, then one Undo and one Redo: no stale step moves the mode.
    await p.evaluate(() => {
      const a = Framework.app
      a.deselect()
      a.select(a.grid.getCell(4, 4))
      for (let i = 0; i < 12; i++) a.act({ type: 'value', arg: String(1 + (i % 9)) })
    })
    await undo()
    await redo()
    assert.equal(await settle(label, 'Off'), 'Off')
  })
})

describe('Undo after a Restart', { concurrency: false }, () => {
  let context, p

  const undo = () => p.click('#control-undo')
  const coloredCount = () => coloredCountOn(p)
  const label = () => labelOn(p)

  before(async () => {
    ({ context, p } = await openSession(browser, script))
  })
  after(async () => { await context.close() })

  it('every Undo leaves the button and the board agreeing, down to the Off before the Cell step', async () => {
    await p.evaluate(() => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(0, 2)); a.act({ type: 'value', arg: '4' }); a.deselect() })
    await pressTo(p, 'Cell')
    assert.equal(await settle(async () => (await coloredCount()) > 0, true), true)
    await p.evaluate(() => Framework.app.restartPuzzle())
    await settle(async () => (await coloredCount()) > 0, true)
    // Whatever each Undo takes back, a colored board means Cell and an uncolored one means Off.
    const agree = async () => (await label()) === ((await coloredCount()) > 0 ? 'Cell' : 'Off')
    let undos = 0
    while (!(await label() === 'Off' && (await coloredCount()) === 0) && undos < 8) {
      await undo()
      undos++
      assert.equal(await settle(agree, true), true, `after Undo ${undos}: ${await label()}, ${await coloredCount()} colored`)
    }
    assert.deepEqual([await label(), await coloredCount()], ['Off', 0])
  })
})

describe('The first Undo after a Restart', { concurrency: false }, () => {
  let context, p

  const undo = () => p.click('#control-undo')
  const coloredCount = () => coloredCountOn(p)
  const label = () => labelOn(p)

  before(async () => {
    ({ context, p } = await openSession(browser, script))
  })
  after(async () => { await context.close() })

  it('the first Undo after a Restart loads the board from before it, leaves the mode on Cell and saves it, the givens colored', async () => {
    await p.evaluate(() => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(0, 2)); a.act({ type: 'value', arg: '4' }); a.deselect() })
    await pressTo(p, 'Cell')
    assert.equal(await settle(async () => (await coloredCount()) > 0, true), true)
    const givens = await givensColoredOn(p)
    assert.equal(givens > 0, true)
    await p.evaluate(() => Framework.app.restartPuzzle())
    assert.equal(await settle(() => givensColoredOn(p), givens), givens)
    assert.equal(await p.evaluate(() => Framework.app.preRestartSavedProgress !== undefined), true, 'SudokuPad kept the board from before the Restart')
    await undo()
    assert.equal(await settle(() => p.evaluate(() => Framework.app.preRestartSavedProgress === undefined && Framework.app.puzzle.undoStack.length > 0), true), true)
    assert.equal(await settle(label, 'Cell'), 'Cell')
    assert.equal(await settle(() => givensColoredOn(p), givens), givens)
    assert.equal(await p.evaluate((key) => Framework.getData(key), MODE_KEY), 'cell')
  })
})

describe('The first Undo after a Restart, with Text Anywhere loaded', { concurrency: false }, () => {
  it('brings its note back too', async () => {
    const both = await openSession(browser, script)
    try {
      const q = both.p
      await pressTo(q, 'Cell')
      await q.addScriptTag({ content: draw.script })
      await q.locator(draw.DRAW_BUTTON).waitFor({ state: 'visible' })
      await draw.pickDraw(q)
      await q.mouse.click(...await gridPoint(q, [2.5, 2.5]))
      await q.keyboard.type('15')
      await draw.finishNote(q)
      await q.evaluate(() => Framework.app.restartPuzzle())
      assert.deepEqual(await settle(() => draw.texts(q), []), [])
      await q.click('#control-undo')
      assert.deepEqual(await settle(() => draw.texts(q), ['15']), ['15'])
    } finally {
      await both.context.close()
    }
  })
})
