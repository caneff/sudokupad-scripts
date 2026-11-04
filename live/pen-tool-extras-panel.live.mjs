// Live check of pen-tool-extras.user.js's thickness and opacity sliders in the pen tool's panel, and
// of the shrunken line mode box beside them, on sudokupad.app in headless Chromium.
// Run with `npm run test:live`. It needs the network and a Playwright Chromium, so
// it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so
// Tampermonkey's real injection time and crackingthecryptic.com stay untested, and so does a
// touch screen. Each injection time runs the same checks:
//   document-idle: at DOMContentLoaded, as `@run-at document-idle` approximates it
//   before-start:  after the page loads, before Start Puzzle
//   after-start:   after Start Puzzle, when the controls already exist
// Every slider move is a real mouse drag.
/* global Framework, ToolPen */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openSettings } from './settings.mjs'

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')

const THICKNESS_KEY = 'PenColor_thickness'
const OPACITY_KEY = 'PenColor_opacity'
const LINE_MODE_KEY = 'ToolPen_linemode'
const THICKNESS = '#pen-tool-extras-thickness'
const OPACITY = '#pen-tool-extras-opacity'
const POLL_MS = 50
const SETTLE_MS = 10000
const START = /Start Puzzle|Continue|Resume/i

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Reads until it equals `expected` (compared as JSON) or `timeoutMs` passes, and
// returns the last reading, so the caller's assert.deepEqual names what it got.
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

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

for (const mode of ['document-idle', 'before-start', 'after-start']) {
  describe(`injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors

    const read = (fn, arg) => p.evaluate(fn, arg)
    const saved = (key) => read((k) => Framework.getData(k), key)
    const dialogButton = (text) => p.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()
    const editor = () => p.locator('#pen-tool-extras-editor')
    const sliderValue = (selector) => p.locator(selector).inputValue()
    const undoDepth = () => read(() => Framework.app.puzzle.undoStack.length)
    const penValues = () => read(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => v[0])).sort())
    const strokeCount = () => read(() => document.querySelectorAll('.cell-pen').length)
    const activeElementTag = () => read(() => document.activeElement.tagName)
    // The computed stroke width and opacity of the first stroke of pen color 1, drawn by `draw`.
    const lineWidth = () => read(() => parseFloat(window.getComputedStyle(document.querySelector('.cell-pen.pencolor-1')).strokeWidth))
    const lineOpacity = () => read(() => parseFloat(window.getComputedStyle(document.querySelector('.cell-pen.pencolor-1')).opacity))

    // The pen button toggles the tool, and SudokuPad binds its handler a moment after the
    // button appears, so it is clicked again until the tool's buttons show.
    const selectPen = async () => {
      const shown = () => p.locator('.tool-pen button[data-key="1"]').isVisible()
      const deadline = Date.now() + SETTLE_MS
      while (!(await shown()) && Date.now() < deadline) {
        await p.click('#control-pen')
        await settle(shown, true, 500)
      }
    }

    // One free line in pen color 1 across the middle of grid row `row`. A line drawn over an existing one
    // erases it, so a second line takes another row.
    const draw = async (row = 8) => {
      await selectPen()
      await p.locator('.tool-pen button[data-key="1"]').click()
      const [x, y] = await read((row) => {
        const box = Framework.app.puzzle.cells.find((c) => c.row === row && c.col === 4).elem.getBoundingClientRect()
        return [box.x + box.width / 2, box.y + box.height / 2]
      }, row)
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.move(x + 110, y + 10, { steps: 6 })
      await p.mouse.up()
      await p.locator('.cell-pen.pencolor-1').first().waitFor({ state: 'attached' })
    }

    // Presses on the middle of the slider and drags to `toX` (a page x), a real mouse drag.
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

    const boot = async () => {
      await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
      const start = p.getByRole('button', { name: START }).first()
      await start.waitFor({ state: 'visible' })
      if (mode === 'before-start') await p.addScriptTag({ content: script })
      await start.click()
      await start.waitFor({ state: 'hidden' })
      await p.locator('#control-undo').waitFor({ state: 'visible' })
      if (mode === 'after-start') await p.addScriptTag({ content: script })
      await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
      // The pen tool is off until its own setting turns it on.
      await read(() => Framework.setSetting('toolpen', true))
      await p.locator('#control-pen').waitFor({ state: 'visible' })
      await selectPen()
    }
    const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }
    const openEditor = async () => {
      await openSettings(p)
      await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Pen tool extras' }).first().click()
      await editor().waitFor({ state: 'visible' })
    }

    before(async () => {
      context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
      errors = []
      p = await context.newPage()
      p.on('pageerror', (e) => errors.push(String(e)))
      await p.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
      if (mode === 'document-idle') {
        await p.addInitScript((src) => {
          document.addEventListener('DOMContentLoaded', () => {
            const s = document.createElement('script')
            s.textContent = src
            document.documentElement.appendChild(s)
          })
        }, script)
      }
      await p.goto(url, { waitUntil: 'load', timeout: 60000 })
      await boot()
      await read(([a, b]) => { Framework.removeData(a); Framework.removeData(b) }, [THICKNESS_KEY, OPACITY_KEY])
      await draw()
    })
    after(async () => {
      await read(([a, b]) => { Framework.removeData(a); Framework.removeData(b) }, [THICKNESS_KEY, OPACITY_KEY])
      await context.close()
    })

    it('with the pen tool on, Thickness is above Opacity in the line mode row, at SudokuPad\'s own 5 and 0.8, with no pad growth', async () => {
      const [thickness, opacity, row] = await Promise.all([THICKNESS, OPACITY, '.pen-tool-extras-sliders'].map((s) => p.locator(s).boundingBox()))
      assert.equal(thickness.y < opacity.y, true, 'Thickness above Opacity')
      assert.deepEqual(await p.locator(THICKNESS).evaluate((el) => [el.min, el.max, el.step, el.value]), ['1', '12', '1', '5'])
      assert.deepEqual(await p.locator(OPACITY).evaluate((el) => [el.min, el.max, el.step, el.value]), ['20', '100', '5', '80'])
      assert.equal(await lineWidth(), 5)
      assert.equal(await lineOpacity(), 0.8)
      const input = await p.locator('.tool-pen .controls-input').boundingBox()
      const mode = await p.locator('.penlinemode').boundingBox()
      // Both sliders sit inside the row the line mode pulldown fills, right of the box, and the
      // box is about one button wide (a button is 64 px at this size).
      assert.equal(row.y >= mode.y - 1 && row.y + row.height <= mode.y + mode.height + 1, true, JSON.stringify({ row, mode }))
      assert.equal(row.x >= mode.x + mode.width && row.x + row.width <= input.x + input.width + 1, true, JSON.stringify({ row, mode, input }))
      assert.equal(mode.width <= 90, true, `mode box ${mode.width} wide`)
      // The pad is no taller with the sliders than without.
      const height = () => p.locator('.controls-buttons').evaluate((el) => el.getBoundingClientRect().height)
      const withSliders = await height()
      await p.locator('.pen-tool-extras-sliders').evaluate((el) => { el.style.display = 'none' })
      assert.equal(await height(), withSliders)
      await p.locator('.pen-tool-extras-sliders').evaluate((el) => { el.style.display = '' })
    })

    it('the line mode box is the same control: Both, Center and Edge choose the three modes SudokuPad saves, and a slider move leaves the mode alone', async () => {
      const select = p.locator('.penlinemode select')
      assert.deepEqual(await select.locator('option').evaluateAll((os) => os.map((o) => [o.value, o.textContent])), [['both', 'Both'], ['centeronly', 'Center'], ['edgeonly', 'Edge']])
      for (const value of ['edgeonly', 'centeronly', 'both']) {
        await select.selectOption(value)
        assert.equal(await read(() => ToolPen.tool.lineMode), value)
        assert.equal(await saved(LINE_MODE_KEY), value)
        assert.equal(await select.inputValue(), value)
      }
      await select.selectOption('edgeonly')
      await dragToMax(THICKNESS)
      assert.equal(await read(() => ToolPen.tool.lineMode), 'edgeonly')
      assert.equal(await saved(LINE_MODE_KEY), 'edgeonly')
      await select.selectOption('both')
    })

    it('a real drag on Thickness changes the line\'s computed width and saves at once, with no Save', async () => {
      await read((k) => Framework.removeData(k), THICKNESS_KEY)
      await selectPen()
      await dragToMax(THICKNESS)
      assert.equal(await sliderValue(THICKNESS), '12')
      assert.equal(await settle(lineWidth, 12), 12)
      assert.equal(await saved(THICKNESS_KEY), 12)
      await dragSlider(THICKNESS, GRID_X)
      assert.equal(await sliderValue(THICKNESS), '1')
      assert.equal(await settle(lineWidth, 1), 1)
      assert.equal(await saved(THICKNESS_KEY), 1)
    })

    it('a real drag on Opacity changes the line\'s computed opacity and saves at once, with no Save', async () => {
      await read((k) => Framework.removeData(k), OPACITY_KEY)
      await selectPen()
      await dragSlider(OPACITY, GRID_X)
      assert.equal(await sliderValue(OPACITY), '20')
      assert.equal(await settle(lineOpacity, 0.2), 0.2)
      assert.equal(await saved(OPACITY_KEY), 20)
      await dragToMax(OPACITY)
      assert.equal(await sliderValue(OPACITY), '100')
      assert.equal(await settle(lineOpacity, 1), 1)
      assert.equal(await saved(OPACITY_KEY), 100)
    })

    it('a slider drag adds nothing to the undo stack or the replay, draws no pen stroke and leaves every pen mark as it was', async () => {
      const before = { depth: await undoDepth(), strokes: await strokeCount(), pen: await penValues(), replay: await read(() => Framework.app.getReplay()) }
      // Both drags end over the grid, so a stroke drawn by the slider's pointer events would show.
      await dragSlider(THICKNESS, GRID_X)
      await dragSlider(OPACITY, GRID_X)
      await dragToMax(THICKNESS)
      await dragToMax(OPACITY)
      assert.equal(await undoDepth(), before.depth)
      assert.equal(await strokeCount(), before.strokes)
      assert.deepEqual(await penValues(), before.pen)
      assert.equal(await read(() => Framework.app.getReplay()), before.replay)
    })

    it('focus stays with play: right after a drag nothing is focused, Ctrl+Z undoes and an arrow key leaves the slider alone', async () => {
      await dragSlider(THICKNESS, GRID_X)
      assert.equal(await activeElementTag(), 'BODY')
      const thickness = await sliderValue(THICKNESS)
      const depth = await undoDepth()
      assert.equal(depth > 0, true, 'a mark to undo')
      await p.keyboard.press('Control+z')
      assert.equal(await settle(async () => (await undoDepth()) < depth, true), true, 'Ctrl+Z undid something')
      await p.keyboard.press('ArrowRight')
      assert.equal(await sliderValue(THICKNESS), thickness)
      await draw()
      await dragSlider(OPACITY, GRID_X)
      assert.equal(await activeElementTag(), 'BODY')
      const opacity = await sliderValue(OPACITY)
      await p.keyboard.press('ArrowLeft')
      assert.equal(await sliderValue(OPACITY), opacity)
    })

    it('the saved values survive a reload and show on the sliders and the marks', async () => {
      await dragToMax(THICKNESS)
      await dragToMax(OPACITY)
      assert.equal(await saved(THICKNESS_KEY), 12)
      assert.equal(await saved(OPACITY_KEY), 100)
      await reload()
      assert.equal(await sliderValue(THICKNESS), '12')
      assert.equal(await sliderValue(OPACITY), '100')
      await draw(7)
      assert.equal(await settle(lineWidth, 12), 12)
      assert.equal(await settle(lineOpacity, 1), 1)
    })

    it('the sliders exist only with the pen tool: another tool takes them away and the pen brings them back with the saved values', async () => {
      await p.click('#control-normal')
      await p.locator('.pen-tool-extras-sliders').waitFor({ state: 'detached' })
      assert.equal(await p.locator(THICKNESS).count(), 0)
      assert.equal(await p.locator(OPACITY).count(), 0)
      await selectPen()
      await p.locator('.pen-tool-extras-sliders').waitFor({ state: 'visible' })
      assert.equal(await p.locator('.pen-tool-extras-sliders').count(), 1)
      assert.equal(await sliderValue(THICKNESS), '12')
      assert.equal(await sliderValue(OPACITY), '100')
    })

    it('the dialog no longer holds either slider, and Restore defaults resets them and updates the panel at once', async () => {
      await openEditor()
      assert.equal(await editor().locator('input[type=range]').count(), 0)
      assert.equal(await editor().getByText(/Thickness|Opacity/).count(), 0)
      await dialogButton('Restore defaults').click()
      assert.equal(await settle(() => sliderValue(THICKNESS), '5'), '5')
      assert.equal(await sliderValue(OPACITY), '80')
      assert.equal(await settle(lineWidth, 5), 5)
      assert.equal(await settle(lineOpacity, 0.8), 0.8)
      assert.equal(await saved(THICKNESS_KEY), null)
      assert.equal(await saved(OPACITY_KEY), null)
      await dialogButton('Cancel').click()
      await editor().waitFor({ state: 'detached' })
      assert.equal(await saved(THICKNESS_KEY), null)
      assert.equal(await sliderValue(THICKNESS), '5')
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })
}
