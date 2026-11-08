// Takes docs/research/color-by-digit/color-by-digit-outline.png (#578, #585): the Color by Digit button in Cell, Digit, Both and Off, on a normal
// page (top row) and on Dark Page (bottom row), at 3x, to judge the white outline on the mode word. Run from the repo root:
// node docs/research/color-by-digit/color-by-digit-outline-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const url = readFileSync(new URL('../../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../../color-by-digit.user.js', import.meta.url), 'utf8')
const darkScript = readFileSync(new URL('../../../dark-page.user.js', import.meta.url), 'utf8')
const out = new URL('./color-by-digit-outline.png', import.meta.url).pathname
const MODES = ['CELL', 'DIGIT', 'BOTH', 'OFF']

const browser = await chromium.launch()
const newContext = () => browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 3 })
const rows = []
for (const dark of [false, true]) {
  // A context of its own per row: storage is shared inside one, and a fresh install starts in Cell.
  const context = await newContext()
  const page = await context.newPage()
  await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
  await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
  await page.locator('#control-undo').waitFor()
  if (dark) {
    await page.addScriptTag({ content: darkScript })
    await page.locator('#dark-page-style').waitFor({ state: 'attached' })
  }
  await page.addScriptTag({ content: script })
  const button = page.locator('#control-colorbydigit')
  await button.waitFor({ state: 'visible' })
  const shots = []
  for (const label of MODES) {
    await page.waitForFunction((want) => document.querySelector('#control-colorbydigit [data-role="mode"]').textContent === want, label)
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)
    shots.push({ label, png: (await button.screenshot()).toString('base64') })
    const box = await button.boundingBox()
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6)
  }
  rows.push({ name: dark ? 'Dark Page' : 'Normal page', shots })
  await context.close()
}
const sheet = await (await newContext()).newPage()
await sheet.setContent(`<body style="margin:0;background:#888;font:14px sans-serif"><div id="sheet" style="display:inline-block;padding:12px">${rows.map((r) =>
  `<div style="display:flex;gap:16px;align-items:center;margin-bottom:12px"><b style="width:90px;color:#fff">${r.name}</b>${r.shots.map((s) =>
    `<figure style="margin:0;text-align:center;color:#fff"><img src="data:image/png;base64,${s.png}" style="width:96px"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`).join('')}</div></body>`)
await sheet.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))
writeFileSync(out, await sheet.locator('#sheet').screenshot())
await browser.close()
