// Live check of the press state on Text Anywhere's panel buttons (lib/panel.js, shared with Pen Tool Extras): a button shrinks to 0.97 while the mouse holds it, and does not under reduced motion.
// Every press is the real mouse.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage, scaleWhilePressed } from '../page.mjs'
import { settle } from '../settle.mjs'

const BUTTONS = { 'a color button': `${draw.KEYPAD} button.digit[data-key="2"]`, 'the Clear all button': draw.CLEAR_BUTTON, 'the gear': draw.SETTINGS_BUTTON }

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

for (const [name, contextOptions, scale] of [['a press', {}, 0.97], ['a press under reduced motion', { reducedMotion: 'reduce' }, 1]]) {
  describe(`Text Anywhere's panel: ${name}`, { concurrency: false }, () => {
    let context, p
    before(async () => {
      ;({ context, p } = await openPage(browser, { contextOptions }))
      await draw.boot(p)
      await draw.pickDraw(p)
      await p.locator(draw.SLIDERS).waitFor({ state: 'visible' })
    })
    after(async () => { await context.close() })

    for (const [what, selector] of Object.entries(BUTTONS)) {
      it(`${what} ${scale === 1 ? 'keeps its size' : 'shrinks to 0.97'} while it is held, and is full size again once let go`, async () => {
        assert.equal(await scaleWhilePressed(p, selector), scale)
        assert.equal(await settle(() => p.evaluate((s) => window.getComputedStyle(document.querySelector(s)).transform, selector), 'none'), 'none')
      })
    }
  })
}
