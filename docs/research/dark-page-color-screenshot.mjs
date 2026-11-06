// Takes docs/research/dark-page-color.png: Dark Page's options dialog, then the page before (the
// default black) and after picking a light color, 1200x900 viewport. Run from the repo root:
// node docs/research/dark-page-color-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../dark-page.user.js', import.meta.url), 'utf8')
const out = new URL('./dark-page-color.png', import.meta.url).pathname
const PICKED = '#f0d9a8'

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addScriptTag({ content: script })
await page.locator('#dark-page-style').waitFor({ state: 'attached' })
const shot = async () => (await page.screenshot()).toString('base64')
const before = await shot()
await page.click('#control-settings')
const group = page.locator('.dialog .setting-group').filter({ has: page.locator('label', { hasText: 'Experimental' }) })
await group.locator('label').first().click()
const entry = group.locator('button, [role=button]').filter({ hasText: /^\s*Dark Page\s*$/ })
await entry.waitFor({ state: 'visible' })
await entry.scrollIntoViewIfNeeded()
const settings = (await page.locator('.dialog').first().screenshot()).toString('base64')
await entry.click()
await page.locator('.dialog input[type=color]').fill(PICKED)
const dialog = (await page.locator('.dialog').first().screenshot()).toString('base64')
await page.getByRole('button', { name: 'Save', exact: true }).click()
const after = await shot()
await browser.close()

const compose = await (await chromium.launch()).newPage({ viewport: { width: 1500, height: 760 } })
const img = (b64, width) => `<img src="data:image/png;base64,${b64}" width="${width}" style="border:1px solid #888">`
await compose.setContent(`<body style="margin:12px;font:14px sans-serif;background:#fff"><div style="display:flex;gap:16px;align-items:flex-start">
<div><b>Before: default black</b><br>${img(before, 460)}</div>
<div><b>After: ${PICKED}</b><br>${img(after, 460)}</div>
<div><b>Settings group</b><br>${img(settings, 260)}<br><b>Dialog</b><br>${img(dialog, 260)}</div></div></body>`)
writeFileSync(out, await compose.screenshot({ fullPage: true }))
await compose.context().browser().close()
