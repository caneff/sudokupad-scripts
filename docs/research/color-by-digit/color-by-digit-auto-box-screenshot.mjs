// Screenshot of the Color by Digit button with its auto mode box, off and on, beside Undo, Redo, Check and Select.
// Run: node docs/research/color-by-digit/color-by-digit-auto-box-screenshot.mjs (needs the network and `npm install`).
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../../color-by-digit.user.js', import.meta.url), 'utf8')
const out = new URL('./color-by-digit-auto-box.png', import.meta.url).pathname

const browser = await chromium.launch()
const p = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 3 })).newPage()
await p.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await p.goto(url, { waitUntil: 'load' })
await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await p.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await p.locator('#control-undo').waitFor({ state: 'visible' })
await p.addScriptTag({ content: script })
await p.locator('#control-colorbydigit').waitFor({ state: 'visible' })
const row = p.locator('.controls-aux')
const off = await row.screenshot()
await p.click('#control-colorbydigit [data-role="auto"]')
await p.locator('#control-colorbydigit [data-role="auto"][aria-checked="true"]').waitFor()
await p.mouse.move(0, 0)
const on = await row.screenshot()
// Both states in one picture: off above, on below.
const page = await browser.newPage()
await page.setContent(`<body style="margin:8px;background:#fff"><img src="data:image/png;base64,${off.toString('base64')}" style="display:block"><br><img src="data:image/png;base64,${on.toString('base64')}" style="display:block"></body>`)
await page.screenshot({ path: out, fullPage: true })
await browser.close()
