// Live attacks 69 to 72 (#628, from #590): the wheel, middle click, fast multiple clicks, Ctrl+A, Ctrl+C, Ctrl+V, number-pad digits and Caps Lock, thrown at
// Text Anywhere, Pen Tool Extras and Color by Digit installed together, on sudokupad.app in headless Chromium. Each test names its attack and
// asserts the crash signals (no uncaught error, console error or skip line) beside what a user expects. Clicks, drags and keys are real input.
/* global Framework */
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { boardState, cellState, emptyCell, pickTool } from './attack-fixtures.mjs'
import { assertNoCrash, openWithAllScripts } from './attacks.mjs'
import { cellCentre, gridPoint, mouseDrag, typeText } from './board.mjs'
import { penEntries } from './pen.mjs'
import { settle } from './settle.mjs'
import * as draw from './draw-tool/draw-tool-fixtures.mjs'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('attacks on input', { concurrency: false }, () => {
  let context, p, errors

  beforeEach(async () => {
    ;({ context, p, errors } = await openWithAllScripts(browser, { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }))
  })
  afterEach(async () => { await context?.close() })

  const selectedCells = () => p.evaluate(() => Framework.app.puzzle.selectedCells.map((c) => `${c.row},${c.col}`))
  const undoDepth = () => p.evaluate(() => Framework.app.puzzle.undoStack.length)
  const clipboard = () => p.evaluate(() => navigator.clipboard.readText())

  it('attack 69: Ctrl+wheel, the wheel and a middle click in the middle of a pen line and of a note move leave a whole line and a whole note, and the next drag works', async () => {
    // What each interruption does to a drag in its middle. SudokuPad's own pen line behaves the same without these scripts: a middle click ends the line there.
    const interruptions = [
      ['the wheel', () => p.mouse.wheel(0, 300), true],
      ['Ctrl+wheel', async () => { await p.keyboard.down('Control'); await p.mouse.wheel(0, -300); await p.keyboard.up('Control') }, true],
      ['a middle click', async () => { await p.mouse.down({ button: 'middle' }); await p.mouse.up({ button: 'middle' }) }, false]
    ]

    // The pen line: a drag along a row from column 1.5 to 4.5 with the interruption at 2.5. An undisturbed one first says what a whole line is.
    await pickTool(p, 'pen')
    const lineOnRow = async (row, interrupt) => {
      await p.mouse.move(...await gridPoint(p, [row + 0.5, 1.5]))
      await p.mouse.down()
      await p.mouse.move(...await gridPoint(p, [row + 0.5, 2.5]), { steps: 6 })
      await interrupt?.()
      await p.mouse.move(...await gridPoint(p, [row + 0.5, 4.5]), { steps: 6 })
      await p.mouse.up()
      await draw.frames(p)
      return (await penEntries(p)).filter((entry) => entry.startsWith(`${row},`)).map((entry) => entry.replace(/^\d+/, 'R'))
    }
    const whole = await lineOnRow(1)
    assert.equal(whole.length, 3, 'an undisturbed drag draws three segments')
    for (const [i, [name, interrupt, keepsGoing]] of interruptions.entries()) {
      const drawn = await lineOnRow(3 + 2 * i, interrupt)
      if (keepsGoing) assert.deepEqual(drawn, whole, `${name} in the middle of a line leaves the whole line`)
      else assert.equal(drawn.length > 0 && drawn.length < whole.length && drawn.every((segment) => whole.includes(segment)), true, `${name} ends the line where it fell: ${JSON.stringify(drawn)}`)
    }
    assert.deepEqual(await lineOnRow(9 - 1), whole, 'an ordinary drag still draws the whole line afterward')
    assert.equal(await draw.tool(p), 'pen', 'the pen is still the tool')
    await assertNoCrash(p, errors)

    // The note move: a drag from a note's middle by two cells with the interruption at one cell.
    await pickTool(p, 'draw')
    const [, , size] = await cellCentre(p, 0, 0)
    const notes = [['11', 1.5], ['22', 3.5], ['33', 5.5], ['44', 7.5]]
    for (const [text, row] of notes) await typeText(p, [row, 1.5], text)
    const moveNote = async ([text, row], interrupt) => {
      const [x, y] = await draw.middleAt(p, await gridPoint(p, [row, 1.5]))
      const before = (await draw.noteInCells(p, text))[1]
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.move(x + size, y, { steps: 6 })
      await interrupt?.()
      await p.mouse.move(x + 2 * size, y, { steps: 6 })
      await p.mouse.up()
      await draw.frames(p)
      const moved = (await draw.noteInCells(p, text))[1] - before
      // No button is held, so the note must stay put under further mouse moves.
      await p.mouse.move(x + 3 * size, y + size, { steps: 4 })
      await draw.frames(p)
      assert.equal(Math.abs((await draw.noteInCells(p, text))[1] - before - moved) < 0.15, true, `${text}: the note does not follow a mouse with no button held`)
      return moved
    }
    const full = await moveNote(notes[0])
    assert.equal(Math.abs(full - 2) < 0.3, true, `an undisturbed move goes two cells: ${full}`)
    for (const [i, [name, interrupt]] of interruptions.entries()) {
      const moved = await moveNote(notes[i + 1], interrupt)
      if (name === 'the wheel') assert.equal(Math.abs(moved - full) < 0.3, true, `${name} in the middle of a move leaves the note moved the whole way: ${moved}`)
      // Ctrl is SudokuPad's temporary Centre tool, which ends the gesture; a middle click ends it as a release does. Either way the note rests where the pointer was.
      else assert.equal(moved > 0.5 && moved < 1.5, true, `${name} ends the move where it fell: moved ${moved} of ${full}`)
    }
    assert.equal(await draw.tool(p), 'draw', 'Text Anywhere is the tool again once Ctrl is up')
    assert.deepEqual((await draw.texts(p)).sort(), notes.map(([text]) => text).sort(), 'every note is still there once')
    assert.equal((await draw.saved(p)).length, notes.length, 'every note is saved once')
    assert.equal(await p.locator(draw.TEXT_BOX).count(), 0, 'no text box is left open')
    await assertNoCrash(p, errors)
  })

  it('attack 70: double- and triple-clicks at speed on cells, notes and the hold-to-edit buttons open nothing half done', async () => {
    // Cells: ten double-clicks in a row with no pause, then a triple-click. A double-click selects the cells like the one clicked, so what stays selected is SudokuPad's; an ordinary click afterward selects just its cell.
    await pickTool(p, 'normal')
    for (let i = 0; i < 10; i++) await p.mouse.click(...await gridPoint(p, [i % 9 + 0.5, (i * 2) % 9 + 0.5]), { clickCount: 2, delay: 0 })
    await p.mouse.click(...await gridPoint(p, [4.5, 4.5]), { clickCount: 3, delay: 0 })
    await p.mouse.click(...await gridPoint(p, [6.5, 6.5]))
    assert.deepEqual(await selectedCells(), ['6,6'], 'an ordinary click afterward selects just its cell')
    await assertNoCrash(p, errors)

    // Notes: a double-click on a note opens it once, a triple-click inside keeps it one box, and Escape keeps the text; the same on empty space leaves no note.
    await pickTool(p, 'draw')
    await typeText(p, [4.5, 4.5], '15')
    const noteAt = await draw.middleAt(p, await gridPoint(p, [4.5, 4.5]))
    await p.mouse.click(...noteAt, { clickCount: 2, delay: 0 })
    assert.equal(await p.locator(draw.TEXT_BOX).count(), 1, 'a double-click on a note opens it')
    await p.mouse.click(...noteAt, { clickCount: 3, delay: 0 })
    assert.equal(await p.locator(draw.TEXT_BOX).count(), 1, 'a triple-click inside the open note keeps it one box')
    await draw.finishNote(p)
    assert.deepEqual(await draw.texts(p), ['15'], 'the note keeps its text')
    for (const clickCount of [2, 3]) {
      await p.mouse.click(...await gridPoint(p, [1.5, 1.5]), { clickCount, delay: 0 })
      await draw.finishNote(p)
      assert.deepEqual(await draw.texts(p), ['15'], `${clickCount} clicks on empty space leave no extra note`)
      assert.equal(await p.locator(draw.TEXT_BOX).count(), 0, `${clickCount} clicks on empty space leave no text box`)
    }
    assert.equal((await draw.saved(p)).length, 1, 'one note is saved')
    await assertNoCrash(p, errors)

    // Hold-to-edit buttons: fast clicks pick the color and open no picker (a hold of a second does).
    const colorOf = () => p.evaluate((key) => Framework.getData(key), draw.COLOR_KEY)
    const textButton = await p.locator(`${draw.KEYPAD} button[data-key="4"]`).boundingBox()
    for (const clickCount of [2, 3]) await p.mouse.click(...draw.middleOf(textButton), { clickCount, delay: 0 })
    assert.equal(await settle(colorOf, 4), 4, 'fast clicks on Text Anywhere\'s color button pick it')
    assert.equal(await p.locator(draw.PICKER).count(), 0, 'no color picker opens on Text Anywhere\'s button')
    await pickTool(p, 'pen')
    const penButton = await p.locator('.tool-pen button[data-key="4"]').boundingBox()
    for (const clickCount of [2, 3]) await p.mouse.click(...draw.middleOf(penButton), { clickCount, delay: 0 })
    assert.equal(await p.locator('.pen-tool-extras-picker').count(), 0, 'no color picker opens on the pen\'s button')
    await mouseDrag(p, [[7.5, 1.5], [7.5, 3.5]])
    assert.deepEqual([...new Set((await penEntries(p)).map((entry) => entry.split(':')[1][1]))], ['4'], 'the pen draws in the color the fast clicks picked')
    await assertNoCrash(p, errors)
  })

  it('attack 71: Ctrl+A, Ctrl+C and Ctrl+V in a note being edited work on its text and leave SudokuPad\'s cells alone', async () => {
    // SudokuPad's own cell copy first: a value in one cell, copied, with another cell selected for the paste a stray Ctrl+V would fill.
    const [row, col] = await emptyCell(p)
    await pickTool(p, 'normal')
    await p.mouse.click(...await gridPoint(p, [row + 0.5, col + 0.5]))
    await p.keyboard.press('7')
    await p.keyboard.press('Control+c')
    const [pasteRow, pasteCol] = (await p.evaluate(() => Framework.app.puzzle.cells.filter((c) => !c.given).map((c) => [c.row, c.col])))[1]
    await p.mouse.click(...await gridPoint(p, [pasteRow + 0.5, pasteCol + 0.5]))
    const cellsBefore = [await cellState(p, [row, col]), await cellState(p, [pasteRow, pasteCol])]
    const selectedBefore = await selectedCells()
    const depthBefore = await undoDepth()
    await pickTool(p, 'draw')
    await typeText(p, [4.5, 4.5], '15')
    await p.mouse.dblclick(...await draw.middleAt(p, await gridPoint(p, [4.5, 4.5])))
    await p.keyboard.press('Control+End')
    await p.keyboard.press('Control+a')
    await p.keyboard.press('Control+c')
    assert.equal(await clipboard(), '15', 'Ctrl+A then Ctrl+C copies the note\'s text')
    await p.keyboard.press('End')
    await p.keyboard.press('Control+v')
    assert.deepEqual(await settle(() => p.locator(draw.TEXT_BOX).textContent(), '1515'), '1515', 'Ctrl+V pastes the copied text')
    await p.keyboard.press('Control+a')
    await p.keyboard.press('Control+v')
    assert.equal(await p.locator(draw.TEXT_BOX).textContent(), '15', 'Ctrl+A then Ctrl+V replaces the whole text')
    await draw.finishNote(p)
    assert.deepEqual(await draw.texts(p), ['15'], 'the note keeps the text')
    assert.deepEqual([await cellState(p, [row, col]), await cellState(p, [pasteRow, pasteCol])], cellsBefore, 'the copied cell and the cell selected for the paste are as they were')
    assert.deepEqual(await selectedCells(), selectedBefore, 'the selection is as it was')
    assert.equal(await undoDepth(), depthBefore, 'SudokuPad\'s undo stack took nothing')
    await assertNoCrash(p, errors)
  })

  it('attack 71: Ctrl+A, Ctrl+C and Ctrl+V with notes selected, or none, change no note and no cell', async () => {
    await pickTool(p, 'draw')
    await typeText(p, [4.5, 4.5], '15')
    await typeText(p, [6.5, 6.5], '26')
    const cellsBefore = await boardState(p)
    for (const selecting of [false, true]) {
      if (selecting) await p.mouse.click(...await draw.middleAt(p, await gridPoint(p, [4.5, 4.5])))
      for (const key of ['Control+a', 'Control+c', 'Control+v']) await p.keyboard.press(key)
      assert.deepEqual((await draw.texts(p)).sort(), ['15', '26'], `${selecting ? 'with a note selected' : 'with none selected'}: both notes keep their text`)
      assert.equal(await p.locator(draw.TEXT_BOX).count(), 0, 'no note is left open')
      await draw.finishNote(p)
    }
    assert.equal(await boardState(p), cellsBefore, 'no cell changed')
    await assertNoCrash(p, errors)
  })

  it('attack 72: number-pad digits act as the digit row does, and the keys Caps Lock types change nothing, with each tool current', async () => {
    // Each trial takes cells no trial has touched, since a restart between trials changes what a key does (SudokuPad's own).
    const cells = await p.evaluate(() => Framework.app.puzzle.cells.filter((c) => !c.given).map((c) => [c.row, c.col]))
    const scratch = cells.pop()
    // Playwright's own 'Numpad4' is the key with Num Lock off (it reports ArrowLeft), so a number-pad digit as typed with Num Lock on goes through the protocol.
    const cdp = await context.newCDPSession(p)
    const numpad = async (digit) => {
      const key = { key: digit, code: `Numpad${digit}`, location: 3, text: digit, windowsVirtualKeyCode: 96 + Number(digit) }
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    }
    const press = (key) => key.startsWith('Numpad') ? numpad(key.slice(-1)) : p.keyboard.press(key)
    const clickCell = async ([row, col]) => p.mouse.click(...await gridPoint(p, [row + 0.5, col + 0.5]))
    // The board after `keys` pressed in a clean cell. A click in a probe cell afterward shows the color the pen picked, which no key leaves in the cell itself.
    const trial = async (tool, keys) => {
      const [cell, probe] = [cells.shift(), cells.shift()]
      await pickTool(p, tool)
      // A tool's picked color is kept between cells, so each trial starts from color 1, picked in a cell of its own.
      await clickCell(scratch)
      await p.keyboard.press('Digit1')
      await clickCell(cell)
      for (const key of keys) await press(key)
      const state = [await cellState(p, cell), await p.evaluate((key) => Framework.getData(key), draw.COLOR_KEY)]
      await clickCell(probe)
      return JSON.stringify([...state, await cellState(p, probe)])
    }
    // The tool current after `key` pressed with `tool` current.
    const toolAfter = async (tool, key) => {
      await pickTool(p, tool)
      await p.keyboard.press(key)
      return draw.tool(p)
    }
    for (const tool of ['normal', 'corner', 'centre', 'colour', 'pen', 'draw']) {
      const none = await trial(tool, [])
      const numpad = await trial(tool, ['Numpad4'])
      assert.notEqual(numpad, none, `${tool}: a number-pad 4 does something`)
      assert.equal(await trial(tool, ['Digit4']), numpad, `${tool}: a number-pad 4 does what the digit row's 4 does`)
      // The browser here cannot turn the lock on, so the key is pressed and the capital letter the lock types is sent: a tool hotkey in capitals does what the lowercase one does.
      assert.equal(await trial(tool, ['CapsLock', 'Numpad4', 'CapsLock']), numpad, `${tool}: the Caps Lock key changes nothing`)
      assert.equal(await toolAfter(tool, 'X'), await toolAfter(tool, 'x'), `${tool}: a capital hotkey does what the lowercase one does`)
      await assertNoCrash(p, errors)
    }
  })
})
