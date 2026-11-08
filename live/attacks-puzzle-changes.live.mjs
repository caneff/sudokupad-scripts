// Live attacks 62, 63, 64 and 66 on all six scripts together: the puzzle or the page changes under them, on sudokupad.app in headless Chromium. Each test names its
// attack and asserts the crash signals (no page error, no skip line) beside what a user expects to see. Clicks, drags and keys are real input; the scripts
// load at DOMContentLoaded of every page load, as Tampermonkey runs them. Attack 65, the replay tool, is `live/replay-playback.live.mjs`.
// Under SudokuPad's solved dialog its overlay swallows the mouse and a press on it dismisses the dialog, so the draw, the notes and the script
// dialogs of attack 64 come after the dismissal, and under the dialog the attack is the keyboard and the pen tool's drag.
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { openPage } from './page.mjs'
import { EDITOR as COLOR_BY_DIGIT_EDITOR } from './color-by-digit/color-by-digit-fixtures.mjs'
import { SETTINGS_EDITOR, tool } from './draw-tool/draw-tool-fixtures.mjs'
import { draw, mouseDrag, penEntries } from './pen.mjs'
import { closeDialogWith, EXTRAS_EDITOR, openScriptDialog } from './settings.mjs'
import { boardOf, CLASSIC_GIVENS, CLASSIC_SOLUTION, clickCell, dialogAtRest, dialogWith, installAll, OVERLAY_DRAG, openPuzzleId, placeNote, puzzleData, puzzleIdFor, resumeAfterHistory, useTool } from './puzzles.mjs'
import { readUntil, settle } from './settle.mjs'

const CONGRATS = 'Congrats'
const PAUSED = 'Game paused'
const OK = /^\s*OK\s*$/
const SCRIPT_DIALOGS = [['Pen Tool Extras', EXTRAS_EDITOR], ['Color by Digit', COLOR_BY_DIGIT_EDITOR], ['Text Anywhere', SETTINGS_EDITOR], ['Dark Page', '.dialog input[type=color]'], ['Rules Resizer', '#auto-rules-resizer-max-width']]
// The cell the color tool colors in puzzle A, and its key.
const COLORED = [4, 4]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('attacks on the puzzle changing under every script', { concurrency: false }, () => {
  let context, p, errors, idA, idB

  beforeEach(async () => {
    ;({ context, p, errors } = await openPage(browser, { seed: installAll }))
    idA = await puzzleIdFor(p, puzzleData({ id: 'live-attack-a', metadata: { title: 'puzzle A' }, givens: CLASSIC_GIVENS }))
    idB = await puzzleIdFor(p, puzzleData({ id: 'live-attack-b', metadata: { title: 'puzzle B' }, givens: [[0, 0, 1], [8, 8, 9]] }))
    await openPuzzleId(p, idA)
  })
  afterEach(async () => {
    try {
      assert.deepEqual(errors, [], 'no page error or skip line')
    } finally {
      await context?.close()
    }
  })

  // Marks of every kind in puzzle A: a digit, a corner mark, a color, a pen line and a Text Anywhere note. Returns the board once each shows.
  const markA = async () => {
    await useTool(p, '#control-normal')
    await clickCell(p, 0, 2)
    await p.keyboard.press('4')
    await useTool(p, '#control-corner')
    await clickCell(p, 2, 0)
    await p.keyboard.press('1')
    await useTool(p, '#control-colour')
    await clickCell(p, ...COLORED)
    await p.keyboard.press('3')
    await draw(p, 6)
    await placeNote(p, '15')
    await useTool(p, '#control-normal')
    return readUntil(() => boardOf(p), (b) => b.notes.length === 1 && b.pen.length > 0 && b.entered.length === 1 && b.corner.length === 1 && b.colours.some((c) => c.startsWith(`${COLORED}:`)))
  }

  it('attack 62: puzzle A, then puzzle B in the same tab: none of A\'s marks show in B, and A\'s come back on returning', async () => {
    const a = await markA()
    assert.deepEqual(a.entered, ['0,2:4'])
    await openPuzzleId(p, idB)
    const b = await boardOf(p)
    assert.notEqual(b.id, a.id)
    assert.deepEqual([b.entered, b.corner, b.centre, b.pen, b.notes], [[], [], [], [], []], 'B holds nothing of A')
    assert.equal(b.colours.every((c) => !c.startsWith(`${COLORED}:`)), true, `A's color is not on B: ${b.colours}`)
    await openPuzzleId(p, idA)
    const back = await readUntil(() => boardOf(p), (x) => x.notes.length === 1)
    assert.deepEqual(back, a, 'A\'s marks came back')
    assert.deepEqual(await penEntries(p), a.pen)
  })

  it('attack 63: browser Back and Forward between two puzzles: each shows its own marks every time', async () => {
    const a = await markA()
    await openPuzzleId(p, idB)
    await useTool(p, '#control-normal')
    await clickCell(p, 4, 4)
    await p.keyboard.press('7')
    const b = await readUntil(() => boardOf(p), (x) => x.entered.length === 1)
    assert.deepEqual([b.pen, b.notes, b.corner], [[], [], []], 'B starts with none of A\'s marks')
    for (let round = 1; round <= 2; round++) {
      await p.goBack({ waitUntil: 'load' })
      await resumeAfterHistory(p)
      assert.deepEqual(await readUntil(() => boardOf(p), (x) => x.notes.length === 1), a, `round ${round}: Back shows A with all its marks`)
      await p.goForward({ waitUntil: 'load' })
      await resumeAfterHistory(p)
      assert.deepEqual(await readUntil(() => boardOf(p), (x) => x.entered.length === 1), b, `round ${round}: Forward shows B with its digit and none of A's marks`)
    }
  })

  // Opens each script's dialog from SudokuPad's settings and closes it with Cancel.
  const openEachScriptDialog = async () => {
    for (const [name, editor] of SCRIPT_DIALOGS) {
      await openScriptDialog(p, name, editor)
      await closeDialogWith(p, 'Cancel', editor)
    }
  }
  // Enters the classic puzzle's solution with a click on each empty cell and its digit, and returns when SudokuPad shows its solved dialog at rest.
  const solve = async () => {
    await useTool(p, '#control-normal')
    for (let i = 0; i < 81; i++) {
      const [r, c] = [Math.floor(i / 9), i % 9]
      if (CLASSIC_GIVENS.some(([gr, gc]) => gr === r && gc === c)) continue
      await clickCell(p, r, c)
      await p.keyboard.press(CLASSIC_SOLUTION[i])
    }
    await dialogWith(p, CONGRATS).waitFor({ state: 'visible' })
    await dialogAtRest(p)
  }
  const insideDialog = () => p.locator('.dialog').boundingBox().then((b) => [b.x + b.width / 2, b.y + b.height / 2])

  it('attack 64: solve the puzzle, then try keys and a pen drag under the solved dialog, and draw, place a note, open each script\'s dialog and solve again after it', async () => {
    await solve()
    const solved = await boardOf(p)
    assert.equal(solved.entered.length, 81 - CLASSIC_GIVENS.length, 'the solution is in')
    // The last cell is still selected: a digit key that got through would change it.
    await p.keyboard.press('c')
    await p.keyboard.type('15')
    await p.mouse.click(...await insideDialog())
    assert.equal(await dialogWith(p, CONGRATS).isVisible(), true, 'the solved dialog is still up')
    assert.deepEqual(await boardOf(p), solved, 'no digit, mark, pen line or note changed under the dialog')
    assert.equal(await tool(p), 'normal', 'no tool was picked under the dialog')
    // With the pen tool current, a drag from the overlay dismisses the dialog and draws nothing.
    await p.evaluate(() => Framework.app.changeTool('pen'))
    assert.equal(await tool(p), 'pen')
    await mouseDrag(p, OVERLAY_DRAG)
    await p.locator('.dialog').waitFor({ state: 'detached' })
    assert.deepEqual(await penEntries(p), [], 'the drag that dismissed the dialog drew no pen line')
    assert.deepEqual(await boardOf(p), solved, 'and changed nothing else')
    // After it every script's tool and dialog work, and the digits stay the solution.
    await draw(p, 6)
    await placeNote(p, '15')
    await openEachScriptDialog()
    const marked = await readUntil(() => boardOf(p), (x) => x.notes.length === 1 && x.pen.length > 0)
    assert.deepEqual(marked.entered, solved.entered, 'the digits are still the solution')
    // Taking one digit out and putting it back solves the puzzle again with the marks on the board.
    await useTool(p, '#control-normal')
    await clickCell(p, 0, 2)
    await p.keyboard.press('Backspace')
    await p.keyboard.press('4')
    await dialogWith(p, CONGRATS).waitFor({ state: 'visible' })
    await dialogWith(p, CONGRATS).locator('button', { hasText: OK }).click()
    await p.locator('.dialog').waitFor({ state: 'detached' })
    const again = await boardOf(p)
    assert.deepEqual([again.pen, again.notes], [marked.pen, marked.notes], 'the marks survived the second solve')
  })

  // True when every grid layer is blurred, which is how SudokuPad hides the grid while the game is paused.
  const gridBlurred = () => p.evaluate(() => ['#cell-values', '#cell-givens', '#cell-pen', '#cell-grids'].every((s) => /blur/.test(window.getComputedStyle(document.querySelector(s)).filter)))

  it('attack 66: pause the timer, then try keys and a pen drag under the pause dialog, draw, place notes and color while it stays paused, and resume', async () => {
    const running = () => p.evaluate(() => Framework.app.timer.running)
    const pause = async () => {
      await p.click('.timer-control')
      await dialogWith(p, PAUSED).waitFor({ state: 'visible' })
      await dialogAtRest(p)
      assert.equal(await running(), false, 'the timer is paused')
    }
    assert.equal(await running(), true)
    assert.equal(await gridBlurred(), false, 'the grid shows while the timer runs')
    // A cell is selected, so a digit key that got through would change it.
    await useTool(p, '#control-normal')
    await clickCell(p, 4, 4)
    await pause()
    assert.equal(await gridBlurred(), true, 'the grid is hidden while paused')
    const paused = await boardOf(p)
    await p.keyboard.type('5')
    await p.mouse.click(...await insideDialog())
    assert.deepEqual(await boardOf(p), paused, 'a digit key and a click changed nothing under the pause dialog')
    // With the pen tool current a drag from the overlay draws nothing.
    await p.evaluate(() => Framework.app.changeTool('pen'))
    await mouseDrag(p, OVERLAY_DRAG)
    assert.deepEqual(await penEntries(p), [], 'the drag drew no pen line under the dialog')
    assert.equal(await dialogWith(p, PAUSED).isVisible(), true, 'the pause dialog is still up')
    // Stay Paused: the grid shows again, the board takes input, and the timer stays stopped.
    await dialogWith(p, PAUSED).locator('button', { hasText: 'Stay Paused' }).click()
    await p.locator('.dialog').waitFor({ state: 'detached' })
    assert.equal(await settle(gridBlurred, false), false, 'the grid shows after Stay Paused')
    const marks = await markA()
    assert.equal(await running(), false, 'still paused after the marks')
    // The timer button resumes it, and the marks stay.
    await p.click('.timer-control')
    assert.equal(await settle(running, true), true, 'the timer runs again')
    assert.deepEqual(await boardOf(p), marks, 'the marks are still there after resuming')
    // Pause again, drag from the overlay and press Resume: the drag draws nothing and the timer runs.
    await pause()
    await p.evaluate(() => Framework.app.changeTool('pen'))
    await mouseDrag(p, OVERLAY_DRAG)
    assert.deepEqual(await boardOf(p), marks, 'a drag on the overlay marked nothing')
    await dialogWith(p, PAUSED).locator('button', { hasText: 'Resume' }).click()
    await p.locator('.dialog').waitFor({ state: 'detached' })
    assert.equal(await settle(running, true), true, 'Resume runs the timer')
    assert.deepEqual(await boardOf(p), marks, 'the marks are still there')
  })
})
