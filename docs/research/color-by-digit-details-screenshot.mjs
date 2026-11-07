// Takes the pictures for site/color-by-digit.html from the real script on the live page:
// color-by-digit-details-cell.png (the grid in Cell), color-by-digit-details-digit.png (the same grid in Digit, with a
// corner 5 that conflicts and so has its red circle) and color-by-digit-details-menu.png (the profile menu open above the
// button). All on the Each digit profile, picked from the menu. The mascot is hidden.
// Run from the repo root: node docs/research/color-by-digit-details-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { openPage, startPuzzle } from '../../live/page.mjs'

const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')
const out = (name) => new URL(`./color-by-digit-details-${name}.png`, import.meta.url).pathname

// [row, column, digits], 0-based, each a step of the puzzle's solution except the corner 5 at (0, 8).
const DIGITS = [[0, 2, '4'], [0, 3, '6'], [0, 5, '8'], [1, 1, '7'], [1, 2, '2'], [2, 0, '1'], [2, 3, '3']]
const CORNER = [[0, 6, '19'], [0, 8, '25'], [2, 5, '24']]
const CENTRE = [[0, 7, '12'], [1, 6, '34']]

const browser = await chromium.launch()
const { p } = await openPage(browser, { contextOptions: { deviceScaleFactor: 2 } })
await startPuzzle(p)
await p.addStyleTag({ content: '#svenpeek { display: none !important }' })
await p.addScriptTag({ content: script })
const button = p.locator('#control-colorbydigit')
await button.waitFor({ state: 'visible' })
const pick = async () => {
  await p.click('#control-colorbydigit [data-role="menu"]')
  await p.locator('#color-by-digit-menu [data-act=pick]').filter({ hasText: 'Each digit' }).click()
}
await pick()
const enter = async (tool, list) => {
  await p.click(tool)
  for (const [row, col, digits] of list) {
    await p.evaluate(([row, col]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(row, col)) }, [row, col])
    for (const d of digits) await p.keyboard.press(d)
  }
}
await enter('#control-normal', DIGITS)
await enter('#control-corner', CORNER)
await enter('#control-centre', CENTRE)
await p.click('#control-normal')
await p.evaluate(() => Framework.app.deselect())
const press = async (want) => {
  const box = await button.boundingBox()
  await p.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6)
  await p.waitForFunction((want) => document.querySelector('#control-colorbydigit [data-role="mode"]').textContent === want, want)
  await p.waitForTimeout(500)
}
const grid = async (name) => p.screenshot({ path: out(name), clip: await p.locator('#svgrenderer').boundingBox() })
await p.waitForFunction(() => document.querySelector('#control-colorbydigit [data-role="mode"]').textContent === 'CELL')
await p.waitForTimeout(500)
await grid('cell')
await press('DIGIT')
// Throws when the conflict circle is not drawn within the timeout.
await p.waitForFunction(() => document.querySelectorAll('#color-by-digit-circles circle').length === 1, null, { timeout: 10000 })
await grid('digit')
await p.click('#control-colorbydigit [data-role="menu"]')
await p.locator('#color-by-digit-menu').waitFor({ state: 'visible' })
await p.waitForTimeout(300)
const b = await button.boundingBox()
const m = await p.locator('#color-by-digit-menu').boundingBox()
const x = Math.max(Math.min(b.x, m.x) - 10, 0)
const y = Math.max(m.y - 10, 0)
await p.screenshot({ path: out('menu'), clip: { x, y, width: Math.max(b.x + b.width, m.x + m.width) + 10 - x, height: b.y + b.height + 10 - y } })
await browser.close()
