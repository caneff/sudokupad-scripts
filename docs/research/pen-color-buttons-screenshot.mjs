// Takes docs/research/pen-color-buttons.png: the cell color tool's buttons 1-9 beside the pen
// tool's buttons 1-9, on a custom page whose index 0 holds a near-white color and whose indexes
// 1-9 are pink, yellow, aqua, orange, green, light grey, magenta, periwinkle, grey (the order of
// the cell page in the report behind #28). Run from the repo root:
// node docs/research/pen-color-buttons-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../pen-color.user.js', import.meta.url), 'utf8')
const out = new URL('./pen-color-buttons.png', import.meta.url).pathname
const CELLS = ['rgb(245, 245, 245)', 'rgb(240, 150, 190)', 'rgb(250, 230, 90)', 'rgb(90, 220, 220)', 'rgb(240, 150, 60)', 'rgb(110, 200, 80)', 'rgb(210, 210, 210)', 'rgb(220, 60, 200)', 'rgb(130, 140, 230)', 'rgb(110, 110, 110)']

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.evaluate((cells) => {
  const colors = Object.fromEntries(cells.map((c, i) => [String(i), c]))
  Framework.app.tools.colour.setPalette({ colors, pages: [Object.keys(colors)] })
  Framework.app.tools.colour.setPage(0)
}, CELLS)
await page.addScriptTag({ content: script })
await page.locator('#pen-color-style').waitFor({ state: 'attached' })
await page.evaluate(() => Framework.setSetting('toolpen', true))
await page.locator('#control-pen').waitFor({ state: 'visible' })

const shot = async (control, panel) => {
  const shown = () => page.locator(`${panel} button[data-key="1"]`).isVisible()
  for (let i = 0; i < 20 && !(await shown()); i++) { await page.click(control); await page.waitForTimeout(300) }
  return (await page.locator(panel).first().screenshot()).toString('base64')
}
const cellShot = await shot('#control-colour', '.tool-colour')
const penShot = await shot('#control-pen', '.tool-pen')
const compose = await (await browser.newContext({ viewport: { width: 900, height: 260 } })).newPage()
await compose.setContent(`<body style="margin:12px;font:14px sans-serif;background:#fff"><div style="display:flex;gap:24px"><div><b>Cell color buttons</b><br><img src="data:image/png;base64,${cellShot}"></div><div><b>Pen buttons</b><br><img src="data:image/png;base64,${penShot}"></div></div></body>`)
writeFileSync(out, await compose.screenshot({ fullPage: true }))
await browser.close()
