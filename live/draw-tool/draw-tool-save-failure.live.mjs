// Live check that Text Anywhere's Save is all-or-nothing, on sudokupad.app in headless Chromium: a Save that throws after writing the colors
// leaves the stored colors, and what the dialog shows on reopening, exactly as they were before Save. The throw is in the first step because every later step
// (outline, box color, frame, font) runs under a guard that swallows a throw, so none can fail through to the dialog. Real mouse input.
/* global Node */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as draw from './draw-tool-fixtures.mjs'
import { closeDialogWith, dialogButton } from '../settings.mjs'
import { useBrowser } from '../session.mjs'

const { COLORS_KEY, SETTINGS_BUTTON, SETTINGS_EDITOR: EDITOR, SETTINGS_STATUS: STATUS } = draw
const COLORS_STYLE_ID = 'draw-tool-colors'
const PRESET = `${EDITOR} select[data-role="color-choice"]`
const SWATCH_2 = `${EDITOR} input[data-role="swatch"][data-key="2"]`

const browser = useBrowser()

describe('Text Anywhere\'s Save is all-or-nothing', { concurrency: false }, () => {
  let context, p
  before(async () => {
    ;({ context, p } = await draw.open(browser()))
    await draw.pickDraw(p)
  })
  after(async () => { await context.close() })

  const stored = (key) => p.evaluate((k) => Framework.getData(k) ?? null, key)

  it('a Save whose showing of the new colors throws leaves the colors stored, and shown, as they were', async () => {
    await p.click(SETTINGS_BUTTON)
    await p.locator(PRESET).selectOption('sudokupad')
    await closeDialogWith(p, 'Save', EDITOR)
    const colorsBefore = await stored(COLORS_KEY)

    // Showing the new colors is the step after their write, and the only step of a Save that is not guarded; its first write throws, once.
    await p.evaluate((id) => {
      const style = document.getElementById(id)
      const own = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')
      let thrown = false
      Object.defineProperty(style, 'textContent', {
        configurable: true,
        get () { return own.get.call(this) },
        set (value) {
          if (!thrown) { thrown = true; throw new Error('style refused') }
          own.set.call(this, value)
        }
      })
    }, COLORS_STYLE_ID)
    await p.click(SETTINGS_BUTTON)
    await p.locator(SWATCH_2).fill('#123456')
    await p.locator(`${EDITOR} button[data-role="outline-pick"][aria-label="None"]`).click()
    await dialogButton(p, 'Save').click()
    await p.locator(STATUS).filter({ hasText: 'Not saved: style refused' }).waitFor()

    assert.deepEqual(await stored(COLORS_KEY), colorsBefore)
    await closeDialogWith(p, 'Cancel', EDITOR)
    await p.click(SETTINGS_BUTTON)
    assert.equal(await p.locator(SWATCH_2).inputValue(), colorsBefore[2], 'the dialog opens on the restored colors')
    await closeDialogWith(p, 'Cancel', EDITOR)
  })
})
