// Live check of draw-tool.user.js's panel on sudokupad.app: the nine pen colors on the keypad, the digit keys, the
// Size and Opacity sliders, the choices kept over a reload, and SudokuPad's own keypad back under another tool.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from './page.mjs'
import { gridPoint, mouseDrag, plantUnchecked } from './pen.mjs'
import { clickUntil, settle, SETTLE_MS } from './settle.mjs'

const { COLOR_KEY, DIGIT_BUTTON, OPACITY_KEY, OPACITY_SLIDER, PANEL_BOX, SIZE_SLIDER, STROKES, WIDTH_KEY } = draw
// r1c3 of the recorded puzzle, empty.
const EMPTY_CELL = [0, 2]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Draw Tool\'s panel', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const tool = () => draw.tool(p)
  const pickDraw = () => draw.pickDraw(p)
  const pickDigit = () => clickUntil(() => p.click(DIGIT_BUTTON), tool, 'normal', SETTLE_MS)
  const reload = () => draw.reload(p)
  // The keypad's digit buttons, 1 to 9: what each shows and whether it is marked current.
  const keypad = () => read(() => [...document.querySelectorAll('.controls-input button.digit')]
    .filter((b) => b.dataset.key !== '0')
    .map((b) => {
      const after = window.getComputedStyle(b, '::after')
      return { key: b.dataset.key, current: b.classList.contains('current'), swatch: after.content === 'none' ? null : after.backgroundColor, text: window.getComputedStyle(b).color }
    }))
  const penColor = (n) => read((i) => window.getComputedStyle(document.documentElement).getPropertyValue(`--puzzle-pencolor-${i}`).trim(), n)
  const currentKey = async () => (await keypad()).filter((b) => b.current).map((b) => b.key)
  const sliderValue = (selector) => read((s) => Number(document.querySelector(s).value), selector)
  const saved = () => draw.saved(p)
  // The computed stroke color, width and opacity of the last stroke drawn.
  const lastStroke = () => read((selector) => {
    const style = window.getComputedStyle([...document.querySelectorAll(selector)].pop())
    return { stroke: style.stroke, width: style.strokeWidth, opacity: style.strokeOpacity }
  }, STROKES)
  // The width and opacity of the first stroke on the board, drawn before any slider moved.
  const firstLook = () => read((selector) => {
    const style = window.getComputedStyle(document.querySelector(selector))
    return { width: style.strokeWidth, opacity: style.strokeOpacity }
  }, STROKES)
  const drawStroke = async () => {
    const before = await p.locator(STROKES).count()
    await mouseDrag(p, [[4.5, 1.5], [5.2, 3], [4.4, 4.5]])
    assert.equal(await p.locator(STROKES).count(), before + 1, 'the drag drew a stroke')
  }
  const selectEmptyCell = async () => {
    await pickDigit()
    await p.evaluate(() => Framework.app.deselect())
    await p.mouse.click(...await gridPoint(p, EMPTY_CELL.map((v) => v + 0.5)))
    assert.equal(await read(() => Framework.app.puzzle.selectedCells.length), 1)
  }
  const emptyCellValue = () => read(([r, c]) => Framework.app.grid.getCell(r, c).propGet('normal') ?? null, EMPTY_CELL)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), [COLOR_KEY, WIDTH_KEY, OPACITY_KEY])
    await reload()
  })
  after(async () => { await context.close() })

  it('with Draw current the keypad shows the nine pen colors, digits hidden, with pen color 1 marked and the default Size and Opacity', async () => {
    await pickDraw()
    const buttons = await keypad()
    const pens = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9].map(penColor))
    assert.deepEqual(buttons.map((b) => b.swatch), pens.map((c) => c.replace(/^rgb\(-\d+, -\d+, -\d+\)$/, 'rgb(0, 0, 0)')))
    assert.deepEqual(buttons.filter((b) => !b.current).map((b) => b.text), Array(8).fill('rgba(0, 0, 0, 0)'), 'the digits are not shown')
    assert.deepEqual(await currentKey(), ['1'])
    assert.equal(await p.locator(`${PANEL_BOX} input[type=range]`).count(), 2)
    assert.equal(await p.locator(`${PANEL_BOX} button[data-width], ${PANEL_BOX} button[data-text-size]`).count(), 0, 'no width or text size buttons')
    assert.deepEqual([await sliderValue(SIZE_SLIDER), await sliderValue(OPACITY_SLIDER)], [6, 100])
    assert.equal(await p.locator('.controls-input button[data-key="0"]').isVisible(), false)
    assert.equal(await p.locator('.controls-input button[data-control="delete"]').isVisible(), false)
  })

  it('clicking a color marks it, and the next stroke draws in it', async () => {
    await p.click('.controls-input button[data-key="4"]')
    assert.deepEqual(await settle(currentKey, ['4']), ['4'])
    await drawStroke()
    assert.equal((await lastStroke()).stroke, await penColor(4))
  })

  it('a digit key picks its color and enters nothing in the selected cell', async () => {
    await selectEmptyCell()
    await pickDraw()
    const replay = await read(() => Framework.app.getReplay())
    await p.keyboard.press('6')
    assert.deepEqual(await settle(currentKey, ['6']), ['6'])
    assert.equal(await emptyCellValue(), null, 'no digit in r1c3')
    assert.equal(await read(() => Framework.app.getReplay()), replay)
    await drawStroke()
    assert.equal((await lastStroke()).stroke, await penColor(6))
  })

  it('a slider sets the next stroke only: earlier strokes keep their width and opacity', async () => {
    await drawStroke()
    assert.deepEqual(await firstLook(), { width: '6px', opacity: '1' })
    await p.locator(SIZE_SLIDER).fill('10.5')
    await p.locator(OPACITY_SLIDER).fill('45')
    await drawStroke()
    const look = await lastStroke()
    assert.deepEqual([look.width, look.opacity], ['10.5px', '0.45'])
    assert.deepEqual(await firstLook(), { width: '6px', opacity: '1' }, 'the earlier stroke did not change')
  })

  it('a stroke drawn with the sliders is saved with its width and opacity', async () => {
    const items = await saved()
    const last = items[items.length - 1]
    assert.deepEqual([last.width, last.opacity], [10.5, 45])
  })

  it('a changed pen color variable shows on its swatch and on new strokes', async () => {
    await read(() => document.documentElement.style.setProperty('--puzzle-pencolor-2', 'rgb(1, 2, 3)'))
    assert.equal((await keypad())[1].swatch, 'rgb(1, 2, 3)')
    await p.keyboard.press('2')
    await drawStroke()
    assert.equal((await lastStroke()).stroke, 'rgb(1, 2, 3)')
    await read(() => document.documentElement.style.removeProperty('--puzzle-pencolor-2'))
  })

  it('the color and the slider values come back after a reload', async () => {
    await p.keyboard.press('7')
    await p.locator(SIZE_SLIDER).fill('14')
    await p.locator(OPACITY_SLIDER).fill('60')
    await reload()
    await pickDraw()
    assert.deepEqual(await currentKey(), ['7'])
    assert.deepEqual([await sliderValue(SIZE_SLIDER), await sliderValue(OPACITY_SLIDER)], [14, 60])
    await drawStroke()
    assert.deepEqual(await lastStroke(), { stroke: await penColor(7), width: '14px', opacity: '0.6' })
  })

  it('bad saved values read as pen color 1 and the default Size and Opacity', async () => {
    await plantUnchecked(p, COLOR_KEY, '"purple"')
    await plantUnchecked(p, WIDTH_KEY, '7.25')
    await plantUnchecked(p, OPACITY_KEY, '3')
    await reload()
    await pickDraw()
    assert.deepEqual(await currentKey(), ['1'])
    assert.deepEqual([await sliderValue(SIZE_SLIDER), await sliderValue(OPACITY_SLIDER)], [6, 100])
    await drawStroke()
    assert.deepEqual(await lastStroke(), { stroke: await penColor(1), width: '6px', opacity: '1' })
  })

  it('another tool gets SudokuPad\'s own keypad back, and its digit keys enter digits again', async () => {
    await selectEmptyCell()
    assert.equal(await p.locator(SIZE_SLIDER).count(), 0, 'no Size slider')
    const buttons = await keypad()
    assert.deepEqual(buttons.map((b) => b.swatch), Array(9).fill(null), 'no swatches')
    assert.deepEqual(buttons.map((b) => b.current), Array(9).fill(false), 'no color marked')
    assert.equal(await p.locator('.controls-input button[data-key="0"]').isVisible(), true)
    assert.equal(await p.locator('.controls-input button[data-control="delete"]').isVisible(), true)
    await p.keyboard.press('5')
    assert.equal(await settle(emptyCellValue, '5'), '5')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
