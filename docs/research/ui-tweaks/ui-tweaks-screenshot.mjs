// Takes docs/research/ui-tweaks/ui-tweaks.png, the homepage's picture of UI Tweaks: its dialog beside the bottom row of
// buttons wrapped after five (Color by Digit, Pen Tool Extras and Text Anywhere in the row, with two more buttons
// standing in for others). 1200x900 viewport, mascot hidden. Run from the repo root:
// node docs/research/ui-tweaks/ui-tweaks-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const read = (file) => readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8')
const url = read('live/puzzle-url.txt').trim()
const out = new URL('./ui-tweaks.png', import.meta.url).pathname

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length > 0)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
for (const file of ['color-by-digit', 'pen-tool-extras', 'draw-tool', 'ui-tweaks']) await page.addScriptTag({ content: read(`${file}.user.js`) })
await page.evaluate(() => {
  Framework.setSetting('toolpen', true)
  for (const name of ['more1', 'more2']) Framework.addControlButton({ parent: '.controls-aux', name, title: name, content: '<div class="icon">+</div>', onClick () {} })
  Framework.app.refreshControls()
})
await page.locator('#control-more2').waitFor({ state: 'visible' })

// The dialog, with the Wrap buttons choice made, cropped to itself.
await page.click('#control-settings')
const group = page.locator('.dialog .setting-group').filter({ has: page.locator('label', { hasText: 'Experimental' }) })
await group.waitFor({ state: 'visible' })
if (await page.locator('.dialog .setting-group:not(.closed)').filter({ has: page.locator('label', { hasText: 'Experimental' }) }).count() === 0) await group.locator('label').first().click()
await page.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'UI Tweaks' }).first().click()
const body = page.locator('#ui-tweaks-dialog')
await body.waitFor({ state: 'visible' })
await body.locator('input[data-option="wrapButtons"]').check()
await body.evaluate((el) => Promise.all([el.closest('.dialog'), el.closest('.dialog-overlay')].flatMap((e) => e.getAnimations()).map((a) => a.finished)))
const dialogShot = await page.locator('.dialog').screenshot()
await page.locator('.dialog button').filter({ hasText: /^\s*Save\s*$/ }).click()
await body.waitFor({ state: 'detached' })

// The controls with the row wrapped.
await page.waitForTimeout(500)
const controlsShot = await page.screenshot({ clip: { x: 712, y: 330, width: 400, height: 460 } })

// Side by side in one picture.
const compose = await (await browser.newContext({ viewport: { width: 1000, height: 520 } })).newPage()
const uri = (png) => `data:image/png;base64,${png.toString('base64')}`
await compose.setContent(`<body style="margin:0;background:#fff;display:flex;gap:24px;align-items:center;justify-content:center;height:520px"><img src="${uri(dialogShot)}"><img src="${uri(controlsShot)}" style="border:1px solid #ccc"></body>`)
await compose.screenshot({ path: out })
await browser.close()
