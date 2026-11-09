// Live check of Color by Digit's profiles on sudokupad.app, in headless Chromium: the profile menu on
// the button, switching profile, the button's icon, the dialog's profile list, and migration.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ADDED_PRELOADS_STORAGE_KEY, deleteProfileRow, DROP_PAST_MIDDLE_PX, PROFILE_NAME_FIELD, PROFILE_ROWS, ARROW, BUTTON, buttonPoint, center, coloredCountOn, EDITOR, group, groupCountOn, labelOn, MENU, pressTo, LEGACY_STORAGE_KEY, ROW_CORNER, LOW_FIVE_HIGH, MODE_STORAGE_KEY, ODD_EVEN, openSession, PROFILES_KEY, PROFILES_STORAGE_KEY, SEED, savedProfiles, savedState, watch, cellsStateOn, selectCell, wrongCountOn, reloadSession } from './color-by-digit-fixtures.mjs'
import { closeDialogWith, openScriptDialog } from '../settings.mjs'
import { settle, SETTLE_MS } from '../settle.mjs'
import { scriptSource, useBrowser } from '../session.mjs'

const script = scriptSource('color-by-digit.user.js')

const ROWS = PROFILE_ROWS
// A row's × shows only while its row is hovered or selected, so the pointer goes onto the row first.
const deleteRow = deleteProfileRow
const HOLD_MS = 500

const FOUR = [group('1', ['1', '2']), group('3', ['3', '4']), group('5', ['5', '6']), group('9', ['7', '8', '9'])]
const SIX = ['1', '2', '3', '5', '7', '9'].map((key, i) => group(key, [String(i)]))
// Four profiles of two to six groups, to show the icon with two, three and more than three groups: Odd/Even active.
const FOUR_PROFILES = {
  profiles: [...SEED.profiles, { name: 'Four', groups: FOUR }, { name: 'Six', groups: SIX }],
  active: 0
}

const browser = useBrowser()

// With no mode saved the page starts in Cell; `savedOff` saves the mode Off beside `saved`.
const openProfiles = (saved, contextOptions = {}) => openSession(browser(), script, { saved, contextOptions })
const savedOff = (saved) => ({ ...saved, [MODE_STORAGE_KEY]: 'off' })

const tools = (p) => {
  const read = (fn, arg) => p.evaluate(fn, arg)
  const cellsState = () => cellsStateOn(p)
  const coloredCount = () => coloredCountOn(p)
  const coloursOf = async () => JSON.stringify((await cellsState()).map((x) => x.colours))
  const wrongCount = (groups) => wrongCountOn(p, groups)
  const getState = async () => savedState(await read((key) => Framework.getData(key), PROFILES_KEY))
  const names = async () => (await getState()).profiles.map((x) => x.name)
  const valueAt = (r, c) => read(([r, c]) => String(Framework.app.grid.getCell(r, c).value || ''), [r, c])
  const undo = () => p.click('#control-undo')
  const menu = () => p.locator(MENU)
  const menuRows = () => p.$$eval(`${MENU} [data-act=pick]`, (es) => es.map((e) => ({ name: e.querySelector('[data-role=name]').textContent, active: e.getAttribute('aria-checked') === 'true' })))
  const iconShownDigits = () => p.$$eval(`${BUTTON} svg text`, (es) => es.map((e) => e.textContent))
  const editor = () => p.locator(EDITOR)
  const openEditor = () => openScriptDialog(p, 'Color by Digit', EDITOR)
  const rowNames = () => p.$$eval(ROWS, (rows) => rows.map((r) => r.getAttribute('aria-label')))
  const selectedRow = () => p.$$eval(ROWS, (es) => es.findIndex((e) => e.getAttribute('aria-checked') === 'true'))
  const cellProfile = () => p.locator(`${EDITOR} select[data-role=cell-profile]`).inputValue()
  const pulldownNames = (role) => p.$$eval(`${EDITOR} select[data-role=${role}] option`, (es) => es.map((e) => e.textContent))
  const label = () => labelOn(p)
  const openMenuByArrow = async () => {
    await p.click(ARROW)
    await menu().waitFor({ state: 'visible' })
  }
  const pick = async (name) => {
    await p.locator(`${MENU} [data-act=pick]`).filter({ hasText: name }).click()
    await menu().waitFor({ state: 'detached' })
  }
  return { read, cellsState, coloredCount, coloursOf, wrongCount, getState, names, valueAt, undo, menu, menuRows, iconShownDigits, editor, openEditor, rowNames, selectedRow, cellProfile, pulldownNames, label, openMenuByArrow, pick }
}

describe('profiles on a fresh install, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors, t

  before(async () => {
    ({ context, p, errors } = await openProfiles({}))
    t = tools(p)
  })
  after(async () => { await context.close() })

  it('the menu lists the five preloads, Low/5/High highlighted, with no heading', async () => {
    await t.openMenuByArrow()
    assert.deepEqual(await t.menuRows(), [{ name: 'Low/5/High', active: true }, { name: 'Odd/Even', active: false }, { name: 'Entropic', active: false }, { name: 'Modular', active: false }, { name: 'Each digit', active: false }])
    assert.doesNotMatch(await t.menu().innerText(), /color by digit profile/i)
    assert.match(await t.menu().innerText(), /Edit profiles…/)
    await p.keyboard.press('Escape')
  })

  it('a fresh install starts in Cell and colors every given by Low/5/High, as the active profile', async () => {
    assert.equal(await t.label(), 'Cell')
    assert.equal(await settle(() => t.wrongCount(LOW_FIVE_HIGH), 0), 0)
    assert.notEqual(await t.coloredCount(), 0)
  })

  it('a fresh install has nothing saved, and a pick saves the profiles', async () => {
    assert.equal(await t.getState(), null)
    await t.openMenuByArrow()
    await t.pick('Odd/Even')
    assert.deepEqual((await t.getState()).profiles.map((x) => x.name), ['Low/5/High', 'Odd/Even', 'Entropic', 'Modular', 'Each digit'])
    assert.equal((await t.getState()).active, 1)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

describe('migration from saved groups, injected after Start Puzzle', { concurrency: false }, () => {
  // `rows` are the menu's rows after the migration.
  const migrate = async (groups, rows, expectedDigits) => {
    const { context, p, errors } = await openProfiles({ [LEGACY_STORAGE_KEY]: groups })
    try {
      const t = tools(p)
      await t.openMenuByArrow()
      assert.deepEqual(await t.menuRows(), rows)
      assert.deepEqual(await t.iconShownDigits(), expectedDigits)
      await p.keyboard.press('Escape')
      // Nothing saved is lost: the groups are still where they were, and a switch writes the new key.
      assert.deepEqual(JSON.parse(await p.evaluate((k) => window.localStorage.getItem(k), LEGACY_STORAGE_KEY)), groups)
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  }

  it('saved groups equal to a preload make that preload the active profile, beside the other preloads', async () => {
    await migrate(ODD_EVEN, [{ name: 'Low/5/High', active: false }, { name: 'Odd/Even', active: true }, { name: 'Entropic', active: false }, { name: 'Modular', active: false }, { name: 'Each digit', active: false }], ['5', '4'])
  })

  it('saved groups equal to no preload become the active profile named Custom, first, beside the five preloads', async () => {
    await migrate([group('3', ['2', '4']), group('7', ['9'])], [{ name: 'Custom', active: true }, { name: 'Low/5/High', active: false }, { name: 'Odd/Even', active: false }, { name: 'Entropic', active: false }, { name: 'Modular', active: false }, { name: 'Each digit', active: false }], ['2', '9'])
  })
})

describe('the one-time adds of Entropic and Modular, then Each digit, to an install with saved profiles', { concurrency: false }, () => {
  const OLD_TWO = { profiles: [{ name: 'Low/5/High', groups: LOW_FIVE_HIGH }, { name: 'Odd/Even', groups: ODD_EVEN }], active: 1 }
  const open = async (saved, body) => {
    const { context, p, errors } = await openProfiles(saved)
    try {
      await body(p, tools(p))
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  }

  it('appends Entropic, Modular and Each digit after the old two, leaves the active profile alone, and saves them', async () => {
    await open({ [PROFILES_STORAGE_KEY]: OLD_TWO }, async (p, t) => {
      await t.openMenuByArrow()
      assert.deepEqual(await t.menuRows(), [{ name: 'Low/5/High', active: false }, { name: 'Odd/Even', active: true }, { name: 'Entropic', active: false }, { name: 'Modular', active: false }, { name: 'Each digit', active: false }])
      assert.deepEqual((await t.getState()).profiles.map((x) => x.name), ['Low/5/High', 'Odd/Even', 'Entropic', 'Modular', 'Each digit'])
      assert.equal((await t.getState()).active, 1)
    })
  })

  it('an install with Custom and a fourth profile of its own gets Entropic and Modular added after them, to six, and no room is left for Each digit', async () => {
    const custom = { profiles: [{ name: 'Custom', groups: [group('3', ['2'])] }, ...OLD_TWO.profiles, { name: 'Four', groups: FOUR }], active: 0 }
    await open({ [PROFILES_STORAGE_KEY]: custom }, async (p, t) => {
      assert.deepEqual(await t.names(), ['Custom', 'Low/5/High', 'Odd/Even', 'Four', 'Entropic', 'Modular'])
      assert.equal((await t.getState()).active, 0)
    })
  })

  it('picking Modular colors the grid\'s digits in its three groups', async () => {
    await open({ [PROFILES_STORAGE_KEY]: OLD_TWO }, async (p, t) => {
      await settle(t.names, ['Low/5/High', 'Odd/Even', 'Entropic', 'Modular', 'Each digit'])
      await t.openMenuByArrow()
      await t.pick('Modular')
      const modular = [group('6', ['1', '4', '7']), group('5', ['2', '5', '8']), group('8', ['0', '3', '6', '9'])]
      assert.equal(await settle(() => t.wrongCount(modular), 0), 0)
      assert.notEqual(await t.coloredCount(), 0)
    })
  })

  it('a profile deleted afterwards stays deleted across a reload', async () => {
    await open({ [PROFILES_STORAGE_KEY]: OLD_TWO }, async (p, t) => {
      const all = ['Low/5/High', 'Odd/Even', 'Entropic', 'Modular', 'Each digit']
      assert.deepEqual(await settle(t.names, all), all)
      await t.openEditor()
      await deleteRow(p, 3)
      await deleteRow(p, 4)
      await closeDialogWith(p, 'Save', EDITOR)
      assert.deepEqual(await settle(t.names, ['Low/5/High', 'Odd/Even', 'Modular']), ['Low/5/High', 'Odd/Even', 'Modular'])
      await reloadSession(p, script)
      assert.deepEqual(await t.names(), ['Low/5/High', 'Odd/Even', 'Modular'])
    })
  })

  // An install that already had Entropic and Modular offered, from before Each digit existed.
  it('an install that had Entropic and Modular offered gets Each digit appended once, alone', async () => {
    await open({ [PROFILES_STORAGE_KEY]: OLD_TWO, [ADDED_PRELOADS_STORAGE_KEY]: true }, async (p, t) => {
      assert.deepEqual(await settle(t.names, ['Low/5/High', 'Odd/Even', 'Each digit']), ['Low/5/High', 'Odd/Even', 'Each digit'])
      assert.equal((await t.getState()).active, 1)
    })
  })

  it('a profile that already has Each digit\'s groups, under any name, keeps it from being added', async () => {
    const nine = [['1', 'j'], ['2', 'e'], ['3', 'h'], ['4', 'm'], ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9']].map(([d, key]) => group(key, [d]))
    const mine = { profiles: [...OLD_TWO.profiles, { name: 'Mine', groups: nine }], active: 2 }
    await open({ [PROFILES_STORAGE_KEY]: mine, [ADDED_PRELOADS_STORAGE_KEY]: true }, async (p, t) => {
      assert.deepEqual(await watch(t.names), [['Low/5/High', 'Odd/Even', 'Mine']])
    })
  })
})

describe('saved profiles that cannot be read, injected after Start Puzzle', { concurrency: false }, () => {
  // A shape this version cannot read, as a later version's profiles would be after a downgrade.
  const UNREADABLE = { profiles: 'saved by a later version', active: 0 }
  let context, p, errors, t

  before(async () => {
    ({ context, p, errors } = await openProfiles(savedProfiles(UNREADABLE)))
    t = tools(p)
  })
  after(async () => { await context.close() })

  it('the dialog shows the preloads under one line saying the saved profiles could not be read and are kept', async () => {
    await t.openEditor()
    assert.match(await p.locator(`${EDITOR} [data-role=unreadable]`).textContent(), new RegExp(`could not be read; they are kept under ${PROFILES_KEY}_unreadable`))
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('a save of another pick leaves the unreadable value under _unreadable, and the line stays while it is kept', async () => {
    await t.openMenuByArrow()
    await t.pick('Odd/Even')
    assert.equal(await settle(async () => (await t.getState()).active, 1), 1)
    assert.deepEqual(await p.evaluate((key) => Framework.getData(`${key}_unreadable`), PROFILES_KEY), UNREADABLE)
    await t.openEditor()
    assert.equal(await p.locator(`${EDITOR} [data-role=unreadable]`).count(), 1)
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

describe('the menu and switching, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors, t

  before(async () => {
    ({ context, p, errors } = await openProfiles(savedOff(savedProfiles(FOUR_PROFILES))))
    t = tools(p)
  })
  after(async () => { await context.close() })

  it('a click on the arrow box opens the menu above the button, rows in order, Odd/Even highlighted', async () => {
    await t.openMenuByArrow()
    assert.deepEqual(await t.menuRows(), [{ name: 'Odd/Even', active: true }, { name: 'Low/5/High', active: false }, { name: 'Four', active: false }, { name: 'Six', active: false }])
    const [menu, button] = await Promise.all([t.menu().boundingBox(), p.locator(BUTTON).boundingBox()])
    assert.equal(menu.y + menu.height <= button.y, true, JSON.stringify({ menu, button }))
    // Escape and a click elsewhere close it too: motion's close test owns that.
    await p.keyboard.press('Escape')
    await t.menu().waitFor({ state: 'detached' })
  })

  it('a second click on the arrow box closes the menu again', async () => {
    await t.openMenuByArrow()
    await p.click(ARROW)
    await t.menu().waitFor({ state: 'detached' })
  })

  it('a right click on the button opens the menu, the browser menu is kept closed, and no cell is colored', async () => {
    await p.evaluate(() => { window.__contextmenu = []; document.addEventListener('contextmenu', (e) => window.__contextmenu.push(e.defaultPrevented)) })
    const { x, y } = await buttonPoint(p)
    await p.mouse.click(x, y, { button: 'right' })
    await t.menu().waitFor({ state: 'visible' })
    // The page's own listener runs after the script's, so it reads the final defaultPrevented.
    assert.deepEqual(await p.evaluate(() => window.__contextmenu), [true])
    assert.deepEqual(await watch(t.coloredCount), [0])
    await p.keyboard.press('Escape')
  })

  it('a short press on the button steps to Cell, colors the grid and opens no menu', async () => {
    await pressTo(p, 'Cell')
    assert.equal(await settle(() => t.wrongCount(ODD_EVEN), 0), 0)
    assert.equal(await t.menu().count(), 0)
  })

  it('a pick in Cell removes the old colors and colors every pure cell by the new profile, as one undo step', async () => {
    const before = await t.coloursOf()
    await t.openMenuByArrow()
    await t.pick('Low/5/High')
    assert.equal(await settle(() => t.wrongCount(LOW_FIVE_HIGH), 0), 0)
    assert.equal((await t.getState()).active, 1)
    assert.deepEqual(await settle(t.iconShownDigits, ['1', '5', '9']), ['1', '5', '9'])
    await t.undo()
    assert.equal(await settle(t.coloursOf, before), before)
  })

  it('the undo left the profile switched: the saved profile and the icon stay Low/5/High', async () => {
    assert.equal((await t.getState()).active, 1)
    assert.deepEqual(await t.iconShownDigits(), ['1', '5', '9'])
  })

  it('stepping to Digit takes off the active profile\'s colors only, and a pick in Digit changes no cell\'s color', async () => {
    // The undo above left Odd/Even's colors on the board under the active Low/5/High: its 2 is in no group of Low/5/High.
    const lowKeys = () => t.read(() => [].concat(Framework.app.puzzle.cells).flat(Infinity).filter((c) => (c.colours || []).some((k) => ['1', '5', '9'].includes(k))).length)
    await pressTo(p, 'Digit')
    assert.equal(await settle(lowKeys, 0), 0)
    assert.notEqual(await t.coloredCount(), 0)
    const before = await t.coloursOf()
    await t.openMenuByArrow()
    await t.pick('Odd/Even')
    assert.equal((await t.getState()).active, 0)
    assert.deepEqual(await watch(t.coloursOf), [before])
    await pressTo(p, 'Both')
    assert.equal(await settle(() => t.wrongCount(ODD_EVEN), 0), 0)
  })

  it('with Multi-color off, a pick that takes one color off a cell holding two leaves it its group color', async () => {
    // r2c4 is a given 1: key 1 in Odd/Even and in Low/5/High. It is given both that and the even color 2.
    const colours = () => t.read(() => [...Framework.app.grid.getCell(1, 3).colours].sort())
    await t.read(() => {
      Framework.setSetting('multicolour', true)
      const a = Framework.app
      const cell = a.grid.getCell(1, 3)
      ;['1', '2'].filter((key) => !cell.colours.includes(key)).forEach((key) => { a.deselect(); a.select(cell); a.act({ type: 'colour', arg: key }) })
      a.deselect()
    })
    assert.deepEqual(await settle(colours, ['1', '2']), ['1', '2'])
    await t.read(() => Framework.setSetting('multicolour', false))
    await t.openMenuByArrow()
    await t.pick('Low/5/High')
    assert.deepEqual(await settle(colours, ['1']), ['1'])
    // One undo step takes the whole switch back. SudokuPad records each color change as a toggle, so with
    // Multi-color off it cannot bring a cell's second color back: the cell is left with the toggled one.
    await t.undo()
    assert.deepEqual(await settle(colours, ['2']), ['2'])
    await t.read(() => Framework.setSetting('multicolour', true))
  })

  it('a pick by right click works too, and a cell entered by hand keeps its digit: the keyboard stays with the puzzle', async () => {
    const { x, y } = await buttonPoint(p)
    await p.mouse.click(x, y, { button: 'right' })
    await t.menu().waitFor({ state: 'visible' })
    await t.pick('Four')
    await selectCell(p, 8, 0)
    await p.keyboard.press('4')
    assert.equal(await settle(() => t.valueAt(8, 0), '4'), '4')
  })

  it('after a pick through the arrow box the keyboard also stays with the puzzle', async () => {
    await t.openMenuByArrow()
    await t.pick('Six')
    await selectCell(p, 8, 1)
    await p.keyboard.press('3')
    assert.equal(await settle(() => t.valueAt(8, 1), '3'), '3')
  })

  it('the button\'s run of cells stays inside the button and clear of the arrow box, at most three cells, for profiles of 2, 3, 4 and 6 groups', async () => {
    assert.equal(await t.label(), 'Both')
    await pressTo(p, 'Off')
    await pressTo(p, 'Cell')
    await pressTo(p, 'Digit')
    const overlaps = () => p.evaluate(({ button, arrow }) => {
      const rect = (e) => e.getBoundingClientRect()
      const cells = [...document.querySelectorAll(`${button} [data-role=chip] rect`)].map(rect)
      const box = rect(document.querySelector(button))
      const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      const inside = (c) => c.left >= box.left && c.right <= box.right && c.top >= box.top && c.bottom <= box.bottom
      return { cells: cells.length, hits: cells.filter((c) => hit(c, rect(document.querySelector(arrow)))).length, outside: cells.filter((c) => !inside(c)).length }
    }, { button: BUTTON, arrow: ARROW })
    const seen = []
    for (const [name, cells] of [['Odd/Even', 2], ['Low/5/High', 3], ['Four', 3], ['Six', 3]]) {
      await t.openMenuByArrow()
      await t.pick(name)
      seen.push([name, await settle(overlaps, { cells, hits: 0, outside: 0 })])
    }
    assert.deepEqual(seen, [['Odd/Even', { cells: 2, hits: 0, outside: 0 }], ['Low/5/High', { cells: 3, hits: 0, outside: 0 }], ['Four', { cells: 3, hits: 0, outside: 0 }], ['Six', { cells: 3, hits: 0, outside: 0 }]])
  })

  it('Edit profiles… opens the dialog', async () => {
    await t.openMenuByArrow()
    await p.locator(`${MENU} [data-act=edit]`).click()
    await t.editor().waitFor({ state: 'visible' })
    await closeDialogWith(p, 'Cancel', EDITOR)
  })

  it('the switch survives a reload: the saved profile is the active one', async () => {
    await reloadSession(p, script)
    // Six's groups are 0 to 5 one digit each; the group of 0 sorts last, so the icon's three cells are 1 to 3.
    assert.equal((await t.getState()).active, 3)
    assert.deepEqual(await t.iconShownDigits(), ['1', '2', '3'])
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

// A `touchEnd` carries no touch points.
const touch = (cdp, type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })

describe('the menu on a touch screen, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors, t, cdp

  before(async () => {
    ({ context, p, errors } = await openProfiles(savedOff(savedProfiles(SEED)), { hasTouch: true }))
    t = tools(p)
    cdp = await context.newCDPSession(p)
  })
  after(async () => { await context.close() })

  it('a tap on the arrow box opens the menu, and a tap on a row picks it', async () => {
    await p.tap(ARROW)
    await t.menu().waitFor({ state: 'visible' })
    await p.locator(`${MENU} [data-act=pick]`).filter({ hasText: 'Low/5/High' }).tap()
    await t.menu().waitFor({ state: 'detached' })
    assert.equal((await settle(t.getState, { ...SEED, active: 1 })).active, 1)
  })

  it('a hold on the button opens the menu and colors nothing', async () => {
    const { x, y } = await buttonPoint(p)
    await t.undo() // the pick's colors, so a press that wrongly colored the grid would show
    assert.equal(await settle(t.coloredCount, 0), 0)
    const before = await t.coloursOf()
    await touch(cdp, 'touchStart', x, y)
    await t.menu().waitFor({ state: 'visible', timeout: HOLD_MS + SETTLE_MS })
    await touch(cdp, 'touchEnd', x, y)
    assert.deepEqual(await watch(t.coloursOf), [before])
    await p.keyboard.press('Escape')
    await t.menu().waitFor({ state: 'detached' })
  })

  it('a short tap on the button steps to Cell and colors the grid', async () => {
    const { x, y } = await buttonPoint(p)
    await touch(cdp, 'touchStart', x, y)
    await touch(cdp, 'touchEnd', x, y)
    assert.equal(await settle(t.label, 'Cell'), 'Cell')
    assert.equal(await settle(async () => (await t.coloredCount()) > 0, true), true)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

describe('the dialog\'s profile list, injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors, t, cdp

  before(async () => {
    ({ context, p, errors } = await openProfiles(savedProfiles({ ...FOUR_PROFILES, profiles: FOUR_PROFILES.profiles.slice(0, 3) }), { hasTouch: true }))
    t = tools(p)
    cdp = await context.newCDPSession(p)
  })
  after(async () => { await context.close() })

  // Real key presses into the name field: SudokuPad listens for keys on the page, and a digit or letter
  // must reach the field.
  const NAME_FIELD = PROFILE_NAME_FIELD
  const typeName = async (text) => {
    await p.locator(NAME_FIELD).press('Control+a')
    await p.locator(NAME_FIELD).pressSequentially(text)
    assert.equal(await p.inputValue(NAME_FIELD), text)
  }
  const handle = (i) => p.locator(`${ROWS} [data-role=handle]`).nth(i)
  const count = () => p.locator(ROWS).count()
  const heading = () => p.locator(EDITOR).innerText()
  // Where a drag of the handle of row `from` starts and ends: the end is just past the middle of row `to`,
  // where the dragged row lands beyond it.
  const dragPoints = async (from, to) => {
    await p.locator(ROWS).first().scrollIntoViewIfNeeded()
    const start = await center(handle(from))
    const end = await center(p.locator(ROWS).nth(to))
    end.y += to > from ? DROP_PAST_MIDDLE_PX : -DROP_PAST_MIDDLE_PX
    return { start, end }
  }
  const dragWithMouse = async (from, to) => {
    const { start, end } = await dragPoints(from, to)
    await p.mouse.move(start.x, start.y)
    await p.mouse.down()
    await p.mouse.move(start.x, (start.y + end.y) / 2, { steps: 4 })
    await p.mouse.move(start.x, end.y, { steps: 4 })
    await p.mouse.up()
  }
  const dragWithTouch = async (from, to) => {
    const { start, end } = await dragPoints(from, to)
    await touch(cdp, 'touchStart', start.x, start.y)
    for (let step = 1; step <= 6; step++) {
      await touch(cdp, 'touchMove', start.x, start.y + ((end.y - start.y) * step) / 6)
    }
    await touch(cdp, 'touchEnd', start.x, start.y)
  }

  it('the dialog lists each profile with its colors and shown digits (three at most), a count and the selected radio, with no tag, and the pulldowns name the same profiles', async () => {
    await t.openEditor()
    assert.deepEqual(await t.rowNames(), ['Odd/Even', 'Low/5/High', 'Four'])
    assert.equal(await t.selectedRow(), 0)
    assert.equal(await t.cellProfile(), '0')
    assert.equal(await p.locator(`${ROWS} button:not([data-act=delete])`).count(), 0)
    assert.deepEqual(await t.pulldownNames('cell-profile'), ['Odd/Even', 'Low/5/High', 'Four'])
    assert.deepEqual(await t.pulldownNames('digit-profile'), ['Same as cell', 'Odd/Even', 'Low/5/High', 'Four', 'None'])
    assert.match(await heading(), /3 of 6/)
    assert.equal(await p.inputValue(NAME_FIELD), 'Odd/Even')
    assert.deepEqual(await p.$$eval(`${ROWS} [data-role=chip]`, (es) => es.map((e) => e.textContent)), ['5', '4', '1', '5', '9', '1', '3', '5'])
  })

  const groupCount = () => groupCountOn(p)

  it('a click anywhere on a row but its handle, name field and × selects it without making it the cell profile: one row is highlighted, the name field and the groups follow it', async () => {
    assert.equal(await groupCount(), 2)
    await p.click(`${ROWS}:nth-child(2) [data-role=chip]`)
    assert.equal(await t.selectedRow(), 1)
    assert.equal(await p.locator(`${ROWS}[aria-checked=true]`).count(), 1)
    assert.equal(await groupCount(), 3)
    assert.equal(await p.inputValue(NAME_FIELD), 'Low/5/High')
    await p.click(`${ROWS}:nth-child(3)`, ROW_CORNER)
    assert.equal(await t.selectedRow(), 2)
    assert.equal(await groupCount(), 4)
    assert.equal(await t.cellProfile(), '0')
  })

  it('the Cell pulldown makes a profile the cell profile without selecting its row', async () => {
    await p.selectOption(`${EDITOR} select[data-role=cell-profile]`, '1')
    assert.equal(await t.cellProfile(), '1')
    assert.equal(await t.selectedRow(), 2)
    await p.selectOption(`${EDITOR} select[data-role=cell-profile]`, '0')
    assert.equal(await t.cellProfile(), '0')
  })

  it('Enter on a focused row selects it, and the row keeps the focus', async () => {
    await p.focus(`${ROWS}:nth-child(1)`)
    await p.keyboard.press('Enter')
    assert.equal(await t.selectedRow(), 0)
    assert.equal(await p.evaluate(() => document.activeElement.getAttribute('data-index')), '0')
    assert.equal(await groupCount(), 2)
  })

  it('Space on a focused row selects it, and the arrow keys move the choice, wrapping', async () => {
    await p.focus(`${ROWS}:nth-child(2)`)
    await p.keyboard.press(' ')
    assert.equal(await t.selectedRow(), 1)
    await p.keyboard.press('ArrowDown')
    assert.equal(await t.selectedRow(), 2)
    await p.keyboard.press('ArrowDown')
    assert.equal(await t.selectedRow(), 0)
    await p.keyboard.press('ArrowUp')
    assert.equal(await t.selectedRow(), 2)
    assert.equal(await p.evaluate(() => document.activeElement.getAttribute('data-index')), '2')
    assert.deepEqual(await p.$$eval(ROWS, (rows) => rows.map((r) => r.tabIndex)), [-1, -1, 0])
    await p.click(`${ROWS}:nth-child(1)`)
  })

  it('the buttons row is Save then Cancel, Save filled purple, the title row holds the two settings icons, and the page pulldown has the dialog\'s own look', async () => {
    assert.deepEqual(await p.$$eval('.dialog-options button', (bs) => bs.map((b) => b.textContent.trim())), ['Save', 'Cancel'])
    assert.deepEqual(await p.$$eval('.cbd-title-row button', (bs) => bs.map((b) => b.getAttribute('aria-label'))), ['Copy settings', 'Paste settings'])
    assert.equal(await p.$eval('.dialog-options button[data-role=save]', (b) => window.getComputedStyle(b).backgroundColor), 'rgb(107, 63, 160)')
    assert.match(await p.$eval(`${EDITOR} select[data-role=color-choice]`, (e) => window.getComputedStyle(e).backgroundImage), /^url\("data:image\/svg\+xml/)
  })

  it('a click on a handle or on × does not select that row', async () => {
    // A click event aimed at the handle itself: a real press on it starts a drag, whose release redraws the list.
    await p.dispatchEvent(`${ROWS}:nth-child(2) [data-role=handle]`, 'click')
    assert.equal(await t.selectedRow(), 0)
    await deleteRow(p, 3)
    assert.deepEqual(await t.rowNames(), ['Odd/Even', 'Low/5/High'])
    assert.equal(await t.selectedRow(), 0)
  })

  it('Cancel drops the clicked row and the delete', async () => {
    await p.click(`${ROWS}:nth-child(2)`)
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.equal((await t.getState()).active, 0)
    assert.equal((await t.names()).length, 3)
    await t.openEditor()
    // The drag tests below start with Low/5/High, the second row, selected in the draft.
    await p.click(`${ROWS}:nth-child(2)`)
    assert.equal(await t.selectedRow(), 1)
  })

  it('the pad: 1 2 3 over 4 5 6 over 7 8 9, with 0 on a fourth row under 7', async () => {
    const box = async (d) => p.locator(`${EDITOR} [data-act=digit][data-digit="${d}"]`).boundingBox()
    const at = {}
    for (const d of '0123456789') at[d] = await box(d)
    assert.ok(at[1].x < at[2].x && at[2].x < at[3].x)
    assert.equal(at[1].y, at[3].y)
    assert.ok(at[1].y < at[4].y && at[4].y < at[7].y)
    assert.deepEqual([at[4].x, at[7].x], [at[1].x, at[1].x])
    assert.equal(at[0].x, at[7].x)
    assert.ok(at[0].y > at[7].y, JSON.stringify([at[0], at[7]]))
  })

  it('a drag of the handle with the mouse reorders the draft, and Cancel drops it', async () => {
    await dragWithMouse(0, 2)
    assert.deepEqual(await t.rowNames(), ['Low/5/High', 'Four', 'Odd/Even'])
    assert.equal(await t.selectedRow(), 0)
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.deepEqual(await t.names(), ['Odd/Even', 'Low/5/High', 'Four'])
    assert.equal((await t.getState()).active, 0)
  })

  it('a drag with a finger reorders the draft, and Save keeps the order, the active profile and shows it in the menu', async () => {
    await t.openEditor()
    // A finger has no hover, so a row's handle shows once the row is selected.
    await p.click(`${ROWS}:nth-child(3)`, ROW_CORNER)
    await dragWithTouch(2, 0)
    assert.equal(await t.selectedRow(), 0)
    assert.equal(await t.cellProfile(), '1')
    assert.deepEqual(await t.rowNames(), ['Four', 'Odd/Even', 'Low/5/High'])
    assert.deepEqual(await t.pulldownNames('cell-profile'), ['Four', 'Odd/Even', 'Low/5/High'])
    await closeDialogWith(p, 'Save', EDITOR)
    assert.deepEqual(await settle(t.names, ['Four', 'Odd/Even', 'Low/5/High']), ['Four', 'Odd/Even', 'Low/5/High'])
    assert.equal((await t.getState()).active, 1)
    await t.openMenuByArrow()
    assert.deepEqual(await t.menuRows(), [{ name: 'Four', active: false }, { name: 'Odd/Even', active: true }, { name: 'Low/5/High', active: false }])
    await p.keyboard.press('Escape')
  })

  it('+ New profile copies the selected profile as "<name> copy", selects it and focuses the name in its row; Cancel drops it', async () => {
    await t.openEditor()
    await p.click(`${EDITOR} button[data-act=new-profile]`)
    assert.deepEqual(await t.rowNames(), ['Four', 'Odd/Even', 'Low/5/High', 'Odd/Even copy'])
    assert.equal(await t.selectedRow(), 3)
    assert.equal(await t.cellProfile(), '1')
    assert.deepEqual(await t.pulldownNames('cell-profile'), ['Four', 'Odd/Even', 'Low/5/High', 'Odd/Even copy'])
    assert.match(await heading(), /4 of 6/)
    assert.equal(await p.inputValue(NAME_FIELD), 'Odd/Even copy')
    assert.equal(await p.evaluate(() => document.activeElement.getAttribute('data-role')), 'profile-name')
    // A copy of Odd/Even: its shown digits are 5 and 4.
    assert.deepEqual(await p.$$eval(`${ROWS}:nth-child(4) [data-role=chip]`, (es) => es.map((e) => e.textContent)), ['5', '4'])
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.deepEqual(await t.names(), ['Four', 'Odd/Even', 'Low/5/High'])
  })

  it('typing in the name in the selected row renames the profile, its row and the pulldowns\' options, a box emptied a key at a time keeps the old name, and Cancel drops it', async () => {
    await t.openEditor()
    await p.click(`${ROWS}:nth-child(1)`, ROW_CORNER)
    await typeName('Mine')
    assert.deepEqual(await t.rowNames(), ['Mine', 'Odd/Even', 'Low/5/High'])
    assert.deepEqual(await t.pulldownNames('cell-profile'), ['Mine', 'Odd/Even', 'Low/5/High'])
    assert.deepEqual(await t.pulldownNames('digit-profile'), ['Same as cell', 'Mine', 'Odd/Even', 'Low/5/High', 'None'])
    await p.click(`${ROWS}:nth-child(3)`, ROW_CORNER)
    assert.deepEqual(await t.rowNames(), ['Mine', 'Odd/Even', 'Low/5/High'])
    await p.click(`${ROWS}:nth-child(1)`, ROW_CORNER)
    await p.locator(NAME_FIELD).press('End')
    for (let i = 0; i < 'Mine'.length; i++) await p.locator(NAME_FIELD).press('Backspace')
    assert.equal(await p.inputValue(NAME_FIELD), '')
    assert.deepEqual(await t.rowNames(), ['Mine', 'Odd/Even', 'Low/5/High'])
    await p.locator(NAME_FIELD).press('Enter')
    assert.equal(await p.inputValue(NAME_FIELD), 'Mine')
    assert.equal(await p.evaluate(() => document.activeElement.getAttribute('data-role')), 'profile-name')
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.deepEqual(await t.names(), ['Four', 'Odd/Even', 'Low/5/High'])
  })

  it('+ New profile is disabled at six profiles', async () => {
    await t.openEditor()
    assert.equal(await count(), 3)
    for (const name of ['Mine', 'Second', 'Third']) {
      await p.click(`${EDITOR} button[data-act=new-profile]`)
      await typeName(name)
    }
    assert.equal(await count(), 6)
    assert.match(await heading(), /6 of 6/)
    assert.equal(await p.locator(`${EDITOR} button[data-act=new-profile]`).isDisabled(), true)
  })

  it('Save keeps the six profiles with their new names, the new ones last, and a reload keeps them', async () => {
    await closeDialogWith(p, 'Save', EDITOR)
    const six = ['Four', 'Odd/Even', 'Low/5/High', 'Mine', 'Second', 'Third']
    assert.deepEqual(await settle(t.names, six), six)
    await reloadSession(p, script)
    assert.deepEqual(await t.names(), six)
  })

  it('delete removes a profile in the draft, and Cancel drops that too', async () => {
    await t.openEditor()
    await deleteRow(p, 1)
    assert.deepEqual(await t.rowNames(), ['Odd/Even', 'Low/5/High', 'Mine', 'Second', 'Third'])
    assert.equal(await t.selectedRow(), 0)
    await closeDialogWith(p, 'Cancel', EDITOR)
    assert.equal((await t.names()).length, 6)
  })

  it('delete is disabled on the last profile, and Save keeps just it, active', async () => {
    await t.openEditor()
    for (let i = 0; i < 5; i++) await deleteRow(p, 1)
    assert.equal(await count(), 1)
    assert.equal(await p.locator(`${ROWS} button[data-act=delete]`).isDisabled(), true)
    assert.equal(await t.selectedRow(), 0)
    await closeDialogWith(p, 'Save', EDITOR)
    const state = await settle(async () => (await t.getState()).profiles.length, 1)
    assert.equal(state, 1)
    assert.equal((await t.getState()).active, 0)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

describe('opening the editor and saving with no edit, injected after Start Puzzle', { concurrency: false }, () => {
  const PRELOAD_PROFILES = {
    profiles: [
      { name: 'Low/5/High', groups: LOW_FIVE_HIGH },
      { name: 'Odd/Even', groups: ODD_EVEN },
      { name: 'Entropic', groups: [group('7', ['0', '1', '2', '3']), group('4', ['4', '5', '6']), group('9', ['7', '8', '9'])] },
      { name: 'Modular', groups: [group('6', ['1', '4', '7']), group('5', ['2', '5', '8']), group('8', ['0', '3', '6', '9'])] },
      { name: 'Each digit', groups: [['1', 'j'], ['2', 'e'], ['3', 'h'], ['4', 'm'], ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9']].map(([d, key]) => group(key, [d])) }
    ],
    active: 3
  }
  let context, p, errors

  before(async () => {
    ({ context, p, errors } = await openProfiles(savedOff(savedProfiles(PRELOAD_PROFILES))))
  })
  after(async () => { await context.close() })

  it('every preload comes back unchanged, in its order, with the active profile kept', async () => {
    await openScriptDialog(p, 'Color by Digit', EDITOR)
    await closeDialogWith(p, 'Save', EDITOR)
    assert.deepEqual(await settle(async () => savedState(await p.evaluate((key) => Framework.getData(key), PROFILES_KEY)), PRELOAD_PROFILES), PRELOAD_PROFILES)
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})
