// Live check of the Text Annotation tool button's icon on sudokupad.app: SudokuPad's toolbar CSS fills the paths of a tool button's icon,
// which would turn the outlined sticky note into a solid square.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { boot, DIGIT_BUTTON, DRAW_BUTTON, pickDraw } from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Annotation tool button icon, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p

  before(async () => {
    ;({ context, p } = await openPage(browser))
    await boot(p)
  })
  after(async () => { await context.close() })

  const fills = () => p.locator(`${DRAW_BUTTON} svg path`).evaluateAll((paths) => paths.map((path) => getComputedStyle(path).fill))

  it('every path of the icon is unfilled, with the tool not selected and selected', async () => {
    await p.click(DIGIT_BUTTON)
    const notSelected = await fills()
    assert.deepEqual(notSelected, ['none', 'none', 'none'], 'not selected')
    await pickDraw(p)
    assert.deepEqual(await fills(), ['none', 'none', 'none'], 'selected')
  })
})
