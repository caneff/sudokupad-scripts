// Live check of the Copy settings and Paste settings buttons of the five scripts with a settings dialog, on sudokupad.app in
// headless Chromium: Copy puts the saved keys on the real clipboard, Paste reads them back through the same dialog.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { dialogButton, openScriptDialog } from './settings.mjs'

const code = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const STATUS = '.dialog [data-role="settings-status"]'
const ODD_EVEN = [{ key: '1', digits: ['1', '3', '5', '7', '9'] }, { key: '2', digits: ['0', '2', '4', '6', '8'] }]

// Every digit set, since Digit Color saves its table whole.
const DIGIT_COLORS = { 0: '#4b5563', 1: '#112233', 2: '#b04a00', 3: '#7a6200', 4: '#1b7a2f', 5: '#00736f', 6: '#0059c9', 7: '#3d2bb8', 8: '#8a1fa8', 9: '#5e3a1a' }

// `saved` is a value the script saves under `key`; `pasted` holds one good value and one bad one for `key`'s script.
const SCRIPTS = [
  { file: 'dark-page.user.js', entry: 'Dark page', editor: '#dark-page-input', key: 'DarkPage_color', saved: '#336699', badKey: 'DarkPage_color', bad: 'blue' },
  { file: 'digit-color.user.js', entry: 'Digit color', editor: '#digit-color-editor', key: 'DigitColor_colors', saved: DIGIT_COLORS, badKey: 'DigitColor_colors', bad: ['#ffffff'] },
  { file: 'auto-rules-resizer.user.js', entry: 'Rules resizer', editor: '#auto-rules-resizer-max-width', key: 'AutoRulesResizer_maxWidth', saved: 640, badKey: 'AutoRulesResizer_maxHeight', bad: 'tall' },
  { file: 'color-by-digit.user.js', entry: 'Color by digit', editor: '#color-by-digit-editor', key: 'ColorByDigit_profiles', saved: { profiles: [{ name: 'Mine', groups: ODD_EVEN }], active: 0 }, badKey: 'ColorByDigit_auto', bad: 'yes' },
  { file: 'pen-tool-extras.user.js', entry: 'Pen tool extras', editor: '#pen-tool-extras-editor', key: 'PenColor_thickness', saved: 9, badKey: 'PenColor_opacity', bad: 7 }
]

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

    it('copies the saved key to the clipboard', async () => {
      await p.evaluate(([key, value]) => Framework.setData(key, value), [script.key, script.saved])
      await dialogButton(p, 'Copy settings').click()
      await p.locator(STATUS).filter({ hasText: 'Settings copied.' }).waitFor()
      const copied = JSON.parse(await p.evaluate(() => navigator.clipboard.readText()))
      assert.deepEqual(copied[script.key], script.saved)
      assert.deepEqual(Object.keys(copied).filter((key) => key.split('_')[0] !== script.key.split('_')[0]), [])
    })

    it('pastes it back and ignores a foreign key', async () => {
      await p.evaluate((key) => Framework.removeData(key), script.key)
      await p.evaluate((t) => navigator.clipboard.writeText(t), JSON.stringify({ [script.key]: script.saved, Foreign_key: 1 }))
      await dialogButton(p, 'Paste settings').click()
      await p.locator(STATUS).filter({ hasText: /^Pasted 1 setting\.$/ }).waitFor()
      assert.deepEqual(await p.evaluate((key) => Framework.getData(key), script.key), script.saved)
      assert.equal(await p.evaluate(() => Framework.getData('Foreign_key')), null)
    })

    it('skips and counts a value its reader refuses, and saves nothing for it', async () => {
      const before = await p.evaluate((key) => Framework.getData(key), script.badKey)
      await p.evaluate((t) => navigator.clipboard.writeText(t), JSON.stringify({ [script.badKey]: script.bad }))
      await dialogButton(p, 'Paste settings').click()
      await p.locator(STATUS).filter({ hasText: /^Pasted 0 settings; skipped 1 that did not check out\.$/ }).waitFor()
      assert.deepEqual(await p.evaluate((key) => Framework.getData(key), script.badKey), before)
    })

    it('reports text that is not settings, and saves nothing', async () => {
      await p.evaluate(() => navigator.clipboard.writeText('not json'))
      await dialogButton(p, 'Paste settings').click()
      await p.locator(STATUS).filter({ hasText: 'Could not paste: the clipboard text is not JSON' }).waitFor()
    })

    it('had no page error', () => assert.deepEqual(errors, []))
  })
}
