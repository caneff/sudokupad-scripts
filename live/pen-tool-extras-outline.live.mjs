// Live check of pen-tool-extras.user.js's White outline box on sudokupad.app in headless Chromium: on by default at width 2, off from the dialog's
// Save (an explicit false is stored), painted white round a pen line (read off a screenshot's pixels, over a black backing so white shows), faded by the opacity
// slider, kept off the drag highlight, kept over a reload, and on for settings saved before the box existed.
// Run with `npm run test:live`. The first run of a day needs the network (live/cache.mjs records SudokuPad, later runs replay it) and a Playwright Chromium, so it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so Tampermonkey's real injection time and
// crackingthecryptic.com stay untested, and so does a touch screen. The script goes in after Start Puzzle, when the controls already exist; startup.live.mjs checks the other injection times.
/* global Framework, ToolPen */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { closeExtrasEditorWith, openExtrasEditor } from './settings.mjs'
import { draw as drawLine, openPenTool } from './pen.mjs'
import { settle } from './settle.mjs'

const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')

const OUTLINE_KEY = 'PenColor_outline'
const OPACITY_KEY = 'PenColor_opacity'
const THICKNESS_KEY = 'PenColor_thickness'
// A line is 5 wide, so its edge is 2.5 units from its middle. The outline is 2 units wide by default (up to 8): 4 units out is outline at the default,
// 5.5 is past the outline of width 1 (3.5 out, plus its soft edge), 7 is outline only from a width of 5 up, and 14 is clear of every width (the widest, 8, reaches 10.5 and fades out over about 3 units more).
const OUTLINE_UNITS = 4
const WIDE_UNITS = 7
const PAST_NARROW_UNITS = 5.5
const CLEAR_UNITS = 14
const OUTLINE_WIDTH_KEY = 'PenColor_outlinewidth'
const DASH_KEY = 'PenColor_dash'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, reader, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const saved = (key) => read((k) => Framework.getData(k), key)
  const dialogButton = (text) => p.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()
  const editor = () => p.locator('#pen-tool-extras-editor')
  const outlineBox = () => editor().locator('input[data-outline]')
  const layerFilter = () => read(() => window.getComputedStyle(document.querySelector('#cell-pen')).filter)
  const FILTER_ON = 'url("#pen-tool-extras-outline-filter")'

  // One horizontal line in pen color 1 through the middle of grid row `row`, from column 3 to column 5 (a drag between cell
  // centers in the center-only mode, so it is straight), on pen page `page` (0 is the first).
  const drawCenterOnlyLine = async (row = 8, page = 0) => {
    await openPenTool(p)
    for (let i = 0; i < page; i++) await p.click('.pen-tool-extras-page')
    await read(() => { ToolPen.tool.lineMode = 'centeronly' })
    await drawLine(p, row, { col: 3, dx: (width) => 2 * width, dy: 0, steps: 8 })
    await p.mouse.move(5, 5)
  }

  // A black backing under the pen layer, so a white outline shows against it; removed with `unback`.
  const back = () => read(() => {
    const layer = document.querySelector('#cell-pen')
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.id = 'live-backing'
    rect.setAttribute('x', '-100')
    rect.setAttribute('y', '-100')
    rect.setAttribute('width', '1000')
    rect.setAttribute('height', '1000')
    rect.setAttribute('fill', '#000')
    layer.before(rect)
  })
  const unback = () => read(() => document.getElementById('live-backing')?.remove())

  // The brightness (0 to 255, red channel) of the pixel `units` above the middle of the drawn line, read off a screenshot loaded
  // into a second page's canvas. The line is the one `drawCenterOnlyLine` made in the middle of its row.
  const brightnessAbove = async (units, row = 8) => {
    const geometry = await read((row) => {
      const box = Framework.app.puzzle.cells.find((c) => c.row === row && c.col === 4).elem.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, perUnit: box.width / 64 }
    }, row)
    const y = geometry.y - units * geometry.perUnit
    const png = await p.screenshot({ clip: { x: geometry.x, y: Math.floor(y), width: 1, height: 2 } })
    return reader.evaluate(async (b64) => {
      const img = new window.Image()
      img.src = 'data:image/png;base64,' + b64
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      return ctx.getImageData(0, 0, 1, 1).data[0]
    }, png.toString('base64'))
  }

  const boot = async () => {
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
    await read(() => Framework.setSetting('toolpen', true))
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await openPenTool(p)
  }
  const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }
  const openEditor = () => openExtrasEditor(p)
  const clearSaved = () => read((keys) => keys.forEach((k) => Framework.removeData(k)), [OUTLINE_KEY, OUTLINE_WIDTH_KEY, OPACITY_KEY, THICKNESS_KEY, DASH_KEY])
  const widthSlider = () => editor().locator('input[data-setting="outlineWidth"]')
  const setWidth = (value) => widthSlider().evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })) }, value)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    reader = await context.newPage()
    await boot()
    await clearSaved()
    await drawCenterOnlyLine()
  })
  after(async () => {
    await clearSaved()
    await context.close()
  })

  const widthRow = () => editor().locator('[data-row="outlineWidth"]')

  it('is on by default at width 2 with nothing saved: the filter on the pen layer, the filter in the page, the box ticked and white beside the line', async () => {
    assert.equal(await saved(OUTLINE_KEY), null)
    assert.equal(await saved(OUTLINE_WIDTH_KEY), null)
    assert.equal(await layerFilter(), FILTER_ON)
    assert.equal(await read(() => document.getElementById('pen-tool-extras-outline-holder') !== null), true)
    await back()
    assert.equal(await brightnessAbove(OUTLINE_UNITS) > 100, true, 'white beside the line')
    assert.equal(await brightnessAbove(CLEAR_UNITS), 0, 'black beyond the outline')
    await unback()
    await openEditor()
    assert.equal(await outlineBox().isChecked(), true)
    assert.equal(await widthSlider().inputValue(), '2')
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('Outline width is a line under the box in the slider column, hidden at once while the box is unticked and back when it is ticked; the slider keeps its value', async () => {
    await openEditor()
    assert.equal(await widthRow().isVisible(), true)
    await setWidth(6)
    const column = (locator) => locator.evaluate((el) => Math.round(el.getBoundingClientRect().x))
    assert.equal(await column(widthSlider()), await column(editor().locator('input[data-setting="thickness"]')), 'in the column of the Line settings sliders')
    assert.equal(await column(widthSlider()), await column(editor().locator('input[data-setting="dash"]')), 'in the column of the Line styles sliders')
    const boxBelow = await outlineBox().evaluate((el) => el.getBoundingClientRect().bottom)
    assert.equal((await widthRow().boundingBox()).y >= boxBelow - 1, true, 'under the box, not beside it')
    await outlineBox().uncheck()
    assert.equal(await widthRow().isVisible(), false)
    await outlineBox().check()
    assert.equal(await widthRow().isVisible(), true)
    assert.equal(await widthSlider().inputValue(), '6')
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('Cancel leaves it on and Save with the box unticked turns it off for the line already drawn and stores an explicit false that survives a reload', async () => {
    await back()
    await openEditor()
    await outlineBox().uncheck()
    await closeExtrasEditorWith(p, 'Cancel')
    assert.equal(await layerFilter(), FILTER_ON)
    assert.equal(await saved(OUTLINE_KEY), null)
    await openEditor()
    await outlineBox().uncheck()
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await settle(layerFilter, 'none'), 'none')
    assert.equal(await saved(OUTLINE_KEY), false)
    assert.equal(await brightnessAbove(OUTLINE_UNITS), 0, 'black beside the line with no outline')
    await unback()
    await reload()
    assert.equal(await layerFilter(), 'none')
    assert.equal(await read(() => document.getElementById('pen-tool-extras-outline-holder')), null)
    await openEditor()
    assert.equal(await outlineBox().isChecked(), false)
    assert.equal(await widthRow().isVisible(), false, 'the width line is hidden while the outline is off')
    await outlineBox().check()
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await settle(layerFilter, FILTER_ON), FILTER_ON)
    assert.equal(await saved(OUTLINE_KEY), null, 'on is the default and is not kept')
  })

  it('the Outline width slider is 1 to 8 at 2 by default; Cancel leaves the width, Save applies it to the line already drawn and saves it, and Restore defaults then Save puts back 2', async () => {
    await back()
    await openEditor()
    assert.deepEqual(await widthSlider().evaluate((el) => [el.min, el.max, el.step, el.value]), ['1', '8', '1', '2'])
    await setWidth(8)
    await closeExtrasEditorWith(p, 'Cancel')
    assert.equal(await brightnessAbove(WIDE_UNITS), 0, 'Cancel left the width at 2')
    await openEditor()
    assert.equal(await widthSlider().inputValue(), '2', 'the dialog opens at the width in force')
    await setWidth(8)
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await saved(OUTLINE_WIDTH_KEY), 8)
    assert.equal(await settle(() => brightnessAbove(WIDE_UNITS).then((v) => v > 100), true), true, 'white 7 units out at width 8')
    assert.equal(await brightnessAbove(CLEAR_UNITS), 0, 'black beyond width 8')
    await openEditor()
    await setWidth(1)
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await settle(() => brightnessAbove(PAST_NARROW_UNITS), 0), 0, 'black 5.5 units out at width 1')
    await openEditor()
    await dialogButton('Restore defaults').click()
    assert.equal(await widthSlider().inputValue(), '2')
    assert.equal(await outlineBox().isChecked(), true)
    await closeExtrasEditorWith(p, 'Cancel')
    assert.equal(await saved(OUTLINE_WIDTH_KEY), 1, 'Restore defaults waits for Save')
    await openEditor()
    await dialogButton('Restore defaults').click()
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await saved(OUTLINE_WIDTH_KEY), null, 'the default width is not kept')
    assert.equal(await settle(() => brightnessAbove(OUTLINE_UNITS).then((v) => v > 100), true), true)
    await unback()
  })

  it('the outline fades with the opacity slider: the pixel beside a line is brighter at 100 than at 40', async () => {
    await read(([k]) => Framework.setData(k, 100), [OPACITY_KEY])
    await reload()
    await back()
    const solid = await brightnessAbove(OUTLINE_UNITS)
    await read(([k]) => Framework.setData(k, 40), [OPACITY_KEY])
    await reload()
    await back()
    const faded = await brightnessAbove(OUTLINE_UNITS)
    await unback()
    await read(([k]) => Framework.removeData(k), [OPACITY_KEY])
    assert.equal(solid > faded && faded > 0, true, `solid ${solid}, faded ${faded}`)
  })

  it('stays on over a reload, and the drag highlight is not in the outlined layer', async () => {
    await reload()
    assert.equal(await settle(layerFilter, FILTER_ON), FILTER_ON)
    await openPenTool(p)
    await p.locator('.tool-pen button[data-key="1"]').click()
    const [x, y] = await read(() => {
      const box = Framework.app.puzzle.cells.find((c) => c.row === 6 && c.col === 4).elem.getBoundingClientRect()
      return [box.x + box.width / 2, box.y + box.height / 2]
    })
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x + 110, y + 10, { steps: 6 })
    const hint = await read(() => {
      const el = document.querySelector('.penhint')
      const filters = []
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) filters.push(window.getComputedStyle(e).filter)
      return { found: el !== null, inPenLayer: el !== null && el.closest('#cell-pen') !== null, filters: [...new Set(filters)] }
    })
    await p.mouse.up()
    assert.deepEqual(hint, { found: true, inPenLayer: false, filters: ['none'] })
  })

  it('Restore defaults then Save turns it on at width 2 and clears the saved values; settings saved without the fields load with it on at width 2', async () => {
    await read(([k, w]) => { Framework.setData(k, false); Framework.setData(w, 5) }, [OUTLINE_KEY, OUTLINE_WIDTH_KEY])
    await reload()
    assert.equal(await layerFilter(), 'none')
    await openEditor()
    assert.equal(await outlineBox().isChecked(), false)
    await dialogButton('Restore defaults').click()
    assert.equal(await outlineBox().isChecked(), true)
    assert.equal(await widthSlider().inputValue(), '2')
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await settle(layerFilter, FILTER_ON), FILTER_ON)
    assert.equal(await saved(OUTLINE_KEY), null)
    assert.equal(await saved(OUTLINE_WIDTH_KEY), null)
    // Settings saved by an earlier version hold no outline field.
    await read(([k]) => Framework.setData(k, 9), [THICKNESS_KEY])
    await reload()
    assert.equal(await layerFilter(), FILTER_ON)
    // A saved width that is not a whole number from 1 to 8 reads as 2.
    await read(([k]) => Framework.setData(k, 99), [OUTLINE_WIDTH_KEY])
    await reload()
    await openEditor()
    assert.equal(await widthSlider().inputValue(), '2')
    await closeExtrasEditorWith(p, 'Cancel')
    await clearSaved()
  })

  it('a mark much thinner than the outline still gets the full outline: page 2 dots at Thickness 1 are white 4 and 7 units out at width 8 and 2 units out at width 3', async () => {
    // A row no earlier test draws in, so the pixel read sits over the dots alone.
    const DOT_ROW = 3
    await read(([t, d, o, w, op]) => { Framework.setData(t, 1); Framework.setData(d, 0); Framework.setData(o, true); Framework.setData(w, 8); Framework.setData(op, 100) }, [THICKNESS_KEY, DASH_KEY, OUTLINE_KEY, OUTLINE_WIDTH_KEY, OPACITY_KEY])
    await reload()
    await drawCenterOnlyLine(DOT_ROW, 1)
    await back()
    assert.equal(await settle(() => brightnessAbove(OUTLINE_UNITS, DOT_ROW).then((v) => v > 200), true), true, 'white 4 units above the dots at width 8')
    assert.equal(await brightnessAbove(WIDE_UNITS, DOT_ROW) > 200, true, 'white 7 units above the dots at width 8')
    await unback()
    await read(([w]) => Framework.setData(w, 3), [OUTLINE_WIDTH_KEY])
    await reload()
    await back()
    assert.equal(await settle(() => brightnessAbove(OUTLINE_UNITS - 2, DOT_ROW).then((v) => v > 200), true), true, 'white 2 units above the dots at width 3 (a dot edge is 0.5 out, so the outline reaches 3.5 from its middle, and the pixel may sit between two dots 5 units apart)')
    await unback()
    await clearSaved()
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})
