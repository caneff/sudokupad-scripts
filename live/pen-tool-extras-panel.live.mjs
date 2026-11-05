// Live check of pen-tool-extras.user.js's thickness and opacity sliders in the pen tool's panel, of the
// hidden line mode pulldown whose choice moved to the dialog, and of the opacity of the pen layer, on
// sudokupad.app in headless Chromium. A touch screen stays untested.
// Every slider move is a real mouse drag.
/* global Framework, ToolPen */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { dialogButton, effectiveOpacities, openExtrasEditor } from './settings.mjs'
import { draw, openPenTool, penValuesNoColor, setSlider } from './pen.mjs'
import { settle } from './settle.mjs'

const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')

const THICKNESS_KEY = 'PenColor_thickness'
const SLIDERS_KEY = 'PenColor_sliders'
const OPACITY_KEY = 'PenColor_opacity'
const LINE_MODE_KEY = 'ToolPen_linemode'
const THICKNESS = '#pen-tool-extras-thickness'
const OPACITY = '#pen-tool-extras-opacity'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const saved = (key) => read((k) => Framework.getData(k), key)
  const editor = () => p.locator('#pen-tool-extras-editor')
  const sliderValue = (selector) => p.locator(selector).inputValue()
  const undoDepth = () => read(() => Framework.app.puzzle.undoStack.length)
  const strokeCount = () => read(() => document.querySelectorAll('.cell-pen').length)
  const activeElementTag = () => read(() => document.activeElement.tagName)
  const lineWidth = () => read(() => parseFloat(window.getComputedStyle(document.querySelector('.cell-pen.pencolor-1')).strokeWidth))
  const effectiveOpacity = async (selector) => (await effectiveOpacities(p, selector))[0]
  const lineOpacity = () => effectiveOpacity('.cell-pen.pencolor-1')
  const strokeOwnOpacity = () => read(() => parseFloat(window.getComputedStyle(document.querySelector('.cell-pen.pencolor-1')).opacity))

  const dragSlider = async (selector, toX) => {
    const box = await p.locator(selector).boundingBox()
    const y = box.y + box.height / 2
    await p.mouse.move(box.x + box.width / 2, y)
    await p.mouse.down()
    await p.mouse.move(toX, y, { steps: 12 })
    await p.mouse.up()
  }
  // A drag to the far left ends over the grid, which a stroke drawn there would show up in.
  const GRID_X = 300
  const dragToMax = async (selector) => dragSlider(selector, (await p.locator(selector).boundingBox()).x + 400)

  const boot = async () => {
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
    // The pen tool is off until its own setting turns it on.
    await read(() => Framework.setSetting('toolpen', true))
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await openPenTool(p)
  }
  const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await boot()
    await read(([a, b]) => { Framework.removeData(a); Framework.removeData(b) }, [THICKNESS_KEY, OPACITY_KEY])
    await draw(p, 8)
  })
  after(async () => {
    await read(([a, b]) => { Framework.removeData(a); Framework.removeData(b) }, [THICKNESS_KEY, OPACITY_KEY])
    await context.close()
  })

  it('with the pen tool on, Thickness is above Opacity in the pad\'s last row beside the page button, at SudokuPad\'s own 5 and 0.8, with no pad growth', async () => {
    const [thickness, opacity, row, page, input] = await Promise.all([THICKNESS, OPACITY, '.pen-tool-extras-sliders', '.pen-tool-extras-page', '.tool-pen .controls-input'].map((s) => p.locator(s).boundingBox()))
    assert.equal(thickness.y < opacity.y, true, 'Thickness above Opacity')
    assert.deepEqual(await p.locator(THICKNESS).evaluate((el) => [el.min, el.max, el.step, el.value]), ['1', '16', '1', '5'])
    assert.deepEqual(await p.locator(OPACITY).evaluate((el) => [el.min, el.max, el.step, el.value]), ['20', '100', '5', '80'])
    assert.equal(await lineWidth(), 5)
    assert.equal(await lineOpacity(), 0.8)
    // The sliders fill the row left of the page button, which is one square button at the row's right end.
    assert.equal(row.x + row.width <= page.x, true, JSON.stringify({ row, page }))
    assert.equal(page.x + page.width <= input.x + input.width + 1, true, JSON.stringify({ page, input }))
    assert.equal(Math.abs(page.width - page.height) <= 2, true, `page button ${page.width} x ${page.height}`)
    const lastKeyRow = await p.locator('.tool-pen button[data-key="9"]').boundingBox()
    assert.equal(row.y >= lastKeyRow.y + lastKeyRow.height && page.y >= lastKeyRow.y + lastKeyRow.height, true, 'both are below the digit rows')
    // The pad is no taller with the sliders than without.
    const height = () => p.locator('.controls-buttons').evaluate((el) => el.getBoundingClientRect().height)
    const withSliders = await height()
    await p.locator('.pen-tool-extras-sliders').evaluate((el) => { el.style.display = 'none' })
    assert.equal(await height(), withSliders)
    await p.locator('.pen-tool-extras-sliders').evaluate((el) => { el.style.display = '' })
  })

  it('SudokuPad\'s line mode pulldown is hidden, and the dialog holds the choice: Cancel leaves the mode, Save sets and saves it, and a slider move leaves it alone', async () => {
    assert.equal(await p.locator('.penlinemode').isVisible(), false)
    const before = await read(() => ToolPen.tool.lineMode)
    await openExtrasEditor(p)
    const select = editor().locator('select[data-line-mode]')
    assert.deepEqual(await select.locator('option').evaluateAll((os) => os.map((o) => [o.value, o.textContent])), [['both', 'Center & Edge'], ['centeronly', 'Center only'], ['edgeonly', 'Edge only']])
    await select.selectOption('edgeonly')
    await dialogButton(p, 'Cancel').click()
    assert.equal(await read(() => ToolPen.tool.lineMode), before)
    await openExtrasEditor(p)
    await editor().locator('select[data-line-mode]').selectOption('edgeonly')
    await dialogButton(p, 'Save').click()
    assert.equal(await read(() => ToolPen.tool.lineMode), 'edgeonly')
    assert.equal(await saved(LINE_MODE_KEY), 'edgeonly')
    assert.equal(await p.locator('.penlinemode select').inputValue(), 'edgeonly')
    await dragToMax(THICKNESS)
    assert.equal(await read(() => ToolPen.tool.lineMode), 'edgeonly')
    assert.equal(await saved(LINE_MODE_KEY), 'edgeonly')
    await openExtrasEditor(p)
    assert.equal(await editor().locator('select[data-line-mode]').inputValue(), 'edgeonly')
    await editor().locator('select[data-line-mode]').selectOption('both')
    await dialogButton(p, 'Save').click()
    assert.equal(await read(() => ToolPen.tool.lineMode), 'both')
  })

  it('the dialog shows the saved line mode while SudokuPad\'s pen tool still holds its default, and a change to the default saves', async () => {
    await read((k) => Framework.setData(k, 'edgeonly'), LINE_MODE_KEY)
    // Before SudokuPad's pen tool first opens it holds 'both' and reads the saved mode only on entry.
    await read(() => { ToolPen.tool.lineMode = 'both' })
    await openExtrasEditor(p)
    assert.equal(await editor().locator('select[data-line-mode]').inputValue(), 'edgeonly')
    await editor().locator('select[data-line-mode]').selectOption('both')
    await dialogButton(p, 'Save').click()
    assert.equal(await saved(LINE_MODE_KEY), 'both')
    assert.equal(await read(() => ToolPen.tool.lineMode), 'both')
  })

  it('a real drag on Thickness changes the line\'s computed width and saves at once, with no Save', async () => {
    await read((k) => Framework.removeData(k), THICKNESS_KEY)
    await openPenTool(p)
    await dragToMax(THICKNESS)
    assert.equal(await sliderValue(THICKNESS), '16')
    assert.equal(await settle(lineWidth, 16), 16)
    assert.equal(await saved(THICKNESS_KEY), 16)
    await dragSlider(THICKNESS, GRID_X)
    assert.equal(await sliderValue(THICKNESS), '1')
    assert.equal(await settle(lineWidth, 1), 1)
    assert.equal(await saved(THICKNESS_KEY), 1)
  })

  it('a real drag on Opacity changes the line\'s computed opacity and saves at once, with no Save', async () => {
    await read((k) => Framework.removeData(k), OPACITY_KEY)
    await openPenTool(p)
    await dragSlider(OPACITY, GRID_X)
    assert.equal(await sliderValue(OPACITY), '20')
    assert.equal(await settle(lineOpacity, 0.2), 0.2)
    assert.equal(await strokeOwnOpacity(), 1)
    assert.equal(await saved(OPACITY_KEY), 20)
    await dragToMax(OPACITY)
    assert.equal(await sliderValue(OPACITY), '100')
    assert.equal(await settle(lineOpacity, 1), 1)
    assert.equal(await saved(OPACITY_KEY), 100)
  })

  it('the drag highlight and the erase highlight keep their own opacity at both ends of the Opacity slider, and a finished stroke shows the slider\'s value', async () => {
    // A press exactly on an existing stroke starts no drag in SudokuPad, so the erase drag starts `offset` px off the line.
    const dragFrom = async (row, release, offset = 0) => {
      const [x, y] = await read((row) => {
        const box = Framework.app.puzzle.cells.find((c) => c.row === row && c.col === 4).elem.getBoundingClientRect()
        return [box.x + box.width / 2, box.y + box.height / 2]
      }, row)
      await p.mouse.move(x, y + offset)
      await p.mouse.down()
      await p.mouse.move(x + 110, y + 10 + offset, { steps: 6 })
      if (release) await p.mouse.up()
    }
    for (const [slider, percent] of [['20', 0.2], ['100', 1]]) {
      await setSlider(p, OPACITY, slider)
      assert.equal(await settle(lineOpacity, percent), percent)
      // A drag over empty cells: the highlight in the pen color, 0.6 as SudokuPad's own rule gives it.
      await dragFrom(6, false)
      assert.equal(await effectiveOpacity('.penhint'), 0.6, `drag highlight at ${slider}`)
      await p.mouse.up()
      await p.mouse.move(5, 5)
      // A drag over the line drawn in the same cells: SudokuPad's erase highlight, 0.5.
      await dragFrom(6, false, 12)
      assert.equal(await read(() => document.querySelector('.penhint').classList.contains('pencolor-erase')), true, 'erase mode')
      assert.equal(await effectiveOpacity('.penhint'), 0.5, `erase highlight at ${slider}`)
      await p.mouse.up()
    }
    await setSlider(p, OPACITY, 80)
  })

  it('a slider drag adds nothing to the undo stack or the replay, draws no pen stroke and leaves every pen mark as it was', async () => {
    const before = { depth: await undoDepth(), strokes: await strokeCount(), pen: await penValuesNoColor(p), replay: await read(() => Framework.app.getReplay()) }
    // Both drags end over the grid, so a stroke drawn by the slider's pointer events would show.
    await dragSlider(THICKNESS, GRID_X)
    await dragSlider(OPACITY, GRID_X)
    await dragToMax(THICKNESS)
    await dragToMax(OPACITY)
    assert.equal(await undoDepth(), before.depth)
    assert.equal(await strokeCount(), before.strokes)
    assert.deepEqual(await penValuesNoColor(p), before.pen)
    assert.equal(await read(() => Framework.app.getReplay()), before.replay)
  })

  it('focus stays with play: right after a drag on either slider nothing is focused', async () => {
    // The page's own key handling keeps arrow keys from a focused slider, so the focus itself is what is checked.
    await dragSlider(THICKNESS, GRID_X)
    assert.equal(await activeElementTag(), 'BODY')
    await dragSlider(OPACITY, GRID_X)
    assert.equal(await activeElementTag(), 'BODY')
  })

  it('the saved values survive a reload and show on the sliders and the marks', async () => {
    await dragToMax(THICKNESS)
    await dragToMax(OPACITY)
    assert.equal(await saved(THICKNESS_KEY), 16)
    assert.equal(await saved(OPACITY_KEY), 100)
    await reload()
    assert.equal(await sliderValue(THICKNESS), '16')
    assert.equal(await sliderValue(OPACITY), '100')
    await draw(p, 7)
    assert.equal(await settle(lineWidth, 16), 16)
    assert.equal(await settle(lineOpacity, 1), 1)
  })

  it('the sliders exist only with the pen tool: another tool takes them away and the pen brings them back with the saved values', async () => {
    await p.click('#control-normal')
    await p.locator('.pen-tool-extras-sliders').waitFor({ state: 'detached' })
    assert.equal(await p.locator(THICKNESS).count(), 0)
    assert.equal(await p.locator(OPACITY).count(), 0)
    await openPenTool(p)
    await p.locator('.pen-tool-extras-sliders').waitFor({ state: 'visible' })
    assert.equal(await p.locator('.pen-tool-extras-sliders').count(), 1)
    assert.equal(await sliderValue(THICKNESS), '16')
    assert.equal(await sliderValue(OPACITY), '100')
  })

  it('the dialog holds both sliders at the values the panel shows, a change takes effect on Save and Cancel leaves it, and the panel\'s own sliders still save at once', async () => {
    await openExtrasEditor(p)
    const dialogRange = (key) => editor().locator(`input[type=range][data-setting="${key}"]`)
    assert.deepEqual(await Promise.all(['thickness', 'opacity'].map((k) => dialogRange(k).inputValue())), [await sliderValue(THICKNESS), await sliderValue(OPACITY)])
    assert.deepEqual(await dialogRange('thickness').evaluate((el) => [el.min, el.max, el.step]), ['1', '16', '1'])
    await dialogRange('thickness').fill('9')
    await dialogRange('opacity').fill('40')
    assert.equal(await sliderValue(THICKNESS), '16', 'a dialog slider moves nothing before Save')
    assert.equal(await settle(lineWidth, 16), 16)
    await dialogButton(p, 'Cancel').click()
    await editor().waitFor({ state: 'detached' })
    assert.equal(await sliderValue(THICKNESS), '16')
    assert.equal(await saved(THICKNESS_KEY), 16)
    assert.equal(await lineOpacity(), 1)
    await openExtrasEditor(p)
    assert.equal(await dialogRange('thickness').inputValue(), '16', 'Cancel left the value as it was')
    await dialogRange('thickness').fill('9')
    await dialogRange('opacity').fill('40')
    await dialogButton(p, 'Save').click()
    await editor().waitFor({ state: 'detached' })
    assert.equal(await settle(lineWidth, 9), 9)
    assert.equal(await settle(lineOpacity, 0.4), 0.4)
    assert.equal(await sliderValue(THICKNESS), '9')
    assert.equal(await sliderValue(OPACITY), '40')
    assert.equal(await saved(THICKNESS_KEY), 9)
    assert.equal(await saved(OPACITY_KEY), 40)
    await dragToMax(THICKNESS)
    assert.equal(await saved(THICKNESS_KEY), 16)
    await openExtrasEditor(p)
    assert.equal(await dialogRange('thickness').inputValue(), '16', 'the dialog opens at the value the panel saved')
    await dialogButton(p, 'Cancel').click()
    await editor().waitFor({ state: 'detached' })
  })

  it('the slider boxes are ticked by default, and a slider hidden in the dialog still applies: Save takes it out of the panel, Cancel leaves the panel, the other slider keeps its place, and both hidden leave no gap', async () => {
    await read((k) => Framework.removeData(k), SLIDERS_KEY)
    await openExtrasEditor(p)
    const show = (key) => editor().locator(`input[data-show="${key}"]`)
    assert.equal(await show('thickness').isChecked(), true)
    assert.equal(await show('opacity').isChecked(), true)
    const slidersBox = () => p.locator('.pen-tool-extras-sliders').boundingBox()
    const rowOf = (selector) => p.locator(selector).boundingBox()
    const bothAt = { thickness: await rowOf(THICKNESS), opacity: await rowOf(OPACITY), sliders: await slidersBox() }
    const pageButton = await p.locator('.pen-tool-extras-page').boundingBox()
    await show('thickness').uncheck()
    await dialogButton(p, 'Cancel').click()
    await editor().waitFor({ state: 'detached' })
    assert.equal(await p.locator(THICKNESS).count(), 1, 'Cancel leaves the panel as it was')
    assert.equal(await saved(SLIDERS_KEY), null)
    // Hide the thickness slider: the opacity slider keeps its place and the thickness one still applies to the marks.
    await openExtrasEditor(p)
    await show('thickness').uncheck()
    await dialogButton(p, 'Save').click()
    await editor().waitFor({ state: 'detached' })
    await p.locator(THICKNESS).waitFor({ state: 'detached' })
    assert.deepEqual(await rowOf(OPACITY), bothAt.opacity)
    assert.deepEqual(await slidersBox(), bothAt.sliders)
    assert.deepEqual(await p.locator('.pen-tool-extras-page').boundingBox(), pageButton)
    assert.equal(await lineWidth(), 16, 'a hidden slider\'s value still applies')
    assert.deepEqual(await read((k) => Framework.getData(k), SLIDERS_KEY), { thickness: false, opacity: true })
    // Hide the opacity slider too: no block, no gap, and the page button stays put.
    await openExtrasEditor(p)
    await show('opacity').uncheck()
    await dialogButton(p, 'Save').click()
    await editor().waitFor({ state: 'detached' })
    await p.locator('.pen-tool-extras-sliders').waitFor({ state: 'detached' })
    assert.deepEqual(await p.locator('.pen-tool-extras-page').boundingBox(), pageButton)
    assert.equal(await p.locator('.pen-tool-extras-page').isVisible(), true)
    assert.equal(await lineOpacity(), 0.4, 'a hidden slider\'s value still applies')
    const height = () => p.locator('.controls-buttons').evaluate((el) => el.getBoundingClientRect().height)
    assert.equal(await height() > 0, true)
    // Only the opacity slider hidden: the thickness one is back where it was.
    await openExtrasEditor(p)
    await show('thickness').check()
    await dialogButton(p, 'Save').click()
    await editor().waitFor({ state: 'detached' })
    await p.locator(THICKNESS).waitFor({ state: 'visible' })
    assert.deepEqual(await rowOf(THICKNESS), bothAt.thickness)
    assert.deepEqual(await p.locator('.pen-tool-extras-sliders').boundingBox(), bothAt.sliders)
    // The hidden state survives a reload, then Restore defaults ticks both boxes and Save puts both sliders back.
    await reload()
    assert.equal(await p.locator(OPACITY).count(), 0)
    assert.equal(await p.locator(THICKNESS).count(), 1)
    await openExtrasEditor(p)
    assert.equal(await show('opacity').isChecked(), false)
    await dialogButton(p, 'Restore defaults').click()
    assert.equal(await show('opacity').isChecked(), true)
    await dialogButton(p, 'Save').click()
    await editor().waitFor({ state: 'detached' })
    await p.locator(OPACITY).waitFor({ state: 'visible' })
    assert.equal(await saved(SLIDERS_KEY), null)
  })

  it('Restore defaults sets the dialog\'s sliders to the defaults for Save: Cancel afterwards leaves the panel\'s sliders, the saved values and the marks, and Save resets them', async () => {
    await dragToMax(THICKNESS)
    const keep = { thickness: await sliderValue(THICKNESS), opacity: await sliderValue(OPACITY) }
    await openExtrasEditor(p)
    await dialogButton(p, 'Restore defaults').click()
    assert.deepEqual(await Promise.all(['thickness', 'opacity'].map((k) => editor().locator(`input[data-setting="${k}"]`).inputValue())), ['5', '80'])
    assert.deepEqual({ thickness: await sliderValue(THICKNESS), opacity: await sliderValue(OPACITY) }, keep, 'the panel is untouched before Save')
    assert.equal(await saved(THICKNESS_KEY), 16)
    await dialogButton(p, 'Cancel').click()
    await editor().waitFor({ state: 'detached' })
    assert.deepEqual({ thickness: await sliderValue(THICKNESS), opacity: await sliderValue(OPACITY) }, keep)
    assert.equal(await saved(THICKNESS_KEY), 16)
    assert.equal(await lineWidth(), 16)
    await openExtrasEditor(p)
    await dialogButton(p, 'Restore defaults').click()
    await dialogButton(p, 'Save').click()
    await editor().waitFor({ state: 'detached' })
    assert.equal(await settle(() => sliderValue(THICKNESS), '5'), '5')
    assert.equal(await sliderValue(OPACITY), '80')
    assert.equal(await settle(lineWidth, 5), 5)
    assert.equal(await settle(lineOpacity, 0.8), 0.8)
    assert.equal(await saved(THICKNESS_KEY), null)
    assert.equal(await saved(OPACITY_KEY), null)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})
