// Live check of the ways out of Text Anywhere's color edit mode (lib/color-picker.js, shared with Pen Tool Extras), on sudokupad.app: Escape, a press outside
// the panel (which does nothing else), left Alt held, and the window losing focus; a press on another color button stays in it.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { settle } from '../settle.mjs'
import { useBrowser } from '../session.mjs'
import { gridPoint } from '../board.mjs'

const { KEYPAD, PICKER, TEXTS, TEXT_BOX } = textAnywhere
const EDITING = '.tool-textanywhere.text-anywhere-editing'

const browser = useBrowser()

describe('leaving Text Anywhere\'s color edit mode', { concurrency: false }, () => {
  let context, p
  const pickerCount = () => p.locator(PICKER).count()
  const editModeOn = () => p.locator(EDITING).count()
  const enter = () => textAnywhere.holdForPickers(p, `${KEYPAD} button[data-key="4"]`, 'left', 'visible')

  before(async () => {
    ;({ context, p } = await textAnywhere.open(browser()))
    await textAnywhere.pickTextAnywhere(p)
    await p.locator(textAnywhere.SLIDERS).waitFor({ state: 'visible' })
  })
  after(async () => { await context.close() })

  it('Escape ends it', async () => {
    await enter()
    assert.equal(await pickerCount(), 9)
    await p.keyboard.press('Escape')
    assert.equal(await settle(editModeOn, 0), 0)
    assert.equal(await pickerCount(), 0)
  })

  it('a press on the board ends it and opens no note box', async () => {
    await enter()
    const selected = () => p.evaluate(() => Framework.app.puzzle.selectedCells.map((c) => `${c.row},${c.col}`))
    const selectedBefore = await selected()
    await p.mouse.click(...await gridPoint(p, [3.5, 3.5]))
    assert.equal(await settle(editModeOn, 0), 0)
    assert.equal(await pickerCount(), 0)
    assert.equal(await p.locator(TEXT_BOX).count(), 0)
    assert.deepEqual(await textAnywhere.texts(p), [])
    assert.equal(await p.locator(TEXTS).count(), 0)
    assert.deepEqual(await selected(), selectedBefore)
  })

  it('a press on another color button in the panel keeps it', async () => {
    await enter()
    const box = await p.locator(`${KEYPAD} button[data-key="5"]`).boundingBox()
    await p.mouse.click(...textAnywhere.middleOf(box))
    assert.equal(await editModeOn(), 1)
    assert.equal(await pickerCount(), 9)
    // The press landed on a native color input, whose popup takes the keyboard, so the way out is the window losing focus.
    await p.evaluate(() => window.dispatchEvent(new window.Event('blur')))
    assert.equal(await settle(editModeOn, 0), 0)
  })

  it('left Alt held with Text Anywhere current is edit mode, and its release ends it', async () => {
    await p.keyboard.down('Alt')
    assert.equal(await settle(pickerCount, 9), 9)
    await p.keyboard.up('Alt')
    assert.equal(await settle(pickerCount, 0), 0)
    assert.equal(await editModeOn(), 0)
  })

  it('the window losing focus ends it', async () => {
    await enter()
    // The headless page has no window to take focus away from, so the event SudokuPad's own edit mode listens for is dispatched.
    await p.evaluate(() => window.dispatchEvent(new window.Event('blur')))
    assert.equal(await settle(editModeOn, 0), 0)
    assert.equal(await pickerCount(), 0)
  })
})
