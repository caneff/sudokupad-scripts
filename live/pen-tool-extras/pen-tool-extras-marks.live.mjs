// Live check of pen-tool-extras.user.js's edge and corner marks and its opacity slider on sudokupad.app, in headless Chromium.
// Playback of a replay with every script installed is live/replay-playback.live.mjs's.
// Every click is a real mouse click on the page at an edge's pixel position.
/* global Replay, Framework, ToolPen, MouseEvent, Node, createImageBitmap, OffscreenCanvas */
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { gotoPuzzle, newPage, openPage, restartPuzzle, startPuzzle } from '../page.mjs'
import { closeExtrasEditorWith, dialogButton, effectiveOpacities, openExtrasEditor, openSettings } from '../settings.mjs'
import { cellCentre, openPenTool, penValuesAt, plantUnchecked, setSlider } from '../pen.mjs'
import { settle, stable } from '../settle.mjs'

const script = readFileSync(new URL('../../pen-tool-extras.user.js', import.meta.url), 'utf8')

const DATA_KEY = 'EdgeMarks_marks'
const OPACITY_KEY = 'PenColor_opacity'
const COLORS_KEY = 'PenColor_colors'
const { CORNER_RADIUS, MARK_VALUES, MARKS_LAYER_ID } = createRequire(import.meta.url)('../../pen-tool-extras.user.js')
const MARK_BOXES = ['x', 'directions', 'circle', 'cornerX', 'cornerCircle', 'cellCircle', 'cellCross', 'cellDot']
const ALL_TICKED = Object.fromEntries(MARK_BOXES.map((mark) => [mark, true]))
const SIZE = 9
const CELL_MARK = [5, 5]
// Pen color 4 as the install save stores it: the default first cell color page's color 4, darkened.
const PEN_4 = 'rgb(113, 159, 23)'

// Each edge a click can reach: the cell a click lands in, the side of it, and the cell and
// pen values that store it. The cycle on an edge is its X, a circle, two directions, then empty.
const EDGES = {
  'interior right (4,4)|(4,5)': { row: 3, col: 3, side: 'right', stored: [3, 3], cycle: ['3', 'j', 'h', 'i', null] },
  'interior bottom (4,4)|(5,4)': { row: 3, col: 3, side: 'bottom', stored: [3, 3], cycle: ['4', 'm', 'k', 'l', null] },
  'outer left of column 1': { row: 3, col: 0, side: 'left', stored: [3, 0], cycle: ['b', 'p', 'n', 'o', null] },
  'outer top of row 1': { row: 0, col: 3, side: 'top', stored: [0, 3], cycle: ['c', 's', 'q', 'r', null] },
  'outer right of the last column': { row: 3, col: SIZE - 1, side: 'right', stored: [3, SIZE - 1], cycle: ['3', 'j', 'h', 'i', null] },
  'outer bottom of the last row': { row: SIZE - 1, col: 3, side: 'bottom', stored: [SIZE - 1, 3], cycle: ['4', 'm', 'k', 'l', null] }
}

// Each grid corner a click can reach, as [row, col] of the corner (0 to 9): the cell that stores
// it and the cycle there, the X then the circle. The values are the script's own: `u`/`x` for the
// bottom right corner of a cell, `t`/`w` for the top left, `v`/`y` for the far two grid corners.
const CORNERS = {
  'inner (4,4)': { corner: [3, 3], stored: [2, 2], cycle: ['u', 'x', null] },
  'inner (8,2)': { corner: [7, 1], stored: [6, 0], cycle: ['u', 'x', null] },
  'outer top left': { corner: [0, 0], stored: [0, 0], cycle: ['t', 'w', null] },
  'outer top, between columns 4 and 5': { corner: [0, 4], stored: [0, 4], cycle: ['t', 'w', null] },
  'outer left, between rows 4 and 5': { corner: [4, 0], stored: [4, 0], cycle: ['t', 'w', null] },
  'outer top right': { corner: [0, SIZE], stored: [0, SIZE - 1], cycle: ['v', 'y', null] },
  'outer bottom left': { corner: [SIZE, 0], stored: [SIZE - 1, 0], cycle: ['v', 'y', null] },
  'outer bottom right': { corner: [SIZE, SIZE], stored: [SIZE - 1, SIZE - 1], cycle: ['u', 'x', null] },
  'outer right, between rows 4 and 5': { corner: [4, SIZE], stored: [3, SIZE - 1], cycle: ['u', 'x', null] },
  'outer bottom, between columns 4 and 5': { corner: [SIZE, 4], stored: [SIZE - 1, 3], cycle: ['u', 'x', null] }
}

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('injected after Start Puzzle', { concurrency: false }, () => {
  let context, p, errors
  const read = (fn, arg) => p.evaluate(fn, arg)
  const saved = () => read((k) => Framework.getData(k), DATA_KEY)
  const editor = () => p.locator('#pen-tool-extras-editor')

  const penCount = () => read(() => document.querySelectorAll('#cell-pen .cell-pen').length)
  const undoDepth = () => read(() => Framework.app.puzzle.undoStack.length)

  // A point 2 px inside the cell, next to the given side: a real click there is an edge click.
  const edgePoint = (row, col, side) => read(([r, c, s]) => {
    const e = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).elem.getBoundingClientRect()
    const pad = 2
    return {
      right: [e.x + e.width - pad, e.y + e.height / 2],
      left: [e.x + pad, e.y + e.height / 2],
      bottom: [e.x + e.width / 2, e.y + e.height - pad],
      top: [e.x + e.width / 2, e.y + pad]
    }[s]
  }, [row, col, side])
  const cornerPoint = (row, col, dx = 0, dy = 0) => read(([r, c, ox, oy]) => {
    const { rows, cols } = Framework.app.grid
    const e = Framework.app.puzzle.cells.find((x) => x.row === Math.min(r, rows - 1) && x.col === Math.min(c, cols - 1)).elem.getBoundingClientRect()
    return [e.x + (c >= cols ? e.width : 0) + ox * e.width, e.y + (r >= rows ? e.height : 0) + oy * e.height]
  }, [row, col, dx, dy])
  const clickAt = (x, y, button = 'left') => p.mouse.click(x, y, { button })
  const clickCorner = async (row, col, button = 'left', dx = 0, dy = 0) => {
    const [x, y] = await cornerPoint(row, col, dx, dy)
    await clickAt(x, y, button)
  }
  const clickEdge = async (row, col, side, button = 'left') => {
    const [x, y] = await edgePoint(row, col, side)
    await clickAt(x, y, button)
  }
  // Whether the page's own `contextmenu` listeners left each right click's menu alone
  // (false) or prevented it (true), in order. The listener sits on `window`, in the bubble
  // phase, so it reads the event after the script's capture listener ran.
  const menuLog = () => read(() => window.__menuPrevented)
  const watchMenus = () => read(() => {
    window.__menuPrevented = []
    window.addEventListener('contextmenu', (event) => window.__menuPrevented.push(event.defaultPrevented))
  })
  const clickCellCentre = async (row, col) => {
    const [x, y] = await cellCentre(p, row, col)
    await clickAt(x, y)
  }
  const pickColor = async (n) => p.locator(`.tool-pen button[data-key="${n}"]`).click()
  // Clears every cell that holds a pen mark. Pen value 0 clears a cell, through an act so that the
  // page redraws it.
  const clearMarks = async () => {
    await read(() => {
      for (const cell of Framework.app.puzzle.cells.filter((x) => x.pen.length)) {
        Framework.app.act({ type: 'select', arg: [cell] })
        Framework.app.act({ type: 'pen', arg: '0' })
        Framework.app.act({ type: 'deselect' })
      }
    })
  }

  const settingsEntry = () => p.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Pen Tool Extras' }).first()
  const box = (mark) => editor().locator(`input[data-box="marks.${mark}"]`)

  const boot = async () => {
    await startPuzzle(p)
    await p.addScriptTag({ content: script })
    // The pen tool is off until its own setting turns it on.
    await read(() => Framework.setSetting('toolpen', true))
    await p.locator('#control-pen').waitFor({ state: 'visible' })
    await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
    await openPenTool(p)
    await watchMenus()
  }
  const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }

  before(async () => {
    ;({ context, p, errors } = await openPage(browser))
    await boot()
  })
  after(async () => { await context.close() })

  for (const [name, edge] of Object.entries(EDGES)) {
    it(`${name}: clicks cycle X, circle, direction, other direction, empty, and draw each`, async () => {
      const [sr, sc] = edge.stored
      for (const value of [...edge.cycle, edge.cycle[0]]) {
        await clickEdge(edge.row, edge.col, edge.side)
        assert.deepEqual(await settle(() => penValuesAt(p, sr, sc), value === null ? [] : [value]), value === null ? [] : [value], `${name} after a click`)
        // every drawn mark has a path with data: a mark with no `d` shows nothing
        const drawn = await read(() => [...document.querySelectorAll('#cell-pen .cell-pen')].map((e) => e.getAttribute('d')))
        assert.deepEqual(drawn.filter((d) => !d), [], 'a mark was drawn with no path data')
        assert.equal(drawn.length, value === null ? 0 : 1)
      }
      await clearMarks()
    })
  }

  for (const [name, edge] of Object.entries(EDGES)) {
    it(`${name}: a right click removes the mark at each step of the cycle, and one undo brings it back`, async () => {
      const [sr, sc] = edge.stored
      for (const [i, value] of edge.cycle.slice(0, -1).entries()) {
        for (let k = 0; k <= i; k++) await clickEdge(edge.row, edge.col, edge.side)
        assert.deepEqual(await settle(() => penValuesAt(p, sr, sc), [value]), [value], `${name} before the right click`)
        const depth = await undoDepth()
        await clickEdge(edge.row, edge.col, edge.side, 'right')
        assert.deepEqual(await settle(() => penValuesAt(p, sr, sc), []), [], `${name} ${value} after a right click`)
        assert.ok(await undoDepth() > depth, 'an undo step')
        assert.equal(await penCount(), 0, 'the drawn mark is gone')
        await p.click('#control-undo')
        assert.deepEqual(await settle(() => penValuesAt(p, sr, sc), [value]), [value], `${name} after an undo`)
        await clearMarks()
      }
    })
  }

  it('a left click steps forward from the empty edge a right click left, and a right click on an empty edge does nothing', async () => {
    await clickEdge(3, 3, 'right')
    await clickEdge(3, 3, 'right', 'right')
    assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), []), [])
    await clickEdge(3, 3, 'right')
    assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), ['3']), ['3'])
    await clearMarks()
    const depth = await undoDepth()
    await clickEdge(3, 3, 'right', 'right')
    await sleep(150) // "nothing happened in 150 ms" check
    assert.deepEqual(await penValuesAt(p, 3, 3), [])
    assert.equal(await undoDepth(), depth, 'no undo step')
  })

  it('a right click over the grid in the pen tool keeps the browser menu closed, wherever it lands; off the grid and with another tool the menu is left alone', async () => {
    const before = (await menuLog()).length
    await clickEdge(3, 3, 'right', 'right')
    await clickEdge(0, 3, 'top', 'right')
    const [cx, cy] = await cellCentre(p, ...CELL_MARK)
    await p.mouse.click(cx, cy, { button: 'right' })
    assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), []), [], 'a right click in a cell middle makes no cell mark')
    // a right click off the grid
    await p.mouse.click(5, 5, { button: 'right' })
    assert.deepEqual((await settle(async () => (await menuLog()).slice(before), [true, true, true, false])), [true, true, true, false], 'edge, edge, cell middle, then off the grid')
    // the menu is asked for by something outside the grid
    const outside = await read(() => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      return event.defaultPrevented
    })
    assert.equal(outside, false, 'a menu asked for outside the grid')
    // another tool: turn the pen tool off, then right click the same edge point
    await p.click('#control-normal')
    assert.equal(await settle(() => read(() => Framework.app.tool), 'normal'), 'normal')
    await clickEdge(3, 3, 'right', 'right')
    assert.deepEqual((await settle(async () => (await menuLog()).slice(before), [true, true, true, false, false, false])), [true, true, true, false, false, false], 'other tool')
    await openPenTool(p)
    await clearMarks()
  })

  it('a right click in a cell\'s middle removes its circle, cross or dot, and one undo brings it back', async () => {
    const [cx, cy] = await cellCentre(p, ...CELL_MARK)
    for (const [i, value] of ['5', '6', 'z'].entries()) {
      for (let k = 0; k <= i; k++) await clickCellCentre(...CELL_MARK)
      assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), [value]), [value], `${value} before the right click`)
      const depth = await undoDepth()
      await p.mouse.click(cx, cy, { button: 'right' })
      assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), []), [], `${value} after a right click`)
      assert.ok(await undoDepth() > depth, 'an undo step')
      assert.equal(await penCount(), 0, 'the drawn mark is gone')
      await p.click('#control-undo')
      assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), [value]), [value], `${value} after an undo`)
      await clearMarks()
    }
  })

  it('a right-drag across cell middles removes their cell marks and leaves the edge marks it does not cross, as one undo step', async () => {
    await clickCellCentre(4, 1)
    await clickCellCentre(4, 2)
    await clickCellCentre(4, 2)
    await clickCellCentre(4, 2)
    await clickEdge(2, 2, 'right')
    assert.deepEqual(await settle(() => penValuesAt(p, 4, 2), ['z']), ['z'])
    const depth = await undoDepth()
    const [x1, y1] = await cellCentre(p, 4, 1)
    const [x2, y2] = await cellCentre(p, 4, 2)
    await p.mouse.move(x1, y1)
    await p.mouse.down({ button: 'right' })
    await p.mouse.move(x2, y2, { steps: 6 })
    await p.mouse.up({ button: 'right' })
    assert.deepEqual(await settle(() => penValuesAt(p, 4, 1), []), [])
    assert.deepEqual(await settle(() => penValuesAt(p, 4, 2), []), [])
    assert.deepEqual(await penValuesAt(p, 2, 2), ['3'], 'the edge X off the drag stays')
    assert.ok(await undoDepth() > depth, 'an undo step')
    await p.click('#control-undo')
    assert.deepEqual(await settle(() => penValuesAt(p, 4, 1), ['5']), ['5'])
    assert.deepEqual(await settle(() => penValuesAt(p, 4, 2), ['z']), ['z'], 'one undo brings both back')
    await clearMarks()
  })

  it('the other side of an interior edge reaches the same mark', async () => {
    await clickEdge(3, 4, 'left')
    assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), ['3']), ['3'])
    assert.deepEqual(await penValuesAt(p, 3, 4), [])
    await clickEdge(3, 3, 'right')
    assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), ['j']), ['j'])
    await clearMarks()
  })

  for (const [name, { corner, stored, cycle }] of Object.entries(CORNERS)) {
    const [sr, sc] = stored
    const want = (value) => value === null ? [] : [value]
    it(`${name}: clicks cycle X, circle, empty, and draw each, centred on the corner`, async () => {
      const [cx, cy] = await cornerPoint(...corner)
      for (const value of [...cycle, cycle[0]]) {
        await clickCorner(...corner)
        assert.deepEqual(await settle(() => penValuesAt(p, sr, sc), want(value)), want(value), `${name} after a click`)
        const drawn = await read(() => [...document.querySelectorAll('#cell-pen .cell-pen')].map((e) => e.getAttribute('d')))
        assert.deepEqual(drawn.filter((d) => !d), [], 'a mark was drawn with no path data')
        assert.equal(drawn.length, value === null ? 0 : 1)
        if (value !== null) {
          const centre = await read(() => { const r = document.querySelector('#cell-pen .cell-pen').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })
          assert.equal(Math.abs(centre[0] - cx) < 1 && Math.abs(centre[1] - cy) < 1, true, `mark centre ${centre} is not the corner ${[cx, cy]}`)
        }
      }
      await clearMarks()
    })

    it(`${name}: a right click removes the mark at each step of the cycle, and one undo brings it back`, async () => {
      for (const [i, value] of cycle.slice(0, -1).entries()) {
        for (let k = 0; k <= i; k++) await clickCorner(...corner)
        assert.deepEqual(await settle(() => penValuesAt(p, sr, sc), want(value)), want(value), `${name} before the right click`)
        const depth = await undoDepth()
        await clickCorner(...corner, 'right')
        assert.deepEqual(await settle(() => penValuesAt(p, sr, sc), []), [], `${name} ${value} after a right click`)
        assert.ok(await undoDepth() > depth, 'an undo step')
        await p.click('#control-undo')
        assert.deepEqual(await settle(() => penValuesAt(p, sr, sc), want(value)), want(value), `${name} after an undo`)
        await clearMarks()
      }
    })
  }

  it('an inner corner is one mark, whichever of the four cells around it the click lands in', async () => {
    await clickCorner(3, 3, 'left', 0.1, 0.1)
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), ['u']), ['u'])
    await clickCorner(3, 3, 'left', -0.1, 0.1)
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), ['x']), ['x'])
    await clickCorner(3, 3, 'left', 0.1, -0.1)
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), []), [])
    await clickCorner(3, 3, 'left', -0.1, -0.1)
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), ['u']), ['u'])
    for (const [r, c] of [[2, 3], [3, 2], [3, 3]]) assert.deepEqual(await penValuesAt(p, r, c), [])
    await clearMarks()
  })

  it('a corner mark, an edge mark and a cell mark can sit on one cell, each cycling alone', async () => {
    await clickCorner(3, 3)
    await clickEdge(2, 2, 'right')
    await clickCellCentre(2, 2)
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), ['3', '5', 'u']), ['3', '5', 'u'])
    await clickCorner(3, 3)
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), ['3', '5', 'x']), ['3', '5', 'x'])
    await clearMarks()
  })

  it(`the corner zone is ${CORNER_RADIUS} of a cell: just inside is a corner mark, just outside along an edge is the edge mark`, async () => {
    // 0.17 of a cell up the side from the corner is inside; 0.23 is in the edge zone
    await clickCorner(3, 4, 'left', -0.02, -0.17)
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 3), ['u']), ['u'], 'inside the zone')
    await clickCorner(3, 4, 'left', -0.02, -0.23)
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 3), ['3', 'u']), ['3', 'u'], 'outside the zone: the edge mark')
    await clearMarks()
  })

  it('a right click on a corner keeps the browser menu closed and removes the corner mark', async () => {
    const before = (await menuLog()).length
    await clickCorner(3, 3)
    await clickCorner(3, 3, 'left', 0.1, 0.1)
    await clickCorner(0, 0)
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), ['x']), ['x'])
    await clickCorner(3, 3, 'right')
    await clickCorner(0, 0, 'right')
    assert.deepEqual(await settle(async () => (await menuLog()).slice(before), [true, true]), [true, true])
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), []), [])
    assert.deepEqual(await penValuesAt(p, 0, 0), [])
    await clearMarks()
  })

  it('a right click inside the corner zone where SudokuPad sees neither an edge nor a cell keeps the browser menu closed and removes the corner mark', async () => {
    // SudokuPad reads the pointer in whole pixels and the script reads the press exactly, so the point is found by
    // moving the mouse along the diagonal from corner (3,3) and applying SudokuPad's own arithmetic (tool-pen.js
    // `clickCell`) to the event's own position: a point inside the 0.2 zone that is neither an edge click nor a cell click.
    await read(() => window.addEventListener('pointermove', (e) => { window.__pointer = [e.clientX, e.clientY] }, true))
    let found = null
    for (let offset = 0.12; offset < 0.16 && found === null; offset += 0.002) {
      const [x, y] = await cornerPoint(3, 3, offset, offset)
      await p.mouse.move(x, y)
      const point = await read(() => {
        const { r, c } = Framework.app.xyToRCExact(...window.__pointer)
        const [cellR, cellC] = [Math.floor(r), Math.floor(c)]
        const [dx, dy] = [c - (cellC + 0.5), r - (cellR + 0.5)]
        const [sx, sy] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]
        const cellDist = Math.hypot(r - cellR - 0.5, c - cellC - 0.5)
        const edgeDist = Math.hypot(r - (cellR + 0.5 + 0.5 * sy), c - (cellC + 0.5 + 0.5 * sx))
        const neither = !(edgeDist < cellDist * 0.75 && edgeDist <= 1) && !(cellDist <= 0.5)
        return { cornerDist: Math.hypot(r - 3, c - 3), neither }
      })
      if (point.neither && point.cornerDist < CORNER_RADIUS) found = [x, y]
    }
    assert.notEqual(found, null, 'no pixel near the corner is in the zone and neither an edge nor a cell to SudokuPad')
    await clickCorner(3, 3)
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), ['u']), ['u'])
    const before = (await menuLog()).length
    await p.mouse.click(found[0], found[1], { button: 'right' })
    assert.deepEqual(await settle(async () => (await menuLog()).slice(before), [true]), [true])
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), []), [], 'the corner mark is removed')
    await clearMarks()
  })

  it('a corner mark survives a replay: it is in getReplay(), and loading that replay draws it again', async () => {
    await restartPuzzle(p)
    await clickCorner(3, 3)
    await clickCorner(0, SIZE)
    await clickCorner(0, SIZE)
    const replay = await read(() => Framework.app.getReplay())
    const actions = await read((r) => Replay.decode(r).actions, replay)
    assert.equal(actions.includes('pe:u/0'), true, JSON.stringify(actions))
    assert.equal(actions.includes('pe:v/0') && actions.includes('pe:y/0'), true, `the far corner X, then the circle: ${JSON.stringify(actions)}`)
    await clearMarks()
    assert.deepEqual(await penValuesAt(p, 2, 2), [])
    await read((r) => Framework.app.loadReplay(r), replay)
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), ['u']), ['u'])
    assert.deepEqual(await settle(() => penValuesAt(p, 0, SIZE - 1), ['y']), ['y'])
    const drawn = await read(() => [...document.querySelectorAll('#cell-pen .cell-pen.pen-u, #cell-pen .cell-pen.pen-y')].map((e) => e.getAttribute('d')))
    assert.deepEqual(drawn.filter((d) => !d), [])
    assert.equal(new Set(drawn).size, 2, 'the X on the inner corner and the circle on the far corner')
    await clearMarks()
  })

  it('a corner mark survives a reload of the page', async () => {
    await clickCorner(3, 3)
    await clickCorner(SIZE, SIZE)
    assert.deepEqual(await settle(() => penValuesAt(p, 8, 8), ['u']), ['u'])
    await reload()
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), ['u']), ['u'])
    assert.deepEqual(await settle(() => penValuesAt(p, 8, 8), ['u']), ['u'])
    const drawn = await read(() => [...document.querySelectorAll('#cell-pen .cell-pen')].map((e) => e.getAttribute('d')))
    assert.deepEqual(drawn.filter((d) => !d), [])
    assert.equal(drawn.length, 2)
    await clearMarks()
  })

  const setThickness = (value) => setSlider(p, '#pen-tool-extras-thickness', value)

  it('edge, corner and cell dot marks are about 1.27x at 10 and 1.6x at 16 of their size at 5, and stay centred', async () => {
    const boxOf = (selector) => read((sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect()
      return r ? { w: r.width, h: r.height, x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
    }, selector)
    // [kind of click, clicks to reach it, the mark it draws]: SudokuPad's own edge X, the circle, an arrow, the other arrow, a corner X and a corner circle.
    const marks = [
      ['edge', 1, '#cell-pen .cell-pen.pen-3'], ['edge', 2, '#cell-pen .cell-pen.pen-j'], ['edge', 3, '#cell-pen .cell-pen.pen-h'], ['edge', 4, '#cell-pen .cell-pen.pen-i'],
      ['corner', 1, '#cell-pen .cell-pen.pen-u'], ['corner', 2, '#cell-pen .cell-pen.pen-x'], ['cell', 3, '#cell-pen .cell-pen.pen-z']
    ]
    const clickOf = { edge: () => clickEdge(3, 3, 'right'), corner: () => clickCorner(3, 3), cell: () => clickCellCentre(3, 3) }
    for (const [kind, clicks, selector] of marks) {
      const at = {}
      await setThickness(5)
      for (let i = 0; i < clicks; i++) await clickOf[kind]()
      await settle(() => boxOf(selector).then(Boolean), true)
      // The slider's input event restyles at once, so the box is read right after it.
      for (const thickness of [5, 10, 16]) {
        await setThickness(thickness)
        at[thickness] = await boxOf(selector)
      }
      for (const thickness of [10, 16]) {
        const scale = 1 + 0.6 * (thickness - 5) / 11
        assert.equal(Math.abs(at[thickness].w / at[5].w - scale) < 0.01, true, `${selector} at ${thickness}: width ${at[thickness].w} against ${at[5].w}, wanted ${scale} times`)
        assert.equal(Math.abs(at[thickness].h / at[5].h - scale) < 0.01, true, `${selector} at ${thickness}: height`)
        assert.equal(Math.abs(at[thickness].x - at[5].x) < 0.6 && Math.abs(at[thickness].y - at[5].y) < 0.6, true, `${selector} at ${thickness} moved its centre from ${at[5].x},${at[5].y} to ${at[thickness].x},${at[thickness].y}`)
      }
      await clearMarks()
    }
    await setThickness(5)
  })

  it('every edge mark, grid-corner mark and cell circle, cross and dot is drawn above every line, whichever cell holds it, and stays above through undo, redo, a full redraw in cell order, a reload and a thickness change', async () => {
    // Marks in an earlier cell than a line, in a later one, and on the line's own cell; the pen value goes through an act like a click's.
    const put = (row, col, values) => read(([r, c, vals]) => {
      const cell = Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c)
      Framework.app.act({ type: 'select', arg: [cell] })
      vals.forEach((arg) => Framework.app.act({ type: 'pen', arg }))
      Framework.app.act({ type: 'deselect' })
    }, [row, col, values])
    // The paths drawn, and whether every mark path follows every line path in the document, and sits in the marks layer, which is the pen layer's last child.
    const stacking = () => read(([markValues, layerId]) => {
      const paths = [...document.querySelectorAll('#cell-pen .cell-pen')].map((e) => ({ e, mark: markValues.includes([...e.classList].find((c) => c.startsWith('pen-')).slice(4)) }))
      const lines = paths.filter((x) => !x.mark).map((x) => x.e)
      const marks = paths.filter((x) => x.mark).map((x) => x.e)
      const layer = document.getElementById(layerId)
      const nested = Boolean(layer) && layer.parentElement.id === 'cell-pen' && layer.parentElement.lastElementChild === layer && marks.every((m) => m.parentElement === layer)
      return { lines: lines.length, marks: marks.length, ok: nested && lines.every((l) => marks.every((m) => Boolean(l.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING))) }
    }, [MARK_VALUES, MARKS_LAYER_ID])
    const STACKED = { lines: 3, marks: 12, ok: true }
    try {
      await setThickness(16)
      await put(2, 2, ['3', '5', 'u'])
      await put(2, 3, ['1', '2'])
      await put(2, 4, ['c', '6', 't', '4'])
      await put(4, 4, ['1'])
      await put(4, 3, ['b', 'k', '5'])
      await put(6, 6, ['z'])
      await put(1, 1, ['x'])
      assert.deepEqual(await settle(stacking, STACKED), STACKED)
      const drawn = await penCount()
      // The acts above are not grouped like a click's, so an undo may first undo a selection: undo until a stroke goes, then redo as often.
      let undone = 0
      while ((await penCount()) >= drawn && undone < 6) {
        await p.click('#control-undo')
        undone++
        await settle(async () => (await penCount()) < drawn, true, 500)
      }
      assert.equal((await penCount()) < drawn, true, 'an undo removes a stroke')
      assert.equal((await stacking()).ok, true, 'after an undo')
      for (let i = 0; i < undone; i++) await p.click('#control-redo')
      assert.deepEqual(await settle(stacking, STACKED), STACKED, 'after a redo')
      // Every cell drawn again in cell order, which is what a reload, a replay and the script's own install do: the later cells' lines come last.
      await read(() => Framework.app.puzzle.cells.forEach((cell) => cell.renderContent(true)))
      assert.deepEqual(await settle(stacking, STACKED), STACKED, 'after every cell is drawn again in cell order')
      await setThickness(10)
      assert.deepEqual(await stacking(), STACKED, 'after a thickness change')
      await reload()
      assert.deepEqual(await settle(stacking, STACKED), STACKED, 'after a reload')
    } finally {
      await clearMarks()
      await setThickness(5)
    }
    assert.equal(await settle(penCount, 0), 0, 'erasing removes the marks from the marks layer too')
  })

  it('one undo reverses one click and redo restores it', async () => {
    await clickEdge(3, 3, 'right')
    await clickEdge(3, 3, 'right')
    assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), ['j']), ['j'])
    await p.click('#control-undo')
    assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), ['3']), ['3'])
    await p.click('#control-redo')
    assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), ['j']), ['j'])
    await p.click('#control-undo')
    await p.click('#control-undo')
    assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), []), [])
    await clearMarks()
  })

  it('a mark takes the selected pen color and keeps it through undo and redo', async () => {
    await pickColor(4)
    await clickEdge(3, 3, 'right')
    await clickEdge(3, 3, 'right')
    const stroke = () => read(() => [...document.querySelectorAll('#cell-pen .cell-pen.pen-j')].map((e) => ({ cls: e.getAttribute('class'), stroke: window.getComputedStyle(e).stroke })))
    assert.deepEqual(await settle(stroke, [{ cls: 'cell-pen pen-j pencolor-4', stroke: PEN_4 }]), [{ cls: 'cell-pen pen-j pencolor-4', stroke: PEN_4 }])
    await p.click('#control-undo')
    await p.click('#control-redo')
    assert.deepEqual(await settle(stroke, [{ cls: 'cell-pen pen-j pencolor-4', stroke: PEN_4 }]), [{ cls: 'cell-pen pen-j pencolor-4', stroke: PEN_4 }])
    await clearMarks()
    await pickColor(1)
  })

  it('the edge circle is an open ring with a round stroke at half the pen width, and no fill', async () => {
    for (let i = 0; i < 2; i++) await clickEdge(3, 3, 'right')
    const ring = () => read(() => {
      // Two arcs of one radius r, from the left end of a diameter round to the right end and back: `m -r,0 a r,r 0 1,0 2r,0 a r,r 0 1,0 -2r,0`.
      const isCircle = (d) => {
        const m = /^m -([\d.]+),0 a ([\d.]+),([\d.]+) 0 1,0 ([\d.]+),0 a \2,\3 0 1,0 -\4,0$/.exec(d)
        return Boolean(m) && m[1] === m[2] && m[2] === m[3] && Math.abs(2 * m[2] - m[4]) < 0.01
      }
      const e = document.querySelector('#cell-pen .cell-pen.pen-j')
      if (!e) return null
      const s = window.getComputedStyle(e)
      return { cap: s.strokeLinecap, width: s.strokeWidth, fill: s.fill, circle: isCircle(e.getAttribute('d').replace(/^M[\d. ]+ /, '')) }
    })
    const want = { cap: 'round', width: '2.5px', fill: 'none', circle: true }
    assert.deepEqual(await settle(ring, want), want)
    await clearMarks()
  })

  it('the cell dot is a filled disc in the pen\'s color, about a fifth of the cell across, centred on the cell\'s middle, and keeps its color through undo and redo', async () => {
    await pickColor(4)
    for (let i = 0; i < 3; i++) await clickCellCentre(...CELL_MARK)
    const [cx, cy] = await cellCentre(p, ...CELL_MARK)
    const dot = () => read(() => {
      const e = document.querySelector('#cell-pen .cell-pen.pen-z')
      if (!e) return null
      const s = window.getComputedStyle(e)
      const r = e.getBoundingClientRect()
      const cell = Framework.app.puzzle.cells[0].elem.getBoundingClientRect()
      return { cls: e.getAttribute('class'), fill: s.fill, stroke: s.stroke, across: (r.width + parseFloat(s.strokeWidth) * r.width / e.getBBox().width) / cell.width, centre: [r.x + r.width / 2, r.y + r.height / 2] }
    })
    const look = await settle(async () => (await dot())?.fill === PEN_4, true).then(dot)
    assert.equal(look.cls, 'cell-pen pen-z pencolor-4')
    assert.equal(look.fill, PEN_4, 'filled in the pen color')
    assert.equal(look.stroke, PEN_4)
    assert.equal(look.across > 0.17 && look.across < 0.23, true, `about a fifth of the cell across: ${look.across}`)
    assert.equal(Math.abs(look.centre[0] - cx) < 1 && Math.abs(look.centre[1] - cy) < 1, true, `centre ${look.centre} is not the cell's middle ${[cx, cy]}`)
    await p.click('#control-undo')
    await p.click('#control-redo')
    assert.equal(await settle(async () => (await dot())?.fill, PEN_4), PEN_4, 'after undo and redo')
    await clearMarks()
    await pickColor(1)
  })

  it('the cell boxes: an unticked cell mark is skipped, and the boxes survive a reload', async () => {
    await openExtrasEditor(p)
    await box('cellCross').uncheck()
    await closeExtrasEditorWith(p, 'Save')
    assert.deepEqual(await saved(), { ...ALL_TICKED, cellCross: false })
    await reload()
    for (const value of ['5', 'z', null]) {
      await clickCellCentre(...CELL_MARK)
      const want = value === null ? [] : [value]
      assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), want), want, 'circle, dot, empty')
    }
    await openExtrasEditor(p)
    assert.equal(await box('cellCross').isChecked(), false)
    await box('cellCross').check()
    await box('cellCircle').uncheck()
    await box('cellDot').uncheck()
    await closeExtrasEditorWith(p, 'Save')
    await clickCellCentre(...CELL_MARK)
    assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), ['6']), ['6'], 'only the cross is ticked')
    await clickCellCentre(...CELL_MARK)
    assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), []), [])
    await openExtrasEditor(p)
    for (const mark of MARK_BOXES) await box(mark).check()
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await saved(), null)
  })

  it('settings saved before the Cell row existed tick all three cell boxes', async () => {
    await plantUnchecked(p, DATA_KEY, JSON.stringify({ x: true, directions: false, circle: true, cornerX: true, cornerCircle: true }))
    await reload()
    await openExtrasEditor(p)
    for (const mark of ['cellCircle', 'cellCross', 'cellDot']) assert.equal(await box(mark).isChecked(), true, mark)
    assert.equal(await box('directions').isChecked(), false)
    await box('directions').check()
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await saved(), null)
  })

  it('a cell dot survives a replay and a reload of the page', async () => {
    await restartPuzzle(p)
    for (let i = 0; i < 3; i++) await clickCellCentre(...CELL_MARK)
    assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), ['z']), ['z'])
    const replay = await read(() => Framework.app.getReplay())
    const actions = await read((r) => Replay.decode(r).actions, replay)
    assert.equal(actions.includes('pe:z/0'), true, JSON.stringify(actions))
    await clearMarks()
    await read((r) => Framework.app.loadReplay(r), replay)
    assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), ['z']), ['z'], 'after the replay')
    await reload()
    assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), ['z']), ['z'], 'after a reload')
    const drawn = await read(() => [...document.querySelectorAll('#cell-pen .cell-pen.pen-z')].map((e) => e.getAttribute('d')))
    assert.equal(drawn.length, 1)
    assert.notEqual(drawn[0], null, 'drawn with path data')
    await clearMarks()
  })

  it('the dialog shows one table of marks: plain boxes in its cells, the pictures in its headings, the mark\'s name as each box\'s name and hover title', async () => {
    await openExtrasEditor(p)
    const labels = editor().locator('label:has(> input[data-box^="marks."])')
    assert.equal(await labels.count(), 8)
    assert.equal(await editor().locator('.pen-tool-extras-mark-head svg').count(), 4, 'a picture over each column')
    const names = { x: 'Edge X Mark', circle: 'Edge Circle', directions: 'Edge Directions', cornerX: 'Corner X Mark', cornerCircle: 'Corner Circle', cellCircle: 'Cell Circle', cellCross: 'Cell Cross', cellDot: 'Cell Dot' }
    for (const mark of MARK_BOXES) {
      assert.equal(await editor().locator(`label:has(> input[data-box="marks.${mark}"]) > svg`).count(), 0, mark)
      assert.equal(await box(mark).getAttribute('title'), names[mark], mark)
      assert.equal((await editor().locator(`label:has(> input[data-box="marks.${mark}"])`).textContent()).trim(), '', `${mark} has no word`)
      assert.equal((await p.getByRole('checkbox', { name: names[mark] }).count()), 1, `${mark} is found by its name`)
    }
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('a click in a cell\'s middle cycles circle, cross, dot, empty, one undo per click, and drawn lines still work', async () => {
    for (const value of ['5', '6', 'z', null]) {
      await clickCellCentre(...CELL_MARK)
      const want = value === null ? [] : [value]
      assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), want), want)
    }
    const depth = await undoDepth()
    await clickCellCentre(...CELL_MARK)
    await clickCellCentre(...CELL_MARK)
    await clickCellCentre(...CELL_MARK)
    assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), ['z']), ['z'])
    await p.click('#control-undo')
    assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), ['6']), ['6'], 'one undo goes back one step')
    await p.click('#control-redo')
    assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), ['z']), ['z'], 'redo')
    assert.ok(await undoDepth() > depth)
    await clearMarks()
    // a drag draws a line, not an edge mark
    const before = await penCount()
    const [x, y] = await cellCentre(p, 6, 1)
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x + 70, y + 5, { steps: 8 })
    await p.mouse.up()
    assert.equal(await settle(async () => (await penCount()) > before, true), true)
    const values = await read(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => v[0])))
    // A drag leaves a line, and a cell circle where it ends; never a mark on an edge.
    assert.deepEqual(values.filter((v) => '34bchijklmnopqrstuvwxy'.includes(v)), [], 'a drag draws no edge mark')
    await p.click('#control-undo')
    assert.equal(await settle(penCount, before), before)
  })

  it('getReplay() encodes the moves', async () => {
    await clickEdge(3, 3, 'right')
    await clickEdge(3, 3, 'right')
    const actions = () => read(() => Replay.decode(Framework.app.getReplay()).actions)
    assert.equal((await settle(async () => (await actions()).includes('pe:j/0'), true)), true)
    assert.equal((await actions()).includes('pe:3/0'), true)
    await clearMarks()
  })

  it('The dialog has eight mark boxes (three for edges, two for corners, three for cells), all ticked on a fresh install', async () => {
    assert.equal(await saved(), null)
    await openExtrasEditor(p)
    for (const mark of MARK_BOXES) assert.equal(await box(mark).isChecked(), true, mark)
    await closeExtrasEditorWith(p, 'Cancel')
  })

  it('Cancel saves nothing and changes nothing', async () => {
    await openExtrasEditor(p)
    await box('directions').uncheck()
    await closeExtrasEditorWith(p, 'Cancel')
    assert.equal(await saved(), null)
    await clickEdge(3, 3, 'right')
    await clickEdge(3, 3, 'right')
    assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), ['j']), ['j'])
    await clearMarks()
  })

  it('unticking Directions skips both directions and the boxes survive a reload', async () => {
    await openExtrasEditor(p)
    await box('directions').uncheck()
    await closeExtrasEditorWith(p, 'Save')
    assert.deepEqual(await saved(), { ...ALL_TICKED, directions: false })
    await reload()
    assert.deepEqual(await saved(), { ...ALL_TICKED, directions: false })
    await openExtrasEditor(p)
    assert.equal(await box('x').isChecked(), true)
    assert.equal(await box('directions').isChecked(), false)
    assert.equal(await box('circle').isChecked(), true)
    await closeExtrasEditorWith(p, 'Cancel')
    for (const value of ['3', 'j', null]) {
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), value === null ? [] : [value]), value === null ? [] : [value])
    }
  })

  it('a mark whose type is unticked stays until clicked, then moves on', async () => {
    await openExtrasEditor(p)
    await box('directions').check()
    await closeExtrasEditorWith(p, 'Save')
    await clickEdge(3, 3, 'right')
    await clickEdge(3, 3, 'right')
    assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), ['j']), ['j'])
    await openExtrasEditor(p)
    await box('circle').uncheck()
    await closeExtrasEditorWith(p, 'Save')
    assert.deepEqual(await penValuesAt(p, 3, 3), ['j'])
    await clickEdge(3, 3, 'right')
    assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), ['h']), ['h'])
    await openExtrasEditor(p)
    await box('circle').check()
    await closeExtrasEditorWith(p, 'Save')
    await clearMarks()
  })

  it('with both corner boxes unticked a click on a corner is the edge click it was before, and one box ticked cycles only that mark', async () => {
    await openExtrasEditor(p)
    await box('cornerX').uncheck()
    await box('cornerCircle').uncheck()
    await closeExtrasEditorWith(p, 'Save')
    await clearMarks()
    await clickCorner(3, 3, 'left', 0, 0.01)
    // by SudokuPad's own arithmetic a click on a corner comes out as an edge mark
    const held = await settle(async () => (await penValuesAt(p, 2, 2)).length, 1)
    assert.equal(held, 1)
    assert.equal(['3', '4'].includes((await penValuesAt(p, 2, 2))[0]), true, `got ${await penValuesAt(p, 2, 2)}`)
    await clearMarks()
    await openExtrasEditor(p)
    await box('cornerCircle').check()
    await closeExtrasEditorWith(p, 'Save')
    await clearMarks()
    await clickCorner(3, 3)
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), ['x']), ['x'], 'only the circle is ticked')
    await clickCorner(3, 3)
    assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), []), [])
    await openExtrasEditor(p)
    await box('cornerX').check()
    await closeExtrasEditorWith(p, 'Save')
    await clearMarks()
  })

  it('with nothing ticked an edge click and a cell click do nothing, and existing marks are unaffected', async () => {
    await openExtrasEditor(p)
    await box('directions').check()
    await closeExtrasEditorWith(p, 'Save')
    await clickEdge(3, 3, 'right')
    assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), ['3']), ['3'])
    await openExtrasEditor(p)
    for (const mark of MARK_BOXES) await box(mark).uncheck()
    await closeExtrasEditorWith(p, 'Save')
    const undoable = await read(() => Framework.app.puzzle.undoStack.length)
    await clickEdge(3, 3, 'right')
    await clickEdge(3, 3, 'bottom')
    // "nothing happened in 500 ms" check
    await sleep(500)
    assert.deepEqual(await penValuesAt(p, 3, 3), ['3'])
    assert.equal(await read(() => Framework.app.puzzle.undoStack.length), undoable)
    await clickCellCentre(...CELL_MARK)
    // "nothing happened in 500 ms" check
    await sleep(500)
    assert.deepEqual(await penValuesAt(p, ...CELL_MARK), [])
    assert.equal(await read(() => Framework.app.puzzle.undoStack.length), undoable)
    await openExtrasEditor(p)
    for (const mark of MARK_BOXES) await box(mark).check()
    await closeExtrasEditorWith(p, 'Save')
    await clearMarks()
  })

  it('corrupt saved settings fall back to every mark ticked with no thrown error', async () => {
    const errorsBefore = errors.length
    for (const bad of ['{not json', '"red"', '[1,2]', '{"x":"no"}']) {
      // Every box ticked is the default, which saves no key; the save tests above read DATA_KEY back, so it is the live key.
      await plantUnchecked(p, DATA_KEY, bad)
      await reload()
      await clickEdge(3, 3, 'right')
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), ['j']), ['j'], bad)
      await clearMarks()
      // the dialog shows the defaults too, so Save cannot store the corrupt value
      await openExtrasEditor(p)
      for (const mark of MARK_BOXES) assert.equal(await box(mark).isChecked(), true, `${bad}: ${mark}`)
      await closeExtrasEditorWith(p, 'Cancel')
    }
    assert.deepEqual(errors.slice(errorsBefore), [])
  })

  it('settings saved under the old names dot and cornerDot tick the dialog\'s Circle boxes after a reload, and the next save writes the new names', async () => {
    const oldNames = (dot, cornerDot) => JSON.stringify({ x: true, directions: true, dot, cornerX: true, cornerDot })
    for (const [dot, cornerDot] of [[false, true], [true, false]]) {
      await plantUnchecked(p, DATA_KEY, oldNames(dot, cornerDot))
      await reload()
      await openExtrasEditor(p)
      assert.equal(await box('circle').isChecked(), dot, `Edge Circle with dot ${dot}`)
      assert.equal(await box('cornerCircle').isChecked(), cornerDot, `Corner Circle with cornerDot ${cornerDot}`)
      await closeExtrasEditorWith(p, 'Cancel')
    }
    await openExtrasEditor(p)
    await box('x').uncheck()
    await closeExtrasEditorWith(p, 'Save')
    assert.deepEqual(await saved(), { ...ALL_TICKED, x: false, cornerCircle: false })
    await openExtrasEditor(p)
    for (const mark of MARK_BOXES) await box(mark).check()
    await closeExtrasEditorWith(p, 'Save')
    assert.equal(await saved(), null, 'every box ticked is the default, so Save removes the key')
  })

  it('Restore defaults leaves the mark boxes as they are: Save after it keeps the saved marks, and they survive a reload', async () => {
    const custom = { ...ALL_TICKED, directions: false, cornerCircle: false }
    await openExtrasEditor(p)
    await box('directions').uncheck()
    await box('cornerCircle').uncheck()
    await closeExtrasEditorWith(p, 'Save')
    assert.deepEqual(await saved(), custom)
    await openExtrasEditor(p)
    await dialogButton(p, 'Restore defaults').click()
    assert.equal(await box('directions').isChecked(), false, 'Restore defaults left Directions unticked')
    assert.equal(await box('cornerCircle').isChecked(), false, 'Restore defaults left the corner Circle unticked')
    await closeExtrasEditorWith(p, 'Save')
    assert.deepEqual(await saved(), custom)
    await reload()
    assert.deepEqual(await saved(), custom)
    await openExtrasEditor(p)
    for (const mark of MARK_BOXES) await box(mark).check()
    await closeExtrasEditorWith(p, 'Save')
  })

  describe('opacity', { concurrency: false }, () => {
    const slider = () => p.locator('#pen-tool-extras-opacity')
    const setOpacity = (value) => setSlider(p, '#pen-tool-extras-opacity', value)
    const savedOpacity = () => read((k) => Framework.getData(k), OPACITY_KEY)
    // The pen value (`pen-<value>` class) and the opacity each drawn mark shows at, without repeats.
    const opacities = async () => {
      const shown = await effectiveOpacities(p, '#cell-pen .cell-pen')
      const values = await read(() => [...document.querySelectorAll('#cell-pen .cell-pen')].map((e) => [...e.classList].find((c) => c.startsWith('pen-')).slice(4)))
      return [...new Set(values.map((v, i) => `${v}:${shown[i]}`))].sort()
    }
    const drawAll = async () => {
      // Marks outlive a reload, and the edge and corner clicks cycle from what is there.
      await clearMarks()
      const [x, y] = await cellCentre(p, 6, 1)
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.move(x + 70, y + 5, { steps: 8 })
      await p.mouse.up()
      await clickCellCentre(...CELL_MARK)
      await clickCellCentre(...CELL_MARK)
      await clickCellCentre(...CELL_CIRCLE)
      await clickEdge(3, 3, 'right')
      await clickCorner(3, 3)
      assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), ['3']), ['3'])
      assert.deepEqual(await settle(() => penValuesAt(p, 2, 2), ['u']), ['u'])
      assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_MARK), ['6']), ['6'])
      assert.deepEqual(await settle(() => penValuesAt(p, ...CELL_CIRCLE), ['5']), ['5'])
    }
    const CELL_CIRCLE = [1, 1]
    // The pen values SudokuPad draws a free line's segments with (docs/research/sudokupad-pen-edge-marks.md).
    const LINE_VALUES = ['1', '2', 'a', 'd', 'e', 'f', 'g', '7', '8', '9']
    const grid = () => p.locator('#svgrenderer').screenshot()
    const sameAt = (opacity) => async () => {
      const seen = await opacities()
      return seen.length > 0 && seen.every((x) => x.endsWith(':' + opacity))
    }

    before(async () => {
      await read((k) => Framework.removeData(k), OPACITY_KEY)
      await reload()
      await restartPuzzle(p)
      await drawAll()
    })
    after(async () => { await read((k) => Framework.removeData(k), OPACITY_KEY) })

    it('with nothing saved a line, a cell circle and cross, an edge mark and a corner mark are at SudokuPad\'s 0.8, and the slider runs 20 to 100 in steps of 5 at 80', async () => {
      const seen = await opacities()
      assert.equal(seen.some((x) => x.startsWith('3:')), true, 'the edge X')
      assert.equal(seen.some((x) => x.startsWith('u:')), true, 'the corner X')
      assert.equal(seen.some((x) => x.startsWith('6:')), true, 'the cell cross')
      assert.equal(seen.some((x) => x.startsWith('5:')), true, 'the cell circle')
      assert.equal(seen.some((x) => LINE_VALUES.includes(x.split(':')[0])), true, `a free line: ${seen}`)
      assert.equal(await sameAt('0.8')(), true, seen.join(' '))
      await openPenTool(p)
      assert.deepEqual(await slider().evaluate((el) => [el.min, el.max, el.step, el.value]), ['20', '100', '5', '80'])
    })

    it('at the default the grid matches SudokuPad\'s own per-stroke opacity to within a few levels per channel, where marks do not overlap', async () => {
      // The white outline (on by default) is a filter on the layer, which fading the layer as one picture and fading each stroke do not agree on; it is left out of both pictures.
      // Drops every line of the script's style that matches `drop` and returns the style's length before and after.
      const dropLines = (drop) => read((source) => {
        const style = document.getElementById('pen-tool-extras-style')
        const before = style.textContent.length
        style.textContent = style.textContent.split('\n').filter((line) => !new RegExp(source).test(line)).join('\n')
        return [before, style.textContent.length]
      }, drop.source)
      const [filterBefore, filterAfter] = await dropLines(/filter: url/)
      assert.equal(filterAfter < filterBefore, true, `the outline filter line was in the style: ${filterBefore} then ${filterAfter}`)
      const withRule = await grid()
      const [ruleBefore, ruleAfter] = await dropLines(/^:root:root (\.cell-pen|#cell-pen)[ ,].*\{ opacity/)
      assert.equal(ruleAfter < ruleBefore, true, `the opacity rule was in the style: ${ruleBefore} then ${ruleAfter}`)
      assert.equal(await sameAt('0.8')(), true, 'SudokuPad\'s own rule gives 0.8 alone')
      const without = await grid()
      // Fading the layer as one picture and fading each stroke differ only in rounding where nothing overlaps.
      const largest = await read(async ([a, b]) => {
        const pixels = async (base64) => {
          const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob())
          const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')
          context.drawImage(bitmap, 0, 0)
          return context.getImageData(0, 0, bitmap.width, bitmap.height).data
        }
        const [x, y] = [await pixels(a), await pixels(b)]
        return x.length === y.length ? x.reduce((max, v, i) => Math.max(max, Math.abs(v - y[i])), 0) : Infinity
      }, [withRule.toString('base64'), without.toString('base64')])
      assert.equal(largest <= 4, true, `largest channel difference ${largest}`)
      await reload()
      await drawAll()
    })

    it('moving the slider changes every mark\'s opacity live and saves it at once, leaving the saved colors alone', async () => {
      const colors = await read((k) => Framework.getData(k), COLORS_KEY)
      await setOpacity(40)
      assert.equal(await settle(sameAt('0.4'), true), true, (await opacities()).join(' '))
      assert.equal(await savedOpacity(), 40)
      assert.deepEqual(await read((k) => Framework.getData(k), COLORS_KEY), colors)
    })

    it('undo, redo and replay leave the opacity alone, and a reload keeps it', async () => {
      await setOpacity(30)
      assert.equal(await savedOpacity(), 30)
      assert.equal(await settle(sameAt('0.3'), true), true)
      const before = await read(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => v[0])).sort())
      await p.click('#control-undo')
      await p.click('#control-redo')
      assert.deepEqual(await read(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => v[0])).sort()), before)
      assert.equal(await settle(sameAt('0.3'), true), true, 'after undo and redo')
      const replay = await read(() => Framework.app.getReplay())
      assert.equal(await read((r) => Replay.decode(r).actions.some((a) => /opacity/i.test(a)), replay), false, 'the replay holds no opacity')
      await clearMarks()
      await read((r) => Framework.app.loadReplay(r), replay)
      assert.deepEqual(await settle(() => penValuesAt(p, 3, 3), ['3']), ['3'])
      assert.equal(await settle(sameAt('0.3'), true), true, 'after loading the replay')
      await reload()
      assert.equal(await settle(sameAt('0.3'), true), true, 'after a reload')
    })

    it('Restore defaults sets the dialog\'s opacity slider to 80 for Save: Cancel afterwards leaves the saved opacity and the marks, Save clears it and draws at 0.8', async () => {
      assert.equal(await savedOpacity(), 30)
      await openExtrasEditor(p)
      assert.equal(await editor().locator('input[type=range]').count(), 5)
      await dialogButton(p, 'Restore defaults').click()
      assert.equal(await editor().locator('input[data-setting="opacity"]').inputValue(), '80')
      assert.equal(await savedOpacity(), 30, 'nothing is saved before Save')
      assert.equal(await settle(sameAt('0.3'), true), true)
      await closeExtrasEditorWith(p, 'Cancel')
      assert.equal(await savedOpacity(), 30)
      assert.equal(await settle(sameAt('0.3'), true), true)
      await openExtrasEditor(p)
      await dialogButton(p, 'Restore defaults').click()
      await closeExtrasEditorWith(p, 'Save')
      assert.equal(await savedOpacity(), null)
      assert.equal(await settle(() => slider().inputValue(), '80'), '80')
      assert.equal(await settle(sameAt('0.8'), true), true)
    })

    it('corrupt saved opacity falls back to 0.8 with no thrown error', async () => {
      const errorsBefore = errors.length
      for (const bad of ['{not json', '"40"', '99', '0', '37', '[40]', 'null', '105']) {
        await plantUnchecked(p, OPACITY_KEY, bad)
        await reload()
        await drawAll()
        assert.equal(await settle(sameAt('0.8'), true), true, bad)
        await openPenTool(p)
        assert.equal(await slider().inputValue(), '80', bad)
        await clearMarks()
      }
      assert.deepEqual(errors.slice(errorsBefore), [])
    })
  })

  // SudokuPad runs a dialog button's handler on the press and removes the dialog, so the release
  // lands on the grid and counts as a click on the cell under the button (stock SudokuPad does
  // this too: docs/research/sudokupad-pen-edge-marks.md). Each check first clicks the grid at the
  // button's point with no dialog open and requires a mark, so a point that makes no mark cannot
  // pass for a fix.
  describe('a release over the grid after a press on a dialog button', () => {
    const anyMark = () => read(() => Framework.app.puzzle.cells.some((cell) => cell.pen.length))
    const pointOf = async (locator) => {
      const b = await locator.boundingBox()
      return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]
    }
    // The button's point once it has held for the shared quiet window: a dialog may still be sliding or
    // scrolling, and on a loaded box two readings a poll apart can agree while the layout is stalled.
    const centreOf = (locator) => stable(() => pointOf(locator))
    const closeNow = async () => {
      await read(() => Framework.closeDialog())
      await p.locator('.dialog').waitFor({ state: 'detached' })
    }
    // Runs `open` to show the button, clicks the grid at the button's point with the dialog gone
    // to see the point makes a mark, then runs `open` again and returns the button's point.
    const probedPoint = async (open, button) => {
      await open()
      // opening may itself click over the grid, so the count starts after it
      await clearMarks()
      const [x, y] = await centreOf(button())
      await closeNow()
      await p.mouse.click(x, y)
      assert.equal(await anyMark(), true, 'a click on the grid at the button\'s point makes a mark')
      await clearMarks()
      await open()
      await clearMarks()
      assert.deepEqual(await centreOf(button()), [x, y])
      return [x, y]
    }

    // The dialog is centred in the window, which at this size leaves its buttons off the board; a narrow window or a zoomed page puts them over it,
    // so the dialog is moved to put the button on the board's centre.
    const openOverBoard = async (text) => {
      await openExtrasEditor(p)
      const [x, y] = await centreOf(dialogButton(p, text))
      const board = await p.locator('.boardsvg').boundingBox()
      await p.locator('.dialog').evaluate((el, [dx, dy]) => { el.style.marginLeft = `${dx}px`; el.style.marginTop = `${dy}px` }, [board.x + board.width / 2 - x, board.y + board.height / 2 - y])
    }

    for (const text of ['Save', 'Cancel']) {
      it(`${text} leaves no pen mark under the button`, async () => {
        const [x, y] = await probedPoint(() => openOverBoard(text), () => dialogButton(p, text))
        await p.mouse.click(x, y)
        await editor().waitFor({ state: 'detached' })
        assert.equal(await anyMark(), false)
      })
    }

    it('the settings entry leaves no pen mark under it', async () => {
      const open = async () => {
        await openSettings(p)
        await settingsEntry().evaluate((e) => e.scrollIntoView({ block: 'center' }))
      }
      const [x, y] = await probedPoint(open, settingsEntry)
      await p.mouse.click(x, y)
      await editor().waitFor({ state: 'visible' })
      assert.equal(await anyMark(), false)
      await closeExtrasEditorWith(p, 'Cancel')
    })
  })

  // SudokuPad closes a dialog on a press on its overlay, which covers the page, so the grid never saw
  // the press and the release marks the cell of the pointer's last position on the grid.
  describe('a release over the grid after a press on a dialog overlay', () => {
    const markedCells = () => read(() => Framework.app.puzzle.cells.filter((cell) => cell.pen.length).map((cell) => [cell.row, cell.col]))
    // Each test starts with no dialog open: an earlier test's dialog would take the press.
    beforeEach(async () => {
      await read(() => { if (document.querySelector('.dialog')) Framework.closeDialog() })
      await p.locator('.dialog').waitFor({ state: 'detached' })
    })
    // The pointer rests on the cell at [8, 6], so it is the cell a release with no press would mark.
    const restPointer = async () => {
      const [x, y] = await cellCentre(p, 8, 6)
      await p.mouse.move(x, y)
    }
    // A real click at (x, y), which must be on the overlay and not on the dialog's own content: a
    // dialog can be tall enough to cover the grid's corner, and a press on it closes nothing.
    const pressOverlay = async ([x, y]) => {
      const box = await p.locator('.dialog').boundingBox()
      assert.equal(x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height, true, `(${x}, ${y}) is inside the dialog`)
      await p.mouse.click(x, y)
    }
    // A grid corner cell the open dialog does not cover: the dialog is centred over the board and can be tall enough to cover a corner.
    const corner = async () => {
      const box = await p.locator('.dialog').boundingBox()
      for (const [row, col] of [[0, 0], [0, 8], [8, 8], [8, 0]]) {
        const [x, y] = await cellCentre(p, row, col)
        if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) return [x, y]
      }
      throw new Error('the dialog covers every corner of the grid')
    }
    // The viewport's top left, which no dialog reaches.
    const OFF_DIALOG = [2, 2]
    // Counts every mouseup that reaches the page's bubble phase, after the script's capture listener.
    const countReleases = () => read(() => {
      window.__releases = 0
      if (!window.__countReleases) {
        window.__countReleases = () => { window.__releases++ }
        window.addEventListener('mouseup', window.__countReleases)
      }
    })
    const releases = () => read(() => window.__releases)

    it('a press over the grid on this script\'s dialog closes it and leaves no pen mark', async () => {
      await openExtrasEditor(p)
      await clearMarks()
      await restPointer()
      await pressOverlay(await corner())
      await editor().waitFor({ state: 'detached' })
      assert.deepEqual(await markedCells(), [])
    })

    it('a click on the grid after that press still makes a mark', async () => {
      await openExtrasEditor(p)
      await clearMarks()
      const point = await corner()
      await pressOverlay(point)
      await editor().waitFor({ state: 'detached' })
      await p.mouse.click(...point)
      assert.equal((await settle(async () => (await markedCells()).length > 0, true)), true)
      await clearMarks()
    })

    // The stock settings dialog closes on a press on its overlay, but makes no mark from the release
    // here, so the check is that the release still reaches the page.
    it('a press on a stock dialog\'s overlay leaves its release to the page', async () => {
      await openSettings(p)
      await countReleases()
      await pressOverlay(OFF_DIALOG)
      await p.locator('.dialog').waitFor({ state: 'detached' })
      assert.equal(await releases(), 1)
    })

    it('the release of a press on this script\'s dialog does not reach the page', async () => {
      await openExtrasEditor(p)
      await countReleases()
      await pressOverlay(OFF_DIALOG)
      await editor().waitFor({ state: 'detached' })
      assert.equal(await releases(), 0)
    })
  })

  it('no uncaught page errors', () => {
    assert.deepEqual(errors, [])
  })
})

describe('without the script', { concurrency: false }, () => {
  it('a replay holding these values loads with no page error, and the values draw nothing', async () => {
    // First page: the script, to record a replay with every kind of added mark.
    const { context, p: withScript } = await openPage(browser)
    try {
      await startPuzzle(withScript, { injection: { mode: 'before-start', code: script } })
      const replay = await withScript.evaluate(() => {
        const { app } = Framework
        const cell = app.puzzle.cells.find((c) => c.row === 3 && c.col === 3)
        for (const arg of ['h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y']) {
          app.act({ type: 'select', arg: [cell] })
          app.act({ type: 'pen', arg })
          app.act({ type: 'deselect' })
        }
        return app.getReplay()
      })
      await withScript.close()

      // Second page: no script. Load the replay.
      const { p: bare, errors } = await newPage(context)
      await gotoPuzzle(bare)
      await startPuzzle(bare)
      await bare.evaluate((r) => Framework.app.loadReplay(r), replay)
      await bare.waitForFunction(() => Framework.app.puzzle.cells.find((c) => c.row === 3 && c.col === 3).pen.length === 18, null, { timeout: 15000 })
      const pen = await bare.evaluate(() => {
        const cell = Framework.app.puzzle.cells.find((c) => c.row === 3 && c.col === 3)
        cell.renderContent(true)
        return { held: cell.pen.map((v) => v[0]).join(''), drawn: document.querySelectorAll('#cell-pen .cell-pen').length }
      })
      assert.equal(pen.held, 'hijklmnopqrstuvwxy')
      // the unknown values draw as paths with no data, so nothing is visible
      assert.equal(await bare.evaluate(() => [...document.querySelectorAll('#cell-pen .cell-pen')].filter((e) => e.getAttribute('d')).length), 0)
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })
})

describe('with a SudokuPad internal missing', { concurrency: false }, () => {
  // Each is read by the corner click or its hit test; with one gone the click wrap would throw on every pen click, so the script skips the marks step and warns once.
  const TURNED_OFF = /^pen-tool-extras: .*marks.* skipped because SudokuPad /
  const REMOVALS = {
    'ToolPen.tool.actStart': () => { ToolPen.tool.actStart = undefined },
    'ToolPen.tool.getInputRc': () => { ToolPen.tool.getInputRc = undefined },
    'Framework.app.grid.getCell': () => { Framework.app.grid.getCell = undefined },
    'Framework.app.grid.rows': () => { Framework.app.grid.rows = undefined },
    'Framework.app.grid.cols': () => { Framework.app.grid.cols = undefined }
  }
  for (const [member, remove] of Object.entries(REMOVALS)) {
    it(`${member} gone: one warning that marks are skipped`, async () => {
      const warnings = []
      const { context, p } = await openPage(browser, {
        expectedSkips: [TURNED_OFF],
        seed: (page) => page.on('console', (m) => { if (m.type() === 'warning' && TURNED_OFF.test(m.text())) warnings.push(m.text()) })
      })
      try {
        await startPuzzle(p)
        await p.evaluate(`(${remove})()`)
        await p.addScriptTag({ content: script })
        await settle(async () => warnings.length, 1)
        assert.equal(warnings.length, 1, JSON.stringify(warnings))
      } finally {
        await context.close()
      }
    })
  }

  it('warns once, skips marks, and the pen tool still works', async () => {
    const warnings = []
    const { context, p, errors } = await openPage(browser, {
      expectedSkips: [TURNED_OFF],
      seed: (page) => page.on('console', (m) => { if (m.type() === 'warning' && TURNED_OFF.test(m.text())) warnings.push(m.text()) })
    })
    try {
      await startPuzzle(p)
      // `_actList` is the field the click wrap reads; SudokuPad's own `actStart` recreates it
      // on the first click, so the pen tool still works.
      await p.evaluate(() => { ToolPen.tool._actList = undefined })
      await p.addScriptTag({ content: script })
      await p.evaluate(() => Framework.setSetting('toolpen', true))
      await p.locator('#control-pen').waitFor({ state: 'visible' })
      await settle(async () => warnings.length, 1)
      assert.equal(warnings.length, 1)
      await openPenTool(p)
      const pen = () => p.evaluate(() => Framework.app.puzzle.cells.find((c) => c.row === 3 && c.col === 3).pen.map((v) => v[0]))
      const [x, y] = await p.evaluate(() => {
        const e = Framework.app.puzzle.cells.find((c) => c.row === 3 && c.col === 3).elem.getBoundingClientRect()
        return [e.x + e.width - 2, e.y + e.height / 2]
      })
      await p.mouse.click(x, y)
      assert.deepEqual(await settle(pen, ['3']), ['3'])
      await p.mouse.click(x, y)
      assert.deepEqual(await settle(pen, []), [])
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })
})
