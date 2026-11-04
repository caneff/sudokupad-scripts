// Live check of pen-tool-extras.user.js's third page of pens (chevron lines) on sudokupad.app in headless Chromium.
// Run with `npm run test:live`. The first run of a day needs the network (live/cache.mjs records SudokuPad, later runs replay it) and a Playwright Chromium, so it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so Tampermonkey's real injection time and
// crackingthecryptic.com stay untested, and so does a touch screen.
// The script goes in after Start Puzzle, when the controls already exist; startup.live.mjs checks the other injection times.
// Every drag, press and click is real input. A line's direction is stored in its color character (a page 3 pen is two
// characters), so the checks read both what is stored (`cell.pen`) and what is drawn (the way each chevron points).
/* global Framework, ToolPen */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { routeSudokuPad } from './cache.mjs'
import { closeExtrasEditorWith, effectiveOpacities, openExtrasEditor, restartPuzzle } from './settings.mjs'
import { settle, SETTLE_MS } from './settle.mjs'

// The sizes of a chevron line are the script's own, so the checks read them from it and a retuning moves both.
const { CHEVRON, ARROW_SPACING } = createRequire(import.meta.url)('../pen-tool-extras.user.js')
const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')

const PEN_KEY = 'PenColor_pen'
const COLORS_KEY = 'PenColor_colors'
const THICKNESS_KEY = 'PenColor_thickness'
const OPACITY_KEY = 'PenColor_opacity'
const ARROW_SPACING_KEY = 'PenColor_arrowspacing'
const START = /Start Puzzle|Continue|Resume/i
const PAGE_BUTTON = '.pen-tool-extras-page'
const PAGE_THREE = 'jlnprtvxz'
const PAGE_ONE = '123456789'

// Waits for the puzzle, starts it, and returns once the controls exist.
async function startPuzzle (page) {
  await page.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
  const start = page.getByRole('button', { name: START }).first()
  await start.waitFor({ state: 'visible' })
  await start.click()
  await start.waitFor({ state: 'hidden' })
  await page.locator('#control-undo').waitFor({ state: 'visible' })
}

// The pen button toggles the tool, and SudokuPad binds its handler a moment after the button appears, so it is
// clicked again until the tool's buttons show.
async function openPenTool (page) {
  const shown = () => page.locator('.tool-pen button[data-key="1"]').isVisible()
  const deadline = Date.now() + SETTLE_MS
  while (!(await shown()) && Date.now() < deadline) {
    await page.click('#control-pen')
    await settle(shown, true, 500)
  }
}

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// The way each chevron of a group points, as a compass point, read from its drawn path: wing, tip, wing; the tip's offset from
// the middle of the wings is the way. y grows downward, so S is down the screen.
const COMPASS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']
const headings = (chevronsPath) => {
  const n = chevronsPath.match(/-?\d+(?:\.\d+)?/g).map(Number)
  const out = []
  for (let i = 0; i + 5 < n.length; i += 6) {
    const angle = Math.atan2(n[i + 3] - (n[i + 1] + n[i + 5]) / 2, n[i + 2] - (n[i] + n[i + 4]) / 2) * 180 / Math.PI
    out.push(COMPASS[((Math.round(angle / 45) % 8) + 8) % 8])
  }
  return out
}

// One browser context per group: its page, its page errors, and the checks.
describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const saved = (key) => read((k) => Framework.getData(k), key)
  const selected = () => read(() => String(ToolPen.tool.selectedColor))
  const padValues = () => read(() => [...document.querySelectorAll('.controls-input button[data-key]')].filter((b) => b.dataset.key !== '0').map((b) => b.dataset.value).join(''))
  // The pen entries of every cell as `row,col:value+color`, sorted.
  const penValues = () => read(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => `${c.row},${c.col}:${v}`)).sort())
  const penOf = async (cells) => (await penValues()).filter((v) => cells.some((c) => v.startsWith(`${c}:`)))
  // Every arrow line group in the pen layer: its class, the way its arrows point, and the width of its line.
  const chevronGroups = () => read(() => [...document.querySelectorAll('#cell-pen > g.cell-pen')].map((g) => {
    const [line, chevrons] = ['line', 'chevrons'].map((name) => g.querySelector(`[data-chevron-part="${name}"]`))
    return { cls: g.getAttribute('class'), chevrons: chevrons.getAttribute('d'), line: line.getAttribute('d'), lineWidth: Number(line.getAttribute('stroke-width')) }
  }))
  const strokeCount = () => read(() => document.querySelectorAll('.cell-pen').length)
  const pageErrors = () => errors.slice()

  const cellCentre = (row, col) => read(([r, c]) => {
    const box = Framework.app.puzzle.cells.find((cell) => cell.row === r && cell.col === c).elem.getBoundingClientRect()
    return [box.x + box.width / 2, box.y + box.height / 2, box.width]
  }, [row, col])

  // A drag along `points`, each [row, col] in cells from the grid's top left (a cell's middle is at .5), with real mouse
  // input, returning once the grid has changed.
  const drag = async (points) => {
    const before = JSON.stringify(await penValues())
    const [x0, y0, size] = await cellCentre(0, 0)
    const at = ([r, c]) => [x0 + (c - 0.5) * size, y0 + (r - 0.5) * size]
    await p.mouse.move(...at(points[0]))
    await p.mouse.down()
    for (const point of points.slice(1)) await p.mouse.move(...at(point), { steps: 8 })
    await p.mouse.up()
    assert.equal(await settle(async () => JSON.stringify(await penValues()) !== before, true), true, 'the drag changed the grid')
  }

  const press = (key) => p.locator(`.tool-pen button[data-key="${key}"]`).click()
  // Turns to page 3 (two page button presses from page 1) and selects the pen on button `key`.
  const selectChevronPen = async (key) => {
    await openPenTool(p)
    await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
    if ((await padValues()) !== PAGE_THREE) {
      const turns = (await padValues()) === PAGE_ONE ? 2 : 1
      for (let i = 0; i < turns; i++) await p.locator(PAGE_BUTTON).click()
    }
    assert.equal(await settle(padValues, PAGE_THREE), PAGE_THREE)
    await press(key)
  }
  const undo = () => p.click('#control-undo')
  const undoAll = async () => { while ((await read(() => Framework.app.puzzle.undoStack.length)) > 0) await undo() }
  const eraseDrag = async (points) => {
    // A press exactly on a stroke starts no drag in SudokuPad, so an erase drag starts a little off the line.
    await drag(points.map(([r, c]) => [r + 0.1, c + 0.1]))
  }

  const boot = async () => {
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
    await read(() => { Framework.setSetting('toolpen', true) })
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await openPenTool(p)
    await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
  }
  const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }

  before(async () => {
    context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    errors = []
    p = await context.newPage()
    p.on('pageerror', (e) => errors.push(String(e)))
    // the script reports a drag it could not read the ways of with console.error and sends it unsplit, which no check would see
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`) })
    await routeSudokuPad(p)
    await p.goto(url, { waitUntil: 'load', timeout: 60000 })
    await boot()
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), [PEN_KEY, COLORS_KEY, THICKNESS_KEY, OPACITY_KEY, ARROW_SPACING_KEY, 'ToolPen_color'])
    await selectChevronPen(3)
  })
  after(async () => {
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), [PEN_KEY, COLORS_KEY, THICKNESS_KEY, OPACITY_KEY, ARROW_SPACING_KEY, 'ToolPen_color'])
    await context.close()
  })

  it('page 3 is the nine chevron pens: the buttons carry the forward characters j, l, n, ... and each has a chevron swatch in its pen color', async () => {
    assert.equal(await padValues(), PAGE_THREE)
    assert.equal(await selected(), 'n')
    // each swatch is a mask over a background of the pen color: the color a probe element resolves --puzzle-pencolor-N to
    const swatches = await read(() => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
      const after = window.getComputedStyle(document.querySelector(`.tool-pen button[data-key="${n}"]`), ':after')
      const probe = document.createElement('span')
      probe.style.color = `var(--puzzle-pencolor-${n})`
      document.body.appendChild(probe)
      const pen = window.getComputedStyle(probe).color
      probe.remove()
      return { mask: after.webkitMaskImage || after.maskImage, color: after.backgroundColor, pen }
    }))
    for (const [i, sw] of swatches.entries()) {
      assert.match(sw.mask, /^url\("data:image\/svg\+xml,/, `swatch ${i + 1} is a mask`)
      assert.equal(sw.color, sw.pen, `swatch ${i + 1} is the color of pen ${i + 1}`)
    }
    assert.equal(await saved('ToolPen_color'), 3)
    assert.equal(await saved(PEN_KEY), 'n')
  })

  it('a line dragged right is stored with the pen\'s own character and drawn as a line with chevrons pointing right', async () => {
    await drag([[2.5, 2.5], [2.5, 4.5]])
    assert.deepEqual(await penOf(['2,2', '2,3']), ['2,2:1n', '2,3:1n'])
    const groups = await chevronGroups()
    assert.equal(groups.length, 2)
    for (const g of groups) {
      assert.equal(g.cls, 'cell-pen pen-1 pencolor-n')
      assert.deepEqual([...new Set(headings(g.chevrons))], ['E'])
      assert.equal(g.lineWidth, 5, 'the line is as wide as a page 1 line at the default thickness')
    }
  })

  it('a line dragged left is stored with the pen\'s reverse character and its chevrons point left', async () => {
    await drag([[4.5, 4.5], [4.5, 2.5]])
    assert.deepEqual(await penOf(['4,2', '4,3']), ['4,2:1o', '4,3:1o'])
    const groups = (await chevronGroups()).filter((g) => g.cls.endsWith('pencolor-o'))
    assert.equal(groups.length, 2)
    for (const g of groups) assert.deepEqual([...new Set(headings(g.chevrons))], ['W'])
  })

  it('a drag that turns stores the right character per segment, draws each segment pointing the way it went, and is one undo step', async () => {
    // right along row 6, down column 4, then left along row 7
    await drag([[6.5, 2.5], [6.5, 4.5], [7.5, 4.5], [7.5, 2.5]])
    assert.deepEqual(await penOf(['6,2', '6,3', '6,4', '7,2', '7,3']), ['6,2:1n', '6,3:1n', '6,4:2n', '7,2:1o', '7,3:1o'])
    const byClass = async (cls) => (await chevronGroups()).filter((g) => g.cls === cls)
    assert.equal((await byClass('cell-pen pen-2 pencolor-n')).length, 1)
    assert.deepEqual([...new Set(headings((await byClass('cell-pen pen-2 pencolor-n'))[0].chevrons))], ['S'])
    const before = await strokeCount()
    await undo()
    assert.equal(await settle(strokeCount, before - 5), before - 5, 'one undo takes the whole drag back')
    assert.deepEqual(await penOf(['6,2', '6,3', '6,4', '7,2', '7,3']), [])
    assert.deepEqual(await penOf(['2,2', '4,2']), ['2,2:1n', '4,2:1o'], 'the earlier lines stay')
    await p.click('#control-redo')
    assert.equal(await settle(strokeCount, before), before, 'redo draws it again')
    assert.deepEqual(await penOf(['6,2', '6,3', '6,4', '7,2', '7,3']), ['6,2:1n', '6,3:1n', '6,4:2n', '7,2:1o', '7,3:1o'])
  })

  it('a drag up and then right stores the up segment with the reverse character: 2 is drawn downward, so up is the reverse', async () => {
    await drag([[8.5, 6.5], [7.5, 6.5], [7.5, 7.5]])
    assert.deepEqual(await penOf(['7,6']), ['7,6:1n', '7,6:2o'])
    const headingOfClass = async (cls) => (await chevronGroups()).filter((g) => g.cls === cls).flatMap((g) => headings(g.chevrons))
    assert.deepEqual([...new Set(await headingOfClass('cell-pen pen-2 pencolor-o'))], ['N'])
    assert.deepEqual([...new Set((await headingOfClass('cell-pen pen-1 pencolor-n')).slice(-1))], ['E'])
  })

  it('center diagonals and edge lines (straight and diagonal) store their way too: down-right is forward, up-left is the reverse character', async () => {
    // center diagonal e, dragged down and right, then up and left on another row
    await drag([[0.5, 5.5], [1.5, 6.5]])
    await drag([[1.5, 8.5], [0.5, 7.5]])
    assert.deepEqual(await penOf(['0,5', '0,7']), ['0,5:en', '0,7:eo'])
    // edge line 8, along grid line 5 (the bottom edge of row 4), dragged right and then another dragged left
    await drag([[5, 6], [5, 7]])
    await drag([[6, 7], [6, 6]])
    assert.deepEqual(await penOf(['4,6', '5,6']), ['4,6:8n', '5,6:8o'])
    // edge diagonal g (top left to bottom right), dragged down-right and up-left
    await drag([[3, 0], [4, 1]])
    await drag([[8, 2], [7, 1]])
    assert.deepEqual(await penOf(['3,0', '7,1']), ['3,0:gn', '7,1:go'])
    const all = await chevronGroups()
    const headingOf = (cls) => [...new Set(all.filter((g) => g.cls === cls).flatMap((g) => headings(g.chevrons)))]
    assert.deepEqual(headingOf('cell-pen pen-e pencolor-n'), ['SE'])
    assert.deepEqual(headingOf('cell-pen pen-e pencolor-o'), ['NW'])
    assert.deepEqual(headingOf('cell-pen pen-8 pencolor-n'), ['E'])
    assert.deepEqual(headingOf('cell-pen pen-8 pencolor-o'), ['W'])
    assert.deepEqual(headingOf('cell-pen pen-g pencolor-n'), ['SE'])
    assert.deepEqual(headingOf('cell-pen pen-g pencolor-o'), ['NW'])
  })

  it('the arrows are filled in the pen\'s page 1 partner color and not stroked, and a recolor changes them', async () => {
    const strokeOf = () => read(() => { const g = document.querySelector('#cell-pen > g.cell-pen.pencolor-n'); const arrows = window.getComputedStyle(g.querySelector('[data-chevron-part="chevrons"]')); return [window.getComputedStyle(g).stroke, arrows.fill, window.getComputedStyle(g.querySelector('[data-chevron-part="line"]')).stroke, arrows.stroke] })
    const [group, fill, line, arrowStroke] = await strokeOf()
    assert.equal(fill, group)
    assert.equal(line, group)
    assert.equal(arrowStroke, 'none')
    await read((k) => Framework.setData(k, { 3: '#123456' }), COLORS_KEY)
    await reload()
    assert.equal(await settle(async () => (await strokeOf())[0], 'rgb(18, 52, 86)'), 'rgb(18, 52, 86)')
    await read((k) => Framework.removeData(k), COLORS_KEY)
    await reload()
    await selectChevronPen(3)
  })

  it('the lines survive undo of everything and a replay: the stored characters and the drawn chevrons come back', async () => {
    const values = await penValues()
    const groups = await chevronGroups()
    const replay = await read(() => Framework.app.getReplay())
    await undoAll()
    assert.equal(await settle(strokeCount, 0), 0)
    await read((r) => Framework.app.loadReplay(r), replay)
    assert.deepEqual(await settle(penValues, values), values)
    const again = await chevronGroups()
    assert.deepEqual(again.map((g) => [g.cls, headings(g.chevrons)]).sort(), groups.map((g) => [g.cls, headings(g.chevrons)]).sort())
  })

  it('after a page reload the lines are drawn again, pointing the same ways', async () => {
    const values = await penValues()
    const groups = await chevronGroups()
    await reload()
    assert.deepEqual(await settle(penValues, values), values)
    assert.equal(await settle(async () => (await chevronGroups()).length, groups.length), groups.length)
    const again = await chevronGroups()
    assert.deepEqual(again.map((g) => [g.cls, headings(g.chevrons)]).sort(), groups.map((g) => [g.cls, headings(g.chevrons)]).sort())
    await selectChevronPen(3)
  })

  it('dragging a line over one drawn the other way erases it, and the same the other way round', async () => {
    // row 2 was drawn right (1n): erase it dragging left; row 4 was drawn left (1o): erase it dragging right
    const drawn = (await chevronGroups()).length
    await eraseDrag([[2.5, 4.5], [2.5, 2.5]])
    assert.deepEqual(await settle(() => penOf(['2,2', '2,3']), []), [])
    await eraseDrag([[4.5, 2.5], [4.5, 4.5]])
    assert.deepEqual(await settle(() => penOf(['4,2', '4,3']), []), [])
    assert.equal(await settle(async () => (await chevronGroups()).length, drawn - 4), drawn - 4, 'the erased lines are no longer drawn')
  })

  it('dragging a line over a run drawn both ways erases all of it: a cell stored in one character is not skipped for the other\'s', async () => {
    // (5,2) is drawn right (1n) and (5,3) left (1o); one erase drag over both removes both, in either direction
    await drag([[5.5, 2.5], [5.5, 3.5]])
    await drag([[5.5, 4.5], [5.5, 3.5]])
    assert.deepEqual(await penOf(['5,2', '5,3']), ['5,2:1n', '5,3:1o'])
    await eraseDrag([[5.5, 2.5], [5.5, 4.5]])
    assert.deepEqual(await settle(() => penOf(['5,2', '5,3']), []), [])
    await drag([[5.5, 2.5], [5.5, 3.5]])
    await drag([[5.5, 4.5], [5.5, 3.5]])
    await eraseDrag([[5.5, 4.5], [5.5, 2.5]])
    assert.deepEqual(await settle(() => penOf(['5,2', '5,3']), []), [])
  })

  it('dragging a line over one drawn the same way erases it too, and the line can then be drawn again', async () => {
    await drag([[2.5, 2.5], [2.5, 4.5]])
    assert.deepEqual(await penOf(['2,2', '2,3']), ['2,2:1n', '2,3:1n'])
    await eraseDrag([[2.5, 2.5], [2.5, 4.5]])
    assert.deepEqual(await settle(() => penOf(['2,2', '2,3']), []), [])
    await drag([[2.5, 4.5], [2.5, 2.5]])
    assert.deepEqual(await penOf(['2,2', '2,3']), ['2,2:1o', '2,3:1o'])
  })

  it('the Thickness slider scales the arrow lines already drawn: a wider line and fewer arrows; 5 gives them back', async () => {
    const slider = (value) => p.locator('#pen-tool-extras-thickness').evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })) }, value)
    const sample = async () => { const [g] = (await chevronGroups()).filter((x) => x.cls === 'cell-pen pen-1 pencolor-o'); return { lineWidth: g.lineWidth, count: headings(g.chevrons).length } }
    await slider(5)
    const normal = await settle(async () => (await sample()).lineWidth, CHEVRON.line * 5)
    assert.equal(normal, CHEVRON.line * 5)
    const base = await sample()
    await slider(16)
    const big = await settle(async () => (await sample()).lineWidth, CHEVRON.line * 16)
    assert.equal(big, CHEVRON.line * 16)
    const wide = await sample()
    assert.equal(wide.count < base.count, true, `${wide.count} arrows at 16 against ${base.count} at 5`)
    // At 1 the line is as wide as a page 1 line, 1, while the arrows keep the size they have at 5, so the direction stays visible.
    await slider(1)
    assert.equal(await settle(async () => (await sample()).lineWidth, 1), 1)
    const small = await sample()
    assert.equal(small.count, base.count)
    await slider(5)
    assert.deepEqual(await settle(sample, base), base)
  })

  it('the Arrow spacing slider (3 to 12, 5 by default) is a draft until Save, then redraws the arrow lines already drawn: wider spacing gives fewer arrows, and Restore defaults then Save gives 5 back', async () => {
    await selectChevronPen(3)
    await drag([[2.5, 1.5], [2.5, 4.5]])
    const arrows = async () => (await chevronGroups()).reduce((sum, g) => sum + headings(g.chevrons).length, 0)
    const base = await arrows()
    assert.equal(base > 0, true)
    const editor = () => p.locator('#pen-tool-extras-editor')
    const slider = () => editor().locator('input[data-setting="arrowSpacing"]')
    const openEditor = () => openExtrasEditor(p)
    const closeWith = (text) => closeExtrasEditorWith(p, text)
    const setSpacing = (value) => slider().evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })) }, value)
    await openEditor()
    assert.deepEqual(await slider().evaluate((el) => [el.min, el.max, el.step, el.value]), [String(ARROW_SPACING.min), String(ARROW_SPACING.max), String(ARROW_SPACING.step), String(ARROW_SPACING.fallback)])
    await setSpacing(12)
    assert.equal(await editor().locator('output[data-readout="arrowSpacing"]').textContent(), '12', 'the value moves with the slider')
    assert.equal(await arrows(), base, 'a draft changes nothing before Save')
    await closeWith('Cancel')
    assert.equal(await arrows(), base)
    assert.equal(await saved(ARROW_SPACING_KEY), null)
    await openEditor()
    await setSpacing(12)
    await closeWith('Save')
    assert.equal(await saved(ARROW_SPACING_KEY), 12)
    const wide = await settle(async () => (await arrows()) < base, true)
    assert.equal(wide, true, `fewer arrows at spacing 12 than ${base}`)
    const sparse = await arrows()
    await reload()
    await openEditor()
    assert.equal(await slider().inputValue(), '12', 'saved over a reload')
    await setSpacing(3)
    await closeWith('Save')
    assert.equal(await settle(async () => (await arrows()) > base, true), true, 'denser at spacing 3')
    await openEditor()
    await p.locator('.dialog button').filter({ hasText: /^\s*Restore defaults\s*$/ }).first().click()
    assert.equal(await slider().inputValue(), '5')
    await closeWith('Save')
    assert.equal(await saved(ARROW_SPACING_KEY), null, 'the default spacing is not kept')
    assert.equal(await settle(arrows, base), base)
    assert.equal(sparse < base, true)
    await undo()
  })

  it('the Opacity slider fades the chevron lines with the pen layer: the group and its parts show at the slider\'s value', async () => {
    const shown = async (selector) => [...new Set(await effectiveOpacities(p, selector))]
    await p.locator('#pen-tool-extras-opacity').evaluate((el) => { el.value = '50'; el.dispatchEvent(new Event('input', { bubbles: true })) })
    assert.deepEqual(await settle(() => shown('#cell-pen > g.cell-pen'), [0.5]), [0.5])
    assert.deepEqual(await shown('#cell-pen > g.cell-pen > path'), [0.5])
    await p.locator('#pen-tool-extras-opacity').evaluate((el) => { el.value = '80'; el.dispatchEvent(new Event('input', { bubbles: true })) })
    assert.deepEqual(await settle(() => shown('#cell-pen > g.cell-pen'), [0.8]), [0.8])
  })

  it('a cell circle drawn with a page 3 pen is an ordinary solid mark, with no chevrons', async () => {
    const [x, y] = await cellCentre(5, 1)
    await p.mouse.click(x, y)
    assert.equal(await settle(async () => (await penOf(['5,1'])).length, 1), 1)
    assert.deepEqual(await penOf(['5,1']), ['5,1:5n'])
    const circle = await read(() => { const e = document.querySelector('.cell-pen.pen-5.pencolor-n'); return { tag: e.tagName.toLowerCase(), dash: window.getComputedStyle(e).strokeDasharray, parts: e.querySelectorAll('[data-chevron-part]').length } })
    assert.deepEqual(circle, { tag: 'path', dash: 'none', parts: 0 })
    await undo()
  })

  it('an edge mark clicked with a page 3 pen is stored in the pen\'s own character and stays a plain mark', async () => {
    const [x, y, size] = await cellCentre(5, 5)
    await p.mouse.click(x + size / 2, y)
    assert.equal(await settle(async () => (await penOf(['5,5'])).length, 1), 1)
    const stored = (await penOf(['5,5']))[0]
    assert.equal(stored, '5,5:3n')
    assert.equal(await read(() => document.querySelectorAll('#cell-pen > g.cell-pen.pen-3').length), 0)
    await undo()
  })

  it('pen 9, whose characters are z and 0, stores and replays both ways, through undo, a replay and a reload', async () => {
    await restartPuzzle(p)
    await press(9)
    assert.equal(await selected(), 'z')
    await drag([[0.5, 0.5], [0.5, 2.5]])
    await drag([[2.5, 8.5], [2.5, 6.5]])
    const want = ['0,0:1z', '0,1:1z', '2,6:10', '2,7:10']
    assert.deepEqual((await penValues()).filter((v) => /:1[z0]$/.test(v)), want)
    const nine = async () => (await chevronGroups()).filter((g) => /pencolor-[z0]$/.test(g.cls)).map((g) => [g.cls, headings(g.chevrons)[0]]).sort()
    const drawn = await nine()
    assert.deepEqual(drawn, [['cell-pen pen-1 pencolor-0', 'W'], ['cell-pen pen-1 pencolor-0', 'W'], ['cell-pen pen-1 pencolor-z', 'E'], ['cell-pen pen-1 pencolor-z', 'E']])
    const replay = await read(() => Framework.app.getReplay())
    await undoAll()
    assert.equal(await settle(strokeCount, 0), 0)
    await read((r) => Framework.app.loadReplay(r), replay)
    assert.deepEqual(await settle(async () => (await penValues()).filter((v) => /:1[z0]$/.test(v)), want), want)
    await reload()
    assert.deepEqual(await settle(async () => (await penValues()).filter((v) => /:1[z0]$/.test(v)), want), want)
    assert.deepEqual(await settle(nine, drawn), drawn)
  })

  it('page 2 and page 1 pens still draw as before beside the chevron lines', async () => {
    await p.locator(PAGE_BUTTON).click()
    assert.equal(await settle(padValues, PAGE_ONE), PAGE_ONE)
    await press(2)
    await drag([[8.5, 0.5], [8.5, 2.5]])
    assert.deepEqual((await penValues()).filter((v) => v.startsWith('8,0:')), ['8,0:12'])
    assert.equal(await read(() => document.querySelectorAll('.cell-pen.pen-1.pencolor-2').length), 2)
    assert.equal(await read(() => document.querySelectorAll('#cell-pen > g.cell-pen.pencolor-2').length), 0, 'a page 1 line is a plain path')
  })

  it('no page error was raised in the whole group', () => {
    assert.deepEqual(pageErrors(), [])
  })
})
