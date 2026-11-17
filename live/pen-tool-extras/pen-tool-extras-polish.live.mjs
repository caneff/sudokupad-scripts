// #547.
// The floor is checked on a grid scaled to half size (a 35 px cell at 1200 x 900), which is what a big grid does to its cells.
/* global Framework, getComputedStyle */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as extras from './pen-tool-extras-fixtures.mjs'
import { assertPressState, restartPuzzle } from '../page.mjs'
import { cellCentre, gridPoint, undoDepth } from '../board.mjs'
import { drag, openPenTool, penEntries, penValuesAt, plantUnchecked } from '../pen.mjs'
import { settle } from '../settle.mjs'
import { useBrowser } from '../session.mjs'

const require = createRequire(import.meta.url)
const { HOLD_TO_EDIT_MS, HIT_FLOOR_PX, CORNER_RADIUS, CORNER_RADIUS_MAX, LINE_HIT_RADIUS, LINE_HIT_RADIUS_MAX } = require('../../pen-tool-extras.user.js')
const { contrastRatio } = require('../../test/contrast.js')

const MARKS_KEY = 'EdgeMarks_marks'
const PICKERS = '.tool-pen .pen-tool-extras-picker'
const PANEL_BUTTONS = { 'a color button': '.tool-pen button[data-key="2"]', 'the line mode button': '.pen-tool-extras-mode', 'the page button': '.pen-tool-extras-page', 'the settings button': '.pen-tool-extras-settings' }

const browser = useBrowser()

// Opens the page with the marks planted before the script reads them, and pen color 1 picked.
const open = async (options = {}) => {
  const opened = await extras.open(browser(), {
    ...options,
    afterStart: (p) => plantUnchecked(p, MARKS_KEY, JSON.stringify({ x: true, directions: false, circle: true, cornerX: true, cornerCircle: true }))
  })
  await opened.p.locator('.tool-pen button[data-key="1"]').click()
  return opened
}

// From now until `stopWatchingCopies`, the SVG elements that join the page, whatever their class, except in SudokuPad's own cell highlights, which the click redraws: an erase only takes strokes away,
// so any other that join are a copy of the erased line.
const watchCopies = (p) => p.evaluate(() => {
  window.__added = []
  window.__copyWatch = new window.MutationObserver((records) => {
    for (const record of records) if (record.target.id !== 'cell-highlights') for (const node of record.addedNodes) if (node instanceof window.SVGElement) window.__added.push(node.localName)
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
    before(async () => {
      ;({ context, p } = await open({ contextOptions }))
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
      const depth = await undoDepth(p)
      await p.mouse.down({ button: 'right' })
      await watchCopies(p)
      await p.mouse.up({ button: 'right' })
      assert.deepEqual(await settle(() => penEntries(p), []), [], 'the whole line is erased')
      assert.equal(await undoDepth(p) > depth, true, 'an undo step')
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
    ;({ context, p } = await open())
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
    ;({ context, p } = await open())
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

// #955: the selected pen, the gear's column and the pickers' inset. The line mode icon's grid stays as it was: docs/research/pen-tool-extras/line-icon-grid-scaling.md.
const PURPLE = 'rgb(106, 27, 154)'
const LINE_STYLES_KEY = 'PenColor_linestyles'
const RING_PX = 3
const PICKER_INSET_PX = 3.5
const MIN_CONTRAST = 3

// A computed color, `rgb()`, `rgba()` or `color(srgb ...)`, as [r, g, b] on 0-255 and its alpha.
const channelsOf = (css) => {
  const [r, g, b, alpha = 1] = css.match(/[\d.]+/g).map(Number)
  const scale = css.startsWith('color(') ? 255 : 1
  return { rgb: [r, g, b].map((c) => c * scale), alpha }
}
// A see-through color over an opaque one, so a transparent line reads as the face it lets through.
const over = (top, face) => face.map((c, i) => top.alpha * top.rgb[i] + (1 - top.alpha) * c)

const rectOf = (p, selector) => p.locator(selector).evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } })

describe('Pen Tool Extras panel polish', { concurrency: false }, () => {
  let context, p
  before(async () => { ;({ context, p } = await extras.open(browser())) })
  after(async () => { await context.close() })

  it('the selected pen keeps a white face and shows a 3 px purple ring, and no button moves with the selection', async () => {
    const boxes = () => Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => rectOf(p, `.tool-pen button[data-key="${n}"]`)))
    await p.locator('.tool-pen button[data-key="1"]').click()
    const first = await boxes()
    await p.locator('.tool-pen button[data-key="2"]').click()
    assert.deepEqual(await boxes(), first, 'the buttons with pen 2 selected')
    const face = await p.locator('.tool-pen button[data-key="2"]').evaluate((el) => { const s = getComputedStyle(el); return { background: s.backgroundColor, shadow: s.boxShadow } })
    assert.equal(face.background, 'rgb(255, 255, 255)')
    assert.equal(face.shadow.includes(PURPLE) && face.shadow.includes('inset') && face.shadow.includes(`${RING_PX}px`), true, face.shadow)
  })

  it('each selected pen\'s line is at least 3:1 against its button face, for pens 1, 2, 3 and 9', async () => {
    for (const n of [1, 2, 3, 9]) {
      await p.locator(`.tool-pen button[data-key="${n}"]`).click()
      const { line, face } = await p.locator(`.tool-pen button[data-key="${n}"]`).evaluate((el) => ({ line: getComputedStyle(el, '::after').backgroundColor, face: getComputedStyle(el).backgroundColor }))
      const faceColor = channelsOf(face)
      assert.equal(faceColor.alpha, 1, `pen ${n}'s face is opaque: ${face}`)
      const ratio = contrastRatio(over(channelsOf(line), faceColor.rgb), faceColor.rgb)
      assert.equal(ratio >= MIN_CONTRAST, true, `pen ${n}: ${ratio} for ${line} on ${face}`)
    }
  })

  it('the settings gear keeps its column when the page button hides', async () => {
    const gearX = async () => (await rectOf(p, '.pen-tool-extras-settings')).x
    const withPage = await gearX()
    await p.evaluate(([key]) => Framework.setData(key, { dashed: false, arrows: false }), [LINE_STYLES_KEY])
    await extras.reload(p, { penTool: false })
    await openPenTool(p)
    await p.locator('.pen-tool-extras-settings').waitFor({ state: 'visible' })
    assert.equal(await p.locator('.pen-tool-extras-page').count(), 0, 'the page button is gone')
    assert.equal(await gearX(), withPage)
    await p.evaluate(([key]) => Framework.removeData(key), [LINE_STYLES_KEY])
    await extras.reload(p)
  })

  it('the hold-to-edit pickers sit inside their button frames, at least 3.5 px in', async () => {
    const box = await p.locator('.tool-pen button[data-key="1"]').boundingBox()
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await p.mouse.down()
    try {
      await p.locator(`${PICKERS} input[data-key="9"]`).waitFor({ state: 'attached', timeout: HOLD_TO_EDIT_MS + 5000 })
    } finally {
      await p.mouse.up()
    }
    try {
      for (let n = 1; n <= 9; n++) {
        const button = await rectOf(p, `.tool-pen button[data-key="${n}"]`)
        const picker = await rectOf(p, `${PICKERS} input[data-key="${n}"]`)
        const insets = [picker.x - button.x, picker.y - button.y, button.right - picker.right, button.bottom - picker.bottom]
        assert.equal(insets.every((inset) => inset >= PICKER_INSET_PX), true, `picker ${n} insets ${insets}`)
      }
    } finally {
      const held = await p.locator(`${PICKERS} input[data-key="4"]`).boundingBox()
      await p.mouse.move(held.x + held.width / 2, held.y + held.height / 2)
      await p.mouse.down()
      await p.locator(PICKERS).first().waitFor({ state: 'detached', timeout: HOLD_TO_EDIT_MS + 5000 })
      await p.mouse.up()
    }
  })
})
