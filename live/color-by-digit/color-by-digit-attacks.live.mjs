// Live attacks on color-by-digit.user.js (#590's predefined attacks 42 to 48, #598): odd orders a solver produces, on sudokupad.app in
// headless Chromium. Each test names its attack, and asserts the crash signals (no page error, no console error, no skip line) beside
// what a user expects to see. All input is real mouse and keyboard input.
/* global Framework */
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { captureConsoleErrors, gotoPuzzle, restartPuzzle } from '../page.mjs'
import { closeDialogWith, openScriptDialog } from '../settings.mjs'
import { settle } from '../settle.mjs'
import { ARROW, buttonPoint, center, coloredCountOn, EDITOR, group, labelOn, MENU, ODD_EVEN, openSession, PROFILES_KEY, pressTo, ROW_CORNER, SEED, savedState, startInjected } from './color-by-digit-fixtures.mjs'

const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')

const ROWS = `${EDITOR} [data-role=profile-row]`
const NAME_FIELD = `${EDITOR} [data-role=profile-name]`
const NEW_PROFILE = `${EDITOR} button[data-act=new-profile]`
const MAX_PROFILES = 6
const MAX_NAME_LENGTH = 24
// How far past a row's middle a drag ends to land beyond it.
const DROP_PAST_MIDDLE_PX = 8
const MODE_CYCLE = ['Cell', 'Digit', 'Both', 'Off']
// The board's row with the most empty cells: row 9 of the puzzle (0-based 8), 0 for empty.
const ROW = 8

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('attacks on Color by Digit', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const label = () => labelOn(p)
  const coloredCount = () => coloredCountOn(p)
  const undo = () => p.click('#control-undo')
  const redo = () => p.click('#control-redo')
  const editor = () => p.locator(EDITOR)
  const openEditor = () => openScriptDialog(p, 'Color by Digit', EDITOR)
  const closeEditor = (text) => closeDialogWith(p, text, EDITOR)
  const getState = async () => savedState(await read((key) => Framework.getData(key), PROFILES_KEY))
  const rowNames = () => p.$$eval(ROWS, (rows) => rows.map((r) => r.getAttribute('aria-label')))
  const heading = () => editor().innerText()
  const select = (r, c) => read(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [r, c])
  const keyOf = (groups, digit) => (groups.find((g) => g.digits.includes(String(digit))) || {}).key
  const cellsState = () => read(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).map((c) => ({ r: c.row, c: c.col, given: c.given, value: c.value, colours: [...(c.colours || [])] })))
  // How many cells hold a color other than their digit's group color: a given or an entered digit takes its group's key, an empty cell none.
  const wrongCount = async (groups) => (await cellsState()).filter((x) => {
    const digit = String(x.given || x.value || '')
    return JSON.stringify(x.colours) !== JSON.stringify(digit === '' ? [] : [keyOf(groups, digit)])
  }).length
  // One press of a digit key on the cell at row r, column c (a given ignores it).
  const enter = async (r, c, key) => {
    await select(r, c)
    await p.keyboard.press(key)
  }
  // Undoes until the cell at column `col` of the row holds no digit. SudokuPad keeps a digit and its color as separate steps, so it takes a few.
  const undoUntilGone = async (col) => {
    for (let i = 0; i < 6 && (await valuesInRow())[col] !== ''; i++) {
      await undo()
      await settle(async () => (await valuesInRow())[col], '', 1000)
    }
  }
  const valuesInRow = () => read((row) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => String(Framework.app.grid.getCell(row, c).value || '')), ROW)

  // Every attack gets its own page with the profiles Odd/Even and Low/5/High saved, in Cell mode, and ends with the crash signals clean.
  beforeEach(async () => {
    ;({ context, p, errors } = await openSession(browser, script, { seed: captureConsoleErrors }))
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

  const pressUntil = async (want) => {
    for (let i = 0; i < MODE_CYCLE.length && (await label()) !== want; i++) await pressTo(p, MODE_CYCLE[(MODE_CYCLE.indexOf(await label()) + 1) % MODE_CYCLE.length])
  }

  it('attack 42: cycle the mode button through Cell, Digit, Both and Off, ten clicks in a second', async () => {
    await enter(ROW, 0, '3')
    await enter(ROW, 1, '4')
    const start = MODE_CYCLE.indexOf(await label())
    const { x, y } = await buttonPoint(p)
    const began = Date.now()
    for (let i = 0; i < 10; i++) await p.mouse.click(x, y)
    const took = Date.now() - began
    const want = MODE_CYCLE[(start + 10) % MODE_CYCLE.length]
    assert.equal(await settle(label, want), want, `ten presses from ${MODE_CYCLE[start]} land on ${want} (the clicks took ${took} ms)`)
    // The board agrees with the button: Cell and Both color the cells, Digit and Off leave them bare.
    if (want === 'Cell' || want === 'Both') assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, 'every digit has its group color')
    else assert.equal(await settle(coloredCount, 0), 0, 'no cell colored')
  })

  it('attack 43: enter digits, change the mode, then undo across the mode change', async () => {
    await enter(ROW, 0, '3')
    await enter(ROW, 1, '4')
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0)
    const colored = await coloredCount()
    assert.equal(colored > 0, true, 'Cell colors the board')
    await pressTo(p, 'Digit')
    assert.equal(await settle(coloredCount, 0), 0, 'Digit takes the cell colors off')
    await undo()
    assert.equal(await settle(label, 'Cell'), 'Cell', 'one undo undoes the mode change')
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, 'the cell colors are back, digits included')
    assert.deepEqual((await valuesInRow()).slice(0, 2), ['3', '4'], 'both digits are still there')
    // SudokuPad keeps a digit and its color as separate steps, so a few more undos take the last digit.
    await undoUntilGone(1)
    assert.deepEqual((await valuesInRow()).slice(0, 2), ['3', ''], 'undo takes the last digit and not the first')
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, 'the other cells keep their colors')
    await undoUntilGone(0)
    assert.deepEqual((await valuesInRow()).slice(0, 2), ['', ''])
    for (let i = 0; i < 6 && (await label()) !== 'Digit'; i++) {
      await redo()
      await settle(label, 'Digit', 500)
    }
    assert.equal(await label(), 'Digit', 'redo reaches the mode change again')
    assert.deepEqual((await valuesInRow()).slice(0, 2), ['3', '4'])
    assert.equal(await settle(coloredCount, 0), 0, 'Digit leaves the cells bare')
  })

  it('attack 44: enter, delete and overwrite digits across a whole row in a second', async () => {
    const empties = [0, 1, 2, 3, 5, 6] // the row's cells that are not givens: 000080079
    const pass = async (keys) => {
      for (let c = 0; c < 9; c++) if (keys[c]) await enter(ROW, c, keys[c])
    }
    const began = Date.now()
    await pass('123456789')
    await pass('987654321')
    // Delete clears a given's color too (SudokuPad's own Delete), so the delete pass leaves the givens alone.
    await pass([...Array(9)].map((_, c) => (empties.includes(c) ? 'Backspace' : '')))
    assert.deepEqual(await settle(valuesInRow, Array(9).fill('')), Array(9).fill(''), 'the delete pass emptied every cell that is not a given')
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, 'and left no color on them')
    await pass('246813579')
    const took = Date.now() - began
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, `every digit has its group color (the four passes took ${took} ms)`)
    const values = await valuesInRow()
    assert.deepEqual(empties.map((c) => values[c]), empties.map((c) => '246813579'[c]), 'the last pass is what the row holds')
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
    // One undo takes the whole switch back, colors only: the digits stay, the board shows the old profile's colors and the picked profile stays active
    // (color-by-digit-profiles.live.mjs: "the undo left the profile switched").
    await undo()
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, 'the undo brings the old profile\'s colors back')
    assert.deepEqual((await valuesInRow()).slice(0, 2), ['3', '4'], 'and takes no digit')
    assert.equal((await getState()).profiles[(await getState()).active].name, 'Low/5/High', 'the pick is not undone')
    await undoUntilGone(1)
    assert.deepEqual((await valuesInRow()).slice(0, 2), ['3', ''], 'undo takes the last digit and not the first')
    assert.equal(await settle(() => wrongCount(ODD_EVEN), 0), 0, 'the other cells keep their colors')
  })

  // Real key presses into the name field: SudokuPad listens for keys on the page, and a digit or letter must reach the field.
  const typeName = async (text) => {
    await p.locator(NAME_FIELD).press('Control+a')
    if (text === '') await p.locator(NAME_FIELD).press('Backspace')
    else await p.locator(NAME_FIELD).pressSequentially(text)
  }
  const dragRow = async (from, to) => {
    await p.locator(ROWS).first().scrollIntoViewIfNeeded()
    const start = await center(p.locator(`${ROWS} [data-role=handle]`).nth(from))
    const end = await center(p.locator(ROWS).nth(to))
    end.y += to > from ? DROP_PAST_MIDDLE_PX : -DROP_PAST_MIDDLE_PX
    await p.mouse.move(start.x, start.y)
    await p.mouse.down()
    await p.mouse.move(start.x, (start.y + end.y) / 2, { steps: 4 })
    await p.mouse.move(start.x, end.y, { steps: 4 })
    await p.mouse.up()
  }
  const deleteRow = async (n) => {
    await p.hover(`${ROWS}:nth-child(${n})`, ROW_CORNER)
    await p.click(`${ROWS}:nth-child(${n}) button[data-act=delete]`)
  }

  it('attack 46: in the editor add, rename, copy, move and delete profiles up to six and past it', async () => {
    await openEditor()
    assert.deepEqual(await rowNames(), ['Odd/Even', 'Low/5/High'])
    // Rename: an emptied name keeps the old one; a long name is cut to the limit; quotes, a bracket and an ampersand stay text.
    await p.click(`${ROWS}:nth-child(1)`, ROW_CORNER)
    await typeName('')
    assert.deepEqual(await rowNames(), ['Odd/Even', 'Low/5/High'], 'an emptied name keeps the old one')
    const tricky = 'Say "hi" <b>x</b> & \'y\''
    await typeName(tricky)
    assert.deepEqual(await rowNames(), [tricky, 'Low/5/High'], 'quotes and < stay text in the row')
    assert.equal(await editor().locator('b').count(), 0, 'the < made no element')
    await typeName('X'.repeat(60))
    assert.deepEqual(await rowNames(), ['X'.repeat(MAX_NAME_LENGTH), 'Low/5/High'], 'a very long name is cut to the limit')
    // Copy: + New profile copies the selected profile; the name stays within the limit.
    await p.click(NEW_PROFILE)
    assert.equal((await rowNames())[2].length <= MAX_NAME_LENGTH, true, 'the copy\'s name is within the limit')
    assert.equal((await rowNames()).length, 3)
    // Up to six, and past it.
    while ((await rowNames()).length < MAX_PROFILES) await p.click(NEW_PROFILE)
    assert.match(await heading(), /6 of 6/)
    assert.equal(await p.locator(NEW_PROFILE).isDisabled(), true, '+ New profile is off at six')
    await p.locator(NEW_PROFILE).click({ force: true })
    assert.equal((await rowNames()).length, MAX_PROFILES, 'a click past six adds nothing')
    // Move: the last row up to the first, then the first down to the end.
    const names = await rowNames()
    await dragRow(5, 0)
    assert.deepEqual(await settle(rowNames, [names[5], ...names.slice(0, 5)]), [names[5], ...names.slice(0, 5)], 'the last row moved to the top')
    await dragRow(0, 5)
    assert.deepEqual(await settle(rowNames, names), names, 'and back to the end')
    // Save, then delete down to one profile: the last one cannot go.
    await closeEditor('Save')
    assert.deepEqual((await getState()).profiles.map((x) => x.name), names)
    await openEditor()
    for (let left = MAX_PROFILES; left > 1; left--) {
      await deleteRow(1)
      assert.equal(await settle(async () => (await rowNames()).length, left - 1), left - 1, 'a delete removes one row')
    }
    assert.equal(await p.locator(`${ROWS} button[data-act=delete]`).first().isDisabled(), true, 'the last profile cannot be deleted')
    await closeEditor('Save')
    assert.equal((await getState()).profiles.length, 1)
    await gotoPuzzle(p)
    await startInjected(p, script)
    assert.equal((await getState()).profiles.length, 1, 'a reload keeps the one profile')
    assert.equal(await settle(label, 'Cell'), 'Cell')
  })

  it('attack 47: with the editor open, restart the puzzle; with it open, reload', async () => {
    await enter(ROW, 0, '3')
    await openEditor()
    await p.click(NEW_PROFILE)
    await restartPuzzle(p)
    assert.equal(await editor().count(), 1, 'the editor stays open through a restart')
    assert.deepEqual((await valuesInRow()).slice(0, 2), ['', ''], 'the restart emptied the board')
    assert.deepEqual(await rowNames(), ['Odd/Even', 'Low/5/High', 'Odd/Even copy'], 'the draft is as it was')
    await closeEditor('Cancel')
    assert.deepEqual((await getState()).profiles.map((x) => x.name), SEED.profiles.map((x) => x.name), 'Cancel after the restart saves nothing')
    await openEditor()
    await p.click(NEW_PROFILE)
    await gotoPuzzle(p)
    await startInjected(p, script)
    assert.equal(await editor().count(), 0, 'a reload closes the editor')
    assert.equal(await label(), 'Cell')
    assert.deepEqual((await getState()).profiles.map((x) => x.name), SEED.profiles.map((x) => x.name), 'the draft was never saved')
    await openEditor()
    assert.deepEqual(await rowNames(), SEED.profiles.map((x) => x.name), 'the saved profiles open as they were')
    await closeEditor('Cancel')
  })

  it('attack 48: paint every digit to one color, then to none', async () => {
    const painted = () => p.$$eval(`${EDITOR} button[data-act=digit]`, (es) => Object.fromEntries(es.map((e) => [e.dataset.digit, e.dataset.key])))
    await enter(ROW, 0, '3')
    await enter(ROW, 1, '4')
    await openEditor()
    const swatch = editor().locator('button[data-role=swatch]:not([data-empty])').nth(4)
    const key = await swatch.getAttribute('data-key')
    await swatch.click()
    for (let digit = 0; digit <= 9; digit++) await p.locator(`${EDITOR} button[data-act=digit][data-digit="${digit}"]`).click()
    assert.deepEqual(Object.values(await painted()), Array(10).fill(key), 'every digit key shows the one color')
    await closeEditor('Save')
    assert.deepEqual((await getState()).profiles[(await getState()).active].groups.map((x) => x.key), [key], 'one group of that color')
    assert.equal(await settle(() => wrongCount([group(key, '0123456789'.split(''))]), 0), 0, 'the board shows the one color on every digit')
    assert.equal(await coloredCount() > 0, true)
    await openEditor()
    await editor().locator('button[data-act=clear]').click()
    assert.deepEqual(Object.values(await painted()), Array(10).fill(''), 'Clear all leaves every digit with no color')
    await closeEditor('Save')
    assert.equal(await settle(coloredCount, 0), 0, 'with no digit colored the board shows none')
    assert.equal(await editor().count(), 0)
    // The button still answers: a press steps the mode and the board follows.
    await pressUntil('Off')
    await pressUntil('Cell')
    assert.equal(await coloredCount(), 0, 'Cell with no colors still colors nothing')
  })
})
