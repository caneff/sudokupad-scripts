// Live check of pen-tool-extras.user.js's White outline box on sudokupad.app in headless Chromium: off by default, on from the dialog's
// Save, painted white round a pen line (read off a screenshot's pixels, over a black backing so white shows), faded by the opacity
// slider, kept off the drag highlight, kept over a reload, and off for settings saved before the box existed.
// Run with `npm run test:live`. It needs the network and a Playwright Chromium, so it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so Tampermonkey's real injection time and
// crackingthecryptic.com stay untested, and so does a touch screen. Each injection time runs the same checks:
//   document-idle: at DOMContentLoaded, as `@run-at document-idle` approximates it
//   before-start:  after the page loads, before Start Puzzle
//   after-start:   after Start Puzzle, when the controls already exist
/* global Framework, ToolPen */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openSettings } from './settings.mjs'

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')

const OUTLINE_KEY = 'PenColor_outline'
const OPACITY_KEY = 'PenColor_opacity'
const THICKNESS_KEY = 'PenColor_thickness'
const POLL_MS = 50
const SETTLE_MS = 10000
const START = /Start Puzzle|Continue|Resume/i
// The outline is 2 units wide beyond a line 5 wide, so 3.5 units from a line's middle is outline and 8 is not.
const OUTLINE_UNITS = 3.5
const CLEAR_UNITS = 8

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
    let context, p, reader, errors

    const read = (fn, arg) => p.evaluate(fn, arg)
    const saved = (key) => read((k) => Framework.getData(k), key)
    const dialogButton = (text) => p.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()
    const editor = () => p.locator('#pen-tool-extras-editor')
    const outlineBox = () => editor().locator('input[data-outline]')
    const layerFilter = () => read(() => window.getComputedStyle(document.querySelector('#cell-pen')).filter)
    const FILTER_ON = 'url("#pen-tool-extras-outline-filter")'

    const selectPen = async () => {
      const shown = () => p.locator('.tool-pen button[data-key="1"]').isVisible()
      const deadline = Date.now() + SETTLE_MS
      while (!(await shown()) && Date.now() < deadline) {
        await p.click('#control-pen')
        await settle(shown, true, 500)
      }
    }

    // One horizontal line in pen color 1 through the middle of grid row `row`, from column 3 to column 5 (a drag between cell
    // centers in the center-only mode, so it is straight).
    const draw = async (row = 8) => {
      await selectPen()
      await read(() => { ToolPen.tool.lineMode = 'centeronly' })
      await p.locator('.tool-pen button[data-key="1"]').click()
      const [x, y, cell] = await read((row) => {
        const box = Framework.app.puzzle.cells.find((c) => c.row === row && c.col === 3).elem.getBoundingClientRect()
        return [box.x + box.width / 2, box.y + box.height / 2, box.width]
      }, row)
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.move(x + 2 * cell, y, { steps: 8 })
      await p.mouse.up()
      await p.mouse.move(5, 5)
      await p.locator('.cell-pen.pencolor-1').first().waitFor({ state: 'attached' })
    }

    // A black backing under the pen layer, so a white outline shows against it; removed with `unback`.
    const back = () => read(() => {
      const layer = document.querySelector('#cell-pen')
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.id = 'live-backing'
      rect.setAttribute('x', '-100')
      rect.setAttribute('y', '-100')
      rect.setAttribute('width', '1000')
      rect.setAttribute('height', '1000')
      rect.setAttribute('fill', '#000')
      layer.before(rect)
    })
    const unback = () => read(() => document.getElementById('live-backing')?.remove())

    // The brightness (0 to 255, red channel) of the pixel `units` above the middle of the drawn line, read off a screenshot loaded
    // into a second page's canvas. The line is the one `draw` made in the middle of its row.
    const brightnessAbove = async (units, row = 8) => {
      const geometry = await read((row) => {
        const box = Framework.app.puzzle.cells.find((c) => c.row === row && c.col === 4).elem.getBoundingClientRect()
        return { x: box.x + box.width / 2, y: box.y + box.height / 2, perUnit: box.width / 64 }
      }, row)
      const y = geometry.y - units * geometry.perUnit
      const png = await p.screenshot({ clip: { x: geometry.x, y: Math.floor(y), width: 1, height: 2 } })
      return reader.evaluate(async (b64) => {
        const img = new window.Image()
        img.src = 'data:image/png;base64,' + b64
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        return ctx.getImageData(0, 0, 1, 1).data[0]
      }, png.toString('base64'))
    }

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
    const clearSaved = () => read((keys) => keys.forEach((k) => Framework.removeData(k)), [OUTLINE_KEY, OPACITY_KEY, THICKNESS_KEY])

    before(async () => {
      context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
      errors = []
      p = await context.newPage()
      reader = await context.newPage()
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
      await clearSaved()
      await draw()
    })
    after(async () => {
      await clearSaved()
      await context.close()
    })

    it('is off by default: no filter on the pen layer, no filter in the page, and the dialog box unticked', async () => {
      assert.equal(await layerFilter(), 'none')
      assert.equal(await read(() => document.getElementById('pen-tool-extras-outline-holder')), null)
      await openEditor()
      assert.equal(await outlineBox().isChecked(), false)
      await dialogButton('Cancel').click()
      await editor().waitFor({ state: 'detached' })
    })

    it('Cancel leaves it off and Save turns it on for the line already drawn: the pixel beside the line goes white and a pixel further out stays black', async () => {
      await back()
      assert.equal(await brightnessAbove(OUTLINE_UNITS), 0, 'black beside the line with no outline')
      await openEditor()
      await outlineBox().check()
      await dialogButton('Cancel').click()
      await editor().waitFor({ state: 'detached' })
      assert.equal(await layerFilter(), 'none')
      await openEditor()
      await outlineBox().check()
      await dialogButton('Save').click()
      await editor().waitFor({ state: 'detached' })
      assert.equal(await settle(layerFilter, FILTER_ON), FILTER_ON)
      assert.equal(await saved(OUTLINE_KEY), true)
      assert.equal(await brightnessAbove(OUTLINE_UNITS) > 100, true, 'white beside the line')
      assert.equal(await brightnessAbove(CLEAR_UNITS), 0, 'black beyond the outline')
      await unback()
    })

    it('the outline fades with the opacity slider: the pixel beside a line is brighter at 100 than at 40', async () => {
      await back()
      await read(([k]) => Framework.setData(k, 100), [OPACITY_KEY])
      await reload()
      await back()
      const solid = await brightnessAbove(OUTLINE_UNITS)
      await read(([k]) => Framework.setData(k, 40), [OPACITY_KEY])
      await reload()
      await back()
      const faded = await brightnessAbove(OUTLINE_UNITS)
      await unback()
      await read(([k]) => Framework.removeData(k), [OPACITY_KEY])
      assert.equal(solid > faded && faded > 0, true, `solid ${solid}, faded ${faded}`)
    })

    it('stays on over a reload, and the drag highlight is not in the outlined layer', async () => {
      await reload()
      assert.equal(await settle(layerFilter, FILTER_ON), FILTER_ON)
      await selectPen()
      await p.locator('.tool-pen button[data-key="1"]').click()
      const [x, y] = await read(() => {
        const box = Framework.app.puzzle.cells.find((c) => c.row === 6 && c.col === 4).elem.getBoundingClientRect()
        return [box.x + box.width / 2, box.y + box.height / 2]
      })
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.move(x + 110, y + 10, { steps: 6 })
      const hint = await read(() => {
        const el = document.querySelector('.penhint')
        const filters = []
        for (let e = el; e && e.nodeType === 1; e = e.parentElement) filters.push(window.getComputedStyle(e).filter)
        return { found: el !== null, inPenLayer: el !== null && el.closest('#cell-pen') !== null, filters: [...new Set(filters)] }
      })
      await p.mouse.up()
      assert.deepEqual(hint, { found: true, inPenLayer: false, filters: ['none'] })
    })

    it('Restore defaults then Save turns it off and clears the saved value; settings saved without the field load with it off', async () => {
      await openEditor()
      await dialogButton('Restore defaults').click()
      assert.equal(await outlineBox().isChecked(), false)
      await dialogButton('Save').click()
      await editor().waitFor({ state: 'detached' })
      assert.equal(await settle(layerFilter, 'none'), 'none')
      assert.equal(await saved(OUTLINE_KEY), null)
      assert.equal(await read(() => document.getElementById('pen-tool-extras-outline-holder')), null)
      // Settings saved by an earlier version hold no outline field.
      await read(([k]) => Framework.setData(k, 9), [THICKNESS_KEY])
      await reload()
      assert.equal(await layerFilter(), 'none')
      await clearSaved()
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })
}
