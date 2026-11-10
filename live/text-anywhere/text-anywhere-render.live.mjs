// Live check of how little text-anywhere.user.js redraws on sudokupad.app, with 30 notes on the board: a drag of two selected notes keeps each
// frame's pointer moves under a frame's work and never recreates a note, during the drag or at its release; with another tool current a mouse move
// measures no note and shows no hover; a redraw that changes only the selection measures no note; a board resize writes one group's style and touches
// no note; a class change that leaves the board where it was redraws nothing; and a move, a selection rectangle, a resize and an erase each wait for
// the next frame and then show the last pointer move.
// The pointer moves are dispatched from the page, so each one's work can be timed; the presses are real mouse input.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as textAnywhere from './text-anywhere-fixtures.mjs'
import { readUntil, settle } from '../settle.mjs'
import { useBrowser } from '../session.mjs'
import { finishNote, gridPoint } from '../board.mjs'

const { TEXTS, TEXT_BOX } = textAnywhere
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
// A drag of this many pointer moves, by this many cells down and right in all. A mouse sends several moves a frame; this many are sent in each.
const MOVES = 40
const MOVES_PER_FRAME = 4
const DRAG_BY = [0.5, 0.5]
// One frame at 60 Hz.
const FRAME_MS = 16
// What a frame's moves may take, with room for a loaded box: four frames' worth, where the script takes about one tenth of one.
const FRAME_BUDGET_MS = 4 * FRAME_MS
// A note is written at most once per pointer move: measured on the script, a frame's 4 moves give a note 4 style writes, so a write that fanned out per move would show here.
const WRITES_PER_NOTE_FRAME = MOVES_PER_FRAME
// A note's place and the rectangle's corner are kept to a hundredth of a pixel or unit, so a point can land off the pointer's.
const POINTER_NEAR_PX = 1
const near = (got, want) => got.every((v, i) => Math.abs(v - want[i]) <= POINTER_NEAR_PX)

const browser = useBrowser()

describe('Text Anywhere renders less', { concurrency: false }, () => {
  let context, p, errors

  const read = (fn, arg) => p.evaluate(fn, arg)
  const reload = async () => {
    await textAnywhere.reload(p)
    await readUntil(() => textAnywhere.texts(p), (t) => t.length === NOTES)
    await textAnywhere.pickTextAnywhere(p)
  }
  // A pointer move to a screen point, dispatched on what lies under it with `buttons` held: a page helper, so every check sends the same event.
  const installMove = () => read(() => {
    window.__move = ([x, y], buttons) => document.elementFromPoint(x, y).dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons }))
  })
  // Pointer moves to each screen point in turn, MOVES_PER_FRAME to a frame. Each frame's work is the time its moves' dispatches took, plus the
  // time from a frame callback asked for before them to one asked for after them, which forces the page's style and layout: the frame callbacks
  // the script asked for during the dispatches run between the two. The page then waits for that frame before the next moves.
  const timedFrames = (points, buttons) => read(async ([all, held, perFrame]) => {
    const busy = []
    // The most style writes any one note got in one frame, counted from the page: unlike the frame time, it does not depend on the box's speed.
    const writes = new Map()
    const watch = new window.MutationObserver((list) => { for (const record of list) writes.set(record.target, (writes.get(record.target) || 0) + 1) })
    watch.observe(document.getElementById('text-anywhere-layer'), { attributes: true, attributeFilter: ['style'], subtree: true })
    window.__maxWritesPerFrame = 0
    for (let i = 0; i < all.length; i += perFrame) {
      let frameStart = 0
      window.requestAnimationFrame(() => { frameStart = window.performance.now() })
      const start = window.performance.now()
      for (const point of all.slice(i, i + perFrame)) window.__move(point, held)
      const dispatch = window.performance.now() - start
      const frame = await new Promise((resolve) => window.requestAnimationFrame(() => {
        document.body.getBoundingClientRect()
        resolve(window.performance.now() - frameStart)
      }))
      busy.push(dispatch + frame)
      window.__maxWritesPerFrame = Math.max(window.__maxWritesPerFrame, ...writes.values())
      writes.clear()
    }
    watch.disconnect()
    return busy
  }, [points, buttons, MOVES_PER_FRAME])
  // Moves dispatched in one task, with no frame between them: what the page shows straight after, and after the next frame. Playwright passes no
  // function into the page, so `look` goes as its source.
  const movesInOneTask = (points, buttons, look) => read(async ([all, held, lookSource]) => {
    // eslint-disable-next-line no-new-func
    const lookAt = new Function(`return (${lookSource})()`)
    for (const point of all) window.__move(point, held)
    const straightAfter = lookAt()
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
    return { straightAfter, afterFrame: lookAt() }
  }, [points, buttons, look.toString()])
  const steps = async (from, by, count) => {
    const [x0, y0] = await gridPoint(p, from)
    const [x1, y1] = await gridPoint(p, [from[0] + by[0], from[1] + by[1]])
    return Array.from({ length: count }, (_, k) => [x0 + (x1 - x0) * (k + 1) / count, y0 + (y1 - y0) * (k + 1) / count])
  }
  const changedInLayer = (act) => read(async (actSource) => {
    const records = []
    const watch = new window.MutationObserver((list) => records.push(...list))
    watch.observe(document.getElementById('text-anywhere-layer'), { attributes: true, childList: true, subtree: true, characterData: true })
    // eslint-disable-next-line no-new-func
    new Function(`(${actSource})()`)()
    for (let i = 0; i < 3; i++) await new Promise((resolve) => window.requestAnimationFrame(resolve))
    records.push(...watch.takeRecords())
    watch.disconnect()
    return [...new Set(records.map((r) => r.target))].map((t) => t.className || t.id || t.nodeName)
  }, act.toString())
  const percentile = (values, share) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * share))]
  const summary = (values) => `median ${percentile(values, 0.5).toFixed(2)} ms, 90th ${percentile(values, 0.9).toFixed(2)} ms, max ${Math.max(...values).toFixed(2)} ms over ${values.length} frames of ${MOVES_PER_FRAME} moves`
  const noteMeasures = () => read(() => window.__noteMeasures)
  const hovered = () => read((selector) => [...document.querySelectorAll(`${selector}:hover`)].map((note) => note.textContent), TEXTS)

  before(async () => {
    ;({ context, p, errors } = await textAnywhere.open(browser()))
    await textAnywhere.forgetNotes(p)
    await textAnywhere.plantNotes(p, PLANTED)
    await reload()
    await installMove()
  })
  after(async () => { await context.close() })

  it('a drag of two selected notes among 30 keeps each frame\'s pointer moves under a frame\'s work, recreates none of the notes it leaves still, and after the release none at all', async (t) => {
    await p.mouse.click(...await gridPoint(p, atCell(MOVED[0])))
    await p.keyboard.down('Shift')
    await p.mouse.click(...await gridPoint(p, atCell(MOVED[1])))
    await p.keyboard.up('Shift')
    await read((selector) => { window.__notesBefore = [...document.querySelectorAll(selector)] }, TEXTS)
    await p.mouse.move(...await gridPoint(p, atCell(MOVED[0])))
    await p.mouse.down()
    const busy = await timedFrames(await steps(atCell(MOVED[0]), DRAG_BY, MOVES), 1)
    t.diagnostic(`drag: ${summary(busy)}`)
    const recreated = await read(([selector, moved]) => {
      const now = [...document.querySelectorAll(selector)]
      return window.__notesBefore.filter((note) => !moved.includes(note.textContent) && !now.includes(note)).map((note) => note.textContent)
    }, [TEXTS, MOVED.map(NOTE_TEXT)])
    await p.mouse.up()
    const recreatedByRelease = await read((selector) => {
      const now = [...document.querySelectorAll(selector)]
      return window.__notesBefore.filter((note) => !now.includes(note)).map((note) => note.textContent)
    }, TEXTS)
    assert.deepEqual(recreated, [], 'every note left still is the element it was before the drag')
    assert.deepEqual(recreatedByRelease, [], 'the redraw on release keeps every note\'s element, the moved ones too')
    const moved = (await textAnywhere.saved(p)).slice(0, 2).map((item) => item.at)
    assert.deepEqual(moved.map((at, i) => at.map((v, k) => Math.round((v - PLANTED[i].at[k]) / CELL * 10) / 10)), [[0.5, 0.5], [0.5, 0.5]], 'both notes moved by the drag')
    // A frame's work is a wall-clock time a loaded box can stretch without the script being at fault, so its budget is widened to FRAME_BUDGET_MS, and the typical
    // frame (the median) is held to it: a few slow frames pass, while work added to every pointer move moves them all. The writes are counted besides, which time does not move.
    assert.equal(percentile(busy, 0.5) < FRAME_BUDGET_MS, true, `the median frame of the drag took under ${FRAME_BUDGET_MS} ms: ${summary(busy)}`)
    assert.equal(await read(() => window.__maxWritesPerFrame) <= WRITES_PER_NOTE_FRAME, true, `each note written at most ${WRITES_PER_NOTE_FRAME} times a frame`)
  })

  it('with another tool current, a mouse move over the notes measures no note and shows no hover; with Text Anywhere current it does show', async (t) => {
    await p.click(textAnywhere.DIGIT_BUTTON)
    await read(() => {
      window.__noteMeasures = 0
      const measure = window.Element.prototype.getBoundingClientRect
      window.Element.prototype.getBoundingClientRect = function () {
        if (this.closest('#text-anywhere-layer')) window.__noteMeasures++
        return measure.call(this)
      }
    })
    const busy = await timedFrames(await steps([0.5, 0.5], [6, 6], MOVES), 0)
    t.diagnostic(`another tool, hover: ${summary(busy)}`)
    const measures = await noteMeasures()
    // n5, at r2c3: the moves above ended past it.
    // The hover is the browser's :hover, which only real mouse input moves.
    const over = await gridPoint(p, atCell(5))
    await p.mouse.move(...over)
    const otherTool = await hovered()
    await textAnywhere.pickTextAnywhere(p)
    await p.mouse.move(over[0] + 1, over[1])
    assert.deepEqual({ measures, otherTool, textAnywhere: await hovered() }, { measures: 0, otherTool: [], textAnywhere: [NOTE_TEXT(5)] })
  })

  it('a redraw that changes only the selection measures no note', async () => {
    await read(() => { window.__noteMeasures = 0 })
    await p.mouse.click(...await gridPoint(p, atCell(9)))
    const selected = await read(() => [...document.querySelectorAll('#text-anywhere-layer .text-anywhere-selected')].map((note) => note.textContent))
    // The pointer leaves the notes and the selection ends, so the board checks below see no hover or selection change of their own.
    await finishNote(p)
    await p.mouse.move(1, 899)
    assert.deepEqual({ selected, measures: await noteMeasures() }, { selected: [NOTE_TEXT(9)], measures: 0 })
  })

  it('a board resize writes one group\'s style and touches no note, and the notes stay over their cells', async () => {
    const cells = await textAnywhere.noteInCells(p, NOTE_TEXT(5))
    const changed = await changedInLayer(() => {
      document.querySelector('.game').style.width = '800px'
      Framework.app.resize()
    })
    assert.deepEqual(changed, ['text-anywhere-board'])
    assert.deepEqual(await textAnywhere.noteInCells(p, NOTE_TEXT(5)), cells)
    await changedInLayer(() => {
      document.querySelector('.game').style.width = ''
      Framework.app.resize()
    })
  })

  // A redraw that changes nothing writes nothing either, so a redraw is told by its read of the board's computed style, which it takes the notes' font from.
  it('a class change on the board\'s box that leaves the board where it was redraws nothing', async () => {
    // A first change brings the notes up to anything that moved since their last redraw, such as the panel laying out after the tool was picked.
    await changedInLayer(() => document.querySelector('.game').classList.toggle('text-anywhere-probe'))
    await read(() => {
      window.__boardStyleReads = 0
      const board = Framework.app.svgRenderer.getElem()
      const computed = window.getComputedStyle
      window.getComputedStyle = function (element, ...rest) {
        if (element === board) window.__boardStyleReads++
        return computed.call(this, element, ...rest)
      }
    })
    const changed = await changedInLayer(() => document.querySelector('.game').classList.toggle('text-anywhere-probe'))
    const reads = await read(() => window.__boardStyleReads)
    assert.deepEqual({ changed, reads }, { changed: [], reads: 0 })
  })

  it('a move shows only after the next frame, at the last pointer move', async () => {
    // n4, at r2c1: a click selects it alone, and a press on it drags it.
    const from = [1.5, 0.5]
    const start = await gridPoint(p, from)
    const point = await textAnywhere.middleAt(p, start)
    await p.mouse.click(...point)
    await p.mouse.down()
    const target = (await steps(from, [1, 1], 3)).map(([x, y]) => [x + point[0] - start[0], y + point[1] - start[1]])
    const look = await movesInOneTask(target, 1, () => {
      const note = [...document.querySelectorAll('#text-anywhere-layer .text-anywhere-text')].find((n) => n.textContent === 'n4').getBoundingClientRect()
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
      const rectangle = document.querySelector('.text-anywhere-selection-rectangle')
      return rectangle && [rectangle.style.left, rectangle.style.top].map(parseFloat)
    })
    await p.mouse.up()
    assert.equal(look.straightAfter, null)
    assert.ok(near(look.afterFrame, target.at(-1)), `the rectangle's corner is at ${look.afterFrame}; the pointer at ${target.at(-1)}`)
  })

  it('a resize shows only after the next frame, to the last pointer move', async () => {
    await p.mouse.click(...await gridPoint(p, [8.5, 6.5]))
    await p.keyboard.type('resize me')
    const handle = await p.locator('#text-anywhere-layer .text-anywhere-resize').last().boundingBox()
    const from = textAnywhere.middleOf(handle)
    await p.mouse.move(...from)
    await p.mouse.down()
    const target = [1, 2, 3].map((k) => [from[0] + 10 * k, from[1] + 5 * k])
    const look = await movesInOneTask(target, 1, () => {
      const { right, bottom } = [...document.querySelectorAll('#text-anywhere-layer .text-anywhere-resize')].at(-1).getBoundingClientRect()
      return [right, bottom]
    })
    await p.mouse.up()
    await finishNote(p)
    const [right, bottom] = [handle.x + handle.width, handle.y + handle.height]
    assert.deepEqual(look.straightAfter.map(Math.round), [right, bottom].map(Math.round))
    assert.deepEqual(look.afterFrame.map(Math.round), [right + 30, bottom + 15].map(Math.round))
  })

  it('a right-drag removes nothing while held, then at the release every note along every pointer move', async () => {
    await p.mouse.move(...await gridPoint(p, [8.5, 1.5]))
    await p.mouse.down({ button: 'right' })
    // Through n29's middle (r8c3) and back, all in one task: only a check of every move finds the note.
    const target = [...await steps([8.5, 1.5], [-1, 1], 2), ...await steps([7.5, 2.5], [1, -1], 2)]
    const look = await movesInOneTask(target, 2, () => [...document.querySelectorAll('#text-anywhere-layer .text-anywhere-text')].some((n) => n.textContent === 'n29'))
    assert.deepEqual(look, { straightAfter: true, afterFrame: true })
    await p.mouse.up({ button: 'right' })
    assert.equal(await settle(async () => (await textAnywhere.texts(p)).includes('n29'), false), false)
    assert.equal(await p.locator(TEXT_BOX).count(), 0)
  })

  it('the page raised no error', () => {
    assert.deepEqual(errors, [])
  })
})
