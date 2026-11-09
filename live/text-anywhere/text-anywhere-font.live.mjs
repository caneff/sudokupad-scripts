// Live check of text-anywhere.user.js's Font setting on sudokupad.app: Fixed width and Save puts every note, the open one included, in the monospace stack, measures a selected note's box again, and a reload keeps it,
// Proportional brings back the page's font, Cancel saves nothing, and Paste settings applies the font. A pulldown in the dialog is no wider than its longest option, its arrow and its padding.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { STATUS, actButton, closeDialogWith } from '../settings.mjs'
import { useBrowser } from '../session.mjs'
import { finishNote, gridPoint } from '../board.mjs'

const { FONT_KEY, SETTINGS_BUTTON, SETTINGS_EDITOR: EDITOR, TEXTS, TEXT_BOX } = textAnywhere
const FONT = `${EDITOR} select[data-role="font-choice"]`
const PRESET = `${EDITOR} select[data-role="color-choice"]`
const CLIPBOARD = { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }
// What a browser's text measure and the rounding of a box can differ by.
const ROUNDING_PX = 2
const HANDLE = '#text-anywhere-layer .text-anywhere-resize'
// Typed out, not imported from the script (docs/adr/0001-live-tests-type-storage-keys.md); the browser writes a computed font-family with double quotes.
const FIXED_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'
const NOTES = [
  { kind: 'text', color: 4, size: 26, opacity: 100, text: 'iiiiii WWW', at: [200, 200] },
  { kind: 'text', color: 6, size: 20, opacity: 100, text: '- one\n- two', at: [200, 400] }
]

const browser = useBrowser()

describe('Text Anywhere\'s Font setting', { concurrency: false }, () => {
  let context, p, errors
  let proportional
  const familiesOn = (page) => page.evaluate((selector) => [...document.querySelectorAll(selector)].map((note) => window.getComputedStyle(note).fontFamily), TEXTS)
  const families = () => familiesOn(p)
  const reloadAndPick = async () => {
    await textAnywhere.reloadOnTextAnywhere(p)
  }
  const choose = async (value, button) => {
    await p.click(SETTINGS_BUTTON)
    await p.locator(FONT).selectOption(value)
    await closeDialogWith(p, button, EDITOR)
  }

  before(async () => {
    ;({ context, p, errors } = await textAnywhere.open(browser(), CLIPBOARD))
    await textAnywhere.forgetNotes(p)
    await textAnywhere.plantNotes(p, NOTES)
    await textAnywhere.reloadOnTextAnywhere(p)
  })
  after(async () => { await context.close() })

  it('starts Proportional: the notes are in the page\'s font and the dialog says so', async () => {
    const found = await families()
    assert.equal(found.length, 2)
    proportional = found[0]
    assert.notEqual(proportional, FIXED_STACK)
    await p.click(SETTINGS_BUTTON)
    assert.deepEqual(await p.locator(`${FONT} option`).allTextContents(), ['Proportional', 'Fixed width'])
    assert.equal(await p.locator(FONT).inputValue(), 'proportional')
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('Cancel after choosing Fixed width saves nothing and leaves the notes alone', async () => {
    await choose('fixed', 'Cancel')
    assert.equal(await p.evaluate((key) => Framework.getData(key) ?? null, FONT_KEY), null)
    assert.deepEqual(await families(), [proportional, proportional])
  })

  it('Fixed width and Save puts every note in the monospace stack, a selected note\'s box follows its new width, and a reload keeps it', async () => {
    // The handles sit on the box the script measured for the selected note, so their span moves with the note's drawn width only when that box was measured again.
    const shape = () => p.evaluate(([notes, handles]) => {
      const note = [...document.querySelectorAll(notes)].find((e) => e.textContent === 'iiiiii WWW')
      const xs = [...document.querySelectorAll(handles)].map((h) => h.getBoundingClientRect().left)
      return { width: note.getBoundingClientRect().width, span: Math.max(...xs) - Math.min(...xs) }
    }, [TEXTS, HANDLE])
    const [x, y] = await textAnywhere.noteStart(p, 'iiiiii WWW')
    await p.mouse.click(x + 4, y)
    await p.locator(HANDLE).first().waitFor()
    const before = await shape()
    await choose('fixed', 'Save')
    assert.equal(await p.evaluate((key) => Framework.getData(key), FONT_KEY), 'fixed')
    assert.deepEqual(await families(), [FIXED_STACK, FIXED_STACK])
    const after = await shape()
    assert.notEqual(Math.round(after.width), Math.round(before.width), 'the font changes the note\'s width')
    assert.equal(Math.abs((after.span - before.span) - (after.width - before.width)) <= ROUNDING_PX, true, `the handles moved ${after.span - before.span}px for a note ${after.width - before.width}px wider`)
    await reloadAndPick()
    assert.deepEqual(await families(), [FIXED_STACK, FIXED_STACK])
    await p.keyboard.press('Escape')
  })

  it('a note typed and left open is in the monospace stack too', async () => {
    await textAnywhere.pickTextAnywhere(p)
    await p.mouse.click(...await gridPoint(p, [5.5, 5.5]))
    await p.keyboard.type('x=1')
    assert.equal(await p.locator(TEXT_BOX).evaluate((e) => window.getComputedStyle(e).fontFamily), FIXED_STACK)
    await finishNote(p)
    assert.deepEqual(await families(), [FIXED_STACK, FIXED_STACK, FIXED_STACK])
  })

  it('Proportional and Save brings back the page\'s font on every note', async () => {
    await choose('proportional', 'Save')
    assert.deepEqual(await families(), [proportional, proportional, proportional])
    await reloadAndPick()
    assert.deepEqual(await families(), [proportional, proportional, proportional])
  })

  it('Paste settings in a fresh page applies the font to the dialog, the store and the notes', async () => {
    const other = await textAnywhere.open(browser(), CLIPBOARD)
    try {
      await textAnywhere.plantNotes(other.p, NOTES)
      await textAnywhere.reload(other.p)
      await textAnywhere.pickTextAnywhere(other.p)
      await other.p.evaluate((text) => navigator.clipboard.writeText(text), JSON.stringify({ [FONT_KEY]: 'fixed' }))
      await other.p.click(SETTINGS_BUTTON)
      await actButton(other.p, 'paste-settings').click()
      await other.p.locator(STATUS).filter({ hasText: 'Pasted 1 setting.' }).waitFor()
      assert.equal(await other.p.locator(FONT).inputValue(), 'fixed')
      assert.equal(await other.p.evaluate((key) => Framework.getData(key), FONT_KEY), 'fixed')
      await closeDialogWith(other.p, 'Cancel', EDITOR)
      assert.deepEqual(await familiesOn(other.p), [FIXED_STACK, FIXED_STACK])
      assert.deepEqual(other.errors, [])
    } finally {
      await other.context.close()
    }
  })

  it('each pulldown in the dialog is no wider than its longest option plus its arrow, padding and border', async () => {
    await p.click(SETTINGS_BUTTON)
    for (const selector of [FONT, PRESET]) {
      const { width, longest, extra } = await p.locator(selector).evaluate((select) => {
        const style = window.getComputedStyle(select)
        const context = document.createElement('canvas').getContext('2d')
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
        const longest = Math.max(...[...select.options].map((option) => context.measureText(option.text).width))
        const extra = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((sum, name) => sum + parseFloat(style[name]), 0)
        return { width: select.getBoundingClientRect().width, longest, extra }
      })
      assert.ok(width <= longest + extra + ROUNDING_PX, `${selector} is ${width}px wide for a longest option of ${longest}px and ${extra}px of padding`)
    }
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
