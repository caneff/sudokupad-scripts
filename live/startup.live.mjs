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
import { MODES, openPage, START, startPuzzle } from './page.mjs'
import { SCRIPTS } from './scripts.mjs'

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const CONCURRENCY = 5

// Prepended to a before-start injection: records whether the Start Puzzle button shows as the script runs.
const RECORD_START_SHOWN = `window.__startShownAtInjection = [...document.querySelectorAll('button')].some((b) => ${START}.test(b.textContent) && b.getClientRects().length > 0);\n`

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
          ;({ context, p, errors } = await openPage(browser, { injection }))
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
