// Live check of draw-tool.user.js's resize handles on sudokupad.app: the open note, and a note alone selected, show a handle on each of their four
// corners, and several selected notes show none; dragging a handle sets the box, keeping the opposite corner and the note's focus, the text wraps and
// scrolls to fit, and the size is saved and survives a reload; the box stops at about three characters by one line, or at a short note's own size if that is smaller; a double-click on a handle sends
// the note back to auto size; and a drag on the note's body moves it and never resizes it. Real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'
import { readUntil } from '../settle.mjs'

const { TEXT_BOX, TEXTS } = draw
const HANDLE = '#draw-tool-layer .draw-tool-resize'
// In cells from the grid's top left: the note's middle, and a cell clear of it.
const NOTE_AT = [3.5, 4.5]
const EMPTY_AT = [8.5, 0.5]
const SHORT_AT = [1.5, 7.5]
const NOTE_TEXT = 'word '.repeat(12).trim()
// A real mouse lands on whole page pixels.
const NEAR_PX = 1.5
// The smallest box, in em of the note's text size.
const { MIN_BOX_EM: MIN_EM, CORNERS: CORNER_TABLE } = createRequire(import.meta.url)('../../draw-tool.user.js')
// The handles in the order of the layer: the sign on x and y of the side of the box each sits on.
const CORNERS = Object.values(CORNER_TABLE)
const BOTTOM_RIGHT = Object.keys(CORNER_TABLE).indexOf('bottomRight')

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s resize handles', { concurrency: false }, () => {
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
      scrollRoom: e.scrollHeight - e.clientHeight,
      scrollHeight: e.scrollHeight
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
    await draw.reopen(p, await gridPoint(p, NOTE_AT))
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

  it('dragging the top left handle in rewraps the text, and the size it set survives a reload', async () => {
    await p.mouse.click(...await middleOfNote())
    const before = await box(TEXTS)
    await dragHandle(40, 0, 0)
    const after = await box(TEXTS)
    assert.ok(near(after.right - after.left, before.right - before.left - 40), `${after.right - after.left} wide from ${before.right - before.left}`)
    assert.ok(after.scrollHeight > before.scrollHeight, `the text is ${after.scrollHeight} high from ${before.scrollHeight}: it wrapped onto more lines`)
  })

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
    const [from, to] = [await gridPoint(p, corner), await gridPoint(p, [corner[0] + 1, corner[1] + 1])]
    await p.mouse.move(...from)
    await p.mouse.down()
    await p.mouse.move(...to, { steps: 8 })
    await draw.frames(p)
    assert.equal(await handleCount(), 0, 'the handles are off while the note moves')
    await p.mouse.up()
    const moved = (await saved())[0]
    assert.deepEqual(moved.box, stored.box, 'the box is unchanged')
    assert.notDeepEqual(moved.at, stored.at, 'the note moved')
    assert.equal(await handleCount(), 4, 'the moved note is still the one selected')
  })

  it('a press away from the open note finishes it, and its handles go with it', async () => {
    await draw.reopen(p, await gridPoint(p, [NOTE_AT[0] + 1, NOTE_AT[1] + 1]))
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

  it('a note narrower than three characters widened by a handle shrinks back to its own size and no further', async () => {
    await p.mouse.click(...await gridPoint(p, SHORT_AT))
    await p.keyboard.type('hi')
    await p.keyboard.press('Escape')
    await p.mouse.click(...await gridPoint(p, SHORT_AT))
    const index = (await saved()).length - 1
    const start = await box(TEXTS + ':last-of-type')
    const startWidth = start.right - start.left
    assert.ok(startWidth < MIN_EM[0] * start.em * start.scale - NEAR_PX, `${startWidth} wide is under the three characters of the minimum box`)
    await dragHandle(80, 0)
    const wide = await box(TEXTS + ':last-of-type')
    assert.ok(wide.right - wide.left > startWidth + 40, `${wide.right - wide.left} wide after the widen`)
    await dragHandle(-300, 0)
    const back = await box(TEXTS + ':last-of-type')
    assert.ok(back.right - back.left <= startWidth + NEAR_PX, `${back.right - back.left} wide after the shrink, started at ${startWidth}`)
    assert.ok(near(back.bottom - back.top, start.bottom - start.top), 'the text did not wrap onto a second line')
    assert.equal((await saved()).length, index + 1)
    await p.keyboard.press('Delete')
  })

  it('a new note still open, shrunk by its handle, stops at the minimum box and not at one character', async () => {
    await p.mouse.click(...await gridPoint(p, SHORT_AT))
    await p.keyboard.type(NOTE_TEXT)
    await dragHandle(-1000, -1000)
    const smallest = await box(TEXT_BOX)
    assert.ok(near(smallest.right - smallest.left, MIN_EM[0] * smallest.em), `${smallest.right - smallest.left} wide, em ${smallest.em}`)
    await p.keyboard.press('Escape')
    await p.mouse.click(...await gridPoint(p, SHORT_AT))
    await p.keyboard.press('Delete')
  })

  it('pressing a handle of a scrolled note leaves its scroll where it was', async () => {
    await p.keyboard.press('Escape')
    await p.mouse.click(...await middleOfNote())
    const scrolled = await read((s) => {
      const note = document.querySelector(s)
      note.scrollTop = 10
      return note.scrollTop
    }, TEXTS)
    assert.ok(scrolled > 0, 'the note scrolls')
    const [x, y] = await handleMiddle()
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.up()
    assert.equal(await read((s) => document.querySelector(s).scrollTop, TEXTS), scrolled)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
