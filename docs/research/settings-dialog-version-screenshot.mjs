// Takes docs/research/settings-group-names.png (the Experimental group with all five scripts
// installed, each entry a plain name) and docs/research/settings-dialog-version.png (Digit color's
// dialog, its version as small text beside the heading). Run from the repo root:
// node docs/research/settings-dialog-version-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { openSettings } from '../../live/settings.mjs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const names = ['color-by-digit', 'digit-color', 'edge-marks', 'pen-color', 'dark-page']
const out = (f) => new URL(`./${f}`, import.meta.url).pathname

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 1700 } })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
for (const n of names) await page.addScriptTag({ content: readFileSync(new URL(`../../${n}.user.js`, import.meta.url), 'utf8') })
await page.locator('#digit-color-style').waitFor({ state: 'attached' })

const group = await openSettings(page)
await group.locator('p').filter({ hasText: 'Dark page' }).scrollIntoViewIfNeeded()
writeFileSync(out('settings-group-names.png'), await page.locator('.dialog').first().screenshot())
await group.locator('button').filter({ hasText: 'Digit color' }).click()
await page.locator('#digit-color-editor').waitFor({ state: 'visible' })
writeFileSync(out('settings-dialog-version.png'), await page.locator('.dialog').first().screenshot())
await browser.close()
