// Takes docs/research/site-auto-rules-resizer.png, the homepage's picture of Auto Rules Resizer: the rules pane of
// one puzzle in a 1920x1080 window, as SudokuPad lays it out (Before) and once the script has fitted it (After),
// stacked in one picture. The recorded puzzle has no rules, so they are shown through SudokuPad's own
// showMetaInfoUI, as in live/auto-rules-resizer.live.mjs. Run from the repo root:
// node docs/research/site-auto-rules-resizer-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { openPage, startPuzzle } from '../../live/page.mjs'

const script = readFileSync(new URL('../../auto-rules-resizer.user.js', import.meta.url), 'utf8')
const out = new URL('./site-auto-rules-resizer.png', import.meta.url).pathname

const RULES = 'Normal sudoku rules apply. Digits along an arrow sum to the digit in its circle; digits may repeat on an arrow. ' +
  'Cells separated by a white dot contain consecutive digits. Not all possible white dots are given.'
const MARGIN = 12

const browser = await chromium.launch()

// A 1920 x 1080 page past Start Puzzle, mascot hidden, showing RULES.
async function rulesPage () {
  const { p } = await openPage(browser, { contextOptions: { viewport: { width: 1920, height: 1080 } } })
  await startPuzzle(p)
  await p.addStyleTag({ content: '#svenpeek { display: none !important }' })
  await p.evaluate((rules) => {
    Framework.app.showMetaInfoUI({ title: 'Arrows and dots', author: 'Tester', rules })
    Framework.app.resize()
  }, RULES)
  return p
}

const p = await rulesPage()

// The header and the rules pane, from the pane's left edge to the window's right edge.
const area = () => p.evaluate(() => {
  const header = document.querySelector('.puzzle-header').getBoundingClientRect()
  const rules = document.querySelector('.puzzle-rules').getBoundingClientRect()
  return { left: rules.left, top: header.top, bottom: rules.bottom }
})
const before = await area()
await p.addScriptTag({ content: script })
await p.locator('#auto-rules-resizer-style').waitFor({ state: 'attached' })
await p.mouse.move(10, 1070) // off the pane, so the drag corners stay hidden
const after = await area()
const clip = {
  x: Math.floor(before.left - MARGIN),
  y: Math.floor(Math.min(before.top, after.top) - MARGIN - 24), // room for the font buttons above the pane
  width: Math.ceil(1920 - before.left + MARGIN),
  height: Math.ceil(Math.max(before.bottom, after.bottom) - Math.min(before.top, after.top) + 2 * MARGIN + 24)
}
const afterPng = await p.screenshot({ clip })

// The Before picture comes from a second page with no script, in the same layout, rather than undoing the fit by hand.
const beforePng = await (await rulesPage()).screenshot({ clip })

const sheet = await (await browser.newContext({ viewport: { width: clip.width + 2 * MARGIN, height: 100 } })).newPage()
const img = (png) => `data:image/png;base64,${png.toString('base64')}`
await sheet.setContent(`<body style="margin:0;padding:${MARGIN}px;background:#fff;font:600 20px sans-serif;color:#333">
  <div>Before</div><img src="${img(beforePng)}" style="display:block;margin:4px 0 ${MARGIN}px;border:1px solid #ccc">
  <div>After</div><img src="${img(afterPng)}" style="display:block;margin-top:4px;border:1px solid #ccc">
</body>`)
await sheet.locator('img').last().evaluate((el) => el.decode())
await sheet.locator('body').screenshot({ path: out })
await browser.close()
