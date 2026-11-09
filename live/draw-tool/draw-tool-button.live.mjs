// Live check of the Text Anywhere tool button's icon on sudokupad.app: SudokuPad's toolbar CSS fills the paths of a tool button's icon,
// which would turn the outlined sticky note into a solid square.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DIGIT_BUTTON, DRAW_BUTTON, open, pickDraw } from './draw-tool-fixtures.mjs'
import { useBrowser } from '../session.mjs'

const browser = useBrowser()

describe('Text Anywhere tool button icon, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p

  before(async () => {
    ;({ context, p } = await open(browser()))
  })
  after(async () => { await context.close() })

  const fills = () => p.locator(`${DRAW_BUTTON} svg path`).evaluateAll((paths) => paths.map((path) => window.getComputedStyle(path).fill))

  const assertUnfilled = async (state) => {
    const all = await fills()
    assert.notEqual(all.length, 0, `${state}: the icon has paths`)
    assert.deepEqual(all, all.map(() => 'none'), state)
  }

  it('every path of the icon is unfilled, with the tool not selected and selected', async () => {
    await p.click(DIGIT_BUTTON)
    await assertUnfilled('not selected')
    await pickDraw(p)
    await assertUnfilled('selected')
  })
})
