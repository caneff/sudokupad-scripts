// Live check of pen-tool-extras.user.js's thickness and opacity sliders in the pen tool's panel, of the
// line mode button that steps SudokuPad's hidden line mode pulldown, and of the opacity of the pen layer, on
// sudokupad.app in headless Chromium. A touch screen stays untested.
// Every slider move is a real mouse drag.
/* global Framework, ToolPen, Image, TouchEvent, getComputedStyle */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as extras from './pen-tool-extras-fixtures.mjs'
import { dialogButton, effectiveOpacities, openExtrasEditor } from '../settings.mjs'
import { draw, drag, openPenTool, penEntries, penValuesNoColor, setSlider } from '../pen.mjs'
import { settle } from '../settle.mjs'
import { useBrowser } from '../session.mjs'

const THICKNESS_KEY = 'PenColor_thickness'
const SLIDERS_KEY = 'PenColor_sliders'
const OPACITY_KEY = 'PenColor_opacity'
const LINE_MODE_KEY = 'ToolPen_linemode'
const THICKNESS = '#pen-tool-extras-thickness'
const OPACITY = '#pen-tool-extras-opacity'

const browser = useBrowser()

describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const saved = (key) => read((k) => Framework.getData(k), key)
  const editor = () => p.locator('#pen-tool-extras-editor')
  const sliderValue = (selector) => p.locator(selector).inputValue()
  const undoDepth = () => read(() => Framework.app.puzzle.undoStack.length)
  const strokeCount = () => read(() => document.querySelectorAll('#cell-pen .cell-pen').length)
  const activeElementTag = () => read(() => document.activeElement.tagName)
  const lineWidth = () => read(() => parseFloat(window.getComputedStyle(document.querySelector('#cell-pen .cell-pen.pencolor-1')).strokeWidth))
  const effectiveOpacity = async (selector) => (await effectiveOpacities(p, selector))[0]
  const lineOpacity = () => effectiveOpacity('#cell-pen .cell-pen.pencolor-1')
  const strokeOwnOpacity = () => read(() => parseFloat(window.getComputedStyle(document.querySelector('#cell-pen .cell-pen.pencolor-1')).opacity))

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

  const reload = () => extras.reload(p)

  before(async () => {
    ;({ context, p, errors } = await extras.open(browser()))
    await read(([a, b]) => { Framework.removeData(a); Framework.removeData(b) }, [THICKNESS_KEY, OPACITY_KEY])
    await draw(p, 8)
  })
  after(async () => {
    await read(([a, b]) => { Framework.removeData(a); Framework.removeData(b) }, [THICKNESS_KEY, OPACITY_KEY])
    await context.close()
  })

  it('with the pen tool on, Thickness is above Opacity in the sliders row under the three controls, at SudokuPad\'s own 5 and 0.8, with no pad growth', async () => {
    const [thickness, opacity, row, controls] = await Promise.all([THICKNESS, OPACITY, '.pen-tool-extras-sliders', '.pen-tool-extras-page'].map((s) => p.locator(s).boundingBox()))
    assert.equal(thickness.y < opacity.y, true, 'Thickness above Opacity')
    assert.deepEqual(await p.locator(THICKNESS).evaluate((el) => [el.min, el.max, el.step, el.value]), ['1', '16', '0.5', '5'])
    assert.deepEqual(await p.locator(OPACITY).evaluate((el) => [el.min, el.max, el.step, el.value]), ['20', '100', '5', '80'])
    assert.equal(await lineWidth(), 5)
    assert.equal(await lineOpacity(), 0.8)
    assert.equal(row.y >= controls.y + controls.height, true, JSON.stringify({ row, controls }))
    // The pad is no taller with the sliders than without.
    const height = () => p.locator('.controls-buttons').evaluate((el) => el.getBoundingClientRect().height)
    const withSliders = await height()
    await p.locator('.pen-tool-extras-sliders').evaluate((el) => { el.style.display = 'none' })
    assert.equal(await height(), withSliders)
    await p.locator('.pen-tool-extras-sliders').evaluate((el) => { el.style.display = '' })
  })

  const modeButton = () => p.locator('.pen-tool-extras-mode')
  const pressMode = () => modeButton().click()
  // SudokuPad's line mode decides where a drag's ends snap, so a line is stored as a center line or an edge line whichever way it was dragged. The values of each kind
  // (see LINE_PATHS in the script): a center line joins cell middles, an edge line runs along the cell edges between cell corners.
  const CENTER_LINES = ['1', '2', 'd', 'e']
  const EDGE_LINES = ['7', '8', '9', 'a', 'f', 'g']
  const dragKinds = async (points) => {
    const before = await penEntries(p)
    await drag(p, points)
    const added = (await penEntries(p)).filter((entry) => !before.includes(entry)).map((entry) => entry.split(':')[1][0])
    return [...new Set(added.map((value) => CENTER_LINES.includes(value) ? 'center' : EDGE_LINES.includes(value) ? 'edge' : value))]
  }
  const acrossMiddles = (row) => [[row + 0.5, 1.5], [row + 1.5, 2.5]]
  const alongEdge = (row) => [[row, 5], [row, 6]]

  it('SudokuPad\'s line mode pulldown is hidden, and the line mode, line type and settings buttons sit in one row in that order, a 4rem square each', async () => {
    assert.equal(await p.locator('.penlinemode').isVisible(), false)
    const [mode, page, settings] = await Promise.all(['.pen-tool-extras-mode', '.pen-tool-extras-page', '.pen-tool-extras-settings'].map((s) => p.locator(s).boundingBox()))
    assert.equal(mode.x + mode.width <= page.x && page.x + page.width <= settings.x, true, JSON.stringify({ mode, page, settings }))
    assert.deepEqual([mode.y, settings.y], [page.y, page.y], 'one row')
    assert.deepEqual([mode.width, settings.width, mode.height, settings.height].map((v) => Math.round(v)), [page.width, page.width, page.height, page.height].map((v) => Math.round(v)), 'one size')
  })

  it('the line mode button names the mode, steps it through SudokuPad, and the lines drawn after each click follow it', async () => {
    await read((k) => Framework.removeData(k), LINE_MODE_KEY)
    await reload()
    assert.equal(await modeButton().getAttribute('title'), 'Center & Edge')
    assert.equal(await modeButton().getAttribute('aria-label'), 'Center & Edge')
    // SudokuPad's CSS fills every `svg path`; the icon's paths must draw as lines.
    assert.deepEqual(await modeButton().locator('path').evaluateAll((ps) => ps.map((e) => window.getComputedStyle(e).fill)), ['none', 'none', 'none'])
    assert.deepEqual([await dragKinds(acrossMiddles(1)), await dragKinds(alongEdge(3))], [['center'], ['edge']], 'center and edge: each drag stays what it was')
    await pressMode()
    assert.equal(await modeButton().getAttribute('title'), 'Center only')
    assert.equal(await read(() => ToolPen.tool.lineMode), 'centeronly')
    assert.equal(await saved(LINE_MODE_KEY), 'centeronly')
    assert.deepEqual([await dragKinds(acrossMiddles(4)), await dragKinds(alongEdge(6))], [['center'], ['center']], 'center-only stores center lines only')
    await pressMode()
    assert.equal(await modeButton().getAttribute('title'), 'Edge only')
    assert.equal(await read(() => ToolPen.tool.lineMode), 'edgeonly')
    assert.deepEqual([await dragKinds(acrossMiddles(7)), await dragKinds(alongEdge(1))], [['edge'], ['edge']], 'edge-only stores edge lines only')
    await pressMode()
    assert.equal(await modeButton().getAttribute('title'), 'Center & Edge')
    assert.equal(await read(() => ToolPen.tool.lineMode), 'both')
    assert.equal(await saved(LINE_MODE_KEY), 'both')
  })

  it('a touch tap steps the mode once, even though SudokuPad cancels the touch events on its buttons and a click may follow', async () => {
    assert.equal(await modeButton().getAttribute('title'), 'Center & Edge')
    // SudokuPad's own handlers on its buttons call preventDefault on a touch, which keeps the browser from sending the click.
    await modeButton().evaluate((el) => {
      el.addEventListener('touchend', (event) => event.preventDefault())
      el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }))
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true }))
    })
    assert.equal(await modeButton().getAttribute('title'), 'Center only')
    assert.equal(await saved(LINE_MODE_KEY), 'centeronly')
    // A browser that does send the click after a tap must not step the mode a second time.
    await pressMode()
    assert.equal(await modeButton().getAttribute('title'), 'Center only')
    await read((k) => Framework.removeData(k), LINE_MODE_KEY)
    await reload()
  })

  it('with no page to turn to the line type button is gone, and the settings button takes its place beside the line mode button', async () => {
    const setStyles = async (on) => {
      await openExtrasEditor(p)
      for (const key of ['dashed', 'arrows']) await editor().locator(`input[data-box="lineStyles.${key}"]`).setChecked(on)
      await dialogButton(p, 'Save').click()
    }
    const pageBox = await p.locator('.pen-tool-extras-page').boundingBox()
    await setStyles(false)
    assert.equal(await p.locator('.pen-tool-extras-page').count(), 0)
    const [mode, settings] = await Promise.all(['.pen-tool-extras-mode', '.pen-tool-extras-settings'].map((s) => p.locator(s).boundingBox()))
    assert.equal(Math.abs(settings.x - pageBox.x) <= 1, true, JSON.stringify({ settings, pageBox }))
    assert.equal(mode.x + mode.width <= settings.x, true, JSON.stringify({ mode, settings }))
    await setStyles(true)
    assert.equal(await p.locator('.pen-tool-extras-page').count(), 1)
    const [page, modeAgain, settingsAgain] = await Promise.all(['.pen-tool-extras-page', '.pen-tool-extras-mode', '.pen-tool-extras-settings'].map((s) => p.locator(s).boundingBox()))
    assert.equal(modeAgain.x + modeAgain.width <= page.x && page.x + page.width <= settingsAgain.x, true)
  })

  it('the line mode survives a reload, and the button shows it', async () => {
    await pressMode()
    assert.equal(await saved(LINE_MODE_KEY), 'centeronly')
    await reload()
    assert.equal(await modeButton().getAttribute('title'), 'Center only')
    assert.equal(await read(() => ToolPen.tool.lineMode), 'centeronly')
    await read((k) => Framework.removeData(k), LINE_MODE_KEY)
    await reload()
  })

  it('the settings dialog has no line mode pulldown', async () => {
    await openExtrasEditor(p)
    assert.equal(await editor().locator('select[data-line-mode]').count(), 0)
    await dialogButton(p, 'Cancel').click()
  })

  it('the sliders have no line pictures, keep their hover labels, and the tracks draw: a wedge for thickness, a fade for opacity', async () => {
    assert.equal(await p.locator('.pen-tool-extras-slider svg').count(), 0)
    // The sliders fill the box across the pad, less its padding.
    const [length, box] = await Promise.all([THICKNESS, '.pen-tool-extras-sliders'].map(async (selector) => (await p.locator(selector).boundingBox()).width))
    assert.equal(length > 0.8 * box && length < box, true, `slider length ${length} in a box of ${box}`)
    assert.deepEqual(await p.locator('.pen-tool-extras-slider').evaluateAll((els) => els.map((e) => e.title)), ['Thickness', 'Opacity'])
    // The tracks are shadow parts getComputedStyle cannot read, so the rendered pixels are: how dark the track is near each end.
    const ink = async (selector) => {
      const shot = (await p.locator(selector).screenshot()).toString('base64')
      return p.evaluate(async (b64) => {
        const img = new Image()
        img.src = `data:image/png;base64,${b64}`
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const g = canvas.getContext('2d')
        g.drawImage(img, 0, 0)
        const data = g.getImageData(0, 0, img.width, img.height).data
        const dark = (x0, x1) => { let sum = 0; for (let x = x0; x < x1; x++) for (let y = 0; y < img.height; y++) sum += 255 - data[(y * img.width + x) * 4 + 1]; return sum }
        const edge = Math.floor(img.width * 0.08)
        return [dark(0, edge), dark(img.width - edge, img.width)]
      }, shot)
    }
    const [thinEnd, thickEnd] = await ink(THICKNESS)
    assert.equal(thickEnd > thinEnd * 2, true, `the wedge is thicker at the right: ${thinEnd} -> ${thickEnd}`)
    const [faintEnd, solidEnd] = await ink(OPACITY)
    assert.equal(solidEnd > faintEnd * 2 && faintEnd > 0, true, `the fade is fainter at the left: ${faintEnd} -> ${solidEnd}`)
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
    await p.locator(THICKNESS).evaluate((el) => { el.value = 5; el.dispatchEvent(new Event('input', { bubbles: true })) })
    assert.equal(await settle(lineWidth, 5), 5)
    assert.equal(await saved(THICKNESS_KEY), null, 'a panel slider at its default removes its key')
  })

  it('Thickness moves in half steps: a drag to the thin end and one step on lands on 1.5, which draws a 1.5 wide line and saves', async () => {
    await openPenTool(p)
    await dragSlider(THICKNESS, GRID_X)
    assert.equal(await sliderValue(THICKNESS), '1')
    await p.locator(THICKNESS).focus()
    await p.keyboard.press('ArrowRight')
    assert.equal(await sliderValue(THICKNESS), '1.5')
    assert.equal(await settle(lineWidth, 1.5), 1.5)
    assert.equal(await saved(THICKNESS_KEY), 1.5)
    await p.locator(THICKNESS).evaluate((el) => { el.value = 5; el.dispatchEvent(new Event('input', { bubbles: true })) })
    assert.equal(await settle(lineWidth, 5), 5)
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
    assert.deepEqual(await dialogRange('thickness').evaluate((el) => [el.min, el.max, el.step]), ['1', '16', '0.5'])
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
    const show = (key) => editor().locator(`input[data-box="show.${key}"]`)
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

describe('with Dark Page on', { concurrency: false }, () => {
  let context, p

  before(async () => {
    ;({ context, p } = await extras.open(browser(), { scripts: ['dark-page.user.js', extras.SCRIPT_FILE] }))
  })
  after(async () => { await context.close() })

  it('the sliders sit on the tray, which stays light on Dark Page, with no box behind them', async () => {
    assert.notEqual(await p.locator('.tool-pen button[data-key="9"]').evaluate((el) => getComputedStyle(el).borderTopColor), 'rgb(204, 204, 204)', 'Dark Page restyles the buttons')
    assert.equal(await p.locator('.pen-tool-extras-sliders-box').count(), 0)
    assert.equal(await p.locator('.pen-tool-extras-tray').evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(239, 234, 244)')
  })
})
