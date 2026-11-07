// Live check of draw-tool.user.js's typed text on sudokupad.app: a click opens a text box whose keys never reach
// SudokuPad, Enter, a click elsewhere and Escape end it, a click on text edits it, and the text size control. Real
// mouse and keyboard input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { gridPoint, plantUnchecked } from './pen.mjs'
import { clickUntil, settle, SETTLE_MS, stable } from './settle.mjs'

const script = readFileSync(new URL('../draw-tool.user.js', import.meta.url), 'utf8')

const DRAW_BUTTON = '#control-draw'
const TEXTS = '#draw-tool-layer text.draw-tool-text'
const TEXT_BOX = '#draw-tool-layer .draw-tool-textbox'
const SIZE_BUTTONS = '.draw-tool-widths button[data-text-size]'
const DRAWING_PREFIX = 'DrawTool_drawing_'
const INDEX_KEY = 'DrawTool_index'
const COLOR_KEY = 'DrawTool_color'
const TEXT_SIZE_KEY = 'DrawTool_textsize'
// Points in cells from the grid's top left: r2c2's top left corner, where a cage sum goes, and two more spots.
const SUM_AT = [1.2, 1.2]
const SECOND_AT = [6.2, 3.25]
const THIRD_AT = [4.5, 7.5]
const EMPTY_AT = [8.5, 0.5]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Draw Tool\'s typed text', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const tool = () => read(() => Framework.app.tool)
  const pickDraw = () => clickUntil(() => p.click(DRAW_BUTTON), tool, 'draw', SETTLE_MS)
  const boot = async () => {
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator(DRAW_BUTTON).waitFor({ state: 'visible' })
  }
  const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }
  const texts = () => read((selector) => [...document.querySelectorAll(selector)].map((t) => t.textContent), TEXTS)
  const boxOpen = async () => (await p.locator(TEXT_BOX).count()) === 1
  // Every cell's digit, mark and colour, so a key that reached SudokuPad shows as a change.
  const cellState = () => read(() => JSON.stringify(Framework.app.puzzle.cells.map((c) => [c.propGet('normal'), c.propGet('corner'), c.propGet('centre'), c.propGet('colour')])))
  const saved = () => read((prefix) => Framework.getData(prefix + String(Framework.app.puzzle.puzzleId || window.location.href)), DRAWING_PREFIX)
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
    await boot()
    await read(([prefix, keys]) => {
      Object.keys(window.localStorage).filter((k) => k.includes(prefix)).forEach((k) => window.localStorage.removeItem(k))
      keys.forEach((k) => Framework.removeData(k))
    }, [DRAWING_PREFIX, [INDEX_KEY, COLOR_KEY, TEXT_SIZE_KEY]])
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
    await p.keyboard.press('Enter')
    assert.deepEqual(await texts(), ['15', 'Zx C'])
    assert.equal(await tool(), 'draw')
  })

  it('the text is solid, in the current pen color, at the middle text size', async () => {
    assert.deepEqual(await textStyle('15'), { fill: await penColor(1), opacity: '1', size: '20px' })
  })

  it('a click elsewhere finishes the box as Enter does, and opens no second box', async () => {
    await clickAt(THIRD_AT)
    await p.keyboard.type('7')
    await clickAt(EMPTY_AT)
    assert.deepEqual(await texts(), ['15', 'Zx C', '7'])
    assert.equal(await boxOpen(), false)
    assert.deepEqual((await saved()).map((item) => item.text), ['15', 'Zx C', '7'])
  })

  it('Escape on a new box leaves no text', async () => {
    await clickAt(EMPTY_AT)
    await p.keyboard.type('9')
    await p.keyboard.press('Escape')
    assert.equal(await boxOpen(), false)
    assert.deepEqual(await texts(), ['15', 'Zx C', '7'])
  })

  it('a box finished empty leaves no text', async () => {
    await clickAt(EMPTY_AT)
    await p.keyboard.press('Enter')
    assert.equal(await boxOpen(), false)
    assert.deepEqual(await texts(), ['15', 'Zx C', '7'])
    assert.equal((await saved()).length, 3)
  })

  it('a click on text reopens it with its text, and Enter saves the change', async () => {
    await clickAt(SUM_AT)
    assert.equal(await boxOpen(), true)
    assert.deepEqual(await texts(), ['Zx C', '7', '15'], 'the open box shows the text, drawn last')
    await p.keyboard.press('Backspace')
    await p.keyboard.press('Backspace')
    await p.keyboard.type('23')
    await p.keyboard.press('Enter')
    assert.deepEqual(await texts(), ['23', 'Zx C', '7'])
    assert.deepEqual((await saved()).map((item) => item.text), ['23', 'Zx C', '7'])
  })

  it('Escape on a reopened box restores the text it had', async () => {
    await clickAt(SUM_AT)
    await p.keyboard.press('Backspace')
    await p.keyboard.type('x')
    await p.keyboard.press('Escape')
    assert.deepEqual(await texts(), ['23', 'Zx C', '7'])
  })

  it('clearing a reopened text removes it', async () => {
    await clickAt(THIRD_AT)
    await p.keyboard.press('Backspace')
    await p.keyboard.press('Enter')
    assert.deepEqual(await texts(), ['23', 'Zx C'])
    assert.deepEqual((await saved()).map((item) => item.text), ['23', 'Zx C'])
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
