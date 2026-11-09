// Live attacks 73 to 75 (#628, from #590): a full browser store, settings pasted in odd shapes and settings changed in another tab, on
// sudokupad.app in headless Chromium. Each test names its attack and asserts the crash signals (no uncaught error, console error or
// skip line) beside what a user expects. Clicks, drags and keys are real input.
/* global Framework, Storage */
import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pickTool } from './attack-fixtures.mjs'
import { assertNoCrash, NOTICE_BAR, loadScripts, reloadWithScripts, openWithAllScripts } from './attacks.mjs'
import { captureConsoleErrors } from './page.mjs'
import { mouseDrag, typeText } from './board.mjs'
import { openPenTool, penEntries, setSlider } from './pen.mjs'
import { closeDialogWith, openScriptDialog, ownedSettings, paste, SETTINGS_SCRIPTS } from './settings.mjs'
import { readUntil } from './settle.mjs'
import { labelOn } from './color-by-digit/color-by-digit-fixtures.mjs'
import * as textAnywhere from './text-anywhere/text-anywhere-fixtures.mjs'
import { addPage, openWith, useBrowser } from './session.mjs'

const THICKNESS = '#pen-tool-extras-thickness'
const OPACITY = '#pen-tool-extras-opacity'
const THICKNESS_KEY = 'PenColor_thickness'
const OPACITY_KEY = 'PenColor_opacity'
const OTHER_TAB_THICKNESS = 9
const THIS_TAB_OPACITY = 60
// The longest a paste, even of a megabyte, gets to answer.
const PASTE_BUDGET_MS = 5000
const MEGABYTE = 1024 * 1024

const browser = useBrowser()

describe('attacks on storage', { concurrency: false }, () => {
  let context, p, errors
  afterEach(async () => { await context?.close() })

  describe('with the three scripts installed', () => {
    beforeEach(async () => {
      ;({ context, p, errors } = await openWithAllScripts(browser()))
    })

    it('attack 73: a full store (setItem throws QuotaExceededError) on the scripts\' own keys leaves every feature working in the session, tells the user in plain words and turns no saved data off', async () => {
      // Only the scripts' keys refuse: SudokuPad's own writes (its tool and progress) throw uncaught on a full store with no script installed.
      // The keys are the three scripts', as SETTINGS_SCRIPTS names them, behind the site's own prefix.
      const owns = SETTINGS_SCRIPTS.filter((script) => ['draw-tool.user.js', 'pen-tool-extras.user.js', 'color-by-digit.user.js'].includes(script.file)).map((script) => script.owns.source)
      await p.evaluate((patterns) => {
        const set = Storage.prototype.setItem
        Storage.prototype.setItem = function (key, value) {
          if (patterns.some((pattern) => new RegExp(pattern).test(key.replace(/^svencodes_/, '')))) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
          return set.call(this, key, value)
        }
      }, owns)
      // Text Anywhere tells a refused note in SudokuPad's dialog, unless another dialog is open; the other two tell in a bar.
      const dismissNotice = async () => {
        const ok = p.locator('.dialog button').filter({ hasText: /^\s*OK\s*$/ })
        if (await ok.count() > 0) await ok.click()
      }

      await pickTool(p, 'textanywhere')
      await typeText(p, [4.5, 4.5], '15')
      await dismissNotice()
      assert.deepEqual(await textAnywhere.texts(p), ['15'], 'Text Anywhere draws the note')

      // With a note selected the slider changes that note; with none it saves the next note's size, a settings write.
      await p.keyboard.press('Escape')
      if (await p.locator(textAnywhere.SELECTED).count() > 0) await p.keyboard.press('Escape')
      await textAnywhere.slideTo(p, textAnywhere.SIZE_SLIDER, 12)
      await dismissNotice()
      await setSlider(p, THICKNESS, 9)
      await mouseDrag(p, [[1.5, 1.5], [1.5, 4.5]])
      assert.equal((await penEntries(p)).length, 3, 'Pen Tool Extras draws the line')

      const before = await labelOn(p)
      await p.click('#control-colorbydigit')
      assert.notEqual(await readUntil(() => labelOn(p), (label) => label !== before), before, 'Color by Digit changes its mode')

      assert.deepEqual(errors, [])
      const told = await p.locator(NOTICE_BAR).allTextContents()
      assert.deepEqual(told.map((text) => text.replace('×', '')).sort(), [
        'Color by Digit: the browser has no room left, so saved settings could not be saved.',
        'Pen Tool Extras: the browser has no room left, so saved settings could not be saved.',
        'Text Anywhere: the browser has no room left, so saved notes and settings could not be saved.'
      ], 'each bar names the browser, not SudokuPad')
    })
  })

  it('attack 74: settings pasted as malformed text, from an older version and a megabyte large change nothing they should not, and answer in time', async () => {
    for (const script of SETTINGS_SCRIPTS) {
      ;({ context, p, errors } = await openWith(browser(), [script.file], { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }))
      await openScriptDialog(p, script.entry, script.editor)
      const owned = () => ownedSettings(p, script)
      const timed = async (text) => {
        const started = Date.now()
        const status = await paste(p, text)
        assert.equal(Date.now() - started < PASTE_BUDGET_MS, true, `${script.file}: a paste of ${text.length} characters answers in ${PASTE_BUDGET_MS} ms`)
        return status
      }
      await p.evaluate(([key, value]) => Framework.setData(key, value), [script.key, script.saved])
      const savedBefore = await owned()

      for (const text of ['', '{', '{"a":1,', 'null', '[]', '"text"', '12', 'not json', '{"__proto__":{"polluted":1}}', '{}']) {
        assert.match(await timed(text), /^(Could not paste|Nothing to paste)/, `${script.file}: ${JSON.stringify(text)} is refused in words`)
      }
      assert.equal(await p.evaluate(() => ({}).polluted), undefined, `${script.file}: a pasted __proto__ pollutes nothing`)
      assert.deepEqual(await owned(), savedBefore, `${script.file}: malformed text saved nothing`)

      assert.equal(await timed('x'.repeat(MEGABYTE)), 'Could not paste: the clipboard text is not JSON', `${script.file}: a megabyte of text is refused`)
      assert.equal(await timed(JSON.stringify({ [script.badKey]: 'x'.repeat(MEGABYTE) })), 'Pasted 0 settings; skipped 1 that did not check out.', `${script.file}: a megabyte value is skipped`)
      assert.deepEqual(await owned(), savedBefore, `${script.file}: a megabyte saved nothing`)

      // An older version's export holds only some keys: those are pasted, and the rest of the script's settings stay as they were. A megabyte of a foreign key beside it is ignored.
      await p.evaluate((key) => Framework.removeData(key), script.key)
      const withoutKey = await owned()
      assert.equal(await timed(JSON.stringify({ [script.key]: script.saved, Foreign_key: 'x'.repeat(MEGABYTE) })), 'Pasted 1 setting.', `${script.file}: an export with one key pastes that key`)
      const after = await owned()
      assert.deepEqual(Object.fromEntries(Object.entries(after).filter(([k]) => k in withoutKey)), withoutKey, `${script.file}: the other keys stay as they were`)
      assert.deepEqual(await p.evaluate((key) => Framework.getData(key), script.key), script.enveloped ? { v: 0, data: script.saved } : script.saved, `${script.file}: the pasted key is saved`)
      assert.equal(await p.evaluate(() => Framework.getData('Foreign_key')), null, `${script.file}: the foreign key is not saved`)

      await closeDialogWith(p, 'Cancel', script.editor)
      await assertNoCrash(p, errors)
      await context.close()
    }
  })

  it('attack 75: settings changed in one tab while another tab has the puzzle open leave that tab working, keep the other settings, and show up on its reload', async () => {
    ;({ context, p, errors } = await openWithAllScripts(browser()))
    const other = await addPage(context, [], { seed: captureConsoleErrors })
    await loadScripts(other.p)
    const stored = (page, key) => page.evaluate((k) => Framework.getData(k), key)

    // The other tab changes three settings, one of each script, the way a user does.
    await setSlider(other.p, THICKNESS, OTHER_TAB_THICKNESS)
    const modeBefore = await labelOn(other.p)
    await other.p.click('#control-colorbydigit')
    const modeThere = await readUntil(() => labelOn(other.p), (label) => label !== modeBefore)
    await pickTool(other.p, 'textanywhere')
    await textAnywhere.slideTo(other.p, textAnywhere.SIZE_SLIDER, 40)
    const widthThere = await textAnywhere.valueOf(other.p, textAnywhere.SIZE_SLIDER)
    assert.equal(await stored(p, THICKNESS_KEY), OTHER_TAB_THICKNESS, 'the first tab sees the saved thickness')

    // This tab goes on working through the change, and a save of one setting does not put back the old value of another.
    await openPenTool(p)
    await mouseDrag(p, [[1.5, 1.5], [1.5, 4.5]])
    assert.equal((await penEntries(p)).length, 3, 'the first tab draws a line')
    await setSlider(p, OPACITY, THIS_TAB_OPACITY)
    assert.equal(await stored(p, THICKNESS_KEY), OTHER_TAB_THICKNESS, 'the first tab\'s save of the opacity leaves the other tab\'s thickness')
    assert.equal(await stored(p, OPACITY_KEY), THIS_TAB_OPACITY, 'the opacity is saved')
    await pickTool(p, 'textanywhere')
    await typeText(p, [4.5, 4.5], '15')
    assert.deepEqual(await textAnywhere.texts(p), ['15'], 'the first tab makes a note')
    assert.equal(await textAnywhere.valueOf(other.p, textAnywhere.SIZE_SLIDER), widthThere, 'the first tab\'s note does not change the other tab\'s width')

    await reloadWithScripts(p)
    await openPenTool(p)
    assert.equal(await p.evaluate((selector) => Number(document.querySelector(selector).value), THICKNESS), OTHER_TAB_THICKNESS, 'the reload shows the thickness the other tab saved')
    assert.equal(await p.evaluate((selector) => Number(document.querySelector(selector).value), OPACITY), THIS_TAB_OPACITY, 'the reload shows the opacity this tab saved')
    assert.equal(await labelOn(p), modeThere, 'the reload shows the mode the other tab saved')
    await pickTool(p, 'textanywhere')
    assert.equal(await textAnywhere.valueOf(p, textAnywhere.SIZE_SLIDER), widthThere, 'the reload shows the width the other tab saved')
    await assertNoCrash(p, errors)
    await assertNoCrash(other.p, other.errors)
  })
})
