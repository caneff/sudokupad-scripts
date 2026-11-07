// Takes the Pen Tool Extras panel pictures in docs/research/pen-tool-extras/, at 1200x900, the mascot hidden:
//   pen-tool-extras-panel.png         the pen tool's panel with the two sliders at their defaults
//   pen-tool-extras-panel-moved.png   the same panel, Thickness near the top and Opacity low, after real drags
//   pen-tool-extras-panel-letter.png  the panel with the letter tool and Color by Digit also on, to show no overlap
//   pen-tool-extras-panel-dialog.png  the settings dialog, which holds neither slider any more
// Run from the repo root: node docs/research/pen-tool-extras/pen-tool-extras-panel-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const colorByDigit = readFileSync(new URL('../../../color-by-digit.user.js', import.meta.url), 'utf8')
const out = (name) => new URL(`./${name}`, import.meta.url).pathname

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.addScriptTag({ content: script })
await page.evaluate(() => Framework.setSetting('toolpen', true))
await page.locator('#control-pen').waitFor({ state: 'visible' })
const shown = () => page.locator('.tool-pen button[data-key="1"]').isVisible()
for (let i = 0; i < 20 && !(await shown()); i++) { await page.click('#control-pen'); await page.waitForTimeout(300) }

// The panel and the buttons around it, as a clip.
const clip = async () => page.locator('.controls-buttons').boundingBox()
const shoot = async (name) => page.screenshot({ path: out(name), clip: await clip() })

await shoot('pen-tool-extras-panel.png')

const drag = async (selector, toX) => {
  const box = await page.locator(selector).boundingBox()
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(toX, y, { steps: 12 })
  await page.mouse.up()
}
const thickness = await page.locator('#pen-tool-extras-thickness').boundingBox()
await drag('#pen-tool-extras-thickness', thickness.x + thickness.width + 30)
await drag('#pen-tool-extras-opacity', thickness.x - 30)
await page.waitForTimeout(200)
await shoot('pen-tool-extras-panel-moved.png')

// The letter tool and Color by Digit fill the other columns; the sliders stay inside their own row.
await page.evaluate(() => Framework.setSetting('toolletter', true))
await page.addScriptTag({ content: colorByDigit })
await page.waitForTimeout(1500)
if (!(await shown())) await page.click('#control-pen')
await page.waitForTimeout(300)
await shoot('pen-tool-extras-panel-letter.png')

await page.evaluate(() => { Framework.removeData('PenColor_thickness'); Framework.removeData('PenColor_opacity') })
await page.click('#control-settings')
const group = page.locator('.dialog .setting-group').filter({ has: page.locator('label', { hasText: 'Experimental' }) })
await group.waitFor({ state: 'visible' })
if (await page.locator('.dialog .setting-group:not(.closed)').filter({ has: page.locator('label', { hasText: 'Experimental' }) }).count() === 0) await group.locator('label').first().click()
await page.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Pen Tool Extras' }).first().click()
await page.locator('#pen-tool-extras-editor').waitFor({ state: 'visible' })
await page.locator('.dialog').screenshot({ path: out('pen-tool-extras-panel-dialog.png') })
await browser.close()
