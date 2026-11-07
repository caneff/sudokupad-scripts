// Takes a picture of Pen Tool Extras' page button on each pen page, with dashes (dash 3) and with dots (dash 0):
// docs/research/<label>-page-button.png, the pen buttons on page 3: <label>-page-3-pen-buttons.png, and an arrow line on the grid at the default thickness: <label>-grid-arrow-line.png, for #228. Run from the repo root:
// node docs/research/pen-tool-extras/pen-tool-extras-page-button-screenshot.mjs <label> [script path]
/* global Framework */
import { chromium } from 'playwright'
import { openPage, startPuzzle } from '../../../live/page.mjs'
import { drag, gridPoint, openPenTool, padValues } from '../../../live/pen.mjs'
import { readFileSync, writeFileSync } from 'node:fs'

const [label, scriptPath = 'pen-tool-extras.user.js'] = process.argv.slice(2)
const script = readFileSync(scriptPath, 'utf8')
const out = new URL(`./${label}-page-button.png`, import.meta.url).pathname
const BUTTON = '.pen-tool-extras-page'

const browser = await chromium.launch()
const { p: page } = await openPage(browser, { contextOptions: { deviceScaleFactor: 4 } })
const boot = async () => {
  await startPuzzle(page)
  await page.addScriptTag({ content: script })
  await page.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
  await page.evaluate(() => { Framework.setSetting('toolpen', true); Framework.setSetting('toolletter', true) })
  await page.locator('#control-pen').waitFor({ state: 'visible' })
  await openPenTool(page)
  await page.locator(BUTTON).waitFor({ state: 'visible' })
}
const shots = []
for (const dash of [3, 0]) {
  await page.reload({ waitUntil: 'load' })
  await startPuzzle(page)
  await page.evaluate((d) => { Framework.removeData('PenColor_linestyles'); Framework.setData('PenColor_dash', d) }, dash)
  await page.reload({ waitUntil: 'load' })
  await boot()
  for (let pageNo = 1; pageNo <= 3; pageNo++) {
    const values = await padValues(page)
    shots.push({ dash, pageNo, values, png: (await page.locator(BUTTON).screenshot()).toString('base64') })
    await page.locator(BUTTON).click()
    await page.waitForTimeout(400)
  }
}
const cells = shots.map((s) => `<div style="text-align:center"><img src="data:image/png;base64,${s.png}" style="width:96px;border:1px solid #ccc"><br>on page ${s.pageNo}, dash ${s.dash}</div>`).join('')
const compose = await (await browser.newContext({ viewport: { width: 560, height: 360 } })).newPage()
await compose.setContent(`<body style="margin:12px;font:13px sans-serif;background:#fff"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">${cells}</div></body>`)
writeFileSync(out, await compose.screenshot({ fullPage: true }))
await page.reload({ waitUntil: 'load' })
await boot()
for (let i = 0; i < 2; i++) { await page.locator(BUTTON).click(); await page.waitForTimeout(400) }
writeFileSync(out.replace('-page-button.png', '-page-3-pen-buttons.png'), await page.locator('.tool-pen').first().screenshot())
await page.locator('.tool-pen button[data-key="3"]').click()
await drag(page, [[2.5, 1.5], [2.5, 5.5]])
const [[x0, y0], [x1, y1]] = await Promise.all([gridPoint(page, [1.5, 1]), gridPoint(page, [3.5, 6.5])])
writeFileSync(out.replace('-page-button.png', '-grid-arrow-line.png'), await page.screenshot({ clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } }))
await browser.close()
