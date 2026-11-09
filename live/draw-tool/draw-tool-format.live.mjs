// Live check of draw-tool.user.js's Discord-style formatting in notes on sudokupad.app: a finished note shows a header, a subtext line, a two-level list, a numbered list
// and __underline__ (computed font size, text-decoration, indent), and reopening the note shows the raw text. Real mouse and keyboard input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'

const { TEXT_BOX, TEXTS } = draw
const AT = [1.5, 1.5]
const NOTE_TEXT = '## Head\n-# small\n- top\n  - deep\n1. one\n  2. two\n10. ten\nplain __under__ and **__both__**'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s Discord formatting in notes', { concurrency: false }, () => {
  let context, p, errors

  // The computed look of the block whose text starts with `start`, and of the note itself.
  const lineLook = (start) => p.evaluate(([selector, start]) => {
    const note = document.querySelector(selector)
    const line = [...note.querySelectorAll('div')].find((e) => e.textContent.startsWith(start))
    const style = window.getComputedStyle(line)
    return { size: parseFloat(style.fontSize), noteSize: parseFloat(window.getComputedStyle(note).fontSize), weight: style.fontWeight, opacity: Number(style.opacity), left: line.getBoundingClientRect().left, paddingLeft: parseFloat(style.paddingLeft), noteLeft: note.getBoundingClientRect().left, text: line.textContent }
  }, [TEXTS, start])
  const spanLook = (text) => p.evaluate(([selector, text]) => {
    const span = [...document.querySelector(selector).querySelectorAll('span')].find((e) => e.textContent === text)
    const style = window.getComputedStyle(span)
    return { decoration: style.textDecorationLine, weight: style.fontWeight }
  }, [TEXTS, text])

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.pickDraw(p)
  })
  after(async () => { await context.close() })

  it('a finished note shows a header bigger and bold, and subtext smaller and faded', async () => {
    await p.mouse.click(...await gridPoint(p, AT))
    await p.keyboard.type(NOTE_TEXT)
    await draw.finishNote(p)
    const header = await lineLook('Head')
    assert.equal(header.text, 'Head', 'the hashes are hidden')
    assert.ok(Math.abs(header.size / header.noteSize - 1.25) < 0.01, `a level 2 header is 1.25x, got ${header.size / header.noteSize}`)
    assert.ok(Number(header.weight) >= 700, `bold, got weight ${header.weight}`)
    const small = await lineLook('small')
    assert.ok(Math.abs(small.size / small.noteSize - 0.8) < 0.01, `subtext is 0.8x, got ${small.size / small.noteSize}`)
    assert.ok(small.opacity < 1, 'faded')
  })

  it('a nested bullet and a nested number sit one level further in, and a number shows as typed', async () => {
    const top = await lineLook('•top')
    const deep = await lineLook('•deep')
    const one = await lineLook('1.one')
    const two = await lineLook('2.two')
    assert.ok(deep.left > top.left, `the nested bullet is indented: ${deep.left} vs ${top.left}`)
    assert.equal(one.left, top.left, 'a top-level number lines up with a top-level bullet')
    assert.equal(two.left, deep.left, 'a nested number lines up with a nested bullet')
    const ten = await lineLook('10.ten')
    assert.ok(ten.paddingLeft > one.paddingLeft, `"10." leaves more room than "1.": ${ten.paddingLeft} vs ${one.paddingLeft}`)
  })

  it('__text__ underlines, and combines with bold', async () => {
    assert.equal((await spanLook('under')).decoration, 'underline')
    const both = await spanLook('both')
    assert.equal(both.decoration, 'underline')
    assert.ok(Number(both.weight) >= 700, `bold, got weight ${both.weight}`)
  })

  it('reopening the note shows the raw text', async () => {
    await draw.reopen(p, await gridPoint(p, AT))
    assert.equal(await p.locator(TEXT_BOX).textContent(), NOTE_TEXT)
    await draw.finishNote(p)
    assert.deepEqual(errors, [])
  })
})
