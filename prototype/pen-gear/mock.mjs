import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const url = readFileSync('live/puzzle-url.txt', 'utf8').trim()
const script = readFileSync('pen-tool-extras.user.js', 'utf8')
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })).newPage()
await page.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length)
await page.evaluate(() => Framework.setSetting('toolpen', true))
await page.getByRole('button', { name: /Start Puzzle|Continue|Resume/i }).first().click()
await page.locator('#control-undo').waitFor()
await page.addStyleTag({ content: '#svenpeek { display: none !important }' })
await page.addScriptTag({ content: script })
await page.waitForTimeout(1000)
await page.evaluate(() => {
  const b = document.querySelector('#control-pen')
  b.style.position = 'relative'
  const PURPLE = '#6a1b9a'
  const gear = '<svg viewBox="0 0 24 24" width="9" height="9" fill="' + PURPLE + '"><path d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.88 2h-3.84a.5.5 0 0 0-.49.42l-.36 2.54a7 7 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.64 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54a7 7 0 0 0 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>'
  b.insertAdjacentHTML('beforeend', '<span style="position:absolute;right:2px;top:2px;box-sizing:border-box;width:13px;height:13px;border:1.5px solid ' + PURPLE + ';border-radius:3px;background:#fff;display:flex;align-items:center;justify-content:center">' + gear + '</span>')
})
await page.waitForTimeout(300)
const box = await page.locator('#control-pen').boundingBox()
await page.screenshot({ path: '.scratch/pen-gear/tmp.png', clip: { x: box.x - 330, y: box.y - 200, width: 460, height: box.height + 260 } })
await browser.close()
