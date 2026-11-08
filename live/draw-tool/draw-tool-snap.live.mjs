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
  // Presses the note '15' and drags it by `dx` px along the row, reading its outline and the x guide before the release.
  const dragBy = async (dx) => {
    const note = await noteBox('15')
    const [px, py] = [note.x + note.width / 2, note.y + note.height / 2]
    await p.mouse.move(px, py)
    await p.mouse.down()
    await p.mouse.move(px + dx, py, { steps: 6 })
    const during = { left: await outlineLeft(), guides: await p.locator(GUIDE_X).count() }
    const guideBox = during.guides ? await p.locator(GUIDE_X).boundingBox() : null
    await p.mouse.up()
    return { ...during, guideBox }
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
    const { left, guides, guideBox } = await dragToGap(2)
    assert.equal(guides, 1, 'the guide shows while snapped')
    assert.equal(Math.abs(left - line) < NEAR_PX, true, `the outline's line ${left} is on the cell line ${line} during the drag`)
    assert.equal(Math.abs(guideBox.x + guideBox.width / 2 - line) < NEAR_PX, true, `the guide is at ${guideBox.x}, the line at ${line}`)
    assert.equal(Math.abs(await outlineLeft() - line) < NEAR_PX, true, 'the note stays on the line after the release')
    assert.equal(await p.locator(GUIDE_X).count(), 0, 'the guide goes with the release')
  })

  it('a note dragged 6 px off the line stays where the pointer put it and shows no x guide', async () => {
    const line = await lineX(COLUMN_LINE)
    const { left, guides } = await dragToGap(6)
    assert.equal(guides, 0, 'no guide')
    assert.equal(Math.abs(left - (line + 6)) < NEAR_PX, true, `the outline's line ${left} is 6 px past ${line}`)
  })

  it('a note dragged to 2 px from another note\'s left edge lands with the two left edges equal and the guide where its outline lies', async () => {
    const other = await noteBox('2')
    const { x } = await noteBox('15')
    const { left, guides, guideBox } = await dragBy(other.x + 2 - x)
    assert.equal(guides, 1, 'the guide shows while snapped')
    assert.equal(Math.abs(left - (other.x - OUTLINE_MIDDLE_PX)) < NEAR_PX, true, `the outline's line ${left} is ${OUTLINE_MIDDLE_PX} px left of the other note's left edge ${other.x}`)
    assert.equal(Math.abs(guideBox.x + guideBox.width / 2 - left) < NEAR_PX, true, `the guide ${guideBox.x} is on the outline's line ${left}`)
    assert.equal(Math.abs((await noteBox('15')).x - other.x) < NEAR_PX, true, 'the two left edges are equal after the release')
  })

  it('the page raised no error', () => assert.deepEqual(errors, []))
})
