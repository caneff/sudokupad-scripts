// Live check of pen-tool-extras.user.js's settings dialog layout on sudokupad.app in headless Chromium, at 1200x1000: the two by two grid whose vertical
// line meets the title line and the footer line, the Line settings / Line styles divider starting at the vertical line, the pen colors filling their
// column, the five sliders one column and 96px long, the marks table's headings over their boxes, the title row's icon buttons and status, the dialog
// centred in the window, one column on a narrow screen, and the button row (Save, Cancel, Restore defaults). A touch screen stays untested. Every click is real input.
/* global Framework */
import { after, afterEach, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from '../page.mjs'
import { closeExtrasEditorWith, openExtrasEditor } from '../settings.mjs'

const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const SLIDERS = ['thickness', 'opacity', 'dash', 'arrowSpacing', 'outlineWidth']
const HALF_PIXEL = 0.5

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('the settings dialog layout', { concurrency: false }, () => {
  let context, p, errors

  const editor = () => p.locator('#pen-tool-extras-editor')
  const left = (locator) => locator.evaluate((el) => Math.round(el.getBoundingClientRect().x))

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport: { width: 1200, height: 1000 } } }))
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
    await p.evaluate(() => Framework.setSetting('toolpen', true))
  })
  after(async () => { await context.close() })

  // SudokuPad slides the dialog in, so a position is read once the dialog has held still for STILL_FRAMES frames in a row.
  const STILL_FRAMES = 20
  const openSettledEditor = async (page) => {
    await openExtrasEditor(page)
    await page.waitForFunction((still) => new Promise((resolve) => {
      const at = () => JSON.stringify(document.querySelector('.dialog').getBoundingClientRect())
      let last = at()
      let held = 0
      const frame = () => {
        const now = at()
        held = now === last ? held + 1 : 0
        last = now
        if (held >= still) resolve(true)
        else window.requestAnimationFrame(frame)
      }
      window.requestAnimationFrame(frame)
    }), STILL_FRAMES)
  }
  // A failed check leaves its dialog open, which would fail every check after it for a reason that is not theirs.
  afterEach(async () => { if (await editor().count()) await closeExtrasEditorWith(p, 'Cancel') })
  const rect = (selector) => p.locator(selector).first().evaluate((el) => { const { left, right, top, bottom, width, height } = el.getBoundingClientRect(); return { left, right, top, bottom, width, height } })
  const near = (actual, expected, message) => assert.equal(Math.abs(actual - expected) <= HALF_PIXEL, true, `${message}: ${actual} vs ${expected}`)
  const cells = () => p.locator('#pen-tool-extras-editor .pen-tool-extras-cell').evaluateAll((els) => els.map((el) => { const { left, right, top, bottom } = el.getBoundingClientRect(); return { left, right, top, bottom, text: el.querySelector('.pen-tool-extras-section-title').textContent } }))

  it('the sections are a two by two grid: Pen colors | Line settings above Line styles, then Marks to cycle | Other', async () => {
    await openSettledEditor(p)
    const [colors, lines, marks, other] = await cells()
    assert.deepEqual([colors.text, lines.text, marks.text, other.text], ['Pen colors', 'Line settings', 'Marks to cycle', 'Other'])
    assert.equal(colors.right <= lines.left && marks.right <= other.left, true, 'two columns')
    assert.equal(colors.top, lines.top)
    assert.equal(marks.top, other.top)
    assert.equal(lines.bottom <= marks.top, true, 'two rows')
    const styles = await editor().locator('.pen-tool-extras-section-title', { hasText: 'Line styles' }).evaluate((el) => el.getBoundingClientRect().top)
    assert.equal(lines.top < styles && styles < lines.bottom, true, 'Line styles is under Line settings, in the same cell')
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('the vertical line runs from the title line to the footer line, and the Line settings / Line styles divider starts at it', async () => {
    await openSettledEditor(p)
    const layout = await rect('#pen-tool-extras-editor .pen-tool-extras-layout')
    const [, lines, , other] = await cells()
    const footer = await rect('.dialog-options')
    near(lines.top, layout.top, 'the vertical line starts at the title line')
    near(other.bottom, footer.top, 'the vertical line ends at the footer line')
    const divider = await rect('#pen-tool-extras-editor .pen-tool-extras-divider')
    near(divider.left, lines.left, 'the inner divider starts at the vertical line')
    // The lines themselves: a top line on every cell (the title line and the line between the rows) and a left line on the right-hand cells.
    const borders = await editor().locator('.pen-tool-extras-cell').evaluateAll((els) => els.map((el) => { const style = window.getComputedStyle(el); return { top: style.borderTopWidth, left: style.borderLeftWidth, colour: style.borderTopColor } }))
    assert.deepEqual(borders.map((b) => b.top), ['1px', '1px', '1px', '1px'], 'a top line on every cell')
    assert.deepEqual(borders.map((b) => b.left), ['0px', '1px', '0px', '1px'], 'the vertical line is the right-hand cells\' left line')
    assert.equal(borders.every((b) => b.colour === 'rgb(221, 221, 221)'), true, 'the mockup\'s #ddd')
    const footerLine = await p.locator('.dialog-options').evaluate((el) => window.getComputedStyle(el).borderTopWidth)
    assert.equal(footerLine, '1px', 'the footer has its top line')
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('the pen colors are the shared color block: nine 34px square inputs, 4px apart, with no numbers, under a pulldown as wide as the column', async () => {
    await openSettledEditor(p)
    const boxes = await editor().locator('input[data-role="swatch"]').evaluateAll((els) => els.map((el) => { const { left, right, top, width, height } = el.getBoundingClientRect(); return { left, right, top, width, height } }))
    assert.equal(boxes.length, 9)
    for (const box of boxes) { near(box.width, 34, 'width'); near(box.height, 34, 'height') }
    near(boxes[1].left - boxes[0].right, 4, 'across gap')
    near(boxes[3].top - (boxes[0].top + boxes[0].height), 4, 'down gap')
    const pulldown = await rect('#pen-tool-extras-editor select[data-role="color-choice"]')
    near(pulldown.left, boxes[0].left, 'the pulldown and the grid share their left edge')
    assert.equal(await editor().locator('.pen-tool-extras-swatches b').count(), 0)
    const lastMarksColumn = await rect('#pen-tool-extras-editor .pen-tool-extras-marks-table > :nth-child(5)')
    near(pulldown.right, lastMarksColumn.right, 'the pulldown fills the column the marks table sets, and does not widen it')
    // A select is as wide as its longest option, so the longest label a preset could have must not move the column.
    await editor().locator('select[data-role="color-choice"] option').first().evaluate((option) => { option.textContent = 'A preset name much longer than the column is wide' })
    const widened = await rect('#pen-tool-extras-editor select[data-role="color-choice"]')
    near(widened.right, lastMarksColumn.right, 'a long option leaves the pulldown at the column\'s width')
    near((await rect('#pen-tool-extras-editor .pen-tool-extras-marks-table > :nth-child(5)')).right, lastMarksColumn.right, 'and the column where it was')
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('all five sliders start at one x and are 96px long; Slider in panel sub-lines sit under Thickness and Opacity in grey #444', async () => {
    await openSettledEditor(p)
    const sliders = await Promise.all(SLIDERS.map((key) => rect(`#pen-tool-extras-editor input[data-setting="${key}"]`)))
    sliders.forEach((slider, i) => near(slider.left, sliders[0].left, `${SLIDERS[i]} left`))
    sliders.forEach((slider, i) => near(slider.width, 96, `${SLIDERS[i]} width`))
    for (const [key, next] of [['thickness', 'opacity'], ['opacity', 'dash']]) {
      const sub = editor().locator(`.pen-tool-extras-sub:has(input[data-box="show.${key}"])`)
      assert.equal((await sub.textContent()).trim(), 'Slider in panel')
      assert.equal(await sub.evaluate((el) => window.getComputedStyle(el).color), 'rgb(68, 68, 68)')
      const subTop = (await sub.boundingBox()).y
      const rowTop = (await editor().locator(`[data-row="${key}"]`).boundingBox()).y
      const nextTop = (await editor().locator(`[data-row="${next}"]`).boundingBox()).y
      assert.equal(rowTop < subTop && subTop < nextTop, true, `${key}'s sub-line is between its row and the next`)
    }
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('each line style\'s box is before its label, and Other reads White outlines and Right click erase', async () => {
    await openSettledEditor(p)
    for (const [path, text] of [['lineStyles.dashed', 'Dashed lines'], ['lineStyles.arrows', 'Directional arrow lines'], ['outline', 'White outlines'], ['eraseClicks', 'Right click erase']]) {
      const box = editor().locator(`input[data-box="${path}"]`)
      const label = editor().locator(`label[for="${await box.getAttribute('id')}"]`)
      assert.equal((await label.textContent()).trim(), text)
      assert.equal((await box.boundingBox()).x < (await label.boundingBox()).x, true, `${text}: box first`)
    }
    assert.equal(await editor().getByText('Enable', { exact: true }).count(), 0)
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('the marks table has the headings X, circle, the up-and-down arrow heads and the dot, each centred over its column of boxes 28px apart', async () => {
    await openSettledEditor(p)
    const heads = await editor().locator('.pen-tool-extras-mark-head svg').evaluateAll((els) => els.map((el) => { const { left, right } = el.getBoundingClientRect(); return { centre: (left + right) / 2, stroke: window.getComputedStyle(el).strokeWidth, colour: window.getComputedStyle(el).color } }))
    assert.equal(heads.length, 4)
    const centres = async (keys) => Promise.all(keys.map((key) => editor().locator(`input[data-box="marks.${key}"]`).evaluate((el) => { const { left, right } = el.getBoundingClientRect(); return (left + right) / 2 })))
    const edge = await centres(['x', 'circle', 'directions'])
    const corner = await centres(['cornerX', 'cornerCircle'])
    const cell = await centres(['cellCross', 'cellCircle', 'cellDot'])
    edge.forEach((centre, i) => near(heads[i].centre, centre, `heading ${i} over its Edge box`))
    near(heads[3].centre, cell[2], 'the dot heading over the Cell Dot box')
    near(corner[0], edge[0], 'Corner X under X')
    near(corner[1], edge[1], 'Corner circle under circle')
    near(cell[0], edge[0], 'Cell cross under X')
    near(cell[1], edge[1], 'Cell circle under circle')
    near(edge[1] - edge[0], 28, 'boxes 28px apart')
    near(edge[2] - edge[1], 28, 'boxes 28px apart')
    near(cell[2] - edge[2], 28, 'the dot column 28px past the directions column')
    heads.forEach((head) => { assert.equal(head.stroke, '2.6px'); assert.equal(head.colour, 'rgb(68, 68, 68)') })
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('the title row holds Copy settings and Paste settings icon buttons at its right end, level with the title, and the status message to their left', async () => {
    await openSettledEditor(p)
    const copy = p.getByRole('button', { name: 'Copy settings' })
    const paste = p.getByRole('button', { name: 'Paste settings' })
    assert.equal(await copy.getAttribute('title'), 'Copy settings')
    assert.equal(await paste.getAttribute('title'), 'Paste settings')
    assert.equal((await copy.textContent()).trim(), '')
    const title = await rect('.dialog .pen-tool-extras-title-row b')
    const buttons = [await copy.boundingBox(), await paste.boundingBox()]
    for (const button of buttons) near(button.y + button.height / 2, title.top + title.height / 2, 'level with the title')
    assert.equal(buttons[0].x < buttons[1].x, true)
    await p.evaluate(() => { document.querySelector('.dialog [data-role="settings-status"]').textContent = 'Settings copied.' })
    const status = await rect('.dialog [data-role="settings-status"]')
    assert.equal(status.right <= buttons[0].x + 1, true, 'the status is left of the icons')
    assert.equal(await p.locator('.dialog .pen-tool-extras-title-row').evaluate((row) => row.contains(document.querySelector('.dialog [data-role="settings-status"]'))), true)
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('the dialog is sized to its content and centred in the window, not over the board', async () => {
    await openSettledEditor(p)
    const dialog = await rect('.dialog')
    const layout = await rect('#pen-tool-extras-editor .pen-tool-extras-layout')
    assert.equal(dialog.width < layout.width + 100, true, `dialog ${dialog.width}px wide for ${layout.width}px of content`)
    assert.equal(Math.abs((dialog.left + dialog.right) / 2 - p.viewportSize().width / 2) <= 4, true, `centred at ${(dialog.left + dialog.right) / 2}`)
    assert.equal(dialog.left >= 0, true)
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('a long missing-color note in the first column wraps within it and leaves the column and the dialog as they were', async () => {
    await openSettledEditor(p)
    const before = { column: (await cells())[0].right, dialog: (await rect('.dialog')).width }
    await editor().locator('.pen-tool-extras-cell').first().evaluate((cell) => cell.insertAdjacentHTML('beforeend', '<div class="pen-tool-extras-note">Cell color page 2 has no usable color at the matching button, so pen colors 4, 5 and 6 keep SudokuPad\'s own and so does a very long run of further words.</div>'))
    near((await cells())[0].right, before.column, 'the first column is as wide as before')
    near((await rect('.dialog')).width, before.dialog, 'the dialog is as wide as before')
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('at a narrow window a long status message wraps beside the icons and stays clear of the title', async () => {
    await p.setViewportSize({ width: 500, height: 1000 })
    try {
      await openSettledEditor(p)
      await p.evaluate(() => { document.querySelector('.dialog [data-role="settings-status"]').textContent = 'Pasted 3 settings; skipped 2 that did not check out.' })
      const title = await rect('.dialog .pen-tool-extras-title-row b')
      const status = await rect('.dialog [data-role="settings-status"]')
      const copy = await p.getByRole('button', { name: 'Copy settings' }).boundingBox()
      assert.equal(status.left >= title.right - HALF_PIXEL, true, `the status (from ${status.left}) starts after the title (to ${title.right})`)
      assert.equal(status.right <= copy.x + HALF_PIXEL, true, 'and ends before the icons')
      assert.equal((await rect('.dialog')).right <= 500 + 1, true, 'the dialog stays on the screen')
      await closeExtrasEditorWith(p, 'Cancel')
    } finally {
      await p.setViewportSize({ width: 1200, height: 1000 })
    }
  })

  it('the dialog title\'s version is faded to 0.6', async () => {
    await openSettledEditor(p)
    assert.equal(await p.locator('.dialog small.pen-tool-extras-version').evaluate((el) => window.getComputedStyle(el).opacity), '0.6')
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('Dash length, Arrow spacing and Outline width are hidden by the stylesheet while their own box is unticked (Dash length and Arrow spacing indented under their style names)', async () => {
    await openSettledEditor(p)
    const label = (key) => editor().locator(`[data-row="${key}"] label`)
    assert.equal(await label('dash').evaluate((el) => parseFloat(window.getComputedStyle(el).paddingLeft)) > 0, true)
    assert.equal(await left(editor().locator('input[data-box="lineStyles.dashed"]')) <= await left(label('dash')), true)
    for (const [style, row] of [['lineStyles.dashed', 'dash'], ['lineStyles.arrows', 'arrowSpacing'], ['outline', 'outlineWidth']]) {
      await editor().locator(`input[data-box="${style}"]`).uncheck()
      assert.equal(await editor().locator(`[data-row="${row}"]`).isVisible(), false, `${row} hidden`)
      await editor().locator(`input[data-box="${style}"]`).check()
      assert.equal(await editor().locator(`[data-row="${row}"]`).isVisible(), true, `${row} back`)
    }
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('at 1280x720 the dialog is styled from SudokuPad\'s own elements: no class is stamped on them, the button row is flex and a ticked box shows its slider row', async () => {
    await p.setViewportSize({ width: 1280, height: 720 })
    try {
      await openSettledEditor(p)
      assert.deepEqual(await p.evaluate(() => [[...document.querySelector('.dialog').classList], [...document.querySelector('.dialog-options').classList]]), [['dialog'], ['dialog-options']])
      assert.equal(await p.locator('.dialog-options').evaluate((el) => window.getComputedStyle(el).display), 'flex')
      assert.equal(await p.locator('.dialog').evaluate((el) => el.getBoundingClientRect().width < window.innerWidth), true)
      assert.equal(await editor().locator('[data-row="dash"]').isVisible(), await editor().locator('input[data-box="lineStyles.dashed"]').isChecked())
      await closeExtrasEditorWith(p, 'Cancel')
    } finally {
      await p.setViewportSize({ width: 1200, height: 1000 })
    }
  })

  it('the buttons are one row at the bottom: Save, then Cancel, then Restore defaults, all at the right', async () => {
    await openSettledEditor(p)
    const [save, cancel, restore] = await p.evaluate(() => ['save', 'cancel', 'restore'].map((role) => { const { x, y, width, height } = document.querySelector(`.dialog-options button[data-role="${role}"]`).getBoundingClientRect(); return { x, y, width, height } }))
    assert.equal(save.x < cancel.x && cancel.x < restore.x, true)
    assert.equal(Math.abs(restore.y + restore.height / 2 - (save.y + save.height / 2)) <= 3, true, 'one row')
    const dialog = await p.locator('.dialog').boundingBox()
    assert.equal(restore.x + restore.width <= dialog.x + dialog.width, true)
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('on a screen too narrow for two columns the cells stack in one column, in order, with no vertical line', async () => {
    await p.setViewportSize({ width: 500, height: 1000 })
    try {
      await openSettledEditor(p)
      const stacked = await cells()
      assert.deepEqual(stacked.map((cell) => cell.text), ['Pen colors', 'Line settings', 'Marks to cycle', 'Other'])
      stacked.slice(1).forEach((cell, i) => assert.equal(cell.top >= stacked[i].bottom - HALF_PIXEL, true, `${cell.text} is under ${stacked[i].text}`))
      assert.equal(await editor().locator('.pen-tool-extras-cell').nth(1).evaluate((el) => window.getComputedStyle(el).borderLeftWidth), '0px')
      await closeExtrasEditorWith(p, 'Cancel')
    } finally {
      await p.setViewportSize({ width: 1200, height: 1000 })
    }
  })

  it('at a narrow window the dialog does not run off the screen sideways', async () => {
    await p.setViewportSize({ width: 500, height: 1000 })
    try {
      await openSettledEditor(p)
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
