// Live check of pen-tool-extras.user.js's edge marks on sudokupad.app, in headless Chromium.
// Run with `npm run test:live`. It needs the network and a Playwright Chromium, so
// it is not part of `npm test`.
//
// The script is injected into the page, not installed through Tampermonkey, so
// Tampermonkey's real injection time and crackingthecryptic.com stay untested, and so
// does replay playback on a puzzle page. Each injection time runs the same checks:
//   document-idle: at DOMContentLoaded, as `@run-at document-idle` approximates it
//   before-start:  after the page loads, before Start Puzzle
//   after-start:   after Start Puzzle, when the controls already exist
// Every click is a real mouse click on the page at an edge's pixel position.
/* global Replay, Framework, ToolPen, MouseEvent */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { headerVersion, openSettings } from './settings.mjs'

const url = readFileSync(new URL('./puzzle-url.txt', import.meta.url), 'utf8').trim()
const script = readFileSync(new URL('../pen-tool-extras.user.js', import.meta.url), 'utf8')

const DATA_KEY = 'EdgeMarks_marks'
const { SOLVER_REACH } = createRequire(import.meta.url)('../dark-page.user.js')
const { CORNER_RADIUS } = createRequire(import.meta.url)('../pen-tool-extras.user.js')
const MARK_BOXES = ['x', 'directions', 'dot', 'cornerX', 'cornerDot']
const ALL_TICKED = Object.fromEntries(MARK_BOXES.map((mark) => [mark, true]))
const POLL_MS = 50
const SETTLE_MS = 10000
const SIZE = 9
// The cell the cell-mark checks click.
const CELL_MARK = [5, 5]
// Pen color 4 with nothing saved: the default first cell color page's color 4, darkened.
const PEN_4 = 'rgb(113, 159, 23)'

// Each edge a click can reach: the cell a click lands in, the side of it, and the cell and
// pen values that store it. The cycle on an edge is its X, two directions, a circle, then empty.
const EDGES = {
  'interior right (4,4)|(4,5)': { row: 3, col: 3, side: 'right', stored: [3, 3], cycle: ['3', 'h', 'i', 'j', null] },
  'interior bottom (4,4)|(5,4)': { row: 3, col: 3, side: 'bottom', stored: [3, 3], cycle: ['4', 'k', 'l', 'm', null] },
  'outer left of column 1': { row: 3, col: 0, side: 'left', stored: [3, 0], cycle: ['b', 'n', 'o', 'p', null] },
  'outer top of row 1': { row: 0, col: 3, side: 'top', stored: [0, 3], cycle: ['c', 'q', 'r', 's', null] },
  'outer right of the last column': { row: 3, col: SIZE - 1, side: 'right', stored: [3, SIZE - 1], cycle: ['3', 'h', 'i', 'j', null] },
  'outer bottom of the last row': { row: SIZE - 1, col: 3, side: 'bottom', stored: [SIZE - 1, 3], cycle: ['4', 'k', 'l', 'm', null] }
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Reads until it equals `expected` (compared as JSON) or `timeoutMs` passes, and
// returns the last reading, so the caller's assert.deepEqual names what it got.
async function settle (read, expected, timeoutMs = SETTLE_MS) {
  const want = JSON.stringify(expected)
  const deadline = Date.now() + timeoutMs
  let value = await read()
  while (JSON.stringify(value) !== want && Date.now() < deadline) {
    await sleep(POLL_MS)
    value = await read()
  }
  return value
}

const START = /Start Puzzle|Continue|Resume/i

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

async function newPage (context, errors) {
  const p = await context.newPage()
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.route(/cookiebot|googletagmanager|plausible/, (r) => r.abort())
  return p
}

const waitForFramework = (p) => p.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })

// Clicks Start Puzzle; `beforeStart` runs while the button is still showing.
async function startPuzzle (p, beforeStart) {
  await waitForFramework(p)
  const start = p.getByRole('button', { name: START }).first()
  await start.waitFor({ state: 'visible' })
  if (beforeStart) await beforeStart()
  await start.click()
  await start.waitFor({ state: 'hidden' })
  await p.locator('#control-undo').waitFor({ state: 'visible' })
}

// The page point at the centre of the cell at [row, col].
const cellCentre = (p, row, col) => p.evaluate(([r, c]) => {
  const e = Framework.app.puzzle.cells.find((v) => v.row === r && v.col === c).elem.getBoundingClientRect()
  return [e.x + e.width / 2, e.y + e.height / 2]
}, [row, col])

for (const mode of ['document-idle', 'before-start', 'after-start']) {
  describe(`injected ${mode}`, { concurrency: false }, () => {
    let context, p, errors
    const read = (fn, arg) => p.evaluate(fn, arg)
    const saved = () => read((k) => Framework.getData(k), DATA_KEY)
    const dialogButton = (text) => p.locator('.dialog button').filter({ hasText: new RegExp('^\\s*' + text + '\\s*$') }).first()
    const editor = () => p.locator('#pen-tool-extras-editor')

    // The pen values on the cell at [row, col], without their colors.
    const penValues = (row, col) => read(([r, c]) => Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).pen.map((v) => v[0]).sort(), [row, col])
    const penCount = () => read(() => document.querySelectorAll('.cell-pen').length)

    // The pen button toggles the tool, and SudokuPad binds its handler a moment after the
    // button appears, so it is clicked again until the tool's buttons show.
    const selectPen = async () => {
      const shown = () => p.locator('.tool-pen button[data-key="1"]').isVisible()
      const deadline = Date.now() + SETTLE_MS
      while (!(await shown()) && Date.now() < deadline) {
        await p.click('#control-pen')
        await settle(shown, true, 500)
      }
    }

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
    // The page point of the grid corner [row, col] (0 to SIZE), moved by (dx, dy) cells.
    const cornerPoint = (row, col, dx = 0, dy = 0) => read(([r, c, ox, oy]) => {
      const { rows, cols } = Framework.app.grid
      const e = Framework.app.puzzle.cells.find((x) => x.row === Math.min(r, rows - 1) && x.col === Math.min(c, cols - 1)).elem.getBoundingClientRect()
      return [e.x + (c >= cols ? e.width : 0) + ox * e.width, e.y + (r >= rows ? e.height : 0) + oy * e.height]
    }, [row, col, dx, dy])
    const clickCorner = async (row, col, button = 'left', dx = 0, dy = 0) => {
      const [x, y] = await cornerPoint(row, col, dx, dy)
      await p.mouse.click(x, y, { button })
    }
    const clickEdge = async (row, col, side, button = 'left') => {
      const [x, y] = await edgePoint(row, col, side)
      await p.mouse.click(x, y, { button })
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
      await p.mouse.click(x, y)
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

    const openEditor = async () => {
      await openSettings(p)
      await p.locator('.dialog button, .dialog [role=button]').filter({ hasText: 'Pen tool extras' }).first().click()
      await editor().waitFor({ state: 'visible' })
    }
    const closeWith = async (text) => {
      await dialogButton(text).click()
      await editor().waitFor({ state: 'detached' })
    }
    const box = (mark) => editor().locator(`input[data-mark="${mark}"]`)

    const boot = async () => {
      await startPuzzle(p, async () => {
        if (mode === 'before-start') await p.addScriptTag({ content: script })
      })
      if (mode === 'after-start') await p.addScriptTag({ content: script })
      // The pen tool is off until its own setting turns it on.
      await read(() => Framework.setSetting('toolpen', true))
      await p.locator('#control-pen').waitFor({ state: 'visible' })
      await p.locator('style#pen-tool-extras-style').waitFor({ state: 'attached' })
      await selectPen()
      await watchMenus()
    }
    const reload = async () => { await p.reload({ waitUntil: 'load' }); await boot() }

    before(async () => {
      context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
      errors = []
      p = await newPage(context, errors)
      if (mode === 'document-idle') {
        await p.addInitScript((src) => {
          document.addEventListener('DOMContentLoaded', () => {
            const s = document.createElement('script')
            s.textContent = src
            document.documentElement.appendChild(s)
          })
        }, script)
      }
      await p.goto(url, { waitUntil: 'load', timeout: 60000 })
      await boot()
    })
    after(async () => { await context.close() })

    for (const [name, edge] of Object.entries(EDGES)) {
      it(`${name}: clicks cycle X, direction, other direction, circle, empty, and draw each`, async () => {
        const [sr, sc] = edge.stored
        for (const value of [...edge.cycle, edge.cycle[0]]) {
          await clickEdge(edge.row, edge.col, edge.side)
          assert.deepEqual(await settle(() => penValues(sr, sc), value === null ? [] : [value]), value === null ? [] : [value], `${name} after a click`)
          // every drawn mark has a path with data: a mark with no `d` shows nothing
          const drawn = await read(() => [...document.querySelectorAll('.cell-pen')].map((e) => e.getAttribute('d')))
          assert.deepEqual(drawn.filter((d) => !d), [], 'a mark was drawn with no path data')
          assert.equal(drawn.length, value === null ? 0 : 1)
        }
        await clearMarks()
      })
    }

    for (const [name, edge] of Object.entries(EDGES)) {
      it(`${name}: right clicks cycle the other way, circle, other direction, direction, X, empty, and one undo reverses each`, async () => {
        const [sr, sc] = edge.stored
        const backwards = [...edge.cycle.slice(0, -1).reverse(), null]
        const want = (value) => value === null ? [] : [value]
        for (const value of backwards) {
          await clickEdge(edge.row, edge.col, edge.side, 'right')
          assert.deepEqual(await settle(() => penValues(sr, sc), want(value)), want(value), `${name} after a right click`)
          const drawn = await read(() => [...document.querySelectorAll('.cell-pen')].map((e) => e.getAttribute('d')))
          assert.deepEqual(drawn.filter((d) => !d), [], 'a mark was drawn with no path data')
          assert.equal(drawn.length, value === null ? 0 : 1)
        }
        // each undo restores the step before it
        for (const value of [...backwards.slice(0, -1).reverse(), null]) {
          await p.click('#control-undo')
          assert.deepEqual(await settle(() => penValues(sr, sc), want(value)), want(value), `${name} after an undo`)
        }
        await clearMarks()
      })
    }

    it('a left click after a right click goes forward again, and a right click after it comes back', async () => {
      await clickEdge(3, 3, 'right', 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), ['j']), ['j'])
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), []), [])
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), ['3']), ['3'])
      await clickEdge(3, 3, 'right', 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), []), [])
      await clearMarks()
    })

    it('a right click on an edge keeps the browser menu closed, and one off the grid, in a cell middle or with another tool does not', async () => {
      const before = (await menuLog()).length
      await clickEdge(3, 3, 'right', 'right')
      await clickEdge(0, 3, 'top', 'right')
      assert.deepEqual((await settle(async () => (await menuLog()).slice(before), [true, true])), [true, true], 'edge right clicks')
      // a right click in a cell middle stays as SudokuPad has it: a cell mark, and the menu opens
      const [cx, cy] = await cellCentre(p, ...CELL_MARK)
      await p.mouse.click(cx, cy, { button: 'right' })
      assert.deepEqual(await settle(() => penValues(...CELL_MARK), ['5']), ['5'], 'a right click in a cell middle makes the cell mark')
      // a right click off the grid
      await p.mouse.click(5, 5, { button: 'right' })
      assert.deepEqual((await settle(async () => (await menuLog()).slice(before), [true, true, false, false])), [true, true, false, false], 'cell middle, then off the grid')
      // the pointer last pressed on an edge, but the menu is asked for by something outside the grid
      await clickEdge(3, 3, 'right', 'right')
      const outside = await read(() => {
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
        document.body.dispatchEvent(event)
        return event.defaultPrevented
      })
      assert.equal(outside, false, 'a menu asked for outside the grid')
      await clearMarks()
      // another tool: turn the pen tool off, then right click the same edge point
      await p.click('#control-normal')
      assert.equal(await settle(() => read(() => Framework.app.tool), 'normal'), 'normal')
      await clickEdge(3, 3, 'right', 'right')
      assert.deepEqual((await settle(async () => (await menuLog()).slice(before), [true, true, false, false, true, false, false])), [true, true, false, false, true, false, false], 'other tool')
      await selectPen()
      await clearMarks()
    })

    it('the other side of an interior edge reaches the same mark', async () => {
      await clickEdge(3, 4, 'left')
      assert.deepEqual(await settle(() => penValues(3, 3), ['3']), ['3'])
      assert.deepEqual(await penValues(3, 4), [])
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), ['h']), ['h'])
      await clearMarks()
    })

    for (const [name, { corner, stored, cycle }] of Object.entries(CORNERS)) {
      const [sr, sc] = stored
      const want = (value) => value === null ? [] : [value]
      it(`${name}: clicks cycle X, circle, empty, and draw each, centred on the corner`, async () => {
        const [cx, cy] = await cornerPoint(...corner)
        for (const value of [...cycle, cycle[0]]) {
          await clickCorner(...corner)
          assert.deepEqual(await settle(() => penValues(sr, sc), want(value)), want(value), `${name} after a click`)
          const drawn = await read(() => [...document.querySelectorAll('.cell-pen')].map((e) => e.getAttribute('d')))
          assert.deepEqual(drawn.filter((d) => !d), [], 'a mark was drawn with no path data')
          assert.equal(drawn.length, value === null ? 0 : 1)
          if (value !== null) {
            const centre = await read(() => { const r = document.querySelector('.cell-pen').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })
            assert.equal(Math.abs(centre[0] - cx) < 1 && Math.abs(centre[1] - cy) < 1, true, `mark centre ${centre} is not the corner ${[cx, cy]}`)
          }
        }
        await clearMarks()
      })

      it(`${name}: right clicks cycle the other way, circle, X, empty, and one undo reverses each`, async () => {
        const backwards = [...cycle.slice(0, -1).reverse(), null]
        for (const value of backwards) {
          await clickCorner(...corner, 'right')
          assert.deepEqual(await settle(() => penValues(sr, sc), want(value)), want(value), `${name} after a right click`)
        }
        for (const value of [...backwards.slice(0, -1).reverse(), null]) {
          await p.click('#control-undo')
          assert.deepEqual(await settle(() => penValues(sr, sc), want(value)), want(value), `${name} after an undo`)
        }
        await clearMarks()
      })
    }

    it('an inner corner is one mark, whichever of the four cells around it the click lands in', async () => {
      await clickCorner(3, 3, 'left', 0.1, 0.1)
      assert.deepEqual(await settle(() => penValues(2, 2), ['u']), ['u'])
      await clickCorner(3, 3, 'left', -0.1, 0.1)
      assert.deepEqual(await settle(() => penValues(2, 2), ['x']), ['x'])
      await clickCorner(3, 3, 'left', 0.1, -0.1)
      assert.deepEqual(await settle(() => penValues(2, 2), []), [])
      await clickCorner(3, 3, 'left', -0.1, -0.1)
      assert.deepEqual(await settle(() => penValues(2, 2), ['u']), ['u'])
      for (const [r, c] of [[2, 3], [3, 2], [3, 3]]) assert.deepEqual(await penValues(r, c), [])
      await clearMarks()
    })

    it('a corner mark, an edge mark and a cell mark can sit on one cell, each cycling alone', async () => {
      await clickCorner(3, 3)
      await clickEdge(2, 2, 'right')
      await clickCellCentre(2, 2)
      assert.deepEqual(await settle(() => penValues(2, 2), ['3', '5', 'u']), ['3', '5', 'u'])
      await clickCorner(3, 3)
      assert.deepEqual(await settle(() => penValues(2, 2), ['3', '5', 'x']), ['3', '5', 'x'])
      await clearMarks()
    })

    it(`the corner zone is ${CORNER_RADIUS} of a cell: just inside is a corner mark, just outside along an edge is the edge mark`, async () => {
      // 0.17 of a cell up the side from the corner is inside; 0.23 is in the edge zone
      await clickCorner(3, 4, 'left', -0.02, -0.17)
      assert.deepEqual(await settle(() => penValues(2, 3), ['u']), ['u'], 'inside the zone')
      await clickCorner(3, 4, 'left', -0.02, -0.23)
      assert.deepEqual(await settle(() => penValues(2, 3), ['3', 'u']), ['3', 'u'], 'outside the zone: the edge mark')
      await clearMarks()
    })

    it('a right click on a corner keeps the browser menu closed', async () => {
      const before = (await menuLog()).length
      await clickCorner(3, 3, 'right')
      await clickCorner(0, 0, 'right')
      assert.deepEqual(await settle(async () => (await menuLog()).slice(before), [true, true]), [true, true])
      await clearMarks()
    })

    it('a right click inside the corner zone where SudokuPad sees neither an edge nor a cell keeps the browser menu closed', async () => {
      // The pointer is read in whole pixels, so the point is found by moving the mouse along the diagonal
      // from corner (3,3) and applying SudokuPad's own arithmetic (tool-pen.js `clickCell`) to what the page
      // reads: a point inside the 0.2 zone that is neither an edge click nor a cell click.
      let found = null
      for (let offset = 0.12; offset < 0.16 && found === null; offset += 0.002) {
        const [x, y] = await cornerPoint(3, 3, offset, offset)
        await p.mouse.move(x, y)
        const point = await read(() => {
          const { r, c } = ToolPen.tool.getInputRc()
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
      const before = (await menuLog()).length
      await p.mouse.click(found[0], found[1], { button: 'right' })
      assert.deepEqual(await settle(async () => (await menuLog()).slice(before), [true]), [true])
      assert.deepEqual(await settle(() => penValues(2, 2), ['x']), ['x'], 'the corner mark, stepped backwards from empty')
      await clearMarks()
    })

    it('a corner mark survives a replay: it is in getReplay(), and loading that replay draws it again', async () => {
      await clickCorner(3, 3)
      await clickCorner(0, SIZE)
      await clickCorner(0, SIZE)
      const replay = await read(() => Framework.app.getReplay())
      const actions = await read((r) => Replay.decode(r).actions, replay)
      assert.equal(actions.includes('pe:u/0'), true, JSON.stringify(actions))
      assert.equal(actions.includes('pe:v/0') && actions.includes('pe:y/0'), true, `the far corner X, then the circle: ${JSON.stringify(actions)}`)
      await clearMarks()
      assert.deepEqual(await penValues(2, 2), [])
      await read((r) => Framework.app.loadReplay(r), replay)
      assert.deepEqual(await settle(() => penValues(2, 2), ['u']), ['u'])
      assert.deepEqual(await settle(() => penValues(0, SIZE - 1), ['y']), ['y'])
      const drawn = await read(() => [...document.querySelectorAll('.cell-pen.pen-u, .cell-pen.pen-y')].map((e) => e.getAttribute('d')))
      assert.deepEqual(drawn.filter((d) => !d), [])
      assert.equal(new Set(drawn).size, 2, 'the X on the inner corner and the circle on the far corner')
      await clearMarks()
    })

    it('a corner mark survives a reload of the page', async () => {
      await clickCorner(3, 3)
      await clickCorner(SIZE, SIZE)
      assert.deepEqual(await settle(() => penValues(8, 8), ['u']), ['u'])
      await reload()
      assert.deepEqual(await settle(() => penValues(2, 2), ['u']), ['u'])
      assert.deepEqual(await settle(() => penValues(8, 8), ['u']), ['u'])
      const drawn = await read(() => [...document.querySelectorAll('.cell-pen')].map((e) => e.getAttribute('d')))
      assert.deepEqual(drawn.filter((d) => !d), [])
      assert.equal(drawn.length, 2)
      await clearMarks()
    })

    it('an X on any outer corner, stroke included, reaches no farther past the cells than Dark Page keeps (SOLVER_REACH), at the default thickness', async () => {
      for (const corner of [[0, 0], [0, SIZE], [SIZE, 0], [SIZE, SIZE]]) {
        await clickCorner(...corner)
        const reach = () => read(() => {
          const mark = document.querySelector('.cell-pen')
          if (!mark) return null
          const m = mark.getBoundingClientRect()
          const cells = [...document.querySelectorAll('.cells .cell')].map((e) => e.getBoundingClientRect())
          const left = Math.min(...cells.map((r) => r.left))
          const top = Math.min(...cells.map((r) => r.top))
          const right = Math.max(...cells.map((r) => r.right))
          const bottom = Math.max(...cells.map((r) => r.bottom))
          // the box leaves the stroke out: half its width, in page pixels, lies beyond it
          const half = parseFloat(window.getComputedStyle(mark).strokeWidth) / 2 * document.querySelector('#svgrenderer').getScreenCTM().a
          return Math.max(left - m.left, top - m.top, m.right - right, m.bottom - bottom) + half
        })
        await settle(async () => (await reach()) !== null, true)
        const past = await reach()
        assert.equal(typeof past, 'number', `a mark on corner ${corner}`)
        assert.equal(past <= SOLVER_REACH, true, `corner ${corner} reaches ${past}px past the cells, more than ${SOLVER_REACH}`)
        await clearMarks()
      }
    })

    it('one undo reverses one click and redo restores it', async () => {
      await clickEdge(3, 3, 'right')
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), ['h']), ['h'])
      await p.click('#control-undo')
      assert.deepEqual(await settle(() => penValues(3, 3), ['3']), ['3'])
      await p.click('#control-redo')
      assert.deepEqual(await settle(() => penValues(3, 3), ['h']), ['h'])
      await p.click('#control-undo')
      await p.click('#control-undo')
      assert.deepEqual(await settle(() => penValues(3, 3), []), [])
      await clearMarks()
    })

    it('a mark takes the selected pen color and keeps it through undo and redo', async () => {
      await pickColor(4)
      await clickEdge(3, 3, 'right')
      await clickEdge(3, 3, 'right')
      const stroke = () => read(() => [...document.querySelectorAll('.cell-pen.pen-h')].map((e) => ({ cls: e.getAttribute('class'), stroke: window.getComputedStyle(e).stroke })))
      assert.deepEqual(await settle(stroke, [{ cls: 'cell-pen pen-h pencolor-4', stroke: PEN_4 }]), [{ cls: 'cell-pen pen-h pencolor-4', stroke: PEN_4 }])
      await p.click('#control-undo')
      await p.click('#control-redo')
      assert.deepEqual(await settle(stroke, [{ cls: 'cell-pen pen-h pencolor-4', stroke: PEN_4 }]), [{ cls: 'cell-pen pen-h pencolor-4', stroke: PEN_4 }])
      await clearMarks()
      await pickColor(1)
    })

    it('the edge circle (stored under the dot value) is an open ring with a round stroke at half the pen width, and no fill', async () => {
      for (let i = 0; i < 4; i++) await clickEdge(3, 3, 'right')
      const ring = () => read(() => {
        const e = document.querySelector('.cell-pen.pen-j')
        if (!e) return null
        const s = window.getComputedStyle(e)
        return { cap: s.strokeLinecap, width: s.strokeWidth, fill: s.fill, d: e.getAttribute('d').replace(/^M[\d. ]+ /, '') }
      })
      const want = { cap: 'round', width: '2.5px', fill: 'none', d: 'm -6.64,0 a 6.64,6.64 0 1,0 13.28,0 a 6.64,6.64 0 1,0 -13.28,0' }
      assert.deepEqual(await settle(ring, want), want)
      await clearMarks()
    })

    it('the dialog shows a small picture beside each edge and corner mark box, and each circle is labelled Circle', async () => {
      await openEditor()
      const rows = editor().locator('div:has(> input[data-mark])')
      assert.equal(await rows.count(), 5)
      for (const mark of MARK_BOXES) {
        assert.equal(await editor().locator(`div:has(> input[data-mark="${mark}"]) > svg`).count(), 1, mark)
      }
      assert.equal((await editor().locator('label[for="pen-tool-extras-mark-dot"]').textContent()).trim(), 'Circle')
      assert.equal((await editor().locator('label[for="pen-tool-extras-mark-cornerDot"]').textContent()).trim(), 'Circle')
      assert.match(await editor().textContent(), /Corner marks a click near a grid corner cycles through/)
      await closeWith('Cancel')
    })

    it('cell marks and drawn lines still work', async () => {
      await clickCellCentre(...CELL_MARK)
      assert.deepEqual(await settle(() => penValues(...CELL_MARK), ['5']), ['5'])
      await clickCellCentre(...CELL_MARK)
      assert.deepEqual(await settle(() => penValues(...CELL_MARK), ['6']), ['6'])
      await clickCellCentre(...CELL_MARK)
      assert.deepEqual(await settle(() => penValues(...CELL_MARK), []), [])
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
      assert.equal((await settle(async () => (await actions()).includes('pe:h/0'), true)), true)
      assert.equal((await actions()).includes('pe:3/0'), true)
      await clearMarks()
    })

    it('The dialog has five mark boxes (three for edges, two for corners), all ticked on a fresh install', async () => {
      assert.equal(await saved(), null)
      await openEditor()
      for (const mark of MARK_BOXES) assert.equal(await box(mark).isChecked(), true, mark)
      await closeWith('Cancel')
    })

    it('Cancel saves nothing and changes nothing', async () => {
      await openEditor()
      await box('directions').uncheck()
      await closeWith('Cancel')
      assert.equal(await saved(), null)
      await clickEdge(3, 3, 'right')
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), ['h']), ['h'])
      await clearMarks()
    })

    it('unticking Directions skips both directions and the boxes survive a reload', async () => {
      await openEditor()
      await box('directions').uncheck()
      await closeWith('Save')
      assert.deepEqual(await saved(), { ...ALL_TICKED, directions: false })
      await reload()
      assert.deepEqual(await saved(), { ...ALL_TICKED, directions: false })
      await openEditor()
      assert.equal(await box('x').isChecked(), true)
      assert.equal(await box('directions').isChecked(), false)
      assert.equal(await box('dot').isChecked(), true)
      await closeWith('Cancel')
      for (const value of ['3', 'j', null]) {
        await clickEdge(3, 3, 'right')
        assert.deepEqual(await settle(() => penValues(3, 3), value === null ? [] : [value]), value === null ? [] : [value])
      }
    })

    it('a mark whose type is unticked stays until clicked, then moves on', async () => {
      await openEditor()
      await box('directions').check()
      await closeWith('Save')
      await clickEdge(3, 3, 'right')
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), ['h']), ['h'])
      await openEditor()
      await box('directions').uncheck()
      await closeWith('Save')
      assert.deepEqual(await penValues(3, 3), ['h'])
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), ['j']), ['j'])
      await clearMarks()
    })

    it('with both corner boxes unticked a click on a corner is the edge click it was before, and one box ticked cycles only that mark', async () => {
      await openEditor()
      await box('cornerX').uncheck()
      await box('cornerDot').uncheck()
      await closeWith('Save')
      // A click on a dialog button that lands over the grid can leave a pen mark under it, so the
      // cells are cleared before the click under test.
      await clearMarks()
      await clickCorner(3, 3, 'left', 0, 0.01)
      // by SudokuPad's own arithmetic a click on a corner comes out as an edge mark
      const held = await settle(async () => (await penValues(2, 2)).length, 1)
      assert.equal(held, 1)
      assert.equal(['3', '4'].includes((await penValues(2, 2))[0]), true, `got ${await penValues(2, 2)}`)
      await clearMarks()
      await openEditor()
      await box('cornerDot').check()
      await closeWith('Save')
      await clearMarks()
      await clickCorner(3, 3)
      assert.deepEqual(await settle(() => penValues(2, 2), ['x']), ['x'], 'only the circle is ticked')
      await clickCorner(3, 3)
      assert.deepEqual(await settle(() => penValues(2, 2), []), [])
      await openEditor()
      await box('cornerX').check()
      await closeWith('Save')
      await clearMarks()
    })

    it('with nothing ticked an edge click does nothing, and cell marks and existing marks are unaffected', async () => {
      await openEditor()
      await box('directions').check()
      await closeWith('Save')
      await clickEdge(3, 3, 'right')
      assert.deepEqual(await settle(() => penValues(3, 3), ['3']), ['3'])
      await openEditor()
      for (const mark of MARK_BOXES) await box(mark).uncheck()
      await closeWith('Save')
      const undoable = await read(() => Framework.app.puzzle.undoStack.length)
      await clickEdge(3, 3, 'right')
      await clickEdge(3, 3, 'bottom')
      // "nothing happened in 500 ms" check
      await sleep(500)
      assert.deepEqual(await penValues(3, 3), ['3'])
      assert.equal(await read(() => Framework.app.puzzle.undoStack.length), undoable)
      await clickCellCentre(...CELL_MARK)
      assert.deepEqual(await settle(() => penValues(...CELL_MARK), ['5']), ['5'])
      await openEditor()
      for (const mark of MARK_BOXES) await box(mark).check()
      await closeWith('Save')
      await clearMarks()
    })

    it('corrupt saved settings fall back to every mark ticked with no thrown error', async () => {
      const errorsBefore = errors.length
      for (const bad of ['{not json', '"red"', '[1,2]', '{"x":"no"}']) {
        await read(([k, raw]) => {
          const key = Object.keys(window.localStorage).find((n) => n.endsWith(k))
          if (!key) throw new Error('no stored key for ' + k)
          window.localStorage.setItem(key, raw)
        }, [DATA_KEY, bad])
        await reload()
        await clickEdge(3, 3, 'right')
        await clickEdge(3, 3, 'right')
        assert.deepEqual(await settle(() => penValues(3, 3), ['h']), ['h'], bad)
        await clearMarks()
        // the dialog shows the defaults too, so Save cannot store the corrupt value
        await openEditor()
        for (const mark of MARK_BOXES) assert.equal(await box(mark).isChecked(), true, `${bad}: ${mark}`)
        await closeWith('Cancel')
      }
      assert.deepEqual(errors.slice(errorsBefore), [])
    })

    it('the settings entry sits in the Experimental group under its plain name, and its dialog shows the version from the script header as small text', async () => {
      const group = await openSettings(p)
      const entry = group.locator('button').filter({ hasText: 'Pen tool extras' })
      assert.equal((await entry.textContent()).trim(), 'Pen tool extras')
      await entry.click()
      await editor().waitFor({ state: 'visible' })
      assert.equal((await p.locator('.dialog b').first().textContent()).trim(), 'Pen tool extras')
      assert.equal((await p.locator('.dialog small').textContent()).trim(), `v${headerVersion(script)}`)
      await closeWith('Cancel')
    })

    it('no uncaught page errors', () => {
      assert.deepEqual(errors, [])
    })
  })
}

describe('without the script', { concurrency: false }, () => {
  it('a replay holding these values loads with no page error, and the values draw nothing', async () => {
    // First page: the script, to record a replay with every kind of added mark.
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    const errors = []
    try {
      const withScript = await newPage(context, [])
      await withScript.goto(url, { waitUntil: 'load', timeout: 60000 })
      await withScript.waitForFunction(() => typeof Framework !== 'undefined' && Framework.app && Framework.app.puzzle && Framework.app.puzzle.cells && Framework.app.puzzle.cells.length, null, { timeout: 30000 })
      await withScript.addScriptTag({ content: script })
      await startPuzzle(withScript)
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
      const bare = await newPage(context, errors)
      await bare.goto(url, { waitUntil: 'load', timeout: 60000 })
      await startPuzzle(bare)
      await bare.evaluate((r) => Framework.app.loadReplay(r), replay)
      await bare.waitForFunction(() => Framework.app.puzzle.cells.find((c) => c.row === 3 && c.col === 3).pen.length === 18, null, { timeout: 15000 })
      const pen = await bare.evaluate(() => {
        const cell = Framework.app.puzzle.cells.find((c) => c.row === 3 && c.col === 3)
        cell.renderContent(true)
        return { held: cell.pen.map((v) => v[0]).join(''), drawn: document.querySelectorAll('.cell-pen').length }
      })
      assert.equal(pen.held, 'hijklmnopqrstuvwxy')
      // the unknown values draw as paths with no data, so nothing is visible
      assert.equal(await bare.evaluate(() => [...document.querySelectorAll('.cell-pen')].filter((e) => e.getAttribute('d')).length), 0)
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })
})

describe('with a SudokuPad internal missing', { concurrency: false }, () => {
  // Each is read by the corner click or its hit test; with one gone the wrap would throw on every pen click.
  const REMOVALS = {
    'ToolPen.tool.actStart': () => { ToolPen.tool.actStart = undefined },
    'ToolPen.tool.getInputRc': () => { ToolPen.tool.getInputRc = undefined },
    'Framework.app.grid.getCell': () => { Framework.app.grid.getCell = undefined },
    'Framework.app.grid.rows': () => { Framework.app.grid.rows = undefined },
    'Framework.app.grid.cols': () => { Framework.app.grid.cols = undefined }
  }
  for (const [member, remove] of Object.entries(REMOVALS)) {
    it(`${member} gone: one warning, and the click wrap is not installed`, async () => {
      const context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
      const warnings = []
      try {
        const p = await newPage(context, [])
        p.on('console', (m) => { if (m.type() === 'warning' && m.text().includes('pen-tool-extras')) warnings.push(m.text()) })
        await p.goto(url, { waitUntil: 'load', timeout: 60000 })
        await startPuzzle(p)
        await p.evaluate(`window.__clickCell = ToolPen.tool.clickCell; (${remove})()`)
        await p.addScriptTag({ content: script })
        await settle(async () => warnings.length, 1)
        assert.equal(warnings.length, 1, JSON.stringify(warnings))
        assert.equal(await p.evaluate(() => ToolPen.tool.clickCell === window.__clickCell), true, 'clickCell was wrapped')
      } finally {
        await context.close()
      }
    })
  }

  it('logs one warning, installs no edge marks, and the pen tool still works', async () => {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    const errors = []
    const warnings = []
    try {
      const p = await newPage(context, errors)
      p.on('console', (m) => { if (m.type() === 'warning' && m.text().includes('pen-tool-extras')) warnings.push(m.text()) })
      await p.goto(url, { waitUntil: 'load', timeout: 60000 })
      await startPuzzle(p)
      // `_actList` is the field the click wrap reads; SudokuPad's own `actStart` recreates it
      // on the first click, so the pen tool still works.
      await p.evaluate(() => { ToolPen.tool._actList = undefined })
      await p.addScriptTag({ content: script })
      await p.evaluate(() => Framework.setSetting('toolpen', true))
      await p.locator('#control-pen').waitFor({ state: 'visible' })
      await settle(async () => warnings.length, 1)
      assert.equal(warnings.length, 1)
      const shown = () => p.locator('.tool-pen button[data-key="1"]').isVisible()
      const deadline = Date.now() + SETTLE_MS
      while (!(await shown()) && Date.now() < deadline) {
        await p.click('#control-pen')
        await settle(shown, true, 500)
      }
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
