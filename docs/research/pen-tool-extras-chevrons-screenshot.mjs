// Draws center, edge and diagonal lines in page 3 pens (chevron lines) on sudokupad.app with pen-tool-extras.user.js, both ways
// and with turns, and shoots the board at thickness 1, 5 and 16 (the thin and thick ends and the default), then the pen panel on
// page 3. The shots are laid side by side into docs/research/pen-tool-extras-chevrons.png.
// Run from the repo root with Playwright's Chromium installed. Not part of any test.
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
const url = readFileSync('live/puzzle-url.txt', 'utf8').trim()
const script = readFileSync('pen-tool-extras.user.js', 'utf8')
mkdirSync('.scratch', { recursive: true })
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 3 })
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
await p.click('.pen-tool-extras-page'); await p.click('.pen-tool-extras-page')
const cell = await p.evaluate(() => { const c = Framework.app.puzzle.cells; const a = c.find(x => x.row === 0 && x.col === 0).elem.getBoundingClientRect(); const d = c.find(x => x.row === 1 && x.col === 1).elem.getBoundingClientRect(); return { x: a.x, y: a.y, w: d.x - a.x, h: d.y - a.y } })
// point in grid units (r, c) where cell centres are at +0.5
const pt = (r, c) => [cell.x + c * cell.w, cell.y + r * cell.h]
const drag = async (pts) => {
  await p.mouse.move(...pt(...pts[0])); await p.mouse.down()
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pt(...pts[i - 1]); const [x1, y1] = pt(...pts[i]); for (let k = 1; k <= 14; k++) await p.mouse.move(x0 + (x1 - x0) * k / 14, y0 + (y1 - y0) * k / 14) }
  await p.mouse.up()
}
const mode = (m) => p.evaluate((m) => { ToolPen.tool.lineMode = m }, m)
// pen 3: a center line right, down, down-right, right, then back up and left; pen 6: edge lines both ways; pen 4: along the border
await p.locator('.tool-pen button[data-key="3"]').click()
await mode('centeronly'); await drag([[0.5, 0.5], [0.5, 3.5], [3.5, 3.5], [5.5, 5.5], [5.5, 7.5], [3.5, 7.5], [3.5, 4.5]])
await p.locator('.tool-pen button[data-key="6"]').click()
await mode('edgeonly'); await drag([[7, 1], [7, 4], [9, 4], [9, 7]]); await drag([[6, 8], [6, 6], [8, 8]])
await p.locator('.tool-pen button[data-key="4"]').click()
await mode('edgeonly'); await drag([[0, 5], [0, 8], [3, 8]])
console.log(await p.evaluate(() => Framework.app.puzzle.cells.flatMap(c => c.pen.map(v => c.row + ',' + c.col + ':' + String(v))).join(' ')))
const shots = []
for (const t of [1, 5, 16]) {
  await p.evaluate((t) => { const el = document.getElementById('pen-tool-extras-thickness'); el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })) }, t)
  await p.mouse.move(5, 5)
  shots.push([`thickness ${t}`, (await p.screenshot({ clip: { x: cell.x - 10, y: cell.y - 10, width: cell.w * 9 + 20, height: cell.h * 9 + 20 } })).toString('base64')])
}
await p.evaluate(() => { const el = document.getElementById('pen-tool-extras-thickness'); el.value = 5; el.dispatchEvent(new Event('input', { bubbles: true })) })
const panel = await p.evaluate(() => { const r = document.querySelector('.tool-pen .controls-input').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
shots.push(['the pen panel on page 3', (await p.screenshot({ clip: panel })).toString('base64')])
const sheet = await b.newPage({ viewport: { width: 2400, height: 1000 } })
await sheet.setContent(`<body style="margin:0;background:#fff;font:28px sans-serif;display:flex;gap:24px;padding:16px;align-items:flex-start">${shots.map(([label, data]) => `<figure style="margin:0"><img src="data:image/png;base64,${data}" style="height:760px"><figcaption>${label}</figcaption></figure>`).join('')}</body>`)
await sheet.waitForLoadState('load')
await sheet.screenshot({ path: 'docs/research/pen-tool-extras-chevrons.png', fullPage: true })
console.log('page errors', errs)
await b.close()
