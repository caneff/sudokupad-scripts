// #596, from #590. The one thing not real input is attack 7's blur and focus, which Playwright cannot take from a page.
/* global Framework */
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as extras from './pen-tool-extras-fixtures.mjs'
import { captureConsoleErrors, restartPuzzle } from '../page.mjs'
import { gridPoint, mouseDrag, undoAll, undoDepth } from '../board.mjs'
import { holdUntil, middleOf } from '../input.mjs'
import { openPenTool, penEntries } from '../pen.mjs'
import { FLOOR_MS, settle, STABLE_MS } from '../settle.mjs'
import { useBrowser } from '../session.mjs'
import { assertSliderDragEndsOnHotkey } from '../slider.mjs'
import { OTHER_TOOL, OTHER_TOOL_KEY } from '../all-scripts.mjs'

const { HOLD_TO_EDIT_MS, HOLD_WAIT_MS } = extras

const COLOR_BUTTON = '.tool-pen button[data-key="2"]'
const PICKERS = '.pen-tool-extras-picker'
const THICKNESS = '#pen-tool-extras-thickness'
const THICKNESS_KEY = 'PenColor_thickness'
const OPACITY = '#pen-tool-extras-opacity'
const OPACITY_KEY = 'PenColor_opacity'
// The drawn drag highlight: SudokuPad's own `.penhint`, which the script moves into its hint layer.
const HINTS = '.penhint, #pen-tool-extras-hint *'
// Where the line goes, as [row, column] in cells from the grid's top left: along row 2.5 from column 1.5 to 4.5.
const LINE = [[2.5, 1.5], [2.5, 4.5]]
// A second line on another row and a point for a plain click, to show an ordinary gesture works afterward.
const NEXT_LINE = [[5.5, 1.5], [5.5, 4.5]]
const CLICK_AT = [7.5, 7.5]
const OUTSIDE_CLICK_AT = [6.5, 7.5]
const SMALLER_WINDOW = { width: 1100, height: 800 }

const browser = useBrowser()

describe('Pen Tool Extras\' gestures, interrupted', { concurrency: false }, () => {
  let context, p, errors, read
  // The pen entries a clean drag along LINE leaves, read once.
  let whole

  const tool = () => read(() => Framework.app.tool)
  const hints = () => p.locator(HINTS).count()
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
    await undoAll(p)
    assert.deepEqual(await penEntries(p), [], `${why}: undoing everything leaves the pen as it began`)
    assert.deepEqual(errors, [], `${why}: the page shows no error after recovering`)
  }
  const assertWholeOrNone = async (why) => {
    const entries = await settle(async () => JSON.stringify(await penEntries(p)), JSON.stringify(whole), FLOOR_MS * 2, STABLE_MS)
    assert.equal([JSON.stringify([]), JSON.stringify(whole)].includes(entries), true, `${why}: the pen holds ${entries}, neither the whole line ${JSON.stringify(whole)} nor nothing`)
  }

  before(async () => {
    ;({ context, p, errors } = await extras.open(browser(), { seed: captureConsoleErrors, penTool: false }))
    ;({ read } = extras.tools(p))
    await toTool()
    await mouseDrag(p, LINE)
    whole = await settle(() => penEntries(p), undefined, FLOOR_MS * 2, STABLE_MS)
    assert.notDeepEqual(whole, [], 'the reference drag draws a line')
  })
  after(async () => { await context.close() })
  beforeEach(async () => {
    await restartPuzzle(p)
    assert.equal(await settle(() => undoDepth(p), 0), 0)
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
    it(`17: a ${name} slider drag with a tool hotkey mid-drag ends the drag: the saved value is the one shown, and the slider answers a click when the pen is back`, () =>
      assertSliderDragEndsOnHotkey(p, { slider, key, tool, returnToTool: toTool, errors, sliders: '.pen-tool-extras-sliders' }))
  }

  describe('18: a hold on a pen color button', () => {
    const pickers = () => p.locator(PICKERS).count()
    const press = async () => {
      await p.mouse.move(...middleOf(await p.locator(COLOR_BUTTON).boundingBox()))
      await p.mouse.down()
    }
    // A full hold: the pickers show before the wait ends.
    const holdForPickers = () => holdUntil(p, COLOR_BUTTON, PICKERS, { timeout: HOLD_WAIT_MS })

    it('released at half the hold opens no pickers, and a full hold afterward still does', async () => {
      await press()
      // Half the hold, not near its end: the release may land a long way late on a loaded box and still be before the timer.
      await p.waitForTimeout(HOLD_TO_EDIT_MS * 0.5)
      await p.mouse.up()
      // A "nothing happened" wait that runs past the hold's end (the press's own timer fires at 1.0 x the hold), where the pickers would show if the release had not cancelled it.
      await p.waitForTimeout(HOLD_TO_EDIT_MS * 0.7)
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
