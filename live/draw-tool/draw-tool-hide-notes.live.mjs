// Live check of draw-tool.user.js's Hide all notes button on sudokupad.app in headless Chromium at 1280x720: the eye sits at the right end of the sliders' block with both sliders beside it and
// no overlap; a click hides every note (none visible, none hit-testable, selection cleared) and shows the closed eye; another click brings them back in place; a click on the board while they
// are hidden shows them all and opens the new note; Undo straight after Restart shows them when it brings notes back; a reload shows the notes. Real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as draw from './draw-tool-fixtures.mjs'
import { readUntil, stable } from '../settle.mjs'
import { useBrowser } from '../session.mjs'
import { clickAt, finishNote, gridPoint, restart, typeText } from '../board.mjs'

const { HIDE_BUTTON, OPACITY_SLIDER, SIZE_SLIDER, SLIDERS, TEXTS, TEXT_BOX, noteStart, texts } = draw
const A = [1.5, 1.5]
const B = [3.5, 5.5]

const browser = useBrowser()

describe('Text Anywhere\'s Hide all notes button', { concurrency: false }, () => {
  let context, p, errors

  const reload = () => draw.reloadOnDraw(p)
  const eye = () => p.locator(HIDE_BUTTON)
  const pressed = () => eye().getAttribute('aria-pressed')
  const painted = () => p.evaluate((selector) => [...document.querySelectorAll(selector)].filter((e) => e.checkVisibility({ visibilityProperty: true })).length, TEXTS)
  const hitNotes = () => p.evaluate((selector) => [...document.querySelectorAll(selector)].flatMap((note) => {
    const { x, y, width, height } = note.getBoundingClientRect()
    return document.elementsFromPoint(x + width / 2, y + height / 2).filter((e) => e.matches(selector))
  }).length, TEXTS)
  const selectedCount = () => p.locator(draw.SELECTED).count()

  before(async () => {
    ;({ context, p, errors } = await draw.open(browser(), { contextOptions: { viewport: { width: 1280, height: 720 } } }))
    await draw.forgetDrawings(p)
    await reload()
    await typeText(p, A, 'one')
    await typeText(p, B, 'two')
  })
  after(async () => { await context.close() })

  const checkLayout = async (page) => {
    assert.equal(await page.locator(HIDE_BUTTON).getAttribute('aria-pressed'), 'false')
    assert.equal(await page.locator(HIDE_BUTTON).getAttribute('title'), 'Hide all notes')
    const rect = (selector) => page.locator(selector).evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom } })
    const [button, size, opacity, block, panel] = await Promise.all([HIDE_BUTTON, SIZE_SLIDER, OPACITY_SLIDER, SLIDERS, draw.KEYPAD].map(rect))
    assert.ok(size.right <= button.x && opacity.right <= button.x, 'either slider ends before the eye starts')
    assert.ok(button.y < size.bottom && button.bottom > opacity.y, 'the eye is level with both slider rows')
    assert.ok(Math.abs((button.y + button.bottom) / 2 - (size.y + opacity.bottom) / 2) <= 2, 'and centered on the two')
    assert.ok(size.bottom <= opacity.y + 1, 'the sliders do not overlap')
    assert.ok(Math.min(size.x, opacity.x) >= block.x && button.right <= block.right && block.right <= panel.right, 'all fit the block, inside the panel')
    assert.ok(size.right - size.x > 60, 'a slider keeps room to drag')
  }

  it('the eye is an open eye at the right of the sliders block, level with both sliders and clear of them, inside the panel', async () => {
    await checkLayout(p)
  })

  it('the same layout holds at 1920x1080 and 1366x768', async () => {
    for (const [width, height] of [[1920, 1080], [1366, 768]]) {
      await p.setViewportSize({ width, height })
      // The page lays the board and the panel out again on the resize; the layout holds once the panel has stopped moving.
      await stable(() => p.locator(draw.KEYPAD).boundingBox())
      await checkLayout(p)
    }
    await p.setViewportSize({ width: 1280, height: 720 })
  })

  it('a click hides every note, none can be hit, the selection is cleared and the eye closes', async () => {
    await clickAt(p, A)
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
    await clickAt(p, [6.5, 2.5])
    await p.locator(TEXT_BOX).waitFor()
    assert.equal(await pressed(), 'false')
    assert.equal(await painted(), 2)
    await p.keyboard.type('three')
    await finishNote(p)
    assert.deepEqual(await texts(p), ['one', 'two', 'three'])
  })

  it('Undo straight after Restart shows the notes it brings back, though they were hidden', async () => {
    await restart(p)
    assert.deepEqual(await readUntil(() => texts(p), (t) => t.length === 0), [])
    await eye().click()
    assert.equal(await pressed(), 'true')
    await p.click('#control-undo')
    assert.deepEqual(await readUntil(() => texts(p), (t) => t.length === 3), ['one', 'two', 'three'])
    assert.equal(await pressed(), 'false')
    assert.equal(await painted(), 3)
  })

  it('Clear all while hidden shows the notes first, then asks', async () => {
    await eye().click()
    assert.equal(await painted(), 0)
    await p.click(draw.CLEAR_BUTTON)
    await p.locator(draw.DIALOG).waitFor()
    assert.equal(await pressed(), 'false')
    assert.equal(await painted(), (await texts(p)).length)
    await p.locator(`${draw.DIALOG} button`).filter({ hasText: 'Cancel' }).click()
    await p.locator(draw.DIALOG).waitFor({ state: 'detached' })
    assert.deepEqual(await texts(p), ['one', 'two', 'three'])
  })

  // Loads the puzzle on the page again through the page's own loader, as a puzzle with `id`, in place and with no reload.
  it('loading another puzzle in place shows its notes though the last one\'s were hidden', async () => {
    const other = 'puzzle-hide-637'
    await p.evaluate(([key, note]) => Framework.setData(key, [note]), [`${draw.DRAWING_PREFIX}${other}`, { kind: 'text', color: 1, size: 20, opacity: 100, text: 'elsewhere', at: [160, 160] }])
    await eye().click()
    assert.equal(await pressed(), 'true')
    await p.addScriptTag({ content: 'window.pageLoader = PuzzleLoader' })
    await p.evaluate(async ([key, as]) => {
      const { parsePuzzleData, fetchPuzzle } = window.pageLoader
      const data = await parsePuzzleData(await fetchPuzzle(key))
      data.id = as
      await Framework.app.loadCTCPuzzle(data)
    }, [new URL(p.url()).pathname.slice(1), other])
    await p.waitForFunction((as) => Framework.app.puzzle.puzzleId === as, other)
    assert.deepEqual(await readUntil(() => texts(p), (t) => t.length === 1), ['elsewhere'])
    assert.equal(await pressed(), 'false')
    assert.equal(await painted(), 1)
  })

  it('a reload after hiding shows the notes', async () => {
    await eye().click()
    assert.equal(await painted(), 0)
    await reload()
    assert.equal(await pressed(), 'false')
    assert.equal(await painted(), 3)
  })

  it('the open note is closed and saved when the eye is clicked', async () => {
    await clickAt(p, [7.5, 7.5])
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
