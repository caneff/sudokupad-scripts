// Recolors a pen through Pen Tool Extras' own edit mode, for the pictures that show it: a hold on a pen color button turns edit mode on
// or off, and a color is picked by setting the picker's value and firing the same `input` event a real pick fires. The browser's own
// color dialog is drawn by the operating system, which a page screenshot cannot capture, so the dialog itself is never shown.
import { createRequire } from 'node:module'
import { setInputValue } from '../../../live/pen.mjs'

const { HOLD_TO_EDIT_MS } = createRequire(import.meta.url)('../../../pen-tool-extras.user.js')
// A press this much longer than the script's hold is certain to have run it.
const HOLD_MARGIN_MS = 200
const EDITING = '.tool-pen.pen-tool-extras-editing'

// Pens 1 to 5 take these in the pictures that show colors SudokuPad's own pen cannot draw: a teal, a navy, a dark red, a purple and a lime,
// each far from all nine of SudokuPad's own pen colors (test/site.test.js holds them to it).
export const PICTURE_PEN_COLORS = ['#00897b', '#1a237e', '#8b1a1a', '#6a1b9a', '#8bc34a']

// Holds the pen button `key` with the real mouse, which toggles edit mode; throws when the mode did not change.
export async function holdPenButton (page, key) {
  const before = await page.locator(EDITING).count()
  const box = await page.locator(`.tool-pen button[data-key="${key}"]`).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(HOLD_TO_EDIT_MS + HOLD_MARGIN_MS)
  await page.mouse.up()
  await page.mouse.move(5, 5)
  if (await page.locator(EDITING).count() === before) throw new Error(`holding pen ${key} did not toggle edit mode`)
}

// Sets pen `key`'s picker, which exists only in edit mode, to the color `hex`; the buttons and the lines take it at once.
export async function pickPenColor (page, key, hex) {
  const picker = page.locator(`.pen-tool-extras-picker input[data-key="${key}"]`)
  await picker.waitFor({ state: 'attached' })
  await setInputValue(picker, hex)
}
