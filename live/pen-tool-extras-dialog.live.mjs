// Live check of pen-tool-extras.user.js's settings dialog layout on sudokupad.app in headless Chromium: the sections in their
// order, the slider columns of Line settings, Line styles and the outline lining up, the Enable boxes under their heading,
// the button row (Restore defaults, Cancel, Save), and a phone-width dialog that stays inside its screen.
// Run with `npm run test:live`. It needs the network and a Playwright Chromium, so it is not part of `npm test`.
//
// The script is injected into the page after Start Puzzle, not installed through Tampermonkey, so Tampermonkey's real
// injection time and crackingthecryptic.com stay untested, and so does a touch screen. Every click is real input.
/* global Framework */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { closeExtrasEditorWith, openExtrasEditor } from './settings.mjs'

const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')
const SECTIONS = ['Pen colors', 'Line settings', 'Line styles', 'Marks a click cycles through', 'Other', 'Pen line mode']

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('the settings dialog layout', { concurrency: false }, () => {
  let context, p, errors

  const editor = () => p.locator('#pen-tool-extras-editor')
  const openEditor = () => openExtrasEditor(p)
  // The horizontal middle of an element, rounded to a pixel.
  const centreX = (locator) => locator.evaluate((el) => { const box = el.getBoundingClientRect(); return Math.round(box.x + box.width / 2) })
  const left = (locator) => locator.evaluate((el) => Math.round(el.getBoundingClientRect().x))

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport: { width: 1200, height: 1000 } } }))
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
    await p.evaluate(() => Framework.setSetting('toolpen', true))
  })
  after(async () => { await context.close() })

  it('the sections run Pen colors, Line settings, Line styles, Marks, Other, Pen line mode, each after the first under a divider line', async () => {
    await openEditor()
    const order = await editor().evaluate((el, names) => names.map((name) => el.textContent.indexOf(name)), SECTIONS)
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'in order')
    assert.equal(order.every((at) => at >= 0), true, `all present: ${order}`)
    const dividers = await editor().evaluate((el) => [...el.children].filter((child) => child.children.length === 0 && window.getComputedStyle(child).borderTopWidth === '1px').length)
    assert.equal(dividers, SECTIONS.length - 1)
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('the SudokuPad colors button looks like Cancel and sits level with the middle row of pickers', async () => {
    await openEditor()
    const button = editor().locator('button[data-sudokupad-colors]')
    const look = (locator) => locator.evaluate((el) => { const style = window.getComputedStyle(el); return { background: style.backgroundColor, radius: style.borderTopLeftRadius, align: style.textAlign } })
    assert.deepEqual(await look(button), await look(p.locator('.dialog-options button[data-role="cancel"]')))
    // Both in one read, so a dialog that is still moving into place cannot put them in different frames.
    const [middle, buttonMiddle] = await editor().evaluate((el) => [el.querySelector('input[data-pen="5"]'), el.querySelector('button[data-sudokupad-colors]')].map((e) => { const box = e.getBoundingClientRect(); return Math.round(box.y + box.height / 2) }))
    assert.equal(Math.abs(middle - buttonMiddle) <= 3, true, `middle row ${middle}, button ${buttonMiddle}`)
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('the sliders of Line settings, Line styles and the outline are in one column, and the Slider in panel, Enable and outline boxes are in another', async () => {
    await openEditor()
    const sliders = ['thickness', 'opacity', 'dash', 'arrowSpacing', 'outlineWidth'].map((key) => editor().locator(`input[data-setting="${key}"]`))
    const lefts = await Promise.all(sliders.map(left))
    assert.equal(new Set(lefts).size, 1, `slider columns ${lefts}`)
    const boxes = [editor().locator('input[data-show="thickness"]'), editor().locator('input[data-show="opacity"]'), editor().locator('input[data-style="dashed"]'), editor().locator('input[data-style="arrows"]')]
    const centres = await Promise.all(boxes.map(centreX))
    assert.equal(new Set(centres).size, 1, `box columns ${centres}`)
    const heading = (text) => editor().locator('span', { hasText: new RegExp('^' + text + '$') }).first()
    assert.equal(Math.abs((await centreX(heading('Slider in panel'))) - centres[0]) <= 2, true, 'Slider in panel is over its boxes')
    assert.equal(Math.abs((await centreX(heading('Enable'))) - centres[0]) <= 2, true, 'Enable is over its boxes')
    assert.equal(await left(editor().locator('input[data-outline]')) < lefts[0], true, 'the outline box is at the left, not in the slider column')
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('Dash length and Arrow spacing are indented under their style names, each hidden at once while its Enable box is unticked', async () => {
    await openEditor()
    const label = (key) => editor().locator(`[data-row="${key}"] label`)
    const name = (text) => editor().locator('span', { hasText: new RegExp('^' + text + '$') }).first()
    assert.equal(await label('dash').evaluate((el) => parseFloat(window.getComputedStyle(el).paddingLeft)) > 0, true)
    assert.equal(await left(name('Dashed lines')) <= await left(label('dash')), true)
    for (const [style, row] of [['dashed', 'dash'], ['arrows', 'arrowSpacing']]) {
      await editor().locator(`input[data-style="${style}"]`).uncheck()
      assert.equal(await editor().locator(`[data-row="${row}"]`).isVisible(), false, `${row} hidden`)
      await editor().locator(`input[data-style="${style}"]`).check()
      assert.equal(await editor().locator(`[data-row="${row}"]`).isVisible(), true, `${row} back`)
    }
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('the buttons are one row at the bottom: Restore defaults at the left, Cancel and Save at the right', async () => {
    await openEditor()
    const [restore, cancel, save] = await p.evaluate(() => ['restore', 'cancel', 'save'].map((role) => { const { x, y, width, height } = document.querySelector(`.dialog-options button[data-role="${role}"]`).getBoundingClientRect(); return { x, y, width, height } }))
    assert.equal(restore.x < cancel.x && cancel.x < save.x, true)
    assert.equal(Math.abs(restore.y + restore.height / 2 - (save.y + save.height / 2)) <= 3, true, 'one row')
    const dialog = await p.locator('.dialog').boundingBox()
    assert.equal(save.x + save.width <= dialog.x + dialog.width, true)
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('at a phone width the dialog does not run off the screen sideways', async () => {
    await p.setViewportSize({ width: 390, height: 800 })
    try {
      await openEditor()
      const fits = await p.evaluate(() => {
        const dialog = document.querySelector('.dialog').getBoundingClientRect()
        const editor = document.getElementById('pen-tool-extras-editor')
        const overflowing = [...editor.querySelectorAll('input, button, select, output')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        return { dialogRight: Math.round(dialog.right), width: window.innerWidth, overflowing: overflowing.map((el) => el.outerHTML.slice(0, 60)) }
      })
      assert.equal(fits.dialogRight <= fits.width + 1, true, JSON.stringify(fits))
      assert.deepEqual(fits.overflowing, [])
      await closeExtrasEditorWith(p, 'Cancel')
    } finally {
      await p.setViewportSize({ width: 1200, height: 1000 })
    }
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})
