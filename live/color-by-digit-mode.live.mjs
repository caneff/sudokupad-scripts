// Live check of Color by Digit's mode (Cell, Digit, Both and Off) and its cell coloring on sudokupad.app, in headless Chromium.
// The digit shades of Digit and Both are color-by-digit-digits.live.mjs's.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { AUTO_KEY, AUTO_STORAGE_KEY, BUTTON, EDITOR, GIVENS, LOW_FIVE_HIGH, MODE_KEY, openSession, PROFILES_KEY, SEED, savedProfiles, startInjected, watch } from './color-by-digit-fixtures.mjs'
import { gotoPuzzle, MODES } from './page.mjs'
import { closeDialogWith, openScriptDialog } from './settings.mjs'
import { settle, SETTLE_MS } from './settle.mjs'

/* global Replay */

const script = readFileSync(new URL('../color-by-digit.user.js', import.meta.url), 'utf8')

const GIVEN_COUNT = [...GIVENS].filter((d) => d !== '0').length

const LABEL = `${BUTTON} [data-role="mode"]`
const ARROW = `${BUTTON} [data-role="menu"]`
const MENU = '#color-by-digit-menu'
const HOLD_MS = 500
// SudokuPad's color 3 is in no group of Odd/Even, whose keys are 1 and 2.
const NO_GROUP_KEY = '3'

const givensColoredOn = (p) => p.evaluate(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).filter((c) => c.given && (c.colours || []).length).length)
const coloredCountOn = (p) => p.evaluate(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).filter((c) => (c.colours || []).length).length)
const labelOn = (p) => p.locator(LABEL).textContent()

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('the mode, saved Off, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const cellsState = () => read(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).map((c) => ({
    r: c.row, c: c.col, given: c.given, value: c.value, colours: [...(c.colours || [])]
  })))
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
  const getGroups = () => read((key) => { const d = Framework.getData(key); return d.profiles[d.active].groups }, PROFILES_KEY)
  const chooseProfile = (index) => p.click(`${EDITOR} [data-act=activate][data-index="${index}"]`)
  const label = () => labelOn(p)
  const labelLook = () => p.locator(LABEL).evaluate((e) => `${window.getComputedStyle(e).color} ${window.getComputedStyle(e).fontWeight}`)
  const modeChoice = (mode) => p.locator(`${EDITOR} input[data-role="mode-draft"][value="${mode}"]`)
  const select = (r, c) => read(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [r, c])
  const paint = (r, c, key) => read(([r, c, key]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)); a.act({ type: 'colour', arg: key }); a.deselect() }, [r, c, key])
  const undo = () => p.click('#control-undo')
  const redo = () => p.click('#control-redo')
  const openEditor = () => openScriptDialog(p, 'Color by Digit', EDITOR)
  // A short press on the button, away from the arrow box.
  const pressButton = async () => {
    const box = await p.locator(BUTTON).boundingBox()
    await p.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6)
  }
  const pressTo = async (want) => {
    await pressButton()
    assert.equal(await settle(label, want), want)
  }

  before(async () => {
    ({ context, p, errors } = await openSession(browser, script))
    await read(() => Framework.setSetting('multicolour', true))
  })
  after(async () => { await context.close() })

  it('the button shows OFF in grey, and has no AUTO box', async () => {
    assert.equal(await label(), 'OFF')
    assert.equal(await labelLook(), 'rgb(179, 172, 191) 400')
    assert.equal(await p.locator(`${BUTTON} [data-role="auto"]`).count(), 0)
    assert.equal(/AUTO/.test(await p.locator(BUTTON).textContent()), false)
  })

  it('setup: two entered digits land in Off and color nothing; the replay is kept', async () => {
    await select(0, 2); await p.keyboard.press('4')
    await select(0, 3); await p.keyboard.press('7')
    const typed = await settle(async () => [await valueAt(0, 2), await valueAt(0, 3)], ['4', '7'])
    assert.deepEqual(typed, ['4', '7'])
    assert.equal(await coloredCount(), 0)
    await read(() => { window.__replay = Framework.app.getReplay() })
  })

  it('a press steps to Cell in bold purple, saves it, and colors the givens, the entered digits and centre marks', async () => {
    await select(8, 5); await p.click('#control-centre'); await p.keyboard.press('1'); await p.keyboard.press('3'); await p.click('#control-normal')
    assert.equal(await settle(() => marks(8, 5), '13'), '13')
    assert.equal(await coloredCount(), 0)
    await pressTo('CELL')
    assert.equal(await labelLook(), 'rgb(106, 27, 154) 700')
    assert.equal(await settle(getMode, 'cell'), 'cell')
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

  it('a press steps to Digit in bold purple and takes every group color off every cell in one undo step; a hand-placed color in no group stays', async () => {
    await paint(0, 0, NO_GROUP_KEY) // on a given that holds its group color
    await paint(1, 1, NO_GROUP_KEY) // on an empty cell
    await paint(1, 2, '2') // a group color by hand on an empty cell
    assert.deepEqual(await settle(() => sortedColorsAt(0, 0), ['1', NO_GROUP_KEY]), ['1', NO_GROUP_KEY])
    assert.deepEqual(await settle(() => colorsAt(1, 2), ['2']), ['2'])
    const before = await allColors()
    await pressTo('DIGIT')
    assert.equal(await labelLook(), 'rgb(106, 27, 154) 700')
    assert.equal(await settle(getMode, 'digit'), 'digit')
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
    await select(0, 6); await p.keyboard.press('8')
    assert.equal(await settle(() => valueAt(0, 6), '8'), '8')
    assert.deepEqual(await watch(() => colorsAt(0, 6)), [[]])
    await undo()
    assert.equal(await settle(() => valueAt(0, 6), ''), '')
  })

  it('a press steps to Both in bold purple, which colors cells as Cell does and leaves a group color painted by hand on an empty cell with no marks', async () => {
    await paint(1, 1, '2')
    assert.deepEqual(await settle(() => colorsAt(1, 1), ['2']), ['2'])
    await pressTo('BOTH')
    assert.equal(await labelLook(), 'rgb(106, 27, 154) 700')
    assert.equal(await settle(getMode, 'both'), 'both')
    assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    assert.deepEqual(await watch(() => colorsAt(1, 1)), [['2']])
    await paint(1, 1, '2')
    assert.deepEqual(await settle(() => colorsAt(1, 1), []), [])
  })

  it('in Both a typed digit takes its color in the same undo step', async () => {
    await select(0, 6); await p.keyboard.press('8')
    assert.deepEqual(await settle(async () => [await valueAt(0, 6), await colorsAt(0, 6)], ['8', ['2']]), ['8', ['2']])
    await undo()
    assert.deepEqual(await settle(async () => [await valueAt(0, 6), await colorsAt(0, 6)], ['', []]), ['', []])
  })

  it('a press steps Both to Off in grey and takes every group color off in one undo step', async () => {
    await pressTo('OFF')
    assert.equal(await labelLook(), 'rgb(179, 172, 191) 400')
    assert.equal(await settle(coloredCount, 0), 0)
    await undo()
    assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    await redo()
    assert.equal(await settle(coloredCount, 0), 0)
  })

  it('the keyboard stays with the puzzle right after a press: a digit typed next lands and takes its color', async () => {
    await select(0, 5)
    await pressTo('CELL')
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
    await paint(8, 6, NO_GROUP_KEY)
    assert.deepEqual(await settle(() => sortedColorsAt(8, 6), ['2', NO_GROUP_KEY]), ['2', NO_GROUP_KEY])
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
    await paint(0, 5, '1')
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
    await p.click('#control-restart')
    await p.locator('.dialog button').filter({ hasText: /Restart/ }).filter({ hasNotText: /Keep Time/ }).first().click()
    assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    assert.equal(await valueAt(0, 2), '')
  })

  it('a hold, a right click and the arrow box open the profile menu, and none of them steps the mode', async () => {
    const box = await p.locator(BUTTON).boundingBox()
    const closeMenu = async () => {
      await p.keyboard.press('Escape')
      await p.locator(MENU).waitFor({ state: 'detached' })
    }
    await p.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.6)
    await p.mouse.down()
    // Opens on a timer after HOLD_MS; waits on the menu, not on the clock.
    await p.locator(MENU).waitFor({ state: 'visible', timeout: HOLD_MS + SETTLE_MS })
    await p.mouse.up()
    await closeMenu()
    await p.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6, { button: 'right' })
    await p.locator(MENU).waitFor({ state: 'visible' })
    await closeMenu()
    await p.click(ARROW)
    await p.locator(MENU).waitFor({ state: 'visible' })
    await closeMenu()
    assert.deepEqual(await watch(label), ['CELL'])
    assert.equal(await givensColored(), GIVEN_COUNT)
  })

  it('the dialog\'s mode choice is at the top, under "Use digit colors", offers the four modes, opens on the mode in force, and Cancel leaves the mode as it was', async () => {
    await openEditor()
    const roles = await p.locator(`${EDITOR} input, ${EDITOR} button, ${EDITOR} [data-act]`).evaluateAll((es) => es.slice(0, 2).map((e) => e.dataset.role))
    assert.deepEqual(roles, ['use-digit-colors', 'mode-draft'])
    assert.deepEqual(await p.locator(`${EDITOR} input[data-role="mode-draft"]`).evaluateAll((es) => es.map((e) => e.value)), ['cell', 'digit', 'both', 'off'])
    assert.equal(await modeChoice('cell').isChecked(), true)
    await modeChoice('off').check()
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.equal(await label(), 'CELL')
    assert.equal(await getMode(), 'cell')
  })

  it('Save with Off chosen steps to Off as a press would: every group color comes off, in one undo step', async () => {
    await openEditor()
    await modeChoice('off').check()
    await closeDialogWith(p, 'Save', EDITOR)
    assert.equal(await settle(label, 'OFF'), 'OFF')
    assert.equal(await getMode(), 'off')
    assert.equal(await settle(coloredCount, 0), 0)
    await undo()
    assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    await redo()
    assert.equal(await settle(coloredCount, 0), 0)
  })

  it('in Off, Save with changed groups colors nothing', async () => {
    await openEditor()
    await chooseProfile(1)
    await closeDialogWith(p, 'Save', EDITOR)
    assert.deepEqual(await settle(getGroups, LOW_FIVE_HIGH), LOW_FIVE_HIGH)
    assert.deepEqual(await watch(coloredCount), [0])
  })

  it('Save with Cell chosen steps to Cell and colors the givens', async () => {
    await openEditor()
    await modeChoice('cell').check()
    await closeDialogWith(p, 'Save', EDITOR)
    assert.equal(await settle(label, 'CELL'), 'CELL')
    assert.equal(await settle(getMode, 'cell'), 'cell')
    // Every given is colored, and r1c1 holds 5, which is key 5 in Low/5/High.
    assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    assert.deepEqual(await colorsAt(0, 0), ['5'])
  })

  it('in Cell, Save with changed groups recolors every cell in one undo step', async () => {
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

  it('one Save that enters Cell and changes the groups recolors every pure cell, not only the givens', async () => {
    await pressTo('DIGIT')
    await select(0, 6); await p.keyboard.press('8')
    assert.equal(await settle(() => valueAt(0, 6), '8'), '8')
    assert.deepEqual(await watch(() => colorsAt(0, 6)), [[]])
    await openEditor()
    await chooseProfile(1)
    await modeChoice('cell').check()
    await closeDialogWith(p, 'Save', EDITOR)
    assert.equal(await settle(label, 'CELL'), 'CELL')
    assert.deepEqual(await settle(() => colorsAt(0, 6), ['9']), ['9'])
  })

  it('one Save that leaves Cell and changes the groups takes the old groups\' colors off too', async () => {
    // Low/5/High is active, with keys 1, 5 and 9 on the board; Odd/Even has only 1 and 2.
    assert.deepEqual(await colorsAt(0, 0), ['5'])
    await openEditor()
    await chooseProfile(0)
    await modeChoice('off').check()
    await closeDialogWith(p, 'Save', EDITOR)
    assert.equal(await settle(label, 'OFF'), 'OFF')
    assert.equal(await settle(coloredCount, 0), 0)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

// The starting mode with no mode saved: Cell, unless auto mode was saved off.
for (const [what, force, label, colored] of [
  ['nothing saved', {}, 'CELL', GIVEN_COUNT],
  ['auto mode saved off', { [AUTO_STORAGE_KEY]: false }, 'OFF', 0]
]) {
  describe(`the starting mode with ${what}, injected after Start Puzzle`, { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ({ context, p, errors } = await openSession(browser, script, { saved: savedProfiles(SEED), force }))
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
      ({ context, p, errors } = await openSession(browser, script, { saved: savedProfiles(SEED), force: { [AUTO_STORAGE_KEY]: true }, mode }))
    })
    after(async () => { await context.close() })

    it('starts in Cell, and the givens are colored at puzzle start, with no press', async () => {
      assert.equal(await labelOn(p), 'CELL')
      assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })

  describe(`auto mode saved on and no mode saved, with saved progress, injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ({ context, p, errors } = await openSession(browser, script, { saved: { ...savedProfiles(SEED), [AUTO_STORAGE_KEY]: false }, mode }))
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

describe('the mode on a touch screen, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ({ context, p, errors } = await openSession(browser, script, { contextOptions: { hasTouch: true } }))
  })
  after(async () => { await context.close() })

  it('a tap on the button steps to Cell and colors the givens, and a second tap steps to Digit and takes them off', async () => {
    const box = await p.locator(BUTTON).boundingBox()
    const tap = () => p.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height * 0.6)
    await tap()
    assert.equal(await settle(() => labelOn(p), 'CELL'), 'CELL')
    assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
    await tap()
    assert.equal(await settle(() => labelOn(p), 'DIGIT'), 'DIGIT')
    assert.equal(await settle(() => coloredCountOn(p), 0), 0)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})
