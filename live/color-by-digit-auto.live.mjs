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

// The saved profiles every session starts with: Odd/Even active, Low/5/High to switch to. The fresh
// install and the migration are checked in color-by-digit-profiles.live.mjs.
const LOW_FIVE_HIGH = [{ key: '1', digits: ['0', '1', '2', '3', '4'] }, { key: '5', digits: ['5'] }, { key: '9', digits: ['6', '7', '8', '9'] }]
const ODD_EVEN = [{ key: '1', digits: ['1', '3', '5', '7', '9'] }, { key: '2', digits: ['0', '2', '4', '6', '8'] }]
const SEED = { profiles: [{ name: 'Odd/Even', groups: ODD_EVEN }, { name: 'Low/5/High', groups: LOW_FIVE_HIGH }], active: 0 }
// The key the script saves its profiles under, and the one Framework.setData stores it at.
const PROFILES_KEY = 'ColorByDigit_profiles'
const PROFILES_STORAGE_KEY = `svencodes_${PROFILES_KEY}`

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
const AUTO_KEY = 'ColorByDigit_auto'
// Framework.setData prefixes the script's key with the site's own prefix.
const AUTO_STORAGE_KEY = `svencodes_${AUTO_KEY}`

const givensColoredOn = (p) => p.evaluate(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).filter((c) => c.given && (c.colours || []).length).length)
const boxCheckedOn = (p) => p.locator(BOX).getAttribute('aria-checked')

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

for (const mode of ['document-idle', 'before-start', 'after-start']) {
  // Runs the page through load, the script's injection time for this mode, and Start Puzzle.
  const bootPage = async (p) => {
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
  }

  // A page for this injection time. `seedAuto` writes the saved auto mode before the page's own scripts run.
  const openSession = async (seedAuto, contextOptions = {}) => {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, ...contextOptions })
    const errors = []
    const p = await context.newPage()
    p.on('pageerror', (e) => errors.push(String(e)))
    await p.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
    await p.addInitScript(([key, value]) => { if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value) }, [PROFILES_STORAGE_KEY, JSON.stringify(SEED)])
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
    await bootPage(p)
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
    const givensColored = () => givensColoredOn(p)
    const cellAt = async (r, c) => at(await cellsState(), r, c)
    const colorsAt = async (r, c) => (await cellAt(r, c)).colours
    const valueAt = async (r, c) => String((await cellAt(r, c)).value || '')
    const getAuto = () => read((key) => Framework.getData(key), AUTO_KEY)
    const getGroups = () => read((key) => { const d = Framework.getData(key); return d.profiles[d.active].groups }, PROFILES_KEY)
    // Makes the profile at `index` of SEED the active one in the open dialog.
    const chooseProfile = (index) => p.click(`#color-by-digit-editor [data-act=activate][data-index="${index}"]`)
    const boxChecked = () => boxCheckedOn(p)
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

    it('the keyboard stays with the puzzle right after a box click: a digit typed next lands and takes its color', async () => {
      await select(0, 5)
      await p.click(BOX) // off
      assert.equal(await settle(boxChecked, 'false'), 'false')
      await p.click(BOX) // on again, straight before the key
      assert.equal(await settle(boxChecked, 'true'), 'true')
      await p.keyboard.press('3')
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

    it('a multi-cell entry and its colors are one undo step', async () => {
      await read(() => { const a = Framework.app; a.deselect(); a.select([a.grid.getCell(8, 1), a.grid.getCell(8, 2)]) })
      await p.keyboard.press('1')
      const both = async () => [await valueAt(8, 1), await colorsAt(8, 1), await valueAt(8, 2), await colorsAt(8, 2)]
      assert.deepEqual(await settle(both, ['1', ['1'], '1', ['1']]), ['1', ['1'], '1', ['1']])
      await undo()
      assert.deepEqual(await settle(both, ['', [], '', []]), ['', [], '', []])
      await redo()
      assert.deepEqual(await settle(both, ['1', ['1'], '1', ['1']]), ['1', ['1'], '1', ['1']])
      await undo()
      assert.deepEqual(await settle(both, ['', [], '', []]), ['', [], '', []])
    })

    it('a Delete that changes nothing leaves the redo stack alone', async () => {
      await select(8, 6)
      await p.keyboard.press('Delete')
      assert.equal(await read(() => Framework.app.puzzle.redoStack.length) > 0, true)
      await select(0, 5)
      await redo()
      assert.deepEqual(await settle(async () => [await valueAt(8, 1), await valueAt(8, 2)], ['1', '1']), ['1', '1'])
      await undo()
    })

    it('a change to a digit moves the color: 3 to 4 swaps the odd color for the even one, in one step', async () => {
      await select(0, 5); await p.keyboard.press('4')
      assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['4', ['2']]), ['4', ['2']])
      await undo()
      assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['3', ['1']]), ['3', ['1']])
    })

    it('a cell that is not pure loses its color when its digit goes', async () => {
      await select(0, 5); await p.keyboard.press('Delete')
      assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['', []]), ['', []])
      await undo()
      assert.deepEqual(await settle(async () => [await valueAt(0, 5), await colorsAt(0, 5)], ['3', ['1']]), ['3', ['1']])
    })

    it('with Multi-color off, a Delete takes the group color off a cell that holds two colors', async () => {
      await select(8, 6); await p.keyboard.press('4')
      assert.deepEqual(await settle(() => colorsAt(8, 6), ['2']), ['2'])
      await read(() => Framework.setSetting('multicolour', true))
      await read(() => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(8, 6)); a.act({ type: 'colour', arg: '3' }); a.deselect() })
      assert.deepEqual(await settle(async () => [...await colorsAt(8, 6)].sort(), ['2', '3']), ['2', '3'])
      await read(() => Framework.setSetting('multicolour', false))
      await select(8, 6); await p.keyboard.press('Delete')
      assert.equal(await settle(() => valueAt(8, 6), ''), '')
      assert.equal((await colorsAt(8, 6)).includes('2'), false)
      await read(() => Framework.setSetting('multicolour', true))
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

    it('an entry SudokuPad runs inside its own group, as a paste does, is colored and undone with it', async () => {
      const state = async () => [await valueAt(8, 3), await colorsAt(8, 3)]
      await select(8, 3); await p.keyboard.press('7')
      assert.deepEqual(await settle(state, ['7', ['1']]), ['7', ['1']])
      await read(() => {
        const a = Framework.app
        a.act({ type: 'groupstart' }); a.act({ type: 'clear', arg: 'normal' }); a.act({ type: 'value', arg: '6' }); a.act({ type: 'groupend' })
      })
      assert.deepEqual(await settle(state, ['6', ['2']]), ['6', ['2']])
      await undo() // the clear, the 6 and the colors together: back to the 7 in its odd color
      assert.deepEqual(await settle(state, ['7', ['1']]), ['7', ['1']])
      await undo()
      assert.deepEqual(await settle(state, ['', []]), ['', []])
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
      await chooseProfile(1)
      await closeWith('Save')
      assert.deepEqual(await settle(getGroups, LOW_FIVE_HIGH), LOW_FIVE_HIGH)
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
      // Every given is colored again, and r1c1 holds 5, which is key 5 in Low/5/High.
      assert.equal(await settle(givensColored, GIVEN_COUNT), GIVEN_COUNT)
      assert.deepEqual(await colorsAt(0, 0), ['5'])
    })

    it('Save with changed groups and auto mode on recolors every cell in one undo step', async () => {
      // Low/5/High is saved; switch to Odd/Even.
      const before = JSON.stringify((await cellsState()).map((x) => x.colours))
      await openEditor()
      await chooseProfile(0)
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
      await chooseProfile(1)
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
      assert.equal(await boxCheckedOn(p), 'true')
      assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })

  describe(`auto mode saved on, with saved progress, injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ({ context, p, errors } = await openSession(false))
      await p.evaluate(() => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(0, 2)) })
      await p.keyboard.press('4')
      // SudokuPad saves progress a moment after a change.
      await p.waitForFunction(() => Object.keys(window.localStorage).some((k) => /progress/i.test(k)), null, { timeout: SETTLE_MS })
      await p.evaluate(([key]) => Framework.setData(key, true), [AUTO_KEY])
      await bootPage(p)
    })
    after(async () => { await context.close() })

    it('the saved digit is back and the givens are colored, since loading progress resets the board', async () => {
      assert.equal(await p.evaluate(() => String(Framework.app.grid.getCell(0, 2).value)), '4')
      assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })

  describe(`auto mode box on a touch screen, injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors

    before(async () => {
      ({ context, p, errors } = await openSession(false, { hasTouch: true }))
    })
    after(async () => { await context.close() })

    it('a tap on the box turns auto mode on and colors the givens, and a second tap turns it off', async () => {
      await p.tap(BOX)
      assert.equal(await settle(() => boxCheckedOn(p), 'true'), 'true')
      assert.equal(await settle(() => givensColoredOn(p), GIVEN_COUNT), GIVEN_COUNT)
      await p.tap(BOX)
      assert.equal(await settle(() => boxCheckedOn(p), 'false'), 'false')
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })
}
