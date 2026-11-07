// Live check of the Color by Digit dialog's layout (#304) at 1200x900 and 390x800 on sudokupad.app in headless Chromium: checkboxes beside
// their labels, the mode as one row of buttons, Copy and Paste settings in the options row at the other buttons' height, two columns on a
// desktop and one on a phone, with no sideways overflow. How it looks is judged by sight in the PR.
/* global document */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { EDITOR, openSession } from './color-by-digit-fixtures.mjs'
import { openScriptDialog } from './settings.mjs'

const script = readFileSync(new URL('../color-by-digit.user.js', import.meta.url), 'utf8')
const DESKTOP = { width: 1200, height: 900 }
const PHONE = { width: 390, height: 800 }
const DESKTOP_DIALOG_PX = 640
const NEAR_PX = 1
const MAX_ONE_LINE_PX = 30

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

for (const [viewport, columns] of [[DESKTOP, 2], [PHONE, 1]]) {
  describe(`the dialog at ${viewport.width} px`, { concurrency: false }, () => {
    let context, p
    const rect = (selector) => p.locator(selector).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right } })
    before(async () => {
      ;({ context, p } = await openSession(browser, script, { contextOptions: { viewport } }))
      await openScriptDialog(p, 'Color by Digit', EDITOR)
    })
    after(async () => { await context?.close() })

    it('puts each checkbox beside its label, in one row at the top', async () => {
      const boxes = await p.locator(`${EDITOR} .cbd-check`).evaluateAll((labels) => labels.map((l) => {
        const input = l.querySelector('input').getBoundingClientRect()
        const text = l.getBoundingClientRect()
        return { height: text.height, inputRight: input.right, labelRight: text.right, inputMid: input.y + input.height / 2, labelMid: text.y + text.height / 2, labelWidth: text.width }
      }))
      assert.equal(boxes.length, 2)
      for (const b of boxes) {
        assert.equal(b.height < MAX_ONE_LINE_PX, true, `label text stays on one line: ${JSON.stringify(b)}`)
        assert.equal(Math.abs(b.inputMid - b.labelMid) <= 2, true, `checkbox and label share a line: ${JSON.stringify(b)}`)
        assert.equal(b.labelWidth > b.inputRight - (b.labelRight - b.labelWidth) + 40, true, `label text sits beside the box: ${JSON.stringify(b)}`)
      }
    })

    it('lays the four mode buttons in one row', async () => {
      const tops = await p.locator(`${EDITOR} button[data-role="mode-draft"]`).evaluateAll((es) => es.map((e) => Math.round(e.getBoundingClientRect().y)))
      assert.equal(tops.length, 4)
      assert.deepEqual([...new Set(tops)].length, 1)
    })

    it(`has ${columns} column${columns === 1 ? '' : 's'}, the list left of or above the editor, and no sideways overflow`, async () => {
      const list = await rect(`${EDITOR} .cbd-column:nth-child(1)`)
      const groups = await rect(`${EDITOR} .cbd-column:nth-child(2)`)
      if (columns === 2) assert.equal(groups.x >= list.right, true, `side by side: ${JSON.stringify([list, groups])}`)
      else assert.equal(Math.abs(groups.x - list.x) <= NEAR_PX, true, `stacked: ${JSON.stringify([list, groups])}`)
      const overflow = await p.locator('.dialog').first().evaluate((d) => ({ scroll: d.scrollWidth, client: d.clientWidth, doc: document.documentElement.scrollWidth, win: window.innerWidth }))
      assert.equal(overflow.scroll <= overflow.client, true, JSON.stringify(overflow))
      assert.equal(overflow.doc <= overflow.win, true, JSON.stringify(overflow))
    })

    it('sizes Copy and Paste settings like Cancel and Save, in the same row', async () => {
      const heights = await p.locator('.dialog-options button').evaluateAll((es) => es.map((e) => ({ text: e.textContent.trim(), height: e.getBoundingClientRect().height })))
      assert.deepEqual(heights.map((h) => h.text), ['Copy settings', 'Paste settings', 'Cancel', 'Save'])
      for (const h of heights) assert.equal(Math.abs(h.height - heights[3].height) <= NEAR_PX, true, JSON.stringify(heights))
    })

    if (viewport === DESKTOP) {
      it('is about 640 px wide', async () => {
        const { width } = await rect('.dialog')
        assert.equal(Math.abs(width - DESKTOP_DIALOG_PX) <= NEAR_PX, true, `width ${width}`)
      })
    }
  })
}
