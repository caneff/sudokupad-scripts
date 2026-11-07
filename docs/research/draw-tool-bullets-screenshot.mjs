// Takes the picture on site/draw-tool.html's "What it adds" list (its Text, Shapes and Erasing animations are draw-tool-details-screenshot.mjs's), from the real draw-tool.user.js on the recorded
// puzzle, each a crop of the grid on a fresh page:
//   draw-tool-bullet-lines.png: a thin blue Shift+drag straight line, a green freehand loop and a thick red curved arrow
// Every stroke is a real mouse drag. It fails, writing nothing, when a stroke does not land.
// Run from the repo root with Playwright's Chromium installed:
//   node docs/research/draw-tool-bullets-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { openDrawPage } from './draw-tool-screenshot-page.mjs'

const DRAG_STEPS = 10
const MARGIN = 4
// The Size slider's values for the thin, middle and thick lines.
const OLD_WIDTHS = [3, 6, 10]

const browser = await chromium.launch()

// A page with Draw on, its drawing helpers, and the grid's top left and cell size.
async function drawPage () {
  const p = await openDrawPage(browser, 2)
  const [x0, y0, cell] = await p.evaluate(() => {
    const box = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
    return [box.x, box.y, box.width]
  })
  const at = ([row, col]) => [x0 + col * cell, y0 + row * cell]
  const strokes = () => p.locator('#draw-tool-layer path').count()
  const pick = async (color, widthIndex) => {
    await p.click(`.controls-input button[data-key="${color}"]`)
    await p.locator('#draw-tool-size').fill(String(OLD_WIDTHS[widthIndex]))
  }
  const drag = async (points, shift = false) => {
    const before = await strokes()
    if (shift) await p.keyboard.down('Shift')
    await p.mouse.move(...at(points[0]))
    await p.mouse.down()
    for (const point of points.slice(1)) await p.mouse.move(...at(point), { steps: DRAG_STEPS })
    await p.mouse.up()
    if (shift) await p.keyboard.up('Shift')
    if (await strokes() <= before) throw new Error(`the stroke from ${points[0]} did not land`)
  }
  // A clip of the grid from (row, col) to (row2, col2), in cell units.
  const shoot = async (from, to) => {
    await p.mouse.move(0, 0)
    const [left, top] = at(from)
    const [right, bottom] = at(to)
    return p.screenshot({ clip: { x: left - MARGIN, y: top - MARGIN, width: right - left + 2 * MARGIN, height: bottom - top + 2 * MARGIN } })
  }
  return { p, at, pick, drag, shoot }
}

const lines = await drawPage()
await lines.pick(6, 0)
await lines.drag([[5.6, 4.3], [5.4, 8.7]], true)
await lines.pick(1, 1)
await lines.drag(Array.from({ length: 25 }, (_, i) => {
  const a = (2 * Math.PI * i) / 24 - Math.PI / 2
  return [4.5 + 0.62 * Math.sin(a) * (1 + 0.06 * Math.cos(3 * a)), 7 + 1.15 * Math.cos(a)]
}))
await lines.pick(4, 2)
await lines.drag([[8.6, 4.9], [8.1, 5.4], [7.3, 5.5], [6.65, 5.2]])
await lines.drag([[6.95, 4.85], [6.62, 5.18], [6.9, 5.55]])
const linesPng = await lines.shoot([3.5, 4], [9, 9])

writeFileSync(new URL('./draw-tool-bullet-lines.png', import.meta.url).pathname, linesPng)
console.log('wrote draw-tool-bullet-lines.png')
await browser.close()
