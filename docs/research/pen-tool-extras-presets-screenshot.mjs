// Takes the Pen Tool Extras pen color preset picture in docs/research/:
//   pen-tool-extras-presets.png  the settings dialog's Pen colors section, from its heading to the last row of pickers, with the
//                                preset pulldown showing "Darker page 1", the set a fresh install saves
// Run from the repo root: node docs/research/pen-tool-extras-presets-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const out = (name) => new URL(`./${name}`, import.meta.url).pathname

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 1000 } })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addScriptTag({ content: script })
await page.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
await page.evaluate(() => Framework.setSetting('toolpen', true))
// The install save has run once the colors are saved with their preset name.
await page.waitForFunction(() => (Framework.getData('PenColor_colors') || {}).preset === 'page-1')
await page.click('#control-settings')
await page.locator('.dialog .setting-group label', { hasText: 'Experimental' }).first().click()
await page.locator('.dialog button', { hasText: 'Pen Tool Extras' }).first().click()
const editor = page.locator('#pen-tool-extras-editor')
await editor.waitFor({ state: 'visible' })
const shown = await editor.locator('select[data-pen-preset]').evaluate((el) => el.selectedOptions[0].textContent)
if (shown !== 'Darker page 1') throw new Error(`the pulldown shows ${shown}`)
// The dialog grows into place, so its box is read once it has stopped moving.
const measure = () => editor.evaluate((el) => {
  const heading = [...el.querySelectorAll('div')].find((d) => d.textContent === 'Pen colors').getBoundingClientRect()
  const last = el.querySelector('input[data-pen="9"]').getBoundingClientRect()
  const all = el.getBoundingClientRect()
  return { x: all.x, y: heading.y, width: all.width, height: last.bottom - heading.y }
})
let box = await measure()
for (let i = 0; i < 50; i++) {
  await page.waitForTimeout(100)
  const next = await measure()
  if (JSON.stringify(next) === JSON.stringify(box) && box.width > 0) break
  box = next
}
const margin = 8
await page.screenshot({ path: out('pen-tool-extras-presets.png'), clip: { x: box.x - margin, y: box.y - margin, width: box.width + 2 * margin, height: box.height + 2 * margin } })
await browser.close()
