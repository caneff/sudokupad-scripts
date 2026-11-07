// Live check of draw-tool.user.js's notes off the board on sudokupad.app: a click anywhere on the page but a control starts a
// note there, fixed on the screen; a click on a control starts none; a resize or a layout change leaves an off-board note
// where it was and an on-board note over its cells; a drag across the board's edge stores the note as its drop point
// requires, kept over a reload; notes saved before 0.18.0 load in their places; a dialog covers the notes. Real mouse input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'
import { closeDialogWith } from '../settings.mjs'
import { settle, stable } from '../settle.mjs'

const { DIALOG, TEXT_BOX, TEXTS } = draw
// A real mouse lands on whole page pixels, and a note's place is rounded to a tenth.
const NEAR_PX = 1.5
// In cells from the grid's top left: the on-board note's spot, at r3c3.
const ON_AT = [2.5, 2.5]
// What 0.17.0 saved: a note at the middle of r3c3, in board units of 64 to a cell.
const OLD_NOTE = { kind: 'text', color: 1, size: 20, opacity: 100, text: 'old', at: [160, 160] }

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Annotation\'s notes off the board', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const saved = () => draw.saved(p)
  const texts = () => draw.texts(p)
  const reload = async () => {
    await draw.reload(p)
    await draw.pickDraw(p)
  }
  const near = (got, want) => got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) <= NEAR_PX)
  const savedNote = async (text) => (await saved()).find((item) => item.text === text)
  // The middle of the note that reads `text`, on the screen.
  const noteMiddle = (text) => read(([selector, want]) => {
    const box = [...document.querySelectorAll(selector)].find((e) => e.textContent === want).getBoundingClientRect()
    return [box.x + box.width / 2, box.y + box.height / 2]
  }, [TEXTS, text])
  // The middle of the note that reads `text`, in cells from the grid's top left.
  const noteInCells = (text) => read(([selector, want]) => {
    const box = [...document.querySelectorAll(selector)].find((e) => e.textContent === want).getBoundingClientRect()
    const cell = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
    return [(box.y + box.height / 2 - cell.y) / cell.height, (box.x + box.width / 2 - cell.x) / cell.width].map((v) => Math.round(v * 10) / 10)
  }, [TEXTS, text])
  // Blank page points clear of the board and the controls: right of the controls, and below the board.
  const blankPoints = () => read(() => {
    const controls = document.querySelector('#controls').getBoundingClientRect()
    const board = Framework.app.svgRenderer.getElem().getBoundingClientRect()
    return { right: [Math.round((controls.right + window.innerWidth) / 2), Math.round(controls.top + controls.height / 2)], below: [Math.round(board.left + board.width / 3), Math.round((board.bottom + window.innerHeight) / 2)] }
  })
  const typeAt = async (point, content) => {
    await p.mouse.click(...point)
    await p.keyboard.type(content)
    await p.keyboard.press('Enter')
  }
  const dragFromTo = async (from, to) => {
    await p.mouse.move(...from)
    await p.mouse.down()
    await p.mouse.move(...to, { steps: 8 })
    await p.mouse.up()
  }
  const closeDialog = () => closeDialogWith(p, 'Cancel', DIALOG)
  const boxOpen = async () => (await p.locator(TEXT_BOX).count()) === 1

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await reload()
  })
  after(async () => { await context.close() })

  it('a click right of the controls and one below the board each start a note there, fixed on the screen and centred on the click', async () => {
    const { right, below } = await blankPoints()
    await typeAt(right, 'R')
    await typeAt(below, 'B')
    assert.deepEqual(await texts(), ['R', 'B'])
    for (const [text, point] of [['R', right], ['B', below]]) {
      const note = await savedNote(text)
      assert.deepEqual([note.fixed, note.at], [point, undefined], `${text} is stored at its screen point`)
      const middle = await noteMiddle(text)
      assert.equal(near(middle, point), true, `${text} is drawn at ${middle}, clicked at ${point}`)
    }
  })

  it('a click on a control, on the controls\' blank space, on the top bar or in an open dialog starts no note', async () => {
    const before = await saved()
    const controls = await p.locator('#controls').boundingBox()
    const undo = await p.locator('#control-undo').boundingBox()
    const topbar = await p.locator('.topbar').boundingBox()
    // The space between the undo button and the left of the panel, and the middle of the top bar.
    const spots = [[controls.x + 2, undo.y + undo.height / 2], [topbar.x + topbar.width / 2, topbar.y + topbar.height / 2]]
    for (const spot of spots) {
      await p.mouse.click(...spot)
      assert.equal(await boxOpen(), false, `a click at ${spot} opened no note`)
    }
    await p.click('.draw-tool-settings')
    const dialog = await p.locator(DIALOG).boundingBox()
    await p.mouse.click(dialog.x + 4, dialog.y + dialog.height / 2)
    assert.equal(await boxOpen(), false, 'a click in the dialog opened no note')
    await closeDialog()
    assert.deepEqual(await saved(), before)
  })

  it('an open dialog is drawn over the notes', async () => {
    await p.click('.draw-tool-settings')
    await p.locator(DIALOG).waitFor({ state: 'visible' })
    const covered = await read((selector) => [...document.querySelectorAll(selector)].map((note) => {
      const { x, y, width, height } = note.getBoundingClientRect()
      note.style.pointerEvents = 'auto'
      try {
        return document.elementFromPoint(x + width / 2, y + height / 2).closest('.dialog-overlay') !== null
      } finally {
        note.style.pointerEvents = ''
      }
    }), TEXTS)
    await closeDialog()
    assert.deepEqual(covered, [true, true])
  })

  it('a click on an off-board note reopens it in place, and a right click erases it', async () => {
    const { right } = await blankPoints()
    await p.mouse.click(...right)
    assert.equal(await p.locator(TEXT_BOX).textContent(), 'R')
    await p.keyboard.press('Escape')
    await p.mouse.click(...right, { button: 'right' })
    assert.deepEqual(await texts(), ['B'])
    assert.equal(await savedNote('R'), undefined)
  })

  it('after a window resize an off-board note keeps its screen point and an on-board note stays over its cells', async () => {
    await typeAt(await gridPoint(p, ON_AT), 'G')
    const below = await noteMiddle('B')
    const cells = await noteInCells('G')
    await p.setViewportSize({ width: 1000, height: 800 })
    assert.deepEqual(await stable(() => noteInCells('G')), cells)
    assert.equal(near(await noteMiddle('B'), below), true, `the off-board note moved from ${below} to ${await noteMiddle('B')}`)
    await p.setViewportSize({ width: 1200, height: 900 })
    assert.deepEqual(await stable(() => noteInCells('G')), cells)
  })

  it('after SudokuPad lays the page out again, with no window resize, an on-board note stays over its cells', async () => {
    const cells = await noteInCells('G')
    const cellWidth = () => read(() => Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect().width)
    const widthBefore = await cellWidth()
    // App.resize fits the board to the .game box; a narrower box makes a smaller board.
    await read(() => {
      document.querySelector('.game').style.width = '800px'
      Framework.app.resize()
    })
    assert.notEqual(await cellWidth(), widthBefore, 'the layout changed the board\'s size')
    assert.deepEqual(await stable(() => noteInCells('G')), cells)
    await read(() => {
      document.querySelector('.game').style.width = ''
      Framework.app.resize()
    })
    assert.deepEqual(await stable(() => noteInCells('G')), cells)
  })

  it('a note dragged off the board is fixed where it was dropped, and dragged back it is pinned to the cells it was dropped on, each over a reload', async () => {
    const { right } = await blankPoints()
    await dragFromTo(await gridPoint(p, ON_AT), right)
    const off = await savedNote('G')
    assert.equal(near(off.fixed, right), true, `stored at ${off.fixed}, dropped at ${right}`)
    assert.equal(off.at, undefined)
    await reload()
    assert.equal(near(await settle(() => noteMiddle('G'), await noteMiddle('G')), right), true, 'after a reload')
    const back = [6.5, 4.5]
    await dragFromTo(right, await gridPoint(p, back))
    const on = await savedNote('G')
    assert.equal(on.fixed, undefined)
    assert.deepEqual(await noteInCells('G'), back)
    await reload()
    assert.deepEqual(await settle(() => noteInCells('G'), back), back)
  })

  it('a note saved before 0.18.0 loads over the cell it was put on', async () => {
    await draw.plantDrawing(p, [OLD_NOTE])
    await reload()
    assert.deepEqual(await settle(texts, ['old']), ['old'])
    assert.deepEqual(await noteInCells('old'), ON_AT)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
