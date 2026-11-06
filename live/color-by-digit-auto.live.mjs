// Live check of Color by Digit's auto mode on sudokupad.app, in headless Chromium.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { AUTO_KEY, AUTO_STORAGE_KEY, BUTTON, EDITOR, GIVENS, LOW_FIVE_HIGH, openSession, PROFILES_KEY, startInjected, watch } from './color-by-digit-fixtures.mjs'
import { gotoPuzzle, MODES } from './page.mjs'
import { closeDialogWith, openScriptDialog } from './settings.mjs'
import { clickUntil, settle, SETTLE_MS } from './settle.mjs'

/* global Replay */

const script = readFileSync(new URL('../color-by-digit.user.js', import.meta.url), 'utf8')

const GIVEN_COUNT = [...GIVENS].filter((d) => d !== '0').length

const BOX = `${BUTTON} [data-role="auto"]`

const givensColoredOn = (p) => p.evaluate(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).filter((c) => c.given && (c.colours || []).length).length)
const boxCheckedOn = (p) => p.locator(BOX).getAttribute('aria-checked')

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// A page injected at `mode`. `seedAuto` saves the auto mode on before the page's own scripts run.
const openAuto = (seedAuto, contextOptions = {}, mode = 'after-start') => openSession(browser, script, { force: seedAuto ? { [AUTO_STORAGE_KEY]: true } : {}, contextOptions, mode })

describe('auto mode, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const cellsState = () => read(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).map((c) => ({
    r: c.row, c: c.col, given: c.given, value: c.value, colours: [...(c.colours || [])]
  })))
  const at = (s, r, c) => s.find((x) => x.r === r && x.c === c)
  const allColors = async () => JSON.stringify((await cellsState()).map((x) => x.colours))
  const coloredCount = async () => (await cellsState()).filter((x) => x.colours.length).length
  const givensColored = () => givensColoredOn(p)
  const cellAt = async (r, c) => at(await cellsState(), r, c)
  const colorsAt = async (r, c) => (await cellAt(r, c)).colours
  const marks = (r, c) => read(([r, c]) => Framework.app.grid.getCell(r, c).propGet('centre').join(''), [r, c])
  const valueAt = async (r, c) => String((await cellAt(r, c)).value || '')
  const getAuto = () => read((key) => Framework.getData(key), AUTO_KEY)
  const getGroups = () => read((key) => { const d = Framework.getData(key); return d.profiles[d.active].groups }, PROFILES_KEY)
  const chooseProfile = (index) => p.click(`${EDITOR} [data-act=activate][data-index="${index}"]`)
  const boxChecked = () => boxCheckedOn(p)
  const dialogBox = () => p.locator(`${EDITOR} input[data-role="auto-draft"]`)
  const select = (r, c) => read(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [r, c])
  const undo = () => p.click('#control-undo')
  const redo = () => p.click('#control-redo')
  const openEditor = () => openScriptDialog(p, 'Color by Digit', EDITOR)
  const pressButton = async () => {
    const box = await p.locator(BUTTON).boundingBox()
    await p.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7)
  }

  before(async () => {
    ({ context, p, errors } = await openAuto(false))
  })
  after(async () => { await context.close() })

  it('the box is on the button and starts unticked, with nothing saved', async () => {
    assert.equal(await boxChecked(), 'false')
    assert.equal(await getAuto(), null)
  })

  it('setup: two entered digits land with auto mode off and color nothing; the replay is kept', async () => {
    await select(0, 2); await p.keyboard.press('4')
    await select(0, 3); await p.keyboard.press('7')
    const typed = await settle(async () => [await valueAt(0, 2), await valueAt(0, 3)], ['4', '7'])
    assert.deepEqual(typed, ['4', '7'])
    assert.equal(await coloredCount(), 0)
    await read(() => { window.__replay = Framework.app.getReplay() })
  })

  it('a click on the button colors the grid and leaves the box unticked', async () => {
    assert.equal(await clickUntil(pressButton, coloredCount, GIVEN_COUNT + 2, SETTLE_MS), GIVEN_COUNT + 2)
    assert.equal(await boxChecked(), 'false')
    assert.equal(await getAuto(), null)
    await undo()
    assert.equal(await settle(coloredCount, 0), 0)
  })

  it('a click on the box turns auto mode on, saves it, colors the givens and the entered digits and centre marks, and is not a click on the button', async () => {
    await select(8, 5); await p.click('#control-centre'); await p.keyboard.press('1'); await p.keyboard.press('3'); await p.click('#control-normal')
    assert.equal(await settle(() => marks(8, 5), '13'), '13')
    assert.equal(await coloredCount(), 0)
    await p.click(BOX)
    assert.equal(await settle(boxChecked, 'true'), 'true')
    assert.equal(await settle(getAuto, true), true)
    assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    assert.deepEqual(await settle(() => colorsAt(0, 2), ['2']), ['2'])
    assert.deepEqual(await settle(() => colorsAt(0, 3), ['1']), ['1'])
    assert.deepEqual(await settle(() => colorsAt(8, 5), ['1']), ['1'])
    assert.deepEqual(await watch(coloredCount), [GIVEN_COUNT + 3])
  })

  it('undo and redo do not trigger auto mode: an entered digit recorded without a color comes back without one', async () => {
    await undo() // the colors
    assert.equal(await settle(coloredCount, 0), 0)
    await undo() // the centre mark 3 at r9c6
    await undo() // the centre mark 1
    await undo() // the 7 at r1c4
    assert.equal(await settle(() => valueAt(0, 3), ''), '')
    await redo() // the 7 comes back first
    await redo() // the centre mark 1
    await redo() // the centre mark 3
    assert.equal(await settle(() => valueAt(0, 3), '7'), '7')
    assert.deepEqual(await watch(coloredCount), [0])
    await redo() // then the colors
    assert.equal(await settle(coloredCount, GIVEN_COUNT + 3), GIVEN_COUNT + 3)
  })

  it('turning auto mode on again leaves a group color painted by hand on an empty cell with no marks', async () => {
    const paintedAt = (key) => read((key) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(1, 1)); a.act(key ? { type: 'colour', arg: key } : { type: 'clear', arg: 'colour' }); a.deselect() }, key)
    await p.click(BOX) // off
    assert.equal(await settle(boxChecked, 'false'), 'false')
    await paintedAt('2')
    assert.deepEqual(await settle(() => colorsAt(1, 1), ['2']), ['2'])
    await p.click(BOX) // on
    assert.equal(await settle(boxChecked, 'true'), 'true')
    assert.deepEqual(await watch(() => colorsAt(1, 1)), [['2']])
    await paintedAt(null)
    assert.deepEqual(await settle(() => colorsAt(1, 1), []), [])
  })

  it('the keyboard stays with the puzzle right after a box click: a digit typed next lands and takes its color', async () => {
    await select(0, 5)
    await p.click(BOX) // off
    assert.equal(await settle(boxChecked, 'false'), 'false')
    await p.click(BOX) // on again, straight before the key
    assert.equal(await settle(boxChecked, 'true'), 'true')
    await p.keyboard.press('3')
    assert.equal(await settle(() => valueAt(0, 5), '3'), '3')
    assert.deepEqual(await settle(() => colorsAt(0, 5), ['1']), ['1'])
  })

  it('a digit and its color are one undo step, and one redo brings both back', async () => {
    await undo()
    assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['', []]), ['', []])
    assert.equal(await givensColored(), GIVEN_COUNT)
    await redo()
    assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['3', ['1']]), ['3', ['1']])
  })

  it('a multi-cell entry and its colors are one undo step', async () => {
    await read(() => { const a = Framework.app; a.deselect(); a.select([a.grid.getCell(8, 1), a.grid.getCell(8, 2)]) })
    await p.keyboard.press('1')
    const both = async () => [await valueAt(8, 1), await colorsAt(8, 1), await valueAt(8, 2), await colorsAt(8, 2)]
    assert.deepEqual(await settle(both, ['1', ['1'], '1', ['1']]), ['1', ['1'], '1', ['1']])
    await undo()
    assert.deepEqual(await settle(both, ['', [], '', []]), ['', [], '', []])
    await redo()
    assert.deepEqual(await settle(both, ['1', ['1'], '1', ['1']]), ['1', ['1'], '1', ['1']])
    await undo()
    assert.deepEqual(await settle(both, ['', [], '', []]), ['', [], '', []])
  })

  it('a Delete that changes nothing leaves the redo stack alone', async () => {
    await select(8, 6)
    await p.keyboard.press('Delete')
    assert.equal(await read(() => Framework.app.puzzle.redoStack.length) > 0, true)
    await select(0, 5)
    await redo()
    assert.deepEqual(await settle(async () => [await valueAt(8, 1), await valueAt(8, 2)], ['1', '1']), ['1', '1'])
    await undo()
  })

  it('a change to a digit moves the color: 3 to 4 swaps the odd color for the even one, in one step', async () => {
    await select(0, 5); await p.keyboard.press('4')
    assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['4', ['2']]), ['4', ['2']])
    await undo()
    assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['3', ['1']]), ['3', ['1']])
  })

  it('a cell that is not pure loses its color when its digit goes', async () => {
    await select(0, 5); await p.keyboard.press('Delete')
    assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['', []]), ['', []])
    await undo()
    assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['3', ['1']]), ['3', ['1']])
  })

  it('with Multi-color off, a Delete takes the group color off a cell that holds two colors', async () => {
    await select(8, 6); await p.keyboard.press('4')
    assert.deepEqual(await settle(() => colorsAt(8, 6), ['2']), ['2'])
    await read(() => Framework.setSetting('multicolour', true))
    await read(() => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(8, 6)); a.act({ type: 'colour', arg: '3' }); a.deselect() })
    assert.deepEqual(await settle(async () => [...await colorsAt(8, 6)].sort(), ['2', '3']), ['2', '3'])
    await read(() => Framework.setSetting('multicolour', false))
    await select(8, 6); await p.keyboard.press('Delete')
    assert.equal(await settle(() => valueAt(8, 6), ''), '')
    assert.equal((await colorsAt(8, 6)).includes('2'), false)
    await read(() => Framework.setSetting('multicolour', true))
  })

  it('centre marks of one group color an empty cell, marks of two groups take it away, and corner marks are ignored', async () => {
    await select(8, 0); await p.click('#control-centre'); await p.keyboard.press('1'); await p.keyboard.press('3')
    assert.equal(await settle(() => marks(8, 0), '13'), '13')
    assert.deepEqual(await settle(() => colorsAt(8, 0), ['1']), ['1'])
    await p.keyboard.press('2')
    assert.deepEqual(await settle(() => colorsAt(8, 0), []), [])
    await p.click('#control-normal')
    await select(8, 1); await p.click('#control-corner'); await p.keyboard.press('1'); await p.click('#control-normal')
    const corner = () => read(() => Framework.app.grid.getCell(8, 1).propGet('corner').join(''))
    assert.equal(await settle(corner, '1'), '1')
    assert.deepEqual(await watch(() => colorsAt(8, 1)), [[]])
  })

  it('a hand-removed group color stays off until the cell\'s digit next changes', async () => {
    await read(() => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(0, 5)); a.act({ type: 'colour', arg: '1' }); a.deselect() })
    assert.deepEqual(await settle(() => colorsAt(0, 5), []), [])
    assert.deepEqual(await watch(() => colorsAt(0, 5)), [[]])
    await select(0, 5); await p.keyboard.press('5')
    assert.deepEqual(await settle(() => colorsAt(0, 5), ['1']), ['1'])
  })

  it('an entry SudokuPad runs inside its own group, as a paste does, is colored and undone with it', async () => {
    const state = async () => [await valueAt(8, 3), await colorsAt(8, 3)]
    await select(8, 3); await p.keyboard.press('7')
    assert.deepEqual(await settle(state, ['7', ['1']]), ['7', ['1']])
    await read(() => {
      const a = Framework.app
      a.act({ type: 'groupstart' }); a.act({ type: 'clear', arg: 'normal' }); a.act({ type: 'value', arg: '6' }); a.act({ type: 'groupend' })
    })
    assert.deepEqual(await settle(state, ['6', ['2']]), ['6', ['2']])
    await undo() // the clear, the 6 and the colors together: back to the 7 in its odd color
    assert.deepEqual(await settle(state, ['7', ['1']]), ['7', ['1']])
    await undo()
    assert.deepEqual(await settle(state, ['', []]), ['', []])
  })

  it('loadReplay and replay playback with auto mode on change no colors', async () => {
    const colorsBefore = await allColors()
    assert.notEqual(colorsBefore, JSON.stringify((await cellsState()).map(() => [])))
    await read(() => Framework.app.loadReplay(window.__replay))
    // The replay holds two entered digits and no color; auto mode must add none.
    assert.deepEqual(await settle(async () => [await valueAt(0, 2), await valueAt(0, 3), await valueAt(0, 5)], ['4', '7', '']), ['4', '7', ''])
    assert.deepEqual(await watch(coloredCount), [0])
    await read(() => Framework.app.puzzle.replayPlay(Replay.decode(window.__replay)))
    assert.deepEqual(await watch(coloredCount), [0])
  })

  it('a restart colors the givens again', async () => {
    await p.click('#control-restart')
    await p.locator('.dialog button').filter({ hasText: /Restart/ }).filter({ hasNotText: /Keep Time/ }).first().click()
    assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    assert.equal(await valueAt(0, 2), '')
  })

  it('the dialog box opens at the value in force, and Cancel leaves auto mode as it was', async () => {
    await openEditor()
    assert.equal(await dialogBox().isChecked(), true)
    await dialogBox().uncheck()
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.equal(await boxChecked(), 'true')
    assert.equal(await getAuto(), true)
  })

  it('Save with the dialog box unticked turns auto mode off on both controls and leaves every color in place', async () => {
    const colors = await allColors()
    await openEditor()
    await dialogBox().uncheck()
    await closeDialogWith(p, 'Save', EDITOR)
    assert.equal(await settle(boxChecked, 'false'), 'false')
    assert.equal(await getAuto(), false)
    assert.deepEqual(await watch(allColors), [colors])
  })

  it('with auto mode off a typed digit gets no color, and the button still colors the grid', async () => {
    await select(0, 2); await p.keyboard.press('4')
    assert.equal(await settle(() => valueAt(0, 2), '4'), '4')
    assert.deepEqual(await watch(() => colorsAt(0, 2)), [[]])
    assert.equal(await clickUntil(pressButton, coloredCount, GIVEN_COUNT + 1, SETTLE_MS), GIVEN_COUNT + 1)
  })

  it('with auto mode off, Save with changed groups colors nothing', async () => {
    await openEditor()
    await chooseProfile(1)
    await closeDialogWith(p, 'Save', EDITOR)
    assert.deepEqual(await settle(getGroups, LOW_FIVE_HIGH), LOW_FIVE_HIGH)
    const colors = await allColors()
    assert.deepEqual(await watch(allColors), [colors])
  })

  it('Save with the dialog box ticked turns auto mode on from the dialog and colors the givens', async () => {
    await undo() // the button press, so the givens carry the colors of the groups at the time of the press
    await openEditor()
    await dialogBox().check()
    await closeDialogWith(p, 'Save', EDITOR)
    assert.equal(await settle(boxChecked, 'true'), 'true')
    assert.equal(await settle(getAuto, true), true)
    // Every given is colored again, and r1c1 holds 5, which is key 5 in Low/5/High.
    assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    assert.deepEqual(await colorsAt(0, 0), ['5'])
  })

  it('Save with changed groups and auto mode on recolors every cell in one undo step', async () => {
    // Low/5/High is saved; switch to Odd/Even.
    const before = await allColors()
    await openEditor()
    await chooseProfile(0)
    await closeDialogWith(p, 'Save', EDITOR)
    const oddEven = (x) => {
      const digit = x.given || x.value
      return digit ? [Number(digit) % 2 ? '1' : '2'] : []
    }
    const wrong = async () => (await cellsState()).filter((x) => JSON.stringify(x.colours) !== JSON.stringify(oddEven(x))).length
    assert.equal(await settle(wrong, 0), 0)
    await undo()
    assert.equal(await settle(allColors, before), before)
  })

  it('one Save that turns auto mode on and changes the groups recolors every pure cell, not only the givens', async () => {
    await p.click(BOX)
    assert.equal(await settle(boxChecked, 'false'), 'false')
    await select(0, 6); await p.keyboard.press('8')
    assert.equal(await settle(() => valueAt(0, 6), '8'), '8')
    assert.deepEqual(await watch(() => colorsAt(0, 6)), [[]])
    await openEditor()
    await chooseProfile(1)
    await dialogBox().check()
    await closeDialogWith(p, 'Save', EDITOR)
    assert.equal(await settle(boxChecked, 'true'), 'true')
    assert.deepEqual(await settle(() => colorsAt(0, 6), ['9']), ['9'])
  })

  it('a click on the box turns auto mode off again, and the colors stay', async () => {
    const colors = await allColors()
    await p.click(BOX)
    assert.equal(await settle(boxChecked, 'false'), 'false')
    assert.equal(await getAuto(), false)
    assert.deepEqual(await watch(allColors), [colors])
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

// These two depend on the injection time: at document-idle the script waits for SudokuPad's progress to load before it colors the grid.
for (const mode of MODES) {
  describe(`auto mode saved on, injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ({ context, p, errors } = await openAuto(true, {}, mode))
    })
    after(async () => { await context.close() })

    it('the box is ticked and the givens are colored at puzzle start, with no click', async () => {
      assert.equal(await boxCheckedOn(p), 'true')
      assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })

  describe(`auto mode saved on, with saved progress, injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ({ context, p, errors } = await openAuto(false, {}, mode))
      await p.evaluate(() => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(0, 2)) })
      await p.keyboard.press('4')
      // SudokuPad saves progress a moment after a change.
      await p.waitForFunction(() => Object.keys(window.localStorage).some((k) => /progress/i.test(k)), null, { timeout: SETTLE_MS })
      await p.evaluate(([key]) => Framework.setData(key, true), [AUTO_KEY])
      await gotoPuzzle(p)
      await startInjected(p, script, mode)
    })
    after(async () => { await context.close() })

    it('the saved digit is back and colored with the givens, since loading progress resets the board', async () => {
      assert.equal(await p.evaluate(() => String(Framework.app.grid.getCell(0, 2).value)), '4')
      assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
      assert.deepEqual(await settle(() => p.evaluate(() => [...Framework.app.grid.getCell(0, 2).colours]), ['2']), ['2'])
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })
}

describe('auto mode box on a touch screen, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ({ context, p, errors } = await openAuto(false, { hasTouch: true }))
  })
  after(async () => { await context.close() })

  it('a tap on the box turns auto mode on and colors the givens, and a second tap turns it off', async () => {
    await p.tap(BOX)
    assert.equal(await settle(() => boxCheckedOn(p), 'true'), 'true')
    assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
    await p.tap(BOX)
    assert.equal(await settle(() => boxCheckedOn(p), 'false'), 'false')
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})
