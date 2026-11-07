// Live check of draw-tool.user.js's note box on sudokupad.app: a long line wraps at 16 em, a note of more than 8 lines stops growing
// there and the wheel scrolls it without reaching SudokuPad, typing keeps the caret in view, a short note and the board keep the wheel,
// the scroll bar shows only under the pointer, and markdown, line breaks and the halo still draw in a scrolled box. Real mouse and keyboard input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'

const { TEXT_BOX, TEXTS } = draw
// In cells from the grid's top left: a long one-line note, a tall note, a short note, and a cell clear of them all.
const LONG_AT = [1.5, 4.5]
const TALL_AT = [4.5, 4.5]
const SHORT_AT = [7.5, 1.5]
const EMPTY_AT = [7.5, 7.5]
const LONG_TEXT = 'word '.repeat(20).trim()
const TALL_LINES = [...Array.from({ length: 11 }, (_, i) => `line ${i + 1}`), '**end**']
// The box's automatic size, in em of the note's text size: 16 wide and 8 lines of 1.15 high.
const BOX_WIDTH_EM = 16
const BOX_HEIGHT_EM = 8 * 1.15
const NEAR_PX = 1.5

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Annotation\'s note box', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const moveTo = async (at) => p.mouse.move(...await gridPoint(p, at))
  const typeNote = async (at, lines) => {
    await p.mouse.click(...await gridPoint(p, at))
    for (const [i, line] of lines.entries()) {
      if (i) await p.keyboard.press('Enter')
      await p.keyboard.type(line)
    }
  }
  // The note whose text begins with `start`, in the layer: its content box in pixels and in em, its scroll, and its look.
  const note = (start, selector = TEXTS) => read(([s, want]) => {
    const e = [...document.querySelectorAll(s)].find((n) => n.textContent.startsWith(want))
    const style = window.getComputedStyle(e)
    const em = parseFloat(style.fontSize)
    const width = e.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const height = e.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    return {
      em,
      width,
      height,
      widthEm: width / em,
      heightEm: height / em,
      scrollTop: e.scrollTop,
      scrollRoom: e.scrollHeight - e.clientHeight,
      overflowY: style.overflowY,
      scrollbarColor: style.scrollbarColor,
      halo: parseFloat(style.webkitTextStrokeWidth),
      padding: parseFloat(style.paddingLeft),
      bold: [...e.querySelectorAll('span')].filter((span) => Number(window.getComputedStyle(span).fontWeight) >= 700).map((span) => span.textContent)
    }
  }, [selector, start])
  // Every wheel SudokuPad's document saw since the last call, each as whether something cancelled it.
  const wheelsSeen = () => read(() => window.__wheels.splice(0))

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.reload(p)
    await draw.pickDraw(p)
    await read(() => {
      window.__wheels = []
      document.addEventListener('wheel', (event) => window.__wheels.push(event.defaultPrevented))
    })
  })
  after(async () => { await context.close() })

  it('a line longer than 16 em wraps inside a box 16 em wide, and does not scroll', async () => {
    await typeNote(LONG_AT, [LONG_TEXT])
    await p.keyboard.press('Escape')
    const long = await note('word')
    assert.ok(long.widthEm <= BOX_WIDTH_EM + 0.05 && long.widthEm > BOX_WIDTH_EM - 2, `${long.widthEm} em wide`)
    assert.ok(long.heightEm > 2 * 1.15 - 0.05, `${long.heightEm} em high: wrapped onto more than one line`)
    assert.equal(long.overflowY, 'hidden', 'no scroll bar')
  })

  it('typing past the box\'s bottom keeps the caret line in view', async () => {
    await typeNote(TALL_AT, TALL_LINES)
    const caret = await read((selector) => {
      const box = document.querySelector(selector).getBoundingClientRect()
      const range = window.getSelection().getRangeAt(0)
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
      return { top: rect.top - box.top, bottom: box.bottom - rect.bottom, height: rect.height }
    }, TEXT_BOX)
    assert.ok(caret.height > 0, 'the caret has a line box')
    assert.ok(caret.top >= -NEAR_PX && caret.bottom >= -NEAR_PX, `caret ${caret.top}px below the box's top and ${caret.bottom}px above its bottom`)
    assert.ok((await note('line 1', TEXT_BOX)).scrollTop > 0, 'the open box scrolled to its last line')
    await p.keyboard.press('Escape')
  })

  it('a note of more than 8 lines stops growing at 8 lines high, and its text runs past the box', async () => {
    const tall = await note('line 1')
    assert.ok(Math.abs(tall.height - BOX_HEIGHT_EM * tall.em) <= NEAR_PX, `${tall.heightEm} em high`)
    assert.ok(tall.scrollRoom > tall.em, `${tall.scrollRoom}px past the box`)
    assert.equal(tall.scrollTop, 0, 'a finished note starts at its first line')
  })

  it('the scroll bar shows while the pointer is over the note and hides when it leaves', async () => {
    await moveTo(EMPTY_AT)
    const away = await note('line 1')
    await moveTo(TALL_AT)
    const over = await note('line 1')
    assert.equal(over.overflowY, 'auto')
    assert.notEqual(over.scrollbarColor, away.scrollbarColor, `bar color ${over.scrollbarColor} over the note, ${away.scrollbarColor} away`)
    await moveTo(EMPTY_AT)
    assert.equal((await note('line 1')).scrollbarColor, away.scrollbarColor)
  })

  it('the wheel over the tall note scrolls its text and never reaches SudokuPad, until it can scroll no further', async () => {
    await moveTo(TALL_AT)
    await wheelsSeen()
    await p.mouse.wheel(0, 40)
    const scrolled = await note('line 1')
    assert.ok(scrolled.scrollTop > 0, `scrolled ${scrolled.scrollTop}px`)
    assert.deepEqual(await wheelsSeen(), [], 'SudokuPad saw no wheel')
    await p.mouse.wheel(0, 5000)
    const bottom = await note('line 1')
    assert.ok(Math.abs(bottom.scrollTop - bottom.scrollRoom) <= 1, `at the bottom: ${bottom.scrollTop} of ${bottom.scrollRoom}`)
    await p.mouse.wheel(0, 40)
    assert.deepEqual(await wheelsSeen(), [false], 'at the bottom, the wheel down reaches SudokuPad untouched')
  })

  it('markdown, line breaks and the halo still draw in the scrolled box, the halo inside its padding', async () => {
    const tall = await note('line 1')
    assert.deepEqual(tall.bold, ['end'])
    assert.equal((await draw.texts(p)).find((t) => t.startsWith('line 1')), TALL_LINES.join('\n').replace('**end**', 'end'))
    assert.ok(tall.halo > 0, `a halo of ${tall.halo}px`)
    assert.ok(tall.padding >= tall.halo / 2 - 0.5, `padding ${tall.padding}px holds a halo reaching ${tall.halo / 2}px past the letters`)
  })

  it('a redraw, such as selecting the note, keeps its scroll', async () => {
    const before = (await note('line 1')).scrollTop
    await p.mouse.click(...await gridPoint(p, TALL_AT))
    assert.equal((await note('line 1')).scrollTop, before)
    await p.keyboard.press('Escape')
  })

  it('the wheel over a short note, or over the board, reaches SudokuPad untouched, as before', async () => {
    await typeNote(SHORT_AT, ['15'])
    await p.keyboard.press('Escape')
    await wheelsSeen()
    await moveTo(SHORT_AT)
    await p.mouse.wheel(0, 40)
    await moveTo(EMPTY_AT)
    await p.mouse.wheel(0, 40)
    assert.deepEqual(await wheelsSeen(), [false, false])
    assert.equal((await note('15')).overflowY, 'hidden', 'a short note has no scroll bar')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
