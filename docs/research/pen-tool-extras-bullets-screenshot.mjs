// Takes the six small pictures on site/pen-tool-extras.html, one per "What it adds" bullet a still picture can
// show, from the current pen-tool-extras.user.js on sudokupad.app. Each is cropped close and taken at 3x so it
// reads at about 14rem wide:
//   pen-tool-extras-bullet-colors.png   the cell color buttons above the pen color buttons, colors matching
//   pen-tool-extras-bullet-lines.png    a dashed line and an arrow line on the grid, and the page button
//   pen-tool-extras-bullet-edges.png    cells with an edge X, an edge circle and the two direction arrows
//   pen-tool-extras-bullet-corners.png  two grid corners, one with an X and one with a circle
//   pen-tool-extras-bullet-sliders.png  the Thickness and Opacity sliders, and a thick outlined line over a colored cell
//   pen-tool-extras-bullet-gear.png     the pen tool button with its settings gear
// The erase bullet has none: a middle click does not show in a still picture. Every line is a real mouse drag
// and every mark a real click; the script fails, writing nothing, when one does not land. The mascot is hidden.
// Run from the repo root with Playwright's Chromium installed: node docs/research/pen-tool-extras-bullets-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const out = (name) => new URL(`./pen-tool-extras-bullet-${name}.png`, import.meta.url).pathname

const DASH_KEY = 'PenColor_dash'
// Page 2 dash length in line widths; the script's own default is dots (0).
const DASH_LENGTH = 3
const DRAG_STEPS = 14
const CLICK_PAUSE_MS = 150
const EDGE_INSET_PX = 2
// Cells in a cropped grid picture, and the margin around it in page pixels.
const MARGIN = 12

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 3 })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.evaluate(([key, value]) => Framework.setData(key, value), [DASH_KEY, DASH_LENGTH])
await page.addScriptTag({ content: script })
await page.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
await page.evaluate(() => Framework.setSetting('toolpen', true))
await page.locator('#control-pen').waitFor({ state: 'visible' })

const rect = (row, col) => page.evaluate(([r, c]) => {
  const e = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).elem.getBoundingClientRect()
  return { x: e.x, y: e.y, width: e.width, height: e.height }
}, [row, col])
const first = await rect(0, 0)
const cell = (await rect(1, 1)).x - first.x
const at = (row, col) => [first.x + col * cell, first.y + row * cell]
const penCount = () => page.evaluate(() => Framework.app.puzzle.cells.reduce((n, c) => n + c.pen.length, 0))
const landing = async (what, act) => {
  const before = await penCount()
  await act()
  if (await penCount() <= before) throw new Error(`${what} did not land`)
}
const openPanel = async (control, panel) => {
  const shown = () => page.locator(`${panel} button[data-key="1"]`).isVisible()
  for (let i = 0; i < 20 && !(await shown()); i++) { await page.click(control); await page.waitForTimeout(300) }
  if (!(await shown())) throw new Error(`${panel} did not open`)
}
await openPanel('#control-pen', '.tool-pen')
const pick = (key) => page.locator(`.tool-pen button[data-key="${key}"]`).click()
const pageButton = page.locator('.pen-tool-extras-page')
await pageButton.waitFor()
const drag = (points) => landing(`the line from ${points[0]}`, async () => {
  await page.mouse.move(...at(...points[0]))
  await page.mouse.down()
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = at(...points[i - 1])
    const [x1, y1] = at(...points[i])
    for (let k = 1; k <= DRAG_STEPS; k++) await page.mouse.move(x0 + (x1 - x0) * k / DRAG_STEPS, y0 + (y1 - y0) * k / DRAG_STEPS)
  }
  await page.mouse.up()
})
const mode = (m) => page.evaluate((v) => { ToolPen.tool.lineMode = v }, m)
const clickTimes = async (x, y, n) => { for (let i = 0; i < n; i++) { await page.mouse.click(x, y); await page.waitForTimeout(CLICK_PAUSE_MS) } }
const gridClip = (row0, col0, rows, cols) => {
  const [x, y] = at(row0, col0)
  return { x: x - MARGIN, y: y - MARGIN, width: cols * cell + 2 * MARGIN, height: rows * cell + 2 * MARGIN }
}
const quiet = async () => { await page.mouse.move(5, 5); await page.waitForTimeout(400) }
const png = async (clip) => (await page.screenshot({ clip })).toString('base64')
// Puts pictures side by side on one white page and writes the result.
const compose = async (name, pictures, vertical) => {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 400 }, deviceScaleFactor: 1 })).newPage()
  const imgs = pictures.map((b) => `<img src="data:image/png;base64,${b}" style="display:block">`).join('')
  await p.setContent(`<body style="margin:0;background:#fff"><div id="c" style="display:inline-flex;flex-direction:${vertical ? 'column' : 'row'};gap:8px;padding:8px;align-items:flex-start">${imgs}</div></body>`)
  await p.locator('#c img').last().evaluate((i) => i.decode())
  writeFileSync(out(name), await p.locator('#c').screenshot())
  await p.close()
}

// Colors: the cell color tool's bottom row of buttons (7 to 9) above the pen tool's, the pen colors darker versions of the cell colors.
const rowShot = async (control, panel) => {
  await openPanel(control, panel)
  await quiet()
  const boxes = await Promise.all([7, 8, 9].map((k) => page.locator(`${panel} button[data-key="${k}"]`).boundingBox()))
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return png({ x: x - 4, y: y - 4, width: Math.max(...boxes.map((b) => b.x + b.width)) - x + 8, height: Math.max(...boxes.map((b) => b.y + b.height)) - y + 8 })
}
const cellRow = await rowShot('#control-colour', '.tool-colour')
const penRow = await rowShot('#control-pen', '.tool-pen')
await compose('colors', [cellRow, penRow], true)

// Lines: a dashed line (page 2, blue) and an arrow line (page 3, orange) on the grid, with the page button.
await mode('centeronly')
await pageButton.click()
await pick(9); await drag([[1.5, 1.5], [1.5, 3.5]])
await pageButton.click()
await pick(6); await drag([[3.5, 1.5], [3.5, 3.5]])
await quiet()
const lines = await png(gridClip(1, 1, 3, 3))
const pageShot = (await pageButton.screenshot()).toString('base64')
await compose('lines', [lines, pageShot], false)

// Edges and corners, on page 1 so each takes its pen's solid color.
await pageButton.click()
// A click near a cell's side marks that edge; 1 click is the X, 2 and 3 the two arrows, 4 the circle.
const edge = async (row, col, side, clicks, key) => {
  await pick(key)
  const e = await rect(row, col)
  const [x, y] = { right: [e.x + e.width - EDGE_INSET_PX, e.y + e.height / 2], bottom: [e.x + e.width / 2, e.y + e.height - EDGE_INSET_PX] }[side]
  await landing(`the edge mark at ${row},${col} ${side}`, () => clickTimes(x, y, clicks))
}
await edge(5, 1, 'right', 1, 9)
await edge(5, 1, 'bottom', 4, 6)
await edge(5, 2, 'right', 2, 4)
await edge(5, 2, 'bottom', 3, 7)
await quiet()
await page.screenshot({ path: out('edges'), clip: gridClip(5, 1, 1, 2) })

// Corners: a click near a grid corner; 1 click is the X, 2 the circle.
await pick(5)
await landing('the corner X', () => clickTimes(...at(7, 2), 1))
await pick(9)
await landing('the corner circle', () => clickTimes(...at(7, 3), 2))
await quiet()
await page.screenshot({ path: out('corners'), clip: gridClip(6.6, 1.6, 0.8, 1.8) })

// Sliders: the panel's Thickness and Opacity sliders, and a thick line with its white outline over a colored cell.
const slider = await page.locator('#pen-tool-extras-thickness').boundingBox()
const dragSlider = async (selector, toX) => {
  const box = await page.locator(selector).boundingBox()
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(toX, y, { steps: 12 })
  await page.mouse.up()
}
await dragSlider('#pen-tool-extras-thickness', slider.x + slider.width + 30)
await dragSlider('#pen-tool-extras-opacity', slider.x + slider.width * 0.6)
await openPanel('#control-colour', '.tool-colour')
await page.mouse.click(...at(8.5, 6.5))
await page.locator('.tool-colour button[data-key="8"]').click()
await page.mouse.click(...at(8.5, 7.5))
await page.locator('.tool-colour button[data-key="8"]').click()
await openPanel('#control-pen', '.tool-pen')
await pick(9); await drag([[8.5, 5.5], [8.5, 7.5]])
await quiet()
const lineOverColor = await png(gridClip(8, 5, 1, 3))
const controls = await page.locator('.controls-buttons').boundingBox()
const slidersBox = await page.locator('#pen-tool-extras-thickness').boundingBox()
const opacityBox = await page.locator('#pen-tool-extras-opacity').boundingBox()
const top = Math.min(slidersBox.y, opacityBox.y)
const bottom = Math.max(slidersBox.y + slidersBox.height, opacityBox.y + opacityBox.height)
const sliderClip = { x: controls.x, y: top - 4, width: opacityBox.x + opacityBox.width - controls.x + 3, height: bottom - top + 8 }
await compose('sliders', [await png(sliderClip), lineOverColor], true)

// Gear: the pen tool button, with the gear in its corner.
await page.locator('.pen-tool-extras-gear').waitFor()
const penButton = await page.locator('#control-pen').boundingBox()
await page.screenshot({ path: out('gear'), clip: { x: penButton.x - 1, y: penButton.y - 1, width: penButton.width + 2, height: penButton.height + 2 } })

await browser.close()
