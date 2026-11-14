// Live check of Pen Tool Extras' + and - keys, which step the Thickness slider, on sudokupad.app in headless Chromium at 1280x720:
// each key (with the keypad's), a held key, the limits, Alt held, a focused field, an open dialog, a hidden slider and the pen tool being off.
// docs/research/sudokupad-pen-tool.md § + and - holds what SudokuPad's own pen tool does with them.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import * as extras from './pen-tool-extras-fixtures.mjs'
import { setInputValue } from '../input.mjs'
import { readUntil } from '../settle.mjs'
import { useBrowser } from '../session.mjs'
import { openExtrasEditor, closeExtrasEditorWith } from '../settings.mjs'
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
  const setThickness = (value) => setInputValue(p.locator(THICKNESS), value)

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

  it('a held key steps once, because the script ignores a repeat', async () => {
    await setThickness(8)
    await p.keyboard.down('Minus')
    await p.keyboard.down('Minus')
    await p.keyboard.down('Minus')
    await p.keyboard.up('Minus')
    await readUntil(slider, (v) => v === 8 - RANGE.step)
    assert.equal(await saved(), 8 - RANGE.step)
  })

  it('stops at the ends of the range, in the saved value as well as the slider', async () => {
    await setThickness(RANGE.max)
    await p.keyboard.press('Equal')
    assert.equal(await slider(), RANGE.max)
    assert.equal(await saved(), RANGE.max)
    await setThickness(RANGE.min)
    await p.keyboard.press('Minus')
    assert.equal(await slider(), RANGE.min)
    assert.equal(await saved(), RANGE.min)
  })

  // Left Alt keeps the pen tool current, so the script's own check is what refuses the key (Ctrl switches the tool, and the unit test holds that case).
  it('does nothing with Alt held', async () => {
    await setThickness(8)
    await p.keyboard.press('Alt+Minus')
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
    assert.equal(await slider(), 8)
    assert.equal(await saved(), 8)
    await p.evaluate(() => document.getElementById('thickness-keys-field').remove())
  })

  it('does nothing while a dialog is open, so a Save does not undo it', async () => {
    await setThickness(8)
    await openExtrasEditor(p)
    await p.keyboard.press('Minus')
    assert.equal(await saved(), 8)
    await closeExtrasEditorWith(p, 'Cancel')
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

  it('does nothing while the Thickness slider is hidden from the panel', async () => {
    await p.evaluate(([key, sliders]) => { Framework.setData(key, 8); Framework.setData(sliders, { thickness: false, opacity: true }) }, [THICKNESS_KEY, 'PenColor_sliders'])
    await extras.reload(p)
    await p.keyboard.press('Minus')
    assert.equal(await saved(), 8)
  })

  it('raised no page errors', () => assert.deepEqual(errors, []))
})
