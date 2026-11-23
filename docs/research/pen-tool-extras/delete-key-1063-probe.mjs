// Probe for #1063: what the Delete key erases in highlighted cells, on stock SudokuPad and with Pen Tool Extras injected, with each tool active.
// Run: node --test docs/research/pen-tool-extras/delete-key-1063-probe.mjs   (prints one JSON line per case under RESULTS)
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../live') + '/'
const { openWith, useBrowser } = await import(R + 'session.mjs')
const extras = await import(R + 'pen-tool-extras/pen-tool-extras-fixtures.mjs')

const browser = useBrowser()
const KEYS = ['Delete', 'Backspace']
const TOOLS = ['normal', 'corner', 'centre', 'colour', 'pen']
// Pen values stored on both highlighted cells: SudokuPad's lines `11` and `21`, edge X `31`, cell circle `51` and cross `61`; and Pen Tool Extras' own: edge arrows and
// circle (`h1`, `j1`, `k1`), a grid-corner mark (`t1`) and the cell dot (`z1`).
const PEN = ['11', '21', '31', '51', '61', 'h1', 'j1', 'k1', 't1', 'z1']
// What else the cells hold besides the pen layer, because one Delete press clears one layer at a time.
const ALSO = { 'pen only': [], 'with corner mark': [{ type: 'pencilmarks', arg: '3' }], 'with centre mark': [{ type: 'pencilmarks', arg: '4' }], 'with digit': [{ type: 'value', arg: '5' }] }
const results = []
after(() => { console.log('RESULTS\n' + results.map((r) => JSON.stringify(r)).join('\n')) })

const read = (p) => p.evaluate(() => Framework.app.puzzle.cells.filter((c) => !c.given).slice(0, 2).map((c) => ({ pen: c.pen.length, value: c.value ?? null, marks: c.pencilmarks.length })))
// The state once two reads 100 ms apart agree.
async function stable (p) {
  let last = JSON.stringify(await read(p))
  for (let i = 0; i < 50; i++) {
    await p.waitForTimeout(100)
    const now = JSON.stringify(await read(p))
    if (now === last) return JSON.parse(now)
    last = now
  }
  throw new Error('the cells never settled')
}

for (const withExtras of [false, true]) {
  describe(withExtras ? 'with Pen Tool Extras' : 'stock', { concurrency: false }, () => {
    for (const [setup, acts] of Object.entries(ALSO)) for (const key of KEYS) for (const tool of TOOLS) {
      it(`${key} in ${tool} tool, ${setup}`, async () => {
        const { context, p } = withExtras ? await extras.open(browser()) : await openWith(browser(), [])
        try {
          if (!withExtras) await p.evaluate(() => Framework.setSetting('toolpen', true))
          await p.evaluate(([pen, more]) => {
            const a = Framework.app
            a.deselect()
            const cells = a.puzzle.cells.filter((c) => !c.given).slice(0, 2)
            a.select(cells[0])
            a.select(cells[1], true)
            for (const v of pen) a.act({ type: 'pen', arg: v })
            for (const act of more) a.act(act)
          }, [PEN, acts])
          const before = await stable(p)
          await p.click(`#control-${tool}`)
          assert.equal(await p.evaluate(() => Framework.app.tool), tool)
          const depth = () => p.evaluate(() => Framework.app.puzzle.undoStack.length)
          const depthBefore = await depth()
          const afterPress = []
          for (let i = 0; i < 2; i++) { await p.keyboard.press(key); afterPress.push((await stable(p))[0]) }
          // a press that finds nothing left to clear adds no undo step, so undo and redo as many steps as the presses made
          const steps = (await depth()) - depthBefore
          for (let i = 0; i < steps; i++) await p.click('#control-undo')
          const undone = await stable(p)
          for (let i = 0; i < steps; i++) await p.click('#control-redo')
          const redone = await stable(p)
          results.push({ withExtras, key, tool, setup, before: before[0], afterPress, steps, undoneToBefore: JSON.stringify(undone) === JSON.stringify(before), redoneToAfter: JSON.stringify(redone[0]) === JSON.stringify(afterPress[1]) })
        } finally { await context.close() }
      })
    }
  })
}
