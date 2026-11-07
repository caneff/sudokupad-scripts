// Live check of the place of Draw Tool's button among the tool buttons, on sudokupad.app in headless Chromium.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { DIGIT_BUTTON, DRAW_BUTTON, pickDraw, script, tool } from './draw-tool-fixtures.mjs'
import { injectAtIdle, openPage, startPuzzle } from './page.mjs'
import { settle } from './settle.mjs'

// SudokuPad's tool keys, App.toolHotkeys.
const TOOL_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm']

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

const buttonIds = (p) => p.evaluate(() => [...document.querySelectorAll('.controls-tool > button')].map((b) => b.id))
const lastButton = async (p) => (await buttonIds(p)).at(-1)
const withPen = (p) => p.evaluate(() => Framework.setSetting('toolpen', true))
const inject = async (p) => {
  await p.addScriptTag({ content: script })
  await p.locator(DRAW_BUTTON).waitFor({ state: 'visible' })
}

describe('Draw Tool: its button is the last tool button', { concurrency: false }, () => {
  let context, p, errors

  before(async () => { ;({ context, p, errors } = await openPage(browser)) })
  after(async () => { await context.close() })

  // Injected at DOMContentLoaded, Draw's button is added before SudokuPad restores the saved pen tool.
  it('with the pen tool on at startup, Draw comes after the pen button', async () => {
    await startPuzzle(p)
    await withPen(p)
    // SudokuPad saves its settings a moment after a change; a reload before that loses it.
    await settle(() => p.evaluate(() => /"toolpen":true/.test(window.localStorage.getItem('svencodes_settings'))), true)
    await injectAtIdle(p, script)
    await p.reload({ waitUntil: 'load' })
    await startPuzzle(p)
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await p.locator(DRAW_BUTTON).waitFor({ state: 'visible' })
    assert.equal(await settle(() => lastButton(p), 'control-draw'), 'control-draw')
    assert.deepEqual(await buttonIds(p), ['control-normal', 'control-corner', 'control-centre', 'control-colour', 'control-pen', 'control-draw'])
  })

  it('the pen tool turned off and on again leaves Draw last', async () => {
    await p.evaluate(() => Framework.setSetting('toolpen', false))
    await p.locator('#control-pen').waitFor({ state: 'detached' })
    await withPen(p)
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    assert.equal(await settle(() => lastButton(p), 'control-draw'), 'control-draw')
    assert.equal((await buttonIds(p)).indexOf('control-pen') < (await buttonIds(p)).indexOf('control-draw'), true)
  })

  it('a tool added later by Framework.addTool, and a button added later by Framework.addToolButton, come before Draw', async () => {
    await p.evaluate(() => Framework.addTool({ button: { name: 'late', title: 'Late', content: 'Late' }, tool: { name: 'late', isTool: true } }))
    await p.evaluate(() => Framework.addToolButton({ name: 'later', title: 'Later', content: '&#9654;&#9654;' }))
    assert.equal(await settle(() => lastButton(p), 'control-draw'), 'control-draw')
    const ids = await buttonIds(p)
    assert.equal(ids.indexOf('control-late') < ids.indexOf('control-draw'), true, ids.join())
    assert.equal(ids.indexOf('control-later') < ids.indexOf('control-draw'), true, ids.join())
  })

  it('Draw is still the current tool when its moved button is clicked', async () => {
    assert.equal(await pickDraw(p), 'draw')
    await p.click(DIGIT_BUTTON)
    assert.equal(await tool(p), 'normal')
  })

  it('no page error', () => { assert.deepEqual(errors, []) })
})

describe('Draw Tool: the pen tool on at startup and the tool keys', { concurrency: false }, () => {
  let context, p

  before(async () => {
    ;({ context, p } = await openPage(browser))
    await startPuzzle(p)
    await withPen(p)
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await inject(p)
  })
  after(async () => { await context.close() })

  // Without the script the five tools take Z X C V B, and N and M switch to nothing.
  it('Z X C V B select the same tools as without the script, B the pen tool', async () => {
    await p.click(DIGIT_BUTTON)
    const reached = []
    for (const key of TOOL_KEYS) {
      await p.keyboard.press(key)
      reached.push(await settle(() => tool(p), reached.at(-1) ?? 'normal') && await tool(p))
    }
    assert.deepEqual(reached, ['normal', 'corner', 'centre', 'colour', 'pen', 'pen', 'pen'])
  })
})
