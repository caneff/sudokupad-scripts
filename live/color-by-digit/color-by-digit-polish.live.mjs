// Live check of Color by Digit's focus, hover and press states, hit areas, cursor and keys on sudokupad.app in headless Chromium: the keyboard focus ring, the hover and
// press states, the mode button pressed from pointerdown, the 24 px hit areas, the grabbing cursor and the dialog's keys.
// Desktop sizes only. How it looks is judged by sight in the PR.
/* global document, window, getComputedStyle */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { ARROW, BUTTON, EDITOR, center, MENU, MODE_STORAGE_KEY, PROFILES_STORAGE_KEY, SEED, buttonPoint, openSession, paintedKeys, savedProfiles, savedState } from './color-by-digit-fixtures.mjs'
import { closeDialogWith, dialogButton, openScriptDialog } from '../settings.mjs'
import { settle } from '../settle.mjs'

const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')

const RING = 'rgb(106, 27, 154)'
const HOVER = 'rgb(243, 229, 245)'
const MIN_TARGET_PX = 24
const SWATCHES = `${EDITOR} .cbd-swatches > *`
const SWATCH = `${EDITOR} button[data-role=swatch]`
const DIGIT = (digit) => `${EDITOR} button[data-act=digit][data-digit="${digit}"]`
const ROWS = `${EDITOR} [data-role=profile-row]`
const APART = { profiles: SEED.profiles, active: 1, digitActive: 0 }

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

const styleOf = (locator, properties, pseudo = null) => locator.evaluate((el, [names, pseudoElement]) => {
  const style = getComputedStyle(el, pseudoElement)
  return Object.fromEntries(names.map((name) => [name, style[name]]))
}, [properties, pseudo])
// Focus from the keyboard: a key press first, so the page's last input is the keyboard and `:focus-visible` matches.
const keyboardFocus = async (p, locator) => {
  await p.keyboard.press('Shift')
  await locator.focus()
}
const activeSlot = (p, containerSelector) => p.evaluate((selector) => [...document.querySelectorAll(selector)].indexOf(document.activeElement), containerSelector)

describe('the dialog', { concurrency: false }, () => {
  let context, p, cdp
  before(async () => {
    ({ context, p } = await openSession(browser, script))
    cdp = await context.newCDPSession(p)
    await openScriptDialog(p, 'Color by Digit', EDITOR)
  })
  after(async () => { await context?.close() })

  const forcedStyle = async (selector, state, properties) => {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [state] })
    try { return await styleOf(p.locator(selector), properties) } finally { await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }) }
  }

  it('C1: Tab-style focus draws a 2 px ring on the buttons, the digit keys, the swatches and the selected row', async () => {
    const targets = [dialogButton(p, 'Save'), dialogButton(p, 'Cancel'), p.getByRole('button', { name: 'Clear all' }), p.locator(DIGIT(3)), p.locator(SWATCH).nth(1), p.locator(`${ROWS}[aria-checked=true]`)]
    for (const target of targets) {
      await keyboardFocus(p, target)
      const look = await styleOf(target, ['outlineStyle', 'outlineWidth', 'outlineColor'])
      assert.deepEqual(look, { outlineStyle: 'solid', outlineWidth: '2px', outlineColor: RING }, await target.evaluate((el) => el.outerHTML.slice(0, 120)))
    }
  })

  it('C1: a title icon focused by a mouse click shows no ring, since :focus-visible is for the keyboard', async () => {
    // The dialog's own controls take no focus from the mouse, so the icon, which does, is the one that tells :focus-visible from :focus.
    const icon = p.locator('[data-act="copy-settings"]')
    await icon.click()
    assert.deepEqual(await icon.evaluate((el) => ({ focused: document.activeElement === el, outline: getComputedStyle(el).outlineStyle })), { focused: true, outline: 'none' })
    await keyboardFocus(p, icon)
    assert.equal((await styleOf(icon, ['outlineColor'])).outlineColor, RING)
  })

  it('C1: the pressed swatch shows its ring as an ::after beside its own black outline', async () => {
    const pressed = p.locator(`${SWATCH}[aria-pressed=true]`)
    await keyboardFocus(p, pressed)
    assert.equal((await styleOf(pressed, ['outlineColor', 'outlineWidth'])).outlineWidth, '3px')
    assert.deepEqual(await styleOf(pressed, ['borderTopWidth', 'borderTopColor', 'position'], '::after'), { borderTopWidth: '2px', borderTopColor: RING, position: 'absolute' })
  })

  it('C2: hover lightens Save, Cancel, Clear all and an unpainted digit key to #f3e5f5, and rings a swatch', async () => {
    for (const target of [dialogButton(p, 'Save'), dialogButton(p, 'Cancel'), p.getByRole('button', { name: 'Clear all' })]) {
      await target.hover()
      assert.equal((await styleOf(target, ['backgroundColor'])).backgroundColor, HOVER)
    }
    // Odd/Even paints every digit, so Clear all leaves the keys unpainted.
    await p.getByRole('button', { name: 'Clear all' }).click()
    const unpainted = p.locator(`${EDITOR} button[data-act=digit][data-key=""]`).first()
    await unpainted.hover()
    assert.equal((await styleOf(unpainted, ['backgroundColor'])).backgroundColor, HOVER)
    const swatch = p.locator(SWATCH).nth(2)
    await swatch.hover()
    assert.match((await styleOf(swatch, ['boxShadow'])).boxShadow, new RegExp(`${RING.replace(/[()]/g, '\\$&')} 0px 0px 0px 2px`))
  })

  it('C2: a press darkens Clear all, a digit key, a swatch, Save and Cancel by 10%', async () => {
    const layer = /rgba\(0, 0, 0, 0\.1\) 0px 0px 0px \d+(\.\d+)?px inset/
    for (const target of [p.getByRole('button', { name: 'Clear all' }), p.locator(SWATCH).nth(2)]) {
      await target.hover()
      await p.mouse.down()
      const shadow = (await styleOf(target, ['boxShadow'])).boxShadow
      await p.mouse.up()
      assert.match(shadow, layer)
    }
    // A digit key is redrawn by its own press, and Save and Cancel close the dialog on theirs, so :active is forced on them.
    for (const [name, selector] of [['a digit key', DIGIT(1)], ['Save', '.dialog-options button[data-role=save]'], ['Cancel', '.dialog-options button[data-role=cancel]']]) {
      assert.match((await forcedStyle(selector, 'active', ['boxShadow'])).boxShadow, layer, name)
    }
  })

  it('C5: the delete button and the drag handle are at least 24 px', async () => {
    for (const part of ['[data-act=delete]', '[data-role=handle]']) {
      const box = await p.locator(`${ROWS}[aria-checked=true] ${part}`).boundingBox()
      assert.ok(box.width >= MIN_TARGET_PX && box.height >= MIN_TARGET_PX, `${part} is ${box.width} by ${box.height}`)
    }
  })

  it('C6: the grabbing cursor shows on the handle and everywhere else while a row is dragged, and is gone after', async () => {
    const handle = p.locator(`${ROWS}[aria-checked=true] [data-role=handle]`)
    const { x, y } = await center(handle)
    assert.equal((await styleOf(handle, ['cursor'])).cursor, 'grab')
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x, y + 12, { steps: 3 })
    const during = [(await styleOf(handle, ['cursor'])).cursor, (await styleOf(p.getByRole('button', { name: 'Clear all' }), ['cursor'])).cursor]
    await p.mouse.up()
    assert.deepEqual(during, ['grabbing', 'grabbing'])
    assert.equal((await styleOf(p.locator(`${ROWS}[aria-checked=true] [data-role=handle]`), ['cursor'])).cursor, 'grab')
  })

  it('C9: the arrow keys move the focus along the swatch grid by one and down by a row, and stop at the edges', async () => {
    await keyboardFocus(p, p.locator(SWATCH).first())
    const at = () => activeSlot(p, SWATCHES)
    const first = await at()
    await p.keyboard.press('ArrowRight')
    assert.equal(await at(), first + 1)
    await p.keyboard.press('ArrowDown')
    assert.equal(await at(), first + 4)
    await p.keyboard.press('ArrowLeft')
    await p.keyboard.press('ArrowLeft')
    assert.equal(await at(), first + 3)
    await p.keyboard.press('ArrowLeft')
    assert.equal(await at(), first + 3)
    await p.keyboard.press('ArrowUp')
    assert.equal(await at(), first)
    await p.keyboard.press('ArrowUp')
    assert.equal(await at(), first)
  })

  it('C9: the arrow keys move the focus along the digit grid and 0 sits under 7', async () => {
    const focused = () => p.evaluate(() => document.activeElement.dataset.digit)
    await keyboardFocus(p, p.locator(DIGIT(7)))
    await p.keyboard.press('ArrowDown')
    assert.equal(await focused(), '0')
    await p.keyboard.press('ArrowRight')
    assert.equal(await focused(), '0')
    await p.keyboard.press('ArrowUp')
    await p.keyboard.press('ArrowRight')
    assert.equal(await focused(), '8')
    await p.keyboard.press('ArrowDown')
    assert.equal(await focused(), '8')
    await p.keyboard.press('ArrowRight')
    assert.equal(await focused(), '9')
  })

  it('C11: typing a digit with the focus on the digit grid paints that digit and moves the focus to its key', async () => {
    const brush = await p.locator(`${SWATCH}[aria-pressed=true]`).getAttribute('data-key')
    const was = (await paintedKeys(p))['4']
    await keyboardFocus(p, p.locator(DIGIT(7)))
    await p.keyboard.press('4')
    const painted = was === brush ? '' : brush
    assert.equal(await settle(async () => (await paintedKeys(p))['4'], painted), painted)
    assert.equal(await p.evaluate(() => document.activeElement.dataset.digit), '4')
    await p.keyboard.press('4')
    const toggled = painted === brush ? '' : brush
    assert.equal(await settle(async () => (await paintedKeys(p))['4'], toggled), toggled)
  })

  it('C11: a held digit key paints once, not on every repeat', async () => {
    const brush = await p.locator(`${SWATCH}[aria-pressed=true]`).getAttribute('data-key')
    const was = (await paintedKeys(p))['6']
    await keyboardFocus(p, p.locator(DIGIT(7)))
    // A second keydown with the key still held is an auto-repeat; two toggles would leave the key as it was.
    await p.keyboard.down('6')
    await p.keyboard.down('6')
    await p.keyboard.up('6')
    const once = was === brush ? '' : brush
    assert.equal(await settle(async () => (await paintedKeys(p))['6'], once), once)
    await p.keyboard.press('6')
    assert.equal(await settle(async () => (await paintedKeys(p))['6'], was), was)
  })

  it('C11: typing a digit in the name field paints nothing', async () => {
    const keys = await paintedKeys(p)
    await p.locator(`${EDITOR} [data-role=profile-name]`).focus()
    await p.keyboard.press('4')
    assert.deepEqual(await paintedKeys(p), keys)
  })

  it('closes', async () => { await closeDialogWith(p, 'Cancel', EDITOR) })
})

describe('the mode button and its menu', { concurrency: false }, () => {
  let context, p
  before(async () => {
    ({ context, p } = await openSession(browser, script, { saved: { ...savedProfiles(APART), [MODE_STORAGE_KEY]: 'both' } }))
  })
  after(async () => { await context?.close() })

  it('C4: the button looks pressed from pointerdown, and plain again after the release', async () => {
    const { x, y } = await buttonPoint(p)
    const pressed = () => p.locator(BUTTON).evaluate((el) => ({ pressed: el.classList.contains('cbd-pressed'), shadow: getComputedStyle(el).boxShadow }))
    await p.mouse.move(x, y)
    await p.mouse.down()
    const down = await pressed()
    await p.mouse.up()
    const up = await pressed()
    assert.equal(down.pressed, true)
    assert.match(down.shadow, /rgba\(0, 0, 0, 0\.1\) 0px 0px 0px \d+(\.\d+)?px inset/)
    assert.equal(up.pressed, false)
    assert.doesNotMatch(up.shadow, /inset/)
  })

  it('C4: a press dragged off the button stops looking pressed before the release', async () => {
    const { x, y } = await buttonPoint(p)
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x - 40, y, { steps: 4 })
    const pressed = await p.locator(BUTTON).evaluate((el) => el.classList.contains('cbd-pressed'))
    await p.mouse.up()
    assert.equal(pressed, false)
  })

  it('C5: a press just outside the 14 px arrow box, within 24 px of it, opens the menu', async () => {
    const box = await p.locator(ARROW).boundingBox()
    const edge = (MIN_TARGET_PX - box.width) / 2 - 1
    const point = { x: box.x + box.width + edge, y: box.y + box.height + edge }
    assert.equal(await p.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('#control-colorbydigit [data-role="menu"]'), [point.x, point.y]), true)
    await p.mouse.click(point.x, point.y)
    await p.locator(MENU).waitFor({ state: 'visible' })
  })

  it('C5: a press in the corner of a Cell or Digit dot\'s column, far from the dot, picks it', async () => {
    const column = p.locator(`${MENU} [data-act=pick][data-target=digits][data-index="1"]`)
    assert.equal(await column.count(), 1, await p.locator(MENU).innerHTML())
    const box = await column.boundingBox()
    assert.ok(box.width >= MIN_TARGET_PX && box.height >= MIN_TARGET_PX, `${box.width} by ${box.height}`)
    const digitProfile = async () => savedState(JSON.parse(await p.evaluate((key) => window.localStorage.getItem(key), PROFILES_STORAGE_KEY))).digitActive
    assert.equal(await digitProfile(), 0)
    await p.mouse.click(box.x + 3, box.y + 3)
    assert.equal(await settle(digitProfile, 1), 1)
  })
})
