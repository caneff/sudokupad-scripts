// Takes the Text Annotation tool button in SudokuPad's real toolbar, from the real draw-tool.user.js on the recorded puzzle,
// not selected and selected, at 4x, side by side in one picture: draw-tool-button.png
// The script fails when the button's icon paths are filled, since the picture would then show a solid square.
// Run from the repo root with Playwright's Chromium installed: node docs/research/draw-tool/draw-tool-button-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { openDrawPage } from './draw-tool-screenshot-page.mjs'
import { DRAW_BUTTON as BUTTON } from '../../../live/draw-tool/draw-tool-fixtures.mjs'

const out = new URL('./draw-tool-button.png', import.meta.url).pathname

const browser = await chromium.launch()
const page = await openDrawPage(browser, 4)
await page.mouse.move(5, 5)

const shoot = async () => {
  const fills = await page.locator(`${BUTTON} svg path`).evaluateAll((paths) => paths.map((path) => getComputedStyle(path).fill))
  if (fills.length === 0 || fills.some((fill) => fill !== 'none')) throw new Error(`the icon's paths are filled: ${fills}`)
  return (await page.locator(BUTTON).screenshot()).toString('base64')
}
const selected = await shoot()
await page.click('#control-normal')
await page.mouse.move(5, 5)
const notSelected = await shoot()
const sheet = await browser.newPage({ deviceScaleFactor: 1 })
await sheet.setContent(`<body style="margin:0;padding:16px;background:#fff;display:flex;gap:24px;font:16px system-ui,sans-serif">
  <figure style="margin:0;text-align:center"><img src="data:image/png;base64,${notSelected}"><figcaption>not selected</figcaption></figure>
  <figure style="margin:0;text-align:center"><img src="data:image/png;base64,${selected}"><figcaption>selected</figcaption></figure></body>`)
writeFileSync(out, await sheet.screenshot({ clip: { x: 0, y: 0, width: 600, height: 320 } }))
await browser.close()
