// Takes the Color by Digit dialog and profile menu screenshots for #211, desktop (1200x900) and phone (390x800), to compare a style change pixel by pixel.
// Run from the repo root: node docs/research/color-by-digit/color-by-digit-style-screenshot.mjs <script path> <out prefix>. The desktop dialog's outer 11px strip is the board behind it and differs between runs.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { openSettings } from '../../../live/settings.mjs'

const [scriptPath, prefix] = process.argv.slice(2)
const url = readFileSync(new URL('../../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(scriptPath, 'utf8')
const group = (key, digits) => ({ key, digits })
const state = { profiles: [
  { name: 'Low/5/High', groups: [group('1', ['0', '1', '2', '3', '4']), group('5', ['5']), group('9', ['6', '7', '8', '9'])] },
  { name: 'Odd/Even', groups: [group('1', ['1', '3', '5', '7', '9']), group('2', ['0', '2', '4', '6', '8'])] }
], active: 0 }
const browser = await chromium.launch()
for (const [name, viewport] of [['desktop', { width: 1200, height: 900 }], ['phone', { width: 390, height: 800 }]]) {
  const page = await (await browser.newContext({ viewport })).newPage()
  await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
  await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
  await page.locator('#control-undo').waitFor()
  await page.evaluate((s) => { Framework.setData('ColorByDigit_profiles', s) }, state)
  await page.addScriptTag({ content: script })
  await page.locator('#control-colorbydigit').waitFor({ state: 'attached' })
  await page.waitForTimeout(800)
  await page.click('#control-colorbydigit [data-role=menu]')
  await page.locator('#color-by-digit-menu').waitFor()
  await page.locator('#color-by-digit-menu').screenshot({ path: `${prefix}-menu-${name}.png` })
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)
  const g = await openSettings(page)
  await g.locator('button').filter({ hasText: 'Color by digit' }).click()
  await page.locator('#color-by-digit-editor').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)
  await page.locator('.dialog').first().screenshot({ path: `${prefix}-dialog-${name}.png` })
}
await browser.close()
