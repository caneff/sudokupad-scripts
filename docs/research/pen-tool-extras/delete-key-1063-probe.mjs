// Probe for #1063: what the Delete key erases in highlighted cells, on stock SudokuPad and with Pen Tool Extras injected, with each tool active.
// Run: node --test docs/research/pen-tool-extras/delete-key-1063-probe.mjs   (prints one JSON line per case under RESULTS)
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../live') + '/'
const { openWith } = await import(R + 'session.mjs')
const { useBrowser } = await import(R + 'session.mjs')
const { openPenTool } = await import(R + 'pen.mjs')
const extras = await import(R + 'pen-tool-extras/pen-tool-extras-fixtures.mjs')

const browser = useBrowser()
const KEYS = ['Delete', 'Backspace']
const TOOLS = ['normal', 'corner', 'centre', 'colour', 'pen']
// Stock pen values on the highlighted cells: a line ('11', '21'), SudokuPad's edge X ('31'), cell circle and cross ('51', '61'). Extras' own: 'h1' (dirA edge), 'j1' (circle edge).
const STOCK_PEN = ['11', '21', '31', '51', '61']
const EXTRA_PEN = ['h1', 'j1', 'k1']
const results = []
after(() => { console.log('RESULTS\n' + results.map((r) => JSON.stringify(r)).join('\n')) })

for (const withExtras of [false, true]) {
  describe(withExtras ? 'with Pen Tool Extras' : 'stock', { concurrency: false }, () => {
    for (const key of KEYS) for (const tool of TOOLS) {
      it(`${key} in ${tool} tool`, async () => {
        const opened = withExtras ? await extras.open(browser()) : await openWith(browser(), [])
        const { context, p } = opened
        try {
          if (!withExtras) await p.evaluate(() => Framework.setSetting('toolpen', true))
          await p.evaluate(([stock, extra]) => {
            const a = Framework.app
            a.deselect()
            const cells = a.puzzle.cells.filter((c) => !c.given).slice(0, 2)
            a.select(cells[0])
            a.select(cells[1], true)
            for (const v of stock.concat(extra)) a.act({ type: 'pen', arg: v })
            a.act({ type: 'pencilmarks', arg: '3' })
          }, [STOCK_PEN, EXTRA_PEN])
          const read = () => p.evaluate(() => Framework.app.puzzle.cells.filter((c) => !c.given).slice(0, 2).map((c) => ({ pen: c.pen.slice().sort(), value: c.value ?? null, marks: c.pencilmarks, colours: c.colours })))
          const before = await read()
          if (tool === 'pen') await openPenTool(p)
          else await p.evaluate((t) => Framework.app.setTool ? Framework.app.setTool(t) : (Framework.app.tool = t), tool)
          const toolNow = await p.evaluate(() => Framework.app.tool)
          await p.keyboard.press(key)
          await p.waitForTimeout(300)
          const afterKey = await read()
          await p.click('#control-undo')
          await p.waitForTimeout(300)
          const undone = await read()
          await p.click('#control-redo')
          await p.waitForTimeout(300)
          const redone = await read()
          results.push({ withExtras, key, tool, toolNow, before: before[0], afterKey: afterKey[0], undoneSameAsBefore: JSON.stringify(undone) === JSON.stringify(before), redoneSameAsAfter: JSON.stringify(redone) === JSON.stringify(afterKey) })
        } finally { await context.close() }
      })
    }
  })
}
