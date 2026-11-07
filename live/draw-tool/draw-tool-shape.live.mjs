// Live check of draw-tool.user.js's Shape mode on sudokupad.app: the Shape button's steps and saved mode, a rectangle and
// an ellipse that follow the drag's own box with no snapping, a drag along a row that saves nothing, a click that still starts text, a right-drag that erases a
// shape, shapes kept over a reload, and Clear all. Real mouse input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint, mouseDrag } from '../pen.mjs'
import { settle } from '../settle.mjs'

const { CLEAR_BUTTON, DIALOG, SHAPE_BUTTON, SHAPE_KEY, SHAPES, STROKES, TEXT_BOX } = draw
// SudokuPad's board draws a cell 64 units wide from (0, 0).
const CELL = 64
// A drag from r2c2 to r4c5, in cells from the grid's top left.
const FROM = [1.3, 1.4]
const TO = [3.6, 4.2]
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
    assert.deepEqual(steps, [['rect', 'rect', 'Shape: rectangle. Click for ellipse'], ['ellipse', 'ellipse', 'Shape: ellipse. Click for off, free lines'], ['off', 'off', 'Shape: off, free lines. Click for rectangle']])
  })

  // What the button draws, and the picture masking each color button's swatch, as the first shape element's tag in each.
  const pictures = () => read(({ button, keypad }) => {
    const tagOf = (svg) => /<(path|rect|ellipse)[ />]/.exec(svg)?.[1]
    const maskOf = (b) => decodeURIComponent(/url\("data:image\/svg\+xml,([^"]*)"\)/.exec(window.getComputedStyle(b, '::after').maskImage)[1])
    return {
      button: [...document.querySelector(button).querySelectorAll('svg > g:first-of-type > *')].map((e) => e.tagName.toLowerCase()),
      dots: [...document.querySelectorAll(`${button} circle`)].map((c) => c.dataset.shapeDot),
      swatches: [...document.querySelectorAll(`${keypad} button.digit:not([data-key="0"])`)].map((b) => tagOf(maskOf(b)))
    }
  }, { button: SHAPE_BUTTON, keypad: draw.KEYPAD })

  it('the Shape button draws the mode a press turns to, with a dot per mode, and every color swatch draws the current mode', async () => {
    const seen = []
    for (const wanted of ['off', 'rect', 'ellipse']) {
      await stepTo(wanted)
      seen.push([wanted, await pictures()])
    }
    const nine = (tag) => Array(9).fill(tag)
    assert.deepEqual(seen, [
      ['off', { button: ['rect'], dots: ['filled', 'outline', 'outline'], swatches: nine('path') }],
      ['rect', { button: ['ellipse'], dots: ['outline', 'filled', 'outline'], swatches: nine('rect') }],
      ['ellipse', { button: ['path'], dots: ['outline', 'outline', 'filled'], swatches: nine('ellipse') }]
    ])
    await stepTo('off')
  })

  it('a saved mode shows its swatches on load', async () => {
    await stepTo('ellipse')
    await reload()
    await pickDraw()
    assert.deepEqual((await pictures()).swatches, Array(9).fill('ellipse'))
    await stepTo('off')
  })

  it('a drag in Rectangle mode draws a rectangle on exactly the drag box, and draws no stroke', async () => {
    await stepTo('rect')
    await mouseDrag(p, [FROM, [2.5, 3], TO])
    const [shape] = await shapes()
    assert.equal(shape.tag, 'rect')
    assert.equal(near(shape.geometry, [DRAG_BOX[0], DRAG_BOX[1], DRAG_BOX[2] - DRAG_BOX[0], DRAG_BOX[3] - DRAG_BOX[1]]), true, `the rectangle ${shape.geometry} is the drag's ${DRAG_BOX}`)
    assert.equal(await p.locator(STROKES).count(), 0)
    const [item] = await saved()
    assert.deepEqual([item.kind, item.shape], ['shape', 'rect'])
    assert.equal(near(item.box, DRAG_BOX), true, `the saved box ${item.box} is the drag's ${DRAG_BOX}`)
  })

  it('a drag between two cell centres draws a rectangle on those centre lines', async () => {
    const before = await shapes()
    await mouseDrag(p, [[7.5, 7.5], [7.8, 8], [8.5, 8.5]])
    const drawn = await shapes()
    assert.equal(drawn.length, before.length + 1)
    const [left, top, right, bottom] = CENTRE_BOX
    assert.equal(near(drawn[drawn.length - 1].geometry, [left, top, right - left, bottom - top]), true)
    // Erased again across its right edge, so the tests below see the shapes they expect.
    await mouseDrag(p, [[8, 8.4], [8, 8.6]], { button: 'right' })
    assert.deepEqual(await settle(shapes, before), before)
  })

  it('a drag straight along a row, a box with no height, saves no shape', async () => {
    const before = await saved()
    const drawn = await shapes()
    await mouseDrag(p, [[6.4, 1.3], [6.4, 3.6]])
    assert.deepEqual(await saved(), before)
    assert.deepEqual(await shapes(), drawn)
  })

  it('a drag in Ellipse mode draws an ellipse in the drag box', async () => {
    await stepTo('ellipse')
    await mouseDrag(p, [[6.45, 6.45], [7, 7], [7.55, 7.55]])
    const [left, top, right, bottom] = [6.45 * CELL, 6.45 * CELL, 7.55 * CELL, 7.55 * CELL]
    const drawn = await shapes()
    const last = drawn[drawn.length - 1]
    assert.equal(last.tag, 'ellipse')
    assert.equal(near(last.geometry, [(left + right) / 2, (top + bottom) / 2, (right - left) / 2, (bottom - top) / 2]), true)
    const items = await saved()
    assert.equal(items[items.length - 1].shape, 'ellipse')
    assert.equal(near(items[items.length - 1].box, [left, top, right, bottom]), true)
  })

  it('a click in Shape mode starts a text and draws no shape', async () => {
    const before = await shapes()
    await p.mouse.click(...await gridPoint(p, [5.5, 0.5]))
    await p.locator(TEXT_BOX).waitFor({ state: 'visible' })
    await p.keyboard.press('Escape')
    await p.locator(TEXT_BOX).waitFor({ state: 'detached' })
    assert.deepEqual(await shapes(), before)
  })

  it('a right-drag across the rectangle\'s outline erases it and keeps the ellipse, and a reload shows the same', async () => {
    // Across the rectangle's right edge, in r3.
    await mouseDrag(p, [[2.5, 4], [2.5, 4.4]], { button: 'right' })
    const kept = await shapes()
    assert.deepEqual(kept.map((s) => s.tag), ['ellipse'])
    assert.deepEqual((await saved()).map((item) => item.shape), ['ellipse'])
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
