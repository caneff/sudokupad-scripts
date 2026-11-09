// Live check that a click on the left of Pen Tool Extras' line mode, page and settings buttons never reaches SudokuPad's board,
// on sudokupad.app in headless Chromium. The buttons sit just right of the grid, and SudokuPad's own edge hit test still finds an
// edge of the last column for a press up to one cell beyond it, so a click that leaks draws an X there (#521). A touch screen stays untested.
// Every click is a real mouse click.
/* global Framework, ToolPen */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from '../page.mjs'
import { clickLeftEdge, openPenTool, PAGE_BUTTON, padValues } from '../pen.mjs'
import { settle } from '../settle.mjs'

const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')
const LINE_MODE_BUTTON = '.pen-tool-extras-mode'
const SETTINGS_BUTTON = '.pen-tool-extras-settings'
const EDITOR = '#pen-tool-extras-editor'
let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('a click on the left of a Pen Tool Extras panel button', { concurrency: false }, () => {
  let context, p

  const lineMode = () => p.evaluate(() => ToolPen.tool.lineMode)
  // The page and settings buttons sit more than a cell beyond the grid at this size, where a leaked press marks nothing, so what is asserted is that no `mousedown` reaches `window`.
  const assertStopped = ({ added, leaked }) => {
    assert.deepEqual(added, [])
    assert.equal(leaked, 0, 'mousedowns that reached window')
  }

  before(async () => {
    ;({ context, p } = await openPage(browser, { contextOptions: { viewport: { width: 1200, height: 1000 } } }))
    await startPuzzle(p, { beforeStart: () => p.evaluate(() => Framework.setSetting('toolpen', true)) })
    await p.addScriptTag({ content: script })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
    await openPenTool(p)
    await p.locator('.tool-pen button[data-key="1"]').click()
  })
  after(async () => { await context.close() })

  it('on the line mode button changes the mode and reaches no board', async () => {
    const before = await lineMode()
    const result = await clickLeftEdge(p, LINE_MODE_BUTTON)
    assert.equal(await settle(async () => (await lineMode()) !== before, true), true, 'the mode changed')
    assertStopped(result)
  })

  it('on the page button turns the page and reaches no board', async () => {
    await p.locator(PAGE_BUTTON).waitFor({ state: 'visible' })
    const before = await padValues(p)
    const result = await clickLeftEdge(p, PAGE_BUTTON)
    assert.equal(await settle(async () => (await padValues(p)) !== before, true), true, 'the page turned')
    assertStopped(result)
  })

  it('on the settings button opens the dialog and reaches no board', async () => {
    const result = await clickLeftEdge(p, SETTINGS_BUTTON)
    await p.locator(EDITOR).waitFor({ state: 'visible' })
    // SudokuPad ignores a key until the zero-delay timer of showDialog has fired; a timer set after it fires after it.
    await p.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)))
    await p.keyboard.press('Escape')
    await p.locator(EDITOR).waitFor({ state: 'detached' })
    assertStopped(result)
  })
})
