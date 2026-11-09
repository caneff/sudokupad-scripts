// Live check of the Copy settings and Paste settings buttons of the five scripts with a settings dialog, on sudokupad.app in
// headless Chromium: Copy puts the saved keys on the real clipboard, Paste reads them back through the same dialog.
import { after, afterEach, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { actButton, code, dialogButton, openScriptDialog, paste, SETTINGS_SCRIPTS, STATUS } from './settings.mjs'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

for (const script of SETTINGS_SCRIPTS) {
  describe(`${script.file}: Copy settings and Paste settings`, { concurrency: false }, () => {
    let context, p, errors
    before(async () => {
      ({ context, p, errors } = await openPage(browser, { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }))
      await startPuzzle(p, { injection: { mode: 'after-start', code: code(script.file) } })
      await openScriptDialog(p, script.entry, script.editor)
    })
    after(async () => { await context?.close() })

    it('has the two icons in the title row and no text button for either', async () => {
      const icons = await p.$$eval('.dialog [class$="title-row"] button[data-act]', (bs) => bs.map((b) => [b.dataset.act, b.textContent.trim()]))
      assert.deepEqual(icons, [['copy-settings', ''], ['paste-settings', '']])
      assert.equal(await actButton(p, 'copy-settings').count(), 1)
      assert.equal(await actButton(p, 'paste-settings').count(), 1)
    })

    it('copies the saved key to the clipboard', async () => {
      await p.evaluate(([key, value]) => Framework.setData(key, value), [script.key, script.saved])
      await actButton(p, 'copy-settings').click()
      await p.locator(STATUS).filter({ hasText: 'Settings copied.' }).waitFor()
      const copied = JSON.parse(await p.evaluate(() => navigator.clipboard.readText()))
      assert.deepEqual(copied[script.key], script.saved)
      assert.deepEqual(Object.keys(copied).filter((key) => !script.owns.test(key)), [])
    })

    it('pastes it back and ignores a foreign key', async () => {
      await p.evaluate((key) => Framework.removeData(key), script.key)
      assert.equal(await paste(p, JSON.stringify({ [script.key]: script.saved, Foreign_key: 1 })), 'Pasted 1 setting.')
      assert.deepEqual(await p.evaluate((key) => Framework.getData(key), script.key), script.enveloped ? { v: 0, data: script.saved } : script.saved)
      assert.equal(await p.evaluate(() => Framework.getData('Foreign_key')), null)
    })

    if ('asDefault' in script) {
      it('pastes a setting at its default over a saved value, which the script keeps as no key', async () => {
        await p.evaluate(([key, value]) => Framework.setData(key, value), [script.key, script.saved])
        assert.equal(await paste(p, JSON.stringify({ [script.key]: script.asDefault })), 'Pasted 1 setting.')
        assert.equal(await p.evaluate((key) => Framework.getData(key), script.key), null)
      })
    }

    it('skips and counts a value its reader refuses, and saves nothing for it', async () => {
      const before = await p.evaluate((key) => Framework.getData(key), script.badKey)
      assert.equal(await paste(p, JSON.stringify({ [script.badKey]: script.bad })), 'Pasted 0 settings; skipped 1 that did not check out.')
      assert.deepEqual(await p.evaluate((key) => Framework.getData(key), script.badKey), before)
    })

    it('reports text that is not settings, and saves nothing', async () => {
      assert.equal(await paste(p, 'not json'), 'Could not paste: the clipboard text is not JSON')
    })

    it('had no page error', () => assert.deepEqual(errors, []))
  })
}

// A throw planted on the height key's write: the width, written just before it, is put back by the dialog's snapshot. Each case
// has its own page, since the failure turns the max size settings off.
describe('auto-rules-resizer.user.js: a failed Save or Paste leaves the width unsaved', { concurrency: false }, () => {
  const WIDTH_KEY = 'AutoRulesResizer_maxWidth'
  const HEIGHT_KEY = 'AutoRulesResizer_maxHeight'
  let context, p, errors
  const openWithHeightWriteThrowing = async () => {
    ({ context, p, errors } = await openPage(browser, { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] }, expectedSkips: [/max size settings skipped/] }))
    await startPuzzle(p, { injection: { mode: 'after-start', code: code('auto-rules-resizer.user.js') } })
    await openScriptDialog(p, 'Rules Resizer', '#auto-rules-resizer-max-width')
    await p.evaluate((key) => {
      const setData = Framework.setData
      Framework.setData = function (name, value) {
        if (name === key) throw new Error('planted height write failure')
        return setData.call(this, name, value)
      }
    }, HEIGHT_KEY)
  }
  afterEach(async () => { await context?.close() })

  it('Paste: says the paste failed and the width key is still unsaved', async () => {
    await openWithHeightWriteThrowing()
    assert.equal(await paste(p, JSON.stringify({ [WIDTH_KEY]: 640, [HEIGHT_KEY]: 480 })), 'Could not paste: planted height write failure')
    assert.equal(await p.evaluate((key) => Framework.getData(key), WIDTH_KEY), null)
    assert.deepEqual(errors, [])
  })

  it('Save: says it was not saved and the width key is still unsaved', async () => {
    await openWithHeightWriteThrowing()
    await p.fill('#auto-rules-resizer-max-width', '640')
    await p.fill('#auto-rules-resizer-max-height', '480')
    await dialogButton(p, 'Save').click()
    await p.locator(STATUS).filter({ hasText: 'Not saved: planted height write failure' }).waitFor()
    assert.equal(await p.evaluate((key) => Framework.getData(key), WIDTH_KEY), null)
    assert.deepEqual(errors, [])
  })
})

// The three scripts whose saved data goes through the guard's store: a throw planted on the second key a paste writes reaches the
// dialog's snapshot, which puts the first key back. Each case has its own page.
const STORE_PASTES = [
  { file: 'color-by-digit.user.js', entry: 'Color by Digit', editor: '#color-by-digit-editor', first: ['ColorByDigit_profiles', SETTINGS_SCRIPTS.find((s) => s.file === 'color-by-digit.user.js').saved], second: ['ColorByDigit_mode', 'digit'] },
  { file: 'draw-tool.user.js', entry: 'Text Anywhere', editor: '#draw-tool-dialog', first: ['DrawTool_width', 3.5], second: ['DrawTool_opacity', 50] },
  { file: 'pen-tool-extras.user.js', entry: 'Pen Tool Extras', editor: '#pen-tool-extras-editor', first: ['PenColor_thickness', 9], second: ['PenColor_opacity', 50] }
]

for (const kase of STORE_PASTES) {
  describe(`${kase.file}: a paste whose second write throws leaves every key as before`, { concurrency: false }, () => {
    let context, p, errors
    after(async () => { await context?.close() })

    it('says the paste failed and both keys hold what they held before', async () => {
      ({ context, p, errors } = await openPage(browser, { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }))
      await startPuzzle(p, { injection: { mode: 'after-start', code: code(kase.file) } })
      await openScriptDialog(p, kase.entry, kase.editor)
      const keys = [kase.first[0], kase.second[0]]
      const before = await p.evaluate((names) => names.map((name) => Framework.getData(name)), keys)
      await p.evaluate((key) => {
        const setData = Framework.setData
        Framework.setData = function (name, value) {
          if (name === key) throw new Error('planted second write failure')
          return setData.call(this, name, value)
        }
      }, kase.second[0])
      assert.equal(await paste(p, JSON.stringify(Object.fromEntries([kase.first, kase.second]))), 'Could not paste: planted second write failure')
      assert.deepEqual(await p.evaluate((names) => names.map((name) => Framework.getData(name)), keys), before)
      assert.deepEqual(errors, [])
    })
  })
}
