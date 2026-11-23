import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TEXT_ANYWHERE_BUTTON, UI_TWEAKS_DIALOG } from '../scripts.mjs'
import { middleOf } from '../input.mjs'
import { closeDialogWith, openScriptDialog } from '../settings.mjs'
import { settle } from '../settle.mjs'
import { buttonIds } from '../text-anywhere/text-anywhere-fixtures.mjs'
import { openWith, useBrowser } from '../session.mjs'

const DIALOG = UI_TWEAKS_DIALOG
const SCRIPTS = ['pen-tool-extras.user.js', 'text-anywhere.user.js', 'ui-tweaks.user.js']
// Under 1 the board is drawn smaller than its natural size, which is when Large Puzzle UI has room to zoom it.
const SMALL_WINDOW = { width: 800, height: 520 }
const NOTCH = 100

const browser = useBrowser()

// A button in the tool bar that selects no tool, as another script's replay button is.
const NON_TOOL = 'control-replaybutton'
const BAR_TEXT = '#sudokupad-scripts-notices [data-script="ui-tweaks"]'
// The tool names in the order the buttons are drawn, without the button that is no tool.
const toolsOnScreen = async (p) => (await buttonIds(p)).filter((id) => id !== NON_TOOL).map((id) => id.replace('control-', ''))
const tool = (p) => p.evaluate(() => Framework.app.tool)
const zoomLevel = (p) => p.evaluate(() => Framework.features.largepuzzle.zoomLevel)
// The feature's own `reset` also sets its base scale to 1, which leaves no room to zoom, so only the zoom and pan go back.
const unzoom = (p) => p.evaluate(() => { const f = Framework.features.largepuzzle; f.zoomLevel = 1; f.panPos = [0, 0]; f.rawUpdateTransform() })
const moveOver = async (p, selector) => p.mouse.move(...middleOf(await p.locator(selector).boundingBox()))
const turn = async (p, selector, notches) => {
  await moveOver(p, selector)
  await p.mouse.wheel(0, notches * NOTCH)
}
async function chooseWheel (p, on) {
  await openScriptDialog(p, 'UI Tweaks', DIALOG)
  await p.locator(`${DIALOG} input[data-option="wheelMode"]`).setChecked(on)
  await closeDialogWith(p, 'Save', DIALOG)
}

describe('the mouse wheel changes mode', { concurrency: false }, () => {
  let context, p, errors, order

  before(async () => {
    ;({ context, p, errors } = await openWith(browser(), SCRIPTS))
    await p.setViewportSize(SMALL_WINDOW)
    await p.evaluate(() => { Framework.setSetting('toolpen', true); Framework.setSetting('largepuzzle', true) })
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await p.locator(TEXT_ANYWHERE_BUTTON).waitFor({ state: 'visible' })
    await p.evaluate((name) => Framework.addToolButton({ name: name.replace('control-', ''), title: 'replay', content: '<div class="icon">R</div>', onClick () {} }), NON_TOOL)
    await p.locator(`#${NON_TOOL}`).waitFor({ state: 'visible' })
    order = await settle(() => toolsOnScreen(p), ['normal', 'corner', 'centre', 'colour', 'pen', 'textanywhere'])
    await p.click('#control-normal')
  })
  after(async () => { await context.close() })

  it('the buttons on screen are SudokuPad\'s four, the pen and Text Anywhere', () => {
    assert.equal(order.length, 6)
    assert.ok(order.includes('pen') && order.includes('textanywhere'), order.join())
  })

  it('with the option off, the wheel over the board zooms and changes no mode', async () => {
    await turn(p, '#board', -1)
    assert.equal(await settle(() => zoomLevel(p).then((z) => z > 1), true), true, 'zoomed')
    assert.equal(await tool(p), 'normal')
    await unzoom(p)
  })

  it('with the option on, a wheel notch down over the board selects the next button in screen order, and up the previous one', async () => {
    await chooseWheel(p, true)
    await turn(p, '#board', 1)
    assert.equal(await settle(() => tool(p), order[1]), order[1])
    await turn(p, '#board', 1)
    assert.equal(await settle(() => tool(p), order[2]), order[2])
    await turn(p, '#board', -1)
    assert.equal(await settle(() => tool(p), order[1]), order[1])
  })

  it('a plain wheel over the board never zooms, even with Large Puzzle UI on', async () => {
    const before = await tool(p)
    await turn(p, '#board', 1)
    assert.notEqual(await settle(() => tool(p), order[(order.indexOf(before) + 1) % order.length]), before, 'the wheel did step')
    assert.equal(await zoomLevel(p), 1)
  })

  it('the wheel over the column of tool buttons steps too', async () => {
    const was = await tool(p)
    const next = order[(order.indexOf(was) + 1) % order.length]
    await turn(p, `#control-${order[0]}`, 1)
    assert.equal(await settle(() => tool(p), next), next)
  })

  it('past the last button the wheel wraps round to the first, and up from the first to the last', async () => {
    for (let i = order.indexOf(await tool(p)); i < order.length; i++) {
      await turn(p, '#board', 1)
      const expected = order[(i + 1) % order.length]
      assert.equal(await settle(() => tool(p), expected), expected)
    }
    assert.equal(await tool(p), order[0])
    await turn(p, '#board', -1)
    assert.equal(await settle(() => tool(p), order.at(-1)), order.at(-1))
  })

  it('a button of the bar that selects no tool is stepped past, never stopped on', async () => {
    assert.equal(await p.locator(`#${NON_TOOL}`).isVisible(), true)
    const stops = []
    for (let i = 0; i < order.length + 1; i++) {
      const was = await tool(p)
      await turn(p, '#board', 1)
      stops.push(await settle(() => tool(p), order[(order.indexOf(was) + 1) % order.length]))
    }
    assert.deepEqual(stops.slice(0, order.length).sort(), [...order].sort(), 'one lap visits every tool once')
  })

  it('a wheel over something that scrolls in the board keeps the wheel and steps no mode', async () => {
    const before = await tool(p)
    await p.evaluate(() => {
      const box = document.createElement('div')
      box.id = 'scrolling-test-box'
      box.style.cssText = 'position:fixed;left:300px;top:300px;width:100px;height:100px;overflow:auto;z-index:99999;background:#fff'
      box.innerHTML = '<div style="height:400px">text</div>'
      document.querySelector('#board').append(box)
    })
    await turn(p, '#scrolling-test-box', 1)
    // Nothing happens in 300 ms: a wait for a negative.
    await p.waitForTimeout(300)
    assert.equal(await tool(p), before)
    await p.evaluate(() => document.querySelector('#scrolling-test-box').remove())
  })

  it('a wheel over another button, such as Undo, steps no mode', async () => {
    const before = await tool(p)
    await turn(p, '#control-undo', 1)
    // Nothing happens in 300 ms: a wait for a negative.
    await p.waitForTimeout(300)
    assert.equal(await tool(p), before)
  })

  it('Shift+wheel over the board zooms and changes no mode', async () => {
    const before = await tool(p)
    await moveOver(p, '#board')
    await p.keyboard.down('Shift')
    await p.mouse.wheel(0, -NOTCH)
    await p.keyboard.up('Shift')
    assert.equal(await settle(() => zoomLevel(p).then((z) => z > 1), true), true, 'zoomed')
    assert.equal(await tool(p), before)
  })

  it('switching the option off again, the wheel zooms and changes no mode', async () => {
    await unzoom(p)
    await chooseWheel(p, false)
    const before = await tool(p)
    await turn(p, '#board', -1)
    assert.equal(await settle(() => zoomLevel(p).then((z) => z > 1), true), true, 'zoomed')
    assert.equal(await tool(p), before)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

describe('a SudokuPad with no current tool name', { concurrency: false }, () => {
  let context, p, errors

  before(async () => {
    ;({ context, p, errors } = await openWith(browser(), SCRIPTS, { expectedSkips: [/ui-tweaks.*mouse wheel/] }))
    await chooseWheel(p, true)
  })
  after(async () => { await context.close() })

  it('the wheel feature turns itself off with a notice, instead of sticking on a button', async () => {
    await p.evaluate(() => { Framework.app.tool = undefined })
    await turn(p, '#board', 1)
    await p.locator(BAR_TEXT).waitFor({ state: 'visible' })
    assert.match(await p.locator(BAR_TEXT).textContent(), /mouse wheel/)
    assert.equal(errors.some((line) => /mouse wheel/.test(line)), false, 'only the planted skip line was logged, and it is expected')
  })
})
