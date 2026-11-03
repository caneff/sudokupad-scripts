// Live check of no-tab-letters.user.js on sudokupad.app, in headless Chromium.
// Run with `npm run test:live`. It needs the network and a Playwright Chromium, so
// it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so
// Tampermonkey's real injection time and crackingthecryptic.com stay untested.
// Each injection time runs the same checks:
//   document-idle: at DOMContentLoaded, as `@run-at document-idle` approximates it
//   before-start:  after the page loads, before Start Puzzle
//   after-start:   after Start Puzzle, when the controls already exist
// The letter tool is switched on through its setting after the script is in, as a player does.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../no-tab-letters.user.js', import.meta.url), 'utf8')

const START = /Start Puzzle|Continue|Resume/i
const DIGITS = '1234567890'
const LETTERS = 'ABCDEFGHIO'
const MODE_KEY = 'ToolLetter_letterMode'
const TOGGLE_BUTTON = 'button[data-control="toggleletter"]'
const WARNING = /no-tab-letters/

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// Loads the puzzle, running `beforeStart` / `afterStart` around Start Puzzle.
async function openPuzzle (p, { beforeStart = async () => {}, afterStart = async () => {} } = {}) {
  await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
  const start = p.getByRole('button', { name: START }).first()
  await start.waitFor({ state: 'visible' })
  await beforeStart()
  await start.click()
  await start.waitFor({ state: 'hidden' })
  await p.locator('#control-undo').waitFor({ state: 'visible' })
  await afterStart()
}

async function newPage (context) {
  const p = await context.newPage()
  await p.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
  return p
}

for (const mode of ['document-idle', 'before-start', 'after-start']) {
  describe(`injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors

    // The tests below are one ordered sequence on one page: each starts from the letter mode the one
    // before left (digits, with the saved mode null, then false once a toggle has saved it).
    // The number pad's keys as typed on the page, and the letter mode SudokuPad saved.
    const pad = () => p.evaluate(() => [...document.querySelectorAll('.controls-buttons .digit')].map((d) => d.textContent).join(''))
    const saved = () => p.evaluate((key) => Framework.getData(key), MODE_KEY)
    // Presses `key` and returns whether the page left the keydown's default alone.
    const press = async (key) => {
      await p.evaluate(() => {
        window.__keydowns = []
        window.addEventListener('keydown', (e) => window.__keydowns.push(e.defaultPrevented), { once: true })
      })
      await p.keyboard.press(key)
      return p.evaluate(() => window.__keydowns)
    }

    before(async () => {
      context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
      errors = []
      p = await newPage(context)
      p.on('pageerror', (e) => errors.push(String(e)))
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
      await openPuzzle(p, {
        beforeStart: async () => { if (mode === 'before-start') await p.addScriptTag({ content: script }) },
        afterStart: async () => { if (mode === 'after-start') await p.addScriptTag({ content: script }) }
      })
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
      assert.deepEqual(await press('Tab'), [true], 'Tab was prevented, as with SudokuPad\'s own toggle')
      assert.equal(await focused(), focus, 'focus did not move')
      assert.equal(await pad(), DIGITS, 'after')
      assert.equal(await saved(), null, 'saved after')
    })

    it('"/" and the letter button still toggle letter mode and save it', async () => {
      await press('/')
      assert.equal(await pad(), LETTERS, 'after "/"')
      assert.equal(await saved(), true, 'saved after "/"')
      await p.click(TOGGLE_BUTTON)
      assert.equal(await pad(), DIGITS, 'after the button')
      assert.equal(await saved(), false, 'saved after the button')
      await p.click(TOGGLE_BUTTON)
      assert.equal(await pad(), LETTERS, 'after the button again')
      await press('/')
      assert.equal(await pad(), DIGITS, 'after "/" again')
    })

    it('Tab in play leaves letter mode on while it is on', async () => {
      await press('/')
      assert.equal(await pad(), LETTERS, 'on')
      await press('Tab')
      assert.equal(await pad(), LETTERS, 'still on after Tab')
      assert.equal(await saved(), true, 'saved stays true')
      await press('/')
      assert.equal(await pad(), DIGITS, 'off')
    })

    it('Tab still moves focus in a dialog, and is not prevented there', async () => {
      await p.click('#control-settings')
      await p.locator('.dialog').waitFor({ state: 'visible' })
      const before = await focused()
      assert.deepEqual(await press('Tab'), [false], 'Tab was not prevented')
      assert.notEqual(await focused(), before, 'focus moved')
      assert.equal(await pad(), DIGITS, 'pad')
      assert.equal(await saved(), false, 'saved')
    })

    it('the page raised no error', () => {
      assert.deepEqual(errors, [])
    })
  })
}

describe('the Tab binding is not found', () => {
  it('warns in the console and changes nothing', async () => {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    try {
      const p = await newPage(context)
      const warnings = []
      p.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()) })
      const warned = p.waitForEvent('console', { predicate: (m) => WARNING.test(m.text()), timeout: 30000 })
      await p.goto(url, { waitUntil: 'load', timeout: 60000 })
      await openPuzzle(p, {
        beforeStart: async () => {
          // A SudokuPad whose letter tool binds no Tab.
          await p.evaluate(() => { ToolLetter.tool.keyHandlers = ToolLetter.tool.keyHandlers.filter((e) => e.key !== 'Tab') })
        },
        afterStart: async () => { await p.addScriptTag({ content: script }) }
      })
      await warned
      const handlers = await p.evaluate(() => ToolLetter.tool.keyHandlers.map((e) => (typeof e.key === 'string' ? e.key : 'fn')))
      assert.deepEqual(handlers, ['/', 'fn'])
      assert.equal(warnings.filter((w) => WARNING.test(w)).length, 1, JSON.stringify(warnings))
    } finally {
      await context.close()
    }
  })
})
