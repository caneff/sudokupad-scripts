import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { closeDialogWith, openScriptDialog } from './settings.mjs'
import { openWith, useBrowser } from './session.mjs'

const SCRIPTS = [
  { file: 'dark-page', entry: 'Dark Page', editor: '#dark-page-dialog', buttons: ['Save', 'Cancel', 'Restore defaults'] },
  { file: 'auto-rules-resizer', entry: 'Auto Rules Resizer', editor: '#rules-resizer-dialog', buttons: ['Save', 'Cancel', 'Restore defaults'] },
  { file: 'color-by-digit', entry: 'Color by Digit', editor: '#color-by-digit-editor', buttons: ['Save', 'Cancel', 'Restore defaults'] },
  { file: 'text-anywhere', entry: 'Text Anywhere', editor: '#text-anywhere-dialog', buttons: ['Save', 'Cancel', 'Restore defaults'] },
  { file: 'pen-tool-extras', entry: 'Pen Tool Extras', editor: '#pen-tool-extras-editor', buttons: ['Save', 'Cancel', 'Restore defaults'] }
]

const browser = useBrowser()

for (const { file, entry, editor, buttons } of SCRIPTS) {
  describe(`${entry}'s dialog shell`, { concurrency: false }, () => {
    let context, p, errors
    before(async () => {
      ({ context, p, errors } = await openWith(browser(), [`${file}.user.js`]))
    })
    after(async () => { await context?.close() })

    it('the buttons are one row at the dialog\'s right: Save filled purple left of Cancel, Cancel and any extra button plain', async () => {
      await openScriptDialog(p, entry, editor)
      // The pointer is still where the last click was, which may be over a button; a hovered button reads its hover color.
      await p.mouse.move(0, 0)
      const row = await p.evaluate(() => {
        const dialog = document.querySelector('.dialog').getBoundingClientRect()
        return [...document.querySelectorAll('.dialog-options button')].map((b) => {
          const { x, right, y, height } = b.getBoundingClientRect()
          return { text: b.textContent.trim(), x, right, middle: Math.round(y + height / 2), height: Math.round(height), background: window.getComputedStyle(b).backgroundColor, dialogRight: dialog.right }
        })
      })
      assert.deepEqual(row.map((b) => b.text), buttons)
      assert.equal(row.every((b) => Math.abs(b.middle - row[0].middle) <= 3 && b.height === row[0].height), true, `one row of equal buttons: ${JSON.stringify(row)}`)
      assert.equal(row.every((b, i) => i === 0 || b.x > row[i - 1].x), true, 'left to right in order')
      assert.equal(row.at(-1).dialogRight - row.at(-1).right <= 24, true, `right-aligned: ${JSON.stringify(row)}`)
      assert.deepEqual(row.map((b) => b.background), ['rgb(107, 63, 160)', ...row.slice(1).map(() => 'rgb(241, 239, 245)')])
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

describe('a script\'s dialog names the parts that are off because SudokuPad changed', { concurrency: false }, () => {
  let context, p, errors
  before(async () => {
    // Dark Page's saved color needs Framework.getData and its settings entry does not, so the entry still opens.
    ({ context, p, errors } = await openWith(browser(), ['dark-page.user.js'], {
      // SudokuPad needs getData itself, so it is hidden only until the script has logged its skip.
      afterStart: (page) => page.evaluate(() => {
        const getData = Framework.getData
        const warn = console.warn
        Framework.getData = undefined
        console.warn = function (...args) {
          warn.apply(this, args)
          if (String(args[0]).startsWith('dark-page: saved color skipped')) { Framework.getData = getData; console.warn = warn }
        }
      }),
      expectedSkips: [/^dark-page: saved color skipped because SudokuPad has no Framework\.getData/]
    }))
  })
  after(async () => { await context?.close() })

  it('Dark Page\'s dialog has the line, and says which part is off', async () => {
    await openScriptDialog(p, 'Dark Page', '#dark-page-dialog')
    const note = await p.locator('.dialog .dark-page-off-note').allTextContents()
    assert.deepEqual(note, ['Off because SudokuPad changed: saved color'])
    await closeDialogWith(p, 'Cancel', '#dark-page-dialog')
  })

  it('the page raised no error beyond the declared skip', () => {
    assert.deepEqual(errors, [])
  })
})
