// Takes Text Annotation's settings dialog on the recorded puzzle in SudokuPad, from the real draw-tool.user.js at 1200x900, with a boxed note behind it,
// Sticky yellow saved as the Background box and Frame saved on: draw-tool-settings-dialog.png
// The script fails when the Frame checkbox and its word are not side by side at the dialog's left edge.
// Run from the repo root with Playwright's Chromium installed: node docs/research/draw-tool/draw-tool-settings-dialog-screenshot.mjs
// Not part of any test.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { openDrawPage } from './draw-tool-screenshot-page.mjs'
import { pickDraw, plantDrawing, reload } from '../../../live/draw-tool/draw-tool-fixtures.mjs'

const out = new URL('./draw-tool-settings-dialog.png', import.meta.url).pathname

const browser = await chromium.launch()
const shown = await openDrawPage(browser, 1)
await shown.setViewportSize({ width: 1200, height: 900 })
await plantDrawing(shown, [{ kind: 'text', color: 4, size: 26, opacity: 100, bg: true, text: '15', at: [520, 330] }])
await reload(shown)
await pickDraw(shown)
await shown.click('.draw-tool-settings')
const dialog = shown.locator('#draw-tool-dialog')
await dialog.waitFor({ state: 'visible' })
await dialog.locator('select[data-role="box-choice"]').selectOption('yellow')
await dialog.locator('input[data-role="frame"]').check()
await shown.locator('.dialog button', { hasText: /^\s*Save\s*$/ }).click()
await dialog.waitFor({ state: 'detached' })
await shown.click('.draw-tool-settings')
await dialog.waitFor({ state: 'visible' })
await dialog.evaluate((el) => Promise.all([el.closest('.dialog'), el.closest('.dialog-overlay')].flatMap((e) => e.getAnimations()).map((a) => a.finished)))
const [box, word, left] = await shown.evaluate(() => {
  const row = document.querySelector('#draw-tool-dialog .draw-tool-frame-row')
  const range = document.createRange()
  range.selectNodeContents([...row.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()))
  return [row.querySelector('input').getBoundingClientRect(), range.getBoundingClientRect(), document.querySelector('#draw-tool-dialog select[data-role="box-choice"]').getBoundingClientRect()]
})
console.log(JSON.stringify({ check: box, word, choice: left }))
if (Math.abs(box.left - left.left) > 2 || box.width > 30 || word.left < box.right || word.left - box.right > 16) throw new Error('the Frame checkbox is not beside its word at the left edge')
writeFileSync(out, await shown.screenshot())
await browser.close()
