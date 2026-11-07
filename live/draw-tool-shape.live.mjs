// Live check of draw-tool.user.js's Shape mode on sudokupad.app: the Shape button's steps and saved mode, a rectangle that
// boxes whole cells from near-corner drags, a centre-to-centre drag that boxes on the centre lines, Alt for the drag's own box, an ellipse, a click that still starts text, a right-drag that erases a
// shape, shapes kept over a reload, and Clear all. Real mouse input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from './page.mjs'
import { gridPoint, mouseDrag } from './pen.mjs'
import { settle } from './settle.mjs'

const { CLEAR_BUTTON, DIALOG, SHAPE_BUTTON, SHAPE_KEY, SHAPES, STROKES, TEXT_BOX } = draw
// SudokuPad's board draws a cell 64 units wide from (0, 0).
const CELL = 64
// A drag from near r2c2's top left corner to near r4c5's bottom right corner, in cells from the grid's top left.
const CORNER_FROM = [1.1, 1.05]
const CORNER_TO = [3.9, 4.95]
// A drag off the quarter lines, from r2c2 to r4c5.
const FROM = [1.3, 1.4]
const TO = [3.6, 4.2]
// The cells it spans, r2c2 to r4c5, by their edges: [left, top, right, bottom].
const CELL_BOX = [1 * CELL, 1 * CELL, 5 * CELL, 4 * CELL]
// The drag's own box, in board units; a real mouse lands on whole page pixels, so it is checked to within a unit.
const DRAG_BOX = [FROM[1] * CELL, FROM[0] * CELL, TO[1] * CELL, TO[0] * CELL]
// A drag from the middle of r8c8 to the middle of r9c9 boxes the centre lines.
const CENTRE_BOX = [7.5 * CELL, 7.5 * CELL, 8.5 * CELL, 8.5 * CELL]
const NEAR_UNITS = 1

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Draw Tool\'s Shape mode', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const pickDraw = () => draw.pickDraw(p)
  const saved = () => draw.saved(p)
  const reload = () => draw.reload(p)
  const mode = () => p.locator(SHAPE_BUTTON).getAttribute('data-mode')
  const savedMode = () => read((key) => Framework.getData(key) ?? null, SHAPE_KEY)
  // Each shape on the board: its element and the geometry it is drawn with.
  const shapes = () => read((selector) => [...document.querySelectorAll(selector)].map((e) => ({
    tag: e.tagName,
    geometry: ['x', 'y', 'width', 'height', 'cx', 'cy', 'rx', 'ry'].filter((a) => e.hasAttribute(a)).map((a) => Number(e.getAttribute(a)))
  })), SHAPES)
  const stepTo = async (wanted) => {
    for (let i = 0; i < 3 && await mode() !== wanted; i++) await p.click(SHAPE_BUTTON)
    assert.equal(await mode(), wanted)
  }
  const near = (got, want) => got.every((v, i) => Math.abs(v - want[i]) <= NEAR_UNITS)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await read((key) => Framework.removeData(key), SHAPE_KEY)
    await reload()
    await pickDraw()
  })
  after(async () => { await context.close() })

  it('the Shape button starts Off and steps Rectangle, Ellipse and back to Off, each saved and named in its label', async () => {
    assert.equal(await mode(), 'off')
    const steps = []
    for (let i = 0; i < 3; i++) {
      await p.click(SHAPE_BUTTON)
      steps.push([await mode(), await savedMode(), await p.locator(SHAPE_BUTTON).getAttribute('title')])
    }
    assert.deepEqual(steps, [['rect', 'rect', 'Shape: rectangle'], ['ellipse', 'ellipse', 'Shape: ellipse'], ['off', 'off', 'Shape: off, free lines']])
  })

  it('a drag in Rectangle mode between two cell corners draws a rectangle of whole cells, and draws no stroke', async () => {
    await stepTo('rect')
    await mouseDrag(p, [CORNER_FROM, [2.5, 3], CORNER_TO])
    const [left, top, right, bottom] = CELL_BOX
    assert.deepEqual(await shapes(), [{ tag: 'rect', geometry: [left, top, right - left, bottom - top] }])
    assert.equal(await p.locator(STROKES).count(), 0)
    const [item] = await saved()
    assert.deepEqual([item.kind, item.shape, item.box], ['shape', 'rect', CELL_BOX])
  })

  it('a drag between two cell centres draws a rectangle on those centre lines', async () => {
    const before = await shapes()
    await mouseDrag(p, [[7.5, 7.5], [7.8, 8], [8.5, 8.5]])
    const drawn = await shapes()
    assert.equal(drawn.length, before.length + 1)
    const [left, top, right, bottom] = CENTRE_BOX
    assert.deepEqual(drawn[drawn.length - 1], { tag: 'rect', geometry: [left, top, right - left, bottom - top] })
    const items = await saved()
    assert.deepEqual(items[items.length - 1].box, CENTRE_BOX)
    // Erased again across its right edge, so the tests below see the shapes they expect.
    await mouseDrag(p, [[8, 8.4], [8, 8.6]], { button: 'right' })
    assert.deepEqual(await settle(shapes, before), before)
  })

  it('with Alt held the rectangle follows the drag, and Draw stays the tool', async () => {
    await p.keyboard.down('Alt')
    try {
      assert.equal(await draw.tool(p), 'draw', 'Alt switched to no other tool')
      await mouseDrag(p, [FROM, [2.5, 3], TO])
    } finally {
      await p.keyboard.up('Alt')
    }
    const items = await saved()
    const box = items[items.length - 1].box
    assert.equal(near(box, DRAG_BOX), true, `the box ${box} is the drag's ${DRAG_BOX}`)
  })

  it('an Alt drag straight down a column, a box with no width, saves no shape', async () => {
    const before = await saved()
    const drawn = await shapes()
    await p.keyboard.down('Alt')
    try {
      await mouseDrag(p, [[1.3, 6.4], [3.6, 6.4]])
    } finally {
      await p.keyboard.up('Alt')
    }
    assert.deepEqual(await saved(), before)
    assert.deepEqual(await shapes(), drawn)
  })

  it('a drag in Ellipse mode draws an ellipse in the same snapped box', async () => {
    await stepTo('ellipse')
    await mouseDrag(p, [[6.05, 6.05], [7, 7], [7.95, 7.95]])
    const [left, top, right, bottom] = [6 * CELL, 6 * CELL, 8 * CELL, 8 * CELL]
    const drawn = await shapes()
    assert.deepEqual(drawn[drawn.length - 1], { tag: 'ellipse', geometry: [(left + right) / 2, (top + bottom) / 2, (right - left) / 2, (bottom - top) / 2] })
    const items = await saved()
    assert.deepEqual([items[items.length - 1].shape, items[items.length - 1].box], ['ellipse', [left, top, right, bottom]])
  })

  it('a click in Shape mode starts a text and draws no shape', async () => {
    const before = await shapes()
    await p.mouse.click(...await gridPoint(p, [5.5, 0.5]))
    await p.locator(TEXT_BOX).waitFor({ state: 'visible' })
    await p.keyboard.press('Escape')
    await p.locator(TEXT_BOX).waitFor({ state: 'detached' })
    assert.deepEqual(await shapes(), before)
  })

  it('a right-drag across the cell rectangle\'s outline erases it and keeps the others, and a reload shows the same', async () => {
    // Across the cell rectangle's right edge, in r3: the Alt rectangle inside it ends most of a cell short of that edge.
    await mouseDrag(p, [[2.5, 4.8], [2.5, 5.2]], { button: 'right' })
    const kept = await shapes()
    assert.deepEqual(kept.map((s) => s.tag), ['rect', 'ellipse'])
    assert.equal(near(kept[0].geometry, [DRAG_BOX[0], DRAG_BOX[1], DRAG_BOX[2] - DRAG_BOX[0], DRAG_BOX[3] - DRAG_BOX[1]]), true, 'the Alt rectangle is the one kept')
    assert.deepEqual((await saved()).map((item) => item.shape), ['rect', 'ellipse'])
    await reload()
    assert.deepEqual(await settle(shapes, kept), kept)
  })

  it('the Shape mode comes back after a reload', async () => {
    await pickDraw()
    assert.equal(await mode(), 'ellipse')
  })

  it('Clear all erases the shapes', async () => {
    await p.click(CLEAR_BUTTON)
    await p.locator(DIALOG).waitFor({ state: 'visible' })
    await p.waitForFunction(() => !window.dialogJustShown)
    await p.locator(`${DIALOG} button`).filter({ hasText: 'OK' }).click()
    assert.deepEqual(await settle(shapes, []), [])
    assert.equal(await saved(), null)
  })

  it('the page raised no error', () => { assert.deepEqual(errors, []) })
})
