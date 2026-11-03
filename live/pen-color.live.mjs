// Live check of pen-color.user.js on sudokupad.app, in headless Chromium.
// Run with `npm run test:live`. It needs the network and a Playwright Chromium, so
// it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so
// Tampermonkey's real injection time and crackingthecryptic.com stay untested.
// Each injection time runs the same checks:
//   document-idle: at DOMContentLoaded, as `@run-at document-idle` approximates it
//   before-start:  after the page loads, before Start Puzzle
//   after-start:   after Start Puzzle, when the controls already exist
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { headerVersion, openSettings } from './settings.mjs'

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../pen-color.user.js', import.meta.url), 'utf8')

const { COLOR_TOOL_WAIT_MS } = createRequire(import.meta.url)('../pen-color.user.js')

const DATA_KEY = 'PenColor_colors'
// What the pen colors are with nothing saved: SudokuPad's cell color pages, darkened. Typed out
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
const rgbOf = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
// SudokuPad's default cell colors for keys 0-9 (tool-color.js), as the page computes them.
const CELL_VARS = ['transparent', 'rgb(214, 214, 214)', 'rgb(124, 124, 124)', 'rgb(-36, -36, -36)', 'rgb(179, 229, 106)', 'rgb(232, 124, 241)', 'rgb(228, 150, 50)', 'rgb(245, 58, 55)', 'rgb(252, 235, 63)', 'rgb(61, 153, 245)']
// The colors the checks choose.
const FOUR = { hex: '#ff00ff', rgb: 'rgb(255, 0, 255)' }
const NINE = { hex: '#00cccc', rgb: 'rgb(0, 204, 204)' }
// A customized cell color on page 0, key 4, and the pen color it darkens to (computed by the
// script's darkening of rgb(10, 20, 200)).
const CUSTOM_CELL = { css: 'rgb(10, 20, 200)', pen: '#05008c' }

const POLL_MS = 50
const SETTLE_MS = 10000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Reads until it equals `expected` (compared as JSON) or SETTLE_MS passes, and
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

const START = /Start Puzzle|Continue|Resume/i
const STYLE = '#pen-color-style'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

for (const mode of ['document-idle', 'before-start', 'after-start']) {
  describe(`injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors

    const read = (fn, arg) => p.evaluate(fn, arg)
    const editor = () => p.locator('#pen-color-editor')
    const dialogButton = (text) => p.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()
    const startButton = () => p.getByRole('button', { name: START }).first()
    const saved = () => read((k) => Framework.getData(k), DATA_KEY)

    // The computed stroke of every drawn stroke of pen color `n`, in drawing order.
    const strokes = (n) => read((n) => [...document.querySelectorAll(`.cell-pen.pencolor-${n}`)].map((e) => window.getComputedStyle(e).stroke), n)
    const allStrokes = (n) => async () => [...new Set(await strokes(n))]
    const strokeCount = async () => (await read(() => document.querySelectorAll('.cell-pen').length))
    // The color of a tool button's swatch, which SudokuPad draws as the button's :after.
    const swatch = (n) => read((n) => window.getComputedStyle(document.querySelector(`.tool-pen button[data-key="${n}"]`), ':after').backgroundColor, n)
    // All nine swatches, as rgb(), once the pen tool's buttons are showing.
    const swatches = async () => {
      await selectPen()
      return read(() => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => window.getComputedStyle(document.querySelector(`.tool-pen button[data-key="${n}"]`), ':after').backgroundColor))
    }
    const swatchesAre = async (hexes) => {
      const want = hexes.map(rgbOf)
      assert.deepEqual(await settle(swatches, want), want)
    }
    // The cell color variables for keys 0-9 as the page computes them, and SudokuPad's color tool.
    const cellVars = () => read(() => [...Array(10)].map((_, i) => window.getComputedStyle(document.documentElement).getPropertyValue(`--cell-color-${i}`).trim()))
    const setCellColorPage = (page) => read((page) => Framework.app.tools.colour.setPage(page), page)
    const setCellColor = ([key, css]) => read(([key, css]) => Framework.app.tools.colour.setColor(key, css), [key, css])
    const restoreDefaults = () => dialogButton('Restore defaults').click()
    const pickerValues = () => editor().locator('input[type=color]').evaluateAll((es) => es.map((e) => e.value))

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

    // Draws one stroke with pen color `n` in row `row` of the screen's first cell column, so
    // that no two strokes are the same line.
    const draw = async (n, row) => {
      await selectPen()
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
      await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
      await startButton().waitFor({ state: 'visible' })
      if (mode === 'before-start') await p.addScriptTag({ content: script })
      await startButton().click()
      await startButton().waitFor({ state: 'hidden' })
      await p.locator('#control-undo').waitFor({ state: 'visible' })
      if (mode === 'after-start') await p.addScriptTag({ content: script })
      await p.locator(STYLE).waitFor({ state: 'attached' })
      // The pen tool is off until its own setting turns it on.
      await read(() => Framework.setSetting('toolpen', true))
      await p.locator('#control-pen').waitFor({ state: 'visible' })
    }
    const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }
    const openEditor = async () => {
      await openSettings(p)
      await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Pen color' }).first().click()
      await editor().waitFor({ state: 'visible' })
    }
    const closeWith = async (text) => {
      await dialogButton(text).click()
      await editor().waitFor({ state: 'detached' })
    }
    const pick = (n, hex) => editor().locator(`input[data-pen="${n}"]`).fill(hex)

    before(async () => {
      context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
      errors = []
      p = await context.newPage()
      p.on('pageerror', (e) => errors.push(String(e)))
      await p.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
      if (mode === 'document-idle') {
        await p.addInitScript((src) => {
          document.addEventListener('DOMContentLoaded', () => {
            window.__fwAtIdle = typeof Framework + '/' + (typeof Framework !== 'undefined' && typeof Framework.getApp)
            const s = document.createElement('script')
            s.textContent = src
            document.documentElement.appendChild(s)
          })
        }, script)
      }
      await p.goto(url, { waitUntil: 'load', timeout: 60000 })
      await boot()
    })
    after(async () => { await context.close() })

    // Only this mode runs the script before the page's own scripts have finished;
    // the other two wait for Framework before injecting, so the check would be vacuous.
    if (mode === 'document-idle') {
      it('Framework and getApp exist when the script runs', async () => {
        assert.equal(await read(() => window.__fwAtIdle), 'function/function')
      })
    }

    it('a fresh install has nothing saved, and swatches and strokes show the darkened first color page', async () => {
      assert.equal(await saved(), null)
      await swatchesAre(PAGE_PENS[0])
      await draw(4, 1)
      assert.deepEqual(await settle(allStrokes(4), [rgbOf(PAGE_PENS[0][3])]), [rgbOf(PAGE_PENS[0][3])])
    })

    it('the cell colors are the ones SudokuPad ships, untouched by the pen', async () => {
      assert.deepEqual(await cellVars(), CELL_VARS)
    })

    it('the dialog has a Pen color entry in settings with a picker for each of the nine pen colors, set to the derived colors', async () => {
      await openEditor()
      assert.deepEqual(await pickerValues(), PAGE_PENS[0])
      await closeWith('Cancel')
    })

    it('Cancel saves nothing and changes no color', async () => {
      await openEditor()
      await pick('4', FOUR.hex)
      await closeWith('Cancel')
      assert.equal(await saved(), null)
      assert.deepEqual(await allStrokes(4)(), [rgbOf(PAGE_PENS[0][3])])
      await swatchesAre(PAGE_PENS[0])
    })

    it('Save recolors a stroke drawn before the edit, a new stroke and the button swatch, and leaves the cell colors alone', async () => {
      await openEditor()
      await pick('4', FOUR.hex)
      await pick('9', NINE.hex)
      await closeWith('Save')
      assert.deepEqual(await saved(), { ...toObject(PAGE_PENS[0]), 4: FOUR.hex, 9: NINE.hex })
      assert.deepEqual(await settle(allStrokes(4), [FOUR.rgb]), [FOUR.rgb])
      assert.equal(await swatch(4), FOUR.rgb)
      assert.equal(await swatch(9), NINE.rgb)
      const oldCount = (await strokes(4)).length
      await draw(4, 2)
      await draw(9, 3)
      // One drag can draw more than one stroke element, so the count is only checked to grow.
      assert.equal(await settle(async () => (await strokes(4)).length > oldCount, true), true)
      assert.deepEqual(await allStrokes(4)(), [FOUR.rgb])
      assert.deepEqual(await settle(allStrokes(9), [NINE.rgb]), [NINE.rgb])
      assert.deepEqual(await cellVars(), CELL_VARS)
    })

    it('a pen color left unedited keeps its color', async () => {
      assert.equal(await swatch(1), rgbOf(PAGE_PENS[0][0]))
      await draw(1, 4)
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
      await draw(4, 5)
      assert.deepEqual(await settle(allStrokes(4), [FOUR.rgb]), [FOUR.rgb])
      await setCellColor(['1', CELL_VARS[1]])
    })

    it('Restore defaults then Save returns to the derived colors of the current page, from each default page and a customized cell color', async () => {
      await setCellColor(['4', CUSTOM_CELL.css])
      for (const page of [0, 1, 2]) {
        const want = page === 0 ? PAGE_PENS[0].map((hex, i) => (i === 3 ? CUSTOM_CELL.pen : hex)) : PAGE_PENS[page]
        await setCellColorPage(page)
        await openEditor()
        await restoreDefaults()
        assert.deepEqual(await pickerValues(), want, `page ${page}`)
        await closeWith('Save')
        assert.equal(await saved(), null, `page ${page}`)
        await swatchesAre(want)
      }
      assert.deepEqual(await cellVars(), CELL_VARS.map((v, i) => (i === 4 ? CUSTOM_CELL.css : v)))
    })

    it('Restore defaults then Cancel changes nothing', async () => {
      await openEditor()
      await pick('4', FOUR.hex)
      await closeWith('Save')
      const savedSet = await saved()
      await openEditor()
      await restoreDefaults()
      await closeWith('Cancel')
      assert.deepEqual(await saved(), savedSet)
      assert.deepEqual(await allStrokes(4)(), [FOUR.rgb])
    })

    it('Save after Restore defaults and a hand edit keeps the edit', async () => {
      await openEditor()
      await restoreDefaults()
      await pick('9', NINE.hex)
      await closeWith('Save')
      assert.deepEqual(await saved(), { ...toObject(PAGE_PENS[2]), 9: NINE.hex })
      // Clear it again for the checks below.
      await openEditor()
      await restoreDefaults()
      await closeWith('Save')
      assert.equal(await saved(), null)
    })

    it('with nothing saved, a reload derives from the page and palette in force at load', async () => {
      await reload()
      await swatchesAre(PAGE_PENS[2])
    })

    it('cycling the color page mid-solve leaves the pen alone', async () => {
      await draw(4, 6)
      const before = await allStrokes(4)()
      await setCellColorPage(0)
      await swatchesAre(PAGE_PENS[2])
      assert.deepEqual(await allStrokes(4)(), before)
      await setCellColorPage(2)
    })

    it('a page with fewer than nine usable colors keeps SudokuPad\'s pen colors for the rest and says so in the dialog', async () => {
      await read(() => {
        const t = Framework.app.tools.colour
        const palette = { colors: { w: 'transparent', x: 'rgb(200, 0, 0)', y: 'rgb(0, 0, 200)', z: 'rgb(0, 150, 0)' }, pages: [['w', 'x', 'y', 'z']] }
        t.setPalette(palette)
      })
      await openEditor()
      await restoreDefaults()
      const values = await pickerValues()
      assert.deepEqual(values.slice(3), OWN_PEN_HEX.slice(3))
      assert.equal(values.slice(0, 3).filter((v, i) => OWN_PEN_HEX[i] !== v).length, 3)
      assert.match(await editor().innerText(), /pen colors 4, 5, 6, 7, 8, 9 keep SudokuPad's own/)
      // Picking a pen color by hand takes it off the list; the others stay on it.
      await pick('4', FOUR.hex)
      assert.match(await editor().innerText(), /pen colors 5, 6, 7, 8, 9 keep SudokuPad's own/)
      await closeWith('Cancel')
      // setPalette clamped and saved the current page; put the stored palette and page 2 back.
      await read(() => {
        const t = Framework.app.tools.colour
        t.setPalette(Framework.getData('ToolColor_palette'))
        t.setPage(2)
      })
    })

    it('a custom page of shorthand hex, named, rgba() and hsl() colors gives pen N the color at index N, a transparent entry keeping SudokuPad\'s own pen color', async () => {
      await read(() => {
        const t = Framework.app.tools.colour
        const colors = { t: 'transparent', a: '#f00', b: 'blue', c: 'rgba(0, 200, 0, 1)', u: 'rgba(0, 0, 0, 0)', d: 'hsl(60, 100%, 50%)', e: 'rgb(10 20 30)', f: '#0ff', g: 'magenta', h: 'orange', i: 'purple' }
        t.setPalette({ colors, pages: [Object.keys(colors)] })
      })
      await openEditor()
      await restoreDefaults()
      // Index 4 is the transparent `u`, so pen 4 keeps SudokuPad's own; index 6 is the dark
      // blue-grey rgb(10 20 30), the darkest grey, so pen 6 is black.
      assert.deepEqual(await pickerValues(), ['#ae0000', '#0000ae', '#008700', OWN_PEN_HEX[3], '#aeae00', '#000000', '#00aeae', '#ae00ae', '#ae6f00'])
      assert.match(await editor().innerText(), /pen color 4 keeps SudokuPad's own/)
      await closeWith('Cancel')
      await read(() => {
        const t = Framework.app.tools.colour
        t.setPalette(Framework.getData('ToolColor_palette'))
        t.setPage(2)
      })
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
      await openEditor()
      await restoreDefaults()
      await closeWith('Save')
      await p.click('#control-colour')
      // A cell button shows the page's color at its data-key: its data-value names the color key,
      // and that key's `--cell-color-<key>` variable is the color it shows.
      const cellButtons = () => read(() => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
        const key = document.querySelector(`.tool-colour button[data-key="${n}"]`).dataset.value
        return window.getComputedStyle(document.documentElement).getPropertyValue(`--cell-color-${key}`).trim()
      }))
      assert.deepEqual(await settle(cellButtons, cells.slice(1)), cells.slice(1))
      await swatchesAre(pens)
      await read(() => {
        const t = Framework.app.tools.colour
        t.setPalette(Framework.getData('ToolColor_palette'))
        t.setPage(2)
      })
    })

    it('Save with no edit saves nothing, so the pen keeps following the cell color page at load', async () => {
      await read((k) => Framework.removeData(k), DATA_KEY)
      await reload()
      await openEditor()
      await closeWith('Save')
      assert.equal(await saved(), null)
    })

    it('corrupt saved settings fall back to the derived colors with no thrown error', async () => {
      const errorsBefore = errors.length
      for (const bad of ['{not json', '"red"', '[1,2]', '{"4":"url(x)"}']) {
        await read(([k, raw]) => {
          window.localStorage.setItem(Framework.makeDataKey(k), raw)
        }, [DATA_KEY, bad])
        await reload()
        assert.equal(await settle(() => swatch(4), rgbOf(PAGE_PENS[2][3])), rgbOf(PAGE_PENS[2][3]), bad)
      }
      assert.deepEqual(errors.slice(errorsBefore), [])
    })

    describe('holding a pen color button', { concurrency: false }, () => {
      const HOLD_MS = 1000
      const pickers = () => p.locator('.tool-pen .pen-color-picker input')
      const pickerCount = () => pickers().count()
      const undoDepth = () => read(() => Framework.app.puzzle.undoStack.length)
      const button = (n) => p.locator(`.tool-pen button[data-value="${n}"]`)
      const centre = async (locator) => {
        const box = await locator.boundingBox()
        return [box.x + box.width / 2, box.y + box.height / 2]
      }
      // Presses `which` over pen button `n` and leaves it down; the caller releases it.
      const press = async (n, which) => {
        await selectPen()
        const [x, y] = await centre(button(n))
        await p.mouse.move(x, y)
        await p.mouse.down({ button: which })
      }
      const leaveEditMode = async () => {
        if (await pickerCount() === 0) return
        await press(4, 'left')
        assert.equal(await settle(pickerCount, 0, HOLD_MS + 5000), 0)
        await p.mouse.up()
      }

      before(async () => {
        await read((k) => Framework.removeData(k), DATA_KEY)
        await reload()
      })

      for (const which of ['left', 'right']) {
        it(`a ${which}-button hold shows a picker over each of the nine buttons, in the swatch colors, and adds no undo entry or stroke`, async () => {
          const depth = await undoDepth()
          const drawn = await strokeCount()
          await press(4, which)
          // A "nothing happened yet" check, so it is a sleep: well before the hold ends, no picker.
          await sleep(HOLD_MS / 3)
          assert.equal(await pickerCount(), 0)
          assert.equal(await settle(pickerCount, 9, HOLD_MS + 5000), 9)
          await p.mouse.up({ button: which })
          assert.deepEqual(await pickers().evaluateAll((es) => es.map((e) => e.dataset.pen)), ['1', '2', '3', '4', '5', '6', '7', '8', '9'])
          assert.deepEqual(await pickerValues2(), PAGE_PENS[2])
          assert.equal(await undoDepth(), depth)
          assert.equal(await strokeCount(), drawn)
          await leaveEditMode()
        })
      }

      const pickerValues2 = () => pickers().evaluateAll((es) => es.map((e) => e.value))

      it('a click, or a hold released early, selects the pen color and opens nothing', async () => {
        await press(5, 'left')
        await p.mouse.up()
        assert.equal(await settle(() => read(() => document.querySelector('.tool-pen button.current').dataset.value), '5'), '5')
        await press(6, 'left')
        await sleep(HOLD_MS / 2)
        await p.mouse.up()
        // A "nothing happened" check: the full delay passes after the release with no picker.
        await sleep(HOLD_MS)
        assert.equal(await pickerCount(), 0)
        assert.equal(await read(() => document.querySelector('.tool-pen button.current').dataset.value), '6')
      })

      it('the browser\'s context menu is suppressed over the pen color buttons and the pickers, and nowhere else', async () => {
        await selectPen()
        // dispatchEvent returns false when a listener called preventDefault.
        const notPrevented = (selector) => read((sel) => document.querySelector(sel).dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })), selector)
        assert.equal(await notPrevented('.tool-pen button[data-value="4"]'), false)
        assert.equal(await notPrevented('#control-undo'), true)
        assert.equal(await notPrevented('.tool-pen button[data-control="delete"]'), true)
        await press(4, 'left')
        assert.equal(await settle(pickerCount, 9, HOLD_MS + 5000), 9)
        await p.mouse.up()
        assert.equal(await notPrevented('.tool-pen .pen-color-picker input'), false)
        await leaveEditMode()
      })

      it('a real right-click hold ends without the context menu event reaching the page unprevented', async () => {
        await read(() => {
          window.__menus = []
          window.addEventListener('contextmenu', (e) => window.__menus.push(e.defaultPrevented))
        })
        await press(4, 'right')
        assert.equal(await settle(pickerCount, 9, HOLD_MS + 5000), 9)
        await p.mouse.up({ button: 'right' })
        const menus = await read(() => window.__menus)
        assert.equal(menus.includes(false), false)
        await leaveEditMode()
      })

      it('changing a picker recolors the swatch and strokes live, saves the whole set, and the dialog shows it', async () => {
        await draw(4, 7)
        await press(4, 'left')
        assert.equal(await settle(pickerCount, 9, HOLD_MS + 5000), 9)
        await p.mouse.up()
        const depth = await undoDepth()
        await p.locator('.tool-pen .pen-color-picker input[data-pen="4"]').fill(FOUR.hex)
        assert.equal(await settle(() => swatch(4), FOUR.rgb), FOUR.rgb)
        assert.deepEqual(await settle(allStrokes(4), [FOUR.rgb]), [FOUR.rgb])
        assert.deepEqual(await saved(), { ...toObject(PAGE_PENS[2]), 4: FOUR.hex })
        assert.equal(await undoDepth(), depth)
        await leaveEditMode()
        await openEditor()
        assert.deepEqual(await pickerValues(), Object.values({ ...toObject(PAGE_PENS[2]), 4: FOUR.hex }))
        await closeWith('Cancel')
      })

      it('the edit is kept after a reload, and the set no longer follows the color page', async () => {
        await reload()
        assert.deepEqual(await saved(), { ...toObject(PAGE_PENS[2]), 4: FOUR.hex })
        await swatchesAre(Object.values({ ...toObject(PAGE_PENS[2]), 4: FOUR.hex }))
        await setCellColorPage(0)
        assert.equal(await swatch(4), FOUR.rgb)
        await setCellColorPage(2)
      })

      it('a second hold leaves edit mode, and so does leaving the pen tool', async () => {
        await press(4, 'left')
        assert.equal(await settle(pickerCount, 9, HOLD_MS + 5000), 9)
        await p.mouse.up()
        await press(4, 'left')
        assert.equal(await settle(pickerCount, 0, HOLD_MS + 5000), 0)
        await p.mouse.up()
        assert.equal(await p.locator('.tool-pen.pen-color-editing').count(), 0)
        await press(4, 'left')
        assert.equal(await settle(pickerCount, 9, HOLD_MS + 5000), 9)
        await p.mouse.up()
        await p.click('#control-colour')
        await selectPen()
        assert.equal(await pickerCount(), 0)
        assert.equal(await p.locator('.tool-pen.pen-color-editing').count(), 0)
      })

      it('edit mode, screenshot', async () => {
        await press(4, 'left')
        assert.equal(await settle(pickerCount, 9, HOLD_MS + 5000), 9)
        await p.mouse.up()
        if (process.env.PEN_COLOR_SHOT) await p.locator('.tool-pen').first().screenshot({ path: process.env.PEN_COLOR_SHOT })
        await leaveEditMode()
        // Put back the derived colors for the checks below.
        await read((k) => Framework.removeData(k), DATA_KEY)
        await reload()
      })
    })

    it('the settings entry sits in the Experimental group under its plain name, and its dialog shows the version from the script header as small text', async () => {
      const group = await openSettings(p)
      const entry = group.locator('button').filter({ hasText: 'Pen color' })
      assert.equal((await entry.textContent()).trim(), 'Pen color')
      await entry.click()
      await editor().waitFor({ state: 'visible' })
      assert.equal((await p.locator('.dialog b').first().textContent()).trim(), 'Pen color')
      assert.equal((await p.locator('.dialog small').textContent()).trim(), `v${headerVersion(script)}`)
      await closeWith('Cancel')
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })
}

describe('the color tool never becomes ready', { concurrency: false }, () => {
  it('after the wait, the pen keeps SudokuPad\'s own colors and the dialog still opens', async () => {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    try {
      const p = await context.newPage()
      const errors = []
      p.on('pageerror', (e) => errors.push(String(e)))
      await p.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
      await p.goto(url, { waitUntil: 'load', timeout: 60000 })
      await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
      await p.getByRole('button', { name: START }).first().click()
      await p.locator('#control-undo').waitFor({ state: 'visible' })
      await p.evaluate(() => { Framework.app.tools.colour.palette = undefined })
      await p.addScriptTag({ content: script })
      // Nothing may happen for the script's whole wait, so this one is a sleep: the check is
      // that no override appeared in the two seconds after its wait ran out.
      await sleep(COLOR_TOOL_WAIT_MS + 2000)
      assert.equal(await p.locator(STYLE).count(), 0)
      await openSettings(p)
      await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Pen color' }).first().click()
      await p.locator('#pen-color-editor').waitFor({ state: 'visible' })
      const values = await p.locator('#pen-color-editor input[type=color]').evaluateAll((es) => es.map((e) => e.value))
      assert.deepEqual(values, OWN_PEN_HEX)
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })

  it('a save made while the script waits for the color tool outranks the derived colors', async () => {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    try {
      const p = await context.newPage()
      await p.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
      await p.goto(url, { waitUntil: 'load', timeout: 60000 })
      await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
      await p.getByRole('button', { name: START }).first().click()
      await p.locator('#control-undo').waitFor({ state: 'visible' })
      await p.evaluate(() => { window.__palette = Framework.app.tools.colour.palette; Framework.app.tools.colour.palette = undefined })
      await p.addScriptTag({ content: script })
      await openSettings(p)
      await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Pen color' }).first().click()
      await p.locator('#pen-color-editor').waitFor({ state: 'visible' })
      await p.locator('#pen-color-editor input[data-pen="4"]').fill(FOUR.hex)
      await p.locator('.dialog button').filter({ hasText: /^\s*Save\s*$/ }).first().click()
      await p.locator('#pen-color-editor').waitFor({ state: 'detached' })
      await p.evaluate(() => { Framework.app.tools.colour.palette = window.__palette })
      // The script polls every 100ms, so by 1.5s it has seen the tool and decided; the check is
      // that nothing then replaced the saved colors.
      await sleep(1500)
      const pens = await p.evaluate(() => [1, 4].map((n) => window.getComputedStyle(document.documentElement).getPropertyValue(`--puzzle-pencolor-${n}`).trim()))
      assert.deepEqual(pens, [OWN_PEN_HEX[0], FOUR.hex])
    } finally {
      await context.close()
    }
  })
})
