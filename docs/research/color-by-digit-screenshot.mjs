// Takes docs/research/site-color-by-digit.png: the sample puzzle's grid in Both on the Each digit profile, picked from the
// button's menu and reached by two presses from a fresh install's Cell. Cells take their digit's color, and entered digits,
// corner marks and centre marks its darker shade; a corner 5 that conflicts with the given 5 in its row has its circle.
// The mascot is hidden. Run from the repo root: node docs/research/color-by-digit-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')
const out = new URL('./site-color-by-digit.png', import.meta.url).pathname

// [row, column, digits], 0-based, each a step of the puzzle's solution except the corner 5 at (0, 8).
const DIGITS = [[0, 2, '4'], [0, 3, '6'], [0, 5, '8'], [1, 1, '7'], [1, 2, '2'], [2, 0, '1'], [2, 3, '3']]
const CORNER = [[0, 6, '19'], [0, 8, '25'], [2, 5, '24']]
const CENTRE = [[0, 7, '12'], [1, 6, '34']]

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.addScriptTag({ content: script })
const button = page.locator('#control-colorbydigit')
await button.waitFor({ state: 'visible' })
await page.click('#control-colorbydigit [data-role="menu"]')
await page.locator('#color-by-digit-menu [data-act=pick]').filter({ hasText: 'Each digit' }).click()
const label = page.locator('#control-colorbydigit [data-role="mode"]')
for (const want of ['DIGIT', 'BOTH']) {
  const box = await button.boundingBox()
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6)
  await page.waitForFunction(([want]) => document.querySelector('#control-colorbydigit [data-role="mode"]').textContent === want, [want])
}
const enter = async (tool, list) => {
  await page.click(tool)
  for (const [row, col, digits] of list) {
    await page.evaluate(([row, col]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(row, col)) }, [row, col])
    for (const d of digits) await page.keyboard.press(d)
  }
}
await enter('#control-normal', DIGITS)
await enter('#control-corner', CORNER)
await enter('#control-centre', CENTRE)
await page.click('#control-normal')
await page.evaluate(() => Framework.app.deselect())
// Throws when the conflict circle is not drawn within the timeout.
await page.waitForFunction(() => document.querySelectorAll('#color-by-digit-circles circle').length === 1, null, { timeout: 10000 })
console.log(`mode ${await label.textContent()}`)
await page.waitForTimeout(500)
const box = await page.locator('#svgrenderer').boundingBox()
await page.screenshot({ path: out, clip: box })
await browser.close()
