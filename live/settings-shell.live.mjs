// Live check of the shared settings dialog shell (`lib/settings-dialog.js`) in all five scripts on sudokupad.app, in headless Chromium:
// the buttons are Save then Cancel (extra buttons after them), and Save with nothing changed writes nothing.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { closeDialogWith, openScriptDialog } from './settings.mjs'

const SCRIPTS = [
  { file: 'dark-page', entry: 'Dark Page', editor: '#dark-page-dialog', buttons: ['Save', 'Cancel'] },
  { file: 'auto-rules-resizer', entry: 'Rules Resizer', editor: '#rules-resizer-dialog', buttons: ['Save', 'Cancel'] },
  { file: 'color-by-digit', entry: 'Color by Digit', editor: '#color-by-digit-editor', buttons: ['Save', 'Cancel'] },
  { file: 'draw-tool', entry: 'Text Annotation', editor: '#draw-tool-dialog', buttons: ['Save', 'Cancel'] },
  { file: 'pen-tool-extras', entry: 'Pen Tool Extras', editor: '#pen-tool-extras-editor', buttons: ['Save', 'Cancel', 'Restore defaults'] }
]

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

for (const { file, entry, editor, buttons } of SCRIPTS) {
  describe(`${entry}'s dialog shell`, { concurrency: false }, () => {
    let context, p, errors
    before(async () => {
      ({ context, p, errors } = await openPage(browser))
      await startPuzzle(p, { injection: { mode: 'after-start', code: readFileSync(new URL(`../${file}.user.js`, import.meta.url), 'utf8') } })
    })
    after(async () => { await context?.close() })

    it(`has the buttons ${buttons.join(', ')}, in that order`, async () => {
      await openScriptDialog(p, entry, editor)
      assert.deepEqual(await p.$$eval('.dialog-options button', (bs) => bs.map((b) => b.textContent.trim())), buttons)
      await closeDialogWith(p, 'Cancel', editor)
    })

    it('Save with nothing changed writes nothing and closes the dialog', async () => {
      await openScriptDialog(p, entry, editor)
      await p.evaluate(() => {
        window.__writes = []
        for (const method of ['setData', 'removeData']) {
          const original = Framework[method]
          Framework[method] = function (...args) { window.__writes.push([method, ...args]); return original.apply(this, args) }
        }
      })
      await closeDialogWith(p, 'Save', editor)
      assert.deepEqual(await p.evaluate(() => window.__writes), [])
    })

    it('the page raised no error', () => {
      assert.deepEqual(errors, [])
    })
  })
}
