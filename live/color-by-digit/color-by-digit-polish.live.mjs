// Desktop sizes only. How it looks is judged by sight in the PR.
/* global document, window, getComputedStyle */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { ARROW, BUTTON, DEFAULT_FILL, EDITOR, allFillsOn, paletteColorOn, MENU, MODE_STORAGE_KEY, savedModeOf, SAVED_MODE, PROFILES_STORAGE_KEY, SEED, buttonPoint, openSession, paintedKeys, savedProfiles, openEditorOn, openMenuOn } from './color-by-digit-fixtures.mjs'
import { selectCell } from '../board.mjs'
import { closeDialogWith, dialogButton, savedState } from '../settings.mjs'
import { readUntil, settle } from '../settle.mjs'
import { scriptSource, useBrowser } from '../session.mjs'
import { middleOf } from '../input.mjs'

const script = scriptSource('color-by-digit.user.js')

const RING = 'rgb(106, 27, 154)'
const HOVER = 'rgb(243, 229, 245)'
const MIN_TARGET_PX = 24
const SWATCHES = `${EDITOR} .cbd-swatches > *`
const SWATCH = `${EDITOR} button[data-role=swatch]`
const DIGIT = (digit) => `${EDITOR} button[data-act=digit][data-digit="${digit}"]`
const ROWS = `${EDITOR} [data-role=profile-row]`
const APART = { profiles: SEED.profiles, active: 1, digitActive: 0 }

const browser = useBrowser()

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
    ({ context, p } = await openSession(browser(), script))
    cdp = await context.newCDPSession(p)
    await openEditorOn(p)
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
    const [x, y] = middleOf(await handle.boundingBox())
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
})

describe('the mode button and its menu', { concurrency: false }, () => {
  let context, p
  before(async () => {
    ({ context, p } = await openSession(browser(), script, { saved: { ...savedProfiles(APART), [MODE_STORAGE_KEY]: SAVED_MODE.Both } }))
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

// The grid draws a cell color at 60% opacity (SudokuPad's own, `darkenColor` in `color-by-digit.user.js`).
const CELL_OPACITY = 0.6
const WHITE = [255, 255, 255]
// The channels of a computed color, `rgb()` or `rgba()`, alpha last when there is one.
const channelsOf = (css) => (css.match(/[\d.]+/g) || []).map(Number)
const rgbChannels = (css) => channelsOf(css).slice(0, 3)
const onWhite = (channels) => channels.map((c) => CELL_OPACITY * c + (1 - CELL_OPACITY) * 255)
const { contrastRatio } = createRequire(import.meta.url)('../../test/contrast.js')

describe('a fresh install\'s Low/5/High contrast', { concurrency: false }, () => {
  const withDigit = async (mode, digit, check) => {
    const { context, p } = await openSession(browser(), script, { saved: { [MODE_STORAGE_KEY]: savedModeOf(mode) } })
    try {
      await selectCell(p, 0, 2)
      await p.keyboard.press(digit)
      await check(p)
    } finally { await context.close() }
  }

  it('Digit: a low digit on white reads at 4.5:1 or more', () => withDigit('digit', '3', async (p) => {
    const fills = await readUntil(allFillsOn(p, 'entered', '3'), (v) => v.length === 1 && v[0] !== DEFAULT_FILL)
    const ratio = contrastRatio(rgbChannels(fills[0]), WHITE)
    assert.equal(ratio >= 4.5, true, `${ratio}`)
  }))

  it('Cell: SudokuPad\'s blue entered digit on a High cell reads at 3.5:1 or more', () => withDigit('cell', '7', async (p) => {
    const key = await readUntil(() => p.evaluate(() => Framework.app.puzzle.cells[2].colours?.[0]), (v) => v !== undefined)
    const ratio = contrastRatio(rgbChannels(DEFAULT_FILL), onWhite(rgbChannels(await paletteColorOn(p, key))))
    assert.equal(ratio >= 3.5, true, `key ${key}: ${ratio}`)
  }))
})

describe('the button with Dark Page installed', { concurrency: false }, () => {
  const darkPage = scriptSource('dark-page.user.js')

  for (const mode of ['cell', 'digit', 'both', 'off']) {
    it(`${mode}: each chip digit reads at 3:1 or more against its chip as drawn over the dark button, and the mode word is 10 px or larger`, async () => {
      const { context, p } = await openSession(browser(), script, { saved: { [MODE_STORAGE_KEY]: savedModeOf(mode) }, also: [darkPage] })
      try {
        const look = await p.locator(BUTTON).evaluate((button) => {
          const read = (el) => { const s = getComputedStyle(el); return [s.fill, s.fillOpacity] }
          return {
            button: getComputedStyle(button).backgroundColor,
            chips: [...button.querySelectorAll('[data-role="chip"]')].map((g) => ({ rects: [...g.querySelectorAll('rect')].map(read), ink: getComputedStyle(g.querySelector('text')).fill })),
            wordSize: getComputedStyle(button.querySelector('[data-role="mode"]')).fontSize
          }
        })
        assert.equal(parseFloat(look.wordSize) >= 10, true, look.wordSize)
        assert.equal(look.chips.length > 0, true)
        for (const chip of look.chips) {
          const shown = chip.rects.reduce((under, [fill, opacity]) => {
            const [r, g, b, a = 1] = channelsOf(fill)
            const alpha = a * Number(opacity)
            return [r, g, b].map((c, i) => alpha * c + (1 - alpha) * under[i])
          }, channelsOf(look.button).slice(0, 3))
          const ratio = contrastRatio(channelsOf(chip.ink).slice(0, 3), shown)
          assert.equal(ratio >= 3, true, `${mode}: ink ${chip.ink} on ${shown}: ${ratio}`)
        }
      } finally { await context.close() }
    })
  }
})

const LONG_NAME = 'Mmmmmmmmmmmmmmmmmmmmmmmm'
const LONG = { profiles: [{ name: 'Odd/Even', groups: SEED.profiles[0].groups }, { name: LONG_NAME, groups: SEED.profiles[1].groups }], active: 0, digitActive: 0 }
const SIX_PROFILES = { ...LONG, profiles: Array.from({ length: 6 }, (_, i) => ({ name: `P${i}`, groups: SEED.profiles[i % 2].groups })) }
// The longest name a fresh install shows: the menu's normal width is the one it has with it.
const SHORT_NAME = 'Low/5/High'

describe('the dialog\'s layout, keyboard and messages', { concurrency: false }, () => {
  let context, p
  before(async () => {
    ({ context, p } = await openSession(browser(), script, { saved: savedProfiles(LONG) }))
    await openEditorOn(p)
  })
  after(async () => { await context?.close() })

  it('both headings and their first rows share a top edge and a height', async () => {
    const tops = await p.evaluate((editor) => {
      const top = (el) => Math.round(el.getBoundingClientRect().top * 10) / 10
      const [profiles, digits] = [...document.querySelectorAll(`${editor} .cbd-heading`)]
      return { headings: [top(profiles), top(digits)], heights: [profiles.offsetHeight, digits.offsetHeight], rows: [top(document.querySelector(`${editor} [data-role=profile-row]`)), top(document.querySelector(`${editor} [data-role=color-choice]`))] }
    }, EDITOR)
    assert.equal(tops.headings[0], tops.headings[1])
    assert.equal(tops.heights[0], tops.heights[1])
    assert.equal(tops.rows[0], tops.rows[1])
  })

  it('a 24-character profile name is one line with an ellipsis and its full name as a tooltip', async () => {
    const name = p.locator(`${ROWS}[data-index="1"] .cbd-name`)
    // One line is as tall as the name field holding a single letter; a wrapped name is taller.
    const look = await name.evaluate((el) => {
      const high = el.getBoundingClientRect().height
      const text = el.textContent
      el.textContent = 'M'
      const lineHigh = el.getBoundingClientRect().height
      el.textContent = text
      return { high, lineHigh, overflow: getComputedStyle(el).textOverflow, space: getComputedStyle(el).whiteSpace, title: el.title }
    })
    assert.deepEqual({ oneLine: look.high === look.lineHigh, overflow: look.overflow, space: look.space, title: look.title }, { oneLine: true, overflow: 'ellipsis', space: 'nowrap', title: LONG_NAME }, `${look.high} px against ${look.lineHigh} px for one line`)
  })

  it('the profile menu is as wide with the long name as with a preloaded one, the long name cut with its full name as a tooltip and the preloaded one whole', async () => {
    await closeDialogWith(p, 'Cancel', EDITOR)
    await openMenuOn(p)
    // The same menu with the long name swapped for a short one is the width a solver sees with ordinary names.
    const look = await p.locator(MENU).evaluate((menu, short) => {
      const names = [...menu.querySelectorAll('[data-role=name]')]
      const width = menu.getBoundingClientRect().width
      const cut = (name) => name.scrollWidth > name.clientWidth
      const longCut = cut(names[1])
      names[1].textContent = short
      return { width, longCut, normal: menu.getBoundingClientRect().width, shortCut: cut(names[1]), title: names.map((n) => n.title) }
    }, SHORT_NAME)
    assert.equal(look.width, look.normal, `${look.width} px with the long name, ${look.normal} px with ${SHORT_NAME}`)
    assert.deepEqual({ longCut: look.longCut, shortCut: look.shortCut }, { longCut: true, shortCut: false })
    assert.deepEqual(look.title, ['Odd/Even', LONG_NAME])
    await p.keyboard.press('Escape')
    await openEditorOn(p)
  })

  it('each grid is one Tab stop, and Tab reaches Cancel in a handful of presses', async () => {
    const stops = await p.evaluate((editor) => ({
      swatches: [...document.querySelectorAll(`${editor} button[data-role=swatch]`)].filter((b) => b.tabIndex >= 0).length,
      digits: [...document.querySelectorAll(`${editor} button[data-act=digit]`)].filter((b) => b.tabIndex >= 0).length
    }), EDITOR)
    assert.deepEqual(stops, { swatches: 1, digits: 1 })
    await keyboardFocus(p, p.locator(`${EDITOR} input[data-role=mode-tick][data-box=on]`))
    let presses = 0
    while (presses < 40 && await p.evaluate(() => document.activeElement.textContent.trim()) !== 'Cancel') {
      await p.keyboard.press('Tab')
      presses++
    }
    // The mode's three checkboxes are three stops where its pulldown was one.
    assert.equal(presses <= 16, true, `${presses} presses`)
  })

  it('the Tab stop follows the arrow keys, so a grid is left and re-entered where it was', async () => {
    await keyboardFocus(p, p.locator(SWATCH).first())
    await p.keyboard.press('ArrowRight')
    await p.keyboard.press('Shift+Tab')
    await p.keyboard.press('Tab')
    assert.equal(await activeSlot(p, SWATCHES), 1)
    await keyboardFocus(p, p.locator(DIGIT(7)))
    await p.keyboard.press('ArrowRight')
    assert.equal(await p.evaluate((editor) => document.querySelector(`${editor} button[data-act=digit][tabindex="0"]`).dataset.digit, EDITOR), '8')
  })

  it('Restore defaults asks inside the dialog, with no native confirm box', async () => {
    const native = []
    const count = (dialog) => { native.push(dialog.message()); return dialog.dismiss() }
    p.on('dialog', count)
    await dialogButton(p, 'Restore defaults').click()
    const ask = p.locator(`${EDITOR} [data-role=restore-confirm]`)
    await ask.waitFor({ state: 'visible' })
    assert.match(await ask.innerText(), /own profiles/)
    await ask.getByRole('button', { name: 'Keep my profiles' }).click()
    assert.equal(await ask.count(), 0)
    assert.deepEqual(await p.$$eval(ROWS, (rows) => rows.map((r) => r.getAttribute('aria-label'))), ['Odd/Even', LONG_NAME])
    await dialogButton(p, 'Restore defaults').click()
    await ask.getByRole('button', { name: 'Restore defaults' }).click()
    assert.deepEqual(await p.$$eval(ROWS, (rows) => rows.map((r) => r.getAttribute('aria-label'))), ['Low/5/High', 'Odd/Even', 'Entropic', 'Modular', 'Each digit'])
    p.off('dialog', count)
    assert.deepEqual(native, [])
  })
})

describe('+ New profile at six profiles', { concurrency: false }, () => {
  let context, p
  before(async () => {
    ({ context, p } = await openSession(browser(), script, { saved: savedProfiles(SIX_PROFILES) }))
    await openEditorOn(p)
  })
  after(async () => { await context?.close() })

  it('is disabled and says why, in a tooltip and in the dialog', async () => {
    const button = p.locator(`${EDITOR} button[data-act=new-profile]`)
    assert.equal(await button.isDisabled(), true)
    assert.match(await button.getAttribute('title'), /6 profiles/)
    assert.match(await p.locator(`${EDITOR} [data-role=full-note]`).innerText(), /Delete one/)
  })
})
