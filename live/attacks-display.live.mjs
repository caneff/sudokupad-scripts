// Live attacks 76 to 78 (#628, from #590): the page's devicePixelRatio changing, SudokuPad's fullscreen going on and off, and a board with 200
// notes and a grid full of pen lines, with Text Anywhere, Pen Tool Extras and Color by Digit installed together, on sudokupad.app in headless
// Chromium. Each test names its attack and asserts the crash signals (no uncaught error, console error or skip line) beside what a user expects.
// Clicks, drags and keys are real input; the display changes are Chromium's own emulation.
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { assertClean, installScripts, openAttackPage, pickTool } from './attack-fixtures.mjs'
import { cellCentre, gridPoint, mouseDrag, penDrawnCount, penEntries } from './pen.mjs'
import { settle } from './settle.mjs'
import * as draw from './draw-tool/draw-tool-fixtures.mjs'

const FULLSCREEN_BUTTON = 'button[data-control="fullscreen"]'
const WINDOW = { width: 1200, height: 900 }
// What a screen of its own gives a fullscreen page.
const SCREEN = { width: 1600, height: 1000 }
// The most a note's left or top may sit off a whole device pixel: Text Anywhere puts a released note on whole device pixels, and the browser's layout
// rounds to 1/64 of a CSS pixel, up to 0.03 device pixels at a ratio of 2. A note drawn soft sits half a pixel off.
const CRISP_EPSILON = 0.05
// The slowest an action may take on a board with 200 notes and a full grid, from the input to the page showing its result.
const ACTION_BUDGET_MS = 3000
const NOTE_COUNT = 200

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('attacks on the display and scale', { concurrency: false }, () => {
  let context, p, errors
  beforeEach(async () => {
    ;({ context, p, errors } = await openAttackPage(browser))
  })
  afterEach(async () => { await context?.close() })

  const makeNote = async (at, text) => {
    await p.mouse.click(...await gridPoint(p, at))
    await p.keyboard.type(text)
    await draw.finishNote(p)
  }
  // A line along a row from column `from` to column `to`, in cell middles.
  const rowLine = (row, from = 1.5, to = 4.5) => mouseDrag(p, [[row + 0.5, from], [row + 0.5, to]])
  const strokeWidths = () => p.evaluate(() => [...document.querySelectorAll('#cell-pen .cell-pen')].map((g) => window.getComputedStyle(g).strokeWidth))
  // The left and top of the first note in device pixels, as the part past a whole pixel.
  const offGrid = () => p.evaluate((selector) => {
    const box = document.querySelector(selector).getBoundingClientRect()
    return [box.left, box.top].map((side) => Math.abs(side * window.devicePixelRatio - Math.round(side * window.devicePixelRatio)))
  }, draw.TEXTS)
  const emulate = (cdp, deviceScaleFactor, size = WINDOW) => cdp.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor, mobile: false })

  it('attack 76: the page\'s devicePixelRatio changing keeps notes on whole device pixels once moved, and notes and pen lines where they were', async () => {
    const cdp = await context.newCDPSession(p)
    await pickTool(p, 'draw')
    await makeNote([4.5, 4.5], '15')
    await pickTool(p, 'pen')
    await rowLine(1)
    await rowLine(7)
    const entries = await penEntries(p)
    const widths = await strokeWidths()
    assert.equal(widths.length > 0, true, 'the pen lines are drawn')

    for (const ratio of [1.5, 2, 1.25, 1]) {
      await emulate(cdp, ratio)
      assert.equal(await settle(() => p.evaluate(() => window.devicePixelRatio), ratio), ratio, `the page runs at ratio ${ratio}`)
      assert.deepEqual(await penEntries(p), entries, `${ratio}: the pen lines are where they were`)
      assert.deepEqual(await strokeWidths(), widths, `${ratio}: the pen lines keep their width`)
      assert.equal(await penDrawnCount(p), widths.length, `${ratio}: every pen line is still drawn`)
      await pickTool(p, 'draw')
      assert.deepEqual(await draw.noteInCells(p, '15'), [4.5, 4.5], `${ratio}: the note is where it was`)
      // A note moved at this ratio lands on whole device pixels at it, and moves back to its place.
      const [x, y] = await draw.middleAt(p, await gridPoint(p, [4.5, 4.5]))
      for (const [dx, dy] of [[37, 23], [-37, -23]]) {
        await p.mouse.move(x + (dx > 0 ? 0 : dx * -1), y + (dy > 0 ? 0 : dy * -1))
        await p.mouse.down()
        await p.mouse.move(x + dx + (dx > 0 ? 0 : -dx), y + dy + (dy > 0 ? 0 : -dy), { steps: 6 })
        await p.mouse.up()
        await draw.frames(p)
        const off = await offGrid()
        assert.equal(off.every((part) => part < CRISP_EPSILON), true, `${ratio}: the moved note's left and top are on whole device pixels: ${off}`)
      }
      await draw.finishNote(p)
    }
    assertClean(errors, 'the ratio changes')
  })

  it('attack 77: SudokuPad\'s fullscreen on and off leaves the notes, the pen lines and the tools where they were and working', async () => {
    await pickTool(p, 'draw')
    await makeNote([4.5, 4.5], '15')
    await pickTool(p, 'pen')
    await rowLine(1)
    let entries = await penEntries(p)
    const inFullscreen = () => p.evaluate(() => document.fullscreenElement !== null)
    const cdp = await context.newCDPSession(p)

    for (let round = 0; round < 2; round++) {
      await p.click(FULLSCREEN_BUTTON)
      assert.equal(await settle(inFullscreen, true), true, `round ${round}: fullscreen is on`)
      // Chromium's headless fullscreen keeps the window as it is, so the screen's size is emulated.
      await emulate(cdp, 1, SCREEN)
      assert.deepEqual(await penEntries(p), entries, `round ${round}: the pen lines are where they were`)
      await pickTool(p, 'draw')
      assert.deepEqual(await settle(() => draw.noteInCells(p, '15'), [4.5, 4.5]), [4.5, 4.5], `round ${round}: the note is on its cell`)
      await makeNote([6.5 + round, 2.5], `f${round}`)
      await pickTool(p, 'pen')
      await rowLine(3 + 2 * round)
      assert.equal((await penEntries(p)).length, entries.length + 3, `round ${round}: a line can be drawn in fullscreen`)
      entries = await penEntries(p)

      await p.click(FULLSCREEN_BUTTON)
      assert.equal(await settle(inFullscreen, false), false, `round ${round}: fullscreen is off`)
      await emulate(cdp, 1, WINDOW)
      await pickTool(p, 'draw')
      assert.deepEqual(await settle(() => draw.noteInCells(p, '15'), [4.5, 4.5]), [4.5, 4.5], `round ${round}: the note is on its cell again`)
      assert.deepEqual((await draw.texts(p)).sort(), ['15', ...Array.from({ length: round + 1 }, (_, i) => `f${i}`)].sort(), `round ${round}: every note is there once`)
      await pickTool(p, 'pen')
    }
    assert.equal(await p.locator(draw.TEXT_BOX).count(), 0, 'no text box is left open')
    assertClean(errors, 'fullscreen')
  })

  it('attack 78: 200 notes and a grid full of pen lines: drawing, moving and undoing each stay inside the time budget', async (t) => {
    // 200 notes in a grid of 20 across and 10 down, in board units, planted as a saved drawing and shown by a reload.
    await draw.plantDrawing(p, Array.from({ length: NOTE_COUNT }, (_, i) => ({ kind: 'text', color: 1 + (i % 9), size: 14, opacity: 100, text: `n${i}`, at: [10 + (i % 20) * 27, 10 + Math.floor(i / 20) * 54] })))
    await p.reload({ waitUntil: 'load' })
    await installScripts(p)
    await pickTool(p, 'draw')
    assert.equal((await draw.texts(p)).length, NOTE_COUNT, `${NOTE_COUNT} notes are drawn`)

    // A grid full of pen lines: a line along every row and every column, the first segment of each pen page's color.
    await pickTool(p, 'pen')
    for (let i = 0; i < 9; i++) {
      await mouseDrag(p, [[i + 0.5, 0.5], [i + 0.5, 8.5]])
      await mouseDrag(p, [[0.5, i + 0.5], [8.5, i + 0.5]])
    }
    const lines = await penDrawnCount(p)
    assert.equal(lines > 40, true, `the grid is full of pen lines: ${lines}`)

    const times = {}
    const timed = async (name, act, done) => {
      const started = Date.now()
      await act()
      assert.equal(await settle(done, true, ACTION_BUDGET_MS * 2, ACTION_BUDGET_MS * 2), true, `${name} shows its result`)
      times[name] = Date.now() - started
      assert.equal(times[name] < ACTION_BUDGET_MS, true, `${name} takes ${times[name]} ms, over the ${ACTION_BUDGET_MS} ms budget`)
    }

    // Draw a pen line over the full grid, then undo it.
    const entriesBefore = (await penEntries(p)).length
    await timed('draw a pen line', () => mouseDrag(p, [[4.5, 2.5], [4.7, 6.5]]), async () => (await penEntries(p)).length !== entriesBefore)
    await timed('undo the pen line', () => p.click('#control-undo'), async () => (await penEntries(p)).length === entriesBefore)

    // Draw a note among the 200, and move one by a cell.
    await pickTool(p, 'draw')
    await timed('draw a note', async () => {
      await p.mouse.click(...await gridPoint(p, [8.8, 0.3]))
      await p.keyboard.type('new')
      await draw.finishNote(p)
    }, async () => (await draw.texts(p)).length === NOTE_COUNT + 1)
    const [, , size] = await cellCentre(p, 0, 0)
    const moved = async () => (await draw.saved(p)).find((item) => item.text === 'n105').at.join()
    const placed = await moved()
    const [x, y] = await draw.noteStart(p, 'n105')
    await timed('move a note', async () => {
      await p.mouse.move(x + 6, y)
      await p.mouse.down()
      await p.mouse.move(x + 6 + size, y + size / 2, { steps: 8 })
      await p.mouse.up()
    }, async () => (await moved()) !== placed)

    t.diagnostic(`budget ${ACTION_BUDGET_MS} ms per action; measured ${JSON.stringify(times)} ms with ${NOTE_COUNT} notes and ${lines} pen lines`)
    assertClean(errors, 'the full board')
  })
})
