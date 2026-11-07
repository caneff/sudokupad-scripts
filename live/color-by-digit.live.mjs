// Live check of color-by-digit.user.js on sudokupad.app, in headless Chromium.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { startPuzzle } from './page.mjs'
import { BUTTON, coloredCountOn, EDITOR, GIVENS, labelOn, openSession, paintOn, pressTo, PROFILES_KEY, SEED, watch } from './color-by-digit-fixtures.mjs'
import { closeDialogWith, headerVersion, openScriptDialog, openSettings } from './settings.mjs'
import { settle, SETTLE_MS } from './settle.mjs'

const script = readFileSync(new URL('../color-by-digit.user.js', import.meta.url), 'utf8')

const GIVEN_COUNT = [...GIVENS].filter((d) => d !== '0').length
// Two entered digits sit on empty cells: r1c3 = 4, r1c4 = 7.
const ENTERED = { '0,2': '4', '0,3': '7' }
const DIGIT_CELLS = GIVEN_COUNT + Object.keys(ENTERED).length

// How often settledLayout re-reads the controls, and how far a bottom edge may overlap the footer's top.
const LAYOUT_POLL_MS = 250
const FIT_SLACK_PX = 1
// How many stand-in buttons another script's row gets in the wrap test; enough to fill a second row.
const OTHER_BUTTONS = 8

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
  const coloredCount = () => coloredCountOn(p)
  const colorsAt = async (r, c) => at(await cellsState(), r, c).colours
  const digitsOnBoard = async () => (await cellsState()).map((x) => [x.given, x.value])
  const getData = () => read((key) => Framework.getData(key), PROFILES_KEY)
  const getGroups = () => read((key) => { const d = Framework.getData(key); return d.profiles[d.active].groups }, PROFILES_KEY)
  const getSetting = () => read(() => Framework.getSetting('multicolour'))
  const editor = () => p.locator(EDITOR)

  const expectedColours = (keyOfDigit) => (x) => {
    const digit = ENTERED[`${x.r},${x.c}`] || GIVENS[x.r * 9 + x.c]
    return digit === '0' ? [] : [keyOfDigit(digit)]
  }
  const oddEven = expectedColours((d) => (Number(d) % 2 ? '1' : '2'))
  const lowFiveHigh = expectedColours((d) => (Number(d) < 5 ? '1' : d === '5' ? '5' : '9'))
  const wrongCount = async (expected) => (await cellsState()).filter((x) => JSON.stringify(x.colours) !== JSON.stringify(expected(x))).length

  const boot = async () => {
    await startPuzzle(p, { injection: { mode: 'after-start', code: script } })
    await p.locator(BUTTON).waitFor({ state: 'attached' })
  }
  const label = () => labelOn(p)
  const undo = () => p.click('#control-undo')
  const redo = () => p.click('#control-redo')
  const select = (r, c) => read(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [r, c])
  const paint = (r, c, key) => paintOn(p, r, c, key)
  const setMultiColor = (v) => read((v) => Framework.setSetting('multicolour', v), v)
  const openEditor = () => openScriptDialog(p, 'Color by Digit', EDITOR)

  before(async () => {
    ;({ context, p, errors } = await openSession(browser, script))
  })
  after(async () => { await context.close() })

  it('the board holds the givens in GIVENS', async () => {
    const board = (await cellsState()).map((x) => x.given || '0').join('')
    assert.equal(board, GIVENS)
  })

  const layout = () => read((button) => {
    const box = (e) => e.getBoundingClientRect().toJSON()
    // SudokuPad's footer is a bare element with no id or class; find it by its credit line.
    const footer = [...document.querySelectorAll('*')].find((e) => e.children.length < 4 && /Created by/.test(e.textContent) && e.textContent.length < 200)
    return {
      button: box(document.querySelector(button)),
      undo: box(document.querySelector('#control-undo')),
      row: box(document.querySelector('.controls-aux')),
      footer: box(footer),
      neighbours: [...document.querySelector('.controls-aux').children].map((e) => e.id),
      view: { width: window.innerWidth, height: window.innerHeight }
    }
  }, BUTTON)
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

  // The first press of the run, before any dialog has opened: a press the script never hears fails here.
  it('a press steps to Cell and colors every given and entered digit by Odd/Even, nothing else', async () => {
    await pressTo(p, 'CELL')
    assert.equal(await settle(() => wrongCount(oddEven), 0), 0)
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

  it('one undo reverses the whole step to Cell and leaves digits alone', async () => {
    await undo()
    assert.equal(await settle(coloredCount, 0), 0)
    assert.equal(JSON.stringify(await digitsOnBoard()), baseline)
  })

  it('one redo restores the whole step to Cell', async () => {
    await redo()
    assert.equal(await settle(coloredCount, DIGIT_CELLS), DIGIT_CELLS)
  })

  it('a second press steps to Digit and takes every color off the cells in one undo step', async () => {
    await pressTo(p, 'DIGIT')
    assert.equal(await settle(coloredCount, 0), 0)
    assert.equal(JSON.stringify(await digitsOnBoard()), baseline)
    await undo()
    assert.equal(await settle(() => wrongCount(oddEven), 0), 0)
    await undo()
    assert.equal(await settle(coloredCount, 0), 0)
  })

  describe('Multi-color', { concurrency: false }, () => {
    after(async () => { await setMultiColor(true) })

    it('on: the group color stacks on the existing one, and undo returns the cell to its own', async () => {
      await setMultiColor(true)
      await paint(0, 0, '3')
      assert.deepEqual(await settle(() => colorsAt(0, 0), ['3']), ['3'])
      await pressTo(p, 'BOTH')
      assert.deepEqual((await settle(async () => [...await colorsAt(0, 0)].sort(), ['1', '3'])), ['1', '3'])
      await undo()
      assert.deepEqual(await settle(() => colorsAt(0, 0), ['3']), ['3'])
      // Nothing to take off, so stepping back to Off adds no undo step.
      await pressTo(p, 'OFF')
      assert.deepEqual(await watch(() => colorsAt(0, 0)), [['3']])
    })

    it('off: the group color replaces the existing one, and stepping to Digit takes the cell\'s color off', async () => {
      await setMultiColor(false)
      assert.equal(await getSetting(), false)
      await pressTo(p, 'CELL')
      assert.deepEqual(await settle(() => colorsAt(0, 0), ['1']), ['1'])
      assert.equal(await settle(() => wrongCount(oddEven), 0), 0)
      await pressTo(p, 'DIGIT')
      assert.equal(await settle(coloredCount, 0), 0)
      await undo()
      assert.equal(await settle(() => wrongCount(oddEven), 0), 0)
      await undo()
      assert.deepEqual(await settle(() => colorsAt(0, 0), ['3']), ['3'])
      assert.equal(await coloredCount(), 1)
    })
  })

  it('the settings entry opens the editor with two groups', async () => {
    await openEditor()
    assert.equal(await p.locator(`${EDITOR} button[data-act=digit][data-digit="1"]`).count(), 2)
  })

  it('the palette is read from the CSS variables: three pages of 9 visible swatches, 27 in all', async () => {
    const select = p.locator(`${EDITOR} select[data-act="page"][data-group="0"]`)
    const seen = []
    for (const value of ['0', '1', '2']) {
      await select.selectOption(value)
      seen.push(await p.$$eval(`${EDITOR} button[data-act=color][data-group="0"]`, (es) => es.map((e) => window.getComputedStyle(e).backgroundColor)))
    }
    assert.deepEqual(seen.map((page) => page.length), [9, 9, 9])
    assert.equal(seen.flat().filter((bg) => bg === 'rgba(0, 0, 0, 0)').length, 0)
  })

  it('assigning a digit moves it out of its other group, and the dialog stays open', async () => {
    const weights = () => p.$$eval(`${EDITOR} button[data-act=digit][data-digit="1"]`, (es) => es.map((e) => e.style.fontWeight))
    assert.deepEqual(await weights(), ['bold', 'normal'])
    await p.click(`${EDITOR} button[data-act=digit][data-group="1"][data-digit="1"]`)
    assert.deepEqual(await weights(), ['normal', 'bold'])
    assert.equal(await editor().count(), 1)
  })

  it('Cancel saves nothing', async () => {
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.deepEqual(await getData(), SEED)
  })

  describe('saved groups', { concurrency: false }, () => {
    it('Save with Low/5/High made the active profile writes it and closes the dialog', async () => {
      await openEditor()
      await p.click(`${EDITOR} [data-act=tag-cells][data-index="1"]`)
      await closeDialogWith(p, 'Save', EDITOR)
      const expected = { ...SEED, active: 1 }
      assert.deepEqual(await settle(getData, expected), expected)
    })

    it('the saved list, the mode and the button survive a reload, and a step to Both uses the saved list', async () => {
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
      assert.equal(await label(), 'DIGIT')
      await pressTo(p, 'BOTH')
      assert.equal(await settle(() => wrongCount(lowFiveHigh), 0), 0)
      assert.equal(await coloredCount() > 0, true)
      await undo()
      assert.equal(await settle(coloredCount, 0), 0)
      await pressTo(p, 'OFF')
    })

    // Saved groups are Low/5/High here, so centre marks 6, 7 and 9 all belong to key 9.
    it('a step to Cell also colors an empty cell whose centre marks fit one group, leaves one spanning two groups, and one undo removes it', async () => {
      await select(8, 0); await p.click('#control-centre')
      for (const k of ['6', '7', '9']) await p.keyboard.press(k)
      await select(8, 1)
      for (const k of ['1', '7']) await p.keyboard.press(k)
      await p.click('#control-normal')
      const marks = () => read(() => [[8, 0], [8, 1]].map(([r, c]) => Framework.app.grid.getCell(r, c).propGet('centre').join('')))
      assert.deepEqual(await settle(marks, ['679', '17']), ['679', '17'])
      await pressTo(p, 'CELL')
      assert.equal(await settle(coloredCount, DIGIT_CELLS + 1), DIGIT_CELLS + 1)
      const s = await cellsState()
      assert.deepEqual(at(s, 8, 0).colours, ['9'])
      assert.deepEqual(at(s, 8, 1).colours, [])
      assert.equal(await wrongCount((x) => (x.r === 8 && x.c === 0 ? ['9'] : lowFiveHigh(x))), 0)
      await undo()
      assert.equal(await settle(coloredCount, 0), 0)
      await pressTo(p, 'DIGIT')
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
        const boxes = await p.locator(`${EDITOR} button[data-act=remove]`).evaluateAll((els) => els.map((x) => {
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
        await closeDialogWith(p, 'Cancel', EDITOR)
      }
      await p.setViewportSize({ width: 1200, height: 900 })
    })

    it('Add group adds a group in a color no group has, and Cancel drops it', async () => {
      await openEditor()
      const chosenKeys = () => p.$$eval(`${EDITOR} select[data-act="page"] + [data-role="chosen"]`, (es) => es.map((e) => e.title))
      const before = await chosenKeys()
      assert.equal(before.length, 3)
      await p.click(`${EDITOR} button[data-act=add-group]`)
      const after = await chosenKeys()
      assert.equal(after.length, 4)
      assert.deepEqual(after.slice(0, 3), before)
      assert.equal(before.includes(after[3]), false)
      await closeDialogWith(p, 'Cancel', EDITOR)
      assert.equal((await getGroups()).length, 3)
    })

    it('Clear all empties the dialog, Cancel restores the saved groups, Save keeps the empty list, and a step to Both colors nothing', async () => {
      await openEditor()
      const groupCount = () => p.locator(`${EDITOR} button[data-act=remove]`).count()
      assert.equal(await groupCount(), 3)
      assert.equal(await p.locator(`${EDITOR} [data-role=profile-row]`).count(), 2)
      await p.click(`${EDITOR} button[data-act=clear]`)
      assert.equal(await groupCount(), 0)
      await closeDialogWith(p, 'Cancel', EDITOR)
      assert.equal((await getGroups()).length, 3)
      await openEditor()
      assert.equal(await groupCount(), 3)
      await p.click(`${EDITOR} button[data-act=clear]`)
      await closeDialogWith(p, 'Save', EDITOR)
      assert.deepEqual(await settle(getGroups, []), [])
      assert.equal((await getData()).active, 1)
      await pressTo(p, 'BOTH')
      // "Nothing happened": no cell gets a color.
      assert.deepEqual(await watch(coloredCount), [0])
    })
  })

  // A custom palette, with page 4 current: page 1 has a color at index 0 and a transparent index 4,
  // and a fourth page of four colors: u and v on keys the default palette lacks, w on a color the browser cannot draw. Three saved
  // groups: key 8 (on pages 1 and 4), key 6 (on page 1) and key nope (on none).
  describe('custom palette', { concurrency: false }, () => {
    const group = (g) => `${EDITOR} [data-group="${g}"]`
    const pageSelect = (g) => p.locator(`${group(g)}[data-act="page"]`)
    const shownPage = (g) => pageSelect(g).inputValue()
    const labels = (g) => p.$$eval(`${group(g)}[data-act="page"] option`, (es) => es.map((e) => e.textContent))
    const swatchKeys = (g) => p.$$eval(`${group(g)}[data-act="color"]`, (es) => es.map((e) => e.dataset.key))
    const pressedKeys = (g) => p.$$eval(`${group(g)}[aria-pressed="true"]`, (es) => es.map((e) => e.dataset.key))
    const chosenKey = (g) => p.locator(`${group(g)}[data-act="page"] + [data-role="chosen"]`).getAttribute('title')
    const boxOf = (g, key) => p.locator(`${EDITOR} button[data-group="${g}"][data-key="${key}"]`).evaluate((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) } })
    let original, savedState

    before(async () => {
      savedState = await getData()
      original = await read(() => JSON.parse(JSON.stringify(Framework.app.tools.colour.palette)))
      await read(([original, profilesKey]) => {
        const palette = JSON.parse(JSON.stringify(original))
        palette.colors.u = 'rgb(10, 20, 30)'
        palette.colors.v = 'rgb(40, 50, 60)'
        palette.colors.w = 'notacolor'
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
      if (await editor().count()) await closeDialogWith(p, 'Cancel', EDITOR)
    })

    it('the pulldown lists four pages and marks SudokuPad\'s current page', async () => {
      assert.deepEqual(await labels(0), ['Page 1', 'Page 2', 'Page 3', 'Page 4 (current)'])
    })

    it('each group opens on the page holding its color, the current page first, and the current page with no color', async () => {
      assert.deepEqual([await shownPage(0), await shownPage(1), await shownPage(2)], ['3', '0', '3'])
    })

    it('a group shows one 3 by 3 page: nine or ten swatches, not every page', async () => {
      assert.equal((await swatchKeys(1)).length, 9)
      assert.equal((await swatchKeys(0)).length, 3)
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

    it('shows the fourth page, with its index 0 below, and an empty slot where the palette holds a color the browser cannot draw', async () => {
      assert.deepEqual(await swatchKeys(0), ['v', '8', 'u'])
      // Index 2 holds 'w', whose color is 'notacolor': its slot stays empty and 8 stays at index 3.
      const grid = await pageSelect(0).evaluate((e) => [...e.parentElement.nextElementSibling.children].map((c) => c.dataset.key || c.dataset.empty))
      assert.deepEqual(grid, ['v', 'slot', '8', 'slot', 'slot', 'slot', 'slot', 'slot', 'slot'])
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
      assert.equal(await p.locator(`${EDITOR} select[data-act="page"]`).count(), 2)
      assert.deepEqual([await shownPage(0), await shownPage(1)], ['3', '3'])
      assert.equal(await chosenKey(0), 'u')
    })
  })

  it('the settings entry sits in the Experimental group under its plain name, and its dialog shows the version from the script header as small text', async () => {
    const group = await openSettings(p)
    const entry = group.locator('button').filter({ hasText: 'Color by Digit' })
    assert.equal((await entry.textContent()).trim(), 'Color by Digit')
    await entry.click()
    await editor().waitFor({ state: 'visible' })
    assert.equal((await p.locator('.dialog b').first().textContent()).trim(), 'Color by Digit')
    assert.equal((await p.locator('.dialog small').textContent()).trim(), `v${headerVersion(script)}`)
    await closeDialogWith(p, 'Cancel', EDITOR)
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
