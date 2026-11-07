// Live check of draw-tool.user.js's panel on sudokupad.app: the nine pen colors on the keypad, the digit keys, the
// three widths, the choice kept over a reload, and SudokuPad's own keypad back under another tool.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { gridPoint, mouseDrag, plantUnchecked } from './pen.mjs'
import { clickUntil, settle, SETTLE_MS } from './settle.mjs'

const script = readFileSync(new URL('../draw-tool.user.js', import.meta.url), 'utf8')

const DRAW_BUTTON = '#control-draw'
const DIGIT_BUTTON = '#control-normal'
const STROKES = '#draw-tool-layer path'
const WIDTH_BUTTONS = '.draw-tool-widths button'
const COLOR_KEY = 'DrawTool_color'
const WIDTH_KEY = 'DrawTool_width'
// r1c3 of the recorded puzzle, empty.
const EMPTY_CELL = [0, 2]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Draw Tool\'s panel', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const tool = () => read(() => Framework.app.tool)
  const pickDraw = () => clickUntil(() => p.click(DRAW_BUTTON), tool, 'draw', SETTLE_MS)
  const pickDigit = () => clickUntil(() => p.click(DIGIT_BUTTON), tool, 'normal', SETTLE_MS)
  const boot = async () => {
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator(DRAW_BUTTON).waitFor({ state: 'visible' })
  }
  const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }
  // The keypad's digit buttons, 1 to 9: what each shows and whether it is marked current.
  const keypad = () => read(() => [...document.querySelectorAll('.controls-input button.digit')]
    .filter((b) => b.dataset.key !== '0')
    .map((b) => {
      const after = window.getComputedStyle(b, '::after')
      return { key: b.dataset.key, current: b.classList.contains('current'), swatch: after.content === 'none' ? null : after.backgroundColor, text: window.getComputedStyle(b).color }
    }))
  const penColor = (n) => read((i) => window.getComputedStyle(document.documentElement).getPropertyValue(`--puzzle-pencolor-${i}`).trim(), n)
  const currentKey = async () => (await keypad()).filter((b) => b.current).map((b) => b.key)
  const currentWidth = () => read((selector) => [...document.querySelectorAll(selector)].filter((b) => b.classList.contains('current')).map((b) => Number(b.dataset.width)), WIDTH_BUTTONS)
  // The computed stroke color and width of the last stroke drawn.
  const lastStroke = () => read((selector) => {
    const style = window.getComputedStyle([...document.querySelectorAll(selector)].pop())
    return { stroke: style.stroke, width: style.strokeWidth }
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
    await boot()
    await read(([c, w]) => { Framework.removeData(c); Framework.removeData(w) }, [COLOR_KEY, WIDTH_KEY])
    await reload()
  })
  after(async () => { await context.close() })

  it('with Draw current the keypad shows the nine pen colors, digits hidden, with pen color 1 marked and the middle width', async () => {
    await pickDraw()
    const buttons = await keypad()
    const pens = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9].map(penColor))
    assert.deepEqual(buttons.map((b) => b.swatch), pens.map((c) => c.replace(/^rgb\(-\d+, -\d+, -\d+\)$/, 'rgb(0, 0, 0)')))
    assert.deepEqual(buttons.filter((b) => !b.current).map((b) => b.text), Array(8).fill('rgba(0, 0, 0, 0)'), 'the digits are not shown')
    assert.deepEqual(await currentKey(), ['1'])
    assert.equal(await p.locator(WIDTH_BUTTONS).count(), 3)
    assert.deepEqual(await currentWidth(), [6])
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

  it('the width control sets the next stroke\'s width', async () => {
    await p.click(`${WIDTH_BUTTONS} >> nth=2`)
    assert.deepEqual(await settle(currentWidth, [10]), [10])
    await drawStroke()
    assert.equal((await lastStroke()).width, '10px')
    await p.click(`${WIDTH_BUTTONS} >> nth=0`)
    await drawStroke()
    assert.equal((await lastStroke()).width, '3px')
  })

  it('a changed pen color variable shows on its swatch and on new strokes', async () => {
    await read(() => document.documentElement.style.setProperty('--puzzle-pencolor-2', 'rgb(1, 2, 3)'))
    assert.equal((await keypad())[1].swatch, 'rgb(1, 2, 3)')
    await p.keyboard.press('2')
    await drawStroke()
    assert.equal((await lastStroke()).stroke, 'rgb(1, 2, 3)')
    await read(() => document.documentElement.style.removeProperty('--puzzle-pencolor-2'))
  })

  it('the color and width come back after a reload', async () => {
    await p.keyboard.press('7')
    await p.click(`${WIDTH_BUTTONS} >> nth=2`)
    assert.deepEqual(await settle(currentWidth, [10]), [10])
    await reload()
    await pickDraw()
    assert.deepEqual(await currentKey(), ['7'])
    assert.deepEqual(await currentWidth(), [10])
    await drawStroke()
    assert.deepEqual(await lastStroke(), { stroke: await penColor(7), width: '10px' })
  })

  it('bad saved values read as pen color 1 and the middle width', async () => {
    await plantUnchecked(p, COLOR_KEY, '"purple"')
    await plantUnchecked(p, WIDTH_KEY, '7')
    await reload()
    await pickDraw()
    assert.deepEqual(await currentKey(), ['1'])
    assert.deepEqual(await currentWidth(), [6])
    await drawStroke()
    assert.deepEqual(await lastStroke(), { stroke: await penColor(1), width: '6px' })
  })

  it('another tool gets SudokuPad\'s own keypad back, and its digit keys enter digits again', async () => {
    await selectEmptyCell()
    assert.equal(await p.locator(WIDTH_BUTTONS).count(), 0, 'no width control')
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
