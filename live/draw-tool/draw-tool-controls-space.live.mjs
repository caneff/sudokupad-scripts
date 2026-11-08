// Live check that a press on empty space inside SudokuPad's controls box starts a note (#632), with Auto Rules Resizer widening a long rules pane,
// and that a press on a real control (a tool button, the rules text, the timer) still does not. Real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openWithAllScripts, rulesWidth, setLongRules } from '../attacks.mjs'

const { TEXT_BOX, TRAY, pickDraw } = draw
const WINDOW = { width: 1920, height: 1080 }
// SudokuPad's own rules pane is 14rem wide (224px at the default font): wider is the resizer's doing.
const SUDOKUPAD_RULES_PX = 224

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere and the empty space in SudokuPad\'s controls box', { concurrency: false }, () => {
  let context, p, errors

  const boxOpen = async () => (await p.locator(TEXT_BOX).count()) === 1
  const closeBox = async () => { await p.keyboard.press('Escape'); await p.locator(TEXT_BOX).waitFor({ state: 'detached' }) }
  const centerOf = (selector) => p.locator(selector).first().evaluate((e) => {
    const b = e.getBoundingClientRect()
    return [b.x + b.width / 2, b.y + b.height / 2]
  })
  // Every point of the controls box with a plain, background-less, text-less div under it: no visible control is there.
  const emptySpots = () => p.evaluate(() => {
    const box = document.querySelector('#controls').getBoundingClientRect()
    const spots = []
    for (let y = box.y + 2; y < box.bottom; y += 6) {
      for (let x = box.x + 2; x < box.right; x += 6) {
        const stack = document.elementsFromPoint(x, y).filter((e) => e.closest('#controls'))
        const plain = (e) => {
          const s = window.getComputedStyle(e)
          const ownText = [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim())
          return e.tagName === 'DIV' && !ownText && s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.backgroundImage === 'none'
        }
        if (stack.length && stack.every(plain)) spots.push({ at: [x, y], target: `${stack[0].tagName}.${stack[0].className}` })
      }
    }
    return spots
  })

  before(async () => {
    ;({ context, p, errors } = await openWithAllScripts(browser, { contextOptions: { viewport: WINDOW } }))
    await setLongRules(p)
    await pickDraw(p)
  })
  after(async () => { await context.close() })

  it('the rules pane is widened', async () => {
    await p.locator('.puzzle-rules.auto-rules-resizer-text').waitFor({ state: 'attached' })
    assert.ok((await rulesWidth(p)) > SUDOKUPAD_RULES_PX, 'Auto Rules Resizer widened the pane')
  })

  it('a press on empty space inside the controls box opens a note there', async () => {
    const spots = await emptySpots()
    assert.ok(spots.length > 0, 'the controls box has empty space')
    const targets = [...new Set(spots.map((s) => s.target))]
    const failed = []
    for (const target of targets) {
      const { at } = spots.find((s) => s.target === target)
      await p.mouse.click(...at)
      if (!(await boxOpen())) failed.push(`${target} at ${at}`)
      else await closeBox()
    }
    assert.deepEqual(failed, [], 'presses on these empty targets started no note')
  })

  it('a press on a tool button, the rules text or the timer does not open a note', async () => {
    for (const selector of ['#control-draw', '.puzzle-rules', '.timer']) {
      await p.mouse.click(...await centerOf(selector))
      assert.equal(await boxOpen(), false, `${selector} opened a note`)
    }
  })

  it('a press on the empty fill of Text Anywhere\'s own panel does not open a note', async () => {
    const [x, y] = await p.locator(TRAY).evaluate((e) => { const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + 2] })
    await p.mouse.click(x, y)
    assert.equal(await boxOpen(), false, 'the tray opened a note')
  })

  it('no page error', async () => {
    assert.deepEqual(errors, [])
  })
})
