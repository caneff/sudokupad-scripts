// Live check of pen-tool-extras.user.js's whole-line erase (a middle click in the pen tool) on sudokupad.app in headless Chromium.
// Run with `npm run test:live`. The first run of a day needs the network (live/cache.mjs records SudokuPad, later runs replay it) and a Playwright Chromium, so it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so Tampermonkey's real injection time and
// crackingthecryptic.com stay untested. A real mouse's middle button on Windows is still owed: headless Chromium draws no
// autoscroll, so the checks read `defaultPrevented` on the press events instead of watching a scroll. The script goes in after Start Puzzle, when the controls already exist; startup.live.mjs checks the other injection times.
// Every drag and click is real input except one `mousedown` sent by hand, and each check reads what is stored (`cell.pen`) and the
// undo stack; the autoscroll checks read `defaultPrevented` on the press events instead.
/* global Framework, MouseEvent */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { openPage, restartPuzzle, startPuzzle } from './page.mjs'
import { closeExtrasEditorWith, openExtrasEditor } from './settings.mjs'
import { cellCentre, drag, gridPoint, openPenTool, penEntries } from './pen.mjs'
import { settle } from './settle.mjs'

const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')

const MIDDLE_ERASE_KEY = 'PenColor_middleerase'
const KEYS = ['PenColor_pen', 'PenColor_colors', 'PenColor_thickness', 'PenColor_opacity', 'ToolPen_color', MIDDLE_ERASE_KEY]
const PAGE_BUTTON = '.pen-tool-extras-page'
const PAGES = { 1: '123456789', 2: 'abcdefghi', 3: 'jlnprtvxz' }

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const undoDepth = () => read(() => Framework.app.puzzle.undoStack.length)
  const padValues = () => read(() => [...document.querySelectorAll('.controls-input button[data-key]')].filter((b) => b.dataset.key !== '0').map((b) => b.dataset.value).join(''))
  const middleClick = async (point) => {
    const [x, y] = await gridPoint(p, point)
    await p.mouse.move(x, y)
    await p.mouse.click(x, y, { button: 'middle' })
  }
  const undo = () => p.click('#control-undo')
  const undoAll = async () => { while ((await undoDepth()) > 0) await undo() }

  // Turns to pen page `page` and selects the pen on button `key`.
  const selectPenOnPage = async (page, key) => {
    await openPenTool(p)
    await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
    for (let i = 0; i < 3 && (await padValues()) !== PAGES[page]; i++) await p.locator(PAGE_BUTTON).click()
    assert.equal(await settle(padValues, PAGES[page]), PAGES[page])
    await p.locator(`.tool-pen button[data-key="${key}"]`).click()
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

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, {
      seed: (page, errs) => {
        page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`console.error: ${m.text()}`) })
      }
    }))
    await boot()
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), KEYS)
  })
  after(async () => {
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), KEYS)
    await context.close()
  })

  // A line on each pen page: a row of three segments (dragged right then back left at the end of page 3, so both direction
  // characters are stored), a branch down from the row's second point, and a line of another pen crossing it. The middle
  // click on the row removes the row and its branch and leaves the other pen's line, in one undo step.
  for (const [page, key] of [[1, 3], [2, 3], [3, 3]]) {
    it(`page ${page}: a middle click erases the whole line with its branch, leaves a crossing from another pen, and one undo brings it all back`, async () => {
      await restartPuzzle(p)
      // the other pen: a vertical line through the row, drawn first with the pen on button 6 of the same page
      await selectPenOnPage(page, 6)
      await drag(p, [[0.5, 4.5], [4.5, 4.5]])
      const otherPen = await penEntries(p)
      assert.equal(otherPen.length, 4)
      await selectPenOnPage(page, key)
      await drag(p, [[2.5, 2.5], [2.5, 4.5]])
      // the second half goes the other way on page 3: drawn from its right end to the left
      await drag(p, [[2.5, 6.5], [2.5, 4.5]])
      await drag(p, [[2.5, 3.5], [3.5, 3.5], [3.5, 2.5]])
      const drawn = await penEntries(p)
      assert.ok(drawn.length > otherPen.length, `${drawn.length} entries drawn, ${otherPen.length} of the other pen`)
      if (page === 3) assert.deepEqual([...new Set(drawn.filter((v) => !otherPen.includes(v)).map((v) => v.slice(-1)))].sort(), ['n', 'o'])
      const depth = await undoDepth()

      await middleClick([2.5, 3.0])
      assert.deepEqual(await settle(() => penEntries(p), otherPen), otherPen, 'only the other pen is left')
      const erasedDepth = await undoDepth()
      assert.ok(erasedDepth > depth, `undo depth ${erasedDepth} after the erase, ${depth} before`)

      const afterErase = await read(() => Framework.app.getReplay())
      await undo()
      assert.deepEqual(await settle(() => penEntries(p), drawn), drawn, 'one undo brings the whole line back')
      await p.click('#control-redo')
      assert.deepEqual(await settle(() => penEntries(p), otherPen), otherPen, 'redo erases it again')

      await undoAll()
      await read((r) => Framework.app.loadReplay(r), afterErase)
      assert.deepEqual(await settle(() => penEntries(p), otherPen), otherPen, 'the replay holds the erase')
      await undoAll()
    })
  }

  const editor = () => p.locator('#pen-tool-extras-editor')
  const openEditor = () => openExtrasEditor(p)

  it('with the Middle click box unticked a middle click erases nothing and prevents no default (autoscroll as stock); the box is ticked by default, saves as false, and ticking it again brings the erase back', async () => {
    await undoAll()
    await selectPenOnPage(1, 3)
    await drag(p, [[2.5, 2.5], [2.5, 4.5]])
    const lines = await penEntries(p)
    await openEditor()
    const box = editor().locator('input[data-middle-erase]')
    assert.equal(await box.isChecked(), true, 'ticked on a fresh install')
    assert.equal(await p.getByLabel('Middle click erases a whole line').isChecked(), true)
    await box.uncheck()
    await closeExtrasEditorWith(p, 'Cancel')
    assert.equal(await read((k) => Framework.getData(k), MIDDLE_ERASE_KEY), null, 'Cancel saves nothing')
    await openEditor()
    await box.uncheck()
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await read((k) => Framework.getData(k), MIDDLE_ERASE_KEY), false)
    await read(() => {
      window.__middleLog = []
      if (!window.__middleLogged) {
        window.__middleLogged = true
        for (const type of ['pointerdown', 'mousedown']) window.addEventListener(type, (e) => window.__middleLog.push([type, e.button, e.defaultPrevented]))
      }
    })
    await middleClick([2.5, 3.0])
    assert.deepEqual(await read(() => window.__middleLog), [['pointerdown', 1, false], ['mousedown', 1, false]], 'no default prevented, and the mouse events follow as in stock')
    await sleep(150) // "nothing happened in 150 ms" check
    assert.equal((await penEntries(p)).filter((v) => lines.includes(v)).length, lines.length, 'the line is still there')
    await openEditor()
    assert.equal(await box.isChecked(), false, 'the dialog opens with the box as saved')
    await box.check()
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await read((k) => Framework.getData(k), MIDDLE_ERASE_KEY), null, 'ticked is the default and is not kept')
    await undoAll()
    await selectPenOnPage(1, 3)
    await drag(p, [[2.5, 2.5], [2.5, 4.5]])
    await middleClick([2.5, 3.0])
    assert.deepEqual(await settle(() => penEntries(p), []), [], 'the erase is back')
    // Seen live: without a click off the grid after a middle press, the next drag, started within a second, draws nothing.
    await p.mouse.click(5, 5)
    await undoAll()
  })

  it('a middle click where there is no line does nothing and makes no mark, not in a cell\'s middle, on an edge or off the grid', async () => {
    await undoAll()
    await selectPenOnPage(1, 3)
    await drag(p, [[2.5, 2.5], [2.5, 4.5]])
    const lines = await penEntries(p)
    const depth = await undoDepth()
    for (const point of [[6.5, 6.5], [6.0, 6.5], [6.0, 6.0], [-0.3, 3.0], [3.0, 3.5]]) {
      await middleClick(point)
      // a mark would be stored by the time the click's handlers have run, so the same state a moment later is the answer
      await sleep(150) // "nothing happened in 150 ms" check
      assert.deepEqual(await penEntries(p), lines, `no change at ${point}`)
      assert.equal(await undoDepth(), depth, `no undo step at ${point}`)
    }
    await undoAll()
  })

  it('marks are never erased: a middle click on a line leaves a cell circle, a cross and an edge X', async () => {
    await undoAll()
    await selectPenOnPage(1, 3)
    await drag(p, [[2.5, 2.5], [2.5, 5.5]])
    const line = await penEntries(p)
    // a cell circle and cross (left clicks in cell middles off the line), and an edge X on a cell's right edge
    const [cx, cy] = await cellCentre(p, 6, 1)
    await p.mouse.click(cx, cy)
    await p.mouse.click(cx, cy)
    await p.mouse.click(...(await gridPoint(p, [7.5, 3.5])))
    await p.mouse.click(...(await gridPoint(p, [7.5, 4.0])))
    const marks = (await penEntries(p)).filter((v) => !line.includes(v))
    assert.equal(marks.length, 3, `marks stored: ${marks}`)
    await middleClick([2.5, 4.0])
    assert.deepEqual(await settle(() => penEntries(p), marks), marks)
    await undoAll()
  })

  it('a middle click hits where the pointer is now, not the position SudokuPad last saw: a dialog stops its tracking, and a press right after it closes erases nothing', async () => {
    await undoAll()
    await selectPenOnPage(1, 3)
    await drag(p, [[2.5, 2.5], [2.5, 4.5]])
    const lines = await penEntries(p)
    await p.mouse.move(...await gridPoint(p, [2.5, 3.0]))
    await read(() => Framework.showDialog({ content: 'A dialog', buttons: [{ tag: 'button', content: 'Close', handler: () => Framework.closeDialog() }] }))
    await p.mouse.move(...await gridPoint(p, [6.5, 6.5]))
    await read(() => Framework.closeDialog())
    // no move between the close and the press: the pointer is over empty space
    await p.mouse.down({ button: 'middle' })
    await p.mouse.up({ button: 'middle' })
    await sleep(150) // "nothing happened in 150 ms" check
    assert.deepEqual(await penEntries(p), lines)
    await undoAll()
  })

  it('a middle press over the grid in the pen tool is default-prevented (no autoscroll), and left alone in another tool', async () => {
    await undoAll()
    await read(() => {
      window.__presses = []
      for (const type of ['pointerdown', 'mousedown']) window.addEventListener(type, (e) => window.__presses.push([type, e.button, e.defaultPrevented]))
    })
    const presses = () => read(() => { const out = window.__presses; window.__presses = []; return out })
    // a browser that still sends `mousedown` after a prevented `pointerdown` (Chromium does not): one sent by hand on the grid
    const syntheticMousedown = (button) => read((b) => document.querySelector('#svgrenderer').dispatchEvent(new MouseEvent('mousedown', { button: b, bubbles: true, cancelable: true })), button)
    await selectPenOnPage(1, 3)
    await presses()
    await middleClick([6.5, 6.5])
    assert.deepEqual(await presses(), [['pointerdown', 1, true]], 'the prevented pointerdown is the only event: no mouse events follow')
    await syntheticMousedown(1)
    assert.deepEqual(await presses(), [['mousedown', 1, true]])
    // a middle press off the grid (the page's corner) keeps its autoscroll
    await p.mouse.move(5, 5)
    await p.mouse.click(5, 5, { button: 'middle' })
    assert.deepEqual((await presses()).filter(([, button]) => button === 1), [['pointerdown', 1, false], ['mousedown', 1, false]])
    await p.mouse.click(...(await gridPoint(p, [6.5, 6.5])))
    assert.deepEqual(await presses(), [['pointerdown', 0, false], ['mousedown', 0, false]], 'a left press is not prevented')
    await undo()
    await p.click('#control-normal')
    assert.equal(await settle(() => read(() => Framework.app.tool), 'normal'), 'normal')
    await presses()
    await middleClick([6.5, 6.5])
    assert.deepEqual(await presses(), [['pointerdown', 1, false], ['mousedown', 1, false]])
    await syntheticMousedown(1)
    assert.deepEqual(await presses(), [['mousedown', 1, false]])
    await openPenTool(p)
  })

  it('no page error was raised in the whole group', () => {
    assert.deepEqual(errors, [])
  })
})
