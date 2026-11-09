// Takes Text Anywhere's settings dialog on the recorded puzzle in SudokuPad, from the real draw-tool.user.js at 1200x900, with a boxed note behind it,
// Yellow saved as the Box color and Thin grey as the Box border: text-anywhere-settings-dialog.png
// The script fails when the Halo, Box color and Box border rows do not each show their sample buttons with Yellow and Thin grey pressed.
// Run from the repo root with Playwright's Chromium installed: node docs/research/text-anywhere/text-anywhere-settings-dialog-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { openDrawPage } from './text-anywhere-screenshot-page.mjs'
import { pickTextAnywhere, plantNotes, reload } from '../../../live/text-anywhere/text-anywhere-fixtures.mjs'

const out = new URL('./text-anywhere-settings-dialog.png', import.meta.url).pathname

const browser = await chromium.launch()
const shown = await openDrawPage(browser, 1)
await shown.setViewportSize({ width: 1200, height: 900 })
await plantNotes(shown, [{ kind: 'text', color: 4, size: 26, opacity: 100, bg: true, text: '15', at: [520, 330] }])
await reload(shown)
await pickTextAnywhere(shown)
await shown.click('.text-anywhere-settings')
const dialog = shown.locator('#text-anywhere-dialog')
await dialog.waitFor({ state: 'visible' })
await dialog.locator('button[data-role="box-pick"][data-value="yellow"]').click()
await dialog.locator('button[data-role="frame-pick"][data-value="on"]').click()
await shown.locator('.dialog button', { hasText: /^\s*Save\s*$/ }).click()
await dialog.waitFor({ state: 'detached' })
await shown.click('.text-anywhere-settings')
await dialog.waitFor({ state: 'visible' })
await dialog.evaluate((el) => Promise.all([el.closest('.dialog'), el.closest('.dialog-overlay')].flatMap((e) => e.getAnimations()).map((a) => a.finished)))
const counts = await shown.evaluate(() => ['outline-pick', 'box-pick', 'frame-pick'].map((role) => document.querySelectorAll(`#text-anywhere-dialog button[data-role="${role}"]`).length))
const pressed = await shown.evaluate(() => [...document.querySelectorAll('#text-anywhere-dialog button[aria-pressed="true"][data-role$="-pick"]')].map((b) => b.dataset.value))
console.log(JSON.stringify({ counts, pressed }))
if (counts.join() !== '3,5,2' || pressed.join() !== 'medium,yellow,on') throw new Error('the sample rows are not as expected')
writeFileSync(out, await shown.screenshot())
await browser.close()
