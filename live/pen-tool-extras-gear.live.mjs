// Live check of pen-tool-extras.user.js's settings gear on SudokuPad's pen tool button (#control-pen), on sudokupad.app in headless Chromium.
// A real touch screen stays untested. The clicks are real mouse input; the tap is Chromium's emulated touch.
// That the gear sits clear of the pen icon is judged on the screenshot in the PR, not here.
/* global Framework, getComputedStyle */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { gotoPuzzle, openPage, startPuzzle } from './page.mjs'

const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')
const BUTTON = '#control-pen'
const GEAR = '#control-pen [aria-label="Pen Tool Extras settings"]'
const EDITOR = '#pen-tool-extras-editor'
const CLEAR_OF_GEAR_PX = 6

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('the settings gear on the pen tool button', { concurrency: false }, () => {
  let context, p

  const boot = async (p) => {
    await startPuzzle(p, { beforeStart: () => p.evaluate(() => Framework.setSetting('toolpen', true)) })
    await p.addScriptTag({ content: script })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
  }
  const selectedId = () => p.evaluate(() => (document.querySelector('.controls-tool .selected, .controls-tool [aria-pressed=true], .controls-tool .active') || {}).id || null)
  const closeDialog = async () => {
    // SudokuPad ignores a key until the zero-delay timer of showDialog has fired; a timer set after it fires after it.
    await p.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)))
    await p.keyboard.press('Escape')
    await p.locator(EDITOR).waitFor({ state: 'detached' })
  }

  const otherToolId = async () => {
    const id = await p.evaluate(() => [...document.querySelectorAll('.controls-tool button, .controls-tool [role=button]')].find((e) => e.id && e.id !== 'control-pen')?.id)
    assert.ok(id, 'another tool button exists')
    return id
  }
  // The lower left of the button, clear of the gear in the upper right.
  const clickPenButton = async () => {
    const box = await p.locator(BUTTON).boundingBox()
    await p.mouse.click(box.x + CLEAR_OF_GEAR_PX, box.y + box.height - CLEAR_OF_GEAR_PX)
  }

  before(async () => {
    ;({ context, p } = await openPage(browser, { contextOptions: { viewport: { width: 1200, height: 1000 } } }))
    await boot(p)
  })
  after(async () => { await context.close() })

  it('the gear is 13 px and sits 2 px in from the upper right corner of the button', async () => {
    const gear = p.locator(GEAR)
    await gear.waitFor({ state: 'visible' })
    // SudokuPad scales its controls, so the sizes are read in the button's own layout pixels; the insets are from the button's padding edge, which an absolute box is placed against.
    const m = await p.evaluate(([button, gearSel]) => {
      const b = document.querySelector(button)
      const g = document.querySelector(gearSel)
      const scale = b.getBoundingClientRect().width / b.offsetWidth
      const r = (el) => el.getBoundingClientRect()
      return { w: g.offsetWidth, h: g.offsetHeight, right: (r(b).right - r(g).right) / scale - b.clientLeft, top: (r(g).top - r(b).top) / scale - b.clientTop }
    }, [BUTTON, GEAR])
    assert.equal(m.w, 13)
    assert.equal(m.h, 13)
    assert.equal(Math.round(m.right), 2, 'right inset')
    assert.equal(Math.round(m.top), 2, 'top inset')
  })

  // SudokuPad turns a selected tool's icons white, which is invisible on the gear's white box.
  it('the gear glyph shows against its box with the pen tool selected and not selected', async () => {
    const colors = () => p.evaluate((gear) => {
      const g = document.querySelector(gear)
      return { glyph: getComputedStyle(g.querySelector('path')).fill, border: getComputedStyle(g).borderTopColor, box: getComputedStyle(g).backgroundColor }
    }, GEAR)
    const show = async (when) => {
      const c = await colors()
      assert.equal(c.glyph, c.border, `${when}: the glyph is drawn in the border's color`)
      assert.notEqual(c.glyph, c.box, `${when}: the glyph differs from the box behind it`)
    }
    await p.click(`#${await otherToolId()}`)
    await show('pen tool not selected')
    await clickPenButton()
    assert.equal(await selectedId(), 'control-pen')
    await show('pen tool selected')
  })

  it('a click on the gear with another tool selected opens the dialog and leaves that tool selected', async () => {
    const other = await otherToolId()
    await p.click(`#${other}`)
    assert.equal(await selectedId(), other, 'the other tool is selected before the gear is clicked')
    await p.locator(GEAR).click()
    await p.locator(EDITOR).waitFor({ state: 'visible' })
    assert.equal(await selectedId(), other)
    await closeDialog()
  })

  it('a click on the button outside the gear selects the pen tool and opens no dialog', async () => {
    await clickPenButton()
    assert.equal(await selectedId(), 'control-pen')
    assert.equal(await p.locator(EDITOR).count(), 0)
  })

  it('the gear is put back when SudokuPad rebuilds the button', async () => {
    await p.evaluate((gear) => document.querySelector(gear).remove(), GEAR)
    await p.locator(GEAR).waitFor({ state: 'visible' })
  })

  it('the gear is present after a reload', async () => {
    await gotoPuzzle(p)
    await boot(p)
    await p.locator(GEAR).waitFor({ state: 'visible' })
  })

  // SudokuPad cancels the touch events of a tap on a tool button, which stops the browser sending the click; the gear keeps its touchstart and
  // touchend from SudokuPad. A mouse press needs no such check: SudokuPad ignores a press whose target is not the button.
  it('a tap on the gear opens the dialog', async () => {
    const { context: touch, p: tp } = await openPage(browser, { contextOptions: { viewport: { width: 1200, height: 1000 }, hasTouch: true } })
    try {
      await boot(tp)
      const box = await tp.locator(GEAR).boundingBox()
      await tp.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
      await tp.locator(EDITOR).waitFor({ state: 'visible' })
    } finally {
      await touch.close()
    }
  })
})
