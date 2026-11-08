// Live check of no-tab-letters.user.js on sudokupad.app, in headless Chromium.
// The letter tool is switched on through its setting after the script is in, as a player does.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from '../page.mjs'
import { keydownDefaults } from '../pen.mjs'
import { LETTER_MODE_KEY as MODE_KEY } from '../scripts.mjs'

const script = readFileSync(new URL('../../no-tab-letters.user.js', import.meta.url), 'utf8')

const DIGITS = '1234567890'
const LETTERS = 'ABCDEFGHIO'
const TOGGLE_BUTTON = 'button[data-control="toggleletter"]'
const WARNING = /no-tab-letters/

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  // The tests below are one ordered sequence on one page: each starts from the letter mode the one
  // before left (digits, with the saved mode null, then false once a toggle has saved it).
  const pad = () => p.evaluate(() => [...document.querySelectorAll('.controls-buttons .digit')].map((d) => d.textContent).join(''))
  const saved = () => p.evaluate((key) => Framework.getData(key), MODE_KEY)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    // Enable Letter Tool, switched on after the page and the script are in.
    await p.evaluate(() => Framework.setSetting('toolletter', true))
    await p.locator(TOGGLE_BUTTON).waitFor({ state: 'attached' })
  })
  after(async () => { await context.close() })

  const focused = () => p.evaluate(() => { const a = document.activeElement; return `${a.tagName}#${a.id}.${a.className}|${a.textContent.slice(0, 30)}` })

  it('Tab in play leaves the number pad on digits, saves nothing, and leaves focus where it is', async () => {
    assert.equal(await pad(), DIGITS, 'before')
    assert.equal(await saved(), null, 'saved before')
    const focus = await focused()
    assert.deepEqual(await keydownDefaults(p, 'Tab'), [true], 'Tab was prevented, as with SudokuPad\'s own toggle')
    assert.equal(await focused(), focus, 'focus did not move')
    assert.equal(await pad(), DIGITS, 'after')
    assert.equal(await saved(), null, 'saved after')
  })

  it('"/" and the letter button still toggle letter mode and save it', async () => {
    await keydownDefaults(p, '/')
    assert.equal(await pad(), LETTERS, 'after "/"')
    assert.equal(await saved(), true, 'saved after "/"')
    await p.click(TOGGLE_BUTTON)
    assert.equal(await pad(), DIGITS, 'after the button')
    assert.equal(await saved(), false, 'saved after the button')
    await p.click(TOGGLE_BUTTON)
    assert.equal(await pad(), LETTERS, 'after the button again')
    await keydownDefaults(p, '/')
    assert.equal(await pad(), DIGITS, 'after "/" again')
  })

  it('Tab in play leaves letter mode on while it is on', async () => {
    await keydownDefaults(p, '/')
    assert.equal(await pad(), LETTERS, 'on')
    await keydownDefaults(p, 'Tab')
    assert.equal(await pad(), LETTERS, 'still on after Tab')
    assert.equal(await saved(), true, 'saved stays true')
    await keydownDefaults(p, '/')
    assert.equal(await pad(), DIGITS, 'off')
  })

  it('Tab still moves focus in a dialog, and is not prevented there', async () => {
    await p.click('#control-settings')
    await p.locator('.dialog').waitFor({ state: 'visible' })
    const before = await focused()
    assert.deepEqual(await keydownDefaults(p, 'Tab'), [false], 'Tab was not prevented')
    assert.notEqual(await focused(), before, 'focus moved')
    assert.equal(await pad(), DIGITS, 'pad')
    assert.equal(await saved(), false, 'saved')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})

describe('the Tab binding is not found', () => {
  it('warns in the console and changes nothing', async () => {
    const warnings = []
    let warned
    const { context, p } = await openPage(browser, {
      seed: (page) => {
        page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()) })
        warned = page.waitForEvent('console', { predicate: (m) => WARNING.test(m.text()), timeout: 30000 })
      }
    })
    try {
      await startPuzzle(p, {
        beforeStart: async () => {
          // A SudokuPad whose letter tool binds no Tab.
          await p.evaluate(() => { ToolLetter.tool.keyHandlers = ToolLetter.tool.keyHandlers.filter((e) => e.key !== 'Tab') })
        }
      })
      await p.addScriptTag({ content: script })
      await warned
      const handlers = await p.evaluate(() => ToolLetter.tool.keyHandlers.map((e) => (typeof e.key === 'string' ? e.key : 'fn')))
      assert.deepEqual(handlers, ['/', 'fn'])
      assert.equal(warnings.filter((w) => WARNING.test(w)).length, 1, JSON.stringify(warnings))
    } finally {
      await context.close()
    }
  })
})
