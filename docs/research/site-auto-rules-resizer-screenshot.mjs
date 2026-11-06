// Takes docs/research/site-auto-rules-resizer.png, the homepage's picture of Auto Rules Resizer: the rules pane of
// one puzzle in a 1920x1080 window once the script has fitted it, with the pointer over the pane so the drag corners
// and the f+ and f- buttons show. The recorded puzzle has no rules, so they are shown through SudokuPad's own
// showMetaInfoUI, as in live/auto-rules-resizer.live.mjs. Run from the repo root:
// node docs/research/site-auto-rules-resizer-screenshot.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { openPage, startPuzzle } from '../../live/page.mjs'

const script = readFileSync(new URL('../../auto-rules-resizer.user.js', import.meta.url), 'utf8')
const out = new URL('./site-auto-rules-resizer.png', import.meta.url).pathname

const RULES = 'Normal sudoku rules apply. Digits along an arrow sum to the digit in its circle; digits may repeat on an arrow. ' +
  'Cells separated by a white dot contain consecutive digits. Not all possible white dots are given. ' +
  'Cells separated by a black dot contain digits where one is double the other. Not all possible black dots are given. ' +
  'Digits may not repeat along a thermometer, and they increase from the bulb. ' +
  'Digits in a killer cage may not repeat, and they sum to the small number in the cage corner. ' +
  'Digits in a grey-shaded region form a palindrome, reading the same from either end. ' +
  'Two cells joined by a line between their centers differ by at least five.'
const MARGIN = 12

const browser = await chromium.launch()
const { p } = await openPage(browser, { contextOptions: { viewport: { width: 1920, height: 1080 } } })
await startPuzzle(p)
await p.addStyleTag({ content: '#svenpeek { display: none !important }' })
await p.evaluate((rules) => {
  Framework.app.showMetaInfoUI({ title: 'Arrows and dots', author: 'Tester', rules })
  Framework.app.resize()
}, RULES)
await p.addScriptTag({ content: script })
await p.locator('#auto-rules-resizer-style').waitFor({ state: 'attached' })

// The header and the rules pane.
const area = await p.evaluate(() => {
  const header = document.querySelector('.puzzle-header').getBoundingClientRect()
  const rules = document.querySelector('.puzzle-rules').getBoundingClientRect()
  return { left: rules.left, right: rules.right, top: header.top, bottom: rules.bottom, centerX: (rules.left + rules.right) / 2, centerY: (rules.top + rules.bottom) / 2 }
})
await p.mouse.move(area.centerX, area.centerY) // over the pane, so the drag corners and the f+ and f- buttons show
await p.waitForTimeout(300) // the buttons fade in on hover; no condition says they are done
await p.screenshot({
  path: out,
  clip: {
    x: Math.floor(area.left - MARGIN),
    y: Math.floor(area.top - MARGIN - 24), // room for the font buttons above the pane
    width: Math.ceil(area.right - area.left + 2 * MARGIN),
    height: Math.ceil(area.bottom - area.top + MARGIN + 24 + 4) // 4px under the pane: the buttons below it stay out
  }
})
await browser.close()
