// Live check of draw-tool.user.js's arrow-key nudge and bulleted lines on sudokupad.app: with a note selected the right arrow moves it about 1 screen pixel and
// Shift+right about 10, SudokuPad's cell cursor stays where it was, the move is saved, and with nothing selected the arrow keys move the cell cursor as before; a
// note's "- " lines show as bullets with inline markup inside, kept over a reload. Real mouse and keyboard input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'
import { settle } from '../settle.mjs'

const { TEXTS } = draw
// In cells from the grid's top left: the note nudged, and a note of bullets.
const NOTE_AT = [4.5, 4.5]
const CURSOR_AT = [8.5, 0.5]
const BULLETS_AT = [1.5, 6.5]
const BULLET_TEXT = '- one\n- **two**'
const NEAR_PX = 0.6
const NEAR_UNITS = 1.5

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Annotation\'s nudge and bullets', { concurrency: false }, () => {
  let context, p, errors

  const saved = () => draw.saved(p)
  const savedAt = async (text) => (await saved()).find((item) => item.text === text).at
  const cursor = () => p.evaluate(() => Framework.app.puzzle.selectedCells.map((c) => [c.row, c.col]))
  const noteX = async (text) => (await p.locator(TEXTS).filter({ hasText: new RegExp(`^${text}$`) }).boundingBox()).x
  // SudokuPad's cell cursor is set under the digit tool, then Text Annotation is picked again with nothing selected.
  const putCursorAt = async (at) => {
    await p.click(draw.DIGIT_BUTTON)
    await p.mouse.click(...await gridPoint(p, at))
    await draw.pickDraw(p)
  }
  const reload = async () => {
    await draw.reload(p)
    await draw.pickDraw(p)
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport: { width: 1200, height: 900 } } }))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await reload()
    await p.mouse.click(...await gridPoint(p, NOTE_AT))
    await p.keyboard.type('N')
    await p.keyboard.press('Escape')
    await p.mouse.click(...await gridPoint(p, BULLETS_AT))
    await p.keyboard.type(BULLET_TEXT.split('\n')[0])
    await p.keyboard.press('Shift+Enter')
    await p.keyboard.type(BULLET_TEXT.split('\n')[1])
    await p.keyboard.press('Escape')
  })
  after(async () => { await context.close() })

  it('an arrow key moves the selected note about 1 px and Shift+arrow about 10, saves it, and leaves SudokuPad\'s cell cursor alone', async () => {
    await putCursorAt(CURSOR_AT)
    await p.mouse.click(...await gridPoint(p, NOTE_AT))
    const cellsBefore = await cursor()
    assert.equal(cellsBefore.length, 1, 'a cell is selected')
    const [x0, y0] = [await noteX('N'), (await p.locator(TEXTS).filter({ hasText: /^N$/ }).boundingBox()).y]
    const atBefore = await savedAt('N')
    await p.keyboard.press('ArrowRight')
    const x1 = await noteX('N')
    assert.equal(Math.abs(x1 - x0 - 1) <= NEAR_PX, true, `one press moved the note from ${x0} to ${x1}`)
    await p.keyboard.press('Shift+ArrowRight')
    const x2 = await noteX('N')
    assert.equal(Math.abs(x2 - x1 - 10) <= NEAR_PX, true, `Shift+arrow moved the note from ${x1} to ${x2}`)
    assert.equal(Math.abs((await p.locator(TEXTS).filter({ hasText: /^N$/ }).boundingBox()).y - y0) <= NEAR_PX, true, 'the note stayed on its row')
    assert.deepEqual(await cursor(), cellsBefore, 'the cell cursor did not move')
    const scale = await p.evaluate(() => Framework.app.svgRenderer.getElem().getScreenCTM().a)
    const want = atBefore[0] + 11 / scale
    assert.deepEqual(await settle(async () => Math.abs((await savedAt('N'))[0] - want) <= NEAR_UNITS, true), true, `saved at ${await savedAt('N')}, wanted x near ${want}`)
    await reload()
    assert.equal(Math.abs((await savedAt('N'))[0] - want) <= NEAR_UNITS, true, 'a reload keeps the nudged place')
  })

  it('with nothing selected the arrow keys move the cell cursor', async () => {
    await putCursorAt(CURSOR_AT)
    const before = await cursor()
    await p.keyboard.press('ArrowRight')
    const after = await cursor()
    assert.notDeepEqual(after, before, 'the arrow key reached SudokuPad')
  })

  it('"- " lines show as bullets with markup inside, and a reload keeps them', async () => {
    const lines = () => p.evaluate((selector) => {
      const note = [...document.querySelectorAll(selector)].find((e) => e.textContent.includes('one'))
      return [...note.children].map((line) => ({ text: line.textContent, bold: Boolean(line.querySelector('span[style*="bold"]')) }))
    }, TEXTS)
    const want = [{ text: '•one', bold: false }, { text: '•two', bold: true }]
    assert.deepEqual(await lines(), want)
    await reload()
    assert.deepEqual(await settle(lines, [want]), want)
    assert.deepEqual(errors, [])
  })
})
