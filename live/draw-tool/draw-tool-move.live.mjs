// Live check of draw-tool.user.js's moving on sudokupad.app: a left-drag that starts on a stroke, a shape or a text moves it (live, and kept over a
// reload), a click on text still edits it, and a drag that starts off every item still draws, in every Shape mode. Real mouse input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint, mouseDrag } from '../pen.mjs'
import { settle } from '../settle.mjs'

const { SHAPE_BUTTON, SHAPES, STROKES, TEXT_BOX } = draw
// SudokuPad's board draws a cell 64 units wide from (0, 0); a real mouse lands on whole page pixels, so positions are checked to within a unit.
const CELL = 64
const NEAR_UNITS = 1.5
// In cells from the grid's top left: a stroke along row 2, a rectangle round r4c2 to r5c4, a text at r8c8, a press clear of all three.
const STROKE = [[1.5, 1.5], [1.6, 3], [1.5, 4.5]]
const RECT = [[3.2, 1.2], [4.8, 3.8]]
const TEXT_AT = [7.5, 7.5]
const EMPTY = [6.2, 4.5]
// Pressed on the stroke's second point and dragged by (dr, dc) cells.
const BY = [1, 2]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Draw Tool\'s moving', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const saved = () => draw.saved(p)
  // A reload leaves Draw not current.
  const reload = async () => {
    await draw.reload(p)
    await draw.pickDraw(p)
  }
  const texts = () => draw.texts(p)
  const mode = () => p.locator(SHAPE_BUTTON).getAttribute('data-mode')
  const near = (got, want) => got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) <= NEAR_UNITS)
  // A press at `from`, then a drag by BY, in cells.
  const dragBy = (from) => mouseDrag(p, [from, [from[0] + BY[0], from[1] + BY[1]]])
  const strokeNumbers = () => read((selector) => [...document.querySelectorAll(selector)].map((e) => e.getAttribute('d').match(/-?[\d.]+/g).map(Number)), STROKES)
  const shapeBoxes = () => read((selector) => [...document.querySelectorAll(selector)].map((e) => ['x', 'y', 'width', 'height'].map((a) => Number(e.getAttribute(a)))), SHAPES)
  const textAts = async () => (await saved()).filter((i) => i.kind === 'text').map((i) => i.at)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await reload()
    await draw.pickDraw(p)
  })
  after(async () => { await context.close() })

  it('a left-drag that starts on a stroke moves the whole stroke by the drag, and a reload keeps the new place', async () => {
    await mouseDrag(p, STROKE)
    const [before] = await strokeNumbers()
    await dragBy(STROKE[1])
    const [after] = await strokeNumbers()
    assert.equal((await strokeNumbers()).length, 1, 'no second stroke was drawn')
    assert.equal(near(after, before.map((v, i) => v + (i % 2 === 0 ? BY[1] : BY[0]) * CELL)), true, `the stroke ${after} moved from ${before} by ${BY} cells`)
    const [item] = await saved()
    assert.equal(near(item.points[1], [STROKE[1][1] * CELL + BY[1] * CELL, STROKE[1][0] * CELL + BY[0] * CELL]), true, `the saved middle point ${item.points[1]}`)
    await reload()
    assert.deepEqual(await settle(strokeNumbers, [after]), [after])
  })

  it('a left-drag that starts on a rectangle\'s edge moves the rectangle, in Shape mode too', async () => {
    await p.click(SHAPE_BUTTON)
    assert.equal(await mode(), 'rect')
    await mouseDrag(p, RECT)
    const [before] = await shapeBoxes()
    // On its top edge, in the middle.
    await dragBy([RECT[0][0], (RECT[0][1] + RECT[1][1]) / 2])
    const [after] = await shapeBoxes()
    assert.equal((await shapeBoxes()).length, 1, 'no second shape was drawn')
    assert.equal(near(after, [before[0] + BY[1] * CELL, before[1] + BY[0] * CELL, before[2], before[3]]), true, `the rectangle ${after} moved from ${before}`)
    await reload()
    assert.deepEqual(await settle(shapeBoxes, [after]), [after])
  })

  it('a click on text still edits it, and a left-drag that starts on it moves it and keeps the text', async () => {
    await p.click(SHAPE_BUTTON)
    await p.click(SHAPE_BUTTON)
    assert.equal(await mode(), 'off')
    await p.mouse.click(...await gridPoint(p, TEXT_AT))
    await p.keyboard.type('15')
    await p.keyboard.press('Enter')
    assert.deepEqual(await texts(), ['15'])
    await p.mouse.click(...await gridPoint(p, TEXT_AT))
    assert.equal(await p.locator(TEXT_BOX).inputValue(), '15', 'the click reopened the text')
    await p.keyboard.press('Escape')
    const [before] = await textAts()
    await dragBy(TEXT_AT)
    const [after] = await textAts()
    assert.equal(near(after, [before[0] + BY[1] * CELL, before[1] + BY[0] * CELL]), true, `the text ${after} moved from ${before}`)
    assert.equal(await p.locator(TEXT_BOX).count(), 0, 'no text box opened')
    assert.deepEqual(await texts(), ['15'])
    await reload()
    assert.deepEqual(await settle(textAts, [after]), [after])
  })

  it('a drag that starts off every item still draws a stroke, and Shift still makes it straight', async () => {
    const before = (await strokeNumbers()).length
    await mouseDrag(p, [EMPTY, [EMPTY[0] + 1, EMPTY[1] + 0.6], [EMPTY[0] + 0.5, EMPTY[1] + 2]])
    assert.equal((await strokeNumbers()).length, before + 1)
    await p.keyboard.down('Shift')
    await mouseDrag(p, [[8.6, 1.5], [8.2, 2.5], [8.7, 3.5]])
    await p.keyboard.up('Shift')
    const strokes = await strokeNumbers()
    assert.equal(strokes.length, before + 2)
    assert.equal(strokes[strokes.length - 1].length, 4, 'a straight line has two points')
  })

  it('the page shows no error', () => {
    assert.deepEqual(errors, [])
  })
})
