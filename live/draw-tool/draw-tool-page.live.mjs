// Live check of draw-tool.user.js's notes off the board on sudokupad.app: a click anywhere on the page but a control starts a
// note there, fixed on the screen; a click on a control starts none; a resize or a layout change that leaves an off-board note in reach leaves it
// where it was (draw-tool-reach.live.mjs has the one put out of reach) and an on-board note over its cells; a right click beside the board erases with no browser menu, and one on a control keeps its menu; a drag across the board's edge stores the note as its drop point
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
// A real mouse lands on whole page pixels, and a note's place is rounded to a hundredth.
const NEAR_PX = 1.5
// In cells from the grid's top left: the on-board note's spot, at r3c3.
const ON_AT = [2.5, 2.5]
// What 0.17.0 saved: a note at the middle of r3c3, in board units of 64 to a cell.
const OLD_NOTE = { kind: 'text', color: 1, size: 20, opacity: 100, text: 'old', at: [160, 160] }

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s notes off the board', { concurrency: false }, () => {
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
  const notePoint = (text) => draw.notePoint(p, text)
  const noteStart = (text) => draw.noteStart(p, text)
  const noteInCells = (text) => draw.noteInCells(p, text)
  // Blank page points clear of the board and the controls: right of the controls, and below the board.
  const blankPoints = () => read(() => {
    const controls = document.querySelector('#controls').getBoundingClientRect()
    const board = Framework.app.svgRenderer.getElem().getBoundingClientRect()
    return { right: [Math.round((controls.right + window.innerWidth) / 2), Math.round(controls.top + controls.height / 2)], below: [Math.round(board.left + board.width / 3), Math.round((board.bottom + window.innerHeight) / 2)] }
  })
  const typeAt = async (point, content) => {
    await p.mouse.click(...point)
    await p.keyboard.type(content)
    await draw.finishNote(p)
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

  it('a click right of the controls and one below the board each start a note there, fixed on the screen and starting at the click', async () => {
    const { right, below } = await blankPoints()
    await typeAt(right, 'R')
    await typeAt(below, 'B')
    assert.deepEqual(await texts(), ['R', 'B'])
    for (const [text, point] of [['R', right], ['B', below]]) {
      const note = await savedNote(text)
      assert.equal(note.at, undefined)
      const stored = await notePoint(text)
      assert.equal(near(stored, note.fixed), true, `${text} is stored at its screen point ${note.fixed}, drawn from ${stored}`)
      const start = await noteStart(text)
      assert.equal(near(start, point), true, `${text} starts at ${start}, clicked at ${point}`)
    }
  })

  // SudokuPad keeps a press on its panel or in a dialog from reaching any tool; a press on the top bar does reach Text
  // Annotation, and only the script's own check of the controls keeps it from starting a note there.
  it('a click on the controls\' blank space, on the top bar or in an open dialog starts no note', async () => {
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

  it('a right click beside the board has its menu suppressed, and one on a control keeps it', async () => {
    // The listener is added last, so it runs after every listener the page and the script added.
    const menuPrevented = async (point) => {
      await read(() => {
        window.__menuPrevented = []
        window.addEventListener('contextmenu', (e) => window.__menuPrevented.push(e.defaultPrevented), { once: true })
      })
      await p.mouse.click(...point, { button: 'right' })
      return read(() => window.__menuPrevented)
    }
    const undo = await p.locator('#control-undo').boundingBox()
    const { below } = await blankPoints()
    assert.deepEqual(await menuPrevented([below[0] + 60, below[1]]), [true], 'beside the board')
    assert.deepEqual(await menuPrevented([undo.x + undo.width / 2, undo.y + undo.height / 2]), [false], 'on the undo button')
  })

  it('an open dialog is drawn over the notes', async () => {
    await p.click('.draw-tool-settings')
    await p.locator(DIALOG).waitFor({ state: 'visible' })
    const covered = await draw.topmostAtNotes(p)
    await closeDialog()
    assert.deepEqual(covered, ['dialog', 'dialog'])
  })

  it('a double-click on an off-board note reopens it in place, and a right click erases it', async () => {
    const { right } = await blankPoints()
    await p.mouse.dblclick(...right)
    assert.equal(await p.locator(TEXT_BOX).textContent(), 'R')
    await draw.finishNote(p)
    await p.mouse.click(...right, { button: 'right' })
    assert.deepEqual(await texts(), ['B'])
    assert.equal(await savedNote('R'), undefined)
  })

  it('after a window resize that leaves it in reach an off-board note keeps its screen point and an on-board note stays over its cells', async () => {
    await typeAt(await gridPoint(p, ON_AT), 'G')
    const below = await notePoint('B')
    const cells = await noteInCells('G')
    await p.setViewportSize({ width: 1000, height: 900 })
    assert.deepEqual(await stable(() => noteInCells('G')), cells)
    assert.equal(near(await notePoint('B'), below), true, `the off-board note moved from ${below} to ${await notePoint('B')}`)
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
    assert.equal(near(await noteStart('G'), right), true, `starts at ${await noteStart('G')}, dropped at ${right}`)
    assert.equal(near(off.fixed, await notePoint('G')), true, `stored at ${off.fixed}, drawn from ${await notePoint('G')}`)
    assert.equal(off.at, undefined)
    await reload()
    assert.equal(near(await settle(() => noteStart('G'), await noteStart('G')), right), true, 'after a reload')
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
    // Its stored point is where the text starts, so it starts in the cell the old version drew its middle in.
    assert.deepEqual((await noteInCells('old')).map(Math.floor), ON_AT.map(Math.floor))
  })

  it('a corner drag that carries a selected off-board note past the window\'s edge ends with the note wholly inside the window, and saved there', async () => {
    await typeAt((await blankPoints()).right, 'N')
    await p.mouse.click(...await noteMiddle('N'))
    const before = (await savedNote('N')).fixed
    const handle = await p.locator('#draw-tool-layer .draw-tool-resize').last().boundingBox()
    const [x, y] = [handle.x + handle.width / 2, handle.y + handle.height / 2]
    const innerWidth = await read(() => window.innerWidth)
    assert.equal(x + 150 > innerWidth - 10, true, `the drag's end ${x + 150} is past the window's edge ${innerWidth}`)
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x + 150, y + 20, { steps: 8 })
    await draw.frames(p)
    assert.deepEqual((await savedNote('N')).fixed, before, 'the point is saved once, on the release, and does not follow the drag')
    await p.mouse.up()
    const edges = await read((selector) => {
      const { right, bottom } = [...document.querySelectorAll(selector)].find((e) => e.textContent === 'N').getBoundingClientRect()
      return { right, bottom, width: window.innerWidth, height: window.innerHeight }
    }, TEXTS)
    assert.equal(edges.right <= edges.width && edges.bottom <= edges.height, true, `the note ends at ${edges.right}, ${edges.bottom} in a ${edges.width} x ${edges.height} window`)
    const note = await savedNote('N')
    assert.equal(note.box.length, 2)
    assert.equal(near(note.fixed, await notePoint('N')), true, `saved at ${note.fixed}, drawn from ${await notePoint('N')}`)
    await draw.finishNote(p)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
