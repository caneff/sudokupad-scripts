// Live attacks on pen-tool-extras.user.js (#590's predefined attacks 35 to 41, #598): odd orders a solver produces, on sudokupad.app in
// headless Chromium. Each test names its attack, and asserts the crash signals (no page error, no console error, no skip line) beside
// what a user expects to see. All input is real mouse and keyboard input.
/* global Framework, ToolPen */
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { captureConsoleErrors, drawnWidth, gotoPuzzle, openPage, restartPuzzle, startPuzzle } from '../page.mjs'
import { closeExtrasEditorWith, effectiveOpacities, openExtrasEditor } from '../settings.mjs'
import { cellCentre, goToPenPage, mouseDrag, openPenTool, PAGE_ONE, PAGE_THREE, PAGE_TWO, penEntries, setInputValue } from '../pen.mjs'
import { readUntil, settle } from '../settle.mjs'

const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')

const EDITOR = '#pen-tool-extras-editor'
const LINE_MODE_BUTTON = '[data-control="penlinemode-step"]'
const THICKNESS = '#pen-tool-extras-thickness'
const OPACITY = '#pen-tool-extras-opacity'
// The pen tool's three pages of nine colors, and the columns a line on each page takes in a row of its own.
const PAGES = [[PAGE_ONE, 0], [PAGE_TWO, 3], [PAGE_THREE, 6]]
// The center mark values in cycle order: circle, cross, dot, then empty.
const CELL_CYCLE = ['5', '6', 'z']
const CELL = [4, 4]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('attacks on Pen Tool Extras', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const undoDepth = () => read(() => Framework.app.puzzle.undoStack.length)
  const penCount = () => read(() => document.querySelectorAll('#cell-pen .cell-pen').length)
  const editor = () => p.locator(EDITOR)
  const undoAll = async () => {
    while ((await undoDepth()) > 0) {
      const depth = await undoDepth()
      await p.click('#control-undo')
      assert.equal(await settle(async () => (await undoDepth()) < depth, true), true, 'an undo takes a step')
    }
  }
  const penStrokes = () => read(() => [...document.querySelectorAll('#cell-pen .cell-pen')].map((g) => ({ cls: g.getAttribute('class'), dash: window.getComputedStyle(g).strokeDasharray, arrows: g.querySelectorAll('[data-arrow-line-part]').length })))
  const noDialog = async () => { if (await editor().count()) await closeExtrasEditorWith(p, 'Cancel') }
  const stored = (keys) => read((list) => list.map((k) => Framework.getData(k)), keys)
  const SAVED_KEYS = ['PenColor_thickness', 'PenColor_opacity', 'PenColor_dash', 'PenColor_arrowspacing', 'PenColor_outlinewidth', 'PenColor_outline', 'PenColor_linestyles', 'PenColor_sliders', 'PenColor_middleerase', 'PenColor_colors', 'PenColor_pen', 'EdgeMarks_marks', 'ToolPen_linemode']

  const boot = async () => {
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
    await read(() => { Framework.setSetting('toolpen', true) })
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await openPenTool(p)
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { seed: captureConsoleErrors }))
    await boot()
  })
  after(async () => { await context?.close() })

  // Every attack starts on an empty puzzle with the pen tool open and default settings, and ends with the crash signals clean.
  beforeEach(async () => {
    await noDialog()
    await restartPuzzle(p)
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), SAVED_KEYS)
    await p.mouse.click(5, 5)
    await openPenTool(p)
  })
  afterEach(async () => {
    await noDialog()
    assert.deepEqual(errors.splice(0), [], 'no page error, console error or skip line')
  })

  // A line along row `row` (0 to 8) from column `col` to two columns right, in cell middles.
  const lineIn = (row, col) => mouseDrag(p, [[row + 0.5, col + 0.5], [row + 0.5, col + 2.5]])

  it('attack 35: a line on every pen page in every color, then undo all', async () => {
    let drawn = 0
    for (const [values, col] of PAGES) {
      await goToPenPage(p, values)
      for (let key = 1; key <= 9; key++) {
        await p.locator(`.tool-pen button[data-key="${key}"]`).click()
        await lineIn(key - 1, col)
        drawn++
        assert.equal(await settle(async () => (await penCount()) >= drawn, true), true, `page ${values}, color ${key} drew a line`)
      }
    }
    const strokes = await penStrokes()
    assert.equal(new Set(strokes.map((s) => s.cls)).size, 27, '27 distinct pen classes: 3 pages by 9 colors')
    const onPage = (values) => strokes.filter((s) => values.includes(s.cls.match(/pencolor-(\S+)/)[1]))
    assert.equal(onPage(PAGE_ONE).length > 0 && onPage(PAGE_ONE).every((s) => s.dash === 'none' && s.arrows === 0), true, 'page 1 lines are plain')
    assert.equal(onPage(PAGE_TWO).length > 0 && onPage(PAGE_TWO).every((s) => s.dash !== 'none'), true, 'page 2 lines are dashed')
    assert.equal(onPage(PAGE_THREE).length > 0 && onPage(PAGE_THREE).every((s) => s.arrows > 0), true, 'page 3 lines have arrows')
    assert.equal(strokes.some((s) => s.arrows > 0), true, 'the arrow page drew arrows')
    await undoAll()
    assert.deepEqual(await settle(() => penEntries(p), []), [], 'nothing stored after undoing all')
    assert.equal(await settle(penCount, 0), 0, 'nothing drawn after undoing all')
  })

  it('attack 36: a center mark cycles circle, cross, dot, empty, and undo all takes each step back', async () => {
    const [x, y] = await cellCentre(p, ...CELL)
    await goToPenPage(p, PAGE_ONE)
    await p.locator('.tool-pen button[data-key="1"]').click()
    const marks = () => read(([r, c]) => Framework.app.puzzle.cells.find((cell) => cell.row === r && cell.col === c).pen.map((v) => v[0]), CELL)
    for (const want of [...CELL_CYCLE.map((v) => [v]), []]) {
      await p.mouse.click(x, y)
      assert.deepEqual(await settle(marks, want), want, `the cycle reaches ${JSON.stringify(want)}`)
      assert.equal(await settle(penCount, want.length), want.length, 'what is drawn follows')
    }
    // Four steps forward; each undo goes one step back along the cycle.
    for (const want of [['z'], ['6'], ['5'], []]) {
      await p.click('#control-undo')
      assert.deepEqual(await settle(marks, want), want, `undo reaches ${JSON.stringify(want)}`)
      assert.equal(await settle(penCount, want.length), want.length)
    }
    assert.equal(await undoDepth(), 0)
  })

  it('attack 37: erase a long connected line with a right click, then undo and redo', async () => {
    await goToPenPage(p, PAGE_ONE)
    await p.locator('.tool-pen button[data-key="3"]').click()
    await mouseDrag(p, [[0.5, 0.5], [0.5, 4.5], [4.5, 4.5], [4.5, 8.5], [8.5, 8.5]])
    const line = await readUntil(() => penEntries(p), (entries) => entries.length > 5)
    const drawn = await penCount()
    const [x, y] = await cellCentre(p, 0, 2)
    await p.mouse.move(x, y)
    await p.mouse.click(x, y, { button: 'right' })
    assert.deepEqual(await settle(() => penEntries(p), []), [], 'one right click erased the whole connected line')
    assert.equal(await settle(penCount, 0), 0)
    await p.mouse.click(5, 5)
    await p.click('#control-undo')
    assert.deepEqual(await settle(() => penEntries(p), line), line, 'one undo brings the whole line back')
    assert.equal(await settle(penCount, drawn), drawn)
    await p.click('#control-redo')
    assert.deepEqual(await settle(() => penEntries(p), []), [], 'redo erases it again')
    assert.equal(await settle(penCount, 0), 0)
  })

  it('attack 38: change the line mode through all three mid-solve, drawing after each', async () => {
    await goToPenPage(p, PAGE_ONE)
    await p.locator('.tool-pen button[data-key="1"]').click()
    const mode = async () => (await read(() => ToolPen.tool.lineMode)) ?? 'both'
    // Center lines run from cell middle to cell middle; edge lines run along the middles of cell sides.
    const lines = {
      both: [[0.5, 0.5], [0.5, 2.5]],
      centeronly: [[2.5, 0.5], [2.5, 2.5]],
      edgeonly: [[4.5, 1], [4.5, 3]]
    }
    const drawIn = async (want, points) => {
      assert.equal(await mode(), want)
      const before = (await penEntries(p)).length
      await mouseDrag(p, points)
      assert.equal(await settle(async () => (await penEntries(p)).length > before, true), true, `a line is drawn in ${want} mode`)
    }
    await drawIn('both', lines.both)
    for (const want of ['centeronly', 'edgeonly']) {
      await p.click(LINE_MODE_BUTTON)
      assert.equal(await settle(mode, want), want, `the button steps to ${want}`)
      await drawIn(want, lines[want])
    }
    await p.click(LINE_MODE_BUTTON)
    assert.equal(await settle(mode, 'both'), 'both', 'the button steps back to Center & Edge')
    await drawIn('both', [[6.5, 0.5], [6.5, 2.5]])
  })

  it('attack 39: Thickness and Opacity at their limits, drawing marks and lines at each', async () => {
    const widthOfLine = async () => (await read(() => [...document.querySelectorAll('#cell-pen .cell-pen')].map((g) => { const s = window.getComputedStyle(g); return { strokeWidth: s.strokeWidth, transform: s.transform } }))).map(drawnWidth)
    const seen = {}
    for (const [name, thickness, opacity] of [['min', 1, 20], ['max', 16, 100]]) {
      await restartPuzzle(p)
      await openPenTool(p)
      await goToPenPage(p, PAGE_ONE)
      await p.locator('.tool-pen button[data-key="2"]').click()
      await setInputValue(p.locator(THICKNESS), thickness)
      await setInputValue(p.locator(OPACITY), opacity)
      await lineIn(1, 1)
      const lineCount = await settle(async () => (await penCount()) > 0, true).then(() => penCount())
      const [x, y] = await cellCentre(p, ...CELL)
      await p.mouse.click(x, y)
      assert.equal(await settle(penCount, lineCount + 1), lineCount + 1, `${name}: a line and a cell mark are drawn`)
      const widths = await widthOfLine()
      assert.equal(widths.every((w) => w > 0 && Number.isFinite(w)), true, `${name}: every stroke has a positive width, got ${widths}`)
      const opacities = [...new Set(await effectiveOpacities(p, '#cell-pen .cell-pen'))]
      assert.deepEqual(opacities, [opacity / 100], `${name}: drawn at the slider's opacity`)
      seen[name] = Math.max(...widths)
    }
    assert.equal(seen.max > seen.min, true, `max thickness draws wider than min: ${seen.max} vs ${seen.min}`)
    assert.equal(await read(() => Number(document.querySelector('#pen-tool-extras-thickness').value)), 16)
    assert.equal(await read(() => Number(document.querySelector('#pen-tool-extras-opacity').value)), 100)
  })

  // Every range and checkbox in the dialog, with the value to change it to.
  const changeEveryValue = () => editor().evaluate((root) => {
    const changes = []
    for (const el of root.querySelectorAll('input[type=range]')) {
      const to = el.value === el.max ? el.min : el.max
      el.value = to
      el.dispatchEvent(new Event('input', { bubbles: true }))
      changes.push([el.dataset.setting, Number(to)])
    }
    for (const el of root.querySelectorAll('input[type=checkbox]')) {
      el.click()
      changes.push([el.dataset.box, el.checked])
    }
    return changes
  })
  const dialogValues = () => editor().evaluate((root) => Object.fromEntries([...root.querySelectorAll('input[type=range], input[type=checkbox]')].map((el) => [el.dataset.setting || el.dataset.box, el.type === 'range' ? Number(el.value) : el.checked])))

  it('attack 40: change every value and Cancel, then change and Save, then reload', async () => {
    await openExtrasEditor(p)
    const defaults = await dialogValues()
    await changeEveryValue()
    const changed = await dialogValues()
    assert.notDeepEqual(changed, defaults, 'the values changed in the dialog')
    await closeExtrasEditorWith(p, 'Cancel')
    assert.deepEqual(await stored(SAVED_KEYS), SAVED_KEYS.map(() => null), 'Cancel saves nothing')
    await openExtrasEditor(p)
    assert.deepEqual(await dialogValues(), defaults, 'the dialog opens again with the values as they were')
    await changeEveryValue()
    assert.deepEqual(await dialogValues(), changed)
    await closeExtrasEditorWith(p, 'Save')
    assert.notDeepEqual(await stored(SAVED_KEYS), SAVED_KEYS.map(() => null), 'Save saved')
    await gotoPuzzle(p)
    await boot()
    await openExtrasEditor(p)
    assert.deepEqual(await dialogValues(), changed, 'after a reload the dialog shows the saved values')
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('attack 41: with the settings dialog open, Escape, Enter and a click outside it', async () => {
    const thickness = () => read(() => Framework.getData('PenColor_thickness'))
    // Escape closes it and saves nothing.
    await openExtrasEditor(p)
    await setInputValue(editor().locator('input[data-setting="thickness"]'), 9)
    await p.keyboard.press('Escape')
    await editor().waitFor({ state: 'detached' })
    assert.equal(await thickness(), null, 'Escape saved nothing')
    // A click outside closes it and saves nothing.
    await openExtrasEditor(p)
    await setInputValue(editor().locator('input[data-setting="thickness"]'), 9)
    await p.mouse.click(5, 5)
    await editor().waitFor({ state: 'detached' })
    assert.equal(await thickness(), null, 'a click outside saved nothing')
    // Enter leaves the dialog open and unsaved, and the dialog still works.
    await openExtrasEditor(p)
    await setInputValue(editor().locator('input[data-setting="thickness"]'), 9)
    await p.keyboard.press('Enter')
    await p.waitForTimeout(300) // "nothing happened in 300 ms" check
    assert.equal(await editor().count(), 1, 'Enter leaves the dialog open')
    assert.equal(await thickness(), null, 'Enter saved nothing')
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await thickness(), 9, 'Save still saves after the Enter')
  })
})
