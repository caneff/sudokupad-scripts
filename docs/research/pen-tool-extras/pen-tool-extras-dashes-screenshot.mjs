// Draws a straight line, a line with turns and diagonal lines in a page 2 pen (dashed lines) on sudokupad.app with pen-tool-extras.user.js,
// at dash lengths 0, 3 and 8 and at a thin and a thick thickness, and lays the six shots into docs/research/pen-tool-extras/pen-tool-extras-dashes.png (a column
// per dash length, thin above thick). Each line should be inked at both ends, at every turn and at every join between cells.
// Run from the repo root with Playwright's Chromium installed. Not part of any test.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const url = readFileSync('live/puzzle-url.txt', 'utf8').trim()
const script = readFileSync('pen-tool-extras.user.js', 'utf8')
const DASHES = [0, 3, 8]
const THICKNESSES = [3, 12]
const b = await chromium.launch()
const errs = []
const shots = {}
for (const dash of DASHES) {
  const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })
  p.on('pageerror', e => errs.push(String(e)))
  await p.route(/cookiebot|googletagmanager|plausible/, r => r.abort())
  await p.goto(url, { waitUntil: 'load' })
  await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
  await p.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
  await p.locator('#control-undo').waitFor()
  await p.evaluate((d) => Framework.setData('PenColor_dash', d), dash)
  await p.addScriptTag({ content: script })
  await p.evaluate(() => Framework.setSetting('toolpen', true))
  await p.locator('#control-pen').waitFor()
  for (let i = 0; i < 20 && !(await p.locator('.tool-pen button[data-key="1"]').isVisible()); i++) { await p.click('#control-pen'); await p.waitForTimeout(300) }
  await p.locator('.pen-tool-extras-page').waitFor()
  await p.click('.pen-tool-extras-page')
  const cell = await p.evaluate(() => { const c = Framework.app.puzzle.cells; const a = c.find(x => x.row === 0 && x.col === 0).elem.getBoundingClientRect(); const d = c.find(x => x.row === 1 && x.col === 1).elem.getBoundingClientRect(); return { x: a.x, y: a.y, w: d.x - a.x, h: d.y - a.y } })
  const pt = (r, c) => [cell.x + c * cell.w, cell.y + r * cell.h]
  const drag = async (pts) => {
    await p.mouse.move(...pt(...pts[0])); await p.mouse.down()
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pt(...pts[i - 1]); const [x1, y1] = pt(...pts[i]); for (let k = 1; k <= 14; k++) await p.mouse.move(x0 + (x1 - x0) * k / 14, y0 + (y1 - y0) * k / 14) }
    await p.mouse.up()
  }
  await p.evaluate(() => { ToolPen.tool.lineMode = 'centeronly' })
  await p.locator('.tool-pen button[data-key="6"]').click()
  await drag([[0.5, 0.5], [0.5, 7.5]])
  await p.locator('.tool-pen button[data-key="4"]').click()
  await drag([[2.5, 0.5], [2.5, 3.5], [4.5, 3.5], [4.5, 1.5], [3.5, 1.5]])
  await p.locator('.tool-pen button[data-key="1"]').click()
  await drag([[6.5, 0.5], [8.5, 2.5], [6.5, 4.5], [8.5, 6.5]])
  await p.locator('.tool-pen button[data-key="3"]').click()
  await drag([[2.5, 5.5], [2.5, 7.5], [4.5, 7.5], [6.5, 5.5]])
  for (const t of THICKNESSES) {
    await p.evaluate((t) => { const el = document.getElementById('pen-tool-extras-thickness'); el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })) }, t)
    await p.mouse.move(5, 5)
    shots[`${dash}:${t}`] = (await p.screenshot({ clip: { x: cell.x - 6, y: cell.y - 6, width: cell.w * 9 + 12, height: cell.h * 9 + 12 } })).toString('base64')
  }
  await p.close()
}
const cells = THICKNESSES.flatMap((t) => DASHES.map((d) => `<figure style="margin:0"><img src="data:image/png;base64,${shots[`${d}:${t}`]}" style="width:520px"><figcaption>dash length ${d}, thickness ${t}</figcaption></figure>`))
const sheet = await b.newPage({ viewport: { width: 1640, height: 1200 } })
await sheet.setContent(`<body style="margin:0;background:#fff;font:24px sans-serif;display:grid;grid-template-columns:repeat(3,520px);gap:16px;padding:16px">${cells.join('')}</body>`)
await sheet.waitForLoadState('load')
await sheet.screenshot({ path: 'docs/research/pen-tool-extras/pen-tool-extras-dashes.png', fullPage: true })
console.log('page errors', errs)
await b.close()
