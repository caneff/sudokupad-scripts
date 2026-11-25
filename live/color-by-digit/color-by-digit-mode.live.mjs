import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { allFillsOn, ARROW, AUTO_KEY, AUTO_STORAGE_KEY, BUTTON, buttonBoxesOn, buttonPoint, chipLookOn, coloredCountOn, DEFAULT_FILL, EDITOR, GIVEN_COUNT, givensColoredOn, labelOn, LOW_FIVE_HIGH, MENU, MODE_KEY, MODE_WORD_STORAGE_KEY, modeTick, modeTicksOn, modeTo, ODD_EVEN, openSession, paletteColorOn, pressTo, PROFILES_KEY, PROFILES_STORAGE_KEY, SAVED_MODE, SEED, SEEDED_OFF, savedProfiles, tickMode, shadeReaders, watch, wordOn, cellsStateOn, wrongColorCountOn, reloadSession, openEditorOn } from './color-by-digit-fixtures.mjs'
import { MODES } from '../page.mjs'
import { colorCell, restart, selectCell } from '../board.mjs'
import { closeDialogWith, savedState } from '../settings.mjs'
import { settle, SETTLE_MS } from '../settle.mjs'
import { scriptSource, useBrowser } from '../session.mjs'

/* global Replay */

const script = scriptSource('color-by-digit.user.js')

const { shadeOn } = shadeReaders(createRequire(import.meta.url)('../../color-by-digit.user.js'))

const HOLD_MS = 500
// SudokuPad's color 3 is in no group of Odd/Even, whose keys are 1 and 2.
const NO_GROUP_KEY = '3'

const browser = useBrowser()

describe('the mode, saved Off, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const cellsState = () => cellsStateOn(p)
  const at = (s, r, c) => s.find((x) => x.r === r && x.c === c)
  const allColors = async () => JSON.stringify((await cellsState()).map((x) => x.colours))
  const coloredCount = () => coloredCountOn(p)
  const givensColored = () => givensColoredOn(p)
  const cellAt = async (r, c) => at(await cellsState(), r, c)
  const colorsAt = async (r, c) => (await cellAt(r, c)).colours
  const sortedColorsAt = async (r, c) => [...await colorsAt(r, c)].sort()
  const marks = (r, c) => read(([r, c]) => Framework.app.grid.getCell(r, c).propGet('centre').join(''), [r, c])
  const valueAt = async (r, c) => String((await cellAt(r, c)).value || '')
  const getMode = () => read((key) => Framework.getData(key), MODE_KEY)
  const getGroups = async () => { const d = savedState(await read((key) => Framework.getData(key), PROFILES_KEY)); return d.profiles[d.active].groups }
  const chooseProfile = (index) => p.selectOption(`${EDITOR} select[data-role=cell-profile]`, String(index))
  const label = () => labelOn(p)
  // The button's chips, Odd/Even's two cells, as the mode should draw them: the cell fill and the digit color, per the ticket's table.
  const WHITE = 'rgb(255, 255, 255)'
  const BLACK = 'rgb(0, 0, 0)'
  const lookOf = async (mode) => {
    const keys = ['1', '2']
    const color = await Promise.all(keys.map((key) => paletteColorOn(p, key)))
    const shade = await Promise.all(keys.map((key) => shadeOn(p, key)))
    const cells = {
      // A digit that falls short of 3:1 on its chip is darkened (rgb(25, 86, 187) is the blue on key 2's color, rgb(131, 131, 131) the shade on key 1's).
      cell: keys.map((_, i) => [color[i], i === 1 ? 'rgb(25, 86, 187)' : DEFAULT_FILL]),
      digit: keys.map((_, i) => [WHITE, shade[i]]),
      both: keys.map((_, i) => [color[i], i === 0 ? 'rgb(131, 131, 131)' : shade[i]]),
      off: keys.map(() => [WHITE, 'rgb(136, 136, 136)'])
    }[mode]
    return { cells, outline: mode === 'off' ? 'rgb(170, 170, 170)' : BLACK }
  }
  const chipLook = () => chipLookOn(p)
  const assertLook = async (mode) => { const want = await lookOf(mode); assert.deepEqual(await settle(chipLook, want), want) }
  const chooseMode = (word) => tickMode(p, word)
  const paint = (r, c, key) => colorCell(p, [r, c], key)
  const undo = () => p.click('#control-undo')
  const redo = () => p.click('#control-redo')

  before(async () => {
    ({ context, p, errors } = await openSession(browser(), script))
    await read(() => Framework.setSetting('multicolour', true))
  })
  after(async () => { await context.close() })

  it('the button names Off in its label and draws its chips white with grey digits and a grey outline, and has no AUTO box', async () => {
    assert.equal(await label(), 'Off')
    assert.equal(await p.locator(BUTTON).getAttribute('title'), 'Color by Digit: Off')
    await assertLook('off')
    assert.equal(await p.locator(`${BUTTON} [data-role="auto"]`).count(), 0)
    assert.equal(/AUTO/.test(await p.locator(BUTTON).textContent()), false)
  })

  it('setup: two entered digits land in Off and color nothing; the replay is kept', async () => {
    await selectCell(p, 0, 2); await p.keyboard.press('4')
    await selectCell(p, 0, 3); await p.keyboard.press('7')
    const typed = await settle(async () => [await valueAt(0, 2), await valueAt(0, 3)], ['4', '7'])
    assert.deepEqual(typed, ['4', '7'])
    assert.equal(await coloredCount(), 0)
    await read(() => { window.__replay = Framework.app.getReplay() })
  })

  it('a press turns coloring on with Cell ticked, showing the chips filled with blue digits, saves it, and colors the givens, the entered digits and centre marks', async () => {
    await selectCell(p, 8, 5); await p.click('#control-centre'); await p.keyboard.press('1'); await p.keyboard.press('3'); await p.click('#control-normal')
    assert.equal(await settle(() => marks(8, 5), '13'), '13')
    assert.equal(await coloredCount(), 0)
    await pressTo(p, 'Cell')
    await assertLook('cell')
    assert.deepEqual(await settle(getMode, SAVED_MODE.Cell), SAVED_MODE.Cell)
    assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    assert.deepEqual(await settle(() => colorsAt(0, 2), ['2']), ['2'])
    assert.deepEqual(await settle(() => colorsAt(0, 3), ['1']), ['1'])
    assert.deepEqual(await settle(() => colorsAt(8, 5), ['1']), ['1'])
    assert.deepEqual(await watch(coloredCount), [GIVEN_COUNT + 3])
  })

  it('entering Cell is one undo step, and undo and redo do not trigger Cell: an entered digit recorded without a color comes back without one', async () => {
    await undo() // the colors, all at once
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

  it('Save with only Digit ticked shows the chips white with shaded digits, and takes every group color off every cell in one undo step; a hand-placed color in no group stays', async () => {
    await paint(0, 0, NO_GROUP_KEY) // on a given that holds its group color
    await paint(1, 1, NO_GROUP_KEY) // on an empty cell
    await paint(1, 2, '2') // a group color by hand on an empty cell
    assert.deepEqual(await settle(() => sortedColorsAt(0, 0), ['1', NO_GROUP_KEY]), ['1', NO_GROUP_KEY])
    assert.deepEqual(await settle(() => colorsAt(1, 2), ['2']), ['2'])
    const before = await allColors()
    await modeTo(p, 'Digit')
    await assertLook('digit')
    assert.deepEqual(await settle(getMode, SAVED_MODE.Digit), SAVED_MODE.Digit)
    assert.equal(await settle(coloredCount, 2), 2)
    assert.deepEqual(await colorsAt(0, 0), [NO_GROUP_KEY])
    assert.deepEqual(await colorsAt(1, 1), [NO_GROUP_KEY])
    assert.deepEqual(await colorsAt(1, 2), [])
    await undo()
    assert.equal(await settle(allColors, before), before)
    await redo()
    assert.equal(await settle(coloredCount, 2), 2)
    await paint(0, 0, NO_GROUP_KEY)
    await paint(1, 1, NO_GROUP_KEY)
    assert.equal(await settle(coloredCount, 0), 0)
  })

  it('in Digit a typed digit gets no cell color', async () => {
    await selectCell(p, 0, 6); await p.keyboard.press('8')
    assert.equal(await settle(() => valueAt(0, 6), '8'), '8')
    assert.deepEqual(await watch(() => colorsAt(0, 6)), [[]])
    await undo()
    assert.equal(await settle(() => valueAt(0, 6), ''), '')
  })

  it('Save with Cell and Digit ticked shows the chips filled with shaded digits, colors cells as Cell does and leaves a group color painted by hand on an empty cell with no marks', async () => {
    await paint(1, 1, '2')
    assert.deepEqual(await settle(() => colorsAt(1, 1), ['2']), ['2'])
    await modeTo(p, 'Both')
    await assertLook('both')
    assert.deepEqual(await settle(getMode, SAVED_MODE.Both), SAVED_MODE.Both)
    assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    assert.deepEqual(await watch(() => colorsAt(1, 1)), [['2']])
    await paint(1, 1, '2')
    assert.deepEqual(await settle(() => colorsAt(1, 1), []), [])
  })

  it('in Both a typed digit takes its color in the same undo step', async () => {
    await selectCell(p, 0, 6); await p.keyboard.press('8')
    assert.deepEqual(await settle(async () => [await valueAt(0, 6), await colorsAt(0, 6)], ['8', ['2']]), ['8', ['2']])
    await undo()
    assert.deepEqual(await settle(async () => [await valueAt(0, 6), await colorsAt(0, 6)], ['', []]), ['', []])
  })

  it('a press turns Both off, showing the chips white and grey, and takes every group color off in one undo step, keeping a hand color in no group with Multi-color off', async () => {
    await paint(0, 0, NO_GROUP_KEY) // beside the given's group color, while Multi-color is on
    assert.deepEqual(await settle(() => sortedColorsAt(0, 0), ['1', NO_GROUP_KEY]), ['1', NO_GROUP_KEY])
    await read(() => Framework.setSetting('multicolour', false))
    try {
      await pressTo(p, 'Off')
      await assertLook('off')
      assert.equal(await settle(coloredCount, 1), 1)
      assert.deepEqual(await colorsAt(0, 0), [NO_GROUP_KEY])
    } finally {
      await read(() => Framework.setSetting('multicolour', true))
    }
    // With Multi-color back on, so SudokuPad's undo, which runs the earlier steps again, can rebuild a cell of two colors.
    await undo()
    assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    assert.deepEqual(await settle(() => sortedColorsAt(0, 0), ['1', NO_GROUP_KEY]), ['1', NO_GROUP_KEY])
    await redo()
    assert.equal(await settle(coloredCount, 1), 1)
    assert.deepEqual(await colorsAt(0, 0), [NO_GROUP_KEY])
    await paint(0, 0, NO_GROUP_KEY)
    assert.equal(await settle(coloredCount, 0), 0)
  })

  it('while off, unticking Digit and Save change nothing on the board, and the ticks stay for the next press', async () => {
    const before = await allColors()
    await modeTo(p, 'Off')
    assert.deepEqual(await settle(getMode, SAVED_MODE.Off), SAVED_MODE.Off)
    assert.deepEqual(await watch(allColors), [before])
  })

  it('the keyboard stays with the puzzle right after a press: a digit typed next lands and takes its color', async () => {
    await selectCell(p, 0, 5)
    await pressTo(p, 'Cell')
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
    await selectCell(p, 8, 6)
    await p.keyboard.press('Delete')
    assert.equal(await read(() => Framework.app.puzzle.redoStack.length) > 0, true)
    await selectCell(p, 0, 5)
    await redo()
    assert.deepEqual(await settle(async () => [await valueAt(8, 1), await valueAt(8, 2)], ['1', '1']), ['1', '1'])
    await undo()
  })

  it('a change to a digit moves the color: 3 to 4 swaps the odd color for the even one, in one step', async () => {
    await selectCell(p, 0, 5); await p.keyboard.press('4')
    assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['4', ['2']]), ['4', ['2']])
    await undo()
    assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['3', ['1']]), ['3', ['1']])
  })

  it('a cell that is not pure loses its color when its digit goes', async () => {
    await selectCell(p, 0, 5); await p.keyboard.press('Delete')
    assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['', []]), ['', []])
    await undo()
    assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['3', ['1']]), ['3', ['1']])
  })

  it('with Multi-color off, a Delete takes the group color off a cell that holds two colors', async () => {
    await selectCell(p, 8, 6); await p.keyboard.press('4')
    assert.deepEqual(await settle(() => colorsAt(8, 6), ['2']), ['2'])
    await paint(8, 6, NO_GROUP_KEY)
    assert.deepEqual(await settle(() => sortedColorsAt(8, 6), ['2', NO_GROUP_KEY]), ['2', NO_GROUP_KEY])
    await read(() => Framework.setSetting('multicolour', false))
    await selectCell(p, 8, 6); await p.keyboard.press('Delete')
    assert.equal(await settle(() => valueAt(8, 6), ''), '')
    assert.equal((await colorsAt(8, 6)).includes('2'), false)
    await read(() => Framework.setSetting('multicolour', true))
  })

  it('centre marks of one group color an empty cell, marks of two groups take it away, and corner marks are ignored', async () => {
    await selectCell(p, 8, 0); await p.click('#control-centre'); await p.keyboard.press('1'); await p.keyboard.press('3')
    assert.equal(await settle(() => marks(8, 0), '13'), '13')
    assert.deepEqual(await settle(() => colorsAt(8, 0), ['1']), ['1'])
    await p.keyboard.press('2')
    assert.deepEqual(await settle(() => colorsAt(8, 0), []), [])
    await p.click('#control-normal')
    await selectCell(p, 8, 1); await p.click('#control-corner'); await p.keyboard.press('1'); await p.click('#control-normal')
    const corner = () => read(() => Framework.app.grid.getCell(8, 1).propGet('corner').join(''))
    assert.equal(await settle(corner, '1'), '1')
    assert.deepEqual(await watch(() => colorsAt(8, 1)), [[]])
  })

  it('a hand-removed group color stays off until the cell\'s digit next changes', async () => {
    await paint(0, 5, '1')
    assert.deepEqual(await settle(() => colorsAt(0, 5), []), [])
    assert.deepEqual(await watch(() => colorsAt(0, 5)), [[]])
    await selectCell(p, 0, 5); await p.keyboard.press('5')
    assert.deepEqual(await settle(() => colorsAt(0, 5), ['1']), ['1'])
  })

  it('an entry SudokuPad runs inside its own group, as a paste does, is colored and undone with it', async () => {
    const state = async () => [await valueAt(8, 3), await colorsAt(8, 3)]
    await selectCell(p, 8, 3); await p.keyboard.press('7')
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

  it('loadReplay and replay playback in Cell change no colors', async () => {
    const colorsBefore = await allColors()
    assert.notEqual(colorsBefore, JSON.stringify((await cellsState()).map(() => [])))
    await read(() => Framework.app.loadReplay(window.__replay))
    // The replay holds two entered digits and no color; Cell must add none.
    assert.deepEqual(await settle(async () => [await valueAt(0, 2), await valueAt(0, 3), await valueAt(0, 5)], ['4', '7', '']), ['4', '7', ''])
    assert.deepEqual(await watch(coloredCount), [0])
    await read(() => Framework.app.puzzle.replayPlay(Replay.decode(window.__replay)))
    assert.deepEqual(await watch(coloredCount), [0])
  })

  it('a restart colors the givens again', async () => {
    await restart(p)
    assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    assert.equal(await valueAt(0, 2), '')
  })

  it('a hold, a right click and the arrow box open the profile menu, and none of them steps the mode', async () => {
    const { x, y } = await buttonPoint(p)
    const closeMenu = async () => {
      await p.keyboard.press('Escape')
      await p.locator(MENU).waitFor({ state: 'detached' })
    }
    await p.mouse.move(x, y)
    await p.mouse.down()
    // Opens on a timer after HOLD_MS; waits on the menu, not on the clock.
    await p.locator(MENU).waitFor({ state: 'visible', timeout: HOLD_MS + SETTLE_MS })
    await p.mouse.up()
    await closeMenu()
    await p.mouse.click(x, y, { button: 'right' })
    await p.locator(MENU).waitFor({ state: 'visible' })
    await closeMenu()
    await p.click(ARROW)
    await p.locator(MENU).waitFor({ state: 'visible' })
    await closeMenu()
    assert.deepEqual(await watch(label), ['Cell'])
    assert.equal(await givensColored(), GIVEN_COUNT)
  })

  it('the dialog opens with the On, Cell and Digit checkboxes above the Cell and Digit pulldowns, ticked as the mode in force, the Digit pulldown has no None, and Cancel leaves the mode as it was', async () => {
    await openEditorOn(p)
    const roles = await p.locator(`${EDITOR} select`).evaluateAll((es) => es.slice(0, 2).map((e) => e.dataset.role))
    assert.deepEqual(roles, ['cell-profile', 'digit-profile'])
    assert.equal(await p.locator(`${EDITOR} [data-role="mode-draft"]`).count(), 0)
    assert.equal(await p.locator(`${EDITOR} select[data-role="digit-profile"] option[value="none"]`).count(), 0)
    assert.deepEqual(await modeTicksOn(p), { on: true, cell: true, digit: false })
    const above = await p.locator(modeTick('digit')).evaluate((box, sel) => box.getBoundingClientRect().bottom <= document.querySelector(sel).getBoundingClientRect().top, `${EDITOR} select[data-role="cell-profile"]`)
    assert.equal(above, true, 'the checkboxes sit above the pulldowns')
    await chooseMode('Off')
    assert.deepEqual(await modeTicksOn(p), { on: false, cell: true, digit: false })
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.equal(await label(), 'Cell')
    assert.deepEqual(await getMode(), SAVED_MODE.Cell)
  })

  it('the dialog\'s last ticked box refuses to untick, and ticking the other lets it go', async () => {
    await openEditorOn(p)
    await p.locator(modeTick('cell')).click()
    assert.deepEqual(await watch(() => modeTicksOn(p)), [{ on: true, cell: true, digit: false }])
    await p.locator(modeTick('digit')).check()
    await p.locator(modeTick('cell')).uncheck()
    assert.deepEqual(await modeTicksOn(p), { on: true, cell: false, digit: true })
    await p.locator(modeTick('digit')).click()
    assert.deepEqual(await watch(() => modeTicksOn(p)), [{ on: true, cell: false, digit: true }])
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.deepEqual(await getMode(), SAVED_MODE.Cell)
  })

  it('Save with On unticked turns coloring off as a press would: every group color comes off, in one undo step', async () => {
    await openEditorOn(p)
    await chooseMode('Off')
    await closeDialogWith(p, 'Save', EDITOR)
    assert.equal(await settle(label, 'Off'), 'Off')
    assert.deepEqual(await getMode(), SAVED_MODE.Off)
    assert.equal(await settle(coloredCount, 0), 0)
    await undo()
    assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    await redo()
    assert.equal(await settle(coloredCount, 0), 0)
  })

  it('in Off, Save with changed groups colors nothing', async () => {
    await openEditorOn(p)
    await chooseProfile(1)
    await closeDialogWith(p, 'Save', EDITOR)
    assert.deepEqual(await settle(getGroups, LOW_FIVE_HIGH), LOW_FIVE_HIGH)
    assert.deepEqual(await watch(coloredCount), [0])
  })

  it('Save with On ticked turns coloring on with Cell and colors the givens', async () => {
    await openEditorOn(p)
    await chooseMode('Cell')
    await closeDialogWith(p, 'Save', EDITOR)
    assert.equal(await settle(label, 'Cell'), 'Cell')
    assert.deepEqual(await settle(getMode, SAVED_MODE.Cell), SAVED_MODE.Cell)
    // Every given is colored, and r1c1 holds 5, which is key 5 in Low/5/High.
    assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    assert.deepEqual(await colorsAt(0, 0), ['5'])
  })

  it('in Cell, Save with changed groups recolors every cell in one undo step', async () => {
    const before = await allColors()
    await openEditorOn(p)
    await chooseProfile(0)
    await closeDialogWith(p, 'Save', EDITOR)
    const oddEven = (x) => {
      const digit = x.given || x.value
      return digit ? [Number(digit) % 2 ? '1' : '2'] : []
    }
    const wrong = () => wrongColorCountOn(p, oddEven)
    assert.equal(await settle(wrong, 0), 0)
    await undo()
    assert.equal(await settle(allColors, before), before)
    assert.deepEqual(await settle(getGroups, LOW_FIVE_HIGH), LOW_FIVE_HIGH, 'the undo brings the old active profile back too')
    await redo()
    assert.equal(await settle(wrong, 0), 0)
    assert.deepEqual(await settle(getGroups, ODD_EVEN), ODD_EVEN, 'and the redo the new one')
  })

  it('one Save that ticks Cell and changes the groups recolors every pure cell, not only the givens', async () => {
    await modeTo(p, 'Digit')
    await selectCell(p, 0, 6); await p.keyboard.press('8')
    assert.equal(await settle(() => valueAt(0, 6), '8'), '8')
    assert.deepEqual(await watch(() => colorsAt(0, 6)), [[]])
    await openEditorOn(p)
    await chooseProfile(1)
    await chooseMode('Cell')
    await closeDialogWith(p, 'Save', EDITOR)
    assert.equal(await settle(label, 'Cell'), 'Cell')
    assert.deepEqual(await settle(() => colorsAt(0, 6), ['9']), ['9'])
  })

  it('one Save that turns coloring off and changes the groups takes the old groups\' colors off too', async () => {
    // Low/5/High is active, with keys 1, 5 and 9 on the board; Odd/Even has only 1 and 2.
    assert.deepEqual(await colorsAt(0, 0), ['5'])
    await openEditorOn(p)
    await chooseProfile(0)
    await chooseMode('Off')
    await closeDialogWith(p, 'Save', EDITOR)
    assert.equal(await settle(label, 'Off'), 'Off')
    assert.equal(await settle(coloredCount, 0), 0)
  })

  it('Undo of a Save that turns coloring off and changes the profile brings the mode and the profile back, and Redo puts both again', async () => {
    await pressTo(p, 'Cell')
    assert.equal(await settle(label, 'Cell'), 'Cell')
    const before = await getGroups()
    await openEditorOn(p)
    await chooseProfile(1)
    await chooseMode('Off')
    await closeDialogWith(p, 'Save', EDITOR)
    assert.equal(await settle(label, 'Off'), 'Off')
    await undo()
    assert.equal(await settle(label, 'Cell'), 'Cell')
    assert.deepEqual(await settle(getGroups, before), before)
    await redo()
    assert.equal(await settle(label, 'Off'), 'Off')
    assert.deepEqual(await settle(getGroups, LOW_FIVE_HIGH), LOW_FIVE_HIGH)
  })

  it('Undo of a Save that turns coloring on and changes the profile ends in Off with the old profile, and Redo in Cell with the new one', async () => {
    await openEditorOn(p)
    await chooseProfile(0)
    await chooseMode('Cell')
    await closeDialogWith(p, 'Save', EDITOR)
    assert.equal(await settle(label, 'Cell'), 'Cell')
    await undo()
    assert.equal(await settle(label, 'Off'), 'Off')
    assert.deepEqual(await settle(getGroups, LOW_FIVE_HIGH), LOW_FIVE_HIGH)
    await redo()
    assert.equal(await settle(label, 'Cell'), 'Cell')
    assert.deepEqual(await settle(getGroups, ODD_EVEN), ODD_EVEN)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

describe('the mode word on the button, injected after Start Puzzle (#509)', { concurrency: false }, () => {
  let context, p
  before(async () => { ({ context, p } = await openSession(browser(), script, { saved: savedProfiles(SEED) })) })
  after(async () => { await context.close() })

  it('shows the word the ticks give while on, and OFF while off: a press turns Both off and back on to Both', async () => {
    const words = [await wordOn(p)]
    for (const want of ['Digit', 'Both']) {
      await modeTo(p, want)
      words.push(await wordOn(p))
    }
    await pressTo(p, 'Off')
    words.push(await wordOn(p))
    await pressTo(p, 'Both')
    words.push(await wordOn(p))
    assert.deepEqual(words, ['CELL', 'DIGIT', 'BOTH', 'OFF', 'BOTH'])
  })

  it('keeps the word, the chips and the arrow box apart in every mode', async () => {
    const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
    for (const want of ['Digit', 'Both', 'Off', 'Cell']) {
      await modeTo(p, want)
      const { word, chips, arrow } = await buttonBoxesOn(p)
      assert.equal(word.right > word.left && word.bottom > word.top, true, `${want}: the word is drawn: ${JSON.stringify(word)}`)
      assert.equal(apart(word, chips), true, `${want}: word over chips ${JSON.stringify([word, chips])}`)
      assert.equal(apart(chips, arrow), true, `${want}: chips over arrow ${JSON.stringify([chips, arrow])}`)
      assert.equal(apart(word, arrow), true, `${want}: word over arrow ${JSON.stringify([word, arrow])}`)
    }
  })
})

// The starting mode with no mode saved: the mode word saved before the ticks, else Cell unless auto mode was saved off.
// Digit colors saved off (the Digit pulldown's None) load a saved Digit as Off.
for (const [what, force, label, colored] of [
  ['nothing saved', {}, 'Cell', GIVEN_COUNT],
  ['auto mode saved off', { [AUTO_STORAGE_KEY]: false }, 'Off', 0],
  ['the mode word Digit saved', { [MODE_WORD_STORAGE_KEY]: 'digit' }, 'Digit', 0],
  ['the mode word Digit saved with digit colors off', { [MODE_WORD_STORAGE_KEY]: 'digit', [PROFILES_STORAGE_KEY]: { ...SEED, useDigitColors: false } }, 'Off', 0]
]) {
  describe(`the starting mode with ${what}, injected after Start Puzzle`, { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ({ context, p, errors } = await openSession(browser(), script, { saved: savedProfiles(SEED), force }))
    })
    after(async () => { await context.close() })

    it(`starts in ${label}`, async () => {
      assert.equal(await labelOn(p), label)
      assert.equal(await settle(() => givensColoredOn(p), colored), colored)
      assert.deepEqual(await watch(() => givensColoredOn(p)), [colored])
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })
}

// These two depend on the injection time: at document-idle the script waits for SudokuPad's progress to load before it colors the grid.
for (const mode of MODES) {
  describe(`auto mode saved on and no mode saved, injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ({ context, p, errors } = await openSession(browser(), script, { saved: savedProfiles(SEED), force: { [AUTO_STORAGE_KEY]: true }, mode }))
    })
    after(async () => { await context.close() })

    it('starts in Cell, and the givens are colored at puzzle start, with no press', async () => {
      assert.equal(await labelOn(p), 'Cell')
      assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })

  describe(`auto mode saved on and no mode saved, with saved progress, injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ({ context, p, errors } = await openSession(browser(), script, { saved: { ...savedProfiles(SEED), [AUTO_STORAGE_KEY]: false }, mode }))
      await selectCell(p, 0, 2)
      await p.keyboard.press('4')
      // SudokuPad saves progress a moment after a change.
      await p.waitForFunction(() => Object.keys(window.localStorage).some((k) => /progress/i.test(k)), null, { timeout: SETTLE_MS })
      await p.evaluate(([key]) => Framework.setData(key, true), [AUTO_KEY])
      await reloadSession(p, script, mode)
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

describe('the mode on a touch screen, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ({ context, p, errors } = await openSession(browser(), script, { contextOptions: { hasTouch: true } }))
  })
  after(async () => { await context.close() })

  it('a tap on the button turns coloring on with Cell and colors the givens, and a second tap turns it off and takes them off', async () => {
    const { x, y } = await buttonPoint(p)
    const tap = () => p.touchscreen.tap(x, y)
    await tap()
    assert.equal(await settle(() => labelOn(p), 'Cell'), 'Cell')
    assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
    await tap()
    assert.equal(await settle(() => labelOn(p), 'Off'), 'Off')
    assert.equal(await settle(() => coloredCountOn(p), 0), 0)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

describe('the solver\'s own colors and Digit alone, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors
  const cellColors = () => p.evaluate(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).map((c) => [...(c.colours || [])]))

  before(async () => {
    ({ context, p, errors } = await openSession(browser(), script, { saved: SEEDED_OFF }))
  })
  after(async () => { await context.close() })

  it('with colors of the active profile\'s groups painted by hand and coloring off, Digit ticked alone and a press leave every one of them and shade the digits', async () => {
    await selectCell(p, 0, 2); await p.keyboard.press('4')
    assert.equal(await settle(() => p.evaluate(() => String(Framework.app.grid.getCell(0, 2).value)), '4'), '4')
    // Odd/Even's keys 1 and 2, by hand: on a given, on the entered 4 (its own group's color), and on an empty cell.
    await colorCell(p, [0, 0], '2')
    await colorCell(p, [0, 2], '2')
    await colorCell(p, [1, 1], '1')
    const painted = await cellColors()
    assert.equal(painted.filter((c) => c.length).length, 3)
    await modeTo(p, 'Off')
    await openEditorOn(p)
    await p.locator(modeTick('digit')).check()
    await p.locator(modeTick('cell')).uncheck()
    await closeDialogWith(p, 'Save', EDITOR)
    assert.deepEqual(await settle(() => p.evaluate((key) => Framework.getData(key), MODE_KEY), { on: false, cell: false, digit: true }), { on: false, cell: false, digit: true })
    assert.deepEqual(await watch(cellColors), [painted])
    await pressTo(p, 'Digit')
    const shade = await shadeOn(p, '2')
    assert.deepEqual(await settle(allFillsOn(p, 'entered', '4'), [shade]), [shade])
    assert.deepEqual(await watch(cellColors), [painted])
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})
