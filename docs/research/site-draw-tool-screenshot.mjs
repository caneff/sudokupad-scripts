// Takes docs/research/site-draw-tool.png, the homepage's Draw Tool picture: the grid's right side on the recorded
// puzzle, with draw-tool.user.js injected, and the Draw panel beside it. A thin blue Shift+drag straight line, a green
// freehand loop round two cells at the middle width and a thick red freehand arrow, each color and width picked in the
// panel, which is left showing the red and the thick line. Every stroke is a real mouse drag. It fails, writing
// nothing, when a stroke does not land.
// Run from the repo root with Playwright's Chromium installed:
//   node docs/research/site-draw-tool-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { openPage, startPuzzle } from '../../live/page.mjs'

const script = readFileSync(new URL('../../draw-tool.user.js', import.meta.url), 'utf8')
const out = new URL('./site-draw-tool.png', import.meta.url).pathname

// Mouse moves per segment of a drag, so the drag reads as a hand-drawn stroke and not a jump.
const DRAG_STEPS = 10
// The picture's left edge, in cells from the grid's left; it runs from there past the tool buttons, and from the
// keypad's top to the grid's bottom.
const FIRST_COL = 4
// Page pixels kept round the picture's edges.
const MARGIN = 4

const browser = await chromium.launch()
const { p } = await openPage(browser, { contextOptions: { deviceScaleFactor: 1 } })
await startPuzzle(p)
await p.addStyleTag({ content: '#svenpeek { display: none !important }' })
await p.addScriptTag({ content: script })
await p.locator('#control-draw').waitFor({ state: 'visible' })
for (let i = 0; i < 20 && (await p.evaluate(() => Framework.app.tool)) !== 'draw'; i++) {
  await p.click('#control-draw')
  await p.waitForTimeout(300)
}

const [x0, y0, cell] = await p.evaluate(() => {
  const box = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
  return [box.x, box.y, box.width]
})
// The page point of grid position (row, col) in cell units.
const at = ([row, col]) => [x0 + col * cell, y0 + row * cell]
const strokes = () => p.locator('#draw-tool-layer path').count()
const pick = async (color, widthIndex) => {
  await p.click(`.controls-input button[data-key="${color}"]`)
  await p.click(`.draw-tool-widths button >> nth=${widthIndex}`)
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
