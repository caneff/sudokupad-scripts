// Live check of draw-tool.user.js's code in notes on sudokupad.app: a finished note shows `inline code` and a ``` block in monospace on a tinted background with the
// backticks hidden and a block's leading spaces kept, symbols and markup are left alone inside both, and reopening the note shows the raw text. Real mouse and keyboard input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'

const { TEXT_BOX, TEXTS } = draw
const CODE_AT = [1.5, 1.5]
const INLINE = '.draw-tool-code:not(.draw-tool-code-block)'
const BLOCK = '.draw-tool-code-block'
const NOTE_TEXT = 'a `x->y` b **c**\n```js\n  - [ ] k ->\n**b** sum\n    z=1 <=\n```\nafter -> z'
// What typing leaves: only the pair outside code became a sign.
const TYPED_TEXT = NOTE_TEXT.replace('after -> z', 'after → z')
const BLOCK_TEXT = '  - [ ] k ->\n**b** sum\n    z=1 <='
const MID_AT = [3.5, 3.5]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s code in notes', { concurrency: false }, () => {
  let context, p, errors

  // The look of every code element in the finished note.
  const looks = () => p.evaluate(([selector, inline, block]) => {
    const note = document.querySelector(selector)
    const read = (e) => {
      const style = window.getComputedStyle(e)
      return { text: e.textContent, family: style.fontFamily, background: style.backgroundColor, radius: parseFloat(style.borderTopLeftRadius) }
    }
    return { note: note.textContent, inline: [...note.querySelectorAll(inline)].map(read), blocks: [...note.querySelectorAll(block)].map(read), bullets: note.querySelectorAll('.draw-tool-check').length }
  }, [TEXTS, INLINE, BLOCK])

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.pickDraw(p)
  })
  after(async () => { await context.close() })

  it('typing symbols inside inline code and inside a block leaves them, and outside both converts them', async () => {
    await p.mouse.click(...await gridPoint(p, CODE_AT))
    await p.keyboard.type(NOTE_TEXT)
    assert.equal(await p.locator(TEXT_BOX).textContent(), TYPED_TEXT)
    await draw.finishNote(p)
    assert.deepEqual((await draw.saved(p)).map((item) => item.text), [TYPED_TEXT])
  })

  it('a pair typed in the middle of a later line keeps the caret right after it, and "sum" closed by its backtick stays', async () => {
    await p.mouse.click(...await gridPoint(p, MID_AT))
    await p.keyboard.type('a\nb c')
    await p.keyboard.press('ArrowLeft')
    await p.keyboard.press('ArrowLeft')
    await p.keyboard.type('->X')
    assert.equal(await p.locator(TEXT_BOX).textContent(), 'a\nb→X c')
    await p.keyboard.press('Control+A')
    await p.keyboard.type('`sum` `x')
    assert.equal(await p.locator(TEXT_BOX).textContent(), '`sum` `x')
    await draw.finishNote(p)
  })

  it('the finished note shows monospace on a tinted background, hides the backticks and keeps a block\'s spaces', async () => {
    const seen = await looks()
    assert.equal(seen.note, `a x->y b c${BLOCK_TEXT}after → z`)
    assert.deepEqual(seen.inline.map((e) => e.text), ['x->y'])
    assert.deepEqual(seen.blocks.map((e) => e.text), [BLOCK_TEXT])
    assert.equal(seen.bullets, 0, 'the checklist line inside the block is plain text')
    for (const e of [...seen.inline, ...seen.blocks]) {
      assert.match(e.family, /mono/i)
      assert.notEqual(e.background, 'rgba(0, 0, 0, 0)')
      assert.ok(e.radius > 0, 'rounded corners')
    }
  })

  it('the tint is made from the note\'s text color', async () => {
    const [text, tint] = await p.evaluate(([selector, inline]) => {
      const note = document.querySelector(selector)
      return [window.getComputedStyle(note).color, window.getComputedStyle(note.querySelector(inline)).backgroundColor]
    }, [TEXTS, INLINE])
    // Chrome reports a mixed color as `color(srgb r g b / a)` with channels from 0 to 1, and a plain one as `rgb(r, g, b)` from 0 to 255.
    const channels = (color) => color.match(/[\d.]+/g).slice(0, 3).map((c) => Math.round(color.startsWith('color(') ? Number(c) * 255 : Number(c)))
    assert.deepEqual(channels(tint), channels(text), 'the tint is the text color at low alpha')
    assert.ok(Number(tint.match(/[\d.]+/g)[3]) < 0.5)
  })

  it('reopening the note shows the raw text, backticks and all, and a reload keeps the code', async () => {
    await draw.reopen(p, await gridPoint(p, CODE_AT))
    assert.equal(await p.locator(TEXT_BOX).textContent(), TYPED_TEXT)
    await draw.finishNote(p)
    await draw.reload(p)
    await draw.pickDraw(p)
    assert.deepEqual((await looks()).blocks.map((e) => e.text), [BLOCK_TEXT])
    assert.deepEqual(errors, [])
  })
})
