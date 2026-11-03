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
import { chromium } from 'playwright'

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../pen-color.user.js', import.meta.url), 'utf8')

const DATA_KEY = 'PenColor_colors'
// SudokuPad's own pen colors (tool-pen.css), read off the page with no script installed:
// the dialog's #rrggbb, and the same colors as the page computes them.
const DEFAULTS = {
  1: '#1f8020', 2: '#e87cf1', 3: '#e49632', 4: '#f53a37', 5: '#d2be32', 6: '#3d99f5', 7: '#d6d6d6', 8: '#7c7c7c', 9: '#000000'
}
const DEFAULT_RGB = {
  1: 'rgb(31, 128, 32)', 4: 'rgb(245, 58, 55)', 9: 'rgb(0, 0, 0)'
}
// The colors the checks choose.
const FOUR = { hex: '#ff00ff', rgb: 'rgb(255, 0, 255)' }
const NINE = { hex: '#00cccc', rgb: 'rgb(0, 204, 204)' }

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
      await p.click('#control-settings')
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

    it('a fresh install has nothing saved, and strokes and swatches show SudokuPad\'s own colors', async () => {
      assert.equal(await saved(), null)
      await draw(4, 1)
      assert.deepEqual(await settle(allStrokes(4), [DEFAULT_RGB[4]]), [DEFAULT_RGB[4]])
      assert.equal(await swatch(4), DEFAULT_RGB[4])
      assert.equal(await swatch(9), DEFAULT_RGB[9])
    })

    it('the dialog has a Pen color entry in settings with a picker for each of the nine pen colors, set to the defaults', async () => {
      await openEditor()
      const values = await editor().locator('input[type=color]').evaluateAll((es) => Object.fromEntries(es.map((e) => [e.dataset.pen, e.value])))
      assert.deepEqual(values, DEFAULTS)
      await closeWith('Cancel')
    })

    it('Cancel saves nothing and changes no color', async () => {
      await openEditor()
      await pick('4', FOUR.hex)
      await closeWith('Cancel')
      assert.equal(await saved(), null)
      assert.deepEqual(await allStrokes(4)(), [DEFAULT_RGB[4]])
    })

    it('Save recolors a stroke drawn before the edit, a new stroke and the button swatch', async () => {
      await openEditor()
      await pick('4', FOUR.hex)
      await pick('9', NINE.hex)
      await closeWith('Save')
      assert.deepEqual(await saved(), { ...DEFAULTS, 4: FOUR.hex, 9: NINE.hex })
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
    })

    it('a pen color left unedited keeps its color', async () => {
      assert.equal(await swatch(1), DEFAULT_RGB[1])
      await draw(1, 4)
      assert.deepEqual(await settle(allStrokes(1), [DEFAULT_RGB[1]]), [DEFAULT_RGB[1]])
    })

    it('undo removes strokes and redo brings them back, each in its pen color\'s current color', async () => {
      const before = await strokeCount()
      await p.click('#control-undo')
      assert.equal(await settle(strokeCount, before - 1), before - 1)
      await p.click('#control-redo')
      assert.equal(await settle(strokeCount, before), before)
      assert.deepEqual(await settle(allStrokes(1), [DEFAULT_RGB[1]]), [DEFAULT_RGB[1]])
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

    it('the colors survive a reload', async () => {
      await reload()
      assert.deepEqual(await saved(), { ...DEFAULTS, 4: FOUR.hex, 9: NINE.hex })
      assert.equal(await swatch(4), FOUR.rgb)
      assert.equal(await swatch(9), NINE.rgb)
      await draw(4, 5)
      assert.deepEqual(await settle(allStrokes(4), [FOUR.rgb]), [FOUR.rgb])
    })

    it('Restore defaults brings back every original color', async () => {
      await openEditor()
      await dialogButton('Restore defaults').click()
      await closeWith('Save')
      assert.deepEqual(await saved(), DEFAULTS)
      assert.deepEqual(await settle(allStrokes(4), [DEFAULT_RGB[4]]), [DEFAULT_RGB[4]])
      assert.equal(await swatch(4), DEFAULT_RGB[4])
      assert.equal(await swatch(9), DEFAULT_RGB[9])
    })

    it('corrupt saved settings fall back to the default colors with no thrown error', async () => {
      const errorsBefore = errors.length
      for (const bad of ['{not json', '"red"', '[1,2]', '{"4":"url(x)"}']) {
        await read(([k, raw]) => {
          const key = Object.keys(window.localStorage).find((n) => n.endsWith(k))
          if (!key) throw new Error('no stored key for ' + k)
          window.localStorage.setItem(key, raw)
        }, [DATA_KEY, bad])
        await reload()
        assert.equal(await swatch(4), DEFAULT_RGB[4], bad)
      }
      assert.deepEqual(errors.slice(errorsBefore), [])
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })
}
