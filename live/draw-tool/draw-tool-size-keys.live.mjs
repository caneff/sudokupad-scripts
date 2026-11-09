// Live check of draw-tool.user.js's + and - keys on sudokupad.app: they change the selected notes' size one slider step (the slider follows, - after + returns the size),
// or the next note's with nothing selected, type as text inside an open note, and leave SudokuPad's own - (a centre-mark range under the centre tool) alone. Real keyboard input.
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'

const { SIZE_SLIDER, TEXT_BOX, WIDTH_KEY, valueOf } = draw
const A = [1.5, 1.5]
const B = [5.5, 5.5]
const CENTRE_BUTTON = '#control-centre'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s + and - keys', { concurrency: false }, () => {
  let context, p, errors

  const savedSize = async (text) => (await draw.saved(p)).find((item) => item.text === text).size
  const clickAt = async (at) => p.mouse.click(...await gridPoint(p, at))
  const typeText = async (at, content) => {
    await clickAt(at)
    await p.keyboard.type(content)
    await draw.finishNote(p)
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport: { width: 1280, height: 720 } } }))
    await draw.boot(p)
  })
  after(async () => { await context.close() })
  beforeEach(async () => {
    await draw.forgetDrawings(p)
    await p.evaluate((key) => Framework.removeData(key), WIDTH_KEY)
    await draw.reload(p)
    await draw.pickDraw(p)
  })

  it('with a note selected, + twice and - once make it one step (1 text size) bigger, the slider follows, and - after + gives the size back', async () => {
    await typeText(A, 'A')
    assert.equal(await savedSize('A'), 20)
    await clickAt(A)
    await p.keyboard.press('+')
    assert.deepEqual([await savedSize('A'), await valueOf(p, SIZE_SLIDER)], [21, 6.5])
    await p.keyboard.press('-')
    assert.deepEqual([await savedSize('A'), await valueOf(p, SIZE_SLIDER)], [20, 6])
    await p.keyboard.press('+')
    await p.keyboard.press('+')
    await p.keyboard.press('-')
    assert.deepEqual([await savedSize('A'), await valueOf(p, SIZE_SLIDER)], [21, 6.5])
    await p.keyboard.press('=')
    await p.keyboard.press('NumpadAdd')
    assert.equal(await savedSize('A'), 23, '= and the keypad + step it too')
    await p.keyboard.press('NumpadSubtract')
    assert.equal(await savedSize('A'), 22)
  })

  it('with nothing selected, + moves the slider and the next note\'s size, not a note already made', async () => {
    await typeText(A, 'A')
    await p.keyboard.press('+')
    assert.deepEqual([await valueOf(p, SIZE_SLIDER), await p.evaluate((k) => Framework.getData(k), WIDTH_KEY)], [6.5, 6.5])
    await typeText(B, 'B')
    assert.deepEqual([await savedSize('A'), await savedSize('B')], [20, 21])
  })

  it('inside an open note, + and - type as text and change no size', async () => {
    await clickAt(A)
    await p.keyboard.type('1+2-3')
    assert.equal(await p.locator(TEXT_BOX).textContent(), '1+2-3')
    await draw.finishNote(p)
    assert.equal(await savedSize('1+2-3'), 20)
    assert.equal(await valueOf(p, SIZE_SLIDER), 6)
  })

  it('under the centre tool, 1-5 still enters a centre-mark range', async () => {
    await p.click(CENTRE_BUTTON)
    await p.mouse.click(...await gridPoint(p, A))
    await p.keyboard.type('1-5')
    const centre = await p.evaluate(() => Framework.app.puzzle.selectedCells.map((c) => c.propGet('centre')))
    assert.deepEqual(centre, [[1, 2, 3, 4, 5]])
  })

  it('raised no page error', () => assert.deepEqual(errors, []))
})
