// Probe for docs/research/co-op-room/sudokupad-streaming-tools.md: what a second page can take from a first one through
// SudokuPad's own functions (the act event, Puzzle.createState/applyState, App.getReplay/loadReplay), and what SudokuPad posts
// to its own window. Two pages of the recorded puzzle, no userscript, nothing sent off the machine.
import { chromium } from 'playwright'
import { captureConsoleErrors, openPage, restartPuzzle, startPuzzle } from '../../../live/page.mjs'

// Records every window message the page sees from its first script on, and every act the puzzle triggers.
const seed = async (p, errors) => {
  captureConsoleErrors(p, errors)
  await p.addInitScript(() => {
    window.__probeMessages = []
    window.addEventListener('message', (e) => window.__probeMessages.push({ origin: e.origin, data: e.data }))
  })
}

const cellsOf = (p) => p.evaluate(() => Framework.app.puzzle.cells.map((c) => c.serialize()).join('|'))
const stacksOf = (p) => p.evaluate(() => ({ undo: Framework.app.puzzle.undoStack.length, replay: Framework.app.puzzle.replayStack.length }))

const browser = await chromium.launch()
try {
  const a = await openPage(browser, { seed })
  const b = await openPage(browser, { seed })
  for (const x of [a, b]) { await startPuzzle(x.p); await restartPuzzle(x.p) }

  console.log('window messages on A:', JSON.stringify(await a.p.evaluate(() => window.__probeMessages)))

  // 1. What the act event carries, for a digit, a corner mark, a color and a pen line.
  const acts = await a.p.evaluate(() => {
    const app = Framework.app, seen = []
    const onAct = (act, action) => seen.push({ act, type: action && action.type })
    app.puzzle.on('act', onAct)
    const cell = (r, c) => app.grid.getCell(r, c)
    app.act({ type: 'select', arg: [cell(0, 0)] }); app.act({ type: 'value', arg: '5' })
    app.act({ type: 'deselect' }); app.act({ type: 'select', arg: [cell(0, 1), cell(0, 2)] }); app.act({ type: 'candidates', arg: '3' })
    app.act({ type: 'deselect' }); app.act({ type: 'select', arg: [cell(1, 1)] }); app.act({ type: 'colour', arg: '4' })
    app.act({ type: 'deselect' })
    app.puzzle.off('act', onAct)
    return seen
  })
  console.log('act events:', JSON.stringify(acts))

  // 2. Replaying A's act strings on B through App.act gives the same grid.
  await b.p.evaluate((acts) => { for (const { act } of acts) Framework.app.act(act) }, acts)
  console.log('B equals A after act strings:', (await cellsOf(a.p)) === (await cellsOf(b.p)))

  // 3. Puzzle.createState on A, applyState on a fresh B: same grid? Does B's undo or replay record it?
  await restartPuzzle(b.p)
  const state = await a.p.evaluate(() => Framework.app.puzzle.createState())
  console.log('state keys:', Object.keys(state).join(','), 'cells:', state.cells.length, 'bytes:', JSON.stringify(state).length)
  console.log('state.puzzleId:', JSON.stringify(state.puzzleId), 'state.id:', String(JSON.stringify(state.id)).slice(0, 60), 'puzzle.id:', await a.p.evaluate(() => String(Framework.app.puzzle.id)), 'puzzle.puzzleId:', await a.p.evaluate(() => String(Framework.app.puzzle.puzzleId).slice(0, 40)))
  const before = await stacksOf(b.p)
  const applyErr = await b.p.evaluate((s) => { try { Framework.app.puzzle.applyState(s); Framework.app.renderCells(); return null } catch (e) { return String(e) } }, state)
  console.log('applyState error:', applyErr)
  console.log('B equals A after applyState:', (await cellsOf(a.p)) === (await cellsOf(b.p)), 'stacks before/after:', JSON.stringify(before), JSON.stringify(await stacksOf(b.p)))
  // B makes its own move after the applied state, then undoes that move: is the applied state still there?
  const afterOwnUndo = await b.p.evaluate(() => {
    const app = Framework.app, cells = app.puzzle.cells
    const marked = () => cells.map((c, i) => [i, c.serialize()]).filter(([, s]) => s.replace(/\//g, '') !== '').map(([i, s]) => `${i}:${s}`).join(' ')
    const free = cells.findIndex((c) => !c.given && c.serialize() === '')
    const applied = marked()
    app.act({ type: 'select', arg: [cells[free]] }); app.act({ type: 'value', arg: '7' }); app.act({ type: 'deselect' })
    const afterMove = marked()
    app.act({ type: 'undo' }); app.act({ type: 'undo' })
    return { free, applied, afterMove, afterUndo: marked() }
  })
  console.log('B whole grid (applied / after own move / after undoing own move):', JSON.stringify(afterOwnUndo))

  // 4. App.getReplay on A, loadReplay at speed -1 on a fresh B.
  await restartPuzzle(b.p)
  const replay = await a.p.evaluate(() => Framework.app.getReplay())
  await b.p.evaluate((r) => Framework.app.loadReplay(r, { speed: -1 }), replay)
  console.log('replay chars:', replay.length, 'B equals A after loadReplay:', (await cellsOf(a.p)) === (await cellsOf(b.p)), 'B stacks:', JSON.stringify(await stacksOf(b.p)))

  console.log('errors A:', JSON.stringify(a.errors), 'errors B:', JSON.stringify(b.errors))
} finally {
  await browser.close()
}
