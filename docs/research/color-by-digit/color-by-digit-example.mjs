// The example Color by Digit's site pictures share: a custom puzzle of one given, a 2, and nothing else (SudokuPad's own compact
// classic format, loaded after Start Puzzle), with the first two boxes (3 rows x 6 columns) filled with the entries below,
// on a demo profile with no blue, because SudokuPad's own digits and marks are blue: Entropic's grouping (0-3, 4-6, 7-9) in red, green
// and yellow from the palette's first page. It is saved by this script, not a preload of Color by Digit. The picture is the live page's grid cropped to those two boxes: the crop
// is cut at the grid lines, so no part of a third box shows.
import { readFileSync } from 'node:fs'
import { openPage, startPuzzle } from '../../../live/page.mjs'
import { MODE_STORAGE_KEY, modeLabel, savedProfiles } from '../../../live/color-by-digit/color-by-digit-fixtures.mjs'

// The pixel density every picture is taken at.
export const DEVICE_SCALE = 2
export const BUTTON = '#control-colorbydigit'
export const MODES = ['Cell', 'Digit', 'Both', 'Off']
const script = readFileSync(new URL('../../../color-by-digit.user.js', import.meta.url), 'utf8')

// The demo profile is active; Modular (orange, pink, yellow) follows it for the menu picture. savedProfiles also sets the two flags that stop the script adding its
// own preloads, so the menu lists exactly these two.
const DEMO_PROFILE = 'Entropic, no blue'
const PROFILES = {
  profiles: [
    { name: DEMO_PROFILE, groups: [{ key: '7', digits: ['0', '1', '2', '3'] }, { key: '4', digits: ['4', '5', '6'] }, { key: '8', digits: ['7', '8', '9'] }] },
    { name: 'Modular', groups: [{ key: '6', digits: ['1', '4', '7'] }, { key: '5', digits: ['2', '5', '8'] }, { key: '8', digits: ['0', '3', '6', '9'] }] }
  ],
  active: 0
}
const SAVED = savedProfiles(PROFILES)
// The saved settings of the picture with different groupings: Both mode, the cells on the demo profile (active 0) and the digits on Modular (digitActive 1).
const SPLIT_SAVED = { ...savedProfiles({ ...PROFILES, digitActive: 1 }), [MODE_STORAGE_KEY]: 'both' }

// [row, column, digits], 0-based. The given 2 is at (0, 0): in the demo profile's red group, so the circles sit behind red marks.
// Big digits: Color by Digit circles only marks, so none has a circle.
const DIGITS = [[0, 2, '3'], [0, 5, '8'], [1, 0, '9'], [1, 2, '1'], [1, 5, '6'], [2, 1, '6'], [2, 3, '3']]
// SudokuPad flags a mark that repeats a given in its row or column: the corner 2s at (0, 4) and (2, 0) and the center 2 at (0, 1) all
// conflict with the given 2. A corner mark colors nothing in Cell.
const CORNER = [[0, 3, '19'], [0, 4, '25'], [1, 4, '27'], [2, 0, '25'], [2, 5, '19']]
// (0, 1) is the 0-3 group alone, (1, 1) all 7-9 and (1, 3) all 0-3, so each takes a group's color; (2, 2) mixes groups and stays white.
const CENTRE = [[0, 1, '2'], [1, 1, '78'], [1, 3, '2'], [2, 2, '47']]
const CONFLICTS = 3
const ROWS = 3
const COLS = 6

// Opens the live page, at `DEVICE_SCALE`, on the example puzzle with Color by Digit installed in Cell mode on the demo profile, the entries in, the mascot hidden.
// `leave` is a list of [row, column] cells whose entries are left out, for a picture that fills them in itself.
// `split` starts from saved settings that give the digits another profile than the cells, in Both mode, instead of Cell mode on the demo profile.
export async function openExample (browser, { leave = [], split = false } = {}) {
  const { p } = await openPage(browser, {
    contextOptions: { deviceScaleFactor: DEVICE_SCALE },
    seed: (page) => page.addInitScript((saved) => Object.entries(saved).forEach(([key, value]) => window.localStorage.setItem(key, JSON.stringify(value))), split ? SPLIT_SAVED : SAVED)
  })
  await startPuzzle(p)
  await p.evaluate(() => Framework.app.loadCompactClassicSudoku('2' + '0'.repeat(80)))
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

// Presses the button until its aria-label names mode `want`, then waits for the colors to settle.
export async function pressTo (p, want) {
  const button = p.locator(BUTTON)
  const label = () => button.getAttribute('aria-label')
  for (let i = 0; i < MODES.length && await label() !== modeLabel(want); i++) {
    const box = await button.boundingBox()
    await p.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6)
  }
  await p.waitForFunction(([selector, label]) => document.querySelector(selector).getAttribute('aria-label') === label, [BUTTON, modeLabel(want)])
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
