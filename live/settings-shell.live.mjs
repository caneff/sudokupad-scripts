import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { actButton, closeDialogWith, hideGetDataUntilWarn, openScriptDialog, paste, STATUS } from './settings.mjs'
import { SETTINGS_SCRIPTS } from './scripts.mjs'
import { openWith, useBrowser } from './session.mjs'

// Every script's dialog ends in the same three buttons.
const BUTTONS = ['Save', 'Cancel', 'Restore defaults']
const EXTRA_BUTTONS = { 'auto-rules-resizer.user.js': ['Reset puzzle size'] }
const SUDOKUPAD_PURPLE = 'rgb(106, 27, 154)'
// The laptop size the polish hunt measured the row at.
const LAPTOP = { width: 1366, height: 768 }

// One real edit of the editor's first control, of whatever kind it is.
async function editFirstControl (p, editor) {
  const control = p.locator(`${editor} input:not([type=hidden]), ${editor} select`).first()
  const { tag, type } = await control.evaluate((el) => ({ tag: el.tagName, type: el.type }))
  if (tag === 'SELECT') await control.selectOption({ index: await control.evaluate((el) => (el.selectedIndex + 1) % el.options.length) })
  else if (type === 'checkbox') await control.click()
  else if (type === 'color') await control.fill('#123456')
  else await control.fill(type === 'number' ? '500' : 'x')
}

const browser = useBrowser()

for (const { file, entry, editor, open } of SETTINGS_SCRIPTS) {
  describe(`${entry}'s dialog shell`, { concurrency: false }, () => {
    let context, p, errors
    before(async () => {
      ({ context, p, errors } = await openWith(browser(), [file], { contextOptions: { viewport: LAPTOP, permissions: ['clipboard-read', 'clipboard-write'] } }))
    })
    after(async () => { await context?.close() })

    it('the buttons are one row at the content column\'s right: Save filled purple left of Cancel, Cancel and any extra button plain', async () => {
      await open(p)
      // The pointer is still where the last click was, which may be over a button; a hovered button reads its hover color.
      await p.mouse.move(0, 0)
      const row = await p.evaluate(() => {
        const content = document.querySelector('.dialog [class$="title-row"]').getBoundingClientRect()
        return [...document.querySelectorAll('.dialog-options button')].map((b) => {
          const { x, right, y, height } = b.getBoundingClientRect()
          return { text: b.textContent.trim(), x, right, middle: Math.round(y + height / 2), height: Math.round(height), background: window.getComputedStyle(b).backgroundColor, contentRight: content.right }
        })
      })
      assert.deepEqual(row.map((b) => b.text), [...BUTTONS, ...(EXTRA_BUTTONS[file] ?? [])])
      assert.equal(row.every((b) => Math.abs(b.middle - row[0].middle) <= 3 && b.height === row[0].height), true, `one row of equal buttons: ${JSON.stringify(row)}`)
      assert.equal(row.every((b, i) => i === 0 || b.x > row[i - 1].x), true, 'left to right in order')
      assert.equal(Math.abs(row.at(-1).contentRight - row.at(-1).right) <= 1, true, `right-aligned on the content column: ${JSON.stringify(row)}`)
      assert.deepEqual(row.map((b) => b.background), ['rgb(107, 63, 160)', ...row.slice(1).map(() => 'rgb(241, 239, 245)')])
      await closeDialogWith(p, 'Cancel', editor)
    })

    it('the button row\'s line starts and ends where the content column does at 1366x768', async () => {
      await open(p)
      const edges = await p.evaluate(() => {
        const at = (selector) => { const { left, right } = document.querySelector(selector).getBoundingClientRect(); return [Math.round(left), Math.round(right)] }
        return { content: at('.dialog [class$="title-row"]'), row: at('.dialog .dialog-options') }
      })
      assert.deepEqual(edges.row, edges.content)
      await closeDialogWith(p, 'Cancel', editor)
    })

    it('the dialog and every checkbox and slider in it compute SudokuPad purple as the accent color', async () => {
      await open(p)
      const accents = await p.evaluate(() => [document.querySelector('.dialog'), ...document.querySelectorAll('.dialog input[type=checkbox], .dialog input[type=range]')]
        .map((el) => window.getComputedStyle(el).accentColor))
      assert.deepEqual(accents, accents.map(() => SUDOKUPAD_PURPLE))
      await closeDialogWith(p, 'Cancel', editor)
    })

    it('an error in the status line looks unlike a success, and the next edit in the editor clears it', async () => {
      await open(p)
      const look = () => p.locator(STATUS).evaluate((el) => { const s = window.getComputedStyle(el); return { color: s.color, weight: s.fontWeight } })
      await actButton(p, 'copy-settings').click()
      await p.locator(STATUS).filter({ hasText: 'Settings copied.' }).waitFor()
      const success = await look()
      assert.equal(await paste(p, 'not json'), 'Could not paste: the clipboard text is not JSON')
      const error = await look()
      assert.notEqual(error.color, success.color, `error ${JSON.stringify(error)}, success ${JSON.stringify(success)}`)
      await editFirstControl(p, editor)
      assert.equal(await p.locator(STATUS).textContent(), '')
      await closeDialogWith(p, 'Cancel', editor)
    })

    it('Save with nothing changed writes nothing and closes the dialog', async () => {
      await open(p)
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
      afterStart: hideGetDataUntilWarn(/^dark-page: saved color skipped/),
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

describe('hiding Framework.getData from a script leaves SudokuPad\'s own settings save working', { concurrency: false }, () => {
  let context, p, errors
  before(async () => {
    // No script is injected, so nothing logs the warning and getData stays hidden for the whole test.
    ({ context, p, errors } = await openWith(browser(), [], { afterStart: hideGetDataUntilWarn() }))
  })
  after(async () => { await context?.close() })

  it('a throttled save (SudokuPad queues one on a setting change) runs, and raises no error', async () => {
    await p.evaluate(() => {
      // saveSettings ends in setData, which it reaches only after it has read getData.
      window.__saved = false
      const setData = Framework.setData
      Framework.setData = function (...args) { window.__saved = true; return setData.apply(this, args) }
      Framework.throttledSaveSettings()
    })
    await p.waitForFunction(() => window.__saved, null, { timeout: 5000 })
    assert.deepEqual(errors, [])
    assert.equal(await p.evaluate(() => typeof Framework.getData), 'undefined', 'a script still sees no getData')
  })
})
