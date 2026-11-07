// Takes docs/research/site-draw-tool.png, the homepage's Draw Tool picture: the grid's top left on the recorded puzzle,
// with draw-tool.user.js injected, a freehand loop round two cells, a freehand arrow and a Shift+drag straight line.
// Every stroke is a real mouse drag. It fails, writing nothing, when a stroke does not land.
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
// The picture's size in cells, from the grid's top left corner.
const SHOWN_COLS = 6
const SHOWN_ROWS = 4

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

// A loop round r2c2 and r2c3, a little uneven, as a hand draws one.
const loop = Array.from({ length: 25 }, (_, i) => {
  const a = (2 * Math.PI * i) / 24 - Math.PI / 2
  return [1.5 + 0.62 * Math.sin(a) * (1 + 0.06 * Math.cos(3 * a)), 2.5 + 1.15 * Math.cos(a)]
})
await drag(loop)
// An arrow from r3c5 curving up to r1c5, then its head.
await drag([[2.6, 4.4], [2.1, 4.9], [1.3, 5.0], [0.65, 4.7]])
await drag([[0.95, 4.35], [0.62, 4.68], [0.9, 5.05]])
await drag([[3.3, 0.3], [3.7, 3.7]], true)

await p.mouse.move(0, 0)
await p.screenshot({ path: out, clip: { x: x0 - 4, y: y0 - 4, width: SHOWN_COLS * cell + 8, height: SHOWN_ROWS * cell + 8 } })
console.log(`wrote ${out}`)
await browser.close()
