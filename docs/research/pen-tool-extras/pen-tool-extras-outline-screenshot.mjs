// Takes docs/research/pen-tool-extras/pen-tool-extras-outline.png: the White outline off (left) and on (right), on solid, dashed and arrow lines and on every kind of
// mark (edge X, direction arrows and circle, grid-corner X and circle), over the digits, at a thin and a thick Thickness, and at the thick one
// with Dark Page on (the black page shows the outline beyond the grid). The same lines and marks are drawn in each of the six shots, every line a
// real mouse drag and every mark a real click. It fails, writing nothing, when a line or mark does not land.
// Run from the repo root with Playwright's Chromium installed: node docs/research/pen-tool-extras/pen-tool-extras-outline-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const penScript = readFileSync(new URL('../../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const darkScript = readFileSync(new URL('../../../dark-page.user.js', import.meta.url), 'utf8')
const out = new URL('./pen-tool-extras-outline.png', import.meta.url).pathname

const DASH_KEY = 'PenColor_dash'
const THICKNESS_KEY = 'PenColor_thickness'
const OUTLINE_KEY = 'PenColor_outline'
const DASH_LENGTH = 3
const THIN = 2
const THICK = 12
const DRAG_STEPS = 14
const CLICK_PAUSE_MS = 150
const EDGE_INSET_PX = 2
// Page margin around the grid in a shot, wide enough to show a mark or an outline that sticks out of it.
const MARGIN_PX = 40
// [label, thickness, Dark Page]
const ROWS = [['thin lines and marks', THIN, false], ['thick lines and marks', THICK, false], ['thick, with Dark Page on', THICK, true]]

const browser = await chromium.launch()

async function shoot (thickness, outline, dark) {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })).newPage()
  await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
  await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
  await page.locator('#control-undo').waitFor()
  await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
  await page.evaluate(([d, t, o, dash]) => {
    Framework.setData(d, dash)
    Framework.setData(t[0], t[1])
    if (o[1]) Framework.setData(o[0], true)
  }, [DASH_KEY, [THICKNESS_KEY, thickness], [OUTLINE_KEY, outline], DASH_LENGTH])
  if (dark) {
    await page.addScriptTag({ content: darkScript })
    await page.locator('#dark-page-style').waitFor({ state: 'attached' })
  }
  await page.addScriptTag({ content: penScript })
  await page.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
  await page.evaluate(() => Framework.setSetting('toolpen', true))
  await page.locator('#control-pen').waitFor({ state: 'visible' })
  const shown = () => page.locator('.tool-pen button[data-key="1"]').isVisible()
  for (let i = 0; i < 20 && !(await shown()); i++) { await page.click('#control-pen'); await page.waitForTimeout(300) }

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
  await page.evaluate(() => { ToolPen.tool.lineMode = 'centeronly' })

  // Page 1: two solid lines that cross over the 9 of row 1, and a diagonal one over the 8 and 3. Pen 4 is green, 7 red.
  await pick(4); await drag([[1.5, 3.5], [1.5, 5.5]])
  await pick(7); await drag([[0.5, 4.5], [2.5, 4.5]])
  await pick(4); await drag([[3.5, 0.5], [5.5, 2.5]])
  // Page 2: dashed lines. Pen 9 is blue, 5 purple.
  await pageButton.click()
  await pick(9); await drag([[4.5, 3.5], [4.5, 6.5], [6.5, 6.5]])
  await pick(5); await drag([[2.5, 6.5], [2.5, 8.5]])
  // Page 3: arrow lines. Pen 6 is orange, 5 purple.
  await pageButton.click()
  await pick(6); await drag([[7.5, 2.5], [7.5, 6.5]])
  await pick(5); await drag([[8.5, 8.5], [6.5, 8.5], [6.5, 7.5]])

  await pageButton.click()
  const EDGES = [[1, 1, 'right', 1, 9], [4, 5, 'right', 2, 4], [4, 5, 'bottom', 3, 7], [7, 7, 'left', 4, 6], [0, 2, 'bottom', 1, 5]]
  for (const [row, col, side, clicks, key] of EDGES) {
    await pick(key)
    const e = await rect(row, col)
    const [x, y] = { right: [e.x + e.width - EDGE_INSET_PX, e.y + e.height / 2], left: [e.x + EDGE_INSET_PX, e.y + e.height / 2], bottom: [e.x + e.width / 2, e.y + e.height - EDGE_INSET_PX] }[side]
    await landing(`the edge mark at ${row},${col} ${side}`, async () => { for (let i = 0; i < clicks; i++) { await page.mouse.click(x, y); await page.waitForTimeout(CLICK_PAUSE_MS) } })
  }
  const CORNERS = [[0, 0, 1, 4], [0, 9, 2, 6], [9, 0, 2, 9], [9, 9, 1, 5], [3, 3, 2, 7], [6, 3, 1, 9]]
  for (const [row, col, clicks, key] of CORNERS) {
    await pick(key)
    await landing(`the corner mark at ${row},${col}`, async () => { for (let i = 0; i < clicks; i++) { await page.mouse.click(...at(row, col)); await page.waitForTimeout(CLICK_PAUSE_MS) } })
  }
  await page.mouse.move(5, 5)
  await page.waitForTimeout(500)
  const filter = await page.evaluate(() => window.getComputedStyle(document.querySelector('#cell-pen')).filter)
  if ((filter !== 'none') !== outline) throw new Error(`the pen layer's filter is ${filter} with the outline ${outline ? 'on' : 'off'}`)
  const png = await page.screenshot({ clip: { x: first.x - MARGIN_PX, y: first.y - MARGIN_PX, width: cell * 9 + 2 * MARGIN_PX, height: cell * 9 + 2 * MARGIN_PX } })
  await page.context().close()
  return png.toString('base64')
}

const cells = []
for (const [, thickness, dark] of ROWS) cells.push([await shoot(thickness, false, dark), await shoot(thickness, true, dark)])
const sheet = await browser.newPage({ viewport: { width: 1200, height: 1800 } })
const row = ([label], i) => `<div style="font-size:22px;margin:14px 0 4px">${label}</div><div style="display:flex;gap:12px">` +
  cells[i].map((data, k) => `<figure style="margin:0"><img src="data:image/png;base64,${data}" style="width:580px;display:block"><figcaption style="font-size:18px">outline ${k ? 'on' : 'off'}</figcaption></figure>`).join('') + '</div>'
await sheet.setContent(`<body style="margin:0;background:#fff;font-family:sans-serif;padding:12px">${ROWS.map(row).join('')}</body>`)
await sheet.waitForLoadState('load')
await sheet.screenshot({ path: out, fullPage: true })
await browser.close()
