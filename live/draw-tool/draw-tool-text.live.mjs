// Live check of draw-tool.user.js's typed text on sudokupad.app: a click opens a text box whose keys never reach
// SudokuPad, Enter starts a new line, a click elsewhere and Escape end it, a click on a keypad color does not, a double-click on text edits it, and the Size slider. Real
// mouse and keyboard input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint, plantUnchecked } from '../pen.mjs'
import { readUntil, settle, stable } from '../settle.mjs'

const { COLOR_KEY, DIALOG, TEXT_BOX, TEXTS, STRIKE_PIECE, SIZE_SLIDER, WIDTH_KEY, slideTo, valueOf } = draw
// Points in cells from the grid's top left: r2c2's top left corner, where a cage sum goes, and three more spots.
const SUM_AT = [1.2, 1.2]
const SECOND_AT = [6.2, 3.25]
const THIRD_AT = [4.5, 7.5]
const FOURTH_AT = [7.5, 1.5]
const EMPTY_AT = [8.5, 0.5]
const MULTI_AT = [3.5, 5.5]
const MARKDOWN_AT = [5.5, 6.5]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s typed text', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const tool = () => draw.tool(p)
  const pickDraw = () => draw.pickDraw(p)
  const reload = () => draw.reload(p)
  const texts = () => draw.texts(p)
  const boxOpen = async () => (await p.locator(TEXT_BOX).count()) === 1
  const boxText = () => p.locator(TEXT_BOX).textContent()
  // Every cell's digit, mark and colour, so a key that reached SudokuPad shows as a change.
  const cellState = () => read(() => JSON.stringify(Framework.app.puzzle.cells.map((c) => [c.propGet('normal'), c.propGet('corner'), c.propGet('centre'), c.propGet('colour')])))
  const saved = () => draw.saved(p)
  const clickAt = async (at) => p.mouse.click(...await gridPoint(p, at))
  const doubleClickAt = async (at) => draw.reopen(p, await gridPoint(p, at))
  // The computed color and the size in board units of the text that reads `content`: a color with no alpha is solid.
  const textStyle = async (content) => {
    const { color, size } = (await draw.noteLooks(p)).find((note) => note.text === content)
    return { color, size }
  }
  const penColor = (n) => read((i) => window.getComputedStyle(document.documentElement).getPropertyValue(`--puzzle-pencolor-${i}`).trim(), n)
  // The text size the Size slider's width gives.
  const sizeShown = async () => 2 * await valueOf(p, SIZE_SLIDER) + 8
  const textInCells = (content) => draw.noteInCells(p, content)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), [COLOR_KEY, WIDTH_KEY])
    await reload()
  })
  after(async () => { await context.close() })

  it('a click opens a text box; typing 15 and Escape leaves the text 15 there, with no digit in a cell and no tool switched', async () => {
    await pickDraw()
    const cells = await cellState()
    const replay = await read(() => Framework.app.getReplay())
    await clickAt(SUM_AT)
    assert.equal(await boxOpen(), true, 'a text box is open')
    await p.keyboard.type('15')
    await draw.finishNote(p)
    assert.deepEqual(await texts(), ['15'])
    assert.equal(await boxOpen(), false, 'the box is closed')
    assert.equal(await cellState(), cells)
    assert.equal(await read(() => Framework.app.getReplay()), replay)
    assert.equal(await tool(), 'draw')
    assert.deepEqual(await textInCells('15'), SUM_AT)
  })

  it('keys that are tool keys or Shift in SudokuPad type into the box and switch no tool', async () => {
    await clickAt(SECOND_AT)
    await p.keyboard.type('Zx C')
    await p.keyboard.down('Shift')
    assert.equal(await tool(), 'draw', 'Shift held does not switch to Corner')
    await p.keyboard.press('KeyZ')
    await p.keyboard.up('Shift')
    await draw.finishNote(p)
    assert.deepEqual(await texts(), ['15', 'Zx CZ'])
    assert.equal(await tool(), 'draw')
  })

  it('the text is solid, in the current draw color, at the default size', async () => {
    assert.deepEqual(await textStyle('15'), { color: await penColor(1), size: 20 })
  })

  it('a click elsewhere finishes the box as Escape does, and opens no second box', async () => {
    await clickAt(THIRD_AT)
    await p.keyboard.type('7')
    await clickAt(EMPTY_AT)
    assert.deepEqual(await texts(), ['15', 'Zx CZ', '7'])
    assert.equal(await boxOpen(), false)
    assert.deepEqual((await saved()).map((item) => item.text), ['15', 'Zx CZ', '7'])
  })

  it('a box finished empty leaves no text', async () => {
    await clickAt(EMPTY_AT)
    await draw.finishNote(p)
    assert.equal(await boxOpen(), false)
    assert.deepEqual(await texts(), ['15', 'Zx CZ', '7'])
    assert.equal((await saved()).length, 3)
  })

  it('a double-click on text reopens it with its text, and Escape saves the change', async () => {
    await doubleClickAt(SUM_AT)
    assert.equal(await boxOpen(), true)
    assert.equal(await boxText(), '15', 'the open box holds the text')
    assert.deepEqual(await texts(), ['Zx CZ', '7'], 'the board leaves out the text the box holds')
    await p.keyboard.press('Backspace')
    await p.keyboard.press('Backspace')
    await p.keyboard.type('23')
    await draw.finishNote(p)
    assert.deepEqual(await texts(), ['23', 'Zx CZ', '7'])
    assert.deepEqual((await saved()).map((item) => item.text), ['23', 'Zx CZ', '7'])
  })

  it('clearing a reopened text removes it', async () => {
    await doubleClickAt(THIRD_AT)
    await p.keyboard.press('Backspace')
    await draw.finishNote(p)
    assert.deepEqual(await texts(), ['23', 'Zx CZ'])
    assert.deepEqual((await saved()).map((item) => item.text), ['23', 'Zx CZ'])
  })

  it('in the box, arrow keys move the caret and Delete deletes, as in any input, and reach no cell', async () => {
    const cells = await cellState()
    await doubleClickAt(SECOND_AT)
    await p.keyboard.press('Home')
    await p.keyboard.press('Delete')
    await p.keyboard.press('ArrowRight')
    await p.keyboard.type('y')
    await draw.finishNote(p)
    assert.deepEqual(await texts(), ['23', 'xy CZ'])
    assert.equal(await cellState(), cells)
    assert.equal(await tool(), 'draw')
  })

  it('Tab does nothing in the box: it stays open, and Escape then finishes it', async () => {
    await clickAt(EMPTY_AT)
    await p.keyboard.type('3')
    await p.keyboard.press('Tab')
    assert.equal(await boxOpen(), true)
    await draw.finishNote(p)
    assert.equal(await boxOpen(), false)
    assert.deepEqual(await texts(), ['23', 'xy CZ', '3'])
    await doubleClickAt(EMPTY_AT)
    await p.keyboard.press('Backspace')
    await draw.finishNote(p)
    assert.deepEqual(await texts(), ['23', 'xy CZ'])
  })

  it('with a box open, a click on a keypad color keeps it open, and the keys typed after go into it', async () => {
    await clickAt(FOURTH_AT)
    await p.keyboard.type('8')
    await p.click('.controls-input button[data-key="5"]')
    assert.equal(await boxOpen(), true)
    await p.keyboard.type('4')
    await draw.finishNote(p)
    assert.deepEqual(await texts(), ['23', 'xy CZ', '84'])
    assert.deepEqual((await saved()).map((item) => item.text), ['23', 'xy CZ', '84'])
  })

  it('with a box open, opening SudokuPad\'s settings finishes it, and a key typed in the dialog reaches no drawing', async () => {
    await clickAt(EMPTY_AT)
    await p.keyboard.type('5')
    await p.click('#control-settings')
    await p.locator(DIALOG).waitFor({ state: 'visible' })
    assert.equal(await boxOpen(), false)
    assert.deepEqual(await texts(), ['23', 'xy CZ', '84', '5'])
    await p.keyboard.type('9')
    assert.deepEqual(await texts(), ['23', 'xy CZ', '84', '5'])
    await draw.finishNote(p)
    await p.locator(DIALOG).waitFor({ state: 'detached' })
    await doubleClickAt(EMPTY_AT)
    await p.keyboard.press('Backspace')
    await draw.finishNote(p)
    assert.deepEqual(await texts(), ['23', 'xy CZ', '84'])
  })

  it('the Size slider sets the next text\'s size to the size picked; the earlier text is unchanged, and every note is solid', async () => {
    assert.equal(await sizeShown(), 20)
    await slideTo(p, SIZE_SLIDER, 9)
    await p.click('.controls-input button[data-key="4"]')
    await clickAt(THIRD_AT)
    await p.keyboard.type('6')
    await draw.finishNote(p)
    assert.deepEqual(await textStyle('6'), { color: await penColor(4), size: 26 })
    assert.deepEqual(await textStyle('23'), { color: await penColor(1), size: 20 })
  })

  it('the text and the size come back after a reload', async () => {
    const before = await texts()
    await reload()
    assert.deepEqual(await settle(texts, before), before)
    await pickDraw()
    assert.equal(await sizeShown(), 26)
  })

  it('a bad saved size reads as the default', async () => {
    await plantUnchecked(p, WIDTH_KEY, '"huge"')
    await reload()
    await pickDraw()
    assert.equal(await sizeShown(), 20)
  })

  it('after a window resize each text still sits over the cells it was typed on', async () => {
    const before = await textInCells('23')
    const cellWidth = () => read(() => Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect().width)
    const cellWidthBefore = await cellWidth()
    await p.setViewportSize({ width: 800, height: 1000 })
    const after = await stable(() => textInCells('23'))
    assert.notEqual(await cellWidth(), cellWidthBefore, 'the resize changed the board\'s size')
    assert.deepEqual(after, before)
  })

  it('Enter starts a new line in the box and leaves the box open; Escape ends it with both lines, and a reload keeps them', async () => {
    await clickAt(MULTI_AT)
    await p.keyboard.type('top')
    await p.keyboard.press('Enter')
    await p.keyboard.type('low')
    assert.equal(await boxOpen(), true, 'Enter did not finish the box')
    assert.equal(await boxText(), 'top\nlow')
    await draw.finishNote(p)
    assert.deepEqual((await saved()).map((item) => item.text).slice(-1), ['top\nlow'], 'saved with a line break')
    assert.deepEqual((await texts()).slice(-1), ['top\nlow'])
    await reload()
    assert.deepEqual((await readUntil(texts, (t) => t.includes('top\nlow'))).slice(-1), ['top\nlow'], 'back after a reload')
  })

  it('a finished note shows markdown styled and hides the markers; editing it shows the raw text, which is what is saved', async () => {
    await pickDraw()
    await clickAt(MARKDOWN_AT)
    await p.keyboard.type('**a** *b* ~~c~~')
    assert.equal(await boxText(), '**a** *b* ~~c~~', 'the markers show while typing')
    await draw.finishNote(p)
    assert.deepEqual((await saved()).map((item) => item.text).slice(-1), ['**a** *b* ~~c~~'], 'the raw markdown is stored')
    // A struck run is drawn by a line across each of its pieces: the piece's ::after has a height and the run's color.
    const spans = await read(([selector, piece]) => [...document.querySelectorAll(`${selector} span:not(${piece})`)].map((e) => {
      const style = window.getComputedStyle(e)
      const line = e.querySelector(piece) && window.getComputedStyle(e.querySelector(piece), '::after')
      return { text: e.textContent, bold: Number(style.fontWeight) >= 700, italic: style.fontStyle === 'italic', strike: Boolean(line) && parseFloat(line.height) > 0 && line.backgroundColor === style.color }
    }), [TEXTS, STRIKE_PIECE])
    assert.deepEqual(spans, [
      { text: 'a', bold: true, italic: false, strike: false },
      { text: 'b', bold: false, italic: true, strike: false },
      { text: 'c', bold: false, italic: false, strike: true }
    ])
    assert.deepEqual((await texts()).slice(-1), ['a b c'])
    await doubleClickAt(MARKDOWN_AT)
    assert.equal(await boxText(), '**a** *b* ~~c~~', 'editing shows the raw text again')
    await draw.finishNote(p)
  })

  it('a note has a halo in the page color: a ring of sixteen shadows with no blur', async () => {
    const halo = await read((selector) => {
      const style = window.getComputedStyle(document.querySelector(selector))
      const probe = document.createElement('div')
      probe.style.color = 'var(--body-bg, #fff)'
      document.body.appendChild(probe)
      const page = window.getComputedStyle(probe).color
      probe.remove()
      return { shadows: style.textShadow, page, stroke: parseFloat(style.webkitTextStrokeWidth) }
    }, TEXTS)
    const rings = [...halo.shadows.matchAll(/(rgb\([^)]*\)) (-?[\d.]+)px (-?[\d.]+)px 0px/g)]
    assert.equal(rings.length, 16, halo.shadows)
    for (const [, color] of rings) assert.equal(color, halo.page)
    assert.equal(halo.stroke, 0, 'no stroke, whose miters grow spikes')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
