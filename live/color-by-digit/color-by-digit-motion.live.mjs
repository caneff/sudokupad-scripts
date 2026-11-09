// Live check of Color by Digit's touches on sudokupad.app, in headless Chromium: chips, swatches and digit keys at 60%,
// the profile menu's fade and blink after a pick, the blank cells of an empty profile, the profile rows sliding aside
// during a drag, and no motion when the system asks for less.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ARROW, BUTTON, EDITOR, MENU, openSession, savedProfiles, SEED } from './color-by-digit-fixtures.mjs'
import { settle } from '../settle.mjs'
import { closeDialogWith, openScriptDialog } from '../settings.mjs'
import { scriptSource, useBrowser } from '../session.mjs'

const script = scriptSource('color-by-digit.user.js')

const ROWS = `${EDITOR} [data-role=profile-row]`
const THREE = { profiles: [...SEED.profiles, { name: 'Third', groups: [{ key: '9', digits: ['1', '2', '3'] }] }], active: 0 }
// The picked row's fill while it blinks: the active row's.
const BLINK_FILL = 'rgb(241, 235, 251)'
const GONE_WITHIN_MS = 1000
const PAST_LAST_ROW_PX = 8

const browser = useBrowser()

const alphaOf = (color) => Number(/(?:,|\/)\s*([\d.]+)\)$/.exec(color)[1])

// Records the menu's look at every change inside it, so a fade that lasts 100 ms is read without racing it.
const watchMenu = (p) => p.evaluate((menuSelector) => {
  window.menuSeen = []
  new window.MutationObserver(() => {
    const menu = document.querySelector(menuSelector)
    if (!menu) return
    const style = window.getComputedStyle(menu)
    window.menuSeen.push({
      closing: menu.classList.contains('cbd-closing'),
      property: style.transitionProperty,
      duration: style.transitionDuration,
      easing: style.transitionTimingFunction,
      events: style.pointerEvents,
      rowFills: [...menu.querySelectorAll('[data-act=pick]')].map((row) => window.getComputedStyle(row).backgroundColor)
    })
  }).observe(document.body, { subtree: true, childList: true, attributes: true })
}, MENU)
const menuSeen = (p) => p.evaluate(() => window.menuSeen)

const openMenuByArrow = async (p) => {
  await p.click(ARROW)
  await p.locator(MENU).waitFor({ state: 'visible' })
}

describe('chips, swatches and digit keys at 60%, an empty profile\'s blank cells, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ({ context, p, errors } = await openSession(browser(), script, { saved: savedProfiles({ ...THREE, active: 1 }) }))
    await openScriptDialog(p, 'Color by Digit', EDITOR)
  })
  after(async () => { await context.close() })

  it('a profile row\'s chip, every palette swatch and a painted digit key are drawn at 60%', async () => {
    const opacity = await p.locator(`${ROWS} svg[data-role=chips] [data-role=chip] rect`).first().evaluate((rect) => window.getComputedStyle(rect).fillOpacity)
    assert.equal(opacity, '0.6')
    const swatches = await p.$$eval(`${EDITOR} button[data-role=swatch]`, (es) => es.map((e) => window.getComputedStyle(e).backgroundColor))
    assert.equal(swatches.length > 0, true)
    assert.deepEqual([...new Set(swatches.map(alphaOf))], [0.6], JSON.stringify(swatches))
    const keys = await p.$$eval(`${EDITOR} button[data-act=digit]:not([data-key=""])`, (es) => es.map((e) => window.getComputedStyle(e).backgroundColor))
    assert.equal(keys.length > 0, true)
    assert.deepEqual([...new Set(keys.map(alphaOf))], [0.6], JSON.stringify(keys))
  })

  it('Clear all leaves three blank dashed cells in the profile\'s row, and Save puts them on the button', async () => {
    await p.click(`${EDITOR} [data-act=clear]`)
    const row = `${ROWS}[aria-checked=true] svg[data-role=chips]`
    assert.equal(await p.locator(`${row} [data-role=blank-chip]`).count(), 3)
    const outline = await p.locator(`${row} > rect[fill=none]`).evaluate((rect) => window.getComputedStyle(rect).strokeDasharray)
    assert.notEqual(outline, 'none')
    await closeDialogWith(p, 'Save', EDITOR)
    await p.locator(`${BUTTON} svg[data-role=chips] [data-role=blank-chip]`).first().waitFor({ state: 'attached' })
    assert.equal(await p.locator(`${BUTTON} svg[data-role=chips] [data-role=blank-chip]`).count(), 3)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

describe('the profile menu\'s fade after a pick, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ({ context, p, errors } = await openSession(browser(), script, { saved: savedProfiles(THREE) }))
    await watchMenu(p)
  })
  after(async () => { await context.close() })

  it('opens at once, with no transition', async () => {
    await openMenuByArrow(p)
    const [first] = await menuSeen(p)
    assert.deepEqual([first.closing, first.duration], [false, '0s'])
  })

  it('Escape, a click elsewhere and a resize close it at once, without the fade', async () => {
    await p.keyboard.press('Escape')
    await p.locator(MENU).waitFor({ state: 'detached' })
    await openMenuByArrow(p)
    await p.mouse.click(5, 5)
    await p.locator(MENU).waitFor({ state: 'detached' })
    await openMenuByArrow(p)
    await p.setViewportSize({ width: 1100, height: 700 })
    await p.locator(MENU).waitFor({ state: 'detached' })
    const seen = await menuSeen(p)
    assert.equal(seen.length > 0, true, 'the watcher recorded the menu')
    assert.equal(seen.some((s) => s.closing), false)
  })

  it('a pick blinks the row, then fades the menu over 100 ms with Material\'s accelerate easing, and removes it', async () => {
    await p.evaluate(() => { window.menuSeen = [] })
    await openMenuByArrow(p)
    await p.locator(`${MENU} [data-act=pick]`).filter({ hasText: 'Low/5/High' }).click()
    // The blink and the fade take 160 ms; the bound is loose for a loaded box and still far below a menu that lingers.
    await p.locator(MENU).waitFor({ state: 'detached', timeout: GONE_WITHIN_MS })
    const seen = await menuSeen(p)
    assert.equal(seen.some((s) => !s.closing && s.rowFills[1] === BLINK_FILL), true, 'the picked row blinks in the active fill')
    const closing = seen.filter((s) => s.closing)
    assert.equal(closing.length > 0, true, 'the menu fades')
    assert.deepEqual([...new Set(closing.map((s) => [s.property, s.duration, s.easing, s.events].join('|')))], ['opacity|0.1s|cubic-bezier(0.3, 0, 1, 1)|none'])
  })

  it('while it fades, a click on the arrow box opens the list again', async () => {
    await openMenuByArrow(p)
    await p.locator(`${MENU} [data-act=pick]`).filter({ hasText: 'Odd/Even' }).click()
    // A fading menu already counts as closed: the next click opens a fresh one, which is the only one left.
    await p.click(ARROW)
    await p.locator(`${MENU}:not(.cbd-closing)`).waitFor({ state: 'visible' })
    assert.equal(await p.locator(MENU).count(), 1)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

describe('the profile rows sliding aside during a drag, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ({ context, p, errors } = await openSession(browser(), script, { saved: savedProfiles(THREE) }))
    await openScriptDialog(p, 'Color by Digit', EDITOR)
  })
  after(async () => { await context.close() })

  const rowStyles = () => p.$$eval(ROWS, (rows) => rows.map((row) => {
    const style = window.getComputedStyle(row)
    return { transform: style.transform, duration: style.transitionDuration, easing: style.transitionTimingFunction }
  }))
  const translateY = (transform) => transform === 'none' ? 0 : Number(/matrix\([^)]*,\s*([-\d.]+)\)$/.exec(transform)[1])

  it('rows between the dragged one and the drop place move one row aside over 80 ms, ease-out, and settle when it is released', async () => {
    const handle = await p.locator(`${ROWS} [data-role=handle]`).first().boundingBox()
    const last = await p.locator(ROWS).last().boundingBox()
    const step = (await p.locator(ROWS).nth(1).boundingBox()).y - (await p.locator(ROWS).first().boundingBox()).y
    const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }
    const endY = last.y + last.height / 2 + PAST_LAST_ROW_PX
    await p.mouse.move(start.x, start.y)
    await p.mouse.down()
    await p.mouse.move(start.x, (start.y + endY) / 2, { steps: 4 })
    await p.mouse.move(start.x, endY, { steps: 4 })
    // The slide takes 80 ms, so the rows are read once they have arrived.
    const aside = await settle(async () => (await rowStyles()).slice(1).map((r) => [Math.round(translateY(r.transform)), r.duration, r.easing]), [[-step, '0.08s', 'ease-out'], [-step, '0.08s', 'ease-out']])
    assert.deepEqual(aside, [[-step, '0.08s', 'ease-out'], [-step, '0.08s', 'ease-out']])
    const during = await rowStyles()
    assert.equal(translateY(during[0].transform) > 0, true, 'the dragged row follows the pointer')
    assert.equal(await p.locator(`${ROWS}[style*=outline]`).count(), 0, 'no outline marks the target')
    await p.mouse.up()
    assert.deepEqual((await rowStyles()).map((r) => r.transform), ['none', 'none', 'none'])
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

describe('reduced motion, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ({ context, p, errors } = await openSession(browser(), script, { saved: savedProfiles(THREE), contextOptions: { reducedMotion: 'reduce' } }))
    await watchMenu(p)
  })
  after(async () => { await context.close() })

  it('a pick closes the menu at once: no fade, no blink, no transition', async () => {
    await openMenuByArrow(p)
    await p.locator(`${MENU} [data-act=pick]`).filter({ hasText: 'Low/5/High' }).click()
    await p.locator(MENU).waitFor({ state: 'detached' })
    const seen = await menuSeen(p)
    assert.equal(seen.length > 0, true, 'the watcher recorded the menu')
    assert.equal(seen.some((s) => s.closing || s.duration !== '0s' || s.rowFills[1] === BLINK_FILL), false, JSON.stringify(seen))
  })

  it('the profile rows have no transition', async () => {
    await openScriptDialog(p, 'Color by Digit', EDITOR)
    const durations = await p.$$eval(ROWS, (rows) => rows.map((row) => window.getComputedStyle(row).transitionDuration))
    assert.deepEqual(durations, ['0s', '0s', '0s'])
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})
