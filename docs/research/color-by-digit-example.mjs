// The example Color by Digit's site pictures share: a custom puzzle of one given and nothing else (SudokuPad's own compact
// classic format, loaded after Start Puzzle), with the first two boxes (3 rows x 6 columns) filled with the entries below,
// on the default profile (Low/5/High: 1-4, 5, 6-9). The picture is the live page's grid cropped to those two boxes: the crop
// is cut at the grid lines, so no part of a third box shows. Not a screenshot script itself: the pictures' scripts import it.
import { readFileSync } from 'node:fs'
import { openPage, startPuzzle } from '../../live/page.mjs'

const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')

// [row, column, digits], 0-based. The given 5 is at (0, 0).
// Big digits: none has a circle, since SudokuPad flags no big digit's conflict as it does a corner mark's.
const DIGITS = [[0, 2, '3'], [0, 5, '8'], [1, 0, '9'], [1, 2, '1'], [1, 5, '6'], [2, 1, '6'], [2, 3, '3']]
// SudokuPad flags only a corner mark, and only against a given: the corner 5s at (0, 4) and (2, 0) repeat the given 5 in their row
// and box, so both conflict. A corner mark colors nothing in Cell.
const CORNER = [[0, 3, '19'], [0, 4, '25'], [1, 4, '27'], [2, 0, '25'], [2, 5, '19']]
// (0, 1) is all low and (1, 1) all high, so each takes a group's color; (2, 2) mixes groups and stays white.
const CENTRE = [[0, 1, '24'], [1, 1, '78'], [2, 2, '47']]
export const CONFLICTS = 2
const ROWS = 3
const COLS = 6

// Opens the live page on the example puzzle with Color by Digit installed in Cell mode, the entries in, the mascot hidden.
// `contextOptions` go to the browser context.
export async function openExample (browser, contextOptions = {}) {
  const { p } = await openPage(browser, { contextOptions })
  await startPuzzle(p)
  await p.evaluate(() => Framework.app.loadCompactClassicSudoku('5' + '0'.repeat(80)))
  await p.waitForFunction(() => Framework.app.grid.getCell(0, 0).given)
  await p.addStyleTag({ content: '#svenpeek { display: none !important }' })
  await p.addScriptTag({ content: script })
  await p.locator('#control-colorbydigit').waitFor({ state: 'visible' })
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
  return p
}

// Presses the button until its label reads `want`, then waits for the colors to settle.
export async function pressTo (p, want) {
  const button = p.locator('#control-colorbydigit')
  const label = () => p.evaluate(() => document.querySelector('#control-colorbydigit [data-role="mode"]').textContent)
  for (let i = 0; i < 4 && await label() !== want; i++) {
    const box = await button.boundingBox()
    await p.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6)
  }
  await p.waitForFunction((want) => document.querySelector('#control-colorbydigit [data-role="mode"]').textContent === want, want)
  await p.waitForTimeout(500)
}

// Throws when the conflict circles are not drawn within the timeout.
export const waitForCircles = (p) => p.waitForFunction((n) => document.querySelectorAll('#color-by-digit-circles circle').length === n, CONFLICTS, { timeout: 10000 })

const rectOf = (p, row, col) => p.evaluate(([row, col]) => {
  const r = Framework.app.grid.getCell(row, col).elem.getBoundingClientRect()
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}, [row, col])

// One cell's rectangle.
export const cellClip = rectOf

// The two boxes' rectangle, from the first cell's and the last one's.
export async function exampleClip (p) {
  const first = await rectOf(p, 0, 0)
  const last = await rectOf(p, ROWS - 1, COLS - 1)
  return { x: first.x, y: first.y, width: last.x + last.width - first.x, height: last.y + last.height - first.y }
}
