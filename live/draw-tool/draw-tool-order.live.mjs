// Live check of the place of Text Anywhere's button among the tool buttons, on sudokupad.app in headless Chromium.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { buttonIds, finishNote, DIGIT_BUTTON, DRAW_BUTTON, SLIDERS, pickDraw, script, TOOL_KEYS, tool, texts } from './draw-tool-fixtures.mjs'
import { injectAtIdle, openPage, startPuzzle } from '../page.mjs'
import { gridPoint } from '../pen.mjs'
import { settle } from '../settle.mjs'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

const lastButton = async (p) => (await buttonIds(p)).at(-1)
const penOn = (p) => p.evaluate(() => Framework.setSetting('toolpen', true))
const PEN_BUTTON = '#control-pen'

// Leaves the pen tool saved on, then reloads with the script injected at DOMContentLoaded: Draw's button and tool are
// added before SudokuPad restores the pen tool, so the pen's button comes after Draw's in the page.
async function startWithSavedPen (p) {
  await startPuzzle(p)
  await penOn(p)
  // SudokuPad saves its settings a moment after a change; a reload before that loses it.
  await settle(() => p.evaluate(() => /"toolpen":true/.test(window.localStorage.getItem('svencodes_settings'))), true)
  await injectAtIdle(p, script)
  await p.reload({ waitUntil: 'load' })
  await startPuzzle(p)
  await p.locator(PEN_BUTTON).waitFor({ state: 'visible' })
  await p.locator(DRAW_BUTTON).waitFor({ state: 'visible' })
}

describe('Text Anywhere: its button is the last tool button', { concurrency: false }, () => {
  let context, p, errors

  before(async () => { ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport: { width: 1280, height: 720 } } })) })
  after(async () => { await context.close() })

  it('with the pen tool on at startup, Draw comes after the pen button', async () => {
    await startWithSavedPen(p)
    assert.equal(await settle(() => lastButton(p), 'control-draw'), 'control-draw')
    assert.deepEqual(await buttonIds(p), ['control-normal', 'control-corner', 'control-centre', 'control-colour', 'control-pen', 'control-draw'])
  })

  it('the pen tool turned off and on again leaves Draw last', async () => {
    await p.evaluate(() => Framework.setSetting('toolpen', false))
    await p.locator(PEN_BUTTON).waitFor({ state: 'detached' })
    await penOn(p)
    await p.locator(PEN_BUTTON).waitFor({ state: 'visible' })
    assert.equal(await settle(() => lastButton(p), 'control-draw'), 'control-draw')
    assert.deepEqual(await buttonIds(p), ['control-normal', 'control-corner', 'control-centre', 'control-colour', 'control-pen', 'control-draw'])
  })

  it('a tool added later by Framework.addTool, and a button added later by Framework.addToolButton, are drawn before Draw', async () => {
    await p.evaluate(() => Framework.addTool({ button: { name: 'late', title: 'Late', content: 'Late' }, tool: { name: 'late', isTool: true } }))
    await p.evaluate(() => Framework.addToolButton({ name: 'later', title: 'Later', content: '&#9654;&#9654;' }))
    assert.equal(await settle(() => lastButton(p), 'control-draw'), 'control-draw')
    const ids = await buttonIds(p)
    assert.equal(ids.indexOf('control-late') < ids.indexOf('control-draw'), true, ids.join())
    assert.equal(ids.indexOf('control-later') < ids.indexOf('control-draw'), true, ids.join())
  })

  it('the Text Anywhere button, last, still makes it the current tool, with its panel, and a click still makes a note', async () => {
    assert.equal(await pickDraw(p), 'draw')
    await p.locator(SLIDERS).waitFor({ state: 'visible' })
    await p.mouse.click(...await gridPoint(p, [2.5, 2.5]))
    await p.keyboard.type('15')
    await finishNote(p)
    assert.deepEqual(await settle(() => texts(p), ['15']), ['15'])
    await p.click(DIGIT_BUTTON)
    assert.equal(await tool(p), 'normal')
  })

  it('no page error', () => { assert.deepEqual(errors, []) })
})

describe('Text Anywhere: the pen tool on at startup and the tool keys', { concurrency: false }, () => {
  let context, p

  before(async () => {
    ;({ context, p } = await openPage(browser))
    await startWithSavedPen(p)
  })
  after(async () => { await context.close() })

  // Draw's tool comes before the pen's in the app. Without the script the five
  // tools take Z X C V B, and N and M switch to nothing.
  it('Z X C V B select the same tools as without the script, B the pen tool', async () => {
    await p.click(DIGIT_BUTTON)
    const expected = ['normal', 'corner', 'centre', 'colour', 'pen', 'pen', 'pen']
    const reached = []
    for (const [i, key] of TOOL_KEYS.entries()) {
      await p.keyboard.press(key)
      reached.push(await settle(() => tool(p), expected[i]))
    }
    assert.deepEqual(reached, expected)
  })
})
