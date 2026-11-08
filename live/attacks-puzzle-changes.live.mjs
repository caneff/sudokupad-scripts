// Live attacks 62, 63, 64 and 66 on all six scripts together: the puzzle or the page changes under them, on sudokupad.app in headless Chromium. Each test names its
// attack and asserts the crash signals (no page error, no skip line) beside what a user expects to see. Clicks, drags and keys are real input; the scripts
// load at DOMContentLoaded of every page load, as Tampermonkey runs them. Attack 65, the replay tool, is `live/replay-playback.live.mjs`.
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { openPage } from './page.mjs'
import { EDITOR as COLOR_BY_DIGIT_EDITOR } from './color-by-digit/color-by-digit-fixtures.mjs'
import { DRAW_BUTTON, SETTINGS_EDITOR, TEXT_BOX, tool } from './draw-tool/draw-tool-fixtures.mjs'
import { cellCentre, draw, gridPoint, mouseDrag, penEntries } from './pen.mjs'
import { closeDialogWith, EXTRAS_EDITOR, openScriptDialog } from './settings.mjs'
import { boardOf, CLASSIC_GIVENS, CLASSIC_SOLUTION, dialogAtRest, installAll, openPuzzleId, puzzleData, puzzleIdFor, resumeAfterHistory } from './puzzles.mjs'
import { clickUntil, readUntil, settle, SETTLE_MS } from './settle.mjs'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('attacks on the puzzle changing under every script', { concurrency: false }, () => {
  let context, p, errors, idA, idB

  beforeEach(async () => {
    ;({ context, p, errors } = await openPage(browser, { seed: installAll }))
    idA = await puzzleIdFor(p, puzzleData({ id: 'live-attack-a', title: 'puzzle A', givens: CLASSIC_GIVENS }))
    idB = await puzzleIdFor(p, puzzleData({ id: 'live-attack-b', title: 'puzzle B', givens: [[0, 0, 1], [8, 8, 9]] }))
    await openPuzzleId(p, idA)
  })
  afterEach(async () => {
    try {
      assert.deepEqual(errors, [], 'no page error or skip line')
    } finally {
      await context?.close()
    }
  })

  const clickCell = async (row, col) => { const [x, y] = await cellCentre(p, row, col); await p.mouse.click(x, y) }
  const useTool = async (button) => {
    assert.equal(await clickUntil(() => p.click(button), () => tool(p), button.replace('#control-', ''), SETTLE_MS), button.replace('#control-', ''))
  }
  // Marks of every kind in puzzle A: a digit, a corner mark, a color, a pen line and a Text Anywhere note.
  const markA = async () => {
    await useTool('#control-normal')
    await clickCell(0, 2)
    await p.keyboard.press('4')
    await useTool('#control-corner')
    await clickCell(2, 0)
    await p.keyboard.press('1')
    await useTool('#control-colour')
    await clickCell(4, 4)
    await p.keyboard.press('3')
    await draw(p, 6)
    await useTool(DRAW_BUTTON)
    await p.mouse.click(...await gridPoint(p, [8.2, 2.25]))
    await p.locator(TEXT_BOX).waitFor({ state: 'attached' })
    await p.keyboard.type('15')
    await p.keyboard.press('Escape')
    await useTool('#control-normal')
    return readUntil(() => boardOf(p), (b) => b.notes.length === 1 && b.pen.length > 0 && b.entered.length === 1)
  }

  it('attack 62: puzzle A, then puzzle B in the same tab: none of A\'s marks show in B, and A\'s come back on returning', async () => {
    const a = await markA()
    assert.deepEqual(a.entered, ['0,2:4'])
    await openPuzzleId(p, idB)
    const b = await boardOf(p)
    assert.notEqual(b.id, a.id)
    assert.deepEqual([b.entered, b.corner, b.pen, b.notes], [[], [], [], []], 'B holds nothing of A')
    assert.equal(b.colours.every((c) => !c.startsWith('4,4:')), true, `A's color is not on B: ${b.colours}`)
    await openPuzzleId(p, idA)
    const back = await readUntil(() => boardOf(p), (x) => x.notes.length === 1)
    assert.deepEqual([back.entered, back.corner, back.pen, back.notes], [a.entered, a.corner, a.pen, a.notes], 'A\'s marks came back')
    assert.deepEqual(back.colours, a.colours, 'A\'s colors came back')
    assert.deepEqual(await penEntries(p), a.pen)
  })

  it('attack 63: browser Back and Forward between two puzzles: each shows its own marks every time', async () => {
    const a = await markA()
    await openPuzzleId(p, idB)
    await useTool('#control-normal')
    await clickCell(4, 4)
    await p.keyboard.press('7')
    const b = await readUntil(() => boardOf(p), (x) => x.entered.length === 1)
    for (let round = 1; round <= 2; round++) {
      await p.goBack({ waitUntil: 'load' })
      await resumeAfterHistory(p)
      const backA = await readUntil(() => boardOf(p), (x) => x.notes.length === 1)
      assert.deepEqual(backA, a, `round ${round}: Back shows A with all its marks`)
      await p.goForward({ waitUntil: 'load' })
      await resumeAfterHistory(p)
      const forwardB = await readUntil(() => boardOf(p), (x) => x.entered.length === 1)
      assert.deepEqual(forwardB, b, `round ${round}: Forward shows B with its digit and none of A's marks`)
    }
  })

  const scriptDialogs = [['Pen Tool Extras', EXTRAS_EDITOR], ['Color by Digit', COLOR_BY_DIGIT_EDITOR], ['Text Anywhere', SETTINGS_EDITOR], ['Dark Page', '.dialog input[type=color]']]
  // Opens each script's dialog from SudokuPad's settings and closes it with Cancel.
  const openEachScriptDialog = async () => {
    for (const [name, editor] of scriptDialogs) {
      await openScriptDialog(p, name, editor)
      await closeDialogWith(p, 'Cancel', editor)
    }
  }
  // Enters the classic puzzle's solution with the keyboard, a click on each empty cell and its digit, and returns when SudokuPad shows its solved dialog.
  const solve = async () => {
    await useTool('#control-normal')
    for (let i = 0; i < 81; i++) {
      const [r, c] = [Math.floor(i / 9), i % 9]
      if (CLASSIC_GIVENS.some(([gr, gc]) => gr === r && gc === c)) continue
      await clickCell(r, c)
      await p.keyboard.press(CLASSIC_SOLUTION[i])
    }
    await p.locator('.dialog', { hasText: 'Congrats' }).waitFor({ state: 'visible' })
    await dialogAtRest(p)
  }

  // A page point inside the open dialog.
  const insideDialog = () => p.locator('.dialog').boundingBox().then((b) => [b.x + b.width / 2, b.y + b.height / 2])

  it('attack 64: solve the puzzle, then press keys under the solved dialog, dismiss it with a drag, and draw, place a note, open each script\'s dialog and solve again', async () => {
    await solve()
    const solved = await boardOf(p)
    assert.equal(solved.entered.length, 81 - CLASSIC_GIVENS.length, 'the solution is in')
    // Under the solved dialog the keyboard and a click inside the dialog change nothing.
    await p.keyboard.press('c')
    await p.keyboard.type('15')
    await p.mouse.click(...await insideDialog())
    assert.equal(await p.locator('.dialog', { hasText: 'Congrats' }).isVisible(), true, 'the solved dialog is still up')
    assert.deepEqual(await boardOf(p), solved, 'no digit, mark, pen line or note changed under the dialog')
    assert.equal(await tool(p), 'normal', 'no tool was picked under the dialog')
    // A drag from the overlay dismisses it and marks nothing.
    await mouseDrag(p, [[4.5, 0.6], [4.5, 1.5]])
    await p.locator('.dialog').waitFor({ state: 'detached' })
    assert.deepEqual(await boardOf(p), solved, 'the drag that dismissed the dialog marked nothing')
    // After it every script's tool and dialog work, and the digits stay the solution.
    await draw(p, 6)
    await useTool(DRAW_BUTTON)
    await p.mouse.click(...await gridPoint(p, [8.2, 2.25]))
    await p.locator(TEXT_BOX).waitFor({ state: 'attached' })
    await p.keyboard.type('15')
    await p.keyboard.press('Escape')
    await openEachScriptDialog()
    const marked = await readUntil(() => boardOf(p), (x) => x.notes.length === 1 && x.pen.length > 0)
    assert.deepEqual(marked.entered, solved.entered, 'the digits are still the solution')
    // Taking one digit out and putting it back solves the puzzle again with the marks on the board.
    await useTool('#control-normal')
    await clickCell(0, 2)
    await p.keyboard.press('Backspace')
    await p.keyboard.press('4')
    await p.locator('.dialog', { hasText: 'Congrats' }).waitFor({ state: 'visible' })
    await p.locator('.dialog button', { hasText: /^\s*OK\s*$/ }).click()
    await p.locator('.dialog').waitFor({ state: 'detached' })
    const again = await boardOf(p)
    assert.deepEqual([again.pen, again.notes], [marked.pen, marked.notes], 'the marks survived the second solve')
  })

  it('attack 66: pause the timer, then press keys under the pause dialog, draw, place notes and color while it stays paused, and resume', async () => {
    const running = () => p.evaluate(() => Framework.app.timer.running)
    const pause = async () => {
      await p.click('.timer-control')
      await p.locator('.dialog', { hasText: 'Game paused' }).waitFor({ state: 'visible' })
      await dialogAtRest(p)
      assert.equal(await running(), false, 'the timer is paused')
    }
    assert.equal(await running(), true)
    await pause()
    const paused = await boardOf(p)
    // Under the pause dialog the keyboard and a click inside the dialog change nothing.
    await p.keyboard.press('c')
    await p.keyboard.type('15')
    await p.mouse.click(...await insideDialog())
    assert.deepEqual(await boardOf(p), paused, 'nothing changed under the pause dialog')
    assert.equal(await p.locator('.dialog', { hasText: 'Game paused' }).isVisible(), true, 'the pause dialog is still up')
    // Stay Paused: the board takes input again, and the timer stays stopped.
    await p.locator('.dialog button', { hasText: 'Stay Paused' }).click()
    await p.locator('.dialog').waitFor({ state: 'detached' })
    const marks = await markA()
    assert.equal(await running(), false, 'still paused after the marks')
    // The timer button resumes it, and the marks stay.
    await p.click('.timer-control')
    assert.equal(await settle(running, true), true, 'the timer runs again')
    assert.deepEqual(await boardOf(p), marks, 'the marks are still there after resuming')
    // Pause again, drag from the overlay and press Resume: the drag marks nothing and the timer runs.
    await pause()
    await mouseDrag(p, [[4.5, 0.6], [4.5, 1.5]])
    assert.deepEqual(await boardOf(p), marks, 'a drag on the overlay marked nothing')
    await p.locator('.dialog button', { hasText: 'Resume' }).click()
    await p.locator('.dialog').waitFor({ state: 'detached' })
    assert.equal(await settle(running, true), true, 'Resume runs the timer')
    assert.deepEqual(await boardOf(p), marks, 'the marks are still there')
  })
})
