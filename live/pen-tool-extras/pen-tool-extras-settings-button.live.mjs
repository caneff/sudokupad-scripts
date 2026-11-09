// Live check of pen-tool-extras.user.js's settings button in the pen tool's panel, on sudokupad.app in headless Chromium.
// A real touch screen stays untested. The clicks are real mouse input; the tap is Chromium's emulated touch.
/* global getComputedStyle */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as extras from './pen-tool-extras-fixtures.mjs'
import { useBrowser } from '../session.mjs'

const BUTTON = '.pen-tool-extras-settings'
const EDITOR = '#pen-tool-extras-editor'

const browser = useBrowser()

describe('the settings button in the pen panel', { concurrency: false }, () => {
  let context, p

  const selectedId = () => p.evaluate(() => (document.querySelector('.controls-tool .selected, .controls-tool [aria-pressed=true], .controls-tool .active') || {}).id || null)
  const currentPen = () => p.evaluate(() => document.querySelector('.tool-pen button.current')?.dataset.key)
  const closeDialog = async () => {
    // SudokuPad ignores a key until the zero-delay timer of showDialog has fired; a timer set after it fires after it.
    await p.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)))
    await p.keyboard.press('Escape')
    await p.locator(EDITOR).waitFor({ state: 'detached' })
  }

  before(async () => {
    ;({ context, p } = await extras.open(browser(), { contextOptions: { viewport: { width: 1200, height: 1000 } } }))
  })
  after(async () => { await context.close() })

  it('the button is named Pen Tool Extras settings, and SudokuPad\'s pen tool button carries no gear any more', async () => {
    const button = p.locator(BUTTON)
    await button.waitFor({ state: 'visible' })
    assert.equal(await button.getAttribute('title'), 'Pen Tool Extras settings')
    assert.equal(await button.getAttribute('aria-label'), 'Pen Tool Extras settings')
    assert.equal(await p.locator('.pen-tool-extras-gear').count(), 0)
    assert.equal(await p.locator('#control-pen *').evaluateAll((els) => els.filter((e) => /settings/i.test(e.getAttribute('aria-label') || '')).length), 0)
  })

  it('the icon is an outline gear: its lines draw in the panel color and nothing is filled', async () => {
    const paint = await p.locator(`${BUTTON} svg`).evaluate((svg) => [...svg.querySelectorAll('path, circle')].map((e) => { const s = getComputedStyle(e); return [s.fill, s.stroke] }))
    assert.equal(paint.length, 2, 'the gear\'s outline and its hub')
    for (const [fill, stroke] of paint) {
      assert.equal(fill, 'none')
      assert.equal(stroke, 'rgb(106, 27, 154)')
    }
  })

  it('a click on the button opens the dialog and leaves the pen tool and its color selected', async () => {
    const pen = await currentPen()
    await p.locator(BUTTON).click()
    await p.locator(EDITOR).waitFor({ state: 'visible' })
    assert.equal(await selectedId(), 'control-pen')
    assert.equal(await currentPen(), pen)
    await closeDialog()
    assert.equal(await currentPen(), pen)
  })

  it('the button is put back when SudokuPad rebuilds the panel', async () => {
    await p.evaluate((button) => document.querySelector(button).remove(), BUTTON)
    await p.locator(BUTTON).waitFor({ state: 'visible' })
  })

  // SudokuPad cancels the touch events of a tap on a panel button, which stops the browser sending the click; the button acts at its touchstart.
  it('a tap on the button opens the dialog once', async () => {
    const { context: touch, p: tp } = await extras.open(browser(), { contextOptions: { viewport: { width: 1200, height: 1000 }, hasTouch: true } })
    try {
      const box = await tp.locator(BUTTON).boundingBox()
      await tp.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
      await tp.locator(EDITOR).waitFor({ state: 'visible' })
      assert.equal(await tp.locator(EDITOR).count(), 1)
    } finally {
      await touch.close()
    }
  })
})
