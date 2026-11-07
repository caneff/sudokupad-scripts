// Takes docs/research/site-draw-tool.png, the homepage's Draw Tool picture: the grid's right side on the recorded
// puzzle, with draw-tool.user.js injected, and the Draw panel beside it. A thin blue Shift+drag straight line, a green
// freehand loop round two cells at the middle width, a thick red freehand arrow and an orange cage sum typed in r8c7's
// corner at the large text size and a pink rectangle round the 2 and 8 beside it, each color, width and size picked in the panel, which is left showing the red and
// the thick line. Every stroke is a real mouse drag and the sum real clicks and keys. It fails, writing nothing, when a
// stroke or the sum does not land.
// Run from the repo root with Playwright's Chromium installed:
//   node docs/research/site-draw-tool-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { openDrawPage, OLD_WIDTHS } from './draw-tool-screenshot-page.mjs'

const out = new URL('./site-draw-tool.png', import.meta.url).pathname

// Mouse moves per segment of a drag, so the drag reads as a hand-drawn stroke and not a jump.
const DRAG_STEPS = 10
// The picture's left edge, in cells from the grid's left; it runs from there past the tool buttons, and from the
// keypad's top to the grid's bottom.
const FIRST_COL = 4
// Page pixels kept round the picture's edges.
const MARGIN = 4

const browser = await chromium.launch()
const p = await openDrawPage(browser, 1)

const [x0, y0, cell] = await p.evaluate(() => {
  const box = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
  return [box.x, box.y, box.width]
})
// The page point of grid position (row, col) in cell units.
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

// A thin blue straight line along row 6.
await pick(6, 0)
await drag([[5.6, 4.3], [5.4, 8.7]], true)
// A loop round r5c7 and r5c8, a little uneven, as a hand draws one.
await pick(1, 1)
const loop = Array.from({ length: 25 }, (_, i) => {
  const a = (2 * Math.PI * i) / 24 - Math.PI / 2
  return [4.5 + 0.62 * Math.sin(a) * (1 + 0.06 * Math.cos(3 * a)), 7 + 1.15 * Math.cos(a)]
})
await drag(loop)
// An arrow from r9c6 curving up to r7c6, then its head.
await pick(4, 2)
await drag([[8.6, 4.9], [8.1, 5.4], [7.3, 5.5], [6.65, 5.2]])
await drag([[6.95, 4.85], [6.62, 5.18], [6.9, 5.55]])
// A cage sum, 17, in r8c7's top left corner.
await pick(3, 1)
await p.locator('#draw-tool-size').fill(String(OLD_WIDTHS[2]))
await p.mouse.click(...at([7.25, 6.3]))
await p.keyboard.type('17')
await p.keyboard.press('Enter')
if ((await p.locator('#draw-tool-layer text.draw-tool-text').allTextContents()).join() !== '17') throw new Error('the typed sum did not land')
// A pink rectangle round r7c7 and r7c8 (the 2 and the 8), from the Shape button stepped to rectangle, which stays showing it.
await pick(2, 0)
await p.click('.draw-tool-shape-mode')
if ((await p.locator('.draw-tool-shape-mode').getAttribute('data-mode')) !== 'rect') throw new Error('Shape did not step to rectangle')
await p.mouse.move(...at([6.3, 6.3]))
await p.mouse.down()
await p.mouse.move(...at([6.7, 7.7]), { steps: DRAG_STEPS })
await p.mouse.up()
if ((await p.locator('#draw-tool-layer rect.draw-tool-shape').count()) !== 1) throw new Error('the rectangle did not land')
await pick(4, 2)

const [panelTop, panelRight] = await p.evaluate(() => [
  document.querySelector('.controls-input').getBoundingClientRect().top,
  document.querySelector('.controls-tool').getBoundingClientRect().right
])
const left = x0 + FIRST_COL * cell - MARGIN
const top = panelTop - MARGIN
await p.mouse.move(0, 0)
await p.screenshot({ path: out, clip: { x: left, y: top, width: panelRight + MARGIN - left, height: y0 + 9 * cell + MARGIN - top } })
console.log(`wrote ${out}`)
await browser.close()
