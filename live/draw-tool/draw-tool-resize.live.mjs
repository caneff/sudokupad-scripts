// Live check of draw-tool.user.js's resize handles on sudokupad.app: the open note, and a note alone selected, show a handle on each of their four
// corners, and several selected notes show none; dragging a handle sets the box, keeping the opposite corner and the note's focus, the text wraps and
// scrolls to fit, and the size is saved and survives a reload; the box stops at about three characters by one line; a double-click on a handle sends
// the note back to auto size; and a drag on the note's body moves it and never resizes it. Real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint, mouseDrag } from '../pen.mjs'
import { readUntil } from '../settle.mjs'

const { TEXT_BOX, TEXTS } = draw
const HANDLE = '#draw-tool-layer .draw-tool-resize'
// The handles in the order of the layer: the sign on x and y of the side of the box each sits on, as the script's CORNERS has them.
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
const BOTTOM_RIGHT = 3
// In cells from the grid's top left: the note's middle, and a cell clear of it.
const NOTE_AT = [3.5, 4.5]
const EMPTY_AT = [8.5, 0.5]
const NOTE_TEXT = 'word '.repeat(12).trim()
// A real mouse lands on whole page pixels.
const NEAR_PX = 1.5
// The smallest box, in em of the note's text size.
const { MIN_BOX_EM: MIN_EM } = createRequire(import.meta.url)('../../draw-tool.user.js')

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Annotation\'s resize handle', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const saved = () => draw.saved(p)
  // The note's text box inside its padding, on the screen, with its text size and how far its text runs past it.
  const box = (selector) => read((s) => {
    const e = document.querySelector(s)
    const r = e.getBoundingClientRect()
    const style = window.getComputedStyle(e)
    const pad = (side) => parseFloat(style[`padding${side}`])
    return {
      left: r.left + pad('Left'),
      top: r.top + pad('Top'),
      right: r.right - pad('Right'),
      bottom: r.bottom - pad('Bottom'),
      em: parseFloat(style.fontSize),
      // Screen pixels per pixel of the note's own box: the board's scale for a note on the board.
      scale: r.width / e.offsetWidth,
      scrollRoom: e.scrollHeight - e.clientHeight
    }
  }, selector)
  const handleCount = () => p.locator(HANDLE).count()
  const handleMiddle = async (which = BOTTOM_RIGHT) => {
    const { x, y, width, height } = await p.locator(HANDLE).nth(which).boundingBox()
    return [x + width / 2, y + height / 2]
  }
  // A press on the handle dragged by (dx, dy) screen pixels.
  const dragHandle = async (dx, dy, which = BOTTOM_RIGHT) => {
    const [x, y] = await handleMiddle(which)
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x + dx, y + dy, { steps: 8 })
    await p.mouse.up()
  }
  const near = (a, b) => Math.abs(a - b) <= NEAR_PX

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.reload(p)
    await draw.pickDraw(p)
  })
  after(async () => { await context.close() })

  it('the open note shows a handle on each corner, and a finished note has none', async () => {
    await p.mouse.click(...await gridPoint(p, NOTE_AT))
    await p.keyboard.type(NOTE_TEXT)
    assert.equal(await handleCount(), 4)
    const edges = await read((s) => {
      const { left, top, right, bottom } = document.querySelector(s).getBoundingClientRect()
      return { left, top, right, bottom }
    }, TEXT_BOX)
    for (const [which, [sx, sy]] of CORNERS.entries()) {
      const [x, y] = await handleMiddle(which)
      const corner = [sx < 0 ? edges.left : edges.right, sy < 0 ? edges.top : edges.bottom]
      assert.ok(near(x, corner[0]) && near(y, corner[1]), `handle ${which} at ${x}, ${y}; corner at ${corner}`)
    }
    await p.keyboard.press('Escape')
    assert.equal(await handleCount(), 0)
    assert.equal((await saved())[0].box, undefined, 'a note never resized stores no box')
  })

  it('dragging the handle sets the box with its top left kept, the text wraps and scrolls to fit, and the note keeps the focus', async () => {
    await p.mouse.dblclick(...await gridPoint(p, NOTE_AT))
    // The double-click selects the word under it, as in any editable text.
    await p.keyboard.press('Control+End')
    const before = await box(TEXT_BOX)
    const [width, height] = [before.em * 5, before.em * 1.5]
    await dragHandle(before.left + width - before.right, before.top + height - before.bottom)
    const after = await box(TEXT_BOX)
    assert.ok(near(after.left, before.left) && near(after.top, before.top), `top left ${after.left}, ${after.top} was ${before.left}, ${before.top}`)
    assert.ok(near(after.right - after.left, width) && near(after.bottom - after.top, height), `${after.right - after.left} x ${after.bottom - after.top}, dragged to ${width} x ${height}`)
    assert.ok(after.scrollRoom > 0, 'the text runs past the smaller box')
    await p.keyboard.type('Z')
    await p.keyboard.press('Escape')
    assert.equal((await draw.texts(p))[0], `${NOTE_TEXT}Z`, 'the key typed after the drag went into the note')
    const finished = await box(TEXTS)
    assert.ok(near(finished.right - finished.left, width) && near(finished.bottom - finished.top, height), 'the finished note keeps the box')
  })

  it('the size is stored on the note and survives a reload', async () => {
    const stored = (await saved())[0].box
    assert.equal(stored.length, 2)
    const before = await box(TEXTS)
    await draw.reload(p)
    await readUntil(() => draw.texts(p), (t) => t.length === 1)
    assert.deepEqual((await saved())[0].box, stored)
    const after = await box(TEXTS)
    assert.ok(near(after.right - after.left, before.right - before.left) && near(after.bottom - after.top, before.bottom - before.top), `${after.right - after.left} x ${after.bottom - after.top} after the reload`)
    await draw.pickDraw(p)
  })

  it('the box stops at about three characters wide and one line high, and a resize with no text typed is saved', async () => {
    // The resize kept the note's top left, so its middle has moved off NOTE_AT.
    const { left, top, right, bottom } = await box(TEXTS)
    await p.mouse.dblclick((left + right) / 2, (top + bottom) / 2)
    assert.equal((await draw.texts(p)).length, 0, 'the note itself is open')
    await dragHandle(-1000, -1000)
    const smallest = await box(TEXT_BOX)
    assert.ok(near(smallest.right - smallest.left, MIN_EM[0] * smallest.em) && near(smallest.bottom - smallest.top, MIN_EM[1] * smallest.em), `${smallest.right - smallest.left} x ${smallest.bottom - smallest.top}`)
    await p.keyboard.press('Escape')
    // The note's text size is 20 board units.
    assert.deepEqual((await saved())[0].box, MIN_EM.map((em) => em * 20))
  })

  // The note's middle on the screen.
  const middleOfNote = async () => {
    const { left, top, right, bottom } = await box(TEXTS)
    return [(left + right) / 2, (top + bottom) / 2]
  }

  it('a note selected alone shows a handle on each corner, and two selected notes show none', async () => {
    await p.mouse.click(...await middleOfNote())
    assert.equal(await handleCount(), 4)
    await p.keyboard.press('Escape')
    assert.equal(await handleCount(), 0, 'no selection, no handles')
    await p.mouse.click(...await gridPoint(p, EMPTY_AT))
    await p.keyboard.type('two')
    await p.keyboard.press('Escape')
    await p.mouse.click(...await middleOfNote())
    await p.keyboard.down('Shift')
    await p.mouse.click(...await gridPoint(p, EMPTY_AT))
    await p.keyboard.up('Shift')
    assert.equal(await handleCount(), 0)
    await p.keyboard.press('Escape')
    // Leaves only the first note.
    await p.mouse.click(...await gridPoint(p, EMPTY_AT))
    await p.keyboard.press('Delete')
    assert.deepEqual(await draw.texts(p), [`${NOTE_TEXT}Z`])
  })

  for (const [which, [sx, sy]] of CORNERS.entries()) {
    it(`dragging the ${sy < 0 ? 'top' : 'bottom'} ${sx < 0 ? 'left' : 'right'} handle of a selected note resizes it with the opposite corner held and the font size unchanged`, async () => {
      await p.mouse.click(...await middleOfNote())
      const before = await box(TEXTS)
      await dragHandle(sx * 30, sy * 15, which)
      const after = await box(TEXTS)
      const fixed = { x: sx < 0 ? 'right' : 'left', y: sy < 0 ? 'bottom' : 'top' }
      assert.ok(near(after[fixed.x], before[fixed.x]) && near(after[fixed.y], before[fixed.y]), `the ${fixed.x} ${fixed.y} corner moved to ${after[fixed.x]}, ${after[fixed.y]} from ${before[fixed.x]}, ${before[fixed.y]}`)
      assert.ok(near(after.right - after.left, before.right - before.left + 30) && near(after.bottom - after.top, before.bottom - before.top + 15), `${after.right - after.left} x ${after.bottom - after.top} from ${before.right - before.left} x ${before.bottom - before.top}`)
      assert.equal(after.em, before.em)
      assert.equal(await handleCount(), 4, 'the note is still selected')
    })
  }

  it('the size a corner drag set is saved and survives a reload', async () => {
    const stored = (await saved())[0].box
    const before = await box(TEXTS)
    await draw.reload(p)
    await readUntil(() => draw.texts(p), (t) => t.length === 1)
    assert.deepEqual((await saved())[0].box, stored)
    const after = await box(TEXTS)
    assert.ok(near(after.left, before.left) && near(after.top, before.top) && near(after.right, before.right) && near(after.bottom, before.bottom), 'the note is where it was, at the size it was')
    await draw.pickDraw(p)
  })

  it('the top left handle stops at the minimum box with the bottom right corner held', async () => {
    await p.mouse.click(...await middleOfNote())
    const before = await box(TEXTS)
    await dragHandle(1000, 1000, 0)
    const after = await box(TEXTS)
    assert.ok(near(after.right, before.right) && near(after.bottom, before.bottom), `the bottom right corner moved to ${after.right}, ${after.bottom}`)
    assert.ok(near(after.right - after.left, MIN_EM[0] * after.em * after.scale) && near(after.bottom - after.top, MIN_EM[1] * after.em * after.scale), `${after.right - after.left} x ${after.bottom - after.top}`)
  })

  it('a double-click on a handle sends a selected note back to auto size, which survives a reload', async () => {
    await dragHandle(150, 40)
    assert.equal((await saved())[0].box.length, 2)
    const wide = await box(TEXTS)
    await p.mouse.dblclick(...await handleMiddle())
    assert.equal((await saved())[0].box, undefined)
    const auto = await box(TEXTS)
    assert.ok(Math.abs(auto.right - auto.left - (wide.right - wide.left)) > NEAR_PX, 'the note changed size')
    assert.equal(await handleCount(), 4)
    await draw.reload(p)
    await readUntil(() => draw.texts(p), (t) => t.length === 1)
    assert.equal((await saved())[0].box, undefined)
    await draw.pickDraw(p)
  })

  it('a double-click on a handle of the open note sends it back to auto size', async () => {
    await p.mouse.click(...await middleOfNote())
    await dragHandle(-20, -5)
    assert.equal((await saved())[0].box.length, 2)
    await p.mouse.dblclick(...await middleOfNote())
    assert.equal((await draw.texts(p)).length, 0, 'the note itself is open')
    await p.mouse.dblclick(...await handleMiddle())
    await p.keyboard.press('Escape')
    assert.equal((await saved())[0].box, undefined)
    // Leaves the note with a box for the checks below.
    await p.mouse.click(...await middleOfNote())
    await dragHandle(-20, -5)
    await p.keyboard.press('Escape')
    assert.equal((await saved())[0].box.length, 2)
  })

  it('off the editor, a drag from the note\'s bottom right corner moves it and never resizes it', async () => {
    const stored = (await saved())[0]
    const { right, bottom } = await box(TEXTS)
    const corner = await read(([x, y]) => {
      const cell = Framework.app.grid.getCell(0, 0).elem.getBoundingClientRect()
      return [(y - cell.y) / cell.height, (x - cell.x) / cell.width]
    }, [right - 2, bottom - 2])
    await mouseDrag(p, [corner, [corner[0] + 1, corner[1] + 1]])
    const moved = (await saved())[0]
    assert.deepEqual(moved.box, stored.box, 'the box is unchanged')
    assert.notDeepEqual(moved.at, stored.at, 'the note moved')
    assert.equal(await handleCount(), 4, 'the moved note is still the one selected')
  })

  it('a press away from the open note finishes it, and its handle goes with it', async () => {
    await p.mouse.dblclick(...await gridPoint(p, [NOTE_AT[0] + 1, NOTE_AT[1] + 1]))
    assert.equal(await handleCount(), 4)
    await p.mouse.click(...await gridPoint(p, EMPTY_AT))
    assert.equal(await handleCount(), 0)
  })

  it('a right click on the handle erases nothing and leaves the note open', async () => {
    const before = (await saved()).map((item) => item.text)
    await p.mouse.click(...await gridPoint(p, EMPTY_AT))
    await p.keyboard.type('second')
    await p.keyboard.press('Escape')
    const { left, top, right, bottom } = await box(TEXTS)
    await p.mouse.dblclick((left + right) / 2, (top + bottom) / 2)
    await p.mouse.click(...await handleMiddle(), { button: 'right' })
    assert.equal(await p.locator(TEXT_BOX).count(), 1, 'the note is still open')
    await p.keyboard.press('Escape')
    assert.deepEqual((await saved()).map((item) => item.text), [...before, 'second'])
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
