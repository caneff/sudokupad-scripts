// Live check of which bottom row Color by Digit's button joins (#364) on sudokupad.app in headless Chromium: the first row
// while it holds fewer than five buttons, else the second row, made or reused, and every control inside the viewport at
// 1280x720 and 1600x900 with the button still working there. How it looks is judged by sight in the PR.
/* global document */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { ARROW, BUTTON, labelOn, MENU, openSession, pressTo } from './color-by-digit-fixtures.mjs'
import { stable } from '../settle.mjs'

const script = readFileSync(new URL('../../color-by-digit.user.js', import.meta.url), 'utf8')
const FIRST_ROW = '.controls-aux'
const SECOND_ROW = '.controls-aux-extensions'
const SECOND_ROW_CLASS = 'controls-aux controls-aux-extensions'
const SUDOKUPAD_FOUR = ['control-undo', 'control-redo', 'control-check', 'control-select']
const VIEWPORTS = [{ width: 1280, height: 720 }, { width: 1600, height: 900 }]
// A pixel of slack for sub-pixel rounding at the viewport's edge.
const EDGE_SLACK_PX = 1

// Runs before Color by Digit's own code, as another script's button would: one stand-in button in the first row, and
// with `ownRow` also a second row of its own for the button to reuse.
const standIn = (ownRow) => `
  Framework.addAuxButton({ name: 'standin', title: 'Stand-in', content: '<div class="icon"><svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg></div>', onClick () {} });
  ${ownRow ? `{ const row = document.createElement('div'); row.className = '${SECOND_ROW_CLASS}'; document.querySelector('${FIRST_ROW}').after(row) }` : ''}
`

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

const idsIn = (p, selector) => p.evaluate((sel) => [...document.querySelectorAll(`${sel} > button`)].map((b) => b.id), selector)
// The class of the element right after the first row.
const nextRowClass = (p) => p.evaluate((first) => document.querySelector(first).nextElementSibling?.className, FIRST_ROW)
const rowCount = (p) => p.locator(SECOND_ROW).count()
// Every control button's box.
const controlBoxes = (p) => p.evaluate(() => [...document.querySelectorAll('#controls button')].map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, left: r.left, top: r.top, right: r.right, bottom: r.bottom, view: { width: window.innerWidth, height: window.innerHeight } } }))
const inside = (b) => b.left >= -EDGE_SLACK_PX && b.top >= -EDGE_SLACK_PX && b.right <= b.view.width + EDGE_SLACK_PX && b.bottom <= b.view.height + EDGE_SLACK_PX

describe('with only SudokuPad\'s four buttons in the first row', { concurrency: false }, () => {
  let context, p
  before(async () => { ({ context, p } = await openSession(browser, script)) })
  after(async () => { await context?.close() })

  it('the button joins the first row, and no second row is made', async () => {
    assert.deepEqual(await idsIn(p, FIRST_ROW), [...SUDOKUPAD_FOUR, 'control-colorbydigit'])
    assert.equal(await rowCount(p), 0)
  })
})

describe('with a stand-in extension button already in the first row', { concurrency: false }, () => {
  let context, p
  before(async () => { ({ context, p } = await openSession(browser, standIn(false) + script)) })
  after(async () => { await context?.close() })

  it('the button joins a new second row right after the first, and the first row keeps its five in order', async () => {
    assert.deepEqual(await idsIn(p, `${FIRST_ROW}:not(${SECOND_ROW})`), [...SUDOKUPAD_FOUR, 'control-standin'])
    assert.deepEqual(await idsIn(p, SECOND_ROW), ['control-colorbydigit'])
    assert.equal(await rowCount(p), 1)
    assert.equal(await nextRowClass(p), SECOND_ROW_CLASS)
    assert.equal(await p.locator(SECOND_ROW).getAttribute('class'), SECOND_ROW_CLASS)
  })
})

describe('with a second row another script already made', { concurrency: false }, () => {
  let context, p
  before(async () => { ({ context, p } = await openSession(browser, standIn(true) + script)) })
  after(async () => { await context?.close() })

  it('the button joins that row, and no second copy is made', async () => {
    assert.deepEqual(await idsIn(p, SECOND_ROW), ['control-colorbydigit'])
    assert.equal(await rowCount(p), 1)
  })
})

for (const viewport of VIEWPORTS) {
  describe(`with the second row at ${viewport.width}x${viewport.height}`, { concurrency: false }, () => {
    let context, p
    before(async () => { ({ context, p } = await openSession(browser, standIn(false) + script, { contextOptions: { viewport } })) })
    after(async () => { await context?.close() })

    it('every control is inside the viewport, with the button in the second row', async () => {
      assert.deepEqual(await idsIn(p, SECOND_ROW), ['control-colorbydigit'])
      const boxes = await stable(() => controlBoxes(p))
      assert.deepEqual(boxes.filter((b) => !inside(b)).map((b) => b.id), [], JSON.stringify(boxes))
    })

    it('a press steps the mode, and the arrow box opens the menu', async () => {
      assert.deepEqual(await idsIn(p, SECOND_ROW), ['control-colorbydigit'])
      const start = await labelOn(p)
      await pressTo(p, start === 'Cell' ? 'Digit' : 'Cell')
      await p.click(ARROW)
      await p.locator(MENU).waitFor({ state: 'visible' })
      assert.equal(await p.locator(BUTTON).count(), 1)
    })
  })
}
