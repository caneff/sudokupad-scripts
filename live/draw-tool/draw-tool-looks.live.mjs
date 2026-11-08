// Live check of draw-tool.user.js's looks on sudokupad.app: a note under the pointer that is neither selected nor open gets a faint purple outline, and only
// while Text Anywhere is the current tool; the cursor is `move` on a closed note and `text` in the open one; the resize handles are 11 px squares with a white
// border and a purple ring; a selected note's outline and the drag-select box are solid. Real mouse input, computed styles read off the page.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'

const { DIGIT_BUTTON, TEXT_BOX, TEXTS, pickDraw } = draw
const SELECTION = '#draw-tool-layer .draw-tool-selection'
const HANDLE = '#draw-tool-layer .draw-tool-resize'
const RECTANGLE = '#draw-tool-layer .draw-tool-selection-rectangle'
// In cells from the grid's top left: two notes and empty space.
const A = [1.5, 1.5]
const B = [1.5, 4.5]
const EMPTY = [7.5, 7.5]
const ITEMS = [
  { kind: 'text', color: 1, size: 20, opacity: 100, text: 'A', at: [96, 96] },
  { kind: 'text', color: 4, size: 20, opacity: 100, text: 'B', at: [288, 96] }
]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s looks', { concurrency: false }, () => {
  let context, p, errors

  const moveTo = async (at) => {
    await p.mouse.move(...await gridPoint(p, at))
    await draw.frames(p)
  }
  const styleOf = (selector, props) => p.evaluate(([s, names]) => {
    const style = window.getComputedStyle([...document.querySelectorAll(s)][0])
    return Object.fromEntries(names.map((name) => [name, style[name]]))
  }, [selector, props])
  const noteStyle = (text, props) => p.evaluate(([s, t, names]) => {
    const style = window.getComputedStyle([...document.querySelectorAll(s)].find((e) => e.textContent === t))
    return Object.fromEntries(names.map((name) => [name, style[name]]))
  }, [TEXTS, text, props])

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport: { width: 1200, height: 900 } } }))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.plantDrawing(p, ITEMS)
    await draw.reload(p)
    await pickDraw(p)
  })
  after(async () => { await context.close() })

  it('a note under the pointer gets a faint purple outline, and the note beside it and empty space get none', async () => {
    await moveTo(EMPTY)
    assert.equal((await noteStyle('A', ['outlineStyle'])).outlineStyle, 'none')
    await moveTo(A)
    const hovered = await noteStyle('A', ['outlineStyle', 'outlineWidth', 'outlineOffset', 'outlineColor'])
    assert.deepEqual({ style: hovered.outlineStyle, width: hovered.outlineWidth, offset: hovered.outlineOffset }, { style: 'solid', width: '1px', offset: '2px' })
    assert.match(hovered.outlineColor, /(, | \/ )0\.35\)$/, 'about 35% opacity')
    assert.equal((await noteStyle('B', ['outlineStyle'])).outlineStyle, 'none', 'the other note shows none')
  })

  it('no outline shows under another tool', async () => {
    await p.click(DIGIT_BUTTON)
    await moveTo(A)
    assert.equal((await noteStyle('A', ['outlineStyle'])).outlineStyle, 'none')
    await pickDraw(p)
  })

  it('a selected note and the open note show no hover outline, only their own', async () => {
    await p.mouse.click(...await gridPoint(p, A))
    await moveTo(A)
    assert.equal((await noteStyle('A', ['outlineStyle'])).outlineStyle, 'none', 'the selected note has no hover outline')
    assert.equal(await p.locator(SELECTION).count(), 1)
    await p.keyboard.press('Escape')
    await p.mouse.dblclick(...await gridPoint(p, A))
    await p.locator(TEXT_BOX).waitFor()
    await moveTo(A)
    assert.notEqual((await styleOf(TEXT_BOX, ['outlineStyle'])).outlineStyle, 'solid', 'the open note has no hover outline')
    await p.keyboard.press('Escape')
  })

  it('the cursor is move on a closed note and text in the open one', async () => {
    assert.equal((await noteStyle('B', ['cursor'])).cursor, 'move')
    assert.equal((await noteStyle('A', ['cursor'])).cursor, 'move')
    await p.mouse.dblclick(...await gridPoint(p, B))
    await p.locator(TEXT_BOX).waitFor()
    assert.equal((await styleOf(TEXT_BOX, ['cursor'])).cursor, 'text')
    await p.keyboard.press('Escape')
  })

  it('the resize handles are 11 px squares with a 2 px white border, a purple ring and a shadow', async () => {
    await p.mouse.click(...await gridPoint(p, A))
    assert.equal(await p.locator(HANDLE).count(), 4)
    const handle = await styleOf(HANDLE, ['width', 'height', 'borderTopWidth', 'borderTopColor', 'boxShadow', 'cursor'])
    assert.equal(handle.width, '11px')
    assert.equal(handle.height, '11px')
    assert.equal(handle.borderTopWidth, '2px')
    assert.equal(handle.borderTopColor, 'rgb(255, 255, 255)')
    assert.match(handle.boxShadow, /0px 0px 0px 1px/, 'a 1 px ring')
    assert.match(handle.boxShadow, /0px 1px 3px 0px/, 'a small shadow')
    assert.match(handle.cursor, /nwse-resize|nesw-resize/, 'the diagonal resize cursor stays')
    const box = await p.locator(HANDLE).first().boundingBox()
    assert.ok(Math.abs(box.width - 11) <= 0.5 && Math.abs(box.height - 11) <= 0.5, `drawn ${box.width} x ${box.height}`)
  })

  it('a selected note\'s outline is solid and 2 px', async () => {
    const outline = await styleOf(SELECTION, ['outlineStyle', 'outlineWidth'])
    assert.deepEqual(outline, { outlineStyle: 'solid', outlineWidth: '2px' })
    await p.keyboard.press('Escape')
  })

  it('the drag-select box is a solid 1 px line with a faint fill', async () => {
    const [x, y] = await gridPoint(p, [5.5, 0.5])
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x + 60, y + 60, { steps: 4 })
    await p.locator(RECTANGLE).waitFor()
    const box = await styleOf(RECTANGLE, ['borderTopStyle', 'borderTopWidth', 'backgroundColor'])
    await p.mouse.up()
    assert.deepEqual({ style: box.borderTopStyle, width: box.borderTopWidth }, { style: 'solid', width: '1px' })
    assert.notEqual(box.backgroundColor, 'rgba(0, 0, 0, 0)', 'a faint fill')
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
