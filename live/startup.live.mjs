// Live check of every script's startup on sudokupad.app, in headless Chromium, at each injection time.
// Run with `npm run test:live`. The first run of a day needs the network (live/cache.mjs records SudokuPad, later runs replay it) and a Playwright Chromium, so
// it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so Tampermonkey's real
// injection time and crackingthecryptic.com stay untested. The injection time matters only while a script
// starts up, so every other live file injects after Start Puzzle, and this one runs each script at all three:
//   document-idle: at DOMContentLoaded, as `@run-at document-idle` approximates it
//   before-start:  after the page loads, before Start Puzzle
//   after-start:   after Start Puzzle, when the controls already exist
// For each script and time: the page raises no error, the script's control appears, and one representative
// action works. At document-idle, SudokuPad's `Framework` and `getApp` also exist when the script runs.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { routeSudokuPad } from './cache.mjs'
import { openSettings } from './settings.mjs'
import { settle, SETTLE_MS } from './settle.mjs'

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const MODES = ['document-idle', 'before-start', 'after-start']
const START = /Start Puzzle|Continue|Resume/i
// How many scripts-at-a-time pages run at once: each is its own browser context.
const CONCURRENCY = 5
// How long one click gets to show its effect before it is made again: SudokuPad binds a new button's click handler a moment late.
const CLICK_TAKES_MS = 300

const BLACK = 'rgb(0, 0, 0)'
// The color Digit Color gives an entered 4.
const DIGIT_COLOR_FOUR = 'rgb(27, 122, 47)'
const LETTER_TOGGLE = 'button[data-control="toggleletter"]'
const PEN_PAGE_BUTTON = '.pen-tool-extras-page'

// A settings entry the way a player finds it: a button in the Experimental group named `text`.
const settingsEntry = async (p, text) => {
  const group = await openSettings(p)
  await group.locator('button, [role=button]').filter({ hasText: text }).first().waitFor({ state: 'visible' })
}

// Clicks until `read` shows `expected`, as long as SETTLE_MS allows; returns the last reading.
async function clickUntil (p, selector, read, expected) {
  const deadline = Date.now() + SETTLE_MS
  let value
  do {
    await p.click(selector)
    value = await settle(read, expected, CLICK_TAKES_MS)
  } while (JSON.stringify(value) !== JSON.stringify(expected) && Date.now() < deadline)
  return value
}

const penValues = (p) => p.evaluate(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => `${c.row},${c.col}:${v}`)).sort())
const select = (p, r, c) => p.evaluate(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [r, c])

// Per script: its file, what shows it has started (`ready`), its control (`control`) and one representative action (`act`).
// `ready` runs after Start Puzzle and the injection, `act` and then `control` after `ready`.
const SCRIPTS = [
  {
    name: 'Color by Digit',
    file: 'color-by-digit.user.js',
    ready: (p) => p.locator('#control-colorbydigit').waitFor({ state: 'attached' }),
    control: (p) => p.locator('#control-colorbydigit').waitFor({ state: 'visible' }),
    // The button colors the board's givens.
    act: async (p) => {
      const colored = () => p.evaluate(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).some((c) => (c.colours || []).length > 0))
      assert.equal(await clickUntil(p, '#control-colorbydigit', colored, true), true, 'the button colored a cell')
    }
  },
  {
    name: 'Digit Color',
    file: 'digit-color.user.js',
    ready: (p) => p.locator('#digit-color-style').waitFor({ state: 'attached' }),
    control: (p) => settingsEntry(p, 'Digit color'),
    // An entered digit takes its digit's default color.
    act: async (p) => {
      await select(p, 0, 2)
      await p.keyboard.press('4')
      const fills = () => p.evaluate(() => [...new Set([...document.querySelectorAll('#cell-values text.cell-value')]
        .filter((e) => e.textContent.trim() === '4').map((e) => window.getComputedStyle(e).fill))])
      assert.deepEqual(await settle(fills, [DIGIT_COLOR_FOUR]), [DIGIT_COLOR_FOUR])
    }
  },
  {
    name: 'Dark Page',
    file: 'dark-page.user.js',
    ready: (p) => p.locator('#dark-page-style').waitFor({ state: 'attached' }),
    control: (p) => settingsEntry(p, /^\s*Dark page\s*$/),
    // The page paints black.
    act: async (p) => {
      const background = () => p.evaluate(() => window.getComputedStyle(document.body).backgroundColor)
      assert.equal(await settle(background, BLACK), BLACK)
    }
  },
  {
    name: 'No Tab Letters',
    file: 'no-tab-letters.user.js',
    // The script adds no control: the letter tool's own button, which it leaves in place, shows once the tool is on.
    ready: async (p) => {
      await p.evaluate(() => Framework.setSetting('toolletter', true))
      await p.locator(LETTER_TOGGLE).waitFor({ state: 'attached' })
    },
    control: (p) => p.locator(LETTER_TOGGLE).waitFor({ state: 'visible' }),
    // Tab is swallowed: the page's keydown default is prevented, as with SudokuPad's own letter toggle.
    act: async (p) => {
      await p.evaluate(() => {
        window.__keydowns = []
        window.addEventListener('keydown', (e) => window.__keydowns.push(e.defaultPrevented), { once: true })
      })
      await p.keyboard.press('Tab')
      assert.deepEqual(await p.evaluate(() => window.__keydowns), [true])
    }
  },
  {
    name: 'Pen Tool Extras',
    file: 'pen-tool-extras.user.js',
    ready: async (p) => {
      await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
      await p.evaluate(() => Framework.setSetting('toolpen', true))
      await p.locator('#control-pen').waitFor({ state: 'visible' })
      // The pen button toggles the tool, and SudokuPad binds its handler a moment after the button appears.
      const shown = () => p.locator('.tool-pen button[data-key="1"]').isVisible()
      await clickUntil(p, '#control-pen', shown, true)
    },
    control: (p) => p.locator(PEN_PAGE_BUTTON).waitFor({ state: 'visible' }),
    // Two clicks on one cell edge: SudokuPad's own X, then this script's arrow 'm'.
    act: async (p) => {
      const [x0, y0, size] = await p.evaluate(() => {
        const box = Framework.app.puzzle.cells.find((c) => c.row === 0 && c.col === 0).elem.getBoundingClientRect()
        return [box.x, box.y, box.width]
      })
      // 2 px inside the top edge of cell (2, 2).
      const [x, y] = [x0 + 2.5 * size, y0 + 2 * size + 2]
      const edge = async () => (await penValues(p)).map((v) => v.split(':')[1][0])
      await p.mouse.click(x, y)
      assert.deepEqual(await settle(edge, ['4']), ['4'], 'the first click made SudokuPad\'s X')
      await p.mouse.click(x, y)
      assert.deepEqual(await settle(edge, ['m']), ['m'], 'the second click made the arrow')
    }
  }
]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// Loads the puzzle with `code` injected at `mode`, and leaves the page on the board.
async function load (p, mode, code) {
  if (mode === 'document-idle') {
    await p.addInitScript((src) => {
      document.addEventListener('DOMContentLoaded', () => {
        window.__fwAtIdle = typeof Framework + '/' + (typeof Framework !== 'undefined' && typeof Framework.getApp)
        const s = document.createElement('script')
        s.textContent = src
        document.documentElement.appendChild(s)
      })
    }, code)
  }
  await p.goto(url, { waitUntil: 'load', timeout: 60000 })
  await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
  const start = p.getByRole('button', { name: START }).first()
  await start.waitFor({ state: 'visible' })
  if (mode === 'before-start') await p.addScriptTag({ content: code })
  await start.click()
  await start.waitFor({ state: 'hidden' })
  await p.locator('#control-undo').waitFor({ state: 'visible' })
  if (mode === 'after-start') await p.addScriptTag({ content: code })
}

describe('startup', { concurrency: CONCURRENCY }, () => {
  for (const script of SCRIPTS) {
    for (const mode of MODES) {
      describe(`${script.name}, injected ${mode}`, { concurrency: false }, () => {
        let context, p, errors

        before(async () => {
          context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
          errors = []
          p = await context.newPage()
          p.on('pageerror', (e) => errors.push(String(e)))
          await routeSudokuPad(p)
          await load(p, mode, source(script.file))
          await script.ready(p)
        })
        after(async () => { await context.close() })

        // Only this mode runs the script before the page's own scripts have finished;
        // the other two wait for Framework before injecting, so the check would be vacuous.
        if (mode === 'document-idle') {
          it('Framework and getApp exist when the script runs', async () => {
            assert.equal(await p.evaluate(() => window.__fwAtIdle), 'function/function')
          })
        }

        it('one representative action works', async () => {
          await script.act(p)
        })

        // After the action: a settings entry is found in an open dialog, which would take the action's keys.
        it('the script\'s control appears', async () => {
          await script.control(p)
        })

        it('the page raised no error', () => {
          assert.deepEqual(errors, [])
        })
      })
    }
  }
})
