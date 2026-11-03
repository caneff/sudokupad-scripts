// Takes the Color by Digit dialog screenshots for #31: desktop (1200x900) and phone (390x800),
// with the script at the given path. Run from the repo root:
//   node docs/research/color-by-digit-dialog-screenshot.mjs <script path> <out prefix>
// e.g. the "before" script is `git show origin/main:color-by-digit.user.js > before.js`.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const [scriptPath, prefix] = process.argv.slice(2)
const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(scriptPath, 'utf8')
const browser = await chromium.launch()
for (const [name, viewport] of [['desktop', { width: 1200, height: 900 }], ['phone', { width: 390, height: 800 }]]) {
  const page = await (await browser.newContext({ viewport })).newPage()
  await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
  await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
  await page.locator('#control-undo').waitFor()
  await page.addScriptTag({ content: script })
  await page.locator('#control-colorbydigit').waitFor({ state: 'attached' })
  await page.click('#control-settings')
  await page.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Color by digit' }).first().click()
  await page.locator('#color-by-digit-editor').waitFor({ state: 'visible' })
  await page.locator('.dialog').first().screenshot({ path: `${prefix}-${name}.png` })
}
await browser.close()
