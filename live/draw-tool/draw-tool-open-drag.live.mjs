// Live check of draw-tool.user.js's drag on a note being edited, as PowerPoint does it: a drag that starts inside the open note, on its text or on empty space, selects text and
// never moves the note; a drag that starts on its edge moves it, with the move cursor there and the text cursor inside; a drag on a note not being edited still moves it.
// Real mouse input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint, mouseDrag } from '../pen.mjs'

const { HANDLES, TEXT_BOX, TEXTS } = draw
const SPOT = [4.5, 4.5]
const OTHER = [1.5, 1.5]
// A press this far outside the open note's box is on its edge: inside the hit margin, outside the box.
const EDGE_PX = 2
const GROW_PX = 80
// The drag is 64 screen pixels each way; the board's scale makes that a little less in board units.
const MOVED_UNITS = 40

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s drag on the note being edited', { concurrency: false }, () => {
  let context, p, errors

  const selection = () => p.evaluate(() => String(window.getSelection()))
  const boxOpen = async () => (await p.locator(TEXT_BOX).count()) === 1
  const box = () => p.locator(TEXT_BOX).boundingBox()
  const places = async () => (await draw.saved(p)).map((i) => i.at)
  const cursorAt = async ([x, y]) => {
    await p.mouse.move(x, y)
    return p.evaluate(([px, py]) => window.getComputedStyle(document.elementFromPoint(px, py)).cursor, [x, y])
  }
  const dragTo = async (from, to) => {
    await p.mouse.move(...from)
    await p.mouse.down()
    await p.mouse.move(...to, { steps: 6 })
    await p.mouse.up()
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.reload(p)
    await draw.pickDraw(p)
    await p.mouse.click(...await gridPoint(p, SPOT))
    await p.keyboard.type('hello world')
    // Taller than its text, so there is empty space inside it.
    const [handle] = await p.locator(HANDLES).evaluateAll((all) => all.map((e) => e.getBoundingClientRect().toJSON()).sort((a, b) => b.x + b.y - a.x - a.y))
    const from = [handle.x + handle.width / 2, handle.y + handle.height / 2]
    await dragTo(from, [from[0] + GROW_PX, from[1] + GROW_PX])
    assert.equal(await boxOpen(), true, 'the note is still open after the resize')
    await draw.finishNote(p)
    await p.mouse.click(...await gridPoint(p, OTHER))
    await p.keyboard.type('other')
    await draw.finishNote(p)
    await draw.reopen(p, await gridPoint(p, SPOT))
  })
  after(async () => { await context.close() })

  it('a drag from empty space inside the open note to over its text selects text and leaves the note where it was', async () => {
    const placesBefore = await places()
    const b = await box()
    assert.ok(b.height > 80, `the note has empty space below its text (height ${b.height})`)
    await dragTo([b.x + b.width - 10, b.y + b.height - 10], [b.x + 4, b.y + 8])
    assert.equal(await boxOpen(), true, 'the note is still open')
    assert.notEqual(await selection(), '', 'some text is selected')
    assert.deepEqual(await box(), b, 'the box has not moved')
    await draw.finishNote(p)
    assert.deepEqual(await places(), placesBefore, 'the saved place is unchanged')
  })

  it('the inside of the open note shows the text cursor, and its edge the move cursor', async () => {
    await draw.reopen(p, await gridPoint(p, SPOT))
    const b = await box()
    assert.equal(await cursorAt([b.x + b.width / 2, b.y + b.height - 10]), 'text')
    assert.equal(await cursorAt([b.x + b.width / 2, b.y - EDGE_PX]), 'move')
    assert.equal(await cursorAt([b.x - EDGE_PX, b.y + b.height / 2]), 'move')
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  })

  it('a drag from the open note\'s edge moves it', async () => {
    const [placeBefore] = await places()
    const b = await box()
    await dragTo([b.x - EDGE_PX, b.y + b.height / 2], [b.x - EDGE_PX + 64, b.y + b.height / 2 + 64])
    const [placeAfter] = await places()
    const shift = placeAfter.map((v, i) => v - placeBefore[i])
    assert.ok(shift.every((v) => v > MOVED_UNITS), `moved down and right with the pointer: ${placeBefore} to ${placeAfter}`)
  })

  it('a drag on a note not being edited still moves it', async () => {
    await draw.finishNote(p)
    const other = (await draw.saved(p)).find((i) => i.text === 'other')
    await mouseDrag(p, [OTHER, [OTHER[0] + 1, OTHER[1] + 1]])
    const moved = (await draw.saved(p)).find((i) => i.text === 'other')
    assert.notDeepEqual(moved.at, other.at)
    assert.equal(await p.locator(TEXTS).count(), 2)
  })

  it('raised no page errors', () => assert.deepEqual(errors, []))
})
