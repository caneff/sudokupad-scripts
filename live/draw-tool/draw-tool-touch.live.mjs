// Live check of draw-tool.user.js's touches on sudokupad.app (#541): the outline and handles hide while arrow keys nudge, an open note is kept 20 px inside the
// window while typing without its stored point moving, Shift during a drag locks the move to one axis, a press on another note while one is open finishes the open
// one and selects the other in the same press, and a note's hit area is its box plus 4 px (hover, select, drag, right-click erase). Real mouse and keyboard input throughout.
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'

const { TEXTS, TEXT_BOX } = draw
const { HIT_MARGIN_PX, WINDOW_PAD_PX } = createRequire(import.meta.url)('../../draw-tool.user.js')
const SELECTION = '#draw-tool-layer .draw-tool-selection'
const HANDLES = '#draw-tool-layer .draw-tool-resize'
const WINDOW = { width: 1200, height: 900 }
const NEAR_PX = 0.6
// A note's box is checked by hand at these distances from its edge: inside the margin and past it.
const INSIDE_MARGIN_PX = 3
const PAST_MARGIN_PX = 6
const A_AT = [2.5, 2.5]
const B_AT = [6.5, 2.5]
const C_AT = [4.5, 6.5]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s touches', { concurrency: false }, () => {
  let context, p, errors

  const noteBox = (text) => p.locator(TEXTS).filter({ hasText: new RegExp(`^${text}$`) }).boundingBox()
  const typeNote = async (at, content) => {
    await p.mouse.click(...await gridPoint(p, at))
    await p.keyboard.type(content)
    // The first Escape closes the note and leaves it selected, the second ends the selection.
    await p.keyboard.press('Escape')
    await p.keyboard.press('Escape')
  }
  const savedNote = async (text) => (await draw.saved(p)).find((item) => item.text === text)
  const visible = (selector) => p.evaluate((s) => [...document.querySelectorAll(s)].map((e) => window.getComputedStyle(e).visibility), selector)
  const middle = ({ x, y, width, height }) => [x + width / 2, y + height / 2]
  const selectedCount = () => p.locator(`${TEXTS}.draw-tool-selected`).count()
  const onlySelected = async (text) => (await p.locator(`${TEXTS}.draw-tool-selected`).allTextContents()).join() === text
  // The board point a screen point is over, to compare with a saved note's point.
  const boardPoint = (point) => p.evaluate(([x, y]) => {
    const m = Framework.app.svgRenderer.getElem().getScreenCTM().inverse()
    const q = new window.DOMPoint(x, y).matrixTransform(m)
    return [q.x, q.y]
  }, point)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport: WINDOW } }))
    await draw.boot(p)
  })
  after(async () => { await context.close() })

  // Three notes apart from each other, Text Anywhere current and nothing selected.
  beforeEach(async () => {
    await draw.forgetDrawings(p)
    await draw.reload(p)
    await draw.pickDraw(p)
    await typeNote(A_AT, 'AA')
    await typeNote(B_AT, 'BB')
    await typeNote(C_AT, 'CC')
    assert.equal(await selectedCount(), 0)
  })

  describe('the outline and handles while arrow keys nudge', () => {
    it('hide on the first nudge, stay hidden while nudging, and come back about 300 ms after the last', async () => {
      await p.mouse.click(...middle(await noteBox('AA')))
      assert.deepEqual(await visible(SELECTION), ['visible'])
      assert.deepEqual(await visible(HANDLES), ['visible', 'visible', 'visible', 'visible'])
      await p.keyboard.press('ArrowRight')
      assert.deepEqual(await visible(SELECTION), ['hidden'], 'the outline hides')
      assert.deepEqual(await visible(HANDLES), ['hidden', 'hidden', 'hidden', 'hidden'], 'the handles hide')
      await p.waitForFunction((s) => [...document.querySelectorAll(s)].every((e) => window.getComputedStyle(e).visibility === 'visible'), `${SELECTION}, ${HANDLES}`)
      assert.equal(await p.locator(`${TEXTS}.draw-tool-selected`).count(), 1, 'the note is still selected')
    })

    it('come back at once on a pointer move', async () => {
      await p.mouse.click(...middle(await noteBox('AA')))
      await p.keyboard.press('ArrowDown')
      assert.deepEqual(await visible(SELECTION), ['hidden'])
      await p.mouse.move(600, 600)
      assert.deepEqual(await visible(SELECTION), ['visible'])
      assert.deepEqual(await visible(HANDLES), ['visible', 'visible', 'visible', 'visible'])
    })
  })

  describe('an open note near the window edge', () => {
    it('is kept WINDOW_PAD_PX inside the window as it grows, and its stored point is not moved', async () => {
      const click = [30, 400]
      await p.mouse.click(...click)
      await p.keyboard.type('hello there')
      const box = await p.locator(TEXT_BOX).boundingBox()
      assert.equal(box.x >= WINDOW_PAD_PX - NEAR_PX, true, `the open note starts at ${box.x}, 20 px in`)
      assert.equal(box.x + box.width <= WINDOW.width - WINDOW_PAD_PX + NEAR_PX, true)
      await p.keyboard.press('Escape')
      const [x, y] = (await savedNote('hello there')).at
      const [wantX, wantY] = await boardPoint(click)
      // The text starts at the click, so the stored point is half a line above it; the view shift would move it 20 px or more along x.
      assert.equal(Math.abs(x - wantX) < 1.5 && Math.abs(y - wantY) < 14, true, `the saved point ${[x, y]} is the click's ${[wantX, wantY]}`)
    })
  })

  describe('Shift during a drag', () => {
    it('locks the move to the axis of greater movement, and releasing Shift frees it', async () => {
      const start = await noteBox('CC')
      const [px, py] = middle(start)
      await p.mouse.move(px, py)
      await p.mouse.down()
      await p.mouse.move(px + 10, py + 5, { steps: 3 })
      await p.keyboard.down('Shift')
      await p.mouse.move(px + 80, py + 30, { steps: 4 })
      await draw.frames(p)
      const locked = await noteBox('CC')
      assert.equal(Math.abs(locked.x - (start.x + 80)) < NEAR_PX, true, `x followed the pointer: ${locked.x}`)
      assert.equal(Math.abs(locked.y - start.y) < NEAR_PX, true, `y stayed at ${start.y}, not ${locked.y}`)
      await p.keyboard.up('Shift')
      // Two frames, well inside the 100 ms a still pointer takes to redraw the move by itself: the release of Shift redraws it.
      await draw.frames(p)
      const freed = await noteBox('CC')
      assert.equal(Math.abs(freed.y - (start.y + 30)) < NEAR_PX, true, `y follows again: ${freed.y}`)
      await p.mouse.up()
      assert.equal(Math.abs((await noteBox('CC')).y - (start.y + 30)) < NEAR_PX, true, 'dropped where it was freed')
    })

    it('holding Shift to the release drops the note on the locked axis, and saves it there', async () => {
      const start = await noteBox('CC')
      const before = (await savedNote('CC')).at
      const [px, py] = middle(start)
      await p.mouse.move(px, py)
      await p.mouse.down()
      await p.keyboard.down('Shift')
      await p.mouse.move(px + 25, py - 70, { steps: 5 })
      await p.mouse.up()
      await p.keyboard.up('Shift')
      const after = (await savedNote('CC')).at
      assert.equal(Math.abs(after[0] - before[0]) < 1.5, true, `x stays ${before[0]}, not ${after[0]}`)
      assert.equal(Math.abs(after[1] - before[1]) > 20, true, `y moved from ${before[1]} to ${after[1]}`)
    })
  })

  describe('a press on another note while one is open', () => {
    it('picks it from 3 px outside its box too', async () => {
      await p.mouse.click(...middle(await noteBox('AA')), { clickCount: 2 })
      await p.locator(TEXT_BOX).waitFor()
      const box = await noteBox('BB')
      await p.mouse.click(box.x - INSIDE_MARGIN_PX, box.y + box.height / 2)
      assert.equal(await p.locator(TEXT_BOX).count(), 0)
      assert.equal(await onlySelected('BB'), true)
    })

    it('does not erase it on a right press: that only closes the open note', async () => {
      await p.mouse.click(...middle(await noteBox('AA')), { clickCount: 2 })
      await p.locator(TEXT_BOX).waitFor()
      await p.mouse.click(...middle(await noteBox('BB')), { button: 'right' })
      await draw.frames(p)
      assert.equal(await p.locator(TEXT_BOX).count(), 0)
      assert.deepEqual(await draw.texts(p), ['AA', 'BB', 'CC'])
    })

    it('finishes the open note and selects the other in the one press', async () => {
      await p.mouse.click(...middle(await noteBox('AA')), { clickCount: 2 })
      await p.locator(TEXT_BOX).waitFor()
      await p.keyboard.type('x')
      await p.mouse.click(...middle(await noteBox('BB')))
      assert.equal(await p.locator(TEXT_BOX).count(), 0, 'the open note is closed')
      assert.equal((await draw.saved(p)).some((item) => item.text.includes('x')), true, 'and was saved with the typed x')
      assert.equal(await onlySelected('BB'), true, 'the other note is selected')
      assert.equal(await p.locator(SELECTION).count(), 1)
    })

    it('lets the same press drag the other note', async () => {
      await p.mouse.click(...middle(await noteBox('AA')), { clickCount: 2 })
      await p.locator(TEXT_BOX).waitFor()
      const start = await noteBox('BB')
      const [px, py] = middle(start)
      await p.mouse.move(px, py)
      await p.mouse.down()
      await p.mouse.move(px + 60, py + 40, { steps: 4 })
      await p.mouse.up()
      assert.equal(await p.locator(TEXT_BOX).count(), 0)
      const moved = await noteBox('BB')
      assert.equal(Math.abs(moved.x - (start.x + 60)) < NEAR_PX && Math.abs(moved.y - (start.y + 40)) < NEAR_PX, true, `BB moved from ${start.x},${start.y} to ${moved.x},${moved.y}`)
    })

    it('still only closes the note when the press is on empty space', async () => {
      await p.mouse.click(...middle(await noteBox('AA')), { clickCount: 2 })
      await p.locator(TEXT_BOX).waitFor()
      await p.mouse.click(...await gridPoint(p, [8.5, 8.5]))
      assert.equal(await p.locator(TEXT_BOX).count(), 0)
      assert.equal(await selectedCount(), 0, 'nothing selected and no note opened')
      assert.deepEqual(await draw.texts(p), ['AA', 'BB', 'CC'])
    })
  })

  describe('a note\'s hit area is its box plus 4 px', () => {
    const outsideLeft = async (gap) => {
      const box = await noteBox('BB')
      return [box.x - gap, box.y + box.height / 2]
    }

    it('selects the note on a press 3 px outside its box, and not on a press 6 px outside', async () => {
      await p.mouse.click(...await outsideLeft(PAST_MARGIN_PX))
      await draw.frames(p)
      assert.equal(await selectedCount(), 0, 'past the margin selects nothing')
      assert.equal(await p.locator(TEXT_BOX).count(), 1, 'it opens a new note instead')
      await p.keyboard.press('Escape')
      await p.keyboard.press('Escape')
      await p.mouse.click(...await outsideLeft(INSIDE_MARGIN_PX))
      assert.equal(await onlySelected('BB'), true)
    })

    it('shows the hover outline 3 px outside the box, and not 6 px outside', async () => {
      const CLEAR = 'rgba(0, 0, 0, 0)'
      const outline = () => p.locator(TEXTS).filter({ hasText: /^BB$/ }).evaluate((e) => window.getComputedStyle(e).outlineColor)
      await p.mouse.move(...await outsideLeft(PAST_MARGIN_PX))
      await draw.frames(p)
      assert.equal(await outline(), CLEAR)
      await p.mouse.move(...await outsideLeft(INSIDE_MARGIN_PX))
      await p.waitForFunction((clear) => window.getComputedStyle([...document.querySelectorAll('#draw-tool-layer .draw-tool-text')].find((e) => e.textContent === 'BB')).outlineColor !== clear, CLEAR)
    })

    it('drags the note from a press 3 px outside its box', async () => {
      const start = await noteBox('BB')
      const [x, y] = await outsideLeft(INSIDE_MARGIN_PX)
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.move(x + 50, y + 30, { steps: 4 })
      await p.mouse.up()
      const moved = await noteBox('BB')
      assert.equal(Math.abs(moved.x - (start.x + 50)) < NEAR_PX && Math.abs(moved.y - (start.y + 30)) < NEAR_PX, true, `BB moved from ${start.x},${start.y} to ${moved.x},${moved.y}`)
    })

    it('erases the note on a right click 3 px outside its box, and not 6 px outside', async () => {
      await p.mouse.click(...await outsideLeft(PAST_MARGIN_PX), { button: 'right' })
      await draw.frames(p)
      assert.deepEqual(await draw.texts(p), ['AA', 'BB', 'CC'])
      await p.mouse.click(...await outsideLeft(INSIDE_MARGIN_PX), { button: 'right' })
      await p.waitForFunction(() => document.querySelectorAll('#draw-tool-layer .draw-tool-text').length === 2, null, { timeout: 3000 })
      assert.deepEqual(await draw.texts(p), ['AA', 'CC'])
    })

    it('reaches HIT_MARGIN_PX on the other sides too', async () => {
      const box = await noteBox('BB')
      const [x, y] = [box.x + box.width / 2, box.y + box.height + HIT_MARGIN_PX - 1]
      await p.mouse.click(x, y)
      assert.equal(await onlySelected('BB'), true, 'below the box')
    })
  })

  it('the page raised no error', () => assert.deepEqual(errors, []))
})
