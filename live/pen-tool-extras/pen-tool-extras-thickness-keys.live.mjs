// Live check of Pen Tool Extras' + and - keys, which step the Thickness slider, on sudokupad.app in headless Chromium at 1280x720:
// each key (with the keypad's), a held key, the limits, a focused field and the pen tool being off.
// docs/research/sudokupad-pen-tool.md § + and - holds what SudokuPad's own pen tool does with them.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import * as extras from './pen-tool-extras-fixtures.mjs'
import { readUntil } from '../settle.mjs'
import { useBrowser } from '../session.mjs'
import { slideTo } from '../slider.mjs'

const THICKNESS = '#pen-tool-extras-thickness'
const THICKNESS_KEY = 'PenColor_thickness'
const { THICKNESS: RANGE } = extras.scriptExports

const browser = useBrowser()

describe('Pen Tool Extras\' + and - keys step Thickness', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ;({ context, p, errors } = await extras.open(browser(), { contextOptions: { viewport: { width: 1280, height: 720 } } }))
    await p.locator(THICKNESS).waitFor({ state: 'visible' })
  })
  after(async () => { await context.close() })

  const slider = () => p.evaluate((s) => Number(document.querySelector(s).value), THICKNESS)
  const saved = () => p.evaluate((key) => Framework.getData(key), THICKNESS_KEY)
  const undoDepth = () => p.evaluate(() => Framework.app.puzzle.undoStack.length)
  const setThickness = (value) => p.evaluate(([s, v]) => { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })) }, [THICKNESS, value])

  it('+, = and the keypad\'s + step the slider up, - and the keypad\'s - down, each by one step, and the step is saved and not an undo step', async () => {
    await setThickness(8)
    const undo = await undoDepth()
    let expected = 8
    for (const [key, direction] of [['Shift+Equal', 1], ['Equal', 1], ['NumpadAdd', 1], ['Minus', -1], ['NumpadSubtract', -1]]) {
      await p.keyboard.press(key)
      expected += direction * RANGE.step
      await readUntil(slider, (v) => v === expected)
      assert.equal(await saved(), expected, `${key} is saved as a slider move is`)
    }
    assert.equal(await undoDepth(), undo, 'no undo step')
  })

  it('a held key steps once, as SudokuPad passes on no repeat', async () => {
    await setThickness(8)
    await p.keyboard.down('Minus')
    await p.keyboard.down('Minus')
    await p.keyboard.down('Minus')
    await p.keyboard.up('Minus')
    await readUntil(slider, (v) => v === 8 - RANGE.step)
    assert.equal(await saved(), 8 - RANGE.step)
  })

  it('stops at the ends of the range', async () => {
    await setThickness(RANGE.max)
    await p.keyboard.press('Equal')
    await p.keyboard.press('Equal')
    assert.equal(await slider(), RANGE.max)
    await setThickness(RANGE.min)
    await p.keyboard.press('Minus')
    assert.equal(await slider(), RANGE.min)
  })

  it('does nothing with Ctrl held, which is the browser\'s zoom', async () => {
    await setThickness(8)
    await p.keyboard.press('Control+Minus')
    assert.equal(await slider(), 8)
    assert.equal(await saved(), 8)
  })

  it('does nothing while a field has focus', async () => {
    await setThickness(8)
    await p.evaluate(() => {
      const field = document.createElement('input')
      field.id = 'thickness-keys-field'
      document.body.append(field)
      field.focus()
    })
    await p.keyboard.press('Minus')
    await p.keyboard.press('Equal')
    assert.equal(await slider(), 8)
    assert.equal(await saved(), 8)
    await p.evaluate(() => document.getElementById('thickness-keys-field').remove())
  })

  it('steps from the value a mouse move on the slider left', async () => {
    await slideTo(p, THICKNESS, 12)
    await readUntil(slider, (v) => v === 12)
    await p.keyboard.press('Minus')
    await readUntil(slider, (v) => v === 12 - RANGE.step)
    assert.equal(await saved(), 12 - RANGE.step)
  })

  it('does nothing when the pen tool is not the tool', async () => {
    await setThickness(8)
    await p.evaluate(() => Framework.app.changeTool('normal'))
    await p.keyboard.press('Minus')
    assert.equal(await saved(), 8)
    assert.equal(await p.evaluate(() => Framework.app.tool), 'normal')
  })

  it('raised no page errors', () => assert.deepEqual(errors, []))
})
