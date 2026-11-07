// Live check of draw-tool.user.js's edit mode on sudokupad.app: the color pickers over the nine color buttons leave the keypad's
// buttons in their cells, so no button edge shows around SudokuPad's undo row, at the two desktop sizes.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from './page.mjs'

const { PICKER } = draw
const { HOLD_TO_EDIT_MS } = createRequire(import.meta.url)('../draw-tool.user.js')
const HOLD_WAIT_MS = HOLD_TO_EDIT_MS + 5000
const NEAR_PX = 0.5

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

for (const viewport of [{ width: 1280, height: 720 }, { width: 1600, height: 900 }]) {
  describe(`Draw Tool's edit mode at ${viewport.width}x${viewport.height}`, { concurrency: false }, () => {
    let context, p

    before(async () => {
      ;({ context, p } = await openPage(browser, { contextOptions: { viewport } }))
      await draw.boot(p)
      await draw.pickDraw(p)
      await p.locator(draw.SLIDERS).waitFor({ state: 'visible' })
      const box = await p.locator('.controls-input button[data-key="4"]').boundingBox()
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await p.mouse.down()
      try {
        await p.locator(PICKER).first().waitFor({ state: 'visible', timeout: HOLD_WAIT_MS })
      } finally {
        await p.mouse.up()
      }
    })
    after(async () => { await context.close() })

    it('shows no part of the keypad outside its own box, so no button edge peeks around the undo row', async () => {
      const stray = await p.evaluate(() => {
        const panel = document.querySelector('.controls-input').getBoundingClientRect()
        return [...document.querySelectorAll('.controls-input *')]
          .map((e) => ({ name: `${e.tagName}.${e.className}`, key: e.dataset.key, rect: e.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width * rect.height > 0 && (rect.bottom > panel.bottom + 0.5 || rect.top < panel.top - 0.5))
          .map(({ name, key, rect }) => `${name} key ${key}: ${Math.round(rect.top)}-${Math.round(rect.bottom)} outside ${Math.round(panel.top)}-${Math.round(panel.bottom)}`)
      })
      assert.deepEqual(stray, [])
    })

    it('keeps each color button in the cell of its picker', async () => {
      const cells = await p.evaluate(() => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
        const button = document.querySelector(`.controls-input button[data-key="${n}"]`).getBoundingClientRect()
        const picker = document.querySelector(`.draw-tool-picker[data-color="${n}"]`).getBoundingClientRect()
        return [n, Math.abs(button.x + button.width / 2 - picker.x - picker.width / 2), Math.abs(button.y + button.height / 2 - picker.y - picker.height / 2)]
      }))
      for (const [n, dx, dy] of cells) assert.equal(dx <= NEAR_PX && dy <= NEAR_PX, true, `button ${n} is ${dx} px, ${dy} px off its picker's center`)
    })
  })
}
