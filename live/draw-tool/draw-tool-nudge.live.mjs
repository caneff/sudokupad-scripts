// Live check of draw-tool.user.js's arrow-key nudge and bulleted lines on sudokupad.app: with a note selected the right arrow moves it about 1 screen pixel and
// Shift+right about 10, SudokuPad's cell cursor stays where it was, the move is saved, and with nothing selected the arrow keys move the cell cursor as before; a
// note's "- " lines show as bullets with inline markup inside, kept over a reload. Real mouse and keyboard input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as draw from './draw-tool-fixtures.mjs'
import { settle } from '../settle.mjs'
import { useBrowser } from '../session.mjs'
import { finishNote, gridPoint } from '../board.mjs'

const { TEXTS } = draw
// In cells from the grid's top left: the note nudged, and a note of bullets.
const NOTE_AT = [4.5, 4.5]
const CURSOR_AT = [8.5, 0.5]
const EDGE_AT = [2.5, 2.5]
const BULLETS_AT = [1.5, 6.5]
const BULLET_TEXT = '- one\n- **two**'
const NEAR_PX = 0.6
const NEAR_UNITS = 1.5

const browser = useBrowser()

describe('Text Anywhere\'s nudge and bullets', { concurrency: false }, () => {
  let context, p, errors

  const saved = () => draw.saved(p)
  const savedAt = async (text) => (await saved()).find((item) => item.text === text).at
  const cursor = () => p.evaluate(() => Framework.app.puzzle.selectedCells.map((c) => [c.row, c.col]))
  const noteBox = (text) => p.locator(TEXTS).filter({ hasText: new RegExp(`^${text}$`) }).boundingBox()
  // SudokuPad's cell cursor is set under the digit tool, then Text Anywhere is picked again with nothing selected.
  const putCursorAt = async (at) => {
    await p.click(draw.DIGIT_BUTTON)
    await p.mouse.click(...await gridPoint(p, at))
    await draw.pickDraw(p)
  }
  const reload = () => draw.reloadOnDraw(p)

  before(async () => {
    ;({ context, p, errors } = await draw.open(browser(), { contextOptions: { viewport: { width: 1200, height: 900 } } }))
    await draw.forgetDrawings(p)
    await reload()
    await p.mouse.click(...await gridPoint(p, NOTE_AT))
    await p.keyboard.type('N')
    await finishNote(p)
    await p.mouse.click(...await gridPoint(p, BULLETS_AT))
    await p.keyboard.type(BULLET_TEXT.split('\n')[0])
    await p.keyboard.press('Shift+Enter')
    await p.keyboard.type(BULLET_TEXT.split('\n')[1])
    await finishNote(p)
  })
  after(async () => { await context.close() })

  it('an arrow key moves the selected note about 1 px and Shift+arrow about 10, again with Shift held, saves it, and leaves SudokuPad\'s cell cursor alone', async () => {
    await putCursorAt(CURSOR_AT)
    await p.mouse.click(...await gridPoint(p, NOTE_AT))
    const cellsBefore = await cursor()
    assert.equal(cellsBefore.length, 1, 'a cell is selected')
    const x0 = (await noteBox('N')).x
    const atBefore = await savedAt('N')
    await p.keyboard.press('ArrowRight')
    const x1 = (await noteBox('N')).x
    assert.equal(Math.abs(x1 - x0 - 1) <= NEAR_PX, true, `one press moved the note from ${x0} to ${x1}`)
    // Shift stays down across two presses: releasing an arrow with Shift held must not switch SudokuPad to Corner.
    await p.keyboard.down('Shift')
    try {
      await p.keyboard.press('ArrowRight')
      const x2 = (await noteBox('N')).x
      assert.equal(Math.abs(x2 - x1 - 10) <= NEAR_PX, true, `Shift+arrow moved the note from ${x1} to ${x2}`)
      await p.keyboard.press('ArrowRight')
      const x3 = (await noteBox('N')).x
      assert.equal(Math.abs(x3 - x2 - 10) <= NEAR_PX, true, `a second Shift+arrow moved the note from ${x2} to ${x3}`)
    } finally {
      await p.keyboard.up('Shift')
    }
    assert.equal(await draw.tool(p), 'draw', 'the tool is still Text Anywhere')
    assert.deepEqual(await cursor(), cellsBefore, 'the cell cursor did not move')
    const scale = await p.evaluate(() => Framework.app.svgRenderer.getElem().getScreenCTM().a)
    const want = atBefore[0] + 21 / scale
    assert.equal(await settle(async () => Math.abs((await savedAt('N'))[0] - want) <= NEAR_UNITS, true), true, `saved at ${await savedAt('N')}, wanted x near ${want}`)
    await reload()
    assert.equal(Math.abs((await savedAt('N'))[0] - want) <= NEAR_UNITS, true, 'a reload keeps the nudged place')
  })

  it('each arrow key moves the note its own way, and a note stops where it would leave the window', async () => {
    await p.mouse.click(...await gridPoint(p, EDGE_AT))
    await p.keyboard.type('E')
    await finishNote(p)
    await p.mouse.click(...await gridPoint(p, EDGE_AT))
    const moved = async (key) => {
      const before = await noteBox('E')
      await p.keyboard.press(key)
      const after = await noteBox('E')
      return [after.x - before.x, after.y - before.y]
    }
    for (const [key, want] of [['ArrowLeft', [-1, 0]], ['ArrowDown', [0, 1]], ['ArrowUp', [0, -1]], ['ArrowRight', [1, 0]]]) {
      const got = await moved(key)
      assert.equal(got.every((v, i) => Math.abs(v - want[i]) <= NEAR_PX), true, `${key} moved the note by ${got}, wanted ${want}`)
    }
    const first = await noteBox('E')
    const width = await p.evaluate(() => window.innerWidth)
    await p.keyboard.down('Shift')
    try {
      for (let i = 0; i < width / 10 + 20; i++) await p.keyboard.press('ArrowRight')
    } finally {
      await p.keyboard.up('Shift')
    }
    const end = await noteBox('E')
    assert.equal(end.x > first.x + 100, true, 'the note moved right')
    assert.equal(end.x + end.width / 2 <= width - 1, true, `the note's middle ${end.x + end.width / 2} stayed inside the window of width ${width}`)
  })

  const countSaves = async () => {
    await p.evaluate((prefix) => {
      const counting = window.drawSaves !== undefined
      window.drawSaves = 0
      if (counting) return
      const setData = Framework.setData
      Framework.setData = function (key, value) {
        if (String(key).startsWith(prefix)) window.drawSaves++
        return setData.call(this, key, value)
      }
    }, draw.DRAWING_PREFIX)
    return () => p.evaluate(() => window.drawSaves)
  }
  const HELD_FAR_PX = 15
  // How long a check waits to see that nothing more happens.
  const QUIET_MS = 400
  // The note was nudged away from where it was typed, so the click goes to where it is now.
  const selectNote = async (text) => p.mouse.click(...draw.middleOf(await noteBox(text)))

  it('a held ArrowRight keeps nudging the note past a single nudge, and saves once after the release', async () => {
    await selectNote('N')
    const x0 = (await noteBox('N')).x
    const saves = await countSaves()
    await p.keyboard.down('ArrowRight')
    try {
      const far = await settle(async () => (await noteBox('N')).x - x0 > HELD_FAR_PX, true)
      assert.equal(far, true, `the note moved only ${(await noteBox('N')).x - x0} px while the key was held`)
      assert.equal(await saves(), 0, 'nothing is saved while the key is held')
    } finally {
      await p.keyboard.up('ArrowRight')
    }
    assert.equal(await settle(saves, 1), 1, 'one save after the release')
    const x1 = (await noteBox('N')).x
    await p.evaluate((ms) => new Promise((resolve) => window.setTimeout(resolve, ms)), QUIET_MS)
    assert.equal((await noteBox('N')).x, x1, `the note stays put after the release (nothing moved in ${QUIET_MS} ms)`)
    assert.equal(await saves(), 1, 'no second save came after the release')
  })

  it('a blur while the key is held stops the movement and saves it', async () => {
    await selectNote('N')
    const x0 = (await noteBox('N')).x
    const saves = await countSaves()
    await p.keyboard.down('ArrowLeft')
    try {
      assert.equal(await settle(async () => (await noteBox('N')).x - x0 < -HELD_FAR_PX, true), true, 'the held key moved the note')
      await p.evaluate(() => window.dispatchEvent(new Event('blur')))
      assert.equal(await settle(saves, 1), 1, 'the blur saved the move')
      const stopped = (await noteBox('N')).x
      await p.evaluate((ms) => new Promise((resolve) => window.setTimeout(resolve, ms)), QUIET_MS)
      assert.equal((await noteBox('N')).x, stopped, `the note stopped moving at the blur (nothing moved in ${QUIET_MS} ms)`)
    } finally {
      await p.keyboard.up('ArrowLeft')
    }
  })

  it('Escape while the key is held ends the selection and stops the movement, which a new selection does not resume', async () => {
    await selectNote('N')
    const x0 = (await noteBox('N')).x
    await p.keyboard.down('ArrowRight')
    try {
      assert.equal(await settle(async () => (await noteBox('N')).x - x0 > HELD_FAR_PX, true), true, 'the held key moved the note')
      await finishNote(p)
      // A timer left running would move the note again as soon as it is selected.
      await selectNote('N')
      const stopped = (await noteBox('N')).x
      await p.evaluate((ms) => new Promise((resolve) => window.setTimeout(resolve, ms)), QUIET_MS)
      assert.equal((await noteBox('N')).x, stopped, `the note stopped moving when the selection ended (nothing moved in ${QUIET_MS} ms)`)
    } finally {
      await p.keyboard.up('ArrowRight')
    }
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
      return [...note.children].map((line) => ({ text: line.textContent, bold: Boolean(line.querySelector('span[style*="bold"]')), hangs: parseFloat(window.getComputedStyle(line).paddingLeft) > 0 && parseFloat(window.getComputedStyle(line).textIndent) === -parseFloat(window.getComputedStyle(line).paddingLeft) }))
    }, TEXTS)
    const want = [{ text: '•one', bold: false, hangs: true }, { text: '•two', bold: true, hangs: true }]
    assert.deepEqual(await lines(), want)
    await reload()
    assert.deepEqual(await settle(lines, [want]), want)
    await draw.reopen(p, await gridPoint(p, BULLETS_AT))
    assert.equal(await p.locator(draw.TEXT_BOX).textContent(), BULLET_TEXT, 'the open note shows the raw markers')
    await finishNote(p)
    assert.deepEqual(errors, [])
  })
})
