// Live check that a press on empty space inside SudokuPad's controls box starts a note (#632), with Auto Rules Resizer widening a long rules pane,
// and that a press on a real control (a tool button, the rules text, the timer) still does not. Real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { openWithAllScripts, rulesWidth, setLongRules } from '../attacks.mjs'
import { useBrowser } from '../session.mjs'
import { boxOpen } from '../board.mjs'
import { ARROW, MENU } from '../color-by-digit/color-by-digit-fixtures.mjs'

const { SLIDERS, TEXT_BOX, pickTextAnywhere } = textAnywhere
const WINDOW = { width: 1920, height: 1080 }
// SudokuPad's own rules pane is 14rem wide (224px at the default font): wider is the resizer's doing.
const SUDOKUPAD_RULES_PX = 224
const TRANSPARENT = 'rgba(0, 0, 0, 0)'

const browser = useBrowser()

describe('Text Anywhere and the empty space in SudokuPad\'s controls box', { concurrency: false }, () => {
  let context, p, errors

  const closeBox = async () => { await p.keyboard.press('Escape'); await p.locator(TEXT_BOX).waitFor({ state: 'detached' }) }
  const centerOf = (selector) => p.locator(selector).first().evaluate((e) => {
    const b = e.getBoundingClientRect()
    return [b.x + b.width / 2, b.y + b.height / 2]
  })
  // Every point of the controls box with a plain, background-less, text-less div under it: no visible control is there.
  const emptySpots = () => p.evaluate((transparent) => {
    const box = document.querySelector('#controls').getBoundingClientRect()
    const spots = []
    for (let y = box.y + 2; y < box.bottom; y += 6) {
      for (let x = box.x + 2; x < box.right; x += 6) {
        const stack = document.elementsFromPoint(x, y).filter((e) => e.closest('#controls'))
        const plain = (e) => {
          const s = window.getComputedStyle(e)
          const ownText = [...e.childNodes].some((n) => n.nodeType === window.Node.TEXT_NODE && n.textContent.trim())
          return e.tagName === 'DIV' && !ownText && s.backgroundColor === transparent && s.backgroundImage === 'none'
        }
        if (stack.length && stack.every(plain)) spots.push({ at: [x, y], target: `${stack[0].tagName}.${stack[0].className}` })
      }
    }
    return spots
  }, TRANSPARENT)

  before(async () => {
    ;({ context, p, errors } = await openWithAllScripts(browser(), { contextOptions: { viewport: WINDOW, permissions: ['clipboard-write'] } }))
    await setLongRules(p)
    await pickTextAnywhere(p)
  })
  after(async () => { await context.close() })

  it('the rules pane is widened', async () => {
    await p.locator('.puzzle-rules.auto-rules-resizer-text').waitFor({ state: 'attached' })
    assert.ok((await rulesWidth(p)) > SUDOKUPAD_RULES_PX, 'Auto Rules Resizer widened the pane')
  })

  it('a press on empty space inside the controls box opens a note there', async () => {
    const spots = await emptySpots()
    assert.ok(spots.length > 0, 'the controls box has empty space')
    const targets = [...new Set(spots.map((s) => s.target))]
    const failed = []
    for (const target of targets) {
      const { at } = spots.find((s) => s.target === target)
      await p.mouse.click(...at)
      if (!(await boxOpen(p))) failed.push(`${target} at ${at}`)
      else await closeBox()
    }
    assert.deepEqual(failed, [], 'presses on these empty targets started no note')
  })

  it('a press just below the widened rules pane opens a note', async () => {
    const [x, y] = await p.locator('.puzzle-rules').evaluate((e) => { const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.bottom + 1] })
    assert.ok((await p.evaluate(([px, py]) => document.elementFromPoint(px, py).closest('#controls') !== null, [x, y])), 'the point is inside the controls box')
    await p.mouse.click(x, y)
    assert.equal(await boxOpen(p), true, 'a note opened below the rules')
    await closeBox()
  })

  it('a press on empty space in Text Anywhere\'s own panel, over its fill, does not open a note', async () => {
    // A point where the sliders' own transparent div is the target, with the tray's fill drawn under it.
    const at = await p.locator(SLIDERS).evaluate((sliders) => {
      const b = sliders.getBoundingClientRect()
      for (let y = b.y + 1; y < b.bottom; y += 2) {
        for (let x = b.x + 1; x < b.right; x += 2) if (document.elementFromPoint(x, y) === sliders) return [x, y]
      }
      return null
    })
    assert.notEqual(at, null, 'the sliders have a spot of their own')
    await p.mouse.click(...at)
    assert.equal(await boxOpen(p), false, 'the panel opened a note')
  })

  it('a press on the copy-rules icon\'s own div, which has only a picture, does not open a note', async () => {
    const at = await p.locator('.rules-copy').evaluate((copy) => {
      const b = copy.getBoundingClientRect()
      for (let y = b.y + 1; y < b.bottom; y += 2) {
        for (let x = b.x + 1; x < b.right; x += 2) if (document.elementFromPoint(x, y) === copy) return [x, y]
      }
      return null
    })
    assert.notEqual(at, null, 'the icon\'s div has a spot of its own')
    await p.mouse.click(...at)
    assert.equal(await boxOpen(p), false, 'the copy-rules icon opened a note')
  })

  it('a press on a row of Color by Digit\'s profile menu opens no note and leaves Text Anywhere\'s button on top (#829)', async () => {
    await p.locator(ARROW).click()
    await p.locator(MENU).waitFor({ state: 'visible' })
    await p.locator(`${MENU} [data-act=pick][data-target=cells]`).nth(1).click()
    await p.locator(MENU).waitFor({ state: 'detached' })
    assert.equal(await boxOpen(p), false, 'the menu row opened a note')
    const [x, y] = await centerOf('#control-textanywhere')
    assert.equal(await p.evaluate(([px, py]) => document.elementFromPoint(px, py).closest('#control-textanywhere') !== null, [x, y]), true, 'the tool button is on top')
  })

  it('a press on a tool button, the rules text or the timer (which pauses with its own dialog) does not open a note', async () => {
    // The footer is a transparent div with text: a control.
    for (const selector of ['#control-textanywhere', '.puzzle-rules', '.controls-footer', '.timer']) {
      await p.mouse.click(...await centerOf(selector))
      assert.equal(await boxOpen(p), false, `${selector} opened a note`)
    }
  })

  it('no page error', async () => {
    assert.deepEqual(errors, [])
  })
})
