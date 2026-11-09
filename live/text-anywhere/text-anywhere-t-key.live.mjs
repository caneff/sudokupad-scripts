// Live check of draw-tool.user.js's T key on sudokupad.app: it makes Text Anywhere current from the normal tool, and does nothing where T is typed
// (the Letter tool, an open note, an open dialog and a field in it) or once Text Anywhere is current. SudokuPad's Z X C V keys keep their tools. Real keyboard input.
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { settle } from '../settle.mjs'
import { closeDialogWith, openScriptDialog } from '../settings.mjs'
import { useBrowser } from '../session.mjs'
import { clickAt, gridPoint } from '../board.mjs'

const { DIGIT_BUTTON, SETTINGS_EDITOR, TEXT_BOX, tool } = textAnywhere
const A = [1.5, 1.5]
const MAIN = '.controls-main'

const browser = useBrowser()

describe('Text Anywhere\'s T key', { concurrency: false }, () => {
  let context, p, errors

  const selectCell = async () => p.mouse.click(...await gridPoint(p, A))
  const cellText = () => p.evaluate(() => String(Framework.app.grid.getCell(1, 1).value || ''))

  before(async () => {
    ;({ context, p, errors } = await textAnywhere.open(browser()))
  })
  after(async () => { await context.close() })
  beforeEach(async () => {
    await textAnywhere.forgetNotes(p)
    await textAnywhere.reload(p)
    await p.click(DIGIT_BUTTON)
    await settle(() => tool(p), 'normal')
  })

  it('with the normal tool current, T (and Shift+T) makes Text Anywhere current, and a second T leaves it so', async () => {
    await p.keyboard.press('t')
    assert.equal(await settle(() => tool(p), 'textanywhere'), 'textanywhere')
    assert.equal(await p.locator(`${MAIN}.tool-textanywhere`).count(), 1)
    await p.keyboard.press('t')
    assert.equal(await tool(p), 'textanywhere', 'no toggle back')
    await p.click(DIGIT_BUTTON)
    await settle(() => tool(p), 'normal')
    await p.keyboard.press('Shift+T')
    assert.equal(await settle(() => tool(p), 'textanywhere'), 'textanywhere')
  })

  it('with focus in a field and no dialog open, T types into the field and the tool stays', async () => {
    await p.evaluate(() => {
      const input = document.createElement('input')
      input.id = 'live-t-page-field'
      document.body.appendChild(input)
      input.focus()
    })
    await p.keyboard.press('t')
    assert.equal(await p.locator('#live-t-page-field').inputValue(), 't')
    assert.equal(await tool(p), 'normal')
    await p.evaluate(() => document.getElementById('live-t-page-field').remove())
  })

  it('Ctrl+T and Alt+T leave the tool alone', async () => {
    for (const chord of ['Control+t', 'Alt+t']) {
      await p.keyboard.press(chord)
      assert.equal(await tool(p), 'normal', chord)
    }
  })

  it('with the Letter tool current and a cell selected, T enters the letter and Letter mode stays on', async () => {
    // Enable Letter Tool, switched on after the page and the script are in, as a player does.
    await p.evaluate(() => Framework.setSetting('toolletter', true))
    await p.click('button[data-control="toggleletter"]')
    await p.locator(`${MAIN}.input-letter`).waitFor()
    await selectCell()
    await p.keyboard.press('t')
    assert.equal(await tool(p), 'normal')
    assert.equal(await p.locator(`${MAIN}.input-letter`).count(), 1, 'Letter mode is still on')
    assert.equal(await cellText(), 't')
  })

  it('with a note open T types "t" into it, and the tool stays Text Anywhere', async () => {
    await textAnywhere.pickTextAnywhere(p)
    await clickAt(p, A)
    await p.keyboard.press('t')
    assert.equal(await p.locator(TEXT_BOX).textContent(), 't')
    assert.equal(await tool(p), 'textanywhere')
  })

  it('with the settings dialog open T neither switches the tool nor stops typing into a field in it', async () => {
    await openScriptDialog(p, 'Text Anywhere', SETTINGS_EDITOR)
    await p.keyboard.press('t')
    assert.equal(await tool(p), 'normal', 'focus on the page')
    await p.evaluate((sel) => {
      const input = document.createElement('input')
      input.id = 'live-t-field'
      document.querySelector(sel).appendChild(input)
      input.focus()
    }, SETTINGS_EDITOR)
    await p.keyboard.press('t')
    assert.equal(await p.locator('#live-t-field').inputValue(), 't')
    assert.equal(await tool(p), 'normal', 'focus in a field')
    await closeDialogWith(p, 'Cancel', SETTINGS_EDITOR)
  })

  it('Z X C V still select SudokuPad\'s tools', async () => {
    const names = await p.evaluate(() => Framework.app.getToolNames())
    assert.deepEqual(names.slice(0, 4), ['normal', 'corner', 'centre', 'colour'])
    // Z is the first tool's key, so from another tool it returns to normal; X C V take the next three.
    for (const [key, expected] of [['x', 'corner'], ['c', 'centre'], ['v', 'colour'], ['z', 'normal']]) {
      await p.keyboard.press(key)
      assert.equal(await settle(() => tool(p), expected), expected, key)
    }
    assert.deepEqual(errors, [])
  })
})
