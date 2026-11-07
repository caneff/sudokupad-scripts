// Live check of how little draw-tool.user.js redraws on sudokupad.app, with 30 notes on the board: a drag of two selected notes keeps each
// pointer move's work under a frame and never recreates the notes it leaves still; with another tool current a mouse move measures no note;
// a board resize writes one container's style and touches no note; a class change that leaves the board where it was redraws nothing;
// and a move, a selection rectangle, a resize and an erase each wait for the next frame and then show the last pointer move.
// The pointer moves are dispatched from the page, so each one's work can be timed; the presses are real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage } from '../page.mjs'
import { gridPoint } from '../pen.mjs'
import { readUntil } from '../settle.mjs'

const { TEXTS, TEXT_BOX } = draw
// SudokuPad's board draws a cell 64 units wide from (0, 0).
const CELL = 64
const NOTES = 30
// Note i sits in row floor(i / 4) and column 2 * (i % 4), so the 30 fill the first eight rows' even columns; every third is bold.
const cellOf = (i) => [Math.floor(i / 4), 2 * (i % 4)]
const NOTE_TEXT = (i) => `n${i}`
const PLANTED = Array.from({ length: NOTES }, (_, i) => {
  const [row, col] = cellOf(i)
  return { kind: 'text', color: 1 + i % 9, size: 20, opacity: 100, text: i % 3 ? NOTE_TEXT(i) : `**${NOTE_TEXT(i)}**`, at: [col * CELL + CELL / 2, row * CELL + CELL / 2] }
})
// The two notes dragged: r1c1 and r1c3, in cells from the grid's top left.
const MOVED = [0, 1]
const atCell = (i) => cellOf(i).map((v) => v + 0.5)
// A drag of this many pointer moves, by this many cells down and right in all.
const MOVES = 40
const DRAG_BY = [0.5, 0.5]
// One frame at 60 Hz.
const FRAME_MS = 16
// A note's place and the rectangle's corner are kept to a tenth of a pixel or unit, so a point can land a pixel off the pointer's.
const NEAR_PX = 1
const near = (got, want) => got.every((v, i) => Math.abs(v - want[i]) <= NEAR_PX)

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('Text Annotation renders less', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const reload = async () => {
    await draw.reload(p)
    await readUntil(() => draw.texts(p), (t) => t.length === NOTES)
    await draw.pickDraw(p)
  }
  // Pointer moves to each screen point in turn, dispatched on what lies under it with `buttons` held. Each move's work is the time its dispatch
  // took, plus the time from a frame callback asked for before it to one asked for after it, which forces the page's style and layout: the
  // frame callbacks the script asked for during the dispatch run between the two. The page then waits for that frame before the next move.
  const timedMoves = (points, buttons) => read(async ([all, held]) => {
    const busy = []
    for (const [x, y] of all) {
      let frameStart = 0
      window.requestAnimationFrame(() => { frameStart = window.performance.now() })
      const start = window.performance.now()
      document.elementFromPoint(x, y).dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: held }))
      const dispatch = window.performance.now() - start
      const frame = await new Promise((resolve) => window.requestAnimationFrame(() => {
        document.body.getBoundingClientRect()
        resolve(window.performance.now() - frameStart)
      }))
      busy.push(dispatch + frame)
    }
    return busy
  }, [points, buttons])
  // Moves dispatched in one task, with no frame between them: what the page shows straight after, and after the next frame.
  const movesInOneTask = (points, buttons, look) => read(async ([all, held, lookSource]) => {
    // eslint-disable-next-line no-new-func
    const lookAt = new Function(`return (${lookSource})()`)
    for (const [x, y] of all) document.elementFromPoint(x, y).dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: held }))
    const straightAfter = lookAt()
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
    return { straightAfter, afterFrame: lookAt() }
  }, [points, buttons, look.toString()])
  const steps = async (from, by, count) => {
    const [x0, y0] = await gridPoint(p, from)
    const [x1, y1] = await gridPoint(p, [from[0] + by[0], from[1] + by[1]])
    return Array.from({ length: count }, (_, k) => [x0 + (x1 - x0) * (k + 1) / count, y0 + (y1 - y0) * (k + 1) / count])
  }
  // Every element in the notes' layer whose attributes or children change while `act` runs and for three frames after it.
  const changedInLayer = (act) => read(async (actSource) => {
    const records = []
    const watch = new window.MutationObserver((list) => records.push(...list))
    watch.observe(document.getElementById('draw-tool-layer'), { attributes: true, childList: true, subtree: true, characterData: true })
    // eslint-disable-next-line no-new-func
    new Function(`(${actSource})()`)()
    for (let i = 0; i < 3; i++) await new Promise((resolve) => window.requestAnimationFrame(resolve))
    records.push(...watch.takeRecords())
    watch.disconnect()
    return [...new Set(records.map((r) => r.target))].map((t) => t.className || t.id || t.nodeName)
  }, act.toString())
  const percentile = (values, share) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * share))]
  const summary = (values) => `median ${percentile(values, 0.5).toFixed(2)} ms, 90th ${percentile(values, 0.9).toFixed(2)} ms, max ${Math.max(...values).toFixed(2)} ms over ${values.length} moves`

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await draw.boot(p)
    await draw.forgetDrawings(p)
    await draw.plantDrawing(p, PLANTED)
    await reload()
  })
  after(async () => { await context.close() })

  it('a drag of two selected notes among 30 keeps each pointer move\'s work under a frame, and recreates none of the notes it leaves still', async (t) => {
    await p.mouse.click(...await gridPoint(p, atCell(MOVED[0])))
    await p.keyboard.down('Shift')
    await p.mouse.click(...await gridPoint(p, atCell(MOVED[1])))
    await p.keyboard.up('Shift')
    await read((selector) => { window.__notesBefore = [...document.querySelectorAll(selector)] }, TEXTS)
    await p.mouse.move(...await gridPoint(p, atCell(MOVED[0])))
    await p.mouse.down()
    const busy = await timedMoves(await steps(atCell(MOVED[0]), DRAG_BY, MOVES), 1)
    t.diagnostic(`drag: ${summary(busy)}`)
    const recreated = await read(([selector, moved]) => {
      const now = [...document.querySelectorAll(selector)]
      return window.__notesBefore.filter((note) => !moved.includes(note.textContent) && !now.includes(note)).map((note) => note.textContent)
    }, [TEXTS, MOVED.map(NOTE_TEXT)])
    await p.mouse.up()
    assert.deepEqual(recreated, [], 'every note left still is the element it was before the drag')
    const moved = (await draw.saved(p)).slice(0, 2).map((item) => item.at)
    assert.deepEqual(moved.map((at, i) => at.map((v, k) => Math.round((v - PLANTED[i].at[k]) / CELL * 10) / 10)), [[0.5, 0.5], [0.5, 0.5]], 'both notes moved by the drag')
    assert.ok(Math.max(...busy) < FRAME_MS, `each move's work under ${FRAME_MS} ms: ${summary(busy)}`)
  })

  it('with another tool current, a mouse move over the notes measures no note', async (t) => {
    await p.click(draw.DIGIT_BUTTON)
    await read(() => {
      window.__noteMeasures = 0
      const measure = window.Element.prototype.getBoundingClientRect
      window.Element.prototype.getBoundingClientRect = function () {
        if (this.closest('#draw-tool-layer')) window.__noteMeasures++
        return measure.call(this)
      }
    })
    const busy = await timedMoves(await steps([0.5, 0.5], [6, 6], MOVES), 0)
    t.diagnostic(`another tool, hover: ${summary(busy)}`)
    const measures = await read(() => window.__noteMeasures)
    await draw.pickDraw(p)
    assert.equal(measures, 0)
  })

  it('a board resize writes one container\'s style and touches no note, and the notes stay over their cells', async () => {
    const cells = await draw.noteInCells(p, NOTE_TEXT(5))
    const changed = await changedInLayer(() => {
      document.querySelector('.game').style.width = '800px'
      Framework.app.resize()
    })
    assert.deepEqual(changed, ['draw-tool-board'])
    assert.deepEqual(await draw.noteInCells(p, NOTE_TEXT(5)), cells)
    await changedInLayer(() => {
      document.querySelector('.game').style.width = ''
      Framework.app.resize()
    })
  })

  it('a class change on the board\'s box that leaves the board where it was redraws nothing', async () => {
    const changed = await changedInLayer(() => document.querySelector('.game').classList.add('draw-tool-probe'))
    await read(() => document.querySelector('.game').classList.remove('draw-tool-probe'))
    assert.deepEqual(changed, [])
  })

  it('a move shows only after the next frame, at the last pointer move', async () => {
    // n4, at r2c1: a click selects it alone, and a press on it drags it.
    const from = [1.5, 0.5]
    const point = await gridPoint(p, from)
    await p.mouse.click(...point)
    await p.mouse.down()
    const target = await steps(from, [1, 1], 3)
    const look = await movesInOneTask(target, 1, () => {
      const note = [...document.querySelectorAll('#draw-tool-layer .draw-tool-text')].find((n) => n.textContent === 'n4').getBoundingClientRect()
      return [note.x, note.y]
    })
    await p.mouse.up()
    const shift = look.afterFrame.map((v, i) => v - look.straightAfter[i])
    const [[x0, y0], [x1, y1]] = [point, target.at(-1)]
    assert.ok(near(shift, [x1 - x0, y1 - y0]), `the note moved by ${shift} after the frame; the pointer by ${[x1 - x0, y1 - y0]}`)
  })

  it('a selection rectangle shows only after the next frame, to the last pointer move', async () => {
    const from = await gridPoint(p, [8.5, 8.5])
    await p.mouse.move(...from)
    await p.mouse.down()
    const target = await steps([8.5, 8.5], [-0.5, -1], 3)
    const look = await movesInOneTask(target, 1, () => {
      const rectangle = document.querySelector('.draw-tool-selection-rectangle')
      return rectangle && [rectangle.style.left, rectangle.style.top].map(parseFloat)
    })
    await p.mouse.up()
    assert.equal(look.straightAfter, null)
    assert.ok(near(look.afterFrame, target.at(-1)), `the rectangle's corner is at ${look.afterFrame}; the pointer at ${target.at(-1)}`)
  })

  it('a resize shows only after the next frame, to the last pointer move', async () => {
    await p.mouse.click(...await gridPoint(p, [8.5, 6.5]))
    await p.keyboard.type('resize me')
    const handle = await p.locator('#draw-tool-layer .draw-tool-resize').boundingBox()
    const from = draw.middleOf(handle)
    await p.mouse.move(...from)
    await p.mouse.down()
    const target = [1, 2, 3].map((k) => [from[0] + 10 * k, from[1] + 5 * k])
    const look = await movesInOneTask(target, 1, () => {
      const { right, bottom } = document.querySelector('#draw-tool-layer .draw-tool-resize').getBoundingClientRect()
      return [right, bottom]
    })
    await p.mouse.up()
    await p.keyboard.press('Escape')
    const [right, bottom] = [handle.x + handle.width, handle.y + handle.height]
    assert.deepEqual(look.straightAfter.map(Math.round), [right, bottom].map(Math.round))
    assert.deepEqual(look.afterFrame.map(Math.round), [right + 30, bottom + 15].map(Math.round))
  })

  it('a right-drag erases only after the next frame, along every pointer move', async () => {
    await p.mouse.move(...await gridPoint(p, [8.5, 1.5]))
    await p.mouse.down({ button: 'right' })
    // Through n29's middle (r8c3) and back, all in one task.
    const target = [...await steps([8.5, 1.5], [-1, 1], 2), ...await steps([7.5, 2.5], [1, -1], 2)]
    const look = await movesInOneTask(target, 2, () => [...document.querySelectorAll('#draw-tool-layer .draw-tool-text')].some((n) => n.textContent === 'n29'))
    await p.mouse.up({ button: 'right' })
    assert.deepEqual(look, { straightAfter: true, afterFrame: false })
    assert.equal(await p.locator(TEXT_BOX).count(), 0)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
