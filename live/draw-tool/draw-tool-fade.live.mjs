// Live check of draw-tool.user.js's Transparency on sudokupad.app: it fades a whole note (letters, outline, box and frame) as one element, and the
// selection outline and resize handles of a faded note stay solid.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'

const { FRAME_KEY, TEXTS, pickDraw } = draw
const SELECTION = '#draw-tool-layer .draw-tool-selection'
const HANDLE = '#draw-tool-layer .draw-tool-resize'
const ITEMS = [
  { kind: 'text', color: 1, size: 20, opacity: 40, bg: true, text: 'boxed', at: [96, 96] },
  { kind: 'text', color: 4, size: 20, opacity: 40, text: 'bare', at: [288, 96] },
  { kind: 'text', color: 1, size: 20, opacity: 100, bg: true, text: 'solid', at: [96, 288] }
]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s Transparency fades the whole note', { concurrency: false }, () => {
  let context, p

  // Each note's computed opacity, color, box fill and frame, by text.
  const noteOpacities = () => p.evaluate((selector) => Object.fromEntries([...document.querySelectorAll(selector)].map((e) => {
    const style = window.getComputedStyle(e)
    return [e.textContent, { opacity: style.opacity, color: style.color, fill: style.backgroundColor, shadow: style.boxShadow }]
  })), TEXTS)
  // The computed opacity of the element and of every ancestor up to the body: what actually multiplies into how it draws.
  const drawnOpacity = (selector) => p.evaluate((s) => {
    let product = 1
    for (let e = document.querySelector(s); e && e !== document.body; e = e.parentElement) product *= Number(window.getComputedStyle(e).opacity)
    return Math.round(product * 1000) / 1000
  }, selector)

  before(async () => {
    ;({ context, p } = await openPage(browser, { contextOptions: { viewport: { width: 1200, height: 900 } } }))
    // The handles' fade in has its own live check; here they are read as soon as they appear.
    await p.emulateMedia({ reducedMotion: 'reduce' })
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await p.evaluate((key) => Framework.setData(key, true), FRAME_KEY)
    await draw.plantDrawing(p, ITEMS)
    await draw.reload(p)
    await pickDraw(p)
  })
  after(async () => { await context.close() })

  it('at 40% a boxed, framed note and a bare one draw at 40% as a whole, and at 100% nothing changes', async () => {
    const notes = await noteOpacities()
    assert.equal(notes.boxed.opacity, '0.4')
    assert.equal(notes.bare.opacity, '0.4')
    assert.equal(notes.solid.opacity, '1')
    assert.notEqual(notes.boxed.shadow, 'none', 'the frame is still there, faded with the note')
    assert.notEqual(notes.boxed.fill, 'rgba(0, 0, 0, 0)', 'the box is still there, faded with the note')
    assert.match(notes.boxed.color, /^rgb\(/, 'the letters carry no alpha of their own, so the fade is not applied twice')
  })

  it('a selected faded note keeps its selection outline and handles at full opacity', async () => {
    await p.mouse.click(...await gridPoint(p, [1.5, 1.5]))
    assert.equal(await p.locator(SELECTION).count(), 1, 'one selection outline')
    assert.equal(await drawnOpacity(SELECTION), 1)
    assert.equal(await p.locator(HANDLE).count(), 4)
    assert.equal(await drawnOpacity(HANDLE), 1)
    const { note, outline } = await p.evaluate(([notes, selection]) => {
      const box = (e) => { const { left, top, right, bottom } = e.getBoundingClientRect(); return { left, top, right, bottom } }
      return { note: box([...document.querySelectorAll(notes)].find((e) => e.textContent === 'boxed')), outline: box(document.querySelector(selection)) }
    }, [TEXTS, SELECTION])
    for (const side of Object.keys(note)) assert.ok(Math.abs(note[side] - outline[side]) <= 1, `the outline's ${side} is ${outline[side]}, the note's ${note[side]}`)
  })

  it('the outline of a faded note follows it through a drag and stays solid', async () => {
    const [x, y] = await gridPoint(p, [1.5, 1.5])
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x + 20, y + 10, { steps: 4 })
    await draw.frames(p)
    const { note, outline } = await p.evaluate(([notes, selection]) => {
      const at = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top] }
      return { note: at([...document.querySelectorAll(notes)].find((e) => e.textContent === 'boxed')), outline: at(document.querySelector(selection)) }
    }, [TEXTS, SELECTION])
    await p.mouse.up()
    assert.ok(Math.abs(note[0] - outline[0]) <= 1 && Math.abs(note[1] - outline[1]) <= 1, `the outline is at ${outline}, the note at ${note}`)
    assert.equal(await drawnOpacity(SELECTION), 1)
  })

  it('the dashed outline of a faded note open for typing stays solid too', async () => {
    await p.keyboard.press('Escape')
    await p.mouse.dblclick(...await gridPoint(p, [1.5, 1.5]))
    await p.locator(draw.TEXT_BOX).waitFor()
    assert.equal(await p.locator(SELECTION).count(), 1, 'one outline round the open note')
    assert.equal(await drawnOpacity(SELECTION), 1)
    await p.keyboard.press('Escape')
    assert.equal(await p.locator(SELECTION).count(), 0)
  })

  it('selecting a second faded note outlines both, and ending the selection takes every outline off', async () => {
    await p.mouse.click(...await gridPoint(p, [1.5, 1.5]))
    await p.keyboard.down('Shift')
    try {
      await p.mouse.click(...await gridPoint(p, [1.5, 4.5]))
    } finally {
      await p.keyboard.up('Shift')
    }
    assert.equal(await p.locator(SELECTION).count(), 2)
    await p.keyboard.press('Escape')
    assert.equal(await p.locator(SELECTION).count(), 0)
  })
})
