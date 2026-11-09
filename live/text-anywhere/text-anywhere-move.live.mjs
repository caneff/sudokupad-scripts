// Live check of draw-tool.user.js's moving on sudokupad.app: a left-drag that starts on a note moves it (following the pointer, and kept over a
// reload), a drag may drop the note on the controls but never off the window, a double-click on a note still edits it, a drag that starts off every note makes nothing, and a
// moved note keeps its background. Real mouse input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { settle } from '../settle.mjs'
import { useBrowser } from '../session.mjs'
import { finishNote, gridPoint, mouseDrag, typeText } from '../board.mjs'

const { BACKGROUND_BUTTON, NOT_NOTES, TEXT_BGS, TEXT_BOX, TEXTS } = textAnywhere
// SudokuPad's board draws a cell 64 units wide from (0, 0); a real mouse lands on whole page pixels, so positions are checked to within a unit.
const CELL = 64
const NEAR_UNITS = 1.5
// In cells from the grid's top left: a note at r8c6, a second at r3c3 made with Background on, and a press clear of both.
const TEXT_AT = [7.5, 5.5]
const SECOND_AT = [2.5, 2.5]
const EMPTY = [6.2, 4.5]
// A drag is by (rows, columns) cells.
const BY = [1, 2]

const browser = useBrowser()

describe('Text Anywhere\'s moving', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const saved = () => textAnywhere.saved(p)
  // A reload leaves Text Anywhere not current.
  const reload = () => textAnywhere.reloadOnTextAnywhere(p)
  const texts = () => textAnywhere.texts(p)
  const near = (got, want) => got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) <= NEAR_UNITS)
  const dragBy = (from) => mouseDrag(p, [from, [from[0] + BY[0], from[1] + BY[1]]])
  const textAts = async () => (await saved()).filter((i) => i.kind === 'text').map((i) => i.at)
  const bgBoxes = () => read((selector) => {
    const toBoard = Framework.app.svgRenderer.getElem().getScreenCTM().inverse()
    return [...document.querySelectorAll(selector)].map((e) => {
      const { x, y } = new window.DOMPoint(e.getBoundingClientRect().x, e.getBoundingClientRect().y).matrixTransform(toBoard)
      return [x, y]
    })
  }, TEXT_BGS)

  before(async () => {
    ;({ context, p, errors } = await textAnywhere.open(browser()))
    await textAnywhere.forgetNotes(p)
    await reload()
  })
  after(async () => { await context.close() })

  it('a double-click on a note still edits it, and a left-drag that starts on it moves it, keeps the text, and a reload keeps the new place', async () => {
    await typeText(p, TEXT_AT, '15')
    assert.deepEqual(await texts(), ['15'])
    await textAnywhere.reopen(p, await gridPoint(p, TEXT_AT))
    assert.equal(await p.locator(TEXT_BOX).textContent(), '15', 'the double-click reopened the text')
    await finishNote(p)
    const [before] = await textAts()
    await p.mouse.move(...await gridPoint(p, TEXT_AT))
    await p.mouse.down()
    await p.mouse.move(...await gridPoint(p, [TEXT_AT[0] + BY[0], TEXT_AT[1] + BY[1]]), { steps: 8 })
    const duringBox = await p.locator(TEXTS).boundingBox()
    await p.mouse.up()
    const [after] = await textAts()
    assert.equal(near(after, [before[0] + BY[1] * CELL, before[1] + BY[0] * CELL]), true, `the note ${after} moved from ${before}`)
    assert.equal(await p.locator(TEXT_BOX).count(), 0, 'no text box opened')
    assert.deepEqual(await texts(), ['15'])
    const endBox = await p.locator(TEXTS).boundingBox()
    assert.equal(Math.hypot(duringBox.x - endBox.x, duringBox.y - endBox.y) <= textAnywhere.NEAR_PX + textAnywhere.CRISP_PX, true, `the note followed the pointer before the release: at ${[duringBox.x, duringBox.y]}, placed at ${[endBox.x, endBox.y]}`)
    await reload()
    assert.deepEqual(await settle(textAts, [after]), [after])
  })

  it('a drag that starts off every note makes no note and no stroke, and moves nothing', async () => {
    const before = await saved()
    await textAnywhere.pickTextAnywhere(p)
    await mouseDrag(p, [EMPTY, [EMPTY[0] + 1, EMPTY[1] + 0.6], [EMPTY[0] + 0.5, EMPTY[1] + 2]])
    assert.equal(await p.locator(NOT_NOTES).count(), 0)
    assert.equal(await p.locator(TEXT_BOX).count(), 0)
    assert.deepEqual(await saved(), before)
  })

  it('a note made with Background on keeps its box with it when moved, and a reload shows the box in the new place', async () => {
    await p.click(BACKGROUND_BUTTON)
    await typeText(p, SECOND_AT, '7')
    await p.click(BACKGROUND_BUTTON)
    assert.equal(await p.locator(TEXT_BGS).count(), 1)
    const [boxBefore] = await bgBoxes()
    await dragBy(SECOND_AT)
    const [boxAfter] = await bgBoxes()
    assert.equal(near(boxAfter, [boxBefore[0] + BY[1] * CELL, boxBefore[1] + BY[0] * CELL]), true, `the box ${boxAfter} moved from ${boxBefore}`)
    assert.equal((await saved())[1].bg, true)
    await reload()
    assert.deepEqual(await settle(bgBoxes, [boxAfter]), [boxAfter])
  })

  it('a drag held, or ended, over the controls stays there, and one past the window leaves the note inside it', async () => {
    // Found by its text, since a note dropped off the board leaves the board's group.
    const [text] = await texts()
    const reachable = () => read(([selector, content]) => {
      const note = [...document.querySelectorAll(selector)].find((e) => e.textContent === content).getBoundingClientRect()
      const [x, y] = [note.x + note.width / 2, note.y + note.height / 2]
      return { point: [x, y], reachable: x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight }
    }, [TEXTS, text])
    const keypad = await p.locator('.controls-input').boundingBox()
    const overKeypad = [keypad.x + keypad.width / 2, keypad.y + keypad.height / 2]
    for (const to of [overKeypad, [3000, 300]]) {
      const { point } = await reachable()
      await p.mouse.move(...point)
      await p.mouse.down()
      // Steps shorter than the note, so each move's point lies under the note as last drawn, which takes the pointer.
      await p.mouse.move(...to, { steps: 80 })
      // A held drag shows its last moves at the next frame.
      await read(() => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))))
      const held = await reachable()
      await p.mouse.up()
      const after = await reachable()
      assert.equal(held.reachable, true, `held at ${to}, the note is at ${held.point}`)
      assert.equal(after.reachable, true, `dragged to ${to}, the note is at ${after.point}`)
      if (to === overKeypad) {
        assert.equal(held.point.every((v, i) => Math.abs(v - to[i]) <= 3) && after.point.every((v, i) => Math.abs(v - to[i]) <= 3), true, `dragged onto the controls at ${to}, held at ${held.point} and dropped at ${after.point}`)
        // A note dropped on the controls takes a press again: another drag moves it.
        await p.mouse.move(...after.point)
        await p.mouse.down()
        await p.mouse.move(after.point[0] - 40, after.point[1] - 40, { steps: 8 })
        await p.mouse.up()
        const again = await reachable()
        assert.equal(again.point.every((v, i) => Math.abs(v - (after.point[i] - 40)) <= 3), true, `pressed on the controls at ${after.point} and dragged 40 px up and left, the note is at ${again.point}`)
      }
    }
  })

  it('the page shows no error', () => {
    assert.deepEqual(errors, [])
  })
})
