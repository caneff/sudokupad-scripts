// Live check of draw-tool.user.js's open note: its text starts at the click and typing never moves that start, a double-click puts the caret at the letter clicked
// without selecting a word, the caret is the note's color and follows a recolor, and selected text is tinted in the note's color. Real mouse and keyboard input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'

const { TEXT_BOX, TEXTS } = draw
const GREEN = 3
const RED = 4
const SPOT = [2.5, 4.5]
const START_TOLERANCE_PX = 2

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s open note', { concurrency: false }, () => {
  let context, p, errors

  const key = (n) => `.controls-input button[data-key="${n}"]`
  // The screen box of one character of the first text node of the selector's element.
  const letterBox = (selector, index) => p.locator(selector).evaluate((element, i) => {
    const range = document.createRange()
    const node = element.firstChild
    range.setStart(node, i)
    range.setEnd(node, i + 1)
    const { left, right, top, bottom } = range.getBoundingClientRect()
    return { left, right, top, bottom }
  }, index)
  const resolved = (color) => p.evaluate((c) => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = window.getComputedStyle(d).color; d.remove(); return v }, color)
  const penColor = (n) => p.evaluate((i) => window.getComputedStyle(document.documentElement).getPropertyValue(`--puzzle-pencolor-${i}`).trim(), n)
  // The color of the caret the note sets itself: the computed caret-color is the text color when none is set, so the note's own declaration is read.
  const caretColor = () => p.locator(TEXT_BOX).evaluate((e) => {
    const probe = document.createElement('i')
    probe.style.color = e.style.caretColor
    document.body.append(probe)
    const color = window.getComputedStyle(probe).color
    probe.remove()
    return color
  })

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.reload(p)
    await draw.pickDraw(p)
  })
  after(async () => { await context.close() })

  it('a click then typing starts the first character at the click and at its line\'s middle, and typing more never moves it', async () => {
    const [x, y] = await gridPoint(p, SPOT)
    await p.mouse.click(x, y)
    await p.keyboard.type('Hi')
    const first = await letterBox(TEXT_BOX, 0)
    assert.ok(Math.abs(first.left - x) <= START_TOLERANCE_PX, `the first letter starts at ${first.left}, clicked at ${x}`)
    assert.ok(Math.abs((first.top + first.bottom) / 2 - y) <= START_TOLERANCE_PX + 3, `the first line's middle is ${(first.top + first.bottom) / 2}, clicked at ${y}`)
    await p.keyboard.type(' there, a long note that wraps over a few lines because it keeps on going')
    assert.equal((await letterBox(TEXT_BOX, 0)).left, first.left, 'typing more left the start where it was')
    assert.equal((await letterBox(TEXT_BOX, 0)).top, first.top)
    await p.keyboard.press('Escape')
    assert.ok(Math.abs((await letterBox(TEXTS, 0)).left - first.left) <= 0.5, 'the closed note starts where the open one did')
  })

  it('a double-click in the middle of a word puts the caret at that letter and selects no word', async () => {
    await draw.forgetDrawings(p)
    await draw.reload(p)
    await draw.pickDraw(p)
    await p.mouse.click(...await gridPoint(p, SPOT))
    await p.keyboard.type('abcdefgh')
    await p.keyboard.press('Escape')
    const fourth = await letterBox(TEXTS, 4)
    await p.mouse.dblclick(fourth.left + 1, (fourth.top + fourth.bottom) / 2)
    assert.equal(await p.locator(TEXT_BOX).count(), 1, 'the note is open')
    await p.keyboard.type('X')
    assert.equal(await p.locator(TEXT_BOX).textContent(), 'abcdXefgh')
    await p.keyboard.press('Escape')
  })

  it('a double-click past the end of the text puts the caret at the end', async () => {
    const last = await letterBox(TEXTS, 8)
    await p.mouse.dblclick(last.right + 1, (last.top + last.bottom) / 2)
    await p.keyboard.type('Y')
    assert.equal((await p.locator(TEXT_BOX).textContent()).at(-1), 'Y')
    await p.keyboard.press('Escape')
  })

  it('the caret is the note\'s color, and a recolor changes it', async () => {
    await draw.forgetDrawings(p)
    await draw.reload(p)
    await draw.pickDraw(p)
    await p.click(key(GREEN))
    await p.mouse.click(...await gridPoint(p, SPOT))
    await p.keyboard.type('ab')
    assert.equal(await caretColor(), await resolved(await penColor(GREEN)))
    await p.click(key(RED))
    assert.equal(await caretColor(), await resolved(await penColor(RED)))
    assert.notEqual(await resolved(await penColor(RED)), await resolved(await penColor(GREEN)))
  })

  it('selected text is tinted in the note\'s color, at low opacity, with no halo', async () => {
    const color = await penColor(RED)
    // The tint written out in the test, so a change to the rule's percentage or color fails here.
    const wanted = await p.evaluate((c) => { const d = document.createElement('i'); d.style.backgroundColor = `color-mix(in srgb, ${c} 25%, transparent)`; document.body.append(d); const v = window.getComputedStyle(d).backgroundColor; d.remove(); return v }, color)
    await p.locator(TEXT_BOX).focus()
    await p.keyboard.press('Control+A')
    const selection = await p.locator(TEXT_BOX).evaluate((e) => {
      const style = window.getComputedStyle(e, '::selection')
      return { background: style.backgroundColor, shadow: style.textShadow }
    })
    assert.equal(selection.background, wanted)
    assert.equal(selection.shadow, 'none')
    await p.keyboard.press('Escape')
  })

  it('no page error', () => { assert.deepEqual(errors, []) })
})
