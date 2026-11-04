// Live check of pen-tool-extras.user.js's whole-line erase (a middle click in the pen tool) on sudokupad.app in headless Chromium.
// Run with `npm run test:live`. The first run of a day needs the network (live/cache.mjs records SudokuPad, later runs replay it) and a Playwright Chromium, so it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so Tampermonkey's real injection time and
// crackingthecryptic.com stay untested. A real mouse's middle button on Windows is still owed: headless Chromium draws no
// autoscroll, so the checks read `defaultPrevented` on the press events instead of watching a scroll. Each injection time runs
// the same checks:
//   document-idle: at DOMContentLoaded, as `@run-at document-idle` approximates it
//   before-start:  after the page loads, before Start Puzzle
//   after-start:   after Start Puzzle, when the controls already exist
// Every drag and click is real input except one `mousedown` sent by hand, and each check reads what is stored (`cell.pen`) and the
// undo stack; the autoscroll checks read `defaultPrevented` on the press events instead.
/* global Framework, MouseEvent */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { routeSudokuPad } from './cache.mjs'

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')

const KEYS = ['PenColor_pen', 'PenColor_colors', 'PenColor_thickness', 'PenColor_opacity', 'ToolPen_color']
const POLL_MS = 50
const SETTLE_MS = 10000
const START = /Start Puzzle|Continue|Resume/i
const PAGE_BUTTON = '.pen-tool-extras-page'
const PAGES = { 1: '123456789', 2: 'abcdefghi', 3: 'jlnprtvxz' }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Reads until it equals `expected` (compared as JSON) or `timeoutMs` passes, and returns the last reading.
async function settle (read, expected, timeoutMs = SETTLE_MS) {
  const want = JSON.stringify(expected)
  const deadline = Date.now() + timeoutMs
  let value = await read()
  while (JSON.stringify(value) !== want && Date.now() < deadline) {
    await sleep(POLL_MS)
    value = await read()
  }
  return value
}

async function startPuzzle (page, beforeStart = async () => {}) {
  await page.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
  const start = page.getByRole('button', { name: START }).first()
  await start.waitFor({ state: 'visible' })
  await beforeStart()
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

function group (title, mode) {
  describe(title, { concurrency: false }, () => {
    let context, p, errors

    const read = (fn, arg) => p.evaluate(fn, arg)
    // The pen entries of every cell as `row,col:value+color`, sorted.
    const penValues = () => read(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => `${c.row},${c.col}:${v}`)).sort())
    const undoDepth = () => read(() => Framework.app.puzzle.undoStack.length)
    const padValues = () => read(() => [...document.querySelectorAll('.controls-input button[data-key]')].filter((b) => b.dataset.key !== '0').map((b) => b.dataset.value).join(''))
    const cellCentre = (row, col) => read(([r, c]) => {
      const box = Framework.app.puzzle.cells.find((cell) => cell.row === r && cell.col === c).elem.getBoundingClientRect()
      return [box.x + box.width / 2, box.y + box.height / 2, box.width]
    }, [row, col])
    // A point [row, col] in cells from the grid's top left (a cell's middle is at .5), as page pixels.
    const pixel = async ([r, c]) => {
      const [x0, y0, size] = await cellCentre(0, 0)
      return [x0 + (c - 0.5) * size, y0 + (r - 0.5) * size]
    }

    const drag = async (points) => {
      const before = JSON.stringify(await penValues())
      await p.mouse.move(...await pixel(points[0]))
      await p.mouse.down()
      for (const point of points.slice(1)) await p.mouse.move(...await pixel(point), { steps: 8 })
      await p.mouse.up()
      assert.equal(await settle(async () => JSON.stringify(await penValues()) !== before, true), true, 'the drag changed the grid')
    }
    const middleClick = async (point) => {
      const [x, y] = await pixel(point)
      await p.mouse.move(x, y)
      await p.mouse.click(x, y, { button: 'middle' })
    }
    const undo = () => p.click('#control-undo')
    const undoAll = async () => { while ((await undoDepth()) > 0) await undo() }

    // Turns to pen page `page` and selects the pen on button `key`.
    const selectPen = async (page, key) => {
      await openPenTool(p)
      await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
      for (let i = 0; i < 3 && (await padValues()) !== PAGES[page]; i++) await p.locator(PAGE_BUTTON).click()
      assert.equal(await settle(padValues, PAGES[page]), PAGES[page])
      await p.locator(`.tool-pen button[data-key="${key}"]`).click()
    }

    const boot = async () => {
      await startPuzzle(p, async () => { if (mode === 'before-start') await p.addScriptTag({ content: script }) })
      if (mode === 'after-start') await p.addScriptTag({ content: script })
      await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
      await read(() => { Framework.setSetting('toolpen', true) })
      await p.locator('#control-pen').waitFor({ state: 'visible' })
      await openPenTool(p)
      await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
    }

    before(async () => {
      context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
      errors = []
      p = await context.newPage()
      p.on('pageerror', (e) => errors.push(String(e)))
      p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`) })
      await routeSudokuPad(p)
      if (mode === 'document-idle') {
        await p.addInitScript((source) => {
          document.addEventListener('DOMContentLoaded', () => {
            const s = document.createElement('script')
            s.textContent = source
            document.documentElement.appendChild(s)
          })
        }, script)
      }
      await p.goto(url, { waitUntil: 'load', timeout: 60000 })
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
        await undoAll()
        // the other pen: a vertical line through the row, drawn first with the pen on button 6 of the same page
        await selectPen(page, 6)
        await drag([[0.5, 4.5], [4.5, 4.5]])
        const otherPen = await penValues()
        assert.equal(otherPen.length, 4)
        await selectPen(page, key)
        await drag([[2.5, 2.5], [2.5, 4.5]])
        // the second half goes the other way on page 3: drawn from its right end to the left
        await drag([[2.5, 6.5], [2.5, 4.5]])
        await drag([[2.5, 3.5], [3.5, 3.5], [3.5, 2.5]])
        const drawn = await penValues()
        assert.ok(drawn.length > otherPen.length, `${drawn.length} entries drawn, ${otherPen.length} of the other pen`)
        if (page === 3) assert.deepEqual([...new Set(drawn.filter((v) => !otherPen.includes(v)).map((v) => v.slice(-1)))].sort(), ['n', 'o'])
        const depth = await undoDepth()

        await middleClick([2.5, 3.0])
        assert.deepEqual(await settle(penValues, otherPen), otherPen, 'only the other pen is left')
        const erasedDepth = await undoDepth()
        assert.ok(erasedDepth > depth, `undo depth ${erasedDepth} after the erase, ${depth} before`)

        const afterErase = await read(() => Framework.app.getReplay())
        await undo()
        assert.deepEqual(await settle(penValues, drawn), drawn, 'one undo brings the whole line back')
        await p.click('#control-redo')
        assert.deepEqual(await settle(penValues, otherPen), otherPen, 'redo erases it again')

        await undoAll()
        await read((r) => Framework.app.loadReplay(r), afterErase)
        assert.deepEqual(await settle(penValues, otherPen), otherPen, 'the replay holds the erase')
        await undoAll()
      })
    }

    it('a middle click where there is no line does nothing and makes no mark, not in a cell\'s middle, on an edge or off the grid', async () => {
      await undoAll()
      await selectPen(1, 3)
      await drag([[2.5, 2.5], [2.5, 4.5]])
      const lines = await penValues()
      const depth = await undoDepth()
      for (const point of [[6.5, 6.5], [6.0, 6.5], [6.0, 6.0], [-0.3, 3.0], [3.0, 3.5]]) {
        await middleClick(point)
        // a mark would be stored by the time the click's handlers have run, so the same state a moment later is the answer
        await sleep(150) // "nothing happened in 150 ms" check
        assert.deepEqual(await penValues(), lines, `no change at ${point}`)
        assert.equal(await undoDepth(), depth, `no undo step at ${point}`)
      }
      await undoAll()
    })

    it('marks are never erased: a middle click on a line leaves a cell circle, a cross and an edge X', async () => {
      await undoAll()
      await selectPen(1, 3)
      await drag([[2.5, 2.5], [2.5, 5.5]])
      const line = await penValues()
      // a cell circle and cross (left clicks in cell middles off the line), and an edge X on a cell's right edge
      const [cx, cy] = await cellCentre(6, 1)
      await p.mouse.click(cx, cy)
      await p.mouse.click(cx, cy)
      await p.mouse.click(...(await pixel([7.5, 3.5])))
      await p.mouse.click(...(await pixel([7.5, 4.0])))
      const marks = (await penValues()).filter((v) => !line.includes(v))
      assert.equal(marks.length, 3, `marks stored: ${marks}`)
      await middleClick([2.5, 4.0])
      assert.deepEqual(await settle(penValues, marks), marks)
      await undoAll()
    })

    it('a middle click hits where the pointer is now, not the position SudokuPad last saw: a dialog stops its tracking, and a press right after it closes erases nothing', async () => {
      await undoAll()
      await selectPen(1, 3)
      await drag([[2.5, 2.5], [2.5, 4.5]])
      const lines = await penValues()
      await p.mouse.move(...await pixel([2.5, 3.0]))
      await read(() => Framework.showDialog({ content: 'A dialog', buttons: [{ tag: 'button', content: 'Close', handler: () => Framework.closeDialog() }] }))
      await p.mouse.move(...await pixel([6.5, 6.5]))
      await read(() => Framework.closeDialog())
      // no move between the close and the press: the pointer is over empty space
      await p.mouse.down({ button: 'middle' })
      await p.mouse.up({ button: 'middle' })
      await sleep(150) // "nothing happened in 150 ms" check
      assert.deepEqual(await penValues(), lines)
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
      await selectPen(1, 3)
      await presses()
      await middleClick([6.5, 6.5])
      assert.deepEqual(await presses(), [['pointerdown', 1, true]], 'the prevented pointerdown is the only event: no mouse events follow')
      await syntheticMousedown(1)
      assert.deepEqual(await presses(), [['mousedown', 1, true]])
      // a middle press off the grid (the page's corner) keeps its autoscroll
      await p.mouse.move(5, 5)
      await p.mouse.click(5, 5, { button: 'middle' })
      assert.deepEqual((await presses()).filter(([, button]) => button === 1), [['pointerdown', 1, false], ['mousedown', 1, false]])
      await p.mouse.click(...(await pixel([6.5, 6.5])))
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
}

for (const mode of ['document-idle', 'before-start', 'after-start']) group(`injected ${mode}`, mode)
