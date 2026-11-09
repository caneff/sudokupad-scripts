// Live check of draw-tool.user.js's Hide all notes button on sudokupad.app in headless Chromium at 1280x720: the eye sits at the right end of the sliders' block with both sliders beside it and
// no overlap; a click hides every note (none visible, none hit-testable, selection cleared) and shows the closed eye; another click brings them back in place; a click on the board while they
// are hidden shows them all and opens the new note; Undo straight after Restart shows them when it brings notes back; a reload shows the notes. Real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'
import { readUntil } from '../settle.mjs'

const { HIDE_BUTTON, OPACITY_SLIDER, SIZE_SLIDER, SLIDERS, TEXTS, TEXT_BOX, noteStart, texts } = draw
const A = [1.5, 1.5]
const B = [3.5, 5.5]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Anywhere\'s Hide all notes button', { concurrency: false }, () => {
  let context, p, errors

  const clickAt = async (at) => p.mouse.click(...await gridPoint(p, at))
  const typeText = async (at, content) => {
    await clickAt(at)
    await p.keyboard.type(content)
    await draw.finishNote(p)
  }
  const reload = async () => {
    await draw.reload(p)
    await draw.pickDraw(p)
  }
  const eye = () => p.locator(HIDE_BUTTON)
  const pressed = () => eye().getAttribute('aria-pressed')
  // How many notes the page draws, and how many of them it paints.
  const painted = () => p.evaluate((selector) => [...document.querySelectorAll(selector)].filter((e) => e.checkVisibility({ visibilityProperty: true })).length, TEXTS)
  // The notes the page would hit at the middle of each drawn note.
  const hitNotes = () => p.evaluate((selector) => [...document.querySelectorAll(selector)].flatMap((note) => {
    const { x, y, width, height } = note.getBoundingClientRect()
    return document.elementsFromPoint(x + width / 2, y + height / 2).filter((e) => e.matches(selector))
  }).length, TEXTS)
  const selectedCount = () => p.locator(draw.SELECTED).count()
  const restartFromDialog = async () => {
    await p.click('#control-restart')
    await p.locator('.dialog button').filter({ hasText: /Restart/ }).filter({ hasNotText: /Keep Time/ }).first().click()
    await p.locator('.dialog').waitFor({ state: 'detached' })
  }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser, { contextOptions: { viewport: { width: 1280, height: 720 } } }))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await reload()
    await typeText(A, 'one')
    await typeText(B, 'two')
  })
  after(async () => { await context.close() })

  it('the eye is an open eye at the right of the sliders block, level with both sliders and clear of them, inside the panel', async () => {
    assert.equal(await pressed(), 'false')
    assert.equal(await eye().getAttribute('title'), 'Hide all notes')
    const rect = (selector) => p.locator(selector).evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom } })
    const [button, size, opacity, block, panel] = await Promise.all([HIDE_BUTTON, SIZE_SLIDER, OPACITY_SLIDER, SLIDERS, draw.KEYPAD].map(rect))
    assert.ok(size.right <= button.x && opacity.right <= button.x, 'either slider ends before the eye starts')
    assert.ok(button.y < size.bottom && button.bottom > opacity.y, 'the eye is level with both slider rows')
    assert.ok(Math.abs((button.y + button.bottom) / 2 - (size.y + opacity.bottom) / 2) <= 2, 'and centered on the two')
    assert.ok(size.bottom <= opacity.y + 1, 'the sliders do not overlap')
    assert.ok(Math.min(size.x, opacity.x) >= block.x && button.right <= block.right && block.right <= panel.right, 'all fit the block, inside the panel')
    assert.ok(size.right - size.x > 60, 'a slider keeps room to drag')
  })

  it('a click hides every note, none can be hit, the selection is cleared and the eye closes', async () => {
    await clickAt(A)
    assert.equal(await selectedCount(), 1, 'a note is selected first')
    await eye().click()
    assert.equal(await pressed(), 'true')
    assert.equal(await eye().getAttribute('title'), 'Show all notes')
    assert.equal(await painted(), 0)
    assert.equal(await hitNotes(), 0)
    assert.equal(await selectedCount(), 0)
    assert.equal(await p.locator('#draw-tool-layer .draw-tool-resize, #draw-tool-layer .draw-tool-selection').evaluateAll((all) => all.filter((e) => e.checkVisibility({ visibilityProperty: true })).length), 0, 'no outline or handle shows')
  })

  it('a hover over where a note was shows no outline, and a drag across it selects nothing', async () => {
    const [x, y] = await noteStart(p, 'one')
    await p.mouse.move(x + 5, y)
    assert.equal(await p.locator('#draw-tool-layer .draw-tool-hovered').count(), 0)
    await p.mouse.move(...await gridPoint(p, [0.2, 0.2]))
    await p.mouse.down()
    await p.mouse.move(...await gridPoint(p, [8.8, 8.8]), { steps: 6 })
    await p.mouse.up()
    assert.equal(await selectedCount(), 0)
    assert.equal(await pressed(), 'true', 'a drag over the board leaves the notes hidden')
  })

  it('a right click where a note was erases nothing', async () => {
    await p.mouse.click(...await gridPoint(p, A), { button: 'right' })
    assert.deepEqual((await draw.saved(p)).map((item) => item.text), ['one', 'two'])
  })

  it('a second click shows every note again in place, and the eye opens', async () => {
    await eye().click()
    assert.equal(await pressed(), 'false')
    assert.equal(await eye().getAttribute('title'), 'Hide all notes')
    assert.equal(await painted(), 2)
    assert.deepEqual(await texts(p), ['one', 'two'])
    const [x, y] = await noteStart(p, 'one')
    const start = await gridPoint(p, A)
    assert.ok(Math.hypot(x - start[0], y - start[1]) < 20, 'the note is where it was')
  })

  it('hiding is not an edit: the saved notes are untouched and nothing is stored for it', async () => {
    const before = JSON.stringify(await draw.saved(p))
    const keys = () => p.evaluate(() => Object.keys(window.localStorage).sort())
    const keysBefore = await keys()
    await eye().click()
    await eye().click()
    assert.equal(JSON.stringify(await draw.saved(p)), before)
    assert.deepEqual(await keys(), keysBefore)
  })

  it('a click where a hidden note was selects nothing: it shows the notes and opens a new one', async () => {
    await eye().click()
    const [x, y] = await noteStart(p, 'one')
    await p.mouse.click(x + 5, y)
    await p.locator(TEXT_BOX).waitFor()
    assert.equal(await selectedCount(), 0)
    assert.equal(await painted(), 2)
    assert.equal(await p.locator(TEXT_BOX).textContent(), '', 'a new empty note, not the old one reopened')
    await p.keyboard.press('Escape')
    assert.deepEqual(await texts(p), ['one', 'two'])
  })

  it('a click on the board while hidden shows every note and opens the new one', async () => {
    await eye().click()
    assert.equal(await painted(), 0)
    await clickAt([6.5, 2.5])
    await p.locator(TEXT_BOX).waitFor()
    assert.equal(await pressed(), 'false')
    assert.equal(await painted(), 2)
    await p.keyboard.type('three')
    await draw.finishNote(p)
    assert.deepEqual(await texts(p), ['one', 'two', 'three'])
  })

  it('Undo straight after Restart shows the notes it brings back, though they were hidden', async () => {
    await restartFromDialog()
    assert.deepEqual(await readUntil(() => texts(p), (t) => t.length === 0), [])
    await eye().click()
    assert.equal(await pressed(), 'true')
    await p.click('#control-undo')
    assert.deepEqual(await readUntil(() => texts(p), (t) => t.length === 3), ['one', 'two', 'three'])
    assert.equal(await pressed(), 'false')
    assert.equal(await painted(), 3)
  })

  it('a reload after hiding shows the notes', async () => {
    await eye().click()
    assert.equal(await painted(), 0)
    await reload()
    assert.equal(await pressed(), 'false')
    assert.equal(await painted(), 3)
  })

  it('the open note is closed and saved when the eye is clicked', async () => {
    await clickAt([7.5, 7.5])
    await p.keyboard.type('four')
    await eye().click()
    assert.equal(await p.locator(TEXT_BOX).count(), 0)
    assert.equal(await pressed(), 'true')
    assert.ok((await draw.saved(p)).some((item) => item.text === 'four'))
    await eye().click()
    assert.equal(await painted(), 4)
  })

  it('opens no page error', () => {
    assert.deepEqual(errors, [])
  })
})
