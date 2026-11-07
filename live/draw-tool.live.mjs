// Live check of draw-tool.user.js on sudokupad.app, in headless Chromium, with real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { clickUntil, settle, SETTLE_MS, stable } from './settle.mjs'

const script = readFileSync(new URL('../draw-tool.user.js', import.meta.url), 'utf8')

const DRAW_BUTTON = '#control-draw'
const DIGIT_BUTTON = '#control-normal'
const STROKES = '#draw-tool-layer path'
// SudokuPad's tool keys, App.toolHotkeys.
const TOOL_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm']

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Draw Tool, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const tool = () => p.evaluate(() => Framework.app.tool)
  const selected = () => p.evaluate(() => Framework.app.puzzle.selectedCells.length)
  const strokeCount = () => p.locator(STROKES).count()
  // The client point at (r, c) in cell units from the grid's top left corner, so (2.5, 2.5) is the middle of r3c3.
  const at = (r, c) => p.evaluate(([r, c]) => {
    const box = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
    return [box.x + c * box.width, box.y + r * box.height]
  }, [r, c])
  // A real left drag through the points given in cell units, with a mouse move every few pixels between them.
  const drag = async (points) => {
    const [first, ...rest] = await Promise.all(points.map(([r, c]) => at(r, c)))
    await p.mouse.move(...first)
    await p.mouse.down()
    for (const point of rest) await p.mouse.move(...point, { steps: 12 })
    await p.mouse.up()
  }
  // The last stroke's box on screen, in cell units from the grid's top left corner.
  const lastStrokeInCells = () => p.evaluate((selector) => {
    const cell = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
    const box = [...document.querySelectorAll(selector)].pop().getBoundingClientRect()
    const round = (v) => Math.round(v * 100) / 100
    return [round((box.left - cell.x) / cell.width), round((box.top - cell.y) / cell.height), round(box.width / cell.width), round(box.height / cell.height)]
  }, STROKES)
  const cellWidth = () => p.evaluate(() => Math.round(Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect().width))
  const pickDraw = () => clickUntil(() => p.click(DRAW_BUTTON), tool, 'draw', SETTLE_MS)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator(DRAW_BUTTON).waitFor({ state: 'visible' })
  })
  after(async () => { await context.close() })

  it('the Draw button sits among the tool buttons, and picking it makes Draw the current tool', async () => {
    assert.equal(await p.locator(`.controls-tool ${DRAW_BUTTON}`).count(), 1)
    assert.equal(await p.locator(DRAW_BUTTON).textContent(), 'Draw')
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

  it('a left drag leaves one stroke above the digits and selects no cell', async () => {
    await pickDraw()
    await p.evaluate(() => Framework.app.deselect())
    await drag([[2.5, 2.5], [3.2, 4], [2.4, 5.5], [3.6, 6.5]])
    assert.equal(await strokeCount(), 1)
    assert.equal(await selected(), 0, 'no cell selected')
    assert.equal(await tool(), 'draw')
    const order = await p.evaluate(() => {
      const children = [...Framework.app.svgRenderer.getElem().children].map((e) => e.id)
      return children.indexOf('draw-tool-layer') - children.indexOf('cell-values')
    })
    assert.equal(order > 0, true, 'the layer comes after the digits in the board SVG')
    assert.equal(await p.evaluate(() => Framework.app.svgRenderer.getElem().lastElementChild.id), 'draw-tool-layer')
  })

  it('the stroke is a smoothed curve with round ends and joins, see-through, in pen color 1 at the default width', async () => {
    const look = await p.evaluate((selector) => {
      const path = document.querySelector(selector)
      const style = window.getComputedStyle(path)
      return {
        curved: /Q/.test(path.getAttribute('d')),
        commands: (path.getAttribute('d').match(/[MQL]/g) || []).length,
        cap: style.strokeLinecap,
        join: style.strokeLinejoin,
        opacity: parseFloat(style.strokeOpacity),
        width: style.strokeWidth,
        stroke: style.stroke,
        pen1: window.getComputedStyle(document.documentElement).getPropertyValue('--puzzle-pencolor-1').trim()
      }
    }, STROKES)
    assert.equal(look.curved, true, 'the path has curves')
    assert.equal(look.commands < 30, true, `${look.commands} path commands: the mouse points were simplified`)
    assert.equal(look.cap, 'round')
    assert.equal(look.join, 'round')
    assert.equal(look.opacity > 0 && look.opacity < 1, true, `stroke opacity ${look.opacity}`)
    assert.equal(look.width, '6px')
    assert.equal(look.stroke, look.pen1)
  })

  it('Shift+drag draws a straight line from the press point to the release point, and stays in Draw', async () => {
    await p.keyboard.down('Shift')
    await drag([[1.5, 1.5], [4, 2], [1, 3], [5.5, 6.5]])
    await p.keyboard.up('Shift')
    assert.equal(await strokeCount(), 2)
    assert.equal(await tool(), 'draw', 'Shift did not switch to Corner')
    assert.equal(await selected(), 0, 'no cell selected')
    const line = await p.evaluate((selector) => [...document.querySelectorAll(selector)].pop().getAttribute('d'), STROKES)
    assert.match(line, /^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/, line)
    // The board draws a cell 64 wide, from 0: r2c2's middle is (96, 96) and r6c7's corner region is (416, 352).
    const [x1, y1, x2, y2] = line.match(/[\d.]+/g).map(Number)
    assert.deepEqual([x1, y1, x2, y2].map((v) => Math.round(v / 32)), [3, 3, 13, 11])
  })

  it('after a window resize each stroke still sits over the cells it was drawn on', async () => {
    const before = await lastStrokeInCells()
    const cellWidthBefore = await cellWidth()
    await p.setViewportSize({ width: 800, height: 1000 })
    const after = await stable(lastStrokeInCells)
    assert.notEqual(await cellWidth(), cellWidthBefore, 'the resize changed the board\'s size')
    assert.deepEqual(after, before)
    await p.setViewportSize({ width: 1200, height: 900 })
  })

  it('with another tool current the strokes stay visible and a drag selects cells as it does without the script', async () => {
    await p.click(DIGIT_BUTTON)
    assert.equal(await tool(), 'normal')
    assert.equal(await strokeCount(), 2)
    assert.equal(await p.locator(STROKES).first().isVisible(), true)
    await p.evaluate(() => Framework.app.deselect())
    await drag([[0.5, 0.5], [0.5, 2.5]])
    assert.equal(await selected(), 3, 'the drag selected r1c1 to r1c3')
    assert.equal(await strokeCount(), 2, 'no stroke was drawn')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
