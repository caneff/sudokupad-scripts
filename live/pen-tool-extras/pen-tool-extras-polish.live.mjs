// Live check of Pen Tool Extras' small touches (#547) on sudokupad.app in headless Chromium: a press state on the panel buttons, the grid's hand cursor kept under the pen tool, an erased line that
// leaves no copy, a fade-in on edit mode's pickers, the press state and the pickers off under reduced motion, and a pixel floor on the corner and the right-click line hit.
// Every press, click and drag is real mouse input. The floor is checked on a grid scaled to half size (a 35 px cell at 1200 x 900), which is what a big grid does to its cells.
/* global Framework */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { assertPressState, openPage, restartPuzzle, startPuzzle } from '../page.mjs'
import { cellCentre, drag, gridPoint, openPenTool, penEntries, penValuesAt, plantUnchecked } from '../pen.mjs'
import { settle } from '../settle.mjs'

const { HOLD_TO_EDIT_MS, HIT_FLOOR_PX, CORNER_RADIUS, CORNER_RADIUS_MAX, LINE_HIT_RADIUS, LINE_HIT_RADIUS_MAX } = createRequire(import.meta.url)('../../pen-tool-extras.user.js')
const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')

const MARKS_KEY = 'EdgeMarks_marks'
const PICKERS = '.tool-pen .pen-tool-extras-picker'
const PANEL_BUTTONS = { 'a color button': '.tool-pen button[data-key="2"]', 'the line mode button': '.pen-tool-extras-mode', 'the page button': '.pen-tool-extras-page', 'the settings button': '.pen-tool-extras-settings' }

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

const boot = async (p) => {
  await startPuzzle(p)
  await plantUnchecked(p, MARKS_KEY, JSON.stringify({ x: true, directions: false, circle: true, cornerX: true, cornerCircle: true }))
  await p.addScriptTag({ content: script })
  await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
  await p.evaluate(() => Framework.setSetting('toolpen', true))
  await p.locator('#control-pen').waitFor({ state: 'visible' })
  await openPenTool(p)
  await p.locator('.pen-tool-extras-page').waitFor({ state: 'visible' })
  await p.locator('.tool-pen button[data-key="1"]').click()
}

// From now until `stopWatchingCopies`, the SVG elements that join the page, whatever their class: an erase only takes strokes away, so any that join are a copy of the erased line.
const watchCopies = (p) => p.evaluate(() => {
  window.__added = []
  window.__copyWatch = new window.MutationObserver((records) => {
    window.__added.push(...records.flatMap((r) => [...r.addedNodes]).filter((n) => n instanceof window.SVGElement).map((n) => `${n.outerHTML.slice(0, 120)} in ${n.parentNode.id || n.parentNode.getAttribute('class')}`))
  })
  window.__copyWatch.observe(document.documentElement, { childList: true, subtree: true })
})
const stopWatchingCopies = (p) => p.evaluate(() => {
  window.__copyWatch.disconnect()
  return window.__added
})

for (const [name, contextOptions, reduced] of [['', {}, false], [' under reduced motion', { reducedMotion: 'reduce' }, true]]) {
  describe(`Pen Tool Extras${name}`, { concurrency: false }, () => {
    let context, p
    const undoDepth = () => p.evaluate(() => Framework.app.puzzle.undoStack.length)
    before(async () => {
      ;({ context, p } = await openPage(browser, { contextOptions }))
      await boot(p)
    })
    after(async () => { await context.close() })

    for (const [what, selector] of Object.entries(PANEL_BUTTONS)) {
      it(`${what} ${reduced ? 'keeps its size' : 'shrinks to 0.97'} while the mouse holds it and is full size once let go`, async () => {
        await assertPressState(p, selector, reduced ? 1 : 0.97)
      })
    }

    it('an erased line is gone from the puzzle at once and leaves no copy of itself behind', { skip: reduced }, async () => {
      await restartPuzzle(p)
      await drag(p, [[0.5, 1.5], [0.5, 4.5]])
      assert.equal((await penEntries(p)).length, 3)
      // The pointer goes to the line and the page draws two frames before the watch starts, so a stroke the drag was still adding is not counted.
      const [x, y] = await gridPoint(p, [0.5, 3])
      await p.mouse.move(x, y)
      await p.evaluate(() => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))))
      await watchCopies(p)
      const depth = await undoDepth()
      await p.mouse.click(x, y, { button: 'right' })
      assert.deepEqual(await settle(() => penEntries(p), []), [], 'the whole line is erased')
      assert.equal(await undoDepth() > depth, true, 'an undo step')
      assert.deepEqual(await stopWatchingCopies(p), [], 'a copy of the erased line was drawn')
      await p.click('#control-undo')
      assert.equal((await settle(() => penEntries(p), (await penEntries(p)).length === 3 ? [] : null)).length, 3, 'one undo brings the line back')
    })

    it(`edit mode's pickers ${reduced ? 'appear with no animation' : 'fade in from 0.95 over 150 ms'}`, async () => {
      assert.equal(await p.locator(PICKERS).count(), 0, 'edit mode starts shut, so the pickers read below are the ones this hold opens')
      // Read the moment a picker is inserted: a 150 ms animation is over before a poll from outside the page can look.
      await p.evaluate((selector) => {
        window.__pickerAnimations = new Promise((resolve) => {
          const observer = new window.MutationObserver(() => {
            const picker = document.querySelector(selector)
            if (!picker) return
            observer.disconnect()
            resolve(picker.getAnimations().map((a) => ({ name: a.animationName, duration: a.effect.getTiming().duration, from: a.effect.getKeyframes()[0] })))
          })
          observer.observe(document.documentElement, { childList: true, subtree: true })
        })
      }, PICKERS)
      const box = await p.locator('.tool-pen button[data-key="4"]').boundingBox()
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await p.mouse.down()
      try {
        const animations = await p.evaluate((ms) => Promise.race([window.__pickerAnimations, new Promise((resolve) => setTimeout(() => resolve(null), ms))]), HOLD_TO_EDIT_MS + 5000)
        assert.notEqual(animations, null, 'no picker appeared')
        if (reduced) {
          assert.deepEqual(animations, [])
        } else {
          assert.equal(animations.length, 1)
          assert.deepEqual([animations[0].name, animations[0].duration, animations[0].from.opacity, animations[0].from.transform], ['pen-tool-extras-picker-in', 150, '0', 'scale(0.95)'])
        }
      } finally {
        await p.mouse.up()
      }
      const again = await p.locator('.tool-pen button[data-key="4"]').boundingBox()
      await p.mouse.move(again.x + again.width / 2, again.y + again.height / 2)
      await p.mouse.down()
      assert.equal(await settle(() => p.locator(PICKERS).count(), 0, HOLD_TO_EDIT_MS + 5000, HOLD_TO_EDIT_MS + 500), 0, 'a second hold leaves edit mode at once')
      await p.mouse.up()
    })
  })
}

describe('Pen Tool Extras: the cursor over the grid', { concurrency: false }, () => {
  let context, p
  const cursorAt = async () => {
    const [x, y] = await cellCentre(p, 4, 4)
    return p.evaluate(([px, py]) => window.getComputedStyle(document.elementFromPoint(px, py)).cursor, [x, y])
  }
  before(async () => {
    ;({ context, p } = await openPage(browser))
    await boot(p)
  })
  after(async () => { await context.close() })

  it('is SudokuPad\'s hand over the grid under the pen tool, as under another tool', async () => {
    assert.equal(await settle(cursorAt, 'pointer'), 'pointer')
    await p.click('#control-normal')
    assert.equal(await settle(cursorAt, 'pointer'), 'pointer')
    await openPenTool(p)
    assert.equal(await settle(cursorAt, 'pointer'), 'pointer')
  })
})

describe('Pen Tool Extras: the hit floor on a grid with small cells', { concurrency: false }, () => {
  let context, p
  let cellPx
  const SCALE = 0.5

  // A point `dr` cells below, `dc` cells right of the grid corner at [row, col].
  const nearCorner = async (row, col, dr, dc) => {
    const [x, y, size] = await cellCentre(p, 0, 0)
    return [x + (col - 0.5 + dc) * size, y + (row - 0.5 + dr) * size]
  }

  before(async () => {
    ;({ context, p } = await openPage(browser))
    await boot(p)
    await drag(p, [[0.5, 1.5], [0.5, 4.5]])
    await p.evaluate((scale) => { document.querySelector('#svgrenderer').parentElement.style.cssText = `transform: scale(${scale}); transform-origin: top left` }, SCALE)
    cellPx = (await settle(async () => (await cellCentre(p, 0, 0))[2], 35.3, 3000)) // the scaled cell, 70.6 px * 0.5
  })
  after(async () => { await context.close() })

  it('keeps a corner click, the right click that erases that corner mark and a right-click line hit at 10 px on a 35 px cell, the line hit up to its cap, and no corner hit past the floor', async () => {
    assert.equal(cellPx < 40, true, `the scaled cell is ${cellPx} px`)
    const floor = HIT_FLOOR_PX / cellPx
    assert.equal(floor > CORNER_RADIUS && floor < CORNER_RADIUS_MAX, true, `a floor of ${floor} cells lies between the base radius ${CORNER_RADIUS} and the cap ${CORNER_RADIUS_MAX}`)
    // SudokuPad reads the pointer in whole pixels of the unscaled page, so on this grid it is off by up to 0.03 cells: the point is well inside the floor and well past the base radius.
    const inside = (CORNER_RADIUS + floor) / 2
    const [x, y] = await nearCorner(3, 4, -inside, 0)
    await p.mouse.click(x, y)
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 3), ['u']), ['u'], `${inside} cells above a corner is a corner mark`)
    await p.mouse.click(x, y, { button: 'right' })
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 3), []), [], 'a right click at the same point erases the corner mark')
    const outside = CORNER_RADIUS_MAX + 0.05
    const [ox, oy] = await nearCorner(6, 4, -outside, 0)
    await p.mouse.click(ox, oy)
    assert.deepEqual(await settle(() => penValuesAt(p, 5, 3), ['3']), ['3'], `${outside} cells above a corner, past the floor, is the edge mark`)
    // the line along row 0.5 is hit 0.22 cells off (past the base 0.2, within the 0.24 cap), and not 0.27 off
    assert.equal(LINE_HIT_RADIUS < 0.22 && LINE_HIT_RADIUS_MAX > 0.22 && LINE_HIT_RADIUS_MAX < 0.27, true, `the test's 0.22 and 0.27 straddle the line cap ${LINE_HIT_RADIUS_MAX} above the base ${LINE_HIT_RADIUS}`)
    const [fx, fy] = await gridPoint(p, [0.5 + 0.27, 3])
    await p.mouse.click(fx, fy, { button: 'right' })
    assert.equal((await penEntries(p)).filter((e) => !e.includes(':u') && !e.includes(':3')).length, 3, 'a right click 0.27 cells off leaves the line')
    const [nx, ny] = await gridPoint(p, [0.5 + 0.22, 3])
    await p.mouse.click(nx, ny, { button: 'right' })
    assert.deepEqual((await settle(async () => (await penEntries(p)).filter((e) => !e.includes(':u') && !e.includes(':3')), [])), [], 'a right click 0.22 cells off erases it')
  })
})
