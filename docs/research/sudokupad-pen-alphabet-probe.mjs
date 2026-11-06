// Probe for docs/research/sudokupad-pen-edge-marks.md, "Pen values past `z`": which characters survive as a pen value
// (store, undo, getReplay/loadReplay, page reload). No userscript injected.
import { chromium } from 'playwright'
import { captureConsoleErrors, openPage, restartPuzzle, startPuzzle } from '../../live/page.mjs'
import { settle } from '../../live/settle.mjs'

// [row, col, arg]: value candidates use color '1'; color candidates use value '5' (the cell circle).
const CASES = [
  [0, 0, 'z1'], // control: the one ASCII value left
  [0, 1, 'é1'], [0, 2, 'ß1'], [0, 3, 'α1'], [0, 4, 'ж1'], [0, 5, 'ā1'],
  [1, 0, '!1'], [1, 1, '~1'], [1, 2, '#1'], [1, 3, '.1'], [1, 4, ';1'],
  [2, 0, '5é'], [2, 1, '5α'], [2, 2, '5!'],
  [3, 0, '5ab'], // a third character
  [4, 0, 'É1'] // uppercase non-ASCII
]

const browser = await chromium.launch()
try {
  const { p, errors } = await openPage(browser, { seed: captureConsoleErrors })
  const read = (fn, arg) => p.evaluate(fn, arg)
  const entries = () => read(() => Framework.app.puzzle.cells.flatMap((c) => c.pen.map((v) => `${c.row},${c.col}:${v}`)).sort())
  await startPuzzle(p)
  await restartPuzzle(p)
  for (const [r, c, arg] of CASES) {
    await read(([r, c, arg]) => {
      const app = Framework.app
      const cell = app.grid.getCell(r, c)
      app.act({ type: 'groupstart' })
      app.act({ type: 'deselect' })
      app.act({ type: 'select', arg: [cell] })
      app.act({ type: 'pen', arg })
      app.act({ type: 'deselect' })
      app.act({ type: 'groupend' })
    }, [r, c, arg])
  }
  const stored = await entries()
  console.log('stored:', JSON.stringify(stored))
  console.log('classes:', JSON.stringify(await read(() => [...document.querySelectorAll('#cell-pen .cell-pen')].map((e) => e.getAttribute('class')))))
  const replay = await read(() => Framework.app.getReplay())
  console.log('replay length:', replay.length)
  await read(() => Framework.app.undo())
  const afterUndo = await entries()
  console.log('after one undo, removed:', JSON.stringify(stored.filter((e) => !afterUndo.includes(e))))
  await restartPuzzle(p)
  console.log('after restart:', (await entries()).length)
  await read((r) => Framework.app.loadReplay(r), replay)
  const replayed = await settle(entries, stored)
  console.log('replay round trip equal:', JSON.stringify(replayed) === JSON.stringify(stored), JSON.stringify(replayed))
  await p.reload({ waitUntil: 'load' })
  await startPuzzle(p)
  const reloaded = await settle(entries, stored)
  console.log('reload equal:', JSON.stringify(reloaded) === JSON.stringify(stored), JSON.stringify(reloaded))
  console.log('errors:', JSON.stringify(errors))
} finally {
  await browser.close()
}
