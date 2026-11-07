// Takes the pictures for the Color by Digit profiles PR (#105) from the real script on sudokupad.app:
// the button with auto mode on and off and with 2, 3 and 4 groups, the profile menu above it, and the
// dialog's profile list. Writes color-by-digit-profiles-*.png beside this file. Run from the repo root:
// node docs/research/color-by-digit/color-by-digit-profiles-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const url = readFileSync(new URL('../../../live/puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../../../color-by-digit.user.js', import.meta.url), 'utf8')
const out = (name) => new URL(`./color-by-digit-profiles-${name}.png`, import.meta.url).pathname

const group = (key, digits) => ({ key, digits })
const state = {
  profiles: [
    { name: 'Low/5/High', groups: [group('1', ['0', '1', '2', '3', '4']), group('5', ['5']), group('9', ['6', '7', '8', '9'])] },
    { name: 'Odd/Even', groups: [group('1', ['1', '3', '5', '7', '9']), group('2', ['0', '2', '4', '6', '8'])] },
    { name: 'Killer sums', groups: [group('3', ['1', '2', '3']), group('5', ['4']), group('7', ['5', '6']), group('9', ['7', '8', '9'])] }
  ],
  active: 0
}

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.evaluate((s) => { Framework.setData('ColorByDigit_profiles', s); Framework.setData('ColorByDigit_auto', true) }, state)
await page.addScriptTag({ content: script })
const button = page.locator('#control-colorbydigit')
await button.waitFor({ state: 'visible' })
await page.waitForTimeout(800)

const shotButton = async (name) => {
  const b = await button.boundingBox()
  await page.screenshot({ path: out(name), clip: { x: b.x - 6, y: b.y - 6, width: b.width + 12, height: b.height + 12 } })
}
const pick = async (name) => {
  await page.click('#control-colorbydigit [data-role=menu]')
  await page.locator('#color-by-digit-menu [data-act=pick]').filter({ hasText: name }).click()
  await page.waitForTimeout(300)
}
await shotButton('button-3-auto-on')
await page.click('#control-colorbydigit [data-role=auto]')
await page.waitForTimeout(300)
await shotButton('button-3-auto-off')
await page.click('#control-colorbydigit [data-role=auto]')
await pick('Odd/Even')
await shotButton('button-2')
await pick('Killer sums')
await shotButton('button-4')
await pick('Low/5/High')

await page.click('#control-colorbydigit [data-role=menu]')
await page.waitForTimeout(300)
const b = await button.boundingBox()
await page.screenshot({ path: out('menu'), clip: { x: b.x - 300, y: b.y - 300, width: 440, height: b.height + 320 } })
await page.locator('#color-by-digit-menu [data-act=edit]').click()
await page.locator('#color-by-digit-editor').waitFor()
await page.waitForTimeout(400)
await page.locator('#color-by-digit-editor [data-role=profile-row]').first().scrollIntoViewIfNeeded()
const dialog = await page.locator('.dialog').first().boundingBox()
await page.screenshot({ path: out('dialog'), clip: { x: Math.max(dialog.x - 10, 0), y: Math.max(dialog.y - 10, 0), width: dialog.width + 20, height: Math.min(dialog.height + 20, 900) } })
await browser.close()
