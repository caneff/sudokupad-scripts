// Live check that SudokuPad's replay tool plays a solve back with every script installed, on sudokupad.app in headless
// Chromium. How the tool is turned on, its button, its key and how it plays: docs/research/sudokupad-replay-tool.md.
// Replay under a real Tampermonkey install and on crackingthecryptic.com stays untested.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buttonIds, DIGIT_BUTTON, pickTextAnywhere, TOOL_KEYS, texts as noteTexts, tool } from './text-anywhere/text-anywhere-fixtures.mjs'
import { seedOddEvenCells } from './color-by-digit/color-by-digit-fixtures.mjs'
import { openWith, SCRIPT_FILES, useBrowser } from './session.mjs'
import { cellCentre, mouseDrag, placeNote } from './board.mjs'
import { goToPenPage, openPenTool, PAGE_ONE, PAGE_THREE, PAGE_TWO, penStrings } from './pen.mjs'
import { clickUntil, settle, SETTLE_MS } from './settle.mjs'

const REPLAY_BUTTON = '#control-replay'
const PLAY_BUTTON = '.controls-input button[data-key="2"]'
const START_BUTTON = '.controls-input button[data-key="1"]'

const PLAYBACK_MS = 60000
// "Nothing happened" is not what these wait for: how long a tool key gets to switch the tool before the tool is read as unchanged.
const KEY_SWITCHES_MS = 700

const browser = useBrowser()

async function openSolver (files) {
  const opened = await openWith(browser(), files, { seed: seedOddEvenCells })
  await opened.p.evaluate(() => { Framework.setSetting('toolpen', true); Framework.setSetting('toolreplay', true) })
  await opened.p.locator('#control-pen').waitFor({ state: 'visible' })
  await opened.p.locator(REPLAY_BUTTON).waitFor({ state: 'visible' })
  return opened
}

// Run twice, installed alphabetically and in reverse: the scripts wrap the same SudokuPad functions, so the order they load
// in could change what playback does.
const INSTALL_ORDERS = [['alphabetical', SCRIPT_FILES], ['reverse', [...SCRIPT_FILES].reverse()]]

for (const [order, files] of INSTALL_ORDERS) {
  describe(`attack 65: the replay tool plays a solve back with every script installed (${order} order)`, { concurrency: false }, () => {
    let context, p, errors, solved
    const read = (fn, arg) => p.evaluate(fn, arg)

    const clickCell = async (row, col) => {
      const [x, y] = await cellCentre(p, row, col)
      await p.mouse.click(x, y)
    }
    const useTool = async (id) => {
      await p.click(id)
      await settle(() => tool(p), id.replace('#control-', ''))
    }
    const goToPage = (values) => goToPenPage(p, values)
    const dragLine = async (points) => {
      const count = (await penStrings(p)).length
      await mouseDrag(p, points)
      assert.equal(await settle(async () => (await penStrings(p)).length > count, true), true, 'a pen line appeared')
    }

    const board = async () => ({
      cells: await read(() => Framework.app.puzzle.cells.map((c) => [c.row, c.col, c.propGet('normal'), c.propGet('corner'), c.propGet('centre'), [...(c.colours || [])], c.given])),
      actions: await read(() => Framework.app.puzzle.replayStack.length),
      pen: await penStrings(p),
      penDrawn: await read(() => [...document.querySelectorAll('#cell-pen .cell-pen')].map((e) => e.outerHTML)),
      notes: { texts: await noteTexts(p) }
    })

    before(async () => { ;({ context, p, errors } = await openSolver(files)) })
    after(async () => { await context.close() })

    it('setup: a short solve of digits, marks, colors, pen lines and a Text Anywhere note', async () => {
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
      const [x, y, width] = await cellCentre(p, 1, 6)
      const half = width / 2
      const count = (await penStrings(p)).length
      await p.mouse.click(x + half - 2, y)
      assert.equal(await settle(async () => (await penStrings(p)).length > count, true), true, 'an edge mark appeared')
      // Text Anywhere: a note
      await placeNote(p, [6.2, 6.25], '15')
      assert.deepEqual(await noteTexts(p), ['15'])
      await useTool(DIGIT_BUTTON)
      solved = await board()
    })

    it('the solve holds what the test compares: digits, marks, colors, seven pen entries and one Text Anywhere note', () => {
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
      assert.deepEqual(solved.notes.texts, ['15'])
    })

    it('the replay button opens the tool, and its Start button rewinds the digits, marks and pen lines', async () => {
      await clickUntil(() => p.click(REPLAY_BUTTON), () => tool(p), 'replay', SETTLE_MS)
      await p.click(START_BUTTON)
      const rewound = await settle(async () => {
        const b = await board()
        return { entered: b.cells.filter((c) => c[2] && !c[6]).length, marks: b.cells.filter((c) => c[3].length || c[4].length).length, pen: b.pen }
      }, { entered: 0, marks: 0, pen: [] })
      assert.deepEqual(rewound, { entered: 0, marks: 0, pen: [] }, 'no entered digit, mark or pen entry while the tool shows the start')
    })

    it('Play runs to the end, and the board then equals the board before: digits, marks, colors, pen lines, and the Text Anywhere notes', async () => {
    // Armed before the click: at speed 10 the whole solve plays in about a second.
      const playing = p.locator('body.replay-playing').waitFor({ state: 'attached' })
      await p.click(PLAY_BUTTON)
      await playing
      await p.locator('body.replay-paused').waitFor({ state: 'attached', timeout: PLAYBACK_MS })
      const played = await settle(board, solved)
      assert.deepEqual(played.cells.map((c) => c.slice(0, 5)), solved.cells.map((c) => c.slice(0, 5)), 'digits and marks')
      assert.deepEqual(played.pen, solved.pen, 'pen entries')
      assert.deepEqual(played.penDrawn, solved.penDrawn, 'pen lines as drawn')
      assert.deepEqual(played.cells.map((c) => c[5]), solved.cells.map((c) => c[5]), 'cell colors')
      // Color by Digit only adds a color that is missing, so a coloring of its own during playback ends on the same colors;
      // the replay's action count shows it, since it would add actions.
      assert.equal(played.actions, solved.actions, 'playback adds no action beyond what the replay holds')
      assert.deepEqual(played.notes, solved.notes, 'the Text Anywhere notes are not part of the replay, and playback leaves it')
    })

    it('no page error', () => { assert.deepEqual(errors, []) })
  })
}

describe('the replay tool\'s button and key with Text Anywhere installed', { concurrency: false }, () => {
  let withTextAnywhere, without
  const keyTool = async (p, key) => {
    await p.click(DIGIT_BUTTON)
    await settle(() => tool(p), 'normal')
    await p.keyboard.press(key)
    // A "nothing happened in this long" window: settle would return on its first read of 'normal', so a late switch to Text Anywhere would go unseen.
    await p.waitForTimeout(KEY_SWITCHES_MS)
    return tool(p)
  }

  before(async () => {
    withTextAnywhere = await openSolver(SCRIPT_FILES)
    without = await openSolver(SCRIPT_FILES.filter((f) => f !== 'text-anywhere.user.js'))
  })
  after(async () => {
    await withTextAnywhere?.context.close()
    await without?.context.close()
  })

  it('the key that selects the replay tool is the same with Text Anywhere as without it, and no key selects Text Anywhere', async () => {
    const names = (page) => page.evaluate(() => Framework.app.getToolNames())
    const replayAt = (await names(without.p)).indexOf('replay')
    assert.notEqual(replayAt, -1, 'the replay tool is installed')
    assert.equal(replayAt < TOOL_KEYS.length, true, 'it has a key')
    assert.equal((await names(withTextAnywhere.p)).includes('textanywhere'), true, 'Text Anywhere is installed')
    assert.equal(await keyTool(without.p, TOOL_KEYS[replayAt]), 'replay')
    assert.equal(await keyTool(withTextAnywhere.p, TOOL_KEYS[replayAt]), 'replay')
    const reached = []
    for (const key of TOOL_KEYS) reached.push(await keyTool(withTextAnywhere.p, key))
    assert.equal(reached.includes('textanywhere'), false, `the keys reach ${reached.join()}`)
  })

  it('the replay button selects the tool with Text Anywhere installed, and Text Anywhere\'s button still selects Text Anywhere', async () => {
    const { p } = withTextAnywhere
    await p.click(DIGIT_BUTTON)
    assert.equal(await clickUntil(() => p.click(REPLAY_BUTTON), () => tool(p), 'replay', SETTLE_MS), 'replay')
    assert.equal(await pickTextAnywhere(p), 'textanywhere')
  })

  it('the replay button comes before Text Anywhere\'s among the tool buttons on screen, as it does without it', async () => {
    const [withIds, withoutIds] = [await buttonIds(withTextAnywhere.p), await buttonIds(without.p)]
    assert.equal(withIds.indexOf('control-replay') < withIds.indexOf('control-textanywhere'), true, withIds.join())
    assert.deepEqual(withIds.filter((id) => id !== 'control-textanywhere'), withoutIds)
  })

  it('no page error', () => {
    assert.deepEqual(withTextAnywhere.errors, [])
    assert.deepEqual(without.errors, [])
  })
})
