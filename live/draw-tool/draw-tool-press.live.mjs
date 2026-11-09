// Live check of the press state on Text Anywhere's panel buttons (lib/panel.js, shared with Pen Tool Extras): a button shrinks to 0.97 while the mouse holds it, and does not under reduced motion.
// Every press is the real mouse.
import { after, before, describe, it } from 'node:test'
import * as draw from './draw-tool-fixtures.mjs'
import { assertPressState } from '../page.mjs'
import { useBrowser } from '../session.mjs'

const BUTTONS = { 'a color button': `${draw.KEYPAD} button.digit[data-key="2"]`, 'the Clear all button': draw.CLEAR_BUTTON, 'the gear': draw.SETTINGS_BUTTON }

const browser = useBrowser()

for (const [name, contextOptions, scale] of [['a press', {}, 0.97], ['a press under reduced motion', { reducedMotion: 'reduce' }, 1]]) {
  describe(`Text Anywhere's panel: ${name}`, { concurrency: false }, () => {
    let context, p
    before(async () => {
      ;({ context, p } = await draw.open(browser(), { contextOptions }))
      await draw.pickDraw(p)
      await p.locator(draw.SLIDERS).waitFor({ state: 'visible' })
    })
    after(async () => { await context.close() })

    for (const [what, selector] of Object.entries(BUTTONS)) {
      it(`${what} ${scale === 1 ? 'keeps its size' : 'shrinks to 0.97'} while it is held, and is full size again once let go`, async () => {
        await assertPressState(p, selector, scale)
      })
    }
  })
}
