// Live check of draw-tool.user.js's edit mode on sudokupad.app: the color pickers over the nine color buttons leave the keypad's
// buttons in their cells, so no button edge shows around SudokuPad's undo row, at the two desktop sizes.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as draw from './draw-tool-fixtures.mjs'
import { useBrowser } from '../session.mjs'

const { KEYPAD, NEAR_PX, NINE, PICKER_BOX, SLIDERS, TRAY } = draw

const browser = useBrowser()

for (const viewport of [{ width: 1280, height: 720 }, { width: 1600, height: 900 }]) {
  describe(`Text Anywhere's edit mode at ${viewport.width}x${viewport.height}`, { concurrency: false }, () => {
    let context, p

    before(async () => {
      ;({ context, p } = await draw.open(browser(), { contextOptions: { viewport } }))
      await draw.pickDraw(p)
      await p.locator(SLIDERS).waitFor({ state: 'visible' })
      await draw.holdForPickers(p, `${KEYPAD} button[data-key="4"]`, 'left', 'visible')
    })
    after(async () => { await context.close() })

    it('shows no part of the keypad, the tray apart, past any side of its box, so no button edge peeks around the undo row', async () => {
      const stray = await p.evaluate(([keypad, tray, near]) => {
        const panel = document.querySelector(keypad).getBoundingClientRect()
        return [...document.querySelectorAll(`${keypad} *:not(${tray})`)]
          .map((e) => ({ name: `${e.tagName}.${e.className}`, key: e.dataset.key, rect: e.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width * rect.height > 0 &&
            (rect.bottom > panel.bottom + near || rect.top < panel.top - near || rect.left < panel.left - near || rect.right > panel.right + near))
          .map(({ name, key, rect }) => `${name} key ${key}: x ${Math.round(rect.left)}-${Math.round(rect.right)}, y ${Math.round(rect.top)}-${Math.round(rect.bottom)} outside x ${Math.round(panel.left)}-${Math.round(panel.right)}, y ${Math.round(panel.top)}-${Math.round(panel.bottom)}`)
      }, [KEYPAD, TRAY, NEAR_PX])
      assert.deepEqual(stray, [])
    })

    it('keeps each color button in the cell of its picker', async () => {
      const offsets = await p.evaluate(([keypad, pickerBox, numbers]) => numbers.map((n) => {
        const button = document.querySelector(`${keypad} button[data-key="${n}"]`).getBoundingClientRect()
        const picker = document.querySelector(`${pickerBox}[data-key="${n}"]`).getBoundingClientRect()
        return [n, Math.abs(button.x + button.width / 2 - picker.x - picker.width / 2), Math.abs(button.y + button.height / 2 - picker.y - picker.height / 2)]
      }), [KEYPAD, PICKER_BOX, NINE])
      for (const [n, dx, dy] of offsets) assert.equal(dx <= NEAR_PX && dy <= NEAR_PX, true, `button ${n} is ${dx} px, ${dy} px off its picker's center`)
    })
  })
}
