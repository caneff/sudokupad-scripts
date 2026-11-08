// Live check of draw-tool.user.js's ways to finish a note and to click, on sudokupad.app: Escape closes the open note and leaves it selected, Enter reopens the one
// selected note with the caret at its end, a click that slips a few pixels still opens a note or selects one, a note of only spaces is removed and trailing
// spaces are trimmed when it closes, Escape during a drag or a resize puts the note back, and Tab in an open note does nothing. Real mouse and keyboard
// input throughout, at a desktop size.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'

const { TEXT_BOX } = draw
const SELECTED = '#draw-tool-layer .draw-tool-selected'
const RECTANGLE = '#draw-tool-layer .draw-tool-selection-rectangle'
const HANDLE = '#draw-tool-layer .draw-tool-resize'
// In cells from the grid's top left: two notes, and empty space for new ones.
const A_AT = [1.5, 1.5]
const B_AT = [4.5, 4.5]
const EMPTY = [7.5, 1.5]
const EMPTY_TWO = [7.5, 6.5]
// Still empty once the notes above are typed.
const FREE = [2.5, 7.5]
const BOTTOM_RIGHT = 3
// A note stays where it is to within this many cells.
const NEAR_CELLS = 0.1

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s endings, clicks and cancelled drags', { concurrency: false }, () => {
  let context, p, errors

  const saved = () => draw.saved(p)
  const savedNote = async (text) => (await saved()).find((item) => item.text === text)
  const texts = () => draw.texts(p)
  const selectedTexts = () => p.evaluate((selector) => [...document.querySelectorAll(selector)].map((e) => e.textContent).sort(), SELECTED)
  const boxOpen = async () => (await p.locator(TEXT_BOX).count()) === 1
  const cellState = () => p.evaluate(() => JSON.stringify(Framework.app.puzzle.cells.map((c) => [c.propGet('normal'), c.propGet('corner'), c.propGet('centre'), c.propGet('colour')])))
  const clickAt = async (at) => p.mouse.click(...await gridPoint(p, at))
  // A press at `at`, a move by (dx, dy) screen pixels, and the release.
  const slip = async (at, dx, dy) => {
    const [x, y] = await gridPoint(p, at)
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x + dx, y + dy, { steps: 3 })
    await p.mouse.up()
  }
  const typeNote = async (at, content) => {
    await clickAt(at)
    await p.keyboard.type(content)
    await p.keyboard.press('Escape')
    await p.keyboard.press('Escape')
  }
  const near = (a, b) => Math.abs(a - b) <= NEAR_CELLS
  const handleMiddle = async () => {
    const { x, y, width, height } = await p.locator(HANDLE).nth(BOTTOM_RIGHT).boundingBox()
    return [x + width / 2, y + height / 2]
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport: { width: 1200, height: 900 } } }))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.reload(p)
    await draw.pickDraw(p)
    await typeNote(A_AT, 'A')
    await typeNote(B_AT, 'B')
    assert.deepEqual(await texts(), ['A', 'B'])
  })
  after(async () => { await context.close() })

  it('Escape closes the open note and leaves it selected, so an arrow key nudges it at once; a click outside selects nothing', async () => {
    await clickAt(EMPTY)
    await p.keyboard.type('X')
    await p.keyboard.press('Escape')
    assert.equal(await boxOpen(), false)
    assert.deepEqual(await selectedTexts(), ['X'])
    assert.equal(await draw.tool(p), 'draw')
    const before = (await savedNote('X')).at
    await p.keyboard.press('ArrowRight')
    assert.ok((await savedNote('X')).at[0] > before[0], 'the arrow key moved the note')
    await p.keyboard.press('Escape')
    assert.deepEqual(await selectedTexts(), [])
    await p.mouse.dblclick(...await gridPoint(p, A_AT))
    assert.equal(await boxOpen(), true)
    await clickAt(EMPTY_TWO)
    assert.equal(await boxOpen(), false, 'a click outside closed the note')
    assert.deepEqual(await selectedTexts(), [], 'and selected nothing')
    assert.deepEqual(await texts(), ['A', 'B', 'X'])
  })

  it('Enter reopens the one selected note with the caret at its end, and starts no new line', async () => {
    await clickAt(A_AT)
    assert.deepEqual(await selectedTexts(), ['A'])
    await p.keyboard.press('Enter')
    assert.equal(await boxOpen(), true)
    assert.equal(await p.locator(TEXT_BOX).textContent(), 'A', 'no line break came with the Enter')
    await p.keyboard.type('z')
    await p.keyboard.press('Escape')
    assert.deepEqual(await texts(), ['Az', 'B', 'X'])
    assert.deepEqual(await selectedTexts(), ['Az'])
    await p.keyboard.press('Escape')
    assert.deepEqual(await selectedTexts(), [])
  })

  it('a click that slips opens a note on empty space, selects a note, and only ends a selection; a real rectangle still selects', async () => {
    await slip(EMPTY_TWO, 6, 3)
    assert.equal(await boxOpen(), true, 'a 6 px slip on empty space opened a note')
    await p.keyboard.type('S')
    await p.keyboard.press('Escape')
    await p.keyboard.press('Escape')
    assert.deepEqual(await texts(), ['Az', 'B', 'X', 'S'])
    await clickAt(B_AT)
    await slip(FREE, 5, 5)
    assert.equal(await boxOpen(), false, 'with a selection, a slip only ends it')
    assert.deepEqual(await selectedTexts(), [])
    await slip(FREE, 40, 40)
    assert.equal(await boxOpen(), false, 'a larger rectangle that selects nothing opens no note')
    await slip([0.4, 0.4], 150, 150)
    assert.deepEqual(await selectedTexts(), ['Az'], 'a rectangle over a note selects it')
    await p.keyboard.press('Escape')
  })

  it('a press on a note that moves 4 px is still a click: it selects the note and moves nothing', async () => {
    const before = (await savedNote('B')).at
    const [x, y] = await gridPoint(p, B_AT)
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x + 4, y, { steps: 2 })
    // A drag moves the note by a translation while the pointer is down; a click does not.
    const translate = await p.evaluate(() => [...document.querySelectorAll('#draw-tool-layer .draw-tool-text')].find((e) => e.textContent === 'B').style.translate)
    assert.equal(translate, '', 'the note follows no drag')
    await p.mouse.up()
    assert.deepEqual(await selectedTexts(), ['B'])
    assert.deepEqual((await savedNote('B')).at, before)
    await p.keyboard.press('Escape')
  })

  it('a note of only spaces is removed when it closes, and typing spaces into a new note makes none', async () => {
    await clickAt(FREE)
    await p.keyboard.type('   ')
    await p.keyboard.press('Escape')
    assert.deepEqual(await texts(), ['Az', 'B', 'X', 'S'])
    assert.deepEqual(await selectedTexts(), [])
    await p.mouse.dblclick(...await gridPoint(p, B_AT))
    await p.keyboard.press('Backspace')
    await p.keyboard.type('  ')
    await p.keyboard.press('Escape')
    assert.deepEqual(await texts(), ['Az', 'X', 'S'])
    assert.deepEqual((await saved()).map((item) => item.text), ['Az', 'X', 'S'])
  })

  it('trailing spaces are trimmed from every line when a note closes', async () => {
    await clickAt(FREE)
    await p.keyboard.type('ab   ')
    await p.keyboard.press('Enter')
    await p.keyboard.type('cd  ')
    await p.keyboard.press('Escape')
    assert.deepEqual((await saved()).map((item) => item.text), ['Az', 'X', 'S', 'ab\ncd'])
    await p.keyboard.press('Delete')
    assert.deepEqual((await saved()).map((item) => item.text), ['Az', 'X', 'S'])
  })

  it('Escape during a drag puts the notes back and ends the drag, and the release does nothing', async () => {
    await clickAt(A_AT)
    await p.keyboard.down('Shift')
    try {
      await clickAt(EMPTY_TWO)
    } finally {
      await p.keyboard.up('Shift')
    }
    assert.deepEqual(await selectedTexts(), ['Az', 'S'])
    const [az, s] = [await draw.noteInCells(p, 'Az'), await draw.noteInCells(p, 'S')]
    const [x, y] = await gridPoint(p, A_AT)
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x + 120, y + 60, { steps: 8 })
    const moved = await draw.noteInCells(p, 'Az')
    assert.ok(!near(moved[0], az[0]) || !near(moved[1], az[1]), 'the note followed the pointer')
    await p.keyboard.press('Escape')
    const back = await draw.noteInCells(p, 'Az')
    assert.ok(near(back[0], az[0]) && near(back[1], az[1]), `back at ${az}, now ${back}`)
    await p.mouse.move(x + 200, y + 100, { steps: 5 })
    await p.mouse.up()
    assert.deepEqual(await selectedTexts(), ['Az', 'S'], 'the selection stays')
    for (const [text, was] of [['Az', az], ['S', s]]) {
      const now = await draw.noteInCells(p, text)
      assert.ok(near(now[0], was[0]) && near(now[1], was[1]), `${text} stayed at ${was}, now ${now}`)
    }
    assert.equal(await p.locator(RECTANGLE).count(), 0)
    await p.keyboard.press('Escape')
  })

  it('Escape during a resize puts the size back: a selected note, and the open note, which stays open', async () => {
    await clickAt(A_AT)
    const before = await p.evaluate((selector) => document.querySelector(selector).getBoundingClientRect().toJSON(), SELECTED)
    const [hx, hy] = await handleMiddle()
    await p.mouse.move(hx, hy)
    await p.mouse.down()
    await p.mouse.move(hx + 90, hy + 50, { steps: 6 })
    const grown = await p.evaluate((selector) => document.querySelector(selector).getBoundingClientRect().width, SELECTED)
    assert.ok(grown > before.width + 20, 'the drag resized the note')
    await p.keyboard.press('Escape')
    await p.mouse.move(hx + 120, hy + 80, { steps: 3 })
    await p.mouse.up()
    const after = await p.evaluate((selector) => document.querySelector(selector).getBoundingClientRect().toJSON(), SELECTED)
    assert.ok(Math.abs(after.width - before.width) < 1 && Math.abs(after.height - before.height) < 1, `size back to ${before.width}x${before.height}, now ${after.width}x${after.height}`)
    assert.equal((await savedNote('Az')).box, undefined, 'nothing saved')
    assert.deepEqual(await selectedTexts(), ['Az'])
    await p.keyboard.press('Escape')

    await p.mouse.dblclick(...await gridPoint(p, A_AT))
    const open = await p.locator(TEXT_BOX).boundingBox()
    const [ox, oy] = await handleMiddle()
    await p.mouse.move(ox, oy)
    await p.mouse.down()
    await p.mouse.move(ox + 90, oy + 50, { steps: 6 })
    assert.ok((await p.locator(TEXT_BOX).boundingBox()).width > open.width + 20, 'the drag resized the open note')
    await p.keyboard.press('Escape')
    await p.mouse.up()
    assert.equal(await boxOpen(), true, 'the note stays open')
    const back = await p.locator(TEXT_BOX).boundingBox()
    assert.ok(Math.abs(back.width - open.width) < 1 && Math.abs(back.height - open.height) < 1, 'size back')
    await p.keyboard.press('Escape')
    assert.equal(await boxOpen(), false, 'a second Escape closes it')
    assert.equal((await savedNote('Az')).box, undefined)
  })

  it('Tab in an open note does nothing: the note stays open and nothing reaches the cells or the tool', async () => {
    const cells = await cellState()
    await p.mouse.dblclick(...await gridPoint(p, A_AT))
    await p.keyboard.press('Tab')
    assert.equal(await boxOpen(), true)
    await p.keyboard.type('k')
    assert.equal(await p.locator(TEXT_BOX).textContent(), 'Azk', 'Tab typed nothing')
    await p.keyboard.press('Shift+Tab')
    assert.equal(await boxOpen(), true)
    await p.keyboard.press('Escape')
    assert.deepEqual((await saved()).map((item) => item.text), ['Az' + 'k', 'X', 'S'])
    assert.equal(await cellState(), cells)
    assert.equal(await draw.tool(p), 'draw')
  })

  it('raised no page error', () => {
    assert.deepEqual(errors, [])
  })
})
