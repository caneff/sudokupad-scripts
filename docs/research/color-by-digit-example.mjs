// The example Color by Digit's site pictures share: a custom puzzle of one given and nothing else (SudokuPad's own compact
// classic format, loaded after Start Puzzle), with the first two boxes (3 rows x 6 columns) filled with the entries below,
// on the default profile (Low/5/High: 1-4, 5, 6-9). The picture is the live page's grid cropped to those two boxes: the crop
// is cut at the grid lines, so no part of a third box shows.
import { readFileSync } from 'node:fs'
import { openPage, startPuzzle } from '../../live/page.mjs'

export const BUTTON = '#control-colorbydigit'
export const MODES = ['CELL', 'DIGIT', 'BOTH', 'OFF']
const MODE_LABEL = `${BUTTON} [data-role="mode"]`
const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')

// [row, column, digits], 0-based. The given 5 is at (0, 0).
// Big digits: Color by Digit circles only marks, so none has a circle.
const DIGITS = [[0, 2, '3'], [0, 5, '8'], [1, 0, '9'], [1, 2, '1'], [1, 5, '6'], [2, 1, '6'], [2, 3, '3']]
// SudokuPad flags a mark that repeats a given in its row or column: the corner 5s at (0, 4) and (2, 0) and the center 5 at (0, 1) all
// conflict with the given 5. A corner mark colors nothing in Cell.
const CORNER = [[0, 3, '19'], [0, 4, '25'], [1, 4, '27'], [2, 0, '25'], [2, 5, '19']]
// (0, 1) is the 5 group alone, (1, 3) all low and (1, 1) all high, so each takes a group's color; (2, 2) mixes groups and stays white.
const CENTRE = [[0, 1, '5'], [1, 1, '78'], [1, 3, '24'], [2, 2, '47']]
const CONFLICTS = 3
const ROWS = 3
const COLS = 6

// Opens the live page, at twice the pixel density, on the example puzzle with Color by Digit installed in Cell mode, the entries in, the mascot hidden.
// `leave` is a list of [row, column] cells whose entries are left out, for a picture that fills them in itself.
export async function openExample (browser, { leave = [] } = {}) {
  const { p } = await openPage(browser, { contextOptions: { deviceScaleFactor: 2 } })
  await startPuzzle(p)
  await p.evaluate(() => Framework.app.loadCompactClassicSudoku('5' + '0'.repeat(80)))
  await p.waitForFunction(() => Framework.app.grid.getCell(0, 0).given)
  await p.addStyleTag({ content: '#svenpeek { display: none !important }' })
  await p.addScriptTag({ content: script })
  await p.locator(BUTTON).waitFor({ state: 'visible' })
  const enter = async (tool, list) => {
    for (const [row, col, digits] of list.filter(([row, col]) => !leave.some(([r, c]) => r === row && c === col))) await typeInto(p, tool, row, col, digits)
  }
  await enter('#control-normal', DIGITS)
  await enter('#control-corner', CORNER)
  await enter('#control-centre', CENTRE)
  await p.click('#control-normal')
  await p.evaluate(() => Framework.app.deselect())
  return p
}

// Selects the cell at [row, col] in the tool `tool` (a control's selector), types `keys` into it and deselects.
export async function typeInto (p, tool, row, col, keys) {
  await p.click(tool)
  await p.evaluate(([row, col]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(row, col)) }, [row, col])
  for (const key of keys) await p.keyboard.press(key)
  await p.evaluate(() => Framework.app.deselect())
}

// Color by Digit gives no signal that its styles are applied, so a change gets this long to show.
export const SETTLE_MS = 500

// Presses the button until its label reads `want`, then waits for the colors to settle.
export async function pressTo (p, want) {
  const button = p.locator(BUTTON)
  const label = () => p.evaluate((selector) => document.querySelector(selector).textContent, MODE_LABEL)
  for (let i = 0; i < MODES.length && await label() !== want; i++) {
    const box = await button.boundingBox()
    await p.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6)
  }
  await p.waitForFunction(([selector, want]) => document.querySelector(selector).textContent === want, [MODE_LABEL, want])
  await p.waitForTimeout(SETTLE_MS)
}

// Throws when the conflict circles are not drawn within the timeout.
export const waitForCircles = (p) => p.waitForFunction((n) => document.querySelectorAll('#color-by-digit-circles circle').length === n, CONFLICTS, { timeout: 10000 })

// The two boxes' rectangle, from the first cell's and the last one's.
export const exampleClip = (p) => p.evaluate(([rows, cols]) => {
  const rect = (row, col) => Framework.app.grid.getCell(row, col).elem.getBoundingClientRect()
  const first = rect(0, 0)
  const last = rect(rows - 1, cols - 1)
  return { x: first.x, y: first.y, width: last.right - first.x, height: last.bottom - first.y }
}, [ROWS, COLS])
