// Live check of draw-tool.user.js's panel while a note is open: it shows the open note's color and size, a color button or the Size and Transparency sliders change that note
// and leaves the next-note settings alone (a brand-new note's color and size also become the next note's), the press keeps the note open with its caret, and finishing the note brings the next-note values back. Real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'

const { COLOR_KEY, OPACITY_KEY, OPACITY_SLIDER, SIZE_SLIDER, TEXT_BOX, WIDTH_KEY, slideTo, valueOf } = draw
const BLACK = 1
const GREEN = 3
const RED = 4
const SPOT = [2.5, 4.5]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s panel while a note is open', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const key = (n) => `.controls-input button[data-key="${n}"]`
  const currentKeys = () => read(() => [...document.querySelectorAll('.controls-input button.digit.current')].map((b) => Number(b.dataset.key)))
  const stored = (name) => read((k) => Framework.getData(k) ?? null, name)
  const size = () => valueOf(p, SIZE_SLIDER)
  const boxOpen = async () => (await p.locator(TEXT_BOX).count()) === 1
  const boxColor = () => p.locator(TEXT_BOX).evaluate((e) => window.getComputedStyle(e).color)
  const penColor = (n) => read((i) => window.getComputedStyle(document.documentElement).getPropertyValue(`--puzzle-pencolor-${i}`).trim(), n)
  const openAt = async () => draw.reopen(p, await gridPoint(p, SPOT))

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), [COLOR_KEY, WIDTH_KEY, OPACITY_KEY])
    await draw.reload(p)
    await draw.pickDraw(p)
    // One green note, made with green as the next-note color; black is then the next-note color again.
    await p.click(key(GREEN))
    await p.mouse.click(...await gridPoint(p, SPOT))
    await p.keyboard.type('ab')
    await p.keyboard.press('Escape')
    await p.click(key(BLACK))
  })
  after(async () => { await context.close() })

  it('opening a green note marks green on the panel, and the next-note color stays black', async () => {
    assert.deepEqual(await currentKeys(), [BLACK])
    await openAt()
    assert.equal(await boxOpen(), true)
    assert.deepEqual(await currentKeys(), [GREEN])
    assert.equal(await stored(COLOR_KEY), BLACK)
  })

  it('a color button recolors the open note at once, keeps it open with its caret, and typing continues in it', async () => {
    await p.keyboard.press('ArrowLeft')
    await p.click(key(RED))
    assert.equal(await boxOpen(), true, 'the note is still open')
    assert.deepEqual(await currentKeys(), [RED])
    assert.equal(await boxColor(), await read((c) => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = window.getComputedStyle(d).color; d.remove(); return v }, await penColor(RED)))
    assert.equal(await stored(COLOR_KEY), BLACK, 'the next-note color is unchanged')
    await p.keyboard.type('X')
    assert.equal(await p.locator(TEXT_BOX).textContent(), 'aXb', 'the caret was where it was')
  })

  it('finishing keeps the note red, and the panel shows the next-note color again', async () => {
    await p.keyboard.press('Escape')
    assert.equal(await boxOpen(), false)
    assert.deepEqual((await draw.saved(p)).map((i) => [i.text, i.color]), [['aXb', RED]])
    assert.deepEqual(await currentKeys(), [BLACK])
  })

  it('the Size slider resizes the open note only, and the next-note size is unchanged', async () => {
    const nextSize = await size()
    await openAt()
    const before = (await draw.saved(p))[0].size
    await slideTo(p, SIZE_SLIDER, 16)
    assert.equal(await boxOpen(), true, 'the note is still open')
    assert.equal(await stored(WIDTH_KEY), null, 'the next-note size was never saved')
    assert.equal(await size(), 16, 'the slider shows the open note\'s size')
    await p.keyboard.type('Z')
    assert.equal(await p.locator(TEXT_BOX).textContent(), 'aXbZ', 'typing continues in the note')
    await p.keyboard.press('Escape')
    const after = (await draw.saved(p))[0].size
    assert.ok(after > before, `the note grew (${before} to ${after})`)
    assert.equal(await size(), nextSize, 'the slider shows the next-note size again')
  })

  it('the Transparency slider fades the open note only, and the next-note transparency is unchanged', async () => {
    await openAt()
    await slideTo(p, OPACITY_SLIDER, 50)
    assert.equal(await boxOpen(), true, 'the note is still open')
    assert.equal(await valueOf(p, OPACITY_SLIDER), 50)
    assert.equal(await stored(OPACITY_KEY), null, 'the next-note transparency was never saved')
    await p.keyboard.press('Escape')
    assert.equal((await draw.saved(p))[0].opacity, 50, 'a note reopened and only faded is saved with the change')
    assert.equal(await valueOf(p, OPACITY_SLIDER), 100, 'the slider shows the next-note transparency again')
  })

  it('a press on a slider that moves nothing leaves the note open with the focus back in it, so typing goes into the note', async () => {
    await openAt()
    await slideTo(p, SIZE_SLIDER, 6)
    const value = await size()
    await slideTo(p, SIZE_SLIDER, 6)
    assert.equal(await size(), value, 'the second press moved nothing')
    assert.equal(await boxOpen(), true)
    await p.keyboard.type('Q')
    assert.equal(await boxOpen(), true, 'the key stayed in the note')
    assert.match(await p.locator(TEXT_BOX).textContent(), /Q$/)
    await p.keyboard.press('Escape')
  })

  it('a note reopened and recolored or resized without typing is saved with the change', async () => {
    await openAt()
    await p.click(key(GREEN))
    await p.keyboard.press('Escape')
    assert.equal((await draw.saved(p))[0].color, GREEN)
    await openAt()
    const before = (await draw.saved(p))[0].size
    await slideTo(p, SIZE_SLIDER, 1)
    await p.keyboard.press('Escape')
    assert.ok((await draw.saved(p))[0].size < before, 'the smaller size was saved')
  })

  it('no page error', () => { assert.deepEqual(errors, []) })
})

describe('Text Anywhere\'s panel while a brand-new note is open', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const key = (n) => `.controls-input button[data-key="${n}"]`
  const currentKeys = () => read(() => [...document.querySelectorAll('.controls-input button.digit.current')].map((b) => Number(b.dataset.key)))
  const stored = (name) => read((k) => Framework.getData(k) ?? null, name)
  const size = () => valueOf(p, SIZE_SLIDER)
  const openNew = async () => {
    await p.mouse.click(...await gridPoint(p, SPOT))
    assert.equal(await p.locator(TEXT_BOX).count(), 1, 'a new note is open')
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), [COLOR_KEY, WIDTH_KEY, OPACITY_KEY])
    await draw.reload(p)
    await draw.pickDraw(p)
  })
  after(async () => { await context.close() })

  it('a color pick recolors the new note and becomes the next-note color', async () => {
    await openNew()
    await p.keyboard.type('ab')
    await p.click(key(RED))
    assert.equal(await p.locator(TEXT_BOX).count(), 1, 'the note is still open')
    assert.equal(await stored(COLOR_KEY), RED, 'the next-note color is now red')
    await p.keyboard.press('Escape')
    assert.deepEqual((await draw.saved(p)).map((i) => [i.text, i.color]), [['ab', RED]])
    assert.deepEqual(await currentKeys(), [RED], 'the panel shows the next-note color, red')
  })

  it('a size change resizes the new note and becomes the next-note size', async () => {
    await draw.forgetDrawings(p)
    await draw.reload(p)
    await draw.pickDraw(p)
    const before = await size()
    await openNew()
    await p.keyboard.type('ab')
    await slideTo(p, SIZE_SLIDER, 12)
    await slideTo(p, OPACITY_SLIDER, 55)
    assert.equal(await p.locator(TEXT_BOX).count(), 1, 'the note is still open')
    const picked = await size()
    assert.ok(picked > before, 'the size went up')
    assert.equal(await stored(WIDTH_KEY), 12, 'the next-note size is the one picked')
    assert.equal(await stored(OPACITY_KEY), 55, 'and so is the next-note transparency')
    await p.keyboard.press('Escape')
    assert.deepEqual([await size(), await valueOf(p, OPACITY_SLIDER)], [picked, 55], 'the sliders still show them after the note is saved')
    assert.deepEqual([(await draw.saved(p))[0].size, (await draw.saved(p))[0].opacity], [32, 55], 'the new note was saved with both')
  })

  it('no page error', () => { assert.deepEqual(errors, []) })
})
