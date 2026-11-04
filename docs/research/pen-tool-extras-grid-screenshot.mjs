// Takes the Pen Tool Extras pictures of the color grid, slider options, dash length and mark growth, in docs/research/,
// at 1200x900, the mascot hidden:
//   pen-tool-extras-grid-dialog.png        the settings dialog: the 3x3 color grid, the slider boxes and sliders
//   pen-tool-extras-grid-panel-both.png    the pen panel with both sliders shown
//   pen-tool-extras-grid-panel-no-thickness.png, -no-opacity.png, -none.png   the panel with each slider hidden, and both
//   pen-tool-extras-grid-dashes-short.png, -long.png   page 2 lines at dash length 0 (dots) and 6
//   pen-tool-extras-grid-marks.png         edge and corner marks at thickness 5, 10 and 16
// Run from the repo root: node docs/research/pen-tool-extras-grid-screenshot.mjs [dialog|panel|dashes|marks]
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const out = (name) => new URL(`./${name}`, import.meta.url).pathname
const only = process.argv[2]
const wants = (part) => !only || only === part

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

const openEditor = async () => {
  await page.click('#control-settings')
  const group = page.locator('.dialog .setting-group').filter({ has: page.locator('label', { hasText: 'Experimental' }) })
  await group.waitFor({ state: 'visible' })
  if (await page.locator('.dialog .setting-group:not(.closed)').filter({ has: page.locator('label', { hasText: 'Experimental' }) }).count() === 0) await group.locator('label').first().click()
  await page.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Pen tool extras' }).first().click()
  await page.locator('#pen-tool-extras-editor').waitFor({ state: 'visible' })
}
const dialogButton = (text) => page.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()
const setShow = async (thickness, opacity) => {
  await openEditor()
  const box = (key, on) => page.locator(`input[data-show="${key}"]`).setChecked(on)
  await box('thickness', thickness)
  await box('opacity', opacity)
  await dialogButton('Save').click()
  await page.locator('#pen-tool-extras-editor').waitFor({ state: 'detached' })
  await page.waitForTimeout(300)
}
const panel = () => page.locator('.controls-buttons').boundingBox()
const shootPanel = async (name) => page.screenshot({ path: out(name), clip: await panel() })

if (wants('dialog')) {
  await openEditor()
  await page.locator('.dialog').screenshot({ path: out('pen-tool-extras-grid-dialog.png') })
  await dialogButton('Cancel').click()
}

if (wants('panel')) {
  await shootPanel('pen-tool-extras-grid-panel-both.png')
  await setShow(false, true)
  await shootPanel('pen-tool-extras-grid-panel-no-thickness.png')
  await setShow(true, false)
  await shootPanel('pen-tool-extras-grid-panel-no-opacity.png')
  await setShow(false, false)
  await shootPanel('pen-tool-extras-grid-panel-none.png')
  await setShow(true, true)
}

await browser.close()
