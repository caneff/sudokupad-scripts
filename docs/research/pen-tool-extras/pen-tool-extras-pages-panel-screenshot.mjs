// Shoots the pen tool's panel on page 1, 2 and 3 on sudokupad.app with pen-tool-extras.user.js (the swatches: SudokuPad's own, a dashed line and a chevron line), and the
// settings dialog with its SudokuPad colors button, then lays them into docs/research/pen-tool-extras/pen-tool-extras-pages-panel.png.
// Run from the repo root with Playwright's Chromium installed. Not part of any test.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const url = readFileSync('live/puzzle-url.txt', 'utf8').trim()
const script = readFileSync('pen-tool-extras.user.js', 'utf8')
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })
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
await p.locator('.tool-pen button[data-key="3"]').click()
const shots = []
const panel = async (label) => {
  await p.mouse.move(5, 5)
  await p.waitForTimeout(300)
  const r = await p.evaluate(() => { const e = document.querySelector('.tool-pen .controls-input').getBoundingClientRect(); return { x: e.x, y: e.y, width: e.width, height: e.height } })
  shots.push([label, (await p.screenshot({ clip: r })).toString('base64')])
}
await panel('page 1')
await p.click('.pen-tool-extras-page'); await panel('page 2')
await p.click('.pen-tool-extras-page'); await panel('page 3')
await p.click('#control-settings')
const group = p.locator('.dialog .setting-group').filter({ has: p.locator('label', { hasText: 'Experimental' }) })
await group.waitFor({ state: 'visible' })
if (await p.locator('.dialog .setting-group:not(.closed)').filter({ has: p.locator('label', { hasText: 'Experimental' }) }).count() === 0) await group.locator('label').first().click()
await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Pen Tool Extras' }).first().click()
await p.locator('#pen-tool-extras-editor').waitFor({ state: 'visible' })
shots.push(['the settings dialog', (await p.locator('.dialog').screenshot()).toString('base64')])
const sheet = await b.newPage({ viewport: { width: 1500, height: 900 } })
await sheet.setContent(`<body style="margin:0;background:#fff;font:22px sans-serif;display:flex;gap:20px;padding:16px;align-items:flex-start">${shots.map(([label, data]) => `<figure style="margin:0"><img src="data:image/png;base64,${data}" style="max-height:700px"><figcaption>${label}</figcaption></figure>`).join('')}</body>`)
await sheet.waitForLoadState('load')
await sheet.screenshot({ path: 'docs/research/pen-tool-extras/pen-tool-extras-pages-panel.png', fullPage: true })
await b.close()
