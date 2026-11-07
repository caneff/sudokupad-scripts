// Takes the two pictures on site/draw-tool.html's "What it adds" list, from the real draw-tool.user.js on the recorded
// puzzle, each a crop of the grid on a fresh page:
//   draw-tool-bullet-lines.png: a thin blue Shift+drag straight line, a green freehand loop and a thick red curved arrow
//   draw-tool-bullet-text.png:  an orange cage sum, 17, typed in a cell's corner at the large text size
// Every stroke is a real mouse drag and the sum real clicks and keys. It fails, writing nothing, when a stroke or the sum
// does not land.
// Run from the repo root with Playwright's Chromium installed:
//   node docs/research/draw-tool-bullets-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { openPage, startPuzzle } from '../../live/page.mjs'

const script = readFileSync(new URL('../../draw-tool.user.js', import.meta.url), 'utf8')
const DRAG_STEPS = 10
const MARGIN = 4

const browser = await chromium.launch()

// A page with Draw on, its drawing helpers, and the grid's top left and cell size.
async function drawPage () {
  const { p } = await openPage(browser, { contextOptions: { deviceScaleFactor: 2 } })
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
  const at = ([row, col]) => [x0 + col * cell, y0 + row * cell]
  const strokes = () => p.locator('#draw-tool-layer path').count()
  const pick = async (color, widthIndex) => {
    await p.click(`.controls-input button[data-key="${color}"]`)
    await p.click(`.draw-tool-panel-box button[data-width] >> nth=${widthIndex}`)
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

const text = await drawPage()
await text.pick(3, 1)
await text.p.click('.draw-tool-panel-box button[data-text-size] >> nth=2')
await text.p.mouse.click(...text.at([7.25, 6.3]))
await text.p.keyboard.type('17')
await text.p.keyboard.press('Enter')
if ((await text.p.locator('#draw-tool-layer text.draw-tool-text').allTextContents()).join() !== '17') throw new Error('the typed sum did not land')
const textPng = await text.shoot([6.5, 5.5], [8.5, 7.5])

writeFileSync(new URL('./draw-tool-bullet-lines.png', import.meta.url).pathname, linesPng)
writeFileSync(new URL('./draw-tool-bullet-text.png', import.meta.url).pathname, textPng)
console.log('wrote draw-tool-bullet-lines.png and draw-tool-bullet-text.png')
await browser.close()
