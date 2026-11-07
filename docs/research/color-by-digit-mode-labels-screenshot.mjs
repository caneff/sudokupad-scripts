// Takes docs/research/color-by-digit-mode-labels.png: the Color by Digit button in each mode (CELL, DIGIT, BOTH, OFF), on
// Low/5/High (three groups in a row) and on Each digit (four groups, 2 by 2, the icon's tallest layout), at 3x so the label's
// fit in the button's top strip can be judged. DIGIT is the widest label. Run from the repo root:
// node docs/research/color-by-digit-mode-labels-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')
const out = new URL('./color-by-digit-mode-labels.png', import.meta.url).pathname
const LABELS = ['CELL', 'DIGIT', 'BOTH', 'OFF']

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 3 })
const page = await context.newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addScriptTag({ content: script })
const button = page.locator('#control-colorbydigit')
await button.waitFor({ state: 'visible' })
const labelIs = (want) => page.waitForFunction((want) => document.querySelector('#control-colorbydigit [data-role="mode"]').textContent === want, want)

const shots = []
for (const profile of ['Low/5/High', 'Each digit']) {
  await page.click('#control-colorbydigit [data-role="menu"]')
  await page.locator('#color-by-digit-menu [data-act=pick]').filter({ hasText: profile }).click()
  // A fresh install starts in Cell, and four presses come back to it.
  for (const label of LABELS) {
    await labelIs(label)
    await page.mouse.move(0, 0)
    shots.push({ profile, label, png: (await button.screenshot()).toString('base64') })
    const box = await button.boundingBox()
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6)
  }
}

// The shots side by side, one row per profile, laid out on a page of their own.
const sheet = await context.newPage()
await sheet.setContent(`<body style="margin:0;background:#fff;font:14px sans-serif"><div id="sheet" style="display:inline-block;padding:12px">${['Low/5/High', 'Each digit'].map((profile) =>
  `<div style="display:flex;gap:16px;align-items:center;margin-bottom:12px"><b style="width:90px">${profile}</b>${shots.filter((s) => s.profile === profile).map((s) =>
    `<figure style="margin:0;text-align:center"><img src="data:image/png;base64,${s.png}" style="width:96px;border:1px dashed #ccc"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`).join('')}</div></body>`)
await sheet.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))
writeFileSync(out, await sheet.locator('#sheet').screenshot())
await browser.close()
