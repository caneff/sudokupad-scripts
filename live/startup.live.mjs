// Live check of every script's startup on sudokupad.app, in headless Chromium, at each injection time.
// The injection time matters only while a script starts up, so this file runs each script at all three:
//   document-idle: at DOMContentLoaded, as `@run-at document-idle` approximates it
//   before-start:  after the page loads, before Start Puzzle
//   after-start:   after Start Puzzle, when the controls already exist
// For each script and time: the page raises no error, the script's control appears, and one representative
// action works. At document-idle, SudokuPad's `Framework` and `getApp` also exist when the script runs.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { labelOn } from './color-by-digit/color-by-digit-fixtures.mjs'
import { captureConsoleErrors, MODES, openPage, START, startPuzzle } from './page.mjs'
import { openSettings } from './settings.mjs'
import { gridPoint, keydownDefaults, openPenTool, penEntries } from './pen.mjs'
import { clickUntil, settle, SETTLE_MS } from './settle.mjs'

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const CONCURRENCY = 5

const BLACK = 'rgb(0, 0, 0)'
const DIGITS = '1234567890'
const LETTER_MODE_KEY = 'ToolLetter_letterMode'
const LETTER_TOGGLE = 'button[data-control="toggleletter"]'
const PEN_PAGE_BUTTON = '.pen-tool-extras-page'
const DRAW_BUTTON = '#control-draw'

const settingsEntry = async (p, text) => {
  const group = await openSettings(p)
  await group.locator('button, [role=button]').filter({ hasText: text }).first().waitFor({ state: 'visible' })
}

// Prepended to a before-start injection: records whether the Start Puzzle button shows as the script runs.
const RECORD_START_SHOWN = `window.__startShownAtInjection = [...document.querySelectorAll('button')].some((b) => ${START}.test(b.textContent) && b.getClientRects().length > 0);\n`

// Per script: its file, what shows it has started (`ready`), its control (`control`) and one representative action (`act`).
// `ready` runs after Start Puzzle and the injection, `act` and then `control` after `ready`.
const SCRIPTS = [
  {
    name: 'Color by Digit',
    file: 'color-by-digit.user.js',
    ready: (p) => p.locator('#control-colorbydigit').waitFor({ state: 'attached' }),
    control: (p) => p.locator('#control-colorbydigit').waitFor({ state: 'visible' }),
    // A fresh install starts in Cell, which colors the board's givens, and a press steps it to Digit, which takes them off.
    act: async (p) => {
      const colored = () => p.evaluate(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).some((c) => (c.colours || []).length > 0))
      const label = () => labelOn(p)
      assert.equal(await settle(colored, true), true, 'Cell colored a cell')
      assert.equal(await label(), 'Cell')
      await p.click('#control-colorbydigit')
      assert.equal(await settle(label, 'Digit'), 'Digit')
      assert.equal(await settle(colored, false), false, 'Digit took the colors off')
    }
  },
  {
    name: 'Dark Page',
    file: 'dark-page.user.js',
    ready: (p) => p.locator('#dark-page-style').waitFor({ state: 'attached' }),
    control: (p) => settingsEntry(p, /^\s*Dark Page\s*$/),
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
    // Tab is swallowed: it leaves the number pad on digits and saves no letter mode. The keydown default is prevented
    // either way, since SudokuPad's own Tab toggle prevents it too, so that alone would pass without the script.
    act: async (p) => {
      assert.deepEqual(await keydownDefaults(p, 'Tab'), [true])
      const pad = () => p.evaluate(() => [...document.querySelectorAll('.controls-buttons .digit')].map((d) => d.textContent).join(''))
      assert.equal(await settle(pad, DIGITS), DIGITS, 'the number pad stayed on digits')
      assert.equal(await p.evaluate((key) => Framework.getData(key), LETTER_MODE_KEY), null, 'no letter mode was saved')
    }
  },
  {
    name: 'Auto Rules Resizer',
    file: 'auto-rules-resizer.user.js',
    // The recorded puzzle has no rules: SudokuPad is given some, and its own layout calls the script's fit.
    ready: async (p) => {
      await p.locator('#auto-rules-resizer-style').waitFor({ state: 'attached' })
      await p.evaluate(() => {
        Framework.app.showMetaInfoUI({ title: 'Rules', author: 'Tester', rules: 'Normal sudoku rules apply. Digits along an arrow sum to the digit in its circle.' })
        Framework.app.resize()
      })
    },
    // The font bar shows while the pointer is over the pane.
    control: async (p) => {
      const box = await p.locator('.puzzle-rules').boundingBox()
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await p.locator('#auto-rules-resizer-font').waitFor({ state: 'visible' })
    },
    // The rules get a larger font than SudokuPad's own 17.6 px.
    act: async (p) => {
      const font = () => p.evaluate(() => parseFloat(window.getComputedStyle(document.querySelector('.puzzle-rules')).fontSize))
      assert.equal(await settle(async () => (await font()) > 17.6, true), true)
    }
  },
  {
    name: 'Pen Tool Extras',
    file: 'pen-tool-extras.user.js',
    ready: async (p) => {
      await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
      await p.evaluate(() => Framework.setSetting('toolpen', true))
      await p.locator('#control-pen').waitFor({ state: 'visible' })
      assert.equal(await openPenTool(p), true, 'the pen tool opened')
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
      const edge = async () => (await penEntries(p)).map((v) => v.split(':')[1][0])
      await p.mouse.click(x, y)
      assert.deepEqual(await settle(edge, ['4']), ['4'], 'the first click made SudokuPad\'s X')
      await p.mouse.click(x, y)
      assert.deepEqual(await settle(edge, ['m']), ['m'], 'the second click made the arrow')
    }
  },
  {
    name: 'Text Anywhere',
    file: 'draw-tool.user.js',
    ready: (p) => p.locator(DRAW_BUTTON).waitFor({ state: 'attached' }),
    control: (p) => p.locator(DRAW_BUTTON).waitFor({ state: 'visible' }),
    // With Text Anywhere picked, a left click on r3c3 and 15 typed leave one note.
    act: async (p) => {
      const tool = () => p.evaluate(() => Framework.app.tool)
      assert.equal(await clickUntil(() => p.click(DRAW_BUTTON), tool, 'draw', SETTLE_MS), 'draw')
      await p.mouse.click(...await gridPoint(p, [2.5, 2.5]))
      await p.keyboard.type('15')
      await p.keyboard.press('Escape')
      assert.equal(await settle(() => p.locator('#draw-tool-layer .draw-tool-text').count(), 1), 1)
    }
  }
]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('startup', { concurrency: CONCURRENCY }, () => {
  for (const script of SCRIPTS) {
    for (const mode of MODES) {
      describe(`${script.name}, injected ${mode}`, { concurrency: false }, () => {
        let context, p, errors

        before(async () => {
          const injection = { mode, code: (mode === 'before-start' ? RECORD_START_SHOWN : '') + source(script.file) }
          ;({ context, p, errors } = await openPage(browser, { injection, seed: captureConsoleErrors }))
          await startPuzzle(p, { injection })
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

        if (mode === 'before-start') {
          it('the Start Puzzle button still shows when the script runs', async () => {
            assert.equal(await p.evaluate(() => window.__startShownAtInjection), true)
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
