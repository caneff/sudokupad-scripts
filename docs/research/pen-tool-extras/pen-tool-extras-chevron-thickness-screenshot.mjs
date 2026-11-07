// Draws a page 1 line (solid) and a page 3 line (chevrons) side by side, straight and diagonal, on sudokupad.app with pen-tool-extras.user.js,
// at thickness 1, 5, 10 and 16, and lays the four shots into docs/research/pen-tool-extras/pen-tool-extras-chevron-thickness.png. The line under the chevrons
// should be as wide as the page 1 line at every thickness, with the chevrons clearly sticking out past it.
// Run from the repo root with Playwright's Chromium installed. Not part of any test.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const url = readFileSync('live/puzzle-url.txt', 'utf8').trim()
const script = readFileSync('pen-tool-extras.user.js', 'utf8')
const THICKNESSES = [1, 5, 10, 16]
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 3 })
const errs = []; p.on('pageerror', e => errs.push(String(e)))
await p.route(/cookiebot|googletagmanager|plausible/, r => r.abort())
await p.goto(url, { waitUntil: 'load' })
await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await p.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await p.locator('#control-undo').waitFor()
await p.addScriptTag({ content: script })
await p.evaluate(() => Framework.setSetting('toolpen', true))
await p.locator('#control-pen').waitFor()
for (let i = 0; i < 20 && !(await p.locator('.tool-pen button[data-key="1"]').isVisible()); i++) { await p.click('#control-pen'); await p.waitForTimeout(300) }
await p.locator('.pen-tool-extras-page').waitFor()
const cell = await p.evaluate(() => { const c = Framework.app.puzzle.cells; const a = c.find(x => x.row === 0 && x.col === 0).elem.getBoundingClientRect(); const d = c.find(x => x.row === 1 && x.col === 1).elem.getBoundingClientRect(); return { x: a.x, y: a.y, w: d.x - a.x, h: d.y - a.y } })
const pt = (r, c) => [cell.x + c * cell.w, cell.y + r * cell.h]
const drag = async (pts) => {
  await p.mouse.move(...pt(...pts[0])); await p.mouse.down()
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pt(...pts[i - 1]); const [x1, y1] = pt(...pts[i]); for (let k = 1; k <= 14; k++) await p.mouse.move(x0 + (x1 - x0) * k / 14, y0 + (y1 - y0) * k / 14) }
  await p.mouse.up()
}
await p.evaluate(() => { ToolPen.tool.lineMode = 'centeronly' })
// page 1 pen 4 (red) first, then page 3 pen 4: the same color, so only the look differs
await p.locator('.tool-pen button[data-key="4"]').click()
await drag([[1.5, 0.5], [1.5, 4.5]]); await drag([[3.5, 0.5], [5.5, 2.5]])
await p.click('.pen-tool-extras-page'); await p.click('.pen-tool-extras-page')
await drag([[1.5, 4.5], [1.5, 8.5]]); await drag([[3.5, 4.5], [5.5, 6.5]])
// a page 3 line beside a page 1 line, both across the same cells: page 1 below, page 3 above
await drag([[7.5, 0.5], [7.5, 4.5]])
await p.click('.pen-tool-extras-page')
await drag([[7.5, 4.5], [7.5, 8.5]])
const shots = []
for (const t of THICKNESSES) {
  await p.evaluate((t) => { const el = document.getElementById('pen-tool-extras-thickness'); el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })) }, t)
  await p.mouse.move(5, 5)
  shots.push([`thickness ${t}`, (await p.screenshot({ clip: { x: cell.x - 6, y: cell.y - 6, width: cell.w * 9 + 12, height: cell.h * 9 + 12 } })).toString('base64')])
}
const sheet = await b.newPage({ viewport: { width: 1100, height: 1200 } })
await sheet.setContent(`<body style="margin:0;background:#fff;font:24px sans-serif;display:grid;grid-template-columns:repeat(2,520px);gap:16px;padding:16px">${shots.map(([label, data]) => `<figure style="margin:0"><img src="data:image/png;base64,${data}" style="width:520px"><figcaption>${label}</figcaption></figure>`).join('')}</body>`)
await sheet.waitForLoadState('load')
await sheet.screenshot({ path: 'docs/research/pen-tool-extras/pen-tool-extras-chevron-thickness.png', fullPage: true })
console.log('page errors', errs)
await b.close()
