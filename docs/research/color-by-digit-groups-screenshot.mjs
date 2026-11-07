// Takes the Color by Digit dialog pictures for the compact group rows (#306): Each digit selected, all rows closed, then one
// group open, at 1200x900 and 390x800. Writes color-by-digit-groups-<closed|open>-<desktop|phone>.png beside this file.
// Run from the repo root: node docs/research/color-by-digit-groups-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { openSettings } from '../../live/settings.mjs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')
const out = (name) => new URL(`./color-by-digit-groups-${name}.png`, import.meta.url).pathname
const eachDigit = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => ({ key: d, digits: d === '5' ? ['5', '0'] : [d] }))
const state = { profiles: [{ name: 'Each digit', groups: eachDigit }], active: 0 }

const browser = await chromium.launch()
for (const [name, viewport] of [['desktop', { width: 1200, height: 900 }], ['phone', { width: 390, height: 800 }]]) {
  const page = await (await browser.newContext({ viewport })).newPage()
  await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
  await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
  await page.locator('#control-undo').waitFor()
  await page.evaluate((s) => { Framework.setData('ColorByDigit_profiles', s); Framework.setData('ColorByDigit_addedPreloads', true); Framework.setData('ColorByDigit_addedEachDigit', true) }, state)
  await page.addScriptTag({ content: script })
  await page.locator('#control-colorbydigit').waitFor({ state: 'attached' })
  const group = await openSettings(page)
  await group.locator('button').filter({ hasText: 'Color by Digit' }).click()
  await page.locator('#color-by-digit-editor').waitFor({ state: 'visible' })
  await page.locator('.dialog').first().screenshot({ path: out(`closed-${name}`) })
  await page.locator('#color-by-digit-editor button[data-act=open][data-group="2"]').click()
  await page.locator('.dialog').first().screenshot({ path: out(`open-${name}`) })
}
await browser.close()
