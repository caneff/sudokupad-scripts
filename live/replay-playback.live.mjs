// Live check that SudokuPad's replay tool plays a solve back with every script installed, on sudokupad.app in headless
// Chromium. How the tool is turned on, its button, its key and how it plays: docs/research/sudokupad-replay-tool.md.
// A real Tampermonkey install and crackingthecryptic.com stay untested.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { MODE_STORAGE_KEY, savedProfiles, SEED } from './color-by-digit-fixtures.mjs'
import { DIGIT_BUTTON, DRAW_BUTTON, strokePaths, TEXT_BOX, TOOL_KEYS, texts as drawTexts } from './draw-tool-fixtures.mjs'
import { openPage, startPuzzle } from './page.mjs'
import { cellCentre, gridPoint, mouseDrag, openPenTool, padValues, penStrings } from './pen.mjs'
import { clickUntil, settle, SETTLE_MS } from './settle.mjs'

const ROOT = new URL('../', import.meta.url)
const SCRIPT_FILES = readdirSync(ROOT).filter((f) => f.endsWith('.user.js')).sort()
const sources = (files) => files.map((f) => readFileSync(new URL(f, ROOT), 'utf8'))

const REPLAY_BUTTON = '#control-replay'
const PLAY_BUTTON = '.controls-input button[data-key="2"]'
const START_BUTTON = '.controls-input button[data-key="1"]'
const PAGE_BUTTON = '.pen-tool-extras-page'
const PAGE_ONE = '123456789'
const PAGE_TWO = 'abcdefghi'
const PAGE_THREE = 'jlnprtvxz'

const PLAYBACK_MS = 60000

let browser
let solved
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

// A page with `files` injected after Start Puzzle, Color by Digit saved in Cell mode, and the pen and replay tools on.
async function openSolver (files) {
  const entries = Object.entries({ ...savedProfiles(SEED), [MODE_STORAGE_KEY]: 'cell' }).map(([k, v]) => [k, JSON.stringify(v)])
  const opened = await openPage(browser, {
    seed: (page) => page.addInitScript((list) => list.forEach(([k, v]) => window.localStorage.setItem(k, v)), entries)
  })
  await startPuzzle(opened.p)
  for (const content of sources(files)) await opened.p.addScriptTag({ content })
  await opened.p.evaluate(() => { Framework.setSetting('toolpen', true); Framework.setSetting('toolreplay', true) })
  await opened.p.locator('#control-pen').waitFor({ state: 'visible' })
  await opened.p.locator(REPLAY_BUTTON).waitFor({ state: 'visible' })
  return opened
}

const tool = (p) => p.evaluate(() => Framework.app.tool)

describe('the replay tool plays a solve back with every script installed', { concurrency: false }, () => {
  let context, p, errors
  const read = (fn, arg) => p.evaluate(fn, arg)

  const clickCell = async (row, col) => {
    const [x, y] = await cellCentre(p, row, col)
    await p.mouse.click(x, y)
  }
  const useTool = async (id) => {
    await p.click(id)
    await settle(() => tool(p), id.replace('#control-', ''))
  }
  const goToPage = async (values) => {
    for (let i = 0; i < 3 && (await padValues(p)) !== values; i++) {
      await p.locator(PAGE_BUTTON).click()
      await settle(() => padValues(p), values, 500)
    }
    assert.equal(await settle(() => padValues(p), values), values)
  }
  const dragLine = async (points) => {
    const before = (await penStrings(p)).length
    await mouseDrag(p, points)
    assert.equal(await settle(async () => (await penStrings(p)).length > before, true), true, 'a pen line appeared')
  }

  // The board as a solver sees it: every cell's digit, marks, colors (as Color by Digit and the color tool set them), the
  // pen elements as drawn, and the Draw drawing.
  const board = async () => ({
    cells: await read(() => Framework.app.puzzle.cells.map((c) => [c.row, c.col, c.propGet('normal'), c.propGet('corner'), c.propGet('centre'), [...(c.colours || [])]])),
    pen: await penStrings(p),
    penDrawn: await read(() => [...document.querySelectorAll('#cell-pen .cell-pen')].map((e) => e.outerHTML)),
    draw: { strokes: await strokePaths(p), texts: await drawTexts(p) }
  })

  before(async () => { ;({ context, p, errors } = await openSolver(SCRIPT_FILES)) })
  after(async () => { await context.close() })

  it('setup: a short solve of digits, marks, colors, pen lines and Draw drawing', async () => {
    // digits, which Color by Digit colors in Cell mode
    await useTool('#control-normal')
    for (const [r, c, d] of [[0, 2, '4'], [0, 3, '6'], [1, 1, '7']]) {
      await clickCell(r, c)
      await p.keyboard.press(d)
    }
    await useTool('#control-corner')
    await clickCell(2, 0)
    await p.keyboard.press('1'); await p.keyboard.press('2')
    await useTool('#control-centre')
    await clickCell(2, 3)
    await p.keyboard.press('3'); await p.keyboard.press('5')
    await useTool('#control-colour')
    await clickCell(4, 4)
    await p.keyboard.press('3')
    // pen: a solid line, a dashed one (page 2), an arrow line (page 3) and an edge mark
    await openPenTool(p)
    await goToPage(PAGE_ONE)
    await dragLine([[4.5, 1.5], [4.5, 3.5]])
    await goToPage(PAGE_TWO)
    await dragLine([[6.5, 1.5], [6.5, 3.5]])
    await goToPage(PAGE_THREE)
    await dragLine([[8.5, 1.5], [8.5, 3.5]])
    await goToPage(PAGE_ONE)
    const [x, y] = await cellCentre(p, 1, 6)
    const half = (await cellCentre(p, 1, 6))[2] / 2
    const before = (await penStrings(p)).length
    await p.mouse.click(x + half - 2, y)
    assert.equal(await settle(async () => (await penStrings(p)).length > before, true), true, 'an edge mark appeared')
    // Draw: a line and a text
    await useTool(DRAW_BUTTON)
    await mouseDrag(p, [[2.5, 6.5], [3.2, 7.5], [2.4, 8.5]])
    assert.equal(await settle(async () => (await strokePaths(p)).length, 1), 1)
    await p.mouse.click(...await gridPoint(p, [6.2, 6.25]))
    await p.locator(TEXT_BOX).waitFor({ state: 'attached' })
    await p.keyboard.type('15')
    await p.keyboard.press('Enter')
    assert.deepEqual(await settle(() => drawTexts(p), ['15']), ['15'])
    await useTool(DIGIT_BUTTON)
    solved = await board()
  })

  it('the solve holds what the test compares: digits, marks, colors, seven pen entries and one Draw line and text', () => {
    const cell = (r, c) => solved.cells.find((x) => x[0] === r && x[1] === c)
    assert.deepEqual([cell(0, 2)[2], cell(0, 3)[2], cell(1, 1)[2]], ['4', '6', '7'])
    assert.deepEqual(cell(2, 0)[3], ['1', '2'])
    assert.deepEqual(cell(2, 3)[4], ['3', '5'])
    assert.deepEqual(cell(4, 4)[5], ['3'])
    // Color by Digit in Cell mode colors the givens and the entered digits
    assert.deepEqual(cell(0, 2)[5], ['2'])
    // a solid line over two cells, a dashed one, an arrow line, and an X on a cell's right edge
    assert.deepEqual([...solved.pen].sort(), ['11', '11', '1a', '1a', '1j', '1j', '31'])
    assert.equal(solved.penDrawn.length, 7)
    assert.equal(solved.draw.strokes.length, 1)
    assert.deepEqual(solved.draw.texts, ['15'])
  })

  it('the replay button opens the tool, and its Start button rewinds the board to the givens', async () => {
    await clickUntil(() => p.click(REPLAY_BUTTON), () => tool(p), 'replay', SETTLE_MS)
    await p.click(START_BUTTON)
    const rewound = await settle(async () => (await board()).cells.find((x) => x[0] === 0 && x[1] === 2)[2] ?? '', '')
    assert.equal(rewound, '', 'the digit entered at r1c3 is gone while the tool shows the start of the replay')
  })

  it('Play runs to the end, and the board then equals the board before: digits, marks, colors, pen lines, and the Draw drawing', async () => {
    await p.click(PLAY_BUTTON)
    await p.locator('body.replay-playing').waitFor({ state: 'attached' })
    await p.locator('body.replay-paused').waitFor({ state: 'attached', timeout: PLAYBACK_MS })
    const after = await settle(board, solved)
    assert.deepEqual(after.cells.map((c) => c.slice(0, 5)), solved.cells.map((c) => c.slice(0, 5)), 'digits and marks')
    assert.deepEqual(after.pen, solved.pen, 'pen entries')
    assert.deepEqual(after.penDrawn, solved.penDrawn, 'pen lines as drawn')
    assert.deepEqual(after.cells.map((c) => c[5]), solved.cells.map((c) => c[5]), 'cell colors: playback adds no Color by Digit coloring beyond what the replay holds')
    assert.deepEqual(after.draw, solved.draw, 'the Draw drawing is not part of the replay, and playback leaves it')
  })

  it('no page error', () => { assert.deepEqual(errors, []) })
})

describe('the replay tool\'s button and key with Draw installed', { concurrency: false }, () => {
  let withDraw, without
  const keyTool = async (p, key) => {
    await p.click(DIGIT_BUTTON)
    await settle(() => tool(p), 'normal')
    await p.keyboard.press(key)
    return settle(() => tool(p), 'normal', 700)
  }

  before(async () => {
    withDraw = await openSolver(SCRIPT_FILES)
    without = await openSolver(SCRIPT_FILES.filter((f) => f !== 'draw-tool.user.js'))
  })
  after(async () => {
    await withDraw?.context.close()
    await without?.context.close()
  })

  it('the key that selects the replay tool is the same with Draw as without it, and no key selects Draw', async () => {
    const names = (page) => page.evaluate(() => Framework.app.getToolNames())
    const replayAt = (await names(without.p)).indexOf('replay')
    assert.notEqual(replayAt, -1, 'the replay tool is installed')
    assert.equal(replayAt < TOOL_KEYS.length, true, 'it has a key')
    assert.equal((await names(withDraw.p)).includes('draw'), true, 'Draw is installed')
    assert.equal(await keyTool(without.p, TOOL_KEYS[replayAt]), 'replay')
    assert.equal(await keyTool(withDraw.p, TOOL_KEYS[replayAt]), 'replay')
    const reached = []
    for (const key of TOOL_KEYS) reached.push(await keyTool(withDraw.p, key))
    assert.equal(reached.includes('draw'), false, `the keys reach ${reached.join()}`)
  })

  it('the replay button selects the tool with Draw installed, and Draw\'s button still selects Draw', async () => {
    const { p } = withDraw
    await p.click(DIGIT_BUTTON)
    assert.equal(await clickUntil(() => p.click(REPLAY_BUTTON), () => tool(p), 'replay', SETTLE_MS), 'replay')
    assert.equal(await clickUntil(() => p.click(DRAW_BUTTON), () => tool(p), 'draw', SETTLE_MS), 'draw')
  })

  it('no page error', () => {
    assert.deepEqual(withDraw.errors, [])
    assert.deepEqual(without.errors, [])
  })
})
