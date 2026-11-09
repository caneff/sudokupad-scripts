// Live check of draw-tool.user.js's Font setting on sudokupad.app: Fixed width and Save puts every note, the open one included, in the monospace stack and a reload keeps it,
// Proportional brings back the page's font, Cancel saves nothing, and Paste settings carries the font. A pulldown in the dialog is no wider than its longest option, its arrow and its padding.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'
import { closeDialogWith } from '../settings.mjs'

const { FONT_KEY, SETTINGS_BUTTON, SETTINGS_EDITOR: EDITOR, SETTINGS_STATUS: STATUS, TEXTS, TEXT_BOX } = draw
const FONT = `${EDITOR} select[data-role="font-choice"]`
const PRESET = `${EDITOR} select[data-role="color-choice"]`
// Typed out, not imported from the script (docs/adr/0001-live-tests-type-storage-keys.md); the browser writes a computed font-family with double quotes.
const FIXED_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'
const NOTES = [
  { kind: 'text', color: 4, size: 26, opacity: 100, text: 'A=B+5', at: [200, 200] },
  { kind: 'text', color: 6, size: 20, opacity: 100, text: '- one\n- two', at: [200, 400] }
]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s Font setting', { concurrency: false }, () => {
  let context, p, errors
  let proportional
  const families = () => p.evaluate((selector) => [...document.querySelectorAll(selector)].map((note) => window.getComputedStyle(note).fontFamily), TEXTS)
  const reloadAndPick = async () => {
    await draw.reload(p)
    await draw.pickDraw(p)
  }
  const choose = async (value, button) => {
    await p.click(SETTINGS_BUTTON)
    await p.locator(FONT).selectOption(value)
    await closeDialogWith(p, button, EDITOR)
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.plantDrawing(p, NOTES)
    await draw.reload(p)
    await draw.pickDraw(p)
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

  it('Fixed width and Save puts every note in the monospace stack, grows or shrinks each box to the new font, and a reload keeps it', async () => {
    const sizes = () => p.evaluate((selector) => [...document.querySelectorAll(selector)].map((note) => note.getBoundingClientRect().width), TEXTS)
    const before = await sizes()
    await choose('fixed', 'Save')
    assert.equal(await p.evaluate((key) => Framework.getData(key), FONT_KEY), 'fixed')
    assert.deepEqual(await families(), [FIXED_STACK, FIXED_STACK])
    assert.notDeepEqual(await sizes(), before, 'the notes are measured again in the new font')
    await reloadAndPick()
    assert.deepEqual(await families(), [FIXED_STACK, FIXED_STACK])
  })

  it('a note typed and left open is in the monospace stack too', async () => {
    await draw.pickDraw(p)
    await p.mouse.click(...await gridPoint(p, [5.5, 5.5]))
    await p.keyboard.type('x=1')
    assert.equal(await p.locator(TEXT_BOX).evaluate((e) => window.getComputedStyle(e).fontFamily), FIXED_STACK)
    await draw.finishNote(p)
    assert.deepEqual(await families(), [FIXED_STACK, FIXED_STACK, FIXED_STACK])
  })

  it('Proportional and Save brings back the page\'s font on every note', async () => {
    await choose('proportional', 'Save')
    assert.deepEqual(await families(), [proportional, proportional, proportional])
    await reloadAndPick()
    assert.deepEqual(await families(), [proportional, proportional, proportional])
  })

  it('Copy settings carries the font and Paste settings in a fresh page applies it', async () => {
    await choose('fixed', 'Save')
    await p.click(SETTINGS_BUTTON)
    await p.locator('.dialog button[data-act="copy-settings"]').click()
    await p.locator(STATUS).filter({ hasText: 'Settings copied.' }).waitFor()
    const copied = JSON.parse(await p.evaluate(() => navigator.clipboard.readText()))
    assert.equal(copied[FONT_KEY], 'fixed')
    await closeDialogWith(p, 'Cancel', EDITOR)
    const other = await openPage(browser, { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } })
    try {
      await draw.boot(other.p)
      await draw.plantDrawing(other.p, NOTES)
      await draw.reload(other.p)
      await draw.pickDraw(other.p)
      await other.p.evaluate((text) => navigator.clipboard.writeText(text), JSON.stringify({ [FONT_KEY]: 'fixed' }))
      await other.p.click(SETTINGS_BUTTON)
      await other.p.locator('.dialog button[data-act="paste-settings"]').click()
      await other.p.locator(STATUS).filter({ hasText: 'Pasted 1 setting.' }).waitFor()
      assert.equal(await other.p.locator(FONT).inputValue(), 'fixed')
      assert.equal(await other.p.evaluate((key) => Framework.getData(key), FONT_KEY), 'fixed')
      await closeDialogWith(other.p, 'Cancel', EDITOR)
      const found = await other.p.evaluate((selector) => [...document.querySelectorAll(selector)].map((note) => window.getComputedStyle(note).fontFamily), TEXTS)
      assert.deepEqual(found, [FIXED_STACK, FIXED_STACK])
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
      assert.equal(width <= longest + extra + 2, true, `${selector} is ${width}px wide for a longest option of ${longest}px and ${extra}px of padding`)
    }
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
