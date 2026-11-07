// Recolors a pen through Pen Tool Extras' own edit mode, for the pictures that show it: a hold on a pen color button turns edit mode on
// or off, and a color is picked by setting the picker's value and firing the same `input` event a real pick fires. The browser's own
// color dialog is drawn by the operating system, which a page screenshot cannot capture, so the dialog itself is never shown.
const HOLD_MS = 1200

// Holds the pen button `key` with the real mouse for longer than the script's 1000 ms hold, which toggles edit mode.
export async function holdPenButton (page, key) {
  const box = await page.locator(`.tool-pen button[data-key="${key}"]`).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(HOLD_MS)
  await page.mouse.up()
  await page.mouse.move(5, 5)
}

// Sets pen `key`'s picker, which exists only in edit mode, to the color `hex`; the buttons and the lines take it at once.
export async function pickPenColor (page, key, hex) {
  const picker = page.locator(`.pen-tool-extras-picker input[data-pen="${key}"]`)
  await picker.waitFor({ state: 'attached' })
  await picker.evaluate((input, value) => {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, hex)
}
