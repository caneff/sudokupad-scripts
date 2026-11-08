// Live attacks 67 and 68 on all six scripts together: puzzles that are not a plain 9x9, on sudokupad.app in headless Chromium. Each test names its attack and
// asserts the crash signals (no page error, no skip line) beside what a user expects to see. Clicks, drags and keys are real input; the scripts load at
// DOMContentLoaded of every page load, as Tampermonkey runs them. The puzzles are built here as data and opened by their id (`live/puzzles.mjs`).
// Text Anywhere's snap onto the ring of cells around the board is #603 and is not checked here.
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { openPage } from './page.mjs'
import { DRAW_BUTTON, TEXT_BOX, tool } from './draw-tool/draw-tool-fixtures.mjs'
import { cellCentre, gridPoint, mouseDrag, openPenTool, penEntries } from './pen.mjs'
import { boardOf, CLASSIC_GIVENS, installAll, openPuzzleId, puzzleData, puzzleIdFor, seedOddEvenCells } from './puzzles.mjs'
import { clickUntil, readUntil, settle, SETTLE_MS } from './settle.mjs'

const RULES = 'Normal sudoku rules apply. ' + 'Digits in a region may not repeat, and neither may digits in a row or a column of the grid. '.repeat(3)
const NOTE_GUIDE_X = '#draw-tool-layer .draw-tool-snap-guide[data-axis="x"]'
const NOTE_OUTLINE = '#draw-tool-layer .draw-tool-selection'
const NOTE_TEXTS = '#draw-tool-layer .draw-tool-text:not(.draw-tool-textbox)'
// The selection outline's line is 2 px wide, 2 px outside the note's box: its middle is 3 px out.
const OUTLINE_MIDDLE_PX = 3
const NEAR_PX = 0.6

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

  const open = async (data) => {
    const id = await puzzleIdFor(p, data)
    await openPuzzleId(p, id)
  }
  const useTool = async (button) => {
    const name = button.replace('#control-', '')
    assert.equal(await clickUntil(() => p.click(button), () => tool(p), name, SETTLE_MS), name)
  }
  const clickCell = async (row, col) => { const [x, y] = await cellCentre(p, row, col); await p.mouse.click(x, y) }
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

  // A pen line along the last row from its first cell to its last, an edge mark on the last cell's right edge, and the pen entries inside the board.
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
    await useTool(DRAW_BUTTON)
    await p.mouse.click(...await gridPoint(p, [Math.min(2.5, rows - 0.5), Math.max(0.5, cols - 2.5)]))
    await p.locator(TEXT_BOX).waitFor({ state: 'attached' })
    await p.keyboard.type('15')
    await p.keyboard.press('Escape')
    await p.locator(NOTE_TEXTS, { hasText: '15' }).waitFor()
    const note = await p.locator(NOTE_TEXTS, { hasText: '15' }).boundingBox()
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

  // Color by Digit's Odd/Even profile in Cell mode colors the givens: digits in one group share a color and a digit in the other does not. Then an entered digit takes its digit's color.
  const colorsByDigit = async (digitCells) => {
    const colorOf = ([row, col]) => p.evaluate(([r, c]) => Framework.app.puzzle.cells.find((x) => x.row === r && x.col === c).colours.join(), [row, col])
    const same = await Promise.all(digitCells.same.map(colorOf))
    assert.equal(new Set(same).size, 1, `cells with one digit share a color: ${same}`)
    assert.notEqual(same[0], '', 'the digit has a color')
    assert.notEqual(await colorOf(digitCells.other), same[0], 'another digit has another color')
    await useTool('#control-normal')
    await clickCell(...digitCells.enter)
    await p.keyboard.press(digitCells.digit)
    assert.equal(await settle(() => colorOf(digitCells.enter), same[0]), same[0], 'an entered digit takes its digit\'s color')
  }

  // The rules text fits its pane without being cut off.
  const rulesFit = async () => {
    const read = () => p.evaluate(() => { const e = document.querySelector('.puzzle-rules'); return { fits: e.scrollHeight <= e.clientHeight + 1, shown: e.textContent.includes('Normal sudoku rules apply') } })
    const rules = await readUntil(read, (r) => r.shown)
    assert.equal(rules.fits, true, 'the rules fit their pane')
  }

  const SHAPES = [
    ['4x4', puzzleData({ id: 'attack-4x4', rows: 4, cols: 4, boxRows: 2, boxCols: 2, givens: [[0, 0, 1], [1, 2, 1], [2, 1, 2], [3, 3, 3]], metadata: { title: '4x4', rules: RULES } }), { same: [[0, 0], [1, 2]], other: [2, 1], enter: [3, 0], digit: '1' }],
    ['16x16', puzzleData({ id: 'attack-16x16', rows: 16, cols: 16, boxRows: 4, boxCols: 4, givens: [[0, 0, 1], [5, 5, 1], [2, 3, 2], [9, 9, 12], [15, 15, 16]], metadata: { title: '16x16', rules: RULES } }), { same: [[0, 0], [5, 5]], other: [2, 3], enter: [7, 7], digit: '1' }],
    ['rectangular 6 by 8', puzzleData({ id: 'attack-rect', rows: 6, cols: 8, boxRows: 2, boxCols: 4, givens: [[0, 0, 1], [3, 5, 1], [1, 2, 2], [5, 7, 3]], metadata: { title: 'rect', rules: RULES } }), { same: [[0, 0], [3, 5]], other: [1, 2], enter: [4, 1], digit: '1' }]
  ]

  for (const [name, data, digits] of SHAPES) {
    it(`attack 67: a ${name} grid: pen marks, Text Anywhere snapping, Color by Digit groups and the rules fit`, async () => {
      await open(data)
      const [rows, cols] = await gridSize()
      assert.deepEqual([rows, cols], [data.cells.length, data.cells[0].length])
      await penMarks(rows, cols)
      await snapsToLastColumnLine(rows, cols)
      await colorsByDigit(digits)
      await rulesFit()
    })
  }

  it('attack 67: a puzzle with clues outside the grid: pen marks, Text Anywhere snapping, Color by Digit groups and the rules fit', async () => {
    const clue = (r, c, text) => ({ center: [r, c], width: 0.8, height: 0.8, text, fontSize: 16, color: '#000000' })
    const data = puzzleData({
      id: 'attack-outside',
      givens: CLASSIC_GIVENS,
      metadata: { title: 'outside clues', rules: RULES },
      overlays: [clue(-0.5, 0.5, '12'), clue(-0.5, 4.5, '3'), clue(4.5, -0.5, '7'), clue(4.5, 9.5, '8'), clue(9.5, 4.5, '21')]
    })
    await open(data)
    const view = await p.evaluate(() => document.querySelector('#svgrenderer').getAttribute('viewBox').split(' ').map(Number))
    assert.equal(view[0] < 0 && view[1] < 0, true, `the board's view reaches the clues outside the grid: ${view}`)
    await penMarks(9, 9)
    await snapsToLastColumnLine(9, 9)
    await colorsByDigit({ same: [[0, 0], [1, 5]], other: [1, 0], enter: [0, 2], digit: '5' })
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
      assert.deepEqual(givens.filter((g) => !g.hidden).every((g) => FOG_LIT.some(([r, c]) => r === g.row && c === g.col)), true, 'only lit cells show their clues')
      await penMarks(9, 9)
      await useTool(DRAW_BUTTON)
      await p.mouse.click(...await gridPoint(p, [8.2, 2.25]))
      await p.locator(TEXT_BOX).waitFor({ state: 'attached' })
      await p.keyboard.type('15')
      await p.keyboard.press('Escape')
      await useTool('#control-normal')
      await clickCell(0, 2)
      await p.keyboard.press('4')
      await useTool('#control-colour')
      await clickCell(4, 4)
      await p.keyboard.press('3')
      const board = await readUntil(() => boardOf(p), (b) => b.notes.length === 1 && b.entered.length === 1 && b.colours.some((c) => c.startsWith('4,4:')))
      assert.deepEqual([board.notes, board.entered], [['15'], ['0,2:4']])
    })

    it('attack 68: a fog-of-war puzzle: no script colors a clue the fog hides', { todo: '#633' }, async () => {
      await openFog()
      // A fogged given's color would show which cells share a digit group.
      const colored = (await fogged()).filter((g) => g.hidden && g.colours > 0).map((g) => [g.row, g.col])
      assert.deepEqual(colored, [], 'no hidden given has a color')
    })

    it('attack 68: a puzzle with a background image: the image stays under the board while every script draws, colors and notes', async () => {
      const image = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="90"><rect width="90" height="90" fill="#88c"/></svg>').toString('base64')
      await open(puzzleData({ id: 'attack-bg', givens: CLASSIC_GIVENS, metadata: { title: 'background', rules: RULES, bgimage: image, bgimageopacity: '0.5' } }))
      // The image's box on the page against the board's: it must reach every edge of the board, whatever size the board is drawn at.
      const underBoard = async () => {
        const [images, board] = [await p.evaluate(() => [...document.querySelectorAll('#svgrenderer image')].map((i) => { const r = i.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom } })), await boardBox()]
        return { count: images.length, covers: images.length === 1 && images[0].x <= board.x + 1 && images[0].y <= board.y + 1 && images[0].right >= board.x + board.width - 1 && images[0].bottom >= board.y + board.height - 1 }
      }
      assert.deepEqual(await readUntil(underBoard, (r) => r.count === 1), { count: 1, covers: true }, 'the image is under the board')
      await penMarks(9, 9)
      await useTool(DRAW_BUTTON)
      await p.mouse.click(...await gridPoint(p, [8.2, 2.25]))
      await p.locator(TEXT_BOX).waitFor({ state: 'attached' })
      await p.keyboard.type('15')
      await p.keyboard.press('Escape')
      await useTool('#control-normal')
      await clickCell(0, 2)
      await p.keyboard.press('4')
      const board = await readUntil(() => boardOf(p), (b) => b.notes.length === 1 && b.entered.length === 1)
      assert.deepEqual(board.notes, ['15'])
      assert.deepEqual(await underBoard(), { count: 1, covers: true }, 'the image is still under the board')
    })
  })
})
