// Live attacks on pen-tool-extras.user.js: odd orders a solver produces, on sudokupad.app in headless Chromium. Each test names its attack, and asserts the
// crash signals (no page error, no console error, no skip line) beside what a user expects to see. Clicks, drags and key presses are real input; the
// harness restarts the puzzle, sets slider values and reads state from the page.
/* global Framework, ToolPen */
import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as extras from './pen-tool-extras-fixtures.mjs'
import { captureConsoleErrors, drawnWidth } from '../page.mjs'
import { closeExtrasEditorWith, effectiveOpacities, EXTRAS_EDITOR, openExtrasEditor } from '../settings.mjs'
import { cellCentre, mouseDrag, undoAll } from '../board.mjs'
import { goToPenPage, PAGE_ONE, PAGE_THREE, PAGE_TWO, penDrawnCount, penEntries, penValuesAt, setInputValue } from '../pen.mjs'
import { readUntil, settle, stable } from '../settle.mjs'
import { useBrowser } from '../session.mjs'

const LINE_MODE_BUTTON = '[data-control="penlinemode-step"]'
const THICKNESS = '#pen-tool-extras-thickness'
const OPACITY = '#pen-tool-extras-opacity'
const THICKNESS_LIMITS = { min: 1, max: 16 }
const OPACITY_LIMITS = { min: 20, max: 100 }
const DIALOG_THICKNESS = `${EXTRAS_EDITOR} input[data-setting="thickness"]`
// The pen tool's three pages of nine colors, and the columns a line on each page takes in a row of its own.
const PAGES = [[PAGE_ONE, 0], [PAGE_TWO, 3], [PAGE_THREE, 6]]
// The cell mark values in cycle order: circle, cross, dot, then empty.
const CELL_CYCLE = ['5', '6', 'z']
const CELL = [4, 4]

const browser = useBrowser()

describe('attacks on Pen Tool Extras', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const editor = () => p.locator(EXTRAS_EDITOR)
  const penStrokes = () => read(() => [...document.querySelectorAll('#cell-pen .cell-pen')].map((g) => ({ cls: g.getAttribute('class'), dash: window.getComputedStyle(g).strokeDasharray, arrows: g.querySelectorAll('[data-arrow-line-part]').length })))
  const stored = (keys) => read((list) => list.map((k) => Framework.getData(k)), keys)
  const SAVED_KEYS = ['PenColor_thickness', 'PenColor_opacity', 'PenColor_dash', 'PenColor_arrowspacing', 'PenColor_outlinewidth', 'PenColor_outline', 'PenColor_linestyles', 'PenColor_sliders', 'PenColor_middleerase', 'PenColor_colors', 'PenColor_pen', 'EdgeMarks_marks', 'ToolPen_linemode']
  const lineMode = () => read(() => ToolPen.tool.lineMode)

  // Every attack gets its own page with the script installed, default settings and the pen tool open, and ends with the crash signals clean.
  beforeEach(async () => {
    ;({ context, p, errors } = await extras.open(browser(), { seed: captureConsoleErrors }))
  })
  afterEach(async () => {
    try {
      assert.deepEqual(errors, [], 'no page error, console error or skip line')
    } finally {
      await context?.close()
    }
  })

  const lineIn = (row, col) => mouseDrag(p, [[row + 0.5, col + 0.5], [row + 0.5, col + 2.5]])

  it('attack 35: a line on every pen page in every color, then undo all', async () => {
    let drawn = 0
    for (const [values, col] of PAGES) {
      await goToPenPage(p, values)
      for (let key = 1; key <= 9; key++) {
        await p.locator(`.tool-pen button[data-key="${key}"]`).click()
        await lineIn(key - 1, col)
        drawn++
        assert.equal(await settle(async () => (await penDrawnCount(p)) >= drawn, true), true, `page ${values}, color ${key} drew a line`)
      }
    }
    const strokes = await penStrokes()
    assert.equal(new Set(strokes.map((s) => s.cls)).size, 27, '27 distinct pen classes: 3 pages by 9 colors')
    const onPage = (values) => strokes.filter((s) => values.includes(s.cls.match(/pencolor-(\S+)/)[1]))
    const plain = onPage(PAGE_ONE)
    const dashed = onPage(PAGE_TWO)
    const arrowed = onPage(PAGE_THREE)
    assert.ok(plain.length > 0 && plain.every((s) => s.dash === 'none' && s.arrows === 0), `page 1 lines are plain: ${JSON.stringify(plain)}`)
    assert.ok(dashed.length > 0 && dashed.every((s) => s.dash !== 'none'), `page 2 lines are dashed: ${JSON.stringify(dashed)}`)
    assert.ok(arrowed.length > 0 && arrowed.every((s) => s.arrows > 0), `page 3 lines have arrows: ${JSON.stringify(arrowed)}`)
    await undoAll(p)
    assert.deepEqual(await settle(() => penEntries(p), []), [], 'nothing stored after undoing all')
    assert.equal(await settle(() => penDrawnCount(p), 0), 0, 'nothing drawn after undoing all')
  })

  it('attack 36: a cell mark cycles circle, cross, dot, empty, and undo all takes each step back', async () => {
    const [x, y] = await cellCentre(p, ...CELL)
    await goToPenPage(p, PAGE_ONE)
    await p.locator('.tool-pen button[data-key="1"]').click()
    const marks = () => penValuesAt(p, ...CELL)
    for (const want of [...CELL_CYCLE.map((v) => [v]), []]) {
      await p.mouse.click(x, y)
      assert.deepEqual(await settle(marks, want), want, `the cycle reaches ${JSON.stringify(want)}`)
      assert.equal(await settle(() => penDrawnCount(p), want.length), want.length, 'what is drawn follows')
    }
    // Four steps forward; each undo goes one step back along the cycle.
    for (const want of [['z'], ['6'], ['5'], []]) {
      await p.click('#control-undo')
      assert.deepEqual(await settle(marks, want), want, `undo reaches ${JSON.stringify(want)}`)
      assert.equal(await settle(() => penDrawnCount(p), want.length), want.length)
    }
  })

  it('attack 37: erase a long connected line with a right click, then undo and redo', async () => {
    await goToPenPage(p, PAGE_ONE)
    await p.locator('.tool-pen button[data-key="3"]').click()
    await mouseDrag(p, [[0.5, 0.5], [0.5, 4.5], [4.5, 4.5], [4.5, 8.5], [8.5, 8.5]])
    const line = await readUntil(() => penEntries(p), (entries) => entries.length > 5)
    const drawn = await penDrawnCount(p)
    const [x, y] = await cellCentre(p, 0, 2)
    await p.mouse.move(x, y)
    await p.mouse.click(x, y, { button: 'right' })
    assert.deepEqual(await settle(() => penEntries(p), []), [], 'one right click erased the whole connected line')
    assert.equal(await settle(() => penDrawnCount(p), 0), 0)
    await p.mouse.click(5, 5)
    await p.click('#control-undo')
    assert.deepEqual(await settle(() => penEntries(p), line), line, 'one undo brings the whole line back')
    assert.equal(await settle(() => penDrawnCount(p), drawn), drawn)
    await p.click('#control-redo')
    assert.deepEqual(await settle(() => penEntries(p), []), [], 'redo erases it again')
    assert.equal(await settle(() => penDrawnCount(p), 0), 0)
  })

  it('attack 38: change the line mode through all three mid-solve, drawing after each', async () => {
    await goToPenPage(p, PAGE_ONE)
    await p.locator('.tool-pen button[data-key="1"]').click()
    // Center lines run from cell middle to cell middle; edge lines run along the middles of cell sides.
    const lines = {
      both: [[0.5, 0.5], [0.5, 2.5]],
      centeronly: [[2.5, 0.5], [2.5, 2.5]],
      edgeonly: [[4.5, 1], [4.5, 3]]
    }
    const drawIn = async (points) => {
      const before = (await penEntries(p)).length
      await mouseDrag(p, points)
      assert.equal(await settle(async () => (await penEntries(p)).length > before, true), true, `a line is drawn in mode ${await lineMode()}`)
    }
    // A fresh page has no mode set yet, which draws as Center & Edge.
    assert.equal(await lineMode(), null, 'a fresh page has no line mode set')
    await drawIn(lines.both)
    for (const want of ['centeronly', 'edgeonly']) {
      await p.click(LINE_MODE_BUTTON)
      assert.equal(await settle(lineMode, want), want, `the button steps to ${want}`)
      await drawIn(lines[want])
    }
    await p.click(LINE_MODE_BUTTON)
    assert.equal(await settle(lineMode, 'both'), 'both', 'the button steps back to Center & Edge')
    await drawIn([[6.5, 0.5], [6.5, 2.5]])
  })

  it('attack 39: Thickness and Opacity at their limits, drawing marks and lines at each', async () => {
    const strokeWidths = async () => (await read(() => [...document.querySelectorAll('#cell-pen .cell-pen')].map((g) => { const st = window.getComputedStyle(g); return { strokeWidth: st.strokeWidth, transform: st.transform } }))).map(drawnWidth)
    const widest = {}
    for (const [name, thickness, opacity] of [['min', THICKNESS_LIMITS.min, OPACITY_LIMITS.min], ['max', THICKNESS_LIMITS.max, OPACITY_LIMITS.max]]) {
      if (name === 'max') await undoAll(p)
      await goToPenPage(p, PAGE_ONE)
      await p.locator('.tool-pen button[data-key="2"]').click()
      await setInputValue(p.locator(THICKNESS), thickness)
      await setInputValue(p.locator(OPACITY), opacity)
      await lineIn(1, 1)
      const lineCount = await readUntil(() => penDrawnCount(p), (count) => count > 0)
      const [x, y] = await cellCentre(p, ...CELL)
      await p.mouse.click(x, y)
      assert.equal(await settle(() => penDrawnCount(p), lineCount + 1), lineCount + 1, `${name}: a line and a cell mark are drawn`)
      const widths = await strokeWidths()
      assert.ok(widths.every((w) => w > 0 && Number.isFinite(w)), `${name}: every stroke has a positive width, got ${widths}`)
      assert.deepEqual([...new Set(await effectiveOpacities(p, '#cell-pen .cell-pen'))], [opacity / 100], `${name}: drawn at the slider's opacity`)
      widest[name] = Math.max(...widths)
    }
    assert.ok(widest.max > widest.min, `max thickness draws wider than min: ${widest.max} vs ${widest.min}`)
  })

  const changeEveryValue = async () => {
    await editor().locator('select[data-role="color-choice"]').selectOption({ index: 1 })
    const swatches = editor().locator('input[data-role="swatch"]')
    for (let i = 0; i < await swatches.count(); i++) await swatches.nth(i).fill(`#${(0x102030 + i * 0x0a0b0c).toString(16)}`)
    await editor().evaluate((root) => {
      for (const el of root.querySelectorAll('input[type=range]')) {
        el.value = el.value === el.max ? el.min : el.max
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      for (const el of root.querySelectorAll('input[type=checkbox]')) el.click()
    })
  }
  const dialogValues = () => editor().evaluate((root) => ({
    preset: root.querySelector('select[data-role="color-choice"]').value,
    colors: [...root.querySelectorAll('input[data-role="swatch"]')].map((el) => el.value),
    settings: Object.fromEntries([...root.querySelectorAll('input[type=range], input[type=checkbox]')].map((el) => [el.dataset.setting || el.dataset.box, el.type === 'range' ? Number(el.value) : el.checked]))
  }))

  it('attack 40: change every value and Cancel, then change and Save, then reload', async () => {
    // The install save of the pen colors lands a moment after startup, so the saved values are read once they hold still.
    const untouched = await stable(() => stored(SAVED_KEYS))
    await openExtrasEditor(p)
    const defaults = await dialogValues()
    await changeEveryValue()
    const changed = await dialogValues()
    assert.notDeepEqual(changed, defaults, 'the values changed in the dialog')
    await closeExtrasEditorWith(p, 'Cancel')
    assert.deepEqual(await stored(SAVED_KEYS), untouched, 'Cancel saves nothing')
    await openExtrasEditor(p)
    assert.deepEqual(await dialogValues(), defaults, 'the dialog opens again with the values as they were')
    await changeEveryValue()
    assert.deepEqual(await dialogValues(), changed)
    await closeExtrasEditorWith(p, 'Save')
    assert.notDeepEqual(await stored(SAVED_KEYS), untouched, 'Save saved')
    // The saved values may hide the page button, which a ready pen tool waits for.
    await extras.reload(p, { penTool: false })
    await openExtrasEditor(p)
    assert.deepEqual(await dialogValues(), changed, 'after a reload the dialog shows the saved values')
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('attack 41: with the settings dialog open, Escape, Enter and a click outside it', async () => {
    const thickness = () => read(() => Framework.getData('PenColor_thickness'))
    const edit = async () => {
      await openExtrasEditor(p)
      await setInputValue(p.locator(DIALOG_THICKNESS), 9)
    }
    await edit()
    await p.keyboard.press('Escape')
    await editor().waitFor({ state: 'detached' })
    assert.equal(await thickness(), null, 'Escape saved nothing')
    await edit()
    await p.mouse.click(5, 5)
    await editor().waitFor({ state: 'detached' })
    assert.equal(await thickness(), null, 'a click outside saved nothing')
    await edit()
    await p.keyboard.press('Enter')
    await p.waitForTimeout(300) // "nothing happened in 300 ms" check
    assert.equal(await editor().count(), 1, 'Enter leaves the dialog open')
    assert.equal(await thickness(), null, 'Enter saved nothing')
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await thickness(), 9, 'Save still saves after the Enter')
  })
})
