// Live check of draw-tool.user.js's selection on sudokupad.app: a click selects a note and a double-click edits it, a drag on empty space selects every
// note its rectangle touches, Shift+click adds or removes one, a click on empty space or Escape ends the selection, the panel's colors, size slider and
// Background change only the selected notes, a drag on a selected note moves them all and keeps every one reachable, a right-click erase or leaving the
// tool keeps the selection right, and Clear all, Delete and Backspace delete only the selection. Real mouse and keyboard input throughout, at a desktop size.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint, mouseDrag, setInputValue } from '../pen.mjs'
import { settle } from '../settle.mjs'

const { BACKGROUND_BUTTON, CLEAR_BUTTON, COLOR_KEY, DIALOG, DIGIT_BUTTON, KEYPAD, SIZE_SLIDER, TEXT_BOX, TEXTS, WIDTH_KEY } = draw
const SELECTED = '#draw-tool-layer .draw-tool-selected'
const RECTANGLE = '#draw-tool-layer .draw-tool-selection-rectangle'
// In cells from the grid's top left: three notes the rectangle from CORNER to FAR_CORNER covers, a fourth outside it, and empty space.
const NOTES = { A: [1.5, 1.5], B: [1.5, 3.5], C: [3.5, 2.5], D: [7.5, 7.5] }
const CORNER = [0.6, 0.6]
const FAR_CORNER = [4.4, 4.4]
const EMPTY = [6.2, 1.5]
// The group move takes A, B and C this many (rows, columns).
const MOVE_BY = [2, 3]
const shifted = ([r, c]) => [r + MOVE_BY[0], c + MOVE_BY[1]]
// SudokuPad's board draws a cell 64 units wide; a real mouse lands on whole page pixels, so places are checked to within a unit.
const CELL = 64
const NEAR_UNITS = 1.5

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Annotation\'s selection', { concurrency: false }, () => {
  let context, p, errors

  const saved = () => draw.saved(p)
  const savedNote = async (text) => (await saved()).find((item) => item.text === text)
  const selectedTexts = () => p.evaluate((selector) => [...document.querySelectorAll(selector)].map((e) => e.textContent).sort(), SELECTED)
  const clickAt = async (at, options) => p.mouse.click(...await gridPoint(p, at), options)
  const shiftClickAt = async (at) => {
    await p.keyboard.down('Shift')
    try {
      await clickAt(at)
    } finally {
      await p.keyboard.up('Shift')
    }
  }
  const typeText = async (at, content) => {
    await clickAt(at)
    await p.keyboard.type(content)
    await p.keyboard.press('Escape')
  }
  // A rectangle over A, B and C, where they are before the group move, or after it when `moved`.
  const selectThree = async (moved = false) => {
    await mouseDrag(p, moved ? [shifted(CORNER), shifted(FAR_CORNER)] : [CORNER, [3, 3], FAR_CORNER])
    assert.deepEqual(await selectedTexts(), ['A', 'B', 'C'])
  }
  // The color button marked current, or null for none.
  const markedColor = () => p.evaluate((keypad) => document.querySelector(`${keypad} button.digit.current`)?.dataset.key ?? null, KEYPAD)
  const backgroundPressed = () => p.locator(BACKGROUND_BUTTON).getAttribute('aria-pressed')
  const reload = async () => {
    await draw.reload(p)
    await draw.pickDraw(p)
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport: { width: 1200, height: 900 } } }))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await reload()
    for (const [text, at] of Object.entries(NOTES)) await typeText(at, text)
    assert.deepEqual(await draw.texts(p), ['A', 'B', 'C', 'D'])
  })
  after(async () => { await context.close() })

  it('a click on a note selects it without opening the text box, and a double-click opens it', async () => {
    await clickAt(NOTES.A)
    assert.deepEqual(await selectedTexts(), ['A'])
    assert.equal(await p.locator(TEXT_BOX).count(), 0, 'no text box opened')
    await p.mouse.dblclick(...await gridPoint(p, NOTES.B))
    assert.equal(await p.locator(TEXT_BOX).textContent(), 'B', 'the double-click opened the note')
    await p.keyboard.press('Escape')
    assert.equal(await p.locator(TEXT_BOX).count(), 0)
    assert.deepEqual(await selectedTexts(), [], 'opening the note ended the selection its first click made')
  })

  it('a click on empty space with a selection only ends it, and starts no note; Escape ends it too', async () => {
    await clickAt(NOTES.A)
    await clickAt(EMPTY)
    assert.deepEqual(await selectedTexts(), [])
    assert.equal(await p.locator(TEXT_BOX).count(), 0, 'no text box opened')
    await clickAt(NOTES.A)
    await p.keyboard.press('Escape')
    assert.deepEqual(await selectedTexts(), [])
    assert.deepEqual(await draw.texts(p), ['A', 'B', 'C', 'D'])
  })

  it('a drag on empty space draws a rectangle and selects every note it touches, Shift+click removes one and adds it back, and Shift+drag adds more', async () => {
    await p.mouse.move(...await gridPoint(p, CORNER))
    await p.mouse.down()
    await p.mouse.move(...await gridPoint(p, FAR_CORNER), { steps: 8 })
    assert.equal(await p.locator(RECTANGLE).count(), 1, 'the rectangle shows during the drag')
    await p.mouse.up()
    assert.equal(await p.locator(RECTANGLE).count(), 0, 'the rectangle goes on the release')
    assert.deepEqual(await selectedTexts(), ['A', 'B', 'C'])
    await shiftClickAt(NOTES.B)
    assert.deepEqual(await selectedTexts(), ['A', 'C'])
    await shiftClickAt(NOTES.B)
    assert.deepEqual(await selectedTexts(), ['A', 'B', 'C'])
    await p.keyboard.down('Shift')
    try {
      await mouseDrag(p, [[6.6, 6.6], [8.4, 8.4]])
    } finally {
      await p.keyboard.up('Shift')
    }
    assert.deepEqual(await selectedTexts(), ['A', 'B', 'C', 'D'])
    await p.keyboard.press('Escape')
  })

  it('a color picked with three notes selected recolors only those three, and the next new note takes the earlier next-note color', async () => {
    const nextColor = await p.evaluate((key) => Framework.getData(key), COLOR_KEY)
    await selectThree()
    await p.click(`${KEYPAD} button[data-key="6"]`)
    assert.deepEqual(await Promise.all(['A', 'B', 'C', 'D'].map(async (t) => (await savedNote(t)).color)), [6, 6, 6, 1])
    assert.equal(await markedColor(), '6', 'the panel shows the selection\'s color')
    assert.equal(await p.evaluate((key) => Framework.getData(key), COLOR_KEY), nextColor, 'the next-note color is unchanged')
    await clickAt(EMPTY)
    assert.equal(await markedColor(), String(nextColor ?? 1), 'with nothing selected the panel shows the next-note color')
    await typeText(EMPTY, 'E')
    assert.equal((await savedNote('E')).color, nextColor ?? 1)
  })

  it('the size slider and Background change only the selected notes, a mixed selection shows no color and no background state, and Background then boxes them all', async () => {
    const nextWidth = await p.evaluate((key) => Framework.getData(key), WIDTH_KEY)
    await selectThree()
    await setInputValue(p.locator(SIZE_SLIDER), 10)
    assert.deepEqual(await Promise.all(['A', 'B', 'C', 'D'].map(async (t) => (await savedNote(t)).size)), [28, 28, 28, 20])
    assert.equal(await p.evaluate((key) => Framework.getData(key), WIDTH_KEY), nextWidth, 'the next-note size is unchanged')
    assert.equal(await backgroundPressed(), 'false')
    await p.click(BACKGROUND_BUTTON)
    assert.deepEqual(await Promise.all(['A', 'B', 'C', 'D'].map(async (t) => Boolean((await savedNote(t)).bg))), [true, true, true, false])
    assert.equal(await backgroundPressed(), 'true')
    await shiftClickAt(NOTES.D)
    assert.deepEqual(await selectedTexts(), ['A', 'B', 'C', 'D'])
    assert.equal(await backgroundPressed(), 'mixed')
    assert.equal(await p.locator(BACKGROUND_BUTTON).evaluate((b) => window.getComputedStyle(b).outlineStyle), 'dashed', 'the mixed state has a look of its own')
    assert.equal(await markedColor(), null)
    await p.click(BACKGROUND_BUTTON)
    assert.deepEqual(await Promise.all(['A', 'B', 'C', 'D'].map(async (t) => Boolean((await savedNote(t)).bg))), [true, true, true, true])
    assert.equal(await backgroundPressed(), 'true')
    await p.keyboard.press('Escape')
    assert.equal(await backgroundPressed(), 'false', 'with nothing selected the button shows the next-note setting')
  })

  it('a drag on one selected note moves every selected note, and they keep their spacing after a reload', async () => {
    const at = async () => Object.fromEntries(await Promise.all(['A', 'B', 'C', 'D'].map(async (t) => [t, (await savedNote(t)).at])))
    const before = await at()
    await selectThree()
    await mouseDrag(p, [NOTES.C, shifted(NOTES.C)])
    const after = await at()
    for (const t of ['A', 'B', 'C']) {
      const moved = [after[t][0] - before[t][0], after[t][1] - before[t][1]]
      assert.equal(Math.abs(moved[0] - MOVE_BY[1] * CELL) <= NEAR_UNITS && Math.abs(moved[1] - MOVE_BY[0] * CELL) <= NEAR_UNITS, true, `${t} moved by ${moved}`)
    }
    assert.deepEqual(after.D, before.D, 'the unselected note stayed')
    assert.deepEqual(await selectedTexts(), ['A', 'B', 'C'], 'the moved notes stay selected')
    await reload()
    assert.deepEqual(await settle(at, after), after)
  })

  it('a drag on an unselected note selects just it and moves it', async () => {
    await selectThree(true)
    const before = (await savedNote('D')).at
    await mouseDrag(p, [NOTES.D, [NOTES.D[0], NOTES.D[1] - 1]])
    assert.deepEqual(await selectedTexts(), ['D'])
    const after = (await savedNote('D')).at
    assert.equal(Math.abs(after[0] - (before[0] - CELL)) <= NEAR_UNITS, true, `D moved from ${before} to ${after}`)
  })

  it('Delete deletes only the selected notes, and Clear all with a selection deletes only it, with no question', async () => {
    await reload()
    const texts = () => draw.texts(p)
    await clickAt([NOTES.D[0], NOTES.D[1] - 1])
    assert.deepEqual(await selectedTexts(), ['D'])
    await p.keyboard.press('Delete')
    assert.deepEqual((await texts()).sort(), ['A', 'B', 'C', 'E'])
    assert.equal(await savedNote('D'), undefined)
    await selectThree(true)
    assert.equal(await p.locator(CLEAR_BUTTON).getAttribute('aria-label'), 'Delete the selected notes')
    await p.click(CLEAR_BUTTON)
    assert.equal(await p.locator(DIALOG).count(), 0, 'no question asked')
    assert.deepEqual(await texts(), ['E'])
    assert.deepEqual((await saved()).map((item) => item.text), ['E'])
  })

  it('Clear all with nothing selected asks to clear every note', async () => {
    assert.equal(await p.locator(CLEAR_BUTTON).getAttribute('aria-label'), 'Clear all')
    await p.click(CLEAR_BUTTON)
    await p.locator(DIALOG).waitFor({ state: 'visible' })
    assert.match(await p.locator(DIALOG).textContent(), /Clear all notes\?/)
    // SudokuPad's dialog ignores a close until showDialog has cleared window.dialogJustShown.
    await p.waitForFunction(() => !window.dialogJustShown)
    await p.click(`${DIALOG} button:text-is("Cancel")`)
    await p.locator(DIALOG).waitFor({ state: 'detached' })
    assert.deepEqual(await draw.texts(p), ['E'], 'Cancel kept the note')
  })

  it('a right-click erase keeps the rest selected, a group move keeps every note in the window, leaving the tool ends the selection, and Backspace deletes it', async () => {
    const [F, G] = [[EMPTY[0], 4.5], [EMPTY[0], 6.5]]
    await typeText(F, 'F')
    await typeText(G, 'G')
    await clickAt(EMPTY)
    await shiftClickAt(F)
    await shiftClickAt(G)
    assert.deepEqual(await selectedTexts(), ['E', 'F', 'G'])
    await clickAt(F, { button: 'right' })
    assert.deepEqual(await selectedTexts(), ['E', 'G'])
    await p.click(`${KEYPAD} button[data-key="2"]`)
    assert.deepEqual(await Promise.all(['E', 'G'].map(async (t) => (await savedNote(t)).color)), [2, 2])
    // G is dragged to the window's left edge; E, five cells to its left, would go off the window.
    const [, y] = await gridPoint(p, G)
    await p.mouse.move(...await gridPoint(p, G))
    await p.mouse.down()
    await p.mouse.move(20, y, { steps: 10 })
    await p.mouse.up()
    const middles = await p.evaluate((selector) => [...document.querySelectorAll(selector)].map((e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] }), TEXTS)
    for (const [x, my] of middles) assert.equal(x >= 0 && my >= 0 && x <= 1200 && my <= 900, true, `a note's middle is at ${x}, ${my}`)
    assert.deepEqual(await selectedTexts(), ['E', 'G'])
    await p.click(DIGIT_BUTTON)
    await draw.pickDraw(p)
    assert.deepEqual(await selectedTexts(), [], 'leaving the tool ended the selection')
    await p.mouse.click(...middles[0])
    assert.equal(await selectedTexts().then((t) => t.length), 1)
    await p.keyboard.press('Backspace')
    assert.equal(await draw.texts(p).then((t) => t.length), 1, 'Backspace deleted the selected note')
  })

  it('the page shows no error', () => {
    assert.deepEqual(errors, [])
  })
})
