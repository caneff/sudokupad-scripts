// Live check of the Copy settings and Paste settings buttons of the scripts with a settings dialog, on sudokupad.app in
// headless Chromium: Copy puts the saved keys on the real clipboard, Paste reads them back through the same dialog.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { openPage, startPuzzle } from './page.mjs'
import { actButton, closeDialogWith, code, dialogButton, openScriptDialog, paste, SETTINGS_SCRIPTS, STATUS } from './settings.mjs'

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
      const before = await p.evaluate((key) => Framework.getData(key), script.key)
      assert.equal(await paste(p, 'not json'), 'Could not paste: the clipboard text is not JSON')
      assert.deepEqual(await p.evaluate((key) => Framework.getData(key), script.key), before)
    })

    it('had no page error', () => assert.deepEqual(errors, []))
  })
}

// The next write of `key` through SudokuPad's Framework.setData throws `message`; the one after it, a restore's, goes through.
const failNextWriteOf = (p, key, message) => p.evaluate(([name, text]) => {
  const setData = Framework.setData
  let armed = true
  Framework.setData = function (written, value) {
    if (armed && written === name) {
      armed = false
      throw new Error(text)
    }
    return setData.call(this, written, value)
  }
}, [key, message])

const stored = (p, keys) => p.evaluate((names) => names.map((name) => Framework.getData(name)), keys)

// What each control matching `selectors` shows: a box's tick, a toggle button's pressed state, any other control's value.
const shown = (p, selectors) => p.evaluate((sels) => sels.map((sel) => {
  const el = document.querySelector(sel)
  if (!el) return null
  if (el.type === 'checkbox') return el.checked
  return el.matches('button') ? el.getAttribute('aria-pressed') : el.value
}), selectors)

// Each script's paste of `pasted` writes its keys in order, and the write of `failing`, the last, throws. The dialog's snapshot puts
// every key back, and the script's in-memory copy of them too: the controls in `shows` are drawn from that copy when the dialog opens
// again. A failed write leaves the feature on, so the page has no skip line.
const FAILED_PASTES = [
  { file: 'dark-page.user.js', entry: 'Dark Page', editor: '#dark-page-input', pasted: { DarkPage_color: '#336699' }, failing: 'DarkPage_color', shows: ['#dark-page-input'] },
  {
    file: 'auto-rules-resizer.user.js',
    entry: 'Rules Resizer',
    editor: '#auto-rules-resizer-max-width',
    pasted: { AutoRulesResizer_maxWidth: 640, AutoRulesResizer_maxHeight: 480 },
    failing: 'AutoRulesResizer_maxHeight',
    shows: ['#auto-rules-resizer-max-width', '#auto-rules-resizer-max-height']
  },
  {
    file: 'ui-tweaks.user.js',
    entry: 'UI Tweaks',
    editor: '#ui-tweaks-dialog',
    pasted: { UiTweaks_hideSelect: true, UiTweaks_wrapButtons: true },
    failing: 'UiTweaks_wrapButtons',
    shows: ['input[data-option="hideSelect"]', 'input[data-option="wrapButtons"]']
  },
  {
    file: 'color-by-digit.user.js',
    entry: 'Color by Digit',
    editor: '#color-by-digit-editor',
    pasted: { ColorByDigit_profiles: SETTINGS_SCRIPTS.find((s) => s.file === 'color-by-digit.user.js').saved, ColorByDigit_mode: 'digit' },
    failing: 'ColorByDigit_mode',
    shows: ['select[data-role="mode-draft"]']
  },
  {
    file: 'draw-tool.user.js',
    entry: 'Text Anywhere',
    editor: '#draw-tool-dialog',
    pasted: { DrawTool_width: 3.5, DrawTool_opacity: 50, DrawTool_frame: true, DrawTool_font: 'fixed' },
    failing: 'DrawTool_font',
    shows: ['button[data-role="frame-pick"][data-value="on"]', 'select[data-role="font-choice"]']
  },
  {
    file: 'pen-tool-extras.user.js',
    entry: 'Pen Tool Extras',
    editor: '#pen-tool-extras-editor',
    pasted: { PenColor_thickness: 9, PenColor_colors: { 3: '#123456' } },
    failing: 'PenColor_colors',
    shows: ['#pen-tool-extras-setting-thickness']
  }
]

for (const failedPaste of FAILED_PASTES) {
  describe(`${failedPaste.file}: a paste whose last write throws leaves every key, and what the dialog shows, as before`, { concurrency: false }, () => {
    let context, p, errors
    after(async () => { await context?.close() })

    it('says the paste failed, and the keys, the open dialog and the dialog opened again all show what they did before', async () => {
      ({ context, p, errors } = await openPage(browser, { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }))
      await startPuzzle(p, { injection: { mode: 'after-start', code: code(failedPaste.file) } })
      await openScriptDialog(p, failedPaste.entry, failedPaste.editor)
      const keys = Object.keys(failedPaste.pasted)
      const before = { stored: await stored(p, keys), shown: await shown(p, failedPaste.shows) }
      await failNextWriteOf(p, failedPaste.failing, 'planted write failure')
      assert.equal(await paste(p, JSON.stringify(failedPaste.pasted)), 'Could not paste: planted write failure')
      assert.deepEqual(await stored(p, keys), before.stored)
      assert.deepEqual(await shown(p, failedPaste.shows), before.shown, 'the open dialog took the paste that failed')
      await closeDialogWith(p, 'Cancel', failedPaste.editor)
      await openScriptDialog(p, failedPaste.entry, failedPaste.editor)
      assert.deepEqual(await shown(p, failedPaste.shows), before.shown, 'the script\'s in-memory settings kept the paste that failed')
      assert.deepEqual(errors, [])
    })
  })
}

describe('auto-rules-resizer.user.js: a Save whose height write throws', { concurrency: false }, () => {
  let context, p, errors
  after(async () => { await context?.close() })

  it('says it was not saved, the width key is still unsaved and the max size settings stay on', async () => {
    ({ context, p, errors } = await openPage(browser))
    await startPuzzle(p, { injection: { mode: 'after-start', code: code('auto-rules-resizer.user.js') } })
    await openScriptDialog(p, 'Rules Resizer', '#auto-rules-resizer-max-width')
    await failNextWriteOf(p, 'AutoRulesResizer_maxHeight', 'planted height write failure')
    await p.fill('#auto-rules-resizer-max-width', '640')
    await p.fill('#auto-rules-resizer-max-height', '480')
    await dialogButton(p, 'Save').click()
    await p.locator(STATUS).filter({ hasText: 'Not saved: planted height write failure' }).waitFor()
    assert.equal(await p.evaluate((key) => Framework.getData(key), 'AutoRulesResizer_maxWidth'), null)
    assert.deepEqual(errors, [])
  })
})
