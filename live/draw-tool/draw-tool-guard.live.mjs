// Live check that a SudokuPad internal missing before Text Anywhere loads turns off the feature that needs it and nothing else: the console
// names it once, the bar at the bottom of the page names it with a Report link, and the other features work.
// The snippet runs ahead of the script's own startup check and puts the internal back after it, so SudokuPad's own code still runs.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import * as draw from './draw-tool-fixtures.mjs'
import { openPage, startPuzzle } from '../page.mjs'
import { openScriptDialog } from '../settings.mjs'
import { settle } from '../settle.mjs'

const { DRAW_BUTTON, SETTINGS_EDITOR: EDITOR, pickDraw, script, texts, tool } = draw

const WARNING = /^draw-tool: /
const BAR = '#sudokupad-scripts-notices [data-script="draw-tool"]'
const NOTE = { kind: 'text', color: 1, size: 20, opacity: 100, text: '15', at: [160, 160] }

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

const missingBefore = (owner, name) => `;Framework.getApp().then(() => {
  const owner = ${owner}
  const original = owner.${name}
  owner[${JSON.stringify(name)}] = undefined
  Framework.getApp().then(() => { owner[${JSON.stringify(name)}] = original })
});\n`

const CASES = [
  {
    internal: 'Framework.addTool',
    owner: 'Framework',
    name: 'addTool',
    off: 'Text tool',
    // There is no tool button, but the notes saved for the puzzle are still drawn, and the settings open from SudokuPad's own.
    works: async (p) => {
      assert.equal(await p.locator(DRAW_BUTTON).count(), 0, 'no tool button')
      assert.deepEqual(await settle(() => texts(p), ['15']), ['15'], 'the saved note is drawn')
      await openScriptDialog(p, 'Text Anywhere', EDITOR)
      assert.equal(await p.locator(EDITOR).isVisible(), true)
    }
  },
  {
    internal: 'Framework.addSetting',
    owner: 'Framework',
    name: 'addSetting',
    off: 'settings',
    // There is no settings entry and no gear, but the tool works and the saved note is drawn.
    works: async (p) => {
      await pickDraw(p)
      assert.equal(await tool(p), 'draw')
      assert.equal(await p.locator('.draw-tool-settings').count(), 0, 'no gear')
      assert.deepEqual(await settle(() => texts(p), ['15']), ['15'], 'the saved note is drawn')
    }
  }
]

for (const kase of CASES) {
  describe(`SudokuPad has no ${kase.internal}`, { concurrency: false }, () => {
    let context, p, errors
    const warned = []

    before(async () => {
      ;({ context, p, errors } = await openPage(browser, {
        expectedSkips: [WARNING],
        seed: (page) => { page.on('console', (m) => { if (m.type() === 'warning' && WARNING.test(m.text())) warned.push(m.text()) }) }
      }))
      await startPuzzle(p)
      await draw.plantDrawing(p, [NOTE])
      await p.addScriptTag({ content: `${missingBefore(kase.owner, kase.name)}${script}` })
    })
    after(async () => { await context.close() })

    it('one console warning names the feature', async () => {
      assert.equal(await settle(async () => warned.length, 1), 1, warned.join('\n'))
      assert.equal(warned[0], `draw-tool: ${kase.off} skipped because SudokuPad has no ${kase.internal}`)
    })

    it('the bar names the feature with a Report link, and goes when dismissed', async () => {
      const bar = p.locator(BAR)
      await bar.waitFor({ state: 'attached' })
      assert.match(await bar.textContent(), new RegExp(`^Text Anywhere: ${kase.off} is off — SudokuPad changed\\.Report`))
      assert.match(await bar.locator('a').getAttribute('href'), /^https:\/\/github\.com\/caneff\/sudokupad-scripts\/issues\/new\?title=/)
      await bar.locator('button[aria-label="Dismiss"]').click()
      assert.equal(await bar.count(), 0)
    })

    it('the script\'s other features still work', async () => {
      await kase.works(p)
    })

    it('the page raised no error, and no further warning came', () => {
      assert.deepEqual(errors, [])
      assert.equal(warned.length, 1, warned.join('\n'))
    })
  })
}
