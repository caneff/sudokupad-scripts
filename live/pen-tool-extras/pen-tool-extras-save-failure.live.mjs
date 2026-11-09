// Live check that Pen Tool Extras' Save is all-or-nothing, on sudokupad.app in headless Chromium: a Save whose second step throws
// (the settings step, after the pen colors were stored) leaves the stored pen colors and thickness, and the style the page draws with, as they were.
/* global Framework, Node */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as extras from './pen-tool-extras-fixtures.mjs'
import { useBrowser } from '../session.mjs'
import { closeExtrasEditorWith, dialogButton, openExtrasEditor } from '../settings.mjs'

const COLORS_KEY = 'PenColor_colors'
const THICKNESS_KEY = 'PenColor_thickness'
const STYLE = '#pen-tool-extras-style'
const EDITOR = '#pen-tool-extras-editor'

const browser = useBrowser()

describe('Pen Tool Extras\' Save is all-or-nothing', { concurrency: false }, () => {
  let context, p
  before(async () => {
    ;({ context, p } = await extras.open(browser(), { penTool: false }))
  })
  after(async () => { await context.close() })

  const stored = (key) => p.evaluate((k) => Framework.getData(k) ?? null, key)

  it('a Save whose settings step throws leaves the stored pen colors and thickness as they were, and says Not saved', async () => {
    const colorsBefore = await stored(COLORS_KEY)
    const thicknessBefore = await stored(THICKNESS_KEY)
    const styleBefore = await p.locator(STYLE).evaluate((el) => el.textContent)
    // The style is written once for the colors and once after the settings; the second write throws, once.
    await p.evaluate((selector) => {
      const style = document.querySelector(selector)
      const own = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')
      let writes = 0
      Object.defineProperty(style, 'textContent', {
        configurable: true,
        get () { return own.get.call(this) },
        set (value) {
          writes++
          if (writes === 2) throw new Error('style refused')
          own.set.call(this, value)
        }
      })
    }, STYLE)
    await openExtrasEditor(p)
    await p.locator(`${EDITOR} select[data-role="color-choice"]`).selectOption('sudokupad')
    await p.locator(`${EDITOR} input[data-setting="thickness"]`).evaluate((input) => {
      input.value = String(Number(input.min) === Number(input.value) ? Number(input.max) : Number(input.min))
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await dialogButton(p, 'Save').click()
    await p.locator('.dialog [data-role="settings-status"]').filter({ hasText: 'Not saved: style refused' }).waitFor()
    assert.deepEqual(await stored(COLORS_KEY), colorsBefore)
    assert.equal(await stored(THICKNESS_KEY), thicknessBefore)
    assert.equal(await p.locator(STYLE).evaluate((el) => el.textContent), styleBefore, 'the page draws with the colors and thickness in force before Save')
    await closeExtrasEditorWith(p, 'Cancel')
  })
})
