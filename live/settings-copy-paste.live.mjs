// Live check of the Copy settings and Paste settings buttons of the five scripts with a settings dialog, on sudokupad.app in
// headless Chromium: Copy puts the saved keys on the real clipboard, Paste reads them back through the same dialog.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { openScriptDialog } from './settings.mjs'

const code = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const STATUS = '.dialog [data-role="settings-status"]'
// Every script's two buttons are icons, so each pair is found by its act, not its words.
const actButton = (p, act) => p.locator(`.dialog button[data-act="${act}"]`)
const ODD_EVEN = [{ key: '1', digits: ['1', '3', '5', '7', '9'] }, { key: '2', digits: ['0', '2', '4', '6', '8'] }]

// `asDefault`, where there is one, is the value that Copy writes for a setting at its default and that the script saves as no key.
// `saved` is a value the script saves under `key`, inside a `{ v, data }` envelope where `enveloped` is set; `pasted` holds one good value and one bad one for `key`'s script.
const SCRIPTS = [
  { file: 'dark-page.user.js', owns: /^DarkPage_/, entry: 'Dark Page', editor: '#dark-page-input', key: 'DarkPage_color', saved: '#336699', asDefault: '#000000', badKey: 'DarkPage_color', bad: 'blue' },
  { file: 'auto-rules-resizer.user.js', owns: /^AutoRulesResizer_/, entry: 'Rules Resizer', editor: '#auto-rules-resizer-max-width', key: 'AutoRulesResizer_maxWidth', saved: 640, enveloped: true, asDefault: null, badKey: 'AutoRulesResizer_maxHeight', bad: 'tall' },
  { file: 'color-by-digit.user.js', owns: /^ColorByDigit_/, entry: 'Color by Digit', editor: '#color-by-digit-editor', key: 'ColorByDigit_profiles', saved: { profiles: [{ name: 'Mine', groups: ODD_EVEN }], active: 0 }, enveloped: true, badKey: 'ColorByDigit_mode', bad: 'sideways' },
  { file: 'draw-tool.user.js', owns: /^DrawTool_/, entry: 'Text Anywhere', editor: '#draw-tool-dialog', key: 'DrawTool_width', saved: 3.5, badKey: 'DrawTool_width', bad: 500 },
  { file: 'pen-tool-extras.user.js', owns: /^(PenColor_|EdgeMarks_)/, entry: 'Pen Tool Extras', editor: '#pen-tool-extras-editor', key: 'PenColor_thickness', saved: 9, asDefault: 5, badKey: 'PenColor_opacity', bad: 7 }
]

// Puts `text` on the clipboard, clears the last status, presses Paste settings and returns the status it shows.
async function paste (p, text) {
  await p.evaluate((t) => { document.querySelector('.dialog [data-role="settings-status"]').textContent = ''; return navigator.clipboard.writeText(t) }, text)
  await actButton(p, 'paste-settings').click()
  const status = p.locator(STATUS).filter({ hasText: /\S/ })
  await status.waitFor()
  return status.textContent()
}

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser?.close() })

for (const script of SCRIPTS) {
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
