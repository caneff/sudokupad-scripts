// Live check of draw-tool.user.js's Background button on sudokupad.app: a note made with Background on has a box behind its text and bg:true in storage,
// turning Background off leaves that note's box and the next note has none, pressing Background changes no note but the one open in the text box,
// and both the notes' boxes and the button's state survive a reload. Real mouse and keyboard input throughout.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'
import { settle } from '../settle.mjs'

const { BACKGROUND_BUTTON, BACKGROUND_KEY, TEXT_BGS, TEXT_BOX } = draw
// Five spots, in cells from the grid's top left, one row apart.
const SPOTS = [[0.5, 4.5], [2.5, 4.5], [4.5, 4.5], [6.5, 4.5], [8.5, 4.5]]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Annotation\'s Background button', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const saved = () => draw.saved(p)
  const reload = async () => {
    await draw.reload(p)
    await draw.pickDraw(p)
  }
  const bgCount = () => p.locator(TEXT_BGS).count()
  const pressed = () => p.locator(BACKGROUND_BUTTON).getAttribute('aria-pressed')
  const storedSetting = () => read((key) => Framework.getData(key) ?? null, BACKGROUND_KEY)
  // Which saved notes have a background, by text.
  const savedBgs = async () => Object.fromEntries((await saved()).map((item) => [item.text, item.bg ?? false]))
  const clickAt = async (at) => p.mouse.click(...await gridPoint(p, at))
  const typeText = async (at, content) => {
    await clickAt(at)
    await p.keyboard.type(content)
    await p.keyboard.press('Enter')
  }
  const boxOpen = async () => (await p.locator(TEXT_BOX).count()) === 1
  const boxFilled = () => p.locator(TEXT_BOX).evaluate((e) => window.getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)')

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await read((key) => Framework.removeData(key), BACKGROUND_KEY)
    await reload()
  })
  after(async () => { await context.close() })

  it('Background is off by default, and a note made then has no box and no bg in storage', async () => {
    assert.equal(await pressed(), 'false')
    await typeText(SPOTS[0], 'a')
    assert.equal(await bgCount(), 0)
    assert.deepEqual(await savedBgs(), { a: false })
    assert.equal('bg' in (await saved())[0], false)
  })

  it('pressing Background turns it on, remembers it, and leaves the existing note alone', async () => {
    await p.click(BACKGROUND_BUTTON)
    assert.equal(await pressed(), 'true')
    assert.equal(await storedSetting(), true)
    assert.equal(await bgCount(), 0, 'the note already on the board got no box')
    assert.deepEqual(await savedBgs(), { a: false })
  })

  it('with Background on a new note has a box behind its text, and bg:true in storage', async () => {
    await typeText(SPOTS[1], 'b')
    assert.equal(await bgCount(), 1)
    assert.deepEqual(await savedBgs(), { a: false, b: true })
    const inside = await read(([bg, text]) => {
      const box = document.querySelector(bg).getBoundingClientRect()
      const t = [...document.querySelectorAll(text)].find((e) => e.textContent === 'b').getBoundingClientRect()
      return box.left < t.left && box.right > t.right && box.top < t.top && box.bottom > t.bottom
    }, [TEXT_BGS, draw.TEXTS])
    assert.equal(inside, true, 'the box surrounds the text')
  })

  it('turning Background off leaves that note\'s box, and the next note has none', async () => {
    await p.click(BACKGROUND_BUTTON)
    assert.equal(await pressed(), 'false')
    assert.equal(await storedSetting(), false)
    assert.equal(await bgCount(), 1, 'the box stays')
    await typeText(SPOTS[2], 'c')
    assert.equal(await bgCount(), 1, 'the new note has no box')
    assert.deepEqual(await savedBgs(), { a: false, b: true, c: false })
  })

  it('both the box and the notes without one survive a reload', async () => {
    await reload()
    assert.equal(await settle(bgCount, 1), 1)
    assert.deepEqual(await savedBgs(), { a: false, b: true, c: false })
    assert.equal(await pressed(), 'false', 'Background off is remembered')
  })

  it('Background on is remembered over a reload too', async () => {
    await p.click(BACKGROUND_BUTTON)
    await reload()
    assert.equal(await pressed(), 'true')
    assert.equal(await bgCount(), 1)
    await p.click(BACKGROUND_BUTTON)
    assert.equal(await pressed(), 'false')
  })

  it('while a note is open, pressing Background turns that note\'s box on, keeps the box open, and changes no other note', async () => {
    await clickAt(SPOTS[0])
    assert.equal(await boxOpen(), true)
    assert.equal(await boxFilled(), false)
    await p.click(BACKGROUND_BUTTON)
    assert.equal(await pressed(), 'true')
    assert.equal(await boxOpen(), true, 'the text box is still open')
    assert.equal(await boxFilled(), true, 'the open box shows the background')
    await p.keyboard.press('Enter')
    assert.equal(await bgCount(), 2)
    assert.deepEqual(await savedBgs(), { a: true, b: true, c: false })
  })

  it('pressing Background again with that note open turns its box off', async () => {
    await clickAt(SPOTS[0])
    assert.equal(await boxFilled(), true)
    await p.click(BACKGROUND_BUTTON)
    assert.equal(await pressed(), 'false')
    assert.equal(await boxFilled(), false)
    await p.keyboard.press('Enter')
    assert.equal(await bgCount(), 1)
    assert.deepEqual(await savedBgs(), { a: false, b: true, c: false })
    assert.equal('bg' in (await saved()).find((item) => item.text === 'a'), false)
  })

  it('a new note opened with Background on and then toggled off is saved without a box', async () => {
    await p.click(BACKGROUND_BUTTON)
    await clickAt(SPOTS[3])
    await p.keyboard.type('d')
    assert.equal(await boxFilled(), true)
    await p.click(BACKGROUND_BUTTON)
    await p.keyboard.press('Enter')
    assert.deepEqual(await savedBgs(), { a: false, b: true, c: false, d: false })
    assert.equal(await bgCount(), 1)
  })

  it('Escape on an open note after toggling Background leaves the note as it was', async () => {
    await clickAt(SPOTS[2])
    await p.click(BACKGROUND_BUTTON)
    await p.keyboard.press('Escape')
    assert.equal(await bgCount(), 1)
    assert.deepEqual(await savedBgs(), { a: false, b: true, c: false, d: false })
  })

  it('pressing Background on a note whose box differs from the setting turns that note\'s box over in one press and leaves the setting alone', async () => {
    assert.equal(await storedSetting(), false)
    await clickAt(SPOTS[1])
    assert.equal(await pressed(), 'true', 'the button shows the open note, not the setting')
    await p.click(BACKGROUND_BUTTON)
    assert.equal(await pressed(), 'false')
    assert.equal(await boxFilled(), false)
    await p.keyboard.press('Enter')
    assert.deepEqual(await savedBgs(), { a: false, b: false, c: false, d: false })
    assert.equal(await storedSetting(), false, 'the setting is unchanged')
    assert.equal(await pressed(), 'false', 'with no note open the button shows the setting')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
