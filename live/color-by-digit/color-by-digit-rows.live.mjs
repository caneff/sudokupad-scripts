// Live check of the bottom row's cap (#376) on sudokupad.app in headless Chromium: with two stand-in buttons from another
// script added both before and after Color by Digit's, the row wraps five a row, every control stays inside the viewport,
// and the button still works. Desktop sizes only. How it looks is judged by sight in the PR.
/* global document */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ARROW, BUTTON, labelOn, MENU, openSession, pressTo } from './color-by-digit-fixtures.mjs'
import { stable } from '../settle.mjs'
import { scriptSource, useBrowser } from '../session.mjs'

const script = scriptSource('color-by-digit.user.js')
const ROW = '.controls-aux'
const PER_ROW = 5
const VIEWPORTS = [{ width: 1280, height: 720 }, { width: 1600, height: 900 }]
// A pixel of slack for sub-pixel rounding at the viewport's edge.
const EDGE_SLACK_PX = 1

// Two stand-in buttons, as another script's would be, added where `where` says relative to Color by Digit's own.
const STAND_INS = ['standin1', 'standin2']
const addStandIns = `
  for (const name of ${JSON.stringify(STAND_INS)}) Framework.addAuxButton({ name, title: name, content: '<div class="icon"><svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg></div>', onClick () {} });
`
const addStandInsAfter = (p) => p.evaluate(`(() => { ${addStandIns}; Framework.app.refreshControls() })()`)

const browser = useBrowser()

const layout = (p) => p.evaluate((row) => {
  const boxes = [...document.querySelectorAll('#controls button')].map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, left: r.left, top: r.top, right: r.right, bottom: r.bottom, view: { width: window.innerWidth, height: window.innerHeight } } })
  const inRow = [...document.querySelectorAll(`${row} > button`)].map((b) => ({ id: b.id, top: Math.round(b.getBoundingClientRect().top) }))
  const tops = [...new Set(inRow.map((b) => b.top))].sort((a, b) => a - b)
  return { rows: tops.map((top) => inRow.filter((b) => b.top === top).map((b) => b.id)), boxes }
}, ROW)
const inside = (b) => b.left >= -EDGE_SLACK_PX && b.top >= -EDGE_SLACK_PX && b.right <= b.view.width + EDGE_SLACK_PX && b.bottom <= b.view.height + EDGE_SLACK_PX

const ORDERS = [{ name: 'before', after: false }, { name: 'after', after: true }]

for (const viewport of VIEWPORTS) {
  for (const order of ORDERS) {
    describe(`with two other buttons added ${order.name} Color by Digit's, at ${viewport.width}x${viewport.height}`, { concurrency: false }, () => {
      let context, p
      before(async () => {
        ({ context, p } = await openSession(browser(), (order.after ? script : addStandIns + script), { contextOptions: { viewport } }))
        if (order.after) await addStandInsAfter(p)
      })
      after(async () => { await context?.close() })

      it('the row wraps five a row, with every control inside the viewport', async () => {
        const seen = await stable(() => layout(p))
        assert.deepEqual(seen.rows.map((r) => r.length), [PER_ROW, 2], JSON.stringify(seen.rows))
        assert.ok(seen.rows.flat().includes('control-colorbydigit'), JSON.stringify(seen.rows))
        assert.deepEqual(seen.boxes.filter((b) => !inside(b)).map((b) => b.id), [], JSON.stringify(seen.boxes))
      })

      it('a press steps the mode, and the arrow box opens the menu', async () => {
        const start = await labelOn(p)
        await pressTo(p, start === 'Cell' ? 'Digit' : 'Cell')
        await p.click(ARROW)
        await p.locator(MENU).waitFor({ state: 'visible' })
        assert.equal(await p.locator(BUTTON).count(), 1)
      })
    })
  }
}
