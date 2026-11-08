// Live check of Pen Tool Extras' small touches (#547) on sudokupad.app in headless Chromium: a press state on the panel buttons, a crosshair over the grid in the pen tool, a fade on an erased
// line, a fade-in on edit mode's pickers, all of that off under reduced motion, and a pixel floor on the corner and the right-click line hit.
// Every press, click and drag is real mouse input. The floor is checked on a grid scaled to half size (a 35 px cell at 1200 x 900), which is what a big grid does to its cells.
/* global Framework */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { assertPressState, openPage, restartPuzzle, startPuzzle } from '../page.mjs'
import { cellCentre, drag, gridPoint, openPenTool, penEntries, penValuesAt, plantUnchecked } from '../pen.mjs'
import { settle } from '../settle.mjs'

const { HOLD_TO_EDIT_MS, HIT_FLOOR_PX, CORNER_RADIUS, CORNER_RADIUS_MAX, LINE_HIT_RADIUS, LINE_HIT_RADIUS_MAX } = createRequire(import.meta.url)('../../pen-tool-extras.user.js')
const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')

// How long the copies of an erased line get to appear after the right click: the fade itself is 120 ms.
const FADE_WAIT_MS = 3000
const MARKS_KEY = 'EdgeMarks_marks'
const ERASING = '.pen-tool-extras-erasing'
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

// From the moment the erased line's copies join the highlight layer: how many there were, how many pen entries the puzzle held then, and the opacity of the copies on each frame until they are gone.
const watchFade = (p) => p.evaluate((selector) => {
  window.__fade = new Promise((resolve) => {
    const observer = new window.MutationObserver(() => {
      const first = document.querySelector(selector)
      if (!first) return
      observer.disconnect()
      const born = performance.now()
      const result = { copies: first.children.length, penAtStart: Framework.app.puzzle.cells.reduce((n, c) => n + c.pen.length, 0), pointerEvents: window.getComputedStyle(first).pointerEvents, opacities: [] }
      const frame = () => {
        const group = document.querySelector(selector)
        if (!group) return resolve({ ...result, ms: performance.now() - born })
        result.opacities.push(Number(window.getComputedStyle(group).opacity))
        window.requestAnimationFrame(frame)
      }
      frame()
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
  })
}, ERASING)

for (const [name, contextOptions, reduced] of [['', {}, false], [' under reduced motion', { reducedMotion: 'reduce' }, true]]) {
  describe(`Pen Tool Extras${name}`, { concurrency: false }, () => {
    let context, p
    const undoDepth = () => p.evaluate(() => Framework.app.puzzle.undoStack.length)
    const rightClickAt = async (point) => {
      const [x, y] = await gridPoint(p, point)
      await p.mouse.move(x, y)
      await p.mouse.click(x, y, { button: 'right' })
    }

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

    it(`an erased line ${reduced ? 'goes at once, with no copy left to fade' : 'is gone from the puzzle at once while copies of it fade out over about 120 ms and are then removed'}`, async () => {
      await restartPuzzle(p)
      await drag(p, [[0.5, 1.5], [0.5, 4.5]])
      assert.equal((await penEntries(p)).length, 3)
      await watchFade(p)
      const depth = await undoDepth()
      await rightClickAt([0.5, 3])
      assert.deepEqual(await settle(() => penEntries(p), []), [], 'the whole line is erased')
      assert.equal(await undoDepth() > depth, true, 'an undo step')
      if (reduced) {
        // "nothing appeared in 600 ms": there is no event to wait on.
        const appeared = await Promise.race([p.evaluate(() => window.__fade).then(() => true), sleep(600).then(() => false)])
        assert.equal(appeared, false, 'a copy faded although motion is reduced')
        return
      }
      const fade = await p.evaluate((ms) => Promise.race([window.__fade, new Promise((resolve) => setTimeout(() => resolve(null), ms))]), FADE_WAIT_MS)
      assert.notEqual(fade, null, `no copy of the erased line appeared in ${FADE_WAIT_MS} ms`)
      assert.equal(fade.copies, 3, 'one copy for each of the three segments')
      assert.equal(fade.penAtStart, 0, 'the puzzle had already lost the line when the copies appeared')
      assert.equal(fade.pointerEvents, 'none')
      assert.equal(fade.opacities.length >= 2, true, `${fade.opacities.length} frames`)
      assert.deepEqual([...fade.opacities].sort((a, b) => b - a), fade.opacities, 'never brighter than the frame before')
      assert.equal(fade.opacities.at(-1) < fade.opacities[0], true, 'it dimmed')
      assert.equal(fade.ms >= 100 && fade.ms < 1000, true, `${fade.ms} ms`)
      assert.equal(await p.locator(ERASING).count(), 0)
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

  it('is a crosshair while the pen tool is the current tool and SudokuPad\'s hand under another tool', async () => {
    assert.equal(await settle(cursorAt, 'crosshair'), 'crosshair')
    await p.click('#control-normal')
    assert.equal(await settle(cursorAt, 'pointer'), 'pointer')
    await openPenTool(p)
    assert.equal(await settle(cursorAt, 'crosshair'), 'crosshair')
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
