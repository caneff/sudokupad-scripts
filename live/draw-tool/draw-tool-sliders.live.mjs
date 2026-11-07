// Live check of Text Annotation's Size slider dragging as Pen Tool Extras' do, on sudokupad.app in headless Chromium at 1280x720:
// SudokuPad cancels every mouse move on the page, which stops the browser dragging a thumb unless the script keeps the move from it.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { boot, pickDraw, SIZE_SLIDER, SLIDERS } from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { readUntil } from '../settle.mjs'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Annotation\'s slider drags like Pen Tool Extras\'', { concurrency: false }, () => {
  let context, p

  before(async () => {
    ;({ context, p } = await openPage(browser, { contextOptions: { viewport: { width: 1280, height: 720 } } }))
    await boot(p)
    await pickDraw(p)
    await p.locator(SLIDERS).waitFor({ state: 'visible' })
  })
  after(async () => { await context.close() })

  const valueOf = (selector) => p.evaluate((s) => Number(document.querySelector(s).value), selector)
  const focusedSlider = () => p.evaluate((s) => document.activeElement?.matches(`${s} input`) === true, SLIDERS)

  // A press on the track at `from` (a fraction of its length) away from the thumb, then a drag to `to`, with real mouse input; the button stays down.
  async function dragTrack (selector, from, to) {
    const box = await p.locator(selector).boundingBox()
    const at = (fraction) => [box.x + box.width * fraction, box.y + box.height / 2]
    await p.mouse.move(...at(from))
    await p.mouse.down()
    await p.mouse.move(...at(to), { steps: 12 })
  }

  it('a press on the Size track away from the thumb and a drag across make the value follow the pointer', async () => {
    const { min, max } = await p.evaluate((s) => ({ min: Number(document.querySelector(s).min), max: Number(document.querySelector(s).max) }), SIZE_SLIDER)
    const range = max - min
    await dragTrack(SIZE_SLIDER, 0.1, 0.9)
    await readUntil(() => valueOf(SIZE_SLIDER), (v) => v >= min + range * 0.8)
    await p.mouse.up()
    await dragTrack(SIZE_SLIDER, 0.9, 0.2)
    await readUntil(() => valueOf(SIZE_SLIDER), (v) => v <= min + range * 0.3)
    await p.mouse.up()
  })

  it('the Size slider hands the focus back to the page when the pointer is released', async () => {
    await dragTrack(SIZE_SLIDER, 0.3, 0.6)
    await p.mouse.up()
    assert.equal(await focusedSlider(), false, 'no slider keeps the focus')
  })
})
