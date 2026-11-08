// Live check of draw-tool.user.js on sudokupad.app, in headless Chromium, with real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { boot, DIGIT_BUTTON, DRAW_BUTTON, noteInCells as cellsOf, NOT_NOTES, pickDraw as pick, TEXTS, texts, TOOL_KEYS, topmostAtNotes, tool as toolOf } from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint, mouseDrag } from '../pen.mjs'
import { settle, stable } from '../settle.mjs'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const tool = () => toolOf(p)
  const selected = () => p.evaluate(() => Framework.app.puzzle.selectedCells.length)
  const noteInCells = () => cellsOf(p, '15')
  const cellWidth = () => p.evaluate(() => Math.round(Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect().width))
  const pickDraw = () => pick(p)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await boot(p)
  })
  after(async () => { await context.close() })

  it('the Text Anywhere button sits among the tool buttons, and picking it makes it the current tool', async () => {
    assert.equal(await p.locator(`.controls-tool ${DRAW_BUTTON}`).count(), 1)
    assert.equal(await p.locator(DRAW_BUTTON).textContent(), 'Text')
    assert.equal(await p.locator(DRAW_BUTTON).getAttribute('title'), 'Text Anywhere')
    assert.equal(await pickDraw(), 'draw')
  })

  // Without the script the four tools take Z X C V, and B N M switch to nothing. Draw, fifth, would get B.
  it('no tool key switches to Draw, and each key does what it does without the script', async () => {
    await p.click(DIGIT_BUTTON)
    const reached = []
    for (const key of TOOL_KEYS) {
      await p.keyboard.press(key)
      reached.push(await tool())
    }
    assert.deepEqual(reached, ['normal', 'corner', 'centre', 'colour', 'colour', 'colour', 'colour'])
  })

  // Turned on after Draw, the pen tool comes after it in getToolNames(); without Draw it would be fifth, on B.
  it('a pen tool turned on after Draw keeps its key B', async () => {
    await p.evaluate(() => Framework.setSetting('toolpen', true))
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await p.click(DIGIT_BUTTON)
    await p.keyboard.press('b')
    assert.equal(await settle(tool, 'pen'), 'pen')
    await p.keyboard.press('n')
    assert.equal(await tool(), 'pen', 'N switches to nothing')
    await p.evaluate(() => Framework.setSetting('toolpen', false))
  })

  it('a left click leaves one note above the digits and selects no cell', async () => {
    await pickDraw()
    await p.evaluate(() => Framework.app.deselect())
    await p.mouse.click(...await gridPoint(p, [2.5, 2.5]))
    await p.keyboard.type('15')
    await p.keyboard.press('Escape')
    assert.deepEqual(await texts(p), ['15'])
    assert.equal(await selected(), 0, 'no cell selected')
    assert.equal(await tool(), 'draw')
    // The note is over r3c3's given 8.
    assert.deepEqual(await topmostAtNotes(p), ['note'], 'the note is drawn above the digit under it')
  })

  it('a drag that starts on no note draws nothing and selects no cell', async () => {
    await mouseDrag(p, [[5.5, 1.5], [6, 3], [5.5, 4.5]])
    assert.equal(await p.locator(NOT_NOTES).count(), 0, 'nothing but the note is drawn')
    assert.deepEqual(await texts(p), ['15'])
    assert.equal(await selected(), 0, 'no cell selected')
  })

  it('Shift held with a drag stays in Text Anywhere and selects no cell', async () => {
    await p.keyboard.down('Shift')
    await mouseDrag(p, [[7.5, 1.5], [7.5, 4]])
    await p.keyboard.up('Shift')
    assert.equal(await tool(), 'draw', 'Shift did not switch to Corner')
    assert.equal(await selected(), 0, 'no cell selected')
    assert.equal(await p.locator(NOT_NOTES).count(), 0)
  })

  it('after a window resize each note still sits over the cells it was typed on', async () => {
    const before = await noteInCells()
    const cellWidthBefore = await cellWidth()
    await p.setViewportSize({ width: 800, height: 1000 })
    const after = await stable(noteInCells)
    assert.notEqual(await cellWidth(), cellWidthBefore, 'the resize changed the board\'s size')
    assert.deepEqual(after, before)
    await p.setViewportSize({ width: 1200, height: 900 })
  })

  it('with another tool current the note stays visible and a drag selects cells as it does without the script', async () => {
    await p.click(DIGIT_BUTTON)
    assert.equal(await tool(), 'normal')
    assert.deepEqual(await texts(p), ['15'])
    assert.equal(await p.locator(TEXTS).first().isVisible(), true)
    await p.evaluate(() => Framework.app.deselect())
    await mouseDrag(p, [[0.5, 0.5], [0.5, 2.5]])
    assert.equal(await selected(), 3, 'the drag selected r1c1 to r1c3')
    assert.deepEqual(await texts(p), ['15'], 'no note was made')
  })

  it('the note takes the pointer only while Text Anywhere is current, and shows the board\'s cursor', async () => {
    const underNoteMiddle = () => p.evaluate((selector) => {
      const note = document.querySelector(selector)
      const { x, y, width, height } = note.getBoundingClientRect()
      return note.contains(document.elementFromPoint(x + width / 2, y + height / 2))
    }, TEXTS)
    const otherTool = await underNoteMiddle()
    await pickDraw()
    const textAnnotation = await underNoteMiddle()
    const cursors = await p.evaluate((selector) => [document.querySelector(selector), Framework.app.svgRenderer.getElem()].map((e) => window.getComputedStyle(e).cursor), TEXTS)
    await p.click(DIGIT_BUTTON)
    assert.deepEqual({ otherTool, textAnnotation, back: await underNoteMiddle() }, { otherTool: false, textAnnotation: true, back: false })
    assert.equal(cursors[0], cursors[1], 'the note shows the board\'s cursor')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

// Test Markup is SudokuPad's own Experimental freehand drawing, on a fabric.js canvas over the page while M is held.
describe('Text Anywhere with SudokuPad\'s Test Markup turned on', { concurrency: false }, () => {
  let context, p, errors

  const markupDrawing = () => p.evaluate(() => Framework.features.markup.fabcan.isDrawingMode)
  const markupStrokes = () => p.evaluate(() => Framework.features.markup.fabcan.getObjects().length)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await boot(p)
    await p.evaluate(() => Framework.setSetting('markup', true))
    await p.locator('.fabcan canvas').first().waitFor({ state: 'attached' })
  })
  after(async () => {
    await p.evaluate(() => Framework.setSetting('markup', false))
    await context.close()
  })

  it('a click makes a note and a right click on it erases it', async () => {
    await pick(p)
    await p.mouse.click(...await gridPoint(p, [3.5, 3.5]))
    await p.keyboard.type('15')
    await p.keyboard.press('Escape')
    assert.deepEqual(await texts(p), ['15'])
    await p.mouse.click(...await gridPoint(p, [3.5, 3.5]), { button: 'right' })
    assert.deepEqual(await texts(p), [])
  })

  it('holding M with Text Anywhere current draws with Test Markup, not a note, and its release ends it', async () => {
    await p.keyboard.down('m')
    assert.equal(await settle(markupDrawing, true), true)
    await mouseDrag(p, [[5.5, 1.5], [6, 3], [5.5, 4.5]])
    await p.keyboard.up('m')
    assert.equal(await settle(markupDrawing, false), false)
    assert.equal(await markupStrokes(), 1)
    assert.deepEqual(await texts(p), [])
    assert.equal(await toolOf(p), 'draw')
  })

  it('an M typed in a text box goes into the text and starts no Test Markup', async () => {
    await p.mouse.click(...await gridPoint(p, [7.5, 7.5]))
    await p.keyboard.down('m')
    assert.equal(await markupDrawing(), false)
    await p.keyboard.up('m')
    await p.keyboard.press('Escape')
    assert.deepEqual(await texts(p), ['m'])
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
