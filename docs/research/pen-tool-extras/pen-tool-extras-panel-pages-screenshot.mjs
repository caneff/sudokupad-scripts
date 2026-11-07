// Takes docs/research/pen-tool-extras/pen-tool-extras-panel-pages.png (#254): the built pen panel at 1200x900 on pages 1, 2 and 3 (solid, dashed and arrow color buttons at 2.5rem)
// and on Dark Page, side by side, each at 2x. Not part of any test.
// Run from the repo root with Playwright Chromium: node docs/research/pen-tool-extras/pen-tool-extras-panel-pages-screenshot.mjs docs/research/pen-tool-extras/pen-tool-extras-panel-pages.png
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const out = process.argv[2]
const url = readFileSync(new URL('../../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const darkPage = readFileSync(new URL('../../../dark-page.user.js', import.meta.url), 'utf8')
const browser = await chromium.launch()

async function shoot (extra) {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })).newPage()
  await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
  await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
  await page.locator('#control-undo').waitFor()
  await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
  if (extra) await page.addScriptTag({ content: extra })
  await page.addScriptTag({ content: script })
  await page.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
  await page.evaluate(() => Framework.setSetting('toolpen', true))
  await page.locator('#control-pen').waitFor({ state: 'visible' })
  for (let i = 0; i < 20 && !(await page.locator('.tool-pen button[data-key="1"]').isVisible()); i++) { await page.click('#control-pen'); await page.waitForTimeout(300) }
  await page.locator('.pen-tool-extras-settings').waitFor()
  return page
}
const panelShot = async (page) => {
  await page.mouse.move(5, 5)
  await page.waitForTimeout(400)
  const r = await page.evaluate(() => { const e = document.querySelector('.tool-pen .controls-input').getBoundingClientRect(); return { x: e.x - 8, y: e.y - 8, width: e.width + 16, height: e.height + 16 } })
  return (await page.screenshot({ clip: r })).toString('base64')
}
const shots = []
const plain = await shoot()
shots.push(['page 1', await panelShot(plain)])
await plain.locator('.pen-tool-extras-page').click()
shots.push(['page 2 (dashed)', await panelShot(plain)])
await plain.locator('.pen-tool-extras-page').click()
shots.push(['page 3 (arrows)', await panelShot(plain)])
const dark = await shoot(darkPage)
shots.push(['Dark Page', await panelShot(dark)])

const sheet = await browser.newPage({ viewport: { width: 1100, height: 400 } })
await sheet.setContent(`<body style="margin:0;background:#888;font:16px sans-serif;display:flex;gap:16px;padding:12px;align-items:flex-start">${shots.map(([l, d]) => `<figure style="margin:0;width:250px"><img src="data:image/png;base64,${d}" style="width:250px"><figcaption style="color:#fff">${l}</figcaption></figure>`).join('')}</body>`)
await sheet.screenshot({ path: out, fullPage: true })
await browser.close()
