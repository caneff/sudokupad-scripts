// Live check of Color by Digit's auto mode on sudokupad.app, in headless Chromium.
// Run with `npm run test:live`. It needs the network and a Playwright Chromium, so
// it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so
// Tampermonkey's real injection time and crackingthecryptic.com stay untested.
// Each injection time runs the same checks (see color-by-digit.live.mjs):
//   document-idle: at DOMContentLoaded, as `@run-at document-idle` approximates it
//   before-start:  after the page loads, before Start Puzzle
//   after-start:   after Start Puzzle, when the controls already exist
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openSettings } from './settings.mjs'

/* global Replay */

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../color-by-digit.user.js', import.meta.url), 'utf8')

// The puzzle's givens, row by row, 0 for empty; the same board as color-by-digit.live.mjs.
const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
const GIVEN_COUNT = [...GIVENS].filter((d) => d !== '0').length

const POLL_MS = 50
const SETTLE_MS = 10000
// How long a "nothing happened" check watches. A fixed sleep is correct only here.
const QUIET_MS = 500
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

// Watches `read` for QUIET_MS and returns every distinct reading.
async function watch (read) {
  const seen = [JSON.stringify(await read())]
  const deadline = Date.now() + QUIET_MS
  while (Date.now() < deadline) {
    await sleep(POLL_MS)
    const now = JSON.stringify(await read())
    if (now !== seen[seen.length - 1]) seen.push(now)
  }
  return seen.map((s) => JSON.parse(s))
}

const START = /Start Puzzle|Continue|Resume/i
const BUTTON = '#control-colorbydigit'
const BOX = '#control-colorbydigit [data-role="auto"]'
// Framework.setData prefixes the script's key with the site's own prefix.
const AUTO_STORAGE_KEY = 'svencodes_ColorByDigit_auto'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

for (const mode of ['document-idle', 'before-start', 'after-start']) {
  // A page for this injection time. `seedAuto` writes the saved auto mode before the page's own scripts run.
  const openSession = async (seedAuto) => {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    const errors = []
    const p = await context.newPage()
    p.on('pageerror', (e) => errors.push(String(e)))
    await p.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
    if (seedAuto) await p.addInitScript(([key]) => window.localStorage.setItem(key, 'true'), [AUTO_STORAGE_KEY])
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
    const startButton = () => p.getByRole('button', { name: START }).first()
    await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
    await startButton().waitFor({ state: 'visible' })
    const inject = async () => {
      await p.addScriptTag({ content: script })
      await p.locator(BUTTON).waitFor({ state: 'attached' })
    }
    if (mode === 'before-start') await inject()
    await startButton().click()
    await startButton().waitFor({ state: 'hidden' })
    await p.locator('#control-undo').waitFor({ state: 'visible' })
    if (mode === 'after-start') await inject()
    await p.locator(BUTTON).waitFor({ state: 'visible' })
    return { context, p, errors }
  }

  describe(`auto mode, injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors

    const read = (fn, arg) => p.evaluate(fn, arg)
    const cellsState = () => read(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).map((c) => ({
      r: c.row, c: c.col, given: c.given, value: c.value, colours: [...(c.colours || [])]
    })))
    const at = (s, r, c) => s.find((x) => x.r === r && x.c === c)
    const coloredCount = async () => (await cellsState()).filter((x) => x.colours.length).length
    const givensColored = async () => (await cellsState()).filter((x) => x.given && x.colours.length).length
    const cellAt = async (r, c) => at(await cellsState(), r, c)
    const colorsAt = async (r, c) => (await cellAt(r, c)).colours
    const valueAt = async (r, c) => String((await cellAt(r, c)).value || '')
    const getAuto = () => read((key) => Framework.getData('ColorByDigit_auto'))
    const getGroups = () => read(() => Framework.getData('ColorByDigit_groups'))
    const boxChecked = () => p.locator(BOX).getAttribute('aria-checked')
    const dialogBox = () => p.locator('#color-by-digit-editor input[data-role="auto-draft"]')
    const editor = () => p.locator('#color-by-digit-editor')
    const dialogButton = (text) => p.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()
    const select = (r, c) => read(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [r, c])
    const undo = () => p.click('#control-undo')
    const redo = () => p.click('#control-redo')
    const openEditor = async () => {
      await openSettings(p)
      await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Color by digit' }).first().click()
      await editor().waitFor({ state: 'visible' })
    }
    const closeWith = async (text) => {
      await dialogButton(text).click()
      await editor().waitFor({ state: 'detached' })
    }
    // A click on the button proper, away from the box in its corner. SudokuPad throttles refreshControls,
    // which binds a new button's click handler, so a click in the first moments is dead: clicks again
    // until the board shows `expected` colored cells.
    const pressUntil = async (expected) => {
      const deadline = Date.now() + SETTLE_MS
      let value
      do {
        const box = await p.locator(BUTTON).boundingBox()
        await p.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7)
        value = await settle(coloredCount, expected, 300)
      } while (value !== expected && Date.now() < deadline)
      return value
    }

    before(async () => {
      ({ context, p, errors } = await openSession(false))
    })
    after(async () => { await context.close() })

    it('the box is on the button and starts unticked, with nothing saved', async () => {
      assert.equal(await boxChecked(), 'false')
      assert.equal(await getAuto(), null)
    })

    it('setup: two entered digits land with auto mode off and color nothing; the replay is kept', async () => {
      await select(0, 2); await p.keyboard.press('4')
      await select(0, 3); await p.keyboard.press('7')
      const typed = await settle(async () => [await valueAt(0, 2), await valueAt(0, 3)], ['4', '7'])
      assert.deepEqual(typed, ['4', '7'])
      assert.equal(await coloredCount(), 0)
      await read(() => { window.__replay = Framework.app.getReplay() })
    })

    it('a click on the button colors the grid and leaves the box unticked', async () => {
      assert.equal(await pressUntil(GIVEN_COUNT + 2), GIVEN_COUNT + 2)
      assert.equal(await boxChecked(), 'false')
      assert.equal(await getAuto(), null)
      await undo()
      assert.equal(await settle(coloredCount, 0), 0)
    })

    it('a click on the box turns auto mode on, saves it, colors the givens only, and is not a click on the button', async () => {
      await p.click(BOX)
      assert.equal(await settle(boxChecked, 'true'), 'true')
      assert.equal(await settle(getAuto, true), true)
      assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
      // The entered digits are not givens: a button press would have colored them.
      assert.deepEqual(await watch(coloredCount), [GIVEN_COUNT])
      assert.deepEqual(await colorsAt(0, 2), [])
    })

    it('undo and redo do not trigger auto mode: an entered digit recorded without a color comes back without one', async () => {
      await undo() // the givens
      assert.equal(await settle(coloredCount, 0), 0)
      await undo() // the 7 at r1c4
      assert.equal(await settle(() => valueAt(0, 3), ''), '')
      await redo() // the 7 comes back first
      assert.equal(await settle(() => valueAt(0, 3), '7'), '7')
      assert.deepEqual(await watch(coloredCount), [0])
      await redo() // then the givens' colors
      assert.equal(await settle(coloredCount, GIVEN_COUNT), GIVEN_COUNT)
      assert.deepEqual(await colorsAt(0, 3), [])
    })

    it('the keyboard stays with the puzzle after a box click: a digit typed next lands and takes its color', async () => {
      await select(0, 5); await p.keyboard.press('3')
      assert.equal(await settle(() => valueAt(0, 5), '3'), '3')
      assert.deepEqual(await settle(() => colorsAt(0, 5), ['1']), ['1'])
    })

    it('a digit and its color are one undo step, and one redo brings both back', async () => {
      await undo()
      assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['', []]), ['', []])
      assert.equal(await givensColored(), GIVEN_COUNT)
      await redo()
      assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['3', ['1']]), ['3', ['1']])
    })

    it('a change to a digit moves the color: 3 to 4 swaps the odd color for the even one, in one step', async () => {
      await select(0, 5); await p.keyboard.press('4')
      assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['4', ['2']]), ['4', ['2']])
      await undo()
      assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['3', ['1']]), ['3', ['1']])
    })

    it('a cell that is not pure loses its color when its digit goes, and a color in no group stays', async () => {
      await select(0, 5); await p.keyboard.press('Delete')
      assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['', []]), ['', []])
      await undo()
      assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['3', ['1']]), ['3', ['1']])
    })

    it('centre marks of one group color an empty cell, marks of two groups take it away, and corner marks are ignored', async () => {
      const marks = (r, c) => read(([r, c]) => Framework.app.grid.getCell(r, c).propGet('centre').join(''), [r, c])
      await select(8, 0); await p.click('#control-centre'); await p.keyboard.press('1'); await p.keyboard.press('3')
      assert.equal(await settle(() => marks(8, 0), '13'), '13')
      assert.deepEqual(await settle(() => colorsAt(8, 0), ['1']), ['1'])
      await p.keyboard.press('2')
      assert.deepEqual(await settle(() => colorsAt(8, 0), []), [])
      await p.click('#control-normal')
      await select(8, 1); await p.click('#control-corner'); await p.keyboard.press('1'); await p.click('#control-normal')
      assert.deepEqual(await watch(() => colorsAt(8, 1)), [[]])
    })

    it('a hand-removed group color stays off until the cell\'s digit next changes', async () => {
      await read(() => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(0, 5)); a.act({ type: 'colour', arg: '1' }); a.deselect() })
      assert.deepEqual(await settle(() => colorsAt(0, 5), []), [])
      assert.deepEqual(await watch(() => colorsAt(0, 5)), [[]])
      await select(0, 5); await p.keyboard.press('5')
      assert.deepEqual(await settle(() => colorsAt(0, 5), ['1']), ['1'])
    })

    it('loadReplay and replay playback with auto mode on change no colors', async () => {
      const colorsBefore = JSON.stringify((await cellsState()).map((x) => x.colours))
      assert.notEqual(colorsBefore, JSON.stringify((await cellsState()).map(() => [])))
      await read(() => Framework.app.loadReplay(window.__replay))
      // The replay holds two entered digits and no color; auto mode must add none.
      assert.deepEqual(await settle(async () => [await valueAt(0, 2), await valueAt(0, 3), await valueAt(0, 5)], ['4', '7', '']), ['4', '7', ''])
      assert.deepEqual(await watch(coloredCount), [0])
      await read(() => Framework.app.puzzle.replayPlay(Replay.decode(window.__replay)))
      assert.deepEqual(await watch(coloredCount), [0])
    })

    it('a restart colors the givens again', async () => {
      await p.click('#control-restart')
      await p.locator('.dialog button').filter({ hasText: /Restart/ }).filter({ hasNotText: /Keep Time/ }).first().click()
      assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
      assert.equal(await valueAt(0, 2), '')
    })

    it('the dialog box opens at the value in force, and Cancel leaves auto mode as it was', async () => {
      await openEditor()
      assert.equal(await dialogBox().isChecked(), true)
      await dialogBox().uncheck()
      await closeWith('Cancel')
      assert.equal(await boxChecked(), 'true')
      assert.equal(await getAuto(), true)
    })

    it('Save with the dialog box unticked turns auto mode off on both controls and leaves every color in place', async () => {
      await openEditor()
      await dialogBox().uncheck()
      await closeWith('Save')
      assert.equal(await settle(boxChecked, 'false'), 'false')
      assert.equal(await getAuto(), false)
      assert.deepEqual(await watch(givensColored), [GIVEN_COUNT])
    })

    it('with auto mode off a typed digit gets no color, and the button still colors the grid', async () => {
      await select(0, 2); await p.keyboard.press('4')
      assert.equal(await settle(() => valueAt(0, 2), '4'), '4')
      assert.deepEqual(await watch(() => colorsAt(0, 2)), [[]])
      assert.equal(await pressUntil(GIVEN_COUNT + 1), GIVEN_COUNT + 1)
    })

    it('with auto mode off, Save with changed groups colors nothing', async () => {
      await openEditor()
      await dialogButton('Low/5/High').click()
      await closeWith('Save')
      assert.equal((await settle(getGroups, null)).length, 3)
      const colors = JSON.stringify((await cellsState()).map((x) => x.colours))
      assert.deepEqual(await watch(async () => JSON.stringify((await cellsState()).map((x) => x.colours))), [colors])
    })

    it('Save with the dialog box ticked turns auto mode on from the dialog and colors the givens', async () => {
      await undo() // the button press, so the givens carry the colors of the groups at the time of the press
      await openEditor()
      await dialogBox().check()
      await closeWith('Save')
      assert.equal(await settle(boxChecked, 'true'), 'true')
      assert.equal(await settle(getAuto, true), true)
      const given = await cellAt(0, 0) // r1c1 holds 5, key 5 in Low/5/High
      assert.deepEqual(given.colours.length, 1)
    })

    it('Save with changed groups and auto mode on recolors every cell in one undo step', async () => {
      // Low/5/High is saved; switch to Odd/Even.
      const before = JSON.stringify((await cellsState()).map((x) => x.colours))
      await openEditor()
      await dialogButton('Odd/Even').click()
      await closeWith('Save')
      const oddEven = (x) => {
        const digit = x.given || x.value
        return digit ? [Number(digit) % 2 ? '1' : '2'] : []
      }
      const wrong = async () => (await cellsState()).filter((x) => JSON.stringify(x.colours) !== JSON.stringify(oddEven(x))).length
      assert.equal(await settle(wrong, 0), 0)
      await undo()
      assert.equal(await settle(async () => JSON.stringify((await cellsState()).map((x) => x.colours)), before), before)
    })

    it('one Save that turns auto mode on and changes the groups recolors every pure cell, not only the givens', async () => {
      await p.click(BOX)
      assert.equal(await settle(boxChecked, 'false'), 'false')
      await select(0, 6); await p.keyboard.press('8')
      assert.equal(await settle(() => valueAt(0, 6), '8'), '8')
      assert.deepEqual(await watch(() => colorsAt(0, 6)), [[]])
      await openEditor()
      await dialogButton('Low/5/High').click()
      await dialogBox().check()
      await closeWith('Save')
      assert.equal(await settle(boxChecked, 'true'), 'true')
      assert.deepEqual(await settle(() => colorsAt(0, 6), ['9']), ['9'])
    })

    it('a click on the box turns auto mode off again, and the colors stay', async () => {
      await p.click(BOX)
      assert.equal(await settle(boxChecked, 'false'), 'false')
      assert.equal(await getAuto(), false)
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })

  describe(`auto mode saved on, injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ({ context, p, errors } = await openSession(true))
    })
    after(async () => { await context.close() })

    it('the box is ticked and the givens are colored at puzzle start, with no click', async () => {
      assert.equal(await p.locator(BOX).getAttribute('aria-checked'), 'true')
      const givensColored = () => p.evaluate(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).filter((c) => c.given && (c.colours || []).length).length)
      assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })
}
