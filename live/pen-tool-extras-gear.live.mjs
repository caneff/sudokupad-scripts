// Live check of pen-tool-extras.user.js's settings gear on SudokuPad's pen tool button (#control-pen), on sudokupad.app in headless Chromium.
// Run with `npm run test:live`. The first run of a day needs the network (live/cache.mjs records SudokuPad, later runs replay it) and a Playwright Chromium.
//
// The script is injected into the page after Start Puzzle, not installed through Tampermonkey, so Tampermonkey's real injection time,
// crackingthecryptic.com and a touch screen stay untested. Every click is real mouse input.
/* global Framework */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { routeSudokuPad } from './cache.mjs'

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')
const START = /Start Puzzle|Continue|Resume/i
const BUTTON = '#control-pen'
const GEAR = '#control-pen [aria-label="Pen tool extras settings"]'
const EDITOR = '#pen-tool-extras-editor'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('the settings gear on the pen tool button', { concurrency: false }, () => {
  let context, p

  // Loads the puzzle with the pen tool on, starts it and injects the script.
  const load = async (p) => {
    await p.goto(url, { waitUntil: 'load', timeout: 60000 })
    await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
    await p.evaluate(() => Framework.setSetting('toolpen', true))
    const start = p.getByRole('button', { name: START }).first()
    await start.waitFor({ state: 'visible' })
    await start.click()
    await start.waitFor({ state: 'hidden' })
    await p.locator('#control-undo').waitFor({ state: 'visible' })
    await p.addScriptTag({ content: script })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
  }
  // The id of the selected tool button.
  const selectedId = () => p.evaluate(() => (document.querySelector('.controls-tool .selected, .controls-tool [aria-pressed=true], .controls-tool .active') || {}).id || null)
  const closeDialog = async () => {
    await p.keyboard.press('Escape')
    await p.locator(EDITOR).waitFor({ state: 'detached' })
  }

  before(async () => {
    context = await browser.newContext({ viewport: { width: 1200, height: 1000 } })
    p = await context.newPage()
    await routeSudokuPad(p)
    await load(p)
  })
  after(async () => { await context.close() })

  it('the gear sits inside the button box, in its upper right corner, clear of the pen icon', async () => {
    const gear = p.locator(GEAR)
    await gear.waitFor({ state: 'visible' })
    // SudokuPad scales its controls, so the sizes are read in the button's own layout pixels; the insets are from the button's padding edge, which an absolute box is placed against.
    const m = await p.evaluate(([button, gearSel]) => {
      const b = document.querySelector(button)
      const g = document.querySelector(gearSel)
      const scale = b.getBoundingClientRect().width / b.offsetWidth
      const r = (el) => el.getBoundingClientRect()
      return { w: g.offsetWidth, h: g.offsetHeight, right: (r(b).right - r(g).right) / scale - b.clientLeft, top: (r(g).top - r(b).top) / scale - b.clientTop }
    }, [BUTTON, GEAR])
    assert.equal(m.w, 13)
    assert.equal(m.h, 13)
    assert.equal(Math.round(m.right), 2, 'right inset')
    assert.equal(Math.round(m.top), 2, 'top inset')
  })

  it('a click on the gear with another tool selected opens the dialog and leaves that tool selected', async () => {
    const other = await p.evaluate(() => { const b = [...document.querySelectorAll('.controls-tool button, .controls-tool [role=button]')].find((e) => e.id && e.id !== 'control-pen'); return b ? b.id : null })
    assert.notEqual(other, null, 'another tool button exists')
    await p.click(`#${other}`)
    const before = await selectedId()
    await p.locator(GEAR).click()
    await p.locator(EDITOR).waitFor({ state: 'visible' })
    assert.equal(await selectedId(), before)
    assert.notEqual(before, 'control-pen')
    await closeDialog()
  })

  it('a click on the button outside the gear selects the pen tool and opens no dialog', async () => {
    const box = await p.locator(BUTTON).boundingBox()
    await p.mouse.click(box.x + 6, box.y + box.height - 6)
    assert.equal(await selectedId(), 'control-pen')
    assert.equal(await p.locator(EDITOR).count(), 0)
  })

  it('the gear is present after a reload', async () => {
    await load(p)
    await p.locator(GEAR).waitFor({ state: 'visible' })
  })

  // SudokuPad cancels a touchstart on a tool button, which stops the browser sending the click; the gear keeps its touchstart from SudokuPad.
  it('a tap on the gear opens the dialog', async () => {
    const touch = await browser.newContext({ viewport: { width: 1200, height: 1000 }, hasTouch: true })
    try {
      const tp = await touch.newPage()
      await routeSudokuPad(tp)
      await load(tp)
      const box = await tp.locator(GEAR).boundingBox()
      await tp.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
      await tp.locator(EDITOR).waitFor({ state: 'visible' })
    } finally {
      await touch.close()
    }
  })
})
