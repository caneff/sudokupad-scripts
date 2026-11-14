// Shared by the live checks: input a user gives the page that is not a mouse gesture on the board, a value set on an input and a key pressed. Not a check itself, so `live/**/*.live.mjs` skips it.

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
