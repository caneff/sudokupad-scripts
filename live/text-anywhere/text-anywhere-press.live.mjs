// Live check of the press state on Text Anywhere's panel buttons (lib/panel.js, shared with Pen Tool Extras): a button shrinks to 0.97 while the mouse holds it, and does not under reduced motion.
// Every press is the real mouse.
import { after, before, describe, it } from 'node:test'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { assertPressState } from '../page.mjs'
import { useBrowser } from '../session.mjs'

const BUTTONS = { 'a color button': `${textAnywhere.KEYPAD} button.digit[data-key="2"]`, 'the Clear all button': textAnywhere.CLEAR_BUTTON, 'the gear': textAnywhere.SETTINGS_BUTTON }

const browser = useBrowser()

for (const [name, contextOptions, scale] of [['a press', {}, 0.97], ['a press under reduced motion', { reducedMotion: 'reduce' }, 1]]) {
  describe(`Text Anywhere's panel: ${name}`, { concurrency: false }, () => {
    let context, p
    before(async () => {
      ;({ context, p } = await textAnywhere.open(browser(), { contextOptions }))
      await textAnywhere.pickTextAnywhere(p)
      await p.locator(textAnywhere.SLIDERS).waitFor({ state: 'visible' })
    })
    after(async () => { await context.close() })

    for (const [what, selector] of Object.entries(BUTTONS)) {
      it(`${what} ${scale === 1 ? 'keeps its size' : 'shrinks to 0.97'} while it is held, and is full size again once let go`, async () => {
        await assertPressState(p, selector, scale)
      })
    }
  })
}
