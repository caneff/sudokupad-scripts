// Live check of Color by Digit's digit profile on sudokupad.app, in headless Chromium: "Sync digit profile with cell
// profile" unticked, so cells and digits take different profiles, and "Use digit colors" turning digit coloring off.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { allFillsOn, ARROW, BUTTON, coloredCountOn, DEFAULT_FILL, EDITOR, group, labelOn, MENU, MODE_STORAGE_KEY, ODD_EVEN, openSession, paintOn, pressTo, PROFILES_KEY, savedProfiles, shadeReaders, startInjected, watch } from './color-by-digit-fixtures.mjs'
import { closeDialogWith, openScriptDialog } from './settings.mjs'
import { settle } from './settle.mjs'

const script = readFileSync(new URL('../color-by-digit.user.js', import.meta.url), 'utf8')
const { shadeOn } = shadeReaders(createRequire(import.meta.url)('../color-by-digit.user.js'))

const CIRCLES = '#color-by-digit-circles'
const SYNC = `${EDITOR} input[data-role="sync"]`
const USE_DIGIT_COLORS = `${EDITOR} input[data-role="use-digit-colors"]`
// 1 to 5 on palette key 4, 8 and 9 on key 6. Its icon shows 3 and 9; Odd/Even's shows 5 and 4.
const SPLIT = [group('4', ['1', '2', '3', '4', '5']), group('6', ['8', '9'])]
const SPLIT_ICON = ['3', '9']
const ODD_EVEN_ICON = ['5', '4']
const TWO = [{ name: 'Split', groups: SPLIT }, { name: 'Odd/Even', groups: ODD_EVEN }]
// The given 5 at (0,0) and 6 at (1,0): Split colors the first with key 4 and leaves the second; Odd/Even gives keys 1 and 2.
const SPLIT_CELLS = [['4'], []]
const ODD_EVEN_CELLS = [['1'], ['2']]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

const tools = (p) => {
  const read = (fn, arg) => p.evaluate(fn, arg)
  const label = () => labelOn(p)
  const cells = () => read(() => [[0, 0], [1, 0]].map(([r, c]) => [...(Framework.app.grid.getCell(r, c).colours || [])]))
  const coloredCount = () => coloredCountOn(p)
  const undoSteps = () => read(() => Framework.app.puzzle.undoStack.length)
  const getState = () => read((key) => Framework.getData(key), PROFILES_KEY)
  const icon = () => p.$$eval(`${BUTTON} svg text`, (es) => es.map((e) => e.textContent))
  const shownCircles = () => read((sel) => [...document.querySelectorAll(sel + ' circle')].filter((c) => window.getComputedStyle(c.parentNode).display !== 'none').length, CIRCLES)
  const select = (r, c) => read(([r, c]) => { const a = Framework.app; a.deselect(); a.select(a.grid.getCell(r, c)) }, [r, c])
  const enter = async (r, c, digit) => { await select(r, c); await p.keyboard.press(digit) }
  const undo = () => p.click('#control-undo')
  const redo = () => p.click('#control-redo')
  const openMenu = async () => {
    await p.click(ARROW)
    await p.locator(MENU).waitFor({ state: 'visible' })
  }
  const closeMenu = async () => {
    await p.keyboard.press('Escape')
    await p.locator(MENU).waitFor({ state: 'detached' })
  }
  // Each pick row as `<target><index>`, with `*` on the marked one, and the menu's section headings.
  const menu = async () => {
    await openMenu()
    const rows = await p.$$eval(`${MENU} [data-act=pick]`, (es) => es.map((e) => `${e.dataset.target}${e.dataset.index}${e.getAttribute('aria-checked') === 'true' ? '*' : ''}`))
    const text = await p.locator(MENU).innerText()
    await closeMenu()
    return { rows, sections: ['Cells', 'Digits'].filter((s) => new RegExp(`^${s}$`, 'im').test(text)) }
  }
  const pick = async (target, index) => {
    await openMenu()
    await p.click(`${MENU} [data-act=pick][data-target="${target}"][data-index="${index}"]`)
    await p.locator(MENU).waitFor({ state: 'detached' })
  }
  const openEditor = () => openScriptDialog(p, 'Color by Digit', EDITOR)
  const save = () => closeDialogWith(p, 'Save', EDITOR)
  // Clicked, not checked: a click redraws the editor, so the box Playwright clicked is gone when it would look.
  const toggle = async (selector, want) => {
    await p.click(selector)
    assert.equal(await settle(() => p.locator(selector).isChecked(), want), want)
  }
  const modeChoice = () => p.$$eval(`${EDITOR} button[data-role="mode-draft"]`, (es) => es.map((e) => `${e.dataset.mode}${e.getAttribute('aria-checked') === 'true' ? '*' : ''}`))
  return { read, label, cells, coloredCount, undoSteps, getState, icon, shownCircles, enter, select, undo, redo, menu, pick, openEditor, save, toggle, modeChoice }
}

describe('the digit profile unsynced, saved synced in Both, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors, t
  const SHADE = {}
  const fill = (digit) => allFillsOn(p, 'entered', digit)

  before(async () => {
    ;({ context, p, errors } = await openSession(browser, script, { saved: { ...savedProfiles({ profiles: TWO, active: 0 }), [MODE_STORAGE_KEY]: 'both' } }))
    t = tools(p)
    for (const key of ['1', '2', '4']) SHADE[key] = await shadeOn(p, key)
    await t.enter(0, 2, '4')
  })
  after(async () => { await context.close() })

  it('synced, the menu is one list and the dialog\'s sync checkbox is ticked', async () => {
    assert.deepEqual(await t.menu(), { rows: ['cells0*', 'cells1'], sections: [] })
    await t.openEditor()
    assert.equal(await p.locator(SYNC).isChecked(), true)
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('unticking sync and saving changes no color on the board, and the menu shows Cells and Digits, each on Split', async () => {
    assert.deepEqual(await settle(t.cells, SPLIT_CELLS), SPLIT_CELLS)
    assert.deepEqual(await settle(fill('4'), [SHADE[4]]), [SHADE[4]])
    await t.openEditor()
    await t.toggle(SYNC, false)
    await t.save()
    assert.equal((await t.getState()).digitActive, 0)
    assert.deepEqual(await watch(t.cells), [SPLIT_CELLS])
    assert.deepEqual(await watch(fill('4')), [[SHADE[4]]])
    assert.deepEqual(await t.menu(), { rows: ['cells0*', 'cells1', 'digits0*', 'digits1'], sections: ['Cells', 'Digits'] })
  })

  it('a Cells pick recolors the cells, not the digits, as one undo step', async () => {
    // Opening and closing the menu first takes SudokuPad's own deselect step, so the one undo below is the pick's.
    await t.menu()
    await t.pick('cells', 1)
    assert.deepEqual(await settle(t.cells, ODD_EVEN_CELLS), ODD_EVEN_CELLS)
    assert.deepEqual(await watch(fill('4')), [[SHADE[4]]])
    await t.undo()
    assert.deepEqual(await settle(t.cells, SPLIT_CELLS), SPLIT_CELLS)
    await t.redo()
    assert.deepEqual(await settle(t.cells, ODD_EVEN_CELLS), ODD_EVEN_CELLS)
    assert.deepEqual(await t.menu(), { rows: ['cells0', 'cells1*', 'digits0*', 'digits1'], sections: ['Cells', 'Digits'] })
  })

  it('a Digits pick recolors the digits, not the cells, and adds no undo step', async () => {
    await t.pick('cells', 0)
    assert.deepEqual(await settle(t.cells, SPLIT_CELLS), SPLIT_CELLS)
    const steps = await t.undoSteps()
    await t.pick('digits', 1)
    assert.deepEqual(await settle(fill('4'), [SHADE[2]]), [SHADE[2]])
    assert.deepEqual(await watch(t.cells), [SPLIT_CELLS])
    assert.equal(await t.undoSteps(), steps)
  })

  it('a Digits pick leaves alone a cell painted or unpainted by hand, and a pending redo', async () => {
    // A group color painted by hand on the empty (4,4), and the group color taken off the given 5 at (0,0) by hand.
    const HAND = [[4, 4], [0, 0]]
    const handColors = () => t.read((list) => list.map(([r, c]) => [...(Framework.app.grid.getCell(r, c).colours || [])]), HAND)
    const redoSteps = () => t.read(() => Framework.app.puzzle.redoStack.length)
    const valueAt = (r, c) => t.read(([r, c]) => String(Framework.app.grid.getCell(r, c).value || ''), [r, c])
    await paintOn(p, 4, 4, '4')
    await paintOn(p, 0, 0, '4')
    assert.deepEqual(await settle(handColors, [['4'], []]), [['4'], []])
    await t.enter(2, 0, '7')
    assert.equal(await settle(() => valueAt(2, 0), '7'), '7')
    await t.undo()
    assert.equal(await settle(() => valueAt(2, 0), ''), '')
    const redo = await redoSteps()
    assert.ok(redo > 0)
    await t.pick('digits', 0)
    assert.deepEqual(await settle(fill('4'), [SHADE[4]]), [SHADE[4]])
    assert.deepEqual(await watch(handColors), [[['4'], []]])
    assert.equal(await redoSteps(), redo)
    await t.redo()
    assert.equal(await settle(() => valueAt(2, 0), '7'), '7')
    // Back as the next test starts it: digits on Odd/Even, and the hand changes undone by hand.
    await t.pick('digits', 1)
    await paintOn(p, 4, 4, '4')
    await paintOn(p, 0, 0, '4')
    assert.deepEqual(await settle(t.cells, SPLIT_CELLS), SPLIT_CELLS)
  })

  it('in Both, cells on Split and digits on Odd/Even, the icon shows the cell profile', async () => {
    assert.equal(await t.label(), 'BOTH')
    assert.deepEqual(await t.cells(), SPLIT_CELLS)
    assert.deepEqual(await fill('4')(), [SHADE[2]])
    assert.deepEqual(await t.icon(), SPLIT_ICON)
  })

  it('in Digit, the icon shows the digit profile, and in Cell and Off the cell profile', async () => {
    await pressTo(p, 'OFF')
    assert.deepEqual(await t.icon(), SPLIT_ICON)
    await pressTo(p, 'CELL')
    assert.deepEqual(await t.icon(), SPLIT_ICON)
    await pressTo(p, 'DIGIT')
    assert.deepEqual(await t.icon(), ODD_EVEN_ICON)
    assert.deepEqual(await settle(fill('4'), [SHADE[2]]), [SHADE[2]])
    assert.equal(await settle(t.coloredCount, 0), 0)
  })

  it('a reload keeps both picks', async () => {
    await p.reload({ waitUntil: 'load' })
    await startInjected(p, script)
    assert.equal(await t.label(), 'DIGIT')
    assert.deepEqual(await t.icon(), ODD_EVEN_ICON)
    assert.deepEqual(await t.menu(), { rows: ['cells0*', 'cells1', 'digits0', 'digits1*'], sections: ['Cells', 'Digits'] })
  })

  it('ticking sync again makes the digits take the cell profile, and the menu is one list again', async () => {
    assert.deepEqual(await settle(fill('4'), [SHADE[2]]), [SHADE[2]])
    await t.openEditor()
    await t.toggle(SYNC, true)
    await t.save()
    assert.deepEqual(await settle(fill('4'), [SHADE[4]]), [SHADE[4]])
    assert.deepEqual(await t.icon(), SPLIT_ICON)
    assert.deepEqual(await t.menu(), { rows: ['cells0*', 'cells1'], sections: [] })
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

describe('"Use digit colors" turned off and on, saved unsynced in Both, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors, t
  const SHADE = {}
  const fill = (digit) => allFillsOn(p, 'entered', digit)

  before(async () => {
    ;({ context, p, errors } = await openSession(browser, script, { saved: { ...savedProfiles({ profiles: TWO, active: 0, digitActive: 1 }), [MODE_STORAGE_KEY]: 'both' } }))
    t = tools(p)
    for (const key of ['1', '2']) SHADE[key] = await shadeOn(p, key)
    await t.enter(0, 2, '4')
    // A corner 5 beside the given 5 in row 1: a mark in SudokuPad's conflict state.
    await p.click('#control-corner')
    await t.enter(0, 5, '5')
    await p.click('#control-normal')
  })
  after(async () => { await context.close() })

  it('on, in Both: digits on Odd/Even and the conflicting mark circled', async () => {
    assert.deepEqual(await settle(fill('4'), [SHADE[2]]), [SHADE[2]])
    assert.equal(await settle(t.shownCircles, 1), 1)
  })

  it('the checkbox sits at the top of the dialog; unticked, the mode choice is Cell and Off with Both fallen back to Cell, and the sync checkbox hides', async () => {
    await t.openEditor()
    const order = await p.$$eval(`${EDITOR} input`, (es) => es.map((e) => e.dataset.role))
    assert.equal(order[0], 'use-digit-colors')
    assert.equal(await p.locator(USE_DIGIT_COLORS).isChecked(), true)
    assert.deepEqual(await t.modeChoice(), ['cell', 'digit', 'both*', 'off'])
    assert.equal(await p.locator(SYNC).count(), 1)
    await t.toggle(USE_DIGIT_COLORS, false)
    assert.deepEqual(await t.modeChoice(), ['cell*', 'off'])
    assert.equal(await p.locator(SYNC).count(), 0)
    await t.save()
  })

  it('saved off from Both: the mode is Cell, cells keep their colors, and no digit color or conflict circle shows', async () => {
    assert.equal(await settle(t.label, 'CELL'), 'CELL')
    assert.deepEqual(await watch(t.cells), [SPLIT_CELLS])
    assert.deepEqual(await settle(fill('4'), [DEFAULT_FILL]), [DEFAULT_FILL])
    assert.equal(await settle(t.shownCircles, 0), 0)
  })

  it('off, the menu is one list with no Digits section', async () => {
    assert.deepEqual(await t.menu(), { rows: ['cells0*', 'cells1'], sections: [] })
  })

  it('off, a press steps Cell to Off and back to Cell', async () => {
    await pressTo(p, 'OFF')
    await pressTo(p, 'CELL')
    await pressTo(p, 'OFF')
    await pressTo(p, 'CELL')
  })

  it('a reload keeps it off', async () => {
    await p.reload({ waitUntil: 'load' })
    await startInjected(p, script)
    assert.equal(await t.label(), 'CELL')
    assert.deepEqual(await t.menu(), { rows: ['cells0*', 'cells1'], sections: [] })
    assert.deepEqual(await watch(fill('4')), [[DEFAULT_FILL]])
  })

  it('ticked again: the four modes, the sync checkbox unticked, and both picks as they were', async () => {
    await t.openEditor()
    await t.toggle(USE_DIGIT_COLORS, true)
    assert.deepEqual(await t.modeChoice(), ['cell*', 'digit', 'both', 'off'])
    assert.equal(await p.locator(SYNC).isChecked(), false)
    await t.save()
    assert.deepEqual(await t.menu(), { rows: ['cells0*', 'cells1', 'digits0', 'digits1*'], sections: ['Cells', 'Digits'] })
    await pressTo(p, 'DIGIT')
    assert.deepEqual(await settle(fill('4'), [SHADE[2]]), [SHADE[2]])
    assert.equal(await settle(t.shownCircles, 1), 1)
  })

  it('unticked while in Digit, the mode falls back to Off and the digits lose their color', async () => {
    await t.openEditor()
    await t.toggle(USE_DIGIT_COLORS, false)
    assert.deepEqual(await t.modeChoice(), ['cell', 'off*'])
    await t.save()
    assert.equal(await settle(t.label, 'OFF'), 'OFF')
    assert.deepEqual(await settle(fill('4'), [DEFAULT_FILL]), [DEFAULT_FILL])
    assert.equal(await settle(t.shownCircles, 0), 0)
    assert.equal(await t.coloredCount(), 0)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})
