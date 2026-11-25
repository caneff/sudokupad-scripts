/* global Framework */
import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { captureConsoleErrors, restartPuzzle } from '../page.mjs'
import { closeDialogWith, savedState } from '../settings.mjs'
import { settle } from '../settle.mjs'
import { ARROW, buttonPoint, coloredCountOn, deleteProfileRow, dragProfileRow, EDITOR, group, labelOn, MENU, ODD_EVEN, openSession, paintedKeys, PROFILE_ROWS, PROFILES_KEY, pressTo, ROW_CORNER, SEED, typeProfileName, wrongCountOn, reloadSession, openEditorOn } from './color-by-digit-fixtures.mjs'
import { selectCell, undoDepth } from '../board.mjs'
import { scriptSource, useBrowser } from '../session.mjs'

const script = scriptSource('color-by-digit.user.js')

const NEW_PROFILE = `${EDITOR} button[data-act=new-profile]`
const MAX_PROFILES = 6
const MAX_NAME_LENGTH = 24
// The board's row with the most empty cells: row 9 of the puzzle (0-based 8), 0 for empty.
const ROW = 8
const EMPTY_COLS = [0, 1, 2, 3, 5, 6]

const browser = useBrowser()

describe('attacks on Color by Digit', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const label = () => labelOn(p)
  const coloredCount = () => coloredCountOn(p)
  const undo = () => p.click('#control-undo')
  const editor = () => p.locator(EDITOR)
  const closeEditor = (text) => closeDialogWith(p, text, EDITOR)
  const getState = async () => savedState(await read((key) => Framework.getData(key), PROFILES_KEY))
  const activeName = async () => { const state = await getState(); return state.profiles[state.active].name }
  const rowNames = () => p.$$eval(PROFILE_ROWS, (rows) => rows.map((r) => r.getAttribute('aria-label')))
  const pulldownNames = () => p.$$eval(`${EDITOR} select[data-role=cell-profile] option`, (es) => es.map((e) => e.textContent))
  const wrongCount = (groups) => wrongCountOn(p, groups)
  // A given ignores the key.
  const enter = async (r, c, key) => {
    await selectCell(p, r, c)
    await p.keyboard.press(key)
  }
  // SudokuPad keeps a digit and its color as separate undo steps, so it takes a few.
  const undoUntilGone = async (col) => {
    for (let i = 0; i < 6 && (await valuesInRow())[col] !== ''; i++) {
      await undo()
      await settle(async () => (await valuesInRow())[col], '', 1000)
    }
  }
  const valuesInRow = () => read((row) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => String(Framework.app.grid.getCell(row, c).value || '')), ROW)

  beforeEach(async () => {
    ;({ context, p, errors } = await openSession(browser(), script, { seed: captureConsoleErrors }))
    await pressTo(p, 'Cell')
    await settle(() => wrongCount(ODD_EVEN), 0)
  })
  afterEach(async () => {
    try {
      assert.deepEqual(errors, [], 'no page error, console error or skip line')
    } finally {
      await context?.close()
    }
  })

  it('attack 42: press the button on and off, ten clicks with no pause', async () => {
    await enter(ROW, 0, '3')
    await enter(ROW, 1, '4')
    assert.equal(await label(), 'Cell', 'the presses start at Cell')
    const { x, y } = await buttonPoint(p)
    for (let i = 0; i < 10; i++) await p.mouse.click(x, y)
    assert.equal(await settle(label, 'Cell'), 'Cell', 'ten presses from Cell land on Cell')
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, 'every digit has its group color')
  })

  it('attack 43: enter digits, change the mode, then undo across the mode change', async () => {
    await enter(ROW, 0, '3')
    await enter(ROW, 1, '4')
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0)
    assert.notEqual(await coloredCount(), 0, 'Cell colors the board')
    await pressTo(p, 'Off')
    assert.equal(await settle(coloredCount, 0), 0, 'Off takes the cell colors off')
    await undo()
    assert.equal(await settle(label, 'Cell'), 'Cell', 'one undo undoes the mode change')
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, 'the cell colors are back, digits included')
    assert.deepEqual((await valuesInRow()).slice(0, 2), ['3', '4'], 'both digits are still there')
    await undoUntilGone(1)
    assert.deepEqual((await valuesInRow()).slice(0, 2), ['3', ''], 'undo takes the last digit and not the first')
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, 'the other cells keep their colors')
    await undoUntilGone(0)
    assert.deepEqual((await valuesInRow()).slice(0, 2), ['', ''])
    for (let i = 0; i < 6 && (await label()) !== 'Off'; i++) {
      await p.click('#control-redo')
      await settle(label, 'Off', 500)
    }
    assert.equal(await label(), 'Off', 'redo reaches the mode change again')
    assert.deepEqual((await valuesInRow()).slice(0, 2), ['3', '4'])
    assert.equal(await settle(coloredCount, 0), 0, 'Off leaves the cells bare')
  })

  it('attack 44: enter, delete and overwrite digits across a whole row with no pause', async () => {
    const pass = async (keys) => {
      for (let c = 0; c < 9; c++) if (keys[c]) await enter(ROW, c, keys[c])
    }
    await pass('123456789')
    await pass('987654321')
    // Delete clears a given's color too (SudokuPad's own Delete), so the delete pass leaves the givens alone.
    await pass([...Array(9)].map((_, c) => (EMPTY_COLS.includes(c) ? 'Backspace' : '')))
    assert.deepEqual(await settle(valuesInRow, Array(9).fill('')), Array(9).fill(''), 'the delete pass emptied every cell that is not a given')
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, 'and left no color on them')
    await pass('246813579')
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, 'every digit has its group color')
    const values = await valuesInRow()
    assert.deepEqual(EMPTY_COLS.map((c) => values[c]), EMPTY_COLS.map((c) => '246813579'[c]), 'the last pass is what the row holds')
  })

  it('attack 45: open the profiles menu, pick a profile, then undo', async () => {
    await enter(ROW, 0, '3')
    await enter(ROW, 1, '4')
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0)
    await p.click(ARROW)
    await p.locator(MENU).waitFor({ state: 'visible' })
    await p.locator(`${MENU} [data-act=pick]`).filter({ hasText: 'Low/5/High' }).click()
    await p.locator(MENU).waitFor({ state: 'detached' })
    const lowFiveHigh = (await getState()).profiles.find((x) => x.name === 'Low/5/High').groups
    assert.equal(await settle(() => wrongCount(lowFiveHigh), 0), 0, 'the pick recolors the board')
    await undo()
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, 'the undo brings the old profile\'s colors back')
    assert.deepEqual((await valuesInRow()).slice(0, 2), ['3', '4'], 'and takes no digit')
    assert.equal(await activeName(), 'Odd/Even', 'the pick is undone')
    await enter(ROW, 2, '7')
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, 'the next digit takes the old profile\'s color')
    await undoUntilGone(1)
    assert.deepEqual((await valuesInRow()).slice(0, 2), ['3', ''], 'undo takes the last digit and not the first')
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, 'the other cells keep their colors')
  })

  it('attack 45b: pick a profile, delete the old one in the dialog and Save, then undo: the picked profile keeps its own groups', async () => {
    await p.click(ARROW)
    await p.locator(MENU).waitFor({ state: 'visible' })
    await p.locator(`${MENU} [data-act=pick]`).filter({ hasText: 'Low/5/High' }).click()
    await p.locator(MENU).waitFor({ state: 'detached' })
    const lowFiveHigh = (await getState()).profiles.find((x) => x.name === 'Low/5/High').groups
    assert.equal(await settle(() => wrongCount(lowFiveHigh), 0), 0)
    await openEditorOn(p)
    await deleteProfileRow(p, 1)
    await closeEditor('Save')
    assert.deepEqual((await getState()).profiles.map((x) => x.name), ['Low/5/High'])
    const depth = await undoDepth(p)
    assert.equal(depth > 0, true, 'the pick left a step to undo')
    await undo()
    assert.equal(await settle(async () => (await undoDepth(p)) < depth, true), true, 'the Undo landed: the undo stack shrank')
    // The profile the undo would name is gone, so the saved profile is left as it is.
    const after = await getState()
    assert.deepEqual(after.profiles.map((x) => [x.name, x.groups]), [['Low/5/High', lowFiveHigh]])
  })

  it('attack 46: in the editor add, rename, copy, move and delete profiles up to six', async () => {
    await openEditorOn(p)
    assert.deepEqual(await rowNames(), ['Odd/Even', 'Low/5/High'])
    await p.click(`${PROFILE_ROWS}:nth-child(1)`, ROW_CORNER)
    await typeProfileName(p, '')
    assert.deepEqual(await rowNames(), ['Odd/Even', 'Low/5/High'], 'an emptied name keeps the old one')
    const tricky = 'Say "hi" <b>x</b> & \'y\''
    await typeProfileName(p, tricky)
    // Selecting the other row redraws every row and pulldown from the saved names, which is where markup would be built.
    await p.click(`${PROFILE_ROWS}:nth-child(2)`, ROW_CORNER)
    assert.deepEqual(await rowNames(), [tricky, 'Low/5/High'], 'quotes and < stay text in the rows')
    assert.deepEqual(await pulldownNames(), [tricky, 'Low/5/High'], 'and in the pulldown')
    assert.equal(await editor().locator('b').count(), 0, 'the < made no element')
    await p.click(`${PROFILE_ROWS}:nth-child(1)`, ROW_CORNER)
    await typeProfileName(p, 'X'.repeat(MAX_NAME_LENGTH * 2))
    assert.deepEqual(await rowNames(), ['X'.repeat(MAX_NAME_LENGTH), 'Low/5/High'], 'a very long name is cut to the limit')
    await p.click(NEW_PROFILE)
    const copyName = (await rowNames())[2]
    assert.ok(copyName.length <= MAX_NAME_LENGTH, `the copy's name is within the limit: ${copyName.length} characters`)
    while ((await rowNames()).length < MAX_PROFILES) await p.click(NEW_PROFILE)
    assert.match(await editor().innerText(), new RegExp(`${MAX_PROFILES} of ${MAX_PROFILES}`))
    assert.equal(await p.locator(NEW_PROFILE).isDisabled(), true, '+ New profile is off at six')
    // Move: the last row up to the first, then the first down to the end.
    const names = await rowNames()
    const last = MAX_PROFILES - 1
    await dragProfileRow(p, last, 0)
    assert.deepEqual(await settle(rowNames, [names[last], ...names.slice(0, last)]), [names[last], ...names.slice(0, last)], 'the last row moved to the top')
    await dragProfileRow(p, 0, last)
    assert.deepEqual(await settle(rowNames, names), names, 'and back to the end')
    await closeEditor('Save')
    assert.deepEqual((await getState()).profiles.map((x) => x.name), names)
    await openEditorOn(p)
    // The last profile cannot be deleted, so the loop stops at one.
    for (let left = MAX_PROFILES; left > 1; left--) {
      await deleteProfileRow(p, 1)
      assert.equal(await settle(async () => (await rowNames()).length, left - 1), left - 1, 'a delete removes one row')
    }
    assert.equal(await p.locator(`${PROFILE_ROWS} button[data-act=delete]`).first().isDisabled(), true, 'the last profile cannot be deleted')
    await closeEditor('Save')
    assert.equal((await getState()).profiles.length, 1)
    await reloadSession(p, script)
    assert.equal((await getState()).profiles.length, 1, 'a reload keeps the one profile')
    assert.equal(await settle(label, 'Cell'), 'Cell')
  })

  it('attack 47: with the editor open, restart the puzzle; with it open, reload', async () => {
    await enter(ROW, 0, '3')
    await openEditorOn(p)
    await p.click(NEW_PROFILE)
    await restartPuzzle(p)
    assert.equal(await editor().count(), 1, 'the editor stays open through a restart')
    assert.deepEqual((await valuesInRow()).slice(0, 2), ['', ''], 'the restart emptied the board')
    assert.deepEqual(await rowNames(), ['Odd/Even', 'Low/5/High', 'Odd/Even copy'], 'the draft is as it was')
    await closeEditor('Cancel')
    assert.deepEqual((await getState()).profiles.map((x) => x.name), SEED.profiles.map((x) => x.name), 'Cancel after the restart saves nothing')
    await openEditorOn(p)
    await p.click(NEW_PROFILE)
    await reloadSession(p, script)
    assert.equal(await label(), 'Cell')
    assert.deepEqual((await getState()).profiles.map((x) => x.name), SEED.profiles.map((x) => x.name), 'the draft was never saved')
    await openEditorOn(p)
    assert.deepEqual(await rowNames(), SEED.profiles.map((x) => x.name), 'the saved profiles open as they were')
    await closeEditor('Cancel')
  })

  it('attack 48: paint every digit to one color, then to none', async () => {
    const painted = () => paintedKeys(p)
    await enter(ROW, 0, '3')
    await enter(ROW, 1, '4')
    await openEditorOn(p)
    const swatch = editor().locator('button[data-role=swatch]:not([data-empty])').nth(4)
    const key = await swatch.getAttribute('data-key')
    await swatch.click()
    for (let digit = 0; digit <= 9; digit++) await p.locator(`${EDITOR} button[data-act=digit][data-digit="${digit}"]`).click()
    assert.deepEqual(Object.values(await painted()), Array(10).fill(key), 'every digit key shows the one color')
    await closeEditor('Save')
    const state = await getState()
    assert.deepEqual(state.profiles[state.active].groups.map((x) => x.key), [key], 'one group of that color')
    assert.equal(await settle(() => wrongCount([group(key, '0123456789'.split(''))]), 0), 0, 'the board shows the one color on every digit')
    assert.notEqual(await coloredCount(), 0, 'and some cells hold it')
    await openEditorOn(p)
    await editor().locator('button[data-act=clear]').click()
    assert.deepEqual(Object.values(await painted()), Array(10).fill(''), 'Clear all leaves every digit with no color')
    await closeEditor('Save')
    assert.equal(await settle(coloredCount, 0), 0, 'with no digit colored the board shows none')
    await pressTo(p, 'Off')
  })
})
