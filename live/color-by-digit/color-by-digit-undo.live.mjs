// Live check of Color by Digit's mode against SudokuPad's Undo and Redo on sudokupad.app, in headless Chromium:
// the button and the board must agree after either.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { coloredCountOn, GIVEN_COUNT, givensColoredOn, labelOn, MODE_KEY, openSession, pressTo, selectCell } from './color-by-digit-fixtures.mjs'
import { settle } from '../settle.mjs'
import * as textAnywhere from '../text-anywhere/text-anywhere-fixtures.mjs'
import { finishNote, gridPoint } from '../board.mjs'
import { flushSave } from '../attacks.mjs'
import { reloadWith, scriptSource, useBrowser } from '../session.mjs'

const script = scriptSource('color-by-digit.user.js')

const browser = useBrowser()

describe('Undo and Redo after a mode change', { concurrency: false }, () => {
  let context, p

  const undo = () => p.click('#control-undo')
  const redo = () => p.click('#control-redo')
  const coloredCount = () => coloredCountOn(p)
  const label = () => labelOn(p)

  before(async () => {
    ({ context, p } = await openSession(browser(), script))
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
    ({ context, p } = await openSession(browser(), script))
  })
  after(async () => { await context.close() })

  it('every Undo leaves the button and the board agreeing, down to the Off before the Cell step', async () => {
    await p.evaluate(() => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(0, 2)); a.act({ type: 'value', arg: '4' }); a.deselect() })
    await pressTo(p, 'Cell')
    assert.equal(await settle(async () => (await coloredCount()) > 0, true), true)
    await p.evaluate(() => Framework.app.restartPuzzle())
    assert.equal(await settle(async () => (await coloredCount()) > 0, true), true, 'the Restart leaves the board colored')
    assert.equal(await label(), 'Cell')
    // Whatever each Undo takes back, a colored board means Cell and an uncolored one means Off.
    const agree = async () => (await label()) === ((await coloredCount()) > 0 ? 'Cell' : 'Off')
    let undos = 0
    while (!(await label() === 'Off' && (await coloredCount()) === 0) && undos < 8) {
      await undo()
      undos++
      assert.equal(await settle(agree, true), true, `after Undo ${undos}: ${await label()}, ${await coloredCount()} colored`)
    }
    assert.equal(undos > 0, true, 'at least one Undo was checked')
    assert.deepEqual([await label(), await coloredCount()], ['Off', 0])
  })
})

describe('The first Undo after a Restart', { concurrency: false }, () => {
  let context, p, givens

  const undo = () => p.click('#control-undo')
  const coloredCount = () => coloredCountOn(p)
  const label = () => labelOn(p)

  before(async () => {
    ({ context, p } = await openSession(browser(), script))
  })
  after(async () => { await context.close() })

  it('the first Undo after a Restart loads the board from before it, leaves the mode on Cell and saves it, the givens colored', async () => {
    await p.evaluate(() => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(0, 2)); a.act({ type: 'value', arg: '4' }); a.deselect() })
    await pressTo(p, 'Cell')
    assert.equal(await settle(async () => (await coloredCount()) > 0, true), true)
    givens = await givensColoredOn(p)
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

  it('the second Undo takes back the Restart and the mode stays Cell with the board colored', async () => {
    await undo()
    assert.equal(await settle(() => p.evaluate(() => Framework.app.grid.getCell(0, 2).propGet('normal') ?? null), '4'), '4', 'the digit is back')
    assert.equal(await label(), 'Cell')
    assert.equal(await settle(async () => (await coloredCount()) > givens, true), true, 'the digit cell is colored again')
  })
})

describe('Redo after the Undos that took back a Restart', { concurrency: false }, () => {
  it('Restart, Undo, Undo, Redo leaves the mode on Cell with the givens colored, as a plain Restart does', async () => {
    const { context, p } = await openSession(browser(), script)
    const undo = () => p.click('#control-undo')
    const redo = () => p.click('#control-redo')
    const digitAt = () => p.evaluate(() => Framework.app.grid.getCell(0, 2).propGet('normal') ?? null)
    try {
      await selectCell(p, 0, 2)
      await p.evaluate(() => { const a = Framework.app; a.act({ type: 'value', arg: '4' }); a.deselect() })
      await pressTo(p, 'Cell')
      await p.evaluate(() => Framework.app.restartPuzzle())
      assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
      await undo()
      assert.equal(await settle(() => p.evaluate(() => Framework.app.preRestartSavedProgress === undefined), true), true)
      await undo()
      assert.equal(await settle(digitAt, '4'), '4')
      await redo()
      assert.equal(await settle(() => p.evaluate(() => Framework.app.puzzle.redoStack.length), 0), 0, 'the Redo put back the last step')
      assert.equal(await settle(digitAt, null), null, 'the Restart is back')
      assert.equal(await labelOn(p), 'Cell')
      assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
    } finally {
      await context.close()
    }
  })
})

describe('The first Undo after a Restart, saved', { concurrency: false }, () => {
  // Color by Digit colors again when the page loads, so the saved actions are read by a page without the script: SudokuPad's color tool toggles, and a coloring saved twice reads as none.
  it('saves the givens colored once: a reload without the script shows them colored', async () => {
    const { context, p } = await openSession(browser(), script)
    try {
      await p.evaluate(() => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(0, 2)); a.act({ type: 'value', arg: '4' }); a.deselect() })
      await pressTo(p, 'Cell')
      await p.evaluate(() => Framework.app.restartPuzzle())
      assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
      await p.click('#control-undo')
      assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT, 'the givens are colored after the Undo')
      assert.equal(await settle(() => p.evaluate(() => Framework.app.preRestartSavedProgress === undefined), true), true)
      await flushSave(p)
      await reloadWith(p, [])
      assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT, 'a reload without the script shows them colored')
    } finally {
      await context.close()
    }
  })
})

describe('The first Undo after a Restart, with Text Anywhere loaded', { concurrency: false }, () => {
  it('brings its note back too', async () => {
    const both = await openSession(browser(), script, { also: [textAnywhere.script] })
    try {
      const q = both.p
      await pressTo(q, 'Cell')
      await q.locator(textAnywhere.TOOL_BUTTON).waitFor({ state: 'visible' })
      await textAnywhere.pickTextAnywhere(q)
      await q.mouse.click(...await gridPoint(q, [2.5, 2.5]))
      await q.keyboard.type('15')
      await finishNote(q)
      await q.evaluate(() => Framework.app.restartPuzzle())
      assert.deepEqual(await settle(() => textAnywhere.texts(q), []), [])
      await q.click('#control-undo')
      assert.deepEqual(await settle(() => textAnywhere.texts(q), ['15']), ['15'])
    } finally {
      await both.context.close()
    }
  })
})
