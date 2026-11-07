// Live check of draw-tool.user.js's erasing on sudokupad.app: a right-drag deletes the strokes it crosses, the board's
// context menu is suppressed while Draw is current, and Clear all asks first. Real mouse input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { gridPoint, mouseDrag } from './pen.mjs'
import { clickUntil, settle, SETTLE_MS } from './settle.mjs'

const script = readFileSync(new URL('../draw-tool.user.js', import.meta.url), 'utf8')

const DRAW_BUTTON = '#control-draw'
const DIGIT_BUTTON = '#control-normal'
const CLEAR_BUTTON = '.draw-tool-clear'
const STROKES = '#draw-tool-layer path'
const DIALOG = '.dialog'
const DRAWING_PREFIX = 'DrawTool_drawing_'
const INDEX_KEY = 'DrawTool_index'
// Two strokes along rows 2 and 4, from c2 to c7, in cells from the grid's top left.
const UPPER = [[1.5, 1.5], [1.6, 4], [1.5, 6.5]]
const LOWER = [[3.5, 1.5], [3.4, 4], [3.5, 6.5]]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Draw Tool\'s erasing', { concurrency: false }, () => {
  let context, p, errors
  // A right click on the board before the script runs: whether the page prevented its menu, and the cells selected.
  let stockRightClick

  const read = (fn, arg) => p.evaluate(fn, arg)
  const tool = () => read(() => Framework.app.tool)
  const pickDraw = () => clickUntil(() => p.click(DRAW_BUTTON), tool, 'draw', SETTLE_MS)
  const pickDigit = () => clickUntil(() => p.click(DIGIT_BUTTON), tool, 'normal', SETTLE_MS)
  const strokeCount = () => p.locator(STROKES).count()
  const strokePaths = () => read((selector) => [...document.querySelectorAll(selector)].map((e) => e.getAttribute('d')), STROKES)
  const saved = () => read((prefix) => Framework.getData(prefix + String(Framework.app.puzzle.puzzleId || window.location.href)), DRAWING_PREFIX)
  const boot = async () => {
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    await p.locator(DRAW_BUTTON).waitFor({ state: 'visible' })
  }
  const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }
  const drawTwo = async () => {
    await pickDraw()
    await mouseDrag(p, UPPER)
    await mouseDrag(p, LOWER)
    assert.equal(await strokeCount(), 2)
    return strokePaths()
  }
  const rightDrag = async (points) => {
    await p.mouse.move(...await gridPoint(p, points[0]))
    await p.mouse.down({ button: 'right' })
    for (const point of points.slice(1)) await p.mouse.move(...await gridPoint(p, point), { steps: 8 })
    await p.mouse.up({ button: 'right' })
  }
  // A right click at r5c5's middle: whether its contextmenu event ended prevented, and the cells selected after it.
  // The listener is added last, so it runs after every listener the page and the script added.
  const rightClick = async () => {
    await read(() => {
      window.__menuPrevented = []
      window.addEventListener('contextmenu', (e) => window.__menuPrevented.push(e.defaultPrevented), { once: true })
    })
    await p.mouse.click(...await gridPoint(p, [4.5, 4.5]), { button: 'right' })
    return { prevented: await read(() => window.__menuPrevented), selected: await read(() => Framework.app.puzzle.selectedCells.length) }
  }
  const openClear = async () => {
    await p.click(CLEAR_BUTTON)
    await p.locator(DIALOG).waitFor({ state: 'visible' })
    // Framework.closeDialog does nothing while window.dialogJustShown is set, which showDialog clears in a
    // setTimeout; on a page busy after a reload a press can come first, and the dialog then stays open.
    await p.waitForFunction(() => !window.dialogJustShown)
  }
  // The middle of the dialog button labelled `label`, which must lie over the board for the check to mean anything.
  const buttonOverBoard = async (label) => {
    const [x, y, inside] = await read((text) => {
      const button = [...document.querySelectorAll('.dialog button')].find((b) => b.textContent === text)
      const b = button.getBoundingClientRect()
      const board = Framework.app.svgRenderer.getElem().getBoundingClientRect()
      const x = b.x + b.width / 2
      const y = b.y + b.height / 2
      return [x, y, x > board.left && x < board.right && y > board.top && y < board.bottom]
    }, label)
    assert.equal(inside, true, `the ${label} button is over the board`)
    return [x, y]
  }
  // A press at (x, y), a drag across the board and the release on it.
  const pressDragRelease = async ([x, y]) => {
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(...await gridPoint(p, [6.5, 6.5]), { steps: 8 })
    await p.mouse.up()
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await startPuzzle(p)
    await p.evaluate(() => Framework.app.deselect())
    stockRightClick = await rightClick()
    await p.addScriptTag({ content: script })
    await p.locator(DRAW_BUTTON).waitFor({ state: 'visible' })
    await read(([prefix, index]) => {
      Object.keys(window.localStorage).filter((k) => k.includes(prefix)).forEach((k) => window.localStorage.removeItem(k))
      Framework.removeData(index)
    }, [DRAWING_PREFIX, INDEX_KEY])
  })
  after(async () => { await context.close() })

  it('the Draw tool gets the right button as a mousedown with button 2', async () => {
    await pickDraw()
    // App.toolExecHandler triggers `tool-<handler>` with the event before it calls the current tool's handler.
    const got = read(() => new Promise((resolve) => {
      const handler = (e) => { Framework.app.off('tool-handleInputdown', handler); resolve([e.type, e.button]) }
      Framework.app.on('tool-handleInputdown', handler)
    }))
    await p.mouse.click(...await gridPoint(p, [8.5, 8.5]), { button: 'right' })
    assert.deepEqual(await got, ['mousedown', 2])
  })

  it('a right-drag across one of two strokes deletes it whole and keeps the other, and a reload shows the same', async () => {
    const [, lower] = await drawTwo()
    await rightDrag([[1, 3], [2, 3.3]])
    assert.deepEqual(await strokePaths(), [lower])
    assert.equal((await saved()).length, 1)
    await reload()
    assert.deepEqual(await settle(strokePaths, [lower]), [lower])
  })

  it('a right-drag that passes near no stroke deletes nothing', async () => {
    await pickDraw()
    await rightDrag([[5.5, 1], [6.5, 8]])
    assert.equal(await strokeCount(), 1)
  })

  it('with Draw current a right click on the board opens no context menu and selects no cell', async () => {
    await pickDraw()
    await p.evaluate(() => Framework.app.deselect())
    assert.deepEqual(await rightClick(), { prevented: [true], selected: 0 })
  })

  it('with another tool current a right click behaves as it does without the script', async () => {
    await pickDigit()
    await p.evaluate(() => Framework.app.deselect())
    assert.deepEqual(stockRightClick.prevented, [false], 'the page itself leaves the menu alone')
    assert.deepEqual(await rightClick(), stockRightClick)
  })

  it('Clear all asks "Clear the drawing?", and Cancel keeps every stroke', async () => {
    await pickDraw()
    await mouseDrag(p, UPPER)
    const before = await strokePaths()
    assert.equal(before.length, 2)
    await openClear()
    assert.match(await p.locator(DIALOG).textContent(), /Clear the drawing\?/)
    await p.mouse.click(...await buttonOverBoard('Cancel'))
    await p.locator(DIALOG).waitFor({ state: 'detached' })
    assert.deepEqual(await strokePaths(), before)
    assert.equal((await saved()).length, 2)
  })

  it('closing the dialog by a button pressed over the board and released after a drag on it leaves no stroke', async () => {
    const before = await strokePaths()
    await openClear()
    await pressDragRelease(await buttonOverBoard('Cancel'))
    await p.locator(DIALOG).waitFor({ state: 'detached' })
    assert.deepEqual(await strokePaths(), before)
  })

  it('closing the dialog by its overlay over the board, with a drag on the board, leaves no stroke', async () => {
    const before = await strokePaths()
    await openClear()
    // r1c1's middle is over the board and outside the dialog, which sits over the board's middle.
    const corner = await gridPoint(p, [0.5, 0.5])
    assert.equal(await read(([x, y]) => document.elementFromPoint(x, y).classList.contains('dialog-overlay'), corner), true, 'the press lands on the overlay')
    await pressDragRelease(corner)
    await p.locator(DIALOG).waitFor({ state: 'detached' })
    assert.deepEqual(await strokePaths(), before)
    assert.equal(await tool(), 'draw')
  })

  it('Clear all\'s OK removes every stroke, and a reload shows none', async () => {
    assert.equal(await strokeCount(), 2)
    await openClear()
    await pressDragRelease(await buttonOverBoard('OK'))
    await p.locator(DIALOG).waitFor({ state: 'detached' })
    assert.equal(await settle(strokeCount, 0), 0)
    assert.equal(await saved(), null)
    await reload()
    assert.equal(await strokeCount(), 0)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
