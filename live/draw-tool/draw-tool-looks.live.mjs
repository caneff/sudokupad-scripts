// Live check of draw-tool.user.js's looks on sudokupad.app: a note under the pointer that is neither selected nor open gets a faint purple outline, and only
// while Text Anywhere is the current tool; the cursor is `move` on a closed note and `text` in the open one; the resize handles are 11 px squares with a white
// border and a purple ring; a selected note's outline and the selection rectangle are solid. Real mouse input, computed styles read off the page.
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
const FADED = [7.5, 4.5]
const ITEMS = [
  { kind: 'text', color: 1, size: 20, opacity: 100, text: 'A', at: [96, 96] },
  { kind: 'text', color: 4, size: 20, opacity: 100, text: 'B', at: [288, 96] },
  { kind: 'text', color: 1, size: 20, opacity: 40, bg: true, text: 'F', at: [288, 480] }
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
  // The computed values of `props` on the first element matching `selector` whose text is `text`, or the first at all.
  const styleOf = (selector, props, text) => p.evaluate(([s, names, t]) => {
    const found = [...document.querySelectorAll(s)].find((e) => t === undefined || e.textContent === t)
    const style = window.getComputedStyle(found)
    return Object.fromEntries(names.map((name) => [name, style[name]]))
  }, [selector, props, text])
  const noteStyle = (text, props) => styleOf(TEXTS, props, text)
  // The alpha a computed color carries: the 4th part of rgba() or after the slash of color(srgb ...).
  const alphaOf = (color) => Number(/(?:, | \/ )([\d.]+)\)$/.exec(color)?.[1] ?? 1)
  // The red, green and blue of a computed color, as 0 to 1.
  const channelsOf = (color) => (/\(([^)]+)\)/.exec(color)?.[1] ?? '').replace('srgb', '').split(/[ ,/]+/).filter(Boolean).slice(0, 3).map((v) => Number(v) > 1 ? Number(v) / 255 : Number(v))
  const PURPLE = [0x6a, 0x1b, 0x9a].map((v) => v / 255)
  const nearPurple = (color) => channelsOf(color).every((v, i) => Math.abs(v - PURPLE[i]) < 0.01)

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport: { width: 1200, height: 900 } } }))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.plantDrawing(p, ITEMS)
    await draw.reload(p)
    await pickDraw(p)
  })
  after(async () => { await context.close() })

  it('a note under the pointer gets a faint purple outline and fill, and the note beside it and empty space get none', async () => {
    await moveTo(EMPTY)
    assert.equal((await noteStyle('A', ['outlineStyle'])).outlineStyle, 'none')
    await moveTo(A)
    const hovered = await noteStyle('A', ['outlineStyle', 'outlineWidth', 'outlineOffset', 'outlineColor'])
    assert.deepEqual({ style: hovered.outlineStyle, width: hovered.outlineWidth, offset: hovered.outlineOffset }, { style: 'solid', width: '1px', offset: '2px' })
    assert.equal(alphaOf(hovered.outlineColor), 0.35, 'about 35% opacity')
    assert.equal(nearPurple(hovered.outlineColor), true, `purple, was ${hovered.outlineColor}`)
    const fill = await noteStyle('A', ['backgroundImage'])
    assert.match(fill.backgroundImage, /^linear-gradient\(/, 'a faint fill shows although the note\'s own background is transparent')
    const [fillColor] = fill.backgroundImage.match(/(?:rgba|color)\([^)]+\)/)
    assert.ok(alphaOf(fillColor) > 0 && alphaOf(fillColor) <= 0.1, `a very faint fill, was ${fillColor}`)
    assert.equal((await noteStyle('B', ['outlineStyle'])).outlineStyle, 'none', 'the other note shows none')
  })

  it('a faded note keeps a hover outline about as visible as the note, and its box stays', async () => {
    await moveTo(FADED)
    const look = await noteStyle('F', ['outlineColor', 'backgroundColor', 'opacity'])
    assert.equal(look.opacity, '0.4')
    assert.ok(alphaOf(look.outlineColor) * 0.4 > 0.3, `drawn alpha ${alphaOf(look.outlineColor) * 0.4} of a 35% outline`)
    assert.notEqual(look.backgroundColor, 'rgba(0, 0, 0, 0)', 'the box fill is still the note\'s own')
  })

  it('no outline shows under another tool, where a note takes no pointer', async () => {
    await p.click(DIGIT_BUTTON)
    await moveTo(A)
    assert.equal((await noteStyle('A', ['outlineStyle'])).outlineStyle, 'none')
    await pickDraw(p)
  })

  it('a selected note and the open note show no hover outline or fill, only their own', async () => {
    await p.mouse.click(...await gridPoint(p, A))
    await moveTo(A)
    assert.equal((await noteStyle('A', ['outlineStyle'])).outlineStyle, 'none', 'the selected note has no hover outline')
    assert.equal(await p.locator(SELECTION).count(), 1)
    await draw.finishNote(p)
    await p.mouse.dblclick(...await gridPoint(p, A))
    await p.locator(TEXT_BOX).waitFor()
    await moveTo(A)
    const open = await styleOf(TEXT_BOX, ['outlineStyle', 'backgroundImage'])
    assert.notEqual(open.outlineStyle, 'solid', 'the open note has no hover outline')
    assert.equal(open.backgroundImage, 'none', 'and no hover fill')
    await draw.finishNote(p)
  })

  it('the cursor is move on a closed note and text in the open one', async () => {
    assert.equal((await noteStyle('B', ['cursor'])).cursor, 'move')
    assert.equal((await noteStyle('A', ['cursor'])).cursor, 'move')
    await p.mouse.dblclick(...await gridPoint(p, B))
    await p.locator(TEXT_BOX).waitFor()
    assert.equal((await styleOf(TEXT_BOX, ['cursor'])).cursor, 'text')
    await draw.finishNote(p)
  })

  it('the resize handles are 11 px squares with a 2 px white border, a purple ring and a shadow', async () => {
    await p.mouse.click(...await gridPoint(p, A))
    assert.equal(await p.locator(HANDLE).count(), 4)
    const handle = await styleOf(HANDLE, ['width', 'height', 'borderTopWidth', 'borderTopColor', 'boxShadow', 'cursor'])
    assert.equal(handle.width, '11px')
    assert.equal(handle.height, '11px')
    assert.equal(handle.borderTopWidth, '2px')
    assert.equal(handle.borderTopColor, 'rgb(255, 255, 255)')
    const [ring] = handle.boxShadow.split(/\)\s*,\s*/)
    assert.equal(nearPurple(ring), true, `a purple ring, was ${ring}`)
    assert.match(handle.boxShadow, /0px 0px 0px 1px/, 'a 1 px ring')
    assert.match(handle.boxShadow, /0px 1px 3px 0px/, 'a small shadow')
    assert.match(handle.cursor, /nwse-resize|nesw-resize/, 'the diagonal resize cursor stays')
    const box = await p.locator(HANDLE).first().boundingBox()
    assert.ok(Math.abs(box.width - 11) <= 0.5 && Math.abs(box.height - 11) <= 0.5, `drawn ${box.width} x ${box.height}`)
  })

  it('a selected note\'s outline is solid and 2 px', async () => {
    const outline = await styleOf(SELECTION, ['outlineStyle', 'outlineWidth'])
    assert.deepEqual(outline, { outlineStyle: 'solid', outlineWidth: '2px' })
    await draw.finishNote(p)
  })

  it('the selection rectangle is a solid 1 px line with a faint fill', async () => {
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
