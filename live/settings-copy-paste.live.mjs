// Live check of the Copy settings and Paste settings buttons of the five scripts with a settings dialog, on sudokupad.app in
// headless Chromium: Copy puts the saved keys on the real clipboard, Paste reads them back through the same dialog.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { actButton, code, openScriptDialog, paste, SETTINGS_SCRIPTS, STATUS } from './settings.mjs'

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
