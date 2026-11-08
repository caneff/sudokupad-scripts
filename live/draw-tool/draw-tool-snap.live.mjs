// Live check of draw-tool.user.js's snap on sudokupad.app: a dragged note is pulled onto a cell line when its selection outline's line is within 4 px of it
// and the pointer moves slowly (or has stopped), and a faint guide line shows while it is; 6 px off it, or in a fast drag, it stays where the pointer put it
// and no guide shows. Real mouse input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { cellCentre, gridPoint } from '../pen.mjs'

const { TEXT_BOX, TEXTS } = draw
const SELECTION = '#draw-tool-layer .draw-tool-selection'
const GUIDE_X = '#draw-tool-layer .draw-tool-snap-guide[data-axis="x"]'
// The selection outline's line is 2 px wide, 2 px outside the note's box: its middle is 3 px out.
const OUTLINE_MIDDLE_PX = 3
const TEXT_AT = [7.5, 5.5]
const OTHER_AT = [2.5, 2.5]
const COLUMN_LINE = 5
const NEAR_PX = 0.6
// What an earlier version saved, planted as it wrote it, and a note.
const OLD_STROKE = { kind: 'stroke', color: 2, width: 6, opacity: 100, points: [[100, 100], [300, 200], [500, 100]] }
const OLD_SHAPE = { kind: 'shape', shape: 'rect', color: 3, width: 4, opacity: 60, box: [64, 320, 256, 448] }
const NOTE = { kind: 'text', color: 1, size: 20, opacity: 100, text: '15', at: [160, 160] }

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s snap', { concurrency: false }, () => {
  let context, p, errors

  // The page x of the grid's column line `k`.
  const lineX = async (k) => {
    const [x0, , size] = await cellCentre(p, 0, 0)
    return x0 - size / 2 + k * size
  }
  const outlineLeft = async () => (await p.locator(SELECTION).boundingBox()).x - OUTLINE_MIDDLE_PX
  const noteBox = (text) => p.locator(TEXTS, { hasText: text }).boundingBox()
  // Presses the note '15' and drags it by `dx` px along the row, then `wiggle` px further, reading its outline and the x guide before the release. The moves
  // arrive at once, which is a fast drag: a drag that `snaps` is read once the pointer has stood still long enough for the pull to show.
  const dragBy = async (dx, wiggle = 0, snaps = false) => {
    const note = await noteBox('15')
    const [px, py] = [note.x + note.width / 2, note.y + note.height / 2]
    await p.mouse.move(px, py)
    await p.mouse.down()
    await p.mouse.move(px + dx, py, { steps: 6 })
    if (wiggle) await p.mouse.move(px + dx + wiggle, py)
    if (snaps) await p.locator(GUIDE_X).waitFor()
    const during = { left: await outlineLeft(), guides: await p.locator(GUIDE_X).count() }
    const guideBox = during.guides ? await p.locator(GUIDE_X).boundingBox() : null
    await p.mouse.up()
    return { ...during, guideBox }
  }
  // Drags the note so its outline's left line lies `gap` px right of column line `COLUMN_LINE`.
  const dragToGap = async (gap, snaps = false) => dragBy(await lineX(COLUMN_LINE) + gap - ((await noteBox('15')).x - OUTLINE_MIDDLE_PX), 0, snaps)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.reload(p)
    await draw.pickDraw(p)
    await p.mouse.click(...await gridPoint(p, TEXT_AT))
    await p.keyboard.type('15')
    await p.keyboard.press('Escape')
    assert.equal(await p.locator(TEXT_BOX).count(), 0)
    await p.mouse.click(...await gridPoint(p, OTHER_AT))
    await p.keyboard.type('2')
    await p.keyboard.press('Escape')
    assert.equal(await p.locator(TEXT_BOX).count(), 0)
  })
  after(async () => { await context.close() })

  it('a note dragged to 2 px from a cell line lands with its outline on the line and shows the guide there, then the guide goes', async () => {
    const line = await lineX(COLUMN_LINE)
    const { left, guides, guideBox } = await dragToGap(2, true)
    assert.equal(guides, 1, 'the guide shows while snapped')
    assert.equal(Math.abs(left - line) < NEAR_PX, true, `the outline's line ${left} is on the cell line ${line} during the drag`)
    assert.equal(Math.abs(guideBox.x + guideBox.width / 2 - line) < NEAR_PX, true, `the guide is at ${guideBox.x}, the line at ${line}`)
    assert.equal(Math.abs(await outlineLeft() - line) < NEAR_PX, true, 'the note stays on the line after the release')
    assert.equal(await p.locator(GUIDE_X).count(), 0, 'the guide goes with the release')
  })

  it('a fast drag to 2 px from a cell line passes it freely: no pull and no guide', async () => {
    const line = await lineX(COLUMN_LINE)
    const note = await noteBox('15')
    const [px, py] = [note.x + note.width / 2, note.y + note.height / 2]
    const gap = line + 2 - (note.x - OUTLINE_MIDDLE_PX)
    await p.mouse.move(px, py)
    await p.mouse.down()
    // Out 150 px and back in 4 moves a leg: tens of px a frame, well over 0.5 px/ms.
    await p.mouse.move(px - 150, py, { steps: 4 })
    await p.mouse.move(px + gap, py, { steps: 4 })
    // One read, so the pointer has no time to rest between the outline and the guide.
    const { left, guides } = await p.evaluate(([selection, guide, middle]) => ({ left: document.querySelector(selection).getBoundingClientRect().x - middle, guides: document.querySelectorAll(guide).length }), [SELECTION, GUIDE_X, OUTLINE_MIDDLE_PX])
    await p.mouse.up()
    assert.equal(guides, 0, 'no guide while the pointer is fast')
    assert.equal(Math.abs(left - (line + 2)) < NEAR_PX, true, `the outline's line ${left} is where the pointer put it, 2 px past ${line}`)
  })

  it('a fast drag that stops short of the line is pulled onto it once the pointer rests, and drops there', async () => {
    const line = await lineX(COLUMN_LINE)
    const note = await noteBox('15')
    const [px, py] = [note.x + note.width / 2, note.y + note.height / 2]
    const gap = line + 2 - (note.x - OUTLINE_MIDDLE_PX)
    await p.mouse.move(px, py)
    await p.mouse.down()
    await p.mouse.move(px - 150, py, { steps: 4 })
    await p.mouse.move(px + gap, py, { steps: 4 })
    await p.locator(GUIDE_X).waitFor()
    const left = await outlineLeft()
    await p.mouse.up()
    assert.equal(Math.abs(left - line) < NEAR_PX, true, `the outline's line ${left} is on the line ${line}`)
    assert.equal(Math.abs(await outlineLeft() - line) < NEAR_PX, true, 'and stays there after the release')
  })

  it('a fast drag released at once drops where the pointer put it, with no jump onto the line', async () => {
    const line = await lineX(COLUMN_LINE)
    const note = await noteBox('15')
    const [px, py] = [note.x + note.width / 2, note.y + note.height / 2]
    const gap = line + 2 - (note.x - OUTLINE_MIDDLE_PX)
    await p.mouse.move(px, py)
    await p.mouse.down()
    await p.mouse.move(px - 150, py, { steps: 4 })
    await p.mouse.move(px + gap, py, { steps: 4 })
    await p.mouse.up()
    assert.equal(Math.abs(await outlineLeft() - (line + 2)) < NEAR_PX, true, 'dropped 2 px past the line, as it was drawn')
  })

  it('with Shift held the locked axis is not pulled: only the free axis snaps', async () => {
    const line = await lineX(COLUMN_LINE)
    await dragToGap(2)
    const note = await noteBox('15')
    const [px, py] = [note.x + note.width / 2, note.y + note.height / 2]
    await p.mouse.move(px, py)
    await p.mouse.down()
    await p.keyboard.down('Shift')
    await p.mouse.move(px + 1, py + 40, { steps: 4 })
    // Nothing is to happen: the note rests 2 px from the x line, which a free drag would be pulled onto after 100 ms, and Shift locks x.
    await p.waitForTimeout(300)
    const left = await outlineLeft()
    const guides = await p.locator(GUIDE_X).count()
    await p.mouse.up()
    await p.keyboard.up('Shift')
    assert.equal(guides, 0, 'no x guide')
    assert.equal(Math.abs(left - (line + 2)) < NEAR_PX, true, `x stays ${line + 2}, not pulled to ${line}: ${left}`)
  })

  it('a slow drag is pulled while the pointer is still moving: 4 px a frame (about 0.25 px/ms) into the pull shows the guide', async () => {
    const line = await lineX(COLUMN_LINE)
    await dragToGap(-60)
    const note = await noteBox('15')
    const [px, py] = [note.x + note.width / 2, note.y + note.height / 2]
    const gap = line + 4 - (note.x - OUTLINE_MIDDLE_PX)
    await p.mouse.move(px, py)
    await p.mouse.down()
    for (let dx = 4; dx <= gap; dx += 4) {
      await p.mouse.move(px + dx, py)
      await draw.frames(p)
    }
    const guides = await p.locator(GUIDE_X).count()
    const left = await outlineLeft()
    await p.mouse.up()
    assert.equal(guides, 1, 'the guide shows with the pointer still moving')
    assert.equal(Math.abs(left - line) < NEAR_PX, true, `the outline's line ${left} is on the line ${line}`)
  })

  it('a note dragged 6 px off the line stays where the pointer put it and shows no x guide', async () => {
    const line = await lineX(COLUMN_LINE)
    const { left, guides } = await dragToGap(6)
    assert.equal(guides, 0, 'no guide')
    assert.equal(Math.abs(left - (line + 6)) < NEAR_PX, true, `the outline's line ${left} is 6 px past ${line}`)
  })

  it('a note dragged 3 px from where it began, clear of every target, moves exactly 3 px: the notes being dragged are no targets', async () => {
    const before = (await noteBox('15')).x
    const { guides } = await dragBy(3)
    assert.equal(guides, 0, 'no guide')
    assert.equal(Math.abs((await noteBox('15')).x - (before + 3)) < NEAR_PX, true, 'the note moved with the pointer')
  })

  it('releasing a snapped note never jumps: the pointer moving 0.5 px further within the pull leaves it on the line, drawn and saved', async () => {
    const line = await lineX(COLUMN_LINE)
    const gap = line + 2 - ((await noteBox('15')).x - OUTLINE_MIDDLE_PX)
    const { left } = await dragBy(gap, 0.5, true)
    assert.equal(Math.abs(left - line) < NEAR_PX, true, `the outline's line ${left} is on the line ${line} before the release`)
    assert.equal(Math.abs(await outlineLeft() - left) < 0.05, true, 'the release moved the outline')
    const [at] = (await draw.saved(p)).filter((item) => item.kind === 'text' && item.text === '15').map((item) => item.at)
    await draw.reload(p)
    await draw.pickDraw(p)
    assert.equal(Math.abs((await noteBox('15')).x - OUTLINE_MIDDLE_PX - line) < NEAR_PX, true, `the saved note ${at} is drawn on the line again after a reload`)
  })

  it('a note dragged to 2 px from another note\'s left edge lands with the two left edges equal and the guide where its outline lies', async () => {
    const other = await noteBox('2')
    const { x } = await noteBox('15')
    const { left, guides, guideBox } = await dragBy(other.x + 2 - x, 0, true)
    assert.equal(guides, 1, 'the guide shows while snapped')
    assert.equal(Math.abs(left - (other.x - OUTLINE_MIDDLE_PX)) < NEAR_PX, true, `the outline's line ${left} is ${OUTLINE_MIDDLE_PX} px left of the other note's left edge ${other.x}`)
    assert.equal(Math.abs(guideBox.x + guideBox.width / 2 - left) < NEAR_PX, true, `the guide ${guideBox.x} is on the outline's line ${left}`)
    assert.equal(Math.abs((await noteBox('15')).x - other.x) < NEAR_PX, true, 'the two left edges are equal after the release')
  })

  it('a note still drags beside an older version\'s stroke and shape, which are no targets', async () => {
    await draw.plantDrawing(p, [OLD_STROKE, NOTE, OLD_SHAPE])
    await draw.reload(p)
    await draw.pickDraw(p)
    const before = (await noteBox('15')).x
    await dragBy(40)
    assert.equal(Math.abs((await noteBox('15')).x - (before + 40)) < 4 + NEAR_PX, true, 'the note moved with the pointer, to within the pull')
  })

  it('the page raised no error', () => assert.deepEqual(errors, []))
})
