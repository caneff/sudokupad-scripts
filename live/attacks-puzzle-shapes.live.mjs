// Live attacks 67 and 68 on all six scripts together: puzzles that are not a plain 9x9, on sudokupad.app in headless Chromium. Each test names its attack and
// asserts the crash signals (no page error, no skip line) beside what a user expects to see. Clicks, drags and keys are real input; the scripts load at
// DOMContentLoaded of every page load, as Tampermonkey runs them. The puzzles are built here as data and opened by their id (`live/puzzles.mjs`).
// Text Anywhere's snap onto the ring of cells around the board is #603 and is not checked here.
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { openPage } from './page.mjs'
import { TEXTS } from './draw-tool/draw-tool-fixtures.mjs'
import { cellCentre, mouseDrag, openPenTool, penEntries } from './pen.mjs'
import { boardOf, CLASSIC_GIVENS, clickCell, installAll, openPuzzleId, placeNote, puzzleData, puzzleIdFor, seedOddEvenCells, useTool } from './puzzles.mjs'
import { readUntil, settle } from './settle.mjs'

// Long enough that the pane overflows at SudokuPad's own font in every shape here, so only Auto Rules Resizer makes it fit.
const RULES = 'Normal sudoku rules apply. ' + 'Digits in a region may not repeat, and neither may digits in a row or a column of the grid. '.repeat(6)
const NOTE_GUIDE_X = '#draw-tool-layer .draw-tool-snap-guide[data-axis="x"]'
const NOTE_OUTLINE = '#draw-tool-layer .draw-tool-selection'
// The selection outline's line is 2 px wide, 2 px outside the note's box: its middle is 3 px out.
const OUTLINE_MIDDLE_PX = 3
const NEAR_PX = 0.6
// Color by Digit's groups hold the digits 0 to 9 only, the keys SudokuPad's keypad has even on a 16x16, so the givens 12 and 16 are in no group.
// Odd digits take one Color by Digit color and even digits another (`seedOddEvenCells`).
const ODD = 1
const EVEN = 2

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

describe('attacks on puzzle shapes with every script installed', { concurrency: false }, () => {
  let context, p, errors

  beforeEach(async () => {
    ;({ context, p, errors } = await openPage(browser, { seed: async (page) => { await installAll(page); await seedOddEvenCells(page) } }))
  })
  afterEach(async () => {
    try {
      assert.deepEqual(errors, [], 'no page error or skip line')
    } finally {
      await context?.close()
    }
  })

  const open = async (data) => openPuzzleId(p, await puzzleIdFor(p, data))
  const gridSize = () => p.evaluate(() => [Framework.app.puzzle.rows, Framework.app.puzzle.cols])
  // The page x of the grid's column line `k`.
  const lineX = async (k) => {
    const [x0, , size] = await cellCentre(p, 0, 0)
    return x0 - size / 2 + k * size
  }
  // The board's box on the page: from the first cell's top left to the last cell's bottom right.
  const boardBox = () => p.evaluate(() => {
    const cells = Framework.app.puzzle.cells
    const [first, last] = [cells[0].elem.getBoundingClientRect(), cells[cells.length - 1].elem.getBoundingClientRect()]
    return { x: first.x, y: first.y, width: last.right - first.x, height: last.bottom - first.y }
  })

  // A pen line along the last row from its first cell to its last, an edge mark on the last cell's right edge, and the pen strokes on the board.
  const penMarks = async (rows, cols) => {
    const before = (await penEntries(p)).length
    await openPenTool(p)
    await p.locator('.tool-pen button[data-key="1"]').click()
    await mouseDrag(p, [[rows - 0.5, 0.5], [rows - 0.5, cols - 0.5]])
    assert.equal(await settle(async () => (await penEntries(p)).length > before, true), true, 'a pen line appeared')
    const [x, y, size] = await cellCentre(p, rows - 1, cols - 1)
    const count = (await penEntries(p)).length
    await p.mouse.click(x + size / 2 - 2, y)
    assert.equal(await settle(async () => (await penEntries(p)).length > count, true), true, 'an edge mark appeared on the last cell')
    const grid = await boardBox()
    const strokes = await p.evaluate(() => [...document.querySelectorAll('#cell-pen .cell-pen')].map((g) => { const r = g.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom } }))
    assert.equal(strokes.length > 0, true, 'pen strokes are drawn')
    for (const s of strokes) {
      assert.equal(s.x >= grid.x - 1 && s.y >= grid.y - 1 && s.right <= grid.x + grid.width + size && s.bottom <= grid.y + grid.height + size, true, `a pen stroke ${JSON.stringify(s)} lies on the board ${JSON.stringify(grid)}`)
    }
  }

  // A note '15' in the middle of the grid, dragged slowly until its outline is 2 px right of the last inner column line: the outline lies on the line with its guide.
  const snapsToLastColumnLine = async (rows, cols) => {
    await placeNote(p, '15', [Math.min(2.5, rows - 0.5), Math.max(0.5, cols - 2.5)])
    const note = await p.locator(TEXTS, { hasText: '15' }).boundingBox()
    const line = await lineX(cols - 1)
    const [px, py] = [note.x + note.width / 2, note.y + note.height / 2]
    await p.mouse.move(px, py)
    await p.mouse.down()
    await p.mouse.move(line + 2 - (note.x - OUTLINE_MIDDLE_PX) + px, py, { steps: 6 })
    await p.locator(NOTE_GUIDE_X).waitFor()
    const outline = (await p.locator(NOTE_OUTLINE).boundingBox()).x - OUTLINE_MIDDLE_PX
    const guide = await p.locator(NOTE_GUIDE_X).boundingBox()
    await p.mouse.up()
    assert.equal(Math.abs(outline - line) < NEAR_PX, true, `the outline's line ${outline} is on the column line ${line}`)
    assert.equal(Math.abs(guide.x + guide.width / 2 - line) < NEAR_PX, true, `the guide at ${guide.x} is on the column line ${line}`)
  }

  // Color by Digit's Odd/Even profile in Cell mode colors the givens: the cells of one group share a color and the groups differ.
  // Then a digit entered at `enter` takes the color of its digit's group.
  const colorsByDigit = async ({ odd, even, enter, digit }) => {
    const colorOf = ([row, col]) => p.evaluate(([r, c]) => Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).colours.join(), [row, col])
    const groups = []
    for (const group of [odd, even]) {
      const colors = await Promise.all(group.map(colorOf))
      assert.equal(new Set(colors).size, 1, `cells of one group share a color: ${colors}`)
      assert.notEqual(colors[0], '', 'the group has a color')
      groups.push(colors[0])
    }
    assert.notEqual(groups[ODD - 1], groups[EVEN - 1], 'the two groups have two colors')
    await useTool(p, '#control-normal')
    await clickCell(p, ...enter)
    await p.keyboard.press(digit)
    assert.equal(await settle(() => colorOf(enter), groups[ODD - 1]), groups[ODD - 1], 'an entered odd digit takes the odd color')
  }

  // The rules text fits its pane without being cut off.
  const rulesFit = async () => {
    const read = () => p.evaluate(() => { const e = document.querySelector('.puzzle-rules'); return { fits: e.scrollHeight <= e.clientHeight + 1, shown: e.textContent.includes('Normal sudoku rules apply') } })
    assert.deepEqual(await settle(read, { fits: true, shown: true }), { fits: true, shown: true }, 'the rules show and fit their pane')
  }

  const shape = (id, rows, cols, boxRows, boxCols, givens) => puzzleData({ id, rows, cols, boxRows, boxCols, givens, metadata: { title: id, rules: RULES } })
  const SHAPES = [
    ['4x4', shape('attack-4x4', 4, 4, 2, 2, [[0, 0, 1], [3, 3, 3], [2, 1, 2], [1, 2, 4]]), { odd: [[0, 0], [3, 3]], even: [[2, 1], [1, 2]], enter: [3, 0], digit: '1' }],
    ['16x16', shape('attack-16x16', 16, 16, 4, 4, [[0, 0, 1], [5, 5, 3], [2, 3, 2], [6, 6, 4], [9, 9, 12], [15, 15, 16]]), { odd: [[0, 0], [5, 5]], even: [[2, 3], [6, 6]], enter: [7, 7], digit: '1' }],
    ['rectangular 6 by 8', shape('attack-rect', 6, 8, 2, 4, [[0, 0, 1], [3, 5, 3], [1, 2, 2], [5, 7, 4]]), { odd: [[0, 0], [3, 5]], even: [[1, 2], [5, 7]], enter: [4, 1], digit: '1' }]
  ]
  const THE_SHAPES = 'pen marks, Text Anywhere snapping, Color by Digit groups and the rules fit'

  for (const [name, data, digits] of SHAPES) {
    it(`attack 67: a ${name} grid: ${THE_SHAPES}`, async () => {
      await open(data)
      const [rows, cols] = await gridSize()
      assert.deepEqual([rows, cols], [data.cells.length, data.cells[0].length])
      await penMarks(rows, cols)
      await snapsToLastColumnLine(rows, cols)
      await colorsByDigit(digits)
      await rulesFit()
    })
  }

  it(`attack 67: a puzzle with clues outside the grid: ${THE_SHAPES}`, async () => {
    const clue = (r, c, text) => ({ center: [r, c], width: 0.8, height: 0.8, text, fontSize: 16, color: '#000000' })
    await open(puzzleData({
      id: 'attack-outside',
      givens: CLASSIC_GIVENS,
      metadata: { title: 'outside clues', rules: RULES },
      overlays: [clue(-0.5, 0.5, '12'), clue(-0.5, 4.5, '3'), clue(4.5, -0.5, '7'), clue(4.5, 9.5, '8'), clue(9.5, 4.5, '21')]
    }))
    const view = await p.evaluate(() => document.querySelector('#svgrenderer').getAttribute('viewBox').split(' ').map(Number))
    assert.equal(view[0] < 0 && view[1] < 0, true, `the board's view reaches the clues outside the grid: ${view}`)
    await penMarks(9, 9)
    await snapsToLastColumnLine(9, 9)
    await colorsByDigit({ odd: [[0, 0], [0, 1], [1, 5]], even: [[1, 0], [4, 0], [4, 3]], enter: [0, 2], digit: '5' })
    await rulesFit()
  })

  describe('attack 68', () => {
    const FOG_LIT = [[0, 0], [0, 1], [1, 0], [1, 1]]
    const openFog = () => open(puzzleData({ id: 'attack-fog', givens: CLASSIC_GIVENS, foglight: FOG_LIT, metadata: { title: 'fog', rules: RULES } }))
    const fogged = () => p.evaluate(() => Framework.app.puzzle.cells.filter((c) => c.given).map((c) => ({ row: c.row, col: c.col, hidden: c.hideclue === true, colours: (c.colours || []).length })))

    it('attack 68: a fog-of-war puzzle: only the lit cells show their clues, and pen marks, a note, a digit and a color work in the fog', async () => {
      await openFog()
      const givens = await fogged()
      assert.equal(givens.some((g) => g.hidden), true, 'the fog hides some givens')
      const shownOutsideLight = givens.filter((g) => !g.hidden && !FOG_LIT.some(([r, c]) => r === g.row && c === g.col))
      assert.deepEqual(shownOutsideLight, [], 'only lit cells show their clues')
      await penMarks(9, 9)
      await placeNote(p, '15')
      await useTool(p, '#control-normal')
      await clickCell(p, 0, 2)
      await p.keyboard.press('4')
      await useTool(p, '#control-colour')
      await clickCell(p, 4, 4)
      await p.keyboard.press('3')
      const board = await readUntil(() => boardOf(p), (b) => b.notes.length === 1 && b.entered.length === 1 && b.colours.some((c) => c.startsWith('4,4:')))
      assert.deepEqual([board.notes, board.entered], [['15'], ['0,2:4']])
    })

    it('attack 68: a fog-of-war puzzle: no script colors a clue the fog hides', { todo: '#633' }, async () => {
      await openFog()
      const givens = await fogged()
      assert.equal(givens.some((g) => g.hidden), true, 'the fog hides some givens')
      // A fogged given's color would show which cells share a digit group.
      const colored = givens.filter((g) => g.hidden && g.colours > 0).map((g) => [g.row, g.col])
      assert.deepEqual(colored, [], 'no hidden given has a color')
    })

    it('attack 68: a puzzle with a background image: the image stays under the board while every script draws and notes', async () => {
      const image = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="90"><rect width="90" height="90" fill="#88c"/></svg>').toString('base64')
      await open(puzzleData({ id: 'attack-bg', givens: CLASSIC_GIVENS, metadata: { title: 'background', rules: RULES, bgimage: image, bgimageopacity: '0.5' } }))
      // The image's box on the page against the board's: it must reach every edge of the board, whatever size the board is drawn at.
      const underBoard = async () => {
        const [images, board] = [await p.evaluate(() => [...document.querySelectorAll('#svgrenderer image')].map((i) => { const r = i.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom } })), await boardBox()]
        return { count: images.length, covers: images.length === 1 && images[0].x <= board.x + 1 && images[0].y <= board.y + 1 && images[0].right >= board.x + board.width - 1 && images[0].bottom >= board.y + board.height - 1 }
      }
      assert.deepEqual(await readUntil(underBoard, (r) => r.count === 1), { count: 1, covers: true }, 'the image is under the board')
      await penMarks(9, 9)
      await placeNote(p, '15')
      await useTool(p, '#control-normal')
      await clickCell(p, 0, 2)
      await p.keyboard.press('4')
      const board = await readUntil(() => boardOf(p), (b) => b.notes.length === 1 && b.entered.length === 1)
      assert.deepEqual(board.notes, ['15'])
      assert.deepEqual(await underBoard(), { count: 1, covers: true }, 'the image is still under the board')
    })
  })
})
