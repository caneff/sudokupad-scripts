// Live check of digit-color.user.js on sudokupad.app, in headless Chromium.
// Run with `npm run test:live`. It needs the network and a Playwright Chromium, so
// it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so
// Tampermonkey's real injection time and crackingthecryptic.com stay untested.
// Each injection time runs the same checks:
//   document-idle: at DOMContentLoaded, as `@run-at document-idle` approximates it
//   before-start:  after the page loads, before Start Puzzle
//   after-start:   after Start Puzzle, when the controls already exist
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../digit-color.user.js', import.meta.url), 'utf8')

const DATA_KEY = 'DigitColor_colors'
// SudokuPad's own colors, read off the page with no script installed.
const GIVEN_FILL = 'rgb(0, 0, 0)'
const DEFAULT_FILL = 'rgb(29, 106, 229)'
// The stroke SudokuPad gives every mark, a white halo, read with no script installed.
const MARK_STROKE = 'rgba(255, 255, 255, 0.7)'
// SudokuPad's red for a mark in the conflict state, which the script reuses as the outline.
const CONFLICT_RED = 'rgb(179, 58, 58)'
// The default colors (issue #7), as the dialog's #rrggbb. The map is the independent source
// the saved value is compared with; RGB is the same colors as the page computes them.
const DEFAULTS = {
  0: '#4b5563', 1: '#b0125b', 2: '#b04a00', 3: '#7a6200', 4: '#1b7a2f', 5: '#00736f', 6: '#0059c9', 7: '#3d2bb8', 8: '#8a1fa8', 9: '#5e3a1a'
}
const DEFAULT_RGB = { 2: 'rgb(176, 74, 0)', 4: 'rgb(27, 122, 47)', 5: 'rgb(0, 115, 111)', 6: 'rgb(0, 89, 201)' }
// The colors the checks choose.
const FOUR = { hex: '#ff00ff', rgb: 'rgb(255, 0, 255)' }
const EIGHT = { hex: '#00cccc', rgb: 'rgb(0, 204, 204)' }

const POLL_MS = 50
const SETTLE_MS = 10000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Reads until it equals `expected` (compared as JSON) or SETTLE_MS passes, and
// returns the last reading, so the caller's assert.deepEqual names what it got.
async function settle (read, expected, timeoutMs = SETTLE_MS) {
  const want = JSON.stringify(expected)
  const deadline = Date.now() + timeoutMs
  let value = await read()
  while (JSON.stringify(value) !== want && Date.now() < deadline) {
    await sleep(POLL_MS)
    value = await read()
  }
  return value
}

const START = /Start Puzzle|Continue|Resume/i
const STYLE = '#digit-color-style'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

for (const mode of ['document-idle', 'before-start', 'after-start']) {
  describe(`injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors

    const read = (fn, arg) => p.evaluate(fn, arg)
    const editor = () => p.locator('#digit-color-editor')
    const dialogButton = (text) => p.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()
    const startButton = () => p.getByRole('button', { name: START }).first()

    // One computed style property of the elements that show `digit`, per place on the board.
    // `conflict` picks marks in SudokuPad's conflict state; entered digits never get one.
    const styleOf = (property, place, digit, conflict = false) => read(([property, place, digit, conflict]) => {
      const sel = {
        given: '#cell-givens text.cell-given',
        entered: '#cell-values text.cell-value',
        corner: '#cell-pencilmarks text.cell-pencilmark',
        centre: '#cell-candidates tspan'
      }[place]
      return [...document.querySelectorAll(sel)]
        .filter((e) => (place === 'given' || place === 'entered' ? e.textContent.trim() : e.dataset.val) === digit)
        .filter((e) => e.classList.contains('conflict') === conflict)
        .map((e) => window.getComputedStyle(e)[property])
    }, [property, place, digit, conflict])
    const fills = (place, digit, conflict) => styleOf('fill', place, digit, conflict)
    const allOf = (property) => (place, digit, conflict) => async () => [...new Set(await styleOf(property, place, digit, conflict))]
    const allFills = allOf('fill')
    const allStrokes = allOf('stroke')
    const allStrokeWidths = allOf('strokeWidth')

    const select = (r, c) => read(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [r, c])
    const enter = async (r, c, digit) => { await select(r, c); await p.keyboard.press(digit) }
    const markMode = async (id, fn) => { await p.click(id); try { await fn() } finally { await p.click('#control-normal') } }
    const undo = () => p.click('#control-undo')
    const redo = () => p.click('#control-redo')
    const saved = () => read((k) => Framework.getData(k), DATA_KEY)

    const boot = async () => {
      await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
      await startButton().waitFor({ state: 'visible' })
      if (mode === 'before-start') await p.addScriptTag({ content: script })
      await startButton().click()
      await startButton().waitFor({ state: 'hidden' })
      await p.locator('#control-undo').waitFor({ state: 'visible' })
      if (mode === 'after-start') await p.addScriptTag({ content: script })
      await p.locator(STYLE).waitFor({ state: 'attached' })
    }
    const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }
    const openEditor = async () => {
      await p.click('#control-settings')
      await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Digit color' }).first().click()
      await editor().waitFor({ state: 'visible' })
    }
    const closeWith = async (text) => {
      await dialogButton(text).click()
      await editor().waitFor({ state: 'detached' })
    }
    const pick = (digit, hex) => editor().locator(`input[data-digit="${digit}"]`).fill(hex)

    before(async () => {
      context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
      errors = []
      p = await context.newPage()
      p.on('pageerror', (e) => errors.push(String(e)))
      await p.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
      if (mode === 'document-idle') {
        await p.addInitScript((src) => {
          document.addEventListener('DOMContentLoaded', () => {
            window.__fwAtIdle = typeof Framework + '/' + (typeof Framework !== 'undefined' && typeof Framework.getApp)
            const s = document.createElement('script')
            s.textContent = src
            document.documentElement.appendChild(s)
          })
        }, script)
      }
      await p.goto(url, { waitUntil: 'load', timeout: 60000 })
      await boot()
    })
    after(async () => { await context.close() })

    // Only this mode runs the script before the page's own scripts have finished;
    // the other two wait for Framework before injecting, so the check would be vacuous.
    if (mode === 'document-idle') {
      it('Framework and getApp exist when the script runs', async () => {
        assert.equal(await read(() => window.__fwAtIdle), 'function/function')
      })
    }

    it('a fresh install has nothing saved, and entered digits show the default colors', async () => {
      assert.equal(await saved(), null)
      await enter(0, 2, '4')
      assert.deepEqual(await settle(allFills('entered', '4'), [DEFAULT_RGB[4]]), [DEFAULT_RGB[4]])
    })

    it('givens keep their color on a fresh install', async () => {
      assert.deepEqual(await allFills('given', '5')(), [GIVEN_FILL])
    })

    it('the dialog has a Digit color entry in settings with a picker for each digit, set to the defaults', async () => {
      await openEditor()
      const values = await editor().locator('input[type=color]').evaluateAll((es) => Object.fromEntries(es.map((e) => [e.dataset.digit, e.value])))
      assert.deepEqual(values, DEFAULTS)
      await closeWith('Cancel')
    })

    it('Cancel saves nothing and changes no color', async () => {
      await openEditor()
      await pick('4', FOUR.hex)
      await closeWith('Cancel')
      assert.equal(await saved(), null)
      assert.deepEqual(await allFills('entered', '4')(), [DEFAULT_RGB[4]])
    })

    it('Save colors an entered digit, and each digit has its color saved', async () => {
      await openEditor()
      await pick('4', FOUR.hex)
      await pick('8', EIGHT.hex)
      await editor().locator('button[data-act=own][data-digit="6"]').click()
      await editor().locator('button[data-act=own][data-digit="7"]').click()
      await closeWith('Save')
      assert.deepEqual(await saved(), { ...DEFAULTS, 4: FOUR.hex, 8: EIGHT.hex, 6: null, 7: null })
      assert.deepEqual(await settle(allFills('entered', '4'), [FOUR.rgb]), [FOUR.rgb])
    })

    it('givens keep their color, with a color set for the same digit', async () => {
      assert.deepEqual(await allFills('given', '5')(), [GIVEN_FILL])
    })

    it('corner marks and centre marks take the digit\'s color; a digit on SudokuPad\'s own color keeps it', async () => {
      // Cells chosen so none of these marks conflicts with a given: (0,5) takes 8 and 6, (1,6) takes 8 and 7.
      await markMode('#control-corner', async () => { await enter(0, 5, '8'); await enter(0, 5, '6') })
      await markMode('#control-centre', async () => { await enter(1, 6, '8'); await enter(1, 6, '7') })
      assert.deepEqual(await settle(allFills('corner', '8'), [EIGHT.rgb]), [EIGHT.rgb])
      assert.deepEqual(await settle(allFills('centre', '8'), [EIGHT.rgb]), [EIGHT.rgb])
      assert.deepEqual(await settle(allFills('corner', '6'), [DEFAULT_FILL]), [DEFAULT_FILL])
      assert.deepEqual(await settle(allFills('centre', '7'), [DEFAULT_FILL]), [DEFAULT_FILL])
    })

    it('conflicting marks keep the digit color and get a red outline', async () => {
      await markMode('#control-corner', async () => { await enter(0, 5, '5') })
      await markMode('#control-centre', async () => { await enter(1, 6, '5') })
      // 5 conflicts with the given 5 in row 1, so both marks are in the conflict state.
      for (const place of ['corner', 'centre']) {
        assert.deepEqual(await settle(allFills(place, '5', true), [DEFAULT_RGB[5]]), [DEFAULT_RGB[5]], place)
        assert.deepEqual(await settle(allStrokes(place, '5', true), [CONFLICT_RED]), [CONFLICT_RED], place)
        assert.deepEqual(await allStrokeWidths(place, '5', true)(), ['2px'], place)
      }
    })

    it('conflicting marks get no outline while SudokuPad\'s check pencil marks setting is off', async () => {
      await read(() => Framework.setSetting('checkpencilmarks', false))
      try {
        for (const place of ['corner', 'centre']) {
          assert.deepEqual(await settle(allStrokes(place, '5', true), [MARK_STROKE]), [MARK_STROKE], place)
          assert.deepEqual(await allFills(place, '5', true)(), [DEFAULT_RGB[5]], place)
        }
      } finally {
        await read(() => Framework.setSetting('checkpencilmarks', true))
      }
      assert.deepEqual(await settle(allStrokes('corner', '5', true), [CONFLICT_RED]), [CONFLICT_RED])
    })

    it('a mark that does not conflict keeps SudokuPad\'s own stroke, with no red outline', async () => {
      assert.deepEqual(await allStrokes('corner', '8')(), [MARK_STROKE])
      assert.deepEqual(await allStrokes('centre', '8')(), [MARK_STROKE])
    })

    it('undo, redo and a changed digit keep the colors right', async () => {
      const count = (digit) => async () => (await fills('entered', digit)).length
      await enter(0, 8, '4')
      assert.deepEqual(await settle(allFills('entered', '4'), [FOUR.rgb]), [FOUR.rgb])
      assert.equal(await settle(count('4'), 2), 2)
      await undo()
      assert.equal(await settle(count('4'), 1), 1)
      await redo()
      assert.equal(await settle(count('4'), 2), 2)
      assert.deepEqual(await settle(allFills('entered', '4'), [FOUR.rgb]), [FOUR.rgb])
      await enter(0, 8, '2')
      assert.deepEqual(await settle(allFills('entered', '2'), [DEFAULT_RGB[2]]), [DEFAULT_RGB[2]])
      assert.equal(await settle(count('4'), 1), 1)
    })

    // (7,1) shares no row, column or box with a given 8 or another 8 mark, so the new mark is not in conflict.
    it('undo and redo keep a corner mark\'s color right', async () => {
      const count = async () => (await fills('corner', '8')).length
      const before = await count()
      await markMode('#control-corner', async () => { await enter(7, 1, '8') })
      assert.equal(await settle(count, before + 1), before + 1)
      assert.deepEqual(await settle(allFills('corner', '8'), [EIGHT.rgb]), [EIGHT.rgb])
      await undo()
      assert.equal(await settle(count, before), before)
      await redo()
      assert.equal(await settle(count, before + 1), before + 1)
      assert.deepEqual(await settle(allFills('corner', '8'), [EIGHT.rgb]), [EIGHT.rgb])
    })

    const expectColorsAfterEntry = async () => {
      assert.deepEqual(await settle(allFills('entered', '4'), [FOUR.rgb]), [FOUR.rgb])
      assert.deepEqual(await allFills('entered', '2')(), [DEFAULT_RGB[2]])
      assert.deepEqual(await allFills('corner', '8')(), [EIGHT.rgb])
      assert.deepEqual(await allFills('centre', '8')(), [EIGHT.rgb])
      assert.deepEqual(await allFills('corner', '6')(), [DEFAULT_FILL])
      assert.deepEqual(await allFills('centre', '7')(), [DEFAULT_FILL])
      for (const place of ['corner', 'centre']) {
        assert.deepEqual(await allFills(place, '5', true)(), [DEFAULT_RGB[5]], place)
        assert.deepEqual(await allStrokes(place, '5', true)(), [CONFLICT_RED], place)
      }
      assert.deepEqual(await allFills('given', '5')(), [GIVEN_FILL])
    }

    it('the colors survive a reload', async () => {
      await reload()
      await expectColorsAfterEntry()
    })

    describe('cases beyond the plain board', { concurrency: false }, () => {
      it('outlines on digits: the colors still apply', async () => {
        await read(() => Framework.setSetting('outlinesondigits', true))
        try {
          await expectColorsAfterEntry()
        } finally {
          await read(() => Framework.setSetting('outlinesondigits', false))
        }
      })

      it('dark mode (prefers-color-scheme: dark): the colors still apply', async () => {
        await p.emulateMedia({ colorScheme: 'dark' })
        try {
          await expectColorsAfterEntry()
        } finally {
          await p.emulateMedia({ colorScheme: 'light' })
        }
      })

      it('a digit on a colored cell keeps its color', async () => {
        await read(() => {
          const a = Framework.app
          a.deselect(); a.select(a.grid.getCell(0, 2)); a.act({ type: 'colour', arg: '3' }); a.deselect()
        })
        assert.equal(await settle(() => read(() => Framework.app.grid.getCell(0, 2).colours.length), 1), 1)
        assert.deepEqual(await allFills('entered', '4')(), [FOUR.rgb])
      })

      // Loads through the page's own loader (fetchPuzzle, parsePuzzleData, loadCTCPuzzle), which
      // rebuilds the board in place. The repo holds one puzzle URL, so it is the same puzzle again.
      it('the board rebuilt in the page without a reload still gets the colors', async () => {
        // PuzzleLoader is a top-level binding of the page's script, not a window property.
        await p.addScriptTag({ content: 'window.pageLoader = PuzzleLoader' })
        await read(() => document.querySelectorAll('#cell-givens text').forEach((e) => e.setAttribute('data-old-board', '')))
        await read(async (id) => {
          const { parsePuzzleData, fetchPuzzle } = window.pageLoader
          await Framework.app.loadCTCPuzzle(await parsePuzzleData(await fetchPuzzle(id)))
        }, url.replace(/^https?:\/\/[^/]+\//, ''))
        // The old givens are gone once the new board is drawn.
        await p.waitForFunction(() => document.querySelectorAll('#cell-givens text:not([data-old-board])').length > 0)
        await enter(0, 3, '4')
        assert.deepEqual(await settle(allFills('entered', '4'), [FOUR.rgb]), [FOUR.rgb])
        assert.equal(await p.locator(STYLE).count(), 1)
      })
    })

    it('a digit can be set back to SudokuPad\'s own color from the dialog', async () => {
      await openEditor()
      await editor().locator('button[data-act=own][data-digit="4"]').click()
      await closeWith('Save')
      assert.deepEqual(await saved(), { ...DEFAULTS, 4: null, 8: EIGHT.hex, 6: null, 7: null })
      assert.deepEqual(await settle(allFills('entered', '4'), [DEFAULT_FILL]), [DEFAULT_FILL])
    })

    // The given 4 at row 5 makes a 4 mark at (4,1) conflict; the fill stays SudokuPad's red.
    it('a conflicting mark of a digit on SudokuPad\'s own color still gets the outline', async () => {
      await markMode('#control-corner', async () => { await enter(4, 1, '4') })
      assert.deepEqual(await settle(allStrokes('corner', '4', true), [CONFLICT_RED]), [CONFLICT_RED])
      assert.deepEqual(await allFills('corner', '4', true)(), [CONFLICT_RED])
      await undo()
    })

    it('Restore defaults brings back every default color', async () => {
      await openEditor()
      await dialogButton('Restore defaults').click()
      await closeWith('Save')
      assert.deepEqual(await saved(), DEFAULTS)
      assert.deepEqual(await settle(allFills('entered', '4'), [DEFAULT_RGB[4]]), [DEFAULT_RGB[4]])
      assert.deepEqual(await allFills('corner', '6')(), [DEFAULT_RGB[6]])
    })

    it('corrupt saved settings fall back to the default colors with no thrown error', async () => {
      const errorsBefore = errors.length
      for (const bad of ['{not json', '"red"', '[1,2]', '{"4":"url(x)"}']) {
        await read(([k, raw]) => {
          const key = Object.keys(window.localStorage).find((n) => n.endsWith(k))
          if (!key) throw new Error('no stored key for ' + k)
          window.localStorage.setItem(key, raw)
        }, [DATA_KEY, bad])
        await reload()
        assert.deepEqual(await settle(allFills('entered', '4'), [DEFAULT_RGB[4]]), [DEFAULT_RGB[4]], bad)
      }
      assert.deepEqual(errors.slice(errorsBefore), [])
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })
}
