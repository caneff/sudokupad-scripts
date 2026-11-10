// Attacks on Text Anywhere's gestures (#596, from #590): a move drag, a resize-handle drag, a rectangle-select drag, a slider drag and a hold on a
// color button, each interrupted by something a user does, on sudokupad.app in headless Chromium. Every case is real input and checks the crash signals
// (an uncaught error, a console error, a skip line), that what is drawn is what is saved (and what a reload shows), that no gesture is left
// half done (no selection rectangle, no stuck drag), and that an ordinary gesture works afterward.
/* global Framework, window */
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { captureConsoleErrors } from '../page.mjs'
import { savedState } from '../color-by-digit/color-by-digit-fixtures.mjs'
import { settle, stable } from '../settle.mjs'
import { useBrowser } from '../session.mjs'
import { finishNote, gridPoint, mouseDrag, typeText } from '../board.mjs'
import { slideTo } from '../slider.mjs'

const { HANDLES, KEYPAD, NOT_NOTES, OPACITY_KEY, OPACITY_SLIDER, PICKER, SELECTED, SIZE_SLIDER, TEXTS, TEXT_BOX, WIDTH_KEY } = textAnywhere
const { HOLD_TO_EDIT_MS } = createRequire(import.meta.url)('../../text-anywhere.user.js')
const COLOR_BUTTON = `${KEYPAD} button[data-key="4"]`
const RECTANGLE = '#text-anywhere-layer .text-anywhere-selection-rectangle'
const OTHER_TOOL_KEY = 'x'
const OTHER_TOOL = 'corner'
// In cells from the grid's top left: the note's start, a drag's end (a move by BY) and a cell clear of both.
const NOTE_AT = [4.5, 4.5]
const BY = [1, 2]
const EMPTY_AT = [8.5, 1.5]
const NOTE_TEXT = '15'
// How far a note may drift while no button is held.
const IDLE_NEAR_PX = 1.5
const SMALLER_WINDOW = { width: 1100, height: 800 }

const browser = useBrowser()

describe('Text Anywhere\'s gestures, interrupted', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const tool = () => textAnywhere.tool(p)
  const items = async () => {
    const saved = await textAnywhere.saved(p)
    assert.notEqual(saved, null, 'the notes are saved')
    return saved
  }
  const noteItems = async () => (await items()).filter((i) => i.kind === 'text')
  const selectedCount = () => p.locator(SELECTED).count()
  const handleCount = () => p.locator(HANDLES).count()
  const noteBox = () => read((selector) => {
    const note = document.querySelector(selector).getBoundingClientRect()
    const controls = document.querySelector('#controls').getBoundingClientRect()
    const [x, y] = [note.x + note.width / 2, note.y + note.height / 2]
    return { x, y, width: note.width, height: note.height, inWindow: note.left >= 0 && note.top >= 0 && note.right <= window.innerWidth && note.bottom <= window.innerHeight, overControls: x >= controls.left && x <= controls.right && y >= controls.top && y <= controls.bottom }
  }, TEXTS)
  const makeNote = (at = NOTE_AT, text = NOTE_TEXT) => typeText(p, at, text)
  const pickText = async () => {
    await textAnywhere.pickTextAnywhere(p)
    assert.equal(await tool(), 'textanywhere')
  }
  const startMove = async () => {
    await p.mouse.move(...await gridPoint(p, NOTE_AT))
    await p.mouse.down()
    await p.mouse.move(...await gridPoint(p, [NOTE_AT[0] + BY[0], NOTE_AT[1] + BY[1]]), { steps: 8 })
    await textAnywhere.frames(p)
  }
  const fresh = async () => {
    await textAnywhere.forgetNotes(p)
    await textAnywhere.reload(p)
    await pickText()
    await makeNote()
  }

  const assertWhole = async (why, texts = [NOTE_TEXT]) => {
    assert.deepEqual(errors, [], `${why}: the page shows no error`)
    assert.deepEqual(await settle(() => textAnywhere.texts(p), texts), texts, `${why}: the drawn notes`)
    assert.equal((await noteItems()).length, texts.length, `${why}: one saved note for each drawn note`)
    assert.equal(await p.locator(NOT_NOTES).count(), 0, `${why}: nothing but notes is drawn`)
    assert.equal(await p.locator(RECTANGLE).count(), 0, `${why}: no selection rectangle is left`)
    assert.equal(await p.locator(TEXT_BOX).count(), 0, `${why}: no text box is open`)
    const placed = await noteBox()
    assert.equal(placed.inWindow && !placed.overControls, true, `${why}: the note is inside the window and clear of the controls: ${JSON.stringify(placed)}`)
    const saved = await items()
    await textAnywhere.reload(p)
    await pickText()
    assert.deepEqual(await settle(() => textAnywhere.texts(p), texts), texts, `${why}: a reload shows the same notes`)
    assert.deepEqual(await items(), saved, `${why}: a reload leaves the saved notes as they were`)
  }
  const assertWorks = async (why) => {
    await finishNote(p)
    await pickText()
    const before = JSON.stringify((await noteItems())[0])
    // A drag from the note's own middle, leftward, since the attack may have left the note at the window's right edge.
    const { x, y } = await noteBox()
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x - 60, y + 40, { steps: 8 })
    await p.mouse.up()
    const moved = await settle(async () => JSON.stringify((await noteItems())[0]) !== before, true)
    assert.equal(moved, true, `${why}: an ordinary drag still moves the note`)
    await finishNote(p)
    await makeNote(EMPTY_AT, 'new')
    assert.deepEqual((await textAnywhere.texts(p)).sort(), [NOTE_TEXT, 'new'].sort(), `${why}: a new note can still be made`)
    assert.deepEqual(errors, [], `${why}: the page shows no error afterward`)
  }

  before(async () => {
    ;({ context, p, errors } = await textAnywhere.open(browser(), { seed: captureConsoleErrors }))
  })
  after(async () => { await context.close() })
  beforeEach(async () => { await fresh() })

  it('10: a move drag, Escape mid-drag, then the mouse-up puts the note back where it was', async () => {
    const [before] = await noteItems()
    await startMove()
    await p.keyboard.press('Escape')
    await textAnywhere.frames(p)
    await p.mouse.up()
    await textAnywhere.frames(p)
    assert.deepEqual((await noteItems())[0].at, before.at, 'the note is where it was')
    await assertWhole('Escape mid-move')
    await assertWorks('Escape mid-move')
  })

  it('11: a move drag, Delete mid-drag, then the mouse-up leaves the note deleted, drawn nowhere and saved nowhere', async () => {
    await startMove()
    await p.keyboard.press('Delete')
    await textAnywhere.frames(p)
    await p.mouse.move(...await gridPoint(p, [8.5, 8.5]), { steps: 4 })
    await p.mouse.up()
    await textAnywhere.frames(p)
    assert.deepEqual(await stable(() => textAnywhere.texts(p)), [], 'the deleted note is not drawn again at the drop point')
    // Deleting the only note leaves nothing to save, so the saved notes are gone rather than an empty list.
    assert.deepEqual((await textAnywhere.saved(p) ?? []).filter((i) => i.kind === 'text'), [], 'the deleted note is not saved again')
    assert.deepEqual(errors, [], 'the page shows no error')
    await textAnywhere.reload(p)
    await pickText()
    assert.deepEqual(await textAnywhere.texts(p), [], 'a reload shows no note')
  })

  it('12: a move drag, Ctrl+Z mid-drag, then the mouse-up moves the note once and leaves SudokuPad\'s undo alone', async () => {
    const undoBefore = await read(() => Framework.app.puzzle.undoStack.length)
    const [before] = await noteItems()
    await startMove()
    await p.keyboard.press('Control+z')
    await textAnywhere.frames(p)
    await p.mouse.up()
    await textAnywhere.frames(p)
    const [after] = await noteItems()
    assert.notDeepEqual(after.at, before.at, 'the drag moved the note')
    assert.equal(await read(() => Framework.app.puzzle.undoStack.length), undoBefore, 'SudokuPad\'s undo stack is as it was')
    await textAnywhere.reload(p)
    await pickText()
    assert.deepEqual((await noteItems())[0].at, after.at, 'a reload keeps the note where the drag put it')
    await assertWhole('Ctrl+Z mid-move')
    await assertWorks('Ctrl+Z mid-move')
  })

  it('13: a resize-handle drag with the window resized mid-drag ends the drag with the note whole and inside the window', async () => {
    const original = p.viewportSize()
    await p.mouse.click(...await gridPoint(p, NOTE_AT))
    assert.equal(await handleCount(), 4, 'the note shows its four handles')
    const box = await p.locator(HANDLES).nth(3).boundingBox()
    const [x, y] = textAnywhere.middleOf(box)
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x + 60, y + 40, { steps: 6 })
    await textAnywhere.frames(p)
    await p.setViewportSize(SMALLER_WINDOW)
    await textAnywhere.frames(p)
    await p.mouse.move(x + 80, y + 60, { steps: 3 })
    await p.mouse.up()
    await textAnywhere.frames(p)
    try {
      const handles = await handleCount()
      assert.equal(handles, await selectedCount() * 4, `the handles (${handles}) follow the selection`)
      await assertWhole('window resize mid-resize')
      await assertWorks('window resize mid-resize')
    } finally {
      await p.setViewportSize(original)
    }
  })

  it('14: a move drag released outside the window leaves the note reachable, and the drag over', async () => {
    await p.mouse.move(...await gridPoint(p, NOTE_AT))
    await p.mouse.down()
    await p.mouse.move(1500, 300, { steps: 20 })
    await p.mouse.up()
    await textAnywhere.frames(p)
    await assertWhole('release outside the window')
    const placed = await noteBox()
    await p.mouse.move(...await gridPoint(p, [8.5, 8.5]), { steps: 4 })
    await textAnywhere.frames(p)
    const later = await noteBox()
    assert.equal(Math.abs(later.x - placed.x) + Math.abs(later.y - placed.y) <= IDLE_NEAR_PX, true, `a move with no button held does not drag the note: ${JSON.stringify([placed, later])}`)
    await assertWorks('release outside the window')
  })

  it('15: a rectangle-select drag with a tool hotkey mid-drag takes the rectangle away, selects nothing and leaves the new tool current', async () => {
    const saved = await items()
    await p.mouse.move(...await gridPoint(p, [2.5, 2.5]))
    await p.mouse.down()
    await p.mouse.move(...await gridPoint(p, [6.5, 6.5]), { steps: 8 })
    await textAnywhere.frames(p)
    assert.equal(await p.locator(RECTANGLE).count(), 1, 'the drag draws its rectangle')
    await p.keyboard.press(OTHER_TOOL_KEY)
    await textAnywhere.frames(p)
    assert.equal(await tool(), OTHER_TOOL, 'the hotkey switched the tool')
    assert.equal(await p.locator(RECTANGLE).count(), 0, 'the rectangle is gone')
    await p.mouse.up()
    await textAnywhere.frames(p)
    assert.equal(await tool(), OTHER_TOOL, 'the release kept the new tool')
    assert.equal(await selectedCount(), 0, 'nothing is selected')
    assert.equal(await handleCount(), 0, 'no handles show')
    assert.deepEqual(await items(), saved, 'the saved notes are as they were')
    await pickText()
    await mouseDrag(p, [[2.5, 2.5], [6.5, 6.5]])
    assert.equal(await settle(selectedCount, 1), 1, 'a rectangle-select drag works when Text Anywhere is back')
    await assertWhole('tool switch mid-rectangle')
    await assertWorks('tool switch mid-rectangle')
  })

  for (const [name, slider, key] of [['Size', SIZE_SLIDER, WIDTH_KEY], ['Opacity', OPACITY_SLIDER, OPACITY_KEY]]) {
    it(`17: a ${name} slider drag with a tool hotkey mid-drag ends the drag: the saved value is the one shown, and the slider answers a click when Text Anywhere is back`, async () => {
      const valueOf = () => textAnywhere.valueOf(p, slider)
      const before = await valueOf()
      const box = await p.locator(slider).boundingBox()
      await p.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2)
      await p.mouse.down()
      await p.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 12 })
      assert.notEqual(await stable(valueOf), before, 'the drag moved the slider')
      await p.keyboard.press(OTHER_TOOL_KEY)
      assert.equal(await tool(), OTHER_TOOL, 'the hotkey switched the tool')
      await p.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 4 })
      await p.mouse.up()
      assert.equal(await tool(), OTHER_TOOL, 'the release kept the new tool')
      await pickText()
      const stored = await read((k) => Framework.getData(k), key)
      assert.notEqual(stored, null, `${key} is saved`)
      assert.equal(Number(savedState(stored)), await valueOf(), 'the saved value is the one the slider shows')
      const resting = await valueOf()
      const { min, max } = await read((selector) => ({ min: Number(document.querySelector(selector).min), max: Number(document.querySelector(selector).max) }), slider)
      await slideTo(p, slider, resting - min > max - resting ? min : max)
      assert.notEqual(await stable(valueOf), resting, 'the slider answers a click again')
      assert.equal(await read((selector) => document.activeElement?.matches(`${selector} input`) === true, textAnywhere.SLIDERS), false, 'no slider keeps the focus')
      assert.deepEqual(errors, [], 'the page shows no error')
    })
  }

  describe('18: a hold on a text color button', () => {
    const pickers = () => p.locator(PICKER).count()
    const press = async () => {
      const box = await p.locator(COLOR_BUTTON).boundingBox()
      await p.mouse.move(...textAnywhere.middleOf(box))
      await p.mouse.down()
    }

    it('released at 0.9 s opens no pickers, and a full hold afterward still does', async (t) => {
      // The page times the press itself: a stall of the box that lets the 1 s hold timer fire first makes the release late, not the script wrong.
      await p.evaluate(() => {
        window.__press = {}
        window.addEventListener('pointerdown', (e) => { window.__press.down = e.timeStamp }, { capture: true, once: true })
        window.addEventListener('pointerup', (e) => { window.__press.up = e.timeStamp }, { capture: true, once: true })
      })
      await press()
      await p.waitForTimeout(HOLD_TO_EDIT_MS * 0.9)
      await p.mouse.up()
      const held = await p.evaluate(() => window.__press.up - window.__press.down)
      if (!(held < HOLD_TO_EDIT_MS)) {
        t.skip(`the press lasted ${Math.round(held)} ms, so the release was not early`)
        return
      }
      // A "nothing happened" wait: the pickers, if the early release wrongly opened them, would show well within it.
      await p.waitForTimeout(HOLD_TO_EDIT_MS * 0.4)
      assert.equal(await pickers(), 0, 'no pickers after an early release')
      await textAnywhere.holdForPickers(p, COLOR_BUTTON, 'left', 'visible')
      assert.equal(await pickers(), 9, 'a full hold opens the nine pickers')
      await p.keyboard.press(OTHER_TOOL_KEY)
      assert.equal(await settle(pickers, 0), 0, 'leaving Text Anywhere ends edit mode')
      assert.deepEqual(errors, [], 'the page shows no error')
    })

    it('held while a tool hotkey switches the tool opens no pickers when the hold runs out, and a later hold still does', async () => {
      await press()
      await p.waitForTimeout(HOLD_TO_EDIT_MS * 0.3)
      await p.keyboard.press(OTHER_TOOL_KEY)
      assert.equal(await tool(), OTHER_TOOL)
      // A "nothing happened" wait: past the hold, the time at which the pickers would show.
      await p.waitForTimeout(HOLD_TO_EDIT_MS * 1.2)
      await p.mouse.up()
      assert.equal(await pickers(), 0, 'no pickers over the other tool')
      await pickText()
      assert.equal(await pickers(), 0, 'no pickers when Text Anywhere comes back')
      await textAnywhere.holdForPickers(p, COLOR_BUTTON, 'left', 'visible')
      assert.equal(await pickers(), 9, 'a full hold opens the nine pickers')
      await p.keyboard.press(OTHER_TOOL_KEY)
      assert.equal(await settle(pickers, 0), 0, 'leaving Text Anywhere ends edit mode')
      assert.deepEqual(errors, [], 'the page shows no error')
    })
  })

  it('the page shows no error', () => {
    assert.deepEqual(errors, [])
  })
})
