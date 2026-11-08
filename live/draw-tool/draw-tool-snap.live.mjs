// Live check of draw-tool.user.js's snap on sudokupad.app: a dragged note is pulled onto a cell line when its selection outline's line is within 4 px of it,
// and a faint guide line shows while it is; 6 px off it stays where the pointer put it and no guide shows. Real mouse input throughout.
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
const OUTLINE_ON_GUIDE_PX = 0.25
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
  // Presses the note '15' and drags it by `dx` px along the row, then `wiggle` px further, reading its outline and the x guide before the release.
  const dragBy = async (dx, wiggle = 0) => {
    const note = await noteBox('15')
    const [px, py] = [note.x + note.width / 2, note.y + note.height / 2]
    await p.mouse.move(px, py)
    await p.mouse.down()
    await p.mouse.move(px + dx, py, { steps: 6 })
    if (wiggle) await p.mouse.move(px + dx + wiggle, py)
    const during = { left: await outlineLeft(), guides: await p.locator(GUIDE_X).count() }
    const guideBox = during.guides ? await p.locator(GUIDE_X).boundingBox() : null
    await p.mouse.up()
    return { ...during, guideBox }
  }
  // The outline's line lies on its guide, during the drag (`during`) and after the release, to a quarter pixel: the note lands on whole device pixels and the guide moves with it.
  const assertOnGuide = async (during, guideBox) => {
    const guide = guideBox.x + guideBox.width / 2
    assert.equal(Math.abs(during - guide) < OUTLINE_ON_GUIDE_PX, true, `the outline's line ${during} is off its guide ${guide} during the drag`)
    const after = await outlineLeft()
    assert.equal(Math.abs(after - guide) < OUTLINE_ON_GUIDE_PX, true, `the outline's line ${after} is off the guide ${guide} it was snapped to, after the release`)
  }
  // Drags the note so its outline's left line lies `gap` px right of column line `COLUMN_LINE`.
  const dragToGap = async (gap) => dragBy(await lineX(COLUMN_LINE) + gap - ((await noteBox('15')).x - OUTLINE_MIDDLE_PX))

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.reload(p)
    await draw.pickDraw(p)
    await p.mouse.click(...await gridPoint(p, TEXT_AT))
    await p.keyboard.type('15')
    await draw.finishNote(p)
    assert.equal(await p.locator(TEXT_BOX).count(), 0)
    await p.mouse.click(...await gridPoint(p, OTHER_AT))
    await p.keyboard.type('2')
    await draw.finishNote(p)
    assert.equal(await p.locator(TEXT_BOX).count(), 0)
  })
  after(async () => { await context.close() })

  it('a note dragged to 2 px from a cell line lands with its outline on the line and shows the guide there, then the guide goes', async () => {
    const line = await lineX(COLUMN_LINE)
    const { left, guides, guideBox } = await dragToGap(2)
    assert.equal(guides, 1, 'the guide shows while snapped')
    assert.equal(Math.abs(left - line) < NEAR_PX, true, `the outline's line ${left} is on the cell line ${line} during the drag`)
    assert.equal(Math.abs(guideBox.x + guideBox.width / 2 - line) < NEAR_PX, true, `the guide is at ${guideBox.x}, the line at ${line}`)
    assert.equal(Math.abs(await outlineLeft() - line) < NEAR_PX, true, 'the note stays on the line after the release')
    await assertOnGuide(left, guideBox)
    assert.equal(await p.locator(GUIDE_X).count(), 0, 'the guide goes with the release')
  })

  it('a note dragged 6 px off the line stays where the pointer put it and shows no x guide', async () => {
    const line = await lineX(COLUMN_LINE)
    const { left, guides } = await dragToGap(6)
    assert.equal(guides, 0, 'no guide')
    assert.equal(Math.abs(left - (line + 6)) < NEAR_PX, true, `the outline's line ${left} is 6 px past ${line}`)
  })

  it('a note dragged 5 px from where it began, clear of every target, moves exactly 5 px: the notes being dragged are no targets', async () => {
    const before = (await noteBox('15')).x
    const { guides } = await dragBy(5)
    assert.equal(guides, 0, 'no guide')
    assert.equal(Math.abs((await noteBox('15')).x - (before + 5)) < NEAR_PX, true, 'the note moved with the pointer')
  })

  it('releasing a snapped note never jumps: the pointer moving 0.5 px further within the pull leaves it on the line, drawn and saved', async () => {
    const line = await lineX(COLUMN_LINE)
    const gap = line + 2 - ((await noteBox('15')).x - OUTLINE_MIDDLE_PX)
    const { left } = await dragBy(gap, 0.5)
    assert.equal(Math.abs(left - line) < NEAR_PX, true, `the outline's line ${left} is on the line ${line} before the release`)
    assert.equal(Math.abs(await outlineLeft() - left) < draw.CRISP_HALF_PX + 0.05, true, 'the release moved the outline by more than the half pixel that puts it on a whole device pixel')
    const [at] = (await draw.saved(p)).filter((item) => item.kind === 'text' && item.text === '15').map((item) => item.at)
    await draw.reload(p)
    await draw.pickDraw(p)
    assert.equal(Math.abs((await noteBox('15')).x - OUTLINE_MIDDLE_PX - line) < NEAR_PX, true, `the saved note ${at} is drawn on the line again after a reload`)
  })

  it('a note dragged to 2 px from another note\'s left edge lands with the two left edges equal and the guide where its outline lies', async () => {
    const other = await noteBox('2')
    const { x } = await noteBox('15')
    const { left, guides, guideBox } = await dragBy(other.x + 2 - x)
    assert.equal(guides, 1, 'the guide shows while snapped')
    assert.equal(Math.abs(left - (other.x - OUTLINE_MIDDLE_PX)) < NEAR_PX, true, `the outline's line ${left} is ${OUTLINE_MIDDLE_PX} px left of the other note's left edge ${other.x}`)
    assert.equal(Math.abs(guideBox.x + guideBox.width / 2 - left) < NEAR_PX, true, `the guide ${guideBox.x} is on the outline's line ${left}`)
    assert.equal(Math.abs((await noteBox('15')).x - other.x) < NEAR_PX, true, 'the two left edges are equal after the release')
    await assertOnGuide(left, guideBox)
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
