// Attacks on Pen Tool Extras' gestures (#596, from #590): a pen drag, a right-click erase, a slider drag and a hold on a color button,
// each interrupted by something a user does, on sudokupad.app in headless Chromium. Every case is real input and checks the crash signals
// (an uncaught error, a console error, a skip line), that nothing is left half done on the page (no drag highlight, no picker), that the
// gesture's own outcome is whole where a drag was cut short (the line is drawn once or not at all, never half), that an ordinary gesture works afterward, and that
// undoing everything brings the pen back to the start. The one thing not real input is attack 7's blur and focus, which Playwright cannot take from a page.
/* global Framework */
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { captureConsoleErrors, openPage, restartPuzzle, startPuzzle } from '../page.mjs'
import { gridPoint, mouseDrag } from '../board.mjs'
import { openPenTool, penEntries } from '../pen.mjs'
import { savedState } from '../color-by-digit/color-by-digit-fixtures.mjs'
import { FLOOR_MS, settle, stable, STABLE_MS } from '../settle.mjs'

const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const { HOLD_TO_EDIT_MS } = createRequire(import.meta.url)('../../pen-tool-extras.user.js')

const COLOR_BUTTON = '.tool-pen button[data-key="2"]'
const PICKERS = '.pen-tool-extras-picker'
const THICKNESS = '#pen-tool-extras-thickness'
const THICKNESS_KEY = 'PenColor_thickness'
const OPACITY = '#pen-tool-extras-opacity'
const OPACITY_KEY = 'PenColor_opacity'
// The drawn drag highlight: SudokuPad's own `.penhint`, which the script moves into its hint layer.
const HINTS = '.penhint, #pen-tool-extras-hint *'
// SudokuPad's hotkey for the Corner tool, and the tool it names.
const OTHER_TOOL_KEY = 'x'
const OTHER_TOOL = 'corner'
// Where the line goes, as [row, column] in cells from the grid's top left: along row 2.5 from column 1.5 to 4.5.
const LINE = [[2.5, 1.5], [2.5, 4.5]]
// A second line on another row and a point for a plain click, to show an ordinary gesture works afterward.
const NEXT_LINE = [[5.5, 1.5], [5.5, 4.5]]
const CLICK_AT = [7.5, 7.5]
const OUTSIDE_CLICK_AT = [6.5, 7.5]
const HOLD_WAIT_MS = HOLD_TO_EDIT_MS + 5000
const SMALLER_WINDOW = { width: 1100, height: 800 }

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Pen Tool Extras\' gestures, interrupted', { concurrency: false }, () => {
  let context, p, errors
  // The pen entries a clean drag along LINE leaves, read once.
  let whole

  const read = (fn, arg) => p.evaluate(fn, arg)
  const tool = () => read(() => Framework.app.tool)
  const hints = () => p.locator(HINTS).count()
  const undoDepth = () => read(() => Framework.app.puzzle.undoStack.length)
  const undoAll = async () => { while ((await undoDepth()) > 0) await p.click('#control-undo') }
  const toTool = async () => {
    await openPenTool(p)
    await p.locator('.tool-pen button[data-key="1"]').click()
    assert.equal(await tool(), 'pen')
  }
  const startDrag = async (points = LINE) => {
    await p.mouse.move(...await gridPoint(p, points[0]))
    await p.mouse.down()
    await p.mouse.move(...await gridPoint(p, points[1]), { steps: 8 })
  }
  // The page shows no error and the drag highlight is gone; an ordinary drag and an ordinary click then work, and undoing everything leaves the pen as it began.
  // `strayHint`: SudokuPad itself leaves the abandoned drag's highlight on the board when a hotkey switches the tool mid-drag (checked without any
  // script), so the case skips the first read and checks that the next drag takes it away.
  const assertRecovered = async (why, { strayHint = false } = {}) => {
    assert.deepEqual(errors, [], `${why}: the page shows no error`)
    if (!strayHint) assert.equal(await settle(hints, 0), 0, `${why}: no drag highlight is left on the page`)
    await openPenTool(p)
    const before = (await penEntries(p)).length
    await mouseDrag(p, NEXT_LINE)
    assert.equal(await settle(async () => (await penEntries(p)).length > before, true), true, `${why}: an ordinary drag still draws`)
    const afterLine = (await penEntries(p)).length
    await p.mouse.click(...await gridPoint(p, CLICK_AT))
    assert.equal(await settle(async () => (await penEntries(p)).length > afterLine, true), true, `${why}: an ordinary click still marks`)
    assert.equal(await settle(hints, 0), 0, `${why}: no drag highlight is left after an ordinary drag`)
    await undoAll()
    assert.deepEqual(await penEntries(p), [], `${why}: undoing everything leaves the pen as it began`)
    assert.deepEqual(errors, [], `${why}: the page shows no error after recovering`)
  }
  // The line is drawn once or not at all: after the interruption's release, what the pen holds is the clean drag's entries or nothing.
  const assertWholeOrNone = async (why) => {
    const entries = await settle(async () => JSON.stringify(await penEntries(p)), JSON.stringify(whole), FLOOR_MS * 2, STABLE_MS)
    assert.equal([JSON.stringify([]), JSON.stringify(whole)].includes(entries), true, `${why}: the pen holds ${entries}, neither the whole line ${JSON.stringify(whole)} nor nothing`)
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { seed: captureConsoleErrors }))
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
    await read(() => { Framework.setSetting('toolpen', true) })
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await toTool()
    await mouseDrag(p, LINE)
    whole = await settle(() => penEntries(p), undefined, FLOOR_MS * 2, STABLE_MS)
    assert.notDeepEqual(whole, [], 'the reference drag draws a line')
  })
  after(async () => { await context.close() })
  beforeEach(async () => {
    await restartPuzzle(p)
    assert.equal(await settle(undoDepth, 0), 0)
    await toTool()
  })

  it('1: a pen drag, Escape before the mouse-up, then the mouse-up ends the drag cleanly', async () => {
    await startDrag()
    await p.keyboard.press('Escape')
    await p.mouse.up()
    await assertWholeOrNone('Escape mid-drag')
    await assertRecovered('Escape mid-drag')
  })

  it('2: a pen drag, a tool hotkey mid-drag, then the mouse-up leaves the new tool current and nothing half drawn', async () => {
    await startDrag()
    await p.keyboard.press(OTHER_TOOL_KEY)
    assert.equal(await tool(), OTHER_TOOL, 'the hotkey switched the tool')
    await p.mouse.up()
    assert.equal(await tool(), OTHER_TOOL, 'the release kept the new tool')
    await assertWholeOrNone('tool switch mid-drag')
    await toTool()
    await assertRecovered('tool switch mid-drag', { strayHint: true })
  })

  it('3: a pen drag with Ctrl+Z mid-drag ends the drag cleanly', async () => {
    await mouseDrag(p, NEXT_LINE)
    assert.equal((await settle(() => penEntries(p), undefined, FLOOR_MS * 2, STABLE_MS)).some((e) => e.startsWith('5,')), true, 'the line Ctrl+Z should undo is drawn')
    await startDrag()
    await p.keyboard.press('Control+z')
    await p.mouse.up()
    const entries = await settle(() => penEntries(p), undefined, FLOOR_MS * 2, STABLE_MS)
    assert.equal(entries.some((e) => e.startsWith('5,')), false, `Ctrl+Z undid the line drawn before the drag: ${entries}`)
    await assertWholeOrNone('Ctrl+Z mid-drag')
    await assertRecovered('Ctrl+Z mid-drag')
  })

  it('4: a pen drag with the window resized mid-drag ends the drag cleanly', async () => {
    await startDrag()
    const original = p.viewportSize()
    await p.setViewportSize(SMALLER_WINDOW)
    await p.mouse.up()
    await p.setViewportSize(original)
    await assertWholeOrNone('resize mid-drag')
    await assertRecovered('resize mid-drag')
  })

  it('5: a pen drag with the right button pressed and released while the left is down ends with the left release', async () => {
    await startDrag()
    await p.mouse.down({ button: 'right' })
    await p.mouse.up({ button: 'right' })
    await p.mouse.up()
    await assertWholeOrNone('second button mid-drag')
    await assertRecovered('second button mid-drag')
  })

  it('6: a pen drag that leaves the window and is released outside it ends the drag, and a plain click on the grid then marks', async () => {
    await startDrag()
    await p.mouse.move(1300, 400, { steps: 5 })
    await p.mouse.up()
    assert.equal(await settle(hints, 0), 0, 'no drag highlight is left')
    const before = (await penEntries(p)).length
    await p.mouse.click(...await gridPoint(p, OUTSIDE_CLICK_AT))
    assert.equal(await settle(async () => (await penEntries(p)).length > before, true), true, 'the plain click on the grid marked a cell')
    await assertRecovered('release outside the window')
  })

  it('7: a pen drag with the page blurred and focused again, then released, ends the drag cleanly', async () => {
    await startDrag()
    // Playwright cannot take the focus from a page, so the page gets the events a lost and regained focus sends.
    await read(() => window.dispatchEvent(new window.Event('blur')))
    await read(() => window.dispatchEvent(new window.Event('focus')))
    await p.mouse.up()
    await assertWholeOrNone('blur mid-drag')
    await assertRecovered('blur mid-drag')
  })

  describe('a right-click erase held on a line', () => {
    const onLine = () => gridPoint(p, [2.5, 3.5])
    beforeEach(async () => {
      await mouseDrag(p, LINE)
      assert.deepEqual(await settle(() => penEntries(p), whole), whole, 'the line is drawn')
      await p.mouse.move(...await onLine())
      await p.mouse.down({ button: 'right' })
    })

    it('8a: held, then Escape, then released leaves the line', async () => {
      await p.keyboard.press('Escape')
      await p.mouse.move(...await gridPoint(p, [2.5, 2.5]), { steps: 4 })
      await p.mouse.up({ button: 'right' })
      assert.deepEqual(await settle(() => penEntries(p), whole, FLOOR_MS, STABLE_MS), whole, 'the Escape cancelled the erase')
      await assertRecovered('Escape in an erase')
    })

    it('8b: held, then the left button pressed too, ends the erase at the last release and erases the line once', async () => {
      await p.mouse.down({ button: 'left' })
      await p.mouse.up({ button: 'left' })
      await p.mouse.up({ button: 'right' })
      assert.deepEqual(await settle(() => penEntries(p), []), [], 'the line is erased')
      await p.click('#control-undo')
      assert.deepEqual(await settle(() => penEntries(p), whole), whole, 'one undo brings the line back')
      await assertRecovered('second button in an erase')
    })

    it('9: held, then a tool hotkey, then released leaves the new tool current and the line whole or erased, never half', async () => {
      await p.keyboard.press(OTHER_TOOL_KEY)
      assert.equal(await tool(), OTHER_TOOL, 'the hotkey switched the tool')
      await p.mouse.up({ button: 'right' })
      assert.equal(await tool(), OTHER_TOOL, 'the release kept the new tool')
      await assertWholeOrNone('tool switch in an erase')
      await toTool()
      await assertRecovered('tool switch in an erase')
    })
  })

  for (const [name, slider, key] of [['Thickness', THICKNESS, THICKNESS_KEY], ['Opacity', OPACITY, OPACITY_KEY]]) {
    it(`17: a ${name} slider drag with a tool hotkey mid-drag ends the drag: the saved value is the one shown, and the slider answers a click when the pen is back`, async () => {
      const valueOf = () => read((s) => Number(document.querySelector(s).value), slider)
      const before = await valueOf()
      const box = await p.locator(slider).boundingBox()
      await p.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2)
      await p.mouse.down()
      await p.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 12 })
      const during = await stable(valueOf)
      assert.notEqual(during, before, 'the drag moved the slider')
      await p.keyboard.press(OTHER_TOOL_KEY)
      assert.equal(await tool(), OTHER_TOOL)
      await p.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 4 })
      await p.mouse.up()
      assert.equal(await tool(), OTHER_TOOL, 'the release kept the new tool')
      await toTool()
      const saved = await read((k) => Framework.getData(k), key)
      assert.notEqual(saved, null, `${key} is saved`)
      assert.equal(Number(savedState(saved)), await valueOf(), 'the saved value is the one the slider shows')
      const resting = await valueOf()
      // A click at the end of the track farther from the resting value, so it cannot land on the value the drag left.
      const { min, max } = await read((selector) => ({ min: Number(document.querySelector(selector).min), max: Number(document.querySelector(selector).max) }), slider)
      const track = await p.locator(slider).boundingBox()
      await p.mouse.click(track.x + track.width * ((resting - min) / (max - min) < 0.5 ? 0.95 : 0.05), track.y + track.height / 2)
      assert.notEqual(await stable(valueOf), resting, 'the slider answers a click again')
      assert.deepEqual(errors, [], 'the page shows no error')
      assert.equal(await p.evaluate(() => document.activeElement?.matches('.pen-tool-extras-sliders input') === true), false, 'no slider keeps the focus')
    })
  }

  describe('18: a hold on a pen color button', () => {
    const pickers = () => p.locator(PICKERS).count()
    const press = async () => {
      const box = await p.locator(COLOR_BUTTON).boundingBox()
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await p.mouse.down()
    }
    // A full hold: the pickers show before the wait ends, and the button is let go whatever happens.
    const holdForPickers = async () => {
      await press()
      try {
        await p.locator(PICKERS).first().waitFor({ state: 'attached', timeout: HOLD_WAIT_MS })
      } finally {
        await p.mouse.up()
      }
    }

    it('released at 0.9 s opens no pickers, and a full hold afterward still does', async () => {
      await press()
      await p.waitForTimeout(HOLD_TO_EDIT_MS * 0.9)
      await p.mouse.up()
      // A "nothing happened" wait: the pickers, if the early release wrongly opened them, would show well within it.
      await p.waitForTimeout(HOLD_TO_EDIT_MS * 0.4)
      assert.equal(await pickers(), 0, 'no pickers after an early release')
      await holdForPickers()
      assert.equal(await pickers(), 9, 'a full hold opens the nine pickers')
      await p.keyboard.press(OTHER_TOOL_KEY)
      assert.equal(await settle(pickers, 0), 0, 'leaving the pen ends edit mode')
      assert.deepEqual(errors, [], 'the page shows no error')
    })

    it('held while a tool hotkey switches the tool opens no pickers when the hold runs out, and a later hold on the pen still does', async () => {
      await press()
      await p.waitForTimeout(HOLD_TO_EDIT_MS * 0.3)
      await p.keyboard.press(OTHER_TOOL_KEY)
      assert.equal(await tool(), OTHER_TOOL)
      // A "nothing happened" wait: past the hold, the time at which the pickers would show.
      await p.waitForTimeout(HOLD_TO_EDIT_MS * 1.2)
      await p.mouse.up()
      assert.equal(await pickers(), 0, 'no pickers over the other tool')
      assert.equal(await tool(), OTHER_TOOL)
      await toTool()
      assert.equal(await pickers(), 0, 'no pickers when the pen comes back')
      await holdForPickers()
      assert.equal(await pickers(), 9, 'a full hold opens the nine pickers')
      await p.keyboard.press(OTHER_TOOL_KEY)
      assert.equal(await settle(pickers, 0), 0, 'leaving the pen ends edit mode')
      assert.deepEqual(errors, [], 'the page shows no error')
    })
  })

  it('the page shows no error', () => {
    assert.deepEqual(errors, [])
  })
})
