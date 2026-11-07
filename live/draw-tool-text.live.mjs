// Live check of draw-tool.user.js's typed text on sudokupad.app: a click opens a text box whose keys never reach
// SudokuPad, Enter, a click elsewhere and Escape end it, a click on text edits it, and the text size control. Real
// mouse and keyboard input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from './page.mjs'
import { gridPoint, plantUnchecked } from './pen.mjs'
import { settle, stable } from './settle.mjs'

const { COLOR_KEY, DIALOG, PANEL_BOX, TEXT_BOX, TEXT_SIZE_KEY, TEXTS } = draw
const SIZE_BUTTONS = `${PANEL_BOX} button[data-text-size]`
// Points in cells from the grid's top left: r2c2's top left corner, where a cage sum goes, and three more spots.
const SUM_AT = [1.2, 1.2]
const SECOND_AT = [6.2, 3.25]
const THIRD_AT = [4.5, 7.5]
const FOURTH_AT = [7.5, 1.5]
const EMPTY_AT = [8.5, 0.5]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Draw Tool\'s typed text', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const tool = () => draw.tool(p)
  const pickDraw = () => draw.pickDraw(p)
  const reload = () => draw.reload(p)
  const texts = () => draw.texts(p)
  const boxOpen = async () => (await p.locator(TEXT_BOX).count()) === 1
  const boxText = () => p.locator(TEXT_BOX).inputValue()
  // Every cell's digit, mark and colour, so a key that reached SudokuPad shows as a change.
  const cellState = () => read(() => JSON.stringify(Framework.app.puzzle.cells.map((c) => [c.propGet('normal'), c.propGet('corner'), c.propGet('centre'), c.propGet('colour')])))
  const saved = () => draw.saved(p)
  const clickAt = async (at) => p.mouse.click(...await gridPoint(p, at))
  // The computed fill, fill opacity and font size of the text that reads `content`.
  const textStyle = (content) => read(([selector, want]) => {
    const style = window.getComputedStyle([...document.querySelectorAll(selector)].find((t) => t.textContent === want))
    return { fill: style.fill, opacity: style.fillOpacity, size: style.fontSize }
  }, [TEXTS, content])
  const penColor = (n) => read((i) => window.getComputedStyle(document.documentElement).getPropertyValue(`--puzzle-pencolor-${i}`).trim(), n)
  const currentSize = () => read((selector) => [...document.querySelectorAll(selector)].filter((b) => b.classList.contains('current')).map((b) => Number(b.dataset.textSize)), SIZE_BUTTONS)
  // The middle of the text that reads `content`, in cells from the grid's top left.
  const textInCells = (content) => read(([selector, want]) => {
    const t = [...document.querySelectorAll(selector)].find((e) => e.textContent === want).getBoundingClientRect()
    const cell = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
    return [(t.y + t.height / 2 - cell.y) / cell.height, (t.x + t.width / 2 - cell.x) / cell.width].map((v) => Math.round(v * 10) / 10)
  }, [TEXTS, content])

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), [COLOR_KEY, TEXT_SIZE_KEY])
    await reload()
  })
  after(async () => { await context.close() })

  it('a click opens a text box; typing 15 and Enter leaves the text 15 there, with no digit in a cell and no tool switched', async () => {
    await pickDraw()
    const cells = await cellState()
    const replay = await read(() => Framework.app.getReplay())
    await clickAt(SUM_AT)
    assert.equal(await boxOpen(), true, 'a text box is open')
    await p.keyboard.type('15')
    await p.keyboard.press('Enter')
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
    await p.keyboard.press('Enter')
    assert.deepEqual(await texts(), ['15', 'Zx CZ'])
    assert.equal(await tool(), 'draw')
  })

  it('the text is solid, in the current pen color, at the middle text size', async () => {
    assert.deepEqual(await textStyle('15'), { fill: await penColor(1), opacity: '1', size: '20px' })
  })

  it('a click elsewhere finishes the box as Enter does, and opens no second box', async () => {
    await clickAt(THIRD_AT)
    await p.keyboard.type('7')
    await clickAt(EMPTY_AT)
    assert.deepEqual(await texts(), ['15', 'Zx CZ', '7'])
    assert.equal(await boxOpen(), false)
    assert.deepEqual((await saved()).map((item) => item.text), ['15', 'Zx CZ', '7'])
  })

  it('Escape on a new box leaves no text', async () => {
    await clickAt(EMPTY_AT)
    await p.keyboard.type('9')
    await p.keyboard.press('Escape')
    assert.equal(await boxOpen(), false)
    assert.deepEqual(await texts(), ['15', 'Zx CZ', '7'])
  })

  it('a box finished empty leaves no text', async () => {
    await clickAt(EMPTY_AT)
    await p.keyboard.press('Enter')
    assert.equal(await boxOpen(), false)
    assert.deepEqual(await texts(), ['15', 'Zx CZ', '7'])
    assert.equal((await saved()).length, 3)
  })

  it('a click on text reopens it with its text, and Enter saves the change', async () => {
    await clickAt(SUM_AT)
    assert.equal(await boxOpen(), true)
    assert.equal(await boxText(), '15', 'the open box holds the text')
    assert.deepEqual(await texts(), ['Zx CZ', '7'], 'the board leaves out the text the box holds')
    await p.keyboard.press('Backspace')
    await p.keyboard.press('Backspace')
    await p.keyboard.type('23')
    await p.keyboard.press('Enter')
    assert.deepEqual(await texts(), ['23', 'Zx CZ', '7'])
    assert.deepEqual((await saved()).map((item) => item.text), ['23', 'Zx CZ', '7'])
  })

  it('Escape on a reopened box restores the text it had', async () => {
    await clickAt(SUM_AT)
    await p.keyboard.press('Backspace')
    await p.keyboard.type('x')
    await p.keyboard.press('Escape')
    assert.deepEqual(await texts(), ['23', 'Zx CZ', '7'])
  })

  it('clearing a reopened text removes it', async () => {
    await clickAt(THIRD_AT)
    await p.keyboard.press('Backspace')
    await p.keyboard.press('Enter')
    assert.deepEqual(await texts(), ['23', 'Zx CZ'])
    assert.deepEqual((await saved()).map((item) => item.text), ['23', 'Zx CZ'])
  })

  it('in the box, arrow keys move the caret and Delete deletes, as in any input, and reach no cell', async () => {
    const cells = await cellState()
    await clickAt(SECOND_AT)
    await p.keyboard.press('Home')
    await p.keyboard.press('Delete')
    await p.keyboard.press('ArrowRight')
    await p.keyboard.type('y')
    await p.keyboard.press('Enter')
    assert.deepEqual(await texts(), ['23', 'xy CZ'])
    assert.equal(await cellState(), cells)
    assert.equal(await tool(), 'draw')
  })

  it('with a box open, a click on a keypad color finishes it, and a key typed after reaches no drawing', async () => {
    await clickAt(FOURTH_AT)
    await p.keyboard.type('8')
    await p.click('.controls-input button[data-key="5"]')
    assert.equal(await boxOpen(), false)
    assert.deepEqual(await texts(), ['23', 'xy CZ', '8'])
    await p.keyboard.type('4')
    assert.deepEqual(await texts(), ['23', 'xy CZ', '8'])
    assert.deepEqual((await saved()).map((item) => item.text), ['23', 'xy CZ', '8'])
  })

  it('with a box open, opening SudokuPad\'s settings finishes it, and a key typed in the dialog reaches no drawing', async () => {
    await clickAt(EMPTY_AT)
    await p.keyboard.type('5')
    await p.click('#control-settings')
    await p.locator(DIALOG).waitFor({ state: 'visible' })
    assert.equal(await boxOpen(), false)
    assert.deepEqual(await texts(), ['23', 'xy CZ', '8', '5'])
    await p.keyboard.type('9')
    assert.deepEqual(await texts(), ['23', 'xy CZ', '8', '5'])
    await p.keyboard.press('Escape')
    await p.locator(DIALOG).waitFor({ state: 'detached' })
    await clickAt(EMPTY_AT)
    await p.keyboard.press('Backspace')
    await p.keyboard.press('Enter')
    assert.deepEqual(await texts(), ['23', 'xy CZ', '8'])
  })

  it('the text size control has three sizes, and a new text takes the one picked and the current pen color', async () => {
    assert.equal(await p.locator(SIZE_BUTTONS).count(), 3)
    assert.deepEqual(await currentSize(), [20])
    await p.click(`${SIZE_BUTTONS} >> nth=2`)
    assert.deepEqual(await settle(currentSize, [28]), [28])
    await p.click('.controls-input button[data-key="4"]')
    await clickAt(THIRD_AT)
    await p.keyboard.type('6')
    await p.keyboard.press('Enter')
    assert.deepEqual(await textStyle('6'), { fill: await penColor(4), opacity: '1', size: '28px' })
  })

  it('the text and the text size come back after a reload', async () => {
    const before = await texts()
    await reload()
    assert.deepEqual(await settle(texts, before), before)
    await pickDraw()
    assert.deepEqual(await currentSize(), [28])
  })

  it('a bad saved text size reads as the middle size', async () => {
    await plantUnchecked(p, TEXT_SIZE_KEY, '"huge"')
    await reload()
    await pickDraw()
    assert.deepEqual(await currentSize(), [20])
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

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
