// Live check of pen-tool-extras.user.js's pen colors and thickness on sudokupad.app, in headless Chromium.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { drawnWidth, openPage, startPuzzle } from '../page.mjs'
import { EXTRAS_EDITOR, closeExtrasEditorWith, dialogButton, headerVersion, openExtrasEditor, openSettings } from '../settings.mjs'
import { gridPoint, openPenTool, plantUnchecked, setSlider } from '../pen.mjs'
import { settle } from '../settle.mjs'

const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')

const { HOLD_TO_EDIT_MS } = createRequire(import.meta.url)('../../pen-tool-extras.user.js')

const DATA_KEY = 'PenColor_colors'
// The color tool wait's limit in the script (COLOR_TOOL_TIMEOUT_MS).
const COLOR_TOOL_TIMEOUT_MS = 10000
const THICKNESS_KEY = 'PenColor_thickness'
// SudokuPad's cell color pages, darkened: the pen color presets. Typed out
// here from the script's own darkening of SudokuPad's default palette (tool-color.js) as the
// expected result; the three entries are the default pages 0-2, pen colors 1-9 in order.
const PAGE_PENS = [
  ['#919191', '#525252', '#000000', '#719f17', '#aa40b3', '#a06200', '#b10011', '#ada000', '#0065b5'],
  ['#8d1a00', '#004f1d', '#002b85', '#ad5f70', '#aeae00', '#ac00ae', '#6f3800', '#007fa6', '#64007f'],
  ['#b10011', '#007b18', '#0065b5', '#b84e4f', '#58915b', '#5f8bb6', '#740001', '#07490f', '#003a74']
]
// SudokuPad's own pen colors (tool-pen.css), read off the page with no script installed.
const OWN_PEN_HEX = ['#1f8020', '#e87cf1', '#e49632', '#f53a37', '#d2be32', '#3d99f5', '#d6d6d6', '#7c7c7c', '#000000']
const toObject = (list) => Object.fromEntries(list.map((hex, i) => [String(i + 1), hex]))
// What the install save stores: Darker page 1, with its preset name.
const INSTALLED = { ...toObject(PAGE_PENS[0]), preset: 'page-1' }
const PRESET_OPTIONS = [['page-1', 'Darker page 1'], ['page-2', 'Darker page 2'], ['page-3', 'Darker page 3'], ['sudokupad', 'SudokuPad colors']]
const rgbOf = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
// SudokuPad's default cell colors for keys 0-9 (tool-color.js), as the page computes them.
const CELL_VARS = ['transparent', 'rgb(214, 214, 214)', 'rgb(124, 124, 124)', 'rgb(-36, -36, -36)', 'rgb(179, 229, 106)', 'rgb(232, 124, 241)', 'rgb(228, 150, 50)', 'rgb(245, 58, 55)', 'rgb(252, 235, 63)', 'rgb(61, 153, 245)']
const FOUR = { hex: '#ff00ff', rgb: 'rgb(255, 0, 255)' }
const NINE = { hex: '#00cccc', rgb: 'rgb(0, 204, 204)' }
// A customized cell color on page 0, key 4, and the pen color it darkens to (computed by the
// script's darkening of rgb(10, 20, 200)).
const CUSTOM_CELL = { css: 'rgb(10, 20, 200)', pen: '#05008c' }

// The pickers appear only when the hold timer fires, so a count that has not moved yet is not a count that stopped.
const HOLD_QUIET_MS = HOLD_TO_EDIT_MS + 500
const HOLD_WAIT_MS = HOLD_TO_EDIT_MS + 5000

const STYLE = '#pen-tool-extras-style'

const removePalette = (page) => page.evaluate(() => { window.__palette = Framework.app.tools.colour.palette; Framework.app.tools.colour.palette = undefined })
const putBackRemovedPalette = (page) => page.evaluate(() => { Framework.app.tools.colour.palette = window.__palette })

const probeStrokeWidth = (page, value, parent) => page.evaluate(([value, parent]) => {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('class', `cell-pen pen-${value} pencolor-1`)
  document.querySelector(parent).appendChild(path)
  const style = window.getComputedStyle(path)
  const computed = { strokeWidth: style.strokeWidth, transform: style.transform }
  path.remove()
  return computed
}, [value, parent]).then(drawnWidth)

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const editor = () => p.locator('#pen-tool-extras-editor')
  const saved = () => read((k) => Framework.getData(k), DATA_KEY)

  const strokes = (n) => read((n) => [...document.querySelectorAll(`#cell-pen .cell-pen.pencolor-${n}`)].map((e) => window.getComputedStyle(e).stroke), n)
  const allStrokes = (n) => async () => [...new Set(await strokes(n))]
  const strokeCount = async () => (await read(() => document.querySelectorAll('#cell-pen .cell-pen').length))
  const swatch = (n) => read((n) => window.getComputedStyle(document.querySelector(`.tool-pen button[data-key="${n}"]`), ':after').backgroundColor, n)
  const swatches = async () => {
    await openPenTool(p)
    return read(() => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => window.getComputedStyle(document.querySelector(`.tool-pen button[data-key="${n}"]`), ':after').backgroundColor))
  }
  const swatchesAre = async (hexes) => {
    const want = hexes.map(rgbOf)
    assert.deepEqual(await settle(swatches, want), want)
  }
  const cellVars = () => read(() => [...Array(10)].map((_, i) => window.getComputedStyle(document.documentElement).getPropertyValue(`--cell-color-${i}`).trim()))
  const setCellColorPage = (page) => read((page) => Framework.app.tools.colour.setPage(page), page)
  const setCellColor = ([key, css]) => read(([key, css]) => Framework.app.tools.colour.setColor(key, css), [key, css])
  // setPalette clamped and saved the current page; puts the stored palette and page 2 back.
  const restorePalette = () => read(() => {
    const t = Framework.app.tools.colour
    t.setPalette(Framework.getData('ToolColor_palette'))
    t.setPage(2)
  })
  const restoreDefaults = () => dialogButton(p, 'Restore defaults').click()
  const pickerValues = () => editor().locator('input[type=color]').evaluateAll((es) => es.map((e) => e.value))
  const presetMenu = () => editor().locator('select[data-role="color-choice"]')
  const presetShown = () => presetMenu().evaluate((el) => el.value)
  const presetListed = () => presetMenu().locator('option').evaluateAll((os) => os.map((o) => [o.value, o.textContent]))
  const pickPreset = (id) => presetMenu().selectOption(id)

  const drawInFirstColumn = async (n, row) => {
    await openPenTool(p)
    await p.locator(`.tool-pen button[data-key="${n}"]`).click()
    const [x, y] = await read((row) => {
      const r = document.querySelector('#cell-givens text').getBoundingClientRect()
      return [r.x + r.width / 2, r.y + r.height / 2 + row * r.height]
    }, row)
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x + 60, y + 10, { steps: 8 })
    await p.mouse.up()
  }

  const boot = async () => {
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator(STYLE).waitFor({ state: 'attached' })
    // The pen tool is off until its own setting turns it on.
    await read(() => Framework.setSetting('toolpen', true))
    await p.locator('#control-pen').waitFor({ state: 'visible' })
  }
  const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }
  const pick = (n, hex) => editor().locator(`input[data-key="${n}"]`).fill(hex)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await boot()
  })
  after(async () => { await context.close() })

  it('a fresh install saves Darker page 1 once, with its preset name, and swatches and strokes show it', async () => {
    assert.deepEqual(await settle(saved, INSTALLED), INSTALLED)
    await swatchesAre(PAGE_PENS[0])
    await drawInFirstColumn(4, 1)
    assert.deepEqual(await settle(allStrokes(4), [rgbOf(PAGE_PENS[0][3])]), [rgbOf(PAGE_PENS[0][3])])
  })

  it('the dialog has a Pen Tool Extras entry in settings with a picker for each of the nine pen colors, set to the installed colors, and the pulldown shows their preset', async () => {
    await openExtrasEditor(p)
    assert.deepEqual(await pickerValues(), PAGE_PENS[0])
    assert.equal(await presetShown(), 'page-1')
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('the pulldown lists one darker page per palette page, then SudokuPad colors, and no Custom while the set is a preset', async () => {
    await openExtrasEditor(p)
    assert.deepEqual(await presetListed(), PRESET_OPTIONS)
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('picking a preset fills the pickers as a draft: Cancel drops it, Save keeps it with its name, and reopening shows the last pick', async () => {
    await openExtrasEditor(p)
    await pickPreset('page-2')
    assert.deepEqual(await pickerValues(), PAGE_PENS[1])
    await pickPreset('sudokupad')
    assert.deepEqual(await pickerValues(), OWN_PEN_HEX)
    await closeExtrasEditorWith(p, 'Cancel')
    assert.deepEqual(await saved(), INSTALLED)
    await swatchesAre(PAGE_PENS[0])
    for (const [id, pens] of [['page-3', PAGE_PENS[2]], ['sudokupad', OWN_PEN_HEX], ['page-1', PAGE_PENS[0]]]) {
      await openExtrasEditor(p)
      await pickPreset(id)
      await closeExtrasEditorWith(p, 'Save')
      assert.deepEqual(await saved(), { ...toObject(pens), preset: id }, id)
      await swatchesAre(pens)
      await openExtrasEditor(p)
      assert.equal(await presetShown(), id)
      assert.deepEqual(await pickerValues(), pens, id)
      await closeExtrasEditorWith(p, 'Cancel')
    }
  })

  it('a preset set survives a palette change and a reload unchanged, still under its name', async () => {
    await setCellColor(['4', CUSTOM_CELL.css])
    await reload()
    assert.deepEqual(await saved(), INSTALLED)
    await swatchesAre(PAGE_PENS[0])
    await openExtrasEditor(p)
    assert.equal(await presetShown(), 'page-1')
    await closeExtrasEditorWith(p, 'Cancel')
    await setCellColor(['4', CELL_VARS[4]])
  })

  it('the dialog lays the nine pen colors out as a 3 by 3 grid like the pen tool\'s buttons, in the order of their numbers', async () => {
    await openExtrasEditor(p)
    const cells = await editor().locator('input[data-role="swatch"]').evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect()
      return { pen: el.dataset.key, x: r.x, y: r.y }
    }))
    assert.deepEqual(cells.map((c) => c.pen), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    const rows = [cells.slice(0, 3), cells.slice(3, 6), cells.slice(6)]
    for (const row of rows) {
      assert.equal(row.every((c) => Math.abs(c.y - row[0].y) < 2), true, `one row: ${JSON.stringify(row)}`)
      assert.equal(row[0].x < row[1].x && row[1].x < row[2].x, true, 'left to right')
    }
    assert.equal(rows[0][0].y < rows[1][0].y && rows[1][0].y < rows[2][0].y, true, 'top to bottom')
    for (const col of [0, 1, 2]) assert.equal(Math.abs(rows[0][col].x - rows[2][col].x) < 2, true, `column ${col} lines up`)
    // The pen tool's own buttons are in the same arrangement.
    await closeExtrasEditorWith(p, 'Cancel')
    await openPenTool(p)
    const buttons = await p.locator('.tool-pen button[data-key]').evaluateAll((els) => els.filter((el) => el.dataset.key !== '0').map((el) => { const r = el.getBoundingClientRect(); return [el.dataset.key, Math.round(r.x), Math.round(r.y)] }))
    assert.deepEqual(buttons.map((b) => b[0]), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    assert.equal(buttons[0][1] < buttons[1][1] && buttons[3][2] > buttons[0][2], true, 'the panel runs left to right, then down')
  })

  it('editing a picker turns the pulldown to Custom, which cannot be picked; Cancel saves nothing and changes no color', async () => {
    await openExtrasEditor(p)
    await pick('4', FOUR.hex)
    assert.equal(await presetShown(), 'custom')
    assert.deepEqual(await presetListed(), [['custom', 'Custom'], ...PRESET_OPTIONS])
    assert.equal(await presetMenu().locator('option[value="custom"]').evaluate((o) => o.disabled), true)
    await closeExtrasEditorWith(p, 'Cancel')
    assert.deepEqual(await saved(), INSTALLED)
    assert.deepEqual(await allStrokes(4)(), [rgbOf(PAGE_PENS[0][3])])
    await swatchesAre(PAGE_PENS[0])
  })

  it('Save recolors a stroke drawn before the edit, a new stroke and the button swatch, and leaves the cell colors alone', async () => {
    await openExtrasEditor(p)
    await pick('4', FOUR.hex)
    await pick('9', NINE.hex)
    await closeExtrasEditorWith(p, 'Save')
    assert.deepEqual(await saved(), { ...toObject(PAGE_PENS[0]), 4: FOUR.hex, 9: NINE.hex })
    assert.deepEqual(await settle(allStrokes(4), [FOUR.rgb]), [FOUR.rgb])
    assert.equal(await swatch(4), FOUR.rgb)
    assert.equal(await swatch(9), NINE.rgb)
    const oldCount = (await strokes(4)).length
    await drawInFirstColumn(4, 2)
    await drawInFirstColumn(9, 3)
    // One drag can draw more than one stroke element, so the count is only checked to grow.
    assert.equal(await settle(async () => (await strokes(4)).length > oldCount, true), true)
    assert.deepEqual(await allStrokes(4)(), [FOUR.rgb])
    assert.deepEqual(await settle(allStrokes(9), [NINE.rgb]), [NINE.rgb])
    assert.deepEqual(await cellVars(), CELL_VARS)
  })

  it('a pen color left unedited keeps its color', async () => {
    assert.equal(await swatch(1), rgbOf(PAGE_PENS[0][0]))
    await drawInFirstColumn(1, 4)
    assert.deepEqual(await settle(allStrokes(1), [rgbOf(PAGE_PENS[0][0])]), [rgbOf(PAGE_PENS[0][0])])
  })

  it('undo removes strokes and redo brings them back, each in its pen color\'s current color', async () => {
    const before = await strokeCount()
    await p.click('#control-undo')
    assert.equal(await settle(strokeCount, before - 1), before - 1)
    await p.click('#control-redo')
    assert.equal(await settle(strokeCount, before), before)
    assert.deepEqual(await settle(allStrokes(1), [rgbOf(PAGE_PENS[0][0])]), [rgbOf(PAGE_PENS[0][0])])
    // Three more undos take the strokes drawn last (pen colors 1, 9 and 4); what remains is
    // the pen color 4 stroke drawn before the edit, still in the edited color.
    await p.click('#control-undo')
    await p.click('#control-undo')
    await p.click('#control-undo')
    assert.equal(await settle(strokeCount, before - 3), before - 3)
    assert.deepEqual(await allStrokes(4)(), [FOUR.rgb])
    for (let i = 0; i < 3; i++) await p.click('#control-redo')
    assert.equal(await settle(strokeCount, before), before)
    assert.deepEqual(await settle(allStrokes(9), [NINE.rgb]), [NINE.rgb])
  })

  it('a saved set survives a reload and a change of cell color or page', async () => {
    await setCellColor(['1', 'rgb(1, 2, 3)'])
    await setCellColorPage(2)
    await reload()
    assert.deepEqual(await saved(), { ...toObject(PAGE_PENS[0]), 4: FOUR.hex, 9: NINE.hex })
    await swatchesAre(Object.values({ ...toObject(PAGE_PENS[0]), 4: FOUR.hex, 9: NINE.hex }))
    await drawInFirstColumn(4, 5)
    assert.deepEqual(await settle(allStrokes(4), [FOUR.rgb]), [FOUR.rgb])
    await setCellColor(['1', CELL_VARS[1]])
  })

  it('Restore defaults then Save picks Darker page 1 from the palette in force, whichever page is current', async () => {
    await setCellColor(['4', CUSTOM_CELL.css])
    const want = PAGE_PENS[0].map((hex, i) => (i === 3 ? CUSTOM_CELL.pen : hex))
    for (const page of [0, 1, 2]) {
      await setCellColorPage(page)
      await openExtrasEditor(p)
      await restoreDefaults()
      assert.equal(await presetShown(), 'page-1')
      assert.deepEqual(await pickerValues(), want, `page ${page}`)
      await closeExtrasEditorWith(p, 'Save')
      assert.deepEqual(await saved(), { ...toObject(want), preset: 'page-1' }, `page ${page}`)
      await swatchesAre(want)
    }
    assert.deepEqual(await cellVars(), CELL_VARS.map((v, i) => (i === 4 ? CUSTOM_CELL.css : v)))
    await setCellColor(['4', CELL_VARS[4]])
  })

  it('Restore defaults then Cancel changes nothing', async () => {
    await openExtrasEditor(p)
    await pick('4', FOUR.hex)
    await closeExtrasEditorWith(p, 'Save')
    const savedSet = await saved()
    await openExtrasEditor(p)
    await restoreDefaults()
    await closeExtrasEditorWith(p, 'Cancel')
    assert.deepEqual(await saved(), savedSet)
    assert.deepEqual(await allStrokes(4)(), [FOUR.rgb])
  })

  it('Save after Restore defaults and a hand edit keeps the edit, as Custom', async () => {
    await openExtrasEditor(p)
    await restoreDefaults()
    await pick('9', NINE.hex)
    await closeExtrasEditorWith(p, 'Save')
    assert.deepEqual(await saved(), { ...toObject(PAGE_PENS[0]), 9: NINE.hex })
    await openExtrasEditor(p)
    assert.equal(await presetShown(), 'custom')
    await restoreDefaults()
    await closeExtrasEditorWith(p, 'Save')
    assert.deepEqual(await saved(), INSTALLED)
  })

  it('with nothing saved, the next load saves darker page 1 once, even on cell color page 3', async () => {
    await read((k) => Framework.removeData(k), DATA_KEY)
    assert.equal(await read(() => Framework.app.tools.colour.currentPage), 2)
    await reload()
    assert.deepEqual(await settle(saved, INSTALLED), INSTALLED)
    await swatchesAre(PAGE_PENS[0])
  })

  it('colors saved by an older version, with no preset name, load unchanged as Custom', async () => {
    const older = { ...toObject(PAGE_PENS[1]), 4: FOUR.hex }
    await read(([k, v]) => Framework.setData(k, v), [DATA_KEY, older])
    await reload()
    await swatchesAre(Object.values(older))
    assert.deepEqual(await saved(), older)
    await openExtrasEditor(p)
    assert.equal(await presetShown(), 'custom')
    assert.deepEqual(await pickerValues(), Object.values(older))
    await restoreDefaults()
    await closeExtrasEditorWith(p, 'Save')
    assert.deepEqual(await saved(), INSTALLED)
  })

  it('cycling the color page mid-solve leaves the pen alone', async () => {
    await drawInFirstColumn(4, 6)
    const before = await allStrokes(4)()
    await setCellColorPage(0)
    await swatchesAre(PAGE_PENS[0])
    assert.deepEqual(await allStrokes(4)(), before)
    await setCellColorPage(2)
  })

  it('a page with fewer than nine usable colors keeps SudokuPad\'s pen colors for the rest and says so in the dialog', async () => {
    await read(() => {
      const t = Framework.app.tools.colour
      const palette = { colors: { w: 'transparent', x: 'rgb(200, 0, 0)', y: 'rgb(0, 0, 200)', z: 'rgb(0, 150, 0)' }, pages: [['w', 'x', 'y', 'z']] }
      t.setPalette(palette)
    })
    await openExtrasEditor(p)
    assert.deepEqual(await presetListed(), [PRESET_OPTIONS[0], PRESET_OPTIONS[3]], 'one page, so one darker page')
    await restoreDefaults()
    const values = await pickerValues()
    assert.deepEqual(values.slice(3), OWN_PEN_HEX.slice(3))
    assert.equal(values.slice(0, 3).filter((v, i) => OWN_PEN_HEX[i] !== v).length, 3)
    assert.match(await editor().innerText(), /Cell color page 1 has no usable color at the matching button, so pen colors 4, 5, 6, 7, 8, 9 keep SudokuPad's own/)
    // Picking a pen color by hand takes it off the list; the others stay on it.
    await pick('4', FOUR.hex)
    assert.match(await editor().innerText(), /pen colors 5, 6, 7, 8, 9 keep SudokuPad's own/)
    // Saved as Custom and opened again, the note still names the page the colors came from.
    await closeExtrasEditorWith(p, 'Save')
    await openExtrasEditor(p)
    assert.equal(await presetShown(), 'custom')
    assert.match(await editor().innerText(), /Cell color page 1 has no usable color at the matching button, so pen colors 5, 6, 7, 8, 9 keep SudokuPad's own/)
    await closeExtrasEditorWith(p, 'Cancel')
    await restorePalette()
    await openExtrasEditor(p)
    await restoreDefaults()
    await closeExtrasEditorWith(p, 'Save')
    assert.deepEqual(await saved(), INSTALLED)
  })

  it('a custom page of shorthand hex, named, rgba() and hsl() colors gives pen N the color at index N, a transparent entry keeping SudokuPad\'s own pen color', async () => {
    await read(() => {
      const t = Framework.app.tools.colour
      const colors = { t: 'transparent', a: '#f00', b: 'blue', c: 'rgba(0, 200, 0, 1)', u: 'rgba(0, 0, 0, 0)', d: 'hsl(60, 100%, 50%)', e: 'rgb(10 20 30)', f: '#0ff', g: 'magenta', h: 'orange', i: 'purple' }
      t.setPalette({ colors, pages: [Object.keys(colors)] })
    })
    await openExtrasEditor(p)
    await restoreDefaults()
    // Index 4 is the transparent `u`, so pen 4 keeps SudokuPad's own; index 6 is the dark
    // blue-grey rgb(10 20 30), the darkest grey, so pen 6 is black.
    assert.deepEqual(await pickerValues(), ['#ae0000', '#0000ae', '#008700', OWN_PEN_HEX[3], '#aeae00', '#000000', '#00aeae', '#ae00ae', '#ae6f00'])
    assert.match(await editor().innerText(), /pen color 4 keeps SudokuPad's own/)
    await closeExtrasEditorWith(p, 'Cancel')
    await restorePalette()
  })

  it('pen buttons line up with the cell color page\'s buttons: a colored index 0 shifts nothing, and the darkest grey is black', async () => {
    // Index 0 holds a near-white color; pen N must take index N, whatever index 0 holds.
    const cells = ['rgb(250, 250, 250)', 'rgb(204, 51, 17)', 'rgb(17, 119, 51)', 'rgb(0, 68, 136)', 'rgb(187, 85, 0)', 'rgb(0, 153, 136)', 'rgb(100, 100, 100)', 'rgb(136, 136, 34)', 'rgb(238, 153, 170)', 'rgb(120, 80, 200)']
    // The pens for indexes 1-9: each cell color darkened (the grey at index 6 is the only
    // grey, so it is black), typed out as the expected result.
    const pens = ['#8d1a00', '#004f1d', '#002b5b', '#7e3700', '#00675b', '#000000', '#5b5b00', '#ad5f70', '#54249c']
    await read((cells) => {
      const t = Framework.app.tools.colour
      const colors = Object.fromEntries(cells.map((c, i) => ['k' + i, c]))
      t.setPalette({ colors, pages: [Object.keys(colors)] })
      t.setPage(0)
    }, cells)
    await openExtrasEditor(p)
    await restoreDefaults()
    await closeExtrasEditorWith(p, 'Save')
    await p.click('#control-colour')
    // A cell button shows the page's color at its data-key: its data-value names the color key,
    // and that key's `--cell-color-<key>` variable is the color it shows.
    const cellButtons = () => read(() => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
      const key = document.querySelector(`.tool-colour button[data-key="${n}"]`).dataset.value
      return window.getComputedStyle(document.documentElement).getPropertyValue(`--cell-color-${key}`).trim()
    }))
    assert.deepEqual(await settle(cellButtons, cells.slice(1)), cells.slice(1))
    await swatchesAre(pens)
    await restorePalette()
  })

  it('a saved page preset the palette no longer has stays shown, and cannot be picked, while the pages it has can be', async () => {
    await openExtrasEditor(p)
    await pickPreset('page-3')
    await closeExtrasEditorWith(p, 'Save')
    await read(() => {
      const colors = { a: 'rgb(200, 0, 0)', b: 'rgb(0, 0, 200)' }
      Framework.app.tools.colour.setPalette({ colors, pages: [Object.keys(colors)] })
    })
    await openExtrasEditor(p)
    assert.equal(await presetShown(), 'page-3')
    assert.deepEqual(await presetMenu().locator('option').evaluateAll((os) => os.map((o) => [o.value, o.disabled])), [['page-3', true], ['page-1', false], ['sudokupad', false]])
    assert.deepEqual(await pickerValues(), PAGE_PENS[2])
    await closeExtrasEditorWith(p, 'Cancel')
    await restorePalette()
    await read(([k, v]) => Framework.setData(k, v), [DATA_KEY, INSTALLED])
    await reload()
  })

  it('Save with no pick and no edit writes no colors', async () => {
    const elsewhere = { ...toObject(PAGE_PENS[1]), preset: 'page-2' }
    // Written behind the script's back, so a write by Save would show.
    await read(([k, v]) => Framework.setData(k, v), [DATA_KEY, elsewhere])
    await openExtrasEditor(p)
    await closeExtrasEditorWith(p, 'Save')
    assert.deepEqual(await saved(), elsewhere)
    await read(([k, v]) => Framework.setData(k, v), [DATA_KEY, INSTALLED])
    await reload()
  })

  it('corrupt saved settings are replaced by the install save with no thrown error', async () => {
    const errorsBefore = errors.length
    for (const bad of ['{not json', '"red"', '[1,2]', '{"4":"url(x)"}']) {
      await plantUnchecked(p, DATA_KEY, bad)
      await reload()
      assert.equal(await settle(() => swatch(4), rgbOf(PAGE_PENS[0][3])), rgbOf(PAGE_PENS[0][3]), bad)
      assert.deepEqual(await settle(saved, INSTALLED), INSTALLED, bad)
    }
    assert.deepEqual(errors.slice(errorsBefore), [])
  })

  describe('thickness', { concurrency: false }, () => {
    const slider = () => p.locator('#pen-tool-extras-thickness')
    const setThickness = (value) => setSlider(p, '#pen-tool-extras-thickness', value)
    const savedThickness = () => read((k) => Framework.getData(k), THICKNESS_KEY)
    const widths = (n) => async () => [...new Set(await read((n) => [...document.querySelectorAll(`#cell-pen .cell-pen.pencolor-${n}`)].map((e) => parseFloat(window.getComputedStyle(e).strokeWidth)), n))]
    const probeWidth = (value) => probeStrokeWidth(p, value, '#cell-pen')
    const FULL = ['1', '2', '5', '6', '7', '8', '9', 'a', 'd', 'e', 'f', 'g']
    const HALF = ['3', '4', 'b', 'c', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's']
    const allWidths = async () => ({
      full: [...new Set(await Promise.all(FULL.map(probeWidth)))],
      half: [...new Set(await Promise.all(HALF.map(probeWidth)))]
    })

    before(async () => {
      await read((k) => Framework.removeData(k), THICKNESS_KEY)
      await reload()
      await drawInFirstColumn(1, 7)
    })
    after(async () => { await read((k) => Framework.removeData(k), THICKNESS_KEY) })

    it('with nothing saved lines, circles and crosses are SudokuPad\'s 5 wide and every edge mark 2.5, and the slider runs 1 to 16 at 5', async () => {
      assert.deepEqual(await widths(1)(), [5])
      assert.deepEqual(await allWidths(), { full: [5], half: [2.5] })
      await openPenTool(p)
      assert.deepEqual(await slider().evaluate((el) => [el.min, el.max, el.step, el.value]), ['1', '16', '0.5', '5'])
    })

    it('moving the slider scales lines, circles, crosses and edge marks by one factor, live, and saves it with no Save', async () => {
      await setThickness(10)
      assert.deepEqual(await settle(widths(1), [10]), [10])
      assert.deepEqual(await allWidths(), { full: [10], half: [5] })
      assert.equal(await savedThickness(), 10)
      await setThickness(2)
      assert.deepEqual(await settle(widths(1), [2]), [2])
      assert.equal(await savedThickness(), 2)
    })

    it('a saved thickness leaves the saved colors alone, and a new line, a reload and the old lines all use it', async () => {
      await setThickness(9)
      assert.equal(await savedThickness(), 9)
      assert.deepEqual(await saved(), INSTALLED)
      assert.deepEqual(await settle(widths(1), [9]), [9])
      await drawInFirstColumn(2, 8)
      assert.deepEqual(await settle(widths(2), [9]), [9])
      await reload()
      assert.deepEqual(await saved(), INSTALLED)
      await swatchesAre(PAGE_PENS[0])
      await openPenTool(p)
      assert.equal(await slider().inputValue(), '9')
      await drawInFirstColumn(3, 9)
      assert.deepEqual(await settle(widths(3), [9]), [9])
    })

    it('the widths hold whichever stylesheet loads last', async () => {
      // The tool\'s own stylesheet is added again after the script\'s.
      await read(() => {
        const css = document.createElement('style')
        css.textContent = '.cell-pen { stroke-width: 5 } .pen-3, .pen-4, .pen-b, .pen-c { stroke-width: 2.5 }'
        document.head.appendChild(css)
      })
      assert.deepEqual(await allWidths(), { full: [9], half: [4.5] })
    })

    it('the buttons are one row under a divider: Save (filled purple), then Cancel and Restore defaults, plain, the same size', async () => {
      await openExtrasEditor(p)
      // All three in one read, so a dialog still moving into place cannot put them in different frames.
      const [save, cancel, restore] = await p.evaluate(() => ['Save', 'Cancel', 'Restore defaults'].map((text) => {
        const el = [...document.querySelectorAll('.dialog button')].find((b) => b.textContent.trim() === text)
        const box = el.getBoundingClientRect()
        const style = window.getComputedStyle(el)
        return { x: box.x, y: Math.round(box.y + box.height / 2), height: Math.round(box.height), background: style.backgroundColor }
      }))
      assert.deepEqual([restore.y, cancel.y].map((y) => Math.abs(y - save.y) <= 3), [true, true], 'one row')
      assert.equal(save.x < cancel.x && cancel.x < restore.x, true, 'Save, Cancel, Restore defaults from the left')
      assert.deepEqual([cancel.height, restore.height], [save.height, save.height])
      assert.equal(save.background, 'rgb(107, 63, 160)', 'Save is filled purple')
      assert.deepEqual([cancel.background, restore.background], ['rgb(241, 239, 245)', 'rgb(241, 239, 245)'], 'Cancel and Restore defaults are plain')
      const row = await dialogButton(p, 'Save').evaluate((el) => {
        const options = el.parentElement
        const style = window.getComputedStyle(options)
        return { top: style.borderTopWidth, flex: style.display }
      })
      assert.deepEqual(row, { top: '1px', flex: 'flex' }, 'a divider above the row')
      await closeExtrasEditorWith(p, 'Cancel')
    })

    it('corrupt saved thickness falls back to 5, the settings entry still opens the dialog, and nothing throws', async () => {
      const errorsBefore = errors.length
      for (const bad of ['{not json', '"9"', '99', '0', '2.25', '[7]', 'null']) {
        await plantUnchecked(p, THICKNESS_KEY, bad)
        await reload()
        assert.deepEqual(await settle(allWidths, { full: [5], half: [2.5] }), { full: [5], half: [2.5] }, bad)
        // A startup that threw would stop before it added the settings entry.
        await openExtrasEditor(p)
        await closeExtrasEditorWith(p, 'Cancel')
        await openPenTool(p)
        assert.equal(await slider().inputValue(), '5', bad)
      }
      assert.deepEqual(errors.slice(errorsBefore), [])
    })
  })

  describe('holding a pen color button', { concurrency: false }, () => {
    const pickers = () => p.locator('.tool-pen .pen-tool-extras-picker input')
    const pickerCount = () => pickers().count()
    const penPickerValues = () => pickers().evaluateAll((es) => es.map((e) => e.value))
    const undoDepth = () => read(() => Framework.app.puzzle.undoStack.length)
    const button = (n) => p.locator(`.tool-pen button[data-value="${n}"]`)
    const centre = async (locator) => {
      const box = await locator.boundingBox()
      return [box.x + box.width / 2, box.y + box.height / 2]
    }
    const press = async (n, which) => {
      await openPenTool(p)
      const [x, y] = await centre(button(n))
      await p.mouse.move(x, y)
      await p.mouse.down({ button: which })
    }
    const holdToOpen = async (n, which = 'left') => {
      await press(n, which)
      assert.equal(await settle(pickerCount, 9, HOLD_WAIT_MS, HOLD_QUIET_MS), 9)
      await p.mouse.up({ button: which })
    }
    const leaveEditMode = async () => {
      if (await pickerCount() === 0) return
      await press(4, 'left')
      assert.equal(await settle(pickerCount, 0, HOLD_WAIT_MS, HOLD_QUIET_MS), 0)
      await p.mouse.up()
    }
    const editModeOn = () => p.locator('.tool-pen.pen-tool-extras-editing').count()
    // Dispatches a cancelable contextmenu on the first element matching `selector` and says
    // whether the page left it alone (dispatchEvent returns false when preventDefault ran).
    const menuAllowed = (selector) => read((sel) => document.querySelector(sel).dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })), selector)

    before(async () => {
      await read((k) => Framework.removeData(k), DATA_KEY)
      await setCellColorPage(2)
      await reload()
    })

    for (const which of ['left', 'right']) {
      it(`a ${which}-button hold shows a picker over each of the nine buttons, in the swatch colors, and adds no undo entry or stroke`, async () => {
        const depth = await undoDepth()
        const drawn = await strokeCount()
        await press(4, which)
        // A "nothing happened yet" check, so it is a sleep: well before the hold ends, no picker.
        await sleep(HOLD_TO_EDIT_MS / 3)
        assert.equal(await pickerCount(), 0)
        assert.equal(await settle(pickerCount, 9, HOLD_WAIT_MS, HOLD_QUIET_MS), 9)
        await p.mouse.up({ button: which })
        assert.deepEqual(await pickers().evaluateAll((es) => es.map((e) => e.dataset.key)), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
        assert.deepEqual(await penPickerValues(), PAGE_PENS[0])
        assert.equal(await undoDepth(), depth)
        assert.equal(await strokeCount(), drawn)
        await leaveEditMode()
      })
    }

    it('a click, or a hold released early, selects the pen color and opens nothing', async () => {
      await press(5, 'left')
      await p.mouse.up()
      assert.equal(await settle(() => read(() => document.querySelector('.tool-pen button.current').dataset.value), '5'), '5')
      await press(6, 'left')
      await sleep(HOLD_TO_EDIT_MS / 2)
      await p.mouse.up()
      // A "nothing happened" check: the full delay passes after the release with no picker.
      await sleep(HOLD_TO_EDIT_MS)
      assert.equal(await pickerCount(), 0)
      assert.equal(await read(() => document.querySelector('.tool-pen button.current').dataset.value), '6')
    })

    it('the context menu is suppressed during a hold on a pen color button, and not over the undo button or a quick press', async () => {
      const button4 = '.tool-pen button[data-value="4"]'
      // A quick press (released before the delay) keeps its menu.
      await press(4, 'right')
      await p.mouse.up({ button: 'right' })
      assert.equal(await menuAllowed(button4), true)
      // Press still going: the menu is suppressed over the held button, and only there.
      await press(4, 'right')
      assert.equal(await menuAllowed(button4), false)
      assert.equal(await menuAllowed('#control-undo'), true)
      assert.equal(await menuAllowed('.tool-pen button[data-control="delete"]'), true)
      // The hold has run its course and the button is released over a picker, where Windows
      // opens the menu: it is suppressed there, and no longer once a later press starts elsewhere.
      assert.equal(await settle(pickerCount, 9, HOLD_WAIT_MS, HOLD_QUIET_MS), 9)
      await p.mouse.up({ button: 'right' })
      assert.equal(await menuAllowed('.tool-pen .pen-tool-extras-picker input'), false)
      await leaveEditMode()
      await p.mouse.click(1, 1)
      assert.equal(await menuAllowed(button4), true)
    })

    it('a real right-click hold raises the page\'s contextmenu event with its default prevented', async () => {
      const menus = []
      await p.exposeFunction('__recordMenu', (prevented) => menus.push(prevented))
      await read(() => {
        window.__menuListener = (e) => window.__recordMenu(e.defaultPrevented)
        window.addEventListener('contextmenu', window.__menuListener)
      })
      try {
        await holdToOpen(4, 'right')
        // Chromium raises the event on press on Linux and on release on Windows; either way
        // at least one must have come, and none may have been left to open the menu.
        assert.equal(await settle(() => menus.length > 0, true), true)
        assert.deepEqual(menus.filter((prevented) => !prevented), [])
      } finally {
        await read(() => window.removeEventListener('contextmenu', window.__menuListener))
      }
      await leaveEditMode()
    })

    it('a picker input event alone recolors the swatch and strokes live and saves the whole set; the dialog shows it', async () => {
      await drawInFirstColumn(4, 7)
      await holdToOpen(4)
      const depth = await undoDepth()
      // Only an `input` event, no `change`: the color must apply while the picker is still open.
      await read((hex) => {
        const el = document.querySelector('.tool-pen .pen-tool-extras-picker input[data-key="4"]')
        el.value = hex
        el.dispatchEvent(new window.Event('input', { bubbles: true }))
      }, FOUR.hex)
      assert.equal(await settle(() => swatch(4), FOUR.rgb), FOUR.rgb)
      assert.deepEqual(await settle(allStrokes(4), [FOUR.rgb]), [FOUR.rgb])
      assert.deepEqual(await saved(), { ...toObject(PAGE_PENS[0]), 4: FOUR.hex })
      // The edit saves the colors only: no thickness is written, and the lines keep SudokuPad's 5.
      assert.equal(await read((k) => Framework.getData(k), THICKNESS_KEY), null)
      assert.equal(await read(() => window.getComputedStyle(document.querySelector('#cell-pen .cell-pen.pencolor-4:not(.pen-5)')).strokeWidth), '5px')
      assert.equal(await undoDepth(), depth)
      await leaveEditMode()
      await openExtrasEditor(p)
      assert.deepEqual(await pickerValues(), Object.values({ ...toObject(PAGE_PENS[0]), 4: FOUR.hex }))
      assert.equal(await presetShown(), 'custom', 'a hold-to-edit change is Custom')
      await closeExtrasEditorWith(p, 'Cancel')
    })

    it('the edit is kept after a reload, and a change of color page leaves it', async () => {
      await reload()
      assert.deepEqual(await saved(), { ...toObject(PAGE_PENS[0]), 4: FOUR.hex })
      await swatchesAre(Object.values({ ...toObject(PAGE_PENS[0]), 4: FOUR.hex }))
      await setCellColorPage(0)
      assert.equal(await swatch(4), FOUR.rgb)
      await setCellColorPage(2)
    })

    it('a press in the settings dialog opened from the panel ends edit mode, and is swallowed, then the dialog\'s Restore defaults and Save work', async () => {
      await holdToOpen(4)
      await p.click('.pen-tool-extras-settings')
      await p.locator(EXTRAS_EDITOR).waitFor({ state: 'visible' })
      assert.equal(await editModeOn(), 1, 'the panel\'s own button keeps edit mode')
      await restoreDefaults()
      assert.equal(await settle(editModeOn, 0), 0)
      // The press that ended edit mode and its click were swallowed, so Restore defaults has not run yet.
      assert.equal((await saved()).preset, undefined)
      await restoreDefaults()
      await closeExtrasEditorWith(p, 'Save')
      assert.deepEqual(await saved(), INSTALLED)
    })

    it('a second hold leaves edit mode, and so does leaving the pen tool', async () => {
      await holdToOpen(4)
      await press(4, 'left')
      assert.equal(await settle(pickerCount, 0, HOLD_WAIT_MS, HOLD_QUIET_MS), 0)
      await p.mouse.up()
      assert.equal(await p.locator('.tool-pen.pen-tool-extras-editing').count(), 0)
      await holdToOpen(4)
      await p.click('#control-colour')
      await openPenTool(p)
      assert.equal(await pickerCount(), 0)
      assert.equal(await p.locator('.tool-pen.pen-tool-extras-editing').count(), 0)
    })

    it('Escape ends edit mode', async () => {
      await holdToOpen(4)
      await p.keyboard.press('Escape')
      assert.equal(await settle(editModeOn, 0), 0)
      assert.equal(await pickerCount(), 0)
    })

    it('a press on the board ends edit mode and does nothing else: no stroke, no undo entry', async () => {
      await holdToOpen(4)
      const depth = await undoDepth()
      const drawn = await strokeCount()
      const selectedBefore = await p.evaluate(() => Framework.app.puzzle.selectedCells.map((c) => `${c.row},${c.col}`))
      const [x, y] = await gridPoint(p, [4, 4])
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.up()
      assert.equal(await settle(editModeOn, 0), 0)
      assert.equal(await pickerCount(), 0)
      assert.equal(await undoDepth(), depth)
      assert.equal(await strokeCount(), drawn)
      assert.deepEqual(await p.evaluate(() => Framework.app.puzzle.selectedCells.map((c) => `${c.row},${c.col}`)), selectedBefore)
    })

    it('a press on another color button in the panel keeps edit mode on', async () => {
      await holdToOpen(4)
      const [x, y] = await centre(button(5))
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.up()
      assert.equal(await editModeOn(), 1)
      assert.equal(await pickerCount(), 9)
      await leaveEditMode()
    })

    it('left Alt held with the pen current is edit mode, and releasing it ends it', async () => {
      await openPenTool(p)
      await p.keyboard.down('Alt')
      assert.equal(await settle(pickerCount, 9), 9)
      await p.keyboard.up('Alt')
      assert.equal(await settle(pickerCount, 0), 0)
      assert.equal(await editModeOn(), 0)
    })

    it('turning the pen page ends edit mode', async () => {
      await holdToOpen(4)
      await p.keyboard.press('Tab')
      assert.equal(await settle(editModeOn, 0), 0)
      assert.equal(await pickerCount(), 0)
      await p.keyboard.press('Tab')
      await p.keyboard.press('Tab')
    })

    it('the window losing focus ends edit mode', async () => {
      await holdToOpen(4)
      // The headless page has no window to take focus away from, so the event SudokuPad's own edit mode listens for is dispatched.
      await p.evaluate(() => window.dispatchEvent(new window.Event('blur')))
      assert.equal(await settle(editModeOn, 0), 0)
      assert.equal(await pickerCount(), 0)
    })

    // Set PEN_COLOR_SHOT to a path to save the screenshot kept in docs/research/.
    it('edit mode, screenshot', { skip: !process.env.PEN_COLOR_SHOT }, async () => {
      await holdToOpen(4)
      await p.locator('.tool-pen').first().screenshot({ path: process.env.PEN_COLOR_SHOT })
    })

    // Runs before the checks after this group, whether or not the screenshot ran.
    after(async () => {
      await leaveEditMode()
      // Put back the installed colors for the checks below.
      await read((k) => Framework.removeData(k), DATA_KEY)
      await reload()
      assert.deepEqual(await settle(saved, INSTALLED), INSTALLED)
    })
  })

  it('the settings entry sits in the Experimental group under its plain name, and its dialog shows the version from the script header as small text', async () => {
    const group = await openSettings(p)
    const entry = group.locator('button').filter({ hasText: 'Pen Tool Extras' })
    assert.equal((await entry.textContent()).trim(), 'Pen Tool Extras')
    await entry.click()
    await editor().waitFor({ state: 'visible' })
    assert.equal((await p.locator('.dialog b').first().textContent()).trim(), 'Pen Tool Extras')
    assert.equal((await p.locator('.dialog small').textContent()).trim(), `v${headerVersion(script)}`)
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

describe('the color tool is not ready yet', { concurrency: false }, () => {
  it('the pens show SudokuPad\'s own colors and nothing is saved while it waits; after 10 s the color save is skipped with a named warning; the dialog offers only SudokuPad colors; a palette that comes later is not saved over them', async () => {
    const { context, p, errors } = await openPage(browser, { expectedSkips: [/^pen-tool-extras: color save skipped because/] })
    const warned = []
    p.on('console', (m) => { if (m.type() === 'warning' && /^pen-tool-extras: /.test(m.text())) warned.push(m.text()) })
    try {
      await startPuzzle(p)
      await removePalette(p)
      await p.addScriptTag({ content: script })
      await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
      // The wait ends at 10 s: wait for the one warning instead of sleeping past it. A save during the wait would still be stored, so the checks below see it.
      assert.equal(await settle(() => warned.length, 1, COLOR_TOOL_TIMEOUT_MS + 10000, Infinity), 1, warned.join('\n'))
      const pens = () => p.evaluate(() => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => window.getComputedStyle(document.documentElement).getPropertyValue(`--puzzle-pencolor-${n}`).trim()))
      assert.deepEqual(await pens(), OWN_PEN_HEX)
      assert.equal(await p.evaluate((k) => Framework.getData(k), DATA_KEY), null)
      assert.equal(warned.length, 1, warned.join('\n'))
      assert.match(warned[0], new RegExp(`^pen-tool-extras: color save skipped because SudokuPad changed: .*the color tool not ready after ${COLOR_TOOL_TIMEOUT_MS} ms`))
      await openExtrasEditor(p)
      const editor = p.locator('#pen-tool-extras-editor')
      assert.deepEqual(await editor.locator('input[type=color]').evaluateAll((es) => es.map((e) => e.value)), OWN_PEN_HEX)
      // The unsaved colors are shown first and cannot be picked, so SudokuPad colors stays pickable.
      assert.deepEqual(await editor.locator('select[data-role="color-choice"] option').evaluateAll((os) => os.map((o) => [o.value, o.disabled])), [['unsaved', true], ['sudokupad', false]])
      assert.equal(await editor.locator('select[data-role="color-choice"]').evaluate((el) => el.value), 'unsaved')
      // With no page 1 to read, Restore defaults gives SudokuPad colors.
      await dialogButton(p, 'Restore defaults').click()
      assert.equal(await editor.locator('select[data-role="color-choice"]').evaluate((el) => el.value), 'sudokupad')
      await closeExtrasEditorWith(p, 'Cancel')
      await putBackRemovedPalette(p)
      // The save gave up, so a palette that comes late saves nothing until the next page load. The check is that nothing happens, so this one is a sleep past the 100 ms poll.
      await sleep(1500)
      assert.equal(await p.evaluate((k) => Framework.getData(k), DATA_KEY), null)
      assert.deepEqual(await pens(), OWN_PEN_HEX)
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })

  it('picking SudokuPad colors and saving while the script waits outranks the install save', async () => {
    const { context, p } = await openPage(browser)
    try {
      await startPuzzle(p)
      await removePalette(p)
      await p.addScriptTag({ content: script })
      await openExtrasEditor(p)
      await p.locator('#pen-tool-extras-editor select[data-role="color-choice"]').selectOption('sudokupad')
      await closeExtrasEditorWith(p, 'Save')
      const own = { ...toObject(OWN_PEN_HEX), preset: 'sudokupad' }
      assert.deepEqual(await p.evaluate((k) => Framework.getData(k), DATA_KEY), own)
      await putBackRemovedPalette(p)
      // The script polls every 100ms, so by 1.5s it has seen the tool and decided; the check is that nothing then replaced the saved colors.
      await sleep(1500)
      assert.deepEqual(await p.evaluate((k) => Framework.getData(k), DATA_KEY), own)
    } finally {
      await context.close()
    }
  })

  it('the install save arriving after a thickness is set in the panel leaves the thickness in place', async () => {
    const { context, p } = await openPage(browser)
    try {
      await startPuzzle(p)
      await removePalette(p)
      await p.addScriptTag({ content: script })
      await p.evaluate(() => Framework.setSetting('toolpen', true))
      await p.locator('#control-pen').waitFor({ state: 'visible' })
      await setSlider(p, '#pen-tool-extras-thickness', 11)
      await putBackRemovedPalette(p)
      // The script polls every 100 ms and then saves darker page 1; wait for it.
      const pen1 = () => p.evaluate(() => window.getComputedStyle(document.documentElement).getPropertyValue('--puzzle-pencolor-1').trim())
      assert.equal(await settle(pen1, PAGE_PENS[0][0]), PAGE_PENS[0][0])
      assert.equal(await probeStrokeWidth(p, 1, '#svgrenderer'), 11)
    } finally {
      await context.close()
    }
  })

  it('a save made while the script waits for the color tool outranks the install save', async () => {
    const { context, p } = await openPage(browser)
    try {
      await startPuzzle(p)
      await removePalette(p)
      await p.addScriptTag({ content: script })
      await openExtrasEditor(p)
      await p.locator('#pen-tool-extras-editor input[data-key="4"]').fill(FOUR.hex)
      await closeExtrasEditorWith(p, 'Save')
      await putBackRemovedPalette(p)
      // The script polls every 100ms, so by 1.5s it has seen the tool and decided; the check is
      // that nothing then replaced the saved colors.
      await sleep(1500)
      const pens = await p.evaluate(() => [1, 4].map((n) => window.getComputedStyle(document.documentElement).getPropertyValue(`--puzzle-pencolor-${n}`).trim()))
      assert.deepEqual(pens, [OWN_PEN_HEX[0], FOUR.hex])
      assert.deepEqual(await p.evaluate((k) => Framework.getData(k), DATA_KEY), { ...toObject(OWN_PEN_HEX), 4: FOUR.hex })
    } finally {
      await context.close()
    }
  })
})
