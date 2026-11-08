// Live attacks on clashes between the scripts (#590, attacks 57-61): all six are loaded on one page and each test sets two
// of them against each other, then checks the crash signals (a skip line, a page error, a console error, a notice bar)
// plus what the player expects to see.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { attack, DRAW_BUTTON, NOTES, noteCount, pickDraw, placeNote } from './attacks.mjs'
import { gridPoint, keydownDefaults, openPenTool, penEntries } from './pen.mjs'
import { settle } from './settle.mjs'
import { closeDialogWith, openExtrasEditor, openScriptDialog, openSettings } from './settings.mjs'

const DARK_STYLE = '#dark-page-style'
const BLACK = 'rgb(0, 0, 0)'
const EXTRAS_EDITOR = '#pen-tool-extras-editor'
const TEXT_EDITOR = '#draw-tool-dialog'
const CBD_EDITOR = '#color-by-digit-editor'
const LETTER_MODE_KEY = 'ToolLetter_letterMode'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

const pageColor = (p) => p.evaluate(() => window.getComputedStyle(document.body).backgroundColor)
// The page's dark stylesheet is the script: the live suite's own off switch is its media set to `not all`.
const darkPage = (p, on) => p.evaluate(([style, media]) => { document.querySelector(style).media = media }, [DARK_STYLE, on ? 'all' : 'not all'])

describe('clashes between scripts', { concurrency: 4 }, () => {
  it('57 Dark Page on and off with every script\'s panel and dialog open', () => attack(browser, {}, async (p) => {
    const SURFACES = [
      ['Pen Tool Extras panel', async () => { await openPenTool(p) }, '.pen-tool-extras-sliders', async () => {}],
      ['Text Anywhere panel', async () => { await pickDraw(p) }, '.draw-tool-sliders', async () => {}],
      ['SudokuPad settings dialog', async () => { await openSettings(p) }, '.dialog', async () => { await p.keyboard.press('Escape') }],
      ['Pen Tool Extras dialog', () => openExtrasEditor(p), EXTRAS_EDITOR, () => closeDialogWith(p, 'Cancel', EXTRAS_EDITOR)],
      ['Text Anywhere dialog', () => openScriptDialog(p, 'Text Anywhere', TEXT_EDITOR), TEXT_EDITOR, () => closeDialogWith(p, 'Cancel', TEXT_EDITOR)],
      ['Color by Digit editor', () => openScriptDialog(p, 'Color by Digit', CBD_EDITOR), CBD_EDITOR, () => closeDialogWith(p, 'Cancel', CBD_EDITOR)]
    ]
    assert.equal(await settle(() => pageColor(p), BLACK), BLACK, 'the page starts dark')
    for (const [name, open, surface, close] of SURFACES) {
      await open()
      const box = await p.locator(surface).first().boundingBox()
      assert.equal(box.width > 0, true, `${name} shows`)
      await darkPage(p, false)
      assert.notEqual(await settle(() => pageColor(p), 'rgb(255, 255, 255)'), BLACK, `${name}: Dark Page off lightens the page`)
      assert.equal(await p.locator(surface).first().isVisible(), true, `${name} shows with Dark Page off`)
      await darkPage(p, true)
      assert.equal(await settle(() => pageColor(p), BLACK), BLACK, `${name}: Dark Page on darkens the page`)
      assert.equal(await p.locator(surface).first().isVisible(), true, `${name} shows with Dark Page on`)
      assert.deepEqual(await p.locator(surface).first().boundingBox(), box, `${name} kept its place and size`)
      await close()
    }
  }))

  it('58 Pen Tool Extras\' and Text Anywhere\'s settings dialogs asked for one after the other, the first still open', () => attack(browser, {}, async (p) => {
    // The overlay covers the board and the panels, so a second dialog can only be asked for by code: the other tool's gear is clicked as a script would.
    const PAIRS = [
      ['Pen Tool Extras then Text Anywhere', DRAW_BUTTON, () => openExtrasEditor(p), EXTRAS_EDITOR, '.draw-tool-settings', TEXT_EDITOR],
      ['Text Anywhere then Pen Tool Extras', '#control-pen', () => openScriptDialog(p, 'Text Anywhere', TEXT_EDITOR), TEXT_EDITOR, '.pen-tool-extras-settings', EXTRAS_EDITOR]
    ]
    for (const [name, toolButton, openFirst, first, gear, second] of PAIRS) {
      await (toolButton === DRAW_BUTTON ? pickDraw(p) : openPenTool(p))
      await openFirst()
      await p.locator(gear).dispatchEvent('click')
      await p.locator(gear).dispatchEvent('pointerdown')
      await p.locator(gear).dispatchEvent('pointerup')
      assert.equal(await p.locator('.dialog').count(), 1, `${name}: one dialog is open`)
      assert.equal(await p.locator(first).count(), 1, `${name}: it is still the first`)
      assert.equal(await p.locator(second).count(), 0, `${name}: the second did not open on top`)
      await closeDialogWith(p, 'Cancel', first)
      assert.equal(await p.locator('.dialog-overlay').count(), 0, `${name}: Cancel left no overlay`)
      // Each still opens by itself afterwards.
      await openScriptDialog(p, second === TEXT_EDITOR ? 'Text Anywhere' : 'Pen Tool Extras', second)
      await closeDialogWith(p, 'Cancel', second)
    }
  }))

  it('59 Tab pressed while a Text Anywhere note is open, and while a settings dialog field has focus', () => attack(browser, {}, async (p) => {
    const pad = () => p.evaluate(() => [...document.querySelectorAll('.controls-buttons .digit')].map((d) => d.textContent).join(''))
    await pickDraw(p)
    await p.mouse.click(...await gridPoint(p, [2.5, 2.5]))
    await p.locator('#draw-tool-layer .draw-tool-textbox').waitFor({ state: 'attached' })
    await p.keyboard.type('ab')
    const box = '#draw-tool-layer .draw-tool-textbox'
    // The note's box takes its keys before SudokuPad's handlers, so No Tab Letters never sees this Tab; the note must be the one to keep it.
    await p.keyboard.press('Tab')
    assert.equal(await p.locator(box).count(), 1, 'the note is still open')
    assert.equal(await p.evaluate((selector) => document.activeElement.matches(selector), box), true, 'the focus stayed in the note')
    assert.equal(await p.locator(box).textContent(), 'ab', 'the note holds what was typed, with no Tab in it')
    assert.equal(await pad(), '1234567890', 'the number pad stayed on digits')
    assert.equal(await p.evaluate((key) => Framework.getData(key), LETTER_MODE_KEY), null, 'no letter mode was saved')
    await p.keyboard.type('c')
    await p.keyboard.press('Escape')
    assert.deepEqual(await settle(() => p.locator(NOTES).evaluateAll((notes) => notes.map((n) => n.textContent)), ['abc']), ['abc'], 'the note kept typing after Tab')
    // A settings dialog field: Tab moves focus, as it does in any dialog.
    await openExtrasEditor(p)
    const field = p.locator(`${EXTRAS_EDITOR} input`).first()
    await field.focus()
    // Where focus is, as its place among the dialog's fields: many swatches share one class and no id.
    const focused = () => p.evaluate((editor) => [...document.querySelector(editor).querySelectorAll('input, button, select, textarea')].indexOf(document.activeElement), EXTRAS_EDITOR)
    const before = await focused()
    assert.deepEqual(await keydownDefaults(p, 'Tab'), [false], 'Tab was not swallowed in the dialog')
    assert.equal(await focused(), before + 1, 'focus moved to the next field')
    assert.equal(await pad(), '1234567890', 'the number pad stayed on digits')
  }))

  it('60 Color by Digit\'s editor open while the pen tool is current: a drag with the pen draws nothing', () => attack(browser, {}, async (p) => {
    await openPenTool(p)
    await openScriptDialog(p, 'Color by Digit', CBD_EDITOR)
    assert.equal(await p.evaluate(() => Framework.app.tool), 'pen', 'the pen is still the tool')
    await p.mouse.move(...await gridPoint(p, [3.5, 3.5]))
    await p.mouse.down()
    await p.mouse.move(...await gridPoint(p, [3.5, 6.5]), { steps: 8 })
    await p.mouse.up()
    // A "nothing happened" check: the board gets a moment to show a line it should not have.
    await p.waitForTimeout(500)
    assert.deepEqual(await penEntries(p), [], 'the editor held off the board')
    assert.equal(await p.locator(CBD_EDITOR).count(), 1, 'the editor is still open')
    await closeDialogWith(p, 'Cancel', CBD_EDITOR)
    await p.mouse.move(...await gridPoint(p, [3.5, 3.5]))
    await p.mouse.down()
    await p.mouse.move(...await gridPoint(p, [3.5, 6.5]), { steps: 8 })
    await p.mouse.up()
    assert.equal((await settle(() => penEntries(p).then((e) => e.length > 0), true)), true, 'the pen draws once the editor is closed')
  }))

  it('61 Auto Rules Resizer\'s fit run while a Text Anywhere note sits over the rules panel', () => attack(browser, {}, async (p) => {
    const rules = () => p.evaluate(() => {
      const r = document.querySelector('.puzzle-rules')
      return { scrolls: r.scrollHeight > r.clientHeight, font: parseFloat(window.getComputedStyle(r).fontSize) }
    })
    await placeNote(p, [2.5, 2.5], 'over the rules')
    // A new note cannot be started on the controls, so the note is dragged there, as Text Anywhere allows since #581.
    const note = await p.locator(NOTES).first().boundingBox()
    const pane = await p.locator('.puzzle-rules').boundingBox()
    await p.mouse.move(note.x + note.width / 2, note.y + note.height / 2)
    await p.mouse.down()
    await p.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2, { steps: 10 })
    await p.mouse.up()
    const over = await p.locator(NOTES).first().boundingBox()
    assert.equal(over.x < pane.x + pane.width && over.x + over.width > pane.x && over.y < pane.y + pane.height && over.y + over.height > pane.y, true, 'the note sits over the rules')
    for (const size of [{ width: 1100, height: 800 }, { width: 1400, height: 1000 }, { width: 1200, height: 900 }]) {
      await p.setViewportSize(size)
      assert.equal((await settle(async () => (await rules()).scrolls, false)), false, `the rules fit at ${size.width}x${size.height}`)
      assert.equal(await noteCount(p), 1, 'the note is still there')
    }
    assert.equal((await rules()).font > 17.6, true, 'the fit grew the rules\' font')
    assert.equal(await p.locator(NOTES).first().textContent(), 'over the rules')
  }))
})
