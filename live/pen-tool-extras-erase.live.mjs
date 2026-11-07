// Live check of pen-tool-extras.user.js's whole-line erase (a right click in the pen tool; the middle button does nothing) on sudokupad.app in headless Chromium.
// A real mouse's middle button on Windows is still owed: headless Chromium draws no autoscroll, so the checks read
// `defaultPrevented` on the press events instead of watching a scroll.
// Every drag and click is real input except one `mousedown` sent by hand, and each check reads what is stored (`cell.pen`) and the
// undo stack; the autoscroll checks read `defaultPrevented` on the press events instead.
/* global Framework */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { captureConsoleErrors, openPage, restartPuzzle, startPuzzle } from './page.mjs'
import { closeExtrasEditorWith, openExtrasEditor } from './settings.mjs'
import { cellCentre, drag, gridPoint, mouseDrag, openPenTool, padValues, penEntries } from './pen.mjs'
import { settle } from './settle.mjs'

const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')

// The saved key keeps its old name, so old saves read the same.
const ERASE_KEY = 'PenColor_middleerase'
const KEYS = ['PenColor_pen', 'PenColor_colors', 'PenColor_thickness', 'PenColor_opacity', 'ToolPen_color', ERASE_KEY]
const PAGE_BUTTON = '.pen-tool-extras-page'
const PAGES = { 1: '123456789', 2: 'abcdefghi', 3: 'jlnprtvxz' }

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const undoDepth = () => read(() => Framework.app.puzzle.undoStack.length)
  const buttonClick = async (button, point) => {
    const [x, y] = await gridPoint(p, point)
    await p.mouse.move(x, y)
    await p.mouse.click(x, y, { button })
  }
  const middleClick = (point) => buttonClick('middle', point)
  const rightClick = (point) => buttonClick('right', point)
  const undo = () => p.click('#control-undo')
  const undoAll = async () => { while ((await undoDepth()) > 0) await undo() }

  const selectPenOnPage = async (page, key) => {
    await openPenTool(p)
    await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
    for (let i = 0; i < 3 && (await padValues(p)) !== PAGES[page]; i++) await p.locator(PAGE_BUTTON).click()
    assert.equal(await settle(() => padValues(p), PAGES[page]), PAGES[page])
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
    ;({ context, p, errors } = await openPage(browser, { seed: captureConsoleErrors }))
    await boot()
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), KEYS)
  })
  after(async () => {
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), KEYS)
    await context.close()
  })

  // A line on each pen page: a row of three segments (dragged right then back left at the end of page 3, so both direction
  // characters are stored), a branch down from the row's second point, and a line of another pen crossing it. The right
  // click on the row removes the row and its branch and leaves the other pen's line, in one undo step.
  for (const [page, key, button] of [[1, 3, 'right'], [2, 3, 'right'], [3, 3, 'right']]) {
    it(`page ${page}: a ${button} click erases the whole line with its branch, leaves a crossing from another pen, and one undo brings it all back`, async () => {
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

      await buttonClick(button, [2.5, 3.0])
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

  it('with the Right click erase box unticked the right button erases nothing and prevents no default (menu as stock); the box is ticked by default, saves as false, and ticking it again brings the erase back', async () => {
    await undoAll()
    await selectPenOnPage(1, 3)
    await drag(p, [[2.5, 2.5], [2.5, 4.5]])
    const lines = await penEntries(p)
    await openExtrasEditor(p)
    const box = editor().locator('input[data-box="eraseClicks"]')
    assert.equal(await box.isChecked(), true, 'ticked on a fresh install')
    assert.equal(await p.getByLabel('Right click erase').isChecked(), true)
    await box.uncheck()
    await closeExtrasEditorWith(p, 'Cancel')
    assert.equal(await read((k) => Framework.getData(k), ERASE_KEY), null, 'Cancel saves nothing')
    await openExtrasEditor(p)
    await box.uncheck()
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await read((k) => Framework.getData(k), ERASE_KEY), false)
    await read(() => {
      window.__middleLog = []
      if (!window.__middleLogged) {
        window.__middleLogged = true
        for (const type of ['pointerdown', 'mousedown']) window.addEventListener(type, (e) => window.__middleLog.push([type, e.button, e.defaultPrevented]))
      }
    })
    // a right click: SudokuPad's own, which prevents nothing and draws the edge X as a left click does
    await read(() => {
      window.__middleLog = []
      if (!window.__menuLogged) {
        window.__menuLogged = true
        window.addEventListener('contextmenu', (e) => window.__middleLog.push(['contextmenu', e.button, e.defaultPrevented]))
      }
    })
    await rightClick([2.5, 3.0])
    assert.deepEqual((await settle(() => read(() => window.__middleLog.filter(([type]) => type !== 'mousedown')), [['pointerdown', 2, false], ['contextmenu', 2, false]])), [['pointerdown', 2, false], ['contextmenu', 2, false]], 'a right click prevents nothing')
    assert.equal((await penEntries(p)).filter((v) => lines.includes(v)).length, lines.length, 'the line is still there after a right click')
    await openExtrasEditor(p)
    assert.equal(await box.isChecked(), false, 'the dialog opens with the box as saved')
    await box.check()
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await read((k) => Framework.getData(k), ERASE_KEY), null, 'ticked is the default and is not kept')
    await undoAll()
    await selectPenOnPage(1, 3)
    await drag(p, [[2.5, 2.5], [2.5, 4.5]])
    await rightClick([2.5, 3.0])
    assert.deepEqual(await settle(() => penEntries(p), []), [], 'the erase is back')
    // Seen live: without a click off the grid after an erase press, the next drag, started within a second, draws nothing.
    await p.mouse.click(5, 5)
    await undoAll()
  })

  it('a middle click and a middle-drag over a line leave it, and prevent no default (the autoscroll is the browser\'s)', async () => {
    await undoAll()
    await selectPenOnPage(1, 3)
    await drag(p, [[2.5, 2.5], [2.5, 4.5]])
    const lines = await penEntries(p)
    await read(() => {
      window.__middleLog = []
      if (!window.__middleLogged) {
        window.__middleLogged = true
        for (const type of ['pointerdown', 'mousedown']) window.addEventListener(type, (e) => window.__middleLog.push([type, e.button, e.defaultPrevented]))
      }
    })
    await middleClick([2.5, 3.0])
    assert.deepEqual(await read(() => window.__middleLog), [['pointerdown', 1, false], ['mousedown', 1, false]], 'no default prevented, and the mouse events follow as in stock')
    await mouseDrag(p, [[0.5, 3.0], [6.5, 3.0]], { button: 'middle' })
    await sleep(150) // "nothing happened in 150 ms" check
    assert.equal((await penEntries(p)).filter((v) => lines.includes(v)).length, lines.length, 'the line is still there')
    await p.mouse.click(5, 5) // as after any middle press: a click off the grid, or the next drag draws nothing
    await undoAll()
  })

  // A cell circle, a cross and an edge X off the line: left clicks in cell middles (twice for the cross) and on a cell's right edge.
  const markOffLine = async () => {
    const [cx, cy] = await cellCentre(p, 6, 1)
    await p.mouse.click(cx, cy)
    await p.mouse.click(cx, cy)
    await p.mouse.click(...(await gridPoint(p, [7.5, 3.5])))
    await p.mouse.click(...(await gridPoint(p, [7.5, 4.0])))
  }

  for (const button of ['right']) {
    it(`a ${button} click on a line leaves a cell circle, a cross and an edge X; on the edge X with no line under it, it removes the X and leaves the cell marks`, async () => {
      await undoAll()
      await selectPenOnPage(1, 3)
      await drag(p, [[2.5, 2.5], [2.5, 5.5]])
      const line = await penEntries(p)
      await markOffLine()
      const marks = (await penEntries(p)).filter((v) => !line.includes(v))
      assert.equal(marks.length, 3, `marks stored: ${marks}`)
      await buttonClick(button, [2.5, 4.0])
      assert.deepEqual(await settle(() => penEntries(p), marks), marks, 'the line goes, the marks stay')
      const depth = await undoDepth()
      await buttonClick(button, [7.5, 4.0])
      const left = marks.filter((v) => !v.startsWith('7,3:3'))
      assert.equal(left.length, 2, `the edge X was stored on row 7, col 3: ${marks}`)
      assert.deepEqual(await settle(() => penEntries(p), left), left, 'the edge X goes, the cell circle and cross stay')
      assert.ok(await undoDepth() > depth, 'an undo step')
      await undo()
      assert.deepEqual(await settle(() => penEntries(p), marks), marks, 'one undo brings the X back')
      await undoAll()
    })
  }

  it('a right click where a line and an edge X are both under the pointer erases the line and leaves the X', async () => {
    await undoAll()
    await selectPenOnPage(1, 3)
    await drag(p, [[3.5, 3.5], [3.5, 5.5]])
    const line = await penEntries(p)
    // the edge X on the right of cell (3,3), which is the line's own midpoint region: a left click there would draw the X
    await p.mouse.click(...(await gridPoint(p, [3.5, 4.0])))
    const both = await penEntries(p)
    assert.ok(both.length > line.length, 'the left click on the line makes an edge X')
    const marks = both.filter((v) => !line.includes(v))
    await rightClick([3.5, 4.0])
    assert.deepEqual(await settle(() => penEntries(p), marks), marks, 'only the X is left')
    await undoAll()
  })

  it('a right-drag across two lines and a mark erases all three, as one undo step', async () => {
    await undoAll()
    await selectPenOnPage(1, 3)
    await drag(p, [[1.5, 1.5], [1.5, 3.5]])
    await drag(p, [[5.5, 1.5], [5.5, 3.5]])
    const lines = await penEntries(p)
    await p.mouse.click(...(await gridPoint(p, [3.5, 2.0])))
    const withMark = await penEntries(p)
    const mark = withMark.filter((v) => !lines.includes(v))
    assert.equal(mark.length, 1)
    // a third line the drag stays clear of
    await drag(p, [[7.5, 5.5], [7.5, 7.5]])
    const third = (await penEntries(p)).filter((v) => !withMark.includes(v))
    const depth = await undoDepth()
    await mouseDrag(p, [[1.5, 2.0], [3.5, 2.0], [5.5, 2.0]], { button: 'right' })
    assert.deepEqual(await settle(() => penEntries(p), third), third, 'both lines and the mark go, the third line stays')
    assert.ok(await undoDepth() > depth, 'an undo step')
    await undo()
    const all = [...withMark, ...third].sort()
    assert.deepEqual(await settle(() => penEntries(p), all), all, 'one undo brings everything back')
    await undoAll()
  })

  it('a bent drag erases what it crosses on the way, not only on the straight run from the press to the release', async () => {
    await undoAll()
    await selectPenOnPage(1, 3)
    await drag(p, [[1.5, 1.5], [1.5, 3.5]])
    await drag(p, [[5.5, 1.5], [5.5, 3.5]])
    const both = await penEntries(p)
    const second = both.filter((v) => v.startsWith('5,'))
    assert.ok(second.length > 0 && second.length < both.length)
    // press and release in the same empty place, with the first line between them on the way
    await mouseDrag(p, [[3.5, 2.5], [1.5, 2.0], [3.5, 2.5]], { button: 'right' })
    assert.deepEqual(await settle(() => penEntries(p), second), second, 'only the first line went')
    await undoAll()
  })

  for (const [button, other] of [['right', 'middle']]) {
    it(`a ${button}-drag still erases when a ${other} button pressed during it outlasts it`, async () => {
      await undoAll()
      await selectPenOnPage(1, 3)
      await drag(p, [[1.5, 1.5], [1.5, 3.5]])
      await p.mouse.move(...await gridPoint(p, [3.5, 2.0]))
      await p.mouse.down({ button })
      await p.mouse.move(...await gridPoint(p, [0.5, 2.0]), { steps: 8 })
      await p.mouse.down({ button: other })
      await p.mouse.up({ button })
      await p.mouse.up({ button: other }) // the only `pointerup`, and it is the other button's
      assert.deepEqual(await settle(() => penEntries(p), []), [], 'the line the drag crossed is erased')
      await p.mouse.click(5, 5) // as after any middle press: a click off the grid, or the next drag draws nothing
      await undoAll()
    })
  }

  it('a right-drag that crosses nothing, and a right click on nothing, change nothing and make no undo step', async () => {
    await undoAll()
    await selectPenOnPage(1, 3)
    await drag(p, [[2.5, 2.5], [2.5, 4.5]])
    const lines = await penEntries(p)
    const depth = await undoDepth()
    await mouseDrag(p, [[6.5, 6.5], [7.5, 7.5]], { button: 'right' })
    await rightClick([6.5, 6.5])
    await sleep(150) // "nothing happened in 150 ms" check
    assert.deepEqual(await penEntries(p), lines)
    assert.equal(await undoDepth(), depth)
    await undoAll()
  })

  it('a right press over the grid in the pen tool is default-prevented and its menu stays shut; off the grid and in another tool both are left alone', async () => {
    await undoAll()
    await read(() => {
      window.__rightLog = []
      for (const type of ['pointerdown', 'mousedown', 'contextmenu']) window.addEventListener(type, (e) => window.__rightLog.push([type, e.button, e.defaultPrevented]))
    })
    const log = () => read(() => { const out = window.__rightLog; window.__rightLog = []; return out })
    // Reads until a menu event shows, since Linux raises it on the press and Windows on the release.
    const logWithMenu = async () => {
      const seen = []
      const got = await settle(async () => { seen.push(...(await log())); return seen.some(([type]) => type === 'contextmenu') }, true)
      assert.equal(got, true, `no contextmenu event: ${JSON.stringify(seen)}`)
      return seen
    }
    await selectPenOnPage(1, 3)
    await log()
    await rightClick([6.5, 6.5])
    const onGrid = await logWithMenu()
    assert.deepEqual(onGrid.filter(([type]) => type !== 'mousedown'), [['pointerdown', 2, true], ['contextmenu', 2, true]], 'prevented over the grid, and no mousedown follows the prevented pointerdown')
    await p.mouse.move(5, 5)
    await p.mouse.click(5, 5, { button: 'right' })
    assert.deepEqual((await logWithMenu()).filter(([type]) => type === 'contextmenu' || type === 'pointerdown'), [['pointerdown', 2, false], ['contextmenu', 2, false]], 'off the grid both are left alone')
    await p.click('#control-normal')
    assert.equal(await settle(() => read(() => Framework.app.tool), 'normal'), 'normal')
    await log()
    await rightClick([6.5, 6.5])
    assert.deepEqual((await logWithMenu()).filter(([type]) => type === 'contextmenu' || type === 'pointerdown'), [['pointerdown', 2, false], ['contextmenu', 2, false]], 'in another tool both are left alone')
    await openPenTool(p)
  })

  it('a right click hits where the pointer is now, not the position SudokuPad last saw: a dialog stops its tracking, and a press right after it closes erases nothing', async () => {
    await undoAll()
    await selectPenOnPage(1, 3)
    await drag(p, [[2.5, 2.5], [2.5, 4.5]])
    const lines = await penEntries(p)
    await p.mouse.move(...await gridPoint(p, [2.5, 3.0]))
    await read(() => Framework.showDialog({ content: 'A dialog', buttons: [{ tag: 'button', content: 'Close', handler: () => Framework.closeDialog() }] }))
    await p.mouse.move(...await gridPoint(p, [6.5, 6.5]))
    await read(() => Framework.closeDialog())
    // no move between the close and the press: the pointer is over empty space
    await p.mouse.down({ button: 'right' })
    await p.mouse.up({ button: 'right' })
    await sleep(150) // "nothing happened in 150 ms" check
    assert.deepEqual(await penEntries(p), lines)
    await undoAll()
  })

  it('a middle press is left alone everywhere: over the grid in the pen tool, off the grid, and in another tool', async () => {
    await undoAll()
    await read(() => {
      window.__presses = []
      for (const type of ['pointerdown', 'mousedown', 'auxclick']) window.addEventListener(type, (e) => window.__presses.push([type, e.button, e.defaultPrevented]))
    })
    const presses = () => read(() => { const out = window.__presses; window.__presses = []; return out })
    const stock = [['pointerdown', 1, false], ['mousedown', 1, false], ['auxclick', 1, false]]
    await selectPenOnPage(1, 3)
    await presses()
    await middleClick([6.5, 6.5])
    assert.deepEqual(await presses(), stock, 'over the grid')
    await p.mouse.move(5, 5)
    await p.mouse.click(5, 5, { button: 'middle' })
    assert.deepEqual((await presses()).filter(([, button]) => button === 1), stock, 'off the grid')
    await p.mouse.click(...(await gridPoint(p, [6.5, 6.5])))
    assert.deepEqual((await presses()).filter(([type]) => type !== 'click'), [['pointerdown', 0, false], ['mousedown', 0, false]], 'a left press is not prevented')
    await undo()
    await p.click('#control-normal')
    assert.equal(await settle(() => read(() => Framework.app.tool), 'normal'), 'normal')
    await presses()
    await middleClick([6.5, 6.5])
    assert.deepEqual(await presses(), stock, 'in another tool')
    await openPenTool(p)
  })

  it('no page error was raised in the whole group', () => {
    assert.deepEqual(errors, [])
  })
})
