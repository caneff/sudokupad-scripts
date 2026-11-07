// Live check of draw-tool.user.js's panel while a note is open: it shows the open note's color and size, a color button or the size slider changes that note
// and leaves the next-note settings alone, the press keeps the note open with its caret, and finishing the note brings the next-note values back. Real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'

const { COLOR_KEY, SIZE_SLIDER, TEXT_BOX, WIDTH_KEY } = draw
const BLACK = 1
const GREEN = 3
const RED = 4
const SPOT = [2.5, 4.5]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Annotation\'s panel while a note is open', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const key = (n) => `.controls-input button[data-key="${n}"]`
  const currentKeys = () => read(() => [...document.querySelectorAll('.controls-input button.digit.current')].map((b) => Number(b.dataset.key)))
  const stored = (name) => read((k) => Framework.getData(k) ?? null, name)
  const slider = () => read((s) => Number(document.querySelector(s).value), SIZE_SLIDER)
  const boxOpen = async () => (await p.locator(TEXT_BOX).count()) === 1
  const boxColor = () => p.locator(TEXT_BOX).evaluate((e) => window.getComputedStyle(e).color)
  const penColor = (n) => read((i) => window.getComputedStyle(document.documentElement).getPropertyValue(`--puzzle-pencolor-${i}`).trim(), n)
  const openAt = async () => p.mouse.dblclick(...await gridPoint(p, SPOT))

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await read((keys) => keys.forEach((k) => Framework.removeData(k)), [COLOR_KEY, WIDTH_KEY])
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

  it('the size slider resizes the open note only, and the next-note size is unchanged', async () => {
    const nextSize = await slider()
    await openAt()
    const before = (await draw.saved(p))[0].size
    const bar = await p.locator(SIZE_SLIDER).boundingBox()
    await p.mouse.click(bar.x + bar.width - 2, bar.y + bar.height / 2)
    assert.equal(await boxOpen(), true, 'the note is still open')
    assert.equal(await stored(WIDTH_KEY), null, 'the next-note size was never saved')
    await p.keyboard.type('Z')
    assert.equal(await p.locator(TEXT_BOX).textContent(), 'aXbZ', 'typing continues in the note')
    await p.keyboard.press('Escape')
    const after = (await draw.saved(p))[0].size
    assert.ok(after > before, `the note grew (${before} to ${after})`)
    assert.equal(await slider(), nextSize, 'the slider shows the next-note size again')
  })

  it('no page error', () => { assert.deepEqual(errors, []) })
})
