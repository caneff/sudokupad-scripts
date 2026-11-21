// Shared by the live checks: input a user gives the page that is not a mouse gesture on the board (a value set on an input, a key pressed, a hold on a button) and the middle of a box. Not a check itself, so `live/**/*.live.mjs` skips it.

// Sets the input `locator` finds to `value`, with the same `input` event a user's change fires.
export const setInputValue = (locator, value) => locator.evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })) }, value)

// Presses `key` and returns whether the page's next `keydown` was default-prevented, as an array of one.
export async function keydownDefaults (page, key) {
  await page.evaluate(() => {
    window.__keydowns = []
    window.addEventListener('keydown', (e) => window.__keydowns.push(e.defaultPrevented), { once: true })
  })
  await page.keyboard.press(key)
  return page.evaluate(() => window.__keydowns)
}

// The middle of a box Playwright reads (`boundingBox()`), as [x, y] page pixels.
export const middleOf = ({ x, y, width, height }) => [x + width / 2, y + height / 2]

// The middle of what `locator` finds once it has stopped moving: a hover waits for a stable box, so a key in a dialog still sliding in is read where it lands.
export async function restingMiddle (locator) {
  await locator.hover()
  return middleOf(await locator.boundingBox())
}

// Holds `button` down on the middle of what `selector` finds until what `until` finds reaches `state`, and lets go whatever happens:
// the hold that opens the color pickers, or that keeps a picker held until the pickers close. A `selector` with no box on the page throws rather than hold nowhere.
export async function holdUntil (page, selector, until, { button = 'left', state = 'attached', timeout, boxTimeout } = {}) {
  const box = await page.locator(selector).boundingBox({ timeout: boxTimeout })
  if (!box) throw new Error(`no ${selector} on the page to hold`)
  await page.mouse.move(...middleOf(box))
  await page.mouse.down({ button })
  try {
    await page.locator(until).first().waitFor({ state, timeout })
  } finally {
    await page.mouse.up({ button })
  }
}
