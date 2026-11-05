// Live check of color-by-digit.user.js on sudokupad.app, in headless Chromium.
// Run with `npm run test:live`. The first run of a day needs the network (live/cache.mjs records SudokuPad, later runs replay it) and a Playwright Chromium, so
// it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so
// Tampermonkey's real injection time and crackingthecryptic.com stay untested.
// The script goes in after Start Puzzle, when the controls already exist; startup.live.mjs checks the other injection times.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { routeSudokuPad } from './cache.mjs'
import { headerVersion, openSettings } from './settings.mjs'
import { POLL_MS, settle, SETTLE_MS } from './settle.mjs'

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../color-by-digit.user.js', import.meta.url), 'utf8')

// The puzzle's givens, row by row, 0 for empty. Must match the board built by
// puzzle-url.txt; the 'the board holds the givens' test checks it.
const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
const GIVEN_COUNT = [...GIVENS].filter((d) => d !== '0').length
// Two entered digits sit on empty cells: r1c3 = 4, r1c4 = 7.
const ENTERED = { '0,2': '4', '0,3': '7' }
const DIGIT_CELLS = GIVEN_COUNT + Object.keys(ENTERED).length

// The saved profiles every session of this file starts with, so the checks below run on Odd/Even with
// Low/5/High to switch to. The fresh install and the migration are checked in color-by-digit-profiles.live.mjs.
const LOW_FIVE_HIGH = [{ key: '1', digits: ['0', '1', '2', '3', '4'] }, { key: '5', digits: ['5'] }, { key: '9', digits: ['6', '7', '8', '9'] }]
const ODD_EVEN = [{ key: '1', digits: ['1', '3', '5', '7', '9'] }, { key: '2', digits: ['0', '2', '4', '6', '8'] }]
const SEED = { profiles: [{ name: 'Odd/Even', groups: ODD_EVEN }, { name: 'Low/5/High', groups: LOW_FIVE_HIGH }], active: 0 }
// Framework.setData prefixes the script's key with the site's own prefix.
// The key the script saves its profiles under, and the one Framework.setData stores it at.
const PROFILES_KEY = 'ColorByDigit_profiles'
const PROFILES_STORAGE_KEY = `svencodes_${PROFILES_KEY}`

// How long a "nothing happened" check watches. A fixed sleep is correct only here.
const QUIET_MS = 500
// How long one click gets to show its effect before pressUntil clicks again, and
// how long pressUntil keeps clicking. The throttle it absorbs is a few hundred ms,
// so a button that ignores clicks for longer than this fails.
const CLICK_TAKES_MS = 300
const CLICK_DEADLINE_MS = 3000

// How often settledLayout re-reads the controls, and how far a bottom edge may overlap the footer's top.
const LAYOUT_POLL_MS = 250
const FIT_SLACK_PX = 1
// How many stand-in buttons another script's row gets in the wrap test; enough to fill a second row.
const OTHER_BUTTONS = 8

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const cellsState = () => read(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).map((c) => ({
    r: c.row, c: c.col, given: c.given, value: c.value, colours: [...(c.colours || [])], corner: [...(c.pencilmarks || [])]
  })))
  const at = (s, r, c) => s.find((x) => x.r === r && x.c === c)
  const coloredCount = async () => (await cellsState()).filter((x) => x.colours.length).length
  const colorsAt = async (r, c) => at(await cellsState(), r, c).colours
  const digitsOnBoard = async () => (await cellsState()).map((x) => [x.given, x.value])
  const getData = () => read((key) => Framework.getData(key), PROFILES_KEY)
  const getGroups = () => read((key) => { const d = Framework.getData(key); return d.profiles[d.active].groups }, PROFILES_KEY)
  const getSetting = () => read(() => Framework.getSetting('multicolour'))
  const editor = () => p.locator('#color-by-digit-editor')
  const dialogButton = (text) => p.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()
  const startButton = () => p.getByRole('button', { name: START }).first()

  // What the board should show after a press, given each digit's key.
  const expectedColours = (keyOfDigit) => (x) => {
    const digit = ENTERED[`${x.r},${x.c}`] || GIVENS[x.r * 9 + x.c]
    return digit === '0' ? [] : [keyOfDigit(digit)]
  }
  const oddEven = expectedColours((d) => (Number(d) % 2 ? '1' : '2'))
  const lowFiveHigh = expectedColours((d) => (Number(d) < 5 ? '1' : d === '5' ? '5' : '9'))
  const wrongCount = async (expected) => (await cellsState()).filter((x) => JSON.stringify(x.colours) !== JSON.stringify(expected(x))).length

  const inject = async () => {
    await p.addScriptTag({ content: script })
    await p.locator(BUTTON).waitFor({ state: 'attached' })
  }
  const start = async () => {
    await startButton().click()
    await startButton().waitFor({ state: 'hidden' })
    await p.locator('#control-undo').waitFor({ state: 'visible' })
  }
  // Waits for the puzzle, then runs the page through Start Puzzle and injects the script.
  const boot = async () => {
    await p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
    await startButton().waitFor({ state: 'visible' })
    await start()
    await inject()
  }
  const press = () => p.click(BUTTON)
  // SudokuPad throttles refreshControls, which binds a new button's click handler,
  // so a click in the first moments after the script is injected is dead. Clicks
  // again until `read` shows `expected`; a handler that never binds still times out.
  const pressUntil = async (read, expected) => {
    const deadline = Date.now() + CLICK_DEADLINE_MS
    let value
    do {
      await press()
      value = await settle(read, expected, CLICK_TAKES_MS)
    } while (JSON.stringify(value) !== JSON.stringify(expected) && Date.now() < deadline)
    return value
  }
  const undo = () => p.click('#control-undo')
  const redo = () => p.click('#control-redo')
  const select = (r, c) => read(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [r, c])
  const paint = (r, c, key) => read(([r, c, key]) => {
    const a = Framework.app
    a.deselect(); a.select(a.grid.getCell(r, c)); a.act({ type: 'colour', arg: key }); a.deselect()
  }, [r, c, key])
  const setMultiColor = (v) => read((v) => Framework.setSetting('multicolour', v), v)
  const openEditor = async () => {
    await openSettings(p)
    await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Color by digit' }).first().click()
    await editor().waitFor({ state: 'visible' })
  }
  const closeWith = async (text) => {
    await dialogButton(text).click()
    await editor().waitFor({ state: 'detached' })
  }

  before(async () => {
    context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    errors = []
    p = await context.newPage()
    p.on('pageerror', (e) => errors.push(String(e)))
    await routeSudokuPad(p)
    await p.addInitScript(([key, value]) => { if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value) }, [PROFILES_STORAGE_KEY, JSON.stringify(SEED)])
    await p.goto(url, { waitUntil: 'load', timeout: 60000 })
    await boot()
  })
  after(async () => { await context.close() })

  it('the board holds the givens in GIVENS', async () => {
    const board = (await cellsState()).map((x) => x.given || '0').join('')
    assert.equal(board, GIVENS)
  })

  // Rects of the button, Undo, the bottom row, the footer and the viewport, from the page.
  const layout = () => read(() => {
    const box = (e) => e.getBoundingClientRect().toJSON()
    // SudokuPad's footer is a bare element with no id or class; find it by its credit line.
    const footer = [...document.querySelectorAll('*')].find((e) => e.children.length < 4 && /Created by/.test(e.textContent) && e.textContent.length < 200)
    return {
      button: box(document.querySelector('#control-colorbydigit')),
      undo: box(document.querySelector('#control-undo')),
      row: box(document.querySelector('.controls-aux')),
      footer: box(footer),
      neighbours: [...document.querySelector('.controls-aux').children].map((e) => e.id),
      view: { width: window.innerWidth, height: window.innerHeight }
    }
  })
  // SudokuPad re-fits its controls after a throttled delay: waits until two readings agree, and
  // fails if the row is still moving after SETTLE_MS, rather than asserting on a layout in motion.
  const settledLayout = async () => {
    let last = JSON.stringify(await layout())
    const deadline = Date.now() + SETTLE_MS
    while (Date.now() < deadline) {
      await sleep(LAYOUT_POLL_MS)
      const now = JSON.stringify(await layout())
      if (now === last) return JSON.parse(now)
      last = now
    }
    throw new Error(`the controls were still moving after ${SETTLE_MS} ms: ${last}`)
  }
  // The button and its row lie inside the viewport, and the footer starts below the button.
  // FIT_SLACK_PX absorbs sub-pixel rounding between the row's bottom edge and the footer's top.
  const fits = (l) => [l.button, l.row].every((r) => r.left >= 0 && r.top >= 0 && r.right <= l.view.width && r.bottom <= l.view.height) &&
    l.footer.top >= l.button.bottom - FIT_SLACK_PX && l.footer.top >= l.row.bottom - FIT_SLACK_PX

  it('the button sits in the bottom row with Undo, Redo, Check and Select, the same size as Undo', async () => {
    const l = await settledLayout()
    assert.deepEqual(l.neighbours.slice(0, 5), ['control-undo', 'control-redo', 'control-check', 'control-select', 'control-colorbydigit'])
    assert.equal(Math.round(l.button.width), Math.round(l.undo.width))
    assert.equal(Math.round(l.button.height), Math.round(l.undo.height))
    assert.equal(Math.round(l.button.y), Math.round(l.undo.y))
  })

  it('the button and the controls still fit the viewport and clear the footer', async () => {
    const l = await settledLayout()
    assert.equal(fits(l), true, JSON.stringify(l))
  })

  it('the button shows an icon or readable text', async () => {
    const look = await p.locator(BUTTON).evaluate((e) => {
      const svg = e.querySelector('.icon svg')
      const box = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 }
      return { icon: box.width > 8 && box.height > 8, text: e.textContent.trim(), fontSize: parseFloat(window.getComputedStyle(e).fontSize) }
    })
    assert.equal(look.icon || (look.text.length > 0 && look.fontSize > 4), true, JSON.stringify(look))
  })

  let baseline

  it('setup: entered digits and a corner mark land, and nothing is colored', async () => {
    await select(0, 2); await p.keyboard.press('4')
    await select(0, 3); await p.keyboard.press('7')
    await p.click('#control-corner'); await select(0, 5); await p.keyboard.press('2'); await p.click('#control-normal')
    await select(8, 0)
    const typed = await settle(async () => { const s = await cellsState(); return [String(at(s, 0, 2).value), String(at(s, 0, 3).value), at(s, 0, 5).corner.length] }, ['4', '7', 1])
    assert.deepEqual(typed, ['4', '7', 1])
    assert.equal(await coloredCount(), 0)
    baseline = JSON.stringify(await digitsOnBoard())
  })

  // The first press of the run, before any dialog has opened: a button whose click
  // handler was never bound fails here.
  it('a press colors every given and entered digit by Odd/Even, nothing else', async () => {
    assert.equal(await pressUntil(() => wrongCount(oddEven), 0), 0)
    assert.equal(await coloredCount(), DIGIT_CELLS)
    assert.equal(JSON.stringify(await digitsOnBoard()), baseline)
    const s = await cellsState()
    assert.deepEqual(at(s, 0, 2).colours, ['2'])
    assert.deepEqual(at(s, 0, 3).colours, ['1'])
  })

  it('the selection is restored', async () => {
    assert.deepEqual(await read(() => Framework.app.puzzle.selectedCells.map((c) => [c.row, c.col])), [[8, 0]])
  })

  it('the colors render on the board', async () => {
    const rendered = await read(() => ({ one: document.querySelectorAll('.color-1').length, two: document.querySelectorAll('.color-2').length }))
    assert.equal(rendered.one > 0 && rendered.two > 0, true, JSON.stringify(rendered))
  })

  it('one undo reverses the whole press and leaves digits alone', async () => {
    await undo()
    assert.equal(await settle(coloredCount, 0), 0)
    assert.equal(JSON.stringify(await digitsOnBoard()), baseline)
  })

  it('one redo restores the whole press', async () => {
    await redo()
    assert.equal(await settle(coloredCount, DIGIT_CELLS), DIGIT_CELLS)
  })

  it('a second press changes nothing and adds no undo step', async () => {
    await press()
    // "Nothing happened": the board must stay as it is for QUIET_MS.
    assert.deepEqual(await watch(coloredCount), [DIGIT_CELLS])
    assert.equal(await wrongCount(oddEven), 0)
    await undo()
    assert.equal(await settle(coloredCount, 0), 0)
  })

  describe('Multi-color', { concurrency: false }, () => {
    after(async () => { await setMultiColor(true) })

    it('on: the group color stacks on the existing one, and undo returns the cell to its own', async () => {
      await setMultiColor(true)
      await paint(0, 0, '3')
      assert.deepEqual(await settle(() => colorsAt(0, 0), ['3']), ['3'])
      await press()
      assert.deepEqual((await settle(async () => [...await colorsAt(0, 0)].sort(), ['1', '3'])), ['1', '3'])
      await undo()
      assert.deepEqual(await settle(() => colorsAt(0, 0), ['3']), ['3'])
    })

    it('off: the group color replaces the existing one, and a second press does not toggle it away', async () => {
      await setMultiColor(false)
      assert.equal(await getSetting(), false)
      await press()
      assert.deepEqual(await settle(() => colorsAt(0, 0), ['1']), ['1'])
      assert.equal(await settle(() => wrongCount(oddEven), 0), 0)
      await press()
      // "Nothing happened": the colors must not toggle away.
      assert.deepEqual(await watch(() => wrongCount(oddEven)), [0])
      await undo()
      assert.deepEqual(await settle(() => colorsAt(0, 0), ['3']), ['3'])
      assert.equal(await coloredCount(), 1)
    })
  })

  it('the settings entry opens the editor with two groups', async () => {
    await openEditor()
    assert.equal(await p.locator('#color-by-digit-editor button[data-act=digit][data-digit="1"]').count(), 2)
  })

  it('the palette is read from the CSS variables: three pages of 9 visible swatches, 27 in all', async () => {
    const select = p.locator('#color-by-digit-editor select[data-act="page"][data-group="0"]')
    const seen = []
    for (const value of ['0', '1', '2']) {
      await select.selectOption(value)
      seen.push(await p.$$eval('#color-by-digit-editor button[data-act=color][data-group="0"]', (es) => es.map((e) => window.getComputedStyle(e).backgroundColor)))
    }
    assert.deepEqual(seen.map((page) => page.length), [9, 9, 9])
    assert.equal(seen.flat().filter((bg) => bg === 'rgba(0, 0, 0, 0)').length, 0)
  })

  it('assigning a digit moves it out of its other group, and the dialog stays open', async () => {
    const weights = () => p.$$eval('#color-by-digit-editor button[data-act=digit][data-digit="1"]', (es) => es.map((e) => e.style.fontWeight))
    assert.deepEqual(await weights(), ['bold', 'normal'])
    await p.click('#color-by-digit-editor button[data-act=digit][data-group="1"][data-digit="1"]')
    assert.deepEqual(await weights(), ['normal', 'bold'])
    assert.equal(await editor().count(), 1)
  })

  it('Cancel saves nothing', async () => {
    await closeWith('Cancel')
    assert.deepEqual(await getData(), SEED)
  })

  describe('saved groups', { concurrency: false }, () => {
    it('Save with Low/5/High made the active profile writes it and closes the dialog', async () => {
      await openEditor()
      await p.click('#color-by-digit-editor [data-act=activate][data-index="1"]')
      await closeWith('Save')
      const expected = { ...SEED, active: 1 }
      assert.deepEqual(await settle(getData, expected), expected)
    })

    it('the saved list and the button survive a reload, and a press uses the saved list', async () => {
      const saved = await getData()
      await p.reload({ waitUntil: 'load' })
      await boot()
      assert.deepEqual(await getData(), saved)
      await p.locator(BUTTON).waitFor({ state: 'visible' })
      // Clear whatever progress the reload restored, then color with the saved list.
      await read(() => {
        const a = Framework.app
        ;[].concat(a.puzzle.cells).flat(Infinity).forEach((c) => {
          [...(c.colours || [])].forEach((k) => { a.deselect(); a.select(c); a.act({ type: 'colour', arg: k }) })
        })
        a.deselect()
      })
      assert.equal(await settle(coloredCount, 0), 0)
      assert.equal(await pressUntil(() => wrongCount(lowFiveHigh), 0), 0)
      assert.equal(await coloredCount() > 0, true)
      await undo()
      assert.equal(await settle(coloredCount, 0), 0)
    })

    // Saved groups are Low/5/High here, so centre marks 6, 7 and 9 all belong to key 9.
    it('a press also colors an empty cell whose centre marks fit one group, leaves one spanning two groups, and one undo removes it', async () => {
      await select(8, 0); await p.click('#control-centre')
      for (const k of ['6', '7', '9']) await p.keyboard.press(k)
      await select(8, 1)
      for (const k of ['1', '7']) await p.keyboard.press(k)
      await p.click('#control-normal')
      const marks = () => read(() => [[8, 0], [8, 1]].map(([r, c]) => Framework.app.grid.getCell(r, c).propGet('centre').join('')))
      assert.deepEqual(await settle(marks, ['679', '17']), ['679', '17'])
      assert.equal(await pressUntil(coloredCount, DIGIT_CELLS + 1), DIGIT_CELLS + 1)
      const s = await cellsState()
      assert.deepEqual(at(s, 8, 0).colours, ['9'])
      assert.deepEqual(at(s, 8, 1).colours, [])
      assert.equal(await wrongCount((x) => (x.r === 8 && x.c === 0 ? ['9'] : lowFiveHigh(x))), 0)
      await undo()
      assert.equal(await settle(coloredCount, 0), 0)
    })

    it('each group box has a red × named "Remove group" in its upper right corner, clear of the pulldown and numpad at desktop and phone width', async () => {
      const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      for (const width of [1200, 390]) {
        await p.setViewportSize({ width, height: 900 })
        await openEditor()
        const removes = p.getByRole('button', { name: 'Remove group' })
        assert.equal(await removes.count(), 3)
        assert.equal(await removes.first().getAttribute('title'), 'Remove group')
        assert.equal(await removes.first().evaluate((e) => window.getComputedStyle(e).color), 'rgb(192, 57, 43)')
        const boxes = await p.locator('#color-by-digit-editor button[data-act=remove]').evaluateAll((els) => els.map((x) => {
          const rect = (e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }
          const box = x.parentElement
          const others = [...box.querySelectorAll('select, [data-role=numpad] button')].map(rect)
          return { x: rect(x), box: rect(box), others }
        }))
        for (const { x, box, others } of boxes) {
          assert.equal(x.right <= box.right && x.top >= box.top, true, `inside the box's upper right at width ${width}: ${JSON.stringify({ x, box })}`)
          assert.equal(box.right - x.right < 16 && x.top - box.top < 16, true, `in the corner at width ${width}: ${JSON.stringify({ x, box })}`)
          assert.equal(others.length > 0, true, `the box holds a pulldown and numpad to clear at width ${width}`)
          assert.deepEqual(others.filter((o) => overlap(x, o)), [], `clear of pulldown and numpad at width ${width}`)
        }
        await closeWith('Cancel')
      }
      await p.setViewportSize({ width: 1200, height: 900 })
    })

    it('Clear all empties the dialog, Cancel restores the saved groups, Save keeps the empty list, and a press does nothing', async () => {
      await openEditor()
      const groupCount = () => p.locator('#color-by-digit-editor button[data-act=remove]').count()
      assert.equal(await groupCount(), 3)
      assert.equal(await p.locator('#color-by-digit-editor [data-role=profile-row]').count(), 2)
      await p.click('#color-by-digit-editor button[data-act=clear]')
      assert.equal(await groupCount(), 0)
      await closeWith('Cancel')
      assert.equal((await getGroups()).length, 3)
      await openEditor()
      assert.equal(await groupCount(), 3)
      await p.click('#color-by-digit-editor button[data-act=clear]')
      await closeWith('Save')
      assert.deepEqual(await settle(getGroups, []), [])
      assert.equal((await getData()).active, 1)
      await press()
      // "Nothing happened": no cell gets a color.
      assert.deepEqual(await watch(coloredCount), [0])
    })
  })

  // A custom palette, with page 4 current: page 1 has a color at index 0 and a transparent index 4,
  // and a fourth page of four colors, three of them on keys the default palette lacks. Three saved
  // groups: key 8 (on pages 1 and 4), key 6 (on page 1) and key nope (on none).
  describe('custom palette', { concurrency: false }, () => {
    const group = (g) => `#color-by-digit-editor [data-group="${g}"]`
    const pageSelect = (g) => p.locator(`${group(g)}[data-act="page"]`)
    const shownPage = (g) => pageSelect(g).inputValue()
    const labels = (g) => p.$$eval(`${group(g)}[data-act="page"] option`, (es) => es.map((e) => e.textContent))
    const swatchKeys = (g) => p.$$eval(`${group(g)}[data-act="color"]`, (es) => es.map((e) => e.dataset.key))
    const pressedKeys = (g) => p.$$eval(`${group(g)}[aria-pressed="true"]`, (es) => es.map((e) => e.dataset.key))
    const chosenKey = (g) => p.locator(`${group(g)}[data-act="page"] + [data-role="chosen"]`).getAttribute('title')
    const boxOf = (g, key) => p.locator(`#color-by-digit-editor button[data-group="${g}"][data-key="${key}"]`).evaluate((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) } })
    let original, savedState

    before(async () => {
      savedState = await getData()
      original = await read(() => JSON.parse(JSON.stringify(Framework.app.tools.colour.palette)))
      await read(([original, profilesKey]) => {
        const palette = JSON.parse(JSON.stringify(original))
        palette.colors.u = 'rgb(10, 20, 30)'
        palette.colors.v = 'rgb(40, 50, 60)'
        palette.colors.w = 'rgb(70, 80, 90)'
        palette.pages[0] = ['4', '1', '2', '3', '0', '5', '6', '7', '8', '9']
        palette.pages.push(['u', 'v', 'w', '8'])
        Framework.app.tools.colour.setPalette(palette)
        Framework.app.tools.colour.setPage(3)
        Framework.setData(profilesKey, { profiles: [{ name: 'Custom', groups: [{ key: '8', digits: [] }, { key: '6', digits: [] }, { key: 'nope', digits: [] }] }], active: 0 })
      }, [original, PROFILES_KEY])
      await openEditor()
    })
    after(async () => {
      await read(([original, savedState, profilesKey]) => {
        Framework.app.tools.colour.setPalette(original)
        Framework.app.tools.colour.setPage(0)
        Framework.removeData('ToolColor_palette')
        Framework.removeData('ToolColor_page')
        Framework.setData(profilesKey, savedState)
      }, [original, savedState, PROFILES_KEY])
      if (await editor().count()) await closeWith('Cancel')
    })

    it('the pulldown lists four pages and marks SudokuPad\'s current page', async () => {
      assert.deepEqual(await labels(0), ['Page 1', 'Page 2', 'Page 3', 'Page 4 (current)'])
    })

    it('each group opens on the page holding its color, the current page first, and the current page with no color', async () => {
      assert.deepEqual([await shownPage(0), await shownPage(1), await shownPage(2)], ['3', '0', '3'])
    })

    it('a group shows one 3 by 3 page: nine or ten swatches, not every page', async () => {
      assert.equal((await swatchKeys(1)).length, 9)
      assert.equal((await swatchKeys(0)).length, 4)
    })

    it('lays page 1 out by index, with the empty index kept and index 0 on its own row below', async () => {
      assert.deepEqual(await swatchKeys(1), ['1', '2', '3', '5', '6', '7', '8', '9', '4'])
      const [one, two, five, nine, zero] = await Promise.all(['1', '2', '5', '9', '4'].map((key) => boxOf(1, key)))
      // Index 4 is empty, so index 5 stays under index 2 in the second column of row 2.
      assert.equal(five.x, two.x)
      assert.equal(five.y > two.y, true)
      assert.equal(zero.x, one.x)
      assert.equal(zero.y > nine.y, true)
      // Every swatch is the same square, whatever height SudokuPad's own button styles ask for.
      const sizes = await p.$$eval(`${group(1)}[data-act="color"]`, (es) => [...new Set(es.map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}` }))])
      assert.deepEqual(sizes, ['44x44'])
    })

    it('shows the fourth page, with its index 0 below', async () => {
      assert.deepEqual(await swatchKeys(0), ['v', 'w', '8', 'u'])
    })

    it('the group\'s own color is marked selected only on the page that holds it', async () => {
      assert.deepEqual(await pressedKeys(1), ['6'])
      assert.deepEqual(await pressedKeys(0), ['8'])
    })

    it('switching pages leaves the group\'s color alone, shows it beside the pulldown, and the page stays chosen', async () => {
      await pageSelect(1).selectOption('3')
      assert.equal(await shownPage(1), '3')
      assert.deepEqual(await pressedKeys(1), [])
      assert.equal(await chosenKey(1), '6')
      const chosen = await p.locator(`${group(1)}[data-act="page"] + [data-role="chosen"]`).evaluate((e) => window.getComputedStyle(e).backgroundColor)
      assert.equal(chosen, 'rgb(228, 150, 50)')
      await p.click(`${group(1)}[data-key="u"]`)
      assert.equal(await shownPage(1), '3')
      assert.deepEqual(await pressedKeys(1), ['u'])
      assert.equal(await chosenKey(1), 'u')
    })

    it('the other groups keep their own page', async () => {
      assert.deepEqual([await shownPage(0), await shownPage(2)], ['3', '3'])
      await pageSelect(0).selectOption('0')
      assert.deepEqual([await shownPage(0), await shownPage(1), await shownPage(2)], ['0', '3', '3'])
    })

    it('removing a group leaves each remaining group on its own page', async () => {
      await p.click(`${group(0)}[data-act="remove"]`)
      assert.equal(await p.locator('#color-by-digit-editor select[data-act="page"]').count(), 2)
      assert.deepEqual([await shownPage(0), await shownPage(1)], ['3', '3'])
      assert.equal(await chosenKey(0), 'u')
    })
  })

  it('the settings entry sits in the Experimental group under its plain name, and its dialog shows the version from the script header as small text', async () => {
    const group = await openSettings(p)
    const entry = group.locator('button').filter({ hasText: 'Color by digit' })
    assert.equal((await entry.textContent()).trim(), 'Color by digit')
    await entry.click()
    await editor().waitFor({ state: 'visible' })
    assert.equal((await p.locator('.dialog b').first().textContent()).trim(), 'Color by digit')
    assert.equal((await p.locator('.dialog small').textContent()).trim(), `v${headerVersion(script)}`)
    await closeWith('Cancel')
  })

  // Runs after the press tests: it calls refreshControls itself, which would bind this script's
  // button and hide whether installButton's own call does. Five buttons fit one row at 1200x900,
  // so the row wraps only once the stand-ins push it past SudokuPad's width limit.
  it('with another script\'s button in the row, the row still fits and the footer stays clear, and with enough more the row wraps to a second row', async () => {
    const own = (await settledLayout()).neighbours.length
    const add = (from, to) => read(([from, to]) => {
      for (let i = from; i < to; i++) Framework.addAuxButton({ name: `other${i}`, title: `Other ${i}`, content: '<div class="icon"><svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg></div>', onClick () {} })
      Framework.app.refreshControls()
    }, [from, to])
    const clear = () => read((count) => { for (let i = 0; i < count; i++) Framework.removeControlButton(`other${i}`) }, OTHER_BUTTONS)
    try {
      await add(0, 1)
      const one = await settledLayout()
      assert.equal(one.neighbours.length, own + 1)
      assert.equal(fits(one), true, JSON.stringify(one))
      await add(1, OTHER_BUTTONS)
      const many = await settledLayout()
      assert.equal(many.neighbours.length, own + OTHER_BUTTONS)
      assert.equal(many.row.height > many.undo.height * 1.5, true, JSON.stringify(many))
      assert.equal(fits(many), true, JSON.stringify(many))
    } finally {
      await clear()
    }
    assert.equal(await settle(async () => (await layout()).neighbours.length, own), own)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})
